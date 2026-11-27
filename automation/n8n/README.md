# n8n workflows (optional automation layer)

Keel runs email intake, the daily report and Slack alerts **in code** (durable Postgres queue, APScheduler, outbox with retries). That is the path the live demo uses: one fewer always-on service, and every step is covered by tests.

These four workflows are the same flows as n8n workflows, for teams that prefer to own automation in n8n:

| File | What it does |
|---|---|
| `email-intake.json` | IMAP → normalise → HMAC-sign → `POST /webhooks/n8n` (`inbound_message`). Keel dedupes on `external_id`, so re-runs never double-process. |
| `daily-report.json` | Cron 08:00 → signed `report_data` call → HTML email + Slack post |
| `escalation-alert.json` | Signed webhook from Keel → verify signature (5-minute replay window) → Slack |
| `error-handler.json` | Set as the error workflow on the other three; posts failures to Slack |

**Setup:** import each file in n8n, then set the env vars `KEEL_API_URL`, `KEEL_N8N_HMAC_SECRET` (the same value as `N8N_HMAC_SECRET` in Keel), `KEEL_SLACK_WEBHOOK`, `KEEL_REPORT_TO` and `KEEL_REPORT_FROM`, plus IMAP/SMTP credentials.

**Signature:** `X-Keel-Signature: t=<unix>,v1=hex(HMAC_SHA256(secret, "<t>." + raw_body))`. Requests older than 5 minutes are rejected. Pattern ported from lendloop.

**Trade-off:** n8n gives ops staff a visual editor and 400+ connectors. It means another always-on service to host on a free tier, and its retries live outside the app's own queue. For a single-tenant demo on free tiers the in-code path is more reliable. In production, n8n is a good fit for the long tail of integrations (CRM, ticketing).
