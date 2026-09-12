import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyFastState, type FastState } from '@/lib/fasting';

const FASTING_KEY = 'calibreat.fasting.v1';

function asFastState(raw: unknown): FastState {
  const row = raw && typeof raw === 'object' ? (raw as Partial<FastState>) : {};
  const startedAt =
    typeof row.startedAt === 'string' && Number.isFinite(Date.parse(row.startedAt)) ? row.startedAt : null;
  const lastEndedAt =
    typeof row.lastEndedAt === 'string' && Number.isFinite(Date.parse(row.lastEndedAt)) ? row.lastEndedAt : null;
  const lastDuration = Number(row.lastDurationMs);
  return {
    startedAt,
    lastEndedAt,
    lastDurationMs: Number.isFinite(lastDuration) && lastDuration >= 0 ? Math.round(lastDuration) : null,
  };
}

export async function loadFastState(): Promise<FastState> {
  const raw = await AsyncStorage.getItem(FASTING_KEY);
  if (!raw) return emptyFastState();
  try {
    return asFastState(JSON.parse(raw));
  } catch {
    return emptyFastState();
  }
}

export async function saveFastState(state: FastState): Promise<void> {
  await AsyncStorage.setItem(FASTING_KEY, JSON.stringify(state));
}
