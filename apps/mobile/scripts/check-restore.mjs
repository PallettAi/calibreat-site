/**
 * Checks for backup restore (run: npm run check:restore).
 *
 * Verifies the real implementation (src/lib/restore.ts): that a bundle written
 * by src/lib/export.ts reads back with its days and timestamps intact, that
 * junk is rejected with an honest message instead of a crash, that merging the
 * same backup twice changes nothing, and that the constants this module
 * duplicates (it has no runtime imports, so Node can load it) still agree with
 * the modules they mirror.
 */
import { register } from 'node:module';

// diary.ts imports its sibling micronutrients module without an extension, as Metro expects.
register('./alias-hooks.mjs', import.meta.url);
const { buildExportBundle, EXPORT_SCHEMA } = await import('../src/lib/export.ts');
const { MEAL_SLOTS } = await import('../src/lib/diary.ts');
const { SAVED_MEAL_LIMIT, SAVED_MEAL_MAX_ITEMS } = await import('../src/lib/saved-meals.ts');
const { localDayKey } = await import('../src/lib/dates.ts');
const {
  describePlan,
  describePlanNotes,
  describeRestored,
  formatExportedAt,
  logFingerprint,
  parseBackup,
  planRestore,
  RESTORE_MAX_BYTES,
} = await import('../src/lib/restore.ts');

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

/* ── A real backup, built by the real exporter ─────────────────── */

const profile = {
  sex: 'male',
  ageYears: 34,
  heightCm: 178,
  weightKg: 82.4,
  activityLevel: 'moderate',
  goal: 'cut',
  ratePerWeek: 0.5,
  supplements: ['Creatine'],
};
const goals = { bmr: 1780, tdee: 2669, calorieTarget: 2194, proteinG: 165, carbsG: 220, fatG: 73 };

const logEntry = {
  id: 1,
  dayKey: '2026-09-11',
  meal: 'breakfast',
  name: 'Porridge',
  kcal: 342,
  proteinG: 13,
  carbsG: 58,
  fatG: 8,
  fiberG: 6,
  sugarG: 12,
  satFatG: 3,
  sodiumMg: 120,
  loggedAt: '2026-09-11T07:30:00.000Z',
};
const weighIn = { id: 1, kg: 79.8, measuredAt: '2026-09-11T08:00:00.000Z', dayKey: '2026-09-11' };
const water = { id: 1, dayKey: '2026-09-11', ml: 4000, loggedAt: '2026-09-11T09:00:00.000Z' };
const workout = {
  id: 1,
  dayKey: '2026-09-11',
  exerciseId: 'squat',
  sets: 3,
  reps: 5,
  kcal: 180,
  weightKg: 80,
  volumeKg: 1200,
  e1RMKg: 106.7,
  loggedAt: '2026-09-11T18:00:00.000Z',
};
const savedMeal = {
  id: 1,
  name: 'Usual breakfast',
  meal: 'breakfast',
  items: [{ name: 'Porridge', kcal: 342, proteinG: 13, carbsG: 58, fatG: 8, fiberG: 6, sugarG: 12, satFatG: 3, sodiumMg: 120 }],
  createdAt: '2026-09-10T08:00:00.000Z',
};

const backup = buildExportBundle({
  exportedAt: '2026-09-12T10:00:00.000Z',
  profile,
  goals,
  logEntries: [logEntry],
  weighIns: [weighIn],
  water: [water],
  workouts: [workout],
  savedMeals: [savedMeal],
});

/* ── The round trip that matters ───────────────────────────────── */

