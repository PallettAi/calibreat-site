/**
 * Checks for nutrition-label parsing — the brain of photo-label logging
 * (run: npm run check:ocr).
 *
 * The fixtures below are modelled on real OCR output: corrupted letters,
 * swapped columns, wrapped values, "of which" sub-nutrients, salt vs sodium,
 * kJ-first energy, US "Nutrition Facts" panels. The parser
 * (src/lib/label-parse.ts) is pure, so CI can hammer it without a device.
 */
import {
  KJ_PER_KCAL,
  labelQualityNote,
  parseLabelText,
  SODIUM_MG_PER_GRAM_SALT,
} from '../src/lib/label-parse.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

/* ── constants ─────────────────────────────────────────────────────── */

eq('kJ per kcal constant', KJ_PER_KCAL, 4.184);
eq('salt→sodium constant', SODIUM_MG_PER_GRAM_SALT, 400);

/* ── clean UK panel ────────────────────────────────────────────────── */

const uk = parseLabelText(`Typical values
per 100g
Energy 1046 kJ / 251 kcal
Fat 8.2 g
of which saturates 2.1 g
Carbohydrate 30.4 g
of which sugars 4.5 g
Fibre 2.9 g
Protein 12.6 g
Salt 0.55 g`);

eq('UK basis is 100g', uk.basis, '100g');
eq('UK kcal from dual energy line', uk.kcal, 251);
eq('UK protein', uk.proteinG, 13);
eq('UK carbs', uk.carbsG, 30);
eq('UK sugars (of which)', uk.sugarG, 5);
eq('UK fat', uk.fatG, 8);
eq('UK saturates (of which)', uk.satFatG, 2);
eq('UK fibre', uk.fiberG, 3);
eq('UK salt converts to sodium mg', uk.sodiumMg, 220);
eq('UK quality ok', uk.quality, 'ok');

/* ── wrapped-value variant (kcal on its own line) ──────────────────── */

const ukWrapped = parseLabelText('Energy\n1046 kJ / 251 kcal\nProtein 12.6 g');
eq('wrapped kcal line parses', ukWrapped.kcal, 251);
eq('wrapped parser still gets protein', ukWrapped.proteinG, 13);

/* ── US Nutrition Facts ────────────────────────────────────────────── */

const us = parseLabelText(`Nutrition Facts
Serving size 1 cup (240ml)
Calories 120
Total Fat 5 g
Saturated Fat 1.5 g
Sodium 125 mg
Total Carbohydrate 18 g
Dietary Fiber 2 g
Total Sugars 9 g
Protein 3 g`);

eq('US basis is serving', us.basis, 'serving');
eq('US kcal', us.kcal, 120);
eq('US protein', us.proteinG, 3);
eq('US carbs', us.carbsG, 18);
eq('US sugars', us.sugarG, 9);
eq('US fat', us.fatG, 5);
eq('US saturates (1.5 rounds to 2)', us.satFatG, 2);
eq('US fiber (Dietary Fiber)', us.fiberG, 2);
eq('US sodium stays mg', us.sodiumMg, 125);

/* ── corrupted letters (de-digitise only fixes keywords, not values) ── */

const messy = parseLabelText(`Tvpical values
per 100g
Energy 836 kJ / 2O0 kcal
Pr0tein 31 g
Fat 3l g
Carbohydrate 0 g
Salt 0.2 g`);

eq('corrupt kcal "2O0" reads 200', messy.kcal, 200);
eq('corrupt "Pr0tein" still matches protein', messy.proteinG, 31);
eq('corrupt "3l g" reads 31', messy.fatG, 31);
eq('zero-carb line stays zero', messy.carbsG, 0);
eq('salt line converts', messy.sodiumMg, 80);
eq('messy quality ok', messy.quality, 'ok');

/* ── kJ-only panel (no kcal printed) ───────────────────────────────── */

const kjOnly = parseLabelText('Energy 1046 kJ\nProtein 12 g');
eq('kJ converts to kcal', kjOnly.kcal, Math.round(1046 / KJ_PER_KCAL));

/* ── trace values and separators ───────────────────────────────────── */

const trace = parseLabelText('Energy 350 kJ / 84 kcal\nFibre Tr\nSugars 1,046 mg');
eq('trace fibre is zero', trace.fiberG, 0);
eq('thousand separator handled', trace.sugarG, 1046);

/* ── sub-nutrient on the same line as its parent ───────────────────── */

const inline = parseLabelText('Energy 250 kcal\nFat 8.2 g of which saturates 2.1 g\nProtein 10 g');
eq('inline fat', inline.fatG, 8);
eq('inline saturates', inline.satFatG, 2);
eq('inline does not lose protein', inline.proteinG, 10);

/* ── partial and garbage ───────────────────────────────────────────── */

const partial = parseLabelText('Protein 12 g\nFat 3 g');
eq('macro-only reads partial', partial.quality, 'partial');
eq('macro-only has no kcal', partial.kcal, null);

const garbage = parseLabelText('BEST BEFORE 2027-01-01\nBatch 4471\nKeep refrigerated');
eq('non-label text reads none', garbage.quality, 'none');
eq('quality note for none mentions retry', /try again/i.test(labelQualityNote(garbage)), true);
eq('quality note for ok mentions 100 g', /100 g/.test(labelQualityNote(uk)), true);

/* ── empty input ───────────────────────────────────────────────────── */

const empty = parseLabelText('');
eq('empty is none', empty.quality, 'none');

console.log(fails === 0 ? 'ALL LABEL OCR CHECKS PASSED' : `${fails} LABEL OCR CHECKS FAILED`);
process.exit(fails === 0 ? 0 : 1);
