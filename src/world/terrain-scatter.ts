import { finish, type Work } from './terrain-work';
import { cliffWallSteps } from './terrain-walls';
import { SCENERY_MAX_HEIGHT, WORLD_HALF, clamp, hash, mix, noise, routeCalm, smoothRange, type MoodParams } from './terrain-layout';

/** Kit pieces from public/assets/khepri/khepri-kit.glb (docs/13 §3); base-center pivots, +Y up. */
export type KhepriKitKind = 'clump' | 'column' | 'rock' | 'crystal' | 'spire' | 'wall' | 'fallen' | 'boulder' | 'crystalSpire' | 'rosette' | 'hoodoo';
/** Cracked floe sets: one parent floe split along shared jagged cracks (pieces placed from FLOE_SETS offsets). */
export type FloeSetKind = 'floePairA' | 'floePairB' | 'floeTripleC';
/** Vesper kit (public/assets/vesper/vesper-kit.glb, docs/17 §3); waterline at y = 0 for floating pieces. */
export type VesperKitKind = 'iceCliff' | 'serac' | 'iceSpire' | 'iceberg' | 'floe' | FloeSetKind | 'ridge' | 'drift' | 'outcrop' | 'vent';
/**
 * Nacre kit (public/assets/nacre/nacre-kit.glb, docs/20, art/nacre-kit/README.md): jagged rock and crags, glowing
 * flora (lotus caps, groves, glass tubes, violet goblets, lily rafts, moss tufts) and the builders' ruins.
 */
export type NacreKitKind = 'mireRock' | 'mireCrag' | 'lotus' | 'lotusGrove' | 'glassTube' | 'goblet' | 'lilyRaft' | 'mossTuft'
  | 'ruinTower' | 'ruinFort' | 'ruinRing' | 'ruinBridge' | 'ruinPillars' | 'ruinRubble';
/** Amnion's brood kit (amnion-kit.glb, docs/27, tools/blender/amnion_kit.py). */
export type AmnionKitKind = 'eggClutch' | 'boneSpire' | 'nest' | 'boneShards' | 'broodNest' | 'hive' | 'sinewWeb';
/**
 * Cliff walls (terrain version 15, docs/26 §11): 2-unit wall segments set along cliff rims, base-centre pivot, front
 * (the outward, downhill face) toward +Z, top at exactly 1 (placement scales y by the local drop). Khepri's columnar
 * basalt (public/assets/khepri/cliff-kit.glb; Luna repaints it grey) and Vesper's fractured ice-shelf walls
 * (public/assets/vesper/cliff-kit.glb).
 */
export type CliffKitKind = 'cliffWall' | 'iceWall' | 'fleshWall';
export type KitKind = KhepriKitKind | VesperKitKind | NacreKitKind | AmnionKitKind | CliffKitKind;
/** Khepri's kit (khepri-kit.glb). */
export const KIT_KINDS: readonly KhepriKitKind[] = ['clump', 'column', 'rock', 'crystal', 'spire', 'wall', 'fallen', 'boulder', 'crystalSpire', 'rosette', 'hoodoo'];
export const VESPER_KIT_KINDS: readonly VesperKitKind[] = ['iceCliff', 'serac', 'iceSpire', 'iceberg', 'floe', 'floePairA', 'floePairB', 'floeTripleC', 'ridge', 'drift', 'outcrop', 'vent'];
/** Cliff kits, one file per world: Khepri's (also drawn on Luna) and Vesper's. */
export const KHEPRI_CLIFF_KINDS: readonly CliffKitKind[] = ['cliffWall'];
export const VESPER_CLIFF_KINDS: readonly CliffKitKind[] = ['iceWall'];
export const AMNION_CLIFF_KINDS: readonly CliffKitKind[] = ['fleshWall'];
export const AMNION_KIT_KINDS: readonly AmnionKitKind[] = ['eggClutch', 'boneSpire', 'nest', 'boneShards', 'broodNest', 'hive', 'sinewWeb'];
export const NACRE_KIT_KINDS: readonly NacreKitKind[] = ['mireRock', 'mireCrag', 'lotus', 'lotusGrove', 'glassTube', 'goblet', 'lilyRaft', 'mossTuft',
  'ruinTower', 'ruinFort', 'ruinRing', 'ruinBridge', 'ruinPillars', 'ruinRubble'];
