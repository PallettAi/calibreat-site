/**
 * Web / iOS stand-in for health-connect.ts. Health Connect does not exist
 * here, so the toggle is always off and the kernel uses Train estimates.
 */
export const MIN_SESSION_MS = 5 * 60 * 1000;

export type DayActivity = {
  activeKcal: number;
  exerciseCount: number;
  steps: number | null;
  fetchedAt: string;
};

export type ConnectResult = 'connected' | 'denied' | 'unavailable';

export async function isHealthConnectEnabled(): Promise<boolean> {
  return false;
}

export async function connectHealthConnect(): Promise<ConnectResult> {
  return 'unavailable';
}

export async function disconnectHealthConnect(): Promise<void> {}

export async function stillGranted(): Promise<boolean> {
  return false;
}

export async function getCachedDayActivity(_dayKeyValue: string): Promise<DayActivity | null> {
  return null;
}

export async function readDayActivity(_dayKeyValue: string): Promise<DayActivity | null> {
  return null;
}
