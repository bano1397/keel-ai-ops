import asyncio
import hashlib
import hmac
import json
import logging
import queue
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select

from keel import auth, feedback, memory, pipeline, reports
from keel import queue as jobq
from keel.config import settings
from keel.db import (
    Conversation,
    Customer,
    Doc,
    EvalRun,
    Feedback,
    Inbox,
    Message,
    Order,
    Outbox,
    PromptVersion,
    Refund,
    Ticket,
    Trace,
    kv_get,
    now,
    session,
)
from keel.logging_setup import setup_logging
from keel.notify import alert_error, queue_slack

setup_logging()
log = logging.getLogger("keel.api")
stop = threading.Event()
sched = BackgroundScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(_: FastAPI):
    from keel.rag.models import warm
    from keel.seed import seed

    if settings().serverless:
        yield
        return
    if seed():
        from keel.rag.ingest import ingest

        ingest()
    warm()
    if settings().enable_workers:
        for which in ("inbox", "outbox"):
            threading.Thread(target=jobq.worker, args=(stop, which), daemon=True, name=f"worker-{which}").start()
        sched.add_job(
            lambda: reports.send_daily_report(now().strftime("%Y-%m-%d")),
            "cron",
            hour=settings().report_hour_utc,
            minute=0,
            id="daily_report",
            replace_existing=True,
        )
        sched.add_job(jobq.recover_stuck, "interval", minutes=5, id="recover_stuck", replace_existing=True)
        sched.start()
    yield
    stop.set()
    if sched.running:
        sched.shutdown(wait=False)


app = FastAPI(title="Keel AI Operations API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings().frontend_url, "http://localhost:3200", "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
ROOT = settings().corpus_dir
app.mount("/help", StaticFiles(directory=ROOT / "site", html=True), name="help")
app.mount("/docs-files", StaticFiles(directory=ROOT / "pdf"), name="pdfs")

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request) -> None:
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
    q = _hits[ip]
    t = time.time()
    while q and t - q[0] > 60:
        q.popleft()
    if len(q) >= settings().rate_limit_per_minute:
        raise HTTPException(429, "Too many messages, please wait a minute")
    q.append(t)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled error on %s", request.url.path)
    alert_error(f"api:{request.url.path}", repr(exc))
    return JSONResponse({"detail": "Internal error"}, status_code=500)


INLINE_DRAIN_SKIP = ("/api/chat/stream", "/api/cron/", "/webhooks/")


@app.middleware("http")
async def serverless_drain(request: Request, call_next: Any) -> Any:
    response = await call_next(request)
    if (
        settings().serverless
        and request.method == "POST"
        and not request.url.path.startswith(INLINE_DRAIN_SKIP)
        and response.status_code < 400
    ):
        await asyncio.to_thread(after_request, 8.0)
    return response


def after_request(budget: float = 8.0) -> None:
    if settings().serverless:
        try:
            jobq.drain(budget)
        except Exception as e:
            log.warning("inline drain failed: %r", e)


@app.api_route("/api/cron/tick", methods=["GET", "POST"])
def cron_tick(request: Request) -> dict:
    secret = settings().cron_secret
    given = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not secret or not hmac.compare_digest(given, secret):
        raise HTTPException(401, "bad cron secret")
    recovered = jobq.recover_stuck(minutes=3)
    drained = jobq.drain(40.0)
    t = now()
    key = t.strftime("%Y-%m-%d")
    report = None
    if t.hour >= settings().report_hour_utc and kv_get("report_sent_for") != key:
        from keel.db import kv_set

        kv_set("report_sent_for", key)
        report = reports.send_daily_report(key)["emailed_to"] or "slack"
        drained_after = jobq.drain(10.0)
        drained = {k: drained[k] + drained_after[k] for k in drained}
    return {"ok": True, "recovered": recovered, "drained": drained, "report": report}


@app.get("/health")
def health() -> dict:
    with session() as db:
        docs = db.scalar(select(func.count()).select_from(Doc))
    from keel import llm
    from keel.router import finetuned

    return {
        "ok": True,
        "status": "ok",
        "version": "1.0.0",
        "docs": docs,
        "llm": [p.name for p in llm.providers()] or ["offline-rules"],
        "router": "fine-tuned" if finetuned() else "llm/rules",
        "time": now().isoformat(),
    }


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginIn) -> dict:
    res = auth.login(body.email, body.password)
    if not res:
        raise HTTPException(401, "Wrong email or password")
    return res


