import { TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT, clamp, mix, type Mood, type MoodParams } from './terrain-layout';
import { padInfluence, settlementsNear, type Settlement } from './terrain-settlements';
import { arenaWeight, type TerrainArena } from './terrain-arena';
import { worldOf, type PlanetPoint, type World, type WorldInput } from './terrain-planet';

/** Everything constant along one forward row: planet and mood, the settlement pads that reach it, and any arena. */
export interface TerrainRow {
  seed: number; s: number; mood: Mood; params: MoodParams; sites: Settlement[];
  arena: TerrainArena | undefined;
  /** How far this row has settled into the arena platform (0 without an arena). */
  platform: number;
  world: World;
  /** Planet-specific row data (Vesper's mood parameters). */
  local: unknown;
}
/** A few recent rows are reused (rows are immutable), which cuts allocation in path search and seating. */
const recentRows: TerrainRow[] = [];
export function terrainRow(seed: number, s: number, input?: WorldInput | World): TerrainRow {
  const world = worldOf(input);
  for (const row of recentRows) if (row.s === s && row.seed === seed && row.world === world) return row;
  const { planet, arena } = world;
  const sites = settlementsNear(seed, s, s, arena, planet).filter(site => site.flatten > 0 && Math.abs(s - site.s) < site.hs + 2.5);
  const row = { seed, s, mood: planet.mood(seed, s) as Mood, params: planet.params(seed, s), sites, arena, platform: arenaWeight(arena, s), world, local: planet.local(seed, s) };
  recentRows.unshift(row); if (recentRows.length > 4) recentRows.pop();
  return row;
}

export type TerrainPoint = PlanetPoint;
/** Ground at a point: the planet's landform, flattened to the pad level under settlements, then any arena. */
export function rowPoint(row: TerrainRow, x: number): TerrainPoint {
  const planet = row.world.planet, form = planet.landform(row.seed, x, row.s, row);
  let industrial = 0, height = form.height;
  // Pads flatten ground, never water (a harbour keeps its cliff and the sea in front of it).
  const dry = planet.seaLevel === null || form.height >= planet.seaLevel;
  if (dry) for (const site of row.sites) {
    const influence = padInfluence(site, x, row.s);
    if (influence > industrial) { industrial = influence; height = mix(form.height, site.level, influence); }
  }
  // The landform object is fresh per call, so it is completed in place instead of copied (less garbage).
  const point = form as TerrainPoint;
  point.height = clamp(height, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT); point.industrial = industrial;
  point.pool = form.pool * (1 - industrial); point.veins = form.veins * (1 - industrial);
  // A mission arena reshapes its stretch (never in endless or training: platform is 0 there).
  if (row.platform > 0) planet.arena(row, x, point);
  return point;
}
/**
 * Seating height only: cheap enough for per-frame turret seating, flight shadows and path search. `world` is
 * `{ planet, arena }` (Khepri without an arena when omitted; a bare arena still means Khepri).
 */
export function terrainHeight(seed: number, x: number, s: number, world?: WorldInput | World): number {
  return rowPoint(terrainRow(seed, s, world), x).height;
}
