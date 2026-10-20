/**
 * Food-name glossary integrity (npm run check:food-names).
 * Every glossary key must be a real CoFID name, and every non-English
 * language must have a non-empty translation for it.
 */
import { readFileSync } from 'node:fs';

const { FOOD_NAMES, localiseFoodName } = await import('../src/i18n/foods.ts');
const { LOCALES } = await import('../src/i18n/locales.ts');

const bundle = JSON.parse(readFileSync(new URL('../src/data/cofid-foods.json', import.meta.url), 'utf8'));
const cofidNames = new Set(bundle.foods.map((food) => food.name));

let fails = 0;
const check = (ok, label) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

const keys = Object.keys(FOOD_NAMES);
const missing = keys.filter((name) => !cofidNames.has(name));
check(missing.length === 0, `every glossary key is a CoFID name${missing.length ? `: ${missing.join('; ')}` : ''}`);

const languages = LOCALES.filter((code) => code !== 'en');
const incomplete = keys.filter((name) => languages.some((code) => !FOOD_NAMES[name][code]?.trim()));
check(incomplete.length === 0, `every glossary key has all ${languages.length} translations${incomplete.length ? `: ${incomplete.join('; ')}` : ''}`);

check(localiseFoodName('Honey', 'en') === 'Honey', 'English keeps the CoFID name');
check(localiseFoodName('Honey', 'de') === 'Honig', 'German translates a glossary food');
check(localiseFoodName('Not a real food', 'de') === 'Not a real food', 'unknown food falls back to English');

console.log(`\n${keys.length} foods in glossary, ${fails === 0 ? 'all checks passed' : `${fails} failed`}`);
process.exit(fails === 0 ? 0 : 1);