const roundTrip = parseBackup(JSON.stringify(backup));
ok('a real export parses', roundTrip.ok);
if (roundTrip.ok) {
  // The whole point of the feature: a meal logged in September is still a
  // September meal after a restore, not one stamped with today's date.
  eq('day survives the round trip', roundTrip.bundle.logEntries[0].dayKey, '2026-09-11');
  eq('timestamp survives the round trip', roundTrip.bundle.logEntries[0].loggedAt, '2026-09-11T07:30:00.000Z');
  eq('weigh-in day survives', roundTrip.bundle.weighIns[0].dayKey, '2026-09-11');
  eq('weigh-in timestamp survives', roundTrip.bundle.weighIns[0].measuredAt, '2026-09-11T08:00:00.000Z');
  eq('water day survives', roundTrip.bundle.water[0].dayKey, '2026-09-11');
  eq('workout day survives', roundTrip.bundle.workouts[0].dayKey, '2026-09-11');
  eq('workout e1RM survives', roundTrip.bundle.workouts[0].e1RMKg, 106.7);
  eq('saved meal items survive', roundTrip.bundle.savedMeals[0].items[0].kcal, 342);
  eq('profile survives', roundTrip.bundle.profile?.weightKg, 82.4);
  eq('supplements survive', roundTrip.bundle.profile?.supplements, ['Creatine']);
  eq('goals survive', roundTrip.bundle.goals?.calorieTarget, 2194);
  eq('exportedAt survives', roundTrip.bundle.exportedAt, '2026-09-12T10:00:00.000Z');
  eq('ids are dropped, not reused', 'id' in roundTrip.bundle.logEntries[0], false);
  eq('a clean file warns about nothing', roundTrip.warnings, []);
}

/* ── Refusals, never exceptions ────────────────────────────────── */

eq('empty file is refused', parseBackup(''), {
  ok: false,
  message: 'That file is empty. Pick the calibrEAT backup you exported.',
});
eq('non-JSON is refused', parseBackup('{"app": "calibrEAT"').ok, false);
eq('a JSON array is refused', parseBackup('[]').ok, false);
eq('someone else\'s JSON is refused', parseBackup('{"app":"Cronometer","schema":"x"}'), {
  ok: false,
  message: 'That file was not exported by calibrEAT.',
});
eq('a future schema is refused, not half-read', parseBackup(JSON.stringify({ app: 'calibrEAT', schema: 'calibreat.export.v9' })), {
  ok: false,
  message: 'That backup is calibreat.export.v9, and this app reads calibreat.export.v1. Nothing was changed.',
});
ok('an oversized file is refused', parseBackup('x'.repeat(RESTORE_MAX_BYTES + 1)).ok === false);
eq('a backup with no rows is refused', parseBackup(JSON.stringify({ app: 'calibrEAT', schema: EXPORT_SCHEMA })).ok, false);

/* ── Bad rows are dropped out loud, not silently ───────────────── */

const messy = parseBackup(
  JSON.stringify({
    ...backup,
    logEntries: [
      logEntry,
      { ...logEntry, id: 2, kcal: 'not a number' },
      { ...logEntry, id: 3, meal: 'brunch' },
    ],
    weighIns: [weighIn, { ...weighIn, id: 2, kg: 4200 }],
  }),
);
ok('a partly-broken file still restores', messy.ok);
if (messy.ok) {
  eq('only the readable meal is kept', messy.bundle.logEntries.length, 1);
  eq('a 4200 kg weigh-in is rejected', messy.bundle.weighIns.length, 1);
  eq('the drops are reported in one line', messy.warnings.length, 1);
  ok('the warning counts every lost row', messy.warnings[0].startsWith('3 rows were unreadable'));
}

// A day key that cannot be a real date is recovered from the timestamp rather
// than thrown away — the meal is still that meal, on that day — but the user
// is told it happened rather than left to guess.
const impossibleDay = parseBackup(JSON.stringify({ ...backup, logEntries: [{ ...logEntry, dayKey: '2026-02-31' }] }));
ok('an impossible date still restores', impossibleDay.ok);
if (impossibleDay.ok) {
  eq('the day is read from the timestamp instead', impossibleDay.bundle.logEntries[0].dayKey, localDayKey(new Date(logEntry.loggedAt)));
  eq('the recovery is its own warning', impossibleDay.warnings.length, 1);
  ok('the recovery is reported', impossibleDay.warnings[0].includes('missing their day'));
}

/* ── Merge: adding, and adding the same thing twice ────────────── */

const fresh = planRestore(roundTrip.bundle, undefined, 'merge');
eq('a fresh device takes everything', fresh.logEntries.length, 1);
eq('a fresh device adopts the profile', fresh.profile?.weightKg, 82.4);
eq('nothing is cleared on merge', fresh.clears, false);

