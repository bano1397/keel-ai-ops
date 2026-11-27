import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from tenacity import RetryCallState, retry, retry_if_exception, stop_after_attempt

from keel.config import settings

log = logging.getLogger("keel.llm")

PRICES_PER_MTOK = {
    "openai/gpt-oss-120b": (0.15, 0.60),
    "openai/gpt-oss-20b": (0.075, 0.30),
    "gemini-3.8-flash": (0.75, 3.75),
    "keel-router-qwen2.5-1.5b": (0.0, 0.0),
    "offline-rules": (0.0, 0.0),
}


class LLMUnavailable(Exception):
    pass


class QuotaExceeded(Exception):
    pass


class RetryableHTTP(Exception):
    def __init__(self, status: int, retry_after: float | None):
        super().__init__(f"HTTP {status}")
        self.retry_after = retry_after


@dataclass
class Usage:
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    models: list[str] = field(default_factory=list)

    def add(self, model: str, tin: int, tout: int) -> None:
        pin, pout = PRICES_PER_MTOK.get(model, (0.0, 0.0))
        self.tokens_in += tin
        self.tokens_out += tout
        self.cost_usd += tin / 1e6 * pin + tout / 1e6 * pout
        if model not in self.models:
            self.models.append(model)


@dataclass
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    fast_model: str


def providers() -> list[Provider]:
    s = settings()
    if s.llm_offline:
        return []
    out = []
    if s.groq_api_key:
        out.append(Provider("groq", "https://api.groq.com/openai/v1", s.groq_api_key, s.groq_model, s.groq_fast_model))
        if s.groq_fast_model != s.groq_model:
            out.append(
                Provider(
                    "groq-fast", "https://api.groq.com/openai/v1", s.groq_api_key, s.groq_fast_model, s.groq_fast_model
                )
            )
    if s.gemini_api_key:
        out.append(
            Provider(
                "gemini",
                "https://generativelanguage.googleapis.com/v1beta/openai",
                s.gemini_api_key,
                s.gemini_model,
                s.gemini_model,
            )
        )
    if s.ollama_url:
        out.append(Provider("ollama", s.ollama_url.rstrip("/") + "/v1", "ollama", s.ollama_model, s.ollama_model))
    return out


def available() -> bool:
    return bool(providers())


def _wait(state: RetryCallState) -> float:
    exc = state.outcome.exception() if state.outcome else None
    if isinstance(exc, RetryableHTTP) and exc.retry_after:
        return min(exc.retry_after, 20.0)
    return float(min(16, 1.0 * 2 ** (state.attempt_number - 1)))


def _retryable(exc: BaseException) -> bool:
    return isinstance(exc, RetryableHTTP | httpx.TransportError)


@retry(retry=retry_if_exception(_retryable), wait=_wait, stop=stop_after_attempt(3), reraise=True)
def _post(p: Provider, body: dict[str, Any]) -> dict[str, Any]:
    r = httpx.post(
        f"{p.base_url}/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {p.api_key}"},
        timeout=45,
    )
    if r.status_code == 429:
        raise QuotaExceeded(r.text[:200])
    if r.status_code >= 500:
        ra = r.headers.get("retry-after")
        raise RetryableHTTP(r.status_code, float(ra) if ra and ra.replace(".", "").isdigit() else None)
    r.raise_for_status()
    return r.json()


def chat(
    messages: list[dict[str, Any]],
    usage: Usage,
    *,
    fast: bool = False,
    tools: list[dict[str, Any]] | None = None,
    json_mode: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 700,
) -> dict[str, Any]:
    errors = []
    for p in providers():
        model = p.fast_model if fast else p.model
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if p.name.startswith("groq") and "gpt-oss" in model:
            body["reasoning_effort"] = "low"
            body["max_tokens"] = max_tokens + 600
        try:
            data = _post(p, body)
        except Exception as e:
            log.warning("provider %s (%s) failed: %r", p.name, model, e)
            errors.append(f"{p.name}: {e!r}")
            continue
        u = data.get("usage") or {}
        usage.add(model, int(u.get("prompt_tokens", 0)), int(u.get("completion_tokens", 0)))
        return dict(data["choices"][0]["message"])
    raise LLMUnavailable("; ".join(errors) or "no provider configured")


def chat_json(messages: list[dict[str, Any]], usage: Usage, *, fast: bool = False) -> dict[str, Any]:
    msg = chat(messages, usage, fast=fast, json_mode=True, temperature=0)
    content = msg.get("content") or "{}"
    try:
        return dict(json.loads(content))
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start >= 0 and end > start:
            try:
                return dict(json.loads(content[start : end + 1]))
            except json.JSONDecodeError:
                pass
        return {}


class Timer:
    def __enter__(self) -> "Timer":
        self.t0 = time.perf_counter()
        return self

    def __exit__(self, *_: object) -> None:
        self.ms = int((time.perf_counter() - self.t0) * 1000)
