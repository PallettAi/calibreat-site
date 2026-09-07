/**
 * calibrEAT app-wide configuration and brand palette.
 *
 * All URLs point at the future website / activation API and must be replaced
 * with real values once they launch (see PLAN.md at the repo root).
 */

export const AppMeta = {
  name: 'calibrEAT',
  tagline: 'Calibrate your eating lifestyle.',
  // TODO: replace with the real marketing + sales website when it launches.
  websiteUrl: 'https://calibreat.app',
} as const;

export const LicenseConfig = {
  /**
   * Base URL of the license activation API (PLAN.md milestone M3).
   * Set EXPO_PUBLIC_LICENSE_API_URL when building a release APK.
   * When empty, activation falls back to the __DEV__-only local mode
   * implemented in src/lib/license.ts.
   */
  apiBaseUrl: process.env.EXPO_PUBLIC_LICENSE_API_URL ?? '',
  /**
   * Where users buy a lifetime code. Defaults to the website; the real store
   * (hosted checkout) URL is wired up once it launches.
   */
  storeUrl: process.env.EXPO_PUBLIC_LICENSE_STORE_URL ?? AppMeta.websiteUrl,
} as const;

export const Brand = {
  /** Primary brand green — the accent on light and dark surfaces. */
  primary: '#1F9D55',
  /** Deeper green, used where the accent sits on a light background. */
  primaryDeep: '#0E6B38',
  /** Fresh highlight used on dark surfaces (wordmark, badges). */
  lime: '#B7E93C',
  /** Destructive / error actions. */
  danger: '#D64545',
} as const;
