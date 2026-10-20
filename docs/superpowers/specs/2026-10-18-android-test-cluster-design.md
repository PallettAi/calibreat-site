# Android test cluster — Health Connect, Train v2, week bank, widgets

Date: 2026-10-18

## Job

Ship four features on one calorie kernel so an Android APK can be tested as a MyFitnessPal alternative without subscriptions: **Health Connect**, **Train v2** (routines + per-set log), **Monday–Sunday calorie bank**, **home-screen widgets**. Food logs stay on-device. No in-app purchases.

This document is the contract. Implementation follows only after it is accepted.

## Decisions already locked

| Topic | Choice |
| --- | --- |
| Architecture | One pure JS calorie kernel; Android adapters for Health Connect and widgets; web/iOS no-ops |
| Extra-burn source | Health Connect when connected **and** the day has real activity; otherwise Train MET; otherwise none. Dial and widget name the source |
| Eat-back | Surplus only. Measured active kcal minus assumed activity (`TDEE − BMR`). Does not add a full session on top of TDEE |
| Week | Calendar Monday–Sunday in the device local timezone (same `dayKey` as the diary) |
| Bank math | Leftover week pool ÷ days left including today, clamped to `baseTarget ± 400` |
| Surplus cap | 400 kcal |
| Train v2 | Named routines, per-set weight/reps, rest between sets, PRs, weekly muscle volume, last-session preload |
| Monetization | Lifetime license already in the app. No IAP, ads, or gated “premium” inside these features |

Assumed activity uses the stored goals row (`tdee - bmr`), not a re-derived profile, so True Burn adopt and setup stay the source of `baseTarget` and of the activity already paid for.

## Non-goals (this cluster)

- Writing workouts, weight, or nutrition into Health Connect
- Auto-importing Health Connect weight (weigh-ins stay manual)
- Using steps in remaining-calorie math (steps may show on Train/Home as context only)
- iOS HealthKit
- Warmup sets, supersets, RPE, videos, periodized programs
- Expo Go support for Health Connect or widgets (dev-client / EAS APK only)
- Cloud sync of diary or workouts
- Changing the license gate

## 1. Calorie kernel

Three pure modules under `apps/mobile/src/lib`, no React, no native APIs. Check scripts in `apps/mobile/scripts/`. Home, macros, trends, Train copy, and the widget snapshot **only** read `DayBudget`. They must not add workout kcal themselves.

### 1.1 `activity-burn.ts`

Inputs per day:

- `connected`: Health Connect permission currently granted (false on web/iOS)
- `hcActiveKcal`: sum of Health Connect **active** calories for the local day (not total calories burned)
- `hcExerciseCount`: exercise sessions that day with duration ≥ 5 minutes
- `trainMetKcal`: MET estimate from completed Train sets that day (existing `sessionKcal` math, summed)

Noise floor for “real activity”: `hcActiveKcal >= 75` **or** `hcExerciseCount >= 1`.

Source selection:

1. `connected && realActivity` → `{ kcal: hcActiveKcal, source: 'health-connect' }`
2. else if `trainMetKcal > 0` → `{ kcal: trainMetKcal, source: 'train' }`
3. else → `{ kcal: 0, source: 'none' }`

Surplus:

```
assumedActive = max(0, tdee - bmr)
surplus = clamp(measuredKcal - assumedActive, 0, 400)
```

If `tdee` or `bmr` is missing, surplus is 0 (no fake eat-back).

### 1.2 `week-bank.ts`

Week is ISO-style Monday start in local time, keys as existing `dayKey()` (`YYYY-MM-DD`).

- `weekPool = 7 * baseTarget`
- `foodToDate` = sum of diary kcal from Monday through **today** (inclusive)
- `leftover = weekPool - foodToDate`
- `daysLeft` = 1 + days from tomorrow through Sunday (Monday = 7, Sunday = 1)
- `rawToday = leftover / daysLeft`
- `bankedToday = clamp(round(rawToday), baseTarget - 400, baseTarget + 400)`
- Then `bankedToday = clamp(bankedToday, 0, leftover)` so a blown week shows 0 remaining from the bank (not a fake `baseTarget - 400`), and today cannot be promised more kcal than leftover. Surplus eat-back is added after this, in `day-budget.ts`.

`baseTarget` is the True Burn override if set, else stored `goals.calorieTarget`. Monitor goal still has that stored target (TDEE); the bank uses it.

Food eaten **today** is inside `foodToDate`, so logging lunch immediately reduces leftover and today’s remaining. That is intended.

### 1.3 `day-budget.ts`

```
todayTarget = bankedToday + surplus
remaining = todayTarget - todayFood
```

