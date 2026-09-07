import AsyncStorage from '@react-native-async-storage/async-storage';

import { LicenseConfig } from '@/constants/app';

/**
 * calibrEAT license + activation.
 *
 * Business model (see PLAN.md at the repo root): every build is free to
 * install but gated behind a one-time lifetime activation code sold on the
 * calibrEAT website and emailed to the buyer. This module owns code
 * normalization, the activation handshake, and local persistence of the
 * activated license.
 *
 * Security model notes:
 *  - We only trust a license that an activation server validated; code shape
 *    alone never unlocks the app.
 *  - Release builds FAIL CLOSED: without EXPO_PUBLIC_LICENSE_API_URL set,
 *    activation cannot succeed.
 *  - In __DEV__ only, any well-formed code activates locally so the
 *    lock → home flow can be exercised before the server exists (M3).
 */

const LICENSE_STORAGE_KEY = 'calibreat.license.v1';
const INSTALL_ID_STORAGE_KEY = 'calibreat.install-id.v1';

export type LicenseState = {
  /** Normalized code, e.g. "AB12-CD34-EF56". */
  code: string;
  /** ISO timestamp of the successful activation. */
  activatedAt: string;
  /** Plan/variant label returned by the activation server, when known. */
  plan?: string;
  /** Email returned by the activation server, when known. */
  customerEmail?: string;
  /** Full server response, kept for future use (feature flags, etc.). */
  raw?: unknown;
};

export type ActivationResult =
  | { ok: true; license: LicenseState }
  | { ok: false; message: string };

/**
 * Uppercases input and turns spaces/typos into dash-separated blocks so
 * "ab12 cd34 ef56" and "AB12-CD34-EF56" both normalize the same way.
 */
export function normalizeCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.includes('-')) {
    return trimmed
      .split('-')
      .map((block) => block.replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean)
      .join('-');
  }
  const cleaned = trimmed.replace(/[^A-Z0-9]/g, '');
  return (cleaned.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * Loose shape check only (alphanumeric blocks separated by dashes, ≥ 8 chars).
 * The exact code format is defined by the activation server in M3.
 */
export function isWellFormedCode(code: string): boolean {
  if (!code) return false;
  const blocks = code.split('-');
  const totalLength = code.replace(/-/g, '').length;
  return totalLength >= 8 && blocks.every((block) => /^[A-Z0-9]{3,6}$/.test(block));
}

/**
 * Runs the activation handshake for a raw code and, on success, persists the
 * resulting license locally. Returns a discriminated result the UI can render.
 */
export async function activateLicense(rawCode: string): Promise<ActivationResult> {
  const code = normalizeCode(rawCode);

  if (!isWellFormedCode(code)) {
    return {
      ok: false,
      message: "That code doesn't look complete. Example: AB12-CD34-EF56.",
    };
  }

  const apiUrl = LicenseConfig.apiBaseUrl.trim();

  // Dev-only local activation so the gated flow can be tested end-to-end
  // before the activation server exists. Never reached in release builds.
  if (!apiUrl) {
    if (!__DEV__) {
      return {
        ok: false,
        message: 'Activation is not configured on this build yet. Please update the app.',
      };
    }
    console.warn(
      '[calibrEAT] No EXPO_PUBLIC_LICENSE_API_URL set — accepting a well-formed code in dev only.',
    );
    const license: LicenseState = {
      code,
      activatedAt: new Date().toISOString(),
      plan: 'lifetime (dev)',
    };
    await saveLicense(license);
    return { ok: true, license };
  }

  const installId = await getInstallId();

  try {
    const response = await fetch(`${apiUrl}/v1/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, installId }),
    });
    const body: unknown = await response.json().catch(() => null);
    const data = (body ?? {}) as {
      valid?: boolean;
      message?: string;
      activatedAt?: string;
      plan?: string;
      customerEmail?: string;
    };

    if (!response.ok || data.valid !== true) {
      return {
        ok: false,
        message:
          data.message ??
          'This code could not be activated. Please double-check it or contact support.',
      };
    }

    const license: LicenseState = {
      code,
      activatedAt: data.activatedAt ?? new Date().toISOString(),
      plan: data.plan,
      customerEmail: data.customerEmail,
      raw: body,
    };
    await saveLicense(license);
    return { ok: true, license };
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the activation server. Check your connection and try again.",
    };
  }
}

async function saveLicense(license: LicenseState): Promise<void> {
  await AsyncStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license));
}

export async function getStoredLicense(): Promise<LicenseState | null> {
  const raw = await AsyncStorage.getItem(LICENSE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LicenseState;
    return parsed.code ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearLicense(): Promise<void> {
  await AsyncStorage.removeItem(LICENSE_STORAGE_KEY);
}

/**
 * Stable per-install identifier, generated once and persisted. Sent to the
 * activation server so a single code can only be bound to a limited number
 * of devices (activation-limit policy lives server-side, see PLAN.md).
 */
export async function getInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALL_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = randomId();
  await AsyncStorage.setItem(INSTALL_ID_STORAGE_KEY, id);
  return id;
}

/** Cheap v4-shaped UUID. Replace with expo-crypto/randomUUID when available. */
function randomId(): string {
  const hex = (length: number) => {
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}
