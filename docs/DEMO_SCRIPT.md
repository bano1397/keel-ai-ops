# Demo video script — "Keel: the AI operations desk" (3:30)

Format: 1920×1080, screen captures of the real product (no mock data), voice-over, subtle music. Captures come from the live deployment. Optional polish: assemble with the `video-shotcraft` / Remotion skill from the same captures.

| # | Time | Shot (what's on screen) | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:15 | Black → product logo "Keel". Cut to a busy inbox of a UK shop: emails, Telegram pings, chat bubbles stacking up. | "A UK online shop gets hundreds of messages a day. Where's my order. Can I get a refund. And sometimes — I'm calling my solicitor." |
| 2 | 0:15–0:30 | Architecture diagram animates left→right: channels → queue → router → three agents → dashboard. | "Keel is one AI system that runs customer operations on its own: it answers, it acts, it learns from corrections, and it reports to management." |
| 3 | 0:30–0:55 | Public chat widget: "Do you deliver to Jersey?" — tokens stream, source chips appear `[Delivery & Shipping Policy §…]`. Then "Who is your CEO?" → honest "I don't know". | "Policy questions go to the Support agent. It searches 24 documents — PDFs, our crawled help centre and a 168-product catalogue — with hybrid keyword and vector search and a reranker. Every answer is cited. And when the answer isn't in the documents, it says so." |
| 4 | 0:55–1:25 | Telegram on a phone: "Refund HF-xxxxxx, it arrived broken" (≤£50) → instant refund. Then a £600 refund on web chat → "pending approval". Cut to dashboard Approvals → Approve → customer gets the message. | "Order questions go to the Orders agent, which calls real database tools. Refunds up to fifty pounds go straight through; anything bigger waits for a human. Every write is ownership-checked and idempotent, so a retry can never refund twice." |
| 5 | 1:25–1:45 | Email client: angry email with "chargeback". Slack channel lights up with the escalation summary. Dashboard Escalations shows the ticket. | "Angry or high-risk customers — legal threats, chargebacks, safety issues — go straight to a human, with a summary so nobody repeats themselves, and a Slack alert." |
| 6 | 1:45–2:05 | Conversation detail → Agent trace timeline: router label + confidence + model, tool calls with arguments and results, sources with rerank scores, tokens, cost, latency. | "Every reply has a full trace: which agent, which tools, why, and what it cost." |
| 7 | 2:05–2:30 | Reviewer edits a reply → Feedback page shows it → "Propose rules" → activate v2 → same-style question now answered correctly. Eval chart ticks up (before/after numbers from the write-up). | "When a human edits or rejects a reply, Keel learns: similar corrections become examples, rejections become prompt rules an admin approves, and everything exports as a training set." |
| 8 | 2:30–2:50 | Fine-tune results table: base vs fine-tuned vs gpt-oss-120b (accuracy, macro-F1, latency, cost per 1,000). | "The Router is a Qwen 1.5-billion fine-tuned on support intents. It's [X] points more accurate than the base model, runs on a CPU, and costs [Y] per thousand messages, against [Z] for a 120-billion API model." |
| 9 | 2:50–3:10 | Terminal: `make eval` → 100 cases scrolling → score + per-category table. Analytics page: auto-resolution, response time, cost per conversation. Daily report email in inbox. | "One command runs a hundred test cases. Analytics track auto-resolution, response time and cost, and management gets a report every morning." |
| 10 | 3:10–3:30 | Logo + "Live demo · GitHub · built in one day on free tiers" + name "Shehar Bano". | "Keel. Built by Shehar Bano for Cadral AI." |

Numbers in brackets are filled from `finetune/RESULTS.md` and `evals/reports/` after the real runs — never estimated.

## Capture checklist
- [ ] Reset demo DB (`make seed` on a fresh DB) so ids are clean
- [ ] Browser at 1440×900, light theme, zoom 110%
- [ ] Telegram desktop/phone mirror with the bot
- [ ] Slack channel open
- [ ] Email client with the report
- [ ] Terminal with large font for `make eval`
