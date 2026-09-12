/**
 * Local calendar helpers. Logs and history windows use the device's local
 * YYYY-MM-DD, never UTC `date('now')`.
 */

export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Shift a local YYYY-MM-DD by whole days (`-1` is yesterday).
 *
 * Parsed by hand on purpose: `new Date('2026-09-12')` is read as UTC midnight,
 * which in any negative-offset timezone is *the previous local day* — so
 * "copy yesterday" would quietly copy the day before that.
 */
export function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localDayKey(date);
}

/** The local day before `dayKey`. */
export function previousDayKey(dayKey: string): string {
  return shiftDayKey(dayKey, -1);
}

/** Inclusive local start of a trailing `days`-long window ending at `now`. */
export function localCutoffDayKey(days: number, now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return localDayKey(start);
}
