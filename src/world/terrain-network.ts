import { SCENERY_MAX_HEIGHT, WORLD_HALF, clamp, hash, routeCenter, smoothRange } from './terrain-layout';
import { terrainHeight } from './terrain-ground';
import { SETTLEMENT_CELL, padDistance, settlement, settlementsNear, type Settlement } from './terrain-settlements';
import { finish, type Work } from './terrain-work';
import { nearArena } from './terrain-arena';
import { KHEPRI, worldOf, type PlanetProfile, type World, type WorldInput } from './terrain-planet';
import { districtHidden, districtsNear, type DistrictPlan } from './terrain-districts';
import { MODULES } from './settlement-modules';

/**
 * Long-range settlement network (docs/13 §2): outposts are nodes of a seeded graph; each edge gets a
 * deterministic path search on a coarse grid with a slope cost that follows valleys and contours and never
 * climbs cliffs. Paths are cached per edge, so every section extracts its own part identically.
 * Roads become terrain-following ribbons. Pipelines are shared-kit pieces like real lines: pitched runs on
 * supports that follow the ground, vertical risers with bends where a cliff step is unavoidable, and level
 * trestles across narrow canyons.
 */

/* ---------------------------------------------------------------- shared kit (docs/14) */

export type SharedNode =
  | 'pipe_s_straight' | 'pipe_l_straight' | 'pipe_s_elbow' | 'pipe_l_elbow' | 'pipe_s_tee' | 'pipe_l_tee'
  | 'pipe_valve' | 'pipe_support' | 'tank_vertical_0' | 'tank_vertical_1' | 'tank_sphere' | 'tank_horizontal'
  | 'container_0' | 'container_1' | 'facility';
export const SHARED_NODES: readonly SharedNode[] = [
  'pipe_s_straight', 'pipe_l_straight', 'pipe_s_elbow', 'pipe_l_elbow', 'pipe_s_tee', 'pipe_l_tee', 'pipe_valve',
  'pipe_support', 'tank_vertical_0', 'tank_vertical_1', 'tank_sphere', 'tank_horizontal', 'container_0', 'container_1', 'facility',
];
/** Contract half footprint (local x/z, before rotation) and height, for bounds and culling. */
export const SHARED_BOUNDS: Readonly<Record<SharedNode, { halfX: number; halfZ: number; height: number }>> = {
  pipe_s_straight: { halfX: 0.11, halfZ: 1, height: 0.47 }, pipe_l_straight: { halfX: 0.21, halfZ: 1, height: 0.56 },
  pipe_s_elbow: { halfX: 1, halfZ: 1, height: 0.47 }, pipe_l_elbow: { halfX: 1, halfZ: 1, height: 0.56 },
  pipe_s_tee: { halfX: 1, halfZ: 1, height: 0.47 }, pipe_l_tee: { halfX: 1, halfZ: 1, height: 0.57 },
  pipe_valve: { halfX: 0.46, halfZ: 1, height: 0.8 }, pipe_support: { halfX: 0.35, halfZ: 0.15, height: 0.62 },
  tank_vertical_0: { halfX: 0.6, halfZ: 0.6, height: 1.45 }, tank_vertical_1: { halfX: 0.55, halfZ: 0.55, height: 1.45 },
  tank_sphere: { halfX: 0.6, halfZ: 0.6, height: 1.5 }, tank_horizontal: { halfX: 1, halfZ: 0.4, height: 0.9 },
  container_0: { halfX: 0.6, halfZ: 0.32, height: 0.55 }, container_1: { halfX: 0.56, halfZ: 0.33, height: 0.6 },
  facility: { halfX: 1.38, halfZ: 1.05, height: 1.8 },
};
export const PIPE_CELL = 2;
/** Pipe centreline above a piece's pivot (docs/14), and the height of one support rack. */
export const PIPE_AXIS = 0.35, SUPPORT_HEIGHT = 0.62;
/** Steepest pitched run (rise per unit along a straight, about 39°): steeper than roads; cliffs take risers. */
export const PIPE_MAX_SLOPE = 0.8;
/** Highest pipe level (a piece's base): the rack holding it must stay under the scenery cap. */
export const PIPE_TOP = SCENERY_MAX_HEIGHT - SUPPORT_HEIGHT;

/**
 * A placed shared-kit piece: base pivot, then yaw, pitch (about local x) and roll (about local z) in that
 * order (three.js Euler 'YXZ'), and a scale along local y and z. Pipes are posed so their centreline passes
 * exactly through their joints, whatever the pitch or roll (vertical risers included).
 */
export interface IndustryPiece {
  id: string; node: SharedNode; x: number; s: number; y: number;
  rotation: number; pitch: number; roll: number; scaleY: number; scaleZ: number; group: string;
  /** Detail the low graphics tier may skip (district crates). */
  cosmetic?: boolean;
}
/** Tight local bounds of each node (min x, y, z, max x, y, z) before scaling and rotation. */
export const SHARED_LOCAL_BOX: Readonly<Record<SharedNode, readonly number[]>> = Object.fromEntries(SHARED_NODES.map(node => {
  const b = SHARED_BOUNDS[node];
  const tight: Partial<Record<SharedNode, number[]>> = {
    pipe_s_straight: [-0.11, 0.23, -1, 0.11, 0.47, 1], pipe_l_straight: [-0.21, 0.14, -1, 0.21, 0.56, 1],
    pipe_s_elbow: [-0.11, 0.23, -1, 1, 0.47, 0.11], pipe_l_elbow: [-0.21, 0.14, -1, 1, 0.56, 0.21],
    pipe_valve: [-0.26, 0, -1, 0.46, 0.8, 1], pipe_support: [-0.35, 0, -0.15, 0.35, SUPPORT_HEIGHT, 0.15],
  };
  return [node, tight[node] ?? [-b.halfX, 0, -b.halfZ, b.halfX, b.height, b.halfZ]];
})) as Record<SharedNode, number[]>;

type Vec = [number, number, number];
/** R·v for R = Ry(yaw)·Rx(pitch)·Rz(roll), in three.js axes (x, y up, z = −s), as the view composes it. */
export function rotatePiece(yaw: number, pitch: number, roll: number, v: Vec): Vec {
  let [x, y, z] = v;
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  return [x * cy + z * sy, y, -x * sy + z * cy];
}
/** World-space bounds (x, y, s) of a placed piece, from its local box corners. */
export function pieceBounds(piece: IndustryPiece) {
  const box = SHARED_LOCAL_BOX[piece.node], out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minS: Infinity, maxS: -Infinity };
  for (let corner = 0; corner < 8; corner++) {
    const [x, y, z] = rotatePiece(piece.rotation, piece.pitch, piece.roll,
      [box[corner & 1 ? 3 : 0], box[corner & 2 ? 4 : 1] * piece.scaleY, box[corner & 4 ? 5 : 2] * piece.scaleZ]);
    out.minX = Math.min(out.minX, piece.x + x); out.maxX = Math.max(out.maxX, piece.x + x);
    out.minY = Math.min(out.minY, piece.y + y); out.maxY = Math.max(out.maxY, piece.y + y);
    out.minS = Math.min(out.minS, piece.s - z); out.maxS = Math.max(out.maxS, piece.s - z);
  }
  return out;
}

/* ---------------------------------------------------------------- graph */

export interface Endpoint { x: number; s: number; site: Settlement | null }
export interface NetworkEdge { id: string; a: Endpoint; b: Endpoint; road: boolean; pipe: boolean; kind: 'chain' | 'exit' | 'cross' }

/** The point on a pad's edge facing a target, so paths leave from the outpost's side. */
function gate(site: Settlement, tx: number, ts: number): Endpoint {
  // A district hub has authored gates (docs/23): roads arrive at the one nearest the far end.
  if (site.gates?.length) {
    let best = site.gates[0], distance = Infinity;
    for (const candidate of site.gates) { const d = Math.hypot(candidate.x - tx, candidate.s - ts); if (d < distance) { distance = d; best = candidate; } }
    return { x: best.x, s: best.s, site };
  }
  const dx = tx - site.x, ds = ts - site.s, length = Math.hypot(dx, ds) || 1;
  const reach = Math.min(Math.abs(dx) > 1e-6 ? site.hx / Math.abs(dx / length) : Infinity, Math.abs(ds) > 1e-6 ? site.hs / Math.abs(ds / length) : Infinity) + 0.4;
  return { x: clamp(site.x + dx / length * reach, -WORLD_HALF + 0.6, WORLD_HALF - 0.6), s: site.s + ds / length * reach, site };
}

/**
 * The most water a planned pipeline's straight line may cross (share of its length), on planets with a sea: lines up to
 * half over water still trestle across leads (9 in 10 of those planned are built); wider ones were never built.
 */
const PIPE_WATER = 0.5;
/** Share of the straight line from a to b over water (raw landform, before roads and arenas). */
function waterAlong(seed: number, planet: PlanetProfile, a: { x: number; s: number }, b: { x: number; s: number }): number {
  let water = 0;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, x = a.x + (b.x - a.x) * t, s = a.s + (b.s - a.s) * t;
    if (planet.landform(seed, x, s, { seed, s, params: planet.params(seed, s), local: planet.local(seed, s), platform: 0 }).height < planet.seaLevel!) water++;
  }
  return water / 21;
}

