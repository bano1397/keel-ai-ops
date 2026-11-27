from sqlalchemy import func, select

from keel.db import Conversation, Customer, Message, Order, Refund, Ticket, now, session


def resolve_customer(channel: str, sender: str, name: str | None = None) -> int:
    with session() as db:
        if channel == "telegram":
            c = db.scalar(select(Customer).where(Customer.telegram_chat_id == sender))
            if not c:
                c = Customer(name=name or f"Telegram user {sender}", telegram_chat_id=sender)
                db.add(c)
                db.flush()
            return c.id
        email = sender.strip().lower()
        c = db.scalar(select(Customer).where(func.lower(Customer.email) == email))
        if not c:
            c = Customer(name=name or email.split("@")[0].replace(".", " ").title(), email=email)
            db.add(c)
            db.flush()
        return c.id


def link_email(customer_id: int, email: str) -> int:
    with session() as db:
        target = db.scalar(select(Customer).where(func.lower(Customer.email) == email.lower()))
        if not target or target.id == customer_id:
            return customer_id
        src = db.get(Customer, customer_id)
        if src and src.telegram_chat_id and not target.telegram_chat_id:
            chat = src.telegram_chat_id
            src.telegram_chat_id = None
            db.flush()
            target.telegram_chat_id = chat
        for conv in db.scalars(select(Conversation).where(Conversation.customer_id == customer_id)):
            conv.customer_id = target.id
        return target.id


def conversation_for(customer_id: int, channel: str, conversation_id: int | None = None) -> int:
    with session() as db:
        if conversation_id:
            conv = db.get(Conversation, conversation_id)
            if conv and conv.customer_id == customer_id:
                return conv.id
        conv = db.scalar(
            select(Conversation)
            .where(
                Conversation.customer_id == customer_id,
                Conversation.channel == channel,
                Conversation.status != "resolved",
            )
            .order_by(Conversation.id.desc())
        )
        if not conv:
            conv = Conversation(customer_id=customer_id, channel=channel)
            db.add(conv)
            db.flush()
        return conv.id


def add_message(conversation_id: int, role: str, content: str, **kw: object) -> int:
    with session() as db:
        m = Message(conversation_id=conversation_id, role=role, content=content, **kw)
        db.add(m)
        conv = db.get(Conversation, conversation_id)
        if conv:
            conv.updated_at = now()
        db.flush()
        return m.id


def history(conversation_id: int, limit: int = 10) -> list[dict]:
    with session() as db:
        rows = db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.status != "rejected")
            .order_by(Message.id.desc())
            .limit(limit)
        ).all()
        return [{"role": m.role, "content": m.content, "agent": m.agent} for m in reversed(rows)]


def profile(customer_id: int | None) -> dict:
    if not customer_id:
        return {}
    with session() as db:
        c = db.get(Customer, customer_id)
        if not c:
            return {}
        orders = db.scalars(
            select(Order).where(Order.customer_id == c.id).order_by(Order.created_at.desc()).limit(8)
        ).all()
        refunds = db.execute(
            select(Refund.order_id, Refund.amount_gbp, Refund.status)
            .join(Order, Order.id == Refund.order_id)
            .where(Order.customer_id == c.id)
        ).all()
        tickets = db.scalars(select(Ticket).where(Ticket.customer_id == c.id).order_by(Ticket.id.desc()).limit(5)).all()
        channels = sorted(
            {ch for (ch,) in db.execute(select(Conversation.channel).where(Conversation.customer_id == c.id))}
        )
        complaints = sum(1 for t in tickets if t.kind == "escalation")
        return {
            "id": c.id,
            "name": c.name,
            "email": c.email,
            "tier": c.tier,
            "vulnerable": c.vulnerable,
            "channels": channels,
            "orders": [
                {
                    "order_id": o.id,
                    "status": o.status,
                    "total_gbp": float(o.total_gbp),
                    "ordered": o.created_at.date().isoformat(),
                }
                for o in orders
            ],
            "refunds": [{"order_id": r[0], "amount_gbp": float(r[1]), "status": r[2]} for r in refunds],
            "past_escalations": complaints,
            "open_tickets": sum(1 for t in tickets if t.status == "open"),
        }


def profile_text(p: dict) -> str:
    if not p:
        return "Customer: not identified yet."
    lines = [
        f"Customer: {p['name']} (id {p['id']}, {p['tier']}{', vulnerable customer' if p['vulnerable'] else ''}),"
        f" channels used: {', '.join(p['channels']) or 'none'}"
    ]
    if p["orders"]:
        lines.append(
            "Orders: " + "; ".join(f"{o['order_id']} {o['status']} £{o['total_gbp']:.2f}" for o in p["orders"])
        )
    if p["refunds"]:
        lines.append(
            "Refunds: " + "; ".join(f"{r['order_id']} £{r['amount_gbp']:.2f} {r['status']}" for r in p["refunds"])
        )
    if p["past_escalations"]:
        lines.append(f"Previous escalations: {p['past_escalations']}")
    return "\n".join(lines)
