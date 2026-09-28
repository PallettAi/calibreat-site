# calibrEAT — Journey Log

A readable history of how calibrEAT was built — kept in markdown so it can be shared as-is.

Current version: **beta v0.0.4** · `apps/mobile` `v0.0.4` (versionCode 5) · Last updated: 2026-09-28
Next: **beta v0.0.5** (versionCode 6) — written, not yet built.

---

## beta v0.0.5 — Your data can leave the phone, and come back

**Theme:** nothing you log is trapped. A backup you can read back, a diary you
can bring with you from the app you left, and a day or a week you can show
someone — all without an account, and all on the device.

- **Import your diary from MyFitnessPal or Cronometer** — the last barrier to
  buying a *lifetime* tracker instead of subscribing to another one. Everyone
  arriving here is coming from somewhere, usually with a year of history in it,
  and "start again from zero" is the reason people quietly never switch.
  Settings → "Import from another app…" reads the CSV those two apps export
  and **adds** those days to the diary you already have. It never replaces it:
  a diary file carries no weigh-ins or workouts, so there is nothing in it that
  should cost you yours, and the replace option is hidden rather than left
  sitting there waiting to be tapped.
  The import goes through the *same* validator, preview, de-duplication and
  single transaction as a backup restore, so the two can never drift apart, and
  the preview shows what will change before anything is written. Re-importing
  the same file adds nothing, so it is safe to try, dislike, and try again.
  It is deliberately hard to get this quietly wrong: a blank cell in a macro
  column stays *unknown* rather than becoming a confident zero; a comma is read
  as a thousands separator or a decimal point according to which the cell can
  actually support, so a UK Excel save (semicolon-separated, comma decimals)
  works as well as a machine export; quoted commas in food names, the BOM Excel
  adds, and Windows line endings are all handled; and unreadable rows are
  counted and shown to you before you commit rather than quietly dropped.
  The one genuinely dangerous judgement — D/M/Y against M/D/Y, which silently
  moves a whole year of meals onto the wrong days — is decided by looking
  across the entire file rather than row by row, and when the file genuinely
  cannot decide, the preview says which reading it used and offers you the
  other before anything is written.
  All local, no account, nothing uploaded; logic in `src/lib/import-diary.ts`
  (pure, `check:import` — 111 checks, including the handoff into the backup's
  validator and drift guards on the limits it mirrors).

- **Restore from a backup** — the export that shipped last release could hand
  you a complete JSON backup, but nothing could read one back. In an app sold
  as a *lifetime* unlock, that is the wrong gap to leave open: a lost, wiped
  or replaced phone is exactly when someone finds out the "your data stays on
  your phone" promise was only half-kept — and it is the answer to "will you
  still be here in two years", because the backup outlives the install.
  Settings → "Restore from a backup…" picks a file through the system
  document picker, checks it, and shows **exactly what will change before
  anything is written**. "Add to my data" (the default) merges and skips rows
  already on the device — importing the same file twice changes nothing, and
  two phones' logs can be combined. "Replace everything" clears the device
  first, which is the honest way to put a new phone back the way the old one
  was, and the warning is spelled out next to the choice rather than left in
  fine print.
  Meals come back on the day they were logged, with their original
  timestamps — the reason this could not reuse the ordinary add path, which
  stamps every entry "now" and would have landed a year of meals on today.
  Nothing is dropped quietly: unreadable rows are counted in the confirmation
  before you commit, a missing or impossible date is recovered from the
  timestamp, and a backup from a future app version is refused outright rather
  than half-read. Targets are recomputed by the current formula rather than
  frozen from whichever version wrote the file.
  All local, no new permission, nothing sent anywhere. On the phone the whole
  write — the clears, all five row types and the profile — is one SQLite
  transaction, so a failure part-way through leaves the diary exactly as it
  was. The browser preview has no such guarantee (localStorage cannot
  transaction) and says so in the code rather than pretending; the APK is the
  product, and the APK is atomic.
  Logic in `src/lib/restore.ts` (pure, `check:restore` — 61 checks including
  drift guards on the constants it mirrors), file picking in
  `restore-file.ts` / `.web.ts`.

- **Daily recap card — "yesterday, calibrated"** — the day is the new share
  moment: the first Home visit after midnight offers a recap of the most
  recent *closed* day, once per day (a small AsyncStorage flag; "Not now"
  dismisses it for that day and it never returns as a nag). The card draws
  the app's thesis: the **calorie equation** — goal + Train − food = left
  (or over) — as a budget bar plus a leader-dot table, with the remaining
  figure as the display numeral and the True Burn note when the dial is
  running on the measured target. Same copy contract as the weekly card
  (behaviour, never bodies; the site URL appears exactly once) enforced by a
  new `check:share-daily` suite; the card builds on the weekly system's
  budgeted layout maths (`shareLayout`, `specklePaths`, shared QR module) and
  captures through the same on-device PNG → share-sheet path, so nothing
  about the day ever touches a server.

- **Growth loop: weekly share card** — Trends gains a **Share week** button
  and the streak sheet a share row, so the card lives at the highest-
  frequency moment in the app (the daily claim). It renders the week
  (logging streak, coverage, measured True Burn drift with a sparkline)
  into a branded 1080×1350 image with an on-device **QR code** to the site,
  so the loop works even where links aren't clickable — stories, screenshots
  of screenshots. The copy rules are the contract: it celebrates
  *behaviour* — never weight before/after framing, no moralizing — and a
  broken run is shared as a "best logging run", not a failure; the site
  link appears exactly once. Content logic is pure (`check:share`, including
  finder/alignment-pattern checks on the QR matrix); capture uses
  `react-native-view-shot` → cache PNG → `expo-sharing`, no new permissions
  and nothing about a user's week ever touches a server.

