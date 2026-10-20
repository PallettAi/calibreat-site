/**
 * Extra-burn source + surplus eat-back (Android test cluster).
 *
 * Health Connect active kcal wins when connected and the day has real
 * activity; otherwise Train MET; otherwise none. Eat-back is only the
 * surplus above TDEE − BMR, capped. Pure module — no React, no native APIs.
 */

export const ACTIVE_NOISE_FLOOR_KCAL = 75;
export const SURPLUS_CAP_KCAL = 400;

export type BurnSource = 'health-connect' | 'train' | 'none';

export type ActivityBurn = {
  kcal: number;
  source: BurnSource;
};

export function hasRealActivity(hcActiveKcal: number, hcExerciseCount: number): boolean {
  const active = Number.isFinite(hcActiveKcal) ? hcActiveKcal : 0;
  const sessions = Number.isFinite(hcExerciseCount) ? hcExerciseCount : 0;
  return active >= ACTIVE_NOISE_FLOOR_KCAL || sessions >= 1;
}

export function selectActivityBurn(input: {
  connected: boolean;
  hcActiveKcal: number;
  hcExerciseCount: number;
  trainMetKcal: number;
}): ActivityBurn {
  const hc = Math.max(0, Math.round(Number.isFinite(input.hcActiveKcal) ? input.hcActiveKcal : 0));
  const train = Math.max(0, Math.round(Number.isFinite(input.trainMetKcal) ? input.trainMetKcal : 0));
  const exercises = Number.isFinite(input.hcExerciseCount) ? input.hcExerciseCount : 0;
  if (input.connected && hasRealActivity(hc, exercises)) {
    return { kcal: hc, source: 'health-connect' };
  }
  if (train > 0) return { kcal: train, source: 'train' };
  return { kcal: 0, source: 'none' };
}

export function activitySurplus(input: {
  measuredKcal: number;
  tdee: number | null | undefined;
  bmr: number | null | undefined;
}): number {
  const measured = Number.isFinite(input.measuredKcal) ? input.measuredKcal : 0;
  const tdee = input.tdee;
  const bmr = input.bmr;
  if (tdee == null || bmr == null || !Number.isFinite(tdee) || !Number.isFinite(bmr)) return 0;
  const assumed = Math.max(0, tdee - bmr);
  const raw = measured - assumed;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(SURPLUS_CAP_KCAL, Math.round(raw));
}

export function sourceLabel(source: BurnSource): string {
  if (source === 'health-connect') return 'Health Connect';
  if (source === 'train') return 'Train estimate';
  return '';
}
