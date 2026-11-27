# Deploying Keel on free tiers

| Piece | Where | Notes |
|---|---|---|
| API + workers + router + Postgres/pgvector | Oracle Cloud Always Free Ampere A1 VM (2 OCPU / 12 GB) | Always on, no cold starts; Caddy provides HTTPS via sslip.io; daily `pg_dump`, one file per weekday (7 kept) |
| Dashboard + public chat | Vercel Hobby | `frontend/`, env `NEXT_PUBLIC_API_URL=https://<KEEL_HOST>` |

## Steps
1. **Oracle VM.** Create an Ubuntu 24.04 Ampere A1 instance with 2 OCPU and 12 GB. In the VCN security list, allow inbound TCP 80 and 443.
2. On the VM, run:

       git clone https://github.com/bano1397/keel-ai-ops && cd keel-ai-ops
       ./deploy/oracle-setup.sh

   Then log out and back in so the docker group applies.
3. Create `.env` on the VM from `.env.example`. Set:
   - `POSTGRES_PASSWORD` to a long random value (the compose file builds `DATABASE_URL` from it);
   - `PUBLIC_BASE_URL=https://<KEEL_HOST>` and `FRONTEND_URL=https://<vercel-app>.vercel.app`;
   - a long `JWT_SECRET`;
   - the LLM, Telegram, Resend and Slack keys.
4. If you have the fine-tuned router GGUF, put it in `models/` and set `ROUTER_GGUF_PATH=/app/models/<file>.gguf`.
5. Start it:

       KEEL_HOST=keel-<ip-with-dashes>.sslip.io docker compose -f deploy/docker-compose.prod.yml up -d --build

   The first boot seeds data and indexes the documents.
6. Point Telegram at the API:

       curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://$KEEL_HOST/webhooks/telegram/$TELEGRAM_WEBHOOK_SECRET"

7. **Resend inbound.** Add a webhook to `https://$KEEL_HOST/webhooks/email` for `email.received`, and copy its signing secret into `RESEND_WEBHOOK_SECRET`.
8. **Vercel.** Import the repo, set the root directory to `frontend`, set `NEXT_PUBLIC_API_URL=https://$KEEL_HOST`, and deploy.

## Why not Neon?
The queue workers poll Postgres every second, so a managed database would never auto-suspend. On Neon Free (100 CU-hours a month), even the smallest compute running all month needs about 180 CU-hours. Running pgvector next to the API on the always-free VM costs nothing and removes a network hop. Neon remains a drop-in option: set `DATABASE_URL` and remove the `db` service, ideally switching the workers to LISTEN/NOTIFY instead of polling.

## Cold starts
None. The API, workers and database all run on the always-on VM, and Vercel serves the dashboard from its CDN.
