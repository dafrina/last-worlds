import type { TerrainArena } from './terrain-arena';
import type { MoodParams } from './terrain-layout';

/*
 * The scenery kit's data (a leaf module): every kit kind and its contract bounds, the floe footprints and sets, a placed
 * kit instance, and the terrain queries scatter reads. Scatter (terrain-scatter.ts), the cliff walls (terrain-walls.ts)
 * and each planet's dressing share it without importing one another.
 */

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
export type AmnionKitKind = 'eggClutch' | 'boneSpire' | 'nest' | 'boneShards' | 'broodNest' | 'hive' | 'broodRuin' | 'sinewWeb';
/** Umbra's obsidian kit (umbra-kit.glb, docs/28, tools/blender/umbra_kit.py). */
export type UmbraKitKind = 'umbHill' | 'umbPeak' | 'umbSpire' | 'umbShards' | 'umbFloat' | 'umbMonolith' | 'umbPylon' | 'umbGate' | 'umbReactor' | 'umbObelisk' | 'umbPad' | 'umbDock';
/** Corona's infrastructure kit (corona-kit.glb, docs/37, tools/blender/corona_kit.py). */
export type CoronaKitKind = 'corExtractor' | 'corCollector' | 'corHangar' | 'corRefinery' | 'corGantry' | 'corDome';
/**
 * Cliff walls (terrain version 15, docs/26 §11): 2-unit wall segments set along cliff rims, base-centre pivot, front
 * (the outward, downhill face) toward +Z, top at exactly 1 (placement scales y by the local drop). Khepri's columnar
 * basalt (public/assets/khepri/cliff-kit.glb; Luna repaints it grey) and Vesper's fractured ice-shelf walls
 * (public/assets/vesper/cliff-kit.glb).
 */
