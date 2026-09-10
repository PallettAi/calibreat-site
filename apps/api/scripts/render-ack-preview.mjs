// Renders the current ACK_HTML template from src/email.ts to an HTML file
// so the branded support auto-ack can be previewed outside an email client.
// Usage: node scripts/render-ack-preview.mjs [output.html]
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const src = readFileSync(join(root, "apps/api/src/email.ts"), "utf8");

const markMatch = src.match(/const MARK_URL = '([^']+)'/);
if (!markMatch) {
  console.error("MARK_URL not found in source");
  process.exit(1);
}
const MARK_URL = markMatch[1];

const m = src.match(/const ACK_HTML = \[([\s\S]*?)\]\.join\(''\);/);
if (!m) {
  console.error("ACK_HTML not found in source");
  process.exit(1);
}

// The array literal contains template literals with ${MARK_URL}; evaluate it
// with MARK_URL in scope.
const arrSrc = m[1].includes("${MARK_URL}")
  ? m[1].replaceAll("${MARK_URL}", "MARK_URL_SENTINEL")
  : m[1];

const rawParts = eval(`[${arrSrc}]`);
const html = rawParts
  .join("")
  .replaceAll("MARK_URL_SENTINEL", MARK_URL);

const out = process.argv[2] ?? "/tmp/ack-branded.html";
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes)`);