Returned object (names may be typed more tightly in code):

- `baseTarget`, `todayTarget`, `remaining`, `surplus`
- `burnSource`: `health-connect` | `train` | `none`
- `measuredActiveKcal`
- `weekLeftover` (`weekPool - foodToDate`)
- `daysLeft`
- `sourceLabel` for UI: `Health Connect` | `Train estimate` | `''`

**Monitor / Just monitor:** same math. The dial already shows a number; the bank does not hide it.

**Safety:** `todayTarget` stays inside 800–6000 after surplus (same band as the True Burn override clamp). Remaining may be negative (over budget).

Home copy today says trained kcal is “already inside this target”. Replace that with the source label plus surplus when surplus > 0 (“+120 kcal from a bigger-than-usual day”), and with “inside your usual activity” when surplus is 0.

## 2. Health Connect adapter

Android-only module pair: `health-connect.ts` (native) and `health-connect.web.ts` (always disconnected). No new server routes. No diary data leaves the device.

### 2.1 Reads

| Record | Use |
| --- | --- |
| Active calories burned | Kernel `hcActiveKcal` |
| Exercise session | Count for real-activity test; list on Train as “from Health Connect” (read-only, not editable) |
| Steps | Optional Home/Train footnote only |

Do not read or write nutrition, weight, or hydration.

### 2.2 Permission

Settings row **Health Connect**, off by default.

- First on: request the three read permissions. Denied → stay off, Train fallback, no nag loop.
- Health Connect missing (old Play-less device): copy explains that Android 14+ (or the Health Connect app) is required. Kernel stays on Train/none.
- Disconnect: stop reading; keep cached `activity_days` for history; kernel immediately uses Train fallback.

### 2.3 Cache

SQLite `activity_days`:

- `day_key TEXT PRIMARY KEY`
- `active_kcal INTEGER NOT NULL`
- `exercise_count INTEGER NOT NULL`
- `steps INTEGER`
- `fetched_at TEXT NOT NULL`

Refresh: app foreground, after a Train save, before writing the widget snapshot. Fetch the current local day plus the open week (Mon–today). Timeouts fail open: keep last cache, source may drop to Train.

Do not put Health Connect payloads in backups (they re-fetch). Export stays food/workouts/profile.

### 2.4 Library

`react-native-health-connect` plus the Expo config plugin / Android manifest queries. Release APK must declare Health Connect permissions and the privacy rationale already used for camera: **on-device, not uploaded**.

## 3. Train v2

Muscle map, equipment tabs, MET table, and Eat/Train switch stay. The log becomes a **session of sets**, not one aggregated row.

### 3.1 Schema

New tables (names indicative):

**`lift_sessions`** — one gym visit  
`id`, `day_key`, `routine_id` nullable, `started_at`, `ended_at` nullable

**`lift_sets`** — one performed set  
`id`, `session_id`, `exercise_id`, `set_index`, `weight_kg`, `reps`, `kcal` (MET share for that set), `completed_at`

**`lift_routines`**  
`id`, `name`, `created_at`

**`lift_routine_items`**  
`id`, `routine_id`, `exercise_id`, `sort`, `default_sets`

Keep `workout_sessions` until migration runs, then stop writing it. `db.web.ts` mirrors the same API.

Limits: 20 routines, 15 exercises per routine, 30 sets per exercise per session (existing set clamp). Routine name max 40 chars.

### 3.2 Migration

Each existing `workout_sessions` row becomes one `lift_sessions` row plus `sets` copies of the same `weight_kg` / `reps`. Split `kcal` across those sets (remainder on the last set) so daily Train MET is unchanged. `volume_kg` / `e1rm_kg` become derived, not stored.

Restore of `calibreat.export.v1` workout arrays uses the same expansion. New export schema `calibreat.export.v2` writes sessions, sets, and routines. v2 restore must still accept v1 workout rows.

### 3.3 UI

- Train top: **Routines** chips (empty state: “Save today’s lifts as a routine” after first session) then the existing muscle map + lift list.
- Starting a routine (or picking the first lift) opens an in-session list: exercises in order, each with per-set rows (weight, reps, check to complete). Completing a set starts the existing rest countdown (`restSecFor`).
- Last completed set for that exercise pre-fills the next blank row. New exercise pre-fills from the previous session (latest `lift_sets` for that id).
- Add / skip exercise from the muscle map without leaving the session.
- End session writes `ended_at`. Incomplete trailing empty rows are dropped.
- PRs: max weight at the same reps, and max Epley e1RM, shown on the selected lift. Weekly volume lights the muscle map using summed `weight × reps` for the current week (bodyweight 0 still contributes no volume, same as today).
- Health Connect exercise sessions that day appear as a read-only list under the map, labelled so they are not mistaken for Train sets.

