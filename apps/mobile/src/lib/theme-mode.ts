/** Pure theme-mode rules. No React Native imports, so check scripts can load it. */

/** `system` follows the phone's light/dark setting; the others force it. */
export type ThemeMode = 'system' | 'light' | 'dark';

export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export function parseThemeMode(value: unknown): ThemeMode {
  if (value === 'system' || value === 'light' || value === 'dark') return value;
  return DEFAULT_THEME_MODE;
}

/**
 * The value handed to `Appearance.setColorScheme`. `'unspecified'` clears the
 * override so the OS setting is used again.
 */
export function colorSchemeOverride(mode: ThemeMode): 'light' | 'dark' | 'unspecified' {
  return mode === 'system' ? 'unspecified' : mode;
}
