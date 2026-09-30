/**
 * calibrEAT nutrition math (M1).
 *
 * Goals are computed at profile setup and stored in SQLite; the dashboard
 * reads the stored row rather than recomputing on every render. Because BMR
 * moves with body weight, `recheckTargets` re-derives them against the latest
 * weigh-in so the stored target does not silently go stale.
 * All formulas are the standard, explainable ones:
 *   BMR  — Mifflin-St Jeor
 *   TDEE — BMR × activity multiplier
 *   Target — TDEE ± rate-based adjustment (lose/gain), floored for safety
 *   Macros — protein g/kg, fat % of target, carbs = remainder
 */

export type Sex = 'female' | 'male';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export type GoalDirection = 'lose' | 'maintain' | 'gain' | 'monitor';

/** Goals that adjust the calorie target up/down (as opposed to tracking). */
export const ADJUSTING_GOALS: GoalDirection[] = ['lose', 'gain'];

export const GOAL_OPTIONS: { value: GoalDirection; label: string; detail: string }[] = [
  { value: 'lose', label: 'Lose', detail: 'Gentle calorie deficit' },
  { value: 'maintain', label: 'Maintain', detail: 'Stay where you are' },
  { value: 'gain', label: 'Gain', detail: 'Build with a surplus' },
  { value: 'monitor', label: 'Just monitor', detail: 'No targets — just log your intake' },
];

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; detail: string; multiplier: number }[] = [
  { value: 'sedentary', label: 'Not very active', detail: 'Desk job, little exercise', multiplier: 1.2 },
  { value: 'light', label: 'Lightly active', detail: 'Exercise 1–3 days a week', multiplier: 1.375 },
  { value: 'moderate', label: 'Moderately active', detail: 'Exercise 3–5 days a week', multiplier: 1.55 },
  { value: 'active', label: 'Very active', detail: 'Exercise 6–7 days a week', multiplier: 1.725 },
  { value: 'very_active', label: 'Extremely active', detail: 'Physical job + hard training', multiplier: 1.9 },
];

export const RATE_OPTIONS = [
  { value: 0.25, label: 'Gentle · 0.25 kg / week' },
  { value: 0.5, label: 'Steady · 0.5 kg / week' },
] as const;

const KCAL_PER_KG = 7700; // energy in a kg of body fat, roughly
const SAFE_FLOOR_KCAL = 1200;
const SAFE_CEILING_KCAL = 4000;

export function bmr(profile: {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
}): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.ageYears;
  // Normalise before comparing. `sex` is `TEXT NOT NULL` in the schema with no
  // CHECK constraint, and a restored/imported profile can carry "Male" — which
  // failed a bare `=== 'male'` and silently took the female offset, understating
  // a male's BMR by 166 kcal/day and every target derived from it.
  const sex = String(profile.sex ?? '').trim().toLowerCase();
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export function tdee(bmrValue: number, activityLevel: ActivityLevel): number {
  const level = ACTIVITY_LEVELS.find((l) => l.value === activityLevel) ?? ACTIVITY_LEVELS[1];
  return Math.round(bmrValue * level.multiplier);
}

export type ComputedGoals = {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Adjustment applied to TDEE to reach the target (negative = deficit). */
  dailyAdjustment: number;
};

/** Everything `computeGoals` needs — the profile minus its id/timestamps. */
export type GoalInputs = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalDirection;
  ratePerWeek: number;
};

