import { TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT, clamp, landform, mix, moodAt, moodParams, type Landform, type Mood, type MoodParams } from './terrain-layout';
import { padInfluence, settlementsNear, type Settlement } from './terrain-settlements';

/** Everything constant along one forward row: mood and the settlement pads that reach it. */
export interface TerrainRow { seed: number; s: number; mood: Mood; params: MoodParams; sites: Settlement[] }
/** A few recent rows are reused (rows are immutable), which cuts allocation in path search and seating. */
const recentRows: TerrainRow[] = [];
export function terrainRow(seed: number, s: number): TerrainRow {
  for (const row of recentRows) if (row.s === s && row.seed === seed) return row;
  const sites = settlementsNear(seed, s, s).filter(site => site.flatten > 0 && Math.abs(s - site.s) < site.hs + 2.5);
  const row = { seed, s, mood: moodAt(seed, s), params: moodParams(seed, s), sites };
  recentRows.unshift(row); if (recentRows.length > 4) recentRows.pop();
  return row;
}

export interface TerrainPoint extends Landform { industrial: number }
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
  return point;
}
/** Seating height only: cheap enough for per-frame turret seating, flight shadows and path search. */
export function terrainHeight(seed: number, x: number, s: number): number {
  return rowPoint(terrainRow(seed, s), x).height;
}