/** Edges owned by one settlement: the next outpost ahead on its side, sometimes a map exit or a cross link. */
function edgesOf(seed: number, site: Settlement, planet: PlanetProfile = KHEPRI): NetworkEdge[] {
  // District lots join through their hub. A hub always gets a road (docs/23 §5): its chain looks further ahead (its
  // own claimed cells are empty), and it falls back to a map exit. Pipelines never end at a district in this slice.
  if (site.district?.role === 'lot') return [];
  const district = site.district !== undefined;
  const INDUSTRIAL = planet.industrial, QUIET = planet.quiet;
  const edges: NetworkEdge[] = [], h = (k: number) => hash(seed ^ 0x7e7, site.cell * 31 + k, site.side > 0 ? 7 : 3), purposeful = planet.roads === 'purposeful';
  const make = (kind: NetworkEdge['kind'], target: Settlement | null, tx: number, ts: number, road: number, pipe: number): NetworkEdge => {
    const b: Endpoint = target ? gate(target, site.x, site.s) : { x: tx, s: ts, site: null }, a = gate(site, b.x, b.s);
    const edge = { id: `${site.id}>${kind}`, a, b, kind, road: h(edges.length * 3 + 1) < road, pipe: h(edges.length * 3 + 2) < pipe };
    // Over a sea a pipeline is planned only where at most half its line crosses water (terrain version 15: Vesper is
    // half water, and the 24-wide world leaves a long run little room to go round); wider water is never bridged.
    if (edge.pipe && planet.seaLevel !== null) edge.pipe = waterAlong(seed, planet, a, b) <= PIPE_WATER;
    if (planet.pipes === false) edge.pipe = false;
    return edge;
  };
  for (let cell = site.cell + 1; cell <= site.cell + (district ? 5 : 3); cell++) {
    const next = planet.settlement(seed, cell, site.side);
    if (!next) continue;
    const quiet = QUIET.has(site.archetype) || QUIET.has(next.archetype);
    // A tank farm (pumping) always lies on a pipeline.
    const farm = site.archetype === 'pumping' || next.archetype === 'pumping';
    const industrial = farm ? 1 : INDUSTRIAL.has(site.archetype) && INDUSTRIAL.has(next.archetype) ? 0.9 : INDUSTRIAL.has(site.archetype) || INDUSTRIAL.has(next.archetype) ? 0.55 : 0.2;
    // A purposeful network links works to works and anything to a district; elsewhere most neighbours get a road.
    const road = district || next.district ? 1 : purposeful ? (INDUSTRIAL.has(site.archetype) && INDUSTRIAL.has(next.archetype) ? 0.85 : 0) : quiet ? 0.45 : 0.88;
    edges.push(make('chain', next, 0, 0, road, district || next.district ? 0 : quiet ? 0 : industrial));
    break;
  }
  const farm = site.archetype === 'pumping' && !edges.some(edge => edge.pipe);
  if (farm || h(20) < 0.42 || (district && !edges.length)) {
    // A purposeful network leaves the map only from a district (its hub always has a road somewhere).
    edges.push(make('exit', null, site.side * (WORLD_HALF - 0.4), site.s + (h(21) - 0.5) * 18, district ? 1 : purposeful ? 0 : 0.7, district ? 0 : farm ? 1 : QUIET.has(site.archetype) ? 0 : 0.45));
  }
  // Cross links: a compound built on both sides of its cell is joined across the route most of the time (version 16; the
  // left side owns the link), elsewhere now and then.
  const facing = site.side < 0 ? planet.settlement(seed, site.cell, 1) : null;
  if (!QUIET.has(site.archetype) && (facing ? h(22) < 0.6 : h(22) < 0.14)) {
    const other = facing ?? planet.settlement(seed, site.cell, -site.side) ?? planet.settlement(seed, site.cell + 1, -site.side);
    if (other && !QUIET.has(other.archetype)) edges.push(make('cross', other, 0, 0, 1, facing && INDUSTRIAL.has(site.archetype) && INDUSTRIAL.has(other.archetype) ? 0.5 : 0));
  }
  return edges.filter(edge => edge.road || edge.pipe);
}

/**
 * Network edges whose endpoints could reach forward distances [s0, s1]. With a mission arena, edges whose
 * search could reach it (or its ramps) are left out, so no road or pipeline crosses the platform and every
 * remaining path is exactly the one built without an arena.
 */
export function edgesNear(seed: number, s0: number, s1: number, input?: WorldInput | World): NetworkEdge[] {
  const edges: NetworkEdge[] = [], { arena, planet } = worldOf(input);
  if (planet.networks === false) return edges;
  // A district an arena hides (docs/23 §4.6) takes the edges that touch it or pass beside it along: networks are
  // laid on the arena-free world, where its pads still flatten the ground.
  const hidden = planet.districts && arena
    ? districtsNear(seed, planet, s0 - 3 * SETTLEMENT_CELL - 60, s1 + 6 * SETTLEMENT_CELL).filter(plan => districtHidden(plan, planet.districts!, arena)) : [];
  for (const site of settlementsNear(seed, s0 - 3 * SETTLEMENT_CELL - 10, s1 + 10, arena, planet)) {
    for (const edge of edgesOf(seed, site, planet)) {
      if (nearArena(arena, Math.min(edge.a.s, edge.b.s), Math.max(edge.a.s, edge.b.s), PIPE_MARGIN + 2 * PIPE_CELL)) continue;
      if (hidden.length && hidden.some(plan => touches(edge, plan))) continue;
      if (Math.max(edge.a.s, edge.b.s) + 10 >= s0 && Math.min(edge.a.s, edge.b.s) - 10 <= s1) edges.push(edge);
    }
  }
  return edges;
}
const touches = (edge: NetworkEdge, plan: DistrictPlan) => edge.a.site?.district?.id === plan.id || edge.b.site?.district?.id === plan.id
  || (Math.max(edge.a.s, edge.b.s) + PIPE_MARGIN >= plan.minS - 3 && Math.min(edge.a.s, edge.b.s) - PIPE_MARGIN <= plan.maxS + 3);

/* ---------------------------------------------------------------- path search */

/** Min-heap of node indices keyed by priority. */
class Heap {
  private keys: number[] = []; private items: number[] = [];
  get size() { return this.items.length; }
  push(item: number, key: number) {
    const k = this.keys, it = this.items; let i = it.length; k.push(key); it.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [it[p], it[i]] = [it[i], it[p]]; i = p; }
  }
  pop(): number {
    const k = this.keys, it = this.items, top = it[0], lastKey = k.pop()!, lastItem = it.pop()!;
    if (it.length) {
      k[0] = lastKey; it[0] = lastItem; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [it[m], it[i]] = [it[i], it[m]]; i = m;
      }
    }
    return top;
  }
}

