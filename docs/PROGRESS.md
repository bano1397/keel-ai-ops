# Progress log (resume point)

## Done
- Fine-tune data (`finetune/build_dataset.py`, 2,205/244/232 rows) + Colab notebook `finetune/keel_router_finetune.ipynb`. **Waiting on the user to run it on Colab.**
- Corpus: 10 PDFs, 13 crawled help pages (served at `/help`), 168-product CSV → 24 docs, 308 chunks. Seed: 40 customers, 120 orders. 100-case `evals/dataset.jsonl`.
- Backend (`backend/keel`): Postgres+pgvector, hybrid RAG (FTS + vector → RRF → cross-encoder) with citations, groundedness filter and "I don't know"; LangGraph router → support/orders/escalation with Postgres checkpointer; validated tools with ownership, £50 auto limit, idempotency; inbox/outbox queue with backoff + dead letter; Slack/email/Telegram; daily report via APScheduler; JWT roles; full API per `docs/CONTRACT.md`.
- Frontend (`frontend/`): Next.js 15 dashboard, all pages, public `/chat`, `widget.js`, Playwright specs; connected to the real API and checked in the browser.
- Evals: `python -m evals.run` on an isolated `keel_eval` DB; offline baseline recorded (rules only, no LLM).

## Local run
- DB: `docker start keel-pg` (pgvector on :5433)
- API: launch config `keel-api` (:8100) · Web: `keel-web-live` (:3300)

## Next
1. LLM keys in `.env` → run evals with Groq; tune.
2. Docker for the API, docker-compose, Makefile, pytest suite, CI, pre-commit secret scan.
3. n8n workflow JSON; GGUF router integration once the Colab run finishes.
4. Deploy (Oracle VM + Neon + Vercel), README, WRITEUP, DEMO_SCRIPT, video.

## Open questions for the user
- Git author email for bano1397 (needed before the first commit).
