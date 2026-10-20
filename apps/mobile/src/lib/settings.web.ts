import {
  clampHour,
  clampMinute,
  DEFAULT_WEIGH_IN_FREQUENCY,
  DEFAULT_WEIGH_IN_HOUR,
  DEFAULT_WEIGH_IN_MINUTE,
  parseFrequency,
  type WeighInFrequency,
} from '@/lib/weigh-in-reminders';
import { DEFAULT_THEME_MODE, parseThemeMode, type ThemeMode } from '@/lib/theme-mode';
import { DEFAULT_LOCALE, parseLocale, type Locale } from '@/i18n/locales';

const SETTINGS_KEY = 'calibreat.settings.v1';

export type AppSettings = {
  remindersEnabled: boolean;
  hapticsEnabled: boolean;
  weighInReminders: boolean;
  weighInReminderHour: number;
  weighInReminderMinute: number;
  weighInReminderFrequency: WeighInFrequency;
  themeMode: ThemeMode;
  language: Locale;
};

const DEFAULTS: AppSettings = {
  remindersEnabled: true,
  hapticsEnabled: true,
  weighInReminders: false,
  weighInReminderHour: DEFAULT_WEIGH_IN_HOUR,
  weighInReminderMinute: DEFAULT_WEIGH_IN_MINUTE,
  weighInReminderFrequency: DEFAULT_WEIGH_IN_FREQUENCY,
  themeMode: DEFAULT_THEME_MODE,
  language: DEFAULT_LOCALE,
};

/**
 * Web has no `Appearance.setColorScheme`, so the choice is saved but the page
 * keeps following the browser. Native builds force the scheme.
 */
export function applyThemeMode(_mode: ThemeMode): void {}

let snapshot: AppSettings = { ...DEFAULTS };
let hydrated = false;

export function peekSettings(): AppSettings {
  return snapshot;
}

/** False until localStorage has been read — haptics stay off until then. */
export function settingsReady(): boolean {
  return hydrated;
}

function webStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<AppSettings> {
  const storage = webStorage();
  const raw = storage?.getItem(SETTINGS_KEY) ?? null;
  if (!raw) {
    snapshot = { ...DEFAULTS };
    hydrated = true;
    return snapshot;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    snapshot = {
      ...DEFAULTS,
      ...parsed,
      weighInReminderHour: clampHour(parsed.weighInReminderHour),
      weighInReminderMinute: clampMinute(parsed.weighInReminderMinute),
      weighInReminderFrequency: parseFrequency(parsed.weighInReminderFrequency),
      themeMode: parseThemeMode(parsed.themeMode),
      language: parseLocale(parsed.language),
    };
    hydrated = true;
    return snapshot;
  } catch {
    snapshot = { ...DEFAULTS };
    hydrated = true;
    return snapshot;
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  snapshot = next;
  hydrated = true;
  webStorage()?.setItem(SETTINGS_KEY, JSON.stringify(next));
}

export async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings> {
  const cur = await getSettings();
  const next = { ...cur, [key]: value };
  await saveSettings(next);
  return next;
}
