import { VIEW } from '../shared/contracts';
import { SCENERY_MAX_HEIGHT, SUN_RISE, WORLD_HALF, crater, mix, smoothRange } from './terrain-layout';
import { rowPoint, terrainHeight, terrainRow, type TerrainPoint, type TerrainRow } from './terrain-ground';
import { KIT, KIT_MAX_SCALE, TERRAIN_STRIPS, scatterKitSteps, type KitInstance, type KitKind, type ScatterField } from './terrain-scatter';
import { finish, type Work } from './terrain-work';
import { MODULE_HEIGHT, settlementsNear, type Archetype } from './terrain-settlements';
import { SHARED_BOUNDS, roadRibbonSteps, sectionNetworkSteps, type IndustryPiece, type RoadMesh, type RoadPath, type SharedNode } from './terrain-network';
import { arenaWeight } from './terrain-arena';
import { routeOfInput, worldAt, worldOf, type Floe, type RouteSpan, type TerrainInput, type TerrainRoute, type World, type WorldInput } from './terrain-planet';

export {
  MOODS, MOOD_LENGTH, ROUTES, ROUTE_AXES, SCENERY_MAX_HEIGHT, SUN_DIRECTION, TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT,
  landform, moodAt, moodOf, routeCalm, routeCenter, type Mood, type Route,
} from './terrain-layout';
export { terrainHeight } from './terrain-ground';
export { ARENA_LEVEL, ARENA_RAMP, arenaWeight, sameArena, type TerrainArena } from './terrain-arena';
export {
  PLANETS, isRoute, routeOf, routeOfInput, routedWorld, sameWorld, worldAt, worldOf,
  type Floe, type PlanetId, type PlanetProfile, type RouteSchedule, type RouteSpan, type RoutedWorld, type TerrainInput, type TerrainRoute, type TerrainWorld,
  type World, type WorldInput,
} from './terrain-planet';
export { VESPER_PALETTE, VESPER_SEA_LEVEL } from './terrain-vesper';
export { ARCHETYPES, MODULE_HEIGHT, SETTLEMENT_CELL, padDistance, settlement, settlementsNear, type Archetype, type Settlement } from './terrain-settlements';
export {
  PIPE_AXIS, PIPE_BEDDING, PIPE_CELL, PIPE_MAX_SLOPE, PIPE_TOP, ROAD_MAX_SLOPE, ROAD_STEP, SHARED_BOUNDS, SHARED_LOCAL_BOX, SHARED_NODES, SUPPORT_HEIGHT,
  edgesNear, pieceBounds, pipePieces, pipeRun, roadPath, rotatePiece, sectionNetwork,
  type IndustryPiece, type NetworkEdge, type PipeRun, type RoadMesh, type RoadPath, type SharedNode,
} from './terrain-network';
export {
  FLOE_FOOTPRINT, FLOE_SETS, KIT, KIT_KINDS, KIT_MAX_SCALE, STRIP_WIDTH, TERRAIN_STRIPS, VESPER_KIT_KINDS, NACRE_KIT_KINDS, kitNodeName, stripOf, type FloeSetKind, type KitInstance, type KitKind,
} from './terrain-scatter';

/**
 * Pure planet scenery (Khepri, Vesper). Terrain never reads, schedules, or advances combat or loot.
 * 10: planet profiles and Vesper; Khepri's output is unchanged from 9 (fingerprints in terrain-vesper.test.ts).
 */
export const TERRAIN_VERSION = 10;
/**
 * Binary-exact grid step so section seams share bit-identical coordinates. A quarter unit resolves terrace
 * rims and canyon walls that cross the grid diagonally without visible stair steps.
 */
export const TERRAIN_STEP = 0.25;
export const RETAINED_SECTIONS = 3;
/** Cast-shadow march: steps of SHADOW_STRIDE cells (half a unit) diagonally toward the sun, about 11 units in all. */
const SHADOW_STEPS = 16, SHADOW_STRIDE = Math.round(0.5 / TERRAIN_STEP);
/** Ground in full cast shadow keeps this fraction of its albedo. */
const SHADOW_FLOOR = 0.3;
/** Largest height error (world units) allowed where a 2×2 block of quarter cells is drawn as one quad. */
const FLAT_TOLERANCE = 0.03;
/** Neighbourhood radius (cells, one unit) for rim and cliff-foot detection. */
const RIM_CELLS = Math.round(1 / TERRAIN_STEP);

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
  /** Vertices across the world (x) and along the section (s); vertex = row · across + column. */
  across: number; along: number;
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
  /** Planets with an ocean only: pack ice owned by this section (drift is presentation-only). */
  floes?: readonly Floe[];
  /**
   * Planets with an ocean only: the sea level and, per ground vertex, the signed distance to the waterline in
   * world units (positive over water, negative over land, clamped to ±1) for foam and depth tint.
   */
  water?: { level: number; shore: Float32Array };
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

