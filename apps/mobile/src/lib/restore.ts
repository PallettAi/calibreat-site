/**
 * Restoring a backup — the other half of "your data stays on your phone".
 *
 * Export (src/lib/export.ts) has been able to hand a user a complete
 * `calibreat.export.v1` bundle since beta v0.0.4, but nothing could read one
 * back. That is a bad gap to leave in an app sold as a *lifetime* unlock: the
 * whole promise is that six months of logs survive, and a phone that is lost,
 * wiped or replaced is exactly when the user finds out the promise was only
 * half-kept. Restoring is also the answer to "will you still be around in two
 * years" — the backup outlives the install.
 *
 * Everything here is pure: no database, no React, no platform branch, so the
 * parsing, validation, de-duplication and copy can all be checked in CI
 * (scripts/check-restore.mjs) and the two storage twins (db.ts / db.web.ts)
 * can share one definition of what a restore actually does.
 *
 * Two decisions worth knowing before reading the code:
 *
 * 1. **Timestamps are data, not metadata.** Rows come back with the original
 *    `day_key` and `logged_at` intact, and ids are dropped — the old ids belong
 *    to a different database and would collide. This is also why restore cannot
 *    reuse `addLogEntry`, which stamps `logged_at` as *now* and would land a
 *    year of meals on today.
 *
 * 2. **Nothing is dropped silently.** A row the parser cannot make sense of is
 *    counted and reported to the user rather than quietly discarded, and
 *    de-duplication (merge mode re-importing the same file) is reported too.
 *    Quietly losing someone's data is how a backup feature loses trust.
 *
 * NOTE ON IMPORTS: this module deliberately has no runtime imports. The check
 * script runs it through Node's `--experimental-strip-types`, which erases
 * `import type` but cannot resolve an extensionless *value* import (a `@/…`
 * alias certainly not) — so every module that CI loads is standalone by
 * necessity, and src/lib/export.ts, trends.ts and usda.ts follow the same
 * rule. The handful of constants duplicated below are pinned to their
 * canonical home by check-restore.mjs, which loads both files and fails if
 * either ever drifts.
 */

import type { MealSlot } from './diary';
import type {
  ExportBundle,
  ExportLogEntry,
  ExportSavedMeal,
  ExportWeighIn,
  ExportWaterEntry,
  ExportWorkout,
} from './export';

/** Mirrors EXPORT_SCHEMA in src/lib/export.ts. */
const EXPORT_SCHEMA = 'calibreat.export.v1';
/** Mirrors SAVED_MEAL_LIMIT in src/lib/saved-meals.ts. */
const SAVED_MEAL_LIMIT = 30;
/** Mirrors SAVED_MEAL_MAX_ITEMS in src/lib/saved-meals.ts. */
const SAVED_MEAL_MAX_ITEMS = 25;

/** Mirrors MEAL_SLOTS in src/lib/diary.ts. */
const MEAL_VALUES = new Set<string>(['breakfast', 'lunch', 'dinner', 'snack']);

/** Mirrors localDayKey in src/lib/dates.ts — the device's local YYYY-MM-DD. */
function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Biggest backup we will read. Past this the user picked the wrong file, or
 *  their phone is out of memory — either way, an honest refusal beats a crash. */
export const RESTORE_MAX_BYTES = 25 * 1024 * 1024;

/** Row-count backstop, in case a hand-written file is enormous but under the
 *  byte cap. Real six-figure-row histories are far below this. */
export const RESTORE_MAX_ROWS = 250_000;

export type RestoreMode = 'merge' | 'replace';

/** Rows to insert: the export shape minus `id`, which is the old device's.
 *  The four micro nutrients are required-but-nullable rather than optional,
 *  because the parser always fills them and a SQL bind parameter cannot be
 *  `undefined`. */
