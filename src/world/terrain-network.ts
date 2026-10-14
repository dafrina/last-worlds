import { SCENERY_MAX_HEIGHT, WORLD_HALF, clamp, hash, routeCenter } from './terrain-layout';
import { terrainHeight } from './terrain-ground';
import { SETTLEMENT_CELL, padDistance, settlement, settlementsNear, type Settlement } from './terrain-settlements';
import { finish, type Work } from './terrain-work';

/**
 * Long-range settlement network (docs/13 §2): outposts are nodes of a seeded graph; each edge gets a
 * deterministic path search on a coarse grid with a slope cost that follows valleys and contours and never
 * climbs cliffs. Paths are cached per edge, so every section extracts its own part identically.
 * Roads become terrain-following ribbons; pipelines become shared-kit pieces pitched to follow the ground.
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
/** Pipe centreline above a piece's pivot, and where a support's beam meets the pipe. */
const PIPE_AXIS = 0.35, SUPPORT_BEAM = 0.19;
/** Steepest grade between pipe cells (rise per unit); pitch stays under about 24°. */
export const PIPE_MAX_SLOPE = 0.45;

/** A placed shared-kit piece: base pivot, yaw, pitch about its local x (pipes follow the ground), vertical scale. */
export interface IndustryPiece {
  id: string; node: SharedNode; x: number; s: number; y: number;
  rotation: number; pitch: number; scaleY: number; group: string;
}

/* ---------------------------------------------------------------- graph */

export interface Endpoint { x: number; s: number; site: Settlement | null }
export interface NetworkEdge { id: string; a: Endpoint; b: Endpoint; road: boolean; pipe: boolean; kind: 'chain' | 'exit' | 'cross' }

const INDUSTRIAL = new Set(['refinery', 'pumping', 'mining']);
const QUIET = new Set(['wreck', 'abandoned']);
/** The point on a pad's edge facing a target, so paths leave from the outpost's side. */
function gate(site: Settlement, tx: number, ts: number): Endpoint {
  const dx = tx - site.x, ds = ts - site.s, length = Math.hypot(dx, ds) || 1;
  const reach = Math.min(Math.abs(dx) > 1e-6 ? site.hx / Math.abs(dx / length) : Infinity, Math.abs(ds) > 1e-6 ? site.hs / Math.abs(ds / length) : Infinity) + 0.4;
  return { x: clamp(site.x + dx / length * reach, -WORLD_HALF + 0.6, WORLD_HALF - 0.6), s: site.s + ds / length * reach, site };
}

/** Edges owned by one settlement: the next outpost ahead on its side, sometimes a map exit or a cross link. */
function edgesOf(seed: number, site: Settlement): NetworkEdge[] {
  const edges: NetworkEdge[] = [], h = (k: number) => hash(seed ^ 0x7e7, site.cell * 31 + k, site.side > 0 ? 7 : 3);
  const make = (kind: NetworkEdge['kind'], target: Settlement | null, tx: number, ts: number, road: number, pipe: number): NetworkEdge => {
    const b: Endpoint = target ? gate(target, site.x, site.s) : { x: tx, s: ts, site: null };
    return { id: `${site.id}>${kind}`, a: gate(site, b.x, b.s), b, kind, road: h(edges.length * 3 + 1) < road, pipe: h(edges.length * 3 + 2) < pipe };
  };
  for (let cell = site.cell + 1; cell <= site.cell + 3; cell++) {
    const next = settlement(seed, cell, site.side);
    if (!next) continue;
    const quiet = QUIET.has(site.archetype) || QUIET.has(next.archetype);
    const industrial = INDUSTRIAL.has(site.archetype) && INDUSTRIAL.has(next.archetype) ? 0.9 : INDUSTRIAL.has(site.archetype) || INDUSTRIAL.has(next.archetype) ? 0.55 : 0.2;
    edges.push(make('chain', next, 0, 0, quiet ? 0.45 : 0.88, quiet ? 0 : industrial));
    break;
  }
  if (h(20) < 0.42) edges.push(make('exit', null, site.side * (WORLD_HALF - 0.4), site.s + (h(21) - 0.5) * 18, 0.7, QUIET.has(site.archetype) ? 0 : 0.45));
  if (h(22) < 0.14 && !QUIET.has(site.archetype)) {
    const other = settlement(seed, site.cell, -site.side) ?? settlement(seed, site.cell + 1, -site.side);
    if (other && !QUIET.has(other.archetype)) edges.push(make('cross', other, 0, 0, 1, 0));
  }
  return edges.filter(edge => edge.road || edge.pipe);
}

