import {
  migrateIntakeToLogs,
  recentsFromLogs,
  sumDayMacros,
  type DayMacros,
  type LogEntry,
  type MealSlot,
  type RecentMeal,
} from '@/lib/diary';
import { localDayKey } from '@/lib/dates';
import { computeGoals, type ActivityLevel, type GoalDirection, type Sex } from '@/lib/nutrition';
import type { HeightUnit, WaterUnit, WeightUnit } from '@/lib/units';

export type { DayMacros, LogEntry, MealSlot, RecentMeal };

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

export async function getWeighIns(limit: number = 60): Promise<WeighIn[]> {
  const list = readWeighIns().slice().sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  return list.slice(-limit);
}

export async function getLatestWeighIn(): Promise<WeighIn | null> {
  const list = readWeighIns();
  if (!list.length) return null;
  return list.slice().sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] ?? null;
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
}): Promise<WorkoutSession> {
  const list = readWorkouts();
  const nextId = list.length ? Math.max(...list.map((e) => e.id)) + 1 : 1;
  const entry: WorkoutSession = {
    id: nextId,
    dayKey: input.dayKey,
    exerciseId: input.exerciseId,
    sets: input.sets,
    reps: input.reps,
    kcal: Math.max(0, Math.round(input.kcal)),
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