import { SCENERY_MAX_HEIGHT, WORLD_HALF, clamp, hash, landform, moodParams, smoothRange } from './terrain-layout';
import { nearArena, type TerrainArena } from './terrain-arena';

/**
 * Settlement nodes (docs/13 §2 "Settlement network"): seeded outposts of varied archetypes, each with its
 * own composition, quarter-turn rotation, mirroring and module counts, on flattened ground. Pure data from
 * the seed; never reads combat. Positions are global, so every section sees the same settlements.
 */
export type Archetype = 'refinery' | 'mining' | 'landing' | 'comm' | 'pumping' | 'wreck' | 'abandoned';
export const ARCHETYPES: readonly Archetype[] = ['refinery', 'mining', 'landing', 'comm', 'pumping', 'wreck', 'abandoned'];
const WEIGHTS: Readonly<Record<Archetype, number>> = { refinery: 0.16, mining: 0.19, landing: 0.14, comm: 0.14, pumping: 0.14, wreck: 0.12, abandoned: 0.11 };
/** Local half extents (lateral u, forward v) of each archetype's flattened pad. */
const EXTENT: Readonly<Record<Archetype, [number, number]>> = {
  refinery: [3.7, 4.7], mining: [3.6, 3.6], landing: [3.9, 4.3], comm: [3.1, 3.1], pumping: [2.5, 2.9], wreck: [2.7, 2.3], abandoned: [3.1, 3.1],
};
/** Authored real-size heights of the pieces settlements use (docs/13 §3b, docs/14). */
export const MODULE_HEIGHT: Readonly<Record<string, number>> = {
  infra_landing_pad: 0.3, infra_refinery: 1.6, infra_relay: 1.6, infra_cargo_0: 0.65, infra_cargo_1: 0.65, infra_cargo_2: 0.65,
  infra_track_segment: 0.05, infra_drill_rig: 1.96, infra_habitat_0: 0.78, infra_habitat_1: 0.78, infra_comm_dish: 1.25,
  infra_solar_array: 0.45, infra_light_mast: 1.5, infra_silo: 1.75, wreck_0: 0.39, wreck_1: 0.54,
  tank_vertical_0: 1.45, tank_vertical_1: 1.45, tank_sphere: 1.5, tank_horizontal: 0.9, container_0: 0.55, container_1: 0.6,
  pipe_valve: 0.8, pipe_l_tee: 0.57, pipe_support: 0.62,
};
/** Settlement cells along s, one candidate per side per cell. */
export const SETTLEMENT_CELL = 30;

export type ModuleKind = 'infra' | 'shared' | 'kit';
/** A module in world space; kit modules name a kit kind (rock, boulder, crystal…) instead of a node. */
export interface PlacedModule {
  id: string; kind: ModuleKind; node: string; x: number; s: number; yaw: number;
  /** Kit modules only: uniform scale and variant pick. */
  scale: number; pick: number;
}
export interface Settlement {
  id: string; cell: number; side: number; archetype: Archetype;
  x: number; s: number; turns: number; mirror: number;
  /** Pad level (snapped) and world-space half extents after rotation. */
  level: number; hx: number; hs: number;
  /** 0 = natural ground (wrecks), 1 = fully flattened pad. */
  flatten: number;
  modules: PlacedModule[];
}

interface LocalModule { kind: ModuleKind; node: string; u: number; v: number; yaw: number; scale?: number }