interface Grid {
  x0: number; s0: number; cell: number; columns: number; rows: number; heights: Float64Array; extra: Float64Array;
  /** Cells too close to an outpost's modules for a pipe piece (pipeline grids only). */
  crowded: Uint8Array;
  /** Cells at or under the water (planets with an ocean); roads and pipe runs keep off them. */
  wet: Uint8Array | null;
  /** Height at a world point below which ground counts as wet (Infinity-free: −Infinity on dry planets). */
  sea: number;
  /** Height at half-cell lattice point (c2, r2), computed lazily: catches canyons narrower than a cell. */
  half(c2: number, r2: number): number;
  /** Ground height anywhere (uncached). */
  ground(x: number, s: number): number;
}
/** Module reach (from its centre) a pipe piece keeps clear of: big platforms reach further. */
const moduleReach = (node: string) => node === 'infra_landing_pad' ? 3.2 : node === 'infra_refinery' ? 2.7 : node === 'facility' ? 1.8 : 1;
/** Coarse grid over the edge's span with ground heights and a per-cell cost (center lane, foreign pads). */
function* gridSteps(seed: number, edge: NetworkEdge, cell: number, center: number, margin = 8, ownPads = false, world: World = worldOf()): Work<Grid> {
  const terrainAt = (x: number, s: number) => terrainHeight(seed, x, s, world.bare);
  // Columns sit symmetrically about the centre (on whole or half cells, whichever reaches further), their cells
  // at least half a unit clear of the world edges.
  const limit = WORLD_HALF - 0.5 - cell / 2, whole = Math.floor(limit / cell) * cell, offset = (Math.floor(limit / cell - 0.5) + 0.5) * cell;
  const reach = Math.max(whole, offset), x0 = -reach, columns = Math.round(2 * reach / cell) + 1;
  const s0 = Math.floor((Math.min(edge.a.s, edge.b.s) - margin) / cell) * cell, rows = Math.ceil((Math.max(edge.a.s, edge.b.s) + margin - s0) / cell) + 1;
  const heights = new Float64Array(columns * rows), extra = new Float64Array(columns * rows);
  // Paths cross foreign pads only at a cost; an outpost's own pad is free, but a district's gates stand outside its
  // pads, so its roads go round its pieces too.
  const pads = settlementsNear(seed, s0, s0 + rows * cell, undefined, world.planet).filter(site => site.district || (site.id !== edge.a.site?.id && site.id !== edge.b.site?.id));
  for (let r = 0; r < rows; r++) {
    const s = s0 + r * cell, lane = routeCenter(seed, 1, s);
    for (let c = 0; c < columns; c++) {
      const x = x0 + c * cell, i = r * columns + c;
      heights[i] = terrainAt(x, s);
      extra[i] = (Math.abs(x - lane) < 3 ? center : 0) + (pads.some(site => padDistance(site, x, s) < 0.6) ? 4 : 0)
        // Pipelines may leave from any side of their own outposts, but never run through the modules.
        + (ownPads && [edge.a.site, edge.b.site].some(site => site && padDistance(site, x, s) < -0.2) ? 4 : 0);
    }
    yield;
  }
  // District pieces are solid to every path, and so are the lots behind a district's hub: roads and pipelines go
  // round them (docs/23 §4.8), never through; only the hub's yard is open to the roads arriving at its gates.
  for (const site of settlementsNear(seed, s0, s0 + rows * cell, undefined, world.planet)) if (site.district?.role === 'lot') {
    for (let r = Math.max(0, Math.ceil((site.s - site.hs - 0.5 - s0) / cell)); r <= Math.min(rows - 1, Math.floor((site.s + site.hs + 0.5 - s0) / cell)); r++)
      for (let c = Math.max(0, Math.ceil((site.x - site.hx - 0.5 - x0) / cell)); c <= Math.min(columns - 1, Math.floor((site.x + site.hx + 0.5 - x0) / cell)); c++) {
        if (padDistance(site, x0 + c * cell, s0 + r * cell) < 0.3) extra[r * columns + c] = Infinity;
      }
  }
  for (const site of settlementsNear(seed, s0, s0 + rows * cell, undefined, world.planet)) if (site.district) for (const module of site.modules) {
    const half = MODULES[module.node]?.half ?? [1, 1], turned = Math.abs(Math.sin(module.yaw)) > 0.5;
    const hx = (turned ? half[1] : half[0]) + 0.6, hs = (turned ? half[0] : half[1]) + 0.6;
    for (let r = Math.max(0, Math.ceil((module.s - hs - s0) / cell)); r <= Math.min(rows - 1, Math.floor((module.s + hs - s0) / cell)); r++)
      for (let c = Math.max(0, Math.ceil((module.x - hx - x0) / cell)); c <= Math.min(columns - 1, Math.floor((module.x + hx - x0) / cell)); c++) extra[r * columns + c] = Infinity;
  }
  // Pipelines keep their pieces (a cell's centre plus a unit of pipe) off outpost modules.
  const crowded = new Uint8Array(columns * rows);
  if (ownPads) for (const site of settlementsNear(seed, s0, s0 + rows * cell, undefined, world.planet)) for (const module of site.modules) {
    if (module.kind === 'kit') continue;
    const reach = moduleReach(module.node) + 1, c0 = Math.max(0, Math.ceil((module.x - reach - x0) / cell)), c1 = Math.min(columns - 1, Math.floor((module.x + reach - x0) / cell));
    const r0 = Math.max(0, Math.ceil((module.s - reach - s0) / cell)), r1 = Math.min(rows - 1, Math.floor((module.s + reach - s0) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (Math.hypot(x0 + c * cell - module.x, s0 + r * cell - module.s) > reach || crowded[r * columns + c]) continue;
      crowded[r * columns + c] = 1; extra[r * columns + c] += 6;
    }
  }
  const halves = new Float64Array((columns * 2 - 1) * (rows * 2 - 1)).fill(NaN), halfColumns = columns * 2 - 1;
  const half = (c2: number, r2: number) => {
    const i = r2 * halfColumns + c2;
    if (Number.isNaN(halves[i])) halves[i] = terrainAt(x0 + c2 * cell / 2, s0 + r2 * cell / 2);
    return halves[i];
  };
  // Water keeps a margin above sea level so tracks and pipe runs stay on solid shelf ice.
  const sea = world.planet.seaLevel === null ? -Infinity : world.planet.seaLevel + 0.15;
  const wet = world.planet.seaLevel === null ? null : heights.map(height => height < sea ? 1 : 0) as unknown as Uint8Array;
  return { x0, s0, cell, columns, rows, heights, extra, crowded, wet, sea, half, ground: terrainAt };
}

/**
 * A* over grid cells (optionally with heading state so turns cost extra). Steps steeper than `maxSlope`
 * are forbidden, so paths follow valleys and contours instead of climbing cliffs.
 */
function* searchSteps(g: Grid, a: Endpoint, b: Endpoint, diagonal: boolean, maxSlope: number, turnCost: number, minimum: number): Work<number[] | null> {
  const { columns, rows, cell, heights } = g;
  const index = (x: number, s: number) => clamp(Math.round((s - g.s0) / cell), 0, rows - 1) * columns + clamp(Math.round((x - g.x0) / cell), 0, columns - 1);
  const start = index(a.x, a.s), goal = index(b.x, b.s), headings = diagonal ? 8 : 4;
  const steps = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const states = columns * rows * headings, cost = new Float64Array(states).fill(Infinity), from = new Int32Array(states).fill(-1);
  const heap = new Heap(), gx = goal % columns, gr = Math.floor(goal / columns);
  for (let d = 0; d < headings; d++) { cost[start * headings + d] = 0; heap.push(start * headings + d, 0); }
  let found = -1, closest = -1, closestDistance = Infinity, expanded = 0;
  while (heap.size) {
    if (++expanded % 12 === 0) yield;
    const state = heap.pop(), node = Math.floor(state / headings), heading = state % headings;
    if (node === goal) { found = state; break; }
    const remaining = Math.hypot(node % columns - gx, Math.floor(node / columns) - gr);
    if (remaining < closestDistance) { closestDistance = remaining; closest = state; }
    const c = node % columns, r = Math.floor(node / columns), base = cost[state];
    for (let d = 0; d < headings; d++) {
      const nc = c + steps[d][0], nr = r + steps[d][1];
      if (nc < 0 || nc >= columns || nr < 0 || nr >= rows) continue;
      const next = nr * columns + nc, length = Math.hypot(steps[d][0], steps[d][1]) * cell, rise = Math.abs(heights[next] - heights[node]) / length;
      if (rise > maxSlope || g.wet?.[next]) continue;
      // Never hop over a canyon narrower than a cell: the midpoint must also sit within the grade.
      const middle = g.half(c + nc, r + nr);
      if (Math.abs(middle - heights[node]) > maxSlope * length / 2 || Math.abs(heights[next] - middle) > maxSlope * length / 2 || middle < g.sea) continue;
      const step = length * (1 + 6 * rise * rise + g.extra[next]) + (d !== heading && node !== start ? turnCost : 0);
      const nextState = next * headings + d, total = base + step;
      if (total < cost[nextState]) {
        cost[nextState] = total; from[nextState] = state;
        heap.push(nextState, total + Math.hypot(nc - gx, nr - gr) * cell);
      }
    }
  }
  // Unreachable goal: keep the best partial run (a line or track that ends in the open), if it is long enough.
  const reached = found >= 0;
  if (!reached) found = closest;
  if (found < 0) return null;
  const path: number[] = [];
  for (let state = found; state >= 0; state = from[state]) path.push(Math.floor(state / headings));
  path.reverse();
  const unique = path.filter((node, i) => i === 0 || node !== path[i - 1]);
  // A path that reaches its goal stands however short it is (an outpost by the map edge exits in a few units).
  return unique.length >= (reached ? 3 : minimum) ? unique : null;
}


/* ---------------------------------------------------------------- roads */

/**
 * How a road ends (user, 20 October: road ends blend into the ground): 'fade' narrows, sinks and fades out over its
 * last units (dead ends, map exits, unfinished tracks); 'apron' runs on past the end as a short widening apron that
 * fades out on the pad it serves; 'joined' continues into another road and is left as is.
 */
export type RoadEnd = 'fade' | 'apron' | 'joined';
/** A road centreline resampled every 0.5 units: x, s, ground height, and cumulative length; how each end blends. */
export interface RoadPath { id: string; x: Float64Array; s: Float64Array; y: Float64Array; length: Float64Array; ends?: readonly [RoadEnd, RoadEnd] }
/**
 * Road-end blending (world units): a fading end narrows to a rounded tip, sinks and fades over its last `taper`
 * units on a worn-dirt patch reaching `wear` beyond it; an apron runs `apron` units flush onto its pad.
 * Rollback: `taper = 0` restores the square-cut ends of terrain version 10.
 */
export const ROAD_ENDS = { taper: 3.5, apron: 2.5, wear: 2.5 };
/** Opacity an apron starts from at its road's end (it thins over the road's last unit). */
const APRON_START = 0.7;
/** Where a road ends in the open or on a pad, the direction back into its road, and how strongly it wears the ground. */
export interface RoadEndSpot { x: number; s: number; dx: number; ds: number; strength: number }
/** Width (fraction of the road) and fade (1 = full road, 0 = gone) at distance d from a fading end. */
export function fadeProfile(d: number, taper = ROAD_ENDS.taper): [number, number] {
  if (taper <= 0 || d >= taper) return [1, 1];
  // The last 15% rounds into a tip; before it the road narrows to 38% while it fades out.
  const t = Math.max(0, d / taper), tip = 0.15;
  const width = t >= tip ? 0.38 + 0.62 * smoothRange(tip, 1, t) : 0.38 * Math.sqrt(t / tip);
  return [width, smoothRange(0, 1, t)];
}
export const ROAD_STEP = 0.5;
/** Steepest grade a road may take between grid cells. */
export const ROAD_MAX_SLOPE = 0.45;

const roadMemo = new Map<string, RoadPath | null>();
/** Memo keys name the planet and its district policy (the same edge id can join other sites when districts change). */
const memoPrefix = (world: World) => world.planet.districts ? `${world.planet.id}+${world.planet.districts.id}` : world.planet.id;
export function* roadPathSteps(seed: number, edge: NetworkEdge, input?: WorldInput | World): Work<RoadPath | null> {
  const world = worldOf(input).bare, key = `${memoPrefix(world)}:${seed}:${edge.id}`;
  if (roadMemo.has(key)) return roadMemo.get(key)!;
  let result: RoadPath | null = null;
  if (edge.road) {
    // A road reaches its goal or is not built (user, 28 October: roads that "don't make sense"; a partial run ended in
    // the open or against a cliff).
    const g = yield* gridSteps(seed, edge, 1, 0.5, 8, false, world), nodes = yield* searchSteps(g, edge.a, edge.b, true, ROAD_MAX_SLOPE, 0.4, Infinity);
    if (nodes && nodes.length > 1) {
      const raw = nodes.map(node => [g.x0 + (node % g.columns) * g.cell, g.s0 + Math.floor(node / g.columns) * g.cell]);
      const resample = (points: number[][]) => {
        const xs: number[] = [points[0][0]], ss: number[] = [points[0][1]], lengths: number[] = [0];
        let carry = 0;
        for (let i = 0; i < points.length - 1; i++) {
          const [ax, as] = points[i], [bx, bs] = points[i + 1], span = Math.hypot(bx - ax, bs - as);
          for (let t = ROAD_STEP - carry; t <= span; t += ROAD_STEP) {
            xs.push(ax + (bx - ax) * t / span); ss.push(as + (bs - as) * t / span); lengths.push(lengths[lengths.length - 1] + ROAD_STEP);
          }
          carry = (carry + span) % ROAD_STEP;
        }
        return { xs, ss, lengths, y: xs.map((x, i) => g.ground(x, ss[i])) };
      };
      // Last guard: a road whose smoothed line still meets a hard grade is not built.
      const gradedLine = (line: ReturnType<typeof resample>) => line.y.every((height, i) => i === 0 || Math.abs(height - line.y[i - 1]) / ROAD_STEP <= ROAD_MAX_SLOPE * 1.6);
      // Curved roads (user, 28 October: "lots of hard edges"): first the searched cells, straightened wherever a direct line
      // stays on gentle, dry, open ground, then every corner rounded with up to a 4-unit curve. Where the curves would meet
      // a harder grade, the road keeps the original gentle smoothing of the searched cells.
      // Where a wide curve would leave the grade (a climb round a ridge), tighter ones are tried, on the straightened line
      // and then on the searched one, before the old smoothing.
      const straight = straighten(g, raw, nodes), merged = mergeRuns(raw);
      let line = resample(chaikin(raw, 2));
      for (const [points, radius] of [[straight, 4], [straight, 2.5], [straight, 1.5], [merged, 1.5]] as const) {
        const candidate = resample(roundCorners(points, radius));
        if (gradedLine(candidate) && openLine(g, candidate.xs, candidate.ss, nodes)) { line = candidate; break; }
      }
      const { xs, ss, lengths, y } = line;
      // A purposeful network builds no meandering road: at most half again the direct distance (plus a little), unless
      // it serves a district, which must be reached.
      const serves = edge.a.site?.district || edge.b.site?.district, direct = Math.hypot(edge.b.x - edge.a.x, edge.b.s - edge.a.s);
      const graded = gradedLine(line) && (world.planet.roads !== 'purposeful' || !!serves || lengths[lengths.length - 1] <= direct * 1.5 + 4);
      // An end at an outpost's gate opens onto its pad; at a district gate an internal road continues; others fade.
      const endOf = (end: Endpoint, x: number, s: number): RoadEnd => !end.site || Math.hypot(end.x - x, end.s - s) > 1.5 ? 'fade' : end.site.gates ? 'joined' : 'apron';
      const last = xs.length - 1;
      if (graded) result = { id: edge.id, x: Float64Array.from(xs), s: Float64Array.from(ss), y: Float64Array.from(y), length: Float64Array.from(lengths),
        ends: [endOf(edge.a, xs[0], ss[0]), endOf(edge.b, xs[last], ss[last])] };
    }
  }
  if (roadMemo.size > 256) roadMemo.clear();
  roadMemo.set(key, result);
  return result;
}
export const roadPath = (seed: number, edge: NetworkEdge, world?: WorldInput | World) => finish(roadPathSteps(seed, edge, world));

/** Corner cutting (Chaikin): each pass replaces every segment by its quarter points; the ends stay. */
function chaikin(points: number[][], passes: number): number[][] {
  for (let pass = 0; pass < passes; pass++) {
    const next = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, as] = points[i], [bx, bs] = points[i + 1];
      next.push([ax * 0.75 + bx * 0.25, as * 0.75 + bs * 0.25], [ax * 0.25 + bx * 0.75, as * 0.25 + bs * 0.75]);
    }
    next.push(points[points.length - 1]); points = next;
  }
  return points;
}
/** Grid cell under a point (clamped), and whether a road may run over it: dry, not a pad or piece it did not already cross. */
const cellAt = (g: Grid, x: number, s: number) => Math.min(g.rows - 1, Math.max(0, Math.round((s - g.s0) / g.cell))) * g.columns + Math.min(g.columns - 1, Math.max(0, Math.round((x - g.x0) / g.cell)));
function openLine(g: Grid, xs: readonly number[], ss: readonly number[], path: readonly number[]): boolean {
  const own = new Set(path);
  for (let i = 0; i < xs.length; i++) {
    const cell = cellAt(g, xs[i], ss[i]);
    if (own.has(cell)) continue;
    if (g.extra[cell] >= 4 || g.ground(xs[i], ss[i]) < g.sea) return false;
  }
  return true;
}
/** Whether the straight run a→b keeps to the road grade over open, dry ground (sampled every quarter unit). */
function straightRun(g: Grid, a: number[], b: number[], path: ReadonlySet<number>): boolean {
  const span = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(span / 0.25));
  let previous = g.ground(a[0], a[1]);
  for (let k = 1; k <= steps; k++) {
    const x = a[0] + (b[0] - a[0]) * k / steps, s = a[1] + (b[1] - a[1]) * k / steps, height = g.ground(x, s), cell = cellAt(g, x, s);
    if (Math.abs(height - previous) / (span / steps) > ROAD_MAX_SLOPE || height < g.sea || (!path.has(cell) && g.extra[cell] >= 4)) return false;
    previous = height;
  }
  return true;
}
/** String pulling: from each kept cell, the furthest later cell (within 24) reachable in a straight run. */
function straighten(g: Grid, points: number[][], path: readonly number[]): number[][] {
  const own = new Set(path), kept = [points[0]];
  for (let i = 0; i < points.length - 1;) {
    let j = Math.min(points.length - 1, i + 24);
    while (j > i + 1 && !straightRun(g, points[i], points[j], own)) j--;
    kept.push(points[j]); i = j;
  }
  return kept;
}
/** The searched cells with straight runs merged: only the cells where the heading changes. */
function mergeRuns(points: number[][]): number[][] {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, as] = out[out.length - 1], [px, ps] = points[i], [bx, bs] = points[i + 1];
    if (Math.abs((px - ax) * (bs - ps) - (ps - as) * (bx - px)) > 1e-9) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}
