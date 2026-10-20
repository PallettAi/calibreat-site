import {
  migrateIntakeToLogs,
  recentsFromLogs,
  sumDayMacros,
  type DayMacros,
  type LogEntry,
  type MealSlot,
  type RecentMeal,
} from '@/lib/diary';
import type { Micros } from '@/lib/micronutrients';
import { localDayKey } from '@/lib/dates';
import type { RestorePlan } from '@/lib/restore';
import {
  SAVED_MEAL_LIMIT,
  SAVED_MEAL_MAX_ITEMS,
  isValidMealName,
  normalizeMealName,
  type SavedMeal,
  type SavedMealItem,
} from '@/lib/saved-meals';
import { computeGoals, type ActivityLevel, type GoalDirection, type Sex } from '@/lib/nutrition';
import type { HeightUnit, WaterUnit, WeightUnit } from '@/lib/units';

export type { DayMacros, LogEntry, MealSlot, RecentMeal };
export type { SavedMeal, SavedMealItem };

/**
 * Web (preview) implementation of the calibrEAT data layer.
 *
 * Same public API as src/lib/db.ts (which uses expo-sqlite on native) but
 * backed by localStorage, because expo-sqlite's web build currently fails to
 * bundle under Expo SDK 57 ("Worker chunk not found"). Metro resolves this
 * file for platform=web and db.ts for android/ios, so the APK still gets the
 * real SQLite store while the dev preview stays fully functional.
 *
 * Keep the exported API and behavior identical to db.ts.
 */

const PROFILE_KEY = 'calibreat.profile.v1';
const GOALS_KEY = 'calibreat.goals.v1';
const WATER_KEY = 'calibreat.water.v1';

export type Profile = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalDirection;
  ratePerWeek: number;
  supplements?: string[];
};

export type Goals = {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type WaterEntry = {
  id: number;
  dayKey: string; // YYYY-MM-DD (local)
  ml: number;
  loggedAt: string;
};

export type WeighIn = {
  id: number;
  kg: number;
  measuredAt: string;
  dayKey: string;
};

export type WorkoutSession = {
  id: number;
  dayKey: string;
  exerciseId: string;
  sets: number;
  reps: number;
  kcal: number;
  weightKg: number;
  volumeKg: number;
  e1RMKg: number;
  loggedAt: string;
};

export type IntakeEntry = {
  id: number;
  dayKey: string;
  kcal: number;
  loggedAt: string;
};

/** Local YYYY-MM-DD for `date` (defaults to now). Keep in sync with db.ts. */
export function dayKey(date: Date = new Date()): string {
  return localDayKey(date);
}

/* ── Profile + goals ─────────────────────────────────────────── */

export async function getProfile(): Promise<Profile | null> {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export async function getGoals(): Promise<Goals | null> {
  const raw = localStorage.getItem(GOALS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Goals;
  } catch {
    return null;
  }
}

/** Upserts the profile and the computed goals (single localStorage commit). */
export async function saveProfile(profile: Profile): Promise<Goals> {
  const goals = computeGoals(profile);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  return goals;
}

/* ── Unit preferences ─────────────────────────────────────────── */

const UNIT_PREFS_KEY = 'calibreat.units.v1';

export type UnitPrefs = {
  height: HeightUnit;
  weight: WeightUnit;
  water: WaterUnit;
};

export async function getUnitPrefs(): Promise<UnitPrefs> {
  const raw = localStorage.getItem(UNIT_PREFS_KEY);
  if (!raw) return { height: 'cm', weight: 'kg', water: 'ml' };
  try {
    const parsed = JSON.parse(raw) as Partial<UnitPrefs>;
    return {
      height: parsed.height ?? 'cm',
      weight: parsed.weight ?? 'kg',
      water: parsed.water ?? 'ml',
    };
  } catch {
    return { height: 'cm', weight: 'kg', water: 'ml' };
  }
}

export async function saveUnitPrefs(prefs: UnitPrefs): Promise<void> {
  localStorage.setItem(UNIT_PREFS_KEY, JSON.stringify(prefs));
}

/* ── Water ───────────────────────────────────────────────────── */

function readWater(): WaterEntry[] {
  const raw = localStorage.getItem(WATER_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WaterEntry[]) : [];
  } catch {
    return [];
  }
}

export async function getWaterForDay(key: string = dayKey()): Promise<number> {
  return readWater()
    .filter((entry) => entry.dayKey === key)
    .reduce((sum, entry) => sum + entry.ml, 0);
}

export async function addWater(ml: number): Promise<void> {
  await addWaterForDay(dayKey(), ml);
}

export async function addWaterForDay(key: string, ml: number): Promise<void> {
  const entries = readWater();
  const nextId = entries.length ? Math.max(...entries.map((e) => e.id)) + 1 : 1;
  entries.push({ id: nextId, dayKey: key, ml, loggedAt: new Date().toISOString() });
  localStorage.setItem(WATER_KEY, JSON.stringify(entries));
}

export async function setWaterForDay(key: string, totalMl: number): Promise<void> {
  const rounded = Math.max(0, Math.round(totalMl));
  const kept = readWater().filter((entry) => entry.dayKey !== key);
  if (rounded > 0) {
    const nextId = kept.length ? Math.max(...kept.map((e) => e.id)) + 1 : 1;
    kept.push({ id: nextId, dayKey: key, ml: rounded, loggedAt: new Date().toISOString() });
  }
  localStorage.setItem(WATER_KEY, JSON.stringify(kept));
}

/** Total ml for each of the last `days` days, oldest first. */
export async function getWaterHistory(days: number): Promise<{ dayKey: string; ml: number }[]> {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    buckets.set(dayKey(d), 0);
  }
  for (const entry of readWater()) {
    if (buckets.has(entry.dayKey)) {
      buckets.set(entry.dayKey, (buckets.get(entry.dayKey) ?? 0) + entry.ml);
    }
  }
  return Array.from(buckets, ([key, ml]) => ({ dayKey: key, ml }));
}