export type RestoredLogEntry = Omit<ExportLogEntry, 'id' | 'fiberG' | 'sugarG' | 'satFatG' | 'sodiumMg'> & {
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
};
export type RestoredWeighIn = Omit<ExportWeighIn, 'id'>;
export type RestoredWaterEntry = Omit<ExportWaterEntry, 'id'>;
export type RestoredSavedMeal = Omit<ExportSavedMeal, 'id'>;
/** Same, but the three lift figures are required rather than optional: the
 *  parser always fills them (0 when the source omitted them), which is what
 *  lets them go straight into a SQL bind parameter. */
export type RestoredWorkout = Omit<ExportWorkout, 'id' | 'weightKg' | 'volumeKg' | 'e1RMKg'> & {
  weightKg: number;
  volumeKg: number;
  e1RMKg: number;
};

/** A parsed backup: an export bundle with the device-specific ids taken back
 *  out. It is deliberately *not* typed as ExportBundle — nothing downstream
 *  may assume the old ids survived. */
export type RestoreBundle = Omit<
  ExportBundle,
  'logEntries' | 'weighIns' | 'water' | 'workouts' | 'savedMeals'
> & {
  logEntries: RestoredLogEntry[];
  weighIns: RestoredWeighIn[];
  water: RestoredWaterEntry[];
  workouts: RestoredWorkout[];
  savedMeals: RestoredSavedMeal[];
};

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ── Field coercion ──────────────────────────────────────────────
 * Every value in a backup crossed a JSON boundary the app did not control, so
 * it is treated as unknown. Numbers are the one place where a bad value costs
 * us the whole row (a meal with no calories is not a meal); a bad macro is
 * merely set to null, because losing the fibre figure is better than losing
 * the lunch. */

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asKcal(value: unknown): number | null {
  const n = asFiniteNumber(value);
  return n === null || n < 0 ? null : Math.round(n);
}

function asGrams(value: unknown): number | null {
  const n = asFiniteNumber(value);
  return n === null || n < 0 ? null : Math.round(n * 10) / 10;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isValidDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Round-trips only for a real calendar date, so 2026-02-31 is rejected.
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function asIso(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/* ── Parsing ───────────────────────────────────────────────────── */

export type RestoreParse =
  | { ok: true; bundle: RestoreBundle; warnings: string[] }
  | { ok: false; message: string };

/** Resolve a day key, recovering it from the timestamp when the bundle is
 *  missing or malformed. A one-day-off recovery beats discarding the row, and
 *  the caller reports that it happened. */
function resolveDayKey(raw: unknown, loggedAt: string | null, recovered: { value: boolean }): string | null {
  const text = asText(raw);
  if (text && isValidDayKey(text)) return text;
  if (loggedAt) {
    recovered.value = true;
    return localDayKey(new Date(loggedAt));
  }
  return null;
}

function parseLogEntry(raw: unknown, recovered: { value: boolean }): RestoredLogEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const mealText = asText(source.meal);
  if (!mealText || !MEAL_VALUES.has(mealText)) return null;

  const kcal = asKcal(source.kcal);
  if (kcal === null) return null;

  const loggedAt = asIso(source.loggedAt);
  const dayKey = resolveDayKey(source.dayKey, loggedAt, recovered);
  if (!dayKey) return null;

  return {
    dayKey,
    meal: mealText as MealSlot,
    name: asText(source.name),
    kcal,
    proteinG: asGrams(source.proteinG),
    carbsG: asGrams(source.carbsG),
    fatG: asGrams(source.fatG),
    fiberG: asGrams(source.fiberG),
    sugarG: asGrams(source.sugarG),
    satFatG: asGrams(source.satFatG),
    sodiumMg: asGrams(source.sodiumMg),
    // A row with no usable timestamp is still worth keeping — it keeps the
    // calories and lands on the day its day_key says — so it gets "now" only
    // as a last resort.
    loggedAt: loggedAt ?? new Date().toISOString(),
  };
}

function parseWeighIn(raw: unknown, recovered: { value: boolean }): RestoredWeighIn | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const kg = asFiniteNumber(source.kg);
  // A body weight outside this range is a unit mistake (lbs entered as kg),
  // not a real measurement, and it would wreck every trend line downstream.
  if (kg === null || kg <= 0 || kg > 700) return null;

  const measuredAt = asIso(source.measuredAt);
  const dayKey = resolveDayKey(source.dayKey, measuredAt, recovered);
  if (!dayKey) return null;

  return {
    kg: Math.round(kg * 10) / 10,
    measuredAt: measuredAt ?? new Date().toISOString(),
    dayKey,
  };
}

