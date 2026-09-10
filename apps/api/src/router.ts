import { type ApiConfig } from './config.ts';
import { sendLicenseDeliveryEmail, sendSupportAck, sendVerificationEmail } from './email.ts';
import {
  generateCode,
  generateOtp,
  hashCode,
  hashEmail,
  hashOtpKey,
  isWellFormedCode,
  isValidEmail,
  normalizeCode,
  safeEqual,
} from './license.ts';
import { type LicenseStore } from './store.ts';
// svix ships as CommonJS; Webhook.verify() is the signature-checking entry point.
import { Webhook } from 'svix';

/**
 * Runtime-agnostic router: `handleHttp` implements the whole calibrEAT
 * license contract and is driven by a `LicenseStore` + config + email
 * sender. The Worker (src/worker.ts) runs it inside a Durable Object over
 * SQLite-backed storage; the node:test suite runs it over InMemoryStore.
 *
 * Endpoints (see apps/api/README.md):
 *   POST /v1/request-verification  { email }
 *   POST /v1/verify-email          { email, otp }
 *   POST /v1/activate              { code, email, installId }
 *   POST /v1/deactivate            { code, email, installId }
 *   POST /v1/validate              { code, email, installId }
 *   POST /v1/webhook/mor           MoR purchase/refund events
 *   POST /v1/webhook/dodo          Dodo Payments Standard Webhooks
 *   POST /v1/webhook/inbound       Resend Inbound: received support email (Svix-signed)
 *   POST /v1/admin/licenses        { email, code? } — needs adminToken
 *   GET  /v1/admin/inbound?limit=  recent inbound support emails — needs adminToken
 *   GET  /health
 */

const PLAN = 'lifetime';

