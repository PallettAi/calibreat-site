/**
 * Meal-log helpers for calibrEAT (food diary v1).
 *
 * Pure functions so day totals, recents, and intake migration can be checked
 * without SQLite. The DB layer stores these shapes and the dashboard sums them.
 */

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export type LogMacros = {
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  satFatG?: number | null;
  sodiumMg?: number | null;
};

export type LogEntry = LogMacros & {
  id: number;
  dayKey: string;
  meal: MealSlot;
  name: string | null;
  loggedAt: string;
};

export type DayMacros = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  satFatG: number;
  sodiumMg: number;
};

export type RecentMeal = {
  name: string;
  meal: MealSlot;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
};

/** Sum a day's log. Kcal always counts; P/C/F only count when filled in. */
export function sumDayMacros(entries: LogMacros[]): DayMacros {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let fiberG = 0;
  let sugarG = 0;
  let satFatG = 0;
  let sodiumMg = 0;
  for (const entry of entries) {
    kcal += entry.kcal;
    if (entry.proteinG != null) proteinG += entry.proteinG;
    if (entry.carbsG != null) carbsG += entry.carbsG;
    if (entry.fatG != null) fatG += entry.fatG;
    if (entry.fiberG != null) fiberG += entry.fiberG;
    if (entry.sugarG != null) sugarG += entry.sugarG;
    if (entry.satFatG != null) satFatG += entry.satFatG;
    if (entry.sodiumMg != null) sodiumMg += entry.sodiumMg;
  }
  return { kcal, proteinG, carbsG, fatG, fiberG, sugarG, satFatG, sodiumMg };
}

/**
 * Distinct named meals, most recent first. Unnamed quick-adds are skipped.
 * Duplicate names (case-insensitive, trimmed) collapse to the latest snapshot.
 */
export function recentsFromLogs(entries: LogEntry[], limit = 8): RecentMeal[] {
  const seen = new Set<string>();
  const out: RecentMeal[] = [];
  const newestFirst = entries.slice().sort((a, b) => b.loggedAt.localeCompare(a.loggedAt) || b.id - a.id);
  for (const entry of newestFirst) {
    const name = entry.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      meal: entry.meal,
      kcal: entry.kcal,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      fiberG: entry.fiberG ?? null,
      sugarG: entry.sugarG ?? null,
      satFatG: entry.satFatG ?? null,
      sodiumMg: entry.sodiumMg ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function groupLogsByMeal(entries: LogEntry[]): Record<MealSlot, LogEntry[]> {
  const grouped: Record<MealSlot, LogEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const entry of entries) {
    grouped[entry.meal].push(entry);
  }
  return grouped;
}

/** Old kcal-only intake rows become unnamed snack logs with unset macros. */
export function migrateIntakeToLogs(
  intake: { dayKey: string; kcal: number; loggedAt: string }[],
): Omit<LogEntry, 'id'>[] {
  return intake
    .filter((row) => row.kcal > 0)
    .map((row) => ({
      dayKey: row.dayKey,
      meal: 'snack' as const,
      name: null,
      kcal: row.kcal,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      sugarG: null,
      satFatG: null,
      sodiumMg: null,
      loggedAt: row.loggedAt,
    }));
}

export function parseOptionalGrams(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export function parseRequiredKcal(raw: string): number | null {
  const value = parseFloat(raw.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

export function logDisplayName(entry: Pick<LogEntry, 'name'>): string {
  const name = entry.name?.trim();
  return name && name.length > 0 ? name : 'Energy';
}