function parseWaterEntry(raw: unknown, recovered: { value: boolean }): RestoredWaterEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const ml = asKcal(source.ml);
  if (ml === null || ml <= 0) return null;

  const loggedAt = asIso(source.loggedAt);
  const dayKey = resolveDayKey(source.dayKey, loggedAt, recovered);
  if (!dayKey) return null;

  return { dayKey, ml, loggedAt: loggedAt ?? new Date().toISOString() };
}

function parseWorkout(raw: unknown, recovered: { value: boolean }): RestoredWorkout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const exerciseId = asText(source.exerciseId);
  if (!exerciseId) return null;

  const sets = asKcal(source.sets);
  const reps = asKcal(source.reps);
  const kcal = asKcal(source.kcal);
  if (sets === null || reps === null || kcal === null) return null;

  const loggedAt = asIso(source.loggedAt);
  const dayKey = resolveDayKey(source.dayKey, loggedAt, recovered);
  if (!dayKey) return null;

  const weightKg = asGrams(source.weightKg) ?? 0;
  const volumeKg = asGrams(source.volumeKg) ?? 0;
  const e1RMKg = asGrams(source.e1RMKg) ?? 0;

  return { dayKey, exerciseId, sets, reps, kcal, weightKg, volumeKg, e1RMKg, loggedAt: loggedAt ?? new Date().toISOString() };
}

function parseSavedMeal(raw: unknown): RestoredSavedMeal | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const name = asText(source.name);
  if (!name) return null;

  const mealText = asText(source.meal);
  if (!mealText || !MEAL_VALUES.has(mealText)) return null;

  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items: RestoredSavedMeal['items'] = [];
  for (const rawItem of rawItems) {
    if (typeof rawItem !== 'object' || rawItem === null) continue;
    const item = rawItem as Record<string, unknown>;
    const kcal = asKcal(item.kcal);
    // A saved meal is a shortcut to re-logging; an item we cannot price would
    // quietly log less than the user expects, so it is left out — and the
    // caller reports the meal as dropped rather than half-restored.
    if (kcal === null) continue;
    items.push({
      name: asText(item.name),
      kcal,
      proteinG: asGrams(item.proteinG),
      carbsG: asGrams(item.carbsG),
      fatG: asGrams(item.fatG),
      fiberG: asGrams(item.fiberG),
      sugarG: asGrams(item.sugarG),
      satFatG: asGrams(item.satFatG),
      sodiumMg: asGrams(item.sodiumMg),
    });
  }
  if (!items.length) return null;
  if (items.length > SAVED_MEAL_MAX_ITEMS) return null;

  return { name, meal: mealText as MealSlot, items, createdAt: asIso(source.createdAt) ?? new Date().toISOString() };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseProfile(raw: unknown): ExportBundle['profile'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const heightCm = asFiniteNumber(source.heightCm);
  const weightKg = asFiniteNumber(source.weightKg);
  const ageYears = asFiniteNumber(source.ageYears);
  // Without height, weight and age there is no profile to restore — the
  // targets are derived from them, so a partial one would be a wrong one.
  if (!heightCm || !weightKg || !ageYears) return null;
  if (heightCm <= 0 || weightKg <= 0 || ageYears <= 0) return null;

  return {
    sex: asText(source.sex) ?? 'unspecified',
    ageYears: Math.round(ageYears),
    heightCm: Math.round(heightCm * 10) / 10,
    weightKg: Math.round(weightKg * 10) / 10,
    activityLevel: asText(source.activityLevel) ?? 'moderate',
    goal: asText(source.goal) ?? 'maintain',
    ratePerWeek: asFiniteNumber(source.ratePerWeek) ?? 0,
    supplements: Array.isArray(source.supplements) ? source.supplements.filter((s): s is string => typeof s === 'string') : [],
  };
}

