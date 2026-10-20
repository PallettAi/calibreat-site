/**
 * Accuracy checks for the light / dark / system theme choice (run: npm run check:theme).
 *
 * `system` must clear the override (`'unspecified'`) so the phone's own setting is used.
 * `light` and `dark` must force that scheme. Anything unrecognised falls back to system.
 */
import { colorSchemeOverride, DEFAULT_THEME_MODE, parseThemeMode } from '../src/lib/theme-mode.ts';

let fails = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

eq('default theme mode follows the system', DEFAULT_THEME_MODE, 'system');

eq('parse keeps system', parseThemeMode('system'), 'system');
eq('parse keeps light', parseThemeMode('light'), 'light');
eq('parse keeps dark', parseThemeMode('dark'), 'dark');
eq('parse rejects unknown string', parseThemeMode('sepia'), 'system');
eq('parse rejects empty string', parseThemeMode(''), 'system');
eq('parse rejects capitalised light', parseThemeMode('Light'), 'system');
eq('parse rejects null', parseThemeMode(null), 'system');
eq('parse rejects undefined', parseThemeMode(undefined), 'system');
eq('parse rejects a number', parseThemeMode(1), 'system');

eq('system clears the override', colorSchemeOverride('system'), 'unspecified');
eq('light forces light', colorSchemeOverride('light'), 'light');
eq('dark forces dark', colorSchemeOverride('dark'), 'dark');

// A saved value that is not a valid mode must never reach Appearance.setColorScheme.
eq('garbage saved value clears the override', colorSchemeOverride(parseThemeMode('nope')), 'unspecified');

if (fails) {
  console.log(`\n${fails} failed`);
  process.exit(1);
}
console.log('\nall theme mode checks passed');
