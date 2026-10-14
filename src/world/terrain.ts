import { VIEW } from '../shared/contracts';
import { SCENERY_MAX_HEIGHT, SUN_RISE, WORLD_HALF, crater, pointColor, smoothRange } from './terrain-layout';
import { rowPoint, terrainHeight, terrainRow, type TerrainPoint, type TerrainRow } from './terrain-ground';
import { KIT, KIT_MAX_SCALE, TERRAIN_STRIPS, scatterKitSteps, type KitInstance, type KitKind, type ScatterField } from './terrain-scatter';
import { finish, type Work } from './terrain-work';
import { MODULE_HEIGHT, settlementsNear, type Archetype } from './terrain-settlements';
import { SHARED_BOUNDS, roadRibbonSteps, sectionNetworkSteps, type IndustryPiece, type RoadMesh, type RoadPath, type SharedNode } from './terrain-network';

export {
  MOODS, MOOD_LENGTH, ROUTES, ROUTE_AXES, SCENERY_MAX_HEIGHT, SUN_DIRECTION, TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT,
  landform, moodAt, moodOf, routeCalm, routeCenter, type Mood, type Route,
} from './terrain-layout';
export { terrainHeight } from './terrain-ground';
export { ARCHETYPES, MODULE_HEIGHT, SETTLEMENT_CELL, padDistance, settlement, settlementsNear, type Archetype, type Settlement } from './terrain-settlements';
export {
  PIPE_CELL, PIPE_MAX_SLOPE, ROAD_MAX_SLOPE, ROAD_STEP, SHARED_BOUNDS, SHARED_NODES, edgesNear, pipePieces, roadPath, sectionNetwork,
  type IndustryPiece, type NetworkEdge, type RoadMesh, type RoadPath, type SharedNode,
} from './terrain-network';
export {
  KIT, KIT_KINDS, KIT_MAX_SCALE, STRIP_WIDTH, TERRAIN_STRIPS, kitNodeName, stripOf, type KitInstance, type KitKind,
} from './terrain-scatter';

/** Pure Khepri scenery. Terrain never reads, schedules, or advances combat or loot. */
export const TERRAIN_VERSION = 6;
/** Binary-exact grid step so section seams share bit-identical coordinates. */
export const TERRAIN_STEP = 0.5;
export const RETAINED_SECTIONS = 3;
/** Diagonal march length for baked cast shadows (each step is TERRAIN_STEP·√2 toward the sun). */
const SHADOW_STEPS = 16;
/** Ground in full cast shadow keeps this fraction of its albedo. */
const SHADOW_FLOOR = 0.3;
/** Neighbourhood radius (cells) for rim and cliff-foot detection. */
const RIM_CELLS = 2;

