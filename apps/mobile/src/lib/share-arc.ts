/**
 * Arc geometry for the trophy cards — the maths behind a medal's arched name.
 *
 * A leaf module so it can be unit-tested from scripts/check-share.mjs (a `.tsx`
 * cannot be imported by the node check runner, which is why this is not inline
 * in share-trophy.tsx). It is also the reason the medals do not use SVG
 * `TextPath`: that is a native-module feature, whereas positioning one glyph per
 * character is plain geometry that renders identically on Android, iOS and web.
 *
 * An arc that mirrors, overlaps or drifts off its radius reads as a broken medal
 * and no screenshot catches it, so the geometry is asserted rather than eyeballed.
 */

export type ArcGlyph = { char: string; x: number; y: number; rotate: number };

/* * * Worst-case glyph metrics for the rounded bold display face, as fractions of
 * the font size.
 *
 * Deliberately conservative. Over-estimating the advance costs a slightly wider
 * arc; under-estimating it puts letters on top of each other, which is exactly
 * what happened while the step was derived from the string length alone —
 * "100 DAYS" arched inside a 109px medal came out as "10 DAYS" with a second
 * "0" buried under the first.
 */
const ADVANCE_EM = 0.8;
const INK_EM = 0.87;

/**
 * How much room to leave beyond the point where two glyphs would merely touch.
 *
 * Zero clearance is correct on paper and wrong in practice: the same string at
 * the same size renders a fraction of a pixel wider on another device, and the
 * capture is taken at 3× where a hairline gap is visible as a smudge. 6% of the
 * required spacing buys roughly half a pixel of air at medal sizes.
 */
const CLEARANCE = 1.06;

/**
 * Smallest angular step (degrees) at which two neighbouring glyphs of
 * `fontSize` leading around a circle of `radius` still clear each other.
 *
 * Glyphs are positioned by their centre and carry their own rotation, so their
 * ink boxes are `advance × ink` rectangles turned by half the step each way
 * from the tangent. Two such rectangles (centres `s` apart along the arc) miss
 * each other exactly when
 *
 *     s ≥ advance · cos(Δ/2) + ink · sin(Δ/2)
 *
 * The rotation term is what makes this non-obvious: the taller the glyphs
 * relative to the radius, the more the step has to open up beyond a naive
 * "advance ÷ radius" — a 9° step is roomy on a big medallion and overlaps on a
 * small one. Solved by fixed-point iteration (the correction is small, so it
 * converges in a handful of passes).
 */
export function arcStepFor(
  radius: number,
  fontSize: number,
  advanceEm = ADVANCE_EM,
  inkEm = INK_EM,
): number {
  const advance = advanceEm * fontSize;
  const ink = inkEm * fontSize;
  const arcPerDeg = (2 * Math.PI * Math.max(1, radius)) / 360;
  let step = advance / arcPerDeg;
  for (let i = 0; i < 16; i += 1) {
    const half = ((step / 2) * Math.PI) / 180;
    const next = (advance * Math.cos(half) + ink * Math.sin(half)) / arcPerDeg;
    if (Math.abs(next - step) < 0.01) return next * CLEARANCE;
    step = next;
  }
  return step * CLEARANCE;
}

/**
 * Choose the step and font size for one arc so that no two glyphs collide.
 *
 * Priority, in order: never overlap; keep the type the caller asked for; keep
 * the sweep inside `maxSweepDeg`. So the arc widens to fit before the type
 * shrinks — a wider arc reads as a design choice, smaller type reads as a
 * mistake — and the type only comes down (never below `minFontSize`) when the
 * collision-free arc would wrap past the sweep the layout can afford.
 */
export function fitArc(opts: {
  text: string;
  radius: number;
  /** Preferred size. Only ever reduced, never grown. */
  fontSize: number;
  /** Largest total sweep the layout will accept, in degrees. */
  maxSweepDeg: number;
  /** Longest single step, in degrees. */
  maxStepDeg?: number;
  minFontSize?: number;
}): { stepDeg: number; fontSize: number; sweepDeg: number } {
  const chars = Math.max(1, [...opts.text].length);
  const budget = Math.min(opts.maxStepDeg ?? 11, opts.maxSweepDeg / chars);
  const floor = opts.minFontSize ?? 5;
  let fontSize = opts.fontSize;
  let step = Math.max(budget, arcStepFor(opts.radius, fontSize));
  while ((chars - 1) * step > opts.maxSweepDeg && fontSize > floor) {
    fontSize = Math.max(floor, fontSize - 0.25);
    step = Math.max(budget, arcStepFor(opts.radius, fontSize));
  }
  return { stepDeg: step, fontSize, sweepDeg: (chars - 1) * step };
}

/**
 * Lay a string around a circle, centred on `centerDeg` (0 = top of the disc,
 * 180 = bottom). Each glyph gets a position on the radius and its own rotation
 * about that point, which is what makes the letters follow the curve instead of
 * standing in a straight row.
 */
export function arcGlyphs(opts: {
  text: string;
  cx: number;
  cy: number;
  radius: number;
  /** Angular width per glyph, in degrees. */
  stepDeg: number;
  centerDeg?: number;
}): ArcGlyph[] {
  const { text, cx, cy, radius, stepDeg } = opts;
  const centerDeg = opts.centerDeg ?? 0;
  const chars = [...text];
  /**
   * Text on the *lower* half of the disc has to be laid out the other way
   * round, or it comes out mirrored — an arc centred on 180° steps clockwise,
   * but clockwise from the bottom is right-to-left on screen, so "12 DAYS"
   * rendered as "SYAD 21". Glyphs on the bottom also need a half-turn of
   * counter-rotation to stand upright (a rainbow's letters lean outward, a
   * valley's lean inward).
   */
  const bottom = centerDeg > 90 && centerDeg < 270;
  const direction = bottom ? -1 : 1;
  return chars.map((char, i) => {
    const deg = centerDeg + direction * (i - (chars.length - 1) / 2) * stepDeg;
    // deg 0 = straight up, so subtract a quarter turn to get standard angles.
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      char,
      x: Math.round((cx + radius * Math.cos(rad)) * 100) / 100,
      y: Math.round((cy + radius * Math.sin(rad)) * 100) / 100,
      rotate: Math.round((bottom ? deg - 180 : deg) * 100) / 100,
    };
  });
}
