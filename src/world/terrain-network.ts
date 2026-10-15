import { SCENERY_MAX_HEIGHT, WORLD_HALF, clamp, hash, routeCenter } from './terrain-layout';
import { terrainHeight } from './terrain-ground';
import { SETTLEMENT_CELL, padDistance, settlement, settlementsNear, type Settlement } from './terrain-settlements';
import { finish, type Work } from './terrain-work';
import { nearArena } from './terrain-arena';
import { KHEPRI, worldOf, type PlanetProfile, type World, type WorldInput } from './terrain-planet';

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
  | 'container_0' | 'container_1';
export const SHARED_NODES: readonly SharedNode[] = [
  'pipe_s_straight', 'pipe_l_straight', 'pipe_s_elbow', 'pipe_l_elbow', 'pipe_s_tee', 'pipe_l_tee', 'pipe_valve',
  'pipe_support', 'tank_vertical_0', 'tank_vertical_1', 'tank_sphere', 'tank_horizontal', 'container_0', 'container_1',
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
  const dx = tx - site.x, ds = ts - site.s, length = Math.hypot(dx, ds) || 1;
  const reach = Math.min(Math.abs(dx) > 1e-6 ? site.hx / Math.abs(dx / length) : Infinity, Math.abs(ds) > 1e-6 ? site.hs / Math.abs(ds / length) : Infinity) + 0.4;
  return { x: clamp(site.x + dx / length * reach, -WORLD_HALF + 0.6, WORLD_HALF - 0.6), s: site.s + ds / length * reach, site };
}

