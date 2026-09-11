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

// ── share cards (what X, Slack, WhatsApp and iMessage render) ──────────────
// Declaring a card is not the same as the card having an image. The site once
// shipped `twitter:card = summary_large_image` on pages that declared no image
// at all, so every share of it rendered blank until the crawler cache expired —
// and X has retired the Card Validator, so there was no way to force a refresh.
// These assertions cover the whole page -> URL -> file chain.
console.log('\n── share cards ──');

const metaContent = (html, key) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return m ? m[1] : '';
};

/** Real dimensions straight out of the PNG IHDR chunk — no image dependencies. */
function pngSize(file) {
  const buf = readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(signature)) return null;
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const page of indexable) {
  const html = read(page);
  const card = metaContent(html, 'twitter:card');
  const ogImage = metaContent(html, 'og:image');
  const twitterImage = metaContent(html, 'twitter:image');

  check(`${page}: card is summary_large_image`, card === 'summary_large_image', card || 'missing');
  check(`${page}: twitter:image matches og:image`,
    Boolean(twitterImage) && twitterImage === ogImage,
    `og:image ${ogImage || '(missing)'} vs twitter:image ${twitterImage || '(missing)'}`);
  check(`${page}: image url is absolute https on the canonical host`,
    /^https:\/\/calibreat\.co\.uk\//.test(ogImage), ogImage || '(missing)');
  check(`${page}: og:image:alt describes the card`,
    metaContent(html, 'og:image:alt').length >= 20);

  const file = ogImage ? join(WEB, ogImage.replace('https://calibreat.co.uk/', '')) : '';
  if (!file || !existsSync(file)) {
    fail(`${page}: card image exists on disk`, file || ogImage || '(missing)');
    continue;
  }

  const size = pngSize(file);
  check(`${page}: card image is a real PNG`, Boolean(size));
  if (!size) continue;
  check(`${page}: card image is big enough for the crop`,
    size.width >= 1200 && size.height >= 600, `${size.width}x${size.height}`);
  // X crops large cards to 1.91:1, so a very different file gets cut off oddly.
  const ratio = size.width / size.height;
  check(`${page}: card image is near the 1.91:1 crop`, ratio > 1.8 && ratio < 2.0, ratio.toFixed(2));
  const declaredWidth = Number(metaContent(html, 'og:image:width'));
  const declaredHeight = Number(metaContent(html, 'og:image:height'));
  check(`${page}: declared dimensions match the file`,
    declaredWidth === size.width && declaredHeight === size.height,
    `declared ${declaredWidth}x${declaredHeight}, file ${size.width}x${size.height}`);
}

// ── security headers (what the site cannot deliver as meta tags) ────────────
// Cloudflare Pages serves apps/web/_headers and apps/web/serve.py reads the same
// file for local development, so there is no second copy to drift. These
// assertions cover the directives the site genuinely needs: a CSP that drops
// fonts or data: images breaks pages in production only, which is the worst
// possible place to find out.
console.log('\n── security headers (_headers) ──');

if (!existsSync(join(WEB, '_headers'))) {
  fail('apps/web/_headers exists', 'Cloudflare Pages serves security headers from it');
} else {
  const rules = new Map();
  let currentPath = null;
  let malformedLines = 0;
  for (const line of readFileSync(join(WEB, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      currentPath = line.trim();
      rules.set(currentPath, []);
      continue;
    }
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!currentPath || !match) {
      malformedLines += 1;
      continue;
    }
    rules.get(currentPath).push({ name: match[1].trim(), value: match[2].trim() });
  }

  check('_headers: every line is a pattern or a well-formed header',
    malformedLines === 0, `${malformedLines} malformed line(s)`);
  check('_headers: within the 100-rule limit', rules.size <= 100, `${rules.size} rules`);

  const global = rules.get('/*') ?? [];
  const headerValue = (name) => global.find((h) => h.name === name)?.value ?? '';
  const csp = headerValue('Content-Security-Policy');

  check('_headers: declares a /* rule', rules.has('/*'));
  check('_headers: Content-Security-Policy', Boolean(csp));
  check('_headers: X-Content-Type-Options: nosniff', headerValue('X-Content-Type-Options') === 'nosniff');
  check('_headers: Referrer-Policy', Boolean(headerValue('Referrer-Policy')));
  check('_headers: X-Frame-Options', Boolean(headerValue('X-Frame-Options')));

  const directives = [
    ["default-src 'self'", /default-src 'self'/],
    ["frame-ancestors 'none' (ignored in a meta tag, hence the header)", /frame-ancestors 'none'/],
    ['img-src allows data: (inline SVG brand marks)', /img-src[^;]*data:/],
    ['style-src allows the Google Fonts stylesheet', /style-src[^;]*fonts\.googleapis\.com/],
    ['font-src allows the Google Fonts files', /font-src[^;]*fonts\.gstatic\.com/],
    ['script-src is declared', /script-src/],
  ];
  for (const [label, pattern] of directives) {
    check(`_headers CSP: ${label}`, pattern.test(csp));
  }

  const overlong = [...rules.values()].flat()
    .filter((h) => `${h.name}: ${h.value}`.length > 2000);
  check('_headers: header lines under the 2,000-character limit',
    overlong.length === 0, `${overlong.length} too long`);

  // The security policy belongs in a header. A meta-tag CSP is ignored for
  // frame-ancestors and warns on every page load, so its presence is a bug.
  for (const page of pages) {
    check(`${page}: no meta-tag Content-Security-Policy`,
      !read(page).includes('Content-Security-Policy'));
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
