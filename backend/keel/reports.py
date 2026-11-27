import threading
from collections import Counter
from datetime import timedelta
from statistics import median

from sqlalchemy import func, select

from keel.config import settings
from keel.db import (
    Conversation,
    EvalRun,
    Feedback,
    Inbox,
    Message,
    Outbox,
    Refund,
    Ticket,
    Trace,
    kv_get,
    kv_set,
    now,
    session,
)
from keel.notify import enqueue


def analytics(days: int = 30) -> dict:
    since = now() - timedelta(days=days)
    with session() as db:
        convs = db.execute(
            select(Conversation.id, Conversation.status, Conversation.channel).where(Conversation.created_at >= since)
        ).all()
        traces = db.execute(
            select(Trace.conversation_id, Trace.latency_ms, Trace.cost_usd, Trace.created_at, Trace.router).where(
                Trace.created_at >= since
            )
        ).all()
        touched = {
            cid
            for (cid,) in db.execute(
                select(Message.conversation_id)
                .join(Feedback, Feedback.message_id == Message.id)
                .where(Feedback.action.in_(["edit", "reject"]))
            )
        }
        pending_convs = {
            cid for (cid,) in db.execute(select(Message.conversation_id).where(Message.status == "pending_review"))
        }
        refunds = db.execute(
            select(Refund.status, func.count(), func.coalesce(func.sum(Refund.amount_gbp), 0))
            .where(Refund.created_at >= since)
            .group_by(Refund.status)
        ).all()
        fb = db.execute(
            select(func.date(Feedback.created_at), Feedback.action, func.count()).group_by(
                func.date(Feedback.created_at), Feedback.action
            )
        ).all()
        evals = db.execute(select(EvalRun.created_at, EvalRun.score, EvalRun.label).order_by(EvalRun.id)).all()
        pending = db.scalar(select(func.count()).select_from(Message).where(Message.status == "pending_review"))
        dead = sum(
            db.scalar(select(func.count()).select_from(m).where(m.status == "dead")) or 0 for m in (Inbox, Outbox)
        )
        open_tickets = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.status == "open"))

    n = len(convs)
    auto = [c for c in convs if c.status != "escalated" and c.id not in touched and c.id not in pending_convs]
    lats = [t.latency_ms for t in traces]
    cost_by_conv: dict[int, float] = {}
    for t in traces:
        cost_by_conv[t.conversation_id] = cost_by_conv.get(t.conversation_id, 0) + (t.cost_usd or 0)
    daily: dict[str, dict] = {}
    for t in traces:
        d = daily.setdefault(t.created_at.date().isoformat(), {"count": 0, "lat": [], "cost": 0.0})
        d["count"] += 1
        d["lat"].append(t.latency_ms)
        d["cost"] += t.cost_usd or 0
    acc: dict[str, dict] = {}
    for day, action, cnt in fb:
        a = acc.setdefault(str(day), {"approve": 0, "total": 0})
        a["total"] += cnt
        if action == "approve":
            a["approve"] += cnt
    for at, score, _ in evals:
        acc.setdefault(at.date().isoformat(), {"approve": 0, "total": 0})["eval"] = round(score, 4)
    labels = Counter((t.router or {}).get("label", "unknown") for t in traces)
    ref = {s: (c, float(v)) for s, c, v in refunds}
    return {
        "kpis": {
            "conversations": n,
            "auto_resolution_pct": round(100 * len(auto) / n, 1) if n else 0.0,
            "avg_response_ms": int(sum(lats) / len(lats)) if lats else 0,
            "p50_response_ms": int(median(lats)) if lats else 0,
            "p95_response_ms": int(sorted(lats)[max(0, int(0.95 * len(lats)) - 1)]) if lats else 0,
            "cost_per_conversation_usd": round(sum(cost_by_conv.values()) / len(cost_by_conv), 5)
            if cost_by_conv
            else 0,
            "total_cost_usd": round(sum(cost_by_conv.values()), 4),
            "escalations": sum(1 for c in convs if c.status == "escalated"),
            "refunds_count": ref.get("issued", (0, 0))[0],
            "refunds_gbp": round(ref.get("issued", (0, 0.0))[1], 2),
            "refunds_pending": ref.get("pending_approval", (0, 0))[0],
            "pending_reviews": pending or 0,
            "open_tickets": open_tickets or 0,
            "dead_letters": dead,
            "latest_eval": evals[-1].score if evals else None,
        },
        "series": {
            "daily": [
                {
                    "day": d,
                    "count": v["count"],
                    "avg_ms": int(sum(v["lat"]) / len(v["lat"])),
                    "cost": round(v["cost"], 5),
                }
                for d, v in sorted(daily.items())
            ],
            "accuracy": [
                {
                    "day": d,
                    "human_approval_pct": round(100 * v["approve"] / v["total"], 1) if v["total"] else None,
                    "eval_score": v.get("eval"),
                }
                for d, v in sorted(acc.items())
            ],
        },
        "routes": dict(Counter((t.router or {}).get("route", "unknown") for t in traces)),
        "channels": dict(Counter(c.channel for c in convs)),
        "top_issues": [{"label": k, "count": v} for k, v in labels.most_common(8)],
    }