/** Nahara's sandstone ruins (nahara-kit.glb, docs/39, tools/blender/nahara_kit.py). */
export type NaharaKitKind = 'nahTower' | 'nahGate' | 'nahPillar' | 'nahArch' | 'nahSpur' | 'nahRing' | 'nahBlocks' | 'nahAqueduct' | 'nahAqPier';
export type CliffKitKind = 'cliffWall' | 'iceWall' | 'fleshWall' | 'voidWall' | 'nahWall';
export type KitKind = KhepriKitKind | VesperKitKind | NacreKitKind | AmnionKitKind | UmbraKitKind | CoronaKitKind | NaharaKitKind | CliffKitKind;
/** Khepri's kit (khepri-kit.glb). */
export const KIT_KINDS: readonly KhepriKitKind[] = ['clump', 'column', 'rock', 'crystal', 'spire', 'wall', 'fallen', 'boulder', 'crystalSpire', 'rosette', 'hoodoo'];
export const VESPER_KIT_KINDS: readonly VesperKitKind[] = ['iceCliff', 'serac', 'iceSpire', 'iceberg', 'floe', 'floePairA', 'floePairB', 'floeTripleC', 'ridge', 'drift', 'outcrop', 'vent'];
/** Cliff kits, one file per world: Khepri's (also drawn on Luna) and Vesper's. */
export const KHEPRI_CLIFF_KINDS: readonly CliffKitKind[] = ['cliffWall'];
export const VESPER_CLIFF_KINDS: readonly CliffKitKind[] = ['iceWall'];
export const AMNION_CLIFF_KINDS: readonly CliffKitKind[] = ['fleshWall'];
export const AMNION_KIT_KINDS: readonly AmnionKitKind[] = ['eggClutch', 'boneSpire', 'nest', 'boneShards', 'broodNest', 'hive', 'broodRuin', 'sinewWeb'];
export const UMBRA_CLIFF_KINDS: readonly CliffKitKind[] = ['voidWall'];
export const NAHARA_CLIFF_KINDS: readonly CliffKitKind[] = ['nahWall'];
export const NAHARA_KIT_KINDS: readonly NaharaKitKind[] = ['nahTower', 'nahGate', 'nahPillar', 'nahArch', 'nahSpur', 'nahRing', 'nahBlocks', 'nahAqueduct', 'nahAqPier'];
export const CORONA_KIT_KINDS: readonly CoronaKitKind[] = ['corExtractor', 'corCollector', 'corHangar', 'corRefinery', 'corGantry', 'corDome'];
export const UMBRA_KIT_KINDS: readonly UmbraKitKind[] = ['umbHill', 'umbPeak', 'umbSpire', 'umbShards', 'umbFloat', 'umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk', 'umbPad', 'umbDock'];
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
  // The ruin's radius is its ring (the world-bounds check): leaning tusk tips may overhang the world edge.
  broodRuin: { prefix: 'amn_ruin', variants: 2, halfX: 1.45, halfZ: 1.45, height: 1, exactTop: true, radius: 1 },
  sinewWeb: { prefix: 'amn_web', variants: 3, halfX: 1.05, halfZ: 0.45, height: 1, exactTop: false, radius: 1.05 },
  // Amnion's canyon walls (docs/27): flesh lobes and sinews tucked under the plateau's own bone edge.
  fleshWall: { prefix: 'flesh_wall', variants: 4, halfX: 1.05, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.05, 0.6) },
  // Umbra (umbra-kit.glb and cliff-kit.glb, tools/blender/umbra_kit.py, docs/28; halves measured from the kit):
  // knife-edged obsidian shards on the canyon-wall contract; sharp rocks, spires and the faction's structures top out at
  // exactly 1; shards and pads at real size; floating cliffs and the crescent dock from their lowest spike tip (y 0) to
  // their top (y 1).
  voidWall: { prefix: 'void_wall', variants: 4, halfX: 1.05, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.05, 0.6) },
  // Corona's infrastructure (corona-kit.glb, docs/37): the six modules of the concept sheet; tops normalised to 1, the
  // footprints (model units, the scatter scales them) as built.
  // Nahara (nahara-kit.glb, docs/39): sandstone masonry on the cliff-wall contract; ruins topping out at exactly 1 (the
  // arch from its feet at y 0 to the crown; its footprint is scaled to the chasm's span); rubble at real size.
  nahWall: { prefix: 'nah_wall', variants: 4, halfX: 1.05, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.05, 0.6) },
  nahTower: { prefix: 'nah_tower', variants: 3, halfX: 0.7, halfZ: 0.7, height: 1, exactTop: true, radius: Math.hypot(0.7, 0.7) },
  nahGate: { prefix: 'nah_gate', variants: 2, halfX: 1, halfZ: 0.4, height: 1, exactTop: true, radius: Math.hypot(1, 0.4) },
  // The chasm's monoliths: great blocks piled up out of the haze (tools/blender/nahara_kit.py stack).
  nahPillar: { prefix: 'nah_pillar', variants: 3, halfX: 1, halfZ: 1, height: 1, exactTop: true, radius: Math.SQRT2 },
  nahArch: { prefix: 'nah_arch', variants: 2, halfX: 1.04, halfZ: 0.2, height: 1, exactTop: true, radius: 1.04 },
  // A broken half arch from a pier at x -1, reaching toward +x (its far end at x 0.5 to 0.8).
  nahSpur: { prefix: 'nah_spur', variants: 2, halfX: 1.05, halfZ: 0.26, height: 1, exactTop: true, radius: 1.05 },
  // One aqueduct bay, pier centre to pier centre along x (tools/blender/nahara_kit.py aqueduct), its channel rim at 1.
  // (Variants: whole, broken through, the run's ruined end toward +x.)
  nahAqueduct: { prefix: 'nah_aqueduct', variants: 3, halfX: 1.04, halfZ: 0.28, height: 1, exactTop: true, radius: Math.hypot(1.04, 0.28) },
  // An aqueduct pier's column below its bay, stretched down to the ground.
  nahAqPier: { prefix: 'nah_aqpier', variants: 1, halfX: 0.15, halfZ: 0.27, height: 1, exactTop: true, radius: 0.3 },
  nahRing: { prefix: 'nah_ring', variants: 1, halfX: 0.8, halfZ: 0.25, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.25) },
  nahBlocks: { prefix: 'nah_blocks', variants: 3, halfX: 0.6, halfZ: 0.6, height: 0.6, exactTop: false, radius: Math.hypot(0.6, 0.6) },
  corExtractor: { prefix: 'cor_extractor', variants: 1, halfX: 0.8, halfZ: 0.75, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.75) },
  corCollector: { prefix: 'cor_collector', variants: 1, halfX: 0.66, halfZ: 0.51, height: 1, exactTop: true, radius: Math.hypot(0.66, 0.51) },
  corHangar: { prefix: 'cor_hangar', variants: 1, halfX: 0.8, halfZ: 0.68, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.68) },
  corRefinery: { prefix: 'cor_refinery', variants: 1, halfX: 0.75, halfZ: 0.55, height: 1, exactTop: true, radius: Math.hypot(0.75, 0.55) },
  corGantry: { prefix: 'cor_gantry', variants: 1, halfX: 0.8, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.6) },
  corDome: { prefix: 'cor_dome', variants: 1, halfX: 0.77, halfZ: 0.77, height: 1, exactTop: true, radius: Math.hypot(0.77, 0.77) },
  // The hills: fractured obsidian massifs, each a few large planar faces broken along cracks (razor edges).
  umbHill: { prefix: 'umb_hill', variants: 8, halfX: 1.5, halfZ: 1.3, height: 1, exactTop: true, radius: Math.hypot(1.5, 1.3) },
  // Sharp obsidian rocks (crags), on and around the hills.
  umbPeak: { prefix: 'umb_peak', variants: 4, halfX: 1, halfZ: 0.9, height: 1, exactTop: true, radius: Math.hypot(1, 0.9) },
  umbSpire: { prefix: 'umb_spire', variants: 4, halfX: 0.42, halfZ: 0.42, height: 1, exactTop: true, radius: Math.hypot(0.42, 0.42) },
  umbShards: { prefix: 'umb_shards', variants: 3, halfX: 0.3, halfZ: 0.28, height: 0.36, exactTop: false, radius: Math.hypot(0.3, 0.28) },
  umbFloat: { prefix: 'umb_float', variants: 3, halfX: 0.84, halfZ: 0.7, height: 1, exactTop: true, radius: Math.hypot(0.84, 0.7) },
  umbMonolith: { prefix: 'umb_monolith', variants: 2, halfX: 0.5, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(0.5, 0.5) },
  umbPylon: { prefix: 'umb_pylon', variants: 1, halfX: 0.36, halfZ: 0.36, height: 1, exactTop: true, radius: Math.hypot(0.36, 0.36) },
  umbGate: { prefix: 'umb_gate', variants: 1, halfX: 0.8, halfZ: 0.29, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.29) },
  umbReactor: { prefix: 'umb_reactor', variants: 1, halfX: 0.53, halfZ: 0.41, height: 1, exactTop: true, radius: Math.hypot(0.53, 0.41) },
  umbObelisk: { prefix: 'umb_obelisk', variants: 2, halfX: 0.22, halfZ: 0.22, height: 1, exactTop: true, radius: Math.hypot(0.22, 0.22) },
  umbPad: { prefix: 'umb_pad', variants: 2, halfX: 0.7, halfZ: 0.7, height: 0.17, exactTop: false, radius: Math.hypot(0.7, 0.7) },
  umbDock: { prefix: 'umb_dock', variants: 1, halfX: 0.7, halfZ: 0.86, height: 1, exactTop: true, radius: Math.hypot(0.7, 0.86) },
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
  /** The mission arena whose rows hold s (undefined outside one): a planet shaping its own boss ground (Nahara's citadel). */
  arena(s: number): TerrainArena | undefined;
  /** Planet-specific surface mask (Vesper: rock outcrops); 0 on Khepri. */
  tone(x: number, s: number): number;
}
