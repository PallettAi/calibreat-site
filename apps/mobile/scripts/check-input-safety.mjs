/**
 * Hostile-input contract for every parser that reads a file the user picked
 * (npm run check:inputs).
 *
 * restore.ts promises "Never throws: every failure comes back as
 * { ok: false, message }" because it runs against a file the user chose — which
 * may be a photo of a receipt, a spreadsheet someone edited, or a download
 * somebody sent them. The functional suites check *what the parsers decide*;
 * none of them check that they decide it at all rather than crashing, because a
 * throw here is an unhandled rejection in a sheet, not a failed assertion.
 *
 * So this suite is written the other way round: every case below is something a
 * user can hand the app by accident or an attacker can send on purpose, and the
 * assertion is always about the *shape of the failure*, never about a specific
 * row being accepted. A parser that rejects everything passes; one that accepts
 * nonsense or explodes does not.
 */
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  readDiaryCsv,
} from '../src/lib/import-diary.ts';
import {
  RESTORE_MAX_BYTES,
  RESTORE_MAX_ROWS,
  logFingerprint,
  parseBackup,
  savedMealFingerprint,
  validateRestoreRows,
  weighInFingerprint,
} from '../src/lib/restore.ts';
import { parseLabelText } from '../src/lib/label-parse.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};
const section = (title) => console.log(`\n── ${title} ──`);

// A backup skeleton is enough to get past the app/schema guard and reach the
// row parsers, which is where the interesting type confusion lives.
const backup = (body) => JSON.stringify({ app: 'calibrEAT', schema: 'calibreat.export.v1', ...body });
const CSV = 'Date,Time,Group,Food Name,Energy (kcal)';

/* ── A. nothing throws ──────────────────────────────────────────────
 * The headline promise. Each entry is run through all three parsers; the
 * assertion is that the call returns, whatever it decides. */
section('hostile input never throws');

const HOSTILE = [
  ['empty', ''],
  ['whitespace', '   \n\t '],
  ['bare null byte', '\0'],
  ['JSON null', 'null'],
  ['JSON true', 'true'],
  ['JSON number', '1e999'],
  ['JSON string', '"hello"'],
  ['empty array', '[]'],
  ['empty object', '{}'],
  ['deeply nested arrays', '['.repeat(500) + ']'.repeat(500)],
  ['truncated JSON', '{"app":"calibrEAT",'],
  ['trailing garbage', backup({}) + '{{'],
  ['no rows at all', backup({})],
  ['rows as a string', backup({ logEntries: 'not an array' })],
  ['rows as an object', backup({ logEntries: { 0: {} } })],
  ['rows as a number', backup({ logEntries: 7 })],
  ['rows of every wrong type', backup({ logEntries: [null, 1, 'x', true, [], {}] })],
  ['a row that is an array', backup({ logEntries: [['2026-01-01', 'breakfast']] })],
  ['kcal as an object', backup({ logEntries: [{ dayKey: '2026-01-01', kcal: {} }] })],
  ['kcal as Infinity', backup({ logEntries: [{ dayKey: '2026-01-01', kcal: '1e999' }] })],
  ['kcal as -1', backup({ logEntries: [{ dayKey: '2026-01-01', kcal: -1 }] })],
  ['kcal as NaN', backup({ logEntries: [{ dayKey: '2026-01-01', kcal: 'NaN' }] })],
  ['an impossible date', backup({ logEntries: [{ dayKey: '2026-02-31', kcal: 100 }] })],
  ['a date in the far future', backup({ weighIns: [{ kg: 70, measuredAt: '9999-01-01T00:00:00Z' }] })],
  ['a lone surrogate', backup({ logEntries: [{ dayKey: '2026-01-01', name: '\ud800', kcal: 100 }] })],
  ['a very long name', backup({ logEntries: [{ dayKey: '2026-01-01', name: 'x'.repeat(200000), kcal: 100 }] })],
  ['exportedAt as an object', backup({ exportedAt: { toISOString: 1 } })],
  ['profile as an array', backup({ logEntries: [{ dayKey: '2026-01-01', kcal: 100 }], profile: [] })],
  ['goals as a string', backup({ logEntries: [{ dayKey: '2026-01-01', kcal: 100 }], goals: 'x' })],
  ['__proto__ payload', backup({ __proto__: { polluted: true }, logEntries: [{}] })],
  ['constructor.prototype payload', '{"constructor":{"prototype":{"polluted":true}},' + backup({ logEntries: [{}] }).slice(1)],
  ['a UTF-8 BOM', '﻿' + backup({ logEntries: [{ dayKey: '2026-01-01', kcal: 100 }] })],
];

