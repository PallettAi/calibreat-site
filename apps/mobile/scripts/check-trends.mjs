/**
 * Accuracy checks for the True Burn trends math (npm run check:trends).
 */
import {
  burnTrend,
  loggingCoverage,
  movingAverage,
  slopePerDay,
  slopePerWeek,
  toTimePoints,
  weighSeries,
} from '../src/lib/trends.ts';

let fails = 0;
const eq = (label, got, want) => {
  const same =
    Object.is(got, want) ||
    (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01) ||
    (typeof got === 'object' && got !== null && JSON.stringify(got) === JSON.stringify(want));
  if (!same) fails++;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T00:00:00Z');

// toTimePoints sorts and drops junk
const pts = toTimePoints([
  { at: '2026-09-03T00:00:00Z', value: 3 },
  { at: 'not a date', value: 9 },
  { at: '2026-09-01T00:00:00Z', value: 1 },
  { at: '2026-09-02T00:00:00Z', value: Number.NaN },
  { at: '2026-09-02T12:00:00Z', value: 2 },
]);
eq('toTimePoints drops bad rows and sorts', pts.map((p) => p.value), [1, 2, 3]);
eq('toTimePoints keeps epoch times', pts[1]?.t, Date.parse('2026-09-02T12:00:00Z'));

// slope: perfectly linear 0.1 kg/day over 10 days
const linear = Array.from({ length: 10 }, (_, i) => ({ t: T0 + i * DAY, value: 80 + 0.1 * i }));
eq('linear slope per day', Math.round(slopePerDay(linear) * 1000) / 1000, 0.1);
eq('linear slope per week', Math.round(slopePerWeek(linear) * 100) / 100, 0.7);

// uneven spacing: real dates weigh correctly
const sparse = [
  { t: T0, value: 80 },
  { t: T0 + 2 * DAY, value: 80.2 },
  { t: T0 + 9 * DAY, value: 80.9 },
];
eq('sparse slope per day ≈ 0.1', Math.round(slopePerDay(sparse) * 100) / 100, 0.1);

eq('single point has no slope', slopePerDay([{ t: T0, value: 80 }]), null);
eq('short span has no slope', slopePerDay([{ t: T0, value: 80 }, { t: T0 + 3 * DAY, value: 80.1 }]), null);
eq('flat line slopes to 0', slopePerDay(linear.map((p) => ({ ...p, value: 80 }))), 0);

// weighSeries maps weigh-ins
const ws = weighSeries([
  { kg: 81, at: '2026-09-03T08:00:00Z' },
  { kg: 80, at: '2026-09-01T08:00:00Z' },
]);
eq('weighSeries sorts by date', ws.map((p) => p.value), [80, 81]);

// moving average smooths the middle but keeps the line spanning the data
const noisy = Array.from({ length: 7 }, (_, i) => ({ t: T0 + i * DAY, value: i % 2 === 0 ? 80 : 82 }));
const ma = movingAverage(noisy, 3);
eq('moving average keeps length', ma.length, 7);
eq('moving average smooths middle', ma[1]?.value, 80.67);
eq('moving average smooths other middle', ma[2]?.value, 81.33);
eq('moving average smooths edges with partial window', ma[0]?.value, 81);
eq('moving average ignores tiny windows', movingAverage(noisy, 1), noisy);

// burnTrend summary
// drift: one weigh-in point per week, +100 per point = +100 kcal/wk
const burn = burnTrend([
  { dayKey: '2026-09-01', measuredTdee: 2400, estimatedTdee: 2500, delta: -100 },
  { dayKey: '2026-09-08', measuredTdee: 2500, estimatedTdee: 2500, delta: 0 },
  { dayKey: '2026-09-15', measuredTdee: 2600, estimatedTdee: 2500, delta: 100 },
]);
eq('burnTrend latest', burn?.latest, 2600);
eq('burnTrend avg', burn?.avg, 2500);
eq('burnTrend min', burn?.min, 2400);
eq('burnTrend max', burn?.max, 2600);
eq('burnTrend drift +100/wk', burn?.driftPerWeek, 100);
eq('burnTrend empty is null', burnTrend([]), null);
eq('burnTrend single point has no drift', burnTrend([{ dayKey: '2026-09-01', measuredTdee: 2400, estimatedTdee: 2500, delta: -100 }])?.driftPerWeek, null);

// loggingCoverage
eq('coverage counts logged days', loggingCoverage([
  { dayKey: '2026-09-01', kcal: 2000 },
  { dayKey: '2026-09-02', kcal: 0 },
  { dayKey: '2026-09-05', kcal: 1800 },
]), { logged: 2, days: 5 });
eq('coverage of nothing is zeros', loggingCoverage([]), { logged: 0, days: 0 });

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