@app.get("/api/auth/me")
def me(user: dict = Depends(auth.current_user)) -> dict:
    return user


class ChatIn(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=80)
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.post("/api/chat/stream", dependencies=[Depends(rate_limit)])
async def chat_stream(body: ChatIn) -> StreamingResponse:
    q: queue.Queue = queue.Queue()

    def on_event(event: str, data: Any) -> None:
        q.put((event, data))

    def run() -> None:
        try:
            q.put(
                (
                    "result",
                    pipeline.handle(
                        "web", str(body.email), body.message.strip(), body.name, body.conversation_id, on_event
                    ),
                )
            )
        except Exception as e:
            q.put(("error", repr(e)))

    async def gen():
        yield sse("status", {"text": "Reading your message"})
        threading.Thread(target=run, daemon=True).start()
        while True:
            event, data = await asyncio.to_thread(q.get)
            if event == "error":
                yield sse("error", {"detail": "Something went wrong; a team member will follow up."})
                return
            if event != "result":
                yield sse(event, data)
                continue
            text = (
                data["reply"]
                if data["status"] == "sent"
                else ("Thanks, a member of our team is checking this and will reply here shortly.")
            )
            words = text.split(" ")
            for i, w in enumerate(words):
                yield sse("token", {"t": w + (" " if i < len(words) - 1 else "")})
                await asyncio.sleep(0.018)
            yield sse(
                "done",
                {
                    k: data[k]
                    for k in (
                        "message_id",
                        "conversation_id",
                        "status",
                        "agent",
                        "cost_usd",
                        "latency_ms",
                        "tokens",
                        "sources",
                    )
                },
            )
            await asyncio.to_thread(after_request)
            return

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/chat/history")
def chat_history(email: EmailStr, conversation_id: int | None = None) -> list[dict]:
    with session() as db:
        c = db.scalar(select(Customer).where(func.lower(Customer.email) == str(email).lower()))
        if not c:
            return []
        conv = db.scalar(
            select(Conversation)
            .where(Conversation.customer_id == c.id, Conversation.channel == "web")
            .order_by(Conversation.id.desc())
        )
        if not conv:
            return []
        rows = db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id, Message.status.in_(["sent", "edited"]))
            .order_by(Message.id)
        ).all()
        return [{"id": m.id, "role": m.role, "content": m.content, "conversation_id": conv.id} for m in rows]


def _msg(m: Message, trace: Trace | None) -> dict:
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "role": m.role,
        "content": m.content,
        "agent": m.agent,
        "status": m.status,
        "confidence": m.confidence,
        "trace_id": m.trace_id,
        "created_at": m.created_at,
        "trace": None
        if not trace
        else {
            "id": trace.id,
            "conversation_id": trace.conversation_id,
            "message_id": trace.message_id,
            "created_at": trace.created_at,
            "router": trace.router,
            "steps": trace.steps,
            "sources": trace.sources,
            "model": trace.model,
            "tokens_in": trace.tokens_in,
            "tokens_out": trace.tokens_out,
            "cost_usd": trace.cost_usd,
            "latency_ms": trace.latency_ms,
            "error": trace.error,
        },
    }


@app.get("/api/conversations")
def conversations(
    status: str | None = None, channel: str | None = None, user: dict = Depends(auth.current_user)
) -> list[dict]:
    with session() as db:
        q = select(Conversation, Customer).join(Customer, Customer.id == Conversation.customer_id)
        if status:
            q = q.where(Conversation.status == status)
        if channel:
            q = q.where(Conversation.channel == channel)
        out = []
        for conv, cust in db.execute(q.order_by(Conversation.updated_at.desc()).limit(200)).all():
            last = db.scalar(
                select(Message.content).where(Message.conversation_id == conv.id).order_by(Message.id.desc()).limit(1)
            )
            pending = db.scalar(
                select(func.count())
                .select_from(Message)
                .where(Message.conversation_id == conv.id, Message.status == "pending_review")
            )
            out.append(
                {
                    "id": conv.id,
                    "customer": {"id": cust.id, "name": cust.name, "email": cust.email, "tier": cust.tier},
                    "channel": conv.channel,
                    "status": conv.status,
                    "last_message": last,
                    "pending_count": pending,
                    "updated_at": conv.updated_at,
                }
            )
        return out


