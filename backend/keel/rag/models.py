import json
import logging
import math
import threading
import time
from functools import lru_cache
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from keel.config import settings

log = logging.getLogger("keel.models")
_lock = threading.Lock()
GEMINI_EMBED = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents"


@lru_cache
def _embedder() -> Any:
    from fastembed import TextEmbedding

    return TextEmbedding(settings().embed_model)


STATIC_MODEL_DIR = __import__("pathlib").Path(__file__).resolve().parent.parent / "assets" / "potion-base-8M"


@lru_cache
def _static() -> Any:
    from model2vec import StaticModel

    return StaticModel.from_pretrained(str(STATIC_MODEL_DIR))


@lru_cache
def _reranker() -> Any:
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(settings().rerank_model)


def _normalise(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


@retry(stop=stop_after_attempt(8), wait=wait_exponential(min=5, max=60), reraise=True)
def _gemini(texts: list[str], task: str) -> list[list[float]]:
    s = settings()
    r = httpx.post(
        GEMINI_EMBED,
        params={"key": s.gemini_api_key},
        timeout=30,
        json={
            "requests": [
                {
                    "model": "models/gemini-embedding-001",
                    "content": {"parts": [{"text": t[:6000]}]},
                    "taskType": task,
                    "outputDimensionality": s.embed_dim,
                }
                for t in texts
            ]
        },
    )
    r.raise_for_status()
    return [_normalise(e["values"]) for e in r.json()["embeddings"]]


def embed_passages(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if settings().embed_provider == "static":
        return [_normalise(v.tolist()) for v in _static().encode(texts)]
    if settings().embed_provider == "gemini":
        out: list[list[float]] = []
        for i in range(0, len(texts), 20):
            out += _gemini(texts[i : i + 20], "RETRIEVAL_DOCUMENT")
            if i + 20 < len(texts):
                time.sleep(4)
        return out
    with _lock:
        return [v.tolist() for v in _embedder().passage_embed(texts)]


@lru_cache(maxsize=512)
def _query_cached(text: str) -> tuple[float, ...]:
    if settings().embed_provider == "static":
        return tuple(_normalise(_static().encode([text])[0].tolist()))
    if settings().embed_provider == "gemini":
        return tuple(_gemini([text], "RETRIEVAL_QUERY")[0])
    with _lock:
        return tuple(list(_embedder().query_embed(text))[0].tolist())


def embed_query(text: str) -> list[float]:
    return list(_query_cached(text))


def _llm_rerank(query: str, docs: list[str]) -> list[float] | None:
    from keel import llm

    if not llm.available():
        return None
    listing = "\n".join(f"[{i}] {d[:350]}" for i, d in enumerate(docs))
    try:
        out = llm.chat_json(
            [
                {
                    "role": "system",
                    "content": "You are a search reranker. For each passage, score from 0 to 1 how directly it answers "
                    'the question. Return JSON {"scores": [numbers, one per passage, same order]}.',
                },
                {"role": "user", "content": f"Question: {query}\n\nPassages:\n{listing}"},
            ],
            llm.Usage(),
            fast=True,
        )
        scores = [float(x) for x in out.get("scores", [])]
        return scores if len(scores) == len(docs) else None
    except (llm.LLMUnavailable, ValueError, TypeError, json.JSONDecodeError) as e:
        log.warning("llm rerank failed: %r", e)
        return None


def rerank(query: str, docs: list[str]) -> list[float]:
    if not docs:
        return []
    provider = settings().rerank_provider
    if provider == "llm":
        scores = _llm_rerank(query, docs)
        if scores is not None:
            return scores
        return [round(1 - i / (len(docs) + 1), 4) for i in range(len(docs))]
    with _lock:
        logits = list(_reranker().rerank(query, docs))
    return [1 / (1 + math.exp(-x)) for x in logits]


def warm() -> None:
    if settings().embed_provider == "local":
        embed_query("warm up")
    if settings().rerank_provider == "local":
        rerank("warm up", ["warm up"])
