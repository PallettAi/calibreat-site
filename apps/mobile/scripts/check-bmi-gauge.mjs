/**
 * Checks for the BMI instrument's geometry (run: npm run check:bmi).
 *
 * Arc geometry fails quietly — a rotation ninety degrees out still renders, it
 * just points the wrong way — so the angles, the segment lengths and the
 * contiguity of the bands are all pinned here rather than left to be noticed
 * on a device. Also drifts the four band edges against src/lib/nutrition.ts,
 * which is the authority for what a band means; bmi-gauge.ts only draws them.
 */
import {
  BMI_BAND_EDGES,
  BMI_MAX,
  BMI_MIN,
  bmiAngle,
  bmiFraction,
  bmiSegments,
  bmiTicks,
  START_ANGLE,
  SWEEP,
  weightPosition,
  weightWindow,
} from '../src/lib/bmi-gauge.ts';
import { bmiBand } from '../src/lib/nutrition.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, condition) => {
  if (!condition) fails++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
};
const near = (label, got, want, tolerance = 1e-9) => ok(`${label} (${Number(got).toFixed(4)} ~ ${want})`, Math.abs(got - want) <= tolerance);

/* ── Position along the arc ─────────────────────────────────────── */

eq('the bottom of the scale is the start of the arc', bmiFraction(BMI_MIN), 0);
eq('the top of the scale is the end of the arc', bmiFraction(BMI_MAX), 1);
near('the middle BMI is halfway', bmiFraction(26), 0.5);
eq('below the scale pins to the start', bmiFraction(4), 0);
eq('above the scale pins to the end', bmiFraction(70), 1);
eq('a nonsense value does not become a position', bmiFraction(NaN), 0);

near('the first position starts the arc', bmiAngle(BMI_MIN), START_ANGLE);
near('the last position ends the arc', bmiAngle(BMI_MAX), START_ANGLE + SWEEP * 360);
ok('the arc is 266 degrees, matching the Home gauges', Math.abs(SWEEP * 360 - 266.4) < 0.001);
ok('the arc is open at the bottom', START_ANGLE < -90 && START_ANGLE + SWEEP * 360 > 90);

/* Angles must increase monotonically, or the dial runs backwards for part of
 * its range and the leader dot fights the fill. The walk starts one step in,
 * because the step before the minimum is itself pinned to the same angle. */
let monotonic = true;
for (let b = BMI_MIN + 0.25; b <= BMI_MAX; b += 0.25) {
  if (bmiAngle(b) <= bmiAngle(b - 0.25)) monotonic = false;
}
ok('the angle increases all the way along', monotonic);

/* ── The four bands ─────────────────────────────────────────────── */

const C = 2 * Math.PI * 50; // any circumference; the geometry scales linearly
const segs = bmiSegments(C);
eq('there are four bands', segs.length, 4);
eq('they are in scale order', segs.map((s) => s.key), ['underweight', 'healthy', 'overweight', 'obese']);
eq('the first band starts at the bottom of the scale', segs[0].fracFrom, 0);
eq('the last band ends at the top of the scale', segs[3].fracTo, 1);

let contiguous = true;
for (let i = 1; i < segs.length; i += 1) {
  if (Math.abs(segs[i].fracFrom - segs[i - 1].fracTo) > 1e-12) contiguous = false;
}
ok('the bands meet exactly, with no seam and no overlap', contiguous);

const covered = segs.reduce((sum, s) => sum + (s.fracTo - s.fracFrom), 0);
near('together the bands cover the whole arc', covered, 1, 1e-12);

ok('every band has a positive length', segs.every((s) => s.length > 0));
ok('no band is longer than the arc', segs.every((s) => s.length <= C * SWEEP));

/* The rotation of a band must be where that band actually starts, which is
 * the failure that still renders. */
segs.forEach((s) => {
  near(`${s.key} rotates to its own leading edge`, s.rotate, bmiAngle(s.from), 1e-9);
});

/* ── Ticks sit on the boundaries a reader cares about ───────────── */

const ticks = bmiTicks();
eq('three interior boundaries are ticked', ticks.map((t) => t.bmi), [18.5, 25, 30]);
ok('every tick is inside the arc', ticks.every((t) => t.rotate > START_ANGLE && t.rotate < START_ANGLE + SWEEP * 360));
ok('a tick lines up with the band above it', ticks.every((t) => Math.abs(bmiAngle(t.bmi) - bmiAngle(t.bmi)) < 1e-9));
ok('no tick sits on top of another', new Set(ticks.map((t) => t.rotate.toFixed(6))).size === ticks.length);

/* ── Drift guard: nutrition.ts decides what a band means ────────── */

eq('the underweight edge agrees with bmiBand', bmiBand(18.4), 'underweight');
eq('the healthy edge agrees with bmiBand', bmiBand(18.5), 'healthy');
eq('the overweight edge agrees with bmiBand', bmiBand(25), 'overweight');
eq('the obese edge agrees with bmiBand', bmiBand(30), 'obese');
eq('just under the obese edge is still overweight', bmiBand(29.9), 'overweight');
ok('every band edge this module draws is a boundary bmiBand recognises', (() => {
  for (const band of BMI_BAND_EDGES) {
    if (bmiBand(band.from) !== band.key && band.from !== BMI_MIN) return false;
  }
  return true;
})());

/* ── The weight window under the dial ───────────────────────────── */

const w = weightWindow(61.4, 82.6, 88);
ok('the window holds the healthy range', w.minKg <= w.rangeMinKg && w.maxKg >= w.rangeMaxKg);
ok('the window holds a weight above the range', w.maxKg >= 88);
ok('the window holds a weight below the range', weightWindow(61.4, 82.6, 55).minKg <= 55);
ok('padding is on both sides', w.minKg < w.rangeMinKg && w.maxKg > w.rangeMaxKg);

eq('a weight below the window pins to the left', weightPosition(w, 0), 0);
eq('a weight above the window pins to the right', weightPosition(w, 500), 1);
near('a weight in the middle of the range is mid-window', weightPosition(weightWindow(50, 70, 60), 60), 0.5, 1e-9);
ok('a zero weight does not divide by zero', Number.isFinite(weightPosition(weightWindow(50, 70, 0), 0)));
ok('a degenerate range still returns a position', Number.isFinite(weightPosition(weightWindow(60, 60, 60), 60)));
ok('and it is not NaN', !Number.isNaN(weightPosition(weightWindow(60, 60, 60), 60)));

console.log(fails === 0 ? '\nAll BMI gauge checks passed.' : `\n${fails} BMI gauge check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
