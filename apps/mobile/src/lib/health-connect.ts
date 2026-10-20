/**
 * Health Connect (Android only, read-only). Active kcal, exercise sessions and
 * steps for one local day feed the calorie kernel. Nothing is written to
 * Health Connect and nothing leaves the device; the last result per day is
 * cached locally so a slow or failed read keeps the previous number.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  type Permission,
} from 'react-native-health-connect';

const ENABLED_KEY = 'calibreat.health_connect.enabled.v1';
const CACHE_KEY = 'calibreat.activity_days.v1';
const SDK_AVAILABLE = 3;
const READ_TIMEOUT_MS = 8000;
/** Exercise sessions shorter than this are not counted as real activity. */
export const MIN_SESSION_MS = 5 * 60 * 1000;

const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Steps' },
];

export type DayActivity = {
  activeKcal: number;
  exerciseCount: number;
  steps: number | null;
  fetchedAt: string;
};

export type ConnectResult = 'connected' | 'denied' | 'unavailable';

export async function isHealthConnectEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

/**
 * Asks Health Connect for the three read permissions. Denied or missing
 * Health Connect leaves the toggle off, so the kernel stays on Train/none.
 */
export async function connectHealthConnect(): Promise<ConnectResult> {
  try {
    const status = await getSdkStatus();
    if (status !== SDK_AVAILABLE) return 'unavailable';
    await initialize();
    const granted = await requestPermission(PERMISSIONS);
    const hasCalories = granted.some((p) => p.recordType === 'ActiveCaloriesBurned' && p.accessType === 'read');
    if (!hasCalories) {
      await AsyncStorage.setItem(ENABLED_KEY, '0');
      return 'denied';
    }
    await AsyncStorage.setItem(ENABLED_KEY, '1');
    return 'connected';
  } catch {
    return 'unavailable';
  }
}

export async function disconnectHealthConnect(): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, '0');
}

/** True when the read permission is still granted in Health Connect itself. */
export async function stillGranted(): Promise<boolean> {
  try {
    const granted = await getGrantedPermissions();
    return granted.some((p) => p.recordType === 'ActiveCaloriesBurned' && p.accessType === 'read');
  } catch {
    return false;
  }
}

function dayRange(dayKeyValue: string): { startTime: string; endTime: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKeyValue);
  if (!m) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1, 0, 0, 0, 0);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

async function readCache(): Promise<Record<string, DayActivity>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, DayActivity>) : {};
  } catch {
    return {};
  }
}

export async function getCachedDayActivity(dayKeyValue: string): Promise<DayActivity | null> {
  return (await readCache())[dayKeyValue] ?? null;
}

async function fetchDay(dayKeyValue: string): Promise<DayActivity> {
  const range = dayRange(dayKeyValue);
  if (!range) throw new Error('bad day key');
  const timeRangeFilter = { operator: 'between' as const, startTime: range.startTime, endTime: range.endTime };

  const [calories, sessions, steps] = await Promise.all([
    readRecords('ActiveCaloriesBurned', { timeRangeFilter }),
    readRecords('ExerciseSession', { timeRangeFilter }),
    readRecords('Steps', { timeRangeFilter }).catch(() => null),
  ]);

  const activeKcal = calories.records.reduce((sum, r) => sum + (Number(r.energy?.inKilocalories) || 0), 0);
  const exerciseCount = sessions.records.filter((r) => {
    const ms = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
    return Number.isFinite(ms) && ms >= MIN_SESSION_MS;
  }).length;
  const stepTotal = steps ? steps.records.reduce((sum, r) => sum + (Number(r.count) || 0), 0) : null;

  return {
    activeKcal: Math.max(0, Math.round(activeKcal)),
    exerciseCount,
    steps: stepTotal,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Today's (or any day's) activity. Null when Health Connect is off, so the
 * kernel falls back to Train. On a timeout or error, returns the last cached
 * reading for that day instead of failing.
 */
export async function readDayActivity(dayKeyValue: string): Promise<DayActivity | null> {
  if (!(await isHealthConnectEnabled())) return null;
  try {
    const fresh = await Promise.race([
      fetchDay(dayKeyValue),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), READ_TIMEOUT_MS)),
    ]);
    const cache = await readCache();
    cache[dayKeyValue] = fresh;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return fresh;
  } catch {
    return getCachedDayActivity(dayKeyValue);
  }
}
