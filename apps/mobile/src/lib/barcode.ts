/**
 * Open Food Facts lookup for calibrEAT barcode logging.
 *
 * Parse is pure (checked by scripts/check-barcode.mjs). Network lives in
 * lookupBarcode — UK endpoint first, world fallback. Successful hits are
 * cached for the session; misses are not, so a later retry can succeed.
 */

export type OffPortion = 'serving' | '100g';

export type FoodSource = 'cofid' | 'off';

export type OffFood = {
  barcode: string;
  name: string;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  portionLabel: string;
  portion: OffPortion;
  servingGrams: number | null;
  source: FoodSource;
};

export type ScaledFood = {
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  amountLabel: string;
};

type OffNutriments = Record<string, number | string | undefined>;

type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: OffNutriments;
};

export type OffResponse = {
  status: number;
  code?: string;
  product?: OffProduct;
};

const KJ_PER_KCAL = 4.184;

function num(raw: number | string | undefined): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundGrams(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value);
}

function kcalFromNutriments(n: OffNutriments, serving: boolean): number | null {
  const suffix = serving ? '_serving' : '_100g';
  const direct = num(n[`energy-kcal${suffix}`]) ?? num(n[serving ? 'energy-kcal_serving' : 'energy-kcal_100g']);
  if (direct != null && direct > 0) return Math.round(direct);
  const genericKcal = !serving ? num(n['energy-kcal']) : null;
  if (genericKcal != null && genericKcal > 0) return Math.round(genericKcal);
  const kj = num(n[`energy${suffix}`]) ?? (!serving ? num(n.energy) : null);
  if (kj != null && kj > 0) return Math.round(kj / KJ_PER_KCAL);
  return null;
}

