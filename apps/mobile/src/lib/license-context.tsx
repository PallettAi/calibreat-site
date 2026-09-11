import { AppState } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  activateLicense,
  clearLicense,
  deactivateLicense,
  getStoredLicense,
  validateLicense,
  type ActivationResult,
  type LicenseState,
  type SimpleResult,
} from '@/lib/license';

/**
 * Re-attest the stored license against the server every this long while the
 * app stays open (a displaced/revoked device locks itself instead of trusting
 * the stored license forever — M5). Foreground transitions also trigger a
 * check; JS timers pause in background, so the interval covers foreground use.
 */
const REVALIDATE_INTERVAL_MS = 30 * 60 * 1000;

type LicenseContextValue = {
  /** True once the stored license has been read AND re-attested (splash stays up until then). */
  ready: boolean;
  /** The activated license, or null while the app is locked. */
  license: LicenseState | null;
  /**
   * Why the device was locked, set when a server re-attestation says this
   * device no longer holds the slot (displaced or revoked). Cleared on a
   * successful re-activation. Null on first install.
   */
  lockoutMessage: string | null;
  /** Validates + stores a license; returns the result for the UI to render. */
  activate: (rawCode: string) => Promise<ActivationResult>;
  /** Frees the server slot, then locks this device. Fails if the server never confirmed. */
  deactivate: () => Promise<SimpleResult>;
};

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);

  /**
   * Launch: read the stored license, then re-attest it against the server
   * BEFORE unlocking. Fail-open on network trouble (offline users keep their
   * app); fail-closed only on a definitive server verdict that this device
   * no longer holds the slot.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: LicenseState | null = null;
      try {
        stored = await getStoredLicense();
        if (cancelled) return;
        if (!stored) {
          setLicense(null);
          return;
        }
        try {
          const result = await validateLicense(stored);
          if (cancelled) return;
          if (result.ok && !result.valid) {
            await clearLicense();
            setLicense(null);
            setLockoutMessage(result.reason);
          } else {
            setLicense(stored);
          }
        } catch {
          // Fail-open: a validate/storage glitch must not lock a paying user.
          if (!cancelled) setLicense(stored);
        }
      } catch {
        setLicense(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While licensed, re-attest on every foreground transition and periodically.
  // A definitive invalid verdict clears the license, which bounces every gated
  // screen back to the welcome screen (and tears this effect down).
  useEffect(() => {
    if (!license) return;
    let disposed = false;
    const check = () => {
      if (disposed) return;
      void (async () => {
        const result = await validateLicense(license);
        if (disposed) return;
        if (result.ok && !result.valid) {
          await clearLicense();
          setLicense(null);
          setLockoutMessage(result.reason);
        }
      })();
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    const timer = setInterval(check, REVALIDATE_INTERVAL_MS);
    return () => {
      disposed = true;
      subscription.remove();
      clearInterval(timer);
    };
  }, [license]);

  const activate = useCallback(async (rawCode: string) => {
    const result = await activateLicense(rawCode);
    if (result.ok) {
      setLicense(result.license);
      setLockoutMessage(null);
    }
    return result;
  }, []);

  const deactivate = useCallback(async (): Promise<SimpleResult> => {
    if (!license) return { ok: true };
    const result = await deactivateLicense(license.code);
    if (!result.ok) return result;
    await clearLicense();
    setLicense(null);
    return { ok: true };
  }, [license]);

  const value = useMemo(
    () => ({ ready, license, lockoutMessage, activate, deactivate }),
    [ready, license, lockoutMessage, activate, deactivate],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return ctx;
}