/** Data-driven kit table: node prefix, variant count, contract bounds (half extents) and node height. */
export const KIT: Readonly<Record<KitKind, {
  prefix: string; variants: number;
  /** Contract half footprint along local x and z. */
  halfX: number; halfZ: number;
  /** Contract height of the unscaled node; `exactTop` nodes reach it exactly. */
  height: number; exactTop: boolean;
  /** Conservative footprint radius at scale 1. */
  radius: number;
}>> = {
  clump: { prefix: 'basalt_clump', variants: 6, halfX: 0.8, halfZ: 0.8, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.8) },
  column: { prefix: 'basalt_column', variants: 3, halfX: 0.3, halfZ: 0.3, height: 1, exactTop: true, radius: Math.hypot(0.3, 0.3) },
  rock: { prefix: 'rock', variants: 6, halfX: 0.5, halfZ: 0.5, height: 0.7, exactTop: false, radius: Math.hypot(0.5, 0.5) },
  crystal: { prefix: 'crystal', variants: 3, halfX: 0.5, halfZ: 0.5, height: 0.8, exactTop: false, radius: Math.hypot(0.5, 0.5) },
  spire: { prefix: 'basalt_spire', variants: 3, halfX: 0.5, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(0.5, 0.5) },
  wall: { prefix: 'basalt_wall', variants: 3, halfX: 1.3, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.3, 0.6) },
  fallen: { prefix: 'basalt_fallen', variants: 2, halfX: 0.8, halfZ: 0.3, height: 0.5, exactTop: false, radius: Math.hypot(0.8, 0.3) },
  boulder: { prefix: 'boulder', variants: 2, halfX: 0.6, halfZ: 0.6, height: 0.9, exactTop: false, radius: Math.hypot(0.6, 0.6) },
  crystalSpire: { prefix: 'crystal_spire', variants: 2, halfX: 0.6, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(0.6, 0.6) },
  rosette: { prefix: 'basalt_rosette', variants: 1, halfX: 0.9, halfZ: 0.9, height: 1, exactTop: true, radius: Math.hypot(0.9, 0.9) },
  hoodoo: { prefix: 'hoodoo', variants: 2, halfX: 0.5, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(0.5, 0.5) },
  // Vesper (vesper-kit.glb, art/vesper-kit/README.md). Cliffs, seracs and spires top out at exactly 1 (scale y);
  // icebergs and floes have their waterline at y = 0; the rest are real size.
  iceCliff: { prefix: 'ice_cliff', variants: 3, halfX: 1.26, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(1.26, 0.5) },
  serac: { prefix: 'serac', variants: 3, halfX: 0.4, halfZ: 0.32, height: 1, exactTop: true, radius: Math.hypot(0.4, 0.32) },
  iceSpire: { prefix: 'ice_spire', variants: 2, halfX: 0.3, halfZ: 0.28, height: 1, exactTop: true, radius: Math.hypot(0.3, 0.28) },
  iceberg: { prefix: 'iceberg', variants: 3, halfX: 0.68, halfZ: 0.57, height: 0.78, exactTop: false, radius: Math.hypot(0.68, 0.57) },
  // Floes 0–3 are the first convex plates (1–2 ridged); 4–9 are jagged pack-ice outlines (brash, medium, large).
  // The table holds the envelope; FLOE_FOOTPRINT has each node's own size.
  floe: { prefix: 'floe', variants: 10, halfX: 1.05, halfZ: 1.05, height: 0.26, exactTop: false, radius: Math.hypot(1.05, 1.05) },
  floePairA: { prefix: 'floe_pair_a', variants: 2, halfX: 0.55, halfZ: 1.01, height: 0.1, exactTop: false, radius: Math.hypot(0.55, 1.01) },
  floePairB: { prefix: 'floe_pair_b', variants: 2, halfX: 0.48, halfZ: 0.37, height: 0.1, exactTop: false, radius: Math.hypot(0.48, 0.37) },
  floeTripleC: { prefix: 'floe_triple_c', variants: 3, halfX: 0.63, halfZ: 0.78, height: 0.1, exactTop: false, radius: Math.hypot(0.63, 0.78) },
  ridge: { prefix: 'pressure_ridge', variants: 2, halfX: 1.08, halfZ: 0.39, height: 0.36, exactTop: false, radius: Math.hypot(1.08, 0.39) },
  drift: { prefix: 'snow_drift', variants: 2, halfX: 0.86, halfZ: 0.51, height: 0.33, exactTop: false, radius: Math.hypot(0.86, 0.51) },
  outcrop: { prefix: 'rock_outcrop', variants: 3, halfX: 0.44, halfZ: 0.35, height: 0.81, exactTop: false, radius: Math.hypot(0.44, 0.35) },
  vent: { prefix: 'vent_stack', variants: 2, halfX: 0.4, halfZ: 0.35, height: 0.98, exactTop: false, radius: Math.hypot(0.4, 0.35) },
  // Cliff walls: x −1.05…1.05 (2-unit segments that overlap a little), z −0.6 (back, into the slope) … +0.35 (front
  // relief), base at y 0 and top at exactly 1.
  cliffWall: { prefix: 'cliff_wall', variants: 4, halfX: 1.05, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.05, 0.6) },
  iceWall: { prefix: 'ice_wall', variants: 4, halfX: 1.05, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.05, 0.6) },
  // Amnion (amnion-kit.glb, docs/27): egg clutches and shards at real size; spires and nests top out at exactly 1.
  eggClutch: { prefix: 'amn_eggs', variants: 3, halfX: 0.63, halfZ: 0.46, height: 0.63, exactTop: false, radius: Math.hypot(0.63, 0.46) },
  boneSpire: { prefix: 'amn_spire', variants: 3, halfX: 0.69, halfZ: 0.78, height: 1, exactTop: true, radius: Math.hypot(0.69, 0.78) },
  nest: { prefix: 'amn_nest', variants: 2, halfX: 1, halfZ: 1, height: 1, exactTop: true, radius: Math.hypot(1, 1) },
  boneShards: { prefix: 'amn_shards', variants: 3, halfX: 0.32, halfZ: 0.3, height: 0.3, exactTop: false, radius: Math.hypot(0.32, 0.3) },
  // Landmarks (Amnion's buildings), scaled up to 4–5 across and 2.5–3 high; webs hang from their anchor (y 0) across
  // x −1 … 1 (scaled to a crevasse's width), their sag scaled by the instance height.
  broodNest: { prefix: 'amn_broodnest', variants: 2, halfX: 0.86, halfZ: 0.84, height: 1, exactTop: true, radius: Math.hypot(0.86, 0.84) },
  hive: { prefix: 'amn_hive', variants: 2, halfX: 0.6, halfZ: 0.7, height: 1, exactTop: true, radius: Math.hypot(0.6, 0.7) },
  sinewWeb: { prefix: 'amn_web', variants: 3, halfX: 1.05, halfZ: 0.45, height: 1, exactTop: false, radius: 1.05 },
  // Amnion's canyon walls (docs/27): flesh lobes and sinews tucked under the plateau's own bone edge.
  fleshWall: { prefix: 'flesh_wall', variants: 4, halfX: 1.05, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.05, 0.6) },
  // Nacre (nacre-kit.glb, art/nacre-kit/README.md; code-built stand-ins in src/render/nacre-kit.ts). Pieces marked
  // exactTop top out at exactly 1 (instance height = world height); rafts float with their waterline at y = 0.
  mireRock: { prefix: 'nacre_rock', variants: 3, halfX: 0.75, halfZ: 0.75, height: 1, exactTop: true, radius: Math.hypot(0.75, 0.75) },
  mireCrag: { prefix: 'nacre_crag', variants: 3, halfX: 1.25, halfZ: 1.25, height: 1, exactTop: true, radius: Math.hypot(1.25, 1.25) },
  lotus: { prefix: 'nacre_lotus', variants: 3, halfX: 0.8, halfZ: 0.8, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.8) },
  lotusGrove: { prefix: 'nacre_grove', variants: 3, halfX: 1, halfZ: 1, height: 1, exactTop: true, radius: Math.hypot(1, 1) },
  glassTube: { prefix: 'nacre_tubes', variants: 3, halfX: 0.5, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(0.5, 0.5) },
  goblet: { prefix: 'nacre_goblet', variants: 2, halfX: 0.45, halfZ: 0.45, height: 1, exactTop: true, radius: Math.hypot(0.45, 0.45) },
  lilyRaft: { prefix: 'nacre_pads', variants: 3, halfX: 0.9, halfZ: 0.9, height: 0.1, exactTop: false, radius: Math.hypot(0.9, 0.9) },
  mossTuft: { prefix: 'nacre_moss', variants: 3, halfX: 0.7, halfZ: 0.7, height: 1, exactTop: true, radius: Math.hypot(0.7, 0.7) },
  ruinTower: { prefix: 'nacre_tower', variants: 2, halfX: 1, halfZ: 1, height: 1, exactTop: true, radius: Math.hypot(1, 1) },
  ruinFort: { prefix: 'nacre_fort', variants: 2, halfX: 1.5, halfZ: 1.5, height: 1, exactTop: true, radius: Math.hypot(1.5, 1.5) },
  ruinRing: { prefix: 'nacre_ring', variants: 2, halfX: 1.2, halfZ: 1.2, height: 0.5, exactTop: false, radius: Math.hypot(1.2, 1.2) },
  ruinBridge: { prefix: 'nacre_bridge', variants: 2, halfX: 0.45, halfZ: 1.6, height: 1, exactTop: false, radius: Math.hypot(0.45, 1.6) },
  ruinPillars: { prefix: 'nacre_pillars', variants: 2, halfX: 0.7, halfZ: 0.7, height: 1, exactTop: true, radius: Math.hypot(0.7, 0.7) },
  ruinRubble: { prefix: 'nacre_rubble', variants: 2, halfX: 0.8, halfZ: 0.8, height: 0.4, exactTop: false, radius: Math.hypot(0.8, 0.8) },
};
export const kitNodeName = (kind: KitKind, variant: number) => `${KIT[kind].prefix}_${variant}`;
/**
 * Floating ice: each node's own half footprint (local x, z) at scale 1, measured from vesper-kit.glb
 * (art/vesper-kit/README.md). Placement spacing and the live floe features use these.
 */