/** Rounds each corner with a quadratic curve reaching up to `radius` along both legs (at most half of either). */
function roundCorners(points: number[][], radius = 4): number[][] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, ps] = points[i], a = points[i - 1], b = points[i + 1];
    const inLength = Math.hypot(px - a[0], ps - a[1]), outLength = Math.hypot(b[0] - px, b[1] - ps);
    const d = Math.min(radius, inLength / 2, outLength / 2);
    if (d < 1e-6) { out.push(points[i]); continue; }
    const start = [px - (px - a[0]) / inLength * d, ps - (ps - a[1]) / inLength * d], end = [px + (b[0] - px) / outLength * d, ps + (b[1] - ps) / outLength * d];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, u = 1 - t;
      out.push([u * u * start[0] + 2 * u * t * px + t * t * end[0], u * u * start[1] + 2 * u * t * ps + t * t * end[1]]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Ribbon cross-section: outer berm, road edge, road edge, outer berm (offsets, u, lift above ground, alpha). */
const RIBBON = [[-0.82, 0, 0.035, 0], [-0.5, 0.2, 0.055, 1], [0.5, 0.8, 0.055, 1], [0.82, 1, 0.035, 0]] as const;
export interface RoadMesh { positions: Float32Array; uvs: Float32Array; alpha: Float32Array; shade: Float32Array; indices: Uint32Array }

/**
 * Ribbon quads for road segments starting inside a section (section-local z = −(s − startS)). Ends blend into the
 * ground (RoadPath.ends): every vertex is a function of the global road alone, so a road ending at a section
 * boundary shows no cut, and an apron belongs to the section holding its road's end sample.
 */
export function* roadRibbonSteps(seed: number, roads: readonly RoadPath[], startS: number, size: number, world?: WorldInput | World): Work<RoadMesh> {
  const bare = worldOf(world).bare, taper = ROAD_ENDS.taper, apron = ROAD_ENDS.apron;
  const positions: number[] = [], uvs: number[] = [], alpha: number[] = [], indices: number[] = [];
  /**
   * One cross-section: centre, unit normal, along-road texture coordinate, width scale and end fade (1 = full road).
   * Each vertex rests on the highest ground a quarter unit either way along the road (the terrain mesh is finer than
   * the ribbon), so ridges never break through a road; with the blending off it is the original single sample.
   */
  const section = (x0: number, s0: number, nx: number, ns: number, v: number, width: number, fade: number, rise = fade) => {
    for (const [offset, u, lift, a] of RIBBON) {
      const x = x0 + nx * offset * width, s = s0 + ns * offset * width;
      let ground = terrainHeight(seed, x, s, bare);
      if (taper > 0) ground = Math.max(ground, terrainHeight(seed, x + ns * 0.25, s - nx * 0.25, bare), terrainHeight(seed, x - ns * 0.25, s + nx * 0.25, bare));
      // A fading end sinks gradually into the ground instead of hovering; an apron lies flush.
      positions.push(x, ground + lift * rise - 0.04 * (1 - fade), -(s - startS));
      uvs.push(u, v / 2); alpha.push(a * fade);
    }
  };
  const strip = (base: number) => { for (let k = 0; k < RIBBON.length - 1; k++) indices.push(base + k, base + 4 + k, base + k + 1, base + k + 1, base + 4 + k, base + 4 + k + 1); };
  for (const road of roads) {
    const n = road.x.length, total = road.length[n - 1], ends = road.ends ?? ['fade', 'fade'] as const;
    const normal = (i: number): [number, number] => {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = road.x[b] - road.x[a], ds = road.s[b] - road.s[a], l = Math.hypot(dx, ds) || 1;
      return [-ds / l, dx / l];
    };
    /**
     * Width scale and fade at a sample: a fading end rounds off, narrows and fades out over its last `taper` units; an
     * apron end starts to thin over the road's last unit (to APRON_START) and fades the rest of the way on its apron.
     */
    const profile = (j: number): [number, number] => {
      let width = 1, fade = 1;
      for (const [distance, kind] of [[road.length[j], ends[0]], [total - road.length[j], ends[1]]] as const) {
        if (kind === 'fade') {
          const [w, f] = fadeProfile(distance, taper);
          width = Math.min(width, w); fade = Math.min(fade, f);
        } else if (kind === 'apron' && taper > 0 && apron > 0 && distance < 1) fade = Math.min(fade, 1 - (1 - APRON_START) * smoothRange(1, 0, distance));
      }
      return [width, fade];
    };
    for (let i = 0; i < n - 1; i++) {
      if (road.s[i] < startS || road.s[i] >= startS + size) continue;
      const base = positions.length / 3;
      for (const j of [i, i + 1]) { const [nx, ns] = normal(j), [width, fade] = profile(j); section(road.x[j], road.s[j], nx, ns, road.length[j], width, fade); }
      strip(base);
      if (i % 12 === 0) yield;
    }
    // Aprons: past an end that opens onto a pad, the ribbon runs on flush with the pad, widening and fading out.
    if (taper > 0 && apron > 0 && n > 1) for (const end of [0, 1] as const) {
      const j = end ? n - 1 : 0, k = end ? n - 2 : 1;
      if (ends[end] !== 'apron' || road.s[j] < startS || road.s[j] >= startS + size) continue;
      const dx = road.x[j] - road.x[k], ds = road.s[j] - road.s[k], l = Math.hypot(dx, ds) || 1, [nx, ns] = normal(j);
      const steps = Math.max(1, Math.round(apron / ROAD_STEP));
      let previous = -1;
      for (let m = 0; m <= steps; m++) {
        const x = road.x[j] + dx / l * m * ROAD_STEP, s = road.s[j] + ds / l * m * ROAD_STEP;
        if (Math.abs(x) > WORLD_HALF - 0.2) break;
        const t = smoothRange(0, steps, m), base = positions.length / 3;
        section(x, s, nx, ns, end ? total + m * ROAD_STEP : -m * ROAD_STEP, 1 + 0.35 * t, APRON_START * (1 - t), 0.25);
        if (previous >= 0) strip(previous);
        previous = base;
      }
    }
    yield;
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), alpha: Float32Array.from(alpha), shade: new Float32Array(alpha.length).fill(1), indices: Uint32Array.from(indices) };
}
export const roadRibbons = (seed: number, roads: readonly RoadPath[], startS: number, size: number, world?: WorldInput | World) => finish(roadRibbonSteps(seed, roads, startS, size, world));

