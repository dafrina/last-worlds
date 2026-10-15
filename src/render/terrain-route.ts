import { endlessSchedule } from '../content/endless';
import { routeOf, type TerrainRoute } from '../world/terrain';
import type { RunConfig } from '../shared/contracts';

/**
 * The run's terrain route (docs/18 §3), from its schedule alone: planet stretches, boss arenas and jump flashes
 * by world distance. Endless follows the planet cycle (identical for every seed); a campaign mission is its one
 * planet with its arena, exactly the world it had before routes existed.
 */
export function runRoute(config: Pick<RunConfig, 'mode' | 'mission'>): TerrainRoute {
  const key = config.mode === 'endless' ? 'endless' : `campaign:${config.mission ?? ''}`;
  return routeOf(key, endlessSchedule(config));
}
