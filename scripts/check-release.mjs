/**
 * Release-config checks (node scripts/check-release.mjs).
 *
 * The Android APK is built from two files that must agree with the repo around
 * them: `apps/mobile/eas.json` (the build profiles) and `apps/web/download.html`
 * (where the released file is offered). Neither is typechecked, and a mistake
 * in either one only shows up after a ~15 minute cloud build. So the invariants
 * live here, and CI runs them.
 *
 * Checks:
 *  1. eas.json builds an APK (an .aab cannot be sideloaded from the website),
 *     from the local version source.
 *  2. app.json and package.json agree on the version, and versionCode is real.
 *  3. download.html defines APK_URL exactly once and pairs it with #apk-btn —
 *     the site used to wire a button that did not exist, so this asserts the
 *     page could actually serve the download.
 *  4. Once APK_URL points at a hosted file, it must be https, an .apk, and
 *     named after the app version (no release whose file disagrees with the
 *     build). While it is still the placeholder that is a NOTICE, not a FAIL.
 *  5. Build output can never be committed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const json = (...p) => JSON.parse(read(...p));

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

// ── 1. the build produces something a phone can install ────────────────────
console.log('── APK build profiles (apps/mobile/eas.json) ──');

check('cli.appVersionSource is local', eas.cli?.appVersionSource === 'local',
  `got ${JSON.stringify(eas.cli?.appVersionSource)}`);

const profiles = eas.build ?? {};
const PROFILES = ['development', 'preview', 'production'];
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
  check(`${name}: EAS Update channel is set`, profile.channel === name,
    `got ${JSON.stringify(profile.channel)} — must be "${name}" so OTA hotfixes target the right build`);
}
check('development profile enables developmentClient',
  profiles.development?.developmentClient === true,
  'development profile must set developmentClient: true for live LAN reload');

check('extra build profiles are not left unconfigured',
  Object.keys(profiles).every((k) => PROFILES.includes(k)),
  `unknown: ${Object.keys(profiles).filter((k) => !PROFILES.includes(k)).join(', ')}`);

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

const projectId = app.extra?.eas?.projectId ?? '';
check('EAS Update URL is configured for OTA hotfixes',
  Boolean(projectId) && app.updates?.url === `https://u.expo.dev/${projectId}`,
  `got ${JSON.stringify(app.updates?.url)}`);
check('runtimeVersion policy is appVersion',
  app.runtimeVersion?.policy === 'appVersion',
  `got ${JSON.stringify(app.runtimeVersion)}`);
check('RECORD_AUDIO permission is blocked on Android',
  Array.isArray(app.android?.blockedPermissions) &&
    app.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'),
  'calibrEAT never records audio; block the transitive permission so the install screen stays clean');

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

console.log(
  fails === 0
    ? `\nAll release checks passed${apkUrl === PLACEHOLDER ? ' (APK not published yet — see the notice above)' : ''}.`
    : `\n${fails} release check${fails === 1 ? '' : 's'} failed.`,
);

process.exit(fails === 0 ? 0 : 1);
