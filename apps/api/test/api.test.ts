import assert from 'node:assert/strict';
import { test } from 'node:test';

import { configFromEnv } from '../src/config.ts';
import { generateCode, hashCode } from '../src/license.ts';
import { handleHttp, type HttpRequest } from '../src/router.ts';
import { InMemoryStore } from '../src/store.ts';

// Same code path the Worker runs (handleHttp inside the Durable Object),
// driven by the in-memory store + dev email capture.
const store = new InMemoryStore();
const config = configFromEnv({ REQUEST_COOLDOWN_MS: '100' });

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const req: HttpRequest = { method, path, body: body ?? {}, headers };
  return handleHttp({ store, config }, req);
}

/** Registers a fresh license and returns { code, email }. */
async function seedLicense(email: string): Promise<string> {
  const code = generateCode();
  await store.upsertLicense({
    codeHash: await hashCode(code),
    email,
    createdAt: new Date().toISOString(),
    revoked: false,
  });
  return code;
}

const { devCapturedOtps } = await import('../src/email.ts');

/** Completes the email OTP gate so /v1/activate will accept this address. */
async function proveEmail(email: string): Promise<void> {
  const sent = await api('POST', '/v1/request-verification', { email });
  assert.equal(sent.status, 200);
  const otp = devCapturedOtps[email];
  assert.equal(typeof otp, 'string');
  const verified = await api('POST', '/v1/verify-email', { email, otp });
  assert.equal(verified.status, 200);
}

