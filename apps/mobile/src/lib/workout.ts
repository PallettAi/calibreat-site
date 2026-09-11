/**
 * Train session timing and estimated extra kcal.
 *
 * Duration = work (sets × reps × seconds/rep) + rest between sets.
 * kcal = round(BMR × MET × duration / 86400) — rest-metabolic rate
 * scaled by Compendium MET so age, sex, height and weight (via Mifflin-St Jeor)
 * all change the number. Estimate only; not a lab VO₂ measurement.
 */

export type WorkoutEffort = {
  met: number;
  secPerRep: number;
  restSec: number;
};

export const WORKOUT_EFFORT: Record<string, WorkoutEffort> = {
  'push-up': { met: 8, secPerRep: 2, restSec: 45 },
  'bench-press': { met: 6, secPerRep: 3, restSec: 90 },
  'incline-bench': { met: 6, secPerRep: 3, restSec: 90 },
  'pull-up': { met: 8, secPerRep: 3, restSec: 60 },
  'chin-up': { met: 8, secPerRep: 3, restSec: 60 },
  'bent-over-row': { met: 6, secPerRep: 3, restSec: 60 },
  'overhead-press': { met: 6, secPerRep: 3, restSec: 90 },
  'lateral-raise': { met: 3.5, secPerRep: 2, restSec: 45 },
  'face-pull': { met: 3.5, secPerRep: 2, restSec: 45 },
  'bicep-curl': { met: 3.5, secPerRep: 3, restSec: 60 },
  'hammer-curl': { met: 3.5, secPerRep: 3, restSec: 60 },
  'tricep-dip': { met: 8, secPerRep: 2, restSec: 60 },
  'skull-crusher': { met: 3.5, secPerRep: 3, restSec: 60 },
  'sit-up': { met: 8, secPerRep: 3, restSec: 45 },
  'russian-twist': { met: 8, secPerRep: 2, restSec: 45 },
  plank: { met: 4, secPerRep: 20, restSec: 30 },
  squat: { met: 6, secPerRep: 4, restSec: 90 },
  lunge: { met: 6, secPerRep: 3, restSec: 60 },
  deadlift: { met: 6, secPerRep: 4, restSec: 120 },
  'hip-thrust': { met: 6, secPerRep: 3, restSec: 60 },
  'bulgarian-split-squat': { met: 6, secPerRep: 3, restSec: 60 },
  'romanian-deadlift': { met: 6, secPerRep: 4, restSec: 90 },
  'calf-raise': { met: 3.5, secPerRep: 2, restSec: 45 },
  'chest-press': { met: 3.5, secPerRep: 3, restSec: 60 },
  'pec-deck': { met: 3.5, secPerRep: 2, restSec: 45 },
  'lat-pulldown': { met: 3.5, secPerRep: 3, restSec: 60 },
  'seated-row': { met: 3.5, secPerRep: 3, restSec: 60 },
  'shoulder-press-machine': { met: 3.5, secPerRep: 3, restSec: 60 },
  'preacher-curl': { met: 3.5, secPerRep: 3, restSec: 60 },
  'cable-pushdown': { met: 3.5, secPerRep: 2, restSec: 45 },
  'ab-crunch-machine': { met: 3.5, secPerRep: 2, restSec: 45 },
  'leg-press': { met: 3.5, secPerRep: 3, restSec: 90 },
  'leg-extension': { met: 3.5, secPerRep: 2, restSec: 45 },
  'lying-leg-curl': { met: 3.5, secPerRep: 2, restSec: 45 },
  'hip-abduction': { met: 3.5, secPerRep: 2, restSec: 45 },
  'seated-calf-raise': { met: 3.5, secPerRep: 2, restSec: 45 },
};

const MAX_SETS = 30;
const MAX_REPS = 100;

export function clampSets(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SETS, Math.round(n)));
}

export function clampReps(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_REPS, Math.round(n)));
}

export function sessionDurationSec(exerciseId: string, sets: number, reps: number): number {
  const effort = WORKOUT_EFFORT[exerciseId];
  const s = clampSets(sets);
  const r = clampReps(reps);
  if (!effort || s <= 0 || r <= 0) return 0;
  return s * r * effort.secPerRep + Math.max(0, s - 1) * effort.restSec;
}

export function sessionKcal(input: {
  bmr: number;
  exerciseId: string;
  sets: number;
  reps: number;
}): number {
  const effort = WORKOUT_EFFORT[input.exerciseId];
  const duration = sessionDurationSec(input.exerciseId, input.sets, input.reps);
  if (!effort || duration <= 0 || !Number.isFinite(input.bmr) || input.bmr <= 0) return 0;
  return Math.round((input.bmr * effort.met * duration) / 86400);
}

export function formatDurationSec(sec: number): string {
  const n = Math.max(0, Math.round(sec));
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m <= 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s}s`;
}
