// Renders the license delivery email template from src/email.ts to an HTML
// file for preview (or sending via the Resend API as a visual test).
// Usage: node scripts/render-license-preview.mjs [output.html] [code]
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

// Pull the html:[ ... ].join('') literal out of sendLicenseDeliveryEmail.
const fnStart = src.indexOf("sendLicenseDeliveryEmail");
const htmlMatch = src.slice(fnStart).match(/html: \[([\s\S]*?)\]\.join\(''\),/);
if (!htmlMatch) {
  console.error("License delivery html template not found in source");
  process.exit(1);
}

const CODE = process.argv[3] ?? "AB12-CD34-EF56";
const arrSrc = htmlMatch[1]
  .replaceAll("${MARK_URL}", "MARK_URL_SENTINEL")
  .replaceAll("${code}", "CODE_SENTINEL");
const rawParts = eval(`[${arrSrc}]`);
const html = rawParts
  .join("")
  .replaceAll("MARK_URL_SENTINEL", MARK_URL)
  .replaceAll("CODE_SENTINEL", CODE);

const out = process.argv[2] ?? "/tmp/license-branded.html";
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, code=${CODE})`);
