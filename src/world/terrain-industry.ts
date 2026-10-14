import { DISTRICT_SPACING, WORLD_HALF, district, hash, rowPoint, terrainRow } from './terrain-layout';

/**
 * Shared industrial kit placement (docs/14 §4): seeded pipelines on a 2-unit grid — tiled straights,
 * 90° elbows, tees into small tank farms, inline valves and a support under every straight — laid at
 * one run level along flat ground (contour-following, so they never climb through cliffs), clear of
 * the center combat lane. Tank farms cluster at outposts. Pure scenery from the terrain seed only.
 */
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

/** One placed piece: base center (pivot on the ground plane), yaw in 90° steps for pipes, vertical scale. */
export interface IndustryPiece { id: string; node: SharedNode; x: number; s: number; y: number; rotation: number; scaleY: number; group: string }

/** Grid directions in world terms: +x, −x, +s (forward), −s. */
type Side = 'px' | 'nx' | 'ps' | 'ns';
const STEP: Record<Side, [number, number]> = { px: [1, 0], nx: [-1, 0], ps: [0, 1], ns: [0, -1] };
const OPPOSITE: Record<Side, Side> = { px: 'nx', nx: 'px', ps: 'ns', ns: 'ps' };
/** Yaw that turns the native elbow (edges +s and +x) onto a pair of cell sides. three.js z = −s. */
function elbowYaw(a: Side, b: Side): number {
  const has = (side: Side) => a === side || b === side;
  if (has('ps') && has('px')) return 0;
  if (has('ps') && has('nx')) return Math.PI / 2;
  if (has('ns') && has('nx')) return Math.PI;
  return Math.PI * 1.5;
}
const straightYaw = (side: Side) => (side === 'px' || side === 'nx' ? Math.PI / 2 : 0);

interface Path { cells: [number, number][]; level: number }
const groundAt = (seed: number, x: number, s: number) => rowPoint(terrainRow(seed, s), x).height;

/**
 * Walks a pipe path on a local 2-unit grid at a fixed run level: every cell's ground must sit within
 * [level − 0.22, level + 0.06] (flat ground at the run's own level, so cliffs are never crossed), the path
 * stays in its lateral band and prefers to keep heading, jogging sideways with elbows around obstacles.
 */
function walk(seed: number, salt: number, origin: [number, number], heading: Side, level: number, cells: number,
  band: [number, number], blocked: (x: number, s: number) => boolean): Path {
  const path: [number, number][] = [origin];
  const ok = (x: number, s: number) => {
    if (x < band[0] || x > band[1] || blocked(x, s)) return false;
    const ground = groundAt(seed, x, s);
    return ground <= level + 0.06 && ground >= level - 0.22;
  };
  if (!ok(origin[0], origin[1])) return { cells: [], level };
  let [x, s] = origin, direction = heading, since = 0;
  for (let i = 1; i < cells; i++) {
    const turn = hash(seed ^ salt, i, 17) < 0.5 ? (['px', 'nx'] as Side[]) : (['nx', 'px'] as Side[]);
    const options: Side[] = direction === heading
      ? (since > 2 && hash(seed ^ salt, i, 18) < 0.18 ? [turn[0], heading, turn[1]] : [heading, ...turn])
      : [heading, direction];
    let moved = false;
    for (const option of options) {
      if (option === OPPOSITE[direction]) continue;
      const [dx, ds] = STEP[option], nx = x + dx * PIPE_CELL, ns = s + ds * PIPE_CELL;
      if (path.some(([px, ps]) => px === nx && ps === ns) || !ok(nx, ns)) continue;
      since = option === direction ? since + 1 : 0;
      x = nx; s = ns; direction = option; path.push([x, s]); moved = true; break;
    }
    if (!moved) break;
  }
  return { cells: path, level };
}

const sideOf = (from: [number, number], to: [number, number]): Side =>
  to[0] > from[0] ? 'px' : to[0] < from[0] ? 'nx' : to[1] > from[1] ? 'ps' : 'ns';

