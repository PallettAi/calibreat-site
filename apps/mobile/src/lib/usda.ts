/**
 * USDA FoodData Central search fallback.
 *
 * FoodData Central is a public US government nutrition database. It complements
 * Open Food Facts: when the pack database is unavailable, users can still find
 * common branded and generic foods by name. Parsing is pure so it stays easy to
 * verify without a device or network.
 */

import type { SearchFood } from './food-search';

export type UsdaNutrient = {
  nutrientId?: number;
  nutrientName?: string;
  value?: number;
  unitName?: string;
};

export type UsdaFood = {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: UsdaNutrient[];
};

export type UsdaSearchResponse = { foods?: UsdaFood[] };

function finite(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function nutrient(food: UsdaFood, id: number): number | null {
  const row = food.foodNutrients?.find((item) => item.nutrientId === id);
  return finite(row?.value);
}

function rounded(raw: number | null): number | null {
  return raw == null ? null : Math.round(raw);
}

function displayName(food: UsdaFood): string {
  const name = food.description?.trim() || 'USDA food';
  const brand = food.brandOwner?.trim();
  if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

/** Convert one USDA search result (nutrients are normally per 100 g) to app shape. */
export function parseUsdaFood(food: UsdaFood): SearchFood | null {
  const kcal = nutrient(food, 1008);
  if (kcal == null || kcal <= 0) return null;
  return {
    barcode: `usda:${food.fdcId ?? displayName(food)}`,
    name: displayName(food),
    kcal: Math.round(kcal),
    proteinG: rounded(nutrient(food, 1003)),
    carbsG: rounded(nutrient(food, 1005)),
    fatG: rounded(nutrient(food, 1004)),
    fiberG: rounded(nutrient(food, 1079)),
    sugarG: rounded(nutrient(food, 2000)),
    satFatG: rounded(nutrient(food, 1258)),
    sodiumMg: rounded(nutrient(food, 1093)),
    portionLabel: '100 g',
    portion: '100g',
    servingGrams: 100,
    source: 'usda',
  };
}

export function parseUsdaSearchPayload(payload: UsdaSearchResponse | unknown): SearchFood[] {
  const foods = (payload as UsdaSearchResponse | null)?.foods;
  if (!Array.isArray(foods)) return [];
  return foods.map(parseUsdaFood).filter((food): food is SearchFood => food != null);
}

const USDA_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY || 'DEMO_KEY';
const USDA_TIMEOUT_MS = 8000;

/** Fetch USDA results. A failed request is deliberately indistinguishable from no results. */
export async function fetchUsdaFoods(query: string): Promise<unknown | null> {
  const params = new URLSearchParams({
    api_key: USDA_KEY,
    query,
    pageSize: '12',
    dataType: 'Foundation,SR Legacy,Branded',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), USDA_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
