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
  getStoredLicense,
  type ActivationResult,
  type LicenseState,
} from '@/lib/license';

type LicenseContextValue = {
  /** True once the initial stored-license read has finished (splash stays up until then). */
  ready: boolean;
  /** The activated license, or null while the app is locked. */
  license: LicenseState | null;
  /** Validates + stores a license; returns the result for the UI to render. */
  activate: (rawCode: string) => Promise<ActivationResult>;
  /** Removes the license from this device (customer can reactivate later). */
  deactivate: () => Promise<void>;
};

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [license, setLicense] = useState<LicenseState | null>(null);

  useEffect(() => {
    getStoredLicense()
      .then(setLicense)
      .catch(() => setLicense(null))
      .finally(() => setReady(true));
  }, []);

  const activate = useCallback(async (rawCode: string) => {
    const result = await activateLicense(rawCode);
    if (result.ok) {
      setLicense(result.license);
    }
    return result;
  }, []);

  const deactivate = useCallback(async () => {
    await clearLicense();
    setLicense(null);
  }, []);

  const value = useMemo(
    () => ({ ready, license, activate, deactivate }),
    [ready, license, activate, deactivate],
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
