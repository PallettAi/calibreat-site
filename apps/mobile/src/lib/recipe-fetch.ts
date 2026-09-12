/**
 * Recipe import fetch layer — no platform twin needed (unlike db.ts /
 * label-ocr.ts): the only header sent is `Accept`, which is CORS-safelisted,
 * so the same fetch works on native and web without a preflight. Parsing
 * lives in the pure recipe-parse.ts (checked by check-recipe.mjs).
 *
 * A 10-second abort keeps a stalled host from parking the sheet; failure
 * modes come back as honest messages, since "some sites block apps" is
 * genuinely the answer sometimes.
 */

import { normaliseRecipeUrl, parseRecipeHtml, type ParsedRecipe } from './recipe-parse';

export type RecipeImportResult =
  | { ok: true; recipe: ParsedRecipe }
  | { ok: false; message: string };

const FETCH_TIMEOUT_MS = 10000;

export async function importRecipeUrl(rawUrl: string): Promise<RecipeImportResult> {
  const url = normaliseRecipeUrl(rawUrl);
  if (!url) return { ok: false, message: 'That does not look like a web address.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `The site answered with ${res.status}. Some recipe sites block apps — try the official recipe page.`,
      };
    }
    const html = await res.text();
    const recipe = parseRecipeHtml(html);
    if (!recipe) {
      return {
        ok: false,
        message: 'No machine-readable recipe found on that page — try the official recipe page or search the food instead.',
      };
    }
    return { ok: true, recipe };
  } catch {
    return { ok: false, message: 'Could not reach that page. Check the connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
}