function parseGoals(raw: unknown): ExportBundle['goals'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const bmr = asKcal(source.bmr);
  const tdee = asKcal(source.tdee);
  const calorieTarget = asKcal(source.calorieTarget);
  const proteinG = asGrams(source.proteinG);
  const carbsG = asGrams(source.carbsG);
  const fatG = asGrams(source.fatG);
  if (bmr === null || tdee === null || calorieTarget === null) return null;
  if (proteinG === null || carbsG === null || fatG === null) return null;
  return { bmr, tdee, calorieTarget, proteinG, carbsG, fatG };
}

/**
 * Read a backup file's text and turn it into a bundle of validated rows.
 *
 * Never throws: every failure comes back as `{ ok: false, message }` because
 * this runs against a file the user chose, which may be a photo of a receipt.
 * Unknown fields are ignored and unknown *schema versions* are refused — a
 * file from a future version is more likely to have moved fields than to be
 * the right file, and half-restoring it is worse than asking for the app's own
 * export.
 */
export function parseBackup(text: string): RestoreParse {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, message: 'That file is empty. Pick the calibrEAT backup you exported.' };
  }
  if (text.length > RESTORE_MAX_BYTES) {
    return { ok: false, message: 'That file is too large to be a backup. Pick a smaller one.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That file is not valid JSON. Pick a calibrEAT backup (.json).' };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'That file is not a calibrEAT backup.' };
  }

  const source = raw as Record<string, unknown>;
  if (source.app !== 'calibrEAT') {
    return { ok: false, message: 'That file was not exported by calibrEAT.' };
  }
  if (source.schema !== EXPORT_SCHEMA) {
    const found = typeof source.schema === 'string' ? source.schema : 'an unknown version';
    return {
      ok: false,
      message: `That backup is ${found}, and this app reads ${EXPORT_SCHEMA}. Nothing was changed.`,
    };
  }

  const validated = validateRestoreRows(source);
  if (!validated.ok) return validated;
  return { ok: true, warnings: validated.warnings, bundle: validated.bundle };
}

/**
 * Turn loose, untrusted row objects into a validated bundle.
 *
 * Shared with the third-party diary importer (import-diary.ts), so a
 * MyFitnessPal row and a calibrEAT backup row are held to exactly the same
 * rules — one validator, one set of decisions about what is readable, what is
 * dropped and what the user is told. The importer's job is to name the
 * columns; what happens to a row that has no calories is decided here, once.
 */
