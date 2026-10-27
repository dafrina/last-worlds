/**
 * Ground batteries' rounds as drawn (render-only; user, 27 October: "where the projectile spawns, it kinda doesnt look
 * like its anchored to the map").
 *
 * A ground battery is anchored to the terrain and seen through the lens, so the camera following the ship shifts it a
 * little across the view (parallax). The simulation fires its rounds from the muzzle point forecast when the windup
 * started (`Enemy.ground.muzzle`), which keeps them exactly where the fairness director checked them. The renderer
 * draws each round leaving from the battery as drawn instead, in a straight line to where the simulation's round
 * crosses the player's row; from that row on, the drawn round is the simulated one. Hits never depend on this.
 */
export interface Launch {
  /** Where the battery is drawn, relative to the simulation's firing point (flight-plane units). */
  dx: number; ds: number;
  /** The row the simulation's round left from. */
  s0: number;
}
interface Shot { x: number; s: number; vx: number; vs: number }

/** Shots leave this far ahead of their muzzle (src/sim/attacks.ts, `enemyShots`). */
const SPAWN_AHEAD = .2;
/**
 * A new round's launch, when it left the forecast `muzzle` of a battery drawn at `battery` within the last `within`
 * seconds; null when it did not come from there.
 */
export function launchFrom(shot: Shot, muzzle: { x: number; s: number }, battery: { x: number; s: number }, within = .3): Launch | null {
  const s0 = muzzle.s - SPAWN_AHEAD;
  if (s0 <= .5 || Math.abs(shot.vs) < 1e-6) return null;
  const age = (shot.s - s0) / shot.vs;
  if (age < -1e-6 || age > within || Math.abs(shot.x - shot.vx * age - muzzle.x) > .6) return null;
  return { dx: battery.x - muzzle.x, ds: battery.s - muzzle.s, s0 };
}

/** Where a launched round is drawn and its drawn heading: the offset shrinks to nothing as it reaches the player's row. */
export function drawnShot(shot: Shot, launch: Launch): Shot {
  const k = Math.min(1, Math.max(0, shot.s / launch.s0));
  return { x: shot.x + launch.dx * k, s: shot.s + launch.ds * k, vx: shot.vx + launch.dx * shot.vs / launch.s0, vs: shot.vs * (1 + launch.ds / launch.s0) };
}
