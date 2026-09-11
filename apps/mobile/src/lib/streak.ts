/**
 * Claim-button streak. The next claim unlocks 24 hours after the last one.
 * Miss that next 24-hour window and the run zeros. Best is kept.
 */

export const STREAK_CLAIM_MS = 24 * 60 * 60 * 1000;

export type StreakState = {
  current: number;
  lastClaimedAt: string | null;
  lastClaimedDayKey: string | null;
  best: number;
};

export function emptyStreak(): StreakState {
  return { current: 0, lastClaimedAt: null, lastClaimedDayKey: null, best: 0 };
}

function dayKeyFromMs(ms: number): string {
  const date = new Date(ms);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function claimedAtMs(state: StreakState | null | undefined): number | null {
  if (typeof state?.lastClaimedAt === 'string') {
    const t = Date.parse(state.lastClaimedAt);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export function streakNeedsClaim(state: StreakState | null | undefined, now: number): boolean {
  const last = claimedAtMs(state);
  if (last == null) return true;
  return now >= last + STREAK_CLAIM_MS;
}

export function msUntilClaim(state: StreakState | null | undefined, now: number): number {
  const last = claimedAtMs(state);
  if (last == null) return 0;
  return Math.max(0, last + STREAK_CLAIM_MS - now);
}

export function claimStreak(state: StreakState | null | undefined, now: number): StreakState {
  const prev = state ?? emptyStreak();
  if (!streakNeedsClaim(prev, now)) return prev;
  const last = claimedAtMs(prev);
  const current =
    last == null && prev.current > 0
      ? prev.current
      : last != null && now < last + STREAK_CLAIM_MS * 2
        ? prev.current + 1
        : 1;
  return {
    current,
    lastClaimedAt: new Date(now).toISOString(),
    lastClaimedDayKey: dayKeyFromMs(now),
    best: Math.max(prev.best, current),
  };
}

/** Zero the run if the next 24-hour claim window was missed. */
export function expireStreak(state: StreakState | null | undefined, now: number): StreakState {
  const prev = state ?? emptyStreak();
  const last = claimedAtMs(prev);
  // Legacy rows (run > 0, no clock yet) wait for the first button claim.
  if (last == null) {
    if (prev.current > 0) return prev;
    return { ...emptyStreak(), best: prev.best };
  }
  if (now < last + STREAK_CLAIM_MS * 2) return prev;
  return { ...prev, current: 0 };
}

/** How many of the 7 week pips are lit. The raw count may be larger than 7. */
export function weekPips(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return 0;
  return ((Math.round(current) - 1) % 7) + 1;
}

export function formatClaimWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
