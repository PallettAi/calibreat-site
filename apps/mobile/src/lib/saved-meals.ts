/**
 * Saved meals — the repeat-eater's shortcut.
 *
 * Most people eat the same breakfast every day and re-search it every morning.
 * A saved meal is a *named group* of log entries ("Usual breakfast" = porridge +
 * coffee + banana) that can be re-logged into any day and meal slot with one tap.
 * A single favourite food is just a one-item saved meal, so there is one concept
 * rather than two.
 *
 * Pure functions only — no database, no React, no platform branches — so the
 * behaviour can be checked in CI (scripts/check-meals.mjs) and shared by both
 * storage implementations without drifting.
 *
 * NOTE: the `type` import below is deliberately a *relative* path with no
 * extension. Node's `--experimental-strip-types` (how the check scripts run this
 * file) erases type-only imports entirely, so nothing has to resolve it at
 * runtime — but a `@/…` alias would not resolve there, and a real import would
 * need an explicit `.ts`.
 */

import type { LogEntry, MealSlot } from './diary';

/** One entry inside a saved meal: a log entry minus when it happened. */
export type SavedMealItem = {
  name: string | null;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
};

export type SavedMeal = {
  id: number;
  name: string;
  /**
   * The slot it was saved from, kept for context. Re-logging always uses the slot
   * you are looking at, never this one — saving porridge at breakfast and logging
   * it at dinner is a legitimate thing to want.
   */
  meal: MealSlot;
  items: SavedMealItem[];
  createdAt: string;
};

/** A saved meal has to be re-loggable, so it needs at least one item. */
export const SAVED_MEAL_MAX_ITEMS = 25;
export const SAVED_MEAL_NAME_MAX = 40;
/** A cap keeps the quick-pick list a shortcut rather than a second food diary. */
export const SAVED_MEAL_LIMIT = 30;

/**
 * Trim, collapse inner whitespace and cap the length. Saved names are shown in a
 * one-line chip, so a pasted paragraph has to become something displayable.
 */
export function normalizeMealName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SAVED_MEAL_NAME_MAX);
}

/** Two characters minimum, so the chip is never an unlabelled mystery. */
export function isValidMealName(raw: string): boolean {
  return normalizeMealName(raw).length >= 2;
}

/** Strip the day/slot/timestamp from a log entry, keeping the nutrients. */
export function mealItemsFromLogs(logs: LogEntry[]): SavedMealItem[] {
  return logs.slice(0, SAVED_MEAL_MAX_ITEMS).map((entry) => ({
    name: entry.name,
    kcal: Math.round(entry.kcal),
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    fiberG: entry.fiberG ?? null,
    sugarG: entry.sugarG ?? null,
    satFatG: entry.satFatG ?? null,
    sodiumMg: entry.sodiumMg ?? null,
  }));
}

/** Kcal always counts; macros only when they were known. Mirrors sumDayMacros. */
export function savedMealTotals(items: SavedMealItem[]): {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const item of items) {
    kcal += item.kcal;
    proteinG += item.proteinG ?? 0;
    carbsG += item.carbsG ?? 0;
    fatG += item.fatG ?? 0;
  }
  return { kcal: Math.round(kcal), proteinG: Math.round(proteinG), carbsG: Math.round(carbsG), fatG: Math.round(fatG) };
}

/**
 * The rows to insert when a saved meal is re-logged. Returns plain log inputs
 * (day + slot applied) so the callers can use the existing `addLogEntry`, which
 * keeps the two storage implementations from needing a third write path each.
 */
export function savedMealInputs(
  items: SavedMealItem[],
  dayKey: string,
  meal: MealSlot,
): (SavedMealItem & { dayKey: string; meal: MealSlot })[] {
  return items.map((item) => ({ ...item, dayKey, meal }));
}

/** `Porridge with berries + 2 more` — what is actually in this saved meal. */
export function savedMealItemSummary(items: SavedMealItem[]): string {
  if (!items.length) return 'Empty';
  const named = items.map((item) => (item.name?.trim() ? item.name.trim() : '')).filter(Boolean);
  if (!named.length) return items.length === 1 ? '1 quick add' : `${items.length} quick adds`;
  const [first, ...rest] = named;
  if (!rest.length) return items.length > named.length ? `${first} + ${items.length - named.length} more` : first;
  return `${first} + ${items.length - 1} more`;
}

/** `3 items · 520 kcal` for the saved list. */
export function savedMealMeta(items: SavedMealItem[]): string {
  const { kcal } = savedMealTotals(items);
  return `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${kcal.toLocaleString()} kcal`;
}
