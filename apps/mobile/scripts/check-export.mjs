/**
 * Checks for data export — JSON backup + CSV diary (run: npm run check:export).
 *
 * Verifies the real implementation (src/lib/export.ts): the versioned bundle
 * shape, RFC-4180 CSV escaping, file naming, and the settings summary line.
 */
import {
  buildExportBundle,
  csvField,
  describeBundle,
  diaryCsv,
  exportFileName,
  EXPORT_SCHEMA,
} from '../src/lib/export.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

/* ── bundle assembly ─────────────────────────────────────────────── */

const baseInput = {
  profile: {
    sex: 'male',
    ageYears: 34,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'moderate',
    goal: 'lose',
    ratePerWeek: 0.5,
    supplements: ['Creatine'],
  },
  goals: { bmr: 1735, tdee: 2694, calorieTarget: 2194, proteinG: 165, carbsG: 220, fatG: 61 },
  logEntries: [],
  weighIns: [],
  water: [],
  workouts: [],
  savedMeals: [],
};

const bundle = buildExportBundle({ ...baseInput, exportedAt: '2026-09-12T10:00:00.000Z' });

eq('schema tag is versioned', bundle.schema, 'calibreat.export.v1');
eq('app marker', bundle.app, 'calibrEAT');
eq('exportedAt passed through', bundle.exportedAt, '2026-09-12T10:00:00.000Z');
eq('counts all zero when empty', bundle.counts, {
  logEntries: 0,
  weighIns: 0,
  water: 0,
  workouts: 0,
  savedMeals: 0,
});
eq('profile passed through', bundle.profile?.supplements, ['Creatine']);
eq('goals passed through', bundle.goals?.calorieTarget, 2194);

const populated = buildExportBundle({
  ...baseInput,
  exportedAt: '2026-09-12T10:00:00.000Z',
  logEntries: [
    {
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
    },
  ],
  weighIns: [{ id: 1, kg: 79.8, measuredAt: '2026-09-11T08:00:00.000Z', dayKey: '2026-09-11' }],
  water: [{ id: 1, dayKey: '2026-09-11', ml: 4000, loggedAt: '2026-09-11T09:00:00.000Z' }],
  workouts: [
    { id: 1, dayKey: '2026-09-11', exerciseId: 'squat', sets: 3, reps: 5, kcal: 180, loggedAt: '2026-09-11T18:00:00.000Z' },
  ],
  savedMeals: [
    {
      id: 1,
      name: 'Usual breakfast',
      meal: 'breakfast',
      items: [{ name: 'Porridge', kcal: 342, proteinG: 13, carbsG: 58, fatG: 8, fiberG: 6, sugarG: 12, satFatG: 3, sodiumMg: 120 }],
      createdAt: '2026-09-10T08:00:00.000Z',
    },
  ],
});

eq('counts reflect every table', populated.counts, {
  logEntries: 1,
  weighIns: 1,
  water: 1,
  workouts: 1,
  savedMeals: 1,
});

/* ── default timestamp ───────────────────────────────────────────── */

const live = buildExportBundle({ ...baseInput });
eq('exportedAt defaults to now', typeof live.exportedAt, 'string');

/* ── file naming ─────────────────────────────────────────────────── */

const stamp = new Date(2026, 8, 12); // local Sep 12 2026, month is 0-indexed
eq('backup name carries the date', exportFileName('backup', stamp), 'calibreat-backup-2026-09-12.json');
eq('diary name carries the date', exportFileName('diary', stamp), 'calibreat-diary-2026-09-12.csv');

/* ── CSV escaping (RFC 4180) ─────────────────────────────────────── */

eq('plain field passes through', csvField('Porridge'), 'Porridge');
eq('number passes through', csvField(342), '342');
eq('null becomes an empty cell', csvField(null), '');
eq('undefined becomes an empty cell', csvField(undefined), '');
eq('comma forces quotes', csvField('beans, toast'), '"beans, toast"');
eq('quote forces quotes and doubling', csvField('say "hi"'), '"say ""hi"""');
eq('newline forces quotes', csvField('two\nlines'), '"two\nlines"');
eq('cr is also quoted', csvField('two\rline'), '"two\rline"');

/* ── CSV body ────────────────────────────────────────────────────── */

const entry = populated.logEntries[0];
const csv = diaryCsv([entry]);
const rows = csv.split('\r\n').filter((line) => line.length > 0);

eq('header row first', rows[0], 'day,meal,name,kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sat_fat_g,sodium_mg,logged_at');
eq('one data row', rows.length, 2);
eq('data row matches the entry', rows[1], '2026-09-11,breakfast,Porridge,342,13,58,8,6,12,3,120,2026-09-11T07:30:00.000Z');

const csvNulls = diaryCsv([
  {
    id: 2,
    dayKey: '2026-09-12',
    meal: 'snack',
    name: null,
    kcal: 80,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    satFatG: null,
    sodiumMg: null,
    loggedAt: '2026-09-12T15:00:00.000Z',
  },
]);
eq('null name renders blank, not "null"', csvNulls.includes(',null,'), false);
eq('null row keeps its blank cells', csvNulls.split('\r\n')[1], '2026-09-12,snack,,80,,,,,,,,2026-09-12T15:00:00.000Z');

const csvEmpty = diaryCsv([]);
eq('empty diary is header only', csvEmpty, 'day,meal,name,kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sat_fat_g,sodium_mg,logged_at\r\n');

const csvQuoted = diaryCsv([
  {
    ...entry,
    id: 3,
    name: 'Beans, toast & "good" stuff',
  },
]);
eq('messy name survives a round trip', csvQuoted.split('\r\n')[1], '2026-09-11,breakfast,"Beans, toast & ""good"" stuff",342,13,58,8,6,12,3,120,2026-09-11T07:30:00.000Z');

/* ── settings summary line ───────────────────────────────────────── */

eq('summary lists meals, weigh-ins, water', describeBundle({ counts: { logEntries: 42, weighIns: 12, water: 90, workouts: 0, savedMeals: 0 } }), '42 meals · 12 weigh-ins · 90 water');
eq('summary adds workouts when present', describeBundle({ counts: { logEntries: 42, weighIns: 12, water: 90, workouts: 7, savedMeals: 0 } }), '42 meals · 12 weigh-ins · 90 water · 7 workouts');
eq('summary adds saved meals when present', describeBundle({ counts: { logEntries: 42, weighIns: 12, water: 90, workouts: 7, savedMeals: 4 } }), '42 meals · 12 weigh-ins · 90 water · 7 workouts · 4 saved');
eq('summary pluralises one meal', describeBundle({ counts: { logEntries: 1, weighIns: 0, water: 0, workouts: 0, savedMeals: 0 } }), '1 meal · 0 weigh-ins · 0 water');

console.log(fails === 0 ? 'ALL EXPORT CHECKS PASSED' : `${fails} EXPORT CHECKS FAILED`);
process.exit(fails === 0 ? 0 : 1);
