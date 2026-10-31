import { VIEW } from '../shared/contracts';
import { PALETTE, SCENERY_MAX_HEIGHT, SUN_RISE, WORLD_HALF, crater, mix, smoothRange } from './terrain-layout';
import { resetRowCache, rowPoint, terrainHeight, terrainRow, type TerrainPoint, type TerrainRow } from './terrain-ground';
import { KIT, KIT_MAX_SCALE, TERRAIN_STRIPS, scatterKitSteps, type KitInstance, type KitKind, type ScatterField } from './terrain-scatter';
import { finish, type Work } from './terrain-work';
import { MODULE_HEIGHT, settlementsNear, type Archetype } from './terrain-settlements';
import { ROAD_ENDS, SHARED_BOUNDS, districtRoadsSteps, resetNetworkMemos, roadEndSpotsSteps, roadRibbonSteps, sectionNetworkSteps, type IndustryPiece, type RoadMesh, type RoadPath, type SharedNode } from './terrain-network';
import { districtHidden, districtPlanSteps, districtsNear, knownPlan, resetDistrictPlans, slotRange, type DistrictSite } from './terrain-districts';
import { arenaAt, arenaWeight } from './terrain-arena';
import { SWAP_AHEAD, SWAP_BEHIND, routeOfInput, worldAt, worldOf, type Floe, type RouteSpan, type TerrainInput, type TerrainRoute, type World, type WorldInput } from './terrain-planet';

export {
  MOODS, MOOD_LENGTH, ROUTES, ROUTE_AXES, SCENERY_MAX_HEIGHT, SUN_DIRECTION, TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT,
  landform, moodAt, moodOf, routeCalm, routeCenter, type Mood, type Route,
} from './terrain-layout';
export { terrainHeight } from './terrain-ground';
export { WALL_CELL, cliffWallSteps, type WallOptions } from './terrain-walls';
export { PAD_MARGIN, districtHidden, districtPlan, districtsNear, slotRange, type DistrictPlan, type DistrictSite } from './terrain-districts';
export { KHEPRI_DISTRICTS, KHEPRI_REFINERY, type DistrictPolicy, type LayoutGraph } from './settlement-grammars';
export { MODULES, moduleSize, type ModuleSpec } from './settlement-modules';
export { ARENA_CLEARING, ARENA_LEVEL, ARENA_RAMP, arenaAt, arenaReaches, arenaWeight, beyondArenaClearing, inArenaCore, sameArena, type TerrainArena } from './terrain-arena';
export {
  PLANETS, SWAP_AHEAD, SWAP_BEHIND, isRoute, routeOf, routeOfInput, routedWorld, sameWorld, worldAt, worldOf,
  type Floe, type PlanetId, type PlanetProfile, type RouteSchedule, type RouteSpan, type RouteSwap, type RoutedWorld, type TerrainInput, type TerrainRoute, type TerrainWorld,
  type World, type WorldInput,
} from './terrain-planet';
export { VESPER_PALETTE, VESPER_SEA_LEVEL } from './terrain-vesper';
export { ARCHETYPES, MODULE_HEIGHT, SETTLEMENT_CELL, padDistance, settlement, settlementsNear, type Archetype, type Settlement } from './terrain-settlements';
export {
  PIPE_AXIS, PIPE_BEDDING, PIPE_CELL, PIPE_MAX_SLOPE, PIPE_TOP, ROAD_ENDS, ROAD_MAX_SLOPE, ROAD_STEP, SHARED_BOUNDS, SHARED_LOCAL_BOX, SHARED_NODES, SUPPORT_HEIGHT,
  edgesNear, pieceBounds, pipePieces, pipeRun, roadPath, rotatePiece, sectionNetwork,
  type IndustryPiece, type NetworkEdge, type PipeRun, type RoadEnd, type RoadMesh, type RoadPath, type SharedNode,
} from './terrain-network';
export {
  FLOE_FOOTPRINT, FLOE_SETS, KHEPRI_CLIFF_KINDS, KIT, KIT_KINDS, KIT_MAX_SCALE, STRIP_WIDTH, TERRAIN_STRIPS, VESPER_CLIFF_KINDS, VESPER_KIT_KINDS, AMNION_CLIFF_KINDS, AMNION_KIT_KINDS, UMBRA_CLIFF_KINDS, UMBRA_KIT_KINDS, NACRE_KIT_KINDS, kitNodeName, stripOf,
  type CliffKitKind, type FloeSetKind, type KitInstance, type KitKind,
} from './terrain-scatter';

/**
 * Pure planet scenery (Khepri, Vesper). Terrain never reads, schedules, or advances combat or loot.
 * 10: planet profiles and Vesper; Khepri's output is unchanged from 9 (fingerprints in terrain-vesper.test.ts).
 * 11: Khepri districts (docs/23); with `KHEPRI.districts = null` the output is exactly version 10's.
 * 12: a much less populated Moon (rarer, smaller Luna outposts); other planets are unchanged.
 * 13: varied relief (docs/26): Khepri benches, mesas, buttes, deep canyons, dunes and escarpments over six moods
 *     (−10 to 2.4, scenery cap 3.0); Vesper shelves at several levels with ice cliffs, nunataks and new outposts;
 *     Luna highlands, maria, rilles, scarps and craters of every age. Nacre is unchanged.
 * 14: crisp cliffs (docs/26 §10): rims meet their tops in hard creases (benches, mesas, canyons, ice cliffs, leads,
 *     crevasses, scarps); rim and foot vertices keep their flat side's colour; Vesper harbours stand on open water and
 *     its crevasses run across the flight line. Nacre is unchanged.
 * 15: real cliff walls (docs/26 §11): columnar basalt walls along Khepri's cliffs and fractured ice-shelf walls along
 *     Vesper's steps and coasts (cliff kits); Vesper half land, half water with fjord-like inlets. Luna and Nacre are
 *     unchanged.
 * 16: relief and compounds (docs/26 §12): Vesper's sea at −3.6 with taller shelf steps, ice plateaus and peaks; Nacre's
 *     massifs raised into stepped mountains; outposts stand in compounds joined by roads and pipes on every world, Luna's
 *     bases in pairs on rover tracks; a lead under a pad is filled at pad level.
 * 17: more frequent Luna outposts (.10 to .18); other planets and relief are unchanged.
 * 18: Vesper cliffs: rock keeps back from shelf edges, dark stones keep off cliffs, walls only on drops of 0.7 or more;
 *     Vesper's wall tops follow the highest rim across their width; other planets are unchanged.
 * 19: Vesper's ice walls: none whose face turns away from the camera (hidden behind its own shelf), none under a 1.2
 *     drop, every face of 1.8 or more (crevasse and ridge regions too) and beside outpost pads, and only in runs of
 *     three or more along a rim (no lone pieces);
 *     others unchanged.
 * 20: roads (every planet with networks; user, 28 October: "lots of hard edges and sometimes they don't make sense"):
 *     straightened over open ground and curved at every corner (up to 4 units), and only built when they reach their
 *     goal (partial runs had ended in the open or against cliffs; about a quarter of Khepri's roads). District roads
 *     curve on a 2.5-unit radius.
 * 21: Khepri's roads only where they serve something (user, 28 October: "everywhere without purpose", then "lower the
 *     threshold a bit"): between two industrial sites, half the time beside one, to and from districts, across the route
 *     between facing compounds, never to the map edge except from a district, and never meandering (at most 1.8 times
 *     the direct distance plus 4). On a sea planet a road that cannot reach its goal stands when it runs down to the
 *     shore (Vesper: "there's almost no roads on vesper" after version 20 dropped every partial road).
 * 22: no cut behind a boss, and none at a jump (user, 31 October: "a clear cut behind the boss when we take off for
 *     warp, as if a hill got cut"; "the terrain in endless is cutoff in front"). The boss clearing is no longer cut off
 *     where a short platform's ramp ends (WARDEN-1 always, Bastion-9 in about two seeds of three) and its far end fades
 *     out twice as long (`ARENA_CLEARING.tail`). Endless switches planets 14 short of each jump's flash instead of 22–29
 *     past it, and its route's `outgoing` variant holds the old planet 36 past the flash: the terrain swaps between the
 *     two under the opaque veil (`RouteSwap`). Everything away from a clearing's far end and from jumps is unchanged.
 */
export const TERRAIN_VERSION = 22;
/**
 * Binary-exact grid step so section seams share bit-identical coordinates. A quarter unit resolves terrace
 * rims and canyon walls that cross the grid diagonally without visible stair steps.
 */
export const TERRAIN_STEP = 0.25;
/**
 * Ground beyond each world edge (terrain version 16): the perspective camera (docs/08, 21 October) sees wider at the far
 * end of the view than the world's 24 units, so the section mesh carries this apron of natural ground past both edges.
 * Only ground: pieces, pads, roads and gameplay stay inside the world. The aprons are lateral strips of their own,
 * culled like the others, so they cost nothing while the camera is away from an edge.
 */
export const MESH_APRON = 5;
/** Half the ground mesh's width: the world's half width plus the apron. */
export const MESH_HALF = WORLD_HALF + MESH_APRON;
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
  /** Detail the low graphics tier may skip. */
  cosmetic?: boolean;
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
  /** District pads reaching this section: render-only reservations battery compounds keep out of (docs/23). */
  sites?: readonly DistrictSite[];
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

/**
 * Slope for a vertex's colour on planets with crisp cliffs (terrain version 14): per axis the gentler one-sided
 * difference, so a rim or foot vertex takes its flat side's colour (a top or floor) and only vertices inside a wall
 * take the wall's. Central differences blended the wall colour a cell onto every top edge.
 */
function crispSlope(forwardX: number, backX: number, forwardS: number, backS: number, step: number): number {
  return Math.hypot(Math.abs(forwardX) < Math.abs(backX) ? forwardX : backX, Math.abs(forwardS) < Math.abs(backS) ? forwardS : backS) / step;
}

/** Coordinates are global: independent sections sample exactly the same values at shared points. */
export function terrainSample(seed: number, x: number, s: number, input?: TerrainInput): TerrainSample {
  const row = terrainRow(seed, s, input), world = row.world, point = rowPoint(row, x), step = TERRAIN_STEP;
  const at = (dx: number, ds: number) => dx === 0 && ds === 0 ? point.height : terrainHeight(seed, x + dx * step, s + ds * step, input);
  const slope = Math.hypot((at(1, 0) - at(-1, 0)) / (2 * step), (at(0, 1) - at(0, -1)) / (2 * step));
  const { drop } = rimAt(at);
  const tone = world.planet.cliffs ? crispSlope(at(1, 0) - point.height, point.height - at(-1, 0), at(0, 1) - point.height, point.height - at(0, -1), step) : slope;
  return {
    height: point.height, color: world.planet.color(row, x, point, tone, rimFactor(drop, tone), [0, 0, 0]),
    mineral: Math.max(point.veins, point.pool), elevation: point.elevation, slope, industrial: point.industrial,
  };
}

/** Settlement modules owned by a section: modelled infrastructure, shared tanks and containers, and kit rubble. */
function settlementPieces(seed: number, startS: number, size: number, world: World) {
  const props: TerrainProp[] = [], industry: IndustryPiece[] = [], rubble: KitInstance[] = [];
  for (const site of settlementsNear(seed, startS, startS + size, world.arena, world.planet)) for (const module of site.modules) {
    if (module.s < startS || module.s >= startS + size) continue;
    // District lots carry their own structure cap (docs/23 §4.2); every other piece keeps the planet's scenery cap.
    const cap = site.cap ?? world.planet.sceneryMax, detail = module.cosmetic ? { cosmetic: true } : {};
    const ground = terrainHeight(seed, module.x, module.s, world);
    if (module.kind === 'infra') {
      const height = MODULE_HEIGHT[module.node] ?? 1;
      const base = module.base ?? (site.flatten ? site.level : ground - (module.node.startsWith('wreck') ? 0.12 : 0));
      if (Math.abs(module.x) > WORLD_HALF - 0.4 || base + height > cap) continue;
      props.push({ id: module.id, node: module.node, x: module.x, s: module.s, rotation: module.yaw, baseHeight: base, height, group: site.id, archetype: site.archetype, ...detail });
    } else if (module.kind === 'shared') {
      const node = module.node as SharedNode, bounds = SHARED_BOUNDS[node];
      if (site.level + bounds.height > cap || Math.abs(module.x) + Math.max(bounds.halfX, bounds.halfZ) > WORLD_HALF) continue;
      industry.push({ id: module.id, node, x: module.x, s: module.s, y: site.level, rotation: module.yaw, pitch: 0, roll: 0, scaleY: 1, scaleZ: 1, group: site.id, ...detail });
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
  // The section mesh spans the world's width and its aprons (x) and the section's length (s); cells are TERRAIN_STEP square.
  const size = VIEW.sectionLength, startS = index * size, cellsX = MESH_HALF * 2 / TERRAIN_STEP, cellsS = size / TERRAIN_STEP;
  // One world, or a route: every row (aprons included) and height query resolves the world of its own distance,
  // so both sides of a seam agree; scatter, settlements, networks and floes run per single-world span. A planet
  // switch inside the section splits it (docs/18 §3): a hard seam that is never in view (a jump's swap, RouteSwap).
  const route = routeOfInput(input), single = route ? null : worldOf(input as WorldInput | World);
  const source: TerrainInput = route ?? single!;
  const spans: RouteSpan[] = route ? route.spans(startS, startS + size) : [{ world: single!, from: startS, to: startS + size }];
  const seaSpan = spans.find(span => span.world.planet.seaLevel !== null), sea = seaSpan ? seaSpan.world.planet.seaLevel : null;
  // Planet seams within reach of this section's pieces (none for one world): pieces keep clear of them.
  const seams = route ? planetSeams(route, startS - SEAM_CLEARANCE, startS + size + SEAM_CLEARANCE) : [];
  const clear = (s: number) => seams.every(seam => Math.abs(s - seam) >= SEAM_CLEARANCE);
  // District plans this section's rows, outposts and network may read are planned first, in resumable steps.
  yield* warmDistrictSteps(seed, source, startS - DISTRICT_WARM, startS + size + DISTRICT_WARM);
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
      const point = rowPoint(ctx, -MESH_HALF + column * TERRAIN_STEP);
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
    const vertex = row * across + column, center = at(row, column), x = -MESH_HALF + column * TERRAIN_STEP;
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
    const rowPlanet = contexts[row].world.planet, tint = rowPlanet.shadowTint, here = heights[center];
    const tone = rowPlanet.cliffs ? crispSlope(heights[center + 1] - here, here - heights[center - 1], heights[center + columns] - here, here - heights[center - columns], TERRAIN_STEP) : slope;
    rowPlanet.color(contexts[row], x, point, tone, rimFactor(drop, tone), albedo);
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
    edges[vertex * 2] = fVein[vertex]; edges[vertex * 2 + 1] = fVein2[vertex]; rock[vertex] = smoothRange(0.6, 1.5, tone);
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
  // Strips in cells: the left apron, the world's TERRAIN_STRIPS, the right apron.
  const apronCells = MESH_APRON / TERRAIN_STEP, stripCells = (cellsX - 2 * apronCells) / TERRAIN_STRIPS;
  const stripRanges: [number, number][] = [[0, apronCells],
    ...Array.from({ length: TERRAIN_STRIPS }, (_, strip): [number, number] => [apronCells + strip * stripCells, apronCells + (strip + 1) * stripCells]),
    [cellsX - apronCells, cellsX]];
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
  for (const [from, to] of stripRanges) {
    const start = cursor;
    for (let R = 0; R < blocksS; R++) for (let C = from / 2; C < to / 2; C++) {
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
    strips.push({ start, count: cursor - start, minX: -MESH_HALF + from * TERRAIN_STEP, maxX: -MESH_HALF + to * TERRAIN_STEP });
  }
  // Scatter probes read the section's own grids (bilinear); heights fall back to exact evaluation outside them.
  const vertexField = (values: Float32Array | { at(i: number): number }, stride = 1, offset = 0) => (x: number, s: number) => {
    const u = Math.min(cellsX, Math.max(0, (x + MESH_HALF) / TERRAIN_STEP)), v = Math.min(cellsS, Math.max(0, (s - startS) / TERRAIN_STEP));
    const c0 = Math.min(cellsX - 1, Math.floor(u)), r0 = Math.min(cellsS - 1, Math.floor(v)), fu = u - c0, fv = v - r0;
    const value = (r: number, c: number) => (values as Float32Array)[(r * across + c) * stride + offset];
    return (value(r0, c0) * (1 - fu) + value(r0, c0 + 1) * fu) * (1 - fv) + (value(r0 + 1, c0) * (1 - fu) + value(r0 + 1, c0 + 1) * fu) * fv;
  };
  const industry = fIndustrial;
  yield;
  const field: ScatterField = {
    height(x, s) {
      const u = (x + MESH_HALF) / TERRAIN_STEP, v = (s - startS) / TERRAIN_STEP;
      // The grid is full resolution only within the near apron (the far apron is sparse, for shadows).
      if (u < -near || u >= cellsX + near || v < -near || v >= cellsS + near) return terrainHeight(seed, x, s, source);
      const c0 = Math.floor(u), r0 = Math.floor(v), fu = u - c0, fv = v - r0;
      const value = (r: number, c: number) => heights[at(r, c)];
      return (value(r0, c0) * (1 - fu) + value(r0, c0 + 1) * fu) * (1 - fv) + (value(r0 + 1, c0) * (1 - fu) + value(r0 + 1, c0 + 1) * fu) * fv;
    },
    slope: vertexField(slopes), drop: vertexField(drops), rise: vertexField(rises),
    gradientX: vertexField(gradients, 2, 0), gradientS: vertexField(gradients, 2, 1),
    elevation: vertexField(elevation), industrial: vertexField(industry), veins: vertexField(glow, 2, 0), pool: vertexField(glow, 2, 1),
    shade: vertexField(shade), mood: (s: number) => terrainRow(seed, s, source).params, platform: (x: number, s: number) => arenaAt(worldAt(source, s).arena, seed, x, s),
    tone: vertexField(fTone),
    blocked: (x: number, s: number) => occupied.has(`${Math.floor(x)}:${Math.floor(s)}`),
    crater: (x: number, s: number) => crater(seed, x, s).rim,
  };
  // Scatter keeps off the unit cells under roads, pipelines and settlement modules (each span's own).
  const networks: { pieces: IndustryPiece[]; roads: RoadPath[] }[] = [], settlements: ReturnType<typeof settlementPieces>[] = [];
  const sites: DistrictSite[] = [];
  for (const span of spans) {
    const network = yield* sectionNetworkSteps(seed, span.from, span.to - span.from, span.world);
    // District pipework and roads join the span's network pieces and roads (same ownership, occupancy and ribbons).
    const district = yield* districtSectionSteps(seed, span.from, span.to - span.from, span.world);
    network.pieces.push(...district.pieces); network.roads.push(...district.roads); sites.push(...district.sites);
    networks.push(network);
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
  // Worn dirt where roads fade out (user, 20 October): the ground around each fading end darkens toward gravel.
  if (ROAD_ENDS.taper > 0) {
    const wear = new Float32Array(vertices), reach = ROAD_ENDS.wear + 2;
    for (const span of spans) for (const spot of yield* roadEndSpotsSteps(seed, Math.max(startS, span.from) - reach, Math.min(startS + size, span.to) + reach, span.world)) {
      const r0 = Math.max(0, Math.ceil((spot.s - reach - startS) / TERRAIN_STEP)), r1 = Math.min(cellsS, Math.floor((spot.s + reach - startS) / TERRAIN_STEP));
      const c0 = Math.max(0, Math.ceil((spot.x - reach + MESH_HALF) / TERRAIN_STEP)), c1 = Math.min(cellsX, Math.floor((spot.x + reach + MESH_HALF) / TERRAIN_STEP));
      for (let r = r0; r <= r1; r++) {
        const s = startS + r * TERRAIN_STEP;
        // Spans are half-open, except that the last one also owns the section's closing row (the seam row).
        if (s < span.from || (s >= span.to && span.to < startS + size)) continue;
        for (let c = c0; c <= c1; c++) {
          // Distance to the end's last `wear` units (a capsule), strongest at the end, gone by its far side.
          const x = -MESH_HALF + c * TERRAIN_STEP, vx = x - spot.x, vs = s - spot.s;
          const along = Math.min(1, Math.max(0, (vx * spot.dx + vs * spot.ds) / ROAD_ENDS.wear));
          const d = Math.hypot(vx - spot.dx * along * ROAD_ENDS.wear, vs - spot.ds * along * ROAD_ENDS.wear);
          const w = spot.strength * (1 - smoothRange(0.7, 2.4, d)) * (1 - smoothRange(0.35, 1, along));
          if (w > wear[r * across + c]) wear[r * across + c] = w;
        }
      }
    }
    for (let v = 0; v < vertices; v++) {
      const w = wear[v];
      if (w <= 0) continue;
      // Gravel keeps the ground's light (its luminance) but takes a duller, greyer tone: Khepri's worn dust.
      const khepri = contexts[Math.floor(v / across)].world.planet.id === 'khepri', i = v * 3;
      const luma = colors[i] * 0.2126 + colors[i + 1] * 0.7152 + colors[i + 2] * 0.0722;
      for (let k = 0; k < 3; k++) colors[i + k] = mix(colors[i + k], luma * (khepri ? WEAR_TONE[k] : 1), 0.7 * w) * (1 - 0.22 * w);
    }
  }
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
  if (sites.length) section.sites = sites;
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
/** Worn-dirt chroma (luminance 1) of Khepri ground around fading road ends: the grey-brown of its industrial dust. */
const WEAR_TONE = (() => { const [r, g, b] = PALETTE.industrial, l = r * 0.2126 + g * 0.7152 + b * 0.0722; return [r / l, g / l, b / l] as const; })();
/** How far around a section district plans are made ready (rows, outposts, network searches and their margins). */
const DISTRICT_WARM = 200;

/** Plans the districts of every planet along [from, to) that are not planned yet (resumable; results are identical). */
function* warmDistrictSteps(seed: number, source: TerrainInput, from: number, to: number): Work<void> {
  const route = routeOfInput(source), planets = new Map<string, World['planet']>();
  for (const world of route ? route.spans(from, to).map(span => span.world) : [worldOf(source as WorldInput | World)]) planets.set(world.planet.id, world.planet);
  for (const planet of planets.values()) {
    if (!planet.districts) continue;
    const [k0, k1] = slotRange(planet.districts, from, to);
    for (let k = k0; k <= k1; k++) if (knownPlan(seed, planet, k) === undefined) yield* districtPlanSteps(seed, planet, k);
  }
}
/** A span's district pipework (by anchor), roads touching it, and reserved pads, unless an arena hides the district. */
function* districtSectionSteps(seed: number, startS: number, size: number, world: World): Work<{ pieces: IndustryPiece[]; roads: RoadPath[]; sites: DistrictSite[] }> {
  const out: { pieces: IndustryPiece[]; roads: RoadPath[]; sites: DistrictSite[] } = { pieces: [], roads: [], sites: [] }, policy = world.planet.districts;
  if (!policy) return out;
  for (const plan of districtsNear(seed, world.planet, startS - 40, startS + size + 40)) {
    if (districtHidden(plan, policy, world.arena)) continue;
    for (const piece of plan.pieces) if (piece.s >= startS && piece.s < startS + size) out.pieces.push(piece);
    for (const road of yield* districtRoadsSteps(seed, plan, world)) if (road.s.some(s => s >= startS - 1 && s < startS + size + 1)) out.roads.push(road);
    for (const site of plan.sites) if (site.maxS >= startS && site.minS < startS + size) out.sites.push(site);
  }
  return out;
}
/** Test hook: forgets every cached plan, path and row (all pure; only needed when switching districts at run time). */
export function resetTerrainCaches() { resetDistrictPlans(); resetNetworkMemos(); resetRowCache(); }
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
 * How far beyond its own rows a section's generation reads the route: the rim and shadow aprons (1 behind, 8 ahead),
 * the seam clearance (3) and scatter probes near its ends.
 */
const SECTION_REACH = 10;
/** A jump's swap is prepared from this far before its flash: through the whole boss fight before it. */
export const SWAP_HORIZON = 160;

/**
 * The route variant section `index` is generated from while the scroll stands at `distance` (docs/18, 31 October): the
 * route's `outgoing` variant for a section a coming swap changes, until the swap's flash; the route itself from the
 * flash, and everywhere else. A single world is itself.
 */
export function sectionSource(input: TerrainInput, index: number, distance: number): TerrainInput {
  const route = routeOfInput(input);
  if (!route) return input;
  if (!route.outgoing || !route.swaps) return route;
  const from = index * VIEW.sectionLength - SECTION_REACH, to = (index + 1) * VIEW.sectionLength + SECTION_REACH;
  for (const swap of route.swaps(from - SWAP_AHEAD - SWAP_HORIZON, to + SWAP_BEHIND + SWAP_HORIZON)) {
    if (distance < swap.flash && swap.incoming < to && swap.outgoing > from) return route.outgoing;
  }
  return route;
}
/**
 * The route the terrain shows at a scroll distance, for everything seated on it: the `outgoing` variant while a swap's
 * flash is still ahead and its incoming seam within reach of the view, otherwise the route itself.
 */
export function scrollRoute(route: TerrainRoute, distance: number): TerrainRoute {
  if (!route.outgoing || !route.swaps) return route;
  for (const swap of route.swaps(distance, distance + SWAP_HORIZON)) if (swap.flash > distance && swap.incoming < distance + 2 * VIEW.sectionLength) return route.outgoing;
  return route;
}

/** A section the stream may need: its index, the route variant it is generated from, and the scroll distance it is needed at. */
export interface SectionNeed { readonly id: string; readonly index: number; readonly source: TerrainInput; readonly at: number }

/**
 * Fixed three-section window; seeking does not retain old scenery or affect any RNG. `prefetch` advances the
 * sections needed next in small resumable steps while the caller's budget allows; `update` uses them when ready and
 * otherwise generates synchronously (counted in `fallbacks`). Both paths produce identical sections.
 *
 * Around a jump (a route swap) a window section can have two versions: the outgoing one until the flash, the
 * incoming one from it. The stream prepares both ahead, so the swap under the veil takes prefetched sections.
 */
export function createTerrainStream(seed: number, input?: TerrainInput) {
  // A route streams as-is (each section resolves its own worlds); anything else is one world everywhere.
  const route = routeOfInput(input), world: TerrainInput = route ?? worldOf(input as WorldInput | World);
  const L = VIEW.sectionLength;
  const sourceOf = (index: number, distance: number): TerrainInput => route ? sectionSource(route, index, distance) : world;
  const idOf = (index: number, source: TerrainInput) => `${index}|${(source as TerrainRoute | World).key}`;
  interface Entry { id: string; index: number; section: TerrainSection }
  const sections = new Map<number, Entry>(), ready = new Map<string, Entry>(), pending = new Map<string, Work<TerrainSection>>();
  const counts = { fallbacks: 0, startup: 0, prefetched: 0 };
  let needsAt = NaN, needList: SectionNeed[] = [];
  /**
   * What prefetch prepares at a scroll distance, soonest first: the next section ahead as it will enter the window and,
   * before a swap, every section the window holds around its flash, in the version it enters with and the one from the flash.
   */
  function needs(distance: number): SectionNeed[] {
    if (distance === needsAt) return needList;
    const current = Math.floor(distance / L), out = new Map<string, SectionNeed>();
    const add = (index: number, at: number) => {
      const source = sourceOf(index, at), id = idOf(index, source), known = out.get(id);
      if (sections.get(index)?.id !== id && (!known || at < known.at)) out.set(id, { id, index, source, at });
    };
    add(current + 2, Math.max(distance, (current + 1) * L));
    for (const swap of route?.swaps?.(distance, distance + SWAP_HORIZON) ?? []) {
      const centre = Math.floor(swap.flash / L);
      for (let i = Math.max(current - 1, centre - 1); i <= centre + 2; i++) {
        const enters = Math.max(distance, (i - 1) * L);
        if (enters < swap.flash) add(i, enters);
        add(i, Math.max(enters, swap.flash));
      }
    }
    needsAt = distance; needList = [...out.values()].sort((a, b) => a.at - b.at || a.index - b.index);
    return needList;
  }
  /** Advances one needed section while `more()` allows; returns it once generated, or null when the budget ran out. */
  function prepare(need: SectionNeed, more: () => boolean): TerrainSection | null {
    const done = ready.get(need.id);
    if (done) return done.section;
    let work = pending.get(need.id);
    if (!work) { work = sectionSteps(seed, need.index, need.source); pending.set(need.id, work); }
    while (more()) {
      const step = work.next();
      if (step.done) { ready.set(need.id, { id: need.id, index: need.index, section: step.value }); pending.delete(need.id); return step.value; }
    }
    return null;
  }
  return {
    update(distance: number): readonly TerrainSection[] {
      if (!Number.isFinite(distance)) throw new Error('Terrain distance must be finite.');
      const current = Math.floor(distance / L);
      needsAt = NaN;
      for (const key of sections.keys()) if (key < current - 1 || key > current + 1) sections.delete(key);
      const starting = sections.size === 0;
      for (let i = current - 1; i <= current + 1; i++) {
        const source = sourceOf(i, distance), id = idOf(i, source);
        if (sections.get(i)?.id === id) continue;
        const early = ready.get(id);
        if (early) { sections.set(i, early); ready.delete(id); counts.prefetched++; continue; }
        pending.delete(id);
        if (starting) counts.startup++; else counts.fallbacks++;
        sections.set(i, { id, index: i, section: generateTerrainSection(seed, i, source) });
      }
      // Prepared work nothing needs any more (passed, or a version the swap has left behind) is dropped.
      const wanted = new Set(needs(distance).map(need => need.id));
      for (const id of ready.keys()) if (!wanted.has(id)) ready.delete(id);
      for (const id of pending.keys()) if (!wanted.has(id)) pending.delete(id);
      return [...sections.values()].sort((a, b) => a.index - b.index).map(entry => entry.section);
    },
    /** Generates the sections needed next, soonest first, while `more()` allows; returns true once all are ready. */
    prefetch(distance: number, more: () => boolean): boolean {
      for (const need of needs(distance)) if (!prepare(need, more)) return false;
      return true;
    },
    /** The sections needed next, soonest first (see `needs`). */
    needs,
    /** Advances one needed section (resumable): the section once it is ready, or null when the budget ran out. */
    prepare,
    /**
     * The sections the window holds at a scroll distance, as far as they are generated (in the window or prefetched);
     * null for one that would still need a synchronous generation there.
     */
    sectionsAt(distance: number): (TerrainSection | null)[] {
      const current = Math.floor(distance / L), out: (TerrainSection | null)[] = [];
      for (let i = current - 1; i <= current + 1; i++) {
        const id = idOf(i, sourceOf(i, distance)), live = sections.get(i);
        out.push(live?.id === id ? live.section : ready.get(id)?.section ?? null);
      }
      return out;
    },
    /** Whether a prefetched section is still kept for a coming need (not yet in the window). */
    holds(section: TerrainSection): boolean {
      for (const entry of ready.values()) if (entry.section === section) return true;
      return false;
    },
    /** Sections taken from prefetch, synchronous fallbacks after start, and startup generations. */
    get stats() { return { ...counts }; },
    get size() { return sections.size; },
    clear() { sections.clear(); ready.clear(); pending.clear(); needsAt = NaN; needList = []; },
  };
}
