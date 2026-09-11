/**
 * License code shape — shared by the lock screen and the activation handshake.
 * Must stay aligned with apps/api/src/license.ts (hash is SHA-256 of the
 * normalized form).
 */

/**
 * Uppercase, strip punctuation, regroup in 4s — same as apps/api/src/license.ts
 * so a Dodo UUID and AB12-CD34-EF56 hash the same way on both sides.
 */
export function normalizeCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (cleaned.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * Loose shape check only (alphanumeric blocks separated by dashes, ≥ 8 chars).
 * The exact code format is defined by the activation server in M3.
 */
export function isWellFormedCode(code: string): boolean {
  if (!code) return false;
  const blocks = code.split('-');
  const totalLength = code.replace(/-/g, '').length;
  return totalLength >= 8 && blocks.every((block) => /^[A-Z0-9]{3,6}$/.test(block));
}
