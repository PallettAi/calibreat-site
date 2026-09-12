/**
 * Nutrition-label parsing — the brain of "photograph the label" logging.
 *
 * A photo of a nutrition panel becomes text (on-device OCR, see
 * src/lib/label-ocr.ts) and this module turns that messy text into the same
 * nutrient shape the rest of the app logs. It must be pure: no React, no
 * platform branches, so scripts/check-ocr.mjs can throw the ugliest real-world
 * OCR output at it in CI.
 *
 * Handles the two layouts the target markets print:
 * - UK/EU ("Typical values … per 100g | per serving") → basis "100g"
 * - US ("Nutrition Facts … Serving size") → basis "serving"
 * and the two energy conventions (kJ converted at 4.184 kJ/kcal), plus
 * UK salt → sodium (salt = sodium × 2.5, so sodium mg = salt g × 400).
 *
 * Values are matched keyword-first on a "de-digitised" copy of each line
 * (0→o, 1→l, 5→s, 8→b) because OCR routinely corrupts letters inside words
 * ("pr0tein"), while the numbers themselves are read from the original text.
 */

/** 4.184 kJ per kcal — the conversion every UK dual-unit label implies. */
export const KJ_PER_KCAL = 4.184;
/** UK salt × 2.5 = sodium-equivalent; sodium mg = salt g × 400. */
export const SODIUM_MG_PER_GRAM_SALT = 400;

export type LabelBasis = '100g' | 'serving';
export type LabelQuality = 'ok' | 'partial' | 'none';

export type ParsedLabel = {
  /** Which column the numbers came from — drives the default amount in the UI. */
  basis: LabelBasis;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  sugarG: number | null;
  fatG: number | null;
  satFatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  /** ok = kcal found; partial = some macros but no kcal; none = not a label. */
  quality: LabelQuality;
};

type NutrientKey = keyof Omit<ParsedLabel, 'basis' | 'quality'>;

/** OCR letter fix-ups used only for keyword matching, never for numbers. */
function deDigitize(line: string): string {
  return line.replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/8/g, 'b');
}

/** Undo thousand separators and OCR zeros/ones — shared by value extraction
 *  and the kcal-token match, which must see "2O0 kcal" as "200 kcal" too. */
function fixDigits(line: string): string {
  return line
    .replace(/(\d)[ ,](\d{3})\b/g, '$1$2') // 1,046 → 1046 (also OCR "1 046")
    .replace(/[oO](?=\d)|(?<=\d)[oO]/g, '0') // 25O → 250
    .replace(/[lI|](?=\d)|(?<=\d)[lI|]/g, '1'); // 3l g → 31 g
}

/** All numbers in a line, after undoing thousand separators and OCR zeros.
 *  Matches are word-boundary anchored on purpose: in "Pr0tein 12g" the 0 sits
 *  inside a word (no boundary) so it is skipped, while "12g" starts cleanly. */
function numbersIn(line: string): number[] {
  const matches = fixDigits(line).match(/\b\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number).filter(Number.isFinite) : [];
}

/**
 * The first numeric value on the line that isn't part of the keyword itself.
 * `<0.1 g` parses as 0.1 (honest trace), `Tr`/`trace` as 0.
 */
function firstValue(line: string): number | null {
  if (/\b(tr|trace)\b/i.test(line)) return 0;
  const values = numbersIn(line);
  return values.length ? values[0] : null;
}

function roundGrams(value: number): number {
  return Math.round(value);
}

type AliasRule = {
  key: NutrientKey;
  /** Lines that must NOT count for this key (sub-lines like "of which sugars"). */
  exclude?: RegExp;
  match: RegExp;
};

/**
 * Order matters: sub-nutrient rules (sugars, saturates) run before their
 * parents so a single line can feed two keys when printed together.
 */
const ALIASES: AliasRule[] = [
  { key: 'sugarG', match: /(?:of\s*which\s*)?sugars?/ },
  { key: 'carbsG', exclude: /sugar/, match: /carbohydrates?|carbs/ },
  { key: 'satFatG', match: /(?:of\s*which\s*)?saturates?|saturated/ },
  { key: 'fatG', exclude: /saturat|trans/, match: /\bfat\b|\bfats\b/ },
  { key: 'fiberG', match: /fib(?:re|er)/ },
  { key: 'proteinG', match: /protein/ },
  { key: 'sodiumMg', exclude: /salt/, match: /sodium/ },
  { key: 'sodiumMg', match: /\bsalt\b/ },
];

function matchesAlias(line: string, rule: AliasRule): boolean {
  const deDigitized = deDigitize(line.toLowerCase());
  if (rule.exclude && rule.exclude.test(deDigitized)) return false;
  return rule.match.test(deDigitized);
}

/** True when the line names an energy value (kcal or kJ). */
function isEnergyLine(line: string): boolean {
  const deDigitized = deDigitize(line.toLowerCase());
  return /energ|calor|\bk?cal\b|\bkj\b/.test(deDigitized);
}

/** Detect which column the numbers describe. UK-first defaults to 100g.
 *  Runs on the original text on purpose: de-digitising would corrupt
 *  "per 100g" into "per loog" and break the match. */
