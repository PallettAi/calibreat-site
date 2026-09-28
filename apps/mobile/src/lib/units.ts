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
      const stones = Math.floor(totalLb / LB_PER_STONE);
      const remainder = Math.round(totalLb % LB_PER_STONE);
      // A remainder that rounds up to a full 14 lb is not a valid weight, so
      // carry it into the next stone. 63.5 kg is exactly 10 st, but
      // 63.5 × 2.2046 = 139.993 lb, which floors to "9 st 14 lb" — and setup.tsx
      // prefills from here while validateStep rejects lb > 13, so the wizard
      // refused its own prefill and deadlocked.
      if (remainder >= LB_PER_STONE) {
        return { value: 0, stones: stones + 1, pounds: remainder - LB_PER_STONE };
      }
      return { value: 0, stones, pounds: remainder };
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

/* ── Typed input ────────────────────────────────────────────────── */

/**
 * Normalise a typed number for `parseFloat`, which stops at the first
 * separator it does not recognise — "2,5" parsed as 2, and "1,000" as 1.
 * A dot settles the question: the commas can only be thousands separators.
 * Failing one, a comma followed by exactly three digits also groups thousands
 * ("1,000" is 1000, not 1.0), while one or two digits after it means a
 * decimal comma ("2,5" is 2.5).
 */
export function normalizeDecimalNumber(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('.')) return trimmed.replace(/,/g, '');
  if (/\d,\d{3}(?!\d)/.test(trimmed)) return trimmed.replace(/,/g, '');
  return trimmed.replace(/,/g, '.');
}

/**
 * Parse a typed weight into kg, or null when it cannot be read with
 * confidence. Accepts "70.5", "70,5", "9 6" and "9,6" for the unit given.
 *
 * Stones take two fields rather than one decimal, so the comma is a separator
 * there ("9,6" is 9 st 6 lb) and never a decimal point.
 *
 * Anything unreadable returns null instead of a best guess. The failure mode
 * is not a crash, it is a confident wrong number: "10 500" is 10 st 500 lb,
 * which converts to 290 kg and passes any plausibility check, and rounding a
 * single value can land the remainder on a full 14 lb ("9.99" -> 13.86 -> 14).
 * Both used to convert straight through and record a weight nobody entered.
 */
export function parseWeightInput(text: string, unit: WeightUnit): number | null {
  const source = unit === 'st' ? text.replace(/,/g, ' ') : normalizeDecimalNumber(text);
  const nums = source.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length) return null;
  if (unit === 'kg') return weightToKg(0, 0, nums[0]!, 'kg');
  if (unit === 'lb') return weightToKg(0, 0, nums[0]!, 'lb');
  const stones = Math.floor(nums[0]!);
  const pounds = nums.length >= 2 ? Math.round(nums[1]!) : Math.round((nums[0]! - stones) * LB_PER_STONE);
  // A stone is exactly 14 lb, so the pounds half can only be 0-13.
  if (pounds < 0 || pounds >= LB_PER_STONE) return null;
  return weightToKg(stones, pounds, 0, 'st');
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