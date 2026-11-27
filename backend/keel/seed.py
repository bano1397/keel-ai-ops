import csv
import json
from datetime import datetime

import bcrypt
from sqlalchemy import func, select

from keel.config import settings
from keel.db import Customer, Order, Product, User, init_db, session


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


def seed(force: bool = False) -> bool:
    s = settings()
    init_db()
    with session() as db:
        if db.scalar(select(func.count()).select_from(User)) and not force:
            return False
        db.add_all(
            [
                User(
                    email=s.admin_email,
                    name="Ammad (Admin)",
                    password_hash=hash_password(s.admin_password),
                    role="admin",
                ),
                User(
                    email=s.agent_email, name="Sam (Agent)", password_hash=hash_password(s.agent_password), role="agent"
                ),
            ]
        )
        with open(s.corpus_dir / "products.csv") as f:
            for r in csv.DictReader(f):
                db.add(
                    Product(
                        sku=r["sku"],
                        name=r["name"],
                        category=r["category"],
                        price_gbp=float(r["price_gbp"]),
                        stock=int(r["stock"]),
                        description=r["description"],
                        url=r["url"],
                    )
                )
        data = json.loads(s.seed_file.read_text())
        for c in data["customers"]:
            db.add(
                Customer(
                    id=c["id"],
                    name=c["name"],
                    email=c["email"],
                    telegram_chat_id=c.get("telegram_chat_id"),
                    phone=c.get("phone"),
                    address=c.get("address"),
                    tier=c.get("tier", "standard"),
                    vulnerable=bool(c.get("vulnerable")),
                    created_at=_dt(c.get("created_at")),
                )
            )
        db.flush()
        for o in data["orders"]:
            db.add(
                Order(
                    id=o["id"],
                    customer_id=o["customer_id"],
                    status=o["status"],
                    total_gbp=o["total_gbp"],
                    items=o["items"],
                    shipping_address=o["shipping_address"],
                    carrier=o.get("carrier"),
                    tracking=o.get("tracking"),
                    created_at=_dt(o["created_at"]),
                    delivered_at=_dt(o.get("delivered_at")),
                    updated_at=_dt(o.get("updated_at") or o["created_at"]),
                )
            )
        db.execute(__import__("sqlalchemy").text("SELECT setval('customers_id_seq', (SELECT max(id) FROM customers))"))
    return True


if __name__ == "__main__":
    from keel.rag.ingest import ingest

    print("seeded", seed())
    print(ingest())