/**
 * A district's internal roads (docs/23 §5): the spine from the hub yard through every lot to the last lot's yard,
 * and a spur from the hub yard to each gate a network road actually reaches, so roads end at gates and yards, never
 * in the open. Built on the arena-free world (as networks are); cached per plan.
 */
const districtRoadMemo = new Map<string, RoadPath[]>();
export function* districtRoadsSteps(seed: number, plan: DistrictPlan, input?: WorldInput | World): Work<RoadPath[]> {
  // Gates count only network roads this world keeps (an arena drops edges near it), so no spur ever dangles.
  const full = worldOf(input), world = full.bare, key = `${memoPrefix(world)}|${full.key}:${seed}:${plan.id}`;
  const known = districtRoadMemo.get(key);
  if (known) return known;
  // Where a network road reaches a gate, its tip: the internal road continues from exactly there.
  const hub = plan.lots[0], tips = new Map<string, [number, number][]>();
  for (const edge of edgesNear(seed, plan.minS - 40, plan.maxS + 1, full)) {
    const end = edge.a.site?.id === hub.id ? 0 : edge.b.site?.id === hub.id ? 1 : -1;
    if (!edge.road || end < 0) continue;
    const road = yield* roadPathSteps(seed, edge, world);
    if (!road) continue;
    const tip = end === 0 ? 0 : road.x.length - 1;
    let best = '', distance = Infinity;
    for (const gate of plan.gates) { const d = Math.hypot(gate.x - road.x[tip], gate.s - road.s[tip]); if (d < distance) { distance = d; best = gate.id; } }
    if (distance <= 1.5) tips.set(best, [...tips.get(best) ?? [], [road.x[tip], road.s[tip]]]);
  }
  const ground = (x: number, s: number) => terrainHeight(seed, x, s, world);
  // The spine runs from the main gate (continuing its network road) through the hub yard and every lot to the last
  // yard, where it opens onto the pad; other gates in use get a spur that joins the spine at the hub yard.
  const [main, ...others] = plan.gates, mainTip = main && tips.get(main.id)?.[0];
  const roads = [mainTip
    ? roadThrough(`${plan.id}:road:spine`, [mainTip, [main.x, main.s], ...plan.spine], ground, ['joined', 'apron'])
    : roadThrough(`${plan.id}:road:spine`, plan.spine, ground, ['apron', 'apron'])];
  for (const gate of others) {
    const tip = tips.get(gate.id)?.[0];
    if (tip) roads.push(roadThrough(`${plan.id}:road:${gate.id}`, [tip, [gate.x, gate.s], plan.hubYard], ground, ['joined', 'joined']));
  }
  // Further network roads arriving at the same gate join it with a short link from their own tip.
  for (const gate of plan.gates) (tips.get(gate.id) ?? []).slice(1).forEach((tip, k) => {
    roads.push(roadThrough(`${plan.id}:road:${gate.id}:${k + 1}`, [tip, [gate.x, gate.s]], ground, ['joined', 'joined']));
  });
  yield;
  if (districtRoadMemo.size > 64) districtRoadMemo.clear();
  districtRoadMemo.set(key, roads);
  return roads;
}
/**
 * A road along authored points, sampled every ROAD_STEP: corners curved like network roads (version 20), on a tighter
 * radius between a district's pieces.
 */
function roadThrough(id: string, corners: readonly (readonly [number, number])[], ground: (x: number, s: number) => number, ends: readonly [RoadEnd, RoadEnd]): RoadPath {
  const points = roundCorners(corners.map(([x, s]) => [x, s]), 2.5) as [number, number][];
  const xs: number[] = [points[0][0]], ss: number[] = [points[0][1]], lengths: number[] = [0];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, as] = points[i], [bx, bs] = points[i + 1], span = Math.hypot(bx - ax, bs - as);
    if (span < 1e-9) continue;
    for (let t = ROAD_STEP - carry; t <= span; t += ROAD_STEP) {
      xs.push(ax + (bx - ax) * t / span); ss.push(as + (bs - as) * t / span); lengths.push(lengths[lengths.length - 1] + ROAD_STEP);
    }
    carry = (carry + span) % ROAD_STEP;
  }
  // The authored end (a gate or a yard) is always the last sample.
  const [ex, es] = points[points.length - 1], lx = xs[xs.length - 1], ls = ss[ss.length - 1], tail = Math.hypot(ex - lx, es - ls);
  if (tail > 1e-6) { xs.push(ex); ss.push(es); lengths.push(lengths[lengths.length - 1] + tail); }
  return { id, x: Float64Array.from(xs), s: Float64Array.from(ss), y: Float64Array.from(xs.map((x, i) => ground(x, ss[i]))), length: Float64Array.from(lengths), ends };
}
/**
 * Every fading road end within [s0, s1] (network and district roads alike), for the dirt wear on the ground around
 * it. Gathered from the same cached paths as the sections, so both sides of a seam see the same ends.
 */
export function* roadEndSpotsSteps(seed: number, s0: number, s1: number, input?: WorldInput | World): Work<RoadEndSpot[]> {
  const world = worldOf(input), roads: RoadPath[] = [], spots: RoadEndSpot[] = [];
  // Paths may wander past their endpoints (the search margin), so look a little wider than the range itself.
  for (const edge of edgesNear(seed, s0 - 20, s1 + 20, world)) {
    if (!edge.road) continue;
    const road = yield* roadPathSteps(seed, edge, world);
    if (road) roads.push(road);
  }
  const policy = world.planet.districts;
  if (policy) for (const plan of districtsNear(seed, world.planet, s0 - 60, s1 + 60)) {
    if (!districtHidden(plan, policy, world.arena)) roads.push(...yield* districtRoadsSteps(seed, plan, world));
  }
  for (const road of roads) for (const end of [0, 1] as const) {
    // Dead ends dissolve into worn dirt; aprons leave a lighter wear on the pad they open onto.
    const kind = road.ends?.[end] ?? 'fade';
    if (kind === 'joined') continue;
    const n = road.x.length, j = end ? n - 1 : 0, k = end ? Math.max(0, n - 5) : Math.min(n - 1, 4);
    if (road.s[j] < s0 || road.s[j] > s1) continue;
    const dx = road.x[k] - road.x[j], ds = road.s[k] - road.s[j], l = Math.hypot(dx, ds) || 1;
    spots.push({ x: road.x[j], s: road.s[j], dx: dx / l, ds: ds / l, strength: kind === 'fade' ? 1 : 0.5 });
  }
  return spots;
}
/** Test hook: forgets cached paths (they are pure, so this never changes results). */
export function resetNetworkMemos() { roadMemo.clear(); pipeMemo.clear(); districtRoadMemo.clear(); }

/* ---------------------------------------------------------------- pipelines */

type Side = 'px' | 'nx' | 'ps' | 'ns';
const sideOf = (from: readonly number[], to: readonly number[]): Side => to[0] > from[0] + 1e-6 ? 'px' : to[0] < from[0] - 1e-6 ? 'nx' : to[1] > from[1] ? 'ps' : 'ns';
const OPPOSITE: Record<Side, Side> = { px: 'nx', nx: 'px', ps: 'ns', ns: 'ps' };
/** Unit step toward a cell side in world (x, s), and the same direction in three.js axes (z = −s). */
const DIRECTION: Record<Side, readonly [number, number]> = { px: [1, 0], nx: [-1, 0], ps: [0, 1], ns: [0, -1] };
const toThree = (side: Side): Vec => [DIRECTION[side][0], 0, -DIRECTION[side][1]];
const UP: Vec = [0, 1, 0], DOWN: Vec = [0, -1, 0];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec): Vec => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Grid steps a pitched run may climb between cell centres; steeper steps are lifted runs or risers (below). */
const PIPE_RUN_RISE = PIPE_MAX_SLOPE * PIPE_CELL;
/** Detour budget: how far beyond the endpoints (forward and back) the pipe search may wander. */
const PIPE_MARGIN = 20;
const PIPE_TURN = 3, PIPE_HUMP = 0.6, RISER_COST = 9, RISER_PER_UNIT = 0.4, TRESTLE_COST = 4, TRESTLE_PER_CELL = 1.5, TRESTLE_CELLS = 3;
/** On a planet with a sea, pipes never run on wet cells; they cross leads on trestles of up to this many cells. */
const WET_TRESTLE_CELLS = 6;
/**
 * A step a little too steep for one cell can still be a pitched run: layout lifts the lower side onto
 * supports and lets the line descend over the next cells. Small excesses prefer that; tall cliffs take risers.
 */
