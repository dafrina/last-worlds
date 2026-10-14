import { VIEW } from '../shared/contracts';
import {
  DISTRICT_SPACING, SCENERY_MAX_HEIGHT, SUN_RISE, WORLD_HALF, district, pointColor, rowPoint, smoothRange, terrainRow,
  type TerrainPoint, type TerrainRow,
} from './terrain-layout';
import { TERRAIN_STRIPS, scatterKit, type KitInstance, type ScatterField } from './terrain-scatter';
import { SHARED_BOUNDS, sectionIndustry, type IndustryPiece } from './terrain-industry';

export {
  MOODS, MOOD_LENGTH, ROUTES, ROUTE_AXES, SCENERY_MAX_HEIGHT, SUN_DIRECTION, TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT,
  landform, moodAt, moodOf, routeCalm, routeCenter, type Mood, type Route,
} from './terrain-layout';
export { PIPE_CELL, SHARED_BOUNDS, SHARED_NODES, pipeEnds, sectionIndustry, type IndustryPiece, type SharedNode } from './terrain-industry';
export {
  KIT, KIT_KINDS, KIT_MAX_SCALE, STRIP_WIDTH, TERRAIN_STRIPS, kitNodeName, stripOf, type KitInstance, type KitKind,
} from './terrain-scatter';

/** Pure Khepri scenery. Terrain never reads, schedules, or advances combat or loot. */
export const TERRAIN_VERSION = 5;
/** Binary-exact grid step so section seams share bit-identical coordinates. */
export const TERRAIN_STEP = 0.5;
export const RETAINED_SECTIONS = 3;
/** Diagonal march length for baked cast shadows (each step is TERRAIN_STEP·√2 toward the sun). */
const SHADOW_STEPS = 16;
/** Ground in full cast shadow keeps this fraction of its albedo. */
const SHADOW_FLOOR = 0.3;
/** Neighbourhood radius (cells) for rim and cliff-foot detection. */
const RIM_CELLS = 2;

export type PropKind = 'relay' | 'cargo' | 'landingPad' | 'track' | 'refinery';
export interface TerrainProp {
  id: string; kind: PropKind; x: number; s: number;
  scale: number; rotation: number; variation: number;
  /** World-space width/depth before rotation; baseHeight is the bottom of the model. */
  footprint: readonly [number, number]; baseHeight: number; height: number;
  /** Stable industrial district, independent of section loading. */
  group: string;
}
/** A contiguous index range covering one lateral strip of the section mesh. */
export interface TerrainStrip { start: number; count: number; minX: number; maxX: number }
export interface TerrainSection {
  seed: number; index: number; startS: number; size: number;
  /** Vertices per side of the square section grid. */
  side: number;
  /** Section-local mesh coordinates: x across the world, z = minus forward distance. */
  positions: Float32Array; colors: Float32Array; normals: Float32Array; indices: Uint16Array;
  /** Per-vertex turquoise mineral channels, two per vertex: vein presence and pool glow, 0–1. */
  glow: Float32Array;
  /** Per-vertex signed distances to the two vein-line families (two per vertex); the renderer traces veins along their zeros. */
  edges: Float32Array;
  /** Per-vertex steepness: 0 on flat dust, 1 on steep columnar basalt faces. */
  rock: Float32Array;
  strips: readonly TerrainStrip[];
  props: readonly TerrainProp[];
  /** Kit pieces owned by this section, essential pieces first. */
  instances: readonly KitInstance[];
  /** Shared industrial kit pieces (pipelines, supports, tank farms) owned by this section. */
  industry: readonly IndustryPiece[];
}
export interface TerrainSample {
  height: number;
  /** Unshadowed albedo, linear RGB. */
  color: [number, number, number];
  /** Strongest mineral channel (vein presence or pool), 0–1. */
  mineral: number;
  /** 0 = deepest valley floors, 1 = highest rims. */
  elevation: number;
  /** |∇height| from central differences at the grid step. */
  slope: number;
  industrial: number;
}

/** Seating height only: cheap enough for per-frame turret seating and flight shadows. */
export function terrainHeight(seed: number, x: number, s: number): number {
  return rowPoint(terrainRow(seed, s), x).height;
}