function displayName(product: OffProduct): string {
  const name = (product.product_name || product.product_name_en || '').trim();
  const brand = (product.brands || '').split(',')[0]?.trim() ?? '';
  if (!name) return brand || 'Packaged food';
  if (!brand) return name;
  if (name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

function hasServing(n: OffNutriments): boolean {
  return kcalFromNutriments(n, true) != null;
}

export function parseServingGrams(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (!match) return null;
  const grams = Number(match[1]);
  return Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null;
}

function scaleMacro(value: number | null, factor: number): number | null {
  if (value == null) return null;
  return Math.round(value * factor);
}

function gramsAt(n: OffNutriments, key: string, suffix: string): number | null {
  return roundGrams(num(n[`${key}${suffix}`]));
}

/** Sodium in mg. OFF stores sodium/salt in grams; salt_g × 400 ≈ sodium mg. */
function sodiumMgAt(n: OffNutriments, suffix: string): number | null {
  const sodiumG = num(n[`sodium${suffix}`]);
  if (sodiumG != null && sodiumG >= 0) return Math.round(sodiumG * 1000);
  const saltG = num(n[`salt${suffix}`]);
  if (saltG != null && saltG >= 0) return Math.round(saltG * 400);
  return null;
}

function extrasAt(n: OffNutriments, suffix: string) {
  return {
    fiberG: gramsAt(n, 'fiber', suffix) ?? gramsAt(n, 'fibre', suffix),
    sugarG: gramsAt(n, 'sugars', suffix),
    satFatG: gramsAt(n, 'saturated-fat', suffix),
    sodiumMg: sodiumMgAt(n, suffix),
  };
}

function scaleMacros(
  food: Pick<OffFood, 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'sugarG' | 'satFatG' | 'sodiumMg'>,
  factor: number,
) {
  return {
    proteinG: scaleMacro(food.proteinG, factor),
    carbsG: scaleMacro(food.carbsG, factor),
    fatG: scaleMacro(food.fatG, factor),
    fiberG: scaleMacro(food.fiberG, factor),
    sugarG: scaleMacro(food.sugarG, factor),
    satFatG: scaleMacro(food.satFatG, factor),
    sodiumMg: scaleMacro(food.sodiumMg, factor),
  };
}

/** Scale a parsed OFF item. Serving foods take a multiplier; 100 g foods take grams. */
export function scaleFood(food: OffFood | null | undefined, amount: number): ScaledFood | null {
  if (!food || !Number.isFinite(amount) || amount <= 0) return null;
  if (food.portion === 'serving') {
    return {
      kcal: Math.round(food.kcal * amount),
      ...scaleMacros(food, amount),
      amountLabel: `${trimAmount(amount)}× serving (${food.portionLabel})`,
    };
  }
  const factor = amount / 100;
  return {
    kcal: Math.round(food.kcal * factor),
    ...scaleMacros(food, factor),
    amountLabel: `${trimAmount(amount)} g`,
  };
}

function trimAmount(amount: number): string {
  return String(Number(amount.toFixed(2)));
}

export function defaultAmount(food: OffFood): number {
  return food.portion === 'serving' ? 1 : 100;
}

/** Map an OFF API payload to a single log-sized portion (serving if present, else 100 g). */
export function parseOffProduct(payload: OffResponse, barcode = payload.code ?? ''): OffFood | null {
  if (payload.status !== 1 || !payload.product) return null;
  const n = payload.product.nutriments ?? {};
  const serving = hasServing(n);
  const kcal = kcalFromNutriments(n, serving);
  if (kcal == null || kcal <= 0) return null;
  const suffix = serving ? '_serving' : '_100g';
  const protein = roundGrams(num(n[`proteins${suffix}`]));
  const carbs = roundGrams(num(n[`carbohydrates${suffix}`]));
  const fat = roundGrams(num(n[`fat${suffix}`]));
  const extras = extrasAt(n, suffix);
  const servingSize = serving ? (payload.product.serving_size?.trim() || '1 serving') : '100 g';
  return {
    barcode: String(barcode || payload.code || ''),
    name: displayName(payload.product),
    kcal,
    proteinG: protein,
    carbsG: carbs,
    fatG: fat,
    ...extras,
    portionLabel: servingSize,
    portion: serving ? 'serving' : '100g',
    servingGrams: serving ? parseServingGrams(payload.product.serving_size) : 100,
    source: 'off',
  };
}

export function parseOffSearchProducts(products: OffProduct[], codes: Array<string | undefined> = []): OffFood[] {
  const out: OffFood[] = [];
  for (let i = 0; i < products.length; i += 1) {
    const product = products[i];
    if (!product) continue;
    const parsed = parseOffProduct({ status: 1, product, code: codes[i] ?? '' }, codes[i] ?? '');
    if (parsed) out.push(parsed);
  }
  return out;
}

export function normaliseBarcode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Hits stay in the session cache; misses must not, so a later retry can succeed. */
export function shouldRememberLookup(food: OffFood | null): boolean {
  return food != null;
}

const OFF_UA = 'calibrEAT/0.0.3 (https://calibreat.app)';
const LOOKUP_TIMEOUT_MS = 8000;
const cache = new Map<string, OffFood>();

function offHeaders(): Record<string, string> {
  const native =
    typeof navigator === 'undefined' ||
    (navigator as { product?: string }).product === 'ReactNative';
  // Browsers forbid User-Agent. Setting it (or any extra header) can trip a
  // CORS preflight; OFF 503 pages have no CORS headers, so search then dies.
  if (!native) return {};
  return { 'User-Agent': OFF_UA, Accept: 'application/json' };
}

export async function fetchOpenFoodFacts(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: offHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOff(url: string): Promise<unknown | null> {
  return fetchOpenFoodFacts(url);
}

/** Look up a barcode. Successful hits are cached for the session. */
export async function lookupBarcode(raw: string): Promise<OffFood | null> {
  const code = normaliseBarcode(raw);
  if (code.length < 8) return null;
  if (cache.has(code)) return cache.get(code) ?? null;
  const uk = await fetchOff(`https://uk.openfoodfacts.org/api/v2/product/${code}.json`);
  let parsed = uk ? parseOffProduct(uk as OffResponse, code) : null;
  if (!parsed) {
    const world = await fetchOff(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    parsed = world ? parseOffProduct(world as OffResponse, code) : null;
  }
  if (shouldRememberLookup(parsed) && parsed) cache.set(code, parsed);
  return parsed;
}

export type OffSearchHit = OffProduct & { code?: string; _id?: string };

export type OffSearchResponse = {
  products?: OffSearchHit[];
};

export function parseSearchPayload(payload: OffSearchResponse | null | unknown): OffFood[] {
  const products = (payload as OffSearchResponse | null)?.products;
  if (!products?.length) return [];
  return parseOffSearchProducts(
    products,
    products.map((p) => p.code || p._id),
  );
}
