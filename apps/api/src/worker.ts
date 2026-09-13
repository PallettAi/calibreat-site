import { LicenseStoreDO } from './do.ts';
import { type HttpRequest, type HttpResponse } from './router.ts';
import { type StoreSnapshot } from './store.ts';

/**
 * calibrEAT license service — Cloudflare Worker entry.
 *
 * Every request is handled by the single LicenseStoreDO instance, which is
 * the authoritative store (durable, SQLite-backed). The Worker itself is a
 * thin adapter: parse → RPC → JSON response.
 */

export interface Env {
  LICENSE_STORE: DurableObjectNamespace<LicenseStoreDO>;
  /** R2 bucket receiving the daily license-store backup (see `scheduled`). */
  BACKUP_BUCKET?: R2Bucket;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  OTP_TTL_MS?: string;
  REQUEST_COOLDOWN_MS?: string;
  MAX_OTP_ATTEMPTS?: string;
  MAX_OTP_SENDS?: string;
  OTP_SEND_WINDOW_MS?: string;
  VERIFIED_TTL_MS?: string;
  MOR_WEBHOOK_SECRET?: string;
  DODO_WEBHOOK_SECRET?: string;
  DODO_API_KEY?: string;
  DODO_API_BASE?: string;
  ADMIN_TOKEN?: string;
  RESEND_WEBHOOK_SECRET?: string;
  SUPPORT_FROM?: string;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-secret, svix-id, svix-timestamp, svix-signature, webhook-id, webhook-timestamp, webhook-signature',
  'Access-Control-Max-Age': '86400',
} as const;

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsPreflightResponse();
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return respond(200, { ok: true, service: 'calibreat-license' });
    }

    // Only the documented endpoints exist; everything else is a 404.
    const allowed = new Set([
      '/v1/request-verification',
      '/v1/verify-email',
      '/v1/activate',
      '/v1/deactivate',
      '/v1/release',
      '/v1/validate',
      '/v1/webhook/mor',
      '/v1/webhook/dodo',
      '/v1/webhook/inbound',
      '/v1/admin/licenses',
      '/v1/admin/clear-activation',
      '/v1/admin/inbound',
    ]);
    if (!allowed.has(url.pathname)) {
      return respond(404, { ok: false, message: 'Not found.' });
    }

    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      // Raw bytes first: the inbound webhook's Svix signature covers the exact
      // body, so it must be verified against the unparsed string.
      const raw = await request.text();
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return respond(400, { ok: false, message: 'Invalid JSON body.' });
      }
      body.__rawBody = raw;
    }

    const id = env.LICENSE_STORE.idFromName('singleton');
    // The runtime supports arbitrary method calls on a DO stub; the cast keeps
    // the RPC payload/result types out of the type-checker's strict
    // serializability checks (it rejects `Record<string, unknown>` bodies).
    const stub = env.LICENSE_STORE.get(id) as unknown as {
      handleRequest(req: HttpRequest): Promise<HttpResponse>;
    };

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const rpc: HttpRequest = {
      method: request.method,
      path: url.pathname,
      body,
      headers,
    };
    const result = await stub.handleRequest(rpc);
    return respond(result.status, result.body);
  },

  /**
   * Cron entry (wrangler.toml [triggers]): daily at 03:00 UTC, export every
   * license + activation to R2. The export is the same snapshot
   * GET /v1/admin/export serves by hand — see adminExport in src/router.ts.
   * Codes are stored hashed, so the backup reveals nothing activatable; one
   * small JSON object per day (the store is a few KB) gives deep history, so
   * even a slow store corruption has an older good copy to restore from.
   */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (!env.BACKUP_BUCKET) {
      throw new Error(
        'BACKUP_BUCKET binding is missing — add the r2_buckets binding to wrangler.toml and create the bucket.',
      );
    }
    const id = env.LICENSE_STORE.idFromName('singleton');
    const stub = env.LICENSE_STORE.get(id) as unknown as {
      exportSnapshot(): Promise<StoreSnapshot>;
    };
    const snapshot = await stub.exportSnapshot();
    const key = `licenses/${snapshot.takenAt.slice(0, 10)}.json`;
    await env.BACKUP_BUCKET.put(key, JSON.stringify(snapshot));
    console.log(
      `[backup] wrote ${key} (${snapshot.licenses.length} licenses, ${snapshot.activations.length} activations)`,
    );
  },
} satisfies ExportedHandler<Env>;

export { LicenseStoreDO };