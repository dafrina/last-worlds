import { clamp, hash, routeCenter, smoothRange, TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT } from './terrain-layout';
import { ARENA_RAMP, type TerrainArena } from './terrain-arena';
import { SETTLEMENT_CELL, padDistance, type Archetype, type PlacedModule, type Settlement } from './terrain-settlements';
import { MODULES } from './settlement-modules';
import { finish, type Work } from './terrain-work';
import type { DistrictPolicy, LotSpec, Placement, PipeCell, Quarter, Way } from './settlement-grammars';
import type { IndustryPiece, SharedNode } from './terrain-network';
import type { PlanetProfile } from './terrain-planet';

/**
 * Districts (docs/23 §4): rare, authored multi-lot settlements planned from the seed and the planet alone, in
 * fixed slots along the route. A plan never reads sections, load order, arenas or routes, so every section sees
 * the same district; arenas only hide it at query time. Each lot is an ordinary Settlement pad with its own level
 * (terraced, not one flattened hill), so pads, scatter, network costs and seating all work through the existing
 * outpost paths. Hash salts 0xd1a0–0xd1af are reserved for districts.
 */
export interface DistrictPlan {
  /** Stable id (`district:<planet>:<slot>`), used for piece and road ids. */
  id: string; slot: number; policy: string; graph: string;
  side: -1 | 1; dir: -1 | 1;
  /** World extent of every pad. */
  minX: number; maxX: number; minS: number; maxS: number;
  /** Lots in graph order; lots[0] is the hub (network gates). */
  lots: Settlement[];
  /** The hub's settlement cell, and the forward range whose same-flank cells hold no ordinary outpost. */
  anchorCell: number; claimFrom: number; claimTo: number;
  /** Internal pipework (pieces with base pivots, like network pieces). */
  pieces: IndustryPiece[];
  /** Road points in world space: the hub's gates, its yard, and the internal spine through every lot. */
  gates: readonly { id: string; x: number; s: number }[];
  hubYard: readonly [number, number];
  spine: readonly (readonly [number, number])[];
  /** Pad rectangles battery compounds and emplacements keep out of (render-only reservation). */
  sites: readonly DistrictSite[];
}
export interface DistrictSite { id: string; minX: number; maxX: number; minS: number; maxS: number }
/** The district a lot belongs to (on its Settlement). */
export interface DistrictTag { id: string; role: 'hub' | 'lot'; minS: number; maxS: number; policy: DistrictPolicy }
type Planet = Pick<PlanetProfile, 'id' | 'landform' | 'params' | 'local'> & { districts?: DistrictPolicy | null };

/** Pads extend this far beyond a lot's layout extents (rounded pad corners keep clear of the pieces). */
export const PAD_MARGIN = 0.4;
/** Steepest road grade between half-unit samples across a lot gap (the network's final road guard). */
const LINK_GRADE = 0.72;
/** Raw-ground lattice across each flank: integer |x| from LATTICE_U0 to LATTICE_U1. */
const LATTICE_U0 = 3, LATTICE_U1 = 15;

const plans = new Map<string, DistrictPlan | null>();
/** Test hook: forgets every plan (plans are pure, so this never changes results). */
export function resetDistrictPlans() { plans.clear(); }

/** Slots whose window, claims or quiet buffer could reach forward distances [s0, s1]. */
export function slotRange(policy: DistrictPolicy, s0: number, s1: number): [number, number] {
  const reach = policy.quiet + SETTLEMENT_CELL;
  return [Math.max(0, Math.ceil((s0 - reach - policy.first - policy.length) / policy.period)), Math.floor((s1 + reach - policy.first) / policy.period)];
}
const planKey = (planet: Planet, policy: DistrictPolicy, seed: number, slot: number) => `${planet.id}:${policy.id}:${seed}:${slot}`;
/** A slot's plan if it is already known (no work). */
export function knownPlan(seed: number, planet: Planet, slot: number): DistrictPlan | null | undefined {
  return planet.districts ? plans.get(planKey(planet, planet.districts, seed, slot)) : null;
}
/** A slot's plan, computed synchronously when it was not warmed (identical either way). */
export function districtPlan(seed: number, planet: Planet, slot: number): DistrictPlan | null {
  const known = knownPlan(seed, planet, slot);
  return known !== undefined ? known : finish(districtPlanSteps(seed, planet, slot));
}
/** Plans whose pads reach forward distances [s0, s1]. */
export function districtsNear(seed: number, planet: Planet, s0: number, s1: number): DistrictPlan[] {
  const policy = planet.districts;
  if (!policy) return [];
  const out: DistrictPlan[] = [], [k0, k1] = slotRange(policy, s0, s1);
  for (let k = k0; k <= k1; k++) {
    const plan = districtPlan(seed, planet, k);
    if (plan && plan.maxS >= s0 && plan.minS <= s1) out.push(plan);
  }
  return out;
}
/** Whether an arena hides a district: it keeps clear of a boss approach and of the departure and planet jump after it. */
export function districtHidden(extent: { minS: number; maxS: number }, policy: DistrictPolicy, arena: TerrainArena | undefined): boolean {
  return !!arena && extent.maxS > arena.fromS - ARENA_RAMP - policy.arenaBefore && extent.minS < arena.toS + ARENA_RAMP + policy.arenaAfter;
}

