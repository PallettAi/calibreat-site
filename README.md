# calibrEAT

Calibrate your eating lifestyle. A free, cross-platform calorie tracker with a
one-time lifetime unlock — no subscriptions, no in-app purchases, no ads.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/mobile/` | The app — Expo SDK 57 (React Native) + TypeScript + expo-router. Lock gate, home instrument, setup wizard, macros, BMI, Train, settings, offline-first data layer. |
| `apps/api/` | The license service — email verification + lifetime-code activation/revocation. A Cloudflare Worker + SQLite-backed Durable Object (free plan), the hard server-side gate. |
| `apps/web/` | The marketing / sales site — hand-written static HTML, no build step: landing page, license/checkout, download + install guides, legal pages. Hosted on GitHub Pages (a move to Cloudflare Pages was measured and parked — see `docs/site-hosting.md`); security headers live in `apps/web/_headers`. |
| `brand/` | Brand system — monoline balance mark, wordmark lockup, gallery, and the generated `glyph-gallery.html` icon review sheet. |
| `docs/` | Operational notes (e.g. `support-email.md` for the Resend inbound setup). |
| `scripts/` | Repo-level tooling — `check-site.mjs` and the OG-card generator. |
| `PLAN.md` | Product & engineering plan: monetization model, licensing security analysis, data model, milestones. |

## Status

Feature-complete **offline app**, a **live license API** and a **live checkout**.
The one thing missing is the release itself: **the Android APK is not published
yet** (`download.html` says "coming soon"). Until it is, checkout should not be
promoted — see PLAN.md §7 (M0/M4).

## Checks

Everything is verifiable locally, and CI runs the same commands
(`.github/workflows/ci.yml`):

```bash
node scripts/check-site.mjs         # site: metas, links, sitemap, single checkout URL
cd apps/api    && npm test          # license contract (19 cases) + typecheck
cd apps/mobile && npm run check     # tsc + every scripts/check-*.mjs suite
cd apps/mobile && npm run verify    # the above plus eslint
```

`apps/mobile` has no test framework on purpose: the pure logic — nutrition maths,
diary totals, dates, streaks, workouts, glyph geometry, reminder clocks, licence
codes — lives in `src/lib` and is exercised by plain
`node --experimental-strip-types` scripts under `scripts/`, so there is nothing
to install and each suite runs in milliseconds.
