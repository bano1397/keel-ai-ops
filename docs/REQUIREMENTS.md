# Requirements checklist — Cadral AI "Autonomous AI Operations Agent"

Source of truth: `Cadral-AI-Engineer-Test-Task.pdf` (2 pages). One row per bullet. Status: ⬜ not started · 🟡 in progress · ✅ done with evidence.

## 1. Multi-agent system

| # | Requirement (PDF) | How we meet it | Where in code | How we prove it | Status |
|---|---|---|---|---|---|
| 1.1 | Router agent reads each incoming message and sends it to the right specialist | LangGraph router node: hard risk rules first, then fine-tuned classifier (intent + risk + confidence), LLM fallback when confidence is low | `backend/keel/router.py`, `agents.py` | Eval "routing accuracy"; trace shows router decision + confidence | ✅ tests `test_router_rules` |
| 1.2 | Support agent answers from company docs (RAG) | Support node calls hybrid retriever, answers only from cited chunks | `backend/keel/agents.py`, `backend/keel/rag/` | Eval "citation rate", "groundedness" | ✅ `test_answer_cites_sources` |
| 1.3 | Orders agent uses tools to check status, issue refunds, update DB records (real function calls) | LLM tool-calling loop over Pydantic-validated functions that run SQL: `get_order_status`, `list_customer_orders`, `issue_refund`, `update_shipping_address`, `cancel_order`, `create_ticket` | `backend/keel/tools.py` | Eval "tool-call correctness"; DB row before/after in demo; pytest | ✅ `test_tools.py`, `test_llm_tool_loop_executes_real_tool` |
| 1.4 | Escalation agent detects angry or high-risk customers, hands to a human with a summary | Risk signals (anger, legal, chargeback, safety, vulnerable, repeat complaints from history) → ticket + LLM summary + Slack alert | `backend/keel/agents.py` (escalation_node) | Eval "escalation recall"; Slack message screenshot | ✅ `test_escalation_creates_ticket_and_slack_alert` |
| 1.5 | Agents share memory of the conversation and the customer's history | LangGraph state + Postgres checkpointer per thread; customer profile (orders, refunds, tickets, sentiment trend) loaded into state; one profile across channels | `backend/keel/memory.py`, `pipeline.py` | Test: same customer on email then Telegram sees history; trace shows profile | ✅ `test_shared_memory_across_turns` |

## 2. Advanced RAG

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 2.1 | ≥20 documents: PDF, web pages, CSV of products | 25+ docs: ~10 PDFs, ~12 HTML pages crawled from our hosted static site, products CSV (150+ rows) | `corpus/`, `backend/keel/rag/ingest.py` | Knowledge-base page lists docs by type; ingest log | ✅ 24 docs / 308 chunks |
| 2.2 | Hybrid search (keyword + vector) with reranking | pgvector (bge-small via fastembed) + Postgres full-text, fused with RRF, cross-encoder rerank | `backend/keel/rag/retrieve.py` | Trace shows keyword hits, vector hits, fused, reranked scores; unit test | ✅ `test_hybrid_uses_keyword_vector_and_rerank` |
| 2.3 | Citations in every answer | Section-level chunk metadata → `[Returns Policy §3, p.2]` | `backend/keel/rag/answer.py` | Eval "citation rate" = % of answerable replies with valid citations | ✅ eval citation check |
| 2.4 | Says "I don't know" instead of making things up | Rerank threshold + groundedness check (each sentence maps to a cited chunk) → honest refusal + offer escalation | `backend/keel/rag/answer.py` | Eval "refusal correctness" on unanswerable + prompt-injection cases | ✅ `test_idk_when_llm_says_unanswerable`, `test_ungrounded_llm_sentences_are_dropped` |

## 3. Model fine-tuning

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 3.1 | Fine-tune a small open-source model (1B–3B) for classification or reply tone | Qwen2.5-1.5B-Instruct (or Llama-3.2-1B), Unsloth QLoRA on Colab T4, intent + risk labels | `finetune/keel_router_finetune.ipynb`, `finetune/build_dataset.py` | Notebook with saved outputs; HF Hub model link | 🟡 notebook ready; Colab run pending |
| 3.2 | Compare with base model on a test set: accuracy, latency, cost | Same held-out test set: base zero/few-shot vs fine-tuned vs Groq 70B; accuracy, macro-F1, confusion matrix, p50/p95, $/1k msgs | notebook comparison cells → `finetune/RESULTS.md` | Results table from a real run | 🟡 pending Colab run |
| 3.3 | Explain when to use fine-tuned vs RAG vs large API model | Decision table in write-up | `docs/WRITEUP.md` | Document | ✅ WRITEUP §3 |

## 4. Self-improving loop

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 4.1 | Human edit/reject on dashboard saved as feedback | `feedback` table: original, corrected, reason, agent, retrieved context | `backend/keel/feedback.py`, `frontend/src/app/(app)/approvals` | Playwright test; DB row | ✅ `test_review_edit_feeds_back_into_answers`, Playwright |
| 4.2 | Feedback improves future answers (prompt updates, examples or re-training dataset) | (a) similar corrections retrieved as few-shot, (b) LLM-proposed rule updates approved by admin → versioned prompts, (c) JSONL export for re-training | `backend/keel/feedback.py`, `/feedback` page | Eval score before vs after a feedback batch, in write-up | 🟡 mechanism done; before/after eval numbers pending LLM key |