/** The eight rim-probe offsets (cells) around a point, one unit out. */
const RIM_OFFSETS = Array.from({ length: 8 }, (_, k) => [Math.round(Math.cos(k * Math.PI / 4) * RIM_CELLS), Math.round(Math.sin(k * Math.PI / 4) * RIM_CELLS)] as const);
function rimAt(height: (dx: number, ds: number) => number): { drop: number; rise: number } {
  const center = height(0, 0);
  let drop = 0, rise = 0;
  for (const [dx, ds] of RIM_OFFSETS) { const h = height(dx, ds); drop = Math.max(drop, center - h); rise = Math.max(rise, h - center); }
  return { drop, rise };
}
const rimFactor = (drop: number, slope: number) => smoothRange(0.45, 1.2, drop) * (1 - smoothRange(0.6, 1.3, slope));

/** Coordinates are global: independent sections sample exactly the same values at shared points. */
export function terrainSample(seed: number, x: number, s: number, input?: TerrainInput): TerrainSample {
  const row = terrainRow(seed, s, input), world = row.world, point = rowPoint(row, x), step = TERRAIN_STEP;
  const at = (dx: number, ds: number) => dx === 0 && ds === 0 ? point.height : terrainHeight(seed, x + dx * step, s + ds * step, input);
  const slope = Math.hypot((at(1, 0) - at(-1, 0)) / (2 * step), (at(0, 1) - at(0, -1)) / (2 * step));
  const { drop } = rimAt(at);
  return {
    height: point.height, color: world.planet.color(row, x, point, slope, rimFactor(drop, slope), [0, 0, 0]),
    mineral: Math.max(point.veins, point.pool), elevation: point.elevation, slope, industrial: point.industrial,
  };
}

/** Settlement modules owned by a section: modelled infrastructure, shared tanks and containers, and kit rubble. */
function settlementPieces(seed: number, startS: number, size: number, world: World) {
  const props: TerrainProp[] = [], industry: IndustryPiece[] = [], rubble: KitInstance[] = [], cap = world.planet.sceneryMax;
  for (const site of settlementsNear(seed, startS, startS + size, world.arena, world.planet)) for (const module of site.modules) {
    if (module.s < startS || module.s >= startS + size) continue;
    const ground = terrainHeight(seed, module.x, module.s, world);
    if (module.kind === 'infra') {
      const height = MODULE_HEIGHT[module.node] ?? 1;
      const base = module.base ?? (site.flatten ? site.level : ground - (module.node.startsWith('wreck') ? 0.12 : 0));
      if (Math.abs(module.x) > WORLD_HALF - 0.4 || base + height > cap) continue;
      props.push({ id: module.id, node: module.node, x: module.x, s: module.s, rotation: module.yaw, baseHeight: base, height, group: site.id, archetype: site.archetype });
    } else if (module.kind === 'shared') {
      const node = module.node as SharedNode, bounds = SHARED_BOUNDS[node];
      if (site.level + bounds.height > cap || Math.abs(module.x) + Math.max(bounds.halfX, bounds.halfZ) > WORLD_HALF) continue;
      industry.push({ id: module.id, node, x: module.x, s: module.s, y: site.level, rotation: module.yaw, pitch: 0, roll: 0, scaleY: 1, scaleZ: 1, group: site.id });
    } else {
      const kind = module.node as KitKind, spec = KIT[kind], scale = Math.min(KIT_MAX_SCALE, module.scale);
      const height = kind === 'rock' ? scale * 0.9 : scale;
      if (Math.abs(module.x) + spec.radius * scale > WORLD_HALF || ground + height * spec.height > cap) continue;
      rubble.push({ kind, variant: Math.min(spec.variants - 1, Math.floor(module.pick * spec.variants)), x: module.x, s: module.s,
        y: ground - 0.05, scale, height, rotation: module.yaw, shade: 1, cosmetic: false });
    }
  }
  return { props, industry, rubble };
}

