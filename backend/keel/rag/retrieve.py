from dataclasses import asdict, dataclass

from sqlalchemy import text

from keel.config import settings
from keel.db import session
from keel.rag.models import embed_query, rerank

RRF_K = 60


@dataclass
class Hit:
    chunk_id: int
    doc_id: int
    doc_title: str
    doc_type: str
    url: str | None
    section: str | None
    page: int | None
    text: str
    keyword_rank: int | None = None
    vector_rank: int | None = None
    rrf: float = 0.0
    score: float = 0.0

    def label(self) -> str:
        parts = [self.doc_title]
        if self.section:
            parts.append(self.section.split(" ", 1)[0] if self.section.startswith("§") else f"“{self.section}”")
        if self.page:
            parts.append(f"p.{self.page}")
        return " ".join(parts[:1]) + (", " + ", ".join(parts[1:]) if len(parts) > 1 else "")

    def public(self, n: int) -> dict:
        d = asdict(self)
        d.update({"n": n, "label": self.label(), "title": self.doc_title, "text": self.text[:500]})
        return d


COLS = "c.id, d.id, d.title, d.type, d.url, c.section, c.page, c.text"


def _row(r) -> Hit:
    return Hit(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7])


def keyword_search(q: str, limit: int = 30) -> list[Hit]:
    sql = text(
        f"SELECT {COLS} FROM chunks c JOIN docs d ON d.id=c.doc_id, "
        "CAST(replace(CAST(plainto_tsquery('english', :q) AS text), '&', '|') AS tsquery) AS query "
        "WHERE numnode(query) > 0 AND c.tsv @@ query "
        "ORDER BY ts_rank_cd(c.tsv, query, 32) DESC LIMIT :n"
    )
    with session() as s:
        return [_row(r) for r in s.execute(sql, {"q": q, "n": limit})]


def vector_search(q: str, limit: int = 30) -> list[Hit]:
    vec = embed_query(q)
    sql = text(
        f"SELECT {COLS} FROM chunks c JOIN docs d ON d.id=c.doc_id "
        "ORDER BY c.embedding <=> CAST(:v AS vector) LIMIT :n"
    )
    with session() as s:
        return [_row(r) for r in s.execute(sql, {"v": str(vec), "n": limit})]


def hybrid_search(q: str, k: int | None = None, candidates: int = 15) -> dict:
    k = k or settings().rag_top_k
    kw = keyword_search(q)
    vec = vector_search(q)
    fused: dict[int, Hit] = {}
    for rank, h in enumerate(kw):
        h.keyword_rank = rank + 1
        fused[h.chunk_id] = h
        h.rrf += 1 / (RRF_K + rank + 1)
    for rank, h in enumerate(vec):
        cur = fused.setdefault(h.chunk_id, h)
        cur.vector_rank = rank + 1
        cur.rrf += 1 / (RRF_K + rank + 1)
    pool = sorted(fused.values(), key=lambda h: -h.rrf)[:candidates]
    scores = rerank(q, [f"{h.doc_title}. {h.section or ''}. {h.text}" for h in pool])
    for h, sc in zip(pool, scores, strict=True):
        h.score = round(sc, 4)
    ranked = sorted(pool, key=lambda h: -h.score)
    return {
        "query": q,
        "keyword": [h.public(i + 1) for i, h in enumerate(kw[:5])],
        "vector": [h.public(i + 1) for i, h in enumerate(vec[:5])],
        "hits": ranked[:k],
    }