@app.get("/api/conversations/{cid}")
def conversation(cid: int, user: dict = Depends(auth.current_user)) -> dict:
    with session() as db:
        conv = db.get(Conversation, cid)
        if not conv:
            raise HTTPException(404)
        msgs = db.scalars(select(Message).where(Message.conversation_id == cid).order_by(Message.id)).all()
        traces = {t.id: t for t in db.scalars(select(Trace).where(Trace.conversation_id == cid))}
        tickets = db.scalars(select(Ticket).where(Ticket.conversation_id == cid)).all()
        conv_out = {
            "id": conv.id,
            "channel": conv.channel,
            "status": conv.status,
            "thread_id": f"conv-{conv.id}",
            "created_at": conv.created_at,
            "updated_at": conv.updated_at,
            "customer_id": conv.customer_id,
        }
        cust_id = conv.customer_id
        out = {
            "conversation": conv_out,
            "messages": [_msg(m, traces.get(m.trace_id or -1)) for m in msgs],
            "tickets": [_ticket(t) for t in tickets],
        }
    out["customer_profile"] = customer_full(cust_id)
    return out


def _ticket(t: Ticket) -> dict:
    return {
        "id": t.id,
        "conversation_id": t.conversation_id,
        "customer_id": t.customer_id,
        "kind": t.kind,
        "risk": t.risk,
        "summary": t.summary,
        "refund_id": t.refund_id,
        "status": t.status,
        "created_at": t.created_at,
    }


@app.get("/api/live")
async def live(request: Request, after: int = 0, user: dict = Depends(auth.current_user)) -> StreamingResponse:
    async def gen():
        with session() as db:
            last = after or (db.scalar(select(func.max(Message.id))) or 0)
            last_ticket = db.scalar(select(func.max(Ticket.id))) or 0
        started = time.monotonic()
        while not await request.is_disconnected() and time.monotonic() - started < 240:
            with session() as db:
                for m in db.scalars(select(Message).where(Message.id > last).order_by(Message.id)):
                    last = m.id
                    yield sse(
                        "message",
                        {
                            "id": m.id,
                            "conversation_id": m.conversation_id,
                            "role": m.role,
                            "content": m.content,
                            "agent": m.agent,
                            "status": m.status,
                        },
                    )
                for t in db.scalars(select(Ticket).where(Ticket.id > last_ticket).order_by(Ticket.id)):
                    last_ticket = t.id
                    yield sse("ticket", _ticket(t))
            yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/approvals")
def approvals(user: dict = Depends(auth.current_user)) -> dict:
    with session() as db:
        msgs = db.execute(
            select(Message, Conversation, Customer)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .join(Customer, Customer.id == Conversation.customer_id)
            .where(Message.status == "pending_review")
            .order_by(Message.id.desc())
        ).all()
        out_msgs = []
        for m, conv, cust in msgs:
            q = db.scalar(
                select(Message.content)
                .where(Message.conversation_id == conv.id, Message.role == "user", Message.id < m.id)
                .order_by(Message.id.desc())
            )
            tr = db.get(Trace, m.trace_id) if m.trace_id else None
            out_msgs.append(
                {
                    **_msg(m, tr),
                    "conversation_id": conv.id,
                    "channel": conv.channel,
                    "customer": {"name": cust.name, "email": cust.email},
                    "customer_message": q,
                }
            )
        refunds = db.execute(
            select(Refund, Order, Customer)
            .join(Order, Order.id == Refund.order_id)
            .join(Customer, Customer.id == Order.customer_id)
            .where(Refund.status == "pending_approval")
            .order_by(Refund.id.desc())
        ).all()
        return {
            "messages": out_msgs,
            "refunds": [
                {
                    "id": r.id,
                    "order_id": r.order_id,
                    "amount_gbp": float(r.amount_gbp),
                    "reason": r.reason,
                    "conversation_id": r.conversation_id,
                    "customer": {"name": c.name, "email": c.email},
                    "order_total_gbp": float(o.total_gbp),
                    "created_at": r.created_at,
                }
                for r, o, c in refunds
            ],
        }


class ReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|edit|reject)$")
    corrected: str | None = Field(default=None, max_length=4000)
    reason: str | None = Field(default=None, max_length=500)


