/**
 * A browser-like storage in memory: a reload is a new store over the same `values`. `initial` seeds keys (a save
 * written by an earlier build, say).
 */
export function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
