/** Pure check + state-transition logic for the uptime pinger (no I/O here). */

export type Target = {
  /** Human name used in alert subjects, e.g. "license API". */
  name: string;
  url: string;
  /** Extra substring the body must contain for a 200 to count as healthy. */
  bodyKeyword?: string;
};

export type TargetResult = {
  name: string;
  url: string;
  up: boolean;
  /** HTTP status if a response was received, else undefined. */
  status?: number;
  /** Short failure detail for the alert body (truncated). */
  detail?: string;
};

/** Minimal fetch shape — global fetch and service-binding fetch both satisfy it. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Shared fetch timeout for all targets (ms). */
export const CHECK_TIMEOUT_MS = 10_000;

/** Check one target: status + optional body keyword, with a hard timeout. */
export async function checkTarget(target: Target, fetchFn: FetchFn): Promise<TargetResult> {
  const base: TargetResult = { name: target.name, url: target.url, up: false };
  try {
    const res = await fetchFn(target.url, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      // Body may be inspected; caching a health check would defeat the point.
      cache: 'no-store',
    });
    if (res.status !== 200) {
      return { ...base, status: res.status, detail: `HTTP ${res.status}` };
    }
    if (target.bodyKeyword) {
      const body = await res.text();
      if (!body.includes(target.bodyKeyword)) {
        return {
          ...base,
          status: res.status,
          detail: `200 but body missing "${target.bodyKeyword}"`,
        };
      }
    }
    return { ...base, status: res.status, up: true };
  } catch (err) {
    return { ...base, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Check every target concurrently (one slow site must not delay the API check). */
export async function checkAll(targets: Target[], fetchFn: FetchFn): Promise<TargetResult[]> {
  return Promise.all(targets.map((t) => checkTarget(t, fetchFn)));
}

/**
 * Decide which alert, if any, this cycle should send.
 * A steady-state cycle (same as last time) sends nothing; a flip sends one.
 */
export type AlertDecision =
  | { kind: 'none' }
  | { kind: 'down'; downTargets: TargetResult[] }
  | { kind: 'up' };

export function decideAlert(
  results: TargetResult[],
  /** Last cycle's UP map, keyed by target name. Absent = unknown. */
  lastState: Record<string, boolean> | undefined,
): AlertDecision {
  const down = results.filter((r) => !r.up);
  const allUp = down.length === 0;

  if (!lastState) {
    // First observation after (re)creating state: only scream if something is
    // actually down right now; recovering later still gets its UP email.
    return allUp ? { kind: 'none' } : { kind: 'down', downTargets: down };
  }

  const anyDownBefore = Object.values(lastState).some((up) => !up);
  if (allUp && anyDownBefore) return { kind: 'up' };
  if (!allUp && !anyDownBefore) return { kind: 'down', downTargets: down };
  // Already down and still down (or already up): no repeat spam.
  return { kind: 'none' };
}

export function downEmailSubject(results: TargetResult[]): string {
  const names = results.filter((r) => !r.up).map((r) => r.name).join(', ');
  return `calibrEAT DOWN: ${names}`;
}

export function downEmailBody(results: TargetResult[]): string {
  const lines = results
    .filter((r) => !r.up)
    .map((r) => `• ${r.name} — ${r.url}${r.detail ? ` (${r.detail})` : ''}`);
  return [
    'The uptime pinger could not reach:',
    '',
    ...lines,
    '',
    `Checked at ${new Date().toISOString()}.`,
    '[automated uptime pinger — do not reply]',
  ].join('\n');
}

export function upEmailSubject(): string {
  return 'calibrEAT UP again: all targets healthy';
}

export function upEmailBody(): string {
  return [
    'All monitored targets are answering again:',
    '• license API',
    '• website',
    '',
    `Checked at ${new Date().toISOString()}.`,
    '[automated uptime pinger — do not reply]',
  ].join('\n');
}