def build_report() -> tuple[str, str]:
    a = analytics(days=1)
    k = a["kpis"]
    acc = next(
        (x["human_approval_pct"] for x in reversed(a["series"]["accuracy"]) if x["human_approval_pct"] is not None),
        None,
    )
    issues = ", ".join(f"{i['label'].replace('_', ' ')} ({i['count']})" for i in a["top_issues"][:5]) or "none"
    rows = [
        ("Conversations", k["conversations"]),
        ("Auto-resolved", f"{k['auto_resolution_pct']}%"),
        ("Escalations", k["escalations"]),
        ("Refunds issued", f"{k['refunds_count']} · £{k['refunds_gbp']:.2f}"),
        ("Refunds awaiting approval", k["refunds_pending"]),
        ("Top issues", issues),
        ("AI accuracy (reviewer approvals)", f"{acc}%" if acc is not None else "no reviews yet"),
        ("Latest eval score", f"{100 * k['latest_eval']:.1f}%" if k["latest_eval"] is not None else "n/a"),
        ("Avg / p95 response", f"{k['avg_response_ms']} ms / {k['p95_response_ms']} ms"),
        ("AI cost", f"${k['total_cost_usd']} (${k['cost_per_conversation_usd']} per conversation)"),
        ("Pending reviews · dead letters", f"{k['pending_reviews']} · {k['dead_letters']}"),
    ]
    title = f"Hearth & Field · AI operations report · {now():%A %d %B %Y}"
    text = title + "\n\n" + "\n".join(f"{a_}: {b}" for a_, b in rows)
    html = (
        "<div style='font-family:Inter,Arial,sans-serif;max-width:620px;margin:auto;color:#14201c'>"
        f"<h2 style='color:#0f5c4c;margin-bottom:4px'>Daily AI operations report</h2>"
        f"<p style='color:#5b6b65;margin-top:0'>Hearth &amp; Field · last 24 hours · {now():%d %b %Y}</p>"
        "<table style='width:100%;border-collapse:collapse'>"
        + "".join(
            f"<tr><td style='padding:8px;border-bottom:1px solid #e4e9e6;color:#5b6b65'>{a_}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e4e9e6;font-weight:600'>{b}</td></tr>"
            for a_, b in rows
        )
        + f"</table><p style='color:#5b6b65;font-size:12px'>Open the dashboard: {settings().frontend_url}/analytics</p></div>"
    )
    return text, html


def send_daily_report(key: str | None = None) -> dict:
    text, html = build_report()
    key = key or now().strftime("%Y-%m-%d")
    to = settings().report_to
    if to:
        enqueue(
            "email",
            to,
            {"subject": "Daily AI operations report · Hearth & Field", "text": text, "html": html},
            f"report:{key}:{to}",
        )
    enqueue("slack", "slack", {"text": ":bar_chart: " + text}, f"report:{key}:slack")
    kv_set("last_report", {"at": now().isoformat(), "text": text, "emailed_to": to or None})
    return {"text": text, "emailed_to": to or None}


def scheduler(stop: threading.Event) -> None:
    from keel.queue import recover_stuck

    while not stop.is_set():
        t = now()
        key = t.strftime("%Y-%m-%d")
        if t.hour >= settings().report_hour_utc and kv_get("report_sent_for") != key:
            kv_set("report_sent_for", key)
            send_daily_report(key)
        recover_stuck()
        stop.wait(60)