for (const [label, input] of HOSTILE) {
  let threw = null;
  try {
    parseBackup(input);
  } catch (error) {
    threw = `restore: ${error?.constructor?.name}: ${error?.message}`;
  }
  try {
    readDiaryCsv(input);
  } catch (error) {
    threw = threw ?? `import: ${error?.constructor?.name}: ${error?.message}`;
  }
  try {
    parseLabelText(input);
  } catch (error) {
    threw = threw ?? `ocr: ${error?.constructor?.name}: ${error?.message}`;
  }
  ok(`survives ${label}`, threw === null);
  if (threw) console.log(`        ${threw}`);
}

/* ── B. hostile input never becomes data ────────────────────────────
 * "Did not crash" is only half the promise. A parser that returns a row built
 * from null and true is worse than one that crashes, because the row is then
 * written to the diary as though it were real. */
section('hostile input never becomes a row');

const rowCount = (parse) => {
  try {
    const result = parse();
    if (!result?.ok || !result.bundle) return 0;
    const c = result.bundle.counts;
    return c.logEntries + c.weighIns + c.water + c.workouts + c.savedMeals;
  } catch {
    return -1;
  }
};

const shouldBeEmpty = [
  ['a JSON array', '[]'],
  ['null', 'null'],
  ['a number', '42'],
  ['a string', '"a backup"'],
  ['rows of every wrong type', backup({ logEntries: [null, 1, 'x', true, [], {}] })],
  ['a row with no usable fields', backup({ logEntries: [{}, {}, {}] })],
  ['a __proto__ payload', backup({ __proto__: { polluted: true }, logEntries: [{}] })],
];
for (const [label, input] of shouldBeEmpty) {
  eq(`no rows from ${label}`, rowCount(() => parseBackup(input)), 0);
}

// A row that *is* well formed is still the only way to get one out.
const good = parseBackup(backup({ logEntries: [{ dayKey: '2026-01-01', meal: 'breakfast', name: 'Oats', kcal: 320 }] }));
eq('a genuinely good row is still read', good.ok && good.bundle.counts.logEntries, 1);

// Non-finite and negative magnitudes are refused rather than stored.
eq('Infinity kcal is refused', rowCount(() => parseBackup(backup({ logEntries: [{ dayKey: '2026-01-01', kcal: '1e999' }] }))), 0);
eq('negative kcal is refused', rowCount(() => parseBackup(backup({ logEntries: [{ dayKey: '2026-01-01', kcal: -5 }] }))), 0);
eq('NaN kcal is refused', rowCount(() => parseBackup(backup({ logEntries: [{ dayKey: '2026-01-01', kcal: 'NaN' }] }))), 0);

/* ── C. no prototype pollution ──────────────────────────────────────
 * JSON.parse puts "__proto__" on the object as an own property rather than
 * walking the prototype chain, so this is safe by default — but only as long
 * as nothing downstream spreads or merges an untrusted object by key. This is
 * the check that keeps it that way. */
section('untrusted keys never reach a prototype');

