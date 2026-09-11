/**
 * Pure license re-attestation policy (no I/O).
 *
 * Fail-open means "keep the stored license" — used for missing config, 404s
 * from a wrong base URL, and other non-definitive HTTP errors. Fail-closed
 * only on an explicit 200 { valid: false } from the activation server.
 */

export type LicenseCheckResult =
  | { ok: true; valid: true }
  | { ok: true; valid: false; revoked: boolean; reason: string }
  | { ok: false; message: string };

export type ActiveDevice = { label: string | null; activatedAt: string | null };

export function localValidateShortcut(apiUrl: string, isDev: boolean): LicenseCheckResult | null {
  if (apiUrl.trim()) return null;
  if (isDev) return { ok: true, valid: true };
  return {
    ok: false,
    message: 'Activation is not configured on this build yet. Please update the app.',
  };
}

export function alreadyActiveReason(label?: string | null): string {
  const where = label?.trim() ? ` on ${label.trim()}` : ' on another device';
  return `This license is already active${where}. Deactivate there first, then unlock here — or use “I don’t have that device” if that phone is gone.`;
}

export function formatDeviceLabel(parts: {
  modelName?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  platform: string;
}): string {
  const model = parts.modelName?.trim();
  if (model) return model.slice(0, 40);
  const os = [parts.osName, parts.osVersion].filter(Boolean).join(' ').trim();
  if (os) return os.slice(0, 40);
  if (parts.platform === 'ios') return 'iPhone';
  if (parts.platform === 'android') return 'Android phone';
  return 'This device';
}

export function interpretDeactivateResponse(
  status: number,
  reached: boolean,
): { ok: true } | { ok: false; message: string } {
  if (!reached) {
    return {
      ok: false,
      message:
        "Couldn't reach the activation server. Stay on this device until you're online, then try again.",
    };
  }
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      message: "Couldn't free this device's slot. Check your connection and try again.",
    };
  }
  return { ok: true };
}

export function interpretValidateResponse(
  status: number,
  data: {
    valid?: boolean;
    revoked?: boolean;
    message?: string;
    activeDevice?: { label?: string | null };
  },
): LicenseCheckResult {
  if (status < 200 || status >= 300) {
    return { ok: false, message: data.message ?? `Validation failed (${status}).` };
  }
  if (data.valid !== true) {
    return {
      ok: true,
      valid: false,
      revoked: data.revoked === true,
      reason:
        data.revoked === true
          ? 'This license has been revoked. Please contact support.'
          : alreadyActiveReason(data.activeDevice?.label),
    };
  }
  return { ok: true, valid: true };
}

/** True for a RFC 4122 version-4 UUID (the variant nibble is 8, 9, a, or b). */
export function isUuidV4(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Per-install identifier. Uses the platform CSPRNG — never Math.random,
 * which is cloneable across rooted/backup restores of a predictable PRNG.
 * Pass `null` only in tests to prove we refuse an insecure fallback.
 */
export function createInstallId(randomUUID?: (() => string) | null): string {
  const fn =
    randomUUID === undefined
      ? globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
      : randomUUID;
  if (typeof fn !== 'function') {
    throw new Error('Secure random is unavailable on this device.');
  }
  return fn();
}