/** Each archetype's seeded composition in its local frame (u lateral, v forward). */
function compose(archetype: Archetype, h: (k: number) => number): LocalModule[] {
  const m: LocalModule[] = [], count = (k: number, low: number, high: number) => low + Math.floor(h(k) * (high - low + 1));
  const infra = (node: string, u: number, v: number, yaw = 0) => m.push({ kind: 'infra', node, u, v, yaw });
  const shared = (node: string, u: number, v: number, yaw = 0) => m.push({ kind: 'shared', node, u, v, yaw });
  const kit = (node: string, u: number, v: number, scale: number) => m.push({ kind: 'kit', node, u, v, yaw: h(90 + m.length) * Math.PI * 2, scale });
  const cargo = (k: number) => `infra_cargo_${Math.floor(h(k) * 3)}`;
  switch (archetype) {
    case 'refinery': {
      infra('infra_refinery', 0.9, 0.9);
      const tanks = count(1, 2, 4);
      for (let i = 0; i < tanks; i++) shared(['tank_vertical_0', 'tank_vertical_1', 'tank_sphere', 'tank_vertical_0'][i], -2.4 + (i % 2) * 1.35, -3.4 + Math.floor(i / 2) * 1.4);
      shared('pipe_valve', -2.6, 1.6); shared('tank_horizontal', 1.2, -3.2, Math.PI / 2);
      for (let i = 0; i < count(2, 1, 2); i++) shared(`container_${i}`, 2.9, -1.4 + i * 0.9, Math.PI / 2);
      infra('infra_light_mast', -3.3, 4.2); if (h(3) < 0.6) infra('infra_light_mast', 3.3, -4.2);
      break;
    }
    case 'mining': {
      const rigs = count(1, 1, 3);
      for (let i = 0; i < rigs; i++) infra('infra_drill_rig', -2 + i * 1.9, 1.6 + (i % 2) * 0.4, h(10 + i) * Math.PI * 2);
      for (let i = 0; i < count(2, 1, 2); i++) infra(`infra_habitat_${i}`, -1.8 + i * 1.9, -2.1, i ? Math.PI : 0);
      for (let i = 0; i < count(3, 1, 2); i++) infra(cargo(20 + i), 2.6, -1.6 + i * 2, 0);
      infra('infra_light_mast', -3.1, -3.1); infra('infra_light_mast', 3.1, 3.1);
      if (h(4) < 0.5) infra('infra_silo', 2.7, 2.6);
      // Spoil heaps: rubble piles beside the rigs.
      for (let i = 0; i < count(5, 4, 8); i++) kit(h(40 + i) < 0.3 ? 'boulder' : 'rock', -3 + h(50 + i) * 1.8, -0.6 + h(60 + i) * 1.6, 0.4 + h(70 + i) * 0.45);
      break;
    }
    case 'landing': {
      infra('infra_landing_pad', -0.6, 0);
      infra('infra_relay', 3.2, -2.6);
      for (let i = 0; i < count(1, 2, 4); i++) shared(`container_${i % 2}`, 3.1, -0.9 + i * 0.85, Math.PI / 2);
      for (let i = 0; i < count(2, 1, 2); i++) infra(cargo(30 + i), 3, 2.9 - i * 0.2 + i * 0, i * 0.2);
      infra('infra_light_mast', -3.6, 3.6); infra('infra_light_mast', -3.6, -3.6);
      break;
    }
    case 'comm': {
      infra('infra_comm_dish', -1.2, 1); if (h(1) < 0.5) infra('infra_comm_dish', 1.4, 1.4, Math.PI / 3);
      infra('infra_relay', 2, -1.8);
      const panels = count(2, 2, 4);
      // Solar arrays tile seamlessly every 2.2 along their local x: lay them in rows.
      for (let i = 0; i < panels; i++) infra('infra_solar_array', -1.1 + (i % 2) * 2.2, -1.4 - Math.floor(i / 2) * 1.0);
      if (h(3) < 0.5) infra('infra_habitat_1', -2, 2.6, Math.PI / 2);
      infra('infra_light_mast', 2.6, 2.6);
      break;
    }
    case 'pumping': {
      shared('pipe_valve', 0, 0);
      for (let i = 0; i < count(1, 1, 2); i++) shared('tank_vertical_1', 1.5, -1.4 + i * 2.8);
      shared('pipe_l_tee', 0, 2, 0);
      if (h(2) < 0.6) shared('container_1', -1.6, -1.9);
      infra('infra_light_mast', -1.9, 1.9);
      break;
    }
    case 'wreck': {
      const hulls = count(1, 1, 2);
      for (let i = 0; i < hulls; i++) infra(`wreck_${i}`, -0.6 + i * 1.6, -0.5 + i * 1.3, h(5 + i) * Math.PI * 2);
      for (let i = 0; i < count(2, 2, 4); i++) kit('crystal', -2 + h(80 + i) * 4, -1.8 + h(85 + i) * 3.6, 0.45 + h(88 + i) * 0.4);
      for (let i = 0; i < count(3, 3, 6); i++) kit(h(95 + i) < 0.25 ? 'fallen' : 'rock', -2.2 + h(100 + i) * 4.4, -1.8 + h(110 + i) * 3.6, 0.35 + h(120 + i) * 0.4);
      break;
    }
    default: {
      for (let i = 0; i < count(1, 1, 2); i++) infra(`infra_habitat_${i}`, -1.4 + i * 2.2, 0.8, h(6 + i) * 0.6);
      if (h(2) < 0.6) infra('infra_silo', 2.1, -1.8);
      else infra('infra_solar_array', 1.2, -2, 0.3);
      for (let i = 0; i < count(3, 1, 3); i++) shared(`container_${i % 2}`, -2.4 + h(130 + i) * 1.2, -2.2 + i * 0.9, h(135 + i) * Math.PI);
      for (let i = 0; i < count(4, 2, 4); i++) kit('crystal', -2.6 + h(140 + i) * 5.2, -2.6 + h(150 + i) * 5.2, 0.4 + h(160 + i) * 0.35);
      for (let i = 0; i < count(5, 3, 5); i++) kit('rock', -2.6 + h(170 + i) * 5.2, -2.6 + h(180 + i) * 5.2, 0.3 + h(190 + i) * 0.35);
    }
  }
  return m;
}

