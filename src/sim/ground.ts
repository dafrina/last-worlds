import { GROUND_KINDS } from '../content/balance';
import { fromFlightPlane, toFlightPlane } from '../shared/lens';
import type { Enemy, RunState } from '../shared/contracts';
import { VIEW } from '../shared/contracts';
import { groundSeat, runRoute } from '../world/run-route';
import { TERRAIN_MIN_HEIGHT } from '../world/terrain';

/**
 * Ground enemies under the release lens (user, 21 October: turrets and tanks floating; "I want a proper solution"):
 * a turret, missile battery or fuel skid is a thing on the terrain. At spawn it is anchored where the lens's line of
 * sight through its authored gameplay position first meets the ground (or the sea, on a pontoon); from then on the
 * anchor is fixed in the world and scrolls with it, and the enemy's gameplay position is that anchor's core seen
 * through the lens on the flight plane. Its model, compound, shots and hits therefore always agree on screen. Pure: the
 * route's terrain and the lens are deterministic functions of the run.
 */
const STEP = .25;
/**
 * The gameplay row where a ground enemy's lens position equals its authored track: mid-screen, inside the batteries'
 * authored firing band (windups may start between rows 18.8 and 3.6, content/formations.ts). A deep anchor's on-screen
 * path deviates from the authored one in both directions from here (about ±1 unit on ordinary ground) instead of piling
 * up at the bottom; it also spawns a little beyond the top edge rather than at it.
 */
export const MATCH_ROW = 10;
/**
 * Where the line of sight through gameplay point (x, MATCH_ROW) first meets a core of height `core` resting on the ground,
 * `ahead` units of scroll from now: the ground point (in the frame of that moment, s relative to its distance) and its
 * seat. Pure; the seat search of strike sites (src/sim/sites.ts) uses it too.
 */
export function lineOfSightGround(state: RunState, x: number, ahead: number, core: number): { at: { x: number; s: number }; seat: { base: number; afloat: boolean } } {
  const route = runRoute(state.config), seed = state.config.seed;
  // Walk the line of sight down from the flight plane until the core would sit on (or under) the surface, then refine.
  const probe = (y: number) => {
    const at = fromFlightPlane(state.cameraX, x, MATCH_ROW, y);
    const seat = groundSeat(seed, route, at.x, state.distance + ahead + at.s);
    return { at, seat, gap: y - core - seat.base };
  };
  let above: number = VIEW.flightHeight, hit = probe(above);
  for (let y = above - STEP; y >= TERRAIN_MIN_HEIGHT; y -= STEP) {
    const next = probe(y);
    if (next.gap <= 0) {
      let lo = y, hi = above;
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (probe(mid).gap > 0) hi = mid; else lo = mid; }
      hit = probe((lo + hi) / 2);
      break;
    }
    above = y; hit = next;
  }
  return { at: hit.at, seat: hit.seat };
}
export function anchorGround(state: RunState, enemy: Enemy): void {
  if (!GROUND_KINDS.has(enemy.kind) || enemy.bossPart || !enemy.formation) return;
  // The track scrolls with the world, so the anchor is solved at the moment the track crosses MATCH_ROW (`ahead` units of
  // scroll from now), with the camera of now.
  const ahead = enemy.s - MATCH_ROW;
  const { at, seat } = lineOfSightGround(state, enemy.x, ahead, enemy.groundHeight), dx = at.x - enemy.x, ds = at.s - MATCH_ROW;
  enemy.ground = { dx, ds, x: enemy.x + dx, s: enemy.s + ds, base: seat.base, afloat: seat.afloat, cameraX: state.cameraX };
  projectGround(state, enemy);
}

/** After the formation track moved: the anchor rides the track (fixed in the world), and the gameplay position follows the lens. */
export function projectGround(state: RunState, enemy: Enemy): void {
  const g = enemy.ground;
  if (!g) return;
  g.x = enemy.x + g.dx; g.s = enemy.s + g.ds; g.cameraX = state.cameraX;
  const seen = toFlightPlane(state.cameraX, g.x, g.base + enemy.groundHeight, g.s);
  enemy.x = seen.x; enemy.s = seen.s;
}
