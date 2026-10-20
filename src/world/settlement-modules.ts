import type { PlanetId } from '../shared/contracts';

/**
 * Settlement module registry (docs/23 §4.3): one typed record per placeable infrastructure node. Pure data, no
 * three.js. Values are the authored contract bounds (docs/13 §3b, docs/14, art/vesper-infra/README.md); the legacy
 * tables (MODULE_HEIGHT, SHARED_BOUNDS, the renderer's INFRA_NODES / VESPER_INFRA_NODES) must agree with it
 * (tests/world/settlement-modules.test.ts), so this is the single source for new code.
 */
export type SiteClass = 'outpost' | 'compound' | 'district';
export type Role = 'landmark' | 'processing' | 'tankFarm' | 'pipeJunction' | 'cargoZone' | 'power' | 'storage'
  | 'admin' | 'repair' | 'habitat' | 'lighting' | 'vehicle' | 'detail' | 'pipe' | 'water' | 'wreck';
export type SocketKind = 'road' | 'pipeS' | 'pipeL' | 'power' | 'bridge' | 'causeway' | 'walkway' | 'track';
/** Outward direction of a socket in node space (glTF: x lateral, z = −s): 0 = −Z (forward), 1 = +X, 2 = +Z, 3 = −X. */
export type Facing = 0 | 1 | 2 | 3;
export interface Socket { id: string; kind: SocketKind; at: readonly [x: number, y: number, z: number]; facing: Facing }
export type Foundation =
  | { kind: 'pad' }
  | { kind: 'plinth'; maxRise: number }
  | { kind: 'piles'; depth: number }
  | { kind: 'afloat'; waterline: number }
  | { kind: 'natural'; sink: number };
export type ModuleSource = 'khepri-infra' | 'industrial-kit' | 'vesper-infra' | 'district-kit';
export interface ModuleSpec {
  node: string;
  source: ModuleSource;
  /** Runtime material family that draws it (the terrain view still routes by name today; see docs/23 §1.9). */
  material: 'infra' | 'shared' | 'kit';
  /** Contract half footprint (local x, z) before rotation. */
  half: readonly [x: number, z: number];
  /** Contract top above the pivot, and extent below it (skirt, piles, waterline depth). */
  top: number; below: number;
  foundation: Foundation;
  planets: readonly PlanetId[];
  roles: readonly Role[];
  sockets: readonly Socket[];
  rotation: 'quarter' | 'free' | 'fixed';
  /** Repeats seamlessly every `period` along a local axis. */
  tiles?: { axis: 'x' | 'z'; period: number };
  /** Low graphics tier may drop pieces marked cosmetic by a layout; this is the node's default. */
  detail: 'essential' | 'cosmetic';
  /** Casts real-time shadows on High (merged caster strips). */
  shadow: boolean;
  /** Authored but not yet modelled: layouts reserve its slot and place a stand-in until it ships. */
  planned?: boolean;
}

const KHEPRI_PLANETS: readonly PlanetId[] = ['khepri', 'luna'];
const SHARED_PLANETS: readonly PlanetId[] = ['khepri', 'vesper', 'luna'];
const pad = { kind: 'pad' } as const;
/** Four pipe sockets around a vertical tank at its shell radius, on the 0.35 pipe centreline. */
const tankSockets = (r: number): Socket[] => [
  { id: 'n', kind: 'pipeL', at: [0, 0.35, -r], facing: 0 }, { id: 'e', kind: 'pipeL', at: [r, 0.35, 0], facing: 1 },
  { id: 's', kind: 'pipeL', at: [0, 0.35, r], facing: 2 }, { id: 'w', kind: 'pipeL', at: [-r, 0.35, 0], facing: 3 },
];
/** Pipe sockets in the middle of each face of a rectangular building. */
const faceSockets = (hx: number, hz: number): Socket[] => [
  { id: 'n', kind: 'pipeL', at: [0, 0.35, -hz], facing: 0 }, { id: 'e', kind: 'pipeL', at: [hx, 0.35, 0], facing: 1 },
  { id: 's', kind: 'pipeL', at: [0, 0.35, hz], facing: 2 }, { id: 'w', kind: 'pipeL', at: [-hx, 0.35, 0], facing: 3 },
];

