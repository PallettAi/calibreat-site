# calibrEAT uptime pinger (`apps/api`)

The licence service that used to live here has been removed. What remains is
a small scheduled Cloudflare Worker that checks the marketing site every five
minutes and emails (via Resend) only when it goes up or down.

- `src/pinger.ts` — pure check and state-transition logic (unit-tested)
- `src/uptime-worker.ts` — cron entrypoint, HTTP routes, email
- `wrangler.uptime.toml` — the Worker's config (cron, R2 state bucket)
- `test/uptime.test.ts` — the tests

Full operating notes: `docs/uptime-pinger.md`.

## Commands

```bash
cd apps/api
npm ci
npm test                 # pinger tests
npm run typecheck
npm run deploy:uptime    # deploys the pinger Worker
```

## Secrets

Set on the pinger Worker, never committed:

```bash
npx wrangler secret put RESEND_API_KEY -c wrangler.uptime.toml
npx wrangler secret put ALERT_TO -c wrangler.uptime.toml
npx wrangler secret put ALERT_FROM -c wrangler.uptime.toml
npx wrangler secret put ADMIN_TOKEN -c wrangler.uptime.toml
```
