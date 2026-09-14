# calibrEAT uptime pinger

Self-hosted watchdog for the two live dependencies: the license Worker and the
marketing site. Runs as a scheduled Cloudflare Worker (every 5 min) in the same
account as the API — no third-party monitor, no new vendor, no free-tier quirks.

- `apps/api/src/pinger.ts` — pure check + transition logic (unit-tested)
- `apps/api/src/uptime-worker.ts` — cron entrypoint, HTTP routes, email
- Tests: `apps/api/test/uptime.test.ts` → `npm test` (in `apps/api`)

## What it watches

| Target | URL | Healthy means |
| --- | --- | --- |
| license API | `https://calibreat-license.coreypallett20.workers.dev/health` | HTTP 200 **and** body contains `calibreat-license` |
| website | `https://calibreat.co.uk` | HTTP 200 |

## Alerting (via Resend)

An email is sent **only on a state change** — steady-state is silent:

- any target goes DOWN → one subject `calibrEAT DOWN: <targets>` with per-target detail
- all targets back UP → one subject `calibrEAT UP again: all targets healthy`

Recipient and sender come from secrets (`ALERT_TO`, `ALERT_FROM`). One failed
send is retried once on the next cycle because alert state is only written to
R2 after the email succeeds — a persistent outage emails every 5 minutes, which
is the desired failure mode.

## State

Last-seen status per target lives in the R2 bucket
`calibreat-license-backups` under `uptime/state.json` (same account, no new
resources). Missing/corrupt state is treated as "everything was UP", so the
first alert after losing state is only sent if a target is actually down.

## HTTP endpoints (admin-gated via `Authorization: Bearer <ADMIN_TOKEN>`)

- `GET/POST /run` — run one check cycle immediately (also what the cron calls).
- `GET/POST /test-alert` — force a test email; does not touch state.

Both exist so the pipeline can be verified without waiting for a real outage.

## Operations

```sh
cd apps/api
npx wrangler secret put ALERT_TO      # e.g. coreypallett20@gmail.com
npx wrangler secret put ALERT_FROM    # must be a Resend-verified sender
npx wrangler secret put ADMIN_TOKEN   # same token as the license API
npm run deploy:uptime                 # deploys the pinger worker
```

Manual cycle + test email:

```sh
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://calibreat-uptime.coreypallett20.workers.dev/run
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://calibreat-uptime.coreypallett20.workers.dev/test-alert
```

Fail-safe: every alert email includes the line
`[automated uptime pinger — do not reply]` so monitoring mail can never be
mistaken for a real customer email and accidentally replied to via Resend.
