/**
 * Accuracy checks for calibrEAT meal-log math (run: npm run check:diary).
 *
 * Verifies the real implementation (src/lib/diary.ts) — day totals, recents,
 * meal grouping, and migrating old kcal-only intake rows into log entries.
 */
import {
  groupLogsByMeal,
  migrateIntakeToLogs,
  parseOptionalGrams,
  parseRequiredKcal,
  recentsFromLogs,
  sumDayMacros,
} from '../src/lib/diary.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want) || (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const empty = sumDayMacros([]);
eq('empty day kcal', empty.kcal, 0);
eq('empty day protein', empty.proteinG, 0);
eq('empty day carbs', empty.carbsG, 0);
eq('empty day fat', empty.fatG, 0);

const mixed = sumDayMacros([
  { kcal: 400, proteinG: null, carbsG: null, fatG: null },
  { kcal: 520, proteinG: 40, carbsG: 30, fatG: 12 },
  { kcal: 180, proteinG: 8, carbsG: 22, fatG: 4 },
]);
eq('kcal always sums, including unnamed quick-add', mixed.kcal, 1100);
eq('protein ignores null macros', mixed.proteinG, 48);
eq('carbs ignores null macros', mixed.carbsG, 52);
eq('fat ignores null macros', mixed.fatG, 16);

const withMicros = sumDayMacros([
  { kcal: 400, proteinG: 10, carbsG: 20, fatG: 8, fiberG: 5, sugarG: 12, satFatG: 3, sodiumMg: 400 },
  { kcal: 200, proteinG: 8, carbsG: 10, fatG: 4, fiberG: null, sugarG: 4, satFatG: null, sodiumMg: 200 },
]);
eq('fiber ignores null', withMicros.fiberG, 5);
eq('sugar sums when present', withMicros.sugarG, 16);
eq('sat fat ignores null', withMicros.satFatG, 3);
eq('sodium sums when present', withMicros.sodiumMg, 600);

const recents = recentsFromLogs(
  [
    { id: 1, dayKey: '2026-09-01', meal: 'breakfast', name: null, kcal: 300, proteinG: null, carbsG: null, fatG: null, loggedAt: '2026-09-01T08:00:00.000Z' },
    { id: 2, dayKey: '2026-09-02', meal: 'lunch', name: 'Chicken rice', kcal: 520, proteinG: 40, carbsG: 50, fatG: 12, loggedAt: '2026-09-02T12:00:00.000Z' },
    { id: 3, dayKey: '2026-09-03', meal: 'lunch', name: 'chicken rice', kcal: 540, proteinG: 42, carbsG: 48, fatG: 14, loggedAt: '2026-09-03T12:30:00.000Z' },
    { id: 4, dayKey: '2026-09-03', meal: 'snack', name: 'Greek yogurt', kcal: 180, proteinG: 18, carbsG: 12, fatG: 5, loggedAt: '2026-09-03T16:00:00.000Z' },
  ],
  8,
);
eq('recents skip unnamed quick-adds', recents.length, 2);
eq('recents keep most recent spelling', recents[0]?.name, 'Greek yogurt');
eq('recents dedupe by case-insensitive name', recents[1]?.name, 'chicken rice');
eq('recents snapshot latest macros', recents[1]?.kcal, 540);

const grouped = groupLogsByMeal([
  { id: 1, dayKey: '2026-09-09', meal: 'breakfast', name: 'Oats', kcal: 300, proteinG: 10, carbsG: 45, fatG: 6, loggedAt: '2026-09-09T08:00:00.000Z' },
  { id: 2, dayKey: '2026-09-09', meal: 'snack', name: null, kcal: 150, proteinG: null, carbsG: null, fatG: null, loggedAt: '2026-09-09T11:00:00.000Z' },
  { id: 3, dayKey: '2026-09-09', meal: 'breakfast', name: 'Eggs', kcal: 180, proteinG: 14, carbsG: 1, fatG: 12, loggedAt: '2026-09-09T08:10:00.000Z' },
]);
eq('group breakfast count', grouped.breakfast.length, 2);
eq('group lunch empty', grouped.lunch.length, 0);
eq('group snack count', grouped.snack.length, 1);

const migrated = migrateIntakeToLogs([
  { dayKey: '2026-09-01', kcal: 2100, loggedAt: '2026-09-01T21:00:00.000Z' },
  { dayKey: '2026-09-02', kcal: 0, loggedAt: '2026-09-02T21:00:00.000Z' },
]);
eq('migrate keeps positive kcal rows', migrated.length, 1);
eq('migrate kcal', migrated[0]?.kcal, 2100);
eq('migrate unnamed', migrated[0]?.name, null);
eq('migrate meal defaults to snack', migrated[0]?.meal, 'snack');
eq('migrate macros unset', migrated[0]?.proteinG, null);

eq('required kcal rejects empty', parseRequiredKcal(''), null);
eq('required kcal rejects zero', parseRequiredKcal('0'), null);
eq('required kcal rounds', parseRequiredKcal('199.6'), 200);
eq('optional grams empty is unset', parseOptionalGrams(''), null);
eq('optional grams zero is filled', parseOptionalGrams('0'), 0);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
