import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkAll,
  checkTarget,
  decideAlert,
  downEmailBody,
  downEmailSubject,
  upEmailSubject,
  upEmailBody,
  type FetchFn,
  type Target,
} from '../src/pinger.ts';

const apiTarget: Target = {
  name: 'license API',
  url: 'https://example.test/health',
  bodyKeyword: 'calibreat-license',
};
const siteTarget: Target = { name: 'website', url: 'https://example.test/' };

function fetchReturning(status: number, body = ''): FetchFn {
  return (async () => new Response(body, { status })) as unknown as FetchFn;
}

function fetchThrowing(message: string): FetchFn {
  return (async () => {
    throw new Error(message);
  }) as unknown as FetchFn;
}

describe('checkTarget', () => {
  it('healthy: 200 + keyword present → up', async () => {
    const r = await checkTarget(apiTarget, fetchReturning(200, '{"ok":true,"service":"calibreat-license"}'));
    assert.equal(r.up, true);
    assert.equal(r.status, 200);
  });

  it('200 with wrong body → down with detail', async () => {
    const r = await checkTarget(apiTarget, fetchReturning(200, '{"ok":false}'));
    assert.equal(r.up, false);
    assert.match(r.detail ?? '', /missing/);
  });

  it('500 → down with HTTP detail', async () => {
    const r = await checkTarget(siteTarget, fetchReturning(500));
    assert.equal(r.up, false);
    assert.equal(r.status, 500);
  });

  it('network error → down with error detail', async () => {
    const r = await checkTarget(siteTarget, fetchThrowing('boom'));
    assert.equal(r.up, false);
    assert.match(r.detail ?? '', /boom/);
  });
});

describe('checkAll', () => {
  it('checks every target and reports per-target results', async () => {
    const fetchFn = (input: string) =>
      input.includes('/health')
        ? Promise.resolve(new Response('{"service":"calibreat-license"}'))
        : Promise.resolve(new Response('', { status: 503 }));
    const results = await checkAll([apiTarget, siteTarget], fetchFn as unknown as FetchFn);
    assert.equal(results[0]!.up, true);
    assert.equal(results[1]!.up, false);
  });
});

describe('decideAlert', () => {
  const up = [{ name: 'license API', url: 'u', up: true }];
  const down = [{ name: 'license API', url: 'u', up: false, detail: 'HTTP 500' }];

  it('first cycle, all up → silent', () => {
    assert.deepEqual(decideAlert(up, undefined), { kind: 'none' });
  });

  it('first cycle, something down → down alert immediately', () => {
    assert.deepEqual(decideAlert(down, undefined), { kind: 'down', downTargets: down });
  });

  it('up → down transition alerts', () => {
    assert.deepEqual(decideAlert(down, { 'license API': true }), { kind: 'down', downTargets: down });
  });

  it('down → up transition alerts', () => {
    assert.deepEqual(decideAlert(up, { 'license API': false }), { kind: 'up' });
  });

  it('steady down → silent (no spam)', () => {
    assert.deepEqual(decideAlert(down, { 'license API': false }), { kind: 'none' });
  });

  it('steady up → silent', () => {
    assert.deepEqual(decideAlert(up, { 'license API': true }), { kind: 'none' });
  });
});

describe('emails', () => {
  it('down email names the failing targets and marks itself automated', () => {
    const down = [{ name: 'website', url: 'https://example.test/', up: false, detail: 'HTTP 503' }];
    assert.equal(downEmailSubject(down), 'calibrEAT DOWN: website');
    assert.match(downEmailBody(down), /website — https:\/\/example\.test\/ \(HTTP 503\)/);
    assert.match(downEmailBody(down), /do not reply/);
  });

  it('up email marks itself automated', () => {
    assert.match(upEmailSubject(), /UP again/);
    assert.match(upEmailBody(), /do not reply/);
  });
});
