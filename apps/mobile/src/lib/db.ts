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
import {
  SAVED_MEAL_LIMIT,
  SAVED_MEAL_MAX_ITEMS,
  isValidMealName,
  normalizeMealName,
  type SavedMeal,
  type SavedMealItem,
} from '@/lib/saved-meals';
import { localCutoffDayKey, localDayKey } from '@/lib/dates';
import { parseMicros, serializeMicros, type Micros } from '@/lib/micronutrients';
import type { RestorePlan } from '@/lib/restore';
import { computeGoals, type ActivityLevel, type GoalDirection, type Sex } from '@/lib/nutrition';
import type { HeightUnit, WaterUnit, WeightUnit } from '@/lib/units';

export type { DayMacros, LogEntry, MealSlot, RecentMeal };
export type { SavedMeal, SavedMealItem };

/**
 * calibrEAT local-first data layer (M1).
 *
 * Everything the user logs lives in a single on-device SQLite database —
 * no account, no server storage (the app makes no network calls of its own).
 * All queries are small and day-scoped so the schema
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
  /** Load used for this session (0 = bodyweight / machine); added in v0.0.4. */
  weightKg: number;
  /** Cached sets×reps×weightKg; 0 when weightKg 0. */
  volumeKg: number;
  /** Epley 1RM for (weightKg,reps); 0 when weightKg 0. */
  e1RMKg: number;
  loggedAt: string;
};

export type IntakeEntry = {
  id: number;
  dayKey: string;
  kcal: number;
  loggedAt: string;
};

let dbPromise: Promise<SQLiteDatabase> | null = null;

