/**
 * Monday–Sunday calorie bank (Android test cluster).
 *
 * The week has a fixed pool (7 × base target). Eating under target on Monday
 * raises what is left for the rest of the week, and eating over lowers it.
 * Pure module: dates are plain `YYYY-MM-DD` keys and all arithmetic runs in
 * UTC, so the result does not depend on the device timezone or DST.
 */

export const BANK_SWING_KCAL = 400;

export type WeekBank = {
  /** Monday of the week containing `todayKey`, `YYYY-MM-DD`. */
  weekStartKey: string;
  weekPool: number;
  /** Food logged from Monday through today, inclusive. */
  foodToDate: number;
  /** weekPool − foodToDate. Negative when the week is already over budget. */
  weekLeftover: number;
  /** Days left including today: Monday = 7, Sunday = 1. */
  daysLeft: number;
  /** Today's share of the leftover, before the swing clamp. */
  rawToday: number;
  /** Bank for today: clamped to base ± 400, then to [0, leftover]. */
  bankedToday: number;
};

const DAY_MS = 86400000;

function parseKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function formatKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-based index: Monday = 0 … Sunday = 6. */
export function mondayIndex(todayKey: string): number | null {
  const ms = parseKey(todayKey);
  if (ms == null) return null;
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/** Keys for Monday through Sunday of the week containing `todayKey`. */
export function weekKeys(todayKey: string): string[] | null {
  const ms = parseKey(todayKey);
  const idx = mondayIndex(todayKey);
  if (ms == null || idx == null) return null;
  const monday = ms - idx * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => formatKey(monday + i * DAY_MS));
}

export function computeWeekBank(input: {
  todayKey: string;
  baseTarget: number;
  /** Food kcal by dayKey. Missing days count as 0 (nothing was logged). */
  foodByDay: Record<string, number>;
}): WeekBank | null {
  const keys = weekKeys(input.todayKey);
  const idx = mondayIndex(input.todayKey);
  if (keys == null || idx == null) return null;

  const base = Number.isFinite(input.baseTarget) ? Math.max(0, Math.round(input.baseTarget)) : 0;
  const weekPool = 7 * base;

  let foodToDate = 0;
  for (let i = 0; i <= idx; i += 1) {
    const kcal = input.foodByDay[keys[i]!];
    if (kcal != null && Number.isFinite(kcal) && kcal > 0) foodToDate += kcal;
  }
  foodToDate = Math.round(foodToDate);

  const weekLeftover = weekPool - foodToDate;
  const daysLeft = 7 - idx;
  const rawToday = weekLeftover / daysLeft;

  const swung = Math.min(base + BANK_SWING_KCAL, Math.max(base - BANK_SWING_KCAL, Math.round(rawToday)));
  // A blown week shows 0 from the bank, not a fake base − 400.
  const bankedToday = Math.max(0, Math.min(swung, weekLeftover));

  return {
    weekStartKey: keys[0]!,
    weekPool,
    foodToDate,
    weekLeftover,
    daysLeft,
    rawToday,
    bankedToday,
  };
}
