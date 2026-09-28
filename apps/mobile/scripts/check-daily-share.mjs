/**
 * Accuracy checks for the daily recap card (npm run check:share-daily).
 * The recap is a once-a-day share moment; the rules that make it safe are
 * checked here: honest equation math, never shaming copy, one site URL,
 * recap day is a *closed* day, and the once-per-day offer flag.
 */
import { buildDailyCard, dailyTagline, recapDayKey, DAILY_SHARE_SITE_URL } from '../src/lib/share-daily.ts';

let fails = 0;
const eq = (label, got, want) => {
  const same =
    Object.is(got, want) ||
    (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01) ||
    (typeof got === 'object' && got !== null && JSON.stringify(got) === JSON.stringify(want));
  if (!same) fails++;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

// ── Eligibility: a blank day is not a share moment ──────────────────────
eq('no food and no train is ineligible', buildDailyCard({ targetKcal: 2100, foodKcal: 0, workoutKcal: 0 }), { eligible: false, reason: 'empty' });
eq('no target is ineligible', buildDailyCard({ targetKcal: 0, foodKcal: 1500, workoutKcal: 0 }), { eligible: false, reason: 'empty' });

// ── The equation is exact: goal + train − food = left ───────────────────
const under = buildDailyCard({ targetKcal: 2100, foodKcal: 1420, workoutKcal: 0 });
eq('under-budget hero', under.eligible && under.card.hero, { value: '680', label: 'kcal left' });
eq('equation rows (no train)', under.eligible && under.card.equation, [
  { label: 'goal', value: '2,100' },
  { label: 'food', value: '−1,420', signed: true },
  { label: 'left', value: '680' },
]);
eq('fill is food / budget, clamped', under.eligible && under.card.fill, 1420 / 2100);

// Train raises the budget, never the burn math: with train the day is 100
// over (2,000 + 300 − 2,400 = −100); without it, 400 over.
const withTrain = buildDailyCard({ targetKcal: 2000, foodKcal: 2400, workoutKcal: 300 });
eq('train row appears when logged', withTrain.eligible && withTrain.card.equation[1], { label: 'train', value: '+300' });
eq('train shrinks the overshoot', withTrain.eligible && withTrain.card.hero, { value: '100', label: 'kcal over' });
// over-budget day: remaining < 0 → hero is the overshoot, labelled honestly.
const over = buildDailyCard({ targetKcal: 2000, foodKcal: 2400, workoutKcal: 0 });
eq('over-budget hero is the overshoot', over.eligible && over.card.hero, { value: '400', label: 'kcal over' });
ok('over-budget last row is labelled over', over.eligible && over.card.equation[over.card.equation.length - 1].label === 'over');
// No train row when nothing was logged in Train.
ok('no train row without train', under.eligible && !under.card.equation.some((r) => r.label === 'train'));

// A session with no food logged is eligible, and must not print a signed zero:
// that is the one day where "food −0" reached the card.
const trainOnly = buildDailyCard({ targetKcal: 2100, foodKcal: 0, workoutKcal: 420 });
eq('train-only day is eligible', trainOnly.eligible, true);
eq('train-only hero is the whole budget', trainOnly.eligible && trainOnly.card.hero, { value: '2,520', label: 'kcal left' });
ok('train-only food row is an unsigned zero', trainOnly.eligible && trainOnly.card.equation.some((r) => r.label === 'food' && r.value === '0'));
ok('no signed zero anywhere in the equation', trainOnly.eligible && !trainOnly.card.equation.some((r) => /[−-]0$/.test(r.value)));
ok('train-only copy says what was logged', trainOnly.eligible && /train/i.test(trainOnly.card.copy.line));
// ...and does not claim the day was calibrated when nothing was eaten.
ok('train-only copy does not claim a calibrated day', trainOnly.eligible && !/calibrated/i.test(trainOnly.card.copy.line));
// A day that hit the budget exactly reads as zero left, never zero over.
eq('exact-budget day is not over', buildDailyCard({ targetKcal: 2100, foodKcal: 2100, workoutKcal: 0 }).card.hero, { value: '0', label: 'kcal left' });

// ── Copy rules: behavior-first, never bodies, one site link ─────────────
for (const [name, s] of [
  ['under-budget day', { targetKcal: 2100, foodKcal: 1420, workoutKcal: 0 }],
  ['over-budget day', { targetKcal: 1800, foodKcal: 2600, workoutKcal: 0 }],
  ['perfect day', { targetKcal: 2000, foodKcal: 1990, workoutKcal: 450 }],
]) {
  const d = buildDailyCard(s);
  const text = d.eligible
    ? `${d.card.copy.kicker} ${d.card.copy.line} ${d.card.copy.note} ${d.card.hero.label} ${d.card.equation.map((r) => `${r.label} ${r.value}`).join(' ')} ${dailyTagline()}`.toLowerCase()
    : '';
  ok(`${name}: no weight/body framing`, d.eligible && !/weight|kg|lbs|before|after|body|bmi/.test(text));
  ok(`${name}: no moralizing`, d.eligible && !/should|guilt|cheat|fail|bad|overate|blow/.test(text));
  ok(`${name}: site link appears exactly once`, (text.match(/calibreat\.co\.uk/g) ?? []).length === 1);
}
ok('tagline shape', dailyTagline() === 'Calibrate your eating lifestyle. — calibreat.co.uk');
ok('site url constant matches the weekly card host', DAILY_SHARE_SITE_URL === 'https://calibreat.co.uk');

// Over-budget copy never frames the day as failure.
const overCopy = buildDailyCard({ targetKcal: 1800, foodKcal: 2600, workoutKcal: 0 });
ok('over day still celebrates measurement', overCopy.eligible && overCopy.card.copy.line.length > 0 && !/bad|fail|oops/.test(overCopy.card.copy.line.toLowerCase()));
ok('over day note stays neutral', overCopy.eligible && !/guilt|cheat|spoil/.test(overCopy.card.copy.note.toLowerCase()));

// Measured-target note: only when the dial actually used the measured target.
const measured = buildDailyCard({ targetKcal: 2140, foodKcal: 1800, workoutKcal: 0, measuredBurnKcal: 2325, usedMeasuredTarget: true });
ok('measured note names the burn', measured.eligible && /measured burn/i.test(measured.card.copy.note) && /2,325/.test(measured.card.copy.note));
const formula = buildDailyCard({ targetKcal: 2140, foodKcal: 1800, workoutKcal: 0, measuredBurnKcal: 2325, usedMeasuredTarget: false });
ok('formula note does not claim measured', formula.eligible && !/measured burn/i.test(formula.card.copy.note));

// ── recapDayKey: the most recent CLOSED day ─────────────────────────────
const now = new Date('2026-09-21T09:00:00');
eq('yesterday after midnight', recapDayKey(now, '2026-09-21', true), '2026-09-20');
// At 23:59 the previous day is fully closed, so it is a valid recap day.
eq('late evening offers the day before yesterday', recapDayKey(new Date('2026-09-20T23:59:00'), '2026-09-20', true), '2026-09-19');
eq('conflicting clocks are skipped', recapDayKey(new Date('2026-09-20T09:00:00'), '2026-09-19', true), null);
eq('no recap without any logs', recapDayKey(now, '2026-09-21', false), null);
ok('key is always ISO day shape', (recapDayKey(now, '2026-09-21', true) ?? '').match(/^\d{4}-\d{2}-\d{2}$/) !== null);

console.log(fails === 0 ? '\nAll daily-recap checks passed.' : `\n${fails} daily-recap check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