const WEIGH_IN_KEY = 'calibreat.weighins.v1';
const INTAKE_KEY = 'calibreat.intake.v1';
const LOG_KEY = 'calibreat.logs.v1';
const WORKOUT_KEY = 'calibreat.workouts.v1';
const INTAKE_MIGRATED_KEY = 'calibreat.intake_to_logs.v1';

export type LogInput = {
  dayKey: string;
  meal: MealSlot;
  name?: string | null;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  satFatG?: number | null;
  sodiumMg?: number | null;
  micros?: Micros | null;
};

function cleanName(name?: string | null): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

function asMeal(value: unknown): MealSlot {
  if (value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack') return value;
  return 'snack';
}

function readWeighIns(): WeighIn[] {
  const raw = localStorage.getItem(WEIGH_IN_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as WeighIn[]) : [];
  } catch {
    return [];
  }
}

function readIntake(): IntakeEntry[] {
  const raw = localStorage.getItem(INTAKE_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as IntakeEntry[]) : [];
  } catch {
    return [];
  }
}

function readLogs(): LogEntry[] {
  migrateWebIntake();
  const raw = localStorage.getItem(LOG_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((row: Partial<LogEntry>) => ({
      id: Number(row.id) || 0,
      dayKey: String(row.dayKey ?? ''),
      meal: asMeal(row.meal),
      name: row.name ?? null,
      kcal: Number(row.kcal) || 0,
      proteinG: row.proteinG ?? null,
      carbsG: row.carbsG ?? null,
      fatG: row.fatG ?? null,
      fiberG: row.fiberG ?? null,
      sugarG: row.sugarG ?? null,
      satFatG: row.satFatG ?? null,
      sodiumMg: row.sodiumMg ?? null,
      micros: row.micros ?? null,
      loggedAt: String(row.loggedAt ?? ''),
    }));
  } catch {
    return [];
  }
}

function writeLogs(list: LogEntry[]): void {
  localStorage.setItem(LOG_KEY, JSON.stringify(list));
}