const second = planRestore(roundTrip.bundle, {
  logEntries: fresh.logEntries,
  weighIns: fresh.weighIns,
  water: fresh.water,
  workouts: fresh.workouts,
  savedMeals: fresh.savedMeals,
  hasProfile: true,
}, 'merge');
eq('re-importing the same backup adds nothing', second.logEntries.length, 0);
eq('…and says so', second.duplicates, 5);
eq('…including saved meals', second.savedMeals.length, 0);
ok('the duplicates are reported', second.notes.some((n) => n.includes('already on this device')));
ok('an established profile is kept, not overwritten', second.profile === null);
ok('…and that is said too', second.notes.some((n) => n.includes('profile and targets were kept')));

eq(
  'a fingerprint ignores the id and follows the row',
  logFingerprint({ ...logEntry, id: 99 }) === logFingerprint({ ...logEntry, id: 1 }),
  true,
);
eq(
  'a different day is a different meal',
  logFingerprint(logEntry) === logFingerprint({ ...logEntry, dayKey: '2026-09-12' }),
  false,
);

/* ── Replace: the new phone takes the old one's history ─────────── */

const wipe = planRestore(roundTrip.bundle, { ...fresh, hasProfile: true }, 'replace');
eq('replace clears the device first', wipe.clears, true);
eq('replace keeps every row, duplicates and all', wipe.logEntries.length, 1);
eq('replace counts no duplicates', wipe.duplicates, 0);
eq('replace brings the profile', wipe.profile?.weightKg, 82.4);
ok('the destructive part is stated up front', describePlanNotes(wipe).startsWith('Everything currently on this device is deleted first.'));

/* ── Saved-meal limit on a merge ───────────────────────────────── */

const manyMeals = Array.from({ length: SAVED_MEAL_LIMIT + 5 }, (_, i) => ({
  ...savedMeal,
  id: i + 1,
  name: `Meal ${i}`,
  createdAt: `2026-09-0${(i % 9) + 1}T08:00:00.000Z`,
}));
const packed = parseBackup(JSON.stringify({ ...backup, savedMeals: manyMeals }));
if (packed.ok) {
  const mergePlan = planRestore(packed.bundle, undefined, 'merge');
  eq('a merge cannot exceed the saved-meal limit', mergePlan.savedMeals.length, SAVED_MEAL_LIMIT);
  ok('the overflow is reported', mergePlan.notes.some((n) => n.includes('left out')));
}

/* ── Copy ──────────────────────────────────────────────────────── */

const addPlan = planRestore(roundTrip.bundle, undefined, 'merge');
eq('merge describes what it will add', describePlan(addPlan), 'Adds 1 meal, 1 weigh-in, 1 water entry, 1 workout, 1 saved meal.');
eq('replace describes what it will do', describePlan(wipe), 'Replaces everything on this device with 1 meal, 1 weigh-in, 1 water entry, 1 workout, 1 saved meal.');
eq('the result reads as a result', describeRestored(addPlan), 'Added 1 meal, 1 weigh-in, 1 water entry, 1 workout, 1 saved meal.');
eq('nothing to do says so plainly', describePlan(second), 'Everything in this backup is already on this device.');
eq('…and so does the result', describeRestored(second), 'Nothing needed restoring — this device was already up to date.');
eq('the backup date is human', formatExportedAt('2026-09-12T10:00:00.000Z').endsWith('2026'), true);
eq('a broken date is not faked', formatExportedAt('nonsense'), 'an unknown date');

/* ── Drift guards ──────────────────────────────────────────────── */

eq('mirrored schema still matches the exporter', EXPORT_SCHEMA, 'calibreat.export.v1');
ok(
  'mirrored meal slots still match diary.ts',
  parseBackup(JSON.stringify({ ...backup, logEntries: [{ ...logEntry, meal: MEAL_SLOTS[0].value }] })).ok,
);
eq('mirrored saved-meal limit still matches saved-meals.ts', SAVED_MEAL_LIMIT, 30);
eq('mirrored saved-meal item cap still matches saved-meals.ts', SAVED_MEAL_MAX_ITEMS, 25);
ok(
  'mirrored day-key format still matches dates.ts',
  localDayKey(new Date(2026, 8, 12)) === '2026-09-12',
);

console.log(fails === 0 ? '\nAll restore checks passed.' : `\n${fails} restore check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
