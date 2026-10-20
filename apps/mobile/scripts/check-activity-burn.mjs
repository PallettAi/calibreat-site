/**
 * Activity burn: which source counts, the noise floor, and surplus eat-back
 * (run: npm run check:activity).
 *
 * Eat-back is surplus only: measured activity above the TDEE − BMR already
 * assumed inside the target. A usual session adds nothing.
 */
import {
  ACTIVE_NOISE_FLOOR_KCAL,
  SURPLUS_CAP_KCAL,
  activitySurplus,
  hasRealActivity,
  selectActivityBurn,
  sourceLabel,
} from '../src/lib/activity-burn.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const base = { connected: true, hcActiveKcal: 0, hcExerciseCount: 0, trainMetKcal: 0 };

// Source selection
eq(
  'HC connected with real activity wins',
  selectActivityBurn({ ...base, hcActiveKcal: 300, hcExerciseCount: 1, trainMetKcal: 150 }).source,
  'health-connect',
);
eq(
  'HC kcal is what is returned when it wins',
  selectActivityBurn({ ...base, hcActiveKcal: 300, hcExerciseCount: 1, trainMetKcal: 150 }).kcal,
  300,
);
eq(
  'HC disconnected falls back to Train',
  selectActivityBurn({ ...base, connected: false, hcActiveKcal: 500, hcExerciseCount: 2, trainMetKcal: 150 }).source,
  'train',
);
eq(
  'HC connected but no real activity falls back to Train',
  selectActivityBurn({ ...base, hcActiveKcal: 20, hcExerciseCount: 0, trainMetKcal: 150 }).source,
  'train',
);
eq(
  'HC connected, nothing from Train → none',
  selectActivityBurn({ ...base, hcActiveKcal: 20, hcExerciseCount: 0, trainMetKcal: 0 }).source,
  'none',
);
eq('none reports zero kcal', selectActivityBurn({ ...base, connected: false }).kcal, 0);
eq('Train fallback kcal', selectActivityBurn({ ...base, connected: false, trainMetKcal: 210.4 }).kcal, 210);

// Noise floor
eq('74 active kcal is not real activity', hasRealActivity(74, 0), false);
eq(`${ACTIVE_NOISE_FLOOR_KCAL} active kcal is real activity`, hasRealActivity(ACTIVE_NOISE_FLOOR_KCAL, 0), true);
eq('one exercise session is real activity even at 0 kcal', hasRealActivity(0, 1), true);
eq('NaN active kcal does not count', hasRealActivity(NaN, 0), false);

// Corrupt inputs never produce negative or NaN burn
eq('negative Train kcal clamps to none', selectActivityBurn({ ...base, connected: false, trainMetKcal: -50 }).source, 'none');
// A session still proves real activity, so HC is the source, but NaN kcal is read as 0.
eq('NaN HC kcal is read as 0 with sessions present', selectActivityBurn({ ...base, hcActiveKcal: NaN, hcExerciseCount: 3 }).kcal, 0);
eq('NaN HC kcal with no sessions does not win', selectActivityBurn({ ...base, hcActiveKcal: NaN, hcExerciseCount: 0 }).source, 'none');

// Surplus eat-back
const goals = { tdee: 2400, bmr: 1700 }; // assumed activity = 700
eq('measured under assumed → 0 surplus', activitySurplus({ measuredKcal: 500, ...goals }), 0);
eq('measured equal to assumed → 0 surplus', activitySurplus({ measuredKcal: 700, ...goals }), 0);
eq('measured above assumed → surplus', activitySurplus({ measuredKcal: 820, ...goals }), 120);
eq('surplus is capped', activitySurplus({ measuredKcal: 2000, ...goals }), SURPLUS_CAP_KCAL);
eq('surplus cap value is 400', SURPLUS_CAP_KCAL, 400);
eq('missing TDEE means no eat-back', activitySurplus({ measuredKcal: 900, tdee: null, bmr: 1700 }), 0);
eq('missing BMR means no eat-back', activitySurplus({ measuredKcal: 900, tdee: 2400, bmr: undefined }), 0);
eq('NaN measured means no eat-back', activitySurplus({ measuredKcal: NaN, ...goals }), 0);
eq('a Train session never adds surplus on its own (below assumed)', activitySurplus({ measuredKcal: 300, ...goals }), 0);

// Labels for the UI
eq('HC label', sourceLabel('health-connect'), 'Health Connect');
eq('Train label', sourceLabel('train'), 'Train estimate');
eq('none label is empty', sourceLabel('none'), '');

console.log(fails === 0 ? '\nAll activity-burn checks passed.' : `\n${fails} activity-burn check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
