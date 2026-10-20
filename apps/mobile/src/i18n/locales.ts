/** Pure i18n rules. No React Native imports, so check scripts can load it. */
import { en, type MessageKey, type Messages } from './messages/en.ts';
import { bn } from './messages/bn.ts';
import { de } from './messages/de.ts';
import { es } from './messages/es.ts';
import { fr } from './messages/fr.ts';
import { hi } from './messages/hi.ts';
import { it } from './messages/it.ts';
import { pa } from './messages/pa.ts';
import { pl } from './messages/pl.ts';
import { pt } from './messages/pt.ts';
import { ur } from './messages/ur.ts';

/** Every language the app offers. English is the source of truth. */
export const LOCALES = ['en', 'es', 'fr', 'de', 'pl', 'pt', 'it', 'hi', 'ur', 'pa', 'bn'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Each language is named in its own script so a speaker can find it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pl: 'Polski',
  pt: 'Português',
  it: 'Italiano',
  hi: 'हिन्दी',
  ur: 'اردو',
  pa: 'ਪੰਜਾਬੀ',
  bn: 'বাংলা',
};

const DICTIONARIES: Record<Locale, Messages> = {
  en,
  es,
  fr,
  de,
  pl,
  pt,
  it,
  hi,
  ur,
  pa,
  bn,
};

export function parseLocale(value: unknown): Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value) ? (value as Locale) : DEFAULT_LOCALE;
}

/**
 * Looks up `key` in `locale` and fills `{name}` placeholders from `vars`.
 * A missing translation falls back to English, so a gap shows English rather
 * than a raw key.
 */
export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale][key] || en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** The placeholder names a message uses, sorted. Used by the check script. */
export function placeholdersIn(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{(\w+)\}/g)) names.add(match[1]);
  return [...names].sort();
}

export function dictionaryFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