const memo = new Map<string, Settlement | null>();
/** The settlement candidate of one cell and side, or null. Memoized; the cache never changes values. */
export function settlement(seed: number, cell: number, side: number): Settlement | null {
  const key = `${seed}:${cell}:${side}`;
  if (memo.has(key)) return memo.get(key)!;
  const h = (k: number) => hash(seed ^ 0x5e77 ^ (side > 0 ? 0x1000 : 0), cell * 211 + k, 3);
  let result: Settlement | null = null;
  if (h(0) < 0.78) {
    // Prefer the calmest of a few candidate spots: outposts settle on flat ground at any terrain level.
    let x = 0, s = 0, best = Infinity;
    for (let k = 0; k < 5; k++) {
      // Candidates span the outer part of each side (about 0.38–0.85 of the half width), clear of the centre lane.
      const cx = side * WORLD_HALF * (0.38 + h(1 + k) * 0.47), cs = cell * SETTLEMENT_CELL + 8 + h(10 + k) * 14;
      const mood = moodParams(seed, cs), heights = [[0, 0], [2.6, 0], [-2.6, 0], [0, 3], [0, -3]].map(([dx, ds]) => landform(seed, cx + dx, cs + ds, mood).height);
      const relief = Math.max(...heights) - Math.min(...heights);
      if (relief < best) { best = relief; x = cx; s = cs; }
    }
    // Weighted archetype, never the same as the previous cell on this side.
    const pickArchetype = (c: number) => {
      let roll = hash(seed ^ 0x5e78 ^ (side > 0 ? 0x1000 : 0), c, 4);
      for (const archetype of ARCHETYPES) { roll -= WEIGHTS[archetype]; if (roll <= 0) return archetype; }
      return ARCHETYPES[ARCHETYPES.length - 1];
    };
    let archetype = pickArchetype(cell);
    if (archetype === pickArchetype(cell - 1)) archetype = ARCHETYPES[(ARCHETYPES.indexOf(archetype) + 1 + Math.floor(h(20) * 5)) % ARCHETYPES.length];
    const turns = Math.floor(h(21) * 4), mirror = h(22) < 0.5 ? -1 : 1, [hu, hv] = EXTENT[archetype];
    const [hx, hs] = turns % 2 ? [hv, hu] : [hu, hv];
    const local = compose(archetype, k => h(30 + k));
    const tallest = Math.max(...local.filter(module => module.kind !== 'kit').map(module => MODULE_HEIGHT[module.node] ?? 1));
    const raw = landform(seed, x, s, moodParams(seed, s)).height;
    const level = clamp(Math.round(raw / 0.25) * 0.25, -6, SCENERY_MAX_HEIGHT - tallest - 0.05);
    x = Math.sign(x) * Math.min(Math.abs(x), WORLD_HALF - hx - 0.3);
    const cos = [1, 0, -1, 0][turns], sin = [0, 1, 0, -1][turns];
    const modules = local.map((module, i): PlacedModule => {
      const u = module.u * mirror, v = module.v;
      return {
        id: `settlement:${cell}:${side}:${i}`, kind: module.kind, node: module.node,
        x: x + u * cos - v * sin, s: s + u * sin + v * cos,
        // A quarter turn in (x, s) is a +90° three.js yaw (+x → +s); mirroring reflects about the forward axis.
        yaw: (mirror < 0 ? -module.yaw : module.yaw) + turns * Math.PI / 2, scale: module.scale ?? 1, pick: h(200 + i),
      };
    });
    result = { id: `settlement:${cell}:${side}`, cell, side, archetype, x, s, turns, mirror, level, hx, hs, flatten: archetype === 'wreck' ? 0 : 1, modules };
  }
  if (memo.size > 2048) memo.clear();
  memo.set(key, result);
  return result;
}

/** Rounded-rectangle distance to a settlement pad (negative inside). */
export function padDistance(site: Settlement, x: number, s: number): number {
  const corner = 1.4, qx = Math.abs(x - site.x) - (site.hx - corner), qs = Math.abs(s - site.s) - (site.hs - corner);
  return Math.hypot(Math.max(qx, 0), Math.max(qs, 0)) + Math.min(Math.max(qx, qs), 0) - corner;
}
/** How strongly a pad flattens ground at a point (0 outside, 1 on the pad). */
export const padInfluence = (site: Settlement, x: number, s: number) => site.flatten * (1 - smoothRange(0, 2.4, padDistance(site, x, s)));

/** Settlements whose cells could reach forward distances [s0, s1]; none stand on a mission arena or its ramps. */
export function settlementsNear(seed: number, s0: number, s1: number, arena?: TerrainArena): Settlement[] {
  const list: Settlement[] = [];
  for (let cell = Math.floor((s0 - 30) / SETTLEMENT_CELL); cell <= Math.floor((s1 + 30) / SETTLEMENT_CELL); cell++) {
    for (const side of [-1, 1]) {
      const site = settlement(seed, cell, side);
      if (site && site.s + site.hs + 3 >= s0 && site.s - site.hs - 3 <= s1 && !nearArena(arena, site.s - site.hs - 3, site.s + site.hs + 3)) list.push(site);
    }
  }
  return list;
}
