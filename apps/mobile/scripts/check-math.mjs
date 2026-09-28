/**
 * Accuracy checks for calibrEAT's nutrition + unit math (run: npm run check:math).
 *
 * Verifies the real implementation (src/lib/nutrition.ts and src/lib/units.ts)
 * against independently computed expected values — Mifflin-St Jeor BMR/TDEE,
 * goal adjustments, macro split, unit conversions and the healthy-weight range.
 */
import { computeGoals, bmr, tdee, healthyWeightRange, adaptiveTdee, bodyMassIndex, bmiBand, resolveBmiWeight, calorieBudget, caloriesRemaining, recheckTargets, latestWeighInKg, RECHECK_TARGET_DELTA_KCAL } from '../src/lib/nutrition.ts';
import {
  CUP_ML,
  heightFromCm,
  heightToCm,
  normalizeDecimalNumber,
  parseWeightInput,
  waterToMl,
  weightFromKg,
  weightToKg,
} from '../src/lib/units.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = typeof got === 'number' && typeof want === 'number' ? Math.abs(got - want) < 0.15 : Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${got}, want ${want}`);
};

// BMR / TDEE (Mifflin-St Jeor)
eq('BMR male 80kg/180cm/30y', bmr({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 }), 1780);
eq('BMR female 60kg/165cm/35y', bmr({ sex: 'female', ageYears: 35, heightCm: 165, weightKg: 60 }), 1295);
eq('TDEE x1.55 of 1780', tdee(1780, 'moderate'), 2759);
eq('TDEE x1.375 of 1780', tdee(1780, 'light'), 2448);

// Goals
const lose = computeGoals({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'lose', ratePerWeek: 0.5 });
eq('lose target 2759-550', lose.calorieTarget, 2209);
eq('lose adj -550', lose.dailyAdjustment, -550);
eq('protein 80x1.8', lose.proteinG, 144);
eq('fat 25% of 2209', lose.fatG, 61);
eq('carbs remainder', lose.carbsG, 271);
const mon = computeGoals({ sex: 'female', ageYears: 35, heightCm: 165, weightKg: 60, activityLevel: 'sedentary', goal: 'monitor', ratePerWeek: 0.5 });
eq('monitor target = TDEE', mon.calorieTarget, mon.tdee);
const gain = computeGoals({ sex: 'male', ageYears: 24, heightCm: 180, weightKg: 60, activityLevel: 'light', goal: 'gain', ratePerWeek: 0.25 });
eq('gain gentle +275', gain.dailyAdjustment, 275);

// Height conversions
eq('5ft11in -> cm', heightToCm(5, 11, 0, 'ftin'), 180);
eq('1.8m -> cm', heightToCm(0, 0, 1.8, 'm'), 180);
const h = heightFromCm(180, 'ftin');
eq('180cm -> ft', h.feet, 5);
eq('180cm -> in', h.inches, 11);
eq('180cm -> m', heightFromCm(180, 'm').value, 1.8);

// Weight conversions
eq('9st 6lb -> kg', weightToKg(9, 6, 0, 'st'), 59.9);
const w = weightFromKg(59.9, 'st');
eq('59.9kg -> st', w.stones, 9);
eq('59.9kg -> lb part', w.pounds, 6);
eq('132lb -> kg', weightToKg(0, 0, 132, 'lb'), 59.9);
eq('59.9kg -> lb', weightFromKg(59.9, 'lb').value, 132);

// Stone remainders that round up to a full 14 lb must carry into the next
// stone. 63.5 kg is exactly 10 st, but 63.5 x 2.2046 = 139.993 lb, which
// floors to "9 st 14 lb" — an impossible weight. setup.tsx prefills from
// weightFromKg while validateStep rejects lb > 13, so the wizard was refusing
// its own prefill and deadlocking on those users.
const exactStone = weightFromKg(63.5, 'st');
eq('63.5kg is exactly 10 st', exactStone.stones, 10);
eq('63.5kg carries the 14 lb remainder', exactStone.pounds, 0);
eq('63.5kg -> kg round-trips', weightToKg(exactStone.stones, exactStone.pounds, 0, 'st'), 63.5);
// And an ordinary weight must NOT gain a stone.
const ordinary = weightFromKg(59.9, 'st');
eq('59.9kg stays 9 st', ordinary.stones, 9);
eq('59.9kg stays 6 lb', ordinary.pounds, 6);
// No weight in the adult range may produce an out-of-range pound remainder.
let invalidStones = 0;
for (let kg = 30; kg <= 250; kg += 0.05) {
  const s = weightFromKg(kg, 'st');
  if (s.pounds < 0 || s.pounds > 13) invalidStones += 1;
}
eq('no adult weight yields an invalid lb remainder', invalidStones, 0);