const PIPE_LIFT_RISE = PIPE_RUN_RISE * 2, LIFT_COST = 6, LIFT_PER_UNIT = 10;
/** Elbow arms are one unit long, so a riser's two bends sit at least two units apart. */
const RISER_SPAN = 2;
/** How far around a riser (in cells) the ground must stay below its bottom bend: pipe radius plus a margin. */
const RISER_REACH = 0.1;
/** Tallest single frame in a support stack; taller supports stack frames into a lattice tower. */
const STACK_SEGMENT = 1.25;
const VALVE_TOP = SCENERY_MAX_HEIGHT - SHARED_BOUNDS.pipe_valve.height;
type PipeSize = 's' | 'l';
/** Pipe body (centreline minus radius) above a piece's base, and the highest base keeping the pipe under the cap. */
const PIPE_BODY: Record<PipeSize, number> = { s: 0.27, l: 0.19 };
const PIPE_HIGHEST: Record<PipeSize, number> = { s: SCENERY_MAX_HEIGHT - SHARED_LOCAL_BOX.pipe_s_straight[4], l: SCENERY_MAX_HEIGHT - SHARED_LOCAL_BOX.pipe_l_straight[4] };
/** A pipe resting on the ground may bed this far into the dust (it sits on uneven ground). */
export const PIPE_BEDDING = 0.05;
/**
 * Lowest base a pipe may take over ground g: on a rack (base at the ground) wherever a rack fits under the
 * scenery cap; higher up (mesa tops) it rests on the ground on short stands, as only a small pipe fits.
 */
// Layout plans with part of the bedding allowance: ground between its samples may rise a little more.
const pipeNeed = (g: number, size: PipeSize) => Math.min(g, Math.max(PIPE_TOP, g - PIPE_BODY[size] - PIPE_BEDDING * 0.6));
/** The search plans with the small pipe's limits; layout picks the size that fits. */
const fits = (g: number) => pipeNeed(g, 's') <= PIPE_HIGHEST.s + 1e-9;
/** Extra cost per unit over ground too high for a rack, so lines cross mesa tops only when they must. */
const HIGH_COST = 1.5;
const PIPE_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** Searches per edge: the first, plus re-plans around cells whose laid pipe would rise above the cap. */
const PIPE_ATTEMPTS = 6;
/** Ground samples along each half of a cell (distance from its centre toward a side). */
const ARM = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const;

type CellKind = 'run' | 'riser' | 'trestle';
/** A searched pipe cell. A riser stands in the lower cell of a cliff step; `up` names its upper side. */
interface PipeCell { node: number; kind: CellKind; up: 'back' | 'front' | null }

/** Cells on the rim just outside a pad, where a pipeline may leave or join its outpost. */
function rimCells(g: Grid, site: Settlement): number[] {
  const cells: number[] = [], reach = 3;
  const r0 = Math.max(0, Math.floor((site.s - site.hs - reach - g.s0) / g.cell)), r1 = Math.min(g.rows - 1, Math.ceil((site.s + site.hs + reach - g.s0) / g.cell));
  const c0 = Math.max(0, Math.floor((site.x - site.hx - reach - g.x0) / g.cell)), c1 = Math.min(g.columns - 1, Math.ceil((site.x + site.hx + reach - g.x0) / g.cell));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const distance = padDistance(site, g.x0 + c * g.cell, g.s0 + r * g.cell);
    if (distance >= 0 && distance <= 2.2 && fits(g.heights[r * g.columns + c]) && !g.crowded[r * g.columns + c] && !g.wet?.[r * g.columns + c]) cells.push(r * g.columns + c);
  }
  return cells;
}

/**
 * A* over 2-unit cells with heading (turns cost extra) and whether the cell already hosts a riser down.
 * A pipeline may leave its outpost from any rim cell (the side facing its target costs least) and joins the
 * other outpost's rim, or the map edge near the exit point. Moves: a pitched run to a neighbour within the
 * grade; a riser down or up a cliff step (standing in the lower cell, never two in one cell); or a level
 * trestle straight across up to three lower cells (five over water: runs never stand on wet cells) to ground about as high. When every goal stays
 * unreachable, the closest partial run is kept.
 */
function* pipeSearchSteps(g: Grid, a: Endpoint, b: Endpoint, banned: ReadonlySet<number>, noRiser: ReadonlySet<number>): Work<{ cells: PipeCell[]; reached: boolean } | null> {
  const { columns, rows, cell, heights, extra } = g;
  const index = (x: number, s: number) => clamp(Math.round((s - g.s0) / cell), 0, rows - 1) * columns + clamp(Math.round((x - g.x0) / cell), 0, columns - 1);
  const gateA = index(a.x, a.s), gateB = index(b.x, b.s), bc = gateB % columns, br = Math.floor(gateB / columns);
  const sources = (a.site ? rimCells(g, a.site) : []).concat(fits(heights[gateA]) && !g.crowded[gateA] && !g.wet?.[gateA] ? [gateA] : []).filter(node => !banned.has(node));
  if (!sources.length) return null;
  const goal = new Uint8Array(columns * rows);
  let spread = 0;
  if (b.site) {
    for (const node of [...rimCells(g, b.site), ...g.crowded[gateB] || g.wet?.[gateB] ? [] : [gateB]]) if (!banned.has(node)) { goal[node] = 1; spread = Math.max(spread, Math.hypot(node % columns - bc, Math.floor(node / columns) - br)); }
  } else for (let r = 0; r < rows; r++) if (Math.abs(r - br) <= 6 && !g.wet?.[r * columns + bc]) goal[r * columns + bc] = 1;
  // Admissible distance to the nearest goal cell (in cells): to the rim around the gate, or to the exit column.
  const remaining = (node: number) => {
    const c = node % columns, r = Math.floor(node / columns);
    return b.site ? Math.max(0, Math.hypot(c - bc, r - br) - spread) : Math.hypot(c - bc, Math.max(0, Math.abs(r - br) - 6));
  };
  const states = columns * rows * 8, cost = new Float64Array(states).fill(Infinity), from = new Int32Array(states).fill(-1);
  const via = new Int8Array(states), closed = new Uint8Array(states), heap = new Heap();
  for (const node of sources) for (let d = 0; d < 4; d++) {
    const state = node * 8 + d * 2, start = Math.hypot(node % columns - gateA % columns, Math.floor(node / columns) - Math.floor(gateA / columns)) * cell * 0.75;
    if (start < cost[state]) { cost[state] = start; heap.push(state, start + remaining(node) * cell); }
  }
  // A riser stands at the lower cell's centre; its foot clears the ground all around it (the cliff face included).
  const riserFoot = (c: number, r: number, nc: number, nr: number) => {
    const [lc, lr] = heights[r * columns + c] < heights[nr * columns + nc] ? [c, r] : [nc, nr], x = g.x0 + lc * cell, s = g.s0 + lr * cell;
    return Math.max(heights[lr * columns + lc], ...PIPE_STEPS.map(([dx, ds]) => g.ground(x + dx * RISER_REACH * cell, s + ds * RISER_REACH * cell)));
  };
  const relax = (state: number, next: number, d: number, hosted: number, move: number, step: number) => {
    const nextState = next * 8 + d * 2 + hosted, total = cost[state] + step;
    if (total < cost[nextState]) {
      cost[nextState] = total; from[nextState] = state; via[nextState] = move;
      heap.push(nextState, total + remaining(next) * cell);
    }
  };
  let found = -1, closest = -1, closestDistance = Infinity, expanded = 0;
  while (heap.size) {
    const state = heap.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    if (++expanded % 8 === 0) yield;
    const node = state >> 3, heading = (state >> 1) & 3, hosted = state & 1;
    if (goal[node]) { found = state; break; }
    const c = node % columns, r = Math.floor(node / columns), hu = heights[node], left = remaining(node);
    if (left < closestDistance) { closestDistance = left; closest = state; }
    for (let d = 0; d < 4; d++) {
      const [dc, dr] = PIPE_STEPS[d], turn = d !== heading && from[state] >= 0 ? PIPE_TURN : 0, nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= columns || nr < 0 || nr >= rows) continue;
      const next = nr * columns + nc, hv = heights[next], rise = hv - hu, hump = g.half(c + nc, r + nr), high = hv > PIPE_TOP ? HIGH_COST : 0;
      if (!banned.has(next) && !g.wet?.[next] && fits(hv) && fits(hump) && hump <= Math.max(hu, hv) + PIPE_HUMP) {
        const run = cell * (1 + 3 * (Math.min(Math.abs(rise), PIPE_RUN_RISE) / cell) ** 2 + extra[next] + high) + turn;
        if (Math.abs(rise) <= PIPE_RUN_RISE) relax(state, next, d, 0, 0, run);
        else {
          if (Math.abs(rise) <= PIPE_LIFT_RISE) relax(state, next, d, 0, 0, run + LIFT_COST + LIFT_PER_UNIT * (Math.abs(rise) - PIPE_RUN_RISE));
          const host = rise < 0 ? next : node;
          if (!noRiser.has(host) && pipeNeed(riserFoot(c, r, nc, nr), 's') + RISER_SPAN <= PIPE_HIGHEST.s) {
            const step = cell * (1 + extra[next] + high) + RISER_COST + RISER_PER_UNIT * Math.abs(rise) + turn;
            // Down a cliff the riser stands in the next (lower) cell; up a cliff in this one, if it has none yet.
            if (rise < 0) relax(state, next, d, 1, 1, step);
            else if (!hosted) relax(state, next, d, 0, 2, step);
          }
        }
      }
      // Trestle: a level straight over k lower cells (a real canyon) to ground about as high as this cell.
      let span = -Infinity, deepest = Infinity, extras = 0;
      for (let k = 1; k <= (g.wet ? WET_TRESTLE_CELLS : TRESTLE_CELLS); k++) {
        const mc = c + dc * k, mr = r + dr * k, ec = mc + dc, er = mr + dr;
        if (ec < 0 || ec >= columns || er < 0 || er >= rows) break;
        const middle = mr * columns + mc, end = er * columns + ec, he = heights[end];
        span = Math.max(span, g.half(2 * mc - dc, 2 * mr - dr), heights[middle], g.half(2 * mc + dc, 2 * mr + dr));
        deepest = Math.min(deepest, heights[middle]); extras += extra[middle];
        if (!fits(span)) break;
        const level = Math.max(pipeNeed(hu, 's'), pipeNeed(he, 's'));
        if (banned.has(middle)) break;
        if (banned.has(end) || g.wet?.[end] || Math.abs(he - hu) > PIPE_RUN_RISE || pipeNeed(span, 's') > level || deepest > Math.max(hu, he) - PIPE_RUN_RISE / 2) continue;
        relax(state, end, d, 0, 2 + k, cell * (k + 1 + extras + extra[end] + (he > PIPE_TOP ? HIGH_COST : 0)) + TRESTLE_COST + TRESTLE_PER_CELL * k + turn);
      }
    }
  }
  const reached = found >= 0;
  if (!reached) found = closest;
  if (found < 0) return null;
  const chain: number[] = [];
  for (let state = found; state >= 0; state = from[state]) chain.push(state);
  chain.reverse();
  const cells: PipeCell[] = [];
  chain.forEach((state, i) => {
    const node = state >> 3, move = via[state];
    if (i > 0) {
      const previous = chain[i - 1] >> 3, step = Math.sign(node - previous) * (Math.abs(node - previous) >= columns ? columns : 1);
      if (move === 2) Object.assign(cells[cells.length - 1], { kind: 'riser', up: 'front' });
      for (let m = 1; m <= move - 2; m++) cells.push({ node: previous + step * m, kind: 'trestle', up: null });
    }
    cells.push(i > 0 && move === 1 ? { node, kind: 'riser', up: 'back' } : { node, kind: 'run', up: null });
  });
  return { cells, reached };
}

