import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  migrateIntakeToLogs,
  recentsFromLogs,
  sumDayMacros,
  type DayMacros,
  type LogEntry,
  type MealSlot,
  type RecentMeal,
} from '@/lib/diary';
import { localCutoffDayKey, localDayKey } from '@/lib/dates';
import { computeGoals, type ActivityLevel, type GoalDirection, type Sex } from '@/lib/nutrition';
import type { HeightUnit, WaterUnit, WeightUnit } from '@/lib/units';

export type { DayMacros, LogEntry, MealSlot, RecentMeal };

/**
 * calibrEAT local-first data layer (M1).
 *
 * Everything the user logs lives in a single on-device SQLite database —
 * no account, no server storage (the only network call in the app remains
 * license validation). All queries are small and day-scoped so the schema
 * stays simple: a single profile row, a single computed-goals row, and
 * append-only water/weigh-in logs.
 */

const DB_NAME = 'calibreat.db';

export type Profile = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalDirection;
  /** Weekly rate for lose/gain, in kg per week (0.25 | 0.5). */
  ratePerWeek: number;
  /** Supplements the user takes — optional so old installs migrate as []. */
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
  measuredAt: string; // ISO
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

let dbPromise: Promise<SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS profile (
          id            INTEGER PRIMARY KEY CHECK (id = 1),
          sex           TEXT NOT NULL,
          age_years     INTEGER NOT NULL,
          height_cm     INTEGER NOT NULL,
          weight_kg     REAL NOT NULL,
          activity_level TEXT NOT NULL,
          goal          TEXT NOT NULL,
          rate_per_week REAL NOT NULL,
          supplements   TEXT,
          updated_at    TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS goals (
          id              INTEGER PRIMARY KEY CHECK (id = 1),
          bmr             INTEGER NOT NULL,
          tdee            INTEGER NOT NULL,
          calorie_target  INTEGER NOT NULL,
          protein_g       INTEGER NOT NULL,
          carbs_g         INTEGER NOT NULL,
          fat_g           INTEGER NOT NULL,
          updated_at      TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS water (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key   TEXT NOT NULL,
          ml        INTEGER NOT NULL,
          logged_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_water_day ON water (day_key);
        CREATE TABLE IF NOT EXISTS weigh_ins (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          kg          REAL NOT NULL,
          measured_at TEXT NOT NULL,
          day_key     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_weigh_ins_day ON weigh_ins (day_key);
        CREATE TABLE IF NOT EXISTS intake_entries (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key   TEXT NOT NULL,
          kcal      INTEGER NOT NULL,
          logged_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_intake_day ON intake_entries (day_key);
        CREATE TABLE IF NOT EXISTS log_entries (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key    TEXT NOT NULL,
          meal       TEXT NOT NULL,
          name       TEXT,
          kcal       INTEGER NOT NULL,
          protein_g  INTEGER,
          carbs_g    INTEGER,
          fat_g      INTEGER,
          fiber_g    INTEGER,
          sugar_g    INTEGER,
          sat_fat_g  INTEGER,
          sodium_mg  INTEGER,
          logged_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_log_day ON log_entries (day_key);
        CREATE TABLE IF NOT EXISTS workout_sessions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key     TEXT NOT NULL,
          exercise_id TEXT NOT NULL,
          sets        INTEGER NOT NULL,
          reps        INTEGER NOT NULL,
          kcal        INTEGER NOT NULL,
          logged_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workout_day ON workout_sessions (day_key);
        CREATE TABLE IF NOT EXISTS schema_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      // Migration for installs created before the supplements / new tables existed.
      try {
        await db.execAsync('ALTER TABLE profile ADD COLUMN supplements TEXT');
      } catch {
        // column already exists
      }
      for (const column of [
        'ALTER TABLE log_entries ADD COLUMN fiber_g INTEGER',
        'ALTER TABLE log_entries ADD COLUMN sugar_g INTEGER',
        'ALTER TABLE log_entries ADD COLUMN sat_fat_g INTEGER',
        'ALTER TABLE log_entries ADD COLUMN sodium_mg INTEGER',
      ]) {
        try {
          await db.execAsync(column);
        } catch {
          // column already exists
        }
      }
      // Ensure new tables exist for DBs created before v0.0.3
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS weigh_ins (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          kg          REAL NOT NULL,
          measured_at TEXT NOT NULL,
          day_key     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_weigh_ins_day ON weigh_ins (day_key);
        CREATE TABLE IF NOT EXISTS intake_entries (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key   TEXT NOT NULL,
          kcal      INTEGER NOT NULL,
          logged_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_intake_day ON intake_entries (day_key);
        CREATE TABLE IF NOT EXISTS log_entries (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key    TEXT NOT NULL,
          meal       TEXT NOT NULL,
          name       TEXT,
          kcal       INTEGER NOT NULL,
          protein_g  INTEGER,
          carbs_g    INTEGER,
          fat_g      INTEGER,
          fiber_g    INTEGER,
          sugar_g    INTEGER,
          sat_fat_g  INTEGER,
          sodium_mg  INTEGER,
          logged_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_log_day ON log_entries (day_key);
        CREATE TABLE IF NOT EXISTS workout_sessions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          day_key     TEXT NOT NULL,
          exercise_id TEXT NOT NULL,
          sets        INTEGER NOT NULL,
          reps        INTEGER NOT NULL,
          kcal        INTEGER NOT NULL,
          logged_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workout_day ON workout_sessions (day_key);
        CREATE TABLE IF NOT EXISTS schema_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      await migrateIntakeEntries(db);
      return db;
    });
  }
  return dbPromise;
}

/** Local YYYY-MM-DD for `date` (defaults to now). SQLite day scoping is local-first. */
export function dayKey(date: Date = new Date()): string {
  return localDayKey(date);
}

type LogRow = {
  id: number;
  day_key: string;
  meal: string;
  name: string | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sat_fat_g: number | null;
  sodium_mg: number | null;
  logged_at: string;
};

function asMeal(value: string): MealSlot {
  if (value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack') return value;
  return 'snack';
}

function mapLogRow(row: LogRow): LogEntry {
  return {
    id: row.id,
    dayKey: row.day_key,
    meal: asMeal(row.meal),
    name: row.name,
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
    sugarG: row.sugar_g,
    satFatG: row.sat_fat_g,
    sodiumMg: row.sodium_mg,
    loggedAt: row.logged_at,
  };
}

async function migrateIntakeEntries(db: SQLiteDatabase): Promise<void> {
  const flag = await db.getFirstAsync<{ value: string }>('SELECT value FROM schema_meta WHERE key = ?', ['intake_to_logs']);
  if (flag?.value === '1') return;
  const rows = await db.getAllAsync<{ day_key: string; kcal: number; logged_at: string }>(
    'SELECT day_key, kcal, logged_at FROM intake_entries',
  );
  const logs = migrateIntakeToLogs(rows.map((r) => ({ dayKey: r.day_key, kcal: r.kcal, loggedAt: r.logged_at })));
  await db.withTransactionAsync(async () => {
    for (const log of logs) {
      await db.runAsync(
        `INSERT INTO log_entries (day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [log.dayKey, log.meal, log.name, log.kcal, log.proteinG, log.carbsG, log.fatG, log.fiberG ?? null, log.sugarG ?? null, log.satFatG ?? null, log.sodiumMg ?? null, log.loggedAt],
      );
    }
    await db.runAsync(
      'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['intake_to_logs', '1'],
    );
  });
}

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

/* ── Profile + goals ─────────────────────────────────────────── */

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    sex: Sex;
    age_years: number;
    height_cm: number;
    weight_kg: number;
    activity_level: ActivityLevel;
    goal: GoalDirection;
    rate_per_week: number;
    supplements: string | null;
  }>('SELECT * FROM profile WHERE id = 1');
  if (!row) return null;
  let supplements: string[] = [];
  if (row.supplements) {
    try {
      const parsed = JSON.parse(row.supplements);
      if (Array.isArray(parsed)) supplements = parsed;
    } catch {}
  }
  return {
    sex: row.sex,
    ageYears: row.age_years,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    activityLevel: row.activity_level,
    goal: row.goal,
    ratePerWeek: row.rate_per_week,
    supplements,
  };
}

export async function getGoals(): Promise<Goals | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    bmr: number;
    tdee: number;
    calorie_target: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>('SELECT * FROM goals WHERE id = 1');
  if (!row) return null;
  return {
    bmr: row.bmr,
    tdee: row.tdee,
    calorieTarget: row.calorie_target,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
  };
}

/** Upserts the profile row and the computed goals row in one transaction. */
export async function saveProfile(profile: Profile): Promise<Goals> {
  const goals = computeGoals(profile);
  const db = await getDb();
  const now = new Date().toISOString();
  const supplementsJson = profile.supplements?.length ? JSON.stringify(profile.supplements) : null;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO profile (id, sex, age_years, height_cm, weight_kg, activity_level, goal, rate_per_week, supplements, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         sex = excluded.sex,
         age_years = excluded.age_years,
         height_cm = excluded.height_cm,
         weight_kg = excluded.weight_kg,
         activity_level = excluded.activity_level,
         goal = excluded.goal,
         rate_per_week = excluded.rate_per_week,
         supplements = excluded.supplements,
         updated_at = excluded.updated_at`,
      [
        profile.sex,
        profile.ageYears,
        profile.heightCm,
        profile.weightKg,
        profile.activityLevel,
        profile.goal,
        profile.ratePerWeek,
        supplementsJson,
        now,
      ],
    );
    await db.runAsync(
      `INSERT INTO goals (id, bmr, tdee, calorie_target, protein_g, carbs_g, fat_g, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         bmr = excluded.bmr,
         tdee = excluded.tdee,
         calorie_target = excluded.calorie_target,
         protein_g = excluded.protein_g,
         carbs_g = excluded.carbs_g,
         fat_g = excluded.fat_g,
         updated_at = excluded.updated_at`,
      [
        goals.bmr,
        goals.tdee,
        goals.calorieTarget,
        goals.proteinG,
        goals.carbsG,
        goals.fatG,
        now,
      ],
    );
  });
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
  const raw = await AsyncStorage.getItem(UNIT_PREFS_KEY);
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
  await AsyncStorage.setItem(UNIT_PREFS_KEY, JSON.stringify(prefs));
}

/* ── Water ───────────────────────────────────────────────────── */

export async function getWaterForDay(key: string = dayKey()): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(ml), 0) AS total FROM water WHERE day_key = ?',
    [key],
  );
  return row?.total ?? 0;
}

export async function addWater(ml: number): Promise<void> {
  await addWaterForDay(dayKey(), ml);
}

export async function addWaterForDay(key: string, ml: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO water (day_key, ml, logged_at) VALUES (?, ?, ?)', [key, ml, new Date().toISOString()]);
}

export async function setWaterForDay(key: string, totalMl: number): Promise<void> {
  const db = await getDb();
  const rounded = Math.max(0, Math.round(totalMl));
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM water WHERE day_key = ?', [key]);
    if (rounded > 0) {
      await db.runAsync('INSERT INTO water (day_key, ml, logged_at) VALUES (?, ?, ?)', [key, rounded, new Date().toISOString()]);
    }
  });
}

/** Total ml for each of the last `days` days, oldest first. */
export async function getWaterHistory(days: number): Promise<{ dayKey: string; ml: number }[]> {
  const db = await getDb();
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.set(localDayKey(d), 0);
  }
  const cutoff = localCutoffDayKey(days);
  const rows = await db.getAllAsync<{ day_key: string; total: number }>(
    `SELECT day_key, SUM(ml) AS total FROM water
     WHERE day_key >= ? GROUP BY day_key ORDER BY day_key ASC`,
    [cutoff],
  );
  for (const row of rows) {
    if (buckets.has(row.day_key)) buckets.set(row.day_key, row.total);
  }
  return Array.from(buckets, ([dayKey, ml]) => ({ dayKey, ml }));
}

/* ── Weigh-ins ───────────────────────────────────────────────── */

export async function addWeighIn(kg: number, measuredAt: Date = new Date()): Promise<void> {
  const db = await getDb();
  const rounded = Math.round(kg * 10) / 10;
  const iso = measuredAt.toISOString();
  const dk = dayKey(measuredAt);
  await db.runAsync('INSERT INTO weigh_ins (kg, measured_at, day_key) VALUES (?, ?, ?)', [rounded, iso, dk]);
}

export async function getWeighIns(limit: number = 60): Promise<WeighIn[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; kg: number; measured_at: string; day_key: string }>(
    'SELECT id, kg, measured_at, day_key FROM weigh_ins ORDER BY measured_at ASC LIMIT ?',
    [limit],
  );
  return rows.map((r) => ({ id: r.id, kg: r.kg, measuredAt: r.measured_at, dayKey: r.day_key }));
}