/** A modelled infrastructure piece (docs/13 §3b) placed at scale 1 by a settlement archetype. */
export interface TerrainProp {
  id: string; node: string; x: number; s: number; rotation: number;
  /** Base height (pivot) and the authored height of the piece. */
  baseHeight: number; height: number;
  /** Settlement it belongs to, and that settlement's archetype. */
  group: string; archetype: Archetype;
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
  /** Shared industrial kit pieces (network pipelines, supports, settlement tanks and containers) owned by this section. */
  industry: readonly IndustryPiece[];
  /** Road ribbons for segments starting in this section (section-local coordinates). */
  roads: RoadMesh;
  /** Full centrelines of roads touching this section (world coordinates), for haulers. */
  roadPaths: readonly RoadPath[];
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

/** Settlement modules owned by a section: modelled infrastructure, shared tanks and containers, and kit rubble. */
function settlementPieces(seed: number, startS: number, size: number) {
  const props: TerrainProp[] = [], industry: IndustryPiece[] = [], rubble: KitInstance[] = [];
  for (const site of settlementsNear(seed, startS, startS + size)) for (const module of site.modules) {
    if (module.s < startS || module.s >= startS + size) continue;
    const ground = terrainHeight(seed, module.x, module.s);
    if (module.kind === 'infra') {
      const height = MODULE_HEIGHT[module.node] ?? 1, base = site.flatten ? site.level : ground - (module.node.startsWith('wreck') ? 0.12 : 0);
      if (Math.abs(module.x) > WORLD_HALF - 0.4 || base + height > SCENERY_MAX_HEIGHT) continue;
      props.push({ id: module.id, node: module.node, x: module.x, s: module.s, rotation: module.yaw, baseHeight: base, height, group: site.id, archetype: site.archetype });
    } else if (module.kind === 'shared') {
      const node = module.node as SharedNode, bounds = SHARED_BOUNDS[node];
      if (site.level + bounds.height > SCENERY_MAX_HEIGHT || Math.abs(module.x) + Math.max(bounds.halfX, bounds.halfZ) > WORLD_HALF) continue;
      industry.push({ id: module.id, node, x: module.x, s: module.s, y: site.level, rotation: module.yaw, pitch: 0, scaleY: 1, group: site.id });
    } else {
      const kind = module.node as KitKind, spec = KIT[kind], scale = Math.min(KIT_MAX_SCALE, module.scale);
      const height = kind === 'rock' ? scale * 0.9 : scale;
      if (Math.abs(module.x) + spec.radius * scale > WORLD_HALF || ground + height * spec.height > SCENERY_MAX_HEIGHT) continue;
      rubble.push({ kind, variant: Math.min(spec.variants - 1, Math.floor(module.pick * spec.variants)), x: module.x, s: module.s,
        y: ground - 0.05, scale, height, rotation: module.yaw, shade: 1, cosmetic: false });
    }
  }
  return { props, industry, rubble };
}

/** Synchronous generation: runs the resumable steps below to completion (identical output). */
export function generateTerrainSection(seed: number, index: number): TerrainSection {
  if (!Number.isInteger(index) || !Number.isFinite(seed)) throw new Error('Terrain requires a finite seed and integer section index.');
  return finish(sectionSteps(seed, index));
}

/** Resumable section generation: yields between rows and passes so a frame can stop after a few ms. */
export function* sectionSteps(seed: number, index: number): Work<TerrainSection> {
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
    yield;
  }
  const positions = new Float32Array(side * side * 3), colors = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3), glow = new Float32Array(side * side * 2);
  const edges = new Float32Array(side * side * 2), rock = new Float32Array(side * side);
  const slopes = new Float32Array(side * side), drops = new Float32Array(side * side), rises = new Float32Array(side * side);
  const gradients = new Float32Array(side * side * 2), shade = new Float32Array(side * side);
  const rise = TERRAIN_STEP * Math.SQRT2 * SUN_RISE;
  for (let row = 0; row <= cells; row++) for (let column = 0; column <= cells; column++) {
    if (column === 0 && row % 2 === 0) yield;
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
      indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = c; indices[cursor++] = b; indices[cursor++] = d; indices[cursor++] = c;
    }
    yield;
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
  yield;
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
    crater: (x: number, s: number) => crater(seed, x, s).rim,
  };
  // Scatter keeps off the unit cells under roads, pipelines and settlement modules.
  const network = yield* sectionNetworkSteps(seed, startS, size), settled = settlementPieces(seed, startS, size), occupied = new Set<string>();
  yield;
  const occupy = (x0: number, s0: number, reach: number) => {
    for (let x = Math.floor(x0 - reach); x <= Math.floor(x0 + reach); x++) for (let s = Math.floor(s0 - reach); s <= Math.floor(s0 + reach); s++) occupied.add(`${x}:${s}`);
  };
  for (const piece of [...network.pieces, ...settled.industry]) occupy(piece.x, piece.s, Math.max(SHARED_BOUNDS[piece.node].halfX, SHARED_BOUNDS[piece.node].halfZ) + 0.3);
  for (const prop of settled.props) occupy(prop.x, prop.s, prop.node === 'infra_landing_pad' ? 3.2 : prop.node === 'infra_refinery' ? 2.7 : 1);
  for (const road of network.roads) for (let i = 0; i < road.x.length; i++) if (road.s[i] >= startS - 1 && road.s[i] < startS + size + 1) occupy(road.x[i], road.s[i], 1);
  // Roads take the ground's baked cast shadow so they darken in shaded valleys too.
  const roads = yield* roadRibbonSteps(seed, network.roads, startS, size);
  for (let i = 0; i < roads.shade.length; i++) roads.shade[i] = field.shade(roads.positions[i * 3], startS - roads.positions[i * 3 + 2]);
  const scattered = yield* scatterKitSteps(seed, startS, size, field), firstCosmetic = scattered.findIndex(instance => instance.cosmetic);
  const instances = firstCosmetic < 0 ? [...scattered, ...settled.rubble]
    : [...scattered.slice(0, firstCosmetic), ...settled.rubble, ...scattered.slice(firstCosmetic)];
  return {
    seed, index, startS, size, side, positions, colors, normals, glow, edges, rock, indices, strips,
    props: settled.props, instances, industry: [...settled.industry, ...network.pieces],
    roads, roadPaths: network.roads,
  };
}

