import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { getSettings, peekSettings, settingsReady } from '@/lib/settings';

function canTick(): boolean {
  if (Platform.OS === 'web') return false;
  if (!settingsReady()) {
    void getSettings();
    return false;
  }
  return peekSettings().hapticsEnabled;
}

/** Light tick for buttons. No-ops on web and when the user turned haptics off. */
export function hapticLight(): void {
  if (!canTick()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Slightly firmer tick for toggling a meal slot or mode. */
export function hapticSelect(): void {
  if (!canTick()) return;
  void Haptics.selectionAsync();
}