/** A pipe piece posed so its local axis point (0, PIPE_AXIS, 0) lands on `axis`, local z along `z` and x along `x` (three.js axes). */
function pose(id: string, node: SharedNode, group: string, axis: Vec, z: Vec, x: Vec, scaleZ: number): IndustryPiece {
  // Euler 'YXZ' from the rotation's columns (x, z × x, z), as three.js extracts it.
  const y = cross(z, x), pitch = Math.asin(-clamp(z[1], -1, 1)), free = Math.abs(z[1]) < 0.9999999;
  const rotation = free ? Math.atan2(z[0], z[2]) : Math.atan2(-x[2], x[0]), roll = free ? Math.atan2(x[1], y[1]) : 0;
  return { id, node, group, x: axis[0] - y[0] * PIPE_AXIS, y: axis[1] - y[1] * PIPE_AXIS, s: -(axis[2] - y[2] * PIPE_AXIS), rotation, pitch, roll, scaleY: 1, scaleZ };
}
/** A straight (or valve) whose centreline runs exactly from `from` to `to` (three.js axes). */
function pipeBetween(id: string, node: SharedNode, group: string, from: Vec, to: Vec): IndustryPiece {
  const delta: Vec = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], z = unit(delta);
  const x = Math.abs(z[1]) > 0.9999999 ? [1, 0, 0] as Vec : unit(cross(UP, z));
  return pose(id, node, group, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], z, x, Math.hypot(...delta) / 2);
}
/** An elbow with its corner on the centreline at (x, s, level + axis), arms toward w1 and w2 (unit, three.js axes). */
function elbowPiece(id: string, node: SharedNode, group: string, x: number, s: number, level: number, w1: Vec, w2: Vec): IndustryPiece {
  // Native arms run along local −z and +x; a level elbow is turned (arms swapped) so its base stays down.
  let z: Vec = [-w1[0], -w1[1], -w1[2]], arm = w2;
  if (w1[1] === 0 && w2[1] === 0 && cross(z, arm)[1] < 0) { z = [-w2[0], -w2[1], -w2[2]]; arm = w1; }
  return pose(id, node, group, [x, level + PIPE_AXIS, -s], z, arm, 1);
}
/**
 * Supports for a pipe whose base is at `level`: a rack holding it on a stack of frames down to the ground
 * (a lattice tower when tall). Where no rack fits under the cap the pipe rests on the ground, on a short
 * stand of frames up to its underside if needed. Valves (`rack` false) stand on frames under their base.
 */
type Ground = (x: number, s: number) => number;
function supportStack(pieces: IndustryPiece[], terrain: Ground, id: string, group: string, x: number, s: number, level: number, along: Vec, rack: boolean, body: number) {
  const ground = terrain(x, s), racked = rack && level <= PIPE_TOP + 1e-9 && ground <= level + 0.02;
  const base = { node: 'pipe_support' as const, x, s, rotation: Math.atan2(along[0], along[2]), pitch: 0, roll: 0, scaleZ: 1, group };
  if (racked) pieces.push({ ...base, id: `${id}:rack`, y: level, scaleY: 1 });
  const gap = (rack && !racked ? level + body : level) - ground;
  if (gap <= 0.02) return;
  const count = Math.ceil(gap / STACK_SEGMENT);
  for (let k = 0; k < count; k++) pieces.push({ ...base, id: `${id}:${k}`, y: ground + gap * k / count, scaleY: gap / count / SUPPORT_HEIGHT });
}

/** Where a line rests on high ground (no rack fits), a short stand under any spot it lifts off over a dip. */
function stand(pieces: IndustryPiece[], terrain: Ground, id: string, group: string, x: number, s: number, level: number, along: Vec, body: number) {
  const ground = terrain(x, s);
  if ((level <= PIPE_TOP + 1e-9 && ground <= level + 0.02) || level + body - ground <= 0.1) return;
  supportStack(pieces, terrain, id, group, x, s, level, along, true, body);
}

interface Layout { cells: PipeCell[]; at: (readonly [number, number])[]; back: Side[]; front: Side[]; turn: boolean[]; joints: Float64Array }

/** Poses the pieces of a solved layout: pitched straights, level elbows, risers, trestle spans and their supports. */
function* assembleSteps(seed: Ground, edge: NetworkEdge, layout: Layout, reached: boolean, size: PipeSize): Work<IndustryPiece[]> {
  const { cells, at, back, front, turn, joints } = layout, pieces: IndustryPiece[] = [], n = cells.length, group = `pipe:${edge.id}`;
  const large = size === 'l', body = PIPE_BODY[size];
  const straight = `pipe_${size}_straight` as SharedNode, elbow = `pipe_${size}_elbow` as SharedNode;
  // A run that ends in the open (a map exit, or cut back short of its goal) finishes at a level valve station.
  const open = !reached || !edge.b.site;
  for (let i = 0; i < n; i++) {
    const [x, s] = at[i], id = `${group}:${i}`, cell = cells[i];
    if (cell.kind === 'riser') {
      const upFront = cell.up === 'front', upper = upFront ? front[i] : back[i], lower = upFront ? back[i] : front[i];
      const top = joints[upFront ? i + 1 : i], bottom = joints[upFront ? i : i + 1];
      pieces.push(elbowPiece(`${id}:top`, elbow, group, x, s, top, toThree(upper), DOWN), elbowPiece(`${id}:bottom`, elbow, group, x, s, bottom, toThree(lower), UP));
      // Vertical straights (about two units each) join the bends' vertical arms.
      const y0 = bottom + PIPE_AXIS + 1, y1 = top + PIPE_AXIS - 1, tiles = Math.max(1, Math.round((y1 - y0) / PIPE_CELL));
      if (y1 - y0 > 1e-6) for (let k = 0; k < tiles; k++) {
        pieces.push(pose(`${id}:rise${k}`, straight, group, [x, y0 + (y1 - y0) * (k + 0.5) / tiles, -s], UP, toThree(upper), (y1 - y0) / tiles / 2));
      }
      // A lattice tower on the cliff side carries the riser and its top arm; a rack under the bottom arm carries the foot.
      supportStack(pieces, seed, `${id}:tower`, group, x + DIRECTION[upper][0] * 0.3, s + DIRECTION[upper][1] * 0.3, top, toThree(upper), true, body);
      supportStack(pieces, seed, `${id}:foot`, group, x + DIRECTION[lower][0] * 0.55, s + DIRECTION[lower][1] * 0.55, bottom, toThree(lower), true, body);
    } else if (turn[i]) {
      pieces.push(elbowPiece(id, elbow, group, x, s, joints[i], toThree(back[i]), toThree(front[i])));
      supportStack(pieces, seed, `${id}:support`, group, x + DIRECTION[back[i]][0] * 0.55, s + DIRECTION[back[i]][1] * 0.55, joints[i], toThree(back[i]), true, body);
      stand(pieces, seed, `${id}:stand`, group, x + DIRECTION[front[i]][0] * 0.55, s + DIRECTION[front[i]][1] * 0.55, joints[i], toThree(front[i]), body);
    } else {
      const level = Math.abs(joints[i + 1] - joints[i]) < 1e-9 && joints[i] <= VALVE_TOP;
      const valve = level && (cell.kind === 'run' && large && i > 1 && i < n - 2 && i % 7 === 3 || open && i === n - 1);
      const [bx, bs] = DIRECTION[back[i]], [fx, fs] = DIRECTION[front[i]];
      pieces.push(pipeBetween(id, valve ? 'pipe_valve' : straight, group, [x + bx, joints[i] + PIPE_AXIS, -(s + bs)], [x + fx, joints[i + 1] + PIPE_AXIS, -(s + fs)]));
      // Trestle spans get the same supports, just tall: stacked frames down to the canyon floor.
      supportStack(pieces, seed, `${id}:support`, group, x, s, (joints[i] + joints[i + 1]) / 2, toThree(front[i]), !valve, body);
      // A line resting on high ground gets a stand under the worst dip it bridges in each half.
      if (!valve) for (const [name, low, side] of [['back', 0, back[i]], ['front', 0.5, front[i]]] as const) {
        let worst = 0.1, best = -1;
        for (let t = low + 0.0625; t < low + 0.5; t += 0.125) {
          const d = Math.abs(1 - 2 * t), gap = joints[i] + (joints[i + 1] - joints[i]) * t + body
            - seed(x + DIRECTION[side][0] * d, s + DIRECTION[side][1] * d);
          if (gap > worst) { worst = gap; best = t; }
        }
        if (best < 0) continue;
        const d = Math.abs(1 - 2 * best);
        stand(pieces, seed, `${id}:${name}`, group, x + DIRECTION[side][0] * d, s + DIRECTION[side][1] * d, joints[i] + (joints[i + 1] - joints[i]) * best, toThree(front[i]), body);
      }
    }
    if (i % 4 === 3) yield;
  }
  return pieces;
}

/** A laid pipeline: its pieces, whether it joins both endpoints, and its cell count. */
export interface PipeRun { pieces: IndustryPiece[]; reached: boolean; cells: number }
/** A layout attempt also names the first cell whose pipe would rise above the cap (the search then avoids it). */
interface Attempt extends PipeRun { blocked: { node: number; riser: boolean } | null }