function migrateWebIntake(): void {
  if (localStorage.getItem(INTAKE_MIGRATED_KEY) === '1') return;
  const existing = (() => {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [] as LogEntry[];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as LogEntry[]) : [];
    } catch {
      return [];
    }
  })();
  const migrated = migrateIntakeToLogs(readIntake());
  let nextId = existing.length ? Math.max(...existing.map((x) => x.id)) : 0;
  const appended = migrated.map((log) => {
    nextId += 1;
    return { ...log, id: nextId };
  });
  writeLogs([...existing, ...appended]);
  localStorage.setItem(INTAKE_MIGRATED_KEY, '1');
}

export async function addWeighIn(kg: number, measuredAt: Date = new Date()): Promise<void> {
  const list = readWeighIns();
  const nextId = list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1;
  const rounded = Math.round(kg * 10) / 10;
  list.push({ id: nextId, kg: rounded, measuredAt: measuredAt.toISOString(), dayKey: dayKey(measuredAt) });
  localStorage.setItem(WEIGH_IN_KEY, JSON.stringify(list));
}

/**
 * The most recent `limit` weigh-ins, oldest first.
 *
 * The native twin used to take the OLDEST 60 (ORDER BY measured_at ASC LIMIT),
 * so past 60 entries the APK stopped showing recent data while this twin kept
 * working. Both now return the newest page, oldest first — callers can rely on
 * index 0 being the oldest row *in the window* and the last index the newest.
 * For the first weigh-in ever, ask getFirstWeighIn: a limited page cannot
 * report it, which is the trap the "since the first" copy used to fall into.
 */
export async function getWeighIns(limit: number = 60): Promise<WeighIn[]> {
  const list = readWeighIns().slice().sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  return list.slice(-limit);
}

export async function getLatestWeighIn(): Promise<WeighIn | null> {
  const list = readWeighIns();
  if (!list.length) return null;
  return list.slice().sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] ?? null;
}

/** The very first weigh-in ever recorded, which getWeighIns cannot report. */
export async function getFirstWeighIn(): Promise<WeighIn | null> {
  const list = readWeighIns();
  if (!list.length) return null;
  return list.slice().sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))[0] ?? null;
}

export async function addLogEntry(input: LogInput): Promise<LogEntry> {
  const list = readLogs();
  const nextId = list.length ? Math.max(...list.map((x) => x.id)) + 1 : 1;
  const entry: LogEntry = {
    id: nextId,
    dayKey: input.dayKey,
    meal: input.meal,
    name: cleanName(input.name),
    kcal: Math.max(0, Math.round(input.kcal)),
    proteinG: input.proteinG ?? null,
    carbsG: input.carbsG ?? null,
    fatG: input.fatG ?? null,
    fiberG: input.fiberG ?? null,
    sugarG: input.sugarG ?? null,
    satFatG: input.satFatG ?? null,
    sodiumMg: input.sodiumMg ?? null,
    micros: input.micros ?? null,
    loggedAt: new Date().toISOString(),
  };
  list.push(entry);
  writeLogs(list);
  return entry;
}

export async function updateLogEntry(id: number, input: Omit<LogInput, 'dayKey'> & { dayKey?: string }): Promise<void> {
  const list = readLogs();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const cur = list[idx]!;
  list[idx] = {
    ...cur,
    dayKey: input.dayKey ?? cur.dayKey,
    meal: input.meal,
    name: cleanName(input.name),
    kcal: Math.max(0, Math.round(input.kcal)),
    proteinG: input.proteinG ?? null,
    carbsG: input.carbsG ?? null,
    fatG: input.fatG ?? null,
    fiberG: input.fiberG ?? null,
    sugarG: input.sugarG ?? null,
    satFatG: input.satFatG ?? null,
    sodiumMg: input.sodiumMg ?? null,
    micros: input.micros ?? null,
  };
  writeLogs(list);
}

export async function deleteLogEntry(id: number): Promise<void> {
  writeLogs(readLogs().filter((e) => e.id !== id));
}

export async function getLogsForDay(dayKeyValue: string): Promise<LogEntry[]> {
  return readLogs()
    .filter((e) => e.dayKey === dayKeyValue)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id - b.id);
}

export async function getRecentLogs(limit = 40): Promise<LogEntry[]> {
  return readLogs()
    .slice()
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt) || b.id - a.id)
    .slice(0, limit);
}

export async function getMacrosForDay(dayKeyValue: string): Promise<DayMacros> {
  return sumDayMacros(await getLogsForDay(dayKeyValue));
}