/** Converts a cell path into tiled pieces: straights with supports, elbows at turns, one inline valve. */
function piecesFor(path: Path, group: string, large: boolean, start: Side | null, seed: number): IndustryPiece[] {
  const out: IndustryPiece[] = [], { cells, level } = path, size = large ? 'l' : 's';
  const valveAt = cells.length > 5 ? 2 + Math.floor(hash(seed, cells.length, group.length) * (cells.length - 4)) : -1;
  cells.forEach((cell, i) => {
    const into = i > 0 ? sideOf(cell, cells[i - 1]) : start, out2 = i < cells.length - 1 ? sideOf(cell, cells[i + 1]) : null;
    const a = into ?? (out2 ? OPPOSITE[out2] : 'ns'), b = out2 ?? OPPOSITE[a];
    const id = `${group}:${i}`, [x, s] = cell;
    if (a === OPPOSITE[b]) {
      const valve = large && i === valveAt;
      out.push({ id, node: valve ? 'pipe_valve' : `pipe_${size}_straight` as SharedNode, x, s, y: level, rotation: straightYaw(a), scaleY: 1, group });
      if (!valve) {
        // A support at every straight cell's centre, posts stretched down to the ground below the run.
        out.push({ id: `${id}:support`, node: 'pipe_support', x, s, y: level, rotation: straightYaw(a), scaleY: 1, group });
      }
    } else {
      out.push({ id, node: `pipe_${size}_elbow` as SharedNode, x, s, y: level, rotation: elbowYaw(a, b), scaleY: 1, group });
    }
  });
  return out;
}

/** Tank farm and pipeline of one outpost, plus a valley pipeline between this outpost and the next. */
function districtIndustry(seed: number, cell: number): IndustryPiece[] {
  const site = district(seed, cell), side = site.side, level = groundAt(seed, site.x, site.s), id = `industry:${cell}`;
  const pieces: IndustryPiece[] = [];
  // Tank farm in the outpost's free corner beyond the refinery, on the flattened pad.
  const fx = site.x + 1.6 * side, fs = site.s + 8.4;
  const farm: [SharedNode, number, number][] = [['tank_vertical_0', 0, 0], ['tank_vertical_1', 2 * side, 0.2], ['tank_sphere', 0.8 * side, 2.2], ['container_1', 2.6 * side, 2.1]];
  farm.forEach(([node, dx, ds], i) => {
    if (Math.abs(fx + dx) + SHARED_BOUNDS[node].halfX <= WORLD_HALF - 0.2) pieces.push({ id: `${id}:farm:${i}`, node, x: fx + dx, s: fs + ds, y: level, rotation: (i % 2) * Math.PI / 2, scaleY: 1, group: `${id}:farm` });
  });
  // Feed line: a tee off the farm, then a large line down the outpost between track and cargo, continuing
  // along the same terrace level beyond the pad wherever the ground stays flat.
  const column = site.x - 3.2 * side, band: [number, number] = side > 0 ? [5, 17] : [-17, -5];
  pieces.push({ id: `${id}:corner`, node: 'pipe_l_elbow', x: column, s: fs, y: level, rotation: elbowYaw('ns', side > 0 ? 'px' : 'nx'), scaleY: 1, group: `${id}:feed` });
  // No jogs inside the outpost: the line keeps to its column between the track and the cargo haulers.
  const insidePad = (x: number, s: number) => x !== column && Math.abs(s - site.s) < 12.5;
  const feed = walk(seed, 0x51a1 ^ cell, [column, fs - PIPE_CELL], 'ns', level, 16, band, insidePad);
  pieces.push(...piecesFor(feed, `${id}:feed`, true, 'ps', seed ^ cell));
  // Branch from the corner into the farm's first tank.
  for (let k = 1; k * PIPE_CELL <= Math.abs(fx - column); k++) {
    pieces.push({ id: `${id}:branch:${k}`, node: 'pipe_l_straight', x: column + side * k * PIPE_CELL, s: fs, y: level, rotation: Math.PI / 2, scaleY: 1, group: `${id}:feed` });
  }
  // Valley pipeline halfway to the next outpost: start on the lowest flat ground found on that side.
  const vs = site.s + DISTRICT_SPACING / 2, vside = hash(seed ^ 0x5e1d, cell, 3) < 0.5 ? -1 : 1;
  let best: [number, number] | null = null, bestHeight = Infinity;
  for (let k = 0; k < 10; k++) {
    const x = vside * (6 + Math.floor(hash(seed ^ 0x5e1e, cell, k) * 5) * PIPE_CELL), s = vs + (hash(seed ^ 0x5e1f, cell, k) - 0.5) * 16;
    const h = groundAt(seed, x, s), flat = [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, ds]) => Math.abs(groundAt(seed, x + dx, s + ds) - h) < 0.15);
    // Low flat ground only, so tanks and supports stay well under the scenery cap.
    if (flat && h < bestHeight && h <= 0.8) { best = [x, s]; bestHeight = h; }
  }
  if (best) {
    const vband: [number, number] = vside > 0 ? [5, 17] : [-17, -5], vid = `${id}:valley`;
    const ahead = walk(seed, 0x5e20 ^ cell, best, 'ps', bestHeight, 12, vband, () => false);
    const behind = walk(seed, 0x5e21 ^ cell, [best[0], best[1] - PIPE_CELL], 'ns', bestHeight, 10, vband, (x, s) => ahead.cells.some(([ax, as]) => ax === x && as === s));
    const merged: Path = { cells: [...behind.cells.slice().reverse(), ...ahead.cells], level: bestHeight };
    if (merged.cells.length >= 4) {
      pieces.push(...piecesFor(merged, vid, hash(seed ^ 0x5e22, cell, 1) < 0.6, null, seed ^ (cell * 7)));
      // A small pressure tank and a container stack at the line's ends.
      const [ex, es] = merged.cells[merged.cells.length - 1], [bx, bs] = merged.cells[0];
      pieces.push({ id: `${vid}:tank`, node: 'tank_horizontal', x: ex + vside * 1.4, s: es, y: groundAt(seed, ex + vside * 1.4, es), rotation: Math.PI / 2, scaleY: 1, group: vid });
      pieces.push({ id: `${vid}:crates`, node: 'container_0', x: bx - vside * 1.2, s: bs, y: groundAt(seed, bx - vside * 1.2, bs), rotation: 0, scaleY: 1, group: vid });
    }
  }
  return pieces;
}

