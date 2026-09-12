/**
 * Checks for saved meals — the repeat-eater shortcut (run: npm run check:meals).
 *
 * Verifies the real implementation (src/lib/saved-meals.ts): name normalisation,
 * item extraction from real log entries, totals that ignore unknown macros, and
 * the re-log mapping that both storage implementations rely on.
 */
import {
  SAVED_MEAL_LIMIT,
  SAVED_MEAL_NAME_MAX,
  isValidMealName,
  mealItemsFromLogs,
  normalizeMealName,
  savedMealInputs,
  savedMealItemSummary,
  savedMealMeta,
  savedMealTotals,
} from '../src/lib/saved-meals.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

/* ── names ─────────────────────────────────────────────────────────── */

eq('trims and collapses whitespace', normalizeMealName('  Usual   breakfast  '), 'Usual breakfast');
eq('strips newlines from a pasted name', normalizeMealName('Usual\nbreakfast'), 'Usual breakfast');
eq('caps a long name', normalizeMealName('x'.repeat(120)).length, SAVED_MEAL_NAME_MAX);
eq('rejects one character', isValidMealName('a'), false);
eq('rejects whitespace-only', isValidMealName('   '), false);
eq('accepts a real name', isValidMealName('Usual breakfast'), true);
eq('accepts a two-character name', isValidMealName('AB'), true);

/* ── items from logs ───────────────────────────────────────────────── */

const logs = [
  {
    id: 1,
    dayKey: '2026-09-10',
    meal: 'breakfast',
    name: 'Porridge with berries',
    loggedAt: '2026-09-10T07:30:00.000Z',
    kcal: 341.6,
    proteinG: 13,
    carbsG: 58,
    fatG: 8,
    fiberG: 6,
    sugarG: 12,
    satFatG: 3,
    sodiumMg: 120,
  },
  {
    id: 2,
    dayKey: '2026-09-10',
    meal: 'breakfast',
    name: null,
    loggedAt: '2026-09-10T07:31:00.000Z',
    kcal: 80,
    proteinG: null,
    carbsG: null,
    fatG: null,
  },
];

const items = mealItemsFromLogs(logs);
eq('one item per log entry', items.length, 2);
eq('rounds kcal', items[0].kcal, 342);
eq('keeps the food name', items[0].name, 'Porridge with berries');
eq('drops the day key', 'dayKey' in items[0], false);
eq('drops the slot', 'meal' in items[0], false);
eq('drops the timestamp', 'loggedAt' in items[0], false);
eq('missing micros become null, not undefined', items[1].fiberG, null);
eq('keeps a null-but-known calorie add', items[1].name, null);

/* ── totals ────────────────────────────────────────────────────────── */

eq('empty totals', savedMealTotals([]), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
eq('kcals always sum, macros only when known', savedMealTotals(items), {
  kcal: 422,
  proteinG: 13,
  carbsG: 58,
  fatG: 8,
});

/* ── re-log mapping ────────────────────────────────────────────────── */

const inputs = savedMealInputs(items, '2026-09-12', 'lunch');
eq('one input per item', inputs.length, 2);
eq('stamps the target day', inputs[0].dayKey, '2026-09-12');
eq('stamps the chosen slot, not the saved one', inputs[0].meal, 'lunch');
eq('carries the food through', inputs[0].name, 'Porridge with berries');
eq('carries the nutrients through', [inputs[0].kcal, inputs[0].proteinG], [342, 13]);

/* ── descriptions ──────────────────────────────────────────────────── */

eq('single item reads as itself', savedMealItemSummary(items.slice(0, 1)), 'Porridge with berries');
eq('group reads as first plus the rest', savedMealItemSummary(items), 'Porridge with berries + 1 more');
eq('unnamed only', savedMealItemSummary([{ ...items[1] }]), '1 quick add');
eq(
  'mixed names and quick adds count the unnamed',
  savedMealItemSummary([items[0], items[1], { ...items[1] }]),
  'Porridge with berries + 2 more',
);
eq('empty is stated, not blank', savedMealItemSummary([]), 'Empty');
eq('meta counts and totals', savedMealMeta(items), '2 items · 422 kcal');
eq('meta pluralises one item', savedMealMeta(items.slice(0, 1)), '1 item · 342 kcal');

/* ── guards the UI needs ───────────────────────────────────────────── */

eq('a sane saved-meal cap exists', SAVED_MEAL_LIMIT > 0 && SAVED_MEAL_LIMIT <= 100, true);

console.log(fails === 0 ? 'ALL SAVED MEAL CHECKS PASSED' : `${fails} SAVED MEAL CHECKS FAILED`);
process.exit(fails === 0 ? 0 : 1);
