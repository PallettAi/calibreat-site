/**
 * Importing a diary from another app — MyFitnessPal and Cronometer.
 *
 * The argument for this is that a one-time-purchase tracker is only worth
 * buying if moving to it isn't a punishment. Almost everyone arriving here is
 * coming *from* a subscription tracker with a year of history in it, and
 * "start again from zero" is the single biggest reason people never switch.
 * Reading their old file is the whole difference between a trial and a
 * purchase.
 *
 * Both apps export one CSV per diary, and both are close enough that a single
 * header-driven reader handles them:
 *
 * | calibrEAT    | MyFitnessPal        | Cronometer          |
 * |--------------|---------------------|---------------------|
 * | day          | Date                | Date                |
 * | time         | Time                | Time of Day         |
 * | slot         | Meal                | Group               |
 * | name         | Food Name           | Food Name           |
 * | kcal         | Calories            | Energy (kcal)       |
 * | carbs        | Carbohydrates (g)   | Carbs (g)           |
 *
 * Columns are matched by alias rather than by position, because both apps have
 * changed their export over the years and neither is versioned.
 *
 * SCOPE OF THIS MODULE: it turns a CSV into loose row objects and stops there.
 * Deciding which rows are good enough to keep is `validateRestoreRows` in
 * restore.ts, which the caller runs — so an imported row is held to exactly
 * the same rules as a row from our own backup, and the import inherits the
 * whole restore pipeline (dedupe, add-or-replace preview, one transaction)
 * instead of growing a second way to write the diary.
 *
 * No runtime imports, for the reason given in restore.ts: the check script
 * loads this under Node's `--experimental-strip-types`, which erases type-only
 * imports but cannot resolve an extensionless value import.
 */

/** Which export this looks like, for the "read as" line in the preview. */
export type DiarySource = 'myfitnesspal' | 'cronometer' | 'unknown';

/** How a slash-separated date reads. Ambiguity here is dangerous, not cosmetic:
 *  guessing wrong moves a whole year of meals onto the wrong days. */
export type DateOrder = 'ymd' | 'dmy' | 'mdy';

export type DiaryRow = {
  dayKey: string;
  meal: string;
  name: string | null;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  loggedAt: string;
};

export type DiaryScan = {
  source: DiarySource;
  dateOrder: DateOrder;
  /** True when every date fitted more than one reading, so the user may need
   *  to tell us which one their file uses. */
  ambiguousDates: boolean;
  /** Rows read. A row with no calories is read but not counted as usable. */
  rows: DiaryRow[];
  /** Rows that had no readable day or no calories at all. */
  unusable: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Group names we could not place in a meal slot, which became "snack". */
  unmappedGroups: string[];
  /** True when unitless sodium looked like grams and was scaled to mg. */
  sodiumWasGrams: boolean;
  notes: string[];
};

export type DiaryParse =
  | { ok: true; scan: DiaryScan }
  | { ok: false; message: string };

/** Mirrors RESTORE_MAX_BYTES in restore.ts (drift-checked in CI). */
export const IMPORT_MAX_BYTES = 25 * 1024 * 1024;
/** Mirrors RESTORE_MAX_ROWS in restore.ts (drift-checked in CI). */
export const IMPORT_MAX_ROWS = 250_000;

/* ── CSV ───────────────────────────────────────────────────────── */

/**
 * Split CSV text into rows of cells.
 *
 * Handles the things a real export actually contains: a UTF-8 BOM (Excel adds
 * one, and it turns the first header into "﻿Date" so the column stops
 * matching), CRLF endings, quoted cells containing the delimiter or newlines,
 * and doubled quotes inside a quoted cell. Food names are full of commas
 * ("Bread, white, 2 slices"), so naive splitting silently corrupts them.
 *
 * The delimiter is a parameter rather than something normalised away on the
 * way in: a semicolon-separated file uses the comma *inside* its numbers
 * ("12,4" is twelve point four), so rewriting `;` to `,` first would cut one
 * cell into two and shift every column after it by one.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];

    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // A trailing newline leaves one empty row; it is not data.
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

/** Comma, semicolon or tab. A UK Excel "CSV" is really semicolon-separated
 *  with comma decimals, and a tab-separated export is common enough from
 *  other tools to be worth two lines. */
