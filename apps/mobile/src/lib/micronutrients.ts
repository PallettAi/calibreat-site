/**
 * Vitamins and minerals shown in the meal log's "Vitamins & minerals" section.
 *
 * Every food source (CoFID, Open Food Facts) converts into the unit
 * declared here, so the UI never has to know where a number came from.
 * Values are per the food's own amount: per 100 g for generic foods, per
 * serving or 100 g for packs. Scaling by amount happens in scaleMicros().
 */

export type MicroKey =
  | 'vitaminA'
  | 'vitaminD'
  | 'vitaminE'
  | 'vitaminK'
  | 'vitaminC'
  | 'thiamin'
  | 'riboflavin'
  | 'niacin'
  | 'vitaminB6'
  | 'vitaminB12'
  | 'folate'
  | 'potassium'
  | 'calcium'
  | 'magnesium'
  | 'phosphorus'
  | 'iron'
  | 'zinc'
  | 'selenium'
  | 'iodine';

export type MicroDef = {
  key: MicroKey;
  label: string;
  unit: 'mg' | 'µg';
  group: 'vitamin' | 'mineral';
};

/**
 * Display order: vitamins first, then minerals. Sodium is deliberately absent:
 * it already lives in each food's `sodiumMg` field, which the sheet reads directly.
 */
export const MICRO_DEFS: readonly MicroDef[] = [
  { key: 'vitaminA', label: 'Vitamin A', unit: 'µg', group: 'vitamin' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'µg', group: 'vitamin' },
  { key: 'vitaminE', label: 'Vitamin E', unit: 'mg', group: 'vitamin' },
  { key: 'vitaminK', label: 'Vitamin K', unit: 'µg', group: 'vitamin' },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', group: 'vitamin' },
  { key: 'thiamin', label: 'Thiamin (B1)', unit: 'mg', group: 'vitamin' },
  { key: 'riboflavin', label: 'Riboflavin (B2)', unit: 'mg', group: 'vitamin' },
  { key: 'niacin', label: 'Niacin (B3)', unit: 'mg', group: 'vitamin' },
  { key: 'vitaminB6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin' },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin' },
  { key: 'folate', label: 'Folate (B9)', unit: 'µg', group: 'vitamin' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'mineral' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral' },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', group: 'mineral' },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'mineral' },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral' },
  { key: 'selenium', label: 'Selenium', unit: 'µg', group: 'mineral' },
  { key: 'iodine', label: 'Iodine', unit: 'µg', group: 'mineral' },
];

/** Values are in each key's declared unit; null means the source did not say. */
export type Micros = Partial<Record<MicroKey, number | null>>;

/** Round to two decimals: thiamin and iodine are often well below 1 unit. */
export function roundMicro(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scaleMicros(micros: Micros | null | undefined, factor: number): Micros | null {
  if (!micros) return null;
  const out: Micros = {};
  for (const def of MICRO_DEFS) {
    const value = micros[def.key];
    out[def.key] = value == null || !Number.isFinite(value) ? null : roundMicro(value * factor);
  }
  return out;
}

/** Display text for one micronutrient. Small amounts keep their decimals so thiamin still reads. */
export function formatMicroValue(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(digits))}${unit}`;
}

export function hasAnyMicro(micros: Micros | null | undefined): boolean {
  if (!micros) return false;
  return MICRO_DEFS.some((def) => micros[def.key] != null);
}

/**
 * EU Nutrient Reference Values (Regulation 1169/2011, Annex XIII) per day.
 * These are label reference amounts for an average adult, not personal targets.
 */
export const MICRO_NRV: Record<MicroKey, number> = {
  vitaminA: 800,
  vitaminD: 5,
  vitaminE: 12,
  vitaminK: 75,
  vitaminC: 80,
  thiamin: 1.1,
  riboflavin: 1.4,
  niacin: 16,
  vitaminB6: 1.4,
  vitaminB12: 2.5,
  folate: 200,
  potassium: 2000,
  calcium: 800,
  magnesium: 375,
  phosphorus: 700,
  iron: 14,
  zinc: 10,
  selenium: 55,
  iodine: 150,
};

/** Stored as JSON text on each log entry. Null when the food reported no micronutrients. */
export function serializeMicros(micros: Micros | null | undefined): string | null {
  if (!hasAnyMicro(micros)) return null;
  return JSON.stringify(micros);
}

/** Reads a stored micronutrient blob. Unknown keys are dropped and bad JSON reads as absent. */
export function parseMicros(raw: string | null | undefined): Micros | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const source = parsed as Record<string, unknown>;
  const out: Micros = {};
  for (const def of MICRO_DEFS) {
    const value = source[def.key];
    out[def.key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return hasAnyMicro(out) ? out : null;
}

/** Adds micronutrients key by key. A key stays null unless at least one input reports it. */
export function sumMicros(list: (Micros | null | undefined)[]): Micros {
  const out: Micros = {};
  for (const def of MICRO_DEFS) {
    let total: number | null = null;
    for (const micros of list) {
      const value = micros?.[def.key];
      if (value != null && Number.isFinite(value)) total = (total ?? 0) + value;
    }
    out[def.key] = total == null ? null : roundMicro(total);
  }
  return out;
}
