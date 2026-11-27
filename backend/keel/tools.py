import hashlib
import json
import re
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select

from keel.config import settings
from keel.db import Customer, Order, Refund, Ticket, now, session

ORDER_ID = re.compile(r"^HF-\d{6}$")
REFUNDABLE = {"delivered", "partially_refunded", "dispatched", "in_transit"}
RETURN_WINDOW_DAYS = 30


class ToolContext(BaseModel):
    customer_id: int | None
    conversation_id: int
    actor: str = "orders-agent"


class OrderArg(BaseModel):
    order_id: str = Field(description="Order id like HF-204817")

    @field_validator("order_id")
    @classmethod
    def valid_id(cls, v: str) -> str:
        v = v.strip().upper()
        if not ORDER_ID.match(v):
            raise ValueError("order_id must look like HF-123456")
        return v


class NoArgs(BaseModel):
    pass


class RefundArgs(OrderArg):
    reason: str = Field(min_length=3, max_length=300)
    amount_gbp: float | None = Field(default=None, gt=0, le=5000, description="Omit for a full refund")
    faulty: bool = Field(default=False, description="True if the item is damaged, faulty or never arrived")


class AddressArgs(OrderArg):
    new_address: str = Field(min_length=8, max_length=200)

    @field_validator("new_address")
    @classmethod
    def uk_postcode(cls, v: str) -> str:
        if not re.search(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", v.upper()):
            raise ValueError("new_address must include a UK postcode")
        return v.strip()


class TicketArgs(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    risk: str = Field(default="medium", pattern="^(low|medium|high)$")


def _owned(db: Any, order_id: str, ctx: ToolContext) -> Order | dict:
    if ctx.customer_id is None:
        return {"error": "customer_not_verified", "message": "I need the email address on the order first."}
    o = db.get(Order, order_id)
    if not o or o.customer_id != ctx.customer_id:
        return {"error": "not_found_for_customer", "message": f"No order {order_id} found on this customer's account."}
    return o


def _order_view(o: Order, db: Any) -> dict:
    refunds = db.scalars(select(Refund).where(Refund.order_id == o.id)).all()
    return {
        "order_id": o.id,
        "status": o.status,
        "total_gbp": float(o.total_gbp),
        "items": [{"name": i["name"], "qty": i["qty"]} for i in o.items],
        "carrier": o.carrier,
        "tracking": o.tracking,
        "ordered": o.created_at.date().isoformat(),
        "delivered": o.delivered_at.date().isoformat() if o.delivered_at else None,
        "shipping_address": o.shipping_address,
        "refunds": [{"amount_gbp": float(r.amount_gbp), "status": r.status} for r in refunds],
    }


def get_order_status(a: OrderArg, ctx: ToolContext) -> dict:
    with session() as db:
        o = _owned(db, a.order_id, ctx)
        return o if isinstance(o, dict) else _order_view(o, db)


def list_customer_orders(_: NoArgs, ctx: ToolContext) -> dict:
    if ctx.customer_id is None:
        return {"error": "customer_not_verified"}
    with session() as db:
        rows = db.scalars(
            select(Order).where(Order.customer_id == ctx.customer_id).order_by(Order.created_at.desc())
        ).all()
        return {
            "orders": [
                {
                    "order_id": o.id,
                    "status": o.status,
                    "total_gbp": float(o.total_gbp),
                    "ordered": o.created_at.date().isoformat(),
                }
                for o in rows
            ]
        }


def issue_refund(a: RefundArgs, ctx: ToolContext) -> dict:
    limit = settings().refund_auto_limit_gbp
    key = hashlib.sha256(f"{ctx.conversation_id}:{a.order_id}:{a.amount_gbp}".encode()).hexdigest()[:40]
    with session() as db:
        existing = db.scalar(select(Refund).where(Refund.idempotency_key == key))
        if existing:
            return {
                "refund_id": existing.id,
                "status": existing.status,
                "amount_gbp": float(existing.amount_gbp),
                "idempotent_replay": True,
            }
        o = _owned(db, a.order_id, ctx)
        if isinstance(o, dict):
            return o
        if o.status not in REFUNDABLE:
            return {"error": "not_refundable", "message": f"Order is {o.status}; it can't be refunded."}
        if not a.faulty and o.delivered_at and now() - o.delivered_at > timedelta(days=RETURN_WINDOW_DAYS):
            return {
                "error": "outside_return_window",
                "message": "It's more than 30 days since delivery; " "only faulty items can be refunded now.",
            }
        already = sum(
            float(r.amount_gbp)
            for r in db.scalars(
                select(Refund).where(Refund.order_id == o.id, Refund.status.in_(["issued", "pending_approval"]))
            ).all()
        )
        remaining = round(float(o.total_gbp) - already, 2)
        amount = round(a.amount_gbp if a.amount_gbp else remaining, 2)
        if remaining <= 0:
            return {"error": "already_refunded", "message": "This order has already been fully refunded."}
        if amount > remaining:
            return {"error": "amount_too_high", "message": f"The most that can be refunded is £{remaining:.2f}."}
        status = "issued" if amount <= limit else "pending_approval"
        r = Refund(
            order_id=o.id,
            amount_gbp=amount,
            reason=a.reason,
            status=status,
            idempotency_key=key,
            conversation_id=ctx.conversation_id,
            created_by=ctx.actor,
        )
        db.add(r)
        db.flush()
        if status == "issued":
            o.status = "refunded" if amount >= remaining else "partially_refunded"
            o.updated_at = now()
        else:
            db.add(
                Ticket(
                    conversation_id=ctx.conversation_id,
                    customer_id=o.customer_id,
                    kind="refund_approval",
                    risk="low",
                    refund_id=r.id,
                    summary={
                        "issue": f"Refund £{amount:.2f} on {o.id} needs approval",
                        "customer_ask": a.reason,
                        "actions_taken": [f"Orders agent requested £{amount:.2f}"],
                        "recommended_next": f"Approve or reject (auto limit £{limit:.0f})",
                    },
                )
            )
        return {
            "refund_id": r.id,
            "order_id": o.id,
            "amount_gbp": amount,
            "status": status,
            "policy": f"Refunds up to £{limit:.0f} are automatic; larger ones need a team member's approval.",
        }


def update_shipping_address(a: AddressArgs, ctx: ToolContext) -> dict:
    with session() as db:
        o = _owned(db, a.order_id, ctx)
        if isinstance(o, dict):
            return o
        if o.status != "processing":
            return {
                "error": "already_dispatched",
                "message": f"Order is {o.status}; the address can only change "
                "before dispatch. The carrier's tracking link can redirect it.",
            }
        old = o.shipping_address
        o.shipping_address = a.new_address
        o.updated_at = now()
        return {"order_id": o.id, "old_address": old, "new_address": a.new_address, "updated": True}


def cancel_order(a: OrderArg, ctx: ToolContext) -> dict:
    with session() as db:
        o = _owned(db, a.order_id, ctx)
        if isinstance(o, dict):
            return o
        if o.status != "processing":
            return {
                "error": "cannot_cancel",
                "message": f"Order is {o.status}; only orders still processing can be "
                "cancelled. It can be returned free within 30 days of delivery instead.",
            }
        o.status = "cancelled"
        o.updated_at = now()
        return {"order_id": o.id, "status": "cancelled", "refund": "Payment authorisation released in 3-5 days."}


def create_ticket(a: TicketArgs, ctx: ToolContext) -> dict:
    with session() as db:
        t = Ticket(
            conversation_id=ctx.conversation_id,
            customer_id=ctx.customer_id or 0,
            kind="followup",
            risk=a.risk,
            summary={"issue": a.reason, "actions_taken": ["Orders agent created follow-up"]},
        )
        db.add(t)
        db.flush()
        return {"ticket_id": t.id, "status": "open"}


REGISTRY: dict[str, tuple[type[BaseModel], Callable[..., dict], str]] = {
    "get_order_status": (OrderArg, get_order_status, "Look up one order: status, items, tracking, refunds."),
    "list_customer_orders": (NoArgs, list_customer_orders, "List the verified customer's orders."),
    "issue_refund": (
        RefundArgs,
        issue_refund,
        "Refund an order the customer asked to refund. Up to £50 is "
        "issued at once; above that it goes to a human for approval. Never refund unless the customer "
        "explicitly asked for a refund or money back for that order.",
    ),
    "update_shipping_address": (
        AddressArgs,
        update_shipping_address,
        "Change the delivery address of an order " "that is still processing. Needs a full UK address with postcode.",
    ),
    "cancel_order": (OrderArg, cancel_order, "Cancel an order that is still processing, when the customer asks."),
    "create_ticket": (TicketArgs, create_ticket, "Create a follow-up ticket for the human team."),
}

ORDER_TOOLS = [
    "get_order_status",
    "list_customer_orders",
    "issue_refund",
    "update_shipping_address",
    "cancel_order",
    "create_ticket",
]


def schemas(names: list[str]) -> list[dict]:
    out = []
    for n in names:
        model, _, desc = REGISTRY[n]
        params = model.model_json_schema()
        params.pop("title", None)
        out.append({"type": "function", "function": {"name": n, "description": desc, "parameters": params}})
    return out


def call(name: str, raw_args: Any, ctx: ToolContext) -> dict:
    if name not in REGISTRY:
        return {"error": "unknown_tool", "tool": name}
    model, fn, _ = REGISTRY[name]
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
        parsed = model.model_validate(args)
    except (ValidationError, json.JSONDecodeError) as e:
        return {"error": "invalid_arguments", "details": str(e)[:300]}
    return fn(parsed, ctx)


def customer_owns(customer_id: int | None, order_id: str) -> bool:
    with session() as db:
        o = db.get(Order, order_id)
        return bool(o and customer_id and o.customer_id == customer_id)


def customer_by_id(cid: int) -> Customer | None:
    with session() as db:
        return db.get(Customer, cid)
