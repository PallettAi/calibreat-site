/**
 * License re-attestation policy (npm run check:license).
 *
 * Release builds must not treat a missing API URL as "valid", and a 4xx from
 * the server must lock — it is the server refusing, not a transient failure.
 * Only 5xx and unreachable hosts fail open.
 */
import {
  createInstallId,
  formatDeviceLabel,
  interpretDeactivateResponse,
  interpretValidateResponse,
  isUuidV4,
  localValidateShortcut,
} from '../src/lib/license-check.ts';
import { isWellFormedCode, normalizeCode } from '../src/lib/license-code.ts';
import { readFileSync } from 'node:fs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

eq('dev with no API URL trusts the local license', localValidateShortcut('', true)?.ok, true);
eq('dev with no API URL reports valid', localValidateShortcut('', true)?.valid, true);
eq('release with no API URL does not report valid', localValidateShortcut('', false)?.ok, false);
eq('configured URL has no shortcut', localValidateShortcut('https://api.example', false), null);

// A 4xx is the server being reached and refusing, so it must lock — treating
// it as transient let a forged AsyncStorage entry (or a blocked API host)
// unlock every paid screen, because license-context only clears on ok && !valid.
const notFound = interpretValidateResponse(404, { message: 'This code is not recognized.' });
eq('404 is a definitive lock', notFound.ok, true);
eq('404 is invalid', notFound.valid, false);
eq('404 keeps the server message', notFound.reason, 'This code is not recognized.');

const forbidden = interpretValidateResponse(403, { message: 'Tied to a different email.' });
eq('403 is a definitive lock', forbidden.ok, true);
eq('403 is invalid', forbidden.valid, false);

const serverError = interpretValidateResponse(500, {});
eq('500 is fail-open', serverError.ok, false);
eq('500 does not claim valid', serverError.valid, undefined);

const revoked = interpretValidateResponse(200, { valid: false, revoked: true });
eq('200 revoked is a definitive lock', revoked.ok, true);
eq('200 revoked is invalid', revoked.valid, false);
eq('200 revoked flag', revoked.revoked, true);

const moved = interpretValidateResponse(200, { valid: false, revoked: false });
eq('200 displaced is a definitive lock', moved.ok, true);
eq('200 displaced is invalid', moved.valid, false);
eq(
  '200 displaced names another device when unlabeled',
  moved.ok === true && moved.valid === false ? moved.reason.includes('another device') : false,
  true,
);

const named = interpretValidateResponse(200, {
  valid: false,
  revoked: false,
  activeDevice: { label: 'Pixel 8', activatedAt: '2026-01-01T00:00:00.000Z' },
});
eq(
  '200 displaced names the holding phone',
  named.ok === true && named.valid === false ? named.reason.includes('Pixel 8') : false,
  true,
);

eq('formatDeviceLabel prefers model name', formatDeviceLabel({
  modelName: 'Pixel 8',
  osName: 'Android',
  osVersion: '14',
  platform: 'android',
}), 'Pixel 8');
eq('formatDeviceLabel falls back to OS', formatDeviceLabel({
  modelName: null,
  osName: 'iOS',
  osVersion: '18.1',
  platform: 'ios',
}), 'iOS 18.1');
eq('formatDeviceLabel last resort on iOS', formatDeviceLabel({
  modelName: '',
  osName: null,
  platform: 'ios',
}), 'iPhone');

eq('deactivate unreachable keeps the local license', interpretDeactivateResponse(0, false).ok, false);
eq('deactivate HTTP 200 clears locally', interpretDeactivateResponse(200, true).ok, true);
eq('deactivate HTTP 500 keeps the local license', interpretDeactivateResponse(500, true).ok, false);

const good = interpretValidateResponse(200, { valid: true });
eq('200 valid stays unlocked', good.ok, true);
eq('200 valid flag', good.valid, true);

const dodoKey = '0a29a466-9553-4aa6-b714-b61692b55130';
eq(
  'Dodo UUID groups into 4-char blocks',
  normalizeCode(dodoKey),
  '0A29-A466-9553-4AA6-B714-B616-92B5-5130',
);
eq('Dodo UUID is well-formed after normalize', isWellFormedCode(normalizeCode(dodoKey)) ? 1 : 0, 1);
eq('display code AB12-CD34-EF56 still normalizes', normalizeCode('ab12-cd34-ef56'), 'AB12-CD34-EF56');

eq('install id is uuid v4', isUuidV4(createInstallId()) ? 1 : 0, 1);
eq('two install ids differ', createInstallId() === createInstallId() ? 0 : 1, 1);
let missingCryptoThrew = 0;
try {
  createInstallId(null);
} catch {
  missingCryptoThrew = 1;
}
eq('install id refuses insecure fallback', missingCryptoThrew, 1);

// ---------------------------------------------------------------------------
// No license call may hang
//
// Every other network call in the app caps itself with an AbortController. The
// activation endpoints did not, and a connection that opens and never answers
// (captive portal, half-dead mobile data) left the button spinning forever with
// no error and no way out except a force-quit. Source-level because the failure
// is a missing line, not a wrong return value.
// ---------------------------------------------------------------------------
const licenseSrc = readFileSync(new URL('../src/lib/license.ts', import.meta.url), 'utf8');
const fetchCalls = [...licenseSrc.matchAll(/await fetch\(([\s\S]{0,600}?)\);/g)].map((m) => m[1]);
ok('license module still talks to the server', fetchCalls.length > 0);
ok(
  'every raw fetch in license.ts passes an abort signal',
  fetchCalls.every((call) => /signal:\s*controller\.signal/.test(call)),
);
ok('the activation helper exists', /async function licenseFetch\(/.test(licenseSrc));
ok(
  'the activation helper aborts on a timer',
  /setTimeout\(\(\) => controller\.abort\(\), ACTIVATE_TIMEOUT_MS\)/.test(licenseSrc),
);
for (const path of ['/v1/activate', '/v1/request-verification', '/v1/verify-email', '/v1/deactivate', '/v1/release']) {
  ok(`${path} goes through the timeout helper`, licenseSrc.includes(`licenseFetch(apiUrl, '${path}'`));
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
