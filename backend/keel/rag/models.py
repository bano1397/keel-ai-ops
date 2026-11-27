import math
import threading
from functools import lru_cache
from typing import Any

from keel.config import settings

_lock = threading.Lock()


@lru_cache
def _embedder() -> Any:
    from fastembed import TextEmbedding

    return TextEmbedding(settings().embed_model)


@lru_cache
def _reranker() -> Any:
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(settings().rerank_model)


def embed_passages(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    with _lock:
        return [v.tolist() for v in _embedder().passage_embed(texts)]


def embed_query(text: str) -> list[float]:
    with _lock:
        return list(_embedder().query_embed(text))[0].tolist()


def rerank(query: str, docs: list[str]) -> list[float]:
    if not docs:
        return []
    with _lock:
        logits = list(_reranker().rerank(query, docs))
    return [1 / (1 + math.exp(-x)) for x in logits]


def warm() -> None:
    embed_query("warm up")
    rerank("warm up", ["warm up"])