function rimAt(height: (dx: number, ds: number) => number): { drop: number; rise: number } {
  const center = height(0, 0);
  let drop = 0, rise = 0;
  for (let k = 0; k < 8; k++) {
    const angle = k * Math.PI / 4, h = height(Math.round(Math.cos(angle) * RIM_CELLS), Math.round(Math.sin(angle) * RIM_CELLS));
    drop = Math.max(drop, center - h); rise = Math.max(rise, h - center);
  }
  return { drop, rise };
}
const rimFactor = (drop: number, slope: number) => smoothRange(0.45, 1.2, drop) * (1 - smoothRange(0.6, 1.3, slope));

/** Coordinates are global: independent sections sample exactly the same values at shared points. */
export function terrainSample(seed: number, x: number, s: number): TerrainSample {
  const row = terrainRow(seed, s), point = rowPoint(row, x), step = TERRAIN_STEP;
  const at = (dx: number, ds: number) => dx === 0 && ds === 0 ? point.height : terrainHeight(seed, x + dx * step, s + ds * step);
  const slope = Math.hypot((at(1, 0) - at(-1, 0)) / (2 * step), (at(0, 1) - at(0, -1)) / (2 * step));
  const { drop } = rimAt(at);
  return {
    height: point.height, color: pointColor(row, x, point, slope, rimFactor(drop, slope)),
    mineral: Math.max(point.veins, point.pool), elevation: point.elevation, slope, industrial: point.industrial,
  };
}

function sectionProps(seed: number, startS: number, size: number): TerrainProp[] {
  const props: TerrainProp[] = [];
  const add = (id: string, kind: PropKind, x: number, s: number, footprint: readonly [number, number],
    height: number, group: string, variation: number, rotation = 0) => {
    // District props are axis-aligned: footprint[0] spans x, footprint[1] spans s.
    if (s < startS || s >= startS + size || Math.abs(x) + footprint[0] / 2 >= WORLD_HALF) return;
    // Infrastructure is authored at real size and seats 0.05 below its pivot (track lies flush).
    const baseHeight = terrainHeight(seed, x, s) + (kind === 'track' ? 0.01 : 0);
    props.push({ id, kind, x, s, footprint, baseHeight, height: Math.max(0.04, Math.min(height, SCENERY_MAX_HEIGHT - baseHeight)),
      scale: 1, rotation, variation, group });
  };
  // One composed outpost per 72 forward units, on ground flattened to the local landform level.
  for (let cell = Math.floor(startS / DISTRICT_SPACING) - 1; cell <= Math.floor((startS + size) / DISTRICT_SPACING) + 1; cell++) {
    const { id, x, s, side, variation } = district(seed, cell);
    add(`${id}:pad`, 'landingPad', x, s - 5, [5.4, 6.2], 0.3, id, variation);
    add(`${id}:spine`, 'track', x - 4.5 * side, s, [1.35, 22], 0.05, id, variation);
    add(`${id}:spur`, 'track', x - 2 * side, s - 5, [6, 1.35], 0.05, id, variation);
    add(`${id}:refinery`, 'refinery', x + 2.1 * side, s + 3.5, [4.1, 5.1], 1.6, id, variation);
    add(`${id}:relay`, 'relay', x + 3.9 * side, s - 4.7, [0.85, 1.0], 1.6, id, variation);
    for (let i = 0; i < 3; i++) add(`${id}:cargo:${i}`, 'cargo', x - 1.9 * side, s + 1.5 + i * 2.4, [1.05, 1.75], 0.65, id, variation, 0);
  }
  return props;
}