- **First-scan onboarding** — finishing setup now lands on Home with the meal
  sheet already open on the **barcode viewfinder**, so the first session's
  aha moment is scanning a real pack rather than facing a form. Consumed once
  via a `?first=1` handoff from setup; every later sheet open defaults to the
  Search tab as before.

- **APK waitlist** — while the APK link is still being finalized, the download
  page captures demand instead of dead-ending: an email form POSTs to the
  new `POST /v1/notify` endpoint on the license Worker, which stores the
  signup in the Durable Object, dedupes by email (re-signing up updates the
  source and never re-sends the confirmation), and emails a confirmation so
  subscribers know they're on the list. There is no IP rate limit on this
  endpoint — the abuse ceiling is one row and one email per *address*, which
  is stated here rather than dressed up as throttling. Covered by API tests.
- **Landing-page conversion assets** — a hero price-contrast line, a
  "what a year of tracking actually costs" bar visual (subscription prices
  ×12 from the existing compare table — calibrEAT is the short bar with
  "year two costs £0.00"), and an honest savings line on the buy card. No
  fabricated testimonials — the social proof is the math.

- **License database backups** — the license service now exports every license
  and activation to R2 daily (03:00 UTC cron), so a lost Durable Object can
  never take the customer record with it; `GET /v1/admin/export` returns the
  same snapshot by hand. Codes are stored hashed, so backups are inert.

- **BMI is an instrument now, not a big number** — the last screen still using
  the old "card with a numeral in it" treatment gets the app's dial: a
  four-band arc on the same 266° sweep as the Home gauges, a leader dot on
  where you actually are, and the reading held in the middle. Underneath it,
  the healthy range for your height shaded on a bar with a marker for your
  weight — because BMI is weight rescaled by height, so at a fixed height it
  is a monotone function of weight and nothing more, and the kilogram is the
  version of this number you can actually act on.
  **There is deliberately no green-to-red ramp**, and the reason is written
  into the module header so nobody "fixes" it later: this app does not
  moralise about weight, and a dial that reddens as the number climbs says
  the thing the product has committed never to say. The bands are told apart
  by position and tick marks, one accent colour marks only where you are, and
  the screen keeps the plain statement that this is an index and not a
  diagnosis. Geometry is pure and standalone in `src/lib/bmi-gauge.ts`
  (`check:bmi` — 43 checks, including a drift guard against `bmiBand` in
  `nutrition.ts`, which stays the authority for what a band *means*).

- **The welcome screen finally looks like the product it is selling** — the
  activation gate was the one screen with no instrument language in it at all:
  a logo, a form and a checklist, which is the default shape of every calorie
  app's front door and says nothing about the two claims that actually
  differentiate this one. It now carries a **spec plate** above the checklist —
  `LIFETIME / ON-DEVICE / TRUE BURN`, set in the same mono, hairline-ruled
  layout as the rest of the instrument family, stating facts rather than
  adjectives, because "one payment" and "your data stays put" are exactly the
  two claims a competitor could copy in a sentence and the whole reason the
  price is defensible.
  The privacy sentence also stopped being a feature. It used to be the fourth
  bullet in the list, behind a green checkmark — a disclosure wearing the
  decoration of a feature, which lends it a confidence the other bullets are
  earned and the reader is meant to feel. It is now plain fine print, phrased
  for what it is: nothing about your eating is collected, and only the signup
  email is held, in a third-party database, so the license can reach you.

- **The license sheet proves the promise instead of restating it** — the screen
  a *lifetime* buyer opens is the one asking "does this actually last?", and it
  was answering with a code and a device name. It now carries the same plate
  as the welcome screen — `RENEWS / DEVICES / ACTIVATED` — because a promise
  made at the door deserves the same three words when someone comes back to
  check it. The row that matters is the date: `LicenseState` already stored
  `activatedAt` and the sheet was not showing it, so the screen was repeating
  marketing to someone already holding the thing they paid for. With the
  activation date on it, the other two rows are checkable rather than claimed.
- **Setup's progress bar now follows the theme** — the wizard's filled segments
  were hardcoded to `Brand.primary`, so in dark mode they stayed a mid green
  while every other accent in the app went bright lime. It now takes the same
  light/dark accent as the Home and Trends gauges, via a third `accent` tone
  distinct from `accentText` (which has to clear AA for type and so cannot be
  reused for fills).
- **The water sheet grew the tube Home already had** — Home shows water as a
  fill tube, and the sheet where you actually *set* it was showing the total
  and the goal as two numbers with nothing drawn between them, which is the
  same bare-numeral problem the BMI screen had. It now fills to the goal,
  clamped, with a goal of zero treated as "no target" rather than dividing by
  it. Water keeps its own blue rather than borrowing the calorie green: it is
  a different quantity, and the green accent is spent, not filled.

## beta v0.0.4 — Logging without the friction

**Theme:** the app stops making you re-type the meals you eat every day.

- **Half the download** — the APK was shipping all four CPU architectures
  (including two x86 variants only emulators use) at 179 MB. It now builds for
  the two ABIs real phones run (arm64 + 32-bit arm): **95 MB** installed, 47%
  smaller.

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