@app.post("/api/messages/{mid}/review")
def review(mid: int, body: ReviewIn, user: dict = Depends(auth.current_user)) -> dict:
    if body.action == "edit" and not (body.corrected or "").strip():
        raise HTTPException(400, "Corrected text is required for an edit")
    try:
        res = feedback.record(mid, body.action, user["email"], body.corrected, body.reason)
    except ValueError as e:
        raise HTTPException(404, str(e)) from None
    if body.action in ("approve", "edit"):
        with session() as db:
            m = db.get(Message, mid)
            conv = db.get(Conversation, m.conversation_id) if m else None
            cust = db.get(Customer, conv.customer_id) if conv else None
        if m and conv and cust and conv.channel in ("telegram", "email"):
            to = cust.telegram_chat_id if conv.channel == "telegram" else cust.email
            if to:
                trace = None
                with session() as db:
                    trace = db.get(Trace, m.trace_id) if m.trace_id else None
                pipeline.queue_reply(
                    conv.channel,
                    to,
                    mid,
                    pipeline.channel_text(m.content, trace.sources if trace else [], conv.channel),
                )
    return res


class RefundDecision(BaseModel):
    approve: bool


@app.post("/api/refunds/{rid}/decision")
def refund_decision(rid: int, body: RefundDecision, user: dict = Depends(auth.current_user)) -> dict:
    with session() as db:
        r = db.get(Refund, rid)
        if not r or r.status != "pending_approval":
            raise HTTPException(404, "No pending refund with that id")
        o = db.get(Order, r.order_id)
        r.status = "issued" if body.approve else "rejected"
        r.approved_by = user["email"]
        if body.approve and o:
            paid = sum(
                float(x.amount_gbp)
                for x in db.scalars(select(Refund).where(Refund.order_id == o.id, Refund.status == "issued"))
            )
            o.status = "refunded" if paid >= float(o.total_gbp) - 0.001 else "partially_refunded"
            o.updated_at = now()
        for t in db.scalars(select(Ticket).where(Ticket.refund_id == rid)):
            t.status = "resolved"
        conv_id, amount, order_id = r.conversation_id, float(r.amount_gbp), r.order_id
    if conv_id:
        text = (
            f"Good news: your £{amount:.2f} refund for {order_id} has been approved and will reach your original "
            "payment method within 5 working days."
            if body.approve
            else f"A team member reviewed the refund request for {order_id} and couldn't approve it this time. "
            "We'll email you with the details."
        )
        memory.add_message(conv_id, "human_agent", text, agent="human", status="sent")
        with session() as db:
            conv = db.get(Conversation, conv_id)
            cust = db.get(Customer, conv.customer_id) if conv else None
        if conv and cust and conv.channel in ("telegram", "email"):
            to = cust.telegram_chat_id if conv.channel == "telegram" else cust.email
            if to:
                pipeline.queue_reply(conv.channel, to, -rid, text)
    return {"id": rid, "status": "issued" if body.approve else "rejected"}


@app.get("/api/tickets")
def tickets(status: str | None = None, user: dict = Depends(auth.current_user)) -> list[dict]:
    with session() as db:
        q = select(Ticket, Customer).join(Customer, Customer.id == Ticket.customer_id, isouter=True)
        if status:
            q = q.where(Ticket.status == status)
        return [
            {**_ticket(t), "customer": {"name": c.name if c else "Unknown", "email": c.email if c else None}}
            for t, c in db.execute(q.order_by(Ticket.id.desc()).limit(200)).all()
        ]


@app.post("/api/tickets/{tid}/resolve")
def resolve_ticket(tid: int, user: dict = Depends(auth.current_user)) -> dict:
    with session() as db:
        t = db.get(Ticket, tid)
        if not t:
            raise HTTPException(404)
        t.status = "resolved"
        conv = db.get(Conversation, t.conversation_id)
        if conv and conv.status == "escalated":
            conv.status = "resolved"
    return {"id": tid, "status": "resolved"}


def _customer(c: Customer) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "telegram_chat_id": c.telegram_chat_id,
        "phone": c.phone,
        "tier": c.tier,
        "vulnerable": c.vulnerable,
        "created_at": c.created_at,
    }


NEGATIVE = {"complaint", "legal_safety", "human_request"}


def _sentiment(rows: Any) -> dict:
    by_day: dict[str, list[float]] = {}
    scores = []
    for created, router in rows:
        sc = -1.0 if (router or {}).get("label") in NEGATIVE else 0.3
        scores.append(sc)
        by_day.setdefault(created.date().isoformat(), []).append(sc)
    recent = scores[-8:]
    score = round(sum(recent) / len(recent), 2) if recent else 0.0
    label = "negative" if score < -0.2 else ("positive" if score > 0.2 else "neutral")
    return {
        "score": score,
        "label": label,
        "trend": [{"day": d, "score": round(sum(v) / len(v), 2)} for d, v in sorted(by_day.items())],
    }


