# Site hosting: GitHub Pages → Cloudflare Pages

The marketing site in `apps/web` is moving to **Cloudflare Pages**. This document
exists because the move has one sharp edge (email records) and one footgun that
would silently undo the whole reason for it.

## Why we moved

**1. Share cards were blank, and no amount of correct markup could fix it.**
X stores a bare domain (`calibreat.co.uk`) as `http://…`, and its card crawler
fetches that URL **once without following redirects**. GitHub Pages answered
every `http://` (and `www.`) request with a 301, so the crawler gave up before it
ever read the meta tags — and X cached "this URL has no card" permanently:

| What the crawler asked for | GitHub Pages | Card |
| --- | --- | --- |
| `https://calibreat.co.uk/` | 200 | ✅ |
| `http://calibreat.co.uk/` | **301** | ❌ |
| `https://www.calibreat.co.uk/` | **301** | ❌ |

Every validator and `curl` that used the `https://` URL saw a perfect card, which
is exactly why this was invisible for so long. Cloudflare serves the page on
`http://` with a 200, which is what the crawler needs.

**2. The Content-Security-Policy could never ship.** GitHub Pages cannot send
custom response headers, and a meta-tag CSP is ignored for `frame-ancestors` and
warns on every page load. That limitation was already documented in
`deploy-site.yml`; Pages removes it.

**3. Bonus:** Cloudflare analytics show crawler hits and their status codes —
that is how the blank-card cause was eventually found by someone else. It also
makes putting the licence API on `license.calibreat.co.uk` straightforward later.

Free plan is genuinely free for this site: unlimited requests and bandwidth,
500 builds/month, 20,000 files, 25 MiB per file, 100 custom domains.

## What is already done

- **The Pages project exists and is deployed.** `calibreat-site` was created and
  its first deployment verified on 12 Sep 2026: the CSP and framing headers are
  present on the wire, and the deployed HTML is byte-identical to `apps/web`
  (`shasum -a 256`). Nothing about the live site changed — `calibreat.co.uk` is
  still served by GitHub Pages until DNS moves.