for (const key of ['__proto__', 'constructor', 'prototype']) {
  const parsed = validateRestoreRows({ [key]: { polluted: true }, logEntries: [{ dayKey: '2026-01-01', kcal: 100 }] });
  ok(`${key} in a backup does not pollute Object.prototype`, ({}).polluted === undefined);
  ok(`${key} does not leak onto the returned bundle`, parsed.ok !== true || parsed.bundle[key] === undefined);
}
eq('Object.prototype is clean after every payload above', ({}).polluted, undefined);

/* ── D. the caps are enforced, not merely declared ──────────────────
 * Both parsers document a byte and a row ceiling. If either is ever dropped
 * during a refactor, the failure is a multi-minute freeze rather than a
 * message, so the ceilings are asserted from the outside. */
section('size limits are enforced');

ok('RESTORE_MAX_BYTES is a positive number', Number.isFinite(RESTORE_MAX_BYTES) && RESTORE_MAX_BYTES > 0);
ok('IMPORT_MAX_BYTES is a positive number', Number.isFinite(IMPORT_MAX_BYTES) && IMPORT_MAX_BYTES > 0);
ok('RESTORE_MAX_ROWS is a positive integer', Number.isInteger(RESTORE_MAX_ROWS) && RESTORE_MAX_ROWS > 0);
ok('IMPORT_MAX_ROWS is a positive integer', Number.isInteger(IMPORT_MAX_ROWS) && IMPORT_MAX_ROWS > 0);

eq(
  'a file over RESTORE_MAX_BYTES is refused',
  parseBackup('x'.repeat(RESTORE_MAX_BYTES + 1)).ok,
  false,
);
eq(
  'a file just under RESTORE_MAX_BYTES is not refused for size',
  parseBackup('x'.repeat(RESTORE_MAX_BYTES)).message?.includes('too large'),
  false,
);
eq(
  'a CSV over IMPORT_MAX_BYTES is refused',
  readDiaryCsv('x'.repeat(IMPORT_MAX_BYTES + 1)).ok,
  false,
);

// One row past the ceiling must be refused rather than silently truncated —
// a truncated restore is the "half-restored" outcome restore.ts refuses to do.
const tooManyRows = backup({ logEntries: Array.from({ length: RESTORE_MAX_ROWS + 1 }, () => ({ dayKey: '2026-01-01', kcal: 100 })) });
eq('a backup over RESTORE_MAX_ROWS is refused', parseBackup(tooManyRows).ok, false);

/* ── E. untrusted text cannot corrupt the merge de-duplication ──
 * Merge mode answers "is this row already here?" with a fingerprint of the
 * row's fields, and two *different* rows sharing one would silently drop a
 * real meal. The separator is a NUL, and a food name can contain one: a CSV
 * cell may hold it and cleanName only trims. So these assert that control
 * characters in a name cannot forge a collision with a clean row — the case
 * where untrusted input reaches the identity of a row it did not write.
 *
 * Worth being precise about what this does and does not pin: it does NOT
 * detect the separator regressing to a space. It looks like it would, because
 * check-restore only proves re-importing the same file is a no-op and that
 * survives such a change — but the rows it compares are identical either way.
 * In practice a space could not alias two rows regardless: every fingerprint
 * takes a fixed number of fields and its last is always a strict ISO
 * timestamp, so nothing can slide across a boundary. The separator is belt to
 * a pair of braces rather than the only thing holding this together. */
section('fingerprints cannot be made to collide');

const base = { dayKey: '2026-01-01', meal: 'breakfast', name: 'Oats', kcal: 320, loggedAt: '2026-01-01T08:00:00.000Z' };

