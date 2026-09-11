import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { LicenseConfig } from '@/constants/app';
import {
  createInstallId,
  formatDeviceLabel,
  interpretDeactivateResponse,
  interpretValidateResponse,
  localValidateShortcut,
  type ActiveDevice,
  type LicenseCheckResult,
} from '@/lib/license-check';
import { isWellFormedCode, normalizeCode } from '@/lib/license-code';

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
const VERIFIED_EMAIL_STORAGE_KEY = 'calibreat.verified-email.v1';

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
  | { ok: false; message: string; conflict?: 'active_elsewhere'; activeDevice?: ActiveDevice };

export type { ActiveDevice };

export type SimpleResult = { ok: true; message?: string } | { ok: false; message: string };

/**
 * Result of a server re-attestation (validateLicense). `ok: false` means the
 * server could not be reached — callers fail OPEN on that (the stored license
 * stays) so paying users are never locked out of an app they already have
 * on-device. `ok: true, valid: false` is the server's definitive verdict that
 * this device no longer holds the slot, and the app must lock itself.
 */
export type { LicenseCheckResult };

/** Give up waiting for a validate response after this long (fail-open). */
const VALIDATE_TIMEOUT_MS = 8000;

/**
 * Loose email shape check. The real gate is the verification/activation
 * server (M3); this only stops obvious typos before a network call.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Step 1 of the signup gate: ask the activation server to email a 6-digit
 * verification code to `email`. Dev builds (no API URL) simulate success.
 */
export async function requestEmailVerification(email: string): Promise<SimpleResult> {
  const apiUrl = LicenseConfig.apiBaseUrl.trim();
  if (!apiUrl) {
    if (!__DEV__) {
      return {
        ok: false,
        message: 'Activation is not configured on this build yet. Please update the app.',
      };
    }
    console.warn('[calibrEAT] No EXPO_PUBLIC_LICENSE_API_URL set — simulating email verification in dev.');
    return {
      ok: true,
      message: `Verification code sent to ${email} (dev mode — any 6-digit code works).`,
    };
  }
  try {
    const response = await fetch(`${apiUrl}/v1/request-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body: unknown = await response.json().catch(() => null);
    const data = (body ?? {}) as { message?: string };
    if (!response.ok) {
      return {
        ok: false,
        message: data.message ?? "Couldn't send the verification code. Please try again.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the activation server. Check your connection and try again.",
    };
  }
}

/**
 * Step 2 of the signup gate: confirm the 6-digit code sent to `email`.
 * On success the email is persisted as the device's verified identity, and
 * activation (step 3) binds the license code to it. Dev builds (no API URL)
 * accept any 6-digit code.
 */
export async function verifyEmailCode(email: string, otp: string): Promise<SimpleResult> {
  const apiUrl = LicenseConfig.apiBaseUrl.trim();
  if (!apiUrl) {
    if (!__DEV__) {
      return {
        ok: false,
        message: 'Activation is not configured on this build yet. Please update the app.',
      };
    }
    await saveVerifiedEmail(email);
    return { ok: true };
  }
  try {
    const response = await fetch(`${apiUrl}/v1/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    const body: unknown = await response.json().catch(() => null);
    const data = (body ?? {}) as { message?: string };
    if (!response.ok) {
      return {
        ok: false,
        message: data.message ?? "That code didn't work. Please try again.",
      };
    }
    await saveVerifiedEmail(email);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the activation server. Check your connection and try again.",
    };
  }
}

export { isWellFormedCode, normalizeCode } from '@/lib/license-code';

/**
 * Runs the activation handshake for a raw code and, on success, persists the
 * resulting license locally. Returns a discriminated result the UI can render.
 */
