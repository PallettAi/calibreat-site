import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyStreak, type StreakState } from '@/lib/streak';

const STREAK_KEY = 'calibreat.streak.v1';

function asStreak(raw: unknown): StreakState {
  const row = raw && typeof raw === 'object' ? (raw as Partial<StreakState>) : {};
  const current = Number(row.current);
  const best = Number(row.best);
  const lastKey =
    typeof row.lastClaimedDayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.lastClaimedDayKey)
      ? row.lastClaimedDayKey
      : null;
  const lastAt =
    typeof row.lastClaimedAt === 'string' && Number.isFinite(Date.parse(row.lastClaimedAt)) ? row.lastClaimedAt : null;
  return {
    current: Number.isFinite(current) && current > 0 ? Math.round(current) : 0,
    lastClaimedAt: lastAt,
    lastClaimedDayKey: lastKey,
    best: Number.isFinite(best) && best > 0 ? Math.round(best) : 0,
  };
}

export async function loadStreak(): Promise<StreakState> {
  const raw = await AsyncStorage.getItem(STREAK_KEY);
  if (!raw) return emptyStreak();
  try {
    return asStreak(JSON.parse(raw));
  } catch {
    return emptyStreak();
  }
}

export async function saveStreak(state: StreakState): Promise<void> {
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(state));
}
