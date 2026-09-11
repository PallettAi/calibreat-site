/**
 * Unit conversions for the setup wizard and dashboard.
 * The DB always stores metric (cm / kg / ml); these convert to and from the
 * user's preferred display units.
 */

export type HeightUnit = 'cm' | 'm' | 'ftin';
export type WeightUnit = 'kg' | 'lb' | 'st';
export type WaterUnit = 'ml' | 'cups';

/** Average kitchen cup size (US customary measuring cup). */
export const CUP_ML = 240;

export const HEIGHT_UNITS: { value: HeightUnit; label: string }[] = [
  { value: 'cm', label: 'cm' },
  { value: 'm', label: 'm' },
  { value: 'ftin', label: 'ft + in' },
];

export const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
  { value: 'st', label: 'st + lb' },
];

export const WATER_UNITS: { value: WaterUnit; label: string }[] = [
  { value: 'ml', label: 'ml' },
  { value: 'cups', label: 'cups' },
];

const CM_PER_INCH = 2.54;
const LB_PER_KG = 2.2046226218;
const KG_PER_STONE = 6.35029318;
const LB_PER_STONE = 14;

/* ── Height ─────────────────────────────────────────────────────── */

/** Convert a height in the given unit(s) to cm. */
export function heightToCm(feet: number, inches: number, value: number, unit: HeightUnit): number {
  switch (unit) {
    case 'cm':
      return Math.round(value);
    case 'm':
      return Math.round(value * 100);
    case 'ftin':
      return Math.round((feet * 12 + inches) * CM_PER_INCH);
  }
}

/** Split a stored cm value into the parts the given unit needs. */
export function heightFromCm(cm: number, unit: HeightUnit): { value: number; feet: number; inches: number } {
  switch (unit) {
    case 'cm':
      return { value: cm, feet: 0, inches: 0 };
    case 'm':
      return { value: Math.round((cm / 100) * 100) / 100, feet: 0, inches: 0 };
    case 'ftin': {
      const totalInches = Math.round(cm / CM_PER_INCH);
      return { value: 0, feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
    }
  }
}

/* ── Weight ─────────────────────────────────────────────────────── */

/** Convert a weight in the given unit(s) to kg. */
export function weightToKg(stones: number, pounds: number, value: number, unit: WeightUnit): number {
  switch (unit) {
    case 'kg':
      return Math.round(value * 10) / 10;
    case 'lb':
      return Math.round((value / LB_PER_KG) * 10) / 10;
    case 'st':
      return Math.round((stones * KG_PER_STONE + (pounds / LB_PER_KG)) * 10) / 10;
  }
}

/** Split a stored kg value into the parts the given unit needs. */
export function weightFromKg(kg: number, unit: WeightUnit): { value: number; stones: number; pounds: number } {
  switch (unit) {
    case 'kg':
      return { value: Math.round(kg * 10) / 10, stones: 0, pounds: 0 };
    case 'lb':
      return { value: Math.round(kg * LB_PER_KG), stones: 0, pounds: 0 };
    case 'st': {
      const totalLb = kg * LB_PER_KG;
      return { value: 0, stones: Math.floor(totalLb / LB_PER_STONE), pounds: Math.round(totalLb % LB_PER_STONE) };
    }
  }
}

/** Human display of a stored kg value in the given unit. */
export function formatWeightKg(kg: number, unit: WeightUnit): string {
  const w = weightFromKg(kg, unit);
  switch (unit) {
    case 'kg':
      return `${w.value} kg`;
    case 'lb':
      return `${w.value} lb`;
    case 'st':
      return w.pounds === 0 ? `${w.stones} st` : `${w.stones} st ${w.pounds} lb`;
  }
}

/* ── Water ──────────────────────────────────────────────────────── */

/** Convert a water amount in the given unit to ml. */
export function waterToMl(value: number, unit: WaterUnit): number {
  return unit === 'cups' ? Math.round(value * CUP_ML) : Math.round(value);
}

/** Human display of a stored ml value in the given unit. */
export function formatWaterMl(ml: number, unit: WaterUnit): string {
  return unit === 'cups' ? `${Math.round((ml / CUP_ML) * 10) / 10} cups` : `${ml.toLocaleString()} ml`;
}