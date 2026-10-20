# calibrEAT (mobile app)

Free calorie and training tracker, sold through the **app stores**, Android first; iOS
later. No account, no ads, no in-app purchases, no licence.

Full product & engineering plan: [`PLAN.md`](../../PLAN.md) at the repo root.

**Stack:** Expo SDK 57 (React Native 0.86, React 19), TypeScript, `expo-router` with typed
routes, `expo-sqlite` for the local database, `expo-camera` for barcodes, `react-native-svg`
for the charts and the header marks, dark/light theming throughout.

## What the app does

| Screen | Purpose |
| --- | --- |
| `src/app/index.tsx` | Entry point. Redirects straight to Home. |
| `src/app/home.tsx` | **The instrument.** Calorie dial with True Burn, macro arcs, weight card with weigh-in entry, water mark and streak flame in the header, calendar picker and menu. First-run users are routed to `/setup`. |
| `src/app/setup.tsx` | Profile wizard (sex, age, height, weight, activity, goal + pace, supplements, computed targets). Mifflin-St Jeor BMR/TDEE. |
| `src/app/macros.tsx` | Full nutrient list for a day: protein/carbs/fat plus fibre, sugars, saturated fat and sodium wherever the pack lists them. |
| `src/app/train.tsx` | Exercise picker with a muscle map, sets/reps, kcal estimated from your BMR. The burn feeds the home dial's budget. |
| `src/app/bmi.tsx` | BMI from height and the latest weigh-in, with band and healthy range. |
| `src/app/trends.tsx` | Trends over time. |
| `src/app/share-lab.tsx` | Share-card templates for a day's progress. |
| `src/app/settings.tsx` | Daily log nudge and weigh-in reminders (time + frequency), haptics, data export/import. |

Sheets (`src/components/`): `meal-log-sheet` (search / barcode / quick-add / recents, edit and
delete, **saved meals** and **copy yesterday's slot**), `water-sheet` (editable total),
`streak-sheet`, `daily-recap-sheet`.

**Saved meals** (`src/lib/saved-meals.ts`) name a meal you eat often so it re-logs in one tap
into any day and slot; a matching name updates in place rather than duplicating.

## Data

Offline-first and local-only: **no account, no server copy of your logs.** `src/lib/db.ts`
uses SQLite on native; `src/lib/db.web.ts` is the same API over `localStorage` for the browser
preview. Food search runs against **UK CoFID** bundled offline
(`src/data/cofid-foods.json`) with **Open Food Facts** for barcode lookups and packaged-product
search when online (UK database first, then world). No USDA or other US database is used.

## Run it

```bash
npm install
npm run web        # browser preview
npm run android    # Expo Go on a connected device/emulator
```

## Verifying changes

The repo has no device-free test runner for UI, so the pure logic — dates, nutrition maths,
diary aggregation, saved meals, barcode parsing, reminder scheduling, streaks, muscles, workout
estimation, share cards and glyph art — is covered by `scripts/check-*.mjs` suites that run in
Node against the real modules:

```bash
npm run check      # typecheck + every scripts/check-*.mjs suite
npm run verify     # lint + the above
npm run check:math # one suite at a time, e.g. maths
```

`scripts/run-checks.mjs` discovers every `scripts/check-*.mjs` file automatically, so a new
suite only needs the same shape as an existing one (plus an optional `check:*` script).

CI runs `npm run check` (and `npm run lint`, currently non-blocking) on every push and pull
request — see `.github/workflows/ci.yml`.

## Building the APK

`apps/mobile/eas.json` defines the APK build profiles (development, preview, production).

```bash
npm run build:apk      # preview APK (testing)
npm run release:apk    # production APK (publishing)
```

The whole flow — one-time EAS setup, the device test checklist, publishing the file and
pointing the website at it — is in **[`docs/android-release.md`](../../docs/android-release.md)**.
`node scripts/check-release.mjs` from the repo root checks the config is release-ready.

## Layout

```
src/
  app/          expo-router screens (_layout + the screens above)
  components/   sheets, share cards, header glyphs, brand mark, themed primitives
  constants/    theme tokens + brand palette/URLs (app.ts)
  data/         cofid-foods.json — bundled UK nutrient reference
  hooks/        colour scheme / theme
  lib/          db + db.web (data), diary, nutrition, food-search, barcode, trueburn,
                workout, muscles, streak, units, settings, reminders, share-*
scripts/        check-*.mjs logic suites + run-checks.mjs + glyph-gallery.mjs
```

## Still to come

Tracked in PLAN.md: iOS (parked until an Apple Developer account exists).
