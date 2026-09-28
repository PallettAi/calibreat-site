/**
 * Accuracy checks for Open Food Facts → log-entry mapping (npm run check:barcode).
 */
import { lookupBarcode, parseOffProduct, scaleFood } from '../src/lib/barcode.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want) || (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const missing = parseOffProduct({ status: 0, code: '000' });
eq('missing product is null', missing, null);

const per100 = parseOffProduct({
  status: 1,
  code: '5000112637922',
  product: {
    product_name: 'Baked beans',
    brands: 'Heinz',
    nutriments: {
      'energy-kcal_100g': 81,
      proteins_100g: 4.7,
      carbohydrates_100g: 12.9,
      fat_100g: 0.4,
      fiber_100g: 3.7,
      sugars_100g: 4.8,
      'saturated-fat_100g': 0.1,
      salt_100g: 1.0,
    },
  },
});
eq('100g uses product name', per100?.name, 'Heinz Baked beans');
eq('100g kcal', per100?.kcal, 81);
eq('100g protein', per100?.proteinG, 5);
eq('100g carbs', per100?.carbsG, 13);
eq('100g fat', per100?.fatG, 0);
eq('100g fiber', per100?.fiberG, 4);
eq('100g sugar', per100?.sugarG, 5);
eq('100g sat fat', per100?.satFatG, 0);
eq('100g sodium mg from salt', per100?.sodiumMg, 400);
eq('100g portion label', per100?.portionLabel, '100 g');

const serving = parseOffProduct({
  status: 1,
  code: '5010032094848',
  product: {
    product_name: 'Greek yogurt',
    brands: '',
    serving_size: '150 g',
    nutriments: {
      'energy-kcal_100g': 97,
      'energy-kcal_serving': 146,
      proteins_100g: 9,
      proteins_serving: 13.5,
      carbohydrates_100g: 4.8,
      carbohydrates_serving: 7.2,
      fat_100g: 5,
      fat_serving: 7.5,
      fiber_serving: 0,
      sugars_serving: 7.2,
      'saturated-fat_serving': 4.8,
      sodium_serving: 0.06,
    },
  },
});
eq('serving preferred over 100g', serving?.kcal, 146);
eq('serving protein', serving?.proteinG, 14);
eq('serving fiber', serving?.fiberG, 0);
eq('serving sugar', serving?.sugarG, 7);
eq('serving sat fat', serving?.satFatG, 5);
eq('serving sodium mg', serving?.sodiumMg, 60);
eq('serving portion label', serving?.portionLabel, '150 g');
eq('name without empty brand', serving?.name, 'Greek yogurt');

const kjOnly = parseOffProduct({
  status: 1,
  code: '1',
  product: {
    product_name: 'Plain rice',
    nutriments: {
      energy_100g: 1464,
      proteins_100g: 7,
      carbohydrates_100g: 78,
      fat_100g: 0.6,
    },
  },
});
eq('kJ converted to kcal', kjOnly?.kcal, 350);

/* Offline vs. genuinely-unlabelled. These drive the real `fetch` through a
 * stub, because the whole point is what happens when the request never lands. */

const realFetch = globalThis.fetch;
const jsonOk = (payload) => ({ ok: true, status: 200, json: async () => payload });
const httpSays = (status) => ({ ok: false, status, json: async () => ({}) });
const goesDark = () => {
  throw new TypeError('Network request failed');
};
const stubFetch = (handler) => {
  globalThis.fetch = async (url) => handler(String(url));
};

const MISS = '11111111';
stubFetch(() => httpSays(404));
eq('two mirrors both answering 404 is a missing product', (await lookupBarcode(MISS)).status, 'not-found');

let missCalls = 0;
stubFetch(() => {
  missCalls += 1;
  return httpSays(404);
});
eq('an answered miss is served from cache on re-scan', (await lookupBarcode(MISS)).status, 'not-found');
eq('...and costs no further requests', missCalls, 0);

// One mirror down is not a dead lookup: the other deployment still answers.
const HALF = '22222222';
stubFetch((url) => (url.includes('uk.openfoodfacts') ? goesDark() : httpSays(404)));
eq('one dead mirror, one answering 404, is still a missing product', (await lookupBarcode(HALF)).status, 'not-found');

const DARK = '33333333';
stubFetch(goesDark);
eq('no connection at all is not a missing product', (await lookupBarcode(DARK)).status, 'unreachable');

// The regression this all exists for: a pack first seen in a tunnel must not
// stay unscannable for the length of the negative-cache window.
const TUNNEL = '44444444';
stubFetch(goesDark);
eq('scanning offline reports unreachable', (await lookupBarcode(TUNNEL)).status, 'unreachable');
let backCalls = 0;
stubFetch((url) => {
  backCalls += 1;
  if (url.includes('uk.openfoodfacts')) return goesDark();
  return jsonOk({
    status: 1,
    code: TUNNEL,
    product: { product_name: 'Tunnelled crisps', brands: '', nutriments: { 'energy-kcal_100g': 42 } },
  });
});
const recovered = await lookupBarcode(TUNNEL);
eq('a pack missed while offline is not negatively cached', backCalls > 0, true);
eq('...so the very next scan actually asks again', recovered.status, 'found');
eq('...and gets the pack', recovered.food?.kcal, 42);

stubFetch(() => httpSays(404));
eq('a short code is rejected without touching the network', (await lookupBarcode('123')).status, 'not-found');

globalThis.fetch = realFetch;

eq('serving base unit', serving?.portion, 'serving');
eq('serving grams parsed', serving?.servingGrams, 150);
eq('100g base unit', per100?.portion, '100g');

const oneHalf = scaleFood(serving, 1.5);
eq('1.5× serving kcal', oneHalf?.kcal, 219);
eq('1.5× serving protein', oneHalf?.proteinG, 21);
eq('1.5× serving amount label', oneHalf?.amountLabel, '1.5× serving (150 g)');

const fiftyGrams = scaleFood(per100, 50);
eq('50 g of 100g item kcal', fiftyGrams?.kcal, 41);
eq('50 g of 100g item protein', fiftyGrams?.proteinG, 3);
eq('50 g of 100g item fiber', fiftyGrams?.fiberG, 2);
eq('50 g of 100g item sodium', fiftyGrams?.sodiumMg, 200);
eq('50 g amount label', fiftyGrams?.amountLabel, '50 g');

eq('zero amount does not lock', scaleFood(per100, 0), null);
eq('negative amount does not lock', scaleFood(serving, -1), null);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
