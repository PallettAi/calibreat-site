/**
 * Open Food Facts lookup for calibrEAT barcode logging.
 *
 * Parse is pure (checked by scripts/check-barcode.mjs). Network lives in
 * lookupBarcode — UK endpoint first, world fallback. Successful hits are
 * cached for the session; a genuine miss is negatively cached for five
 * minutes so a quick re-scan of the same pack doesn't re-pay the full lookup
 * wait, while a product newly added to OFF can still be found.
 *
 * "A genuine miss" is the operative phrase. A lookup that never reached OFF
 * is reported as `unreachable` and cached nowhere, because being offline is
 * not a fact about the pack in your hand.
 */

import { MICRO_DEFS, roundMicro, scaleMicros, type MicroKey, type Micros } from './micronutrients';

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
  micros?: Micros | null;
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
  micros: Micros | null;
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

/** OFF nutriment ids for each micronutrient. OFF stores these in grams per 100 g. */
const OFF_MICRO_IDS: Record<MicroKey, string> = {
  vitaminA: 'vitamin-a',
  vitaminD: 'vitamin-d',
  vitaminE: 'vitamin-e',
  vitaminK: 'vitamin-k',
  vitaminC: 'vitamin-c',
  thiamin: 'vitamin-b1',
  riboflavin: 'vitamin-b2',
  niacin: 'vitamin-pp',
  vitaminB6: 'vitamin-b6',
  vitaminB12: 'vitamin-b12',
  folate: 'vitamin-b9',
  potassium: 'potassium',
  calcium: 'calcium',
  magnesium: 'magnesium',
  phosphorus: 'phosphorus',
  iron: 'iron',
  zinc: 'zinc',
  selenium: 'selenium',
  iodine: 'iodine',
};

/** Vitamins and minerals converted from OFF's grams into each key's declared unit. */
function microsAt(n: OffNutriments, suffix: string): Micros | null {
  const out: Micros = {};
  let any = false;
  for (const def of MICRO_DEFS) {
    const grams = num(n[`${OFF_MICRO_IDS[def.key]}${suffix}`]);
    const factor = def.unit === 'mg' ? 1000 : 1_000_000;
    const value = grams != null && grams >= 0 ? roundMicro(grams * factor) : null;
    out[def.key] = value;
    if (value != null) any = true;
  }
  return any ? out : null;
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
      micros: scaleMicros(food.micros, amount),
      amountLabel: `${trimAmount(amount)}× serving (${food.portionLabel})`,
    };
  }
  const factor = amount / 100;
  return {
    kcal: Math.round(food.kcal * factor),
    ...scaleMacros(food, factor),
    micros: scaleMicros(food.micros, factor),
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
    micros: microsAt(n, suffix),
    portionLabel: servingSize,
    portion: serving ? 'serving' : '100g',
    servingGrams: serving ? parseServingGrams(payload.product.serving_size) : 100,
    source: 'off',
  };
}

export function parseOffSearchProducts(products: OffProduct[], codes: (string | undefined)[] = []): OffFood[] {
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

const OFF_UA = 'calibrEAT/0.0.4 (https://calibreat.app)';
const LOOKUP_TIMEOUT_MS = 8000;
const NEG_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, OffFood>();
const negCache = new Map<string, number>();

function offHeaders(): Record<string, string> {
  const native =
    typeof navigator === 'undefined' ||
    (navigator as { product?: string }).product === 'ReactNative';
  // Browsers forbid User-Agent. Setting it (or any extra header) can trip a
  // CORS preflight; OFF 503 pages have no CORS headers, so search then dies.
  if (!native) return {};
  return { 'User-Agent': OFF_UA, Accept: 'application/json' };
}

export type OffFetch =
  | { ok: true; payload: unknown; reachable: true }
  | { ok: false; reachable: true; status: number }
  | { ok: false; reachable: false };

/**
 * Fetch from Open Food Facts, reporting *how* it failed.
 *
 * The difference is the whole point. `null` used to mean both "OFF answered
 * and has no such product" and "the device never got there", and the two
 * deserve opposite behaviour: one is a fact about the pack, the other is a
 * fact about the train the app is on. A timeout, a dead DNS name and a 4xx
 * all collapsed into the same answer, so being offline looked exactly like
 * scanning something unlabelled.
 */
export async function fetchOff(url: string): Promise<OffFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: offHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reachable: true, status: res.status };
    try {
      return { ok: true, payload: await res.json(), reachable: true };
    } catch {
      // The server answered with something that is not JSON — an OFF proxy
      // error page, typically. Reached, but not usable, so it counts as
      // answered rather than as a connection failure.
      return { ok: false, reachable: true, status: res.status };
    }
  } catch {
    // fetch itself threw: offline, DNS failure, or our own 8s abort.
    return { ok: false, reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `lookup` shape `searchFoods` expects: the payload, or null when OFF could
 * not be used. `searchFoods` reports that as `packsFailed`, so a CoFID hit
 * cannot hide an Open Food Facts outage.
 */
export async function fetchOpenFoodFacts(url: string): Promise<unknown | null> {
  const res = await fetchOff(url);
  return res.ok ? res.payload : null;
}

const LAUNCH_PROBE_URL =
  'https://uk.openfoodfacts.org/cgi/search.pl?search_terms=milk&search_simple=1&action=process&json=1&page_size=1';

let launchProbe: Promise<boolean> | null = null;

/**
 * Whether UK Open Food Facts answered, asked once per process. The first
 * caller starts the probe and every later caller gets the same answer, so
 * name search keeps its sources until the app is quit and reopened.
 * Being answered (any HTTP status) counts as reachable; a connection failure does not.
 */
export function probeOpenFoodFactsAtLaunch(): Promise<boolean> {
  if (!launchProbe) {
    launchProbe = fetchOff(LAUNCH_PROBE_URL).then((res) => res.reachable);
  }
  return launchProbe;
}

export type BarcodeLookup =
  | { status: 'found'; food: OffFood }
  | { status: 'not-found' }
  | { status: 'unreachable' };

/**
 * Look up a barcode. Hits are cached for the session; genuine misses for 5
 * minutes.
 *
 * A connection failure is neither: it is not cached at all, so the pack does
 * not stay unscannable for five minutes just because the app was in a tunnel
 * when it was first scanned.
 */
export async function lookupBarcode(raw: string): Promise<BarcodeLookup> {
  const code = normaliseBarcode(raw);
  if (code.length < 8) return { status: 'not-found' };
  const hit = cache.get(code);
  if (hit) return { status: 'found', food: hit };
  const negAt = negCache.get(code);
  if (negAt != null) {
    if (Date.now() - negAt < NEG_TTL_MS) return { status: 'not-found' };
    negCache.delete(code);
  }
  // Both mirrors are worth asking even when the first one drops: they are
  // separate deployments and one being down says nothing about the other.
  const urls = [
    `https://uk.openfoodfacts.org/api/v2/product/${code}.json`,
    `https://world.openfoodfacts.org/api/v2/product/${code}.json`,
  ];
  let answered = false;
  for (const url of urls) {
    const res = await fetchOff(url);
    if (!res.reachable) continue;
    answered = true;
    const parsed = res.ok ? parseOffProduct(res.payload as OffResponse, code) : null;
    if (parsed) {
      cache.set(code, parsed);
      negCache.delete(code);
      return { status: 'found', food: parsed };
    }
  }
  // Only a server that actually answered may poison the cache.
  if (answered) negCache.set(code, Date.now());
  return { status: answered ? 'not-found' : 'unreachable' };
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
