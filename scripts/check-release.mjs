/**
 * Release-config checks (node scripts/check-release.mjs [--online]).
 *
 * The Android APK is built from two files that must agree with the repo around
 * them: `apps/mobile/eas.json` (what gets baked in) and `apps/web/download.html`
 * (where the released file is offered). Neither is typechecked, and a mistake
 * in either one only shows up after a ~15 minute cloud build — or, worse, after
 * a customer has paid. So the invariants live here, and CI runs them.
 *
 * Checks:
 *  1. eas.json builds an APK (an .aab cannot be sideloaded from the website),
 *     from the local version source, with one licence-API URL across profiles.
 *  2. That URL's host matches the Worker name in apps/api/wrangler.toml, so a
 *     renamed or re-deployed Worker can't silently orphan the app.
 *  3. app.json and package.json agree on the version, and versionCode is real.
 *  4. download.html defines APK_URL exactly once and pairs it with #apk-btn —
 *     the site used to wire a button that did not exist, so this asserts the
 *     page could actually serve the download.
 *  5. Once APK_URL points at a hosted file, it must be https, an .apk, and
 *     named after the app version (no release whose file disagrees with the
 *     build). While it is still the placeholder that is a NOTICE, not a FAIL.
 *  6. Build output can never be committed.
 *
 * `--online` additionally probes {API}/health, which CI skips so a Cloudflare
 * hiccup can't fail a pull request. Run it before a release build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const json = (...p) => JSON.parse(read(...p));

const ONLINE = process.argv.includes('--online');
const PLACEHOLDER = '#apk-coming-soon';

let fails = 0;
const pass = (label) => console.log(`PASS    ${label}`);
const notice = (label) => console.log(`NOTICE  ${label}`);
const fail = (label, detail) => {
  fails += 1;
  console.log(`FAIL    ${label}${detail ? ` — ${detail}` : ''}`);
};
const check = (label, condition, detail) => (condition ? pass(label) : fail(label, detail));

const eas = json('apps', 'mobile', 'eas.json');
const app = json('apps', 'mobile', 'app.json').expo;
const pkg = json('apps', 'mobile', 'package.json');
const html = read('apps', 'web', 'download.html');
const wrangler = read('apps', 'api', 'wrangler.toml');

// ── 1. the build produces something a phone can install ────────────────────
console.log('── APK build profiles (apps/mobile/eas.json) ──');

check('cli.appVersionSource is local', eas.cli?.appVersionSource === 'local',
  `got ${JSON.stringify(eas.cli?.appVersionSource)}`);

const profiles = eas.build ?? {};
const PROFILES = ['preview', 'production'];
for (const name of PROFILES) {
  const profile = profiles[name];
  if (!profile) {
    fail(`profile "${name}" exists`);
    continue;
  }
  check(`${name}: buildType is apk`, profile.android?.buildType === 'apk',
    `got ${JSON.stringify(profile.android?.buildType)} — an .aab cannot be sideloaded from the website`);
  check(`${name}: not a store build`, profile.distribution !== 'store',
    'distribution "store" contradicts an APK download');
  check(`${name}: licence API URL is set`, typeof profile.env?.EXPO_PUBLIC_LICENSE_API_URL === 'string',
    'release builds fail closed without it, so the APK would be unusable');
}

check('extra build profiles are not left unconfigured',
  Object.keys(profiles).every((k) => PROFILES.includes(k)),
  `unknown: ${Object.keys(profiles).filter((k) => !PROFILES.includes(k)).join(', ')}`);

// ── 2. every profile points at the deployed Worker ─────────────────────────
console.log('\n── licence API URL ──');

const urls = PROFILES.map((n) => profiles[n]?.env?.EXPO_PUBLIC_LICENSE_API_URL).filter(Boolean);
check('all profiles use one URL', new Set(urls).size === 1, `found ${new Set(urls).size} distinct`);

const apiUrl = urls[0] ?? '';
let host = '';
try {
  const parsed = new URL(apiUrl);
  host = parsed.host;
  check('URL is https', parsed.protocol === 'https:', parsed.protocol);
} catch {
  fail('URL parses', apiUrl || '(missing)');
}

const workerName = wrangler.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? '';
check('worker name is declared in wrangler.toml', Boolean(workerName));
if (host && workerName) {
  check('API host matches the declared Worker', host === `${workerName}.${host.split('.').slice(1).join('.')}`,
    `${host} does not start with ${workerName}. — a renamed Worker would orphan this URL`);
}
check('the app does not hardcode the API host',
  !read('apps', 'mobile', 'src', 'constants', 'app.ts').includes(host),
  'the URL must come from the build config, not the source');

// ── 3. app identity ───────────────────────────────────────────────────────
console.log('\n── version + package ──');

check('android.package is set', typeof app.android?.package === 'string' && app.android.package.includes('.'),
  `got ${JSON.stringify(app.android?.package)}`);
check('app.json version matches package.json',
  app.version === pkg.version, `app.json ${app.version} vs package.json ${pkg.version}`);
check('versionCode is a positive integer',
  Number.isInteger(app.android?.versionCode) && app.android.versionCode > 0,
  `got ${JSON.stringify(app.android?.versionCode)} — bump it with every published APK so upgrades install`);

if (!existsSync(join(ROOT, 'apps', 'mobile', 'extra.eas.projectId'))) {
  // projectId lives inside app.json once `eas init` has run.
  if (!app.extra?.eas?.projectId) {
    notice('no extra.eas.projectId yet — run `npx eas-cli@latest init` once before the first build');
  }
}

const iosIcon = app.ios?.icon;
if (iosIcon && !existsSync(join(ROOT, 'apps', 'mobile', iosIcon))) {
  notice(`ios.icon "${iosIcon}" does not exist — Android builds are unaffected, but iOS will fail`);
}

// ── 4/5. the download page can actually serve it ──────────────────────────
console.log('\n── download page ──');

const apkUrlMatches = [...html.matchAll(/const APK_URL = "([^"]*)"/g)].map((m) => m[1]);
check('APK_URL is defined exactly once', apkUrlMatches.length === 1, `found ${apkUrlMatches.length}`);
check('the Android card has an #apk-btn for APK_URL to drive',
  html.includes('id="apk-btn"'),
  'APK_URL is inert without it — this is the bug the check exists to stop');

const apkUrl = apkUrlMatches[0] ?? '';
if (apkUrl === PLACEHOLDER) {
  notice(`APK_URL is still the placeholder — the site honestly says "in progress".
        After the build, upload the .apk and set:
          const APK_URL = "<hosted url>/calibrEAT-${app.version}.apk";`);
} else {
  check('APK_URL is https', apkUrl.startsWith('https://'), apkUrl);
  check('APK_URL is an .apk', apkUrl.split('?')[0].endsWith('.apk'), apkUrl);
  check('APK_URL names this app version', apkUrl.includes(app.version),
    `${apkUrl} does not contain ${app.version} — the hosted file and the build would disagree`);
}

// ── 6. build output stays out of git ──────────────────────────────────────
console.log('\n── build output ──');

// Ask git rather than pattern-matching a file, so nested .gitignore files count —
// the rule that actually protects the keystore lives in apps/mobile/.gitignore.
const neverCommit = [
  'apps/mobile/calibrEAT.apk',
  'apps/web/calibrEAT.apk',
  'apps/mobile/calibrEAT.aab',
  'apps/mobile/release.jks',
  'apps/mobile/release.keystore',
];

function isIgnored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function inGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (inGitRepo()) {
  for (const path of neverCommit) {
    check(`git ignores ${path}`, isIgnored(path),
      'build output and signing material must never be committable');
  }
} else {
  notice('not a git checkout — skipped the ignore checks');
}

// ── optional: the API the APK will talk to is actually up ─────────────────
if (ONLINE) {
  console.log('\n── live API ──');
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => null);
    check('/health responds ok', res.ok && body?.ok === true, `HTTP ${res.status}`);
  } catch (error) {
    fail('/health is reachable', error instanceof Error ? error.message : String(error));
  }
} else {
  console.log('\n(NOTICE) skipping the live /health probe — run with --online before a release build');
}

console.log(
  fails === 0
    ? `\nAll release checks passed${apkUrl === PLACEHOLDER ? ' (APK not published yet — see the notice above)' : ''}.`
    : `\n${fails} release check${fails === 1 ? '' : 's'} failed.`,
);

process.exit(fails === 0 ? 0 : 1);
