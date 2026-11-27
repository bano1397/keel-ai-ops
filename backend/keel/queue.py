import logging
import threading
import traceback
from datetime import timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from keel.db import Inbox, Outbox, now, session
from keel.notify import alert_error, deliver

log = logging.getLogger("keel.queue")
MAX_ATTEMPTS = 6


def backoff(attempt: int) -> timedelta:
    return timedelta(seconds=min(900, 5 * 3 ** (attempt - 1)))


def receive(channel: str, external_id: str, sender: str, payload: dict) -> tuple[int | None, bool]:
    try:
        with session() as db:
            row = Inbox(channel=channel, external_id=external_id, sender=sender, payload=payload)
            db.add(row)
            db.flush()
            return row.id, True
    except IntegrityError:
        return None, False


def _claim(model: Any) -> int | None:
    with session() as db:
        row = db.scalar(
            select(model)
            .where(model.status.in_(["pending", "retry"]), model.next_attempt_at <= now())
            .order_by(model.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if not row:
            return None
        row.status = "processing"
        row.attempts += 1
        row.next_attempt_at = now()
        return row.id


def _fail(model: Any, row_id: int, err: str) -> None:
    with session() as db:
        row = db.get(model, row_id)
        if row is None:
            return
        row.last_error = err[-2000:]
        if row.attempts >= MAX_ATTEMPTS:
            row.status = "dead"
            dead = True
        else:
            row.status = "retry"
            row.next_attempt_at = now() + backoff(row.attempts)
            dead = False
        kind = getattr(row, "kind", None) or getattr(row, "channel", "")
    if dead and kind != "slack":
        alert_error(
            f"{model.__tablename__}:{kind}",
            f"#{row_id} moved to dead letter after {MAX_ATTEMPTS} attempts: " f"{err.splitlines()[-1] if err else ''}",
        )


def process_inbox_once() -> bool:
    from keel.pipeline import handle

    rid = _claim(Inbox)
    if rid is None:
        return False
    with session() as db:
        row = db.get(Inbox, rid)
        assert row is not None
        channel, sender, payload = row.channel, row.sender, dict(row.payload)
    try:
        handle(channel, sender, payload["text"], payload.get("name"))
        with session() as db:
            db.execute(update(Inbox).where(Inbox.id == rid).values(status="done", last_error=None))
    except Exception:
        _fail(Inbox, rid, traceback.format_exc())
    return True


def process_outbox_once() -> bool:
    rid = _claim(Outbox)
    if rid is None:
        return False
    with session() as db:
        row = db.get(Outbox, rid)
        assert row is not None
        db.expunge(row)
    try:
        deliver(row)
        with session() as db:
            db.execute(update(Outbox).where(Outbox.id == rid).values(status="done", last_error=None))
    except Exception:
        _fail(Outbox, rid, traceback.format_exc())
    return True


def recover_stuck(minutes: int = 10) -> int:
    cutoff = now() - timedelta(minutes=minutes)
    n = 0
    with session() as db:
        model: Any
        for model in (Inbox, Outbox):
            res = db.execute(
                update(model).where(model.status == "processing", model.next_attempt_at < cutoff).values(status="retry")
            )
            n += res.rowcount or 0
    return n


def retry(model_name: str, row_id: int) -> None:
    model: Any = Inbox if model_name == "inbox" else Outbox
    with session() as db:
        db.execute(update(model).where(model.id == row_id).values(status="retry", attempts=0, next_attempt_at=now()))


def worker(stop: threading.Event, which: str) -> None:
    fn = process_inbox_once if which == "inbox" else process_outbox_once
    recover_stuck()
    while not stop.is_set():
        try:
            if not fn():
                stop.wait(1.0)
        except Exception as e:
            log.exception("worker loop error")
            alert_error(f"worker:{which}", repr(e))
            stop.wait(3.0)
