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

/** Inclusive local start of a trailing `days`-long window ending at `now`. */
export function localCutoffDayKey(days: number, now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return localDayKey(start);
}
