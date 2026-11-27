import logging
import time
from collections.abc import Callable
from functools import lru_cache
from typing import Any, cast

from keel import memory
from keel.agents import build_graph, emitter
from keel.config import settings
from keel.db import Message, Trace, session
from keel.notify import alert_error, enqueue

log = logging.getLogger("keel.pipeline")


@lru_cache
def graph() -> Any:
    try:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg_pool import ConnectionPool

        url = settings().database_url.replace("postgresql+psycopg://", "postgresql://")
        pool = ConnectionPool(url, max_size=5, kwargs={"autocommit": True, "prepare_threshold": 0}, open=True)
        saver = PostgresSaver(cast(Any, pool))
        saver.setup()
        return build_graph(saver)
    except Exception as e:
        log.warning("postgres checkpointer unavailable, running without: %r", e)
        return build_graph()


def channel_text(reply: str, sources: list[dict], channel: str) -> str:
    if channel == "web" or not sources:
        return reply
    return reply + "\n\nSources: " + "; ".join(f"[{s['n']}] {s['label']}" for s in sources)


def handle(
    channel: str,
    sender: str,
    text: str,
    name: str | None = None,
    conversation_id: int | None = None,
    on_event: Callable[[str, Any], None] | None = None,
    deliver: bool = True,
) -> dict:
    t0 = time.perf_counter()
    customer_id = memory.resolve_customer(channel, sender, name)
    conv = memory.conversation_for(customer_id, channel, conversation_id)
    memory.add_message(conv, "user", text)
    state_in = {
        "conversation_id": conv,
        "customer_id": customer_id,
        "message": text,
        "history": memory.history(conv)[:-1],
        "profile": memory.profile(customer_id),
        "steps": [],
        "sources": [],
        "usage": {},
        "ticket_id": None,
    }
    token = emitter.set(on_event)
    error = None
    try:
        out = graph().invoke(state_in, {"configurable": {"thread_id": f"conv-{conv}"}})
    except Exception as e:
        log.exception("agent failure")
        error = repr(e)
        alert_error("agent_graph", error)
        out = {
            **state_in,
            "reply": "Sorry, something went wrong on our side. A team member has your message and "
            "will reply shortly.",
            "agent": "escalation",
            "confidence": 0.0,
            "router": {
                "label": "other",
                "route": "escalation",
                "confidence": 0,
                "model": "error",
                "reason": "internal error",
            },
        }
    finally:
        emitter.reset(token)

    latency = int((time.perf_counter() - t0) * 1000)
    usage = out.get("usage") or {}
    status = "sent" if out.get("confidence", 0) >= settings().auto_send_confidence else "pending_review"
    router = {k: v for k, v in (out.get("router") or {}).items() if k != "signals"}
    with session() as db:
        msg = Message(
            conversation_id=conv,
            role="assistant",
            content=out["reply"],
            agent=out.get("agent"),
            status=status,
            confidence=round(float(out.get("confidence", 0)), 2),
        )
        db.add(msg)
        db.flush()
        tr = Trace(
            conversation_id=conv,
            message_id=msg.id,
            router=router,
            steps=out.get("steps", []),
            sources=out.get("sources", []),
            model=", ".join(usage.get("models") or []) or router.get("model", ""),
            tokens_in=usage.get("tokens_in", 0),
            tokens_out=usage.get("tokens_out", 0),
            cost_usd=round(usage.get("cost_usd", 0.0), 6),
            latency_ms=latency,
            error=error,
        )
        db.add(tr)
        db.flush()
        msg.trace_id = tr.id
        mid, tid = msg.id, tr.id
    if deliver and status == "sent" and channel in ("telegram", "email"):
        queue_reply(channel, sender, mid, channel_text(out["reply"], out.get("sources", []), channel))
    result = {
        "conversation_id": conv,
        "customer_id": customer_id,
        "message_id": mid,
        "trace_id": tid,
        "agent": out.get("agent"),
        "reply": out["reply"],
        "status": status,
        "confidence": out.get("confidence"),
        "router": router,
        "steps": out.get("steps", []),
        "sources": out.get("sources", []),
        "latency_ms": latency,
        "cost_usd": usage.get("cost_usd", 0.0),
        "tokens": usage.get("tokens_in", 0) + usage.get("tokens_out", 0),
        "ticket_id": out.get("ticket_id"),
    }
    return result


def queue_reply(channel: str, recipient: str, message_id: int, text: str, subject: str | None = None) -> None:
    if channel == "telegram":
        enqueue("telegram", recipient, {"text": text}, f"reply:{message_id}")
    elif channel == "email":
        enqueue(
            "email",
            recipient,
            {
                "subject": subject or "Re: your Hearth & Field enquiry",
                "text": text + "\n\nHearth & Field Customer Support",
            },
            f"reply:{message_id}",
        )