def customer_full(cid: int) -> dict:
    with session() as db:
        c = db.get(Customer, cid)
        if not c:
            raise HTTPException(404)
        orders = db.scalars(select(Order).where(Order.customer_id == cid).order_by(Order.created_at.desc())).all()
        refunds = db.scalars(
            select(Refund)
            .join(Order, Order.id == Refund.order_id)
            .where(Order.customer_id == cid)
            .order_by(Refund.id.desc())
        ).all()
        tix = db.scalars(select(Ticket).where(Ticket.customer_id == cid).order_by(Ticket.id.desc())).all()
        convs = db.scalars(
            select(Conversation).where(Conversation.customer_id == cid).order_by(Conversation.updated_at.desc())
        ).all()
        rows = db.execute(
            select(Trace.created_at, Trace.router)
            .join(Conversation, Conversation.id == Trace.conversation_id)
            .where(Conversation.customer_id == cid)
            .order_by(Trace.id)
        ).all()
        ref = {"id": c.id, "name": c.name, "email": c.email, "tier": c.tier}
        conv_rows = []
        for v in convs:
            last = db.scalar(select(Message.content).where(Message.conversation_id == v.id).order_by(Message.id.desc()))
            pending = db.scalar(
                select(func.count())
                .select_from(Message)
                .where(Message.conversation_id == v.id, Message.status == "pending_review")
            )
            conv_rows.append(
                {
                    "id": v.id,
                    "customer": ref,
                    "channel": v.channel,
                    "status": v.status,
                    "last_message": last or "",
                    "pending_count": pending,
                    "updated_at": v.updated_at,
                }
            )
        return {
            "customer": _customer(c),
            "orders": [
                {
                    "id": o.id,
                    "customer_id": o.customer_id,
                    "status": o.status,
                    "total_gbp": float(o.total_gbp),
                    "items": [
                        {
                            "sku": i["sku"],
                            "name": i["name"],
                            "qty": i["qty"],
                            "price_gbp": i.get("unit_price_gbp", i.get("price_gbp", 0)),
                        }
                        for i in o.items
                    ],
                    "shipping_address": o.shipping_address,
                    "carrier": o.carrier,
                    "tracking": o.tracking,
                    "created_at": o.created_at,
                    "delivered_at": o.delivered_at,
                    "updated_at": o.updated_at,
                }
                for o in orders
            ],
            "refunds": [
                {
                    "id": r.id,
                    "order_id": r.order_id,
                    "amount_gbp": float(r.amount_gbp),
                    "reason": r.reason,
                    "status": r.status,
                    "idempotency_key": r.idempotency_key,
                    "created_by": r.created_by,
                    "approved_by": r.approved_by,
                    "created_at": r.created_at,
                }
                for r in refunds
            ],
            "tickets": [{**_ticket(t), "customer": ref} for t in tix],
            "conversations": conv_rows,
            "sentiment": _sentiment(rows),
        }


@app.get("/api/customers")
def customers(user: dict = Depends(auth.current_user)) -> list[dict]:
    with session() as db:
        stats = {
            cid: (n, float(total or 0))
            for cid, n, total in db.execute(
                select(Order.customer_id, func.count(Order.id), func.sum(Order.total_gbp)).group_by(Order.customer_id)
            )
        }
        open_rows = db.execute(
            select(Ticket.customer_id, func.count()).where(Ticket.status == "open").group_by(Ticket.customer_id)
        ).all()
        neg_rows = db.execute(
            select(Conversation.customer_id, func.count())
            .where(Conversation.status == "escalated")
            .group_by(Conversation.customer_id)
        ).all()
        open_t = {int(r[0]): int(r[1]) for r in open_rows}
        neg = {int(r[0]): int(r[1]) for r in neg_rows}
        out = []
        for c in db.scalars(select(Customer).order_by(Customer.name)):
            n, total = stats.get(c.id, (0, 0.0))
            out.append(
                {
                    **_customer(c),
                    "orders_count": n,
                    "lifetime_gbp": round(total, 2),
                    "open_tickets": open_t.get(c.id, 0),
                    "sentiment": "negative" if neg.get(c.id) else "neutral",
                }
            )
        return out


@app.get("/api/customers/{cid}")
def customer(cid: int, user: dict = Depends(auth.current_user)) -> dict:
    return customer_full(cid)


@app.get("/api/analytics")
def api_analytics(days: int = 30, user: dict = Depends(auth.current_user)) -> dict:
    return reports.analytics(days)