export type HttpRequest = {
  method: string;
  path: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type HttpResponse = { status: number; body: Record<string, unknown> };

type Context = {
  store: LicenseStore;
  config: ApiConfig;
};

function ok(body: Record<string, unknown> = {}): HttpResponse {
  return { status: 200, body: { ok: true, ...body } };
}

function fail(status: number, message: string): HttpResponse {
  return { status, body: { ok: false, message } };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/* ── Endpoints ────────────────────────────────────────────────────── */

async function requestVerification(ctx: Context, body: Record<string, unknown>): Promise<HttpResponse> {
  const { store, config } = ctx;
  const email = str(body.email).trim().toLowerCase();
  if (!isValidEmail(email)) {
    return fail(400, 'Please provide a valid email address.');
  }

  const emailHash = await hashEmail(email);
  const lastSent = await store.getLastOtpSentAt(emailHash);
  if (lastSent !== null && Date.now() - lastSent < config.requestCooldownMs) {
    return fail(429, 'Please wait a moment before requesting another code.');
  }
  const sends = await store.getOtpSends(emailHash);
  if (sends && sends.count >= config.maxOtpSends && Date.now() < sends.windowEndsAt) {
    return fail(429, 'Too many codes requested. Try again later.');
  }

  const otp = generateOtp();
  await store.putOtp(await hashOtpKey(email, otp), {
    email,
    expiresAt: Date.now() + config.otpTtlMs,
    used: false,
  });
  await store.markOtpSent(emailHash);
  await store.recordOtpSend(emailHash, Date.now() + config.otpSendWindowMs);

  const sent = await sendVerificationEmail(email, otp, config.resendApiKey, config.emailFrom);
  if (!sent.ok) {
    return fail(502, sent.message ?? 'Could not send the verification email.');
  }
  return ok({ message: `Verification code sent to ${email}.` });
}

async function verifyEmail(ctx: Context, body: Record<string, unknown>): Promise<HttpResponse> {
  const { store, config } = ctx;
  const email = str(body.email).trim().toLowerCase();
  const otp = str(body.otp);
  if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
    return fail(400, 'Enter the 6-digit code we sent you.');
  }

  const emailHash = await hashEmail(email);
  const attempts = await store.getAttempts(emailHash);
  if (attempts && attempts.count >= config.maxOtpAttempts && Date.now() < attempts.windowEndsAt) {
    return fail(429, 'Too many failed attempts. Request a new code and try again.');
  }

  const key = await hashOtpKey(email, otp);
  const record = await store.getOtp(key);
  if (!record) {
    await store.recordFailedAttempt(emailHash, Date.now() + config.otpTtlMs);
    return fail(400, "That code isn't valid. Check it and try again, or request a new one.");
  }
  if (record.used) {
    return fail(400, 'That code has already been used. Request a new one.');
  }
  if (record.expiresAt < Date.now()) {
    await store.deleteOtp(key);
    return fail(400, 'That code has expired. Request a new one.');
  }

  await store.markOtpUsed(key);
  await store.clearAttempts(emailHash);
  await store.markEmailVerified(emailHash);
  return ok({ verified: true, email });
}

async function activate(ctx: Context, body: Record<string, unknown>): Promise<HttpResponse> {
  const { store, config } = ctx;
  const code = normalizeCode(str(body.code));
  const email = str(body.email).trim().toLowerCase();
  const installId = str(body.installId).trim();

  if (!isWellFormedCode(code)) {
    return fail(400, "That code doesn't look complete. Example: AB12-CD34-EF56.");
  }
  if (!isValidEmail(email)) {
    return fail(400, 'Please provide a valid email address.');
  }
  if (!installId) {
    return fail(400, 'Missing device identifier.');
  }

  const license = await store.getLicense(await hashCode(code));
  if (!license) {
    return fail(404, 'This code is not recognized. Double-check it or contact support.');
  }
  if (license.revoked) {
    return fail(403, 'This license has been revoked. Contact support if you believe this is a mistake.');
  }
  if (license.email !== email) {
    return fail(403, 'This license code is tied to a different email address.');
  }

  const now = new Date().toISOString();
  const existing = await store.getActivation(license.codeHash);
  const sameDevice = existing !== null && existing.email === email && existing.installId === installId;
  if (!sameDevice) {
    const verifiedAt = await store.getEmailVerifiedAt(await hashEmail(email));
    if (verifiedAt === null || Date.now() - verifiedAt > config.verifiedTtlMs) {
      return fail(403, 'Verify your email first — request a code on the welcome screen.');
    }
  }

  // Same email + same device → idempotent success (re-activation after an app
  // reinstall). Same email + new device → the slot moves (the user owns the
  // account via their email and can transfer between phones).
  if (existing && existing.installId !== installId) {
    console.log(`[calibrEAT] license ${code.slice(0, 8)}… moved from ${existing.installId} to ${installId}`);
  }
  await store.setActivation(license.codeHash, {
    email,
    installId,
    activatedAt: existing?.activatedAt ?? now,
  });

  return ok({
    valid: true,
    activatedAt: existing?.activatedAt ?? now,
    plan: PLAN,
    customerEmail: email,
  });
}

async function deactivate(ctx: Context, body: Record<string, unknown>): Promise<HttpResponse> {
  const { store } = ctx;
  const code = normalizeCode(str(body.code));
  const email = str(body.email).trim().toLowerCase();
  const installId = str(body.installId).trim();

  const license = await store.getLicense(await hashCode(code));
  if (!license) {
    // Idempotent: the device already holds no slot.
    return ok({ message: 'License is not active on this device.' });
  }
  const activation = await store.getActivation(license.codeHash);
  if (activation && activation.email === email && activation.installId === installId) {
    await store.clearActivation(license.codeHash);
    return ok({ message: 'License deactivated on this device.' });
  }
  return ok({ message: 'License is not active on this device.' });
}

async function validate(ctx: Context, body: Record<string, unknown>): Promise<HttpResponse> {
  const { store } = ctx;
  const code = normalizeCode(str(body.code));
  const email = str(body.email).trim().toLowerCase();
  const installId = str(body.installId).trim();

  if (!isWellFormedCode(code)) {
    return fail(400, "That code doesn't look complete. Example: AB12-CD34-EF56.");
  }
  if (!isValidEmail(email)) {
    return fail(400, 'Please provide a valid email address.');
  }
  if (!installId) {
    return fail(400, 'Missing device identifier.');
  }

  const license = await store.getLicense(await hashCode(code));
  if (!license) {
    return fail(404, 'This code is not recognized.');
  }
  const activation = await store.getActivation(license.codeHash);
  const active =
    !license.revoked &&
    license.email === email &&
    activation !== null &&
    activation.installId === installId;

  return ok({
    valid: active,
    revoked: license.revoked,
    activatedAt: activation?.activatedAt ?? null,
    plan: PLAN,
    customerEmail: license.email,
  });
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function recordPurchase(
  ctx: Context,
  email: string,
  rawCode: string,
): Promise<HttpResponse> {
  const { store, config } = ctx;
  const codeHash = await hashCode(rawCode);
  const existing = await store.getLicense(codeHash);
  const isNew = !existing;
  await store.upsertLicense({
    codeHash,
    email: existing?.email ?? email,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    revoked: existing?.revoked ?? false,
  });
  if (isNew) {
    await sendLicenseDeliveryEmail(email, rawCode, config.resendApiKey, config.emailFrom);
  }
  return ok({ message: 'License recorded.' });
}

async function recordRevoke(ctx: Context, rawCode: string): Promise<HttpResponse> {
  const codeHash = await hashCode(rawCode);
  await ctx.store.setLicenseRevoked(codeHash, true);
  await ctx.store.clearActivation(codeHash);
  return ok({ message: 'License revoked.' });
}

async function morWebhook(ctx: Context, req: HttpRequest): Promise<HttpResponse> {
  const { config } = ctx;
  const body = req.body;

  if (!config.morWebhookSecret) {
    return fail(503, 'Merchant webhook is not configured.');
  }
  const headers = req.headers ?? {};
  const header =
    str(headers['x-webhook-secret']) ||
    str(headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(header, config.morWebhookSecret)) {
    return fail(401, 'Invalid webhook secret.');
  }

  const event = str(body.event).toLowerCase();
  const email = str(body.customer_email).trim().toLowerCase();
  const rawCode = str(body.license_key);

  if (!rawCode || !isValidEmail(email)) {
    return fail(400, 'Webhook payload must include license_key and customer_email.');
  }

  const purchaseEvent = /purchase|order|checkout|subscription_created|license_created/.test(event);
  const revokeEvent = /refund|revoke|chargeback|subscription_cancelled/.test(event);

  if (revokeEvent) {
    return recordRevoke(ctx, rawCode);
  }

  if (purchaseEvent) {
    return recordPurchase(ctx, email, rawCode);
  }

  return ok({ message: 'Event ignored.' });
}

function dodoEmail(data: Record<string, unknown>): string {
  const customer = obj(data.customer);
  return str(customer.email || data.customer_email || data.email).trim().toLowerCase();
}

function dodoCustomerId(data: Record<string, unknown>): string {
  const customer = obj(data.customer);
  return str(data.customer_id || customer.customer_id || customer.id);
}

function dodoLicenseKey(data: Record<string, unknown>): string {
  const nested = obj(data.license_key);
  return str(nested.key || data.key || data.license_key);
}

async function fetchDodoCustomerEmail(
  customerId: string,
  apiKey: string,
  apiBase: string,
): Promise<string | null> {
  if (!customerId || !apiKey) return null;
  const base = apiBase.replace(/\/+$/, '') || 'https://test.dodopayments.com';
  try {
    const res = await fetch(`${base}/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const email = str(json.email).trim().toLowerCase();
    return isValidEmail(email) ? email : null;
  } catch {
    return null;
  }
}

async function resolveDodoEmail(ctx: Context, data: Record<string, unknown>): Promise<string> {
  const embedded = dodoEmail(data);
  if (isValidEmail(embedded)) return embedded;

  const customerId = dodoCustomerId(data);
  if (!customerId) return '';

  const { config } = ctx;
  if (config.dodoLookupCustomer) {
    return ((await config.dodoLookupCustomer(customerId)) ?? '').trim().toLowerCase();
  }
  return (await fetchDodoCustomerEmail(customerId, config.dodoApiKey, config.dodoApiBase)) ?? '';
}

function standardWebhookHeaders(headers: Record<string, string>): Record<string, string> | null {
  const id = str(headers['webhook-id'] || headers['svix-id']);
  const timestamp = str(headers['webhook-timestamp'] || headers['svix-timestamp']);
  const signature = str(headers['webhook-signature'] || headers['svix-signature']);
  if (!id || !timestamp || !signature) return null;
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}

/**
 * Dodo Payments (Standard Webhooks). Purchase events mint the key Dodo
 * issued; refund/revoke events disable it. Unrecognised types 200 so Dodo
 * stops retrying.
 */
async function dodoWebhook(ctx: Context, req: HttpRequest): Promise<HttpResponse> {
  const { config } = ctx;
  if (!config.dodoWebhookSecret) {
    return fail(503, 'Dodo webhook is not configured.');
  }

  const rawBody = typeof req.body.__rawBody === 'string' ? req.body.__rawBody : '';
  if (!rawBody) {
    return fail(400, 'Missing raw body.');
  }

  const signed = standardWebhookHeaders(req.headers ?? {});
  if (!signed) {
    return fail(401, 'Missing webhook signature headers.');
  }

  try {
    new Webhook(config.dodoWebhookSecret).verify(rawBody, signed);
  } catch {
    return fail(401, 'Invalid webhook signature.');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid JSON payload.');
  }

  const event = str(payload.type).toLowerCase();
  const data = obj(payload.data);
  const email = await resolveDodoEmail(ctx, data);
  const rawCode = dodoLicenseKey(data);

  if (/entitlement_grant\.revoked|refund\.succeeded|license_key\.(disabled|expired)/.test(event)) {
    if (!rawCode) return ok({ message: 'Event ignored.' });
    return recordRevoke(ctx, rawCode);
  }

  if (/license_key\.created|entitlement_grant\.delivered/.test(event)) {
    if (!rawCode || !isValidEmail(email)) {
      return fail(400, 'Webhook payload must include license key and customer email.');
    }
    return recordPurchase(ctx, email, rawCode);
  }

  return ok({ message: 'Event ignored.' });
}

async function adminAddLicense(ctx: Context, req: HttpRequest): Promise<HttpResponse> {
  const { store, config } = ctx;
  const body = req.body;
  const headers = req.headers ?? {};

  const presented = str(headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!config.adminToken || !safeEqual(presented, config.adminToken)) {
    return fail(401, 'Invalid admin token.');
  }

  const email = str(body.email).trim().toLowerCase();
  if (!isValidEmail(email)) {
    return fail(400, 'Please provide a valid email address.');
  }

  const rawCode = str(body.code).trim();
  let code = normalizeCode(rawCode);
  let generated = false;
  if (!rawCode) {
    code = generateCode();
    generated = true;
  } else if (!isWellFormedCode(code)) {
    return fail(400, `"${rawCode}" is not a well-formed license code.`);
  }

  const existing = await store.getLicense(await hashCode(code));
  await store.upsertLicense({
    codeHash: await hashCode(code),
    email: existing?.email ?? email,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    revoked: existing?.revoked ?? false,
  });

  return ok({ message: `License bound to ${email}.`, code: generated ? code : undefined });
}

/* ── Inbound support mail (Resend Inbound) ───────────────────────────── */

/**
 * Resend Inbound delivers every email received at support@calibreat.co.uk as a
 * Svix-signed webhook (payload shape: `{ type: 'email.received', data: {...} }`).
 * We verify the signature, dedupe on the Svix event id (Resend retries are
 * at-least-once), store a metadata record (never the full body — Resend is the
 * content system of record), and send an auto-acknowledgement reply.
 */
const INBOUND_WEBHOOK_TYPE = 'email.received';

async function inboundWebhook(ctx: Context, req: HttpRequest): Promise<HttpResponse> {
  const { store, config } = ctx;
  const headers = req.headers ?? {};

  if (!config.resendWebhookSecret) {
    return fail(503, 'Inbound webhook is not configured.');
  }

  // Svix verification needs the exact raw body that was signed. The Worker
  // passes it through as the reserved `__rawBody` field.
  const rawBody = typeof req.body.__rawBody === 'string' ? req.body.__rawBody : '';
  if (!rawBody) {
    return fail(400, 'Missing raw body.');
  }

  const svixId = str(headers['svix-id']);
  const svixTimestamp = str(headers['svix-timestamp']);
  const svixSignature = str(headers['svix-signature']);
  if (!svixId || !svixTimestamp || !svixSignature) {
    return fail(401, 'Missing webhook signature headers.');
  }

  try {
    new Webhook(config.resendWebhookSecret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch {
    return fail(401, 'Invalid webhook signature.');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid JSON payload.');
  }

  // Ignore other Resend webhook event types (bounces, sends, …).
  if (str(payload.type) !== INBOUND_WEBHOOK_TYPE) {
    return ok({ message: 'Event ignored.' });
  }

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const from = str(data.from);
  const subject = str(data.subject);
  const resendEmailId = str(data.email_id);
  const toList = Array.isArray(data.to) ? data.to.map((v) => str(v)) : [];

  // Only auto-handle mail addressed to the support inbox.
  if (!toList.some((addr) => addr.toLowerCase().startsWith('support@calibreat.co.uk'))) {
    return ok({ message: 'Recipient ignored.' });
  }

  // Dedupe: Resend retries are at-least-once; the svix id identifies the event.
  if (await store.getInbound(svixId)) {
    return ok({ message: 'Duplicate event ignored.' });
  }

  // The webhook carries metadata only — the body stays in Resend, retrievable
  // via GET /emails/receiving/:resendEmailId or the dashboard's Receiving tab.
  await store.putInbound({
    id: svixId,
    receivedAt: Date.now(),
    from,
    subject,
    resendEmailId,
    acked: false,
  });

  // Auto-ack the sender (skip our own outbound mail to avoid loops).
  const sender = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (
    isValidEmail(sender) &&
    !sender.toLowerCase().endsWith('@calibreat.co.uk') &&
    config.supportFrom
  ) {
    const ack = await sendSupportAck(sender, config.resendApiKey, config.supportFrom);
    if (ack.ok) await store.markInboundAcked(svixId);
  }

  return ok({ message: 'Support email received.' });
}

async function adminListInbound(ctx: Context, req: HttpRequest): Promise<HttpResponse> {
  const { store, config } = ctx;
  const presented = str((req.headers ?? {}).authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!config.adminToken || !safeEqual(presented, config.adminToken)) {
    return fail(401, 'Invalid admin token.');
  }

  const limitRaw = Number(str(req.body.limit) || '50');
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 50;
  const items = await store.listInbound(limit);
  return ok({ items });
}

/* ── Router ───────────────────────────────────────────────────────── */

export async function handleHttp(
  ctx: Context,
  req: HttpRequest,
): Promise<HttpResponse> {
  const { method, path } = req;

  if (method === 'GET' && path === '/health') {
    return ok({ service: 'calibreat-license' });
  }
  if (method === 'POST' && path === '/v1/request-verification') {
    return requestVerification(ctx, req.body);
  }
  if (method === 'POST' && path === '/v1/verify-email') {
    return verifyEmail(ctx, req.body);
  }
  if (method === 'POST' && path === '/v1/activate') {
    return activate(ctx, req.body);
  }
  if (method === 'POST' && path === '/v1/deactivate') {
    return deactivate(ctx, req.body);
  }
  if (method === 'POST' && path === '/v1/validate') {
    return validate(ctx, req.body);
  }
  if (method === 'POST' && path === '/v1/webhook/mor') {
    return morWebhook(ctx, req);
  }
  if (method === 'POST' && path === '/v1/webhook/dodo') {
    return dodoWebhook(ctx, req);
  }
  if (method === 'POST' && path === '/v1/webhook/inbound') {
    return inboundWebhook(ctx, req);
  }
  if (method === 'GET' && path === '/v1/admin/inbound') {
    return adminListInbound(ctx, req);
  }
  if (method === 'POST' && path === '/v1/admin/licenses') {
    return adminAddLicense(ctx, req);
  }
  return fail(404, 'Not found.');
}