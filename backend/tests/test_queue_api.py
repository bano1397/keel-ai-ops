import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient
from keel import notify
from keel import queue as jobq
from keel.db import Inbox, Message, Outbox, session
from sqlalchemy import select


@pytest.fixture(scope="module")
def client():
    from keel.main import app

    with TestClient(app) as c:
        yield c


def token(client, email, pw):
    return {
        "Authorization": "Bearer "
        + client.post("/api/auth/login", json={"email": email, "password": pw}).json()["token"]
    }


@pytest.fixture(scope="module")
def admin(client):
    return token(client, "admin@keel.demo", "KeelAdmin!2026")


@pytest.fixture(scope="module")
def agent(client):
    return token(client, "agent@keel.demo", "KeelAgent!2026")


def drain(fn):
    for _ in range(20):
        with session() as db:
            for m in (Inbox, Outbox):
                for r in db.scalars(select(m).where(m.status == "retry")):
                    r.next_attempt_at = r.created_at
        if not fn():
            break


def test_inbound_message_survives_failures_then_dead_letters(monkeypatch):
    rid, created = jobq.receive("email", "test-dup-1", "olivia.thompson@example.co.uk", {"text": "Hi there"})
    assert created and jobq.receive("email", "test-dup-1", "x@y.z", {"text": "dup"})[1] is False
    import keel.pipeline

    monkeypatch.setattr(keel.pipeline, "handle", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("LLM down")))
    drain(jobq.process_inbox_once)
    with session() as db:
        row = db.get(Inbox, rid)
        assert row.status == "dead" and row.attempts == jobq.MAX_ATTEMPTS and "LLM down" in row.last_error
    jobq.retry("inbox", rid)
    monkeypatch.undo()
    drain(jobq.process_inbox_once)
    with session() as db:
        assert db.get(Inbox, rid).status == "done"


def test_outbox_retries_then_succeeds(monkeypatch):
    oid = notify.enqueue("slack", "slack", {"text": "hello"}, "test-outbox-1")
    attempts = {"n": 0}

    def flaky(o):
        if o.id != oid:
            return
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise RuntimeError("slack 500")

    monkeypatch.setattr(jobq, "deliver", flaky)
    drain(jobq.process_outbox_once)
    with session() as db:
        assert db.get(Outbox, oid).status == "done" and attempts["n"] == 3


def test_auth_and_roles(client, admin, agent):
    assert client.get("/api/conversations").status_code == 401
    assert client.post("/api/auth/login", json={"email": "admin@keel.demo", "password": "nope"}).status_code == 401
    assert client.get("/api/ops/queue", headers=agent).status_code == 403
    assert client.get("/api/settings", headers=agent).status_code == 403
    assert client.get("/api/ops/queue", headers=admin).status_code == 200
    assert client.get("/api/analytics", headers=agent).status_code == 200


def test_chat_streams_events(client):
    with client.stream(
        "POST",
        "/api/chat/stream",
        json={"email": "amelia.turner@example.co.uk", "message": "How much is standard delivery?"},
    ) as r:
        body = "".join(r.iter_text())
    for ev in ("router", "step", "sources", "token", "done"):
        assert f"event: {ev}" in body


def test_review_edit_feeds_back_into_answers(client, agent):
    q = "Can I collect furniture from the Leeds warehouse?"
    with client.stream("POST", "/api/chat/stream", json={"email": "isla.smith@example.co.uk", "message": q}) as r:
        done = [
            json.loads(line[6:])
            for line in "".join(r.iter_text()).splitlines()
            if line.startswith('data: {"message_id')
        ]
    mid = done[0]["message_id"]
    fixed = "Sorry, our Leeds warehouse isn't open to visitors, so collection isn't possible. [1]"
    assert (
        client.post(
            f"/api/messages/{mid}/review", headers=agent, json={"action": "edit", "corrected": fixed}
        ).status_code
        == 200
    )
    with session() as db:
        assert db.get(Message, mid).status == "edited"
    from keel.pipeline import handle

    again = handle("web", "harry.taylor@example.co.uk", q, deliver=False)
    assert again["reply"] == fixed


def test_n8n_webhook_requires_valid_hmac(client):
    body = json.dumps({"action": "alert", "text": "test", "dedupe": "t1"}).encode()
    assert client.post("/webhooks/n8n", content=body, headers={"x-keel-signature": "t=1,v1=bad"}).status_code == 401
    ts = str(int(time.time()))
    sig = hmac.new(b"test-n8n-secret", f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    assert (
        client.post("/webhooks/n8n", content=body, headers={"x-keel-signature": f"t={ts},v1={sig}"}).status_code == 200
    )


def test_telegram_webhook_secret_and_queue(client):
    upd = {
        "update_id": 99001,
        "message": {"text": "Where is my order?", "chat": {"id": 700100200}, "from": {"first_name": "Olivia"}},
    }
    assert client.post("/webhooks/telegram/wrong", json=upd).status_code == 403
    assert client.post("/webhooks/telegram/test-tg-secret", json=upd).status_code == 200
    with session() as db:
        assert db.scalar(select(Inbox).where(Inbox.external_id == "tg:99001")).sender == "700100200"


def test_daily_report(client, admin):
    r = client.post("/api/ops/report/send", headers=admin)
    assert r.status_code == 200 and r.json()["ok"]
    from keel.reports import build_report

    text, html = build_report()
    assert "Refunds issued" in text and "AI accuracy" in text and "<table" in html
