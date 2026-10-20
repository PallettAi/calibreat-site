/**
 * Local routines store (Train v2). AsyncStorage, never uploaded.
 *
 * Routines live outside SQLite so export/restore v1 stays valid. Reads go
 * through `parseRoutines`, so corrupt or hand-edited storage degrades to an
 * empty list instead of crashing the Train screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseRoutines, type Routine } from './routines';

const KEY = 'calibreat.routines.v1';

export async function loadRoutines(): Promise<Routine[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return parseRoutines(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(routines));
}
