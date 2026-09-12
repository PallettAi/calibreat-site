/**
 * Data export — backups and spreadsheets, created entirely on-device.
 *
 * Users who trust an app with six months of logs need a way out: a backup for
 * device migration (JSON, everything) and a spreadsheet-friendly diary (CSV,
 * one row per meal entry). Nothing here touches the network — the strings are
 * handed to a share sheet (export-share.ts) that the platform owns.
 *
 * Pure functions only — no database, no React, no platform branches — so the
 * shapes and CSV escaping are checked in CI (scripts/check-export.mjs) and the
 * module is safe for both storage implementations to feed.
 *
 * NOTE: the `type` import below is deliberately a *relative* path with no
 * extension. Node's `--experimental-strip-types` (how the check scripts run
 * this file) erases type-only imports entirely — but a `@/…` alias would not
 * resolve there. See src/lib/saved-meals.ts for the same pattern.
 */

import type { MealSlot } from './diary';

/** Version tag for the JSON payload. Bump when the bundle shape changes. */
export const EXPORT_SCHEMA = 'calibreat.export.v1';

/** Structural echo of the storage layer's LogEntry (keeps this module pure).
 *  The micro nutrients tolerate `undefined` so both storage twins — where they
 *  are optional — can be passed without a per-row mapping step. */
export type ExportLogEntry = {
  id: number;
  dayKey: string;
  meal: MealSlot;
  name: string | null;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  satFatG?: number | null;
  sodiumMg?: number | null;
  loggedAt: string;
};

export type ExportWeighIn = {
  id: number;
  kg: number;
  measuredAt: string;
  dayKey: string;
};

export type ExportWaterEntry = {
  id: number;
  dayKey: string;
  ml: number;
  loggedAt: string;
};

export type ExportWorkout = {
  id: number;
  dayKey: string;
  exerciseId: string;
  sets: number;
  reps: number;
  kcal: number;
  loggedAt: string;
};

export type ExportSavedMeal = {
  id: number;
  name: string;
  meal: MealSlot;
  items: {
    name: string | null;
    kcal: number;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    sugarG: number | null;
    satFatG: number | null;
    sodiumMg: number | null;
  }[];
  createdAt: string;
};

/** What the caller assembles from the storage layer before building a bundle. */
export type ExportInput = {
  exportedAt?: string;
  profile: {
    sex: string;
    ageYears: number;
    heightCm: number;
    weightKg: number;
    activityLevel: string;
    goal: string;
    ratePerWeek: number;
    /** Optional so the storage twins (where it is optional) pass through directly. */
    supplements?: string[];
  } | null;
  goals: {
    bmr: number;
    tdee: number;
    calorieTarget: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
  logEntries: ExportLogEntry[];
  weighIns: ExportWeighIn[];
  water: ExportWaterEntry[];
  workouts: ExportWorkout[];
  savedMeals: ExportSavedMeal[];
};

/** The versioned JSON payload, ready to stringify and share. */
export type ExportBundle = {
  app: 'calibrEAT';
  schema: typeof EXPORT_SCHEMA;
  exportedAt: string;
  counts: {
    logEntries: number;
    weighIns: number;
    water: number;
    workouts: number;
    savedMeals: number;
  };
  profile: ExportInput['profile'];
  goals: ExportInput['goals'];
  logEntries: ExportLogEntry[];
  weighIns: ExportWeighIn[];
  water: ExportWaterEntry[];
  workouts: ExportWorkout[];
  savedMeals: ExportSavedMeal[];
};

/** Assemble the versioned bundle: meta, counts, and the data itself. */
export function buildExportBundle(input: ExportInput): ExportBundle {
  return {
    app: 'calibrEAT',
    schema: EXPORT_SCHEMA,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    counts: {
      logEntries: input.logEntries.length,
      weighIns: input.weighIns.length,
      water: input.water.length,
      workouts: input.workouts.length,
      savedMeals: input.savedMeals.length,
    },
    profile: input.profile,
    goals: input.goals,
    logEntries: input.logEntries,
    weighIns: input.weighIns,
    water: input.water,
    workouts: input.workouts,
    savedMeals: input.savedMeals,
  };
}

/** `calibreat-backup-2026-09-12.json` / `calibreat-diary-2026-09-12.csv`. */
export function exportFileName(kind: 'backup' | 'diary', now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return kind === 'backup' ? `calibreat-backup-${y}-${m}-${d}.json` : `calibreat-diary-${y}-${m}-${d}.csv`;
}

/**
 * RFC 4180 escaping: quote a field that contains a comma, quote or newline,
 * doubling any quotes inside. Empty string stands in for null so spreadsheets
 * show blank cells, not the word "null".
 */
export function csvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

const DIARY_HEADER = [
  'day',
  'meal',
  'name',
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'sat_fat_g',
  'sodium_mg',
  'logged_at',
] as const;

/** One row per meal entry — the spreadsheet users actually ask for. */
export function diaryCsv(entries: ExportLogEntry[]): string {
  const lines = [DIARY_HEADER.join(',')];
  for (const entry of entries) {
    lines.push(
      [
        entry.dayKey,
        entry.meal,
        csvField(entry.name),
        entry.kcal,
        entry.proteinG,
        entry.carbsG,
        entry.fatG,
        entry.fiberG,
        entry.sugarG,
        entry.satFatG,
        entry.sodiumMg,
        entry.loggedAt,
      ].join(','),
    );
  }
  // CRLF line endings are the CSV convention some spreadsheet apps expect.
  return `${lines.join('\r\n')}\r\n`;
}

/** `42 meals · 12 weigh-ins · 90 water entries` for the settings row. */
export function describeBundle(bundle: Pick<ExportBundle, 'counts'>): string {
  const { logEntries, weighIns, water, workouts, savedMeals } = bundle.counts;
  const parts = [`${logEntries} ${logEntries === 1 ? 'meal' : 'meals'}`, `${weighIns} weigh-ins`, `${water} water`];
  if (workouts) parts.push(`${workouts} workouts`);
  if (savedMeals) parts.push(`${savedMeals} saved`);
  return parts.join(' · ');
}
