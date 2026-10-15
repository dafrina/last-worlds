import { WORLD_HALF, hash, noise, smoothRange } from './terrain-layout';

/**
 * A mission arena: a stretch of world s where a set-piece fight holds the scroll (Rolling Thunder's
 * Bastion-9). Inside it the ground settles into a broad, flat, clean dusty platform across the full width,
 * framed by low banks, rim columns and a few low formations at the world edges, and it eases in (and out)
 * over ARENA_RAMP units. Endless and training never pass one; with no arena every function here is inert,
 * so all generation output is unchanged.
 */
export interface TerrainArena { readonly fromS: number; readonly toS: number }
/** Length of the transition into (and out of) the platform. */
export const ARENA_RAMP = 20;
/** Platform floor level. */
export const ARENA_LEVEL = 0;

/** Platform weight at forward distance s: 0 outside, 1 on the platform, smooth over the ramps. */
export function arenaWeight(arena: TerrainArena | undefined, s: number): number {
  if (!arena) return 0;
  return smoothRange(arena.fromS - ARENA_RAMP, arena.fromS, s) * (1 - smoothRange(arena.toS, arena.toS + ARENA_RAMP, s));
}
/** Whether [s0, s1] reaches the arena or its ramps (widened by `margin`). */
export function nearArena(arena: TerrainArena | undefined, s0: number, s1: number, margin = 0): boolean {
  return !!arena && s1 >= arena.fromS - ARENA_RAMP - margin && s0 <= arena.toS + ARENA_RAMP + margin;
}
export const sameArena = (a: TerrainArena | undefined, b: TerrainArena | undefined) =>
  a === b || (!!a && !!b && a.fromS === b.fromS && a.toS === b.toS);

/** Mean width of the basalt paving plates the platform floor is made of. */
const PLATE = 5.5;
/** Where the floor rises into a low lip at the world edges (|x| from here to the edge); flat inside it. */
const BANK_FROM = WORLD_HALF - 1.6;

/**
 * Old basalt paving: column tops worn flush into broad plates, with dark weathered cracks between them. `crack` is 1 in a crack and 0 on a plate; `tone` (−1..1) varies per plate; `lift` is the height relief.
 */
export function arenaPaving(seed: number, x: number, s: number): { lift: number; crack: number; tone: number } {
  const gx = Math.floor(x / PLATE), gs = Math.floor(s / PLATE);
  let near = Infinity, second = Infinity, cx = 0, cs = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ix = gx + i, is = gs + j;
    const px = (ix + 0.08 + hash(seed ^ 0xa7f1, ix, is) * 0.84) * PLATE, ps = (is + 0.08 + hash(seed ^ 0xa7f2, ix, is) * 0.84) * PLATE;
    const d = Math.hypot(x - px, s - ps);
    if (d < near) { second = near; near = d; cx = ix; cs = is; } else if (d < second) second = d;
  }
  const crack = 1 - smoothRange(0.1, 0.38, (second - near) / 2), tone = hash(seed ^ 0xa7f3, cx, cs) * 2 - 1;
  const floor = 1 - smoothRange(BANK_FROM - 0.4, BANK_FROM + 0.6, Math.abs(x));
  return { lift: (tone * 0.035 - crack * 0.07) * floor, crack: crack * floor, tone: tone * floor };
}

/**
 * Platform ground: a solid paved floor with gentle swells (a few tenths at most), flat across the width,
 * rising into a low uneven lip only in the last unit and a half before each world edge.
 */
export function arenaGround(seed: number, x: number, s: number, paving = arenaPaving(seed, x, s)): number {
  const swell = (noise(seed ^ 0xa7e1, x * 0.08, s * 0.07) - 0.5) * 0.3 + (noise(seed ^ 0xa7e2, x * 0.55, s * 0.5) - 0.5) * 0.05;
  const bank = smoothRange(BANK_FROM, WORLD_HALF - 0.2, Math.abs(x)) * (0.35 + noise(seed ^ 0xa7e3, x * 0.21, s * 0.13) * 0.35);
  return ARENA_LEVEL + swell + paving.lift + bank;
}
