from keel import llm
from keel.rag.answer import IDK, answer, grounded
from keel.rag.retrieve import hybrid_search, keyword_search, vector_search


def test_corpus_has_all_document_types():
    from keel.db import Doc, session
    from sqlalchemy import func, select

    with session() as db:
        types = dict(db.execute(select(Doc.type, func.count()).group_by(Doc.type)).all())
    assert sum(types.values()) >= 20 and set(types) == {"pdf", "web", "csv"}


def test_hybrid_uses_keyword_vector_and_rerank():
    r = hybrid_search("How much is standard delivery?")
    assert keyword_search("standard delivery") and vector_search("standard delivery")
    assert "Delivery & Shipping Policy" in [h.doc_title for h in r["hits"]]
    assert r["hits"] == sorted(r["hits"], key=lambda h: -h.score)


def test_answer_cites_sources():
    a = answer("How much is standard delivery?", "", llm.Usage())
    assert a.grounded and "[1]" in a.text and "3.95" in a.text
    assert {s["title"] for s in a.sources} & {"Delivery & Shipping Policy", "Frequently Asked Questions"}


def test_groundedness_rejects_invented_numbers():
    src = ["Standard delivery costs £3.95 and takes 3 to 5 working days."]
    assert grounded("Standard delivery costs £3.95.", src)
    assert not grounded("Standard delivery costs £9.99.", src)


def test_idk_when_llm_says_unanswerable(monkeypatch):
    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: {"answerable": False, "sentences": []})
    assert answer("Who is your CEO?", "", llm.Usage()).text == IDK


def test_ungrounded_llm_sentences_are_dropped(monkeypatch):
    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(
        llm,
        "chat_json",
        lambda *a, **k: {
            "answerable": True,
            "sentences": [
                {"text": "Standard delivery costs £3.95.", "sources": [1]},
                {"text": "We also deliver to the moon for £1,000,000.", "sources": [1]},
            ],
        },
    )
    a = answer("How much is standard delivery?", "", llm.Usage())
    assert "moon" not in a.text and a.dropped
