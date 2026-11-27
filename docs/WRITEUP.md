# Keel: write-up

*Shehar Bano · Cadral AI test task (AI Engineer & Automation Expert) · 27 Nov 2026*

## 1. Architecture

Every inbound message (web chat, Telegram, email, or n8n) is **stored first** in an `inbox` table (de-duplicated on the channel's message id). A worker claims it with `SELECT … FOR UPDATE SKIP LOCKED` and runs a **LangGraph** graph with a Postgres checkpointer per conversation.

- **Router.** Deterministic risk rules run first: legal, chargeback, safety, prompt-injection, vulnerability, "speak to a human" and strong anger. Then the **fine-tuned Qwen2.5-1.5B** classifier (10 intents) runs on CPU via llama.cpp. If its confidence is below 0.6, gpt-oss-20b on Groq decides. The router also reads the customer profile, so a repeat complainant who is angry is escalated.
- **Support agent.** Retrieval combines Postgres full-text search and pgvector (bge-small), fused with Reciprocal Rank Fusion. A MiniLM cross-encoder then reranks the top 15. The LLM must return sentences that each cite source numbers. A **groundedness filter** drops any sentence whose numbers or content words don't appear in its cited chunk. If nothing grounded remains, the agent says "I don't know" and offers a human.
- **Orders agent.** A tool-calling loop over 6 Pydantic-validated SQL functions. Safety lives in code, not the prompt:
  - Ownership is checked on every call.
  - Write tools are only *exposed* when the customer's own message asks for that action.
  - Refunds ≤ £50 are issued; larger ones become `pending_approval` plus an approval ticket.
  - An idempotency key per (conversation, order, amount) prevents double refunds on retries.
- **Escalation agent.** Writes a structured hand-off (issue, ask, actions taken, recommended next step, sentiment), creates a ticket and queues a Slack alert.
- **Delivery.** Replies, Slack alerts and report emails go through an `outbox` with exponential backoff and a dead-letter state, which has a retry button on the Ops page. LLM calls retry 429/5xx errors with `retry-after` and fall back Groq (gpt-oss-120b / 20b) → Gemini 3.8 Flash → deterministic rules, so a customer always gets an answer or an honest hand-off.
- **Observability.** Every reply stores a trace: router decision and confidence, each step with arguments, result and reason, sources with rerank scores, tokens, $ cost and latency.

## 2. Key trade-offs

| Decision | Why | Cost |
|---|---|---|
| One Postgres for data, vectors, FTS, queue and checkpoints | One free service to run; transactional queue; simpler deploy | Brute-force scale limits (see §6) |
| Queue in Postgres, not Redis/Celery | Nothing extra to host; `SKIP LOCKED` is enough at this volume | Polling latency ~1 s |
| Safety rules in code before any model | Legal/safety escalation can't be argued away by a prompt | Keyword rules need maintenance; covered by tests |
| JSON-mode answers + post-hoc groundedness filter | Enforces citations per sentence | Real token streaming of support answers isn't possible; the UI streams the finished, verified answer and shows tool steps live |
| Fine-tuned 1.5B router on CPU | Cheap, private, fast enough for classification | Needs retraining when labels change; low-confidence cases still call an API model |
| Workflows in code, n8n JSON optional | Fewer moving parts for the live demo; fully tested | Ops teams can't edit flows visually unless they adopt the n8n versions |

## 3. Fine-tuning results

Task: 10-label intent and risk classification (the Router). Data: 2,205 train, 244 validation and 232 held-out test messages, from Bitext (CDLA-Sharing-1.0) mapped to our labels plus UK synthetic messages. The test templates are never seen in training; see `finetune/DATASET_CARD.md`. Training: QLoRA r=16, 2 epochs, **5.3 minutes on a free Colab T4**. Every row below is scored on the identical test file (SHA-256 `babd1576…`).

| Model | Accuracy | Macro-F1 | Route accuracy | Escalation recall | p50 | p95 | $ / 1k msgs |
|---|---|---|---|---|---|---|---|
| Qwen2.5-1.5B base, zero-shot | 66.8% | 60.8% | 83.6% | 85.0% | 126 ms | 174 ms | $0.0147 |
| Qwen2.5-1.5B base, 10-shot | 72.0% | 69.0% | 88.8% | 88.3% | 141 ms | 204 ms | $0.0145 |
| **Qwen2.5-1.5B + LoRA (ours)** | **96.6%** | **96.3%** | **99.6%** | **100%** | 259 ms | 357 ms | $0.026 |
| gpt-oss-120b (Groq API) | | | | | | | |

**When to use what**

| Use | When | In Keel |
|---|---|---|
| Fine-tuned small model | High-volume, narrow, stable task with a fixed label set; latency, cost or privacy matter; no fresh facts needed | Intent and risk routing |
| RAG | Facts that change and must be cited (policies, prices, stock); swap documents instead of retraining | Support agent |
| Large API model | Open-ended reasoning, multi-step tool use, summarising messy threads, rare or ambiguous cases | Orders tool loop, escalation summaries, router fallback when the small model is unsure |

## 4. Eval scores

`make eval`: 100 cases covering routing, tool calls and arguments, safety (forbidden actions), citations, refusals, escalation, content and LLM-as-judge groundedness. Each run uses a freshly seeded, isolated database.

| Run | Mode | Score | Routing | Tools | Safety | Citation | Refusal | Escalation | Groundedness |
|---|---|---|---|---|---|---|---|---|---|
| Offline rules only (no LLM) | rules | 70% | 97% | 93% | 100% | 70% | 79% | 100% | — |
| Groq gpt-oss, first run | local embeddings + cross-encoder | 90% | 96% | 93% | 100% | 86% | 96% | 100% | 100% |
| Groq gpt-oss, after routing fixes | local embeddings + cross-encoder | 95% | 97% | 97% | 100% | 93% | 98% | 100% | 98% |
| **Deployed config** (serverless, static embeddings, LLM rerank) | groq | **96%** | **100%** | **100%** | **100%** | **100%** | **100%** | **100%** | 95% |

All four runs use the same 100 cases on a freshly seeded database (`evals/reports/`). Between run 2 and run 3 I fixed real bugs the eval exposed:
- general refund and return questions were going to the Orders agent, which answered from memory instead of the policy documents;
- refunds over £50 were turned into tickets instead of calling the refund tool;
- a typographic-hyphen mismatch.

That tuning happened on the eval set itself, so I report every run rather than only the best. The 4 remaining failures are:
- 2 groundedness-judge disagreements;
- 1 missing keyword ("Australia");
- 1 wrong-owner case where the agent asks for an address instead of refusing outright. It still can't change the order, because ownership is enforced in the tool.

The *cited the exact expected document* rate is 95.3%. When it misses, another document states the same fact.

Prices for the costs below are from Groq's model pages (gpt-oss-120b $0.15/$0.60, gpt-oss-20b $0.075/$0.30 per million tokens). Small-model cost assumes a $0.35/h T4.

## 5. Cost per conversation

Measured over the 100-case eval in the deployed configuration: **74,421 tokens, $0.0125 in total, about $0.000125 per message** (about $0.13 per 1,000 messages) on Groq pricing. The free tier covers this at demo volume. Every live request stores tokens, cost and latency in `traces`, and the Analytics page charts them.

## 6. What breaks at scale, and how I'd fix it

1. **LLM rate limits.** Free-tier Groq is the first bottleneck. Fix: the fine-tuned router handles classification without API calls; add per-tenant token budgets, semantic caching of support answers keyed by retrieval set, and paid-tier keys with provider load-balancing.
2. **Queue backlog.** A single worker per process polling Postgres. Fix: horizontal workers (`SKIP LOCKED` already supports it), LISTEN/NOTIFY instead of polling, and a move to a broker (SQS/Redis Streams) past roughly 50 msg/s; alert on queue age, not just failures.
3. **Vector index size.** HNSW in Postgres is fine to a few million chunks. Fix: partition by tenant, keep FTS in Postgres, move vectors to a dedicated store (Qdrant) only when recall or latency requires it.
4. **Multi-tenancy.** Single tenant today. Fix: `tenant_id` on every table with row-level security, per-tenant corpora, prompts, limits and keys.
5. **Model drift.** Customer language and policies change. Fix: the feedback JSONL becomes a monthly retraining set; the eval suite gates every prompt or model version in CI; track router confidence and the share of LLM fallbacks as drift signals.
6. **Cost.** Long histories inflate tokens. Fix: summarise history beyond N turns into the checkpointer state; cap retrieved context; route easy FAQs to cached answers.
7. **Observability.** Traces live in Postgres. Fix: export OpenTelemetry spans to Langfuse or Grafana, add SLO alerts (p95 latency, escalation rate, dead letters), and sample traces for human QA.
8. **Safety of autonomous actions.** Fix: per-customer refund velocity limits, anomaly detection on refund totals, and a two-person rule above a second threshold. These are already enforced in the tool layer, which is where the rules belong.