@app.get("/api/kb/docs")
def kb_docs(user: dict = Depends(auth.current_user)) -> list[dict]:
    from keel.db import Chunk

    with session() as db:
        rows = db.execute(
            select(Doc, func.count(Chunk.id))
            .join(Chunk, Chunk.doc_id == Doc.id, isouter=True)
            .group_by(Doc.id)
            .order_by(Doc.type, Doc.title)
        ).all()
        return [
            {"id": d.id, "title": d.title, "type": d.type, "source": d.source, "url": d.url, "chunks": n}
            for d, n in rows
        ]


@app.post("/api/kb/reindex")
def kb_reindex(user: dict = Depends(auth.admin_only)) -> dict:
    from keel.rag.ingest import ingest

    t0 = time.perf_counter()
    res = ingest()
    return {**res, "took_ms": int((time.perf_counter() - t0) * 1000)}


@app.get("/api/kb/search")
def kb_search(q: str, user: dict = Depends(auth.current_user)) -> dict:
    from keel.rag.retrieve import hybrid_search

    r = hybrid_search(q)
    return {
        "query": q,
        "keyword": r["keyword"],
        "vector": r["vector"],
        "reranked": [h.public(i + 1) for i, h in enumerate(r["hits"])],
    }


@app.get("/api/feedback")
def feedback_list(user: dict = Depends(auth.current_user)) -> list[dict]:
    with session() as db:
        rows = db.scalars(select(Feedback).order_by(Feedback.id.desc()).limit(200)).all()
        return [
            {
                "id": f.id,
                "message_id": f.message_id,
                "agent": f.agent,
                "customer_message": f.customer_message,
                "original_reply": f.original_reply,
                "corrected_reply": f.corrected_reply,
                "action": f.action,
                "reason": f.reason,
                "reviewer": f.reviewer,
                "created_at": f.created_at,
            }
            for f in rows
        ]


@app.get("/api/feedback/export")
def feedback_export(user: dict = Depends(auth.admin_only)) -> FileResponse:
    path = Path("/tmp/keel_feedback_dataset.jsonl")
    feedback.export_dataset(path)
    return FileResponse(path, filename="keel_feedback_dataset.jsonl")


@app.get("/api/prompts")
def prompts(user: dict = Depends(auth.current_user)) -> list[dict]:
    with session() as db:
        return [
            {
                "id": p.id,
                "agent": p.agent,
                "version": p.version,
                "rules": p.rules,
                "status": p.status,
                "created_by": p.created_by,
                "created_at": p.created_at,
            }
            for p in db.scalars(select(PromptVersion).order_by(PromptVersion.id.desc()))
        ]


class ProposeIn(BaseModel):
    agent: str = Field(default="support", pattern="^(support|orders)$")


@app.post("/api/prompts/propose")
def prompts_propose(body: ProposeIn, user: dict = Depends(auth.admin_only)) -> dict:
    res = feedback.propose_rules(body.agent, user["email"])
    if "error" in res:
        raise HTTPException(400, res["error"])
    return res


@app.post("/api/prompts/{pid}/activate")
def prompts_activate(pid: int, user: dict = Depends(auth.admin_only)) -> dict:
    try:
        return feedback.activate(pid)
    except ValueError:
        raise HTTPException(404) from None


@app.get("/api/evals/runs")
def eval_runs(user: dict = Depends(auth.current_user)) -> list[dict]:
    with session() as db:
        return [
            {
                "id": r.id,
                "score": r.score,
                "breakdown": r.breakdown,
                "n_cases": r.n_cases,
                "mode": r.mode,
                "label": r.label,
                "created_at": r.created_at,
            }
            for r in db.scalars(select(EvalRun).order_by(EvalRun.id.desc()).limit(100))
        ]


_eval_lock = threading.Lock()


@app.post("/api/evals/run")
def eval_run(user: dict = Depends(auth.admin_only)) -> dict:
    if not _eval_lock.acquire(blocking=False):
        raise HTTPException(409, "An eval run is already in progress")
    try:
        import sys

        sys.path.insert(0, str(settings().corpus_dir.parent))
        from evals.run import run

        summary = run(subset=12, label="dashboard subset", isolated=False)
    finally:
        _eval_lock.release()
    with session() as db:
        r = db.get(EvalRun, summary["run_id"])
        assert r is not None
        return {
            "id": r.id,
            "score": r.score,
            "breakdown": r.breakdown,
            "n_cases": r.n_cases,
            "mode": r.mode,
            "label": r.label,
            "created_at": r.created_at,
        }