/** Edges owned by one settlement: the next outpost ahead on its side, sometimes a map exit or a cross link. */
function edgesOf(seed: number, site: Settlement, planet: PlanetProfile = KHEPRI): NetworkEdge[] {
  const INDUSTRIAL = planet.industrial, QUIET = planet.quiet;
  const edges: NetworkEdge[] = [], h = (k: number) => hash(seed ^ 0x7e7, site.cell * 31 + k, site.side > 0 ? 7 : 3);
  const make = (kind: NetworkEdge['kind'], target: Settlement | null, tx: number, ts: number, road: number, pipe: number): NetworkEdge => {
    const b: Endpoint = target ? gate(target, site.x, site.s) : { x: tx, s: ts, site: null };
    return { id: `${site.id}>${kind}`, a: gate(site, b.x, b.s), b, kind, road: h(edges.length * 3 + 1) < road, pipe: h(edges.length * 3 + 2) < pipe };
  };
  for (let cell = site.cell + 1; cell <= site.cell + 3; cell++) {
    const next = planet.settlement(seed, cell, site.side);
    if (!next) continue;
    const quiet = QUIET.has(site.archetype) || QUIET.has(next.archetype);
    const industrial = INDUSTRIAL.has(site.archetype) && INDUSTRIAL.has(next.archetype) ? 0.9 : INDUSTRIAL.has(site.archetype) || INDUSTRIAL.has(next.archetype) ? 0.55 : 0.2;
    edges.push(make('chain', next, 0, 0, quiet ? 0.45 : 0.88, quiet ? 0 : industrial));
    break;
  }
  if (h(20) < 0.42) edges.push(make('exit', null, site.side * (WORLD_HALF - 0.4), site.s + (h(21) - 0.5) * 18, 0.7, QUIET.has(site.archetype) ? 0 : 0.45));
  if (h(22) < 0.14 && !QUIET.has(site.archetype)) {
    const other = planet.settlement(seed, site.cell, -site.side) ?? planet.settlement(seed, site.cell + 1, -site.side);
    if (other && !QUIET.has(other.archetype)) edges.push(make('cross', other, 0, 0, 1, 0));
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
  for (const site of settlementsNear(seed, s0 - 3 * SETTLEMENT_CELL - 10, s1 + 10, arena, planet)) {
    for (const edge of edgesOf(seed, site, planet)) {
      if (nearArena(arena, Math.min(edge.a.s, edge.b.s), Math.max(edge.a.s, edge.b.s), PIPE_MARGIN + 2 * PIPE_CELL)) continue;
      if (Math.max(edge.a.s, edge.b.s) + 10 >= s0 && Math.min(edge.a.s, edge.b.s) - 10 <= s1) edges.push(edge);
    }
  }
  return edges;
}

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
const moduleReach = (node: string) => node === 'infra_landing_pad' ? 3.2 : node === 'infra_refinery' ? 2.7 : 1;
/** Coarse grid over the edge's span with ground heights and a per-cell cost (center lane, foreign pads). */
function* gridSteps(seed: number, edge: NetworkEdge, cell: number, center: number, margin = 8, ownPads = false, world: World = worldOf()): Work<Grid> {
  const terrainAt = (x: number, s: number) => terrainHeight(seed, x, s, world.bare);
  // Columns sit symmetrically about the centre (on whole or half cells, whichever reaches further), their cells
  // at least half a unit clear of the world edges.
  const limit = WORLD_HALF - 0.5 - cell / 2, whole = Math.floor(limit / cell) * cell, offset = (Math.floor(limit / cell - 0.5) + 0.5) * cell;
  const reach = Math.max(whole, offset), x0 = -reach, columns = Math.round(2 * reach / cell) + 1;
  const s0 = Math.floor((Math.min(edge.a.s, edge.b.s) - margin) / cell) * cell, rows = Math.ceil((Math.max(edge.a.s, edge.b.s) + margin - s0) / cell) + 1;
  const heights = new Float64Array(columns * rows), extra = new Float64Array(columns * rows);
  const pads = settlementsNear(seed, s0, s0 + rows * cell, undefined, world.planet).filter(site => site !== edge.a.site && site !== edge.b.site);
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

/** A road centreline resampled every 0.5 units: x, s, ground height, and cumulative length. */
export interface RoadPath { id: string; x: Float64Array; s: Float64Array; y: Float64Array; length: Float64Array }
export const ROAD_STEP = 0.5;
/** Steepest grade a road may take between grid cells. */
export const ROAD_MAX_SLOPE = 0.45;

const roadMemo = new Map<string, RoadPath | null>();
export function* roadPathSteps(seed: number, edge: NetworkEdge, input?: WorldInput | World): Work<RoadPath | null> {
  const world = worldOf(input).bare, key = `${world.planet.id}:${seed}:${edge.id}`;
  if (roadMemo.has(key)) return roadMemo.get(key)!;
  let result: RoadPath | null = null;
  if (edge.road) {
    const g = yield* gridSteps(seed, edge, 1, 0.5, 8, false, world), nodes = yield* searchSteps(g, edge.a, edge.b, true, ROAD_MAX_SLOPE, 0.4, 10);
    if (nodes && nodes.length > 1) {
      let points = nodes.map(node => [g.x0 + (node % g.columns) * g.cell, g.s0 + Math.floor(node / g.columns) * g.cell]);
      // Chaikin smoothing gives gently curved roads; the endpoints stay on searched cells next to the gates.
      for (let pass = 0; pass < 2; pass++) {
        const next = [points[0]];
        for (let i = 0; i < points.length - 1; i++) {
          const [ax, as] = points[i], [bx, bs] = points[i + 1];
          next.push([ax * 0.75 + bx * 0.25, as * 0.75 + bs * 0.25], [ax * 0.25 + bx * 0.75, as * 0.25 + bs * 0.75]);
        }
        next.push(points[points.length - 1]); points = next;
      }
      const xs: number[] = [points[0][0]], ss: number[] = [points[0][1]], lengths: number[] = [0];
      let carry = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const [ax, as] = points[i], [bx, bs] = points[i + 1], span = Math.hypot(bx - ax, bs - as);
        for (let t = ROAD_STEP - carry; t <= span; t += ROAD_STEP) {
          xs.push(ax + (bx - ax) * t / span); ss.push(as + (bs - as) * t / span); lengths.push(lengths[lengths.length - 1] + ROAD_STEP);
        }
        carry = (carry + span) % ROAD_STEP;
      }
      const y = xs.map((x, i) => g.ground(x, ss[i]));
      // Last guard: a road whose smoothed line still meets a hard grade is not built.
      const graded = y.every((height, i) => i === 0 || Math.abs(height - y[i - 1]) / ROAD_STEP <= ROAD_MAX_SLOPE * 1.6);
      if (graded) result = { id: edge.id, x: Float64Array.from(xs), s: Float64Array.from(ss), y: Float64Array.from(y), length: Float64Array.from(lengths) };
    }
  }
  if (roadMemo.size > 256) roadMemo.clear();
  roadMemo.set(key, result);
  return result;
}
export const roadPath = (seed: number, edge: NetworkEdge, world?: WorldInput | World) => finish(roadPathSteps(seed, edge, world));

/** Ribbon cross-section: outer berm, road edge, road edge, outer berm (offsets, u, lift above ground, alpha). */
const RIBBON = [[-0.82, 0, 0.035, 0], [-0.5, 0.2, 0.055, 1], [0.5, 0.8, 0.055, 1], [0.82, 1, 0.035, 0]] as const;
export interface RoadMesh { positions: Float32Array; uvs: Float32Array; alpha: Float32Array; shade: Float32Array; indices: Uint32Array }

/** Ribbon quads for road segments starting inside a section (section-local z = −(s − startS)). */
export function* roadRibbonSteps(seed: number, roads: readonly RoadPath[], startS: number, size: number, world?: WorldInput | World): Work<RoadMesh> {
  const bare = worldOf(world).bare;
  const positions: number[] = [], uvs: number[] = [], alpha: number[] = [], indices: number[] = [];
  for (const road of roads) {
    const n = road.x.length;
    const normal = (i: number): [number, number] => {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = road.x[b] - road.x[a], ds = road.s[b] - road.s[a], l = Math.hypot(dx, ds) || 1;
      return [-ds / l, dx / l];
    };
    for (let i = 0; i < n - 1; i++) {
      if (road.s[i] < startS || road.s[i] >= startS + size) continue;
      const base = positions.length / 3;
      for (const j of [i, i + 1]) {
        const [nx, ns] = normal(j);
        for (const [offset, u, lift, a] of RIBBON) {
          const x = road.x[j] + nx * offset, s = road.s[j] + ns * offset;
          positions.push(x, terrainHeight(seed, x, s, bare) + lift, -(s - startS));
          uvs.push(u, road.length[j] / 2); alpha.push(a);
        }
      }
      for (let k = 0; k < RIBBON.length - 1; k++) indices.push(base + k, base + 4 + k, base + k + 1, base + k + 1, base + 4 + k, base + 4 + k + 1);
      if (i % 12 === 0) yield;
    }
    yield;
  }
  return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), alpha: Float32Array.from(alpha), shade: new Float32Array(alpha.length).fill(1), indices: Uint32Array.from(indices) };
}
export const roadRibbons = (seed: number, roads: readonly RoadPath[], startS: number, size: number, world?: WorldInput | World) => finish(roadRibbonSteps(seed, roads, startS, size, world));

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
  const world = worldOf(input).bare, key = `${world.planet.id}:${seed}:${edge.id}`;
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
