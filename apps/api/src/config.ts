/** Runtime config for the Worker, parsed from env bindings. */

export type ApiConfig = {
  otpTtlMs: number;
  requestCooldownMs: number;
  maxOtpAttempts: number;
  /** How long a completed email OTP authorises /v1/activate. */
  verifiedTtlMs: number;
  /** Max verification emails per address inside otpSendWindowMs. */
  maxOtpSends: number;
  otpSendWindowMs: number;
  resendApiKey: string;
  emailFrom: string;
  morWebhookSecret: string;
  /** Dodo Payments Standard Webhooks secret (whsec_…). */
  dodoWebhookSecret: string;
  /** Dodo REST API key — used to resolve customer_id → email. */
  dodoApiKey: string;
  /** Test: https://test.dodopayments.com  Live: https://live.dodopayments.com */
  dodoApiBase: string;
  /** Tests inject this instead of hitting Dodo. */
  dodoLookupCustomer?: (customerId: string) => Promise<string | null>;
  adminToken: string;
  /** Resend webhook signing secret (svix_) — required for the inbound webhook. */
  resendWebhookSecret: string;
  /** Support auto-ack sender. Empty → auto-ack disabled. */
  supportFrom: string;
};

function read(env: object, key: string): string | undefined {
  const value = (env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function configFromEnv(env: object): ApiConfig {
  return {
    otpTtlMs: num(read(env, 'OTP_TTL_MS'), 10 * 60 * 1000),
    requestCooldownMs: num(read(env, 'REQUEST_COOLDOWN_MS'), 30_000),
    maxOtpAttempts: num(read(env, 'MAX_OTP_ATTEMPTS'), 5),
    verifiedTtlMs: num(read(env, 'VERIFIED_TTL_MS'), 24 * 60 * 60 * 1000),
    maxOtpSends: num(read(env, 'MAX_OTP_SENDS'), 8),
    otpSendWindowMs: num(read(env, 'OTP_SEND_WINDOW_MS'), 60 * 60 * 1000),
    resendApiKey: read(env, 'RESEND_API_KEY') ?? '',
    emailFrom: read(env, 'EMAIL_FROM') ?? 'calibrEAT <no-reply@calibreat.co.uk>',
    morWebhookSecret: read(env, 'MOR_WEBHOOK_SECRET') ?? '',
    dodoWebhookSecret: read(env, 'DODO_WEBHOOK_SECRET') ?? '',
    dodoApiKey: read(env, 'DODO_API_KEY') ?? '',
    dodoApiBase: read(env, 'DODO_API_BASE') ?? 'https://test.dodopayments.com',
    adminToken: read(env, 'ADMIN_TOKEN') ?? '',
    resendWebhookSecret: read(env, 'RESEND_WEBHOOK_SECRET') ?? '',
    supportFrom: read(env, 'SUPPORT_FROM') ?? '',
  };
}