export function validateRestoreRows(source: Record<string, unknown>): RestoreParse {
  const recovered = { value: false };
  let dropped = 0;

  const logEntries: RestoredLogEntry[] = [];
  for (const item of asArray(source.logEntries)) {
    const parsed = parseLogEntry(item, recovered);
    if (parsed) logEntries.push(parsed);
    else dropped += 1;
  }

  const weighIns: RestoredWeighIn[] = [];
  for (const item of asArray(source.weighIns)) {
    const parsed = parseWeighIn(item, recovered);
    if (parsed) weighIns.push(parsed);
    else dropped += 1;
  }

  const water: RestoredWaterEntry[] = [];
  for (const item of asArray(source.water)) {
    const parsed = parseWaterEntry(item, recovered);
    if (parsed) water.push(parsed);
    else dropped += 1;
  }

  const workouts: RestoredWorkout[] = [];
  for (const item of asArray(source.workouts)) {
    const parsed = parseWorkout(item, recovered);
    if (parsed) workouts.push(parsed);
    else dropped += 1;
  }

  const savedMeals: RestoredSavedMeal[] = [];
  for (const item of asArray(source.savedMeals)) {
    const parsed = parseSavedMeal(item);
    if (parsed) savedMeals.push(parsed);
    else dropped += 1;
  }

  const total = logEntries.length + weighIns.length + water.length + workouts.length + savedMeals.length;
  if (total === 0) {
    return { ok: false, message: 'That backup has no readable rows in it. Nothing was changed.' };
  }
  if (total > RESTORE_MAX_ROWS) {
    return { ok: false, message: 'That backup has more rows than this app will restore at once.' };
  }

  const warnings: string[] = [];
  if (dropped) {
    warnings.push(`${dropped} ${dropped === 1 ? 'row was' : 'rows were'} unreadable and ${dropped === 1 ? 'was' : 'were'} left out.`);
  }
  if (recovered.value) {
    warnings.push('Some rows were missing their day, so the day was read from the timestamp.');
  }

  return {
    ok: true,
    warnings,
    bundle: {
      app: 'calibrEAT',
      schema: EXPORT_SCHEMA,
      exportedAt: asIso(source.exportedAt) ?? new Date().toISOString(),
      counts: {
        logEntries: logEntries.length,
        weighIns: weighIns.length,
        water: water.length,
        workouts: workouts.length,
        savedMeals: savedMeals.length,
      },
      profile: parseProfile(source.profile),
      goals: parseGoals(source.goals),
      logEntries,
      weighIns,
      water,
      workouts,
      savedMeals,
    },
  };
}

/* ── Identity ────────────────────────────────────────────────────
 * Merge mode has to answer "is this row already here?" without the old ids,
 * which belong to another database. These fingerprints are the natural key of
 * each row type — the same meal, the same weigh-in, the same glass of water —
 * and they are stable across devices because none of them contain an id or a
 * device-local value.
 *
 * The separator is a literal NUL byte, not a space — food names contain
 * spaces, so a space-separated fingerprint could alias two different rows into
 * one and silently drop a meal from a merge. (It is invisible in most editors,
 * which is why it is commented.)
 *
 * Note the separator is belt to a pair of braces rather than the only thing
 * making this safe: every fingerprint takes a fixed number of fields and its
 * last is always a strict ISO timestamp, so no field boundary can shift even
 * with a space. That is worth stating because the NUL cannot be assumed —
 * a CSV cell or a name from a food database may carry a control byte, and
 * cleanName only trims. Adding a field to a fingerprint is the change that
 * could actually make this fragile, so check-input-safety.mjs pins the
 * resulting property (distinct rows, distinct fingerprints) rather than the
 * separator itself. */

const SEP = ' ';

function fp(...parts: (string | number | null)[]): string {
  return parts.map((part) => (part === null ? '' : String(part))).join(SEP);
}

export function logFingerprint(entry: Pick<RestoredLogEntry, 'dayKey' | 'meal' | 'name' | 'kcal' | 'loggedAt'>): string {
  return fp(entry.dayKey, entry.meal, entry.name, entry.kcal, entry.loggedAt);
}

export function weighInFingerprint(entry: Pick<RestoredWeighIn, 'kg' | 'measuredAt'>): string {
  return fp(entry.kg, entry.measuredAt);
}

export function waterFingerprint(entry: Pick<RestoredWaterEntry, 'dayKey' | 'ml' | 'loggedAt'>): string {
  return fp(entry.dayKey, entry.ml, entry.loggedAt);
}

export function workoutFingerprint(
  entry: Pick<RestoredWorkout, 'dayKey' | 'exerciseId' | 'sets' | 'reps' | 'kcal' | 'loggedAt'>,
): string {
  return fp(entry.dayKey, entry.exerciseId, entry.sets, entry.reps, entry.kcal, entry.loggedAt);
}

export function savedMealFingerprint(entry: Pick<RestoredSavedMeal, 'name' | 'createdAt'>): string {
  return fp(entry.name.trim().toLowerCase(), entry.createdAt);
}

/* ── Planning ──────────────────────────────────────────────────── */