function infra(node: string, size: readonly [number, number, number], roles: Role[], extra: Partial<ModuleSpec> = {}): ModuleSpec {
  return { node, source: 'khepri-infra', material: node.startsWith('infra_') ? 'infra' : 'kit', half: [size[0] / 2, size[2] / 2], top: size[1], below: 0.05,
    foundation: pad, planets: KHEPRI_PLANETS, roles, sockets: [], rotation: 'quarter', detail: 'essential', shadow: false, ...extra };
}
function shared(node: string, halfX: number, halfZ: number, top: number, roles: Role[], extra: Partial<ModuleSpec> = {}): ModuleSpec {
  return { node, source: 'industrial-kit', material: 'shared', half: [halfX, halfZ], top, below: 0, foundation: pad, planets: SHARED_PLANETS,
    roles, sockets: [], rotation: 'quarter', detail: 'essential', shadow: false, ...extra };
}
function vesper(node: string, size: readonly [number, number, number], top: number, roles: Role[], extra: Partial<ModuleSpec> = {}): ModuleSpec {
  return { node, source: 'vesper-infra', material: 'kit', half: [size[0] / 2, size[2] / 2], top, below: +(size[1] - top).toFixed(2),
    foundation: pad, planets: ['vesper'], roles, sockets: [], rotation: 'quarter', detail: 'essential', shadow: false, ...extra };
}

