/**
 * calibrEAT design tokens — an exact port of the website's CSS custom
 * properties (apps/web/index.html `:root` / `[data-theme="light"]`), so the
 * app and the marketing site always render the same palette.
 *
 * Key values (dark default, light opt-in — same as the website):
 *   background      → --bg           (ink)
 *   backgroundElement → --surface
 *   backgroundSelected → --surface-2
 *   text            → --text
 *   textSecondary   → --text-2
 *   muted           → --muted
 *   line / lineStrong → --line / --line-strong
 *   inputBackground → the lock-field surface used by the site's phone mockup
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#101820',
    background: '#F6F7F4',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F0F2EE',
    textSecondary: '#46525C',
    muted: '#67727C',
    line: 'rgba(13, 21, 30, 0.09)',
    lineStrong: 'rgba(13, 21, 30, 0.16)',
    inputBackground: '#FFFFFF',
  },
  dark: {
    text: '#EEF2F5',
    background: '#0A1019',
    backgroundElement: '#131D2D',
    backgroundSelected: '#0E1623',
    textSecondary: '#A7B2BC',
    muted: '#7D8A96',
    line: 'rgba(255, 255, 255, 0.09)',
    lineStrong: 'rgba(255, 255, 255, 0.16)',
    inputBackground: '#0C1420',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;