export async function activateLicense(rawCode: string): Promise<ActivationResult> {
  const code = normalizeCode(rawCode);

  if (!isWellFormedCode(code)) {
    return {
      ok: false,
      message: "That code doesn't look complete. Check you pasted the whole key.",
    };
  }

  // The license is bound to a verified email (the signup gate) — activation
  // without one fails even in dev, so there is no path past the lock screen
  // that skips email verification.
  const email = await getVerifiedEmail();
  if (!email) {
    return {
      ok: false,
      message: 'Verify your email first — enter it on the welcome screen to receive a code.',
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
  const deviceLabel = currentDeviceLabel();

  try {
    const response = await fetch(`${apiUrl}/v1/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email, installId, deviceLabel }),
    });
    const body: unknown = await response.json().catch(() => null);
    const data = (body ?? {}) as {
      valid?: boolean;
      message?: string;
      activatedAt?: string;
      plan?: string;
      customerEmail?: string;
      conflict?: string;
      activeDevice?: ActiveDevice;
    };

    if (!response.ok || data.valid !== true) {
      return {
        ok: false,
        message:
          data.message ??
          'This code could not be activated. Please double-check it or contact support.',
        conflict: data.conflict === 'active_elsewhere' ? 'active_elsewhere' : undefined,
        activeDevice: data.activeDevice,
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
 * Re-attests a stored license against the server: is THIS device still the
 * one holding the slot for (code, email)? Called on launch and periodically
 * (M5) so a displaced or revoked device locks itself instead of trusting the
 * stored license forever. Fail-open on network trouble; fail-closed only on
 * a definitive server verdict.
 */
export async function validateLicense(license: LicenseState): Promise<LicenseCheckResult> {
  const apiUrl = LicenseConfig.apiBaseUrl.trim();

  // Dev builds have no server slot to check — the locally activated license
  // is trusted (same simulation as activation). Release builds without an
  // API URL fail-open (keep the stored license) instead of pretending the
  // server said valid.
  const shortcut = localValidateShortcut(apiUrl, __DEV__);
  if (shortcut) return shortcut;

  // The license is bound to a verified email; without it we can't re-attest,
  // and a stored license with no bound email is an inconsistent state.
  const email = await getVerifiedEmail();
  if (!email) {
    return {
      ok: true,
      valid: false,
      revoked: false,
      reason:
        'The email tied to this license is no longer on this device. Verify your email again to re-lock it.',
    };
  }

  try {
    const installId = await getInstallId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/v1/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: license.code, email, installId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body: unknown = await response.json().catch(() => null);
    const data = (body ?? {}) as {
      valid?: boolean;
      revoked?: boolean;
      message?: string;
      activeDevice?: { label?: string | null };
    };
    return interpretValidateResponse(response.status, data);
  } catch {
    // Network failure / timeout — fail open; the next foreground check retries.
    return { ok: false, message: "Couldn't reach the activation server." };
  }
}

/**
 * Frees the server-side slot only if this install currently holds it.
 * Returns ok:false on network / HTTP failure so the caller can keep the
 * local license instead of locking a user who never actually released.
 */
export async function deactivateLicense(code: string): Promise<SimpleResult> {
  const apiUrl = LicenseConfig.apiBaseUrl.trim();
  if (!apiUrl) return { ok: true }; // dev mode has no server slot
  const email = await getVerifiedEmail();
  if (!email) {
    return { ok: false, message: 'Verify your email first, then try deactivating again.' };
  }
  try {
    const installId = await getInstallId();
    const response = await fetch(`${apiUrl}/v1/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email, installId }),
    });
    return interpretDeactivateResponse(response.status, true);
  } catch {
    return interpretDeactivateResponse(0, false);
  }
}

/**
 * OTP-gated slot clear from a new phone (lost / reinstall). Does not require
 * the old installId. Caller should then retry activate.
 */
export async function releaseLicense(rawCode: string): Promise<SimpleResult> {
  const code = normalizeCode(rawCode);
  const apiUrl = LicenseConfig.apiBaseUrl.trim();
  if (!apiUrl) return { ok: true };
  const email = await getVerifiedEmail();
  if (!email) {
    return { ok: false, message: 'Verify your email first — enter it on the welcome screen to receive a code.' };
  }
  try {
    const response = await fetch(`${apiUrl}/v1/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email }),
    });
    const body: unknown = await response.json().catch(() => null);
    const data = (body ?? {}) as { message?: string };
    if (!response.ok) {
      return {
        ok: false,
        message: data.message ?? "Couldn't free the other device. Check your connection and try again.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Couldn't reach the activation server. Check your connection and try again.",
    };
  }
}

export function currentDeviceLabel(): string {
  return formatDeviceLabel({
    modelName: Device.modelName,
    osName: Device.osName,
    osVersion: Device.osVersion,
    platform: Platform.OS,
  });
}

/** The verified signup email on this device, or null if not verified yet. */
export async function getVerifiedEmail(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(VERIFIED_EMAIL_STORAGE_KEY);
  return raw || null;
}

export async function saveVerifiedEmail(email: string): Promise<void> {
  await AsyncStorage.setItem(VERIFIED_EMAIL_STORAGE_KEY, email.trim().toLowerCase());
}

export async function clearVerifiedEmail(): Promise<void> {
  await AsyncStorage.removeItem(VERIFIED_EMAIL_STORAGE_KEY);
}

/**
 * Stable per-install identifier, generated once and persisted. Sent to the
 * activation server so a single code can only be bound to a limited number
 * of devices (activation-limit policy lives server-side, see PLAN.md).
 */
export async function getInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALL_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = createInstallId();
  await AsyncStorage.setItem(INSTALL_ID_STORAGE_KEY, id);
  return id;
}
