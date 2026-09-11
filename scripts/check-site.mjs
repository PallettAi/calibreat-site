/**
 * Static checks for the marketing site (node scripts/check-site.mjs).
 *
 * The site is hand-written static HTML with no build step, so the only place to
 * catch a broken link, a missing meta tag, a second checkout URL or an
 * inaccessible ✓/– mark is a script like this one. Runs in CI.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web');

let fails = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail) => {
  fails += 1;
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const check = (label, condition, detail) => (condition ? pass(label) : fail(label, detail));

const pages = readdirSync(WEB)
  .filter((f) => f.endsWith('.html'))
  .sort();
const read = (file) => readFileSync(join(WEB, file), 'utf8');

// 404 is excluded from the sitemap/canonical expectations below.
const indexable = pages.filter((f) => f !== '404.html');

console.log(`── pages (${pages.length}) ──`);

for (const page of pages) {
  const html = read(page);
  const required = [
    ['lang attribute', /<html[^>]*\slang="/],
    ['viewport meta', /<meta name="viewport"/],
    ['title', /<title>\s*\S+[\s\S]*?<\/title>/],
    ['description meta', /<meta name="description" content="[^"]{40,}"/],
    ['canonical link', /<link rel="canonical" href="https:\/\/calibreat\.co\.uk/],
    ['theme-color meta', /<meta name="theme-color"/],
    ['focus-visible styling', /:focus-visible/],
    ['closing html tag', /<\/html>/],
  ];
  for (const [label, pattern] of required) {
    check(`${page}: ${label}`, pattern.test(html));
  }
  if (page !== '404.html') {
    check(`${page}: og:image`, /<meta property="og:image"/.test(html));
  }
}

console.log('\n── checkout url is single-sourced ──');

const urlPattern = /https:\/\/checkout\.dodopayments\.com\/buy\/[A-Za-z0-9_?=&-]+/g;
const found = new Map();
for (const page of pages) {
  for (const url of read(page).match(urlPattern) ?? []) {
    if (!found.has(url)) found.set(url, []);
    found.get(url).push(page);
  }
}
check('checkout url appears at least once', found.size > 0);
if (found.size > 1) {
  fail('exactly one checkout url', [...found.keys()].join(' vs '));
} else if (found.size === 1) {
  pass(`exactly one checkout url (${found.size})`);
}
for (const page of pages) {
  const html = read(page);
  const config = /const CHECKOUT_URL = "([^"]+)"/.exec(html)?.[1];
  if (!config) continue;
  const hrefs = new Set(html.match(urlPattern) ?? []);
  check(
    `${page}: checkout hrefs match CHECKOUT_URL`,
    hrefs.size === 0 || (hrefs.size === 1 && hrefs.has(config)),
    [...hrefs].join(', '),
  );
}

console.log('\n── compare table marks are announced ──');

const index = read('index.html');
const marks = index.match(/<span class="mark-(yes|no)"[^>]*>/g) ?? [];
const unlabelled = marks.filter((m) => !/aria-label=/.test(m));
check(`compare marks present (${marks.length})`, marks.length > 0);
check('every mark carries an aria-label', unlabelled.length === 0, `${unlabelled.length} unlabelled`);
check('no caption inside the scrolling table', !/<table class="compare">[\s\S]*?<caption/.test(index));

console.log('\n── local links and assets resolve ──');

const refs = new Set();
for (const page of pages) {
  const html = read(page);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(https?:|mailto:|tel:|data:|#|javascript:)/.test(value)) continue;
    refs.add(value.split(/[?#]/)[0]);
  }
}
for (const ref of [...refs].sort()) {
  if (!ref) continue;
  check(`asset exists: ${ref}`, existsSync(join(WEB, ref)));
}

console.log('\n── sitemap covers the site ──');

const sitemap = readFileSync(join(WEB, 'sitemap.xml'), 'utf8');
for (const page of indexable) {
  const loc = page === 'index.html' ? 'https://calibreat.co.uk/' : `https://calibreat.co.uk/${page}`;
  check(`sitemap lists ${page}`, sitemap.includes(`<loc>${loc}</loc>`));
}
check('sitemap excludes the 404 page', !sitemap.includes('404.html'));

console.log(fails === 0 ? '\nALL SITE CHECKS PASSED' : `\n${fails} SITE CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