/**
 * Synchronous generation: runs the resumable steps below to completion (identical output). `world` picks the
 * planet (Khepri when omitted) and an optional mission arena; Khepri without an arena is the original output.
 */
export function generateTerrainSection(seed: number, index: number, world?: TerrainInput): TerrainSection {
  if (!Number.isInteger(index) || !Number.isFinite(seed)) throw new Error('Terrain requires a finite seed and integer section index.');
  return finish(sectionSteps(seed, index, world));
}

/** Resumable section generation: yields between rows and passes so a frame can stop after a few ms. */
export function* sectionSteps(seed: number, index: number, input?: TerrainInput): Work<TerrainSection> {
  if (!Number.isInteger(index) || !Number.isFinite(seed)) throw new Error('Terrain requires a finite seed and integer section index.');
  // The section mesh spans the world's width (x) and the section's length (s); cells are TERRAIN_STEP square.
  const size = VIEW.sectionLength, startS = index * size, cellsX = WORLD_HALF * 2 / TERRAIN_STEP, cellsS = size / TERRAIN_STEP;
  // One world, or a route: every row (aprons included) and height query resolves the world of its own distance,
  // so both sides of a seam agree; scatter, settlements, networks and floes run per single-world span. A planet
  // switch inside the section splits it (docs/18 §3): a hard seam under the jump's flash, inside an arena's calm.
  const route = routeOfInput(input), single = route ? null : worldOf(input as WorldInput | World);
  const source: TerrainInput = route ?? single!;
  const spans: RouteSpan[] = route ? route.spans(startS, startS + size) : [{ world: single!, from: startS, to: startS + size }];
  const seaSpan = spans.find(span => span.world.planet.seaLevel !== null), sea = seaSpan ? seaSpan.world.planet.seaLevel : null;
  // Planet seams within reach of this section's pieces (none for one world): pieces keep clear of them.
  const seams = route ? planetSeams(route, startS - SEAM_CLEARANCE, startS + size + SEAM_CLEARANCE) : [];
  const clear = (s: number) => seams.every(seam => Math.abs(s - seam) >= SEAM_CLEARANCE);
  const across = cellsX + 1, along = cellsS + 1, vertices = across * along;
  // Apron: rim detection on every side, plus a long shadow apron toward the sun (−x, +s).
  const near = RIM_CELLS, far = Math.max(SHADOW_STEPS * SHADOW_STRIDE, RIM_CELLS);
  const columns = near + far + cellsX + 1, rows = near + far + cellsS + 1;
  const heights = new Float64Array(columns * rows);
  const at = (row: number, column: number) => (row + near) * columns + column + far;
  // Per-vertex landform fields go straight into typed arrays (no retained point objects: less garbage).
  const perVertex = () => new Float32Array(vertices);
  const fChannel = perVertex(), fIndustrial = perVertex(), fPool = perVertex(), fVeins = perVertex(), fVein = perVertex(), fVein2 = perVertex();
  const elevation = perVertex(), fPlatform = perVertex(), fPaving = perVertex(), fPlate = perVertex(), fTone = perVertex();
  let arenaRows = false;
  const contexts: TerrainRow[] = new Array(along);
  for (let row = -near; row <= cellsS + far; row++) {
    // Beyond the near apron only the shadow march reads heights, on even rows and columns (half-unit steps).
    const farRow = row > cellsS + near;
    if (farRow && row & 1) { yield; continue; }
    const localS = row * TERRAIN_STEP, ctx = terrainRow(seed, startS + localS, source);
    if (row >= 0 && row <= cellsS) contexts[row] = ctx;
    for (let column = -far; column <= cellsX + near; column++) {
      if ((farRow || column < -near) && column & 1) continue;
      const point = rowPoint(ctx, -WORLD_HALF + column * TERRAIN_STEP);
      heights[at(row, column)] = point.height;
      if (row >= 0 && row <= cellsS && column >= 0 && column <= cellsX) {
        const v = row * across + column;
        fChannel[v] = point.channel; fIndustrial[v] = point.industrial; fPool[v] = point.pool; fVeins[v] = point.veins;
        fVein[v] = point.vein; fVein2[v] = point.vein2; elevation[v] = point.elevation; fTone[v] = (point as { tone?: number }).tone ?? 0;
        if (point.platform !== undefined) { arenaRows = true; fPlatform[v] = point.platform; fPaving[v] = point.paving ?? 0; fPlate[v] = point.plate ?? 0; }
      }
    }
    yield;
  }
  const positions = new Float32Array(vertices * 3), colors = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3), glow = new Float32Array(vertices * 2);
  const edges = new Float32Array(vertices * 2), rock = new Float32Array(vertices);
  const slopes = new Float32Array(vertices), drops = new Float32Array(vertices), rises = new Float32Array(vertices);
  const gradients = new Float32Array(vertices * 2), shade = new Float32Array(vertices);
  const rise = TERRAIN_STEP * SHADOW_STRIDE * Math.SQRT2 * SUN_RISE, albedo: [number, number, number] = [0, 0, 0];
  const scratch = { height: 0, elevation: 0, channel: 0, pool: 0, vein: 0, vein2: 0, veins: 0, industrial: 0 } as TerrainPoint;
  // Shadow-march heights read the half-unit lattice (even rows and columns, all the sparse far apron holds),
  // filled in between linearly. The rule is the same everywhere, so seams shade identically on both sides.
  const H = (r: number, c: number) => heights[at(r, c)];
  const marchHeight = (r: number, c: number) => {
    if (!(r & 1) && !(c & 1)) return H(r, c);
    if (r & 1 && c & 1) return (H(r - 1, c - 1) + H(r - 1, c + 1) + H(r + 1, c - 1) + H(r + 1, c + 1)) / 4;
    return r & 1 ? (H(r - 1, c) + H(r + 1, c)) / 2 : (H(r, c - 1) + H(r, c + 1)) / 2;
  };
  const rimOffsets = RIM_OFFSETS.map(([dx, ds]) => ds * columns + dx);
  for (let row = 0; row <= cellsS; row++) for (let column = 0; column <= cellsX; column++) {
    if (column === 0) yield;
    const vertex = row * across + column, center = at(row, column), x = -WORLD_HALF + column * TERRAIN_STEP;
    const point = scratch;
    point.height = heights[center]; point.channel = fChannel[vertex]; point.industrial = fIndustrial[vertex]; point.pool = fPool[vertex];
    point.elevation = elevation[vertex]; (point as { tone?: number }).tone = fTone[vertex];
    if (arenaRows && fPlatform[vertex] > 0) { point.platform = fPlatform[vertex]; point.paving = fPaving[vertex]; point.plate = fPlate[vertex]; }
    else point.platform = point.paving = point.plate = undefined;
    // Central differences over the quarter-unit grid (apron included) follow the smooth field closely, so
    // shading stays smooth across rims and walls. Never recompute isolated mesh normals.
    const dx = (heights[center + 1] - heights[center - 1]) / (TERRAIN_STEP * 2);
    const ds = (heights[center + columns] - heights[center - columns]) / (TERRAIN_STEP * 2);
    const length = Math.hypot(dx, 1, ds), slope = Math.hypot(dx, ds);
    normals[vertex * 3] = -dx / length; normals[vertex * 3 + 1] = 1 / length; normals[vertex * 3 + 2] = ds / length;
    let drop = 0, foot = 0;
    for (const offset of rimOffsets) { const h = heights[center + offset]; drop = Math.max(drop, heights[center] - h); foot = Math.max(foot, h - heights[center]); }
    // Cheap cast shadow: march the height grid diagonally toward the sun.
    let shadow = 0;
    for (let i = 1; i <= SHADOW_STEPS && shadow < 1; i++) {
      shadow = Math.max(shadow, smoothRange(-0.1, 0.35, marchHeight(row + i * SHADOW_STRIDE, column - i * SHADOW_STRIDE) - point.height - i * rise));
    }
    const light = (1 - (1 - SHADOW_FLOOR) * shadow) * (1 - 0.28 * smoothRange(0.6, 2.4, foot) * (1 - smoothRange(0.6, 1.4, slope)));
    const rowPlanet = contexts[row].world.planet, tint = rowPlanet.shadowTint;
    rowPlanet.color(contexts[row], x, point, slope, rimFactor(drop, slope), albedo);
    if (tint) {
      // Cool planets shade toward a luminous blue rather than black (snow keeps sky light in shadow).
      const lit = smoothRange(SHADOW_FLOOR, 1, light);
      for (let c = 0; c < 3; c++) colors[vertex * 3 + c] = albedo[c] * mix(tint[c] * 0.62, 1, lit);
    } else {
      colors[vertex * 3] = albedo[0] * light; colors[vertex * 3 + 1] = albedo[1] * light; colors[vertex * 3 + 2] = albedo[2] * light;
    }
    positions[vertex * 3] = x; positions[vertex * 3 + 1] = point.height; positions[vertex * 3 + 2] = -row * TERRAIN_STEP;
    // Veins run across calm low ground and brighten where they gather at cliff feet.
    glow[vertex * 2] = Math.min(1, fVeins[vertex] * (1 - smoothRange(0.4, 0.9, slope)) * (1 + 0.8 * smoothRange(0.8, 2.2, foot))); glow[vertex * 2 + 1] = point.pool;
    edges[vertex * 2] = fVein[vertex]; edges[vertex * 2 + 1] = fVein2[vertex]; rock[vertex] = smoothRange(0.6, 1.5, slope);
    slopes[vertex] = slope; drops[vertex] = drop; rises[vertex] = foot; shade[vertex] = light;
    gradients[vertex * 2] = dx; gradients[vertex * 2 + 1] = ds;
  }
  // Adaptive mesh: where the ground is nearly flat a 2×2 block of quarter cells is drawn as one half-unit
  // quad; rims, walls and other relief keep the full quarter-unit grid. A flat block next to a detailed one
  // takes the shared edge midpoints into a fan around its centre, so there are no T-junction cracks. The
  // decision reads only global heights (the apron covers the neighbours across section seams).
  const blocksX = cellsX / 2, blocksS = cellsS / 2, flat = new Uint8Array((blocksS + 2) * blocksX);
  const isFlat = (R: number, C: number) => C >= 0 && C < blocksX && flat[(R + 1) * blocksX + C] === 1;
  for (let R = -1; R <= blocksS; R++) {
    for (let C = 0; C < blocksX; C++) {
      const h = (i: number, j: number) => heights[at(R * 2 + j, C * 2 + i)];
      const a = h(0, 0), b = h(2, 0), c = h(0, 2), d = h(2, 2);
      let deviation = 0;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const u = i / 2, v = j / 2, planar = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        deviation = Math.max(deviation, Math.abs(h(i, j) - planar));
      }
      flat[(R + 1) * blocksX + C] = deviation < FLAT_TOLERANCE ? 1 : 0;
    }
    if (R % 8 === 0) yield;
  }
  const indices = new Uint16Array(cellsS * cellsX * 6), strips: TerrainStrip[] = [];
  const stripCells = cellsX / TERRAIN_STRIPS;
  const vertexAt = (row: number, column: number) => row * across + column;
  // Each quad splits along its flatter diagonal, so triangle edges follow rims and canyon walls (contours)
  // instead of cutting across them into a sawtooth.
  const quad = (a: number, b: number, c: number, d: number) => {
    if (Math.abs(positions[a * 3 + 1] - positions[d * 3 + 1]) < Math.abs(positions[b * 3 + 1] - positions[c * 3 + 1])) {
      indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = d; indices[cursor++] = a; indices[cursor++] = d; indices[cursor++] = c;
    } else {
      indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = c; indices[cursor++] = b; indices[cursor++] = d; indices[cursor++] = c;
    }
  };
  let cursor = 0;
  for (let strip = 0; strip < TERRAIN_STRIPS; strip++) {
    const start = cursor;
    for (let R = 0; R < blocksS; R++) for (let C = strip * stripCells / 2; C < (strip + 1) * stripCells / 2; C++) {
      const row = R * 2, column = C * 2;
      if (!isFlat(R, C)) {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const a = vertexAt(row + j, column + i);
          quad(a, a + 1, a + across, a + across + 1);
        }
        continue;
      }
      const corner = (i: number, j: number) => vertexAt(row + j, column + i);
      // Shared edge midpoints a detailed neighbour has (top, right, bottom, left); C ± 1 outside the world has none.
      const top = !isFlat(R - 1, C), right = C + 1 < blocksX && !isFlat(R, C + 1), bottom = !isFlat(R + 1, C), left = C > 0 && !isFlat(R, C - 1);
      if (!top && !right && !bottom && !left) { quad(corner(0, 0), corner(2, 0), corner(0, 2), corner(2, 2)); continue; }
      const perimeter = [corner(0, 0), ...top ? [corner(1, 0)] : [], corner(2, 0), ...right ? [corner(2, 1)] : [],
        corner(2, 2), ...bottom ? [corner(1, 2)] : [], corner(0, 2), ...left ? [corner(0, 1)] : []], middle = corner(1, 1);
      for (let k = 0; k < perimeter.length; k++) {
        indices[cursor++] = middle; indices[cursor++] = perimeter[k]; indices[cursor++] = perimeter[(k + 1) % perimeter.length];
      }
    }
    yield;
    strips.push({ start, count: cursor - start, minX: -WORLD_HALF + strip * stripCells * TERRAIN_STEP,
      maxX: -WORLD_HALF + (strip + 1) * stripCells * TERRAIN_STEP });
  }
  // Scatter probes read the section's own grids (bilinear); heights fall back to exact evaluation outside them.
  const vertexField = (values: Float32Array | { at(i: number): number }, stride = 1, offset = 0) => (x: number, s: number) => {
    const u = Math.min(cellsX, Math.max(0, (x + WORLD_HALF) / TERRAIN_STEP)), v = Math.min(cellsS, Math.max(0, (s - startS) / TERRAIN_STEP));
    const c0 = Math.min(cellsX - 1, Math.floor(u)), r0 = Math.min(cellsS - 1, Math.floor(v)), fu = u - c0, fv = v - r0;
    const value = (r: number, c: number) => (values as Float32Array)[(r * across + c) * stride + offset];
    return (value(r0, c0) * (1 - fu) + value(r0, c0 + 1) * fu) * (1 - fv) + (value(r0 + 1, c0) * (1 - fu) + value(r0 + 1, c0 + 1) * fu) * fv;
  };
  const industry = fIndustrial;
  yield;
  const field: ScatterField = {
    height(x, s) {
      const u = (x + WORLD_HALF) / TERRAIN_STEP, v = (s - startS) / TERRAIN_STEP;
      // The grid is full resolution only within the near apron (the far apron is sparse, for shadows).
      if (u < -near || u >= cellsX + near || v < -near || v >= cellsS + near) return terrainHeight(seed, x, s, source);
      const c0 = Math.floor(u), r0 = Math.floor(v), fu = u - c0, fv = v - r0;
      const value = (r: number, c: number) => heights[at(r, c)];
      return (value(r0, c0) * (1 - fu) + value(r0, c0 + 1) * fu) * (1 - fv) + (value(r0 + 1, c0) * (1 - fu) + value(r0 + 1, c0 + 1) * fu) * fv;
    },
    slope: vertexField(slopes), drop: vertexField(drops), rise: vertexField(rises),
    gradientX: vertexField(gradients, 2, 0), gradientS: vertexField(gradients, 2, 1),
    elevation: vertexField(elevation), industrial: vertexField(industry), veins: vertexField(glow, 2, 0), pool: vertexField(glow, 2, 1),
    shade: vertexField(shade), mood: (s: number) => terrainRow(seed, s, source).params, platform: (s: number) => arenaWeight(worldAt(source, s).arena, s),
    tone: vertexField(fTone),
    blocked: (x: number, s: number) => occupied.has(`${Math.floor(x)}:${Math.floor(s)}`),
    crater: (x: number, s: number) => crater(seed, x, s).rim,
  };
  // Scatter keeps off the unit cells under roads, pipelines and settlement modules (each span's own).
  const networks: { pieces: IndustryPiece[]; roads: RoadPath[] }[] = [], settlements: ReturnType<typeof settlementPieces>[] = [];
  for (const span of spans) {
    networks.push(yield* sectionNetworkSteps(seed, span.from, span.to - span.from, span.world));
    settlements.push(settlementPieces(seed, span.from, span.to - span.from, span.world));
  }
  const occupied = new Set<string>();
  yield;
  const occupy = (x0: number, s0: number, reach: number) => {
    for (let x = Math.floor(x0 - reach); x <= Math.floor(x0 + reach); x++) for (let s = Math.floor(s0 - reach); s <= Math.floor(s0 + reach); s++) occupied.add(`${x}:${s}`);
  };
  const networkPieces = networks.flatMap(network => network.pieces).filter(piece => clear(piece.s)), networkRoads = networks.flatMap(network => network.roads);
  const settled = settlements.length === 1 && !seams.length ? settlements[0] : {
    props: settlements.flatMap(item => item.props).filter(prop => clear(prop.s)), industry: settlements.flatMap(item => item.industry).filter(piece => clear(piece.s)),
    rubble: settlements.flatMap(item => item.rubble).filter(piece => clear(piece.s)),
  };
  for (const piece of [...networkPieces, ...settled.industry]) occupy(piece.x, piece.s, Math.max(SHARED_BOUNDS[piece.node].halfX, SHARED_BOUNDS[piece.node].halfZ) + 0.3);
  for (const prop of settled.props) occupy(prop.x, prop.s, prop.node === 'infra_landing_pad' ? 3.2 : prop.node === 'infra_refinery' ? 2.7 : 1);
  for (const road of networkRoads) for (let i = 0; i < road.x.length; i++) if (road.s[i] >= startS - 1 && road.s[i] < startS + size + 1) occupy(road.x[i], road.s[i], 1);
  // Roads take the ground's baked cast shadow so they darken in shaded valleys too. Each span's roads sit on its world.
  const ribbons: RoadMesh[] = [];
  for (let k = 0; k < spans.length; k++) ribbons.push(yield* roadRibbonSteps(seed, networks[k].roads, startS, size, spans[k].world.bare));
  const roads = ribbons.length === 1 ? ribbons[0] : mergeRoadMeshes(ribbons);
  for (let i = 0; i < roads.shade.length; i++) roads.shade[i] = field.shade(roads.positions[i * 3], startS - roads.positions[i * 3 + 2]);
  let instances: KitInstance[];
  if (spans.length === 1) {
    let scattered = yield* spans[0].world.planet.scatter(seed, startS, size, field);
    if (seams.length) scattered = scattered.filter(instance => clear(instance.s));
    const firstCosmetic = scattered.findIndex(instance => instance.cosmetic);
    instances = firstCosmetic < 0 ? [...scattered, ...settled.rubble]
      : [...scattered.slice(0, firstCosmetic), ...settled.rubble, ...scattered.slice(firstCosmetic)];
  } else {
    // Essential pieces first, cosmetic last (the low tier stops at the first cosmetic piece of each node).
    const scattered: KitInstance[] = [];
    for (const span of spans) for (const instance of yield* span.world.planet.scatter(seed, span.from, span.to - span.from, field)) if (clear(instance.s)) scattered.push(instance);
    instances = [...scattered.filter(instance => !instance.cosmetic), ...settled.rubble, ...scattered.filter(instance => instance.cosmetic)];
  }
  const section: TerrainSection = {
    seed, index, startS, size, across, along, positions, colors, normals, glow, edges, rock, indices: indices.slice(0, cursor), strips,
    props: settled.props, instances, industry: [...settled.industry, ...networkPieces],
    roads, roadPaths: networkRoads,
  };
  if (sea !== null) {
    yield;
    const floes: Floe[] = [];
    for (const span of spans) if (span.world.planet.seaLevel !== null) {
      for (const floe of yield* span.world.planet.floes(seed, span.from, span.to - span.from, field, span.world.arena)) if (clear(floe.s)) floes.push(floe);
    }
    section.floes = floes;
    yield;
    // Only rows of a planet with a sea can be wet (a dry planet's low ground in a split section stays land).
    const seaOfRow = spans.length === 1 ? null : (row: number) => worldAt(source, startS + row * TERRAIN_STEP).planet.seaLevel;
    section.water = { level: sea, shore: yield* shoreDistanceSteps(heights, at, cellsX, cellsS, near, sea, seaOfRow) };
  }
  return section;
}