const LIST: readonly ModuleSpec[] = [
  // Khepri infrastructure (khepri-infra.glb, tools/blender/khepri_infra.py); pivots at the base centre, skirt to −0.05.
  infra('infra_landing_pad', [5.4, 0.3, 6.2], ['repair', 'cargoZone'], { sockets: [{ id: 'apron', kind: 'road', at: [0, 0, 3.1], facing: 2 }] }),
  // Measured inlets on the plant's +z side, where its machinery meets a pipe centreline (the slab edge is at 2.55).
  infra('infra_refinery', [4.1, 1.6, 5.1], ['landmark', 'processing'], { shadow: true, sockets: [
    { id: 'inlet_w', kind: 'pipeL', at: [-1.25, 0.35, 2.22], facing: 2 }, { id: 'inlet_e', kind: 'pipeL', at: [1.25, 0.35, 2.03], facing: 2 }] }),
  infra('infra_relay', [0.85, 1.6, 1.0], ['power'], { shadow: true }),
  infra('infra_cargo_0', [1.05, 0.65, 1.75], ['vehicle']), infra('infra_cargo_1', [1.05, 0.65, 1.75], ['vehicle']),
  infra('infra_cargo_2', [1.05, 0.65, 1.75], ['vehicle']),
  infra('infra_track_segment', [1.35, 0.05, 2.0], ['cargoZone'], { below: 0, tiles: { axis: 'z', period: 2 },
    sockets: [{ id: 'n', kind: 'track', at: [0, 0, -1], facing: 0 }, { id: 's', kind: 'track', at: [0, 0, 1], facing: 2 }] }),
  infra('infra_drill_rig', [1.5, 1.96, 1.32], ['processing'], { shadow: true, rotation: 'free' }),
  infra('infra_habitat_0', [1.38, 0.78, 0.74], ['habitat', 'admin'], { shadow: true }),
  infra('infra_habitat_1', [1.32, 0.78, 1.02], ['habitat', 'admin'], { shadow: true }),
  infra('infra_comm_dish', [1.0, 1.25, 1.0], ['power'], { shadow: true }),
  infra('infra_solar_array', [2.2, 0.45, 0.74], ['power'], { tiles: { axis: 'x', period: 2.2 } }),
  infra('infra_light_mast', [0.38, 1.5, 0.36], ['lighting']),
  infra('infra_silo', [0.94, 1.75, 0.94], ['storage', 'landmark'], { shadow: true }),
  infra('wreck_0', [2.36, 0.39, 1.36], ['wreck'], { rotation: 'free', foundation: { kind: 'natural', sink: 0.12 } }),
  infra('wreck_1', [2.12, 0.54, 1.46], ['wreck'], { rotation: 'free', foundation: { kind: 'natural', sink: 0.12 } }),
  // Shared industrial kit (industrial-kit.glb, tools/blender/shared_industrial.py): base on y = 0, pipes on a 2-unit grid.
  shared('pipe_s_straight', 0.11, 1, 0.47, ['pipe'], { tiles: { axis: 'z', period: 2 } }),
  shared('pipe_l_straight', 0.21, 1, 0.56, ['pipe'], { tiles: { axis: 'z', period: 2 } }),
  shared('pipe_s_elbow', 1, 1, 0.47, ['pipe']), shared('pipe_l_elbow', 1, 1, 0.56, ['pipe']),
  shared('pipe_s_tee', 1, 1, 0.47, ['pipe', 'pipeJunction']), shared('pipe_l_tee', 1, 1, 0.57, ['pipe', 'pipeJunction']),
  shared('pipe_valve', 0.46, 1, 0.8, ['pipe', 'pipeJunction']),
  shared('pipe_support', 0.35, 0.15, 0.62, ['pipe']),
  shared('tank_vertical_0', 0.6, 0.6, 1.45, ['tankFarm', 'storage'], { shadow: true, sockets: tankSockets(0.575) }),
  shared('tank_vertical_1', 0.55, 0.55, 1.45, ['tankFarm', 'storage'], { shadow: true, sockets: tankSockets(0.52) }),
  // The gas sphere's shell starts above the pipe centreline (centre 0.9, radius 0.55): it stores, it is not fed on a run.
  shared('tank_sphere', 0.6, 0.6, 1.5, ['tankFarm', 'storage'], { shadow: true }),
  shared('tank_horizontal', 1, 0.4, 0.9, ['tankFarm', 'storage'], { shadow: true }),
  shared('container_0', 0.6, 0.32, 0.55, ['cargoZone', 'detail']), shared('container_1', 0.56, 0.33, 0.6, ['cargoZone', 'detail']),
  // Measured: the hall's −x wall is flat 1.2 from its centre across the building (z −0.8…0.6); +x steps in and out.
  shared('facility', 1.38, 1.05, 1.8, ['processing'], { sockets: [{ id: 'w', kind: 'pipeL', at: [-1.2, 0.35, 0], facing: 3 }] }),
  // Vesper infrastructure (vesper-infra.glb, art/vesper-infra/README.md): size is the full box incl. skirt or waterline depth.
  vesper('vesper_radiator_array', [2.0, 0.86, 0.76], 0.81, ['power'], { tiles: { axis: 'x', period: 2 } }),
  vesper('vesper_missile_site', [1.74, 1.79, 2.2], 1.74, ['detail']), vesper('vesper_cannon_site', [1.66, 0.89, 2.42], 0.84, ['detail']),
  vesper('vesper_cryo_dome', [1.58, 0.99, 1.82], 0.94, ['storage']), vesper('vesper_habitat_0', [1.4, 0.94, 1.56], 0.89, ['habitat']),
  vesper('vesper_habitat_1', [1.1, 0.84, 0.96], 0.79, ['habitat']),
  vesper('vesper_pier_segment', [1.4, 1.24, 2.0], 0.64, ['water'], { foundation: { kind: 'afloat', waterline: 0 }, tiles: { axis: 'z', period: 2 } }),
  vesper('vesper_crane', [1.26, 2.15, 2.3], 2.1, ['cargoZone']), vesper('vesper_comm_needle', [0.74, 2.21, 0.7], 2.16, ['power']),
  vesper('vesper_ice_hauler', [1.1, 0.69, 1.96], 0.64, ['vehicle']),
  vesper('vesper_icebreaker', [1.04, 1.62, 3.32], 1.37, ['water'], { foundation: { kind: 'afloat', waterline: 0 } }),
  // The refinery district's landmark (district-kit.glb, tools/blender/khepri_district_kit.py): large-pipe stubs end in
  // half flanges at the middle of each face.
  { node: 'khepri_processing_tower', source: 'district-kit', material: 'infra', half: [1.5, 1.5], top: 3.5, below: 0.05, foundation: pad,
    planets: ['khepri'], roles: ['landmark', 'processing'], sockets: faceSockets(1.5, 1.5), rotation: 'quarter', detail: 'essential', shadow: true },
];

export const MODULES: Readonly<Record<string, ModuleSpec>> = Object.fromEntries(LIST.map(spec => [spec.node, spec]));

/** Full contract box (width x, height above the pivot, depth z) of a node, or null when it is not registered. */
export function moduleSize(node: string): readonly [number, number, number] | null {
  const spec = MODULES[node];
  return spec ? [spec.half[0] * 2, spec.top, spec.half[1] * 2] : null;
}
/** Shell radius of a vertical tank (its pipe sockets' distance from the pivot). */
export const socketReach = (node: string, id = 'e') => Math.hypot(...(MODULES[node]?.sockets.find(socket => socket.id === id)?.at ?? [0, 0, 0]).filter((_, i) => i !== 1));