// Typed weight input. The input filter used to delete "," before the parser
// saw the string, so "70,5" was read as 705 kg and then dropped by the 20-400
// kg guard with no message — the button silently did nothing. parseFloat
// cannot disambiguate a decimal comma from a thousands separator, so the rules
// are explicit: a dot anywhere means commas group thousands, else a comma
// followed by exactly three digits does, else the comma is a decimal point.
eq('decimal comma kg', parseWeightInput('70,5', 'kg'), 70.5);
eq('decimal point kg', parseWeightInput('70.5', 'kg'), 70.5);
eq('thousands comma kg', parseWeightInput('1,000', 'kg'), 1000);
eq('thousands with decimal kg', parseWeightInput('1,200.5', 'kg'), 1200.5);
eq('grouped thousands kg', parseWeightInput('1,200,300', 'kg'), 1200300);
eq('decimal comma lb', parseWeightInput('160,5', 'lb'), 72.8);
eq('blank weight is null', parseWeightInput('', 'kg'), null);
eq('junk weight is null', parseWeightInput('abc', 'kg'), null);

// Stones take two fields, so a comma is a separator, never a decimal point.
eq('stone two fields space', parseWeightInput('9 6', 'st'), 59.9);
eq('stone two fields comma', parseWeightInput('9,6', 'st'), 59.9);
eq('stone single value', parseWeightInput('9.6', 'st'), weightToKg(9, 8, 0, 'st'));

// A stone is exactly 14 lb, so the pounds half is 0-13. These used to convert
// straight through and record a weight nobody entered — "10 500" is 290 kg and
// passes any plausibility check, and "9.99" rounds its remainder to a full 14.
eq('stone rejects 500 lb', parseWeightInput('10 500', 'st'), null);
eq('stone rejects 14 lb remainder', parseWeightInput('9.99', 'st'), null);
eq('stone accepts 13 lb', parseWeightInput('9 13', 'st'), weightToKg(9, 13, 0, 'st'));

eq('decimal normaliser keeps blank', normalizeDecimalNumber('  '), '');
eq('decimal normaliser splits thousands', normalizeDecimalNumber('1,200,300'), '1200300');
eq('decimal normaliser prefers dot', normalizeDecimalNumber('1,200.5'), '1200.5');
eq('decimal normaliser reads decimal comma', normalizeDecimalNumber('2,5'), '2.5');

// Water
eq('2 cups -> ml', waterToMl(2, 'cups'), 480);
eq('CUP_ML constant', CUP_ML, 240);
eq('250ml -> cups', waterToMl(250, 'ml'), 250);

// Healthy range
const range = healthyWeightRange(180);
eq('range min 18.5 BMI', range.minKg, 59.9);
eq('range max 24.9 BMI', range.maxKg, 80.7);
eq('BMI 80kg / 180cm', bodyMassIndex(80, 180), 24.7);
eq('BMI 60kg / 165cm', bodyMassIndex(60, 165), 22);
eq('BMI rejects zero height', bodyMassIndex(80, 0), null);
eq('BMI rejects zero weight', bodyMassIndex(0, 180), null);
eq('band underweight', bmiBand(15.4), 'underweight');
eq('band healthy at 18.5', bmiBand(18.5), 'healthy');
eq('band overweight at 25', bmiBand(25), 'overweight');
eq('band obese at 30', bmiBand(30), 'obese');
const fromWeighIn = resolveBmiWeight(80, [{ kg: 78.4, at: '2026-09-09T08:00:00' }]);
eq('latest weigh-in wins over setup', fromWeighIn.kg, 78.4);
eq('weigh-in source', fromWeighIn.source === 'weigh-in' ? 1 : 0, 1);
eq('setup weight when no weigh-ins', resolveBmiWeight(80, []).kg, 80);