export async function getLatestWeighIn(): Promise<WeighIn | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: number; kg: number; measured_at: string; day_key: string }>(
    'SELECT id, kg, measured_at, day_key FROM weigh_ins ORDER BY measured_at DESC LIMIT 1',
  );
  return row ? { id: row.id, kg: row.kg, measuredAt: row.measured_at, dayKey: row.day_key } : null;
}

/* ── Meal log (kcal + optional macros; True Burn sums kcal) ───── */

export async function addLogEntry(input: LogInput): Promise<LogEntry> {
  const db = await getDb();
  const kcal = Math.max(0, Math.round(input.kcal));
  const result = await db.runAsync(
    `INSERT INTO log_entries (day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.dayKey,
      input.meal,
      cleanName(input.name),
      kcal,
      input.proteinG ?? null,
      input.carbsG ?? null,
      input.fatG ?? null,
      input.fiberG ?? null,
      input.sugarG ?? null,
      input.satFatG ?? null,
      input.sodiumMg ?? null,
      new Date().toISOString(),
    ],
  );
  return {
    id: Number(result.lastInsertRowId),
    dayKey: input.dayKey,
    meal: input.meal,
    name: cleanName(input.name),
    kcal,
    proteinG: input.proteinG ?? null,
    carbsG: input.carbsG ?? null,
    fatG: input.fatG ?? null,
    fiberG: input.fiberG ?? null,
    sugarG: input.sugarG ?? null,
    satFatG: input.satFatG ?? null,
    sodiumMg: input.sodiumMg ?? null,
    loggedAt: new Date().toISOString(),
  };
}

export async function updateLogEntry(id: number, input: Omit<LogInput, 'dayKey'> & { dayKey?: string }): Promise<void> {
  const db = await getDb();
  const kcal = Math.max(0, Math.round(input.kcal));
  if (input.dayKey) {
    await db.runAsync(
      `UPDATE log_entries SET day_key = ?, meal = ?, name = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sat_fat_g = ?, sodium_mg = ?
       WHERE id = ?`,
      [input.dayKey, input.meal, cleanName(input.name), kcal, input.proteinG ?? null, input.carbsG ?? null, input.fatG ?? null, input.fiberG ?? null, input.sugarG ?? null, input.satFatG ?? null, input.sodiumMg ?? null, id],
    );
    return;
  }
  await db.runAsync(
    `UPDATE log_entries SET meal = ?, name = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sat_fat_g = ?, sodium_mg = ?
     WHERE id = ?`,
    [input.meal, cleanName(input.name), kcal, input.proteinG ?? null, input.carbsG ?? null, input.fatG ?? null, input.fiberG ?? null, input.sugarG ?? null, input.satFatG ?? null, input.sodiumMg ?? null, id],
  );
}

export async function deleteLogEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM log_entries WHERE id = ?', [id]);
}

export async function getLogsForDay(dayKeyValue: string): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT id, day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, logged_at FROM log_entries WHERE day_key = ? ORDER BY logged_at ASC, id ASC',
    [dayKeyValue],
  );
  return rows.map(mapLogRow);
}

export async function getRecentLogs(limit = 40): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT id, day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, logged_at FROM log_entries ORDER BY logged_at DESC, id DESC LIMIT ?',
    [limit],
  );
  return rows.map(mapLogRow);
}

export async function getMacrosForDay(dayKeyValue: string): Promise<DayMacros> {
  const logs = await getLogsForDay(dayKeyValue);
  return sumDayMacros(logs);
}

export async function getRecents(limit = 8): Promise<RecentMeal[]> {
  const logs = await getRecentLogs(40);
  return recentsFromLogs(logs, limit);
}

/** Compat: unnamed snack log so older kcal-only callers still feed True Burn. */
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
  const db = await getDb();
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.set(localDayKey(d), 0);
  }
  const cutoff = localCutoffDayKey(days);
  const rows = await db.getAllAsync<{ day_key: string; total: number }>(
    `SELECT day_key, SUM(kcal) AS total FROM log_entries WHERE day_key >= ? GROUP BY day_key ORDER BY day_key ASC`,
    [cutoff],
  );
  for (const row of rows) {
    if (buckets.has(row.day_key)) buckets.set(row.day_key, row.total);
  }
  return Array.from(buckets, ([dayKey, kcal]) => ({ dayKey, kcal }));
}

/* ── Workout sessions (Train only; never sent off-device) ───── */

export async function addWorkoutSession(input: {
  dayKey: string;
  exerciseId: string;
  sets: number;
  reps: number;
  kcal: number;
}): Promise<WorkoutSession> {
  const db = await getDb();
  const kcal = Math.max(0, Math.round(input.kcal));
  const loggedAt = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO workout_sessions (day_key, exercise_id, sets, reps, kcal, logged_at) VALUES (?, ?, ?, ?, ?, ?)',
    [input.dayKey, input.exerciseId, input.sets, input.reps, kcal, loggedAt],
  );
  return {
    id: Number(result.lastInsertRowId),
    dayKey: input.dayKey,
    exerciseId: input.exerciseId,
    sets: input.sets,
    reps: input.reps,
    kcal,
    loggedAt,
  };
}

export async function getWorkoutSessionsForDay(dayKeyValue: string): Promise<WorkoutSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    day_key: string;
    exercise_id: string;
    sets: number;
    reps: number;
    kcal: number;
    logged_at: string;
  }>(
    'SELECT id, day_key, exercise_id, sets, reps, kcal, logged_at FROM workout_sessions WHERE day_key = ? ORDER BY logged_at ASC, id ASC',
    [dayKeyValue],
  );
  return rows.map((r) => ({
    id: r.id,
    dayKey: r.day_key,
    exerciseId: r.exercise_id,
    sets: r.sets,
    reps: r.reps,
    kcal: r.kcal,
    loggedAt: r.logged_at,
  }));
}

export async function deleteWorkoutSession(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM workout_sessions WHERE id = ?', [id]);
}

export async function getWorkoutKcalForDay(dayKeyValue: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(kcal), 0) AS total FROM workout_sessions WHERE day_key = ?',
    [dayKeyValue],
  );
  return row?.total ?? 0;
}