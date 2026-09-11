/**
 * Accuracy checks for Train muscle highlights (run: npm run check:muscles).
 *
 * Curl must light biceps (primary) and forearm (assisting).
 * Squat must light quads + glutes primary, hammies / adductors / erectors assisting.
 */
import { exercisesGrouped, getExercise, hasPickedExercise, highlightForExercise, muscleRole } from '../src/lib/muscles.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq('curl primary biceps', muscleRole('bicep-curl', 'biceps'), 'primary');
eq('curl assisting forearm', muscleRole('bicep-curl', 'forearm'), 'assisting');
eq('curl leaves quads rest', muscleRole('bicep-curl', 'quadriceps'), 'rest');
eq('curl leaves glutes rest', muscleRole('bicep-curl', 'gluteal'), 'rest');

eq('squat primary quads', muscleRole('squat', 'quadriceps'), 'primary');
eq('squat primary glutes', muscleRole('squat', 'gluteal'), 'primary');
eq('squat assisting hammies', muscleRole('squat', 'hamstring'), 'assisting');
eq('squat assisting adductors', muscleRole('squat', 'adductors'), 'assisting');
eq('squat assisting erectors', muscleRole('squat', 'lower-back'), 'assisting');
eq('squat leaves biceps rest', muscleRole('squat', 'biceps'), 'rest');

const curl = highlightForExercise('bicep-curl');
eq(
  'curl highlight slugs',
  [...curl].map((h) => h.slug).sort(),
  ['biceps', 'forearm'],
);
eq('curl biceps intensity 2', curl.find((h) => h.slug === 'biceps')?.intensity, 2);
eq('curl forearm intensity 1', curl.find((h) => h.slug === 'forearm')?.intensity, 1);

const squat = highlightForExercise('squat');
eq(
  'squat highlight slugs',
  [...squat].map((h) => h.slug).sort(),
  ['adductors', 'gluteal', 'hamstring', 'lower-back', 'quadriceps'],
);

eq('unknown exercise is empty', highlightForExercise('kettlebell-swing').length, 0);
eq('unknown slug is rest', muscleRole('bicep-curl', 'tibialis'), 'rest');

eq('sit-up primary abs', muscleRole('sit-up', 'abs'), 'primary');
eq('sit-up assisting obliques', muscleRole('sit-up', 'obliques'), 'assisting');
eq('russian twist primary obliques', muscleRole('russian-twist', 'obliques'), 'primary');
eq('russian twist assisting abs', muscleRole('russian-twist', 'abs'), 'assisting');

const groups = exercisesGrouped('free');
eq(
  'group ids in gym order',
  groups.map((g) => g.id),
  ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs', 'quads', 'glutes', 'hamstrings', 'calves'],
);
eq(
  'abs lists sit-up, twist, plank',
  groups.find((g) => g.id === 'abs')?.exercises.map((e) => e.id),
  ['sit-up', 'russian-twist', 'plank'],
);
eq(
  'free chest lists push-up, bench, incline',
  groups.find((g) => g.id === 'chest')?.exercises.map((e) => e.id),
  ['push-up', 'bench-press', 'incline-bench'],
);
eq(
  'free back lists pull-up, chin-up, row, deadlift',
  groups.find((g) => g.id === 'back')?.exercises.map((e) => e.id),
  ['pull-up', 'chin-up', 'bent-over-row', 'deadlift'],
);
eq(
  'free biceps lists curl and hammer',
  groups.find((g) => g.id === 'biceps')?.exercises.map((e) => e.id),
  ['bicep-curl', 'hammer-curl'],
);
eq(
  'quads lists squat, lunge, split squat',
  groups.find((g) => g.id === 'quads')?.exercises.map((e) => e.id),
  ['squat', 'lunge', 'bulgarian-split-squat'],
);
eq(
  'glutes lists squat family plus hip thrust and RDL',
  groups.find((g) => g.id === 'glutes')?.exercises.map((e) => e.id),
  ['squat', 'lunge', 'deadlift', 'hip-thrust', 'bulgarian-split-squat', 'romanian-deadlift'],
);

const machines = exercisesGrouped('machine');
eq(
  'machine chest is press and pec deck',
  machines.find((g) => g.id === 'chest')?.exercises.map((e) => e.id),
  ['chest-press', 'pec-deck'],
);
eq(
  'machines omit push-up',
  machines.find((g) => g.id === 'chest')?.exercises.some((e) => e.id === 'push-up') ? 1 : 0,
  0,
);
eq(
  'free omits lat pulldown',
  groups.find((g) => g.id === 'back')?.exercises.some((e) => e.id === 'lat-pulldown') ? 1 : 0,
  0,
);
eq('lat pulldown is machine back', muscleRole('lat-pulldown', 'upper-back'), 'primary');
eq('chest press primary chest', muscleRole('chest-press', 'chest'), 'primary');
eq('incline bench primary chest', muscleRole('incline-bench', 'chest'), 'primary');
eq('plank primary abs', muscleRole('plank', 'abs'), 'primary');
eq('squat is free', getExercise('squat')?.equipment ?? '', 'free');
eq('leg press is machine', getExercise('leg-press')?.equipment ?? '', 'machine');

eq('push-up primary chest', muscleRole('push-up', 'chest'), 'primary');
eq('push-up assisting triceps', muscleRole('push-up', 'triceps'), 'assisting');
eq('bench primary chest', muscleRole('bench-press', 'chest'), 'primary');
eq('pull-up primary upper back', muscleRole('pull-up', 'upper-back'), 'primary');
eq('row primary upper back', muscleRole('bent-over-row', 'upper-back'), 'primary');
eq('ohp primary delts', muscleRole('overhead-press', 'deltoids'), 'primary');
eq('dip primary triceps', muscleRole('tricep-dip', 'triceps'), 'primary');
eq('deadlift primary hammies', muscleRole('deadlift', 'hamstring'), 'primary');
eq('lunge primary quads', muscleRole('lunge', 'quadriceps'), 'primary');
eq('calf raise primary calves', muscleRole('calf-raise', 'calves'), 'primary');
eq('push-up is a picked lift', hasPickedExercise('push-up') ? 1 : 0, 1);

eq('no lift picked hides the figure', hasPickedExercise(null) ? 1 : 0, 0);
eq('sit-up is a picked lift', hasPickedExercise('sit-up') ? 1 : 0, 1);
eq('unknown lift is not picked', hasPickedExercise('kettlebell-swing') ? 1 : 0, 0);
eq('sit-up still exists', getExercise('sit-up')?.id ?? '', 'sit-up');

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
console.log('\nall muscle checks passed');
