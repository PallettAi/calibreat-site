/**
 * calibrEAT uptime pinger — a tiny scheduled Worker that watches the license
 * API and the marketing site, and emails (via Resend) only when something
 * changes state. Self-hosted on the same Cloudflare account as the API.
 *
 * State (last-seen UP/DOWN per target) lives in the existing backup R2 bucket
 * under uptime/state.json. The email is sent BEFORE state is persisted, so a
 * failed send is naturally retried on the next cycle.
 *
 * Deploy: `npm run deploy:uptime` (uses wrangler.uptime.toml).
 */

import {
  checkTarget,
  decideAlert,
  downEmailBody,
  downEmailSubject,
  upEmailBody,
  upEmailSubject,
  type Target,
  type TargetResult,
} from './pinger.js';

export interface Env {
  BACKUP_BUCKET: R2Bucket;
  /** Service binding to the license worker — same-account checks bypass the
   * workers.dev URL entirely (Cloudflare blocks same-account workers.dev subrequests). */
  LICENSE: { fetch: (url: string, init?: RequestInit) => Promise<Response> };
  RESEND_API_KEY: string;
  ALERT_TO: string;
  ALERT_FROM: string;
  ADMIN_TOKEN: string;
}

type CheckTarget = Target & { /** Check via the LICENSE service binding instead of public HTTP. */ viaBinding?: boolean };

const TARGETS: CheckTarget[] = [
  {
    name: 'license API',
    // Host is irrelevant for a service binding; the path is what matters.
    url: 'https://license.internal/health',
    bodyKeyword: 'calibreat-license',
    viaBinding: true,
  },
  { name: 'website', url: 'https://calibreat.co.uk' },
];

const STATE_KEY = 'uptime/state.json';
const DO_NOT_REPLY = '[automated uptime pinger — do not reply]';

async function sendEmail(env: Env, subject: string, text: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ALERT_TO || !env.ALERT_FROM) {
    // Fail loudly in logs rather than silently: monitoring must not be mute.
    console.error('uptime: email env missing (RESEND_API_KEY/ALERT_TO/ALERT_FROM); alert not sent:', subject);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.ALERT_FROM, to: [env.ALERT_TO], subject, text }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function loadState(env: Env): Promise<Record<string, boolean> | undefined> {
  try {
    const obj = await env.BACKUP_BUCKET.get(STATE_KEY);
    if (!obj) return undefined;
    const parsed = JSON.parse(await obj.text()) as { targets?: Record<string, boolean> };
    return parsed && typeof parsed.targets === 'object' ? parsed.targets : undefined;
  } catch {
    return undefined;
  }
}

async function saveState(env: Env, results: TargetResult[]): Promise<void> {
  const targets: Record<string, boolean> = {};
  for (const r of results) targets[r.name] = r.up;
  await env.BACKUP_BUCKET.put(STATE_KEY, JSON.stringify({ targets, updatedAt: new Date().toISOString() }), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/** One full check cycle. Throws if the alert email fails (state stays stale → retry next cycle). */
export async function runCycle(
  env: Env,
): Promise<{ results: TargetResult[]; alert: 'none' | 'down' | 'up' }> {
  const results = await Promise.all(
    TARGETS.map((t) => checkTarget(t, t.viaBinding ? env.LICENSE.fetch.bind(env.LICENSE) : fetch)),
  );
  const decision = decideAlert(results, await loadState(env));

  if (decision.kind === 'down') {
    await sendEmail(env, downEmailSubject(results), downEmailBody(results));
  } else if (decision.kind === 'up') {
    await sendEmail(env, upEmailSubject(), upEmailBody());
  }
  await saveState(env, results);
  return { results, alert: decision.kind };
}

/** Length- and timing-safe-enough admin token compare (hash both, compare digests). */
async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i]! ^ bv[i]!;
  return diff === 0;
}

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export default {
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      runCycle(env).catch((err) => console.error('uptime: cycle failed:', err)),
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!(await tokenMatches(bearer(request), env.ADMIN_TOKEN))) {
      return new Response('unauthorized\n', { status: 401 });
    }

    if (url.pathname === '/run') {
      const { results, alert } = await runCycle(env);
      return Response.json({ ok: true, alert, results });
    }

    if (url.pathname === '/test-alert') {
      await sendEmail(
        env,
        'calibrEAT uptime test alert',
        ['This is a test of the uptime alert pipeline.', '', `Sent at ${new Date().toISOString()}.`, DO_NOT_REPLY].join('\n'),
      );
      return Response.json({ ok: true, sent: true });
    }

    return new Response('not found\n', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
