/**
 * Trend math for the True Burn trends screen.
 *
 * Pure module (checked by scripts/check-trends.mjs): no React, no storage.
 * Slopes are ordinary least squares over real elapsed days, so a missed week
 * weighs correctly instead of faking a steep trend.
 */

import type { AdaptiveHistoryPoint, WeighPoint } from '@/lib/nutrition';

export type TrendPoint = { t: number; value: number };

export function toTimePoints(rows: { at: string; value: number }[]): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const r of rows) {
    const t = Date.parse(r.at);
    if (Number.isFinite(t) && Number.isFinite(r.value)) out.push({ t, value: r.value });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function weighSeries(weighIns: WeighPoint[]): TrendPoint[] {
  return toTimePoints(weighIns.map((w) => ({ at: w.at, value: w.kg })));
}

/** Least-squares slope per day; null under 2 points or a 5-day span. */
export function slopePerDay(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const t0 = points[0]!.t;
  const spanDays = (points[points.length - 1]!.t - t0) / 86400000;
  if (spanDays < 5) return null;
  const xs = points.map((p) => (p.t - t0) / 86400000);
  const ys = points.map((p) => p.value);
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

export function slopePerWeek(points: TrendPoint[]): number | null {
  const perDay = slopePerDay(points);
  return perDay == null ? null : perDay * 7;
}

/**
 * Centered moving average with partial windows at the edges (a 2-point average
 * on the first/last row) so single outlying readings can't spike the ends and
 * the line still spans the full data range.
 */
export function movingAverage(points: TrendPoint[], window: number): TrendPoint[] {
  if (window < 2 || points.length < 3) return points;
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(points.length, i + half + 1);
    const slice = points.slice(from, to);
    return { t: p.t, value: slice.reduce((s, q) => s + q.value, 0) / slice.length };
  });
}

export type BurnTrend = {
  latest: number;
  avg: number;
  min: number;
  max: number;
  /** kcal/week drift of the measured burn; null under 2 points. */
  driftPerWeek: number | null;
};

export function burnTrend(history: AdaptiveHistoryPoint[]): BurnTrend | null {
  if (!history.length) return null;
  const values = history.map((h) => h.measuredTdee);
  const points = toTimePoints(
    history.map((h) => ({ at: `${h.dayKey}T00:00:00`, value: h.measuredTdee })),
  );
  const drift = slopePerWeek(points);
  return {
    latest: values[values.length - 1]!,
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    driftPerWeek: drift == null ? null : Math.round(drift),
  };
}

/** Logged days across the calendar span the intake history covers. */
export function loggingCoverage(intake: { dayKey: string; kcal: number }[]): { logged: number; days: number } {
  if (!intake.length) return { logged: 0, days: 0 };
  const sorted = intake.slice().sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const first = Date.parse(`${sorted[0]!.dayKey}T00:00:00`);
  const last = Date.parse(`${sorted[sorted.length - 1]!.dayKey}T00:00:00`);
  const days =
    Number.isFinite(first) && Number.isFinite(last)
      ? Math.max(1, Math.round((last - first) / 86400000) + 1)
      : 0;
  return { logged: intake.filter((d) => d.kcal > 0).length, days };
}