- **`apps/web/_headers`** — the security headers (CSP, `nosniff`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`) plus a cache rule for `/assets/*`.
  This is the single source of truth: `apps/web/serve.py` reads the same file for
  local development, and `scripts/check-site.mjs` fails if a directive the site
  needs goes missing. There is no second copy to drift.
- **`.github/workflows/deploy-cloudflare.yml`** — deploys `apps/web` on every push
  that touches it, and **skips cleanly** (a notice, not a failure) until the
  Cloudflare secrets exist.
- **`deploy-site.yml` still runs**, so both hosts serve identical content until the
  DNS cutover. That is what makes the switch reversible.

## One-time setup (~5 minutes, two secrets)

Everything below is a dashboard step. Nothing here can be done from a laptop's
`wrangler` session unless it was authorised with the **Pages** scope — the
session that deploys the licence Worker is scoped to Workers only
(`workers_*`), so it cannot create or deploy a Pages project.

1. Use your existing Cloudflare account — the licence Worker already lives on it.
   The account ID is **`92e5d7d3336709a2a783488b3cdc0241`** (it is the middle
   column of `npx wrangler whoami`).
2. Create an API token: **My Profile → API Tokens → Create Token → Edit
   Cloudflare Workers** template is *not* enough; use **Create Custom Token**
   with **Account → Cloudflare Pages → Edit** for this account. Then add two
   repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | the token you just made |
   | `CLOUDFLARE_ACCOUNT_ID` | `92e5d7d3336709a2a783488b3cdc0241` |

3. Push anything touching `apps/web` (or run the workflow manually from the
   Actions tab). **You do not need to create the Pages project first** — the
   workflow's *Ensure the Pages project exists* step creates `calibreat-site`
   on the first run and is a no-op afterwards. It deploys to
   `https://calibreat-site.pages.dev`.

   *Alternative, if you would rather not hold an API token in GitHub:* dashboard →
   Workers & Pages → Create → Pages → **Connect to Git**, pick the repo, build
   command **empty**, output directory `apps/web`. Cloudflare then deploys on
   every push itself. The trade-off is that it rebuilds on *any* push to `main`
   (including app-only changes) and the deploy is no longer gated by
   `check-site.mjs`, which the Actions route does run first.
5. **Verify the preview deployment.** Two of these are about the new host:

   ```bash
   # the CSP that GitHub Pages could never send:
   curl -sI https://calibreat-site.pages.dev/ | grep -i content-security-policy

   # the deployed bytes are what you built:
   curl -s https://calibreat-site.pages.dev/ | shasum -a 256
   shasum -a 256 apps/web/index.html                 # same hash
   ```

   ⚠️ **`*.pages.dev` always answers `http://` with a 301 — that is normal and is
   not the behaviour we are chasing.** Measured on the first deployment:
   `http://calibreat-site.pages.dev/` → `301 Location: https://…` for every path
   and every user-agent, because Cloudflare forces HTTPS on its own `pages.dev`
   hostnames. The behaviour that matters is on the **apex domain**, and the only
   way to test it is to ask Cloudflare's edge directly — see the next section.

## Test the apex BEFORE moving nameservers

This is the step that decides whether the move actually fixes share cards, so do
it before the cutover and do not skip it. Once `calibreat.co.uk` exists as a zone
on Cloudflare (step 2 below) but *before* the nameservers move, you can send a
request straight to Cloudflare's edge with the apex in the `Host` header, and see
exactly what it would answer:

```bash
CF_IP=104.16.132.229   # any current Cloudflare anycast address; dig ns1.cloudflare.com

# what the X crawler would get — this is the one that matters
curl -s -o /dev/null -w 'apex http  -> %{http_code}\n' \
  --resolve calibreat.co.uk:80:$CF_IP -A 'Twitterbot/1.0' http://calibreat.co.uk/

# and what a human's browser would get
curl -s -o /dev/null -w 'apex https -> %{http_code}\n' \
  --resolve calibreat.co.uk:443:$CF_IP -A 'Mozilla/5.0' https://calibreat.co.uk/
```

**The first should be `200`.** Cloudflare's *Always Use HTTPS* setting is off by
default and is the documented cause of an http→https redirect on a zone, so a
zone that has never had it enabled serves the page on `http://`.

Treat that as the expectation and the test as the evidence, though — I could not
confirm it empirically against a third party. Every public Cloudflare zone probed
while writing this (`cloudflare.com`, `discord.com`, `community.cloudflare.com`)
answers `http://` with a 301, because all of them deliberately enable *Always Use
HTTPS*. So the two things to verify in the dashboard before the cutover are:
**SSL/TLS → Edge Certificates → Always Use HTTPS: OFF**, and this test returning
`200`.

**If it 301s anyway**, stop and reconsider, because then the crawler problem is
not fixable by hosting: nothing in the Pages or DNS configuration can serve the
page on `http://`, and the rest of the migration should be justified on its other
merits only (the CSP, crawler analytics, and a faster edge). The share-card fix
in that case is a sharing habit, not a host: post the fully-qualified `https://`
URL, and add a fresh query string (`?v=4`) to escape a cache entry X has already
written. Note also that the load-bearing assumption here — that X's crawler does
not follow redirects — comes from third-party reports, not from X. The
**Card Validator** (`cards-dev.twitter.com/validator`, needs a logged-in X
account) is the direct test: paste both `http://` and `https://` and read its log.

## DNS cutover — do it when you can watch email

**Inventory the records first.** Export or screenshot every record at your current
DNS provider. These must survive, and importers routinely mangle them:

| Record | What breaks if it is lost |
| --- | --- |
| **MX** for `support@calibreat.co.uk` | The support inbox stops receiving (Resend Inbound) |
| **TXT/SPF + DKIM** for Resend | Verification-code email stops — **nobody can activate the app** |
| **A/CNAME** for the site | The site itself |

Losing an email record is far worse than a blank share card, so treat the email
records as the risky part and the website as the easy part.

1. Lower the TTL on the site records to 300 s and wait out the old TTL. Rollback
   then takes five minutes instead of a day.
2. Add `calibreat.co.uk` as a zone on Cloudflare (Free plan). Let it import the
   existing records, then **diff the import against your inventory** — restore
   anything missing, especially MX and the Resend records.
3. **Verify email before you touch the site:** request an activation OTP and send
   a test message to `support@calibreat.co.uk` from an external address. Fix any
   failures while the old DNS is still authoritative.
4. In the Pages project, add the custom domain `calibreat.co.uk` — Cloudflare
   creates the DNS record. Add `www` too and redirect it to the apex, so the site
   keeps exactly one canonical host.
5. Change the nameservers at your registrar to the pair Cloudflare gives you.
6. Verify (below), then delete the old records after a day or two of quiet.

## The footgun: never enable "Always Use HTTPS"

**SSL/TLS → Edge Certificates → "Always Use HTTPS" MUST STAY OFF.** Turning it on
reintroduces the 301 on `http://` at the edge and every share card goes blank
again — with no server-side trace, exactly the bug we just spent hours finding.

If you ever want humans forced onto https, add a **Redirect Rule** that exempts
the crawlers instead (Rules → Redirect Rules → Custom filter expression):

```
(http.host eq "calibreat.co.uk" and not any(
  http.user_agent contains "Twitterbot",
  http.user_agent contains "facebookexternalhit",
  http.user_agent contains "LinkedInBot",
  http.user_agent contains "Slackbot",
  http.user_agent contains "Discordbot",
  http.user_agent contains "TelegramBot",
  http.user_agent contains "WhatsApp"
))
```

→ **301** to `concat("https://", http.host, http.request.uri.path)`, preserving
the query string.

Only once that rule is live is it safe to add
`Strict-Transport-Security: max-age=31536000` (to `_headers`). HSTS is remembered
by browsers for a year, so `_headers` deliberately does not set it yet — with the
rule in place, browsers never make the plain-http request that HSTS would fix.

## Verify after cutover

```bash
curl -s -o /dev/null -w '%{http_code}\n' -A 'Twitterbot/1.0' http://calibreat.co.uk/   # expect 200 (301 ⇒ see the section above)
curl -sI https://calibreat.co.uk/ | grep -i content-security-policy                     # expect the header
node scripts/check-site.mjs && node scripts/check-release.mjs
```

Then force a fresh card: post `https://calibreat.co.uk/?v=4` (a URL X has never
seen). The bare domain should follow once X re-crawls — the Card Validator
(`cards-dev.twitter.com/validator`, needs a logged-in X account) shows what the
crawler receives and nudges a re-crawl.

## After the cutover (repo changes)

```bash
git rm .github/workflows/deploy-site.yml apps/web/CNAME
```

`CNAME` is meaningless on Pages (and would otherwise be served as a stray file),
and the GitHub Pages workflow is what keeps the old host alive. Update `PLAN.md`
§8, which still names GitHub Pages.

## Rollback

Point the nameservers back, or re-create the site records at the old provider.
Until the two files above are deleted, GitHub Pages keeps serving and
`deploy-site.yml` keeps deploying, so rollback needs no code change at all.