// True Burn: missing log days are not treated as 0 kcal. 7 of 14 days at
// 2000 kcal, stable weight → measured burn is 2000 (not 1000).
const sparseDays = [];
for (let d = 1; d <= 7; d++) {
  sparseDays.push({ dayKey: `2026-01-${String(d).padStart(2, '0')}`, kcal: 2000 });
}
const sparseStable = adaptiveTdee({
  estimatedTdee: 2000,
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 80, at: '2026-01-14T12:00:00' },
  ],
  intakeByDay: sparseDays,
  goal: 'maintain',
  ratePerWeek: 0.5,
});
eq('sparse True Burn ready', sparseStable.ready ? 1 : 0, 1);
eq('sparse True Burn does not treat unlogged days as 0', sparseStable.measuredTdee, 2000);

const sparseLoss = adaptiveTdee({
  estimatedTdee: 2550,
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 79, at: '2026-01-14T12:00:00' },
  ],
  intakeByDay: sparseDays,
  goal: 'maintain',
  ratePerWeek: 0.5,
});
eq('sparse True Burn imputes logged average over the weigh-in span', sparseLoss.measuredTdee, 2550);

// New True Burn helpers (Phase A)
import { adaptiveConfidence, adaptiveHistory, detectPlateau } from '../src/lib/nutrition.ts';
eq('confidence high', adaptiveConfidence(21, 4, 14) === 'high' ? 1 : 0, 1);
eq('confidence medium', adaptiveConfidence(14, 3, 10) === 'medium' ? 1 : 0, 1);
eq('confidence low short', adaptiveConfidence(7, 2, 7) === 'low' ? 1 : 0, 1);
eq('confidence low few weighins', adaptiveConfidence(21, 2, 14) === 'low' ? 1 : 0, 1);
// history: 3 weigh-ins spanning 14d, all logged -> 2 points
const pts = adaptiveHistory({
  estimatedTdee: 2000,
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 80, at: '2026-01-08T12:00:00' },
    { kg: 79.5, at: '2026-01-15T12:00:00' },
  ],
  intakeByDay: Array.from({ length: 15 }, (_, i) => ({
    dayKey: `2026-01-${String(i + 1).padStart(2, '0')}`,
    kcal: 2000,
  })),
  goal: 'maintain',
  ratePerWeek: 0.5,
});
eq('history len 3 weighins -> 2 points', pts.length, 2);
// plateau: flat + deficit drift -> plateau
const adFlat = adaptiveTdee({
  estimatedTdee: 2200,
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 80.1, at: '2026-01-15T12:00:00' },
  ],
  intakeByDay: Array.from({ length: 15 }, (_, i) => ({
    dayKey: `2026-01-${String(i + 1).padStart(2, '0')}`,
    kcal: 1800,
  })),
  goal: 'maintain',
  ratePerWeek: 0.5,
});
const plFlat = detectPlateau({
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 80.1, at: '2026-01-15T12:00:00' },
  ],
  intakeByDay: Array.from({ length: 15 }, (_, i) => ({
    dayKey: `2026-01-${String(i + 1).padStart(2, '0')}`,
    kcal: 1800,
  })),
  adaptive: adFlat,
});
eq('plateau true when flat + drift', plFlat.isPlateau ? 1 : 0, 1);
// not a plateau when losing as expected
const adLose = adaptiveTdee({
  estimatedTdee: 2200,
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 79, at: '2026-01-15T12:00:00' },
  ],
  intakeByDay: Array.from({ length: 15 }, (_, i) => ({
    dayKey: `2026-01-${String(i + 1).padStart(2, '0')}`,
    kcal: 1800,
  })),
  goal: 'lose',
  ratePerWeek: 0.5,
});
const plLose = detectPlateau({
  weighIns: [
    { kg: 80, at: '2026-01-01T12:00:00' },
    { kg: 79, at: '2026-01-15T12:00:00' },
  ],
  intakeByDay: Array.from({ length: 15 }, (_, i) => ({
    dayKey: `2026-01-${String(i + 1).padStart(2, '0')}`,
    kcal: 1800,
  })),
  adaptive: adLose,
});
eq('no plateau when weight moving', plLose.isPlateau ? 1 : 0, 0);

// Eat remaining: logged Train kcal raise the day's budget, not True Burn.
eq('budget with no workout is the target', calorieBudget(2209, 0), 2209);
eq('budget adds logged Train kcal', calorieBudget(2209, 34), 2243);
eq('remaining food only', caloriesRemaining({ target: 2209, foodKcal: 1800, workoutKcal: 0 }), 409);
eq('remaining grows after a workout', caloriesRemaining({ target: 2209, foodKcal: 1800, workoutKcal: 34 }), 443);
eq('workout can still leave you over', caloriesRemaining({ target: 2200, foodKcal: 2300, workoutKcal: 34 }), -66);
eq('junk workout kcal is ignored', calorieBudget(2200, Number.NaN), 2200);

