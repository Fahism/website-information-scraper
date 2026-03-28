interface KeyState {
  key: string;
  exhaustedAt: number | null;
}

const RESET_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadKeys(): KeyState[] {
  const keys: string[] = [];

  // Primary: SEARCHAPI_API_KEY_1, SEARCHAPI_API_KEY_2, ...
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`SEARCHAPI_API_KEY_${i}`];
    if (k) keys.push(k);
  }

  // Fallback: legacy single-key env var
  if (keys.length === 0) {
    const legacy = process.env.SEARCHAPI_API_KEY;
    if (legacy) keys.push(legacy);
  }

  return keys.map(key => ({ key, exhaustedAt: null }));
}

// Module-level state — persists across requests within the same server instance
const keyStates: KeyState[] = loadKeys();

/**
 * Returns the first non-exhausted key, or null if all keys are exhausted.
 * Automatically resets keys that have been exhausted for longer than RESET_AFTER_MS.
 */
export function getNextAvailableKey(): string | null {
  const now = Date.now();

  for (const state of keyStates) {
    if (state.exhaustedAt !== null && now - state.exhaustedAt > RESET_AFTER_MS) {
      state.exhaustedAt = null;
    }

    if (state.exhaustedAt === null) {
      return state.key;
    }
  }

  return null;
}

/**
 * Marks a key as exhausted so the next call to getNextAvailableKey() skips it.
 */
export function markKeyExhausted(key: string): void {
  const state = keyStates.find(s => s.key === key);
  if (state) {
    state.exhaustedAt = Date.now();
  }
}

/**
 * Returns the next non-exhausted key that is different from the given key.
 * Use this to retry after a 429/402 without re-trying the exhausted key.
 */
export function getNextAvailableKeyExcluding(exhaustedKey: string): string | null {
  const now = Date.now();
  for (const state of keyStates) {
    if (state.key === exhaustedKey) continue;
    if (state.exhaustedAt !== null && now - state.exhaustedAt > RESET_AFTER_MS) {
      state.exhaustedAt = null;
    }
    if (state.exhaustedAt === null) return state.key;
  }
  return null;
}
