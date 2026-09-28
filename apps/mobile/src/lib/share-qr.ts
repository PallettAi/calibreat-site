/**
 * The share card's QR code, generated entirely on-device.
 *
 * The QR module is the growth loop: anyone a card is shared with can scan
 * straight through to the site, so the loop works even where links aren't
 * clickable (Instagram stories, printed screens, screenshots of screenshots).
 * Pure and dependency-free at the API level — the matrix is a plain boolean
 * grid the card component renders as View cells, so it is trivially testable
 * (scripts/check-share.mjs) and captures as native pixels.
 *
 * `qrcode-generator` is MIT-licensed, ~10 kB, and runs synchronously with no
 * DOM — the same reasons it also backs the web build.
 */

import qrcode from 'qrcode-generator';

// Inlined from lib/share-card.ts (SHARE_SITE_URL) so this module stays
// dependency-free and node-runnable under scripts/check-share.mjs — the same
// leaf-module pattern as share-card.ts. If the site ever moves, update both.
const SHARE_SITE_URL = 'https://calibreat.co.uk';

/**
 * The QR matrix for the card: `matrix[row][col] === true` where a dark module
 * sits. Error correction level M — a 25×25 matrix for the site URL, scannable
 * at 84 pt even after screenshot compression.
 */
export function shareQrMatrix(): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(SHARE_SITE_URL);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}
