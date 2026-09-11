# calibrEAT license API (`apps/api`)

The **hard gate** for the app (PLAN.md milestone M3). The mobile app unlocks only
when this service says the license is valid — a code is accepted only if it exists,
belongs to the buyer's email, is not revoked, and that email proved ownership via a
6-digit verification code. **There is no client-side path past the lock screen**; this
service is the authority.

**Stack:** a Cloudflare Worker + one SQLite-backed Durable Object. Fits the
Workers **Free plan** easily: 100k requests/day, and the entire license database is a
few kilobytes (storage bills at $0.20/GB-month → ~$0.00 for us). No server to patch,
never sleeps, HTTPS + global edge built in. Zero runtime dependencies.

## The flow

```
App lock screen                 Worker (this repo)
──────────────────              ─────────────────
1. user enters email ─────────► POST /v1/request-verification  { email }
                                 → emails a 6-digit code (Resend)
2. user enters code  ─────────► POST /v1/verify-email          { email, otp }
                                 → verified email persisted on the device
3. user enters code ──────────► POST /v1/activate              { code, email, installId }
                                 → code bound to that email (1 active device)
```

## Endpoints

| Method | Path | Body / headers | Result |
| --- | --- | --- | --- |
| POST | `/v1/request-verification` | `{ email }` | 200 `{ ok, message }` · 429 on cooldown (30 s) |
| POST | `/v1/verify-email` | `{ email, otp }` | 200 `{ ok, verified }` · 400 invalid/expired/used · 429 after 5 failed attempts |
| POST | `/v1/activate` | `{ code, email, installId, deviceLabel? }` | 200 `{ ok, valid, activatedAt, plan, customerEmail }` · 403 wrong email / revoked / email not recently verified · **409** `{ conflict: "active_elsewhere", activeDevice }` if another device already holds the slot |
| POST | `/v1/deactivate` | `{ code, email, installId }` | 200 `{ ok }` — frees the device slot (idempotent) |
| POST | `/v1/release` | `{ code, email }` | 200 `{ ok }` — OTP-gated slot clear from a new phone (lost / reinstall) |
| POST | `/v1/validate` | `{ code, email, installId }` | 200 `{ ok, valid, revoked, activatedAt, plan, customerEmail, activeDevice? }` |
| POST | `/v1/webhook/mor` | MoR purchase/refund events + `x-webhook-secret` (or `Authorization: Bearer`) | 200 registers / revokes · 401 bad secret · 503 if `MOR_WEBHOOK_SECRET` is unset |
| POST | `/v1/webhook/dodo` | Dodo Payments Standard Webhooks (`license_key.created`, `entitlement_grant.delivered` / `.revoked`) | 200 registers / revokes · 401 bad signature · 503 if `DODO_WEBHOOK_SECRET` is unset. Purchase events often omit email; with `DODO_API_KEY` the Worker looks up `customer_id` via `GET /customers/{id}`. |
| POST | `/v1/webhook/inbound` | Resend Inbound event (Svix-signed) | stores support mail metadata + auto-acks the sender |
| GET | `/v1/admin/inbound` | `Authorization: Bearer <ADMIN_TOKEN>` | recent support emails (newest first, ≤100) |
| POST | `/v1/admin/licenses` | `Authorization: Bearer <ADMIN_TOKEN>` + `{ email, code? }` | registers a code (generates one if omitted) |
| POST | `/v1/admin/clear-activation` | `Authorization: Bearer <ADMIN_TOKEN>` + `{ code }` | frees the device slot (lost/broken phone) without revoking the license |
| GET | `/health` | — | 200 `{ ok }` |

**Device policy:** one code + one email = **1 active device**. A second `installId`
is rejected with 409 (naming the holding phone when known) until the holder
deactivates, the owner posts `/v1/release` after email OTP, or support clears
the slot (`POST /v1/admin/clear-activation`). A different email with the same
code is rejected.

## Security model

- License codes are stored **hashed** (SHA-256); a store leak leaks nothing activatable.
- OTP records are keyed by `hash(email|otp)` — the store reveals neither code nor address.
- OTPs: 6 digits, 10-minute expiry, single-use, 5-attempt lockout, 30 s resend cooldown,
  and at most 8 sends per email per hour.
  `/v1/activate` requires a completed OTP for that email within 24 hours (same-device
  re-activation is exempt).
- Constant-time comparisons on code hashes and webhook/admin secrets.
- MoR webhook (`/v1/webhook/mor`) is **fail-closed**: unset `MOR_WEBHOOK_SECRET` returns 503;
  a missing or wrong secret returns 401. It will not mint or revoke licenses unsigned.
- Revoked licenses (refunds/chargebacks) fail activation immediately; the app can
  re-check via `/v1/validate` (periodic re-validation hardening, M5).
- **Reality check:** a decompiled APK can always be repatched, so this gate is strongest
  as *server-side* enforcement — which is exactly what it is. Client-side obfuscation
  and signature checks (M5) raise the bar further.

## Deploy (free)

Any free Cloudflare account works — including one you already use for another
site (each Worker is isolated; just note the Free plan's account-wide daily
request limits are shared, which is irrelevant at our scale).