function sniffDelimiter(text: string): string {
  const sample = text.slice(0, 4000);
  const counts: [string, number][] = [
    [',', (sample.match(/,/g) || []).length],
    [';', (sample.match(/;/g) || []).length],
    ['\t', (sample.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/* ── Values ────────────────────────────────────────────────────── */

/**
 * Read a number, telling "blank" apart from "zero".
 *
 * `Number('')` is 0, so a blank macro column in a real export would otherwise
 * become a confident measurement of zero grams — the exact kind of quiet
 * wrongness the app's own parsers are careful to avoid. A cell that is empty,
 * or one of the placeholders exporters use for "no data", is unknown.
 *
 * A comma is the other trap, and the two readings differ by a factor of a
 * thousand: "1,200" is one thousand two hundred, "70,5" is seventy and a half.
 * A dot settles it — machine exports write decimals with a dot and use the
 * comma only as a thousands separator. With no dot, a comma followed by exactly
 * three digits is thousands (1,200 and 12,500 kcal are both everyday), and one
 * or two digits is a decimal comma, which is what the semicolon-separated
 * "CSV" a UK Excel save produces actually contains.
 *
 * NOT INTERCHANGEABLE with the reader for the single-field weight input in
 * units.ts, and the two look far more alike than they are. That one tests
 * /\d,\d{3}(?!\d)/ anywhere in the string, so "12,34,567" normalises to
 * 1234567; this one is anchored, so the same cell matches neither rule and
 * comes out null. Both are deliberate, and for different reasons: a
 * single-field entry is the whole value, whereas a CSV cell that reads
 * "12,34,567" is not a number under any interpretation and must not become
 * one. The useful property is the last line of this function — anything the
 * rules do not cover returns null, so a cell we cannot read becomes a
 * *counted, skipped* row rather than a plausible wrong one. If either reader
 * is ever lifted into shared code, reconcile them deliberately first; do not
 * swap one for the other on the assumption that they are the same function.
 */
export function readNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '--' || trimmed === '—' || trimmed.toLowerCase() === 'n/a') return null;

  let text = trimmed;
  if (text.includes('.')) {
    // A decimal point means the commas can only be thousands separators.
    text = text.replace(/,/g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(text)) {
    text = text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function readText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** One cell, or undefined when that column is not in the file at all. Absent
 *  and blank are different facts and both survive the trip to `readNumber`. */
function cell(row: string[], at: number | undefined): string | undefined {
  return at === undefined ? undefined : row[at];
}

/** `2026-09-11` from a cell, or null if it is not a date we can read. */
export function dayKeyFrom(raw: string, order: DateOrder = 'ymd'): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso) return buildDayKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Split on any of / . or -, taking the first three numbers.
  const parts = trimmed.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length < 3) return null;
  const nums = parts.slice(0, 3).map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  const [a, b, c] = nums;
  if (a > 999) return buildDayKey(a, b, c);
  if (c > 999) {
    if (a > 31) return buildDayKey(c, a, b);
    if (order === 'mdy') return buildDayKey(c, a, b);
    return buildDayKey(c, b, a);
  }
  return null;
}

/** Round-trips through Date so 2026-02-31 is rejected, not accepted. */
function buildDayKey(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** `8:00 AM`, `08:00`, `08:00:00` → minutes past local midnight, or null. */
function minutesFrom(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?$/i.exec(trimmed);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const MEAL_ALIASES: Record<string, string> = {
  breakfast: 'breakfast',
  morning: 'breakfast',
  lunch: 'lunch',
  midday: 'lunch',
  dinner: 'dinner',
  evening: 'dinner',
  supper: 'dinner',
  snack: 'snack',
  snacks: 'snack',
  custom: 'snack',
};

/* ── Columns ───────────────────────────────────────────────────── */

/** Header spellings seen across both apps' exports and their history. */
const COLUMN_ALIASES: Record<keyof DiaryRow | 'weight', string[]> = {
  dayKey: ['date', 'day', 'logged on'],
  loggedAt: ['time', 'time of day', 'clock time'],
  meal: ['meal', 'group', 'meal name', 'meal group'],
  name: ['food name', 'food', 'name', 'item', 'description'],
  kcal: ['calories', 'calories (kcal)', 'energy (kcal)', 'energy', 'kcal', 'energy (kj)'],
  proteinG: ['protein (g)', 'protein'],
  carbsG: ['carbohydrates (g)', 'carbs (g)', 'carbohydrate (g)', 'carbs', 'carbohydrates'],
  fatG: ['fat (g)', 'fat'],
  fiberG: ['fiber (g)', 'fibre (g)', 'fiber', 'fibre', 'total fiber (g)'],
  sugarG: ['sugars (g)', 'sugar (g)', 'sugars', 'sugar'],
  satFatG: ['saturated fat (g)', 'saturated fat', 'sat fat (g)'],
  sodiumMg: ['sodium (mg)', 'sodium', 'salt (mg)'],
  weight: ['weight (g)', 'weight', 'serving size (g)', 'quantity (g)'],
};

function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The sodium header said "(mg)"? Used to decide whether to rescale. */
function sodiumHeaderSaidMg(headers: string[]): boolean {
  return headers.some((h) => normalizeHeader(h).includes('(mg)'));
}

function detectSource(headers: string[]): DiarySource {
  const joined = headers.map(normalizeHeader);
  if (joined.some((h) => h.includes('energy (kcal)') || h === 'energy')) return 'cronometer';
  if (joined.some((h) => h.startsWith('carbohydrates'))) return 'myfitnesspal';
  return 'unknown';
}

/**
 * Work out whether the dates are D/M/Y or M/D/Y.
 *
 * Looks across every date in the file rather than one: a single "03/04/2026"
 * is ambiguous, but if any date has a first number above 12 the file can only
 * be D/M/Y, and if any has a second above 12 it can only be M/D/Y. Only when
 * every date fits both — which is what a short export often looks like — do we
 * have to guess, and then the caller shows the reading and offers the other.
 */
function detectDateOrder(rows: string[][], column: number): { order: DateOrder; ambiguous: boolean } {
  let sawDmy = false;
  let sawMdy = false;
  let sawYmd = false;

  for (const row of rows) {
    const raw = row[column];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
      sawYmd = true;
      continue;
    }
    const parts = trimmed.split(/[/\-.]/).map((p) => Number(p.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) continue;
    const [a, b] = parts;
    if (a > 31 || b > 31) continue;
    if (a > 12) sawDmy = true;
    if (b > 12) sawMdy = true;
  }

  if (sawYmd && !sawDmy && !sawMdy) return { order: 'ymd', ambiguous: false };
  if (sawDmy && !sawMdy) return { order: 'dmy', ambiguous: false };
  if (sawMdy && !sawDmy) return { order: 'mdy', ambiguous: false };
  // Nothing decisive. The app is UK-first, so day-first is the safer default
  // to *show* — and the preview says which reading was used, so a wrong guess
  // is visible before anything is written rather than discovered later.
  return { order: 'dmy', ambiguous: true };
}

/* ── The read ──────────────────────────────────────────────────── */

/**
 * Read a MyFitnessPal or Cronometer diary CSV.
 *
 * Never throws. Every refusal comes back as a message, because this runs
 * against a file the user chose and may be something else entirely.
 */
export function readDiaryCsv(text: string, dateOrderOverride?: DateOrder): DiaryParse {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, message: 'That file is empty. Pick the diary export from the other app.' };
  }
  if (text.length > IMPORT_MAX_BYTES) {
    return { ok: false, message: 'That file is too large to import. Pick a smaller export.' };
  }

  const delimiter = sniffDelimiter(text);
  const table = parseCsv(text, delimiter);
  if (table.length < 2) {
    return { ok: false, message: 'That file has no rows under a header. Pick a CSV diary export.' };
  }

  const headers = table[0];
  const normalized = headers.map(normalizeHeader);
  const index: Partial<Record<string, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = normalized.findIndex((h) => aliases.includes(h));
    if (found >= 0) index[field] = found;
  }

  if (index.kcal === undefined) {
    return {
      ok: false,
      message: 'That file has no calorie column, so it is not a food diary. Pick a MyFitnessPal or Cronometer CSV export.',
    };
  }
  if (index.dayKey === undefined) {
    return { ok: false, message: 'That file has no date column. Pick a diary CSV that includes dates.' };
  }

  const dataRows = table.slice(1);
  const detected = detectDateOrder(dataRows, index.dayKey);
  const order = dateOrderOverride ?? detected.order;

  const rows: DiaryRow[] = [];
  const groups = new Set<string>();
  const days = new Set<string>();
  let unusable = 0;
  let firstDay: string | null = null;
  let lastDay: string | null = null;
  const sodiumValues: number[] = [];
  let rowsWithNoTime = 0;

  for (const row of dataRows) {
    const dayKey = dayKeyFrom(cell(row, index.dayKey) ?? '', order);
    if (!dayKey) {
      unusable += 1;
      continue;
    }

    const kcal = readNumber(cell(row, index.kcal));
    if (kcal === null) {
      unusable += 1;
      continue;
    }

    const minutes = minutesFrom(cell(row, index.loggedAt));
    if (minutes === null) rowsWithNoTime += 1;
    // No time in the file: noon, so ordering within the day is still sensible
    // and the row does not collide with every other untimed one.
    const at = new Date(
      Number(dayKey.slice(0, 4)),
      Number(dayKey.slice(5, 7)) - 1,
      Number(dayKey.slice(8, 10)),
      0,
      minutes ?? 12 * 60,
    );

    const rawGroup = readText(cell(row, index.meal));
    const slot = rawGroup ? MEAL_ALIASES[rawGroup.toLowerCase()] : undefined;
    if (rawGroup && !slot) groups.add(rawGroup);

    const sodium = readNumber(cell(row, index.sodiumMg));
    if (sodium !== null) sodiumValues.push(sodium);

    rows.push({
      dayKey,
      meal: slot ?? 'snack',
      name: readText(cell(row, index.name)),
      kcal,
      proteinG: readNumber(cell(row, index.proteinG)),
      carbsG: readNumber(cell(row, index.carbsG)),
      fatG: readNumber(cell(row, index.fatG)),
      fiberG: readNumber(cell(row, index.fiberG)),
      sugarG: readNumber(cell(row, index.sugarG)),
      satFatG: readNumber(cell(row, index.satFatG)),
      sodiumMg: sodium,
      loggedAt: at.toISOString(),
    });

    days.add(dayKey);
    if (!firstDay || dayKey < firstDay) firstDay = dayKey;
    if (!lastDay || dayKey > lastDay) lastDay = dayKey;
  }

  if (!rows.length) {
    return {
      ok: false,
      message: 'No rows in that file had both a date and a calorie figure. Pick a different export.',
    };
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, message: 'That file has more rows than this app will import at once.' };
  }

  // A unitless "Sodium" column of single digits is grams, not milligrams.
  // Rescaling is reported rather than done silently, because guessing wrong
  // would inflate or deflate a day's sodium by a thousandfold.
  const sodiumHeaderMg = sodiumHeaderSaidMg(headers);
  const sodiumWasGrams =
    !sodiumHeaderMg && sodiumValues.length > 0 && sodiumValues.every((v) => v > 0 && v < 20);
  if (sodiumWasGrams) {
    for (const row of rows) {
      if (row.sodiumMg !== null) row.sodiumMg = row.sodiumMg * 1000;
    }
  }

  const humanNotes: string[] = [];
  if (detected.ambiguous && !dateOrderOverride) {
    humanNotes.push(
      `Every date in that file could be read two ways, so they were read as ${order === 'mdy' ? 'M/D/Y' : 'D/M/Y'}.`,
    );
  }
  if (groups.size) {
    humanNotes.push(`${groups.size === 1 ? 'One meal group' : `${groups.size} meal groups`} had no slot, so they became snacks.`);
  }
  if (sodiumWasGrams) humanNotes.push('Sodium was in grams and has been converted to mg.');
  if (rowsWithNoTime) {
    humanNotes.push(`${rowsWithNoTime} ${rowsWithNoTime === 1 ? 'row had' : 'rows had'} no time and were placed at midday.`);
  }
  if (unusable) {
    humanNotes.push(`${unusable} ${unusable === 1 ? 'row was' : 'rows were'} left out for want of a date or a calorie figure.`);
  }
  humanNotes.push('Only the food diary comes across — weigh-ins and workouts stay in the other app.');

  return {
    ok: true,
    scan: {
      source: detectSource(headers),
      dateOrder: order,
      ambiguousDates: detected.ambiguous,
      rows,
      unusable,
      days: days.size,
      firstDay,
      lastDay,
      unmappedGroups: [...groups],
      sodiumWasGrams,
      notes: humanNotes,
    },
  };
}

/* ── Copy ──────────────────────────────────────────────────────── */

const SOURCE_NAMES: Record<DiarySource, string> = {
  myfitnesspal: 'MyFitnessPal',
  cronometer: 'Cronometer',
  unknown: 'another app',
};

export function describeSource(source: DiarySource): string {
  return SOURCE_NAMES[source];
}

export function formatDayRange(firstDay: string | null, lastDay: string | null): string {
  if (!firstDay || !lastDay) return '';
  if (firstDay === lastDay) return formatDay(firstDay);
  return `${formatDay(firstDay)} – ${formatDay(lastDay)}`;
}

function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return dayKey;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