/** How far every piece (scenery, settlement, pipeline, floe) keeps from a planet seam, in world units. */
export const SEAM_CLEARANCE = 3;
/** Forward distances in [from, to] where a route changes planet. */
function planetSeams(route: TerrainRoute, from: number, to: number): number[] {
  const spans = route.spans(from, to), seams: number[] = [];
  for (let i = 1; i < spans.length; i++) if (spans[i].world.planet !== spans[i - 1].world.planet) seams.push(spans[i].from);
  return seams;
}

/** Concatenates road ribbon meshes (one per span of a split section). */
function mergeRoadMeshes(meshes: readonly RoadMesh[]): RoadMesh {
  const total = (key: 'positions' | 'uvs' | 'alpha' | 'shade' | 'indices') => meshes.reduce((n, mesh) => n + mesh[key].length, 0);
  const out: RoadMesh = { positions: new Float32Array(total('positions')), uvs: new Float32Array(total('uvs')), alpha: new Float32Array(total('alpha')),
    shade: new Float32Array(total('shade')), indices: new Uint32Array(total('indices')) };
  let p = 0, u = 0, a = 0, i = 0;
  for (const mesh of meshes) {
    const base = p / 3;
    out.positions.set(mesh.positions, p); out.uvs.set(mesh.uvs, u); out.alpha.set(mesh.alpha, a); out.shade.set(mesh.shade, a);
    for (let k = 0; k < mesh.indices.length; k++) out.indices[i + k] = mesh.indices[k] + base;
    p += mesh.positions.length; u += mesh.uvs.length; a += mesh.alpha.length; i += mesh.indices.length;
  }
  return out;
}

