# calibrEAT — Journey Log

A readable history of how calibrEAT was built — kept in markdown so it can be shared as-is.

Current version: **beta v0.0.4** · `apps/mobile` `v0.0.4` · Last updated: 2026-09-13

---

## beta v0.0.4 — Logging without the friction

**Theme:** the app stops making you re-type the meals you eat every day.

- **Fasting timer** — a FASTING card on Home: start when you finish eating and
  a live elapsed clock counts up with the next common milestone (12/16/18/20/
  24/36/48 h) and how far away it is; ending a fast records the duration for
  the "last fast / last run" readout. The clock is derived from the stored
  start timestamp, so it keeps running with the app closed, and it reuses
  Home's existing 60-second tick — zero new timers. Logic in
  `src/lib/fasting.ts` (pure, `check:fasting`), persistence in
  `fasting-store.ts`.
- **True Burn trends screen** — the dashboard card is the headline, this is
  the evidence (Home menu → "True Burn trends"): the measured-burn history as
  a proper chart with the formula line for reference and
  latest/average/drift-per-week stats, the weight series with a least-squares
  kg/week trend over a 3-point smoothed line (one odd scale reading can't
  drag the trend), a logging-coverage bar ("24/60 days logged"), and the
  plateau banner with room to breathe. Trend math lives in pure
  `src/lib/trends.ts` (`check:trends`); the screen is read-only — adopting a
  measured target stays a deliberate Home action.
- **Recipe URL importer** — a **Web** tab in the meal log sheet: paste a
  recipe link and the per-serving calories and macros dock into the confirm
  card, ready to lock in like any other food. It reads the page's own
  schema.org Recipe structured data (JSON-LD) — the machine-readable block
  effectively every real recipe site publishes — and handles @graph
  wrappers, kJ energy, numeric or prose servings ("Serves 4"), and unit
  strings ("646 kcal", "1.4 g" sodium → 1,400 mg). Pages without
  machine-readable data say so honestly rather than scraping prose and
  guessing. Only the page is fetched (no trackers, nothing stored); the
  parser is pure and covered by the new `check:recipe` suite (45 cases).
- **Barcode miss caching** — a failed Open Food Facts lookup is remembered for
  5 minutes, so re-scanning the same unknown pack doesn't re-pay the
  double-endpoint wait; session-cached hits are unchanged and the negative
  entry expires so products newly added to OFF can still be found.

- **Data export** — Settings now has a "Your data" card: **Backup (JSON)** shares
  a versioned `calibreat.export.v1` bundle (profile, goals, diary, water,
  weigh-ins, workouts, saved meals) and **Diary (CSV)** shares a
  spreadsheet-ready meal log (RFC 4180, opens cleanly in Excel/Numbers/Sheets).
  Both go through the OS share sheet — no account, no upload, nothing leaves
  the device until the user picks a destination; the web preview copies to the
  clipboard and offers a download instead. Two new first-party Expo modules
  (`expo-file-system`, `expo-sharing`), no new permissions.

- **Photo label logging** — a new **Label** tab in the meal log sheet: photograph
  the nutrition panel and its values dock into the confirm card, read entirely on
  device. Handles UK (per-100g, kJ, salt) and US (serving, Calories, sodium mg)
  layouts, "of which saturates/sugars" sub-nutrients, wrapped values, and
  OCR-corrupted characters; results are graded so incomplete reads say so
  instead of guessing. Photos are never uploaded; under Expo Go/web the tab
  explains it needs the installed app.
- **Performance pass** — the Home streak ticker now wakes once a minute (was
  every 15 seconds, re-rendering the whole SVG dashboard each tick) and a
  one-shot timer flips the flame at the exact claim-window moment; food search
  no longer retries Open Food Facts before failing, halving the worst-case
  wait on a dead connection from ~16s to ~8s (generic foods are already on
  screen; re-tap Search to retry); the JSON backup ships compact instead of
  pretty-printed so big diaries share faster.
- **Saved meals** — name a meal once ("Usual breakfast") and the slot's entries are
  stored under that name; one tap re-logs the whole group into any day and meal slot.
  A single favourite food is a one-item saved meal, so there is one concept rather than
  two. Saving a name that already exists **updates it in place** instead of silently
  duplicating it, and a long-press removes a chip.
- **Copy yesterday's <slot>** — offered in the log sheet when that slot had entries the
  day before ("3 items · 535 kcal · from Salmon fillet + 2 more"), for the days you log
  nothing at all.
- Both are **local-only and need no new permissions** — the logic lives in
  `src/lib/saved-meals.ts` (pure, no database or React) with identical storage in
  `db.ts` / `db.web.ts`, covered by the `check-meals` suite.

## beta v0.0.3 — True Burn Learning

**Theme:** the app stops trusting a formula forever and starts learning *your* burn.

- **Fixed water goal at 4,000 ml/day** for peak muscle gain and creatine users (was 45 ml/kg). Same target for everyone — the tube and % bar now fill against 4 L (1 L = 25%).
- **Supplement picker added to setup** (new step 7 of 8, before the targets summary): multi-select chips for Creatine, Whey Protein, Ashwagandha, Vitamin D3, Omega-3, Multivitamin, Pre-Workout, BCAA/EAA, Magnesium, plus `None`. Stored on the profile as `supplements: string[]` (SQLite JSON column with migration for existing installs). Creatine shows a hydration pacing hint.
- **True Burn Learning (Feature 1)** — the standout differentiator:
  - New local tables `weigh_ins` (kg + measured_at) and `day_intake` (day_key + kcal) in `db.ts` / `db.web.ts` so the app can learn from real weight + intake logs.
  - Adaptive TDEE in `nutrition.ts`: given a weigh-in window it compares predicted vs actual weight change and nudges your TDEE, surfaced as "Measured burn: 2,680 vs estimated 2,450" — the dial stops being static.
  - Home wiring: weigh-in entry, calorie quick-log, and an adaptive card so the instrument actually gets smarter every week.
- **Water total now editable** — tap the water read-out to correct the day's total via a modal (Save/Clear/Cancel), backed by `setWaterForDay()`.
- **Menu → Settings** sheet with toggles (Daily reminders, Haptics, Weigh-in reminders) and an account footer showing email + "Activated" status.

## beta v0.0.2 — Instrument dashboard

- Rebuilt home as a calibration-instrument panel: circular DAILY CALIBRATION dial, macro arc gauges, water fill-tube, weight horizon — no more "card per metric" tracker look.
- Water input fixed to visible stacked layout, unit toggle (ml/cups), add flow + pulse.
- Calendar sheet polished: Monday-start grid, future-date dimming, Today/Done, correct alignment for Sept 2026.

## beta v0.0.1 — Locked foundation

- Expo + expo-router + TypeScript scaffold, dark/light theming, brand tokens.
- Welcome/lock screen with three-step gate: email → OTP → license code (1 device per account), release builds fail closed without `EXPO_PUBLIC_LICENSE_API_URL`.
- Home placeholder behind the lock with license summary + deactivate; profile & goals setup wizard.

---

### How to read this

Each entry is the user-visible story, not a commit list. For the engineering detail, see `PLAN.md` (roadmap) and the per-version notes above.
