/*
 * One policy for browser storage. Private modes, blocked site data and quota errors make `localStorage` throw on access,
 * read or write; every caller then keeps its in-memory defaults for the session. Never used by the simulation.
 */

/** The page's localStorage, or undefined where it is unavailable. */
export function safeStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

/**
 * The stored JSON at `key` through `sanitize` (an absent key reaches it as null), or null when storage is unavailable,
 * the text does not parse or `sanitize` throws.
 */
export function readJson<T>(key: string, sanitize: (value: unknown) => T): T | null {
  try {
    const storage = safeStorage();
    return storage ? sanitize(JSON.parse(storage.getItem(key) ?? 'null')) : null;
  } catch { return null; }
}

/** Stores `value` as JSON at `key`; false when storage is unavailable or refuses it (the value then lasts this session). */
export function writeJson(key: string, value: unknown): boolean {
  try {
    const storage = safeStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