export async function getRecents(limit = 8): Promise<RecentMeal[]> {
  return recentsFromLogs(await getRecentLogs(40), limit);
}

export async function addIntakeForDay(dayKeyValue: string, kcal: number): Promise<void> {
  const rounded = Math.max(0, Math.round(kcal));
  if (rounded === 0) return;
  await addLogEntry({ dayKey: dayKeyValue, meal: 'snack', name: null, kcal: rounded });
}

export async function getIntakeForDay(dayKeyValue: string): Promise<number> {
  const macros = await getMacrosForDay(dayKeyValue);
  return macros.kcal;
}

export async function getIntakeHistory(days: number): Promise<{ dayKey: string; kcal: number }[]> {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    buckets.set(dayKey(d), 0);
  }
  for (const e of readLogs()) {
    if (buckets.has(e.dayKey)) buckets.set(e.dayKey, (buckets.get(e.dayKey) ?? 0) + e.kcal);
  }
  return Array.from(buckets, ([key, kcal]) => ({ dayKey: key, kcal }));
}

/* ── Workout sessions (Train only; never sent off-device) ───── */

function readWorkouts(): WorkoutSession[] {
  const raw = localStorage.getItem(WORKOUT_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((row: Partial<WorkoutSession>) => ({
      id: Number(row.id) || 0,
      dayKey: String(row.dayKey ?? ''),
      exerciseId: String(row.exerciseId ?? ''),
      sets: Number(row.sets) || 0,
      reps: Number(row.reps) || 0,
      kcal: Number(row.kcal) || 0,
      weightKg: Number((row as Record<string, unknown>).weightKg ?? 0) || 0,
      volumeKg: Number((row as Record<string, unknown>).volumeKg ?? 0) || 0,
      e1RMKg: Number((row as Record<string, unknown>).e1RMKg ?? 0) || 0,
      loggedAt: String(row.loggedAt ?? ''),
    }));
  } catch {
    return [];
  }
}

function writeWorkouts(list: WorkoutSession[]): void {
  localStorage.setItem(WORKOUT_KEY, JSON.stringify(list));
}

export async function addWorkoutSession(input: {
  dayKey: string;
  exerciseId: string;
  sets: number;
  reps: number;
  kcal: number;
  weightKg?: number;
  volumeKg?: number;
  e1RMKg?: number;
}): Promise<WorkoutSession> {
  const list = readWorkouts();
  const nextId = list.length ? Math.max(...list.map((e) => e.id)) + 1 : 1;
  const weightKg = Math.max(0, Math.round((input.weightKg ?? 0) * 10) / 10);
  const reps = Math.max(0, Math.round(input.reps));
  const sets = Math.max(0, Math.round(input.sets));
  const volumeKg = input.volumeKg != null ? Math.max(0, Math.round(input.volumeKg * 10) / 10) : weightKg > 0 && sets > 0 && reps > 0 ? Math.round(sets * reps * weightKg * 10) / 10 : 0;
  const e1RMKg = input.e1RMKg != null ? Math.max(0, Math.round(input.e1RMKg * 10) / 10) : weightKg > 0 && reps > 0 ? Math.round(weightKg * (1 + reps / 30) * 10) / 10 : 0;
  const entry: WorkoutSession = {
    id: nextId,
    dayKey: input.dayKey,
    exerciseId: input.exerciseId,
    sets,
    reps,
    kcal: Math.max(0, Math.round(input.kcal)),
    weightKg,
    volumeKg,
    e1RMKg,
    loggedAt: new Date().toISOString(),
  };
  list.push(entry);
  writeWorkouts(list);
  return entry;
}

export async function getWorkoutSessionsForDay(dayKeyValue: string): Promise<WorkoutSession[]> {
  return readWorkouts()
    .filter((e) => e.dayKey === dayKeyValue)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id - b.id);
}

export async function deleteWorkoutSession(id: number): Promise<void> {
  writeWorkouts(readWorkouts().filter((e) => e.id !== id));
}

export async function getWorkoutKcalForDay(dayKeyValue: string): Promise<number> {
  return (await getWorkoutSessionsForDay(dayKeyValue)).reduce((sum, e) => sum + e.kcal, 0);
}

