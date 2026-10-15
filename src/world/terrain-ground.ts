import { TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT, clamp, landform, mix, moodAt, moodParams, type Landform, type Mood, type MoodParams } from './terrain-layout';
import { padInfluence, settlementsNear, type Settlement } from './terrain-settlements';
import { arenaGround, arenaPaving, arenaWeight, sameArena, type TerrainArena } from './terrain-arena';

/** Everything constant along one forward row: mood, the settlement pads that reach it, and any mission arena. */
export interface TerrainRow {
  seed: number; s: number; mood: Mood; params: MoodParams; sites: Settlement[];
  arena: TerrainArena | undefined;
  /** How far this row has settled into the arena platform (0 without an arena). */
  platform: number;
}
/** A few recent rows are reused (rows are immutable), which cuts allocation in path search and seating. */
const recentRows: TerrainRow[] = [];
export function terrainRow(seed: number, s: number, arena?: TerrainArena): TerrainRow {
  for (const row of recentRows) if (row.s === s && row.seed === seed && sameArena(row.arena, arena)) return row;
  const sites = settlementsNear(seed, s, s, arena).filter(site => site.flatten > 0 && Math.abs(s - site.s) < site.hs + 2.5);
  const row = { seed, s, mood: moodAt(seed, s), params: moodParams(seed, s), sites, arena, platform: arenaWeight(arena, s) };
  recentRows.unshift(row); if (recentRows.length > 4) recentRows.pop();
  return row;
}

export interface TerrainPoint extends Landform {
  industrial: number;
  /** Arena platform weight with its paving's crack mask and per-plate tone; absent without an arena. */
  platform?: number; paving?: number; plate?: number;
}
/** Ground at a point: the landform, flattened to the pad level under settlements. */
export function rowPoint(row: TerrainRow, x: number): TerrainPoint {
  const form = landform(row.seed, x, row.s, row.params);
  let industrial = 0, height = form.height;
  for (const site of row.sites) {
    const influence = padInfluence(site, x, row.s);
    if (influence > industrial) { industrial = influence; height = mix(form.height, site.level, influence); }
  }
  // The landform object is fresh per call, so it is completed in place instead of copied (less garbage).
  const point = form as TerrainPoint;
  point.height = clamp(height, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT); point.industrial = industrial;
  point.pool = form.pool * (1 - industrial); point.veins = form.veins * (1 - industrial);
  // A mission arena settles into its flat, clean platform (never in endless or training: platform is 0 there).
  const w = row.platform;
  if (w > 0) {
    const paving = arenaPaving(row.seed, x, row.s);
    point.height = mix(point.height, arenaGround(row.seed, x, row.s, paving), w); point.elevation = mix(point.elevation, 0.56, w);
    point.platform = w; point.paving = paving.crack; point.plate = paving.tone;
    point.channel *= 1 - w; point.pool *= 1 - w; point.veins *= 1 - w; point.industrial *= 1 - w;
  }
  return point;
}
/** Seating height only: cheap enough for per-frame turret seating, flight shadows and path search. */
export function terrainHeight(seed: number, x: number, s: number, arena?: TerrainArena): number {
  return rowPoint(terrainRow(seed, s, arena), x).height;
}