/**
 * Signed distance to the waterline per ground vertex (world units, + over water, − over land, clamped ±1):
 * a two-pass chamfer over the section and its one-unit apron, so both sides of a seam agree (every distance
 * within the clamp is decided inside both windows).
 */
function* shoreDistanceSteps(heights: Float64Array, at: (row: number, column: number) => number, cellsX: number, cellsS: number, near: number, sea: number,
  seaOfRow: ((row: number) => number | null) | null = null): Work<Float32Array> {
  const C = cellsX + 2 * near + 1, R = cellsS + 2 * near + 1, far = 1e9, d = new Float64Array(C * R);
  const rowSea = seaOfRow ? Array.from({ length: R }, (_, r) => seaOfRow(r - near)) : null;
  const wet = rowSea ? (r: number, c: number) => rowSea[r] !== null && heights[at(r - near, c - near)] < rowSea[r]!
    : (r: number, c: number) => heights[at(r - near, c - near)] < sea;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const w = wet(r, c), edge = (c > 0 && wet(r, c - 1) !== w) || (c < C - 1 && wet(r, c + 1) !== w) || (r > 0 && wet(r - 1, c) !== w) || (r < R - 1 && wet(r + 1, c) !== w);
    d[r * C + c] = edge ? 0.5 : far;
  }
  yield;
  const relax = (i: number, j: number, cost: number) => { if (d[j] + cost < d[i]) d[i] = d[j] + cost; };
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = r * C + c;
    if (c > 0) relax(i, i - 1, 1);
    if (r > 0) { relax(i, i - C, 1); if (c > 0) relax(i, i - C - 1, Math.SQRT2); if (c < C - 1) relax(i, i - C + 1, Math.SQRT2); }
  }
  yield;
  for (let r = R - 1; r >= 0; r--) for (let c = C - 1; c >= 0; c--) {
    const i = r * C + c;
    if (c < C - 1) relax(i, i + 1, 1);
    if (r < R - 1) { relax(i, i + C, 1); if (c < C - 1) relax(i, i + C + 1, Math.SQRT2); if (c > 0) relax(i, i + C - 1, Math.SQRT2); }
  }
  yield;
  const across = cellsX + 1, shore = new Float32Array(across * (cellsS + 1)), clampCells = 1 / TERRAIN_STEP;
  for (let r = 0; r <= cellsS; r++) for (let c = 0; c <= cellsX; c++) {
    const distance = Math.min(d[(r + near) * C + c + near], clampCells) * TERRAIN_STEP;
    shore[r * across + c] = wet(r + near, c + near) ? distance : -distance;
  }
  return shore;
}

/**
 * Fixed three-section window; seeking does not retain old scenery or affect any RNG. `prefetch` advances the
 * next section ahead in small resumable steps while the caller's budget allows; `update` uses it when ready and
 * otherwise generates synchronously (counted in `fallbacks`). Both paths produce identical sections.
 */
export function createTerrainStream(seed: number, input?: TerrainInput) {
  // A route streams as-is (each section resolves its own worlds); anything else is one world everywhere.
  const world: TerrainInput = routeOfInput(input) ?? worldOf(input as WorldInput | World);
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
        sections.set(i, generateTerrainSection(seed, i, world));
      }
      return [...sections.values()].sort((a, b) => a.index - b.index);
    },
    /** Generates the next section ahead while `more()` allows; returns true once it is ready. */
    prefetch(distance: number, more: () => boolean): boolean {
      const ahead = Math.floor(distance / VIEW.sectionLength) + 2;
      if (sections.has(ahead) || ready.has(ahead)) return true;
      if (!pending || pending.index !== ahead) pending = { index: ahead, work: sectionSteps(seed, ahead, world) };
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
