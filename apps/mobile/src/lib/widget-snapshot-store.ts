/**
 * Widget snapshot storage. AsyncStorage (not a file) so the headless widget
 * task can read it without the app UI running. Reads are validated by
 * parseWidgetSnapshot, so a corrupt value shows "Open calibrEAT", not a crash.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseWidgetSnapshot, type WidgetSnapshot } from './widget-snapshot';

const KEY = 'calibreat.widget-snapshot.v1';

export async function saveWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? parseWidgetSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
