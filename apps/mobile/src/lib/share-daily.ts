/**
 * Content logic for the daily recap card — "yesterday, calibrated".
 *
 * This is the once-a-day share moment: the day closes, the app shows what the
 * numbers added up to, and the user can post it with one tap. The equation is
 * the app's whole thesis (goal − food = remaining, True Burn adjusts the goal)
 * so the card leads with it rather than a bare count.
 *
 * Pure and testable (scripts/check-daily-share.mjs): no React, no storage, no
 * date.now() — the day is a parameter. Copy obeys the same contract as the
 * weekly card: behavior first, never bodies, exactly one site URL.
 */

// Inlined from constants/app.ts / lib/share-card.ts so this module stays
// dependency-free and node-runnable under scripts/check-daily-share.mjs — the
// same leaf-module pattern as share-card.ts. Cross-reference: if the site ever
// moves, update SHARE_SITE_URL in lib/share-card.ts too.
export const DAILY_SHARE_SITE_URL = 'https://calibreat.co.uk';

export type DailyStats = {
  /** The dial's target for that day: adopted True Burn target or formula goal. */
  targetKcal: number;
  /** kcal actually eaten (summed from the day's log). */
  foodKcal: number;
  /** kcal logged in Train that day. Reported, never added to the budget. */
  workoutKcal: number;
  /** The measured burn for context, when True Burn is ready. */
  measuredBurnKcal?: number | null;
  /** True when the dial was driven by an adopted measured target. */
  usedMeasuredTarget?: boolean;
};

export type DailyCopy = {
  /** Kicker above the hero, e.g. "YESTERDAY". */
  kicker: string;
  /** The one sentence that isn't a number, e.g. "You calibrated the day." */
  line: string;
  /** Short caption under the equation, e.g. "Target adapted to your measured burn." */
  note: string;
};

export type DailyCard = {
  /** Hero number: kcal remaining, or the overshoot when over budget. */
  hero: { value: string; label: string };
  /**
   * The equation as readable rows. `signed` marks a row that is subtracted and
   * so renders in the second ink; `muted` marks a row that is a fact about the
   * day rather than a term in the sum.
   */
  equation: { label: string; value: string; signed?: boolean; muted?: boolean }[];
  copy: DailyCopy;
  /** 0–1 dial fill for the day, clamped. */
  fill: number;
};

export type DailyDecision =
  | { eligible: true; card: DailyCard }
  | { eligible: false; reason: 'empty' | 'today' };

/**
 * Build the card. Ineligible when the day is empty (nothing logged and no
 * weigh-in context to show) — a blank card is not a share moment, it is a
 * nag. The equation only ever uses numbers the user entered.
 */
export function buildDailyCard(stats: DailyStats): DailyDecision {
  const food = safeInt(stats.foodKcal);
  const target = safeInt(stats.targetKcal);
  const workout = safeInt(stats.workoutKcal);
  if (food <= 0 && workout <= 0) return { eligible: false, reason: 'empty' };
  if (target <= 0) return { eligible: false, reason: 'empty' };

  // The budget is the target and nothing more. The target already assumes the
  // user trains — the activity multipliers are defined by exercise frequency —
  // and a measured target contains real sessions by construction, so adding a
  // session here would pay for the same training twice. See calorieBudget.
  const budget = target;
  const remaining = budget - food;
  const over = remaining < 0;
  const fill = clamp(food / Math.max(1, budget), 0, 1);

  const equation: DailyCard['equation'] = [
    { label: 'goal', value: fmt(target) },
    // A session with no food logged is eligible (workout > 0) and used to print
    // "food −0": a signed zero is not a number anyone reads, and it implies a
    // subtraction that never happened. Zero is unsigned.
    { label: 'food', value: food > 0 ? `−${fmt(food)}` : fmt(0), signed: food > 0 },
    { label: over ? 'over' : 'left', value: fmt(Math.abs(remaining)) },
    // Training is reported last, muted, and with no "+". Above it the table
    // reads goal − food = left, and this row must not look like a fourth term
    // in that sum. It stays because a trained day is why people post this card.
    ...(workout > 0 ? [{ label: 'trained', value: fmt(workout), muted: true }] : []),
  ];

  const measured = safeInt(stats.measuredBurnKcal ?? null);
  const note =
    stats.usedMeasuredTarget && measured > 0
      ? `Target from your measured burn — est. ${fmt(measured)} kcal`
      : 'Your target, measured from your own data.';

  return {
    eligible: true,
    card: {
      hero: {
        value: fmt(Math.abs(remaining)),
        label: over ? 'kcal over' : 'kcal left',
      },
      equation,
      copy: {
        kicker: 'YESTERDAY, CALIBRATED',
        // "The day, calibrated" is a claim about eating, and a day with a
        // session and no food logged never made one. Say what the app actually
        // knows: a session was logged, food was not.
        line:
          food <= 0
            ? 'Trained, no food logged.'
            : over
              ? 'A day with numbers, not guesses.'
              : 'The day, calibrated.',
        note,
      },
      fill,
    },
  };
}

/**
 * Which day the recap should show for: the most recent *closed* day. Open the
 * app before midnight and there is no recap (the day isn't over); at/after
 * midnight it is yesterday. Ineligible before a user's first full day.
 */
export function recapDayKey(now: Date, todayKey: string, hasAnyLog: boolean): string | null {
  if (!hasAnyLog) return null;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  // A recap for "yesterday" only makes sense if yesterday is a real, closed day —
  // if the clock says the same day as the selected "today" key, there is none.
  return y < todayKey ? y : null;
}

/** The equation's phrasing must stay honest: signed rows for signed facts. */
export function dailyTagline(): string {
  return `Calibrate your eating lifestyle. — ${DAILY_SHARE_SITE_URL.replace(/^https:\/\//, '')}`;
}

function fmt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function safeInt(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
}
