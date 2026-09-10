// Renders the current OTP verification email template from src/email.ts to
// an HTML file so it can be previewed outside an email client (or sent via
// the Resend API as a visual test).
// Usage: node scripts/render-otp-preview.mjs [output.html] [otp]
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

// Pull the html:[ ... ].join('') literal out of sendVerificationEmail.
const m = src.match(/html: \[([\s\S]*?)\]\.join\(''\),\n\s*\}\),/);
if (!m) {
  console.error("OTP html template not found in source");
  process.exit(1);
}

const OTP = process.argv[3] ?? "482913";
const arrSrc = m[1].replaceAll("${MARK_URL}", "MARK_URL_SENTINEL").replaceAll("${otp}", "OTP_SENTINEL");
const rawParts = eval(`[${arrSrc}]`);
const html = rawParts
  .join("")
  .replaceAll("MARK_URL_SENTINEL", MARK_URL)
  .replaceAll("OTP_SENTINEL", OTP);

const out = process.argv[2] ?? "/tmp/otp-branded.html";
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, otp=${OTP})`);
