import { BOSSES } from '../content/bosses';
import { DEPARTURE_CLIMB } from '../content/departure';
import type { RunState } from '../shared/contracts';

/** 6x⁵ − 15x⁴ + 10x³ with x clamped to 0..1: it starts and ends with zero speed and zero acceleration, so it never jerks. */
export function smootherstep(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * How far the hero's model is lifted over the flight plane this frame (render only). After every boss kill the ship climbs
 * (DEPARTURE_CLIMB, or the boss's own) as the departure carries it over the wreck, and over HELION STRONGHOLD's mountain,
 * and holds that height into the warp. Everything drawn with the ship rises with it: its trails, shield, plumes, shots and
 * specials, and the pickups it collects (src/render/scene.ts). The simulation never sees this.
 *
 * An endless planet jump lands the ship back on its flight plane over the warp's second half, after the flash: the old
 * planet's terrain is gone by then (src/render/fx-jump.ts), and the next sector starts with the ship in its row. The
 * campaign's victory warp has nowhere to land, so the ship stays up behind the results.
 */
export function heroLift(state: RunState): number {
  const boss = state.boss;
  if (!boss || boss.clearedAt === undefined) return 0;
  const climb = BOSSES[boss.id]?.departureClimb ?? DEPARTURE_CLIMB;
  const up = climb.height * smootherstep((state.time - boss.clearedAt - climb.from) / climb.over);
  const jump = state.jump;
  if (!jump || state.config.mode !== 'endless') return up;
  const half = jump.duration / 2;
  return up * (1 - smootherstep((state.time - jump.startedAt - half) / half));
}