export const FLOE_FOOTPRINT: Readonly<Record<string, readonly [number, number]>> = {
  floe_0: [0.52, 0.425], floe_1: [0.737, 0.575], floe_2: [0.905, 0.621], floe_3: [0.394, 0.292],
  floe_4: [0.131, 0.148], floe_5: [0.173, 0.202], floe_6: [0.446, 0.451], floe_7: [0.482, 0.472], floe_8: [0.837, 0.854], floe_9: [1.042, 1.045],
  floe_pair_a_0: [0.541, 0.975], floe_pair_a_1: [0.54, 1.0], floe_pair_b_0: [0.455, 0.25], floe_pair_b_1: [0.474, 0.366],
  floe_triple_c_0: [0.535, 0.682], floe_triple_c_1: [0.628, 0.774], floe_triple_c_2: [0.544, 0.566],
  iceberg_0: [0.621, 0.444], iceberg_1: [0.669, 0.563], iceberg_2: [0.408, 0.358],
};
/**
 * Cracked sets: each piece's pivot offset (glTF local x, z) from the set origin. A piece goes at
 * origin + R(yaw)·offset with the set's yaw; offsets scaled above 1 let the pieces drift apart.
 * `reach` is the assembled set's radius at scale 1.
 */
export const FLOE_SETS: Readonly<Record<FloeSetKind, { offsets: readonly (readonly [number, number])[]; reach: number }>> = {
  floePairA: { offsets: [[0.4568, 0.0471], [-0.4637, 0.013]], reach: 1.1 },
  floePairB: { offsets: [[0.0232, 0.099], [-0.0274, -0.1167]], reach: 0.5 },
  floeTripleC: { offsets: [[-0.562, 0.332], [0.48, 0.2375], [-0.1254, -0.5959]], reach: 1.2 },
};
/** The runtime may vary footprint scale by at most ±20%. */
export const KIT_MAX_SCALE = 1.2;

