import { SPECIALS } from '../content/equipment';
import { VIEW, type RunState } from '../shared/contracts';

/**
 * The Orbital Strike's sweep (docs/42): one front across the whole map, from just beyond the map edge nearer the view to
 * beyond the other edge, in SPECIALS['orbital-strike'].sweep seconds (user, 15 November: "make it always from the closer
 * side towards the other. Maybe increase the speed to 1.75s total so it isnt as noticeable that its delayed if it starts
 * off screen edge"). Everything on the map is struck, also ground uncovered by moving. The simulation kills by it
 * (src/sim/game.ts updateOrbital); the renderer lays the barrage along it (src/render/fx-particles.ts) and the pall behind
 * it (src/render/post-pipeline.ts).
 */
const MAP_REACH = VIEW.worldWidth / 2 + 1;
/** Units a second: the map's width (plus its margins) in the sweep time. */
export const orbitalSpeed = () => 2 * MAP_REACH / SPECIALS['orbital-strike'].sweep;
/** The way a strike called with the camera at `cameraX` sweeps: from the nearer map edge (on the centre, from the left). */
export const orbitalDirection = (cameraX: number): -1 | 1 => cameraX > 0 ? -1 : 1;
/** Where it starts: just beyond that map edge. */
export const orbitalOrigin = (direction: -1 | 1) => -direction * MAP_REACH;
/** How far the front has gone from the origin `elapsed` seconds in. */
export const orbitalRadius = (elapsed: number) => orbitalSpeed() * Math.max(0, elapsed);
/** Seconds from one map edge to the other. */
export const orbitalDuration = () => SPECIALS['orbital-strike'].sweep;
/** The front's x `elapsed` seconds into a strike. */
export const orbitalFront = (orbital: NonNullable<RunState['orbital']>, elapsed: number) => orbital.origin + orbital.direction * orbitalRadius(elapsed);
