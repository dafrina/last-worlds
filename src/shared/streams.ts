/*
 * Seeded streams for the simulation and content scheduling (AGENTS.md: never Math.random there). Each caller owns a stream
 * by its salt, so no two systems share draws: the encounter deck ("deck"), the hunters ("hunt") and the site parts ("part").
 */

function mix(salt: number, keys: readonly number[]): number {
  let h = salt;
  for (const v of keys) { h = Math.imul(h ^ (v >>> 0), 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; }
  return h >>> 0;
}

/** A 32-bit hash of `keys` mixed into `salt`: a keyed stream's seed. */
export const keyedHash = (salt: number, ...keys: number[]): number => mix(salt, keys);

/** A unit roll in [0, 1) keyed by `keys` on the stream named by `salt`. */
export const keyedUnit = (salt: number, ...keys: number[]): number => mix(salt, keys) / 4294967296;

/** Mulberry32: unit rolls in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