/** What is already on this device, in the shape de-duplication needs. */
export type RestoreCurrent = {
  logEntries: readonly Pick<RestoredLogEntry, 'dayKey' | 'meal' | 'name' | 'kcal' | 'loggedAt'>[];
  weighIns: readonly Pick<RestoredWeighIn, 'kg' | 'measuredAt'>[];
  water: readonly Pick<RestoredWaterEntry, 'dayKey' | 'ml' | 'loggedAt'>[];
  workouts: readonly Pick<RestoredWorkout, 'dayKey' | 'exerciseId' | 'sets' | 'reps' | 'kcal' | 'loggedAt'>[];
  savedMeals: readonly Pick<RestoredSavedMeal, 'name' | 'createdAt'>[];
  hasProfile: boolean;
};

export type RestorePlan = {
  mode: RestoreMode;
  exportedAt: string;
  /** Replace mode clears the device's data first; merge mode never does. */
  clears: boolean;
  profile: ExportBundle['profile'];
  goals: ExportBundle['goals'];
  logEntries: RestoredLogEntry[];
  weighIns: RestoredWeighIn[];
  water: RestoredWaterEntry[];
  workouts: RestoredWorkout[];
  savedMeals: RestoredSavedMeal[];
  /** Rows already on this device, skipped so a second import adds nothing. */
  duplicates: number;
  /** Saved meals over the app's limit that were left behind. */
  overLimit: number;
  notes: string[];
};

const EMPTY_CURRENT: RestoreCurrent = {
  logEntries: [],
  weighIns: [],
  water: [],
  workouts: [],
  savedMeals: [],
  hasProfile: false,
};

/** Keep only rows whose fingerprint is not already claimed, adding as we go so
 *  duplicates *within* the file collapse too. */
function takeNew<T>(
  rows: readonly T[],
  key: (row: T) => string,
  seen: Set<string>,
  limit?: number,
): { rows: T[]; duplicates: number; overLimit: number } {
  const out: T[] = [];
  let duplicates = 0;
  let overLimit = 0;
  for (const row of rows) {
    const fingerprint = key(row);
    if (seen.has(fingerprint)) {
      duplicates += 1;
      continue;
    }
    if (limit !== undefined && out.length >= limit) {
      overLimit += 1;
      continue;
    }
    seen.add(fingerprint);
    out.push(row);
  }
  return { rows: out, duplicates, overLimit };
}

/**
 * Decide exactly what a restore will do, before it does any of it.
 *
 * `merge` (the default) adds to what is here and skips rows already present,
 * so restoring the same backup twice is a no-op and merging two phones' worth
 * of logs is safe. `replace` clears the device first — the honest way to put a
 * new phone back the way the old one was, and the only mode where the
 * incoming rows win on profile and targets.
 */
