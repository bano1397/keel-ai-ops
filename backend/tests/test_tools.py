from keel import tools
from keel.db import Order, Refund, Ticket, session
from sqlalchemy import select


def ctx(customer_id, conv=1):
    return tools.ToolContext(customer_id=customer_id, conversation_id=conv)


def test_get_order_status_owner_only(order_of):
    o = order_of("dispatched")
    ok = tools.call("get_order_status", {"order_id": o["id"]}, ctx(o["customer_id"]))
    assert ok["order_id"] == o["id"] and ok["status"] == "dispatched"
    other = tools.call("get_order_status", {"order_id": o["id"]}, ctx(o["customer_id"] + 1))
    assert other["error"] == "not_found_for_customer"


def test_invalid_arguments_are_rejected():
    assert tools.call("get_order_status", {"order_id": "DROP TABLE"}, ctx(1))["error"] == "invalid_arguments"
    assert tools.call("issue_refund", {"order_id": "HF-123456"}, ctx(1))["error"] == "invalid_arguments"
    assert tools.call("delete_everything", {}, ctx(1))["error"] == "unknown_tool"


def test_small_refund_is_issued_and_idempotent(order_of):
    o = order_of("delivered", max_total=50)
    args = {"order_id": o["id"], "reason": "wrong colour"}
    first = tools.call("issue_refund", args, ctx(o["customer_id"], conv=901))
    assert first["status"] == "issued" and first["amount_gbp"] == o["total_gbp"]
    again = tools.call("issue_refund", args, ctx(o["customer_id"], conv=901))
    assert again["idempotent_replay"] is True and again["refund_id"] == first["refund_id"]
    with session() as db:
        assert len(db.scalars(select(Refund).where(Refund.order_id == o["id"])).all()) == 1
        assert db.get(Order, o["id"]).status == "refunded"


def test_large_refund_needs_human_approval(order_of):
    o = order_of("delivered", min_total=50)
    res = tools.call(
        "issue_refund", {"order_id": o["id"], "reason": "faulty", "faulty": True}, ctx(o["customer_id"], 902)
    )
    assert res["status"] == "pending_approval"
    with session() as db:
        assert db.get(Order, o["id"]).status == "delivered"
        assert db.scalar(select(Ticket).where(Ticket.refund_id == res["refund_id"])).kind == "refund_approval"


def test_cancel_and_address_only_while_processing(order_of):
    p = order_of("processing")
    moved = tools.call(
        "update_shipping_address",
        {"order_id": p["id"], "new_address": "1 Kirkgate, Leeds LS1 6BY"},
        ctx(p["customer_id"]),
    )
    assert moved["updated"] is True
    assert (
        tools.call("update_shipping_address", {"order_id": p["id"], "new_address": "nowhere"}, ctx(p["customer_id"]))[
            "error"
        ]
        == "invalid_arguments"
    )
    assert tools.call("cancel_order", {"order_id": p["id"]}, ctx(p["customer_id"]))["status"] == "cancelled"
    d = order_of("delivered")
    assert tools.call("cancel_order", {"order_id": d["id"]}, ctx(d["customer_id"]))["error"] == "cannot_cancel"