/* ── Saved meals (repeat-eater shortcut; never leaves the device) ── */

const SAVED_MEALS_KEY = 'calibreat.saved-meals.v1';

/** Same shape and same semantics as db.ts; unparseable rows are dropped, not thrown. */
function readSavedMeals(): SavedMeal[] {
  const raw = localStorage.getItem(SAVED_MEALS_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((row: Partial<SavedMeal>) => ({
      id: Number(row.id) || 0,
      name: String(row.name ?? ''),
      meal: asMeal(row.meal),
      items: Array.isArray(row.items)
        ? (row.items as SavedMealItem[]).filter(
            (item) => item && Number.isFinite(Number(item.kcal)),
          )
        : [],
      createdAt: String(row.createdAt ?? ''),
    }));
  } catch {
    return [];
  }
}

function writeSavedMeals(list: SavedMeal[]): void {
  localStorage.setItem(SAVED_MEALS_KEY, JSON.stringify(list));
}

/** Newest first, matching db.ts. */
export async function getSavedMeals(): Promise<SavedMeal[]> {
  return readSavedMeals().sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
  );
}

/** A matching name updates in place, exactly as the SQLite path does. */
export async function saveSavedMeal(
  name: string,
  meal: MealSlot,
  items: SavedMealItem[],
): Promise<{ meal: SavedMeal; replaced: boolean }> {
  const clean = normalizeMealName(name);
  if (!isValidMealName(clean)) {
    throw new Error('Give this meal a name of at least two characters.');
  }
  if (!items.length) {
    throw new Error('There is nothing saved in this meal yet.');
  }
  if (items.length > SAVED_MEAL_MAX_ITEMS) {
    throw new Error(`A saved meal holds up to ${SAVED_MEAL_MAX_ITEMS} items.`);
  }

  const list = readSavedMeals();
  const existing = list.find((entry) => entry.name.toLowerCase() === clean.toLowerCase());
  const createdAt = new Date().toISOString();

  if (existing) {
    const updated: SavedMeal = { ...existing, name: clean, meal, items, createdAt };
    writeSavedMeals(list.map((entry) => (entry.id === existing.id ? updated : entry)));
    return { meal: updated, replaced: true };
  }

  if (list.length >= SAVED_MEAL_LIMIT) {
    throw new Error(`You can keep ${SAVED_MEAL_LIMIT} saved meals. Remove one first.`);
  }

  const nextId = list.length ? Math.max(...list.map((entry) => entry.id)) + 1 : 1;
  const saved: SavedMeal = { id: nextId, name: clean, meal, items, createdAt };
  list.push(saved);
  writeSavedMeals(list);
  return { meal: saved, replaced: false };
}

export async function deleteSavedMeal(id: number): Promise<void> {
  writeSavedMeals(readSavedMeals().filter((entry) => entry.id !== id));
}

/* ── Full-history reads (data export; see src/lib/export.ts) ── */

export async function getAllLogs(): Promise<LogEntry[]> {
  return readLogs().sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id - b.id);
}

export async function getAllWater(): Promise<WaterEntry[]> {
  return readWater().sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id - b.id);
}

export async function getAllWeighIns(): Promise<WeighIn[]> {
  return readWeighIns().sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.id - b.id);
}

export async function getAllWorkouts(): Promise<WorkoutSession[]> {
  return readWorkouts().sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id - b.id);
}

/* ── Restore (see src/lib/restore.ts) ─────────────────────────── */

export type RestoreApplied = {
  logEntries: number;
  weighIns: number;
  water: number;
  workouts: number;
  savedMeals: number;
  profile: boolean;
};

/**
 * The localStorage twin of applyRestore in db.ts — same public API, same
 * behaviour, same reason for existing: rows are written with the day_key and
 * timestamp they were exported with, which addLogEntry cannot do because it
 * stamps `logged_at` as now.
 *
 * The writes are staged in memory and only committed to localStorage once the
 * whole plan is built, so a throw part-way through leaves the keys untouched —
 * the localStorage stand-in for the transaction db.ts gets from SQLite.
 */