/**
 * The planet's outpost for a cell and flank, with districts applied: a district's anchor cell returns its hub
 * lot, the cells it claims (its extent plus the quiet buffer) return nothing, all others the original outpost.
 */
export function districtSettlement(planet: Planet, original: (seed: number, cell: number, side: number) => Settlement | null,
  seed: number, cell: number, side: number): Settlement | null {
  const policy = planet.districts;
  if (!policy) return original(seed, cell, side);
  const from = cell * SETTLEMENT_CELL, to = from + SETTLEMENT_CELL, [k0, k1] = slotRange(policy, from, to);
  for (let k = k0; k <= k1; k++) {
    const plan = districtPlan(seed, planet, k);
    if (plan && plan.side === side && from < plan.claimTo && to > plan.claimFrom) return cell === plan.anchorCell ? plan.lots[0] : null;
  }
  return original(seed, cell, side);
}
/** Non-hub lots of the districts reaching [s0, s1] (the hub comes through its anchor cell), unless an arena hides them. */
export function districtLotsNear(seed: number, planet: Planet, s0: number, s1: number, arena: TerrainArena | undefined): Settlement[] {
  const out: Settlement[] = [];
  for (const plan of districtsNear(seed, planet, s0 - 30, s1 + 30)) {
    if (districtHidden(plan, planet.districts!, arena)) continue;
    for (const lot of plan.lots) if (lot.district?.role === 'lot') out.push(lot);
  }
  return out;
}

/* ---------------------------------------------------------------- planning */

interface LotFit { level: number; cut: number }
const QUARTER = Math.PI / 2;

/**
 * Resumable planning of one slot: a raw-ground lattice over the window (one landform sample per unit on both
 * flanks, a row per step), then a deterministic candidate search for terraced lots that fit (cut and fill, level
 * room under the structure cap, steps between lots, a road grade across each gap, the calm centre lane), then the
 * seeded layout. Returns null when nothing fits (the slot stays quiet).
 */