## 5. Automation

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 5.1 | Messages from ≥2 channels (email + web chat or Telegram) | Web chat widget (SSE), Telegram webhook, email (inbound webhook or IMAP) — 3 channels | `backend/keel/main.py` (chat stream, `/webhooks/telegram`, `/webhooks/email`) | Demo video; inbox shows channel per conversation | 🟡 web ✅; Telegram/email code + tests ✅, live tokens pending |
| 5.2 | Daily scheduled job emails a management report (volume, top issues, refunds, AI accuracy) | Scheduler → HTML email (+ n8n workflow alternative) | `backend/keel/reports.py`, `automation/n8n/daily-report.json` | Received email screenshot; job log | 🟡 code + test ✅; live email pending |
| 5.3 | Slack alerts for escalations and system errors | Incoming webhook, de-duplicated + rate-limited | `backend/keel/notify.py` | Slack screenshot | 🟡 code ✅; live webhook pending |
| 5.4 | Retries and error handling: nothing lost if an API fails | Inbox/outbox tables, store-first, worker with exponential backoff, dead-letter queue with retry button; idempotency keys on writes | `backend/keel/queue.py`, `llm.py`, `tools.py` | Test that kills the LLM mid-run and shows the message delivered after retry | ✅ `test_inbound_message_survives_failures_then_dead_letters`, `test_outbox_retries_then_succeeds`, `test_llm_outage_falls_back…` |

## 6. Full-stack dashboard

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 6.1 | Login with roles (admin, agent) | JWT, roles enforced on backend routes | `backend/keel/auth.py`, `frontend/src/app/login` | API test: agent gets 403 on admin routes | ✅ `test_auth_and_roles`, Playwright RBAC |
| 6.2 | Live conversation view with streaming responses | SSE from backend; live inbox + streaming reply | `frontend/src/app/(app)/inbox`, `/api/live` | Video; Playwright | ✅ Playwright public chat, `test_chat_streams_events` |
| 6.3 | Agent trace: which agent, which tools, why | Timeline: router decision + confidence, agent, tool calls (args, result, reason), sources + scores, tokens, cost, latency | `frontend/src/components/trace/` | Screenshot | ✅ Playwright review flow |
| 6.4 | Approve / edit / reject replies | Approval queue | `frontend/src/app/(app)/approvals` | Playwright | ✅ Playwright |
| 6.5 | Analytics: auto-resolution %, response time, cost per conversation, accuracy over time | Charts from traces + feedback + eval history | `frontend/src/app/(app)/analytics`, `backend/keel/reports.py` | Screenshot | ✅ analytics page |

## 7. Evals & monitoring

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 7.1 | Automated test set ≥50 messages with expected outcomes | 100 cases: route, tool + args, must-cite doc, must-IDK, must-escalate, forbidden actions, prompt-injection | `evals/dataset.jsonl` | File | ✅ 100 cases |
| 7.2 | One command runs evals and outputs a score | `make eval` → total + per-category, markdown + JSON report, history to dashboard; CI subset | `evals/run.py`, `.github/workflows/ci.yml` | Terminal output in write-up; CI badge | ✅ `make eval` (offline 70%; LLM run pending) |
| 7.3 | Track token cost and latency per request | Per-request row in `traces` (tokens in/out, cost, latency, model) | `backend/keel/pipeline.py`, `llm.py` (Usage) | Analytics page; trace view | ✅ traces table |

## 8. Deployment

| # | Requirement | How | Where | Proof | Status |
|---|---|---|---|---|---|
| 8.1 | Deployed live, Dockerised | Dockerfiles + docker-compose; backend on Docker host, frontend on Vercel, Postgres+pgvector managed | `Dockerfile`s, `docker-compose.yml` | Live URL; `/health` | 🟡 Dockerfiles + compose ✅; live deploy pending |
| 8.2 | Secrets in environment variables, none in code | `.env.example`, pre-commit secret scan | `.env.example`, `.pre-commit-config.yaml` | Scan passes in CI | ✅ `.env.example`, gitleaks CI + pre-commit |

## Rules & deliverables

| # | Item | How | Proof | Status |
|---|---|---|---|---|
| R.1 | Any stack and tools, free tiers only | Every service on a free plan (see hosting plan) | Hosting table in README | ⬜ |
| R.2 | Clean GitHub repo with README, architecture diagram, setup steps | README with Mermaid diagram, ≤5-command setup | Repo | ⬜ |
| D.1 | GitHub repo | github.com/bano1397/… | Link | ⬜ |
| D.2 | Live demo link | Public chat + dashboard with demo logins | Link | ⬜ |
| D.3 | 3–4 min demo video, product-launch polish | `docs/DEMO_SCRIPT.md` + recorded captures + edit | Link | ⬜ |
| D.4 | Short write-up: architecture, trade-offs, fine-tuning results, eval scores, what breaks at scale and fixes | `docs/WRITEUP.md` | File | ⬜ |
