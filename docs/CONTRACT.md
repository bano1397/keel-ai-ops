# Keel — shared contract (backend ↔ frontend ↔ data)

## Repo layout
```
backend/        FastAPI app (Python 3.12), package `keel`
frontend/       Next.js 15 App Router + TS + Tailwind + shadcn/ui
corpus/         source docs: pdf/, site/ (static HTML help centre), products.csv
evals/          dataset.jsonl, run.py
finetune/       dataset builder, Colab notebook, compare.py, results
automation/n8n/ importable workflow JSON
docs/           REQUIREMENTS, WRITEUP, DEMO_SCRIPT, PROGRESS
```

## Shop facts (single source of truth — corpus, seed data and evals must agree)
- Shop: **Hearth & Field Ltd**, UK homeware retailer, warehouse in Leeds (Unit 4, Aire Valley Park, LS9 0PT). Company no. 14829301 (fictional). Support hours Mon–Fri 9:00–18:00, Sat 10:00–16:00. No phone line. Support email support@hearthandfield.co.uk.
- Order ids: `HF-` + 6 digits, e.g. `HF-204817`.
- Delivery: Standard £3.95, 3–5 working days, free over £50. Express next working day £6.95 if ordered before 14:00 Mon–Thu. Large furniture two-person delivery £29, 7–10 working days. UK mainland, NI, Isle of Man, Channel Islands; Highlands & islands +2 days. No international shipping. Carriers: Royal Mail, DPD, Evri.
- Returns: 30 days from delivery, unused and in original packaging, free returns label via Returns Portal. Refund to original payment method within 5 working days of the return reaching Leeds. Opened bedding/pillows/mattresses non-returnable unless faulty (hygiene). Final Sale items non-returnable unless faulty. Consumer Rights Act 2015: faulty goods can be rejected within 30 days for full refund; after that repair/replace.
- Refund automation: the AI may auto-issue refunds **≤ £50**; above £50 requires human approval.
- Warranty: furniture 2 years structural; electricals 1 year.
- Damaged on arrival: report within 48 h with photos; items under £40 replaced/refunded without return.
- Payments: Visa, Mastercard, Amex, PayPal, Apple Pay, Google Pay, Klarna (3 instalments, £30–£1,000). Prices include 20% VAT.
- Gift cards £10–£250, valid 24 months, not exchangeable for cash.
- Price promise: identical item cheaper at a UK retailer within 7 days → refund difference (not marketplaces/clearance).
- Loyalty "Hearth Rewards": 1 point per £1, 500 points = £5 voucher, points expire after 12 months inactive. VIP = spend over £1,000/yr: free express delivery.
- Discounts: students 10%, NHS 15%, not combinable, not on sale items. Trade accounts 15% off, 30-day invoice terms.
- Home assembly £45/item; missing fixings sent free within 3 working days. Mattress recycling £25 with new mattress delivery.
- Data: order records kept 6 years, support conversations 2 years; subject access requests answered within 1 month (UK GDPR).

## Database (Postgres + pgvector)
customers(id, name, email unique, telegram_chat_id, phone, tier[standard|vip], vulnerable bool, created_at)
products(sku pk, name, category, price_gbp numeric, stock int, description, url)
orders(id pk 'HF-xxxxxx', customer_id, status[processing|dispatched|in_transit|delivered|cancelled|refunded|partially_refunded], total_gbp, items jsonb, shipping_address, carrier, tracking, created_at, delivered_at, updated_at)
refunds(id, order_id, amount_gbp, reason, status[issued|pending_approval|rejected], idempotency_key unique, created_by, approved_by, created_at)
tickets(id, conversation_id, customer_id, kind[escalation|refund_approval|followup], risk, summary jsonb, status[open|resolved], created_at)
conversations(id, customer_id, channel[web|telegram|email], thread_id, status[open|escalated|resolved], created_at, updated_at)
messages(id, conversation_id, role[user|assistant|human_agent], content, agent, status[sent|pending_review|rejected|edited], confidence, trace_id, created_at)
traces(id, conversation_id, message_id, router jsonb{label,route,confidence,model,risk,reason}, steps jsonb[], sources jsonb[], model, tokens_in, tokens_out, cost_usd, latency_ms, error, created_at)
feedback(id, message_id, agent, customer_message, original_reply, corrected_reply, action[approve|edit|reject], reason, context jsonb, reviewer, embedding vector, created_at)
prompt_versions(id, agent, version, rules text, status[proposed|active|retired], created_by, created_at)
inbox(id, channel, external_id unique, sender, payload jsonb, status[pending|processing|done|retry|dead], attempts, next_attempt_at, last_error, created_at)
outbox(id, conversation_id, channel, recipient, body, status, attempts, next_attempt_at, last_error, idempotency_key unique)
eval_runs(id, score, breakdown jsonb, n_cases, mode, created_at)
users(id, email, password_hash, role[admin|agent], name)
docs(id, title, source, type[pdf|web|csv], url) / chunks(id, doc_id, section, page, text, embedding vector(384), tsv tsvector)

## API (all JSON; dashboard routes need `Authorization: Bearer <jwt>`)
POST /api/auth/login {email,password} → {token, user:{email,role,name}}
GET  /api/auth/me
POST /api/chat/stream {email, name?, message, conversation_id?} → SSE events:
  `router` {label, route, confidence, model} · `step` {type, agent, tool?, args?, result?, reason} ·
  `sources` [{n, title, section, page, url, score}] · `token` {t} · `done` {message_id, conversation_id, status, cost_usd, latency_ms}
GET  /api/conversations?status=&channel=   → [{id, customer:{name,email,tier}, channel, status, last_message, pending_count, updated_at}]
GET  /api/conversations/{id} → {conversation, customer_profile, messages:[...with trace], tickets}
GET  /api/live (SSE, token via ?token=) → events `message`, `conversation`, `ticket`
GET  /api/approvals → pending messages + pending refund approvals
POST /api/messages/{id}/review {action: approve|edit|reject, corrected?, reason?}
POST /api/refunds/{id}/decision {approve: bool}
GET  /api/tickets ; POST /api/tickets/{id}/resolve
GET  /api/customers ; GET /api/customers/{id}
GET  /api/analytics?days=30 → {kpis:{conversations, auto_resolution_pct, avg_response_ms, p95_response_ms, cost_per_conversation_usd, escalations, refunds_count, refunds_gbp, pending_reviews, dead_letters}, series:{daily:[{day,count,avg_ms,cost}], accuracy:[{day,human_approval_pct,eval_score}]}, routes:{}, channels:{}, top_issues:[{label,count}]}
GET  /api/kb/docs ; POST /api/kb/reindex (admin) ; GET /api/kb/search?q=
GET  /api/feedback ; GET /api/prompts ; POST /api/prompts/propose (admin) ; POST /api/prompts/{id}/activate (admin)
GET  /api/evals/runs ; POST /api/evals/run (admin, small subset)
GET  /api/ops/queue (admin) ; POST /api/ops/queue/{id}/retry (admin) ; POST /api/ops/report/send (admin)
GET  /api/settings (admin) ; GET /health
Webhooks: POST /webhooks/telegram/{secret} ; POST /webhooks/email (Resend inbound, signature verified) ; POST /webhooks/n8n (HMAC `X-Keel-Signature: t=<ts>,v1=<hex>`)
```
Demo users: admin@keel.demo / KeelAdmin!2026 (admin), agent@keel.demo / KeelAgent!2026 (agent).
