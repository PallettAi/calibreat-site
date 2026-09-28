/**
 * The db.ts / db.web.ts twin contract (npm run check:db).
 *
 * Metro silently swaps the data layer by platform: android and ios get
 * src/lib/db.ts on expo-sqlite, the web preview gets src/lib/db.web.ts on
 * localStorage. Nothing checks that the two still agree, and nothing builds
 * the web tier in CI, so a function added to one twin and forgotten in the
 * other passes every other suite and then fails — or worse, half-works — in
 * a browser.
 *
 * Two halves:
 *   1. Export parity, read from the TypeScript AST. Types are erased at
 *      runtime, so comparing loaded exports would miss a type that exists on
 *      one side only. db.ts cannot be executed here at all (expo-sqlite is
 *      native), which is exactly why this half parses rather than imports.
 *   2. Behaviour of the web twin, which really is executed, against a
 *      stubbed localStorage. The weigh-in window is the case worth pinning:
 *      the native twin took the OLDEST 60 for months and the divergence was
 *      invisible from the web side.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const src = (name) => join(here, '..', 'src', name);

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, cond, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
};

/* ── 1. Export parity, from the AST ─────────────────────────────────── */

/** Every name a module exports, values and types alike. */
function exportedNames(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set();
  const hasExport = (node) =>
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const stmt of sf.statements) {
    // `export { a, b }` and `export type { X }` carry their names on the
    // statement, not on a declaration — db.web.ts re-exports the diary types
    // this way, so skipping it would hide half the shared surface.
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) names.add(el.name.text);
      continue;
    }
    if (!hasExport(stmt)) continue;
    if (
      (ts.isFunctionDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt) ||
        ts.isClassDeclaration(stmt)) &&
      stmt.name
    ) {
      names.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    }
  }
  return names;
}

const nativeNames = exportedNames(src('lib/db.ts'));
const webNames = exportedNames(src('lib/db.web.ts'));

const onlyNative = [...nativeNames].filter((n) => !webNames.has(n)).sort();
const onlyWeb = [...webNames].filter((n) => !nativeNames.has(n)).sort();

ok(
  'db.ts exports nothing the web twin lacks',
  onlyNative.length === 0,
  onlyNative.length ? onlyNative.join(', ') : `${nativeNames.size} names checked`,
);
ok(
  'db.web.ts exports nothing db.ts lacks',
  onlyWeb.length === 0,
  onlyWeb.length ? onlyWeb.join(', ') : `${webNames.size} names checked`,
);

/* ── 2. Behaviour of the twin that can actually run ─────────────────── */

// Node cannot resolve the `@/` alias on its own, and db.web.ts needs it.
register('./alias-hooks.mjs', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

const web = await import('../src/lib/db.web.ts');

const at = (day) => new Date(`${day}T09:00:00.000Z`);

// 70 days of weigh-ins, one per day, starting at 70 kg and falling 0.1 a
// day — so the FIRST ever is the heaviest and the newest is the lightest.
// Reading a largest value as "the newest" is exactly the mistake this suite
// is here to make impossible to repeat.
for (let i = 0; i < 70; i += 1) {
  const day = new Date(Date.UTC(2026, 0, 1 + i));
  await web.addWeighIn(70 - i * 0.1, day);
}

const page = await web.getWeighIns(60);
eq('a full page is exactly the limit', page.length, 60);
eq('the window starts at the oldest row it still holds', page[0].kg, 69);
eq('the window ends at the newest ever', page[59].kg, 63.1);
eq('the window is in ascending order', page[0].measuredAt < page[59].measuredAt, true);

const first = await web.getFirstWeighIn();
eq('getFirstWeighIn survives a full window', first.kg, 70);
eq('getFirstWeighIn is older than anything in the window', first.measuredAt < page[0].measuredAt, true);

const latest = await web.getLatestWeighIn();
eq('getLatestWeighIn is the newest', latest.kg, 63.1);
eq('getLatestWeighIn agrees with the last window row', latest.id, page[59].id);

// The window's first row is NOT the first ever, once you pass the limit. This
// is the trap the "since the first" copy fell into, so it is worth stating.
eq('the window start is not the first ever', page[0].id === first.id, false);

eq('the true since-first delta survives a full window', (latest.kg - first.kg).toFixed(1), '-6.9');

eq('a short page is returned whole', (await web.getWeighIns(500)).length, 70);
eq('a limit of 1 gives the newest row', (await web.getWeighIns(1)).length, 1);
eq('...and it is the newest', (await web.getWeighIns(1))[0].kg, 63.1);

store.clear();
eq('no weigh-ins yields an empty page', (await web.getWeighIns()).length, 0);
eq('no weigh-ins yields no first', await web.getFirstWeighIn(), null);
eq('no weigh-ins yields no latest', await web.getLatestWeighIn(), null);

await web.addWeighIn(81.4, at('2026-03-01'));
await web.addWeighIn(80.2, at('2026-02-01'));
const unordered = await web.getWeighIns();
eq('insertion order does not decide the window', unordered[0].kg, 80.2);
eq('...oldest first regardless of insert order', unordered[1].kg, 81.4);
eq('the first is chosen by date, not by insert order', (await web.getFirstWeighIn()).kg, 80.2);
eq('the latest is chosen by date, not by insert order', (await web.getLatestWeighIn()).kg, 81.4);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