export function planRestore(bundle: RestoreBundle, current: RestoreCurrent = EMPTY_CURRENT, mode: RestoreMode = 'merge'): RestorePlan {
  const notes: string[] = [];
  if (mode === 'replace') {
    return {
      mode,
      clears: true,
      exportedAt: bundle.exportedAt,
      profile: bundle.profile,
      goals: bundle.goals,
      logEntries: [...bundle.logEntries],
      weighIns: [...bundle.weighIns],
      water: [...bundle.water],
      workouts: [...bundle.workouts],
      savedMeals: [...bundle.savedMeals].slice(0, SAVED_MEAL_LIMIT),
      duplicates: 0,
      overLimit: Math.max(0, bundle.savedMeals.length - SAVED_MEAL_LIMIT),
      notes: bundle.savedMeals.length > SAVED_MEAL_LIMIT
        ? [`Only the first ${SAVED_MEAL_LIMIT} saved meals were restored — the rest were left behind.`]
        : [],
    };
  }

  const logs = takeNew(bundle.logEntries, logFingerprint, new Set(current.logEntries.map(logFingerprint)));
  const weights = takeNew(bundle.weighIns, weighInFingerprint, new Set(current.weighIns.map(weighInFingerprint)));
  const water = takeNew(bundle.water, waterFingerprint, new Set(current.water.map(waterFingerprint)));
  const workouts = takeNew(bundle.workouts, workoutFingerprint, new Set(current.workouts.map(workoutFingerprint)));
  // Merging can push past the saved-meal limit, so only the headroom is taken.
  const meals = takeNew(
    bundle.savedMeals,
    savedMealFingerprint,
    new Set(current.savedMeals.map(savedMealFingerprint)),
    Math.max(0, SAVED_MEAL_LIMIT - current.savedMeals.length),
  );

  const duplicates = logs.duplicates + weights.duplicates + water.duplicates + workouts.duplicates + meals.duplicates;
  const overLimit = logs.overLimit + weights.overLimit + water.overLimit + workouts.overLimit + meals.overLimit;

  if (duplicates) {
    notes.push(`${duplicates} ${duplicates === 1 ? 'entry is' : 'entries are'} already on this device and ${duplicates === 1 ? 'was' : 'were'} skipped.`);
  }
  if (overLimit) {
    notes.push(`${overLimit} saved ${overLimit === 1 ? 'meal was' : 'meals were'} left out — calibrEAT keeps ${SAVED_MEAL_LIMIT}.`);
  }
  // A fresh install has no profile, so merge adopts the backup's. An install
  // that already set one up keeps it: their targets are the ones they are
  // currently living against, and a merge must not move the goalposts.
  const takeProfile = !current.hasProfile;
  if (!takeProfile && bundle.profile) {
    notes.push('Your current profile and targets were kept.');
  }

  return {
    mode,
    clears: false,
    exportedAt: bundle.exportedAt,
    profile: takeProfile ? bundle.profile : null,
    goals: takeProfile ? bundle.goals : null,
    logEntries: logs.rows,
    weighIns: weights.rows,
    water: water.rows,
    workouts: workouts.rows,
    savedMeals: meals.rows,
    duplicates,
    overLimit,
    notes,
  };
}

/* ── Copy ──────────────────────────────────────────────────────── */

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function countParts(plan: RestorePlan): string[] {
  const parts: string[] = [];
  if (plan.logEntries.length) parts.push(plural(plan.logEntries.length, 'meal'));
  if (plan.weighIns.length) parts.push(plural(plan.weighIns.length, 'weigh-in'));
  if (plan.water.length) parts.push(plural(plan.water.length, 'water entry', 'water entries'));
  if (plan.workouts.length) parts.push(plural(plan.workouts.length, 'workout'));
  if (plan.savedMeals.length) parts.push(plural(plan.savedMeals.length, 'saved meal'));
  return parts;
}

/** The confirmation line: exactly what will land, before anything lands. */
export function describePlan(plan: RestorePlan): string {
  const parts = countParts(plan);
  if (!parts.length) {
    return plan.mode === 'merge'
      ? 'Everything in this backup is already on this device.'
      : 'There is nothing in this backup to restore.';
  }
  const lead = plan.mode === 'replace' ? 'Replaces everything on this device with' : 'Adds';
  return `${lead} ${parts.join(', ')}.`;
}

/** The line under it: the consequences the user should not discover later. */
export function describePlanNotes(plan: RestorePlan, warnings: readonly string[] = []): string {
  const all = [...warnings, ...plan.notes];
  if (plan.mode === 'replace') {
    all.unshift('Everything currently on this device is deleted first.');
  }
  return all.join(' ');
}

/** The line after it worked. */
export function describeRestored(plan: RestorePlan): string {
  const parts = countParts(plan);
  const lead = plan.mode === 'replace' ? 'Restored' : 'Added';
  if (!parts.length) return 'Nothing needed restoring — this device was already up to date.';
  return `${lead} ${parts.join(', ')}.`;
}

/** `12 Sep 2026` for the "backup from…" line. */
export function formatExportedAt(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 'an unknown date';
  const date = new Date(time);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