/** Network edges whose endpoints could reach forward distances [s0, s1]. */
export function edgesNear(seed: number, s0: number, s1: number): NetworkEdge[] {
  const edges: NetworkEdge[] = [];
  for (const site of settlementsNear(seed, s0 - 3 * SETTLEMENT_CELL - 10, s1 + 10)) {
    for (const edge of edgesOf(seed, site)) {
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
  /** Height at half-cell lattice point (c2, r2), computed lazily: catches canyons narrower than a cell. */
  half(c2: number, r2: number): number;
}
/** Coarse grid over the edge's span with ground heights and a per-cell cost (center lane, foreign pads). */
function* gridSteps(seed: number, edge: NetworkEdge, cell: number, center: number): Work<Grid> {
  const x0 = -WORLD_HALF + cell / 2 + 0.5, columns = Math.floor((WORLD_HALF * 2 - 1 - cell) / cell) + 1;
  const s0 = Math.floor((Math.min(edge.a.s, edge.b.s) - 8) / cell) * cell, rows = Math.ceil((Math.max(edge.a.s, edge.b.s) + 8 - s0) / cell) + 1;
  const heights = new Float64Array(columns * rows), extra = new Float64Array(columns * rows);
  const pads = settlementsNear(seed, s0, s0 + rows * cell).filter(site => site !== edge.a.site && site !== edge.b.site);
  for (let r = 0; r < rows; r++) {
    const s = s0 + r * cell, lane = routeCenter(seed, 1, s);
    for (let c = 0; c < columns; c++) {
      const x = x0 + c * cell, i = r * columns + c;
      heights[i] = terrainHeight(seed, x, s);
      extra[i] = (Math.abs(x - lane) < 3 ? center : 0) + (pads.some(site => padDistance(site, x, s) < 0.6) ? 4 : 0);
    }
    yield;
  }
  const halves = new Float64Array((columns * 2 - 1) * (rows * 2 - 1)).fill(NaN), halfColumns = columns * 2 - 1;
  const half = (c2: number, r2: number) => {
    const i = r2 * halfColumns + c2;
    if (Number.isNaN(halves[i])) halves[i] = terrainHeight(seed, x0 + c2 * cell / 2, s0 + r2 * cell / 2);
    return halves[i];
  };
  return { x0, s0, cell, columns, rows, heights, extra, half };
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
      if (rise > maxSlope) continue;
      // Never hop over a canyon narrower than a cell: the midpoint must also sit within the grade.
      const middle = g.half(c + nc, r + nr);
      if (Math.abs(middle - heights[node]) > maxSlope * length / 2 || Math.abs(heights[next] - middle) > maxSlope * length / 2) continue;
      const step = length * (1 + 6 * rise * rise + g.extra[next]) + (d !== heading && node !== start ? turnCost : 0);
      const nextState = next * headings + d, total = base + step;
      if (total < cost[nextState]) {
        cost[nextState] = total; from[nextState] = state;
        heap.push(nextState, total + Math.hypot(nc - gx, nr - gr) * cell);
      }
    }
  }
  // Unreachable goal: keep the best partial run (a line or track that ends in the open), if it is long enough.
  if (found < 0) found = closest;
  if (found < 0) return null;
  const path: number[] = [];
  for (let state = found; state >= 0; state = from[state]) path.push(Math.floor(state / headings));
  path.reverse();
  const unique = path.filter((node, i) => i === 0 || node !== path[i - 1]);
  return unique.length >= minimum ? unique : null;
}


/* ---------------------------------------------------------------- roads */

/** A road centreline resampled every 0.5 units: x, s, ground height, and cumulative length. */
export interface RoadPath { id: string; x: Float64Array; s: Float64Array; y: Float64Array; length: Float64Array }
export const ROAD_STEP = 0.5;
/** Steepest grade a road may take between grid cells. */
export const ROAD_MAX_SLOPE = 0.45;

