/**
 * Name search: on-device UK CoFID first, Open Food Facts UK packs after.
 * The world catalogue is never searched.
 *
 * CoFID is always available. OFF is best-effort — a downed or CORS-blocked
 * search must still return generic foods instead of a connection error.
 */

import type { Micros } from './micronutrients';

export type FoodSource = 'cofid' | 'off';

export type SearchFood = {
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
  portion: 'serving' | '100g';
  servingGrams: number | null;
  source: FoodSource;
  micros?: Micros | null;
};

export type CofidFood = {
  code: string;
  name: string;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  micros?: Micros | null;
};

export type FoodSearchResult = {
  hits: SearchFood[];
  packsFailed: boolean;
};

type SearchDeps = {
  catalog?: CofidFood[];
  lookup?: (url: string) => Promise<unknown | null>;
  parseRemote?: (payload: unknown) => SearchFood[];
};

const SEARCH_LIMIT = 20;

export function parseCofidNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw) : null;
  }
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (lowered === 'tr' || lowered === 'trace') return 0;
  if (lowered === 'n') return null;
  const parsed = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

export function cofidToFood(row: CofidFood): SearchFood {
  return {
    barcode: `cofid:${row.code}`,
    name: row.name,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    fiberG: row.fiberG,
    sugarG: row.sugarG,
    satFatG: row.satFatG,
    sodiumMg: row.sodiumMg,
    portionLabel: '100 g',
    portion: '100g',
    servingGrams: 100,
    source: 'cofid',
    micros: row.micros ?? null,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Prefix and whole-word matches only — "rice" must not hit "Price". */
function matchRank(name: string, query: string): number | null {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const word = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(q)}(?:$|[^a-z0-9])`);
  if (word.test(n)) return 2;
  return null;
}

export function searchCofid(query: string, catalog: CofidFood[] = []): SearchFood[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return catalog
    .map((row) => {
      const rank = matchRank(row.name, q);
      return rank == null ? null : { rank, food: cofidToFood(row) };
    })
    .filter((hit): hit is { rank: number; food: SearchFood } => hit != null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.food.name.length - b.food.name.length ||
        a.food.name.localeCompare(b.food.name),
    )
    .map((hit) => hit.food);
}

export function mergeFoodSearch(
  local: SearchFood[],
  remote: SearchFood[] | null,
  limit = SEARCH_LIMIT,
  packsFailed = remote == null,
): FoodSearchResult {
  const remoteHits = (remote ?? []).map((food) => ({ ...food, source: food.source ?? 'off' }));
  // Reserve room for remote hits so a crowded CoFID list cannot hide them.
  const remoteTake = Math.min(remoteHits.length, Math.floor(limit / 2));
  const localTake = limit - remoteTake;
  return {
    hits: [...local.slice(0, localTake), ...remoteHits.slice(0, remoteTake)],
    packsFailed,
  };
}

function offSearchUrl(query: string): string {
  const params = `search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`;
  return `https://uk.openfoodfacts.org/cgi/search.pl?${params}`;
}

export async function searchFoods(raw: string, deps: SearchDeps = {}): Promise<FoodSearchResult> {
  const query = raw.trim();
  const catalog = deps.catalog ?? [];
  const local = searchCofid(query, catalog);
  if (query.length < 2) return { hits: local, packsFailed: false };

  const lookup = deps.lookup;
  const parseRemote = deps.parseRemote ?? (() => []);
  // No lookup means the launch probe found OFF unreachable: CoFID only, and that
  // is not a pack failure. A lookup that was asked and failed is one.
  let remote: SearchFood[] | null = null;
  if (lookup) {
    // Single attempt on purpose: OFF failures are network-down, CORS or
    // rate-limiting — an immediate retry loses every time. UK only: the world
    // catalogue mixes in non-UK food, so it is never asked here.
    const payload = await lookup(offSearchUrl(query));
    remote = payload == null ? null : parseRemote(payload);
  }

  return mergeFoodSearch(local, remote, SEARCH_LIMIT, lookup != null && remote == null);
}

export const COFID_CREDIT =
  'Generic foods: McCance and Widdowson’s Composition of Foods Integrated Dataset 2021 (CoFID), published by Public Health England on GOV.UK under the Open Government Licence v3.0. Packaged products: contains data from Open Food Facts, available under the Open Database Licence (ODbL).';
