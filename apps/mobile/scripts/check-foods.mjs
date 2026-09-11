/**
 * Name-search ranking and OFF-down fallback (npm run check:foods).
 */
import {
  cofidToFood,
  mergeFoodSearch,
  parseCofidNumber,
  searchCofid,
  searchFoods,
} from '../src/lib/food-search.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq('Tr is zero', parseCofidNumber('Tr'), 0);
eq('N is missing', parseCofidNumber('N'), null);
eq('blank is missing', parseCofidNumber(''), null);
eq('kcal parses', parseCofidNumber('151'), 151);
eq('grams round', parseCofidNumber('2.9'), 3);

const catalog = [
  { code: '18-001', name: 'Chicken, roast', kcal: 177, proteinG: 27, carbsG: 0, fatG: 7, fiberG: 0, sugarG: 0, satFatG: 2, sodiumMg: 80 },
  { code: '18-002', name: 'Chicken soup, cream of, canned', kcal: 58, proteinG: 2, carbsG: 5, fatG: 3, fiberG: 0, sugarG: 1, satFatG: 1, sodiumMg: 400 },
  { code: '11-001', name: 'Rice, brown, boiled', kcal: 141, proteinG: 3, carbsG: 32, fatG: 1, fiberG: 1, sugarG: 0, satFatG: 0, sodiumMg: 1 },
  { code: '11-002', name: 'Rice pudding, canned', kcal: 89, proteinG: 3, carbsG: 16, fatG: 2, fiberG: 0, sugarG: 9, satFatG: 1, sodiumMg: 40 },
  { code: '13-001', name: 'Price Mark apples, eating, raw', kcal: 47, proteinG: 1, carbsG: 12, fatG: 0, fiberG: 2, sugarG: 12, satFatG: 0, sodiumMg: 1 },
];

eq('short query is empty', searchCofid('c', catalog).map((f) => f.name), []);

const chicken = searchCofid('chicken', catalog).map((f) => f.name);
eq('chicken prefix before soup', chicken[0], 'Chicken, roast');
eq('chicken includes soup', chicken.includes('Chicken soup, cream of, canned'), true);

const rice = searchCofid('rice', catalog).map((f) => f.name);
eq('rice whole-word matches boiled rice', rice.includes('Rice, brown, boiled'), true);
eq('rice does not match Price Mark apples', rice.includes('Price Mark apples, eating, raw'), false);

const roast = searchCofid('chicken', catalog)[0];
eq('cofid portion is 100 g', roast?.portion, '100g');
eq('cofid source label', roast?.source, 'cofid');
eq('cofid kcal', roast?.kcal, 177);
eq('cofid barcode is the food code', roast?.barcode, 'cofid:18-001');

const asFood = cofidToFood(catalog[2]);
eq('brown rice carbs', asFood.carbsG, 32);

const remote = [
  {
    barcode: '5000112637922',
    name: 'Heinz Baked beans',
    kcal: 81,
    proteinG: 5,
    carbsG: 13,
    fatG: 0,
    fiberG: 4,
    sugarG: 5,
    satFatG: 0,
    sodiumMg: 400,
    portionLabel: '100 g',
    portion: '100g',
    servingGrams: 100,
    source: 'off',
  },
];

const merged = mergeFoodSearch(searchCofid('chicken', catalog), remote);
eq('local foods sit above packs', merged.hits[0].source, 'cofid');
eq('packs follow local hits', merged.hits.at(-1)?.source, 'off');
eq('packs did load', merged.packsFailed, false);

const offline = mergeFoodSearch(searchCofid('chicken', catalog), null);
eq('offline still returns chicken', offline.hits[0]?.name, 'Chicken, roast');
eq('offline marks packs failed', offline.packsFailed, true);

const emptyOffline = mergeFoodSearch([], null);
eq('offline with no local hits stays empty', emptyOffline.hits.length, 0);
eq('offline empty still marks packs failed', emptyOffline.packsFailed, true);

const reachedEmpty = mergeFoodSearch([], []);
eq('online miss is not a connection failure', reachedEmpty.packsFailed, false);

const many = Array.from({ length: 30 }, (_, i) => cofidToFood({ ...catalog[0], code: `x-${i}`, name: `Chicken cut ${i}` }));
eq('merged list caps at 20', mergeFoodSearch(many, remote).hits.length, 20);

const down = await searchFoods('chicken', {
  catalog,
  lookup: async () => null,
});
eq('searchFoods keeps CoFID when OFF is down', down.hits[0]?.name, 'Chicken, roast');
eq('searchFoods does not throw when OFF is down', down.packsFailed, true);

let threw = false;
try {
  await searchFoods('zzzzzz', { catalog, lookup: async () => null });
} catch {
  threw = true;
}
eq('searchFoods does not throw on a miss when OFF is down', threw, false);
eq(
  'unreachable OFF with no local hits still reports packs failed',
  (await searchFoods('zzzzzz', { catalog, lookup: async () => null })).packsFailed,
  true,
);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