const roadMemo = new Map<string, RoadPath | null>();
export function* roadPathSteps(seed: number, edge: NetworkEdge): Work<RoadPath | null> {
  const key = `${seed}:${edge.id}`;
  if (roadMemo.has(key)) return roadMemo.get(key)!;
  let result: RoadPath | null = null;
  if (edge.road) {
    const g = yield* gridSteps(seed, edge, 1, 0.5), nodes = yield* searchSteps(g, edge.a, edge.b, true, ROAD_MAX_SLOPE, 0.4, 10);
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
      const y = xs.map((x, i) => terrainHeight(seed, x, ss[i]));
      // Last guard: a road whose smoothed line still meets a hard grade is not built.
      const graded = y.every((height, i) => i === 0 || Math.abs(height - y[i - 1]) / ROAD_STEP <= ROAD_MAX_SLOPE * 1.6);
      if (graded) result = { id: edge.id, x: Float64Array.from(xs), s: Float64Array.from(ss), y: Float64Array.from(y), length: Float64Array.from(lengths) };
    }
  }
  if (roadMemo.size > 256) roadMemo.clear();
  roadMemo.set(key, result);
  return result;
}
export const roadPath = (seed: number, edge: NetworkEdge) => finish(roadPathSteps(seed, edge));

/** Ribbon cross-section: outer berm, road edge, road edge, outer berm (offsets, u, lift above ground, alpha). */
const RIBBON = [[-0.82, 0, 0.035, 0], [-0.5, 0.2, 0.055, 1], [0.5, 0.8, 0.055, 1], [0.82, 1, 0.035, 0]] as const;
export interface RoadMesh { positions: Float32Array; uvs: Float32Array; alpha: Float32Array; shade: Float32Array; indices: Uint32Array }

