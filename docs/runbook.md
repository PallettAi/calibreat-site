# calibrEAT runbook — what to do when something pages you

The operator's guide for 3am: what each alert means, what to check first, and
the commands that answer "is it just me?" Written so future-you (or anyone) can
act without reading the whole repo first.

## The live system at a glance

```
visitor ──► calibreat.co.uk (GitHub Pages, DNS on Cloudflare)
buyer  ──► Dodo checkout ──webhook──► license Worker ──► license email (Resend)
app    ──► https://api.calibreat.co.uk  (same Worker; OTP + activation)
                │
                ├─ Durable Object `LicenseStoreDO`  ← the only copy of licenses
                └─ R2 `calibreat-license-backups`   ← daily 03:00 UTC export
```

Both hostnames serve the same Worker and are checked every 5 minutes:

| Hostname | Who uses it | Notes |
| --- | --- | --- |
| `api.calibreat.co.uk` | APKs from v0.0.5 on (baked at build) | custom domain, Cloudflare cert |
| `calibreat-license.coreypallett20.workers.dev` | shipped v0.0.4 APKs; fallback | must keep answering until no old APKs are in the wild |

## Alerts you can receive, and what each means

| Email | Meaning | Action |
| --- | --- | --- |
| `calibrEAT DOWN: license API` (from the pinger) | the Worker failed its check twice in a row | playbook below |
| `calibrEAT DOWN: website` | calibreat.co.uk not serving | playbook below |
| `calibrEAT UP: …` | recovered on its own | none — glance at the downtime length |
| UptimeRobot "is DOWN/UP" | external second opinion of the same | treat like the pinger's |
| Dodo "payment received" | a sale 🎉 | none — the webhook does the work |
| Resend account emails | delivery/bounce notices | check if repeated |

The pinger only emails on **state change**: silence is healthy. Drill emails
subjected `calibrEAT uptime test alert` are the `/test-alert` endpoint, not an
incident.

## Playbook: "license API is DOWN"

Work top to bottom; stop when the cause is found.

1. **Confirm from your own machine:**

   ```bash
   curl -s -m 10 https://api.calibreat.co.uk/health
   curl -s -m 10 https://calibreat-license.coreypallett20.workers.dev/health
   ```

   Healthy = `{"ok":true,"service":"calibreat-license"}` with HTTP 200.
   If both answer fine, the alert was a probe-side blip — note it, move on.

2. **Is Cloudflare itself having an incident?**
   <https://www.cloudflarestatus.com>. If Workers are listed as affected:
   nothing to do but wait — Dodo retries its webhooks, and the app surfaces a
   friendly "can't reach the license server" message.

3. **Did the last deploy break it?**

   ```bash
   cd apps/api && npx wrangler deployments list | head -20
   ```

   If a deploy landed shortly before the alert, roll back:
   `npx wrangler rollback` (interactive) — it reactivates the previous version in
   seconds and needs no rebuild.

4. **One hostname works, the other doesn't?**
   - Only the custom domain bad → DNS/route issue: redeploy the Worker
     (`npm run deploy` from `apps/api`), which re-asserts the custom domain.
   - Only workers.dev bad → the `workers_dev` flag was dropped from
     `wrangler.toml`; restore it (`workers_dev = true`) and redeploy. Never
     remove it while v0.0.4 APKs are in the wild.

5. **Worker answers but activation/OTP fails?**
   Likely Resend (email) or the DO. Check the Worker's logs in the Cloudflare
   dashboard (Workers → calibreat-license → Logs) for the failing request.

**Customer impact while down:** nobody can activate, OTP emails don't send,
Dodo webhook deliveries retry automatically (no sales are lost — they land once
the Worker returns).

## Playbook: "website is DOWN"

The site is static HTML on GitHub Pages. Check:

1. <https://www.githubstatus.com> — Pages incidents happen and self-resolve.
2. `curl -sI https://calibreat.co.uk | head -3` — expect `200` (or `301` from
   http/www forms, which is normal).
3. DNS: the zone is on Cloudflare (`hayes`/`carlane.ns.cloudflare.com`); if a
   record was changed in the dashboard, that's the place to fix it.

## Morning check (60 seconds)

The daily backup is the one thing worth a routine glance:

```bash
cd apps/api
npx wrangler r2 object get calibreat-license-backups/licenses/$(date -u +%F).json --pipe | head -c 200
```

A JSON array (even a short one) = backup landed. The cron fires 03:00 UTC, so
check after ~03:05 UK time. If the object is missing, run the pinger's sibling —
`npx wrangler deploy` re-registers the cron — and check
Workers → calibreat-license → Logs for the scheduled run.

## Command cheat-sheet

```bash
# manual pinger cycle (checks both targets, emails only on state change)
export ADMIN_TOKEN=$(grep ^ADMIN_TOKEN apps/api/.env | cut -d= -f2)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://calibreat-uptime.coreypallett20.workers.dev/run

# send yourself a drill alert (proves Resend → inbox still works)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://calibreat-uptime.coreypallett20.workers.dev/test-alert

# mint a license for a customer who paid but lost the email
curl -X POST https://api.calibreat.co.uk/v1/admin/licenses \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com"}'

# ship a code change
cd apps/api && npm test && npm run deploy
```

## Where everything lives

| Thing | Where |
| --- | --- |
| Worker source + tests | `apps/api/` |
| Secrets (never in the repo) | `wrangler secret put …`; local copies in `apps/api/.env` |
| Pinger internals | `apps/api/src/pinger.ts`, `docs/uptime-pinger.md` |
| APK build + release steps | `docs/android-release.md` |
| Site + its checks | `apps/web/`, `scripts/check-site.mjs`, `docs/site-hosting.md` |
| Android signing key | **backed up out of band** — if you haven't, do it today (Expo → Credentials → download keystore) |