1. **Prereqs:** Node ≥ 20, a free [Cloudflare account](https://dash.cloudflare.com/sign-up).
2. **Login once:** `npx wrangler login` (opens a browser; grants wrangler access).
3. **Install:** `npm install`.
4. **Set secrets** — fill in `apps/api/.env` (copy `.env.example`) and push
   them all at once with wrangler's built-in bulk upload:
   ```bash
   cp .env.example .env   # add RESEND_API_KEY, EMAIL_FROM, MOR_WEBHOOK_SECRET, ADMIN_TOKEN
   npx wrangler secret bulk .env
   ```
   Non-secret tuning lives in `wrangler.toml` `[vars]` (already set to defaults).
5. **Deploy:** `npm run deploy` → prints your URL, e.g.
   `https://calibreat-license.<you>.workers.dev`. That URL is the
   `EXPO_PUBLIC_LICENSE_API_URL` for release APK builds
   (`apps/mobile/src/constants/app.ts`).

**Fancy URL later (free):** in the Cloudflare dashboard → Workers & Pages → your
worker → Settings → Domains & Routes, add a custom route like
`license.calibreat.co.uk` (or a subdomain of a domain already on your account).
`*.workers.dev` works out of the box, so this is optional.

**Local dev / test without an account:** `npm run dev` (wrangler dev on port 8787) —
codes are logged to the console, `npm test` runs the 8-scenario node:test suite
against the exact router code path with an in-memory store.

## Registering licenses

**Production path — the MoR webhook.** Point your Merchant of Record (Lemon Squeezy,
Dodo Payments, Paddle, …) at `POST {your-url}/v1/webhook/mor` with the provider
payload mapped to:

```json
{ "event": "order_created", "customer_email": "buyer@x.com", "license_key": "AB12-CD34-EF56" }
```

- Purchase-ish events (`purchase|order|checkout|subscription_created|license_created`)
  register the code bound to the buyer email.
- Refund-ish events (`refund|revoke|chargeback|subscription_cancelled`) revoke it.
- The provider sends `MOR_WEBHOOK_SECRET` via `x-webhook-secret` (Lemon Squeezy
  style) or `Authorization: Bearer` — both are accepted.

**Manual/testing path — the admin endpoint:**

```bash
curl -X POST https://<your-url>/v1/admin/licenses \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@x.com"}'          # returns a generated code
# or supply your own:  -d '{"email":"buyer@x.com","code":"AB12-CD34-EF56"}'

# Lost/broken phone: free the slot so they can activate on a replacement.
curl -X POST https://<your-url>/v1/admin/clear-activation \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"AB12-CD34-EF56"}'
```

## Email (Resend free tier)

Verification codes go out via [Resend](https://resend.com): free tier = 100
emails/day, 3,000/month — ample for one-time activations. Set `RESEND_API_KEY`
and verify your **sending domain** (free tier includes one) for `EMAIL_FROM`.
Without a key the service still runs but logs codes instead of sending.

### Inbound support mail (support@calibreat.co.uk)

The Worker is also the **support inbox backend**: emails sent to
`support@calibreat.co.uk` arrive via [Resend Inbound](https://resend.com/docs/dashboard/receiving/introduction)
and hit `POST /v1/webhook/inbound` as Svix-signed `email.received` events.
The webhook carries **metadata only** (no body — by Resend's design):

```json
{
  "type": "email.received",
  "data": {
    "email_id": "56761188-…",
    "from": "Buyer <buyer@example.com>",
    "to": ["support@calibreat.co.uk"],
    "subject": "Lost my code"
  }
}
```

The handler:

1. verifies the Svix signature against `RESEND_WEBHOOK_SECRET` (rejects 401 otherwise),
2. dedupes on the `svix-id` (Resend retries are at-least-once),
3. stores the metadata + `email_id` in the DO (pruned after 90 days) — **never
   the message body**, which stays in Resend as the system of record,
4. sends a courtesy auto-ack from `SUPPORT_FROM` (skipping our own addresses; no-op if unset).

Read full messages in the Resend dashboard (**Emails → Receiving** tab) or via
`GET https://api.resend.com/emails/receiving/:email_id` (Bearer `RESEND_API_KEY`).
Setup steps are in `docs/support-email.md` (Parts A–C).

## Pointing the app at it

```bash
cd apps/mobile
EXPO_PUBLIC_LICENSE_API_URL=https://calibreat-license.<you>.workers.dev npx expo run:android --variant release
```

Until a real URL is set, the app runs in dev mode (any 6-digit code + any
well-formed license code verifies locally) — release builds **fail closed**.

## Files

```
wrangler.toml    Worker + DO binding + vars     src/router.ts  policy + endpoints
src/worker.ts    Worker entry (thin adapter)    src/do.ts      Durable Object store
src/license.ts   hashing, OTP, code format      src/store.ts   store interface + in-memory (tests)
src/config.ts    env → config                   src/email.ts   Resend sender (dev: log + capture) + support auto-ack
test/api.test.ts 8-scenario suite (node:test)
```

## Provider checklist (which MoR sends what)

The webhook body is provider-agnostic; each provider's payload must be mapped to
`{ event, customer_email, license_key }`. Confirm your provider auto-generates a unique
**permanent** license key per sale and emails it with the receipt (see `PLAN.md` §3).