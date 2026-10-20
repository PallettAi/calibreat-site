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
