import { endlessSchedule } from '../content/endless';
import { routeOf, terrainHeight, worldAt, type TerrainRoute } from './terrain';
import type { RunConfig } from '../shared/contracts';

/**
 * The run's terrain route (docs/18 §3), from its schedule alone: planet stretches, boss arenas and jump flashes
 * by world distance. Endless follows the planet cycle (identical for every seed); a campaign mission is its one
 * planet with its arena, exactly the world it had before routes existed. Pure: the renderer and (since 21 October,
 * for ground enemies' seats) the simulation read the same route.
 */
export function runRoute(config: Pick<RunConfig, 'mode' | 'mission'>): TerrainRoute {
  const key = config.mode === 'endless' ? 'endless' : `campaign:${config.mission ?? ''}`;
  return routeOf(key, endlessSchedule(config));
}

/** Deck height of the pontoon a ground battery rides over open water. */
export const PONTOON_DECK = .14;
/**
 * What a ground piece rests on at world (x, s) on a route: the terrain, or over open water a pontoon on the sea surface.
 * `base` is the deck or ground height under the piece.
 */
export function groundSeat(seed: number, route: TerrainRoute, x: number, s: number): { base: number; afloat: boolean } {
  const ground = terrainHeight(seed, x, s, route), sea = worldAt(route, s).planet.seaLevel;
  if (sea === null || ground >= sea - .05) return { base: sea === null ? ground : Math.max(ground, sea), afloat: false };
  return { base: sea + PONTOON_DECK, afloat: true };
}
