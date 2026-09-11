# calibrEAT — Journey Log

A readable history of how calibrEAT was built — kept in markdown so it can be shared as-is.

Current version: **beta v0.0.3** · `apps/mobile` `v0.0.3` · Last updated: 2026-03-31

---

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
