/**
 * Recipe import — paste a recipe URL, get per-serving nutrients.
 *
 * The reliable path is schema.org Recipe structured data (JSON-LD), the
 * block Google requires for recipe rich results; effectively every real
 * recipe site publishes it, with per-serving nutrition included. Scraping
 * arbitrary HTML prose is NOT dependable, so when structured data is
 * missing the importer reports that honestly instead of guessing.
 *
 * Pure module (checked by scripts/check-recipe.mjs): no React, no fetch.
 * The fetch lives in recipe-fetch.ts / recipe-fetch.web.ts (Metro resolves
 * one per platform, like db.ts / db.web.ts).
 */

export type ParsedRecipe = {
  name: string;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  /** Human portion label for the confirm card, e.g. "1 of 4 servings". */
  portionLabel: string;
  servings: number | null;
};

type Json = Record<string, unknown>;

const KJ_PER_KCAL = 4.184;

/** Collect every JSON-LD block from an HTML page (tolerant of junk). */
export function findRecipeJsonLd(html: string): object | null {
  if (!html || html.length < 20) return null;
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const parsed = tryParseJsonLd(match[1] ?? '');
    if (!parsed) continue;
    const recipe = findRecipeNode(parsed);
    if (recipe) return recipe;
  }
  return null;
}

function tryParseJsonLd(raw: string): unknown {
  const text = raw.trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Hand-rolled embeds often carry raw tabs/newlines inside string values
    // (invalid strict JSON) or stray control chars. Collapsing every control
    // character to a space fixes strings and is a no-op between tokens.
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')) as unknown;
    } catch {
      return null;
    }
  }
}

function findRecipeNode(node: unknown, depth = 0): object | null {
  if (depth > 4 || node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Json;
  if (nodeIsRecipe(obj)) return obj;
  // @graph arrays and wrapper objects both carry the recipe deeper in.
  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    const inner = obj[key];
    if (inner != null && typeof inner === 'object') {
      const found = findRecipeNode(inner, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function nodeIsRecipe(obj: Json): boolean {
  const type = obj['@type'];
  if (typeof type === 'string') return type.toLowerCase() === 'recipe';
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
  return false;
}

/** Extract the first 1–24 integer from a yield value ("Serves 4", 2, ["6"]). */
export function parseServings(raw: unknown): number | null {
  const candidates: unknown[] = Array.isArray(raw) ? raw : [raw];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 1 && c <= 24) return Math.round(c);
    if (typeof c === 'string') {
      const m = c.match(/(\d{1,2})/);
      const n = m ? Number(m[1]) : NaN;
      if (Number.isFinite(n) && n >= 1 && n <= 24) return n;
    }
  }
  return null;
}

/**
 * Schema nutrition value → number. Strings carry units: grams for nutrients,
 * "kcal"/"kJ" for energy, "mg"/"g" for sodium. Plain numbers are already in
 * schema base units (kcal / grams).
 */
function amountIn(raw: unknown, opts: { energy?: boolean; toMg?: boolean } = {}): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const m = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(k?j|mg|g|kcal|cal)?/i);
  if (!m) return null;
  let value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (opts.energy && (unit === 'kj' || unit === 'j')) value = value / KJ_PER_KCAL;
  if (opts.toMg && unit !== 'mg') value = value * 1000; // "2 g sodium" → 2000 mg
  return value;
}

function grams(raw: unknown): number | null {
  const v = amountIn(raw);
  return v == null ? null : Math.round(v);
}

/** Parse one schema.org Recipe node into the app's nutrient shape. */
export function parseRecipeJsonLd(payload: unknown): ParsedRecipe | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const recipe = payload as Json;
  const name = typeof recipe.name === 'string' ? recipe.name.trim() : '';
  if (!name) return null;
  const nutritionRaw = (recipe.nutrition ?? recipe.nutritionInformation) as Json | Json[] | undefined;
  const nutrition = Array.isArray(nutritionRaw) ? nutritionRaw[0] : nutritionRaw;
  if (nutrition == null || typeof nutrition !== 'object') return null;
  const n = nutrition as Json;
  const kcalRaw = amountIn(n.calories, { energy: true });
  if (kcalRaw == null || kcalRaw <= 0) return null;
  const sodiumRaw = amountIn(n.sodiumContent ?? n.sodium, { toMg: true });
  const servings = parseServings(recipe.recipeYield);
  return {
    name,
    kcal: Math.round(kcalRaw),
    proteinG: grams(n.proteinContent ?? n.protein),
    carbsG: grams(n.carbohydrateContent ?? n.carbohydrates),
    fatG: grams(n.fatContent ?? n.fat),
    fiberG: grams(n.fiberContent ?? n.fiber),
    sugarG: grams(n.sugarContent ?? n.sugars),
    satFatG: grams(n.saturatedFatContent ?? n.saturatedFat),
    sodiumMg: sodiumRaw == null ? null : Math.round(sodiumRaw),
    portionLabel: servings != null && servings !== 1 ? `1 of ${servings} servings` : '1 serving',
    servings,
  };
}

/** Full page HTML → recipe. Null when the page carries no usable Recipe JSON-LD. */
export function parseRecipeHtml(html: string): ParsedRecipe | null {
  const node = findRecipeJsonLd(html);
  if (!node) return null;
  return parseRecipeJsonLd(node);
}

/** Accept "bbcgoodfood.com/recipes/x" and full URLs; reject anything else. */
export function normaliseRecipeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}
