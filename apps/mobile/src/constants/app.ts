/**
 * calibrEAT app-wide configuration and brand palette.
 *
 * URLs point at the live marketing / sales site (calibreat.co.uk, GitHub Pages);
 * see PLAN.md at the repo root.
 */

export const AppMeta = {
  name: 'calibrEAT',
  tagline: 'Calibrate your eating lifestyle.',
  websiteUrl: 'https://calibreat.co.uk',
  supportEmail: 'support@calibreat.co.uk',
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
   * Where users buy a lifetime code. Defaults to the website's license page;
   * the real store (hosted checkout) URL is wired up once it launches.
   */
  storeUrl: process.env.EXPO_PUBLIC_LICENSE_STORE_URL ?? `${AppMeta.websiteUrl}/license.html`,
  /**
   * Help / self-service page for existing license holders (recover a lost code,
   * move devices, contact support). There is no customer portal yet — until the
   * real one exists (PLAN.md M4 optional order-status page), this points at the
   * license page's lost-code FAQ + support email.
   */
  licenseHelpUrl: process.env.EXPO_PUBLIC_LICENSE_HELP_URL ?? `${AppMeta.websiteUrl}/license.html#faq`,
} as const;

export const Brand = {
  /**
   * Primary brand green — accents, borders and fills. Deliberately NOT a
   * background for white text: #1F9D55 under white measures 3.49:1, below
   * WCAG AA (4.5:1) for normal-size text.
   */
  primary: '#1F9D55',
  /** Brighter green — for gradients and highlights on dark surfaces. */
  primaryBright: '#23B25F',
  /**
   * Deeper green. The accent on light surfaces, and the AA-safe fill for solid
   * buttons with white labels — white on #0E6B38 measures 6.61:1.
   */
  primaryDeep: '#0E6B38',
  /** Fresh highlight used on dark surfaces (wordmark, badges). */
  lime: '#B7E93C',
  /** Destructive / error actions. */
  danger: '#D64545',
} as const;
