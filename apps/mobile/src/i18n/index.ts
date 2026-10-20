import { useCallback, useSyncExternalStore } from 'react';

import { DEFAULT_LOCALE, translate, type Locale } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/messages/en';

export type { Locale, MessageKey };
export { LOCALES, LOCALE_NAMES, parseLocale } from '@/i18n/locales';

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

/** Switches the whole app. Every component using `useT` re-renders. */
export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** Plain lookup for code outside React (notifications, share text). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(current, key, vars);
}

/** `t` bound to the current language. Re-renders the caller when it changes. */
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const tr = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
  return { t: tr, locale };
}
