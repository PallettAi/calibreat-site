/**
 * Accuracy checks for Train muscle highlights (run: npm run check:muscles).
 *
 * Curl must light biceps (primary) and forearm (assisting).
 * Squat must light quads + glutes primary, hammies / adductors / erectors assisting.
 */
import {
  EXERCISES,
  exercisesGrouped,
  getExercise,
  hasPickedExercise,
  highlightForExercise,
  muscleRole,
} from '../src/lib/muscles.ts';

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
  'abs lists sit-up, twist, plank and home core moves',
  groups.find((g) => g.id === 'abs')?.exercises.map((e) => e.id),
  [
    'sit-up',
    'russian-twist',
    'plank',
    'crunch',
    'reverse-crunch',
    'dead-bug',
    'leg-raise',
    'mountain-climber',
    'shoulder-tap',
    'bicycle-crunch',
    'side-plank',
  ],
);
eq(
  'free chest lists push-up, bench, incline, decline, fly',
  groups.find((g) => g.id === 'chest')?.exercises.map((e) => e.id),
  ['push-up', 'bench-press', 'incline-bench', 'decline-push-up', 'dumbbell-fly'],
);
eq(
  'free back lists pull-up, chin-up, row, deadlift and home back moves',
  groups.find((g) => g.id === 'back')?.exercises.map((e) => e.id),
  [
    'pull-up',
    'chin-up',
    'bent-over-row',
    'deadlift',
    'superman',
    'back-extension',
    'good-morning',
    'dumbbell-row',
    'doorway-row',
    'reverse-fly',
  ],
);
eq(
  'free shoulders lists press, raises and home shoulder moves',
  groups.find((g) => g.id === 'shoulders')?.exercises.map((e) => e.id),
  ['overhead-press', 'lateral-raise', 'face-pull', 'pike-push-up', 'front-raise', 'arm-circle', 'jumping-jack'],
);
eq(
  'free biceps lists curl, hammer and concentration',
  groups.find((g) => g.id === 'biceps')?.exercises.map((e) => e.id),
  ['bicep-curl', 'hammer-curl', 'concentration-curl'],
);
eq(
  'free triceps lists dip, skull crusher and push-up variants',
  groups.find((g) => g.id === 'triceps')?.exercises.map((e) => e.id),
  ['tricep-dip', 'skull-crusher', 'diamond-push-up', 'overhead-triceps-extension'],
);
eq(
  'quads lists squat, lunge, split squat and home leg moves',
  groups.find((g) => g.id === 'quads')?.exercises.map((e) => e.id),
  [
    'squat',
    'lunge',
    'bulgarian-split-squat',
    'jump-squat',
    'wall-sit',
    'step-up',
    'reverse-lunge',
    'lateral-lunge',
    'sumo-squat',
    'goblet-squat',
    'burpee',
  ],
);
eq(
  'glutes lists squat family, hip thrust, RDL and home glute moves',
  groups.find((g) => g.id === 'glutes')?.exercises.map((e) => e.id),
  [
    'squat',
    'lunge',
    'deadlift',
    'hip-thrust',
    'bulgarian-split-squat',
    'romanian-deadlift',
    'jump-squat',
    'step-up',
    'reverse-lunge',
    'lateral-lunge',
    'sumo-squat',
    'goblet-squat',
    'glute-bridge',
    'single-leg-glute-bridge',
    'donkey-kick',
    'fire-hydrant',
  ],
);
eq(
  'free hamstrings lists deadlifts',
  groups.find((g) => g.id === 'hamstrings')?.exercises.map((e) => e.id),
  ['deadlift', 'romanian-deadlift', 'single-leg-romanian-deadlift'],
);
eq(
  'free calves lists raises and skipping',
  groups.find((g) => g.id === 'calves')?.exercises.map((e) => e.id),
  ['calf-raise', 'single-leg-calf-raise', 'skipping'],
);

const machines = exercisesGrouped('machine');
eq(
  'machine chest is press, pec deck and chest machine variants',
  machines.find((g) => g.id === 'chest')?.exercises.map((e) => e.id),
  ['chest-press', 'pec-deck', 'incline-chest-press', 'decline-chest-press', 'smith-bench-press', 'cable-fly'],
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

// Home and free-weight additions: spot-check the primary muscle of each new family.
eq('superman primary erectors', muscleRole('superman', 'lower-back'), 'primary');
eq('dumbbell fly primary chest', muscleRole('dumbbell-fly', 'chest'), 'primary');
eq('burpee primary quads', muscleRole('burpee', 'quadriceps'), 'primary');
eq('crunch primary abs', muscleRole('crunch', 'abs'), 'primary');
eq('side plank primary obliques', muscleRole('side-plank', 'obliques'), 'primary');
eq('glute bridge primary glutes', muscleRole('glute-bridge', 'gluteal'), 'primary');
eq('skipping primary calves', muscleRole('skipping', 'calves'), 'primary');
eq('diamond push-up primary triceps', muscleRole('diamond-push-up', 'triceps'), 'primary');
eq('push-up is free equipment', getExercise('push-up')?.equipment ?? '', 'free');
eq(
  'every catalogue id is unique',
  new Set(EXERCISES.map((e) => e.id)).size === EXERCISES.length ? 1 : 0,
  1,
);
eq(
  'every catalogue name is unique',
  new Set(EXERCISES.map((e) => e.name)).size === EXERCISES.length ? 1 : 0,
  1,
);
eq('catalogue has 99 exercises (74 original plus 25 machine additions)', EXERCISES.length, 99);

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
console.log('\nall muscle checks passed');
