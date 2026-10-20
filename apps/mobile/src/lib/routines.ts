/**
 * Train v2 helpers (Android test cluster): named routines, per-set prefill,
 * PRs and weekly volume. Pure: no storage, no React.
 *
 * A logged set is one `workout_sessions` row with `sets: 1`, so the existing
 * kcal, volume and export paths keep working unchanged.
 */

import { WORKOUT_EFFORT, epleyE1RM, sessionVolumeKg } from './workout.ts';
import { weekKeys } from './week-bank.ts';

export const ROUTINE_NAME_MAX = 40;
export const MAX_ROUTINES = 20;
export const MAX_ROUTINE_EXERCISES = 15;
const MAX_DEFAULT_SETS = 30;

export type Routine = {
  id: string;
  name: string;
  createdAt: string;
  items: { exerciseId: string; defaultSets: number }[];
};

export type RoutineResult = { ok: true; routines: Routine[] } | { ok: false; error: string };

/** Trims, collapses internal whitespace and enforces the length limit. */
export function normaliseRoutineName(raw: string): string | null {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > ROUTINE_NAME_MAX) return null;
  return name;
}

export function addRoutine(
  routines: Routine[],
  input: { id: string; name: string; createdAt: string; items: { exerciseId: string; defaultSets?: number }[] },
): RoutineResult {
  const name = normaliseRoutineName(input.name);
  if (name == null) return { ok: false, error: `Name it (up to ${ROUTINE_NAME_MAX} characters).` };
  if (routines.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'You already have a routine with that name.' };
  }
  if (routines.length >= MAX_ROUTINES) return { ok: false, error: `Up to ${MAX_ROUTINES} routines.` };
  const items = input.items
    .filter((i) => WORKOUT_EFFORT[i.exerciseId] != null)
    .slice(0, MAX_ROUTINE_EXERCISES)
    .map((i) => ({ exerciseId: i.exerciseId, defaultSets: clampDefaultSets(i.defaultSets) }));
  if (items.length === 0) return { ok: false, error: 'Add at least one exercise.' };
  return {
    ok: true,
    routines: [...routines, { id: input.id, name, createdAt: input.createdAt, items }],
  };
}

export function clampDefaultSets(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 3;
  return Math.max(1, Math.min(MAX_DEFAULT_SETS, v));
}

/**
 * Parses stored routines. Storage is user-editable JSON from an older build,
 * so anything that is not a well-formed routine is dropped rather than
 * crashing the Train screen.
 */
export function parseRoutines(raw: unknown): Routine[] {
  if (!Array.isArray(raw)) return [];
  const out: Routine[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === 'string' ? normaliseRoutineName(r.name) : null;
    if (typeof r.id !== 'string' || !r.id || name == null || !Array.isArray(r.items)) continue;
    const items = r.items
      .filter((i): i is { exerciseId: string; defaultSets?: unknown } => i !== null && typeof i === 'object' && typeof (i as { exerciseId?: unknown }).exerciseId === 'string')
      .filter((i) => WORKOUT_EFFORT[i.exerciseId] != null)
      .slice(0, MAX_ROUTINE_EXERCISES)
      .map((i) => ({ exerciseId: i.exerciseId, defaultSets: clampDefaultSets(i.defaultSets) }));
    if (items.length === 0) continue;
    out.push({ id: r.id, name, createdAt: typeof r.createdAt === 'string' ? r.createdAt : '', items });
    if (out.length >= MAX_ROUTINES) break;
  }
  return out;
}

export function removeRoutine(routines: Routine[], id: string): Routine[] {
  return routines.filter((r) => r.id !== id);
}

/* ── Prefill: the last completed set for an exercise fills the next blank row ── */

export type SetRecord = { weightKg: number; reps: number };

export function prefillFromLast(completed: SetRecord[]): SetRecord | null {
  if (completed.length === 0) return null;
  const last = completed[completed.length - 1]!;
  return { weightKg: last.weightKg, reps: last.reps };
}

/* ── PRs ───────────────────────────────────────────────────────────────── */

/** Best Epley 1RM across a history of sets. 0 when there is no loaded set. */
export function bestE1RM(history: SetRecord[]): number {
  let best = 0;
  for (const s of history) best = Math.max(best, epleyE1RM(s.weightKg, s.reps));
  return best;
}

/** True when `candidate` beats every earlier set on Epley 1RM (strictly). */
export function isE1RMPR(history: SetRecord[], candidate: SetRecord): boolean {
  // With no history there is nothing to beat, so the first set is not called a PR.
  if (history.length === 0) return false;
  const e1rm = epleyE1RM(candidate.weightKg, candidate.reps);
  if (e1rm <= 0) return false;
  return e1rm > bestE1RM(history);
}

/** True when `candidate` is the heaviest load at the same reps (strictly). */
export function isWeightPRAtReps(history: SetRecord[], candidate: SetRecord): boolean {
  if (candidate.weightKg <= 0 || candidate.reps <= 0) return false;
  const sameReps = history.filter((s) => s.reps === candidate.reps);
  // A first set at a new rep count has no same-reps history to beat.
  if (sameReps.length === 0) return false;
  const best = sameReps.reduce((m, s) => Math.max(m, s.weightKg), 0);
  return candidate.weightKg > best;
}

/* ── Weekly muscle volume ─────────────────────────────────────────────── */

export type VolumeRow = { dayKey: string; exerciseId: string; sets: number; reps: number; weightKg: number };

/** Summed sets × reps × weight for each exercise in the Monday–Sunday week of `todayKey`. */
export function weeklyVolumeByExercise(rows: VolumeRow[], todayKey: string): Record<string, number> {
  const keys = new Set(weekKeys(todayKey) ?? []);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!keys.has(r.dayKey)) continue;
    const v = sessionVolumeKg({ sets: r.sets, reps: r.reps, weightKg: r.weightKg });
    if (v > 0) out[r.exerciseId] = Math.round(((out[r.exerciseId] ?? 0) + v) * 10) / 10;
  }
  return out;
}
