import json
from pathlib import Path

from sqlalchemy import func, select

from keel import llm
from keel.db import Feedback, Message, PromptVersion, Trace, session
from keel.rag.answer import tokens
from keel.rag.models import embed_query


def record(
    message_id: int, action: str, reviewer: str, corrected: str | None = None, reason: str | None = None
) -> dict:
    with session() as db:
        m = db.get(Message, message_id)
        if not m or m.role != "assistant":
            raise ValueError("assistant message not found")
        cust = db.scalar(
            select(Message)
            .where(Message.conversation_id == m.conversation_id, Message.role == "user", Message.id < m.id)
            .order_by(Message.id.desc())
        )
        trace = db.get(Trace, m.trace_id) if m.trace_id else None
        question = cust.content if cust else ""
        f = Feedback(
            message_id=m.id,
            agent=m.agent,
            customer_message=question,
            original_reply=m.content,
            corrected_reply=corrected,
            action=action,
            reason=reason,
            reviewer=reviewer,
            context={"sources": trace.sources if trace else [], "router": trace.router if trace else {}},
            embedding=embed_query(question) if question else None,
        )
        db.add(f)
        if action == "approve":
            m.status = "sent"
        elif action == "edit":
            m.content, m.status = corrected or m.content, "edited"
        elif action == "reject":
            m.status = "rejected"
        db.flush()
        return {"feedback_id": f.id, "action": action, "message_status": m.status}


def similar_examples(agent: str, question: str, k: int = 3, min_sim: float = 0.75) -> str:
    vec = embed_query(question)
    with session() as db:
        dist = Feedback.embedding.cosine_distance(vec)
        rows = db.execute(
            select(Feedback.customer_message, func.coalesce(Feedback.corrected_reply, Feedback.original_reply), dist)
            .where(Feedback.agent == agent, Feedback.action.in_(["edit", "approve"]), Feedback.embedding.is_not(None))
            .order_by(dist)
            .limit(k)
        ).all()
    return "\n".join(f"Customer: {q}\nApproved reply: {r}" for q, r, d in rows if 1 - d >= min_sim)


def exact_correction(agent: str, question: str) -> str | None:
    vec = embed_query(question)
    qt = tokens(question)
    with session() as db:
        dist = Feedback.embedding.cosine_distance(vec)
        row = db.execute(
            select(Feedback.customer_message, Feedback.corrected_reply, dist)
            .where(Feedback.agent == agent, Feedback.action == "edit", Feedback.embedding.is_not(None))
            .order_by(dist)
            .limit(1)
        ).first()
    if not row:
        return None
    ct = tokens(row[0])
    jacc = len(qt & ct) / max(1, len(qt | ct))
    return row[1] if (1 - row[2]) >= 0.93 and jacc >= 0.6 else None


def active_rules(agent: str) -> str:
    with session() as db:
        pv = db.scalar(
            select(PromptVersion)
            .where(PromptVersion.agent == agent, PromptVersion.status == "active")
            .order_by(PromptVersion.version.desc())
        )
        return pv.rules if pv else ""


def propose_rules(agent: str, author: str) -> dict:
    with session() as db:
        rejects = db.execute(
            select(Feedback.customer_message, Feedback.original_reply, Feedback.corrected_reply, Feedback.reason)
            .where(Feedback.agent == agent, Feedback.action.in_(["reject", "edit"]))
            .order_by(Feedback.id.desc())
            .limit(25)
        ).all()
        current = active_rules(agent)
        version = (db.scalar(select(func.max(PromptVersion.version)).where(PromptVersion.agent == agent)) or 0) + 1
    if not rejects:
        return {"error": "no feedback to learn from yet"}
    rules = ""
    if llm.available():
        try:
            out = llm.chat_json(
                [
                    {
                        "role": "system",
                        "content": "You improve a customer-support agent's prompt. From reviewer "
                        "corrections, write at most 8 short, general, imperative rules (no customer data, no order ids). "
                        'Keep useful existing rules. Return JSON {"rules": [str]}.',
                    },
                    {
                        "role": "user",
                        "content": f"Existing rules:\n{current or '(none)'}\n\nCorrections:\n"
                        + "\n".join(
                            f"- Q: {q}\n  AI: {o}\n  Human: {c or '(rejected)'}\n  Reason: {r or ''}"
                            for q, o, c, r in rejects
                        ),
                    },
                ],
                llm.Usage(),
            )
            rules = "\n".join(f"- {r}" for r in out.get("rules", [])[:8])
        except llm.LLMUnavailable:
            rules = ""
    if not rules:
        reasons = [r for *_, r in rejects if r]
        rules = "\n".join(dict.fromkeys(f"- {r.strip().rstrip('.')}." for r in reasons[:8]))
    if not rules:
        return {"error": "rejections need a reason to derive rules"}
    with session() as db:
        pv = PromptVersion(agent=agent, version=version, rules=rules, status="proposed", created_by=author)
        db.add(pv)
        db.flush()
        return {"id": pv.id, "agent": agent, "version": version, "rules": rules, "status": "proposed"}


def activate(prompt_id: int) -> dict:
    with session() as db:
        pv = db.get(PromptVersion, prompt_id)
        if not pv:
            raise ValueError("not found")
        for other in db.scalars(
            select(PromptVersion).where(PromptVersion.agent == pv.agent, PromptVersion.status == "active")
        ):
            other.status = "retired"
        pv.status = "active"
        return {"id": pv.id, "agent": pv.agent, "version": pv.version, "status": "active"}


def export_dataset(path: Path) -> int:
    from keel.router import SYSTEM

    with session() as db:
        rows = db.execute(
            select(
                Feedback.customer_message,
                Feedback.corrected_reply,
                Feedback.original_reply,
                Feedback.action,
                Feedback.context,
            ).where(Feedback.action.in_(["edit", "approve"]))
        ).all()
    with open(path, "w") as f:
        for q, corrected, original, _action, ctx in rows:
            label = (ctx or {}).get("router", {}).get("label")
            if label:
                f.write(
                    json.dumps(
                        {
                            "task": "router",
                            "messages": [
                                {"role": "system", "content": SYSTEM},
                                {"role": "user", "content": q},
                                {"role": "assistant", "content": label},
                            ],
                        }
                    )
                    + "\n"
                )
            f.write(
                json.dumps(
                    {
                        "task": "reply",
                        "messages": [
                            {"role": "user", "content": q},
                            {"role": "assistant", "content": corrected or original},
                        ],
                    }
                )
                + "\n"
            )
    return len(rows)
