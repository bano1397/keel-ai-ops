import csv
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from sqlalchemy import delete, text

from keel.config import settings
from keel.db import Chunk, Doc, session
from keel.rag.models import embed_passages

log = logging.getLogger("keel.ingest")

SECTION_RE = re.compile(r"^(\d{1,2})\.\s+([A-Z][^\n]{2,80})$", re.M)
HEADER_RE = re.compile(r"^Hearth & Field Ltd \|.*$|^Page \d+$", re.M)


@dataclass
class Piece:
    section: str | None
    page: int | None
    text: str


def split_words(text: str, size: int = 160, overlap: int = 30) -> list[str]:
    words = text.split()
    if len(words) <= size:
        return [" ".join(words)] if words else []
    out, i = [], 0
    while i < len(words):
        out.append(" ".join(words[i : i + size]))
        i += size - overlap
    return out


def load_pdf(path: Path) -> tuple[str, list[Piece]]:
    reader = PdfReader(str(path))
    pages = [HEADER_RE.sub("", p.extract_text() or "") for p in reader.pages]
    meta_title = reader.metadata.title if reader.metadata else None
    title: str = str(meta_title) if meta_title else path.stem
    pieces: list[Piece] = []
    current: tuple[str | None, int | None] = (None, None)
    buf: list[str] = []

    def flush() -> None:
        body = " ".join(" ".join(buf).split())
        for part in split_words(body):
            pieces.append(Piece(current[0], current[1], part))
        buf.clear()

    for pno, page_text in enumerate(pages, start=1):
        for line in page_text.splitlines():
            m = SECTION_RE.match(line.strip())
            if m:
                flush()
                current = (f"§{m.group(1)} {m.group(2).strip()}", pno)
                buf.append(m.group(2).strip() + ".")
            elif line.strip():
                if current[1] is None:
                    current = (None, pno)
                buf.append(line.strip())
    flush()
    return title, pieces


def crawl_site(start: str, fetch: Callable[[str], str], limit: int = 60) -> list[tuple[str, str]]:
    seen: set[str] = set()
    queue = [start]
    pages = []
    base = urlparse(start)
    while queue and len(seen) < limit:
        url = queue.pop(0).split("#")[0]
        if url in seen:
            continue
        seen.add(url)
        try:
            html = fetch(url)
        except Exception as e:
            log.warning("crawl failed %s: %r", url, e)
            continue
        pages.append((url, html))
        for a in BeautifulSoup(html, "html.parser").select("a[href]"):
            nxt = urljoin(url, str(a["href"]))
            p = urlparse(nxt)
            if p.scheme == base.scheme and p.netloc == base.netloc and p.path.endswith(".html") and nxt not in seen:
                queue.append(nxt)
    return pages


def parse_html(html: str) -> tuple[str, list[Piece]]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.select("nav, footer, script, style, header"):
        tag.decompose()
    title_tag = soup.find("h1") or soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else "Untitled"
    pieces: list[Piece] = []
    section = None
    buf: list[str] = []
    main = soup.find("main") or soup.body or soup

    def flush() -> None:
        body = " ".join(" ".join(buf).split())
        for part in split_words(body):
            pieces.append(Piece(section, None, part))
        buf.clear()

    for el in main.find_all(["h2", "h3", "p", "li", "td", "dt", "dd"]):
        t = el.get_text(" ", strip=True)
        if not t:
            continue
        if el.name in ("h2", "h3"):
            flush()
            section = t
            buf.append(t + ".")
        elif el.find_parent(["li", "td", "dd"]) is None or el.name in ("li", "td", "dd"):
            buf.append(t)
    flush()
    return title, pieces


def local_fetcher(site_dir: Path) -> Callable[[str], str]:
    def fetch(url: str) -> str:
        return (site_dir / urlparse(url).path.lstrip("/").removeprefix("help/")).read_text()

    return fetch


def http_fetch(url: str) -> str:
    r = httpx.get(url, timeout=20, follow_redirects=True)
    r.raise_for_status()
    return r.text


def load_products(path: Path) -> list[Piece]:
    out = []
    with open(path) as f:
        for r in csv.DictReader(f):
            stock = "in stock" if int(r["stock"]) > 0 else "currently out of stock"
            out.append(
                Piece(
                    r["name"],
                    None,
                    f"{r['name']} (SKU {r['sku']}), {r['category']}, £{float(r['price_gbp']):.2f}, {stock} "
                    f"({r['stock']} units). {r['description']}",
                )
            )
    return out


def ingest() -> dict[str, int]:
    s = settings()
    corpus = s.corpus_dir
    manifest = {m["path"]: m for m in json.loads((corpus / "MANIFEST.json").read_text())}
    docs: list[tuple[str, str, str, str | None, list[Piece]]] = []

    for pdf in sorted((corpus / "pdf").glob("*.pdf")):
        title, pieces = load_pdf(pdf)
        meta = manifest.get(f"pdf/{pdf.name}") or manifest.get(f"corpus/pdf/{pdf.name}") or {}
        docs.append((meta.get("title", title), f"pdf/{pdf.name}", "pdf", f"/docs/{pdf.name}", pieces))

    start = s.help_site_url.rstrip("/") + "/index.html" if s.help_site_url else "http://local/help/index.html"
    fetch = http_fetch if s.help_site_url else local_fetcher(corpus / "site")
    for url, html in crawl_site(start, fetch):
        title, pieces = parse_html(html)
        path = urlparse(url).path.split("/")[-1]
        docs.append((title, f"site/{path}", "web", f"/help/{path}", pieces))

    docs.append(("Product Catalogue", "products.csv", "csv", "/products", load_products(corpus / "products.csv")))

    n_chunks = 0
    with session() as db:
        db.execute(delete(Chunk))
        db.execute(delete(Doc))
        db.flush()
        for doc_title, source, kind, doc_url, pieces in docs:
            doc = Doc(title=doc_title, source=source, type=kind, url=doc_url)
            db.add(doc)
            db.flush()
            texts = [f"{doc_title}. {p.section or ''}. {p.text}" for p in pieces]
            vectors = embed_passages(texts)
            for p, v in zip(pieces, vectors, strict=True):
                db.add(Chunk(doc_id=doc.id, section=p.section, page=p.page, text=p.text, embedding=v))
                n_chunks += 1
        db.flush()
        db.execute(
            text(
                "UPDATE chunks c SET tsv = setweight(to_tsvector('english', coalesce(d.title,'')), 'A') || "
                "setweight(to_tsvector('english', coalesce(c.section,'')), 'B') || "
                "setweight(to_tsvector('english', c.text), 'C') FROM docs d WHERE d.id = c.doc_id"
            )
        )
    counts = {"docs": len(docs), "chunks": n_chunks}
    log.info("ingested %s", counts)
    return counts
