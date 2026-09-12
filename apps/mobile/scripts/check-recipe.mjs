/**
 * Accuracy checks for recipe JSON-LD parsing (npm run check:recipe).
 */
import {
  findRecipeJsonLd,
  normaliseRecipeUrl,
  parseRecipeHtml,
  parseRecipeJsonLd,
  parseServings,
} from '../src/lib/recipe-parse.ts';

let fails = 0;
const eq = (label, got, want) => {
  const same =
    Object.is(got, want) ||
    (typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) < 0.01) ||
    (typeof got === 'object' && got !== null && JSON.stringify(got) === JSON.stringify(want));
  if (!same) fails++;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

// ── Full BBC-Good-Food-style page ──────────────────────────────────────
const bbcHtml = `<!DOCTYPE html>
<html><head>
<title>Chicken & chorizo jambalaya recipe | BBC Good Food</title>
<script>window.__PRELOADED__ = {"not":"ld+json"};</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Chicken & chorizo jambalaya",
 "recipeYield":"Serves 4","nutrition":{"@type":"NutritionInformation","calories":"646 kcal",
 "proteinContent":"44 g","carbohydrateContent":"52 g","fatContent":"26 g","fiberContent":"6 g",
 "sugarContent":"7.2 g","saturatedFatContent":"9.1 g","sodiumContent":"1.4 g"}}
</script>
</head><body>…</body></html>`;
const bbc = parseRecipeHtml(bbcHtml);
eq('bbc name', bbc?.name, 'Chicken & chorizo jambalaya');
eq('bbc kcal', bbc?.kcal, 646);
eq('bbc protein', bbc?.proteinG, 44);
eq('bbc carbs', bbc?.carbsG, 52);
eq('bbc fat', bbc?.fatG, 26);
eq('bbc fiber', bbc?.fiberG, 6);
eq('bbc sugar', bbc?.sugarG, 7);
eq('bbc sat fat', bbc?.satFatG, 9);
eq('bbc sodium g→mg', bbc?.sodiumMg, 1400);
eq('bbc portion label', bbc?.portionLabel, '1 of 4 servings');
eq('bbc servings', bbc?.servings, 4);

// ── @graph wrapper (Allrecipes-style), kJ energy, numeric yield ────────
const graphHtml = `<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebPage","name":"Some page"},
 {"@type":"Recipe","name":"Slow cooker chilli","recipeYield":6,
  "nutrition":{"calories":"2658 kJ","carbohydrateContent":"38","fatContent":"14","proteinContent":"31"}}]}
</script>`;
const graph = parseRecipeHtml(graphHtml);
eq('graph finds recipe', graph?.name, 'Slow cooker chilli');
eq('graph kJ→kcal', graph?.kcal, 635);
eq('graph numeric macros', [graph?.proteinG, graph?.carbsG, graph?.fatG], [31, 38, 14]);
eq('graph servings', graph?.servings, 6);
eq('graph portion label', graph?.portionLabel, '1 of 6 servings');

// ── @type as array, nested nutritionInformation key ────────────────────
const typed = parseRecipeJsonLd({
  '@type': ['Thing', 'Recipe'],
  name: 'Type-array recipe',
  nutritionInformation: { calories: 500, sodiumContent: '300 mg' },
});
eq('type array matches', typed?.name, 'Type-array recipe');
eq('numeric calories', typed?.kcal, 500);
eq('mg sodium stays mg', typed?.sodiumMg, 300);

// ── Single-serving yield ───────────────────────────────────────────────
const single = parseRecipeJsonLd({
  '@type': 'Recipe', name: 'Solo', recipeYield: '1 serving',
  nutrition: { calories: '450 kcal' },
});
eq('single serving label', single?.portionLabel, '1 serving');

// ── parseServings edge cases ───────────────────────────────────────────
eq('servings "Serves 4"', parseServings('Serves 4'), 4);
eq('servings array', parseServings(['6 servings']), 6);
eq('servings number', parseServings(2), 2);
eq('servings "Makes 12"', parseServings('Makes 12'), 12);
eq('servings junk → null', parseServings('a lot'), null);
eq('servings 0 → null', parseServings(0), null);
eq('servings 30 → null', parseServings(30), null);

// ── Corruption tolerance: CDATA, control chars, whitespace ────────────
const cdata = findRecipeJsonLd(
  `<script type="application/ld+json"><![CDATA[{"@type":"Recipe","name":"CDATA one","nutrition":{"calories":"100 kcal"}}]]></script>`,
);
eq('CDATA wrapper tolerated', cdata?.name, 'CDATA one');
const ctrl = findRecipeJsonLd(
  `<script type="application/ld+json">{"@type":"Recipe","name":"Tabbed name","nutrition":{"calories":"100\tkcal"}}\u0002</script>`,
);
eq('control chars stripped', ctrl?.name, 'Tabbed name');

// ── Honest failure: no structured data → null ─────────────────────────
eq('prose page → null', parseRecipeHtml('<html><body>My grandma’s recipe, tastes great</body></html>'), null);
eq('empty html → null', parseRecipeHtml(''), null);
eq('ld+json but no Recipe → null', parseRecipeHtml('<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>'), null);
eq('recipe without nutrition → null', parseRecipeJsonLd({ '@type': 'Recipe', name: 'No macros' }), null);
eq('recipe without name → null', parseRecipeJsonLd({ '@type': 'Recipe', nutrition: { calories: 100 } }), null);
eq('zero calories → null', parseRecipeJsonLd({ '@type': 'Recipe', name: 'X', nutrition: { calories: 0 } }), null);
eq('non-object payload → null', parseRecipeJsonLd('nope'), null);
eq('array payload → null', parseRecipeJsonLd([{ '@type': 'Recipe' }]), null);

// ── URL normalisation ─────────────────────────────────────────────────
eq('bare domain gains https', normaliseRecipeUrl('bbcgoodfood.com/recipes/x'), 'https://bbcgoodfood.com/recipes/x');
eq('full url unchanged', normaliseRecipeUrl('https://www.bbcgoodfood.com/recipes/1/'), 'https://www.bbcgoodfood.com/recipes/1/');
eq('http allowed', normaliseRecipeUrl('http://example.com/r'), 'http://example.com/r');
eq('spaces rejected', normaliseRecipeUrl('not a url'), null);
eq('no dot in host rejected', normaliseRecipeUrl('https://localhost/r'), null);
eq('empty rejected', normaliseRecipeUrl('   '), null);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