export async function applyRestore(plan: RestorePlan): Promise<RestoreApplied> {
  const existingLogs = plan.clears ? [] : readLogs();
  const existingWeighIns = plan.clears ? [] : readWeighIns();
  const existingWater = plan.clears ? [] : readWater();
  const existingWorkouts = plan.clears ? [] : readWorkouts();
  const existingMeals = plan.clears ? [] : readSavedMeals();

  // Ids are the storage layer's business, not the plan's — the plan dropped
  // the old device's, so new ones continue from whatever is already here.
  const nextId = (rows: { id: number }[]): number => (rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1);
  let logId = nextId(existingLogs);
  let weighInId = nextId(existingWeighIns);
  let waterId = nextId(existingWater);
  let workoutId = nextId(existingWorkouts);
  let mealId = nextId(existingMeals);

  const logs: LogEntry[] = [...existingLogs];
  for (const entry of plan.logEntries) {
    logs.push({
      id: logId++,
      dayKey: entry.dayKey,
      meal: entry.meal,
      name: entry.name,
      kcal: entry.kcal,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      fiberG: entry.fiberG,
      sugarG: entry.sugarG,
      satFatG: entry.satFatG,
      sodiumMg: entry.sodiumMg,
      micros: entry.micros ?? null,
      loggedAt: entry.loggedAt,
    });
  }

  const weighIns: WeighIn[] = [...existingWeighIns];
  for (const entry of plan.weighIns) {
    weighIns.push({ id: weighInId++, kg: entry.kg, measuredAt: entry.measuredAt, dayKey: entry.dayKey });
  }

  const waterRows: WaterEntry[] = [...existingWater];
  for (const entry of plan.water) {
    waterRows.push({ id: waterId++, dayKey: entry.dayKey, ml: entry.ml, loggedAt: entry.loggedAt });
  }

  const workouts: WorkoutSession[] = [...existingWorkouts];
  for (const entry of plan.workouts) {
    workouts.push({
      id: workoutId++,
      dayKey: entry.dayKey,
      exerciseId: entry.exerciseId,
      sets: entry.sets,
      reps: entry.reps,
      kcal: entry.kcal,
      weightKg: entry.weightKg,
      volumeKg: entry.volumeKg,
      e1RMKg: entry.e1RMKg,
      loggedAt: entry.loggedAt,
    });
  }

  const savedMeals: SavedMeal[] = [...existingMeals];
  for (const meal of plan.savedMeals) {
    savedMeals.push({ id: mealId++, name: meal.name, meal: meal.meal, items: meal.items, createdAt: meal.createdAt });
  }

  // The profile is written FIRST, before the tables. saveProfile is the one
  // call here that can realistically throw on a bad value, and doing it first
  // means that failure leaves no rows behind — the same guarantee db.ts gets
  // from a real transaction. (localStorage has no transaction, so this is an
  // ordering argument, not a rollback: a quota failure part-way through the
  // key writes can still leave a partial diary. The web tier is a dev preview;
  // the APK is the product, and it is fully atomic.)
  if (plan.clears) {
    // A replace must leave the device with what the backup had, not what it
    // had — otherwise a backup that carried no profile would quietly keep the
    // old one, and the user would restore onto targets they thought they'd
    // thrown away. saveProfile below writes both back if the bundle had them.
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(GOALS_KEY);
    localStorage.removeItem(INTAKE_KEY);
  }

  // Mirrors db.ts: targets are recomputed from the restored profile by the
  // app's own formula, so a backup written by an older version still lands on
  // numbers this version would have calculated.
  if (plan.profile) {
    await saveProfile(plan.profile as Profile);
  }

  writeLogs(logs);
  localStorage.setItem(WEIGH_IN_KEY, JSON.stringify(weighIns));
  localStorage.setItem(WATER_KEY, JSON.stringify(waterRows));
  writeWorkouts(workouts);
  writeSavedMeals(savedMeals);

  return {
    logEntries: plan.logEntries.length,
    weighIns: plan.weighIns.length,
    water: plan.water.length,
    workouts: plan.workouts.length,
    savedMeals: plan.savedMeals.length,
    profile: Boolean(plan.profile),
  };
}