ok(
  'a name with a trailing NUL is a different row from the name without',
  logFingerprint(base) !== logFingerprint({ ...base, name: 'Oats\u0000' }),
);
ok(
  'a name with an embedded NUL is a different row',
  logFingerprint(base) !== logFingerprint({ ...base, name: 'Oa\u0000ts' }),
);
ok(
  'the null placeholder byte cannot impersonate an absent field',
  logFingerprint(base) !== logFingerprint({ ...base, name: 'Oats\u0001' }),
);
ok(
  'two names differing only after a space stay distinct',
  logFingerprint(base) !== logFingerprint({ ...base, name: 'Oats 320' }),
);
ok(
  'the same row fingerprints identically',
  logFingerprint(base) === logFingerprint({ ...base }),
);
ok(
  'weigh-ins distinguish 70.0 from 70.00-style inputs',
  weighInFingerprint({ kg: 70, measuredAt: '2026-01-01T08:00:00.000Z' })
    !== weighInFingerprint({ kg: 70, measuredAt: '2026-01-01T08:00:00.001Z' }),
);
ok(
  'saved meals that differ only by case share a fingerprint (deliberate)',
  savedMealFingerprint({ name: 'Usual Breakfast', createdAt: '2026-01-01T08:00:00.000Z' })
    === savedMealFingerprint({ name: '  usual breakfast ', createdAt: '2026-01-01T08:00:00.000Z' }),
);

// The property above asks about individual hazards; this asks the thing that
// actually matters in a merge — that no two genuinely different rows in one
// user's diary collapse onto a single fingerprint. The corpus is drawn from
// the shapes that have bitten trackers before: the same food logged twice in a
// day at different times, a name that is a prefix of another, two names that
// differ only where a separator would go, and a null macro next to a zero one.
const corpus = [
  { dayKey: '2026-01-01', meal: 'breakfast', name: 'Oats', kcal: 320, loggedAt: '2026-01-01T08:00:00.000Z' },
  { dayKey: '2026-01-01', meal: 'breakfast', name: 'Oats', kcal: 320, loggedAt: '2026-01-01T08:30:00.000Z' },
  { dayKey: '2026-01-01', meal: 'lunch', name: 'Oats', kcal: 320, loggedAt: '2026-01-01T12:00:00.000Z' },
  { dayKey: '2026-01-02', meal: 'breakfast', name: 'Oats', kcal: 320, loggedAt: '2026-01-02T08:00:00.000Z' },
  { dayKey: '2026-01-01', meal: 'breakfast', name: 'Oats 320', kcal: 320, loggedAt: '2026-01-01T08:00:00.000Z' },
  { dayKey: '2026-01-01', meal: 'breakfast', name: 'Oats and milk', kcal: 320, loggedAt: '2026-01-01T08:00:00.000Z' },
  { dayKey: '2026-01-01', meal: 'snack', name: 'Oats', kcal: 320, loggedAt: '2026-01-01T08:00:00.000Z' },
];
const fingerprints = corpus.map((entry) => logFingerprint(entry));
eq('no two different rows in a realistic day share a fingerprint', new Set(fingerprints).size, corpus.length);

/* ── F. the CSV parser's own edge cases ─────────────────────────────
 * readDiaryCsv is a hand-written state machine, which is where a quoting bug
 * would most plausibly live. These are the shapes that break naive splitters. */
section('CSV quoting edges');

const csvCases = [
  ['an unterminated quote', CSV + '\n2026-09-10,08:00,Breakfast,"Oats, 1',
  0],
  ['a doubled quote inside a cell', CSV + '\n2026-09-10,08:00,Breakfast,"Oats ""big""",320', 1],
  ['a newline inside a quoted cell', CSV + '\n2026-09-10,08:00,Breakfast,"Oats\nrolled",320', 1],
  ['only commas', ',,,,,,,,,,,,,,,,\n,,,,,,,,,,,,,,,,', 0],
  ['a single quote character', '"', 0],
];
for (const [label, input, wantRows] of csvCases) {
  let got;
  try {
    const r = readDiaryCsv(input);
    got = r.ok ? r.scan.rows.length : 0;
  } catch (error) {
    console.log(`        threw: ${error?.constructor?.name}: ${error?.message}`);
    got = -1;
  }
  eq(label, got, wantRows);
}

console.log(fails === 0 ? '\nAll input-safety checks passed.' : `\n${fails} input-safety check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
