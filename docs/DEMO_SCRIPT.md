# Keel — demo video script (3 min 45 s)

**Format:** 1920×1080 screen recording (Cmd + Shift + 5 → Record Entire Screen), voice-over, soft background music at low volume.
**Style:** calm, confident, product-launch pace. Short sentences. Pause half a second after each scene.
**Before recording:**
- Close every Chrome tab except two:
  - **Tab A:** https://keel-ai-ops-x92d.vercel.app/chat
  - **Tab B:** https://keel-ai-ops-x92d.vercel.app/login
- Zoom 110 % (Cmd +). Turn on Do Not Disturb.
- Do one full practice run. Practice messages also warm up the server, so the real take is fast.
- Every message below uses a fresh order, so each one works once. If you need a second take of the refund scenes, ask Claude for fresh order numbers.

**Every number in this script is real:** it comes from the repo (`evals/reports/`, `finetune/results_colab.json`). Don't round them up.

---

## SCENE 1 — The hook (0:00 – 0:15)

**SHOW:** Tab B, the Keel login page, still. Slowly move the mouse to the Keel logo.

**SAY:**
> "A UK online shop gets hundreds of messages every day. *Where's my order?* *Can I get a refund?* And sometimes — *I'm calling my solicitor.*
> This is **Keel**: one AI system that runs customer operations on its own."

---

## SCENE 2 — How it works (0:15 – 0:35)

**SHOW:** The GitHub README on github.com/bano1397/keel-ai-ops, scrolled to the **Architecture** diagram. Move the cursor slowly from left to right along it.

**SAY:**
> "Every incoming message is stored first and retried if anything fails, so nothing is ever lost.
> A **Router** reads it and picks a specialist: a **Support** agent for questions, an **Orders** agent that takes real actions, and an **Escalation** agent for anyone angry or at risk.
> All three share the conversation and the customer's full history."

---

## SCENE 3 — Answers with proof (0:35 – 1:05)

**SHOW:** Tab A (chat). Email: `ella.davies@example.co.uk` → **Start chatting**.
1. Type: **Do you deliver to Jersey?** → Enter. Let the answer stream. Hover over the **source chips** under the answer.
2. Type: **How long do refunds take after I return something?** → Enter.

**SAY (while it streams):**
> "The Support agent searches twenty-four company documents — PDF policies, a crawled help-centre website and a catalogue of 168 products.
> It combines keyword search with vector search, re-ranks the results, and **every sentence is checked against its source** before the customer sees it. Every answer is cited."

3. Type: **Who is your CEO?** → Enter.

**SAY:**
> "And when the answer isn't in the documents, it doesn't make anything up. It says *I don't know* — and offers a human."

---

## SCENE 4 — Real actions, real database (1:05 – 1:40)

**SHOW:** Same chat.
1. Type: **Where is my order HF-249641?** → Enter. Click **"How I answered"** to show the tool call.

**SAY:**
> "Order questions go to the Orders agent, which calls **real functions on the database** — not text pretending to be an action."

2. Change the email (top of the widget) to `olivia.thompson@example.co.uk`. Type: **I'd like a refund for order HF-214306, I changed my mind.** → Enter.

**SAY:**
> "Refunds up to fifty pounds go straight through…"

3. Type: **Please refund order HF-299317 in full, it's the wrong colour.** → Enter.

**SAY:**
> "…anything bigger waits for a person. Safety lives in code, not in the prompt: it checks the customer owns the order, enforces the limit, and uses an idempotency key, so a retry can **never refund twice**."

---

## SCENE 5 — Angry customers go to a human (1:40 – 1:55)

**SHOW:** Same chat, still as olivia. Type: **This is a scam, I'm filing a chargeback with my bank!** → Enter.

**SAY:**
> "Legal threats, chargebacks, safety issues, vulnerable customers — they skip the AI entirely and go straight to a human, with a written summary so nobody has to repeat themselves."

---

## SCENE 6 — The control room (1:55 – 2:40)

**SHOW:** Tab B. Click the **Admin** line under *Demo credentials* (it fills the form) → **Sign in**.
1. **Inbox:** click the newest conversation (Olivia). Expand the **agent trace** on one reply. Point at:
   - the router decision and confidence;
   - the tool call with its arguments and result;
   - the sources with scores;
   - tokens, cost and latency.

**SAY:**
> "This is the dashboard. Every reply comes with a full trace: which agent answered, which tools it called and **why**, which sources it used, and exactly what it cost."

2. Click **Approvals** → **Refunds** tab → **Approve** the £ refund for HF-299317.

**SAY:**
> "The large refund is waiting here. One click, and it's issued — and the customer is told."

3. Click **Escalations** and show Olivia's ticket and its summary.

**SAY:**
> "The chargeback is already a ticket, with the issue, what was tried and the next step."

---

## SCENE 7 — It learns from people (2:40 – 3:00)

**SHOW:**
1. Back in **Inbox**, open Ella's conversation. On a reply, click **Edit**, change a few words (for example add *"Our team is happy to help."*), then **Save**.
2. Click **Feedback**: show the edit in the list and the **Prompt versions** panel.

**SAY:**
> "When a human edits or rejects a reply, Keel saves it as feedback and uses it three ways: similar past corrections become examples, rejection reasons become new prompt rules an admin approves, and everything exports as a training set."

---

## SCENE 8 — Proof in numbers (3:00 – 3:30)

**SHOW:**
1. **Analytics** page: KPI cards and charts (2 seconds).
2. GitHub README → scroll to the **results** section (eval table and fine-tune table).

**SAY:**
> "Analytics track auto-resolution, response time, cost per conversation and accuracy over time.
> One command runs **a hundred test cases** — the live system scores **ninety-six per cent**, with one hundred per cent on routing, tool calls, safety, citations and escalation.
> I also **fine-tuned a 1.5-billion-parameter model** as the router: accuracy went from **sixty-seven to ninety-six point six per cent**, and it caught **every** high-risk message — trained in five minutes on a free GPU.
> All of it costs about **thirteen cents per thousand messages**."

---

## SCENE 9 — Close (3:30 – 3:45)

**SHOW:** Back to the Keel chat page (Tab A), still.

**SAY:**
> "Multi-agent, grounded, safe, and learning — running live on free tiers.
> **Keel.** Built by **Shehar Bano** for Cadral AI."

Fade out.

---

## Editing checklist (iMovie, free)
- Cut any waiting while answers load; keep the streaming text itself.
- Total length between **3:30 and 4:00**.
- Add a title card at 0:00 (*Keel — the AI operations desk*) and an end card with:
  - the live link: keel-ai-ops-x92d.vercel.app
  - the GitHub link: github.com/bano1397/keel-ai-ops
- Music at about 10–15 % volume under the voice.
- Export 1080p and upload to YouTube as **Unlisted** (or Loom / Google Drive with link sharing on).