/** Lateral ground strips per section; off-screen strips are culled. */
export const TERRAIN_STRIPS = 4;
export const STRIP_WIDTH = (WORLD_HALF * 2) / TERRAIN_STRIPS;
export const stripOf = (x: number) => clamp(Math.floor((x + WORLD_HALF) / STRIP_WIDTH), 0, TERRAIN_STRIPS - 1);

export interface KitInstance {
  kind: KitKind; variant: number;
  /** Base center in world coordinates; y is the pivot height. */
  x: number; s: number; y: number;
  /** Uniform footprint scale (0.8–1.2) and vertical scale applied to the node. */
  scale: number; height: number; rotation: number;
  /** Baked sun-shadow and occlusion factor at the base, for presentation tinting. */
  shade: number;
  /** Cosmetic scatter that the low graphics tier may skip; never layout or anything simulated. */
  cosmetic: boolean;
}

/** Section-backed terrain queries for scatter (bilinear on the section's grids; exact heights outside them). */
export interface ScatterField {
  height(x: number, s: number): number;
  /** |∇h|, the largest drop and rise within one unit, and the height gradient. */
  slope(x: number, s: number): number; drop(x: number, s: number): number; rise(x: number, s: number): number;
  gradientX(x: number, s: number): number; gradientS(x: number, s: number): number;
  elevation(x: number, s: number): number; industrial(x: number, s: number): number;
  veins(x: number, s: number): number; pool(x: number, s: number): number; shade(x: number, s: number): number;
  mood(s: number): MoodParams;
  /** True where pipelines or tanks stand; scatter keeps clear. */
  blocked(x: number, s: number): boolean;
  /** Closeness to an impact-crater rim (0..1), for ejecta. */
  crater(x: number, s: number): number;
  /** How far a point has settled into a mission arena's platform (the boss clearing; 0 without an arena). */
  platform(x: number, s: number): number;
  /** Planet-specific surface mask (Vesper: rock outcrops); 0 on Khepri. */
  tone(x: number, s: number): number;
}