test('health check', async () => {
  const { status, body } = await api('GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('request-verification sends a code, then enforces cooldown', async () => {
  const email = 'buyer@example.com';
  const first = await api('POST', '/v1/request-verification', { email });
  assert.equal(first.status, 200);
  assert.equal(typeof devCapturedOtps[email], 'string');
  assert.match(devCapturedOtps[email]!, /^\d{6}$/);

  const second = await api('POST', '/v1/request-verification', { email });
  assert.equal(second.status, 429);

  // After the (short) cooldown, a new code can be requested again.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const third = await api('POST', '/v1/request-verification', { email });
  assert.equal(third.status, 200);

  const bad = await api('POST', '/v1/request-verification', { email: 'not-an-email' });
  assert.equal(bad.status, 400);
});

test('request-verification caps how many codes an email can request in a window', async () => {
  const capped = configFromEnv({
    REQUEST_COOLDOWN_MS: '1',
    MAX_OTP_SENDS: '3',
    OTP_SEND_WINDOW_MS: '60000',
  });
  const email = 'otp-spam@example.com';
  const call = () =>
    handleHttp(
      { store, config: capped },
      { method: 'POST', path: '/v1/request-verification', body: { email } },
    );

  for (let i = 0; i < 3; i += 1) {
    const res = await call();
    assert.equal(res.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const blocked = await call();
  assert.equal(blocked.status, 429);
});

test('verify-email accepts the real code once and rejects wrong/replayed codes', async () => {
  const email = 'verify@example.com';
  await api('POST', '/v1/request-verification', { email });
  const otp = devCapturedOtps[email]!;

  const wrong = await api('POST', '/v1/verify-email', { email, otp: '000000' });
  assert.equal(wrong.status, 400);

  const right = await api('POST', '/v1/verify-email', { email, otp });
  assert.equal(right.status, 200);
  assert.equal(right.body.verified, true);

  const replay = await api('POST', '/v1/verify-email', { email, otp });
  assert.equal(replay.status, 400);
});

test('activation requires a completed email OTP first', async () => {
  const email = 'needs-otp@example.com';
  const code = await seedLicense(email);

  const skipped = await api('POST', '/v1/activate', { code, email, installId: 'dev-otp' });
  assert.equal(skipped.status, 403);

  await proveEmail(email);
  const first = await api('POST', '/v1/activate', { code, email, installId: 'dev-otp' });
  assert.equal(first.status, 200);
  assert.equal(first.body.valid, true);

  // Same device can re-activate without a fresh OTP (reinstall / retry).
  const again = await api('POST', '/v1/activate', { code, email, installId: 'dev-otp' });
  assert.equal(again.status, 200);
});

test('activation binds the code to the purchase email only', async () => {
  const email = 'buyer-activate@example.com';
  const code = await seedLicense(email);
  const otherEmail = 'someone-else@example.com';
  await proveEmail(email);
  await proveEmail(otherEmail);

  const unknown = await api('POST', '/v1/activate', {
    code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
    email,
    installId: 'dev-1',
  });
  assert.equal(unknown.status, 404);

  const wrongEmail = await api('POST', '/v1/activate', { code, email: otherEmail, installId: 'dev-1' });
  assert.equal(wrongEmail.status, 403);

  const first = await api('POST', '/v1/activate', { code, email, installId: 'dev-1' });
  assert.equal(first.status, 200);
  assert.equal(first.body.valid, true);
  assert.equal(first.body.plan, 'lifetime');
  assert.equal(first.body.customerEmail, email);

  // Same email + new device → the slot moves (transferable via email).
  const moved = await api('POST', '/v1/activate', { code, email, installId: 'dev-2' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.valid, true);

  // The slot now belongs to dev-2; the old device must no longer validate.
  const oldDevice = await api('POST', '/v1/validate', { code, email, installId: 'dev-1' });
  assert.equal(oldDevice.status, 200);
  assert.equal(oldDevice.body.valid, false);

  const validate = await api('POST', '/v1/validate', { code, email, installId: 'dev-2' });
  assert.equal(validate.status, 200);
  assert.equal(validate.body.valid, true);
});

test('deactivate frees the slot; validate then reports inactive', async () => {
  const email = 'deact@example.com';
  const code = await seedLicense(email);
  await proveEmail(email);
  await api('POST', '/v1/activate', { code, email, installId: 'dev-a' });

  const wrongDevice = await api('POST', '/v1/deactivate', { code, email, installId: 'dev-b' });
  assert.equal(wrongDevice.status, 200);

  const right = await api('POST', '/v1/deactivate', { code, email, installId: 'dev-a' });
  assert.equal(right.status, 200);
  assert.equal(right.body.message, 'License deactivated on this device.');

  const validate = await api('POST', '/v1/validate', { code, email, installId: 'dev-a' });
  assert.equal(validate.body.valid, false);
});

test('MoR webhook is fail-closed without a secret and rejects a bad secret', async () => {
  const email = 'unsigned-hook@example.com';
  const code = generateCode();
  const payload = { event: 'order_created', customer_email: email, license_key: code };

  const unset = await api('POST', '/v1/webhook/mor', payload);
  assert.equal(unset.status, 503);

  const secured = configFromEnv({ MOR_WEBHOOK_SECRET: 'hook-secret' });
  const wrong = await handleHttp(
    { store, config: secured },
    { method: 'POST', path: '/v1/webhook/mor', body: payload, headers: { 'x-webhook-secret': 'nope' } },
  );
  assert.equal(wrong.status, 401);
});

test('MoR webhook registers purchases and revokes refunds', async () => {
  const email = 'webhook@example.com';
  const code = generateCode();
  const hookConfig = configFromEnv({ MOR_WEBHOOK_SECRET: 'hook-secret' });
  const hook = (body: Record<string, unknown>) =>
    handleHttp(
      { store, config: hookConfig },
      {
        method: 'POST',
        path: '/v1/webhook/mor',
        body,
        headers: { 'x-webhook-secret': 'hook-secret' },
      },
    );

  const purchase = await hook({
    event: 'order_created',
    customer_email: email,
    license_key: code,
  });
  assert.equal(purchase.status, 200);

  await proveEmail(email);
  const activate = await api('POST', '/v1/activate', { code, email, installId: 'dev-w' });
  assert.equal(activate.status, 200);

  const refund = await hook({
    event: 'order_refunded',
    customer_email: email,
    license_key: code,
  });
  assert.equal(refund.status, 200);

  const afterRefund = await api('POST', '/v1/activate', { code, email, installId: 'dev-w' });
  assert.equal(afterRefund.status, 403);
});

test('admin endpoint registers a license (token required)', async () => {
  const adminConfig = configFromEnv({ ADMIN_TOKEN: 'sekret' });
  const adminCtx = { store, config: adminConfig };

  const noToken = await handleHttp(adminCtx, {
    method: 'POST',
    path: '/v1/admin/licenses',
    body: { email: 'admin@example.com' },
  });
  assert.equal(noToken.status, 401);

  const withToken = await handleHttp(adminCtx, {
    method: 'POST',
    path: '/v1/admin/licenses',
    body: { email: 'admin@example.com' },
    headers: { authorization: 'Bearer sekret' },
  });
  assert.equal(withToken.status, 200);
  assert.equal(typeof withToken.body.code, 'string');

  await proveEmail('admin@example.com');

  // The registered code now activates.
  const activate = await handleHttp(adminCtx, {
    method: 'POST',
    path: '/v1/activate',
    body: { code: withToken.body.code, email: 'admin@example.com', installId: 'dev-admin' },
  });
  assert.equal(activate.status, 200);
  assert.equal(activate.body.valid, true);
});

test('inbound support webhook verifies, dedupes and stores mail', async () => {
  const { Webhook: SvixWebhook } = await import('svix');
  const secret = 'whsec_' + Buffer.from('test-secret-123-bytes').toString('base64');
  const inbConfig = configFromEnv({
    RESEND_WEBHOOK_SECRET: secret,
    SUPPORT_FROM: 'calibrEAT <no-reply@calibreat.co.uk>',
    RESEND_API_KEY: '', // keep the ack in dev mode (no network in tests)
  });
  const inbCtx = { store, config: inbConfig };

  const payload = {
    type: 'email.received',
    created_at: new Date().toISOString(),
    data: {
      email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
      from: 'Buyer <buyer@example.com>',
      to: ['support@calibreat.co.uk'],
      subject: 'Lost my code',
    },
  };
  const raw = JSON.stringify(payload);

  const wh = new SvixWebhook(secret);
  const msgId = 'msg_test_1';
  const sigHeaders = {
    'svix-id': msgId,
    'svix-timestamp': String(Math.floor(Date.now() / 1000)),
    'svix-signature': wh.sign(msgId, new Date(), raw),
  };

  const call = (rawBody: string, sigs: Record<string, string>) =>
    handleHttp(inbCtx, {
      method: 'POST',
      path: '/v1/webhook/inbound',
      body: { __rawBody: rawBody },
      headers: sigs,
    });

  // Unsigned / wrongly signed requests are rejected.
  const unsigned = await call(raw, {});
  assert.equal(unsigned.status, 401);
  const badSig = await call(raw, { ...sigHeaders, 'svix-signature': 'v1,garbage' });
  assert.equal(badSig.status, 401);

  // A correctly signed event is stored…
  const good = await call(raw, sigHeaders);
  assert.equal(good.status, 200);

  // …and a replay of the same event (same svix id) is deduped.
  const replay = await call(raw, sigHeaders);
  assert.equal(replay.status, 200);

  // Non-support recipients are ignored.
  const otherRaw = JSON.stringify({ ...payload, data: { ...payload.data, to: ['no-reply@calibreat.co.uk'] } });
  const otherSig = {
    'svix-id': 'msg_test_2',
    'svix-timestamp': String(Math.floor(Date.now() / 1000)),
    'svix-signature': wh.sign('msg_test_2', new Date(), otherRaw),
  };
  const ignored = await call(otherRaw, otherSig);
  assert.equal(ignored.status, 200);

  // Admin listing requires a token; this config has none → refuse.
  const list = await handleHttp(inbCtx, {
    method: 'GET',
    path: '/v1/admin/inbound',
    body: {},
  });
  assert.equal(list.status, 401);

  // Read the stored record through the store: exactly one, acked, linked to Resend.
  const items = await store.listInbound(10);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.from, 'Buyer <buyer@example.com>');
  assert.equal(items[0]!.subject, 'Lost my code');
  assert.equal(items[0]!.resendEmailId, '56761188-7520-42d8-8898-ff6fc54ce618');
  assert.equal(items[0]!.acked, true);
});

test('Dodo webhook registers a license_key.created event and revokes on entitlement_grant.revoked', async () => {
  const { Webhook: SvixWebhook } = await import('svix');
  const secret = 'whsec_' + Buffer.from('dodo-test-secret-bytes').toString('base64');
  const dodoConfig = configFromEnv({ DODO_WEBHOOK_SECRET: secret });
  const dodoCtx = { store, config: dodoConfig };
  const email = 'pallettai@proton.me';
  const key = '0a29a466-9553-4aa6-b714-b61692b55130';

  const unset = await handleHttp(
    { store, config: configFromEnv({}) },
    { method: 'POST', path: '/v1/webhook/dodo', body: { __rawBody: '{}' } },
  );
  assert.equal(unset.status, 503);

  const sign = (raw: string, id: string) => {
    const wh = new SvixWebhook(secret);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': wh.sign(id, new Date(Number(timestamp) * 1000), raw),
    };
  };

  const createdRaw = JSON.stringify({
    type: 'license_key.created',
    data: {
      payload_type: 'LicenseKey',
      key,
      customer: { email },
    },
  });
  const unsigned = await handleHttp(dodoCtx, {
    method: 'POST',
    path: '/v1/webhook/dodo',
    body: { __rawBody: createdRaw },
    headers: {},
  });
  assert.equal(unsigned.status, 401);

  const created = await handleHttp(dodoCtx, {
    method: 'POST',
    path: '/v1/webhook/dodo',
    body: { __rawBody: createdRaw },
    headers: sign(createdRaw, 'whmsg_dodo_1'),
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.message, 'License recorded.');

  await proveEmail(email);
  const activate = await api('POST', '/v1/activate', { code: key, email, installId: 'dodo-test' });
  assert.equal(activate.status, 200);

  const revokedRaw = JSON.stringify({
    type: 'entitlement_grant.revoked',
    data: {
      payload_type: 'EntitlementGrant',
      license_key: { key },
      customer: { email },
    },
  });
  const revoked = await handleHttp(dodoCtx, {
    method: 'POST',
    path: '/v1/webhook/dodo',
    body: { __rawBody: revokedRaw },
    headers: sign(revokedRaw, 'whmsg_dodo_2'),
  });
  assert.equal(revoked.status, 200);

  const after = await api('POST', '/v1/activate', { code: key, email, installId: 'dodo-test' });
  assert.equal(after.status, 403);
});

test('Dodo license_key.created with customer_id looks up the buyer email', async () => {
  const { Webhook: SvixWebhook } = await import('svix');
  const secret = 'whsec_' + Buffer.from('dodo-example-secret-bytes').toString('base64');
  const key = 'db44b22c-fe9b-4a68-bf0d-b0e0d6c6c8c0';
  const customerId = 'cus_8VbC6JDZzPEqfBPUdpj0K';
  const email = 'example-buyer@example.com';

  const sign = (raw: string, id: string) => {
    const wh = new SvixWebhook(secret);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': wh.sign(id, new Date(Number(timestamp) * 1000), raw),
    };
  };

  const exampleRaw = JSON.stringify({
    business_id: 'bus_P3SXLcppjXgagmHSVaH3N',
    type: 'license_key.created',
    timestamp: '2025-08-04T05:43:19.882409Z',
    data: {
      activations_limit: null,
      business_id: 'bus_P3SXLcppjXgagmHSVaH3N',
      created_at: '2025-08-04T05:43:19.882409Z',
      customer_id: customerId,
      expires_at: null,
      id: 'lic_bL8HwBAMfuQKS8HODxegO',
      instances_count: 0,
      key,
      payload_type: 'LicenseKey',
      payment_id: 'pay_E5v6dwdKJCg83Gcxd3TRA',
      product_id: 'pdt_64iOqOi80QypjfohmrwAH',
      source: 'auto',
      status: 'active',
      subscription_id: null,
    },
  });

  const missingLookup = configFromEnv({ DODO_WEBHOOK_SECRET: secret });
  const rejected = await handleHttp(
    { store, config: missingLookup },
    {
      method: 'POST',
      path: '/v1/webhook/dodo',
      body: { __rawBody: exampleRaw },
      headers: sign(exampleRaw, 'whmsg_dodo_example_1'),
    },
  );
  assert.equal(rejected.status, 400);

  const withLookup = {
    ...configFromEnv({ DODO_WEBHOOK_SECRET: secret }),
    dodoLookupCustomer: async (id: string) => (id === customerId ? email : null),
  };
  const accepted = await handleHttp(
    { store, config: withLookup },
    {
      method: 'POST',
      path: '/v1/webhook/dodo',
      body: { __rawBody: exampleRaw },
      headers: sign(exampleRaw, 'whmsg_dodo_example_2'),
    },
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.message, 'License recorded.');

  await proveEmail(email);
  const activate = await api('POST', '/v1/activate', { code: key, email, installId: 'dodo-example' });
  assert.equal(activate.status, 200);
});

test('unknown routes and malformed codes fail cleanly', async () => {
  const notFound = await api('GET', '/nope');
  assert.equal(notFound.status, 404);

  const badCode = await api('POST', '/v1/activate', {
    code: 'SHORT',
    email: 'x@example.com',
    installId: 'dev-z',
  });
  assert.equal(badCode.status, 400);
});