// Module-private on purpose: the web twin has no SQLite handle to hand back,
// so exporting it made the two data layers disagree on their public API for a
// function nothing outside this file ever calls. scripts/check-db.mjs enforces
// the parity that keeps that from drifting back.
function getDb(): Promise<SQLiteDatabase> {
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
          weight_kg   REAL NOT NULL DEFAULT 0,
          volume_kg   REAL NOT NULL DEFAULT 0,
          e1rm_kg     REAL NOT NULL DEFAULT 0,
          logged_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workout_day ON workout_sessions (day_key);
        CREATE TABLE IF NOT EXISTS saved_meals (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          meal       TEXT NOT NULL,
          items      TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS schema_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      // Columns and tables added after a database was first created. The big
      // CREATE above runs first and is `IF NOT EXISTS` throughout, so it already
      // covers installs from any earlier version — these ALTERs are only for
      // databases whose table exists but predates the column.
      for (const column of [
        'ALTER TABLE workout_sessions ADD COLUMN weight_kg REAL NOT NULL DEFAULT 0',
        'ALTER TABLE workout_sessions ADD COLUMN volume_kg REAL NOT NULL DEFAULT 0',
        'ALTER TABLE workout_sessions ADD COLUMN e1rm_kg REAL NOT NULL DEFAULT 0',
      ]) {
        try {
          await db.execAsync(column);
        } catch {
          // column already exists
        }
      }
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
        'ALTER TABLE log_entries ADD COLUMN micros_json TEXT',
      ]) {
        try {
          await db.execAsync(column);
        } catch {
          // column already exists
        }
      }
      await migrateIntakeEntries(db);
      return db;
    });
    // A failed open must not be sticky. Every screen calls getDb(), and if the
    // first call rejected — a locked file, a WAL left behind by a killed
    // process, a full disk — the cached rejected promise made *every* screen
    // fail for the rest of the session with no way back except a force-quit.
    // Dropping the cache lets the next call try again; if the cause was
    // transient, the app heals itself on the next tap.
    dbPromise = dbPromise.catch((error) => {
      dbPromise = null;
      throw error;
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
  micros_json: string | null;
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
    micros: parseMicros(row.micros_json),
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
  micros?: Micros | null;
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

/**
 * Writes the profile and its computed targets as two upserts.
 *
 * Split out of saveProfile so applyRestore can run it *inside* the restore
 * transaction. It used to call saveProfile after committing, which meant a
 * throw there left the rows written while the UI reported that nothing had
 * changed — a half-finished restore wearing a confident message. Sharing the
 * statement keeps one definition of "write a profile" and makes the whole
 * restore genuinely all-or-nothing.
 *
 * Targets are recomputed by the app's own formula rather than taken from the
 * file, so a backup written by an older version lands on numbers this version
 * would have calculated.
 */
async function writeProfileAndGoals(db: SQLiteDatabase, profile: Profile, goals: Goals, now: string): Promise<void> {
  const supplementsJson = profile.supplements?.length ? JSON.stringify(profile.supplements) : null;
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
}

/** Upserts the profile row and the computed goals row in one transaction. */
export async function saveProfile(profile: Profile): Promise<Goals> {
  const goals = computeGoals(profile);
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await writeProfileAndGoals(db, profile, goals, now);
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

type WeighInRow = { id: number; kg: number; measured_at: string; day_key: string };

const toWeighIn = (r: WeighInRow): WeighIn => ({
  id: r.id,
  kg: r.kg,
  measuredAt: r.measured_at,
  dayKey: r.day_key,
});

/**
 * One end of the weigh-in series. This exists because a limited page cannot
 * answer "which was first" — see getWeighIns. Callers that want an extremum
 * ask for the row directly rather than reading the tail of a truncated list.
 */
async function weighInExtremum(db: SQLiteDatabase, dir: 'ASC' | 'DESC'): Promise<WeighIn | null> {
  const row = await db.getFirstAsync<WeighInRow>(
    `SELECT id, kg, measured_at, day_key FROM weigh_ins ORDER BY measured_at ${dir} LIMIT 1`,
  );
  return row ? toWeighIn(row) : null;
}

/**
 * The most recent `limit` weigh-ins, oldest first.
 *
 * The query takes the newest rows and then reverses them. `ORDER BY ... ASC
 * LIMIT ?` would return the OLDEST 60 instead, which looks fine until someone
 * passes 60 entries: the APK then stops showing recent data at all, while the
 * web twin (slice(-limit)) keeps working, so the two platforms disagree. That
 * fed True Burn, the BMI index and the home trend — the window was the *wrong*
 * 60, not merely misordered, and no amount of re-sorting the result can
 * recover a row the query never fetched.
 */
export async function getWeighIns(limit: number = 60): Promise<WeighIn[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<WeighInRow>(
    'SELECT id, kg, measured_at, day_key FROM weigh_ins ORDER BY measured_at DESC LIMIT ?',
    [limit],
  );
  return rows.map(toWeighIn).reverse();
}

export async function getLatestWeighIn(): Promise<WeighIn | null> {
  return weighInExtremum(await getDb(), 'DESC');
}

/** The very first weigh-in ever recorded, which getWeighIns cannot report. */
export async function getFirstWeighIn(): Promise<WeighIn | null> {
  return weighInExtremum(await getDb(), 'ASC');
}

/* ── Meal log (kcal + optional macros; True Burn sums kcal) ───── */

export async function addLogEntry(input: LogInput): Promise<LogEntry> {
  const db = await getDb();
  const kcal = Math.max(0, Math.round(input.kcal));
  const microsJson = serializeMicros(input.micros);
  const result = await db.runAsync(
    `INSERT INTO log_entries (day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, micros_json, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      microsJson,
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
    micros: parseMicros(microsJson),
    loggedAt: new Date().toISOString(),
  };
}

export async function updateLogEntry(id: number, input: Omit<LogInput, 'dayKey'> & { dayKey?: string }): Promise<void> {
  const db = await getDb();
  const kcal = Math.max(0, Math.round(input.kcal));
  if (input.dayKey) {
    await db.runAsync(
      `UPDATE log_entries SET day_key = ?, meal = ?, name = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sat_fat_g = ?, sodium_mg = ?, micros_json = ?
       WHERE id = ?`,
      [input.dayKey, input.meal, cleanName(input.name), kcal, input.proteinG ?? null, input.carbsG ?? null, input.fatG ?? null, input.fiberG ?? null, input.sugarG ?? null, input.satFatG ?? null, input.sodiumMg ?? null, serializeMicros(input.micros), id],
    );
    return;
  }
  await db.runAsync(
    `UPDATE log_entries SET meal = ?, name = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sat_fat_g = ?, sodium_mg = ?, micros_json = ?
     WHERE id = ?`,
    [input.meal, cleanName(input.name), kcal, input.proteinG ?? null, input.carbsG ?? null, input.fatG ?? null, input.fiberG ?? null, input.sugarG ?? null, input.satFatG ?? null, input.sodiumMg ?? null, serializeMicros(input.micros), id],
  );
}

export async function deleteLogEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM log_entries WHERE id = ?', [id]);
}

export async function getLogsForDay(dayKeyValue: string): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT id, day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, micros_json, logged_at FROM log_entries WHERE day_key = ? ORDER BY logged_at ASC, id ASC',
    [dayKeyValue],
  );
  return rows.map(mapLogRow);
}

export async function getRecentLogs(limit = 40): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT id, day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, micros_json, logged_at FROM log_entries ORDER BY logged_at DESC, id DESC LIMIT ?',
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
  weightKg?: number;
  volumeKg?: number;
  e1RMKg?: number;
}): Promise<WorkoutSession> {
  const db = await getDb();
  const kcal = Math.max(0, Math.round(input.kcal));
  const weightKg = Math.max(0, Math.round((input.weightKg ?? 0) * 10) / 10);
  const reps = Math.max(0, Math.round(input.reps));
  const sets = Math.max(0, Math.round(input.sets));
  // Derive cached volume/e1RM if caller didn't pre-compute — keeps the DB as truth even for old callers.
  const volumeKg = input.volumeKg != null ? Math.max(0, Math.round(input.volumeKg * 10) / 10) : weightKg > 0 && sets > 0 && reps > 0 ? Math.round(sets * reps * weightKg * 10) / 10 : 0;
  const e1RMKg = input.e1RMKg != null ? Math.max(0, Math.round(input.e1RMKg * 10) / 10) : weightKg > 0 && reps > 0 ? Math.round(weightKg * (1 + reps / 30) * 10) / 10 : 0;
  const loggedAt = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO workout_sessions (day_key, exercise_id, sets, reps, kcal, weight_kg, volume_kg, e1rm_kg, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [input.dayKey, input.exerciseId, sets, reps, kcal, weightKg, volumeKg, e1RMKg, loggedAt],
  );
  return {
    id: Number(result.lastInsertRowId),
    dayKey: input.dayKey,
    exerciseId: input.exerciseId,
    sets,
    reps,
    kcal,
    weightKg,
    volumeKg,
    e1RMKg,
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
    weight_kg: number | null;
    volume_kg: number | null;
    e1rm_kg: number | null;
    logged_at: string;
  }>(
    'SELECT id, day_key, exercise_id, sets, reps, kcal, weight_kg, volume_kg, e1rm_kg, logged_at FROM workout_sessions WHERE day_key = ? ORDER BY logged_at ASC, id ASC',
    [dayKeyValue],
  );
  return rows.map((r) => ({
    id: r.id,
    dayKey: r.day_key,
    exerciseId: r.exercise_id,
    sets: r.sets,
    reps: r.reps,
    kcal: r.kcal,
    weightKg: r.weight_kg ?? 0,
    volumeKg: r.volume_kg ?? 0,
    e1RMKg: r.e1rm_kg ?? 0,
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

/* ── Saved meals (repeat-eater shortcut; never sent off-device) ── */

/**
 * Saved meals are stored as a JSON array of items rather than a child table:
 * they are read as a whole, written as a whole, and never queried by item, so a
 * join would buy nothing. Rows that fail to parse are dropped rather than
 * crashing the picker — a corrupt row must not cost the user their log.
 */
function parseSavedItems(raw: string): SavedMealItem[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as Partial<SavedMealItem>;
      const kcal = Number(item.kcal);
      if (!Number.isFinite(kcal)) return [];
      const num = (value: unknown): number | null => {
        const parsedValue = Number(value);
        return value == null || !Number.isFinite(parsedValue) ? null : Math.round(parsedValue);
      };
      return [
        {
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null,
          kcal: Math.round(kcal),
          proteinG: num(item.proteinG),
          carbsG: num(item.carbsG),
          fatG: num(item.fatG),
          fiberG: num(item.fiberG),
          sugarG: num(item.sugarG),
          satFatG: num(item.satFatG),
          sodiumMg: num(item.sodiumMg),
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Newest first, so the thing just saved is the first chip you see. */
export async function getSavedMeals(): Promise<SavedMeal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    meal: string;
    items: string;
    created_at: string;
  }>('SELECT id, name, meal, items, created_at FROM saved_meals ORDER BY created_at DESC, id DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    meal: asMeal(r.meal),
    items: parseSavedItems(r.items),
    createdAt: r.created_at,
  }));
}

/**
 * Saves a group of entries. A name that already exists is *updated in place*
 * rather than duplicated — otherwise "Usual breakfast" quietly becomes five
 * identical chips and the shortcut stops being a shortcut. Callers get `replaced`
 * so the UI can say which happened instead of guessing.
 */
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

  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM saved_meals WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [clean],
  );

  if (existing) {
    await db.runAsync('UPDATE saved_meals SET name = ?, meal = ?, items = ?, created_at = ? WHERE id = ?', [
      clean,
      meal,
      JSON.stringify(items),
      new Date().toISOString(),
      existing.id,
    ]);
    return {
      meal: {
        id: existing.id,
        name: clean,
        meal,
        items,
        createdAt: new Date().toISOString(),
      },
      replaced: true,
    };
  }

  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM saved_meals');
  if ((count?.count ?? 0) >= SAVED_MEAL_LIMIT) {
    throw new Error(`You can keep ${SAVED_MEAL_LIMIT} saved meals. Remove one first.`);
  }

  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO saved_meals (name, meal, items, created_at) VALUES (?, ?, ?, ?)',
    [clean, meal, JSON.stringify(items), createdAt],
  );
  return {
    meal: { id: Number(result.lastInsertRowId), name: clean, meal, items, createdAt },
    replaced: false,
  };
}

export async function deleteSavedMeal(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM saved_meals WHERE id = ?', [id]);
}

/* ── Full-history reads (data export; see src/lib/export.ts) ── */

export async function getAllLogs(): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT id, day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, micros_json, logged_at FROM log_entries ORDER BY logged_at ASC, id ASC',
  );
  return rows.map(mapLogRow);
}

export async function getAllWater(): Promise<WaterEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; day_key: string; ml: number; logged_at: string }>(
    'SELECT id, day_key, ml, logged_at FROM water ORDER BY logged_at ASC, id ASC',
  );
  return rows.map((r) => ({ id: r.id, dayKey: r.day_key, ml: r.ml, loggedAt: r.logged_at }));
}

export async function getAllWeighIns(): Promise<WeighIn[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; kg: number; measured_at: string; day_key: string }>(
    'SELECT id, kg, measured_at, day_key FROM weigh_ins ORDER BY measured_at ASC, id ASC',
  );
  return rows.map((r) => ({ id: r.id, kg: r.kg, measuredAt: r.measured_at, dayKey: r.day_key }));
}

export async function getAllWorkouts(): Promise<WorkoutSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    day_key: string;
    exercise_id: string;
    sets: number;
    reps: number;
    kcal: number;
    weight_kg: number | null;
    volume_kg: number | null;
    e1rm_kg: number | null;
    logged_at: string;
  }>(
    'SELECT id, day_key, exercise_id, sets, reps, kcal, weight_kg, volume_kg, e1rm_kg, logged_at FROM workout_sessions ORDER BY logged_at ASC, id ASC',
  );
  return rows.map((r) => ({
    id: r.id,
    dayKey: r.day_key,
    exerciseId: r.exercise_id,
    sets: r.sets,
    reps: r.reps,
    kcal: r.kcal,
    weightKg: r.weight_kg ?? 0,
    volumeKg: r.volume_kg ?? 0,
    e1RMKg: r.e1rm_kg ?? 0,
    loggedAt: r.logged_at,
  }));
}

/* ── Restore (see src/lib/restore.ts) ─────────────────────────── */

/** Everything a replace-mode restore clears. Listed rather than deleted
 *  table-by-table at the call site so a future table cannot be forgotten. */
const RESTORE_CLEARED_TABLES = [
  'log_entries',
  'water',
  'weigh_ins',
  'intake_entries',
  'workout_sessions',
  'saved_meals',
  'profile',
  'goals',
] as const;

export type RestoreApplied = {
  logEntries: number;
  weighIns: number;
  water: number;
  workouts: number;
  savedMeals: number;
  profile: boolean;
};

/**
 * Write a restore plan into the database.
 *
 * Every row goes in with the `day_key` and timestamp it was exported with,
 * which is the whole reason this cannot go through `addLogEntry` — that stamps
 * `logged_at` as now, and a restored year of meals would all land on today.
 * Ids are left to autoincrement, because the plan dropped the old device's.
 *
 * The inserts share one transaction — including the profile write — so a
 * failure anywhere leaves the database exactly as it was. A half-restored
 * diary is worse than none, and it must never be reported as a clean failure
 * while rows sit in the table.
 */
export async function applyRestore(plan: RestorePlan): Promise<RestoreApplied> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (plan.clears) {
      for (const table of RESTORE_CLEARED_TABLES) {
        await db.runAsync(`DELETE FROM ${table}`);
      }
    }

    for (const entry of plan.logEntries) {
      await db.runAsync(
        `INSERT INTO log_entries (day_key, meal, name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sat_fat_g, sodium_mg, micros_json, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.dayKey,
          entry.meal,
          cleanName(entry.name),
          entry.kcal,
          entry.proteinG,
          entry.carbsG,
          entry.fatG,
          entry.fiberG,
          entry.sugarG,
          entry.satFatG,
          entry.sodiumMg,
          serializeMicros(entry.micros),
          entry.loggedAt,
        ],
      );
    }

    for (const entry of plan.weighIns) {
      await db.runAsync('INSERT INTO weigh_ins (kg, measured_at, day_key) VALUES (?, ?, ?)', [
        entry.kg,
        entry.measuredAt,
        entry.dayKey,
      ]);
    }

    for (const entry of plan.water) {
      await db.runAsync('INSERT INTO water (day_key, ml, logged_at) VALUES (?, ?, ?)', [
        entry.dayKey,
        entry.ml,
        entry.loggedAt,
      ]);
    }

    for (const entry of plan.workouts) {
      await db.runAsync(
        `INSERT INTO workout_sessions (day_key, exercise_id, sets, reps, kcal, weight_kg, volume_kg, e1rm_kg, logged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.dayKey,
          entry.exerciseId,
          entry.sets,
          entry.reps,
          entry.kcal,
          entry.weightKg,
          entry.volumeKg,
          entry.e1RMKg,
          entry.loggedAt,
        ],
      );
    }

    for (const meal of plan.savedMeals) {
      await db.runAsync('INSERT INTO saved_meals (name, meal, items, created_at) VALUES (?, ?, ?, ?)', [
        cleanName(meal.name),
        meal.meal,
        JSON.stringify(meal.items),
        meal.createdAt,
      ]);
    }

    if (plan.profile) {
      const profile = plan.profile as Profile;
      await writeProfileAndGoals(db, profile, computeGoals(profile), new Date().toISOString());
    }
  });

  return {
    logEntries: plan.logEntries.length,
    weighIns: plan.weighIns.length,
    water: plan.water.length,
    workouts: plan.workouts.length,
    savedMeals: plan.savedMeals.length,
    profile: Boolean(plan.profile),
  };
}