function detectBasis(lines: string[]): LabelBasis {
  const joined = lines.join(' ').toLowerCase();
  if (/per\s*100\s*g/.test(joined)) return '100g';
  if (/per\s*(serving|portion|pack|bowl)/.test(joined)) return 'serving';
  if (/nutrition\s*facts|serving\s*size/.test(joined)) return 'serving';
  return '100g';
}

function energyFrom(line: string): number | null {
  const deDigitized = deDigitize(line.toLowerCase());
  const values = numbersIn(line);
  if (!values.length) return null;
  // The kcal token match runs on digit-fixed text so OCR corruption inside the
  // value ("2O0 kcal") still finds the number attached to the token.
  if (/kcal|\bcal|calor/.test(deDigitized)) {
    const cleanedLower = fixDigits(line).toLowerCase();
    const before = cleanedLower.match(/(\d+(?:\.\d+)?)\s*k?\s*cal/);
    if (before) return Math.round(Number(before[1]));
    // US style puts the value after the word: "Calories 120".
    const after = cleanedLower.match(/calories?\s*:?\s*(\d+(?:\.\d+)?)/);
    if (after) return Math.round(Number(after[1]));
    // "1046 kJ / 2O0 kcal" where only the kcal digits survived fixing: the
    // kcal number is the other value on a dual-unit line.
    if (values.length > 1) return Math.round(values[values.length - 1]);
  }
  // kJ-only line (or a bare number under an Energy heading).
  if (deDigitized.includes('kj') || isEnergyLine(line)) {
    return Math.round(values[0] / KJ_PER_KCAL);
  }
  return Math.round(values[0]);
}

/**
 * Parse OCR text into the app's nutrient shape. Accepts a raw string (with any
 * line endings) or pre-split lines from the OCR bridge.
 */
export function parseLabelText(raw: string | string[]): ParsedLabel {
  // UK panels often pair a nutrient with its sub-nutrient on one line
  // ("Fat 8.2 g of which saturates 2.1 g"); splitting on the "of which"
  // boundary gives each half its own first-value, so both land correctly.
  const lines = (Array.isArray(raw) ? raw : raw.split(/\r?\n/))
    .flatMap((line) => line.split(/\bof\s+which\b/i))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsed: ParsedLabel = {
    basis: detectBasis(lines),
    kcal: null,
    proteinG: null,
    carbsG: null,
    sugarG: null,
    fatG: null,
    satFatG: null,
    fiberG: null,
    sodiumMg: null,
    quality: 'none',
  };

  let sawAnyKeyword = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // ── Energy ──────────────────────────────────────────────────────
    // "Energy 1046 kJ / 251 kcal", "Calories 120", or a bare "1046 kJ" line
    // following an "Energy" heading — UK panels print the kJ value first, and
    // the kcal value is the one the app wants.
    if (parsed.kcal == null) {
      if (isEnergyLine(line) && numbersIn(line).length) {
        parsed.kcal = energyFrom(line);
        sawAnyKeyword = true;
      } else if (/^(energy|calories?)$/i.test(deDigitize(line.toLowerCase())) && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (numbersIn(next).length) {
          parsed.kcal = energyFrom(next);
          sawAnyKeyword = true;
        }
      }
    }

    // ── Macro / micro rows ──────────────────────────────────────────
    for (const rule of ALIASES) {
      if (parsed[rule.key] != null) continue;
      if (!matchesAlias(line, rule)) continue;
      let value = firstValue(line);
      // Keyword line with the number wrapped to the next line or two.
      if (value == null && line.length < 40) {
        for (const lookahead of lines.slice(i + 1, i + 3)) {
          if (isEnergyLine(lookahead)) break;
          value = firstValue(lookahead);
          if (value != null) break;
        }
      }
      if (value == null) continue;
      sawAnyKeyword = true;
      if (rule.key === 'sodiumMg') {
        // Salt lines give grams; sodium lines give mg (or, rarely, g).
        const isSaltRule = rule.match.source.includes('salt');
        const lineIsMg = /mg/.test(deDigitize(line.toLowerCase())) && !isSaltRule;
        const lineIsGrams = /\d\s*g\b/.test(deDigitize(line.toLowerCase()));
        if (isSaltRule) {
          parsed.sodiumMg = roundGrams(value * SODIUM_MG_PER_GRAM_SALT);
        } else if (lineIsMg || !lineIsGrams) {
          parsed.sodiumMg = roundGrams(value);
        } else {
          parsed.sodiumMg = roundGrams(value * 1000);
        }
      } else {
        parsed[rule.key] = roundGrams(value);
      }
    }
  }

  parsed.quality = parsed.kcal != null ? 'ok' : sawAnyKeyword ? 'partial' : 'none';
  return parsed;
}

/** Short human note for the confirm card, matching the app's voice. */
export function labelQualityNote(parsed: ParsedLabel): string {
  if (parsed.quality === 'ok') {
    return parsed.basis === '100g'
      ? 'Values read per 100 g — check the amount below.'
      : 'Values read per serving — check the amount below.';
  }
  if (parsed.quality === 'partial') {
    return 'Read some values but not the calories — fill the gaps or scan again.';
  }
  return 'Could not read a nutrition label. Try again with the panel filling the frame.';
}
