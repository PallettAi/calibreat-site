/**
 * Accuracy checks for calibrEAT's nutrition + unit math (run: npm run check:math).
 *
 * Verifies the real implementation (src/lib/nutrition.ts and src/lib/units.ts)
 * against independently computed expected values — Mifflin-St Jeor BMR/TDEE,
 * goal adjustments, macro split, unit conversions and the healthy-weight range.
 */
import { computeGoals, bmr, tdee, healthyWeightRange, adaptiveTdee, bodyMassIndex, bmiBand, resolveBmiWeight, calorieBudget, caloriesRemaining } from '../src/lib/nutrition.ts';
import {
  CUP_ML,
  heightFromCm,
  heightToCm,
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

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);