/**
 * Lays pieces along searched cells. Joint levels (piece bases at cell edges) start at the ground and only
 * ever rise until every constraint holds: straights clear sampled ground and keep within the grade; elbows,
 * trestle spans and free ends stay level; a riser's bends clear their arms and sit two units apart. A run
 * that would rise above the cap is cut back to an open end.
 */
function* pipeLayoutSteps(g: Grid, found: { cells: PipeCell[]; reached: boolean }, edge: NetworkEdge, size: PipeSize): Work<Attempt> {
  let cells = found.cells, reached = found.reached, blocked: Attempt['blocked'] = null;
  const position = (cell: PipeCell) => [g.x0 + (cell.node % g.columns) * g.cell, g.s0 + Math.floor(cell.node / g.columns) * g.cell] as const;
  for (;;) {
    const n = cells.length;
    if (n < (reached ? 2 : 6)) return { pieces: [], reached: reached && n === 1, cells: n, blocked };
    const at = cells.map(position), back: Side[] = [], front: Side[] = [];
    for (let i = 0; i < n - 1; i++) { front[i] = sideOf(at[i], at[i + 1]); back[i + 1] = sideOf(at[i + 1], at[i]); }
    // The ends face their outposts (or the map edge) when they can; an open end continues straight.
    const toward = (site: Settlement, [x, s]: readonly number[]): Side =>
      Math.abs(x - site.x) / site.hx >= Math.abs(s - site.s) / site.hs ? (x > site.x ? 'nx' : 'px') : (s > site.s ? 'ns' : 'ps');
    const first = edge.a.site ? toward(edge.a.site, at[0]) : OPPOSITE[front[0]];
    back[0] = first === front[0] ? OPPOSITE[front[0]] : first;
    const last = !reached ? OPPOSITE[back[n - 1]] : edge.b.site ? toward(edge.b.site, at[n - 1]) : edge.b.x > 0 ? 'px' : 'nx';
    front[n - 1] = last === back[n - 1] ? OPPOSITE[back[n - 1]] : last;
    const turn = cells.map((cell, i) => cell.kind === 'run' && back[i] !== OPPOSITE[front[i]]);
    // Ground samples, already turned into the lowest pipe base each allows (see pipeNeed).
    const sample = (i: number, side: Side, d: number) => pipeNeed(g.ground(at[i][0] + DIRECTION[side][0] * d, at[i][1] + DIRECTION[side][1] * d), size);
    const center = cells.map(cell => pipeNeed(g.heights[cell.node], size)), backArm: number[][] = [], frontArm: number[][] = [];
    const foot = cells.map((cell, i) => cell.kind === 'riser' ? Math.max(...(['px', 'nx', 'ps', 'ns'] as const).map(side => sample(i, side, RISER_REACH * PIPE_CELL))) : -Infinity);
    const joints = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      backArm[i] = ARM.map(d => sample(i, back[i], d)); frontArm[i] = ARM.map(d => sample(i, front[i], d));
      const c = cells[i].node % g.columns, r = Math.floor(cells[i].node / g.columns);
      joints[i] = i === 0 ? sample(0, back[0], 1) : pipeNeed(g.half(c + cells[i - 1].node % g.columns, r + Math.floor(cells[i - 1].node / g.columns)), size);
      if (i % 4 === 3) yield;
    }
    joints[n] = sample(n - 1, front[n - 1], 1);
    for (let pass = 0; pass < 64; pass++) {
      let changed = false;
      const raise = (j: number, level: number) => { if (joints[j] < level - 1e-9) { joints[j] = level; changed = true; } };
      for (let i = 0; i < n; i++) {
        const b = i, f = i + 1, cell = cells[i];
        if (cell.kind === 'riser') {
          const upFront = cell.up === 'front', top = upFront ? f : b, bottom = upFront ? b : f;
          const upper = upFront ? frontArm[i] : backArm[i], lower = upFront ? backArm[i] : frontArm[i];
          // The bottom bend clears its arm and the cliff foot beside the riser; the top bend clears its arm.
          raise(bottom, Math.max(center[i], foot[i], ...lower));
          raise(top, Math.max(...upper, joints[bottom] + RISER_SPAN));
        } else if (turn[i] || cell.kind === 'trestle' || i === 0 || i === n - 1) {
          const level = Math.max(joints[b], joints[f], center[i], ...backArm[i], ...frontArm[i]);
          raise(b, level); raise(f, level);
        } else {
          raise(b, joints[f] - PIPE_RUN_RISE); raise(f, joints[b] - PIPE_RUN_RISE);
          // Straight from the back edge (t = 0) to the front edge (t = 1) over every sample: a shortfall first
          // lifts the lower end (at most to level), then both, so lines hug the ground and never rise above
          // what the ground itself demands.
          const clear = (t: number, level: number) => {
            const deficit = level - (joints[b] + (joints[f] - joints[b]) * t);
            if (deficit <= 1e-9) return;
            const [low, high, weight] = joints[b] <= joints[f] ? [b, f, 1 - t] : [f, b, t];
            if (joints[low] + deficit / weight <= joints[high]) { raise(low, joints[low] + deficit / weight); return; }
            raise(low, joints[high]); raise(b, level); raise(f, level);
          };
          clear(0.5, center[i]);
          ARM.forEach((d, k) => { clear(0.5 - d / 2, backArm[i][k]); clear(0.5 + d / 2, frontArm[i][k]); });
        }
      }
      yield;
      if (!changed) break;
    }
    const over = Array.from({ length: n }, (_, i) => i).find(i => Math.max(joints[i], joints[i + 1]) > PIPE_HIGHEST[size] + 1e-9);
    if (over === undefined) return { pieces: yield* assembleSteps(g.ground, edge, { cells, at, back, front, turn, joints }, reached, size), reached, cells: n, blocked };
    // Cut back before the cell that would rise above the cap, never ending mid-trestle or on a riser's top.
    blocked ??= { node: cells[over].node, riser: cells[over].kind === 'riser' };
    cells = cells.slice(0, over); reached = false;
    while (cells.length && (cells[cells.length - 1].kind === 'trestle' || cells[cells.length - 1].up === 'front')) cells.pop();
  }
}

const pipeMemo = new Map<string, PipeRun>();
/** One edge's pipeline (cached per edge, so every section extracts its own pieces identically). */
export function* pipeRunSteps(seed: number, edge: NetworkEdge, input?: WorldInput | World): Work<PipeRun> {
  const world = worldOf(input).bare, key = `${memoPrefix(world)}:${seed}:${edge.id}`;
  if (pipeMemo.has(key)) return pipeMemo.get(key)!;
  let run: PipeRun = { pieces: [], reached: false, cells: 0 };
  if (edge.pipe) {
    const g = yield* gridSteps(seed, edge, PIPE_CELL, 1.5, PIPE_MARGIN, true, world), banned = new Set<number>(), noRiser = new Set<number>();
    // The search plans on cell heights; when the laid line would still rise above the cap somewhere, that
    // cell is ruled out and the search runs again (a few times at most).
    for (let attempt = 0; attempt < PIPE_ATTEMPTS; attempt++) {
      const found = yield* pipeSearchSteps(g, edge.a, edge.b, banned, noRiser);
      if (!found) break;
      // Most lines are large; a line that must cross ground too high for a large pipe is laid small.
      const large = hash(seed ^ 0x919, found.cells.length, found.cells[0].node) < 0.6;
      let laid = yield* pipeLayoutSteps(g, found, edge, large ? 'l' : 's');
      if (large && found.reached && !laid.reached) laid = yield* pipeLayoutSteps(g, found, edge, 's');
      run = { pieces: laid.pieces, reached: laid.reached, cells: laid.cells };
      if (laid.reached || !found.reached || laid.blocked === null) break;
      // A riser too tall for the cap is ruled out in that cell (the cell stays usable); any other cell is avoided.
      (laid.blocked.riser ? noRiser : banned).add(laid.blocked.node);
    }
    // Over a sea a line that cannot reach its goal would stop at a shelf edge (open water too wide to
    // trestle across): it is not built at all.
    if (!run.reached && world.planet.seaLevel !== null) run = { pieces: [], reached: false, cells: 0 };
  }
  if (pipeMemo.size > 256) pipeMemo.clear();
  pipeMemo.set(key, run);
  return run;
}
export const pipeRun = (seed: number, edge: NetworkEdge, world?: WorldInput | World) => finish(pipeRunSteps(seed, edge, world));
export function* pipePieceSteps(seed: number, edge: NetworkEdge, world?: WorldInput | World): Work<IndustryPiece[]> { return (yield* pipeRunSteps(seed, edge, world)).pieces; }
export const pipePieces = (seed: number, edge: NetworkEdge, world?: WorldInput | World) => finish(pipePieceSteps(seed, edge, world));

/** Every network piece of a section (anchor s inside it), plus the roads that touch it. */
export function* sectionNetworkSteps(seed: number, startS: number, size: number, input?: WorldInput | World): Work<{ pieces: IndustryPiece[]; roads: RoadPath[] }> {
  const pieces: IndustryPiece[] = [], roads: RoadPath[] = [], world = worldOf(input);
  for (const edge of edgesNear(seed, startS, startS + size, world)) {
    for (const piece of yield* pipePieceSteps(seed, edge, world)) {
      if (piece.s < startS || piece.s >= startS + size) continue;
      // Safety net only: layout keeps every piece inside the world and under the cap (tests hold it to that).
      const box = pieceBounds(piece);
      if (box.minX < -WORLD_HALF || box.maxX > WORLD_HALF || box.maxY > SCENERY_MAX_HEIGHT + 1e-6) continue;
      pieces.push(piece);
    }
    const road = yield* roadPathSteps(seed, edge, world);
    if (road && road.s.some(s => s >= startS - 1 && s < startS + size + 1)) roads.push(road);
    yield;
  }
  return { pieces, roads };
}
export const sectionNetwork = (seed: number, startS: number, size: number, world?: WorldInput | World) => finish(sectionNetworkSteps(seed, startS, size, world));