export function computeGoals(profile: GoalInputs): ComputedGoals {
  const b = bmr(profile);
  const t = tdee(b, profile.activityLevel);

  let adjustment = 0;
  if (profile.goal === 'lose' || profile.goal === 'gain') {
    const direction = profile.goal === 'lose' ? -1 : 1;
    adjustment = direction * Math.round(((profile.ratePerWeek * KCAL_PER_KG) / 7 / 25) * 25);
  }

  const calorieTarget = clamp(Math.round(t + adjustment), SAFE_FLOOR_KCAL, SAFE_CEILING_KCAL);

  // Protein at 1.8 g/kg of current body weight (common target for
  // weight management); fat at 25% of the calorie target; carbs = remainder.
  // Protein is capped at 40% of the calorie target: the target itself is
  // clamped to 1200–4000, but weight was not, so a 250 kg profile produced a
  // 450 g protein row (1800 kcal, 45% of calories) that no longer reconciled
  // with the stated 25%-fat / remainder-carbs split.
  const proteinG = Math.min(
    Math.round(profile.weightKg * 1.8),
    Math.round((calorieTarget * 0.4) / 4),
  );
  const fatG = Math.round((calorieTarget * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((calorieTarget - proteinG * 4 - fatG * 9) / 4));

  return { bmr: b, tdee: t, calorieTarget, proteinG, carbsG, fatG, dailyAdjustment: adjustment };
}

/** Healthy weight range (kg) for a height, from the standard BMI 18.5–24.9 band. */
export function healthyWeightRange(heightCm: number): { minKg: number; maxKg: number } {
  const m = heightCm / 100;
  return {
    minKg: Math.round(18.5 * m * m * 10) / 10,
    maxKg: Math.round(24.9 * m * m * 10) / 10,
  };
}

/** kg / m², one decimal. Null when height or weight is not usable. */
export function bodyMassIndex(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

export type BmiBand = 'underweight' | 'healthy' | 'overweight' | 'obese';

export function bmiBand(bmi: number): BmiBand {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'healthy';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

export type BmiWeightSource = 'weigh-in' | 'setup';

export function resolveBmiWeight(
  setupKg: number,
  weighIns: Array<{ kg: number; at: string }>,
): { kg: number; source: BmiWeightSource; at: string | null } {
  const latest = weighIns[weighIns.length - 1];
  if (latest && Number.isFinite(latest.kg) && latest.kg > 0) {
    return { kg: latest.kg, source: 'weigh-in', at: latest.at };
  }
  return { kg: setupKg, source: 'setup', at: null };
}

/**
 * The day's eat budget: the food target, and nothing else.
 *
 * It deliberately does NOT add logged Train kcal. `ACTIVITY_LEVELS` above
 * defines its multipliers by exercise frequency — "moderate" means "Exercise
 * 3–5 days a week" — so a session is already paid for inside the target, and
 * adding it again counts the same training twice. It bites hardest once True
 * Burn is adopted: a measured target is derived from actual intake against
 * actual weight change, so it contains training by construction.
 *
 * Most tracking apps add the session on top, which quietly tells the user to
 * eat kcal they did not burn. That is the thing this app is for not doing.
 * Reintroducing the addition needs a reason that survives this paragraph.
 */
export function calorieBudget(target: number): number {
  return Math.round(Number.isFinite(target) ? target : 0);
}

/** kcal left to eat. Training is inside the target already — see calorieBudget. */
export function caloriesRemaining(input: { target: number; foodKcal: number }): number {
  const food = Number.isFinite(input.foodKcal) ? input.foodKcal : 0;
  return Math.round(calorieBudget(input.target) - food);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ── True Burn Learning (adaptive TDEE) ──────────────────────── */

export type WeighPoint = { kg: number; at: string };
export type IntakePoint = { dayKey: string; kcal: number };

export type AdaptiveConfidence = 'low' | 'medium' | 'high';

export type AdaptiveResult = {
  /** Whether we had enough data to adapt. */
  ready: boolean;
  /** Reason when not ready (shown in UI). */
  reason?: string;
  /** Estimated TDEE from profile (static). */
  estimatedTdee: number;
  /** Measured TDEE inferred from the window. */
  measuredTdee?: number;
  /** Delta = measured - estimated. */
  delta?: number;
  /** Suggested calorie target that tracks the measured burn (+ goal adjustment). */
  suggestedTarget?: number;
  windowDays: number;
  weighInsUsed: number;
  /** Days in the weigh-in window with intake logged. */
  loggedDays?: number;
  /** Confidence based on window length, weigh-ins and logging coverage. */
  confidence?: AdaptiveConfidence;
  /** Blend toward estimate (0 = full trust, 0.3 = 30% blended). */
  blend?: number;
};

export type AdaptiveHistoryPoint = {
  dayKey: string;
  measuredTdee: number;
  estimatedTdee: number;
  delta: number;
};

export type PlateauResult = {
  isPlateau: boolean;
  message?: string;
};

export function adaptiveConfidence(windowDays: number, weighInsUsed: number, loggedDays: number): AdaptiveConfidence {
  if (windowDays >= 21 && weighInsUsed >= 4 && loggedDays >= 14) return 'high';
  if (windowDays >= 14 && weighInsUsed >= 3 && loggedDays >= 10) return 'medium';
  return 'low';
}

/** Expanding-window history of measured burn — one point per weigh-in after the second. */
export function adaptiveHistory(opts: {
  estimatedTdee: number;
  weighIns: WeighPoint[];
  intakeByDay: IntakePoint[];
  goal: GoalDirection;
  ratePerWeek: number;
}): AdaptiveHistoryPoint[] {
  const sorted = opts.weighIns.slice().sort((a, b) => a.at.localeCompare(b.at));
  const out: AdaptiveHistoryPoint[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prefix = sorted.slice(0, i + 1);
    const res = adaptiveTdee({
      estimatedTdee: opts.estimatedTdee,
      weighIns: prefix,
      intakeByDay: opts.intakeByDay,
      goal: opts.goal,
      ratePerWeek: opts.ratePerWeek,
    });
    if (res.ready && res.measuredTdee != null && res.delta != null) {
      out.push({
        dayKey: dayKeyForDate(new Date(prefix[prefix.length - 1]!.at)),
        measuredTdee: res.measuredTdee,
        estimatedTdee: res.estimatedTdee,
        delta: res.delta,
      });
    }
  }
  return out;
}

/** Plateau: weight flat while in a deficit/surplus window. */
export function detectPlateau(opts: {
  weighIns: WeighPoint[];
  intakeByDay: IntakePoint[];
  adaptive: AdaptiveResult;
}): PlateauResult {
  const a = opts.adaptive;
  if (!a.ready || a.measuredTdee == null || a.estimatedTdee == null) return { isPlateau: false };
  if (a.windowDays < 10) return { isPlateau: false };
  if ((a.loggedDays ?? 0) < 7) return { isPlateau: false };
  const sorted = opts.weighIns.slice().sort((x, b) => x.at.localeCompare(b.at));
  if (sorted.length < 2) return { isPlateau: false };
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const deltaKg = last.kg - first.kg;
  const flat = Math.abs(deltaKg) < 0.4;
  if (!flat) return { isPlateau: false };
  // Also need meaningful gap between measured and target/intake — otherwise flat is expected.
  // Use |measured - estimated| > 150 as proxy for formula drift, or check avg intake vs measured.
  const intakeMap = new Map(opts.intakeByDay.map((p) => [p.dayKey, p.kcal]));
  const windowKeys = enumerateDayKeys(first.at, last.at);
  const logged = windowKeys.filter((k) => (intakeMap.get(k) ?? 0) > 0);
  const sum = windowKeys.reduce((s, k) => s + (intakeMap.get(k) ?? 0), 0);
  const avg = logged.length ? sum / logged.length : 0;
  const deficitVsMeasured = a.measuredTdee - avg;
  // For lose: should be in deficit (>150) but flat. For gain: surplus but flat. Maintain: flat with no drift is not a plateau.
  if (Math.abs(deficitVsMeasured) < 120 && Math.abs(a.delta ?? 0) < 120) return { isPlateau: false };
  const direction = deficitVsMeasured > 0 ? 'under' : 'over';
  const kcal = Math.round(Math.abs(deficitVsMeasured));
  return {
    isPlateau: true,
    message:
      a.windowDays >= 14
        ? `Weight flat ${a.windowDays}d while ~${kcal} kcal ${direction} True Burn — check portions, activity, or logging gaps.`
        : `Weight flat ${a.windowDays}d while tracking — check portions or weigh-in timing.`,
  };
}

/**
 * Adaptive TDEE: infers your real burn from weigh-ins + intake.
 *
 * Energy balance over the weigh-in window (first → last):
 *   Δweight(kg) × 7700  ≈  sum(intake) − TDEE × days
 * so:
 *   measuredTDEE = (sumIntake − Δkg×7700) / days
 *
 * Requirements to return `ready: true`:
 * - at least 2 weigh-ins spanning >= 7 days
 * - at least 7 days of intake coverage in the window (so the average is meaningful)
 *
 * Unlogged days are *not* treated as 0 kcal. Intake is averaged over logged
 * days, then the weigh-in Δkg is spread across the full calendar span
 * (missing-at-random). Dividing sparse intake by the full span understates burn.
 *
 * The result is clamped to a sane 1200–4500 range and blended 30% toward the
 * estimate to avoid wild swings on noisy early data.
 */
export function adaptiveTdee(opts: {
  estimatedTdee: number;
  weighIns: WeighPoint[];
  intakeByDay: IntakePoint[];
  goal: GoalDirection;
  ratePerWeek: number;
}): AdaptiveResult {
  const estimatedTdee = Math.round(opts.estimatedTdee);
  if (opts.weighIns.length < 2) {
    return { ready: false, reason: 'Need at least 2 weigh-ins, 7 days apart.', estimatedTdee, windowDays: 0, weighInsUsed: opts.weighIns.length };
  }
  const sorted = opts.weighIns.slice().sort((a, b) => a.at.localeCompare(b.at));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const days = daysBetween(first.at, last.at);
  if (days < 7) {
    return { ready: false, reason: `Only ${days} day${days === 1 ? '' : 's'} between weigh-ins — need 7+.`, estimatedTdee, windowDays: days, weighInsUsed: sorted.length };
  }
  // Build a dayKey → kcal map for the window (inclusive).
  const intakeMap = new Map(opts.intakeByDay.map((p) => [p.dayKey, p.kcal]));
  const windowKeys = enumerateDayKeys(first.at, last.at);
  const loggedDays = windowKeys.filter((k) => (intakeMap.get(k) ?? 0) > 0).length;
  if (loggedDays < 7) {
    return { ready: false, reason: `Only ${loggedDays} day${loggedDays === 1 ? '' : 's'} with intake logged — need 7+.`, estimatedTdee, windowDays: days, weighInsUsed: sorted.length };
  }
  const sumIntake = windowKeys.reduce((s, k) => s + (intakeMap.get(k) ?? 0), 0);
  const avgIntake = sumIntake / loggedDays;
  const deltaKg = last.kg - first.kg;
  const rawMeasured = avgIntake - (deltaKg * KCAL_PER_KG) / days;
  const clamped = clamp(Math.round(rawMeasured), 1200, 4500);
  // Blend 30% toward the estimate early on to damp noise; allow full trust
  // once we have 21+ days of data.
  const blend = days >= 21 ? 0 : days >= 14 ? 0.15 : 0.3;
  const measuredTdee = Math.round(clamped * (1 - blend) + estimatedTdee * blend);
  const delta = measuredTdee - estimatedTdee;
  let adjustment = 0;
  if (opts.goal === 'lose' || opts.goal === 'gain') {
    const dir = opts.goal === 'lose' ? -1 : 1;
    adjustment = dir * Math.round(((opts.ratePerWeek * KCAL_PER_KG) / 7 / 25) * 25);
  }
  const suggestedTarget = clamp(Math.round(measuredTdee + adjustment), SAFE_FLOOR_KCAL, SAFE_CEILING_KCAL);
  const confidence = adaptiveConfidence(days, sorted.length, loggedDays);
  return { ready: true, estimatedTdee, measuredTdee, delta, suggestedTarget, windowDays: days, weighInsUsed: sorted.length, loggedDays, confidence, blend };
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

function enumerateDayKeys(aIso: string, bIso: string): string[] {
  const a = new Date(aIso);
  const b = new Date(bIso);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const out: string[] = [];
  const cur = new Date(a);
  while (cur.getTime() <= b.getTime()) {
    out.push(dayKeyForDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayKeyForDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ── Target re-derivation (goals that track body weight) ───────────────
 *
 * The stored `goals` row is a snapshot taken at setup. BMR is linear in
 * body weight (Mifflin-St Jeor adds 10 kcal per kg), so the snapshot goes
 * stale as weight moves: each 2 kg is ~20 kcal of base burn before the
 * activity multiplier, ~31 kcal a day at x1.55 and ~38 at x1.9.
 *
 * These helpers re-derive the goals against the latest weigh-in and report
 * whether the movement is big enough to be worth surfacing. They are pure:
 * the caller decides whether to prompt, persist, or ignore, which keeps the
 * existing adopt/keep consent path (trueburn.ts) as the only way a user's
 * target ever changes.
 */

/** Daily-target change (kcal) worth interrupting someone for. */
export const RECHECK_TARGET_DELTA_KCAL = 50;

/**
 * Weigh-ins beat the weight typed at setup once they exist. Picks the most
 * recent usable weigh-in, falling back to the stored profile weight.
 */
export function latestWeighInKg(weighIns: WeighPoint[], fallbackKg: number): number {
  const usable = weighIns.filter((w) => Number.isFinite(w.kg) && w.kg > 0);
  if (usable.length === 0) return fallbackKg;
  const sorted = usable.slice().sort((a, b) => a.at.localeCompare(b.at));
  return sorted[sorted.length - 1]!.kg;
}

export type TargetRecheck = {
  /** True when the stored target has drifted far enough to re-derive. */
  stale: boolean;
  /** Human-readable explanation, shown alongside the prompt. */
  reason: string;
  /** Weight the re-derivation used (latest weigh-in, else the profile weight). */
  weightBasisKg: number;
  /** Goals re-derived against `weightBasisKg`. */
  next: ComputedGoals;
  /** Change in the daily target, `next - stored`. */
  deltaKcal: number;
};

export function recheckTargets(input: {
  stored: ComputedGoals;
  profile: GoalInputs;
  weighIns: WeighPoint[];
}): TargetRecheck {
  const weightBasisKg = latestWeighInKg(input.weighIns, input.profile.weightKg);
  const next = computeGoals({ ...input.profile, weightKg: weightBasisKg });
  const deltaKcal = next.calorieTarget - input.stored.calorieTarget;
  const weightDelta = weightBasisKg - input.profile.weightKg;
  const stale = Math.abs(deltaKcal) >= RECHECK_TARGET_DELTA_KCAL;

  let reason: string;
  if (input.weighIns.length === 0) {
    reason = 'No weigh-ins yet, so your target still uses your setup weight.';
  } else if (stale) {
    reason = `You are ${describeKg(weightDelta)}: your daily target moves ${Math.abs(deltaKcal)} kcal ${deltaKcal > 0 ? 'higher' : 'lower'}.`;
  } else {
    reason = `You are ${describeKg(weightDelta)}, which is inside the ${RECHECK_TARGET_DELTA_KCAL} kcal recheck threshold.`;
  }

  return { stale, reason, weightBasisKg, next, deltaKcal };
}

function describeKg(deltaKg: number): string {
  const d = Math.round(Math.abs(deltaKg) * 10) / 10;
  if (d === 0) return 'the same weight as setup';
  return `${d} kg ${deltaKg < 0 ? 'lighter' : 'heavier'}`;
}