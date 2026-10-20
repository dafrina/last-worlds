import type { PlanetId } from '../shared/contracts';

/**
 * Modular facility kits (docs/25-modular-facilities.md): per-world textured building modules that a seeded layout
 * composes around a ground battery. Pure data, no three.js; the single source for the composer, the view and the
 * asset tests (the Blender builder asserts the same bounds).
 *
 * Nodes are `fk_<world>_<module>` in `public/assets/<world>/facility-kit-v3.glb`, all sharing one baked atlas per
 * world (tools/blender/facility_kit.py). Module frame: pivot at the base centre on the ground; x lateral, s away from
 * the camera (glTF −z); the detailed front faces the camera (−s). Foundations reach `below` under the pivot so a
 * module can sit on uneven ground.
 */
/** Every world has a kit (Luna joined at the user's request: "what about moon?", 20 October). */
export type FacilityWorld = PlanetId;
export type ModuleRole =
  | 'hall' | 'tank' | 'column' | 'landmark' | 'pump' | 'pipe' | 'wall' | 'detail' | 'pad' | 'ring' | 'arc' | 'pool' | 'apron';
/** Quarter turns (1 = 90° counter-clockwise seen from above, three.js yaw). Turn 2 shows the camera the plain back. */
export type Turn = 0 | 1 | 2 | 3;
export interface FacilityModule {
  node: string;
  world: FacilityWorld;
  /** Half footprint (local x, s) before turning, including skirts, flanges and overhanging arms. */
  half: readonly [x: number, s: number];
  /** Highest point above the pivot, and the foundation depth below it. */
  top: number;
  below: number;
  roles: readonly ModuleRole[];
  /** Allowed quarter turns, or 'free' for round pieces (any yaw). */
  turns: readonly Turn[] | 'free';
  /** Repeats seamlessly along local x every `period` (pipe runs, walls, channels). */
  tiles?: number;
  /** Low enough (top ≤ 0.2) to lie under the gun's court: pads, rings, pools. */
  flat?: boolean;
  /**
   * Arc pieces of a ring around the gun: authored for this radius, centre of curvature at local (0, −arc); placed at
   * polar angle a around the gun with yaw a − 90° so the concave side faces the gun.
   */
  arc?: number;
}

const ALL: readonly Turn[] = [0, 1, 2, 3];
const FRONT: readonly Turn[] = [0, 1, 3];
const FIXED: readonly Turn[] = [0];
function m(world: FacilityWorld, name: string, half: readonly [number, number], top: number, roles: ModuleRole[],
  turns: readonly Turn[] | 'free', extra: Partial<FacilityModule> = {}): FacilityModule {
  return { node: `fk_${world}_${name}`, world, half, top, below: .6, roles, turns, ...extra };
}

/** Tallest a module may be anywhere (roofs stay 0.45 under the flight plane at 3.8 on ground at 0.1). */
export const MODULE_TOP_MAX = 3.25;
/** Modules taller than the v2 plants (2.65) only seat on low ground (see docs/25 §heights). */
export const TALL = 2.65;