@app.get("/api/ops/queue")
def ops_queue(user: dict = Depends(auth.admin_only)) -> dict:
    def err(e: str | None) -> str | None:
        lines = (e or "").strip().splitlines()
        return lines[-1][:300] if lines else None

    with session() as db:
        counts = {k: 0 for k in ("pending", "processing", "done", "retry", "dead")}
        for model in (Inbox, Outbox):
            for st, n in db.execute(select(model.status, func.count()).group_by(model.status)):
                counts[st] = counts.get(st, 0) + n
        inbox = db.scalars(select(Inbox).order_by(Inbox.id.desc()).limit(100)).all()
        outbox = db.scalars(select(Outbox).order_by(Outbox.id.desc()).limit(100)).all()
        return {
            "counts": counts,
            "inbox": [
                {
                    "id": r.id,
                    "channel": r.channel,
                    "external_id": r.external_id,
                    "sender": r.sender,
                    "payload": r.payload,
                    "status": r.status,
                    "attempts": r.attempts,
                    "next_attempt_at": r.next_attempt_at,
                    "last_error": err(r.last_error),
                    "created_at": r.created_at,
                }
                for r in inbox
            ],
            "outbox": [
                {
                    "id": r.id,
                    "conversation_id": None,
                    "channel": r.kind,
                    "recipient": r.recipient,
                    "body": (r.body or {}).get("subject") or (r.body or {}).get("text", "")[:200],
                    "status": r.status,
                    "attempts": r.attempts,
                    "next_attempt_at": r.next_attempt_at,
                    "last_error": err(r.last_error),
                    "idempotency_key": r.idempotency_key,
                }
                for r in outbox
            ],
            "last_report": kv_get("last_report"),
            "last_slack_preview": kv_get("last_slack_preview"),
        }


@app.post("/api/ops/queue/{which}/{rid}/retry")
def ops_retry(which: str, rid: int, user: dict = Depends(auth.admin_only)) -> dict:
    if which not in ("inbox", "outbox"):
        raise HTTPException(400)
    jobq.retry(which, rid)
    return {"ok": True, "detail": f"{which} #{rid} queued for retry"}


@app.post("/api/ops/report/send")
def ops_report(user: dict = Depends(auth.admin_only)) -> dict:
    res = reports.send_daily_report(f"manual-{int(time.time())}")
    where = f"emailed to {res['emailed_to']} and posted to Slack" if res["emailed_to"] else "posted to Slack"
    return {"ok": True, "detail": f"Report queued: {where}"}


@app.get("/api/settings")
def api_settings(user: dict = Depends(auth.admin_only)) -> dict:
    from keel import llm
    from keel.router import finetuned

    s = settings()
    provs = [p.name for p in llm.providers()]

    def item(name: str, ok: bool, detail: str) -> dict:
        return {"name": name, "status": "connected" if ok else "not_configured", "detail": detail}

    return {
        "tenant": "Hearth & Field Ltd",
        "integrations": [
            item("LLM providers", bool(provs), " → ".join(provs + ["offline rules"])),
            item("Fine-tuned router", bool(finetuned()), "Qwen2.5-1.5B LoRA (GGUF, llama.cpp)"),
            item("Telegram bot", bool(s.telegram_bot_token), "Webhook /webhooks/telegram/…"),
            item("Email outbound", bool(s.resend_api_key or s.smtp_host), "Resend API" if s.resend_api_key else "SMTP"),
            item("Email inbound", bool(s.resend_webhook_secret), "Resend inbound webhook (signed)"),
            item("Slack alerts", bool(s.slack_webhook_url), "Incoming webhook, de-duplicated"),
            item("Daily report", bool(s.report_to), f"{s.report_hour_utc:02d}:00 UTC"),
        ],
        "models": {
            "answers": s.groq_model,
            "fast": s.groq_fast_model,
            "fallback": s.gemini_model,
            "embeddings": s.embed_model,
            "reranker": s.rerank_model,
        },
        "limits": {
            "refund_auto_limit_gbp": s.refund_auto_limit_gbp,
            "auto_send_confidence": s.auto_send_confidence,
            "router_min_confidence": s.router_min_confidence,
            "rate_limit_per_minute": s.rate_limit_per_minute,
        },
    }