/**
 * Deterministic kit dressing for one section, classified from the landform: rim crowns of columns,
 * clumps and wall segments; crystal spires breaking out of faces; talus, fallen columns, boulders and
 * towering stacks at cliff feet; hoodoos, rosettes and sparse rocks on open ground; crystals at pools.
 * Cells are global, so a section's pieces never depend on which sections were generated first.
 */
export function* scatterKitSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [];
  /** Set per cell on an arena's ramp: only low pieces stand there. */
  let ramp = false;
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number, shade?: number) => {
    const { kind, x, s, scale } = instance, spec = KIT[kind];
    if (s < startS || s >= startS + size) return;
    if (ramp && instance.height * spec.height > 0.6) return;
    if (Math.abs(x) + spec.radius * scale > WORLD_HALF) return;
    if (instance.y + instance.height * spec.height > SCENERY_MAX_HEIGHT) {
      // Real-size pieces are never squashed to fit the cap; stretchable ones are trimmed.
      if (kind === 'fallen' || kind === 'boulder') return;
      instance = { ...instance, height: (SCENERY_MAX_HEIGHT - instance.y) / spec.height };
    }
    if (instance.height <= 0.05) return;
    const variant = Math.min(spec.variants - 1, Math.floor(pick * spec.variants));
    const placed: KitInstance = { ...instance, variant, shade: shade ?? terrain.shade(x, s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2;
  const cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x6c1a, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), rise = terrain.rise(x, s);
    const mood = terrain.mood(s), pick = h(2);
    const gx = terrain.gradientX(x, s), gs = terrain.gradientS(x, s);
    const along = Math.hypot(gx, gs) > 0.05 ? Math.atan2(gx, -gs) : turn(h(3));
    const platform = terrain.platform(x, s);
    ramp = false;
    if (platform >= 0.5) {
      // Arena platform: a clean floor ringed at the clearing's edge by low rim columns, formations and boulders
      // (the edge of the boss clearing since 22 October; the world edges before).
      const frame = h(30), edge = platform < 0.9;
      if (edge && frame < 0.22) {
        const members = 2 + Math.floor(h(31) * 2);
        for (let m = 0; m < members; m++) {
          // Members cluster outward, never in toward the floor.
          const ox = x + (m ? Math.sign(x) * h(32 + m) * 0.45 : 0), os = s + (m ? (h(36 + m) - 0.5) * 0.9 : 0), base = terrain.height(ox, os);
          add({ kind: 'column', x: ox, s: os, y: base - 0.3, scale: 0.85 + h(40 + m) * 0.35, height: 0.8 + h(44 + m) * 1.1, rotation: turn(h(48 + m)), cosmetic: m > 1 }, h(52 + m), 1);
        }
      } else if (edge && frame < 0.34) {
        const kind = h(31) < 0.4 ? 'wall' : 'clump';
        add({ kind, x, s, y: ground - 0.1, scale: 0.85 + h(32) * 0.3, height: 0.6 + h(33) * 0.6,
          rotation: kind === 'wall' ? (x > 0 ? Math.PI / 2 : -Math.PI / 2) + (h(34) - 0.5) * 0.5 : turn(h(34)), cosmetic: false }, h(35));
      } else if (edge && frame < 0.42) {
        const scale = 0.75 + h(31) * 0.35;
        add({ kind: 'boulder', x, s, y: ground - 0.08, scale, height: scale, rotation: turn(h(32)), cosmetic: false }, h(33));
      } else if (frame < 0.08) {
        // Small stones on the floor itself (user, 22 October: the bosses roll over them); never anything taller.
        const scale = 0.14 + h(31) * 0.2;
        add({ kind: 'rock', x, s, y: ground - 0.04, scale, height: scale * (0.7 + h(32) * 0.4), rotation: turn(h(33)), cosmetic: true }, h(34));
      }
      continue;
    }
    // Scatter thins out down the ramp toward a platform, and nothing tall stands on it.
    if (platform > 0 && h(30) < platform * 2) continue;
    ramp = platform > 0;
    if (rise > 1 && slope < 1.1) {
      // Cliff feet: columnar pieces fill the face from its foot (stacked columns, not paving), with
      // talus, fallen columns and boulders below and now and then a towering stack or hoodoo.
      const closeness = smoothRange(1, 3, rise), face = h(11);
      // (Version 15: cliff walls stand in the faces themselves, so the foot fill is sparser.)
      if (face < 0.22) {
        const kind = h(12) < 0.36 ? 'wall' : 'clump', top = Math.min(SCENERY_MAX_HEIGHT, ground + rise * (0.5 + h(13) * 0.45));
        add({ kind, x, s, y: ground - 0.1, scale: 0.9 + h(14) * 0.3, height: top - ground + 0.1,
          rotation: kind === 'wall' ? along + (h(15) - 0.5) * 0.3 : turn(h(15)), cosmetic: false }, h(16), 1);
      }
      if (pick < 0.05 * mood.stacks) {
        const kind = h(4) < 0.5 ? 'spire' : 'hoodoo', height = Math.min(3.6, rise * (0.45 + h(5) * 0.45) + 0.4);
        add({ kind, x: x + (h(17) - 0.5) * 0.6, s, y: ground - 0.1, scale: 0.9 + h(6) * 0.3, height, rotation: turn(h(7)), cosmetic: false }, h(8));
      } else if (pick < 0.12) {
        { const scale = 0.85 + h(4) * 0.3; add({ kind: 'fallen', x, s, y: ground - 0.06, scale, height: scale, rotation: turn(h(6)), cosmetic: false }, h(7)); }
      } else if (pick < 0.18) {
        const scale = 0.8 + h(4) * 0.4;
        add({ kind: 'boulder', x, s, y: ground - 0.08, scale, height: scale, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (pick < 0.18 + 0.4 * closeness) {
        const scale = mix(0.3, 0.75, closeness) * (0.85 + h(4) * 0.3);
        add({ kind: 'rock', x, s, y: ground - 0.04, scale, height: scale * (0.75 + h(5) * 0.45), rotation: turn(h(6)), cosmetic: h(7) > 0.5 }, h(8));
      }
    } else if (drop > 0.7 && slope < 1) {
      // Rims and ledges: sparse groups of protruding columns, occasionally a spire or rosette.
      if (pick > 0.15) continue;
      const kind = h(5) < 0.08 * mood.stacks ? 'rosette' : h(5) < 0.14 ? 'spire' : 'column';
      const members = kind === 'column' ? 2 + Math.floor(h(10) * 2) : 1;
      for (let m = 0; m < members; m++) {
        const ox = x + (m ? (h(20 + m) - 0.5) * 0.9 : 0), os = s + (m ? (h(24 + m) - 0.5) * 0.9 : 0), base = terrain.height(ox, os);
        const top = Math.min(SCENERY_MAX_HEIGHT, base + (kind === 'spire' ? 0.6 + h(6) * 0.9 : 0.12 + h(6 + m) * 0.35));
        if (top - base < 0.05) continue;
        add({ kind, x: ox, s: os, y: base - 0.3, scale: 0.85 + h(8) * 0.35, height: top - base + 0.3, rotation: turn(h(7 + m)),
          cosmetic: kind === 'column' && m > 0 }, h(9), 1);
      }
    } else if (slope > 1.5) {
      // Steep faces stay clean (the shader draws column striation); crystal growths break out in places.
      if (pick < 0.035 * mood.mineral && ground < 1.4) {
        const scale = 0.85 + h(4) * 0.35;
        add({ kind: 'crystalSpire', x, s, y: ground - 0.25, scale, height: 0.8 + h(5) * 0.9, rotation: turn(h(6)), cosmetic: false }, h(7));
      }
    } else {
      // Open ground: crystals and crystal spires at pools, hoodoos and rosettes, sparse rocks and boulder fields.
      const field = smoothRange(0.62, 0.82, noise(seed ^ 0x4a7c, x * 0.12, s * 0.12)), pool = terrain.pool(x, s), veins = terrain.veins(x, s);
      const crystals = smoothRange(0.72, 0.86, noise(seed ^ 0x4a7d, x * 0.09, s * 0.09)) * Math.min(1, mood.mineral), ejecta = terrain.crater(x, s);
      const calm = routeCalm(seed, x, s);
      if (pool > 0.3 && pick < 0.06) {
        const scale = 0.9 + h(4) * 0.3;
        add({ kind: 'crystalSpire', x, s, y: ground - 0.12, scale, height: 0.9 + h(5) * 1.1, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (pool > 0.3 && pick < 0.36) {
        const scale = 0.55 + h(4) * 0.45;
        add({ kind: 'crystal', x, s, y: ground - 0.05, scale, height: scale * (0.85 + h(5) * 0.3), rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (slope < 0.45 && ground < 0 && pick < 0.014 * mood.stacks) {
        add({ kind: 'hoodoo', x, s, y: ground - 0.08, scale: 0.85 + h(4) * 0.35, height: 1 + h(5) * 1.6, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (slope < 0.45 && pick < 0.014 * mood.stacks + 0.008) {
        add({ kind: 'rosette', x, s, y: ground - 0.15, scale: 0.85 + h(4) * 0.3, height: 0.6 + h(5) * 0.8, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if ((veins > 0.6 && pick < 0.05) || (crystals > 0.15 && pick < 0.26 * crystals)) {
        // Crystal fields in mineral regions, and accents along glowing veins.
        const scale = 0.4 + h(4) * 0.45;
        add({ kind: 'crystal', x, s, y: ground - 0.05, scale, height: scale * (0.8 + h(5) * 0.4), rotation: turn(h(6)), cosmetic: h(11) > 0.5 }, h(7));
      } else if (ejecta > 0.2 && pick < 0.5 * ejecta) {
        // Crater ejecta: blocks and rubble thrown around the rim.
        const big = h(8) < 0.3, kind = big ? 'boulder' : 'rock', scale = big ? 0.8 + h(4) * 0.3 : 0.2 + h(4) * 0.4;
        add({ kind, x, s, y: ground - 0.05, scale, height: big ? scale : scale * (0.7 + h(5) * 0.4), rotation: turn(h(6)), cosmetic: !big }, h(7));
      } else if (pick < ((ground > 0.5 ? 0.1 : 0.07) + field * 0.35) * (1 - calm * 0.8)) {
        // Rubble, boulder and fallen-column fields; calmer near the authored routes.
        const big = field > 0.25 && h(8) < 0.35, kind = big ? (h(9) < 0.55 ? 'boulder' : 'fallen') : 'rock';
        const scale = big ? 0.8 + h(4) * 0.35 : 0.14 + h(4) * h(4) * 0.42 + field * 0.15;
        // Fallen columns and boulders keep their modelled proportions (uniform scale); rocks vary in height.
        add({ kind, x, s, y: ground - 0.05, scale, height: big ? scale : scale * (0.75 + h(5) * 0.35),
          rotation: turn(h(6)), cosmetic: !big || h(10) > 0.6 }, h(7));
      }
    }
  }
  // Columnar basalt walls along every cliff (docs/26 §11).
  for (const wall of yield* cliffWallSteps(seed, startS, size, terrain, { kind: 'cliffWall', salt: 0x3a11, minDrop: 0.6, cap: SCENERY_MAX_HEIGHT })) essential.push(wall);
  return [...essential, ...cosmetic];
}
export const scatterKit = (seed: number, startS: number, size: number, terrain: ScatterField) => finish(scatterKitSteps(seed, startS, size, terrain));
