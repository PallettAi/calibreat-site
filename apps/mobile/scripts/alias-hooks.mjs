/**
 * Resolve the Metro-style module paths so node can import the app's own sources.
 *
 * Metro maps `@/lib/x` to `src/lib/x` and lets the extension go, and it does the
 * same for relative imports such as `./micronutrients`. Bare node knows about
 * neither. This covers only those two cases, which is enough to reach
 * `src/lib/db.web.ts` for check-db.mjs and the food-lookup modules for
 * check-barcode.mjs and check-foods.mjs. It is not a general-purpose loader,
 * and it never has to resolve `expo-sqlite`'s own internals, because db.web.ts
 * imports no native module. That is the whole reason the twin, not db.ts, is
 * the one executed here.
 *
 * Not named check-*.mjs, so run-checks.mjs will not treat it as a suite.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2);
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const candidate = new URL(relative + ext, SRC);
      if (existsSync(fileURLToPath(candidate.href))) return next(candidate.href, context);
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !/\.(c|m)?(j|t)sx?$|\.json$/.test(specifier)) {
    const candidate = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(candidate.href))) return next(candidate.href, context);
  }
  return next(specifier, context);
}