// Target re-derivation: goals should track body weight, not freeze at setup.
const cut = { sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate', goal: 'lose', ratePerWeek: 0.5 };
const storedCut = computeGoals(cut);
eq('setup target is the baseline', storedCut.calorieTarget, 2209);

eq('no weigh-ins falls back to setup weight', latestWeighInKg([], 80), 80);
eq('unusable weigh-ins fall back', latestWeighInKg([{ kg: 0, at: '2026-02-01' }], 80), 80);
eq('latest weigh-in wins even unordered', latestWeighInKg(
  [{ kg: 74, at: '2026-03-20' }, { kg: 76, at: '2026-03-01' }], 80,
), 74);

// 4 kg off setup moves the target by 62 kcal (2209 -> 2147): stale.
const lost4 = recheckTargets({
  stored: storedCut,
  profile: cut,
  weighIns: [{ kg: 76, at: '2026-03-01' }],
});
eq('4 kg off setup is stale', lost4.stale ? 1 : 0, 1);
eq('re-derived target', lost4.next.calorieTarget, 2147);
eq('target delta', lost4.deltaKcal, -62);
eq('weight basis is the weigh-in', lost4.weightBasisKg, 76);
eq('protein follows weight too', lost4.next.proteinG, 137);
eq('carbs are the remainder', lost4.next.carbsG, 265);
eq('reason names the weight', /3\.9? kg lighter|4 kg lighter/.test(lost4.reason) ? 1 : 0, 1);

// 1 kg off setup moves the target by 15 kcal: inside the threshold.
const lost1 = recheckTargets({
  stored: storedCut,
  profile: cut,
  weighIns: [{ kg: 79, at: '2026-03-01' }],
});
eq('1 kg off setup is not stale', lost1.stale ? 1 : 0, 0);
eq('small-change target', lost1.next.calorieTarget, 2194);
eq('small-change delta', lost1.deltaKcal, -15);
eq('small-change reason is honest', /threshold/.test(lost1.reason) ? 1 : 0, 1);

// Gaining moves the target the other way (surplus goal).
const bulk = { ...cut, goal: 'gain', weightKg: 60 };
const storedBulk = computeGoals(bulk);
const gained = recheckTargets({ stored: storedBulk, profile: bulk, weighIns: [{ kg: 64, at: '2026-03-01' }] });
eq('gaining is stale', gained.stale ? 1 : 0, 1);
eq('gain target rises', gained.next.calorieTarget, storedBulk.calorieTarget + 62);

// A 'monitor' goal derives straight from TDEE, which is weight-dependent too.
const watch = { ...cut, goal: 'monitor' };
const storedWatch = computeGoals(watch);
eq('monitor target equals TDEE', storedWatch.calorieTarget, storedWatch.tdee);
const watched = recheckTargets({ stored: storedWatch, profile: watch, weighIns: [{ kg: 76, at: '2026-03-01' }] });
eq('monitor target tracks weight', watched.next.calorieTarget, 2697);
eq('monitor delta', watched.deltaKcal, -62);

// Threshold boundary: exactly 50 kcal is stale, 49 is not.
const boundary = computeGoals({ ...cut, weightKg: 76 });
eq('boundary at 50 kcal is stale', recheckTargets({
  stored: { ...boundary, calorieTarget: boundary.calorieTarget + 50 },
  profile: cut,
  weighIns: [{ kg: 76, at: '2026-03-01' }],
}).stale ? 1 : 0, 1);
eq('boundary at 49 kcal is not stale', recheckTargets({
  stored: { ...boundary, calorieTarget: boundary.calorieTarget + 49 },
  profile: cut,
  weighIns: [{ kg: 76, at: '2026-03-01' }],
}).stale ? 1 : 0, 0);

// With no weigh-ins the target is unchanged and the reason says so.
const noWeighIns = recheckTargets({ stored: storedCut, profile: cut, weighIns: [] });
eq('no weigh-ins is not stale', noWeighIns.stale ? 1 : 0, 0);
eq('no weigh-ins delta is zero', noWeighIns.deltaKcal, 0);
eq('no weigh-ins reason', /No weigh-ins/.test(noWeighIns.reason) ? 1 : 0, 1);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);