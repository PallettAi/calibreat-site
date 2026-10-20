/**
 * Android widget snapshot (spec §4.1). The app writes it whenever the numbers
 * the widget shows change; the widget only reads it. Pure: parsing and
 * building here, storage in widget-snapshot-store.ts.
 */

export const WIDGET_SNAPSHOT_VERSION = 1;

export type WidgetSnapshot = {
  v: 1;
  /** Calories left today; negative when over. */
  remaining: number;
  proteinG: number;
  proteinGoalG: number;
  waterMl: number;
  waterGoalMl: number;
  fastElapsedSec: number | null;
  sourceLabel: string;
  updatedAt: string;
};

function finiteOr(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function buildWidgetSnapshot(input: {
  remaining: number;
  proteinG: number;
  proteinGoalG: number;
  waterMl: number;
  waterGoalMl: number;
  fastElapsedSec: number | null;
  sourceLabel: string;
  now: Date;
}): WidgetSnapshot {
  const fast = input.fastElapsedSec == null ? null : Math.max(0, Math.round(finiteOr(input.fastElapsedSec, 0)));
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    remaining: Math.round(finiteOr(input.remaining, 0)),
    proteinG: Math.max(0, Math.round(finiteOr(input.proteinG, 0))),
    proteinGoalG: Math.max(0, Math.round(finiteOr(input.proteinGoalG, 0))),
    waterMl: Math.max(0, Math.round(finiteOr(input.waterMl, 0))),
    waterGoalMl: Math.max(0, Math.round(finiteOr(input.waterGoalMl, 0))),
    fastElapsedSec: fast,
    sourceLabel: typeof input.sourceLabel === 'string' ? input.sourceLabel : '',
    updatedAt: input.now.toISOString(),
  };
}

/**
 * Reads a stored snapshot. Anything unrecognised (wrong version, missing
 * fields, not an object) returns null, and the widget shows "Open calibrEAT".
 */
export function parseWidgetSnapshot(raw: unknown): WidgetSnapshot | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== WIDGET_SNAPSHOT_VERSION) return null;
  const numbers = ['remaining', 'proteinG', 'proteinGoalG', 'waterMl', 'waterGoalMl'] as const;
  for (const key of numbers) {
    if (typeof r[key] !== 'number' || !Number.isFinite(r[key] as number)) return null;
  }
  if (r.fastElapsedSec !== null && (typeof r.fastElapsedSec !== 'number' || !Number.isFinite(r.fastElapsedSec))) return null;
  if (typeof r.sourceLabel !== 'string' || typeof r.updatedAt !== 'string') return null;
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    remaining: r.remaining as number,
    proteinG: r.proteinG as number,
    proteinGoalG: r.proteinGoalG as number,
    waterMl: r.waterMl as number,
    waterGoalMl: r.waterGoalMl as number,
    fastElapsedSec: (r.fastElapsedSec as number | null) ?? null,
    sourceLabel: r.sourceLabel,
    updatedAt: r.updatedAt,
  };
}

/** The small widget line: "1,240 kcal left" / "320 over". */
export function remainingLine(snap: WidgetSnapshot): string {
  const n = Math.round(Math.abs(snap.remaining));
  const grouped = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return snap.remaining >= 0 ? `${grouped} kcal left` : `${grouped} kcal over`;
}
