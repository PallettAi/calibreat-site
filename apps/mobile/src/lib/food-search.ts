/**
 * Name search: on-device UK CoFID first, Open Food Facts UK packs after.
 *
 * CoFID is always available. OFF is best-effort — a downed or CORS-blocked
 * search must still return generic foods instead of a connection error.
 */

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
): FoodSearchResult {
  const packsFailed = remote == null;
  const remoteHits = (remote ?? []).map((food) => ({ ...food, source: food.source ?? 'off' }));
  return {
    hits: [...local, ...remoteHits].slice(0, limit),
    packsFailed,
  };
}

function ukSearchUrl(query: string): string {
  const params = `search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`;
  return `https://uk.openfoodfacts.org/cgi/search.pl?${params}`;
}

async function lookupWithRetry(
  url: string,
  lookup: (url: string) => Promise<unknown | null>,
): Promise<unknown | null> {
  const first = await lookup(url);
  if (first != null) return first;
  return lookup(url);
}

export async function searchFoods(raw: string, deps: SearchDeps = {}): Promise<FoodSearchResult> {
  const query = raw.trim();
  const catalog = deps.catalog ?? [];
  const local = searchCofid(query, catalog);
  if (query.length < 2) return { hits: local, packsFailed: false };

  const lookup = deps.lookup;
  if (!lookup) {
    return mergeFoodSearch(local, null);
  }

  const payload = await lookupWithRetry(ukSearchUrl(query), lookup);
  if (payload == null) return mergeFoodSearch(local, null);
  const parseRemote = deps.parseRemote ?? (() => []);
  return mergeFoodSearch(local, parseRemote(payload));
}

export const COFID_CREDIT =
  'Generic foods: McCance and Widdowson’s Composition of Foods Integrated Dataset, Public Health England, Open Government Licence. Packaged products: Open Food Facts contributors.';
