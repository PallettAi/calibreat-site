/**
 * Whether the first-run startup tour has been seen. One AsyncStorage key — the
 * tour shows automatically once after setup, and Settings can replay it at any
 * time without touching this flag's meaning.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOUR_SEEN_KEY = 'calibreat.tour.seen.v1';

/** True once the user has finished or skipped the tour. */
export async function loadTourSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(TOUR_SEEN_KEY)) === '1';
}

/** Record that the tour has been finished or skipped. */
export async function saveTourSeen(): Promise<void> {
  await AsyncStorage.setItem(TOUR_SEEN_KEY, '1');
}
