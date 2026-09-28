/**
 * Which day the daily recap was last offered for. One tiny AsyncStorage key —
 * the flag is the whole feature: show the recap sheet for the most recent
 * closed day once, never twice, and never again if the user taps "Not now"
 * (they can still share from the streak sheet whenever they like).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const RECAP_OFFERED_KEY = 'calibreat.dailyRecap.offeredForDayKey';

/** The dayKey the recap was last offered for, or null. */
export async function loadRecapOfferedDayKey(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(RECAP_OFFERED_KEY);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** Record that the recap was offered (shown or dismissed) for `dayKey`. */
export async function saveRecapOfferedDayKey(dayKey: string): Promise<void> {
  await AsyncStorage.setItem(RECAP_OFFERED_KEY, dayKey);
}
