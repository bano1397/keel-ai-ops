import hashlib
import logging
import smtplib
from datetime import timedelta
from email.message import EmailMessage

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from keel.config import settings
from keel.db import KV, Outbox, now, session

log = logging.getLogger("keel.notify")


def enqueue(kind: str, recipient: str, body: dict, key: str) -> int | None:
    try:
        with session() as db:
            o = Outbox(kind=kind, recipient=recipient, body=body, idempotency_key=key)
            db.add(o)
            db.flush()
            return o.id
    except IntegrityError:
        return None


def queue_slack(dedupe: str, text: str) -> None:
    bucket = now().strftime("%Y%m%d%H%M")
    enqueue("slack", "slack", {"text": text}, f"slack:{dedupe}:{hashlib.md5(text.encode()).hexdigest()[:8]}:{bucket}")


def alert_error(where: str, err: str) -> None:
    window = now().strftime("%Y%m%d%H")
    enqueue(
        "slack",
        "slack",
        {"text": f":warning: *System error* in `{where}`: {err[:400]}"},
        f"err:{where}:{hashlib.md5(err[:120].encode()).hexdigest()[:10]}:{window}",
    )


def send_slack(text: str) -> None:
    url = settings().slack_webhook_url
    if not url:
        with session() as db:
            db.merge(KV(k="last_slack_preview", v={"at": now().isoformat(), "text": text}))
        return
    with session() as db:
        last = db.get(KV, "slack_last_sent")
        if last and now().timestamp() - float(last.v) < 1.1:
            raise RuntimeError("slack rate limit window")
        db.merge(KV(k="slack_last_sent", v=now().timestamp()))
    r = httpx.post(url, json={"text": text}, timeout=10)
    if r.status_code == 429:
        raise RuntimeError("slack 429")
    r.raise_for_status()


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    s = settings()
    if s.resend_api_key:
        payload = {"from": s.email_from, "to": [to], "subject": subject, "text": text}
        if html:
            payload["html"] = html
        r = httpx.post(
            "https://api.resend.com/emails",
            json=payload,
            timeout=20,
            headers={"Authorization": f"Bearer {s.resend_api_key}"},
        )
        r.raise_for_status()
        return
    if s.smtp_host and s.smtp_user:
        m = EmailMessage()
        m["From"], m["To"], m["Subject"] = s.smtp_user, to, subject
        m.set_content(text)
        if html:
            m.add_alternative(html, subtype="html")
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(m)
        return
    raise RuntimeError("no email provider configured")


def send_telegram(chat_id: str, text: str) -> None:
    token = settings().telegram_bot_token
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not set")
    r = httpx.post(
        f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat_id, "text": text}, timeout=15
    )
    r.raise_for_status()


def deliver(o: Outbox) -> None:
    b = o.body
    if o.kind == "slack":
        send_slack(b["text"])
    elif o.kind == "email":
        send_email(o.recipient, b["subject"], b["text"], b.get("html"))
    elif o.kind == "telegram":
        send_telegram(o.recipient, b["text"])
    else:
        raise ValueError(f"unknown outbox kind {o.kind}")


def stale_outbox(minutes: int = 10) -> list[Outbox]:
    with session() as db:
        return list(
            db.scalars(
                select(Outbox).where(
                    Outbox.status == "processing", Outbox.next_attempt_at < now() - timedelta(minutes=minutes)
                )
            )
        )