/** Ribbon quads for road segments starting inside a section (section-local z = −(s − startS)). */
export function* roadRibbonSteps(seed: number, roads: readonly RoadPath[], startS: number, size: number): Work<RoadMesh> {
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
          positions.push(x, terrainHeight(seed, x, s) + lift, -(s - startS));
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
export const roadRibbons = (seed: number, roads: readonly RoadPath[], startS: number, size: number) => finish(roadRibbonSteps(seed, roads, startS, size));

/* ---------------------------------------------------------------- pipelines */

type Side = 'px' | 'nx' | 'ps' | 'ns';
const sideOf = (from: [number, number], to: [number, number]): Side => to[0] > from[0] + 1e-6 ? 'px' : to[0] < from[0] - 1e-6 ? 'nx' : to[1] > from[1] ? 'ps' : 'ns';
const OPPOSITE: Record<Side, Side> = { px: 'nx', nx: 'px', ps: 'ns', ns: 'ps' };
/** Yaw turning the native elbow (edges +s and +x) onto a pair of cell sides; three.js z = −s. */
function elbowYaw(a: Side, b: Side): number {
  const has = (side: Side) => a === side || b === side;
  if (has('ps') && has('px')) return 0;
  if (has('ps') && has('nx')) return Math.PI / 2;
  if (has('ns') && has('nx')) return Math.PI;
  return Math.PI * 1.5;
}

const pipeMemo = new Map<string, IndustryPiece[]>();
/** Pipeline pieces of one edge: pitched straights on supports, level elbows at turns, valve stations. */
export function* pipePieceSteps(seed: number, edge: NetworkEdge): Work<IndustryPiece[]> {
  const key = `${seed}:${edge.id}`;
  if (pipeMemo.has(key)) return pipeMemo.get(key)!;
  const pieces: IndustryPiece[] = [];
  if (edge.pipe) {
    const g = yield* gridSteps(seed, edge, PIPE_CELL, 1.5), nodes = yield* searchSteps(g, edge.a, edge.b, false, PIPE_MAX_SLOPE, 3, 6);
    if (nodes && nodes.length > 2) {
      const cells = nodes.map(node => [g.x0 + (node % g.columns) * g.cell, g.s0 + Math.floor(node / g.columns) * g.cell] as [number, number]);
      const ground = nodes.map(node => g.heights[node]), n = cells.length, group = `pipe:${edge.id}`;
      const turn = cells.map((cell, i) => i > 0 && i < n - 1 && sideOf(cells[i - 1], cell) !== sideOf(cell, cells[i + 1]));
      // Joint heights at shared cell edges clear both cells; joints around elbows (and valves) stay level.
      const joints = Array.from({ length: n - 1 }, (_, i) => Math.max(ground[i], ground[i + 1]));
      // Constraint passes that only raise joints (clearance holds): level around elbows, bounded pitch elsewhere.
      const maxRise = PIPE_MAX_SLOPE * PIPE_CELL * 1.25;
      for (let pass = 0; pass < 12; pass++) {
        let changed = false;
        for (let i = 0; i < n; i++) if (turn[i] && joints[i - 1] !== joints[i]) { joints[i - 1] = joints[i] = Math.max(joints[i - 1], joints[i]); changed = true; }
        for (let i = 1; i < n - 1; i++) {
          if (joints[i] - joints[i - 1] > maxRise) { joints[i - 1] = joints[i] - maxRise; changed = true; }
          if (joints[i - 1] - joints[i] > maxRise) { joints[i] = joints[i - 1] - maxRise; changed = true; }
        }
        if (!changed) break;
      }
      const large = hash(seed ^ 0x919, n, cells[0][0] * 7 | 0) < 0.6, size = large ? 'l' : 's';
      cells.forEach((cell, i) => {
        const id = `${group}:${i}`, [x, s] = cell;
        const back = i > 0 ? joints[i - 1] : joints[0], front = i < n - 1 ? joints[i] : joints[n - 2];
        if (turn[i]) {
          const a = sideOf(cell, cells[i - 1]), b = sideOf(cell, cells[i + 1]);
          pieces.push({ id, node: `pipe_${size}_elbow` as SharedNode, x, s, y: back, rotation: elbowYaw(a, b), pitch: 0, scaleY: 1, group });
          return;
        }
        const heading = i < n - 1 ? sideOf(cell, cells[i + 1]) : OPPOSITE[sideOf(cell, cells[i - 1])];
        const yaw = heading === 'px' || heading === 'nx' ? Math.PI / 2 : 0;
        // The piece's local +z end points to world (sin yaw, −cos yaw) in (x, s); pitch raises that end by atan(rise / 2).
        const plusZ: Side = yaw ? 'px' : 'ns', plusZHeight = heading === plusZ ? front : back, minusZHeight = heading === plusZ ? back : front;
        const open = i === n - 1 && !(edge.b.site && Math.hypot(x - edge.b.x, s - edge.b.s) < 3);
        const valve = (large && Math.abs(front - back) < 1e-6 && i > 1 && i < n - 2 && i % 7 === 3) || open;
        const y = (back + front) / 2;
        // A run that ends in the open finishes at a level valve station rather than a bare pipe end.
        pieces.push({ id, node: valve ? 'pipe_valve' : `pipe_${size}_straight` as SharedNode, x, s, y: open ? back : y, rotation: yaw,
          pitch: valve ? 0 : -Math.atan((plusZHeight - minusZHeight) / PIPE_CELL), scaleY: 1, group });
        if (!valve) {
          // Supports stand on the ground and stretch so the beam meets the pipe above them.
          pieces.push({ id: `${id}:support`, node: 'pipe_support', x, s, y: ground[i], rotation: yaw, pitch: 0,
            scaleY: Math.max(0.5, (y + PIPE_AXIS - SUPPORT_BEAM - ground[i]) / (PIPE_AXIS - SUPPORT_BEAM)), group });
        }
      });
    }
  }
  if (pipeMemo.size > 256) pipeMemo.clear();
  pipeMemo.set(key, pieces);
  return pieces;
}
export const pipePieces = (seed: number, edge: NetworkEdge) => finish(pipePieceSteps(seed, edge));

/** Every network piece of a section (anchor s inside it), plus the roads that touch it. */
export function* sectionNetworkSteps(seed: number, startS: number, size: number): Work<{ pieces: IndustryPiece[]; roads: RoadPath[] }> {
  const pieces: IndustryPiece[] = [], roads: RoadPath[] = [];
  for (const edge of edgesNear(seed, startS, startS + size)) {
    for (const piece of yield* pipePieceSteps(seed, edge)) {
      const bounds = SHARED_BOUNDS[piece.node];
      if (piece.s < startS || piece.s >= startS + size || Math.abs(piece.x) + Math.max(bounds.halfX, bounds.halfZ) > WORLD_HALF) continue;
      if (piece.y + bounds.height * piece.scaleY > SCENERY_MAX_HEIGHT) continue;
      pieces.push(piece);
    }
    const road = yield* roadPathSteps(seed, edge);
    if (road && road.s.some(s => s >= startS - 1 && s < startS + size + 1)) roads.push(road);
    yield;
  }
  return { pieces, roads };
}
export const sectionNetwork = (seed: number, startS: number, size: number) => finish(sectionNetworkSteps(seed, startS, size));