/** Industry pieces owned by one section (anchor s inside it), independent of generation order. */
export function sectionIndustry(seed: number, startS: number, size: number): IndustryPiece[] {
  const pieces: IndustryPiece[] = [];
  for (let cell = Math.floor((startS - 110) / DISTRICT_SPACING); cell <= Math.floor((startS + size + 40) / DISTRICT_SPACING); cell++) {
    for (const piece of districtIndustry(seed, cell)) {
      if (piece.s < startS || piece.s >= startS + size) continue;
      const bounds = SHARED_BOUNDS[piece.node], reach = Math.max(bounds.halfX, bounds.halfZ);
      if (Math.abs(piece.x) + reach > WORLD_HALF) continue;
      // Supports reach from the run down to the ground beneath; a run never floats more than 0.3 above it.
      const ground = groundAt(seed, piece.x, piece.s);
      pieces.push(piece.node === 'pipe_support' ? { ...piece, y: ground, scaleY: (piece.y - ground + 0.19) / 0.19 } : piece);
    }
  }
  return pieces;
}

/** World-space open ends of a pipe piece (cell-edge midpoints), for connectivity checks. */
export function pipeEnds(piece: IndustryPiece): [number, number][] {
  const sides: Side[] = piece.node.endsWith('elbow') ? ['ps', 'px'] : piece.node.endsWith('tee') ? ['ps', 'ns', 'px'] : ['ps', 'ns'];
  const turns = Math.round(piece.rotation / (Math.PI / 2)) % 4;
  // A yaw of +90° maps +x → +s and +s → −x (three.js z = −s).
  const rotate = (side: Side): Side => {
    let current = side;
    const next: Record<Side, Side> = { px: 'ps', ps: 'nx', nx: 'ns', ns: 'px' };
    for (let k = 0; k < turns; k++) current = next[current];
    return current;
  };
  return sides.map(side => { const [dx, ds] = STEP[rotate(side)]; return [piece.x + dx, piece.s + ds]; });
}
