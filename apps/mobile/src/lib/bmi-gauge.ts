/**
 * Geometry for the BMI instrument (src/app/bmi.tsx).
 *
 * Pure and standalone so the angles and segment lengths can be checked in CI
 * (scripts/check-bmi-gauge.mjs). Arc geometry is the kind of thing that goes
 * quietly wrong — a rotation ninety degrees out still draws, it just points the
 * wrong way, and a band drawn from the wrong edge leaves a seam you only
 * notice on a real device.
 *
 * The sweep matches the macro arc gauges on Home (a 0.74 circle starting at
 * -126°, leaving the gap at the bottom) so the app reads as one instrument
 * rather than a family of unrelated dials.
 *
 * A NOTE ON COLOUR, because it is a decision and not an omission. The obvious
 * treatment for a BMI gauge is a green-to-red ramp, and it would be the wrong
 * one: this app's copy contract is that it never moralises about weight, and a
 * dial that turns red as the number climbs says something the product has
 * deliberately committed never to say. So the bands are told apart by position
 * and by their tick labels, everything sits in the neutral track tone, and the
 * single accent marks only where the reader is. The clinical band names are
 * kept because this is an educational tool and the screen already says plainly
 * that the index is not a diagnosis; what is dropped is the traffic light.
 */

/** The span the arc shows. BMI below 12 or above 40 is pinned to the end, the
 *  same way the macro gauges pin a full target rather than overflowing. */
export const BMI_MIN = 12;
export const BMI_MAX = 40;

/** Degrees. Matches the Home arc gauges; negative because SVG y runs down. */
export const START_ANGLE = -126;
/** Fraction of a full circle, so the dial is open at the bottom. */
export const SWEEP = 0.74;

export type BmiGaugeBandKey = 'underweight' | 'healthy' | 'overweight' | 'obese';

export type BmiBandEdge = {
  key: BmiGaugeBandKey;
  /** BMI at the band's lower edge, and the next band's upper edge. */
  from: number;
  to: number;
};

export type BmiGaugeSegment = BmiBandEdge & {
  /** Position along the sweep, 0 at the start of the arc and 1 at its end. */
  fracFrom: number;
  fracTo: number;
  /** SVG rotate() for the stroke that draws this band. */
  rotate: number;
  /** Arc length in user units, for strokeDasharray. */
  length: number;
};

export type BmiTick = {
  bmi: number;
  rotate: number;
};

/** The four standard bands. The edges are mirrored in the check script, which
 *  loads src/lib/nutrition.ts and fails if the two ever disagree — nutrition.ts
 *  is the authority for what a band *means*, and this is only the drawing. */
export const BMI_BAND_EDGES: readonly BmiBandEdge[] = [
  { key: 'underweight', from: BMI_MIN, to: 18.5 },
  { key: 'healthy', from: 18.5, to: 25 },
  { key: 'overweight', from: 25, to: 30 },
  { key: 'obese', from: 30, to: BMI_MAX },
];

/** Where a BMI sits along the arc, 0–1, pinned at either end. */
export function bmiFraction(bmi: number): number {
  if (!Number.isFinite(bmi)) return 0;
  const raw = (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN);
  return Math.max(0, Math.min(1, raw));
}

/** Degrees from the positive x-axis, clockwise — the same convention SVG's
 *  rotate() uses, so this feeds both the dash rotation and the leader dot. */
export function bmiAngle(bmi: number): number {
  return START_ANGLE + bmiFraction(bmi) * SWEEP * 360;
}

/**
 * The four bands as drawable segments.
 *
 * `rotate` places the *start* of each dash. The gap left in strokeDasharray is
 * the whole circumference, which is longer than any band, so each dash is a
 * single clean segment rather than a repeating one.
 */
export function bmiSegments(circumference: number): BmiGaugeSegment[] {
  return BMI_BAND_EDGES.map((band) => {
    const fracFrom = bmiFraction(band.from);
    const fracTo = bmiFraction(band.to);
    return {
      ...band,
      fracFrom,
      fracTo,
      rotate: START_ANGLE + fracFrom * SWEEP * 360,
      length: (fracTo - fracFrom) * SWEEP * circumference,
    };
  });
}

/** Tick marks on the three interior band edges, where a reader's eye needs the
 *  boundaries most. The ends are already the ends of the arc. */
export const BMI_TICKS: readonly number[] = [18.5, 25, 30];

export function bmiTicks(): BmiTick[] {
  return BMI_TICKS.map((bmi) => ({ bmi, rotate: bmiAngle(bmi) }));
}

/* ── The weight band under the dial ────────────────────────────────
 * BMI is weight rescaled by height, so at a fixed height it is a monotone
 * function of weight and nothing more. Showing "you are here between these two
 * weights" is both more legible than the index and more actionable, because it
 * gives the number a person can actually move. */

export type WeightWindow = {
  minKg: number;
  maxKg: number;
  rangeMinKg: number;
  rangeMaxKg: number;
};

/**
 * A window to draw, padded either side of the healthy range so there is
 * somewhere to stand when you are above or below it. Without the padding a
 * marker outside the range has nowhere to go and the bar silently clamps to
 * the end, which reads as "at the edge" when it means "off the scale".
 */
export function weightWindow(rangeMinKg: number, rangeMaxKg: number, currentKg: number): WeightWindow {
  const range = Math.max(0.1, rangeMaxKg - rangeMinKg);
  const pad = range * 0.5;
  const around = currentKg > 0 ? currentKg : (rangeMinKg + rangeMaxKg) / 2;
  return {
    minKg: Math.max(0, Math.min(rangeMinKg - pad, around - pad)),
    maxKg: Math.max(rangeMaxKg + pad, around + pad),
    rangeMinKg,
    rangeMaxKg,
  };
}

/** Where a weight sits in the window, 0–1, pinned at either end. */
export function weightPosition(window: WeightWindow, kg: number): number {
  const span = window.maxKg - window.minKg;
  if (span <= 0) return 0.5;
  if (!Number.isFinite(kg)) return 0;
  return Math.max(0, Math.min(1, (kg - window.minKg) / span));
}
