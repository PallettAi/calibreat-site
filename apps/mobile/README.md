# calibrEAT (mobile app)

Free-to-install calorie tracker for **Android (APK sideload)** first, iOS later. The app is
gated behind a **one-time lifetime activation code** sold on the calibrEAT website and emailed
to the buyer. No in-app purchases, no ads.

Full product & engineering plan: [`PLAN.md`](../../PLAN.md) at the repo root.

**Stack:** Expo SDK 57 (React Native 0.86, React 19), TypeScript, `expo-router` with typed
routes, `expo-sqlite` for the local database, `expo-camera` for barcodes, `react-native-svg`
for the charts and the header marks, dark/light theming throughout.

## What the app does

| Screen | Purpose |
| --- | --- |
| `src/app/index.tsx` | **Welcome / lock.** The three-step gate (email → 6-digit code → licence code). Activated users are redirected past it before it paints. |
| `src/app/home.tsx` | **The instrument.** Calorie dial with True Burn, macro arcs, weight card with weigh-in entry, water mark and streak flame in the header, calendar picker and menu. First-run users are routed to `/setup`. |
| `src/app/setup.tsx` | 8-step profile wizard (sex, age, height, weight, activity, goal + pace, supplements, computed targets). Mifflin-St Jeor BMR/TDEE. |
| `src/app/macros.tsx` | Full nutrient list for a day — protein/carbs/fat plus fibre, sugars, saturated fat and sodium wherever the pack lists them. |
| `src/app/train.tsx` | Exercise picker with a muscle map, sets/reps, kcal estimated from your BMR. The burn feeds the home dial's budget. |
| `src/app/bmi.tsx` | BMI from height and the latest weigh-in, with band and healthy range. |
| `src/app/settings.tsx` | Daily log nudge and weigh-in reminders (time + frequency), haptics, account, deactivate. |

Sheets (`src/components/`): `meal-log-sheet` (search / barcode / quick-add / recents, edit and
delete), `water-sheet` (editable total), `streak-sheet`, `license-sheet`.

## Data

Offline-first and local-only: **no account, no server copy of your logs.** `src/lib/db.ts`
uses SQLite on native; `src/lib/db.web.ts` is the same API over `localStorage` for the browser
preview. Food search runs against **UK CoFID** bundled offline
(`src/data/cofid-foods.json`) with **Open Food Facts** for barcode lookups when online.

## Run it

```bash
npm install
npm run web        # browser preview (dev activation)
npm run android    # Expo Go on a connected device/emulator (dev activation)
```

## The gate

1. **Email** — the address used at purchase; the server emails a 6-digit code.
2. **Verify** — entering it binds that email to this device.
3. **Activate** — the lifetime code is sent to the licence API with `{ code, email, installId }`,
   which binds the key to the email (one active device per account).

| Mode | When | Behaviour |
| --- | --- | --- |
| Dev activation | `npm run web` / Expo Go, no `EXPO_PUBLIC_LICENSE_API_URL` | Any valid email + any 6-digit code verifies locally, then any well-formed code (e.g. `AB12-CD34-EF56`) unlocks — for exercising the flow only |
| Real activation | Release APK with `EXPO_PUBLIC_LICENSE_API_URL` baked in | Email/OTP and code are validated by the Worker; the app **fails closed** if the server is unreachable, and activation without a verified email fails even in dev |

The licence client also re-attests a stored licence against `/v1/validate`, failing **open** on
network trouble (never locking out a paying user) and locking only on a definitive server
verdict, so a refunded or displaced device re-locks itself.

## Verifying changes

The repo has no device-free test runner for UI, so the pure logic — dates, nutrition maths,
diary aggregation, barcode parsing, licence policy, reminder scheduling, streaks, muscles,
workout estimation and glyph art — is covered by `scripts/check-*.mjs` suites that run in
Node against the real modules:

```bash
npm run check      # typecheck + every scripts/check-*.mjs suite
npm run verify     # the above + eslint
npm run check:math # one suite at a time, e.g. maths
```

CI runs `npm run check` (and `npm run lint`, currently non-blocking) on every push and pull
request — see `.github/workflows/ci.yml`.

Adding a suite: copy the shape of an existing `scripts/check-*.mjs`, then register it in
`scripts/run-checks.mjs`.

## Building the APK

`apps/mobile/eas.json` defines the two APK build profiles and bakes in the live licence API
URL, so a release build talks to the real server and fails closed without it.

```bash
npm run build:apk      # preview APK (testing)
npm run release:apk    # production APK (publishing)
```

The whole flow — one-time EAS setup, the device test checklist, publishing the file and
pointing the website at it — is in **[`docs/android-release.md`](../../docs/android-release.md)**.
`node scripts/check-release.mjs --online` from the repo root tells you whether the config is
release-ready.

## Config values

All read from the environment at build time (`src/constants/app.ts`); `EXPO_PUBLIC_*` values
are **inlined into the bundle**, so changing one requires a rebuild, not a restart.

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_LICENSE_API_URL` | *(empty → dev activation)* | Licence API base URL. Set in `eas.json` for both APK profiles. |
| `EXPO_PUBLIC_LICENSE_STORE_URL` | `https://calibreat.co.uk/license.html` | Where users buy a code. |
| `EXPO_PUBLIC_LICENSE_HELP_URL` | `https://calibreat.co.uk/license.html#faq` | In-app "manage my licence" help. |

## Layout

```
src/
  app/          expo-router screens (_layout gate + the screens above)
  components/   sheets, header glyphs, brand mark, themed primitives
  constants/    theme tokens + brand palette/URLs (app.ts)
  data/         cofid-foods.json — bundled UK nutrient reference
  hooks/        colour scheme / theme
  lib/          db + db.web (data), diary, nutrition, food-search, barcode, trueburn,
                workout, muscles, streak, units, settings, reminders, licence*
scripts/        check-*.mjs logic suites + run-checks.mjs + glyph-gallery.mjs
```

## Still to come

Tracked in PLAN.md: data **export/import** for backups and device migration (M1), a USDA
FoodData Central fallback (M2), and iOS (parked until an Apple Developer account exists).