export const FACILITY_MODULES: readonly FacilityModule[] = [
  // Khepri: bone armour, rust cladding, domed tanks, refinery columns (art/concepts/facility-sheets/khepri.jpg).
  m('khepri', 'tank_l', [.85, .85], 1.8, ['tank'], ALL),
  m('khepri', 'tank_s', [.4, .4], .7, ['tank', 'detail'], 'free', { below: .4 }),
  m('khepri', 'columns', [.75, .55], 2.3, ['column'], FRONT),
  m('khepri', 'tower', [.65, .65], 3.25, ['landmark', 'column'], FIXED),
  m('khepri', 'hall_l', [.95, 1.75], 2.0, ['hall'], FRONT),
  m('khepri', 'hall_s', [.95, .9], 1.95, ['hall'], FRONT),
  m('khepri', 'pump', [.8, .55], 1.55, ['pump'], FRONT, { below: .5 }),
  m('khepri', 'refinery', [1.2, .75], 3.0, ['landmark'], FIXED),
  m('khepri', 'spire', [.8, .8], 3.25, ['landmark'], FIXED),
  m('khepri', 'crane', [.75, .75], 2.4, ['landmark', 'detail'], FRONT),
  m('khepri', 'crystals', [.6, .6], 1.2, ['detail'], 'free', { below: .3 }),
  m('khepri', 'pipe', [1, .25], .65, ['pipe'], [0, 1], { below: .3, tiles: 2 }),
  m('khepri', 'wall', [1.02, .22], .9, ['wall'], ALL, { below: .5, tiles: 2 }),
  m('khepri', 'ring', [.98, .98], .05, ['ring'], FIXED, { below: .05, flat: true }),
  m('khepri', 'apron', [1, 1], .04, ['apron'], ALL, { below: 1.1, flat: true, tiles: 2 }),
  // Vesper: graphite, raked fronts, octagonal exchangers, hot orange seams, snow caps (vesper.jpg).
  m('vesper', 'exchanger_l', [.85, .85], 1.95, ['tank'], ALL),
  m('vesper', 'exchanger_s', [.4, .4], 1.25, ['tank', 'detail'], ALL, { below: .4 }),
  m('vesper', 'stacks', [.55, .4], 2.4, ['column'], FRONT),
  m('vesper', 'reactor', [.8, .8], 3.25, ['landmark'], FIXED),
  m('vesper', 'hall_l', [.95, 1.75], 1.95, ['hall'], FRONT),
  m('vesper', 'hall_s', [.95, .9], 1.9, ['hall'], FRONT),
  m('vesper', 'tower', [.6, .6], 3.0, ['landmark', 'column'], FIXED),
  m('vesper', 'fuel', [.8, .55], 1.25, ['tank', 'detail'], FRONT, { below: .4 }),
  m('vesper', 'pylon', [.45, .45], 2.6, ['column', 'landmark'], ALL),
  m('vesper', 'wall', [1.02, .35], .9, ['wall'], ALL, { below: .5, tiles: 2 }),
  m('vesper', 'pipe', [1, .25], .7, ['pipe'], [0, 1], { below: .3, tiles: 2 }),
  m('vesper', 'pad', [2.5, 2.5], .2, ['pad'], FIXED, { flat: true }),
  m('vesper', 'ring', [.98, .98], .05, ['ring'], FIXED, { below: .05, flat: true }),
  m('vesper', 'apron', [1, 1], .04, ['apron'], ALL, { below: 1.1, flat: true, tiles: 2 }),
  // Nacre: lavender stone, crescent blades, glowing basins and seams (nacre.jpg). Plants may stand in the mire.
  m('nacre', 'basin_l', [.85, .85], 1.45, ['tank', 'pool'], ALL),
  m('nacre', 'basin_s', [.62, .62], 1.2, ['tank', 'pool'], ALL),
  m('nacre', 'hall_l', [.95, 1.75], 2.3, ['hall'], FRONT),
  m('nacre', 'hall_s', [.95, .9], 2.2, ['hall'], FRONT),
  m('nacre', 'obelisk', [1.25, .75], 3.2, ['landmark'], FIXED),
  m('nacre', 'pump', [.7, .7], 3.1, ['landmark', 'column'], FIXED),
  m('nacre', 'arc', [.9, .38], 2.3, ['arc', 'wall'], 'free', { arc: 2.2 }),
  m('nacre', 'pillar', [.25, .25], 2.45, ['column', 'detail'], 'free', { below: .4 }),
  m('nacre', 'stones', [.5, .5], 1.2, ['detail'], 'free', { below: .4 }),
  m('nacre', 'pool', [1.95, 1.95], .1, ['pool', 'ring'], FIXED, { flat: true }),
  m('nacre', 'channel', [1, .2], .2, ['pipe'], [0, 1], { tiles: 2, flat: true }),
  m('nacre', 'ring', [.98, .98], .05, ['ring'], FIXED, { below: .05, flat: true }),
  m('nacre', 'apron', [1, 1], .04, ['apron'], ALL, { below: 1.1, flat: true, tiles: 2 }),
  // Luna: human training infrastructure, white panels, dark frames, amber stripes and lamps (luna.jpg).
  m('luna', 'bunker', [1.2, 1.2], 1.95, ['landmark', 'hall'], FIXED),
  m('luna', 'radar', [.9, .9], 3.25, ['landmark'], FIXED),
  m('luna', 'hall_l', [.95, 1.75], 1.75, ['hall'], FRONT),
  m('luna', 'hall_s', [.95, .9], 1.75, ['hall'], FRONT),
  m('luna', 'tank_l', [.8, .8], 1.75, ['tank'], ALL),
  m('luna', 'tank_s', [.4, .4], .95, ['tank', 'detail'], 'free', { below: .4 }),
  m('luna', 'capsules', [.8, .5], 1.95, ['tank', 'column'], FRONT),
  m('luna', 'cargo', [.75, .5], 1.0, ['detail'], FRONT, { below: .4 }),
  m('luna', 'power', [.7, .5], 2.4, ['column', 'pump'], FRONT),
  m('luna', 'beacon', [.3, .3], 2.2, ['column', 'detail'], 'free', { below: .4 }),
  m('luna', 'wall', [1.02, .3], .8, ['wall'], ALL, { below: .5, tiles: 2 }),
  m('luna', 'pipe', [1, .25], .65, ['pipe'], [0, 1], { below: .3, tiles: 2 }),
  m('luna', 'pad', [2.4, 2.45], .2, ['pad'], FIXED, { flat: true }),
  m('luna', 'ring', [.98, .98], .05, ['ring'], FIXED, { below: .05, flat: true }),
];

export const MODULES_BY_NODE: ReadonlyMap<string, FacilityModule> = new Map(FACILITY_MODULES.map(module => [module.node, module]));
export const modulesOf = (world: FacilityWorld) => FACILITY_MODULES.filter(module => module.world === world);
