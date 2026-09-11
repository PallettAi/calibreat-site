/**
 * License re-attestation policy (npm run check:license).
 *
 * Release builds must not treat a missing API URL as "valid", and HTTP 404
 * must fail-open so a wrong base URL cannot wipe a paying user's license.
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

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq('dev with no API URL trusts the local license', localValidateShortcut('', true)?.ok, true);
eq('dev with no API URL reports valid', localValidateShortcut('', true)?.valid, true);
eq('release with no API URL does not report valid', localValidateShortcut('', false)?.ok, false);
eq('configured URL has no shortcut', localValidateShortcut('https://api.example', false), null);

const notFound = interpretValidateResponse(404, { message: 'This code is not recognized.' });
eq('404 is fail-open (not revoked)', notFound.ok, false);

const serverError = interpretValidateResponse(500, {});
eq('500 is fail-open', serverError.ok, false);

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

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
