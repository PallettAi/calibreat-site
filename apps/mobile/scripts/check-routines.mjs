/**
 * Train v2 helpers: routines, prefill, PRs and weekly volume (run: npm run check:routines).
 */
import {
  MAX_ROUTINES,
  MAX_ROUTINE_EXERCISES,
  ROUTINE_NAME_MAX,
  addRoutine,
  bestE1RM,
  isE1RMPR,
  isWeightPRAtReps,
  normaliseRoutineName,
  parseRoutines,
  prefillFromLast,
  removeRoutine,
  weeklyVolumeByExercise,
} from '../src/lib/routines.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// Names
eq('name trims and collapses spaces', normaliseRoutineName('  Push   Day  '), 'Push Day');
eq('blank name rejected', normaliseRoutineName('   '), null);
eq(`${ROUTINE_NAME_MAX} chars accepted`, normaliseRoutineName('a'.repeat(ROUTINE_NAME_MAX)) !== null, true);
eq(`${ROUTINE_NAME_MAX + 1} chars rejected`, normaliseRoutineName('a'.repeat(ROUTINE_NAME_MAX + 1)), null);

// Adding routines
const created = addRoutine([], {
  id: 'r1',
  name: 'Push',
  createdAt: '2026-10-19T09:00:00.000Z',
  items: [{ exerciseId: 'bench-press', defaultSets: 4 }, { exerciseId: 'not-a-lift' }, { exerciseId: 'lateral-raise' }],
});
eq('valid routine is added', created.ok, true);
eq('unknown exercise ids are dropped', created.ok && created.routines[0].items.map((i) => i.exerciseId), ['bench-press', 'lateral-raise']);
eq('missing default sets becomes 3', created.ok && created.routines[0].items[1].defaultSets, 3);
eq('default sets are kept', created.ok && created.routines[0].items[0].defaultSets, 4);

const dup = addRoutine(created.ok ? created.routines : [], {
  id: 'r2', name: 'PUSH', createdAt: '', items: [{ exerciseId: 'squat' }],
});
eq('duplicate name (case-insensitive) rejected', dup.ok, false);

const noItems = addRoutine([], { id: 'r3', name: 'Empty', createdAt: '', items: [{ exerciseId: 'nope' }] });
eq('routine with no known exercises rejected', noItems.ok, false);

const full = Array.from({ length: MAX_ROUTINES }, (_, i) => ({ id: `x${i}`, name: `R${i}`, createdAt: '', items: [{ exerciseId: 'squat', defaultSets: 3 }] }));
eq(`${MAX_ROUTINES + 1}th routine rejected`, addRoutine(full, { id: 'z', name: 'Extra', createdAt: '', items: [{ exerciseId: 'squat' }] }).ok, false);

const many = addRoutine([], {
  id: 'big', name: 'Big', createdAt: '', items: Array.from({ length: MAX_ROUTINE_EXERCISES + 5 }, () => ({ exerciseId: 'squat' })),
});
eq(`exercises capped at ${MAX_ROUTINE_EXERCISES}`, many.ok && many.routines[0].items.length, MAX_ROUTINE_EXERCISES);

eq('remove keeps others', removeRoutine(created.ok ? created.routines : [], 'r1').length, 0);

// Parsing stored routines (user-editable JSON from older builds)
eq('non-array storage yields no routines', parseRoutines({ nope: true }), []);
eq('null storage yields no routines', parseRoutines(null), []);
const parsed = parseRoutines([
  { id: 'ok', name: 'Legs', createdAt: 'x', items: [{ exerciseId: 'squat', defaultSets: 5 }] },
  { id: '', name: 'No id', items: [{ exerciseId: 'squat' }] },
  { id: 'bad-name', name: '', items: [{ exerciseId: 'squat' }] },
  { id: 'bad-items', name: 'Items', items: 'nope' },
  { id: 'unknown', name: 'Unknown', items: [{ exerciseId: 'laser-beam' }] },
  'a string',
  null,
]);
eq('only well-formed routines survive parsing', parsed.map((r) => r.id), ['ok']);
eq('parsed default sets are clamped', parseRoutines([{ id: 'c', name: 'C', items: [{ exerciseId: 'squat', defaultSets: 999 }] }])[0].items[0].defaultSets, 30);

// Prefill
eq('no history means no prefill', prefillFromLast([]), null);
eq('prefill uses the most recent set', prefillFromLast([{ weightKg: 60, reps: 8 }, { weightKg: 65, reps: 6 }]), { weightKg: 65, reps: 6 });

// PRs
const history = [{ weightKg: 80, reps: 5 }, { weightKg: 100, reps: 1 }];
// Epley: 100 × (1 + 1/30) = 103.3 beats 80 × (1 + 5/30) = 93.3
eq('best e1RM from history', bestE1RM(history), 103.3);
eq('a heavier set at the same reps is a weight PR', isWeightPRAtReps(history, { weightKg: 85, reps: 5 }), true);
eq('an equal set is not a PR', isWeightPRAtReps(history, { weightKg: 80, reps: 5 }), false);
eq('a heavier set at other reps is not a rep-matched PR', isWeightPRAtReps(history, { weightKg: 90, reps: 3 }), false);
eq('e1RM PR when the estimate beats history', isE1RMPR(history, { weightKg: 90, reps: 5 }), true);
eq('no e1RM PR below history', isE1RMPR(history, { weightKg: 70, reps: 5 }), false);
eq('zero-weight bodyweight set is never a PR', isE1RMPR([], { weightKg: 0, reps: 10 }), false);
eq('first ever set is not a PR (nothing to beat)', isE1RMPR([], { weightKg: 40, reps: 8 }), false);

// Weekly volume: Monday 2026-10-19 through Sunday 2026-10-25, today = Wednesday 21st.
const rows = [
  { dayKey: '2026-10-19', exerciseId: 'squat', sets: 3, reps: 5, weightKg: 100 },
  { dayKey: '2026-10-21', exerciseId: 'squat', sets: 1, reps: 5, weightKg: 100 },
  { dayKey: '2026-10-14', exerciseId: 'squat', sets: 5, reps: 5, weightKg: 100 }, // last week
  { dayKey: '2026-10-22', exerciseId: 'squat', sets: 9, reps: 9, weightKg: 100 }, // later this week still counts
  { dayKey: '2026-10-21', exerciseId: 'push-up', sets: 3, reps: 10, weightKg: 0 }, // bodyweight: no volume
];
// 1500 + 500 + 8100 = 10100 (Mon–Sun, so Thursday counts too); last week's 2500 does not.
eq('weekly volume sums the whole Mon–Sun week only', weeklyVolumeByExercise(rows, '2026-10-21'), { squat: 10100 });
eq('bodyweight lifts add no volume', 'push-up' in weeklyVolumeByExercise(rows, '2026-10-21'), false);

console.log(fails === 0 ? '\nAll routine checks passed.' : `\n${fails} routine check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