MET kcal for the kernel is the sum of set `kcal` for `day_key`. Duration math stays `sessionDurationSec` / `sessionKcal` but attributed per completed set.

## 4. Widgets (Android)

One widget family, two sizes, via `react-native-android-widget` (or equivalent Expo config plugin if that package cannot target SDK 57 at implementation time — swap is allowed, snapshot contract is not).

| Size | Shows |
| --- | --- |
| Small | Remaining kcal, compact |
| Medium | Remaining kcal, protein eaten / goal, water vs goal, fast elapsed if a fast is running, source label if not `none` |

Tap opens the app (`calibreat://home`). No logging from the widget in this cluster (no permission surface, no half-written diary rows).

### 4.1 Snapshot

App writes `widget-snapshot.json` (app files dir) whenever `DayBudget` inputs change: diary, water, goals, True Burn override, Train sets, Health Connect cache, fasting store, protein totals.

Shape (versioned):

```
{
  "v": 1,
  "remaining": number,
  "proteinG": number,
  "proteinGoalG": number,
  "waterMl": number,
  "waterGoalMl": number,
  "fastElapsedSec": number | null,
  "sourceLabel": string,
  "updatedAt": string
}
```

If the license is locked, snapshot remaining is omitted and the widget shows “Activate calibrEAT”. Widgets are Android-only; web has no widget.

Update on write and on app foreground. No background Health Connect poll just for the widget; a stale snapshot until next open is acceptable for v1.

## 5. Surfaces that change

- **Home dial:** remaining from `DayBudget`; surplus / source line; week leftover + days left on the calorie card (one line, not a new screen).
- **Settings:** Health Connect toggle; widget hint (“Add the calibrEAT widget from your home screen”).
- **Export/restore:** schema v2 as in §3.2. Activity cache not included.
- **Privacy copy:** Health Connect reads activity on this device only, never uploaded. Add a sentence to in-app settings and to `apps/web` privacy if that page lists sensors (camera already listed).

## 6. Error handling

| Case | Behaviour |
| --- | --- |
| Health Connect timeout / error | Keep cache; if today missing, `connected` still true but `realActivity` false → Train fallback; no crash |
| Permission revoked in system settings | Next refresh treats as disconnected |
| Widget snapshot missing | Widget shows “Open calibrEAT” |
| Routine name empty / duplicate | Reject; duplicates allowed only with distinct ids, display names need not be unique |
| Migration interrupted | Idempotent: skip `workout_sessions` rows whose `logged_at`+exercise already exist as a migrated session (store `schema_meta` `lift_migrated=1` after success) |

## 7. Testing

Logic suites (Node, existing `check-*.mjs` pattern):

- `check-activity-burn.mjs` — source selection, noise floor, surplus cap, missing TDEE
- `check-week-bank.mjs` — Mon/Sun leftover, clamp ±400, over-eaten week, timezone-stable `dayKey` fixtures
- `check-day-budget.mjs` — composition, 800–6000 clamp, home-copy cases (surplus 0 vs >0)
- Extend `check-workout` / restore / export for per-set migration and v1→v2 bundles

Device checklist (Android APK / dev client, not Expo Go):

1. Grant Health Connect; walk; confirm source label and surplus only if walk exceeds assumed activity
2. Airplane gym session with Health Connect still “on” but no new active calories → Train estimate
3. Disconnect Health Connect → Train estimate without reinstall
4. Log a routine of 3 lifts, per-set rest, PR after a heavier set, relaunch preloads last weights
5. Eat under budget Mon–Tue; Wednesday remaining rises but not more than +400 vs base
6. Add small and medium widgets; remaining matches Home after a meal log
7. Locked license: widget CTA, app still gated

Web preview: kernel + Train v2 + week bank work; Health Connect settings row says unavailable; no widget.

## 8. Implementation order

1. Kernel + tests (no UI)
2. Home/Settings wiring to kernel (week line + source copy), Train MET still only as fallback
3. Train schema migration + per-set UI + routines
4. Health Connect adapter + cache + settings
5. Widget snapshot + Android widgets
6. Export v2 + privacy sentence + APK smoke list in `docs/android-release.md`

Each step must keep `npm run check` green. Native steps 4–5 require an EAS/dev-client build to verify.

## 9. Product copy (fixed wording)

- Source: `Health Connect` / `Train estimate`
- Surplus > 0: `+{n} kcal from a bigger-than-usual day`
- Surplus = 0 and source ≠ none: `Activity is inside your usual target`
- Week: `{leftover} kcal left this week · {daysLeft} days`
