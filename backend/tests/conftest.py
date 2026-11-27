import os

import psycopg
import pytest

BASE = os.environ.get("TEST_DATABASE_ADMIN_URL", "postgresql://keel:keel@localhost:5433/keel")


def pytest_configure(config):
    with psycopg.connect(BASE, autocommit=True) as c:
        c.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='keel_test' AND pid <> pg_backend_pid()"
        )
        c.execute("DROP DATABASE IF EXISTS keel_test")
        c.execute("CREATE DATABASE keel_test")
    os.environ["DATABASE_URL"] = BASE.rsplit("/", 1)[0].replace("postgresql://", "postgresql+psycopg://") + "/keel_test"
    os.environ["LLM_OFFLINE"] = "1"
    os.environ["ENABLE_WORKERS"] = "0"
    os.environ["SLACK_WEBHOOK_URL"] = ""
    os.environ["TELEGRAM_BOT_TOKEN"] = ""
    os.environ["RESEND_API_KEY"] = ""
    os.environ["SMTP_HOST"] = ""
    os.environ["REPORT_TO"] = ""
    os.environ["N8N_HMAC_SECRET"] = "test-n8n-secret"
    os.environ["TELEGRAM_WEBHOOK_SECRET"] = "test-tg-secret"
    os.environ["ROUTER_GGUF_PATH"] = ""


@pytest.fixture(scope="session", autouse=True)
def seeded():
    from keel.rag.ingest import ingest
    from keel.seed import seed

    seed()
    ingest()
    yield


@pytest.fixture
def seed_data():
    import json

    from keel.config import settings

    return json.loads(settings().seed_file.read_text())


@pytest.fixture
def order_of(seed_data):
    def pick(status, max_total=None, min_total=None):
        from datetime import UTC, datetime, timedelta

        for o in seed_data["orders"]:
            if o["status"] != status:
                continue
            if max_total is not None and o["total_gbp"] > max_total:
                continue
            if min_total is not None and o["total_gbp"] <= min_total:
                continue
            if status == "delivered":
                d = datetime.fromisoformat(o["delivered_at"].replace("Z", "+00:00"))
                if datetime.now(UTC) - d > timedelta(days=25):
                    continue
            if o.get("_used"):
                continue
            o["_used"] = True
            return o
        raise LookupError(status)

    return pick
