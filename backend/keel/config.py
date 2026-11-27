from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / ".env", ROOT / "backend" / ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://keel:keel@localhost:5433/keel"
    public_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3200"
    corpus_dir: Path = ROOT / "corpus"
    seed_file: Path = ROOT / "backend" / "seed" / "seed_data.json"
    help_site_url: str = ""

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_fast_model: str = "openai/gpt-oss-20b"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    ollama_url: str = ""
    ollama_model: str = "llama3.2:3b"
    llm_offline: bool = False

    router_gguf_path: str = ""
    router_min_confidence: float = 0.6

    embed_model: str = "BAAI/bge-small-en-v1.5"
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"
    rag_min_rerank: float = 0.0
    rag_top_k: int = 4

    jwt_secret: str = "dev-secret-change-me-please-32-bytes-min"
    admin_email: str = "admin@keel.demo"
    admin_password: str = "KeelAdmin!2026"
    agent_email: str = "agent@keel.demo"
    agent_password: str = "KeelAgent!2026"

    refund_auto_limit_gbp: float = 50.0
    auto_send_confidence: float = 0.7

    telegram_bot_token: str = ""
    telegram_webhook_secret: str = "dev-telegram-secret"
    resend_api_key: str = ""
    resend_webhook_secret: str = ""
    email_from: str = "Hearth & Field Support <support@example.com>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    report_to: str = ""
    report_hour_utc: int = 8
    slack_webhook_url: str = ""
    n8n_hmac_secret: str = "dev-n8n-secret"

    enable_workers: bool = True
    rate_limit_per_minute: int = 30


@lru_cache
def settings() -> Settings:
    return Settings()