/**
 * Fixed three-section window; seeking does not retain old scenery or affect any RNG. `prefetch` advances the
 * next section ahead in small resumable steps while the caller's budget allows; `update` uses it when ready and
 * otherwise generates synchronously (counted in `fallbacks`). Both paths produce identical sections.
 */
export function createTerrainStream(seed: number) {
  const sections = new Map<number, TerrainSection>(), ready = new Map<number, TerrainSection>();
  let pending: { index: number; work: Work<TerrainSection> } | null = null;
  const counts = { fallbacks: 0, startup: 0, prefetched: 0 };
  return {
    update(distance: number): readonly TerrainSection[] {
      if (!Number.isFinite(distance)) throw new Error('Terrain distance must be finite.');
      const current = Math.floor(distance / VIEW.sectionLength);
      for (const key of sections.keys()) if (key < current - 1 || key > current + 1) sections.delete(key);
      for (const key of ready.keys()) if (key < current - 1 || key > current + 2) ready.delete(key);
      if (pending && (pending.index < current - 1 || pending.index > current + 2)) pending = null;
      const starting = sections.size === 0;
      for (let i = current - 1; i <= current + 1; i++) {
        if (sections.has(i)) continue;
        const early = ready.get(i);
        if (early) { sections.set(i, early); ready.delete(i); counts.prefetched++; continue; }
        if (pending?.index === i) pending = null;
        if (starting) counts.startup++; else counts.fallbacks++;
        sections.set(i, generateTerrainSection(seed, i));
      }
      return [...sections.values()].sort((a, b) => a.index - b.index);
    },
    /** Generates the next section ahead while `more()` allows; returns true once it is ready. */
    prefetch(distance: number, more: () => boolean): boolean {
      const ahead = Math.floor(distance / VIEW.sectionLength) + 2;
      if (sections.has(ahead) || ready.has(ahead)) return true;
      if (!pending || pending.index !== ahead) pending = { index: ahead, work: sectionSteps(seed, ahead) };
      while (more()) {
        const step = pending.work.next();
        if (step.done) { ready.set(ahead, step.value); pending = null; return true; }
      }
      return false;
    },
    /** A prefetched section that is ready but not yet in the window (for building its view ahead). */
    upcoming(): TerrainSection | undefined { return [...ready.values()][0]; },
    /** Sections taken from prefetch, synchronous fallbacks after start, and startup generations. */
    get stats() { return { ...counts }; },
    get size() { return sections.size; },
    clear() { sections.clear(); ready.clear(); pending = null; },
  };
}
