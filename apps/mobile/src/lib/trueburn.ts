/**
 * calibrEAT True Burn persistence (Phase A.1).
 *
 * No SQLite migration — plain AsyncStorage/localStorage keys so the app
 * stays cheap to maintain and works on web (AsyncStorage is the polyfill
 * there already). The only thing we persist is the user's Adopt/Keep choice
 * so we never auto-change their calorie target.
 *
 * Platform split lives in the caller: `home.tsx` imports this file on
 * native/web and we branch on `typeof localStorage`.
 */

const KEY_STATE = 'calibreat.trueburn.v1';
const KEY_OVERRIDE = 'calibreat.calorie_override.v1'; // numeric kcal or empty = none

export type TrueBurnState = {
  /** Suggested target the user last acted on (so we know if suggestion changed). */
  lastSeenSuggested?: number | null;
  /** What they chose — keep preserves the formula target, adopt switches dial. */
  decision?: 'adopt' | 'keep' | null;
  /** When they dismissed (Keep) — so we can re-prompt after 7 days. */
  dismissedAt?: string | null;
  /** Explicit Adopt keeps measured-driven target until they change goal in setup. */
  adoptedSuggested?: number | null;
};

/** Calorie override — when set, home uses this instead of stored goals row. */
export type CalorieOverride = number | null;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false;
  }
}

function storage(): Storage | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Normalises a parsed storage blob into a TrueBurnState.
 *
 * `JSON.parse` happily returns null, a string, a number or an array, and this
 * value is read during render — callers dereference `state.decision` without
 * a guard. So a blob that is not a plain object becomes "no opinion" rather
 * than a null that throws three lines later. Anything we cannot recognise is
 * treated as absent, which is always safe: the worst case is one extra prompt.
 */
function asState(parsed: unknown): TrueBurnState {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as TrueBurnState;
}

export async function getTrueBurnState(): Promise<TrueBurnState> {
  // On native, AsyncStorage; on web, localStorage. Use the sync localStorage
  // path where available — fast enough and avoids a new native dep.
  const s = storage();
  if (s) {
    const raw = s.getItem(KEY_STATE);
    if (!raw) return {};
    try {
      return asState(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  // Native fallback — dynamic import so web never touches AsyncStorage
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const raw = await AsyncStorage.getItem(KEY_STATE);
    if (!raw) return {};
    return asState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveTrueBurnState(next: TrueBurnState): Promise<void> {
  const s = storage();
  const json = JSON.stringify(next);
  if (s) {
    s.setItem(KEY_STATE, json);
    return;
  }
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(KEY_STATE, json);
  } catch {
    // best effort
  }
}

export async function getCalorieOverride(): Promise<CalorieOverride> {
  const s = storage();
  const read = (raw: string | null): CalorieOverride => {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 800 && n <= 6000 ? Math.round(n) : null;
  };
  if (s) return read(s.getItem(KEY_OVERRIDE));
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    return read(await AsyncStorage.getItem(KEY_OVERRIDE));
  } catch {
    return null;
  }
}

export async function setCalorieOverride(kcal: number | null): Promise<void> {
  const s = storage();
  if (kcal == null) {
    if (s) s.removeItem(KEY_OVERRIDE);
    else {
      try {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.removeItem(KEY_OVERRIDE);
      } catch {}
    }
    return;
  }
  const v = String(Math.round(kcal));
  if (s) s.setItem(KEY_OVERRIDE, v);
  else {
    try {
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.setItem(KEY_OVERRIDE, v);
    } catch {}
  }
}

export function shouldShowAdoptPrompt(state: TrueBurnState, suggested: number | null | undefined): boolean {
  if (!suggested) return false;
  if (state.decision === 'adopt' && state.adoptedSuggested === suggested) return false;
  if (state.decision === 'keep' && state.lastSeenSuggested === suggested) {
    // A keep with no usable timestamp cannot start its own 7-day cooldown, so
    // there is nothing to suppress *yet*: show the prompt rather than let a
    // malformed record silence it permanently. `dismissedAt` is written on
    // every keep, so this is a corrupt-record path, not a normal one — and
    // re-asking is the recoverable direction.
    const t = state.dismissedAt ? Date.parse(state.dismissedAt) : NaN;
    if (!Number.isFinite(t)) return true;
    if (Date.now() - t < 7 * 86400000) return false;
  }
  return true;
}