@app.post("/webhooks/telegram/{secret}")
async def telegram_webhook(secret: str, request: Request) -> dict:
    if not hmac.compare_digest(secret, settings().telegram_webhook_secret):
        raise HTTPException(403)
    upd = await request.json()
    msg = upd.get("message") or upd.get("edited_message") or {}
    text = msg.get("text")
    if not text:
        return {"ok": True, "ignored": True}
    chat_id = str(msg["chat"]["id"])
    if text.startswith("/start"):
        jobq.receive(
            "telegram",
            f"tg:{upd['update_id']}",
            chat_id,
            {"text": "Hello", "name": msg.get("from", {}).get("first_name")},
        )
        return {"ok": True}
    m = __import__("re").search(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
    if m:
        cid = memory.resolve_customer("telegram", chat_id, msg.get("from", {}).get("first_name"))
        memory.link_email(cid, m.group(0))
    jobq.receive(
        "telegram", f"tg:{upd['update_id']}", chat_id, {"text": text, "name": msg.get("from", {}).get("first_name")}
    )
    await asyncio.to_thread(after_request, 50.0)
    return {"ok": True}


def _verify_svix(request_headers: Any, body: bytes) -> bool:
    import base64

    secret = settings().resend_webhook_secret
    if not secret:
        return False
    msg_id, ts, sigs = (
        request_headers.get("svix-id"),
        request_headers.get("svix-timestamp"),
        request_headers.get("svix-signature", ""),
    )
    if not (msg_id and ts) or abs(time.time() - int(ts)) > 300:
        return False
    key = base64.b64decode(secret.split("_", 1)[-1])
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()).decode()
    return any(hmac.compare_digest(expected, s.split(",", 1)[-1]) for s in sigs.split())


@app.post("/webhooks/email")
async def email_webhook(request: Request) -> dict:
    body = await request.body()
    if not _verify_svix(request.headers, body):
        raise HTTPException(401, "bad signature")
    evt = json.loads(body)
    data = evt.get("data", evt)
    sender = data.get("from", "")
    sender = __import__("email.utils", fromlist=["parseaddr"]).parseaddr(sender)[1] or sender
    text = (data.get("text") or "").split("\nOn ")[0].strip()
    if not text and data.get("email_id") and settings().resend_api_key:
        import httpx

        r = httpx.get(
            f"https://api.resend.com/emails/receiving/{data['email_id']}",
            timeout=15,
            headers={"Authorization": f"Bearer {settings().resend_api_key}"},
        )
        if r.status_code == 200:
            text = (r.json().get("text") or "").split("\nOn ")[0].strip()
    if not sender or not text:
        return {"ok": True, "ignored": True}
    jobq.receive(
        "email",
        f"email:{data.get('email_id') or data.get('message_id') or hashlib.sha1(body).hexdigest()}",
        sender.lower(),
        {"text": text[:4000], "subject": data.get("subject")},
    )
    await asyncio.to_thread(after_request, 50.0)
    return {"ok": True}


def verify_n8n(request_headers: Any, body: bytes) -> bool:
    header = request_headers.get("x-keel-signature", "")
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    ts, sig = parts.get("t", "0"), parts.get("v1", "")
    if not ts.isdigit() or abs(time.time() - int(ts)) > 300:
        return False
    expected = hmac.new(settings().n8n_hmac_secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


@app.post("/webhooks/n8n")
async def n8n_webhook(request: Request) -> dict:
    body = await request.body()
    if not verify_n8n(request.headers, body):
        raise HTTPException(401, "bad signature")
    evt = json.loads(body)
    action = evt.get("action")
    if action == "inbound_message":
        rid, created = jobq.receive(
            evt["channel"], evt["external_id"], evt["sender"], {"text": evt["text"], "subject": evt.get("subject")}
        )
        return {"queued": rid, "duplicate": not created}
    if action == "daily_report":
        return reports.send_daily_report(evt.get("key"))
    if action == "report_data":
        text, html = reports.build_report()
        return {"text": text, "html": html}
    if action == "alert":
        queue_slack(evt.get("dedupe", "n8n"), evt["text"])
        return {"queued": True}
    raise HTTPException(400, "unknown action")


@app.post("/api/inbound/test")
def inbound_test(body: dict, user: dict = Depends(auth.admin_only)) -> dict:
    rid, created = jobq.receive(
        body.get("channel", "email"),
        body.get("external_id") or f"test:{time.time()}",
        body["sender"],
        {"text": body["text"], "subject": body.get("subject")},
    )
    return {"queued": rid, "duplicate": not created}
