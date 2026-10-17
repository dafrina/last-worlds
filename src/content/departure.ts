/**
 * What follows every boss kill, the same in the campaign and in endless (user requests, 16–17 October 2026):
 * 1. the scroll holds over the wreck for WRECK_HOLD while it burns;
 * 2. the departure: the ship powers away, the scroll ramping to DEPARTURE.speed over DEPARTURE.ramp and holding it,
 *    so the ground-anchored wreck falls out of the bottom of the frame (about 30 units);
 * 3. the hyperdrive warp (WARP.duration) starts at that speed, surges, and settles to cruise. Endless lands on the next
 *    sector's planet; the campaign's results arrive after its flash.
 */
export const WRECK_HOLD = 1.5;
export const DEPARTURE = { duration: 2, speed: 20, ramp: 1 } as const;
/** Warp length, and the campaign victory warp's speed at its middle (endless sizes its surge to its schedule). */
export const WARP = { duration: 3, peak: 30 } as const;

/** The departure `t` seconds after the wreck hold: distance covered and scroll speed (smoothstep ramp, then held). */
export function departure(t: number): { distance: number; speed: number } {
  const { speed: v, ramp } = DEPARTURE;
  if (t < ramp) { const w = Math.max(0, t) / ramp; return { distance: v * ramp * (w ** 3 - w ** 4 / 2), speed: v * w * w * (3 - 2 * w) }; }
  return { distance: v * ramp / 2 + v * (t - ramp), speed: v };
}

/** Warp scroll speed at progress q (0..1): from `start` easing to `cruise`, plus a sin(π q) surge reaching `peak` mid-warp. */
export function warpSpeed(q: number, start: number, cruise: number, peak: number): number {
  return start + (cruise - start) * q + (peak - (start + cruise) / 2) * Math.sin(Math.PI * q);
}