export function generateTerrainSection(seed: number, index: number): TerrainSection {
  if (!Number.isInteger(index) || !Number.isFinite(seed)) throw new Error('Terrain requires a finite seed and integer section index.');
  const size = VIEW.sectionLength, startS = index * size, cells = size / TERRAIN_STEP, side = cells + 1;
  // Apron: rim detection on every side, plus a long shadow apron toward the sun (−x, +s).
  const near = RIM_CELLS, far = Math.max(SHADOW_STEPS, RIM_CELLS);
  const columns = near + far + cells + 1, rows = near + far + cells + 1;
  const heights = new Float64Array(columns * rows);
  const at = (row: number, column: number) => (row + near) * columns + column + far;
  const points: TerrainPoint[] = new Array(side * side), contexts: TerrainRow[] = new Array(side);
  for (let row = -near; row <= cells + far; row++) {
    const localS = row * TERRAIN_STEP, ctx = terrainRow(seed, startS + localS);
    if (row >= 0 && row <= cells) contexts[row] = ctx;
    for (let column = -far; column <= cells + near; column++) {
      const point = rowPoint(ctx, -WORLD_HALF + column * TERRAIN_STEP);
      heights[at(row, column)] = point.height;
      if (row >= 0 && row <= cells && column >= 0 && column <= cells) points[row * side + column] = point;
    }
  }
  const positions = new Float32Array(side * side * 3), colors = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3), glow = new Float32Array(side * side * 2);
  const edges = new Float32Array(side * side * 2), rock = new Float32Array(side * side);
  const slopes = new Float32Array(side * side), drops = new Float32Array(side * side), rises = new Float32Array(side * side);
  const gradients = new Float32Array(side * side * 2), shade = new Float32Array(side * side);
  const rise = TERRAIN_STEP * Math.SQRT2 * SUN_RISE;
  for (let row = 0; row <= cells; row++) for (let column = 0; column <= cells; column++) {
    const vertex = row * side + column, center = at(row, column), point = points[vertex], x = -WORLD_HALF + column * TERRAIN_STEP;
    // Central differences include the apron. Never recompute isolated mesh normals.
    const dx = (heights[center + 1] - heights[center - 1]) / (TERRAIN_STEP * 2);
    const ds = (heights[center + columns] - heights[center - columns]) / (TERRAIN_STEP * 2);
    const length = Math.hypot(dx, 1, ds), slope = Math.hypot(dx, ds);
    normals.set([-dx / length, 1 / length, ds / length], vertex * 3);
    const { drop, rise: foot } = rimAt((cx, cs) => heights[at(row + cs, column + cx)]);
    // Cheap cast shadow: march the height grid diagonally toward the sun.
    let shadow = 0;
    for (let i = 1; i <= SHADOW_STEPS && shadow < 1; i++) {
      shadow = Math.max(shadow, smoothRange(-0.1, 0.35, heights[at(row + i, column - i)] - point.height - i * rise));
    }
    const light = (1 - (1 - SHADOW_FLOOR) * shadow) * (1 - 0.28 * smoothRange(0.6, 2.4, foot) * (1 - smoothRange(0.6, 1.4, slope)));
    const albedo = pointColor(contexts[row], x, point, slope, rimFactor(drop, slope));
    colors.set([albedo[0] * light, albedo[1] * light, albedo[2] * light], vertex * 3);
    positions.set([x, point.height, -row * TERRAIN_STEP], vertex * 3);
    // Veins run across calm low ground and brighten where they gather at cliff feet.
    glow[vertex * 2] = Math.min(1, point.veins * (1 - smoothRange(0.4, 0.9, slope)) * (1 + 0.8 * smoothRange(0.8, 2.2, foot))); glow[vertex * 2 + 1] = point.pool;
    edges[vertex * 2] = point.vein; edges[vertex * 2 + 1] = point.vein2; rock[vertex] = smoothRange(0.6, 1.5, slope);
    slopes[vertex] = slope; drops[vertex] = drop; rises[vertex] = foot; shade[vertex] = light;
    gradients[vertex * 2] = dx; gradients[vertex * 2 + 1] = ds;
  }
  const indices = new Uint16Array(cells * cells * 6), strips: TerrainStrip[] = [];
  const stripCells = cells / TERRAIN_STRIPS;
  let cursor = 0;
  for (let strip = 0; strip < TERRAIN_STRIPS; strip++) {
    const start = cursor;
    for (let row = 0; row < cells; row++) for (let column = strip * stripCells; column < (strip + 1) * stripCells; column++) {
      const a = row * side + column, b = a + 1, c = a + side, d = c + 1;
      indices.set([a, b, c, b, d, c], cursor); cursor += 6;
    }
    strips.push({ start, count: cursor - start, minX: -WORLD_HALF + strip * stripCells * TERRAIN_STEP,
      maxX: -WORLD_HALF + (strip + 1) * stripCells * TERRAIN_STEP });
  }
  // Scatter probes read the section's own grids (bilinear); heights fall back to exact evaluation outside them.
  const vertexField = (values: Float32Array | { at(i: number): number }, stride = 1, offset = 0) => (x: number, s: number) => {
    const u = Math.min(cells, Math.max(0, (x + WORLD_HALF) / TERRAIN_STEP)), v = Math.min(cells, Math.max(0, (s - startS) / TERRAIN_STEP));
    const c0 = Math.min(cells - 1, Math.floor(u)), r0 = Math.min(cells - 1, Math.floor(v)), fu = u - c0, fv = v - r0;
    const value = (r: number, c: number) => (values as Float32Array)[(r * side + c) * stride + offset];
    return (value(r0, c0) * (1 - fu) + value(r0, c0 + 1) * fu) * (1 - fv) + (value(r0 + 1, c0) * (1 - fu) + value(r0 + 1, c0 + 1) * fu) * fv;
  };
  const elevation = new Float32Array(side * side), industry = new Float32Array(side * side);
  points.forEach((point, i) => { elevation[i] = point.elevation; industry[i] = point.industrial; });
  const field: ScatterField = {
    height(x, s) {
      const u = (x + WORLD_HALF) / TERRAIN_STEP, v = (s - startS) / TERRAIN_STEP;
      if (u < -far || u >= cells + near || v < -near || v >= cells + far) return terrainHeight(seed, x, s);
      const c0 = Math.floor(u), r0 = Math.floor(v), fu = u - c0, fv = v - r0;
      const value = (r: number, c: number) => heights[at(r, c)];
      return (value(r0, c0) * (1 - fu) + value(r0, c0 + 1) * fu) * (1 - fv) + (value(r0 + 1, c0) * (1 - fu) + value(r0 + 1, c0 + 1) * fu) * fv;
    },
    slope: vertexField(slopes), drop: vertexField(drops), rise: vertexField(rises),
    gradientX: vertexField(gradients, 2, 0), gradientS: vertexField(gradients, 2, 1),
    elevation: vertexField(elevation), industrial: vertexField(industry), veins: vertexField(glow, 2, 0), pool: vertexField(glow, 2, 1),
    shade: vertexField(shade), mood: (s: number) => terrainRow(seed, s).params,
    blocked: (x: number, s: number) => occupied.has(`${Math.floor(x)}:${Math.floor(s)}`),
  };
  // Scatter keeps off the unit cells under pipelines and tanks.
  const industryPieces = sectionIndustry(seed, startS, size), occupied = new Set<string>();
  for (const piece of industryPieces) {
    const bounds = SHARED_BOUNDS[piece.node], reach = Math.max(bounds.halfX, bounds.halfZ) + 0.4;
    for (let x = Math.floor(piece.x - reach); x <= Math.floor(piece.x + reach); x++) {
      for (let s = Math.floor(piece.s - reach); s <= Math.floor(piece.s + reach); s++) occupied.add(`${x}:${s}`);
    }
  }
  return {
    seed, index, startS, size, side, positions, colors, normals, glow, edges, rock, indices, strips,
    props: sectionProps(seed, startS, size), instances: scatterKit(seed, startS, size, field), industry: industryPieces,
  };
}

/** Fixed three-section cache; seeking does not retain old scenery or affect any RNG. */
export function createTerrainStream(seed: number) {
  const sections = new Map<number, TerrainSection>();
  return {
    update(distance: number): readonly TerrainSection[] {
      if (!Number.isFinite(distance)) throw new Error('Terrain distance must be finite.');
      const current = Math.floor(distance / VIEW.sectionLength);
      for (const key of sections.keys()) if (key < current - 1 || key > current + 1) sections.delete(key);
      for (let i = current - 1; i <= current + 1; i++) if (!sections.has(i)) sections.set(i, generateTerrainSection(seed, i));
      return [...sections.values()].sort((a, b) => a.index - b.index);
    },
    get size() { return sections.size; },
    clear() { sections.clear(); },
  };
}