export function* districtPlanSteps(seed: number, planet: Planet, slot: number): Work<DistrictPlan | null> {
  const policy = planet.districts;
  if (!policy) return null;
  const key = planKey(planet, policy, seed, slot);
  if (plans.has(key)) return plans.get(key)!;
  const graph = policy.graph, specs = graph.lots;
  if (specs.length !== 2) throw new Error(`District graph ${graph.id}: the planner handles a hub and one lot.`);
  const lo = policy.first + slot * policy.period, hi = lo + policy.length;
  const h = (k: number) => hash(seed ^ 0xd1a0, slot * 131 + k, 7);
  const width = LATTICE_U1 - LATTICE_U0 + 1, S0 = Math.floor(lo) - 3, rows = Math.ceil(hi) + 3 - S0 + 1;
  const lattice = [new Float64Array(rows * width), new Float64Array(rows * width)];
  const rowOf = (s: number) => ({ seed, s, params: planet.params(seed, s), local: planet.local(seed, s), platform: 0 });
  for (let r = 0; r < rows; r++) {
    const row = rowOf(S0 + r);
    for (let f = 0; f < 2; f++) for (let i = 0; i < width; i++) lattice[f][r * width + i] = planet.landform(seed, (f ? 1 : -1) * (LATTICE_U0 + i), S0 + r, row).height;
    yield;
  }
  const raw = (x: number, s: number) => planet.landform(seed, x, s, rowOf(s)).height;
  const pad = (spec: LotSpec) => [spec.half[0] + PAD_MARGIN, spec.half[1] + PAD_MARGIN] as const;
  const levelMax = (spec: LotSpec) => policy.structureMax - spec.tallest - 0.05;
  /** Cut and fill under a pad (and half a unit around it) at the level that minimizes it. */
  const fit = (flank: number, u: number, s: number, spec: LotSpec): LotFit => {
    const [hx, hs] = pad(spec);
    let min = Infinity, max = -Infinity;
    for (let i = Math.ceil(u - hx - 0.5); i <= Math.floor(u + hx + 0.5); i++) for (let r = Math.ceil(s - hs - 0.5); r <= Math.floor(s + hs + 0.5); r++) {
      const v = lattice[flank][(r - S0) * width + (i - LATTICE_U0)];
      if (v < min) min = v; if (v > max) max = v;
    }
    const level = clamp(Math.round((min + max) / 2 / 0.25) * 0.25, -6, levelMax(spec));
    return { level, cut: Math.max(max - level, level - min) };
  };
  /** A pad's inner edge keeps clear of the calm centre route along its whole length. */
  const laneClear = (side: number, u: number, s: number, spec: LotSpec) => {
    const [hx, hs] = pad(spec);
    for (let t = s - hs; t <= s + hs + 1e-9; t += 2) if (Math.abs(side * (u - hx) - routeCenter(seed, 1, t)) < policy.lane) return false;
    return true;
  };
  // Lot centres along the district: lot 0 (hub) first, each next one `gap` beyond the previous pad.
  const offsets = (gaps: readonly number[]) => {
    const out = [0];
    for (let i = 1; i < specs.length; i++) out.push(out[i - 1] + pad(specs[i - 1])[1] + gaps[i - 1] + pad(specs[i])[1]);
    return out;
  };
  // The second lot's centre is searched (preferred band first, centre-out), with every flank, direction, lateral
  // position and gap in seeded order; the first fit wins.
  const band0 = lo + policy.prefer[0], band1 = lo + policy.prefer[1], mid = (band0 + band1) / 2;
  const centres: number[] = [];
  for (let s = Math.ceil(lo); s <= hi; s += 2) centres.push(s);
  centres.sort((a, b) => Number(!(a >= band0 && a <= band1)) - Number(!(b >= band0 && b <= band1)) || Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  const sides: (-1 | 1)[] = h(1) < 0.5 ? [-1, 1] : [1, -1], dirs: (-1 | 1)[] = h(2) < 0.5 ? [1, -1] : [-1, 1];
  const gapSets = graph.gaps.map(g => [g]);
  let found: { side: -1 | 1; dir: -1 | 1; u: number[]; s: number[]; fits: LotFit[] } | null = null, tried = 0;
  search: for (const centre of centres) for (const side of sides) for (const dir of dirs) {
    if (++tried % 16 === 0) yield;
    const flank = side > 0 ? 1 : 0, anchor = specs[1];
    for (const u1 of anchor.u) {
      const f1 = fit(flank, u1, centre, anchor);
      if (f1.cut > graph.maxCut || !laneClear(side, u1, centre, anchor)) continue;
      for (const gaps of gapSets) {
        const along = offsets(gaps), base = centre - dir * along[1];
        const s = along.map(v => base + dir * v);
        const minS = Math.min(...s.map((v, i) => v - pad(specs[i])[1])), maxS = Math.max(...s.map((v, i) => v + pad(specs[i])[1]));
        if (minS < lo || maxS > hi) continue;
        for (const u0 of specs[0].u) {
          const us = [u0, u1], fits = specs.map((spec, i) => i === 1 ? f1 : fit(flank, us[i], s[i], spec));
          if (fits.some(f => f.cut > graph.maxCut) || fits.some((f, i) => i > 0 && Math.abs(f.level - fits[i - 1].level) > graph.maxStep)) continue;
          if (!specs.every((spec, i) => i === 1 || laneClear(side, us[i], s[i], spec))) continue;
          if (!linksGraded(side, dir, us, s, fits)) continue;
          found = { side, dir, u: us, s, fits };
          break search;
        }
      }
    }
  }
  function linksGraded(side: number, dir: number, us: number[], s: number[], fits: LotFit[]): boolean {
    // Emulates the final ground across each gap (raw landform under the strongest pad influence, as rowPoint does).
    const lots = specs.map((spec, i) => ({ x: side * us[i], s: s[i], hx: pad(spec)[0], hs: pad(spec)[1], level: fits[i].level }));
    const ground = (x: number, t: number) => {
      let best = 0, height = raw(x, t);
      const form = height;
      for (const lot of lots) {
        const w = 1 - smoothRange(0, 2.4, padDistance({ x: lot.x, s: lot.s, hx: lot.hx, hs: lot.hs } as Settlement, x, t));
        if (w > best) { best = w; height = form + (lot.level - form) * w; }
      }
      return clamp(height, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
    };
    for (let i = 1; i < specs.length; i++) {
      const [ax, as] = local(side, dir, us[i - 1], s[i - 1], specs[i - 1].spine), [bx, bs] = local(side, dir, us[i], s[i], specs[i].spine);
      const span = Math.hypot(bx - ax, bs - as), steps = Math.max(1, Math.ceil(span / 0.5));
      let previous = ground(ax, as);
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, next = ground(ax + (bx - ax) * t, as + (bs - as) * t);
        if (Math.abs(next - previous) / (span / steps) > LINK_GRADE) return false;
        previous = next;
      }
    }
    return true;
  }
  // Interleaved work may have planned this slot meanwhile: keep that object (sites are compared by identity).
  if (plans.has(key)) return plans.get(key)!;
  const plan = found ? layout(seed, planet, policy, slot, found) : null;
  if (plans.size > 256) plans.clear();
  plans.set(key, plan);
  return plan;
}

/** Lot-frame (a, b) to world (x, s): a points to the world edge on the district's flank, b along its direction. */
function local(side: number, dir: number, u: number, s: number, [a, b]: readonly [number, number]): [number, number] {
  return [side * (u + a), s + dir * b];
}
/** Lot-frame quarter turns to a three.js yaw, mirrored with the flank and direction (as outposts mirror). */
function yawOf(side: number, dir: number, turn: Quarter | number): number {
  let yaw = turn * QUARTER;
  if (side < 0) yaw = -yaw;
  if (dir < 0) yaw = Math.PI - yaw;
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}
/** The yaw that points a node's local axis along a world (x, s) direction. */
function facedYaw(axis: '+x' | '-x' | '+z' | '-z', [wx, ws]: readonly [number, number]): number {
  // Local +x lies along (cos θ, sin θ) in (x, s); local +z along (sin θ, −cos θ) (three.js z = −s).
  return axis === '+x' ? Math.atan2(ws, wx) : axis === '-x' ? Math.atan2(-ws, -wx) : axis === '+z' ? Math.atan2(wx, -ws) : Math.atan2(-wx, ws);
}
/** World (x, s) offset of a node-space point (x, z) at a yaw. */
export function socketOffset(yaw: number, x: number, z: number): [number, number] {
  return [x * Math.cos(yaw) + z * Math.sin(yaw), x * Math.sin(yaw) - z * Math.cos(yaw)];
}
/** A lot-frame way as a world (x, s) unit vector. */
function way(side: number, dir: number, w: Way): [number, number] {
  return w === 'a+' ? [side, 0] : w === 'a-' ? [-side, 0] : w === 'b+' ? [0, dir] : [0, -dir];
}
const LOT_WAY: Readonly<Record<Way, readonly [number, number]>> = { 'a+': [1, 0], 'a-': [-1, 0], 'b+': [0, 1], 'b-': [0, -1] };

/** Builds the seeded layout of a found site: lots with their pieces, pipework, gates, spine and reserved sites. */
function layout(seed: number, planet: Planet, policy: DistrictPolicy, slot: number,
  found: { side: -1 | 1; dir: -1 | 1; u: number[]; s: number[]; fits: LotFit[] }): DistrictPlan {
  const { side, dir } = found, graph = policy.graph, id = `district:${planet.id}:${slot}`;
  const pick = (k: number) => hash(seed ^ 0xd1a2, slot * 977 + k, 3);
  const pads = graph.lots.map(spec => [spec.half[0] + PAD_MARGIN, spec.half[1] + PAD_MARGIN] as const);
  const minS = Math.min(...found.s.map((s, i) => s - pads[i][1])), maxS = Math.max(...found.s.map((s, i) => s + pads[i][1]));
  const xs = found.u.flatMap((u, i) => [side * (u - pads[i][0]), side * (u + pads[i][0])]);
  const tag = (role: 'hub' | 'lot') => ({ id, role, minS, maxS, policy });
  const pieces: IndustryPiece[] = [];
  const lots = graph.lots.map((spec, li): Settlement => {
    const u = found.u[li], s = found.s[li], level = found.fits[li].level, modules: PlacedModule[] = [], lotId = spec.id;
    const at = (p: readonly [number, number]) => local(side, dir, u, s, p);
    const rolls = new Map<string, boolean>();
    /** One seeded roll per optional piece, or per group of pieces built together. */
    const built = (p: Placement, k: number) => {
      if (p.chance === undefined) return true;
      if (!p.group) return pick(li * 400 + k) < p.chance;
      if (!rolls.has(p.group)) rolls.set(p.group, pick(li * 400 + 300 + textHash(p.group)) < p.chance);
      return rolls.get(p.group)!;
    };
    const place = (p: Placement, k: number) => {
      if (!built(p, k)) return;
      const node = typeof p.node === 'string' ? p.node : p.node[Math.floor(pick(li * 400 + 200 + k) * p.node.length)];
      const spec = MODULES[node];
      if (!spec || spec.planned) return;
      const yaw = p.face ? facedYaw(p.face.axis, way(side, dir, p.face.toward)) : yawOf(side, dir, p.turn ?? 0);
      let [x, ws] = at(p.at);
      if (p.attach) {
        // Of the candidate sockets, the one that puts the centre nearest the nominal spot; the socket lands on `to`.
        const [tx, ts] = at(p.attach.to), [nx, ns] = [x, ws];
        let best = Infinity;
        for (const socketId of p.attach.sockets) {
          const socket = spec.sockets.find(item => item.id === socketId);
          if (!socket) continue;
          const [ox, os] = socketOffset(yaw, socket.at[0], socket.at[2]), cx = tx - ox, cs = ts - os, d = Math.hypot(cx - nx, cs - ns);
          if (d < best) { best = d; x = cx; ws = cs; }
        }
      }
      modules.push({ id: `${id}:${lotId}:${modules.length}`, kind: spec.source === 'industrial-kit' ? 'shared' : 'infra', node, x, s: ws,
        yaw, scale: 1, pick: 0, ...p.lift ? { base: level + p.lift } : {}, ...p.cosmetic ? { cosmetic: true } : {} });
    };
    if (spec.landmark) {
      const node = MODULES[spec.landmark.node];
      if (node && !node.planned) place({ node: spec.landmark.node, at: spec.landmark.at, turn: spec.landmark.turn }, 0);
      else (spec.landmark.standIn ?? []).forEach((p, k) => place(p, 10 + k));
    }
    spec.pieces.forEach((p, k) => place(p, 40 + k));
    if (spec.pipes) pipework(spec, li, level, at, (p, k) => place(p, 100 + k));
    const [hx, hs] = pads[li];
    return {
      id: `${id}:${spec.id}`, cell: Math.floor(s / SETTLEMENT_CELL), side, archetype: spec.archetype as Archetype, x: side * u, s, turns: 0, mirror: 1,
      level, hx, hs, flatten: 1, modules, district: tag(spec.role), cap: policy.structureMax,
      ...spec.gates ? { gates: spec.gates.map(gate => { const [x, gs] = at(gate.at); return { x, s: gs }; }) } : {},
    };
  });
  /** Pipe cells on the lot lattice: straights and valves along an axis, tees (feeding tanks), elbows and end valves. */
  function pipework(spec: LotSpec, li: number, level: number, at: (p: readonly [number, number]) => [number, number], tank: (p: Placement, k: number) => void) {
    const size = spec.pipes!.size, straight = `pipe_${size}_straight` as SharedNode, tee = `pipe_${size}_tee` as SharedNode, elbow = `pipe_${size}_elbow` as SharedNode;
    const piece = (k: number, node: SharedNode, [x, s]: [number, number], rotation: number): IndustryPiece =>
      ({ id: `${id}:${spec.id}:pipe:${k}`, node, x, s, y: level, rotation, pitch: 0, roll: 0, scaleY: 1, scaleZ: 1, group: id });
    const support = (k: number, [x, s]: [number, number], alongS: boolean): IndustryPiece =>
      ({ ...piece(k, 'pipe_support', [x, s], alongS ? 0 : QUARTER), id: `${id}:${spec.id}:pipe:${k}:rack` });
    const axisYaw = (axis: 'a' | 'b') => axis === 'b' ? 0 : QUARTER;
    spec.pipes!.cells.forEach((cell: PipeCell, k) => {
      const centre = at(cell.at);
      if (cell.kind === 'straight' || cell.kind === 'valve') {
        pieces.push({ ...piece(k, cell.kind === 'valve' ? 'pipe_valve' : straight, centre, axisYaw(cell.axis)), scaleZ: cell.kind === 'straight' ? (cell.length ?? 2) / 2 : 1 });
        if (cell.kind === 'straight') pieces.push(support(k, centre, cell.axis === 'b'));
      } else if (cell.kind === 'cap') {
        pieces.push(piece(k, 'pipe_valve', centre, cell.open[0] === 'b' ? 0 : QUARTER));
      } else if (cell.kind === 'tee') {
        // A tee whose tank is not built is a plain straight on the run.
        const reach = cell.tank ? tankReach(cell.tank, li, k) : null;
        if (cell.tank && !reach) {
          pieces.push(piece(k, straight, centre, axisYaw(cell.axis)), support(k, centre, cell.axis === 'b'));
          return;
        }
        const [wx, ws] = way(side, dir, cell.branch);
        pieces.push(piece(k, tee, centre, Math.atan2(ws, wx)));
        const [ax, as] = cell.axis === 'b' ? way(side, dir, 'b-') : way(side, dir, 'a-');
        pieces.push(support(k, [centre[0] + ax * 0.55, centre[1] + as * 0.55], cell.axis === 'b'));
        if (reach) {
          const [la, lb] = LOT_WAY[cell.branch];
          tank({ node: reach.node, at: [cell.at[0] + la * (1 + reach.r), cell.at[1] + lb * (1 + reach.r)] }, k);
        }
      } else if (cell.kind === 'elbow') {
        const [w1, w2] = cell.arms.map((w: Way) => way(side, dir, w));
        pieces.push(piece(k, elbow, centre, elbowYaw(w1, w2)));
        pieces.push(support(k, [centre[0] + w1[0] * 0.55, centre[1] + w1[1] * 0.55], w1[1] !== 0));
      }
    });
    function tankReach(spec: NonNullable<Extract<PipeCell, { kind: 'tee' }>['tank']>, lotIndex: number, k: number) {
      if (spec.chance !== undefined && pick(lotIndex * 400 + 500 + k) >= spec.chance) return null;
      const node = spec.nodes[Math.floor(pick(lotIndex * 400 + 600 + k) * spec.nodes.length)];
      const east = MODULES[node]?.sockets.find(socket => socket.id === 'e');
      return east ? { node, r: east.at[0] } : null;
    }
  }
  const hub = graph.lots[0], hubAt = (p: readonly [number, number]) => local(side, dir, found.u[0], found.s[0], p);
  const spine: [number, number][] = [hubAt(hub.yard), hubAt(hub.spine)];
  for (let i = 1; i < graph.lots.length; i++) {
    const spec = graph.lots[i], lotAt = (p: readonly [number, number]) => local(side, dir, found.u[i], found.s[i], p);
    spine.push(lotAt(spec.spine), lotAt(spec.yard));
  }
  const anchorCell = Math.floor(found.s[0] / SETTLEMENT_CELL);
  return {
    id, slot, policy: policy.id, graph: graph.id, side, dir,
    minX: Math.min(...xs), maxX: Math.max(...xs), minS, maxS, lots, anchorCell,
    claimFrom: minS - policy.quiet, claimTo: maxS + policy.quiet,
    pieces, gates: (hub.gates ?? []).map(gate => { const [x, s] = hubAt(gate.at); return { id: gate.id, x, s }; }),
    hubYard: hubAt(hub.yard), spine,
    sites: lots.map(lot => ({ id: lot.id, minX: lot.x - lot.hx - 0.5, maxX: lot.x + lot.hx + 0.5, minS: lot.s - lot.hs - 0.5, maxS: lot.s + lot.hs + 0.5 })),
  };
}
/** Yaw of the shared-kit elbow (native arms toward −z and +x) whose arms point along world (x, s) vectors w1 and w2. */
function elbowYaw(w1: readonly [number, number], w2: readonly [number, number]): number {
  for (const yaw of [0, QUARTER, Math.PI, -QUARTER]) {
    const a: [number, number] = [Math.round(-Math.sin(yaw)), Math.round(Math.cos(yaw))], b: [number, number] = [Math.round(Math.cos(yaw)), Math.round(Math.sin(yaw))];
    const same = (p: readonly number[], q: readonly number[]) => p[0] === q[0] && p[1] === q[1];
    if ((same(a, w1) && same(b, w2)) || (same(a, w2) && same(b, w1))) return yaw;
  }
  throw new Error('Elbow arms must be perpendicular axis directions.');
}
/** A small stable hash of a group name (seeded rolls per group). */
function textHash(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) n = (n * 31 + text.charCodeAt(i)) % 997;
  return n;
}
