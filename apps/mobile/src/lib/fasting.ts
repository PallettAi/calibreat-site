/**
 * Fasting timer — start/stop an eating fast and show elapsed time.
 *
 * Pure module (checked by scripts/check-fasting.mjs): no React, no storage.
 * Persistence lives in fasting-store.ts (AsyncStorage, same pattern as
 * streak-store). The Home card derives elapsed time from its existing
 * 60-second tick, so the timer adds no timers of its own.
 *
 * There is deliberately no goal/target concept here — the clock plus the
 * common milestone ladder (12/16/18/20/24/36/48 h) covers 16:8, 18:6, OMAD
 * and longer fasts without asking the user to configure anything.
 */

export type FastState = {
  /** ISO timestamp of the running fast's start (null = not fasting). */
  startedAt: string | null;
  /** ISO timestamp of the last completed fast's end. */
  lastEndedAt: string | null;
  /** Duration of the last completed fast, in ms. */
  lastDurationMs: number | null;
};

/** Common fasting milestones, ascending. */
export const FAST_MILESTONE_HOURS = [12, 16, 18, 20, 24, 36, 48] as const;

export function emptyFastState(): FastState {
  return { startedAt: null, lastEndedAt: null, lastDurationMs: null };
}

export function isFasting(state: FastState, nowMs: number): boolean {
  if (!state.startedAt) return false;
  const started = Date.parse(state.startedAt);
  return Number.isFinite(started) && started <= nowMs;
}

export function startFast(state: FastState, nowMs: number): FastState {
  if (isFasting(state, nowMs)) return state;
  return { ...state, startedAt: new Date(nowMs).toISOString() };
}

export function stopFast(state: FastState, nowMs: number): FastState {
  // Guard on startedAt, not isFasting: a clock-skewed future start must still
  // be stoppable (the tap has to always work), recording a 0 duration.
  if (!state.startedAt) return state;
  const started = Date.parse(state.startedAt);
  if (!Number.isFinite(started)) return { ...state, startedAt: null };
  const duration = Math.max(0, nowMs - started);
  return {
    ...state,
    startedAt: null,
    lastEndedAt: new Date(nowMs).toISOString(),
    lastDurationMs: duration,
  };
}

export function fastElapsedMs(state: FastState, nowMs: number): number {
  if (!state.startedAt) return 0;
  const started = Date.parse(state.startedAt);
  if (!Number.isFinite(started) || started > nowMs) return 0;
  return nowMs - started;
}

/** "14h 05m" clock style; "42m" under an hour, "1d 03h" beyond a day. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  return `${minutes}m`;
}

/** Next common milestone above the elapsed time — null once past 48 h. */
export function nextFastMilestone(elapsedMs: number): { hours: number; inLabel: string } | null {
  for (const m of FAST_MILESTONE_HOURS) {
    const atMs = m * 3600000;
    if (elapsedMs < atMs) return { hours: m, inLabel: formatElapsed(atMs - elapsedMs) };
  }
  return null;
}

export type FastProgress = {
  /** Fraction [0..1] toward `targetHours` (or 1 once past 48h). */
  pct: number;
  /** The milestone hour at the left of the current segment (0 for the first 12h). */
  prevHours: number;
  /** The milestone hour being approached (48 once past 48h). */
  targetHours: number;
  /** Completed milestone hours so far. */
  completedMilestones: number[];
};

/**
 * Progress of a running fast across the milestone ladder.
 *
 * Uses overall progress toward the next milestone (0 → targetHours) clamped to
 * [0..1] so a 6h fast toward 12h shows 50%, and a 15h fast toward 16h shows
 * 93.75% — matching how someone reading "16h milestone in 1h" pictures the bar.
 */
export function fastProgress(elapsedMs: number): FastProgress {
  const safeMs = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const completedMilestones: number[] = [];
  let prevHours = 0;
  for (const m of FAST_MILESTONE_HOURS) {
    const atMs = m * 3600000;
    if (safeMs >= atMs) {
      completedMilestones.push(m);
      prevHours = m;
    } else {
      const pct = Math.max(0, Math.min(1, safeMs / atMs));
      return { pct, prevHours, targetHours: m, completedMilestones };
    }
  }
  return {
    pct: 1,
    prevHours: FAST_MILESTONE_HOURS[FAST_MILESTONE_HOURS.length - 1],
    targetHours: FAST_MILESTONE_HOURS[FAST_MILESTONE_HOURS.length - 1],
    completedMilestones,
  };
}

