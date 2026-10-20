# calibrEAT

Calibrate your eating lifestyle. A free, cross-platform calorie tracker — no
login, no subscriptions, no ads. Paid store releases are planned.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/mobile/` | The app — Expo SDK 57 (React Native) + TypeScript + expo-router. Home instrument, setup wizard, macros, BMI, Train, settings, offline-first data layer. |
| `apps/api/` | The uptime pinger — a scheduled Cloudflare Worker that emails when the marketing site goes up or down. |
| `apps/web/` | The marketing site — hand-written static HTML, no build step: landing page, download + install guides, legal pages. Hosted on GitHub Pages (a move to Cloudflare Pages was measured and parked — see `docs/site-hosting.md`); security headers live in `apps/web/_headers`. |
| `brand/` | Brand system — monoline balance mark, wordmark lockup, gallery, and the generated `glyph-gallery.html` icon review sheet. |
| `docs/` | Operational notes (e.g. `site-hosting.md`, `uptime-pinger.md`, `android-release.md`). |
| `scripts/` | Repo-level tooling — `check-site.mjs` and the OG-card generator. |
| `PLAN.md` | Product & engineering plan: monetization model, licensing security analysis, data model, milestones. |

## Status

Feature-complete **offline app**. The app is free for now, with no account
or activation step. Store payments are not built.
The Android APK is not published yet. The app will be sold through the app
stores, so the website has no download page. Build status and update notes live
on `apps/web/status.html`.

## Checks

Everything is verifiable locally, and CI runs the same commands
(`.github/workflows/ci.yml`):

```bash
node scripts/check-site.mjs         # site: metas, links, sitemap, single checkout URL
cd apps/api    && npm test          # uptime pinger tests + typecheck
cd apps/mobile && npm run check     # tsc + every scripts/check-*.mjs suite
cd apps/mobile && npm run verify    # the above plus eslint
```

`apps/mobile` has no test framework on purpose: the pure logic — nutrition maths,
diary totals, dates, streaks, workouts, glyph geometry, reminder clocks — lives in `src/lib` and is exercised by plain
`node --experimental-strip-types` scripts under `scripts/`, so there is nothing
to install and each suite runs in milliseconds.
