import { VIEW } from '../shared/contracts';
import { MODULE_TOP_MAX, MODULES_BY_NODE, type FacilityModule, type FacilityWorld, type Turn } from './facility-kit';

/**
 * Seeded layout grammar for the modular facility compounds (docs/25-modular-facilities.md §Rules and §Arrangements).
 * Pure: no three.js, no browser APIs, never Math.random or combat RNG. It runs once per battery when the battery first
 * appears, and its result is cosmetic only: it never moves a target, a collision or loot.
 *
 * Local frame: the gun at the origin, x lateral, s away from the camera. Yaw is three.js yaw (counter-clockwise seen
 * from above), so a module's local (x, s) turns by the ordinary 2D rotation. Templates are authored once, unmirrored;
 * the seed mirrors the finished layout left/right. Every size comes from the registry (`FACILITY_MODULES`), so
 * templates place modules by anchors, by the sides of earlier slots or by polar angle, never by copied dimensions.
 */
export type ArrangementId = 'court' | 'backdrop' | 'flank' | 'L' | 'yard' | 'tower' | 'pad' | 'fort' | 'shrine' | 'basins'
  | 'bunker' | 'radar' | 'cargo' | 'emplacement';
export interface Rect { minX: number; maxX: number; minS: number; maxS: number }

export const FACILITY_RULES = {
  /** Rule 1: within |x| < x and |s| < s of the gun only flat modules (top ≤ flatTop) may lie. */
  court: { x: .65, s: .7, flatTop: .2 },
  /** Rule 2: the camera ray to the 0.85-tall gun climbs tan 55° per unit toward the camera. */
  sight: { x: .9, gun: .85, slope: Math.tan(VIEW.elevation * Math.PI / 180), margin: .1 },
  /** Rule 3: roofs stay `roof` under the flight plane, and a plant's base sinks at most `sink` below its seat. */
  roof: .45, sink: .35,
  /** Rule 4: the world's usable half width, the clearance to other plants, and to other batteries. */
  edge: 14.7, plantGap: 1, batteryMargin: .4,
  /** Two modules overlap once they interpenetrate more than this (abutting pieces may touch). */
  overlap: .02,
} as const;

/** Rule 3: the tallest module a seat at `base` may hold. */
export const topLimit = (base: number) => Math.min(MODULE_TOP_MAX, VIEW.flightHeight - FACILITY_RULES.roof + FACILITY_RULES.sink - base);
/** The plant's base: its seat, sunk just enough to keep the tallest roof `roof` under the flight plane. */
export const plantBase = (seatBase: number, top: number) => Math.min(seatBase, VIEW.flightHeight - FACILITY_RULES.roof - top);

type Side = 'front' | 'back' | 'left' | 'right';
interface Slot {
  key: string;
  /** Candidates: module names (`hall_l`) or palette roles (`@landmark`); the seed chooses one. */
  pick: readonly string[];
  /** Tried only when no `pick` candidate is low enough for the seat (rule 3): the "normal module" swap. */
  swap?: readonly string[];
  /** Reuse the node that slot chose, when it is a candidate here (symmetric wings). */
  like?: string;
  /** Put the turned footprint's `anchor` point (−1, 0 or 1 per axis; default its centre) at `at`. */
  at?: readonly [x: number, s: number];
  anchor?: readonly [x: number, s: number];
  /** Instead of `at`/`anchor`: a seeded choice of [x, s, anchor x, anchor s] spots. */
  spots?: readonly (readonly [x: number, s: number, ax: number, as: number])[];
  /** Or beside the footprint of the first built slot in `to`; `align` lines up min edges (−1), centres or max edges. */
  attach?: { to: string | readonly string[]; side: Side; gap?: number; align?: -1 | 0 | 1 };
  /** Or at this polar angle around the gun (degrees; 0 = +x, 90 = behind it), at `radius` (default: the arc radius). */
  polar?: number;
  radius?: number;
  /** A tiling run (pipes, walls, channels) about `length` long along a local axis; its whole extent is the footprint. */
  run?: { axis: 'x' | 's'; length: number };
  /** Wanted quarter turns, chosen by seed among those the module allows. Default 0, or any turn for symmetric modules. */
  turn?: Turn | readonly Turn[];
  /** Optional slot, built with this probability (one roll per `group`). Slots without a chance are required. */
  chance?: number;
  group?: string;
  /** The flat piece centred on the gun (ring, pad, pool): the only module others may stand on. */
  court?: true;
}
export interface Arrangement { id: ArrangementId; worlds: readonly FacilityWorld[]; weight: number; slots: readonly Slot[] }

/** Each world's modules by the role they play in the templates (docs/25 §Kits). */
const PALETTE: Record<FacilityWorld, Readonly<Record<string, readonly string[]>>> = {
  khepri: {
    court: ['ring'], hall: ['hall_l', 'hall_s'], long: ['hall_l'], short: ['hall_s'],
    landmark: ['refinery', 'spire', 'tower'], minor: ['crane', 'columns'], tank: ['tank_l'],
    block: ['hall_s', 'tank_l', 'pump', 'columns'], small: ['tank_s', 'crystals'], column: ['columns', 'crane'],
    fill: ['tank_l', 'columns', 'crystals', 'pump'], pipe: ['pipe'], wall: ['wall'],
  },
  vesper: {
    court: ['ring'], hall: ['hall_l', 'hall_s'], long: ['hall_l'], short: ['hall_s'],
    landmark: ['reactor', 'tower'], minor: ['stacks', 'pylon'], tank: ['exchanger_l'],
    block: ['hall_s', 'exchanger_l', 'fuel', 'stacks'], small: ['exchanger_s', 'fuel'], column: ['stacks', 'pylon'],
    fill: ['exchanger_l', 'stacks', 'exchanger_s', 'fuel'], pipe: ['pipe'], wall: ['wall'], post: ['pylon'],
  },
  nacre: {
    court: ['ring'], hall: ['hall_l', 'hall_s'], long: ['hall_l'], short: ['hall_s'],
    landmark: ['obelisk', 'pump'], minor: ['pillar', 'basin_l'], tank: ['basin_l', 'basin_s'],
    block: ['hall_s', 'basin_l'], small: ['stones', 'basin_s'], column: ['pillar'],
    fill: ['basin_l', 'pillar', 'stones'], pipe: ['channel'], basin: ['basin_l', 'basin_s'],
  },
  // Luna's arrangements name their modules directly (single facilities after luna.jpg).
  luna: { court: ['ring'], small: ['tank_s', 'cargo'] },
};

/**
 * Share of a world's eligible batteries that get a plant (seeded per battery); the rest keep the legacy emplacement.
 * Luna stays sparse (user, 20 October: "much less populated amount of buildings and infra").
 */
export const PLANT_CHANCE: Readonly<Record<FacilityWorld, number>> = { khepri: 1, vesper: 1, nacre: 1, luna: .3 };
/**
 * Fewest modules a plant may have, not counting aprons or the plain ring. A sparser layout first retries with every
 * optional slot built, then gives way to another arrangement. Luna keeps its single small facilities.
 */
export const MIN_MODULES: Readonly<Record<FacilityWorld, number>> = { khepri: 6, vesper: 6, nacre: 6, luna: 1 };
/**
 * Ground slabs under a plant (round 2): tiles on a grid aligned to the gun that cover every module footprint grown by
 * `margin`, reaching at most `slack` beyond the plant's modules, capped at `max` tiles. Pipe connectors: at most
 * `links` single pipe pieces bridging a gap between neighbouring modules that one piece spans.
 */
export const GROUND = { margin: .4, slack: 1.6, max: 48, links: 3 } as const;

const ALL_WORLDS: readonly FacilityWorld[] = ['khepri', 'vesper', 'nacre'];
const ring = (chance: number): Slot => ({ key: 'court', pick: ['@court'], at: [0, 0], court: true, chance });

/**
 * The arrangements of docs/25 as data. Weights keep every arrangement at or under about 30% of a world's plants and
 * the court at about 20% or less (tests/world/facility-layouts.test.ts measures the shares after fallbacks).
 */
export const ARRANGEMENTS: readonly Arrangement[] = [
  // The v2 U: hall wings either side, tanks in front of them, a landmark behind, a pipe joining the wings.
  { id: 'court', worlds: ALL_WORLDS, weight: .8, slots: [
    ring(.75),
    { key: 'wingL', pick: ['@hall'], at: [-1.1, 2], anchor: [1, 1], turn: 0 },
    { key: 'wingR', pick: ['@hall'], like: 'wingL', at: [1.1, 2], anchor: [-1, 1], turn: 0 },
    { key: 'tankL', pick: ['@tank'], swap: ['@small'], attach: { to: 'wingL', side: 'front', gap: .3 }, chance: .9, group: 'tanks' },
    { key: 'tankR', pick: ['@tank'], swap: ['@small'], like: 'tankL', attach: { to: 'wingR', side: 'front', gap: .3 }, chance: .9, group: 'tanks' },
    { key: 'back', pick: ['@landmark'], swap: ['@minor'], at: [0, 2.3], anchor: [0, -1] },
    { key: 'extraL', pick: ['@small'], attach: { to: 'back', side: 'left', gap: .3, align: -1 }, chance: .7 },
    { key: 'extraR', pick: ['@small', '@column'], attach: { to: 'back', side: 'right', gap: .3, align: -1 }, chance: .6 },
    { key: 'pipe', pick: ['@pipe'], run: { axis: 'x', length: 2 }, at: [0, 1.35], chance: .8 },
  ] },
  // A row of big modules across the back with a pipe run along its front; nothing beside the gun.
  { id: 'backdrop', worlds: ALL_WORLDS, weight: 1.2, slots: [
    ring(.7),
    { key: 'mid', pick: ['@landmark'], swap: ['@block'], at: [0, 1.75], anchor: [0, -1] },
    { key: 'left', pick: ['@block'], attach: { to: 'mid', side: 'left', gap: .3, align: -1 } },
    { key: 'right', pick: ['@block'], attach: { to: 'mid', side: 'right', gap: .3, align: -1 }, chance: .85 },
    { key: 'endL', pick: ['@small'], attach: { to: 'left', side: 'left', gap: .3, align: -1 }, chance: .75 },
    { key: 'endR', pick: ['@small'], attach: { to: ['right', 'mid'], side: 'right', gap: .3, align: -1 }, chance: .75 },
    { key: 'rear', pick: ['@small', '@column'], attach: { to: 'mid', side: 'back', gap: .3 }, chance: .6 },
    { key: 'pipe', pick: ['@pipe'], run: { axis: 'x', length: 4 }, at: [0, 1.45], anchor: [0, 1], chance: .9 },
  ] },
  // A long hall or a hall pair along one side, a landmark at its far corner with satellites, the other side open or a
  // small tank.
  { id: 'flank', worlds: ALL_WORLDS, weight: 1.2, slots: [
    ring(.7),
    { key: 'hallA', pick: ['@hall'], at: [-1.1, -1.6], anchor: [1, -1], turn: 0 },
    { key: 'hallB', pick: ['@short'], attach: { to: 'hallA', side: 'back', gap: .3, align: 1 }, turn: 0, chance: .85 },
    { key: 'mark', pick: ['@landmark'], swap: ['@minor'], attach: { to: ['hallB', 'hallA'], side: 'back', gap: .3, align: 1 } },
    { key: 'markO', pick: ['@tank'], swap: ['@small'], attach: { to: 'mark', side: 'left', gap: .3, align: -1 }, chance: .85 },
    { key: 'markI', pick: ['@small'], attach: { to: 'mark', side: 'right', gap: .3, align: -1 }, chance: .75 },
    { key: 'lead', pick: ['@small'], attach: { to: 'hallA', side: 'front', gap: .3 }, chance: .7 },
    { key: 'pipe', pick: ['@pipe'], run: { axis: 's', length: 2 }, at: [-1.1, .8], anchor: [-1, -1], chance: .7 },
    { key: 'other', pick: ['@small'], at: [1.5, .2], anchor: [-1, 0], chance: .5 },
  ] },
  // Halls along one side and the back, meeting at a corner landmark.
  { id: 'L', worlds: ['khepri', 'vesper'], weight: 1.2, slots: [
    ring(.7),
    { key: 'side', pick: ['@hall'], at: [-1.1, -.8], anchor: [1, -1], turn: 0 },
    { key: 'corner', pick: ['@landmark'], swap: ['@minor'], attach: { to: 'side', side: 'back', gap: .3 } },
    { key: 'back', pick: ['@long', '@short'], attach: { to: 'corner', side: 'right', gap: .3, align: -1 }, turn: [1, 3] },
    { key: 'tail', pick: ['@small'], attach: { to: 'back', side: 'right', gap: .3, align: -1 }, chance: .8 },
    { key: 'front', pick: ['@small'], attach: { to: 'side', side: 'front', gap: .3 }, chance: .7 },
    { key: 'outer', pick: ['@tank'], swap: ['@small'], attach: { to: 'corner', side: 'left', gap: .3, align: -1 }, chance: .7 },
    { key: 'pipe', pick: ['@pipe'], run: { axis: 'x', length: 2 }, attach: { to: 'back', side: 'front', gap: .3, align: -1 }, chance: .7 },
    { key: 'open', pick: ['@small'], at: [1.5, -.3], anchor: [-1, 0], chance: .4 },
  ] },
  // Walls enclose a yard behind the gun (back and both sides; open at the gun) with tanks, columns or crystals inside.
  { id: 'yard', worlds: ['khepri', 'vesper'], weight: 1.2, slots: [
    ring(.7),
    { key: 'back', pick: ['@wall'], run: { axis: 'x', length: 4 }, at: [0, 4.6], anchor: [0, 1] },
    { key: 'sideL', pick: ['@wall'], run: { axis: 's', length: 4 }, attach: { to: 'back', side: 'left', gap: .04, align: 1 } },
    { key: 'sideR', pick: ['@wall'], run: { axis: 's', length: 4 }, attach: { to: 'back', side: 'right', gap: .04, align: 1 } },
    { key: 'inL', pick: ['@fill'], at: [-.15, 2.7], anchor: [1, 0] },
    { key: 'inR', pick: ['@fill'], at: [.15, 2.7], anchor: [-1, 0], chance: .85 },
    { key: 'inF', pick: ['@small'], at: [0, 1.2], chance: .5 },
    { key: 'mark', pick: ['@landmark'], swap: ['@minor'], attach: { to: 'back', side: 'back', gap: .3 }, chance: .5 },
  ] },
  // A tall landmark diagonally behind the gun ringed by satellites, with a pipe run to it.
  { id: 'tower', worlds: ALL_WORLDS, weight: 1.2, slots: [
    ring(.7),
    { key: 'mark', pick: ['@landmark'], swap: ['@minor'], at: [1.1, 1.5], anchor: [-1, -1] },
    { key: 'sat1', pick: ['@tank'], swap: ['@small'], attach: { to: 'mark', side: 'front', gap: .3, align: -1 } },
    { key: 'sat2', pick: ['@column', '@small'], attach: { to: 'mark', side: 'back', gap: .3, align: -1 } },
    { key: 'sat3', pick: ['@small'], attach: { to: 'mark', side: 'left', gap: .3, align: 1 }, chance: .8 },
    { key: 'sat4', pick: ['@small'], attach: { to: 'mark', side: 'right', gap: .3 }, chance: .8 },
    { key: 'sat5', pick: ['@small'], attach: { to: 'sat1', side: 'right', gap: .3, align: -1 }, chance: .75 },
    { key: 'sat6', pick: ['@tank'], swap: ['@small'], attach: { to: 'sat2', side: 'right', gap: .3, align: -1 }, chance: .6 },
    { key: 'pipe', pick: ['@pipe'], run: { axis: 'x', length: 2 }, at: [.8, 1.15], anchor: [1, 0], chance: .9 },
  ] },
  // Vesper: the gun on the landing pad's recessed centre, a control tower and fuel at its back corners, pylons in front.
  { id: 'pad', worlds: ['vesper'], weight: 1.2, slots: [
    { key: 'pad', pick: ['pad'], at: [0, 0], court: true },
    { key: 'tower', pick: ['tower'], swap: ['stacks', 'pylon'], attach: { to: 'pad', side: 'back', gap: -.7, align: -1 } },
    { key: 'fuel', pick: ['fuel', 'exchanger_l'], attach: { to: 'pad', side: 'back', gap: -.6, align: 1 } },
    { key: 'fuel2', pick: ['exchanger_s', 'fuel'], attach: { to: 'fuel', side: 'left', gap: .3, align: -1 }, chance: .85 },
    { key: 'stack', pick: ['stacks', 'exchanger_s'], attach: { to: 'tower', side: 'right', gap: .3, align: 1 }, chance: .6 },
    { key: 'side', pick: ['exchanger_s', 'fuel'], attach: { to: 'pad', side: 'left', gap: .3, align: 1 }, chance: .5 },
    { key: 'pylonL', pick: ['@post'], swap: ['exchanger_s'], attach: { to: 'pad', side: 'front', gap: -.5, align: -1 }, chance: .85, group: 'pylons' },
    { key: 'pylonR', pick: ['@post'], swap: ['exchanger_s'], attach: { to: 'pad', side: 'front', gap: -.5, align: 1 }, chance: .85, group: 'pylons' },
  ] },
  // Vesper: walls on the octagon's back and sides (front open), pylons on its diagonals, an exchanger or stacks behind.
  { id: 'fort', worlds: ['vesper'], weight: 1.2, slots: [
    ring(.8),
    { key: 'back', pick: ['@wall'], at: [0, 2.3], turn: 0 },
    { key: 'left', pick: ['@wall'], at: [-2.3, 0], turn: 1 },
    { key: 'right', pick: ['@wall'], at: [2.3, 0], turn: 1 },
    { key: 'postBL', pick: ['@post'], swap: ['exchanger_s'], polar: 135, radius: 2.3 },
    { key: 'postBR', pick: ['@post'], swap: ['exchanger_s'], like: 'postBL', polar: 45, radius: 2.3 },
    { key: 'postFL', pick: ['@post'], swap: ['exchanger_s'], polar: -135, radius: 2.3, chance: .8, group: 'front' },
    { key: 'postFR', pick: ['@post'], swap: ['exchanger_s'], like: 'postFL', polar: -45, radius: 2.3, chance: .8, group: 'front' },
    { key: 'core', pick: ['exchanger_l', 'stacks'], attach: { to: 'back', side: 'back', gap: .3 } },
    { key: 'core2', pick: ['@small'], attach: { to: 'core', side: 'right', gap: .2, align: -1 }, chance: .5 },
  ] },
  // Nacre: arcs around the pool at the gun (front open), pillars in the gaps, an obelisk or pump tower behind.
  { id: 'shrine', worlds: ['nacre'], weight: 1.2, slots: [
    { key: 'pool', pick: ['pool'], at: [0, 0], court: true },
    { key: 'arcB', pick: ['arc'], polar: 90 },
    { key: 'arcL', pick: ['arc'], polar: 150 },
    { key: 'arcR', pick: ['arc'], polar: 30 },
    { key: 'arcFL', pick: ['arc'], polar: 210, chance: .85, group: 'arcsF' },
    { key: 'arcFR', pick: ['arc'], polar: -30, chance: .85, group: 'arcsF' },
    { key: 'pillarBL', pick: ['pillar'], polar: 120, radius: 2.55, chance: .9, group: 'pillarsB' },
    { key: 'pillarBR', pick: ['pillar'], polar: 60, radius: 2.55, chance: .9, group: 'pillarsB' },
    { key: 'pillarL', pick: ['pillar'], polar: 180, radius: 2.55, chance: .8, group: 'pillars' },
    { key: 'pillarR', pick: ['pillar'], polar: 0, radius: 2.55, chance: .8, group: 'pillars' },
    { key: 'mark', pick: ['obelisk', 'pump'], swap: ['pillar'], attach: { to: 'arcB', side: 'back', gap: .25 } },
  ] },
  // Luna: one small facility each (art/concepts/facility-sheets/luna.jpg), at most four modules, no walls or pipe runs.
  // The command bunker beside or behind the gun, alone or with one small piece.
  { id: 'bunker', worlds: ['luna'], weight: 1, slots: [
    { key: 'bunker', pick: ['bunker'], spots: [[0, 1.5, 0, -1], [1.15, .2, -1, -1], [1.15, -1.1, -1, -1]] },
    { key: 'side', pick: ['@small'], attach: { to: 'bunker', side: 'right', gap: .25, align: -1 }, chance: .6 },
    { key: 'court', pick: ['ring'], at: [0, 0], court: true, chance: .35 },
  ] },
  // The radar tower diagonally behind the gun with one or two small pieces at its base.
  { id: 'radar', worlds: ['luna'], weight: 1, slots: [
    { key: 'radar', pick: ['radar'], swap: ['power'], at: [1, 1.3], anchor: [-1, -1] },
    { key: 'base1', pick: ['tank_s', 'cargo', 'power'], attach: { to: 'radar', side: 'left', gap: .2, align: -1 } },
    { key: 'base2', pick: ['@small'], attach: { to: 'radar', side: 'front', gap: .2, align: 1 }, chance: .5 },
    { key: 'court', pick: ['ring'], at: [0, 0], court: true, chance: .35 },
  ] },
  // The hangar pad centred on the gun, beacons at its back corners, perhaps one cargo module.
  { id: 'pad', worlds: ['luna'], weight: 1, slots: [
    { key: 'pad', pick: ['pad'], at: [0, 0], court: true },
    { key: 'beaconL', pick: ['beacon'], swap: ['tank_s'], attach: { to: 'pad', side: 'back', gap: -.45, align: -1 } },
    { key: 'beaconR', pick: ['beacon'], swap: ['tank_s'], like: 'beaconL', attach: { to: 'pad', side: 'back', gap: -.45, align: 1 } },
    { key: 'cargo', pick: ['cargo'], attach: { to: 'pad', side: 'right', gap: .2, align: 1 }, chance: .5 },
  ] },
  // A compact cargo and power cluster to one side of the gun.
  { id: 'cargo', worlds: ['luna'], weight: 1, slots: [
    { key: 'main', pick: ['capsules', 'tank_l'], at: [1.2, -.3], anchor: [-1, -1] },
    { key: 'power', pick: ['power'], swap: ['cargo'], attach: { to: 'main', side: 'back', gap: .15, align: -1 } },
    { key: 'cargo', pick: ['cargo'], attach: { to: 'main', side: 'right', gap: .15, align: -1 } },
    { key: 'beacon', pick: ['beacon'], attach: { to: 'power', side: 'right', gap: .15 }, chance: .6 },
  ] },
  // Sheet 04's turret emplacement: the ring and two or three small pods on the back diagonals; nothing in front.
  { id: 'emplacement', worlds: ['luna'], weight: 1, slots: [
    { key: 'court', pick: ['ring'], at: [0, 0], court: true },
    { key: 'podL', pick: ['@small'], polar: 135, radius: 1.8 },
    { key: 'podR', pick: ['@small'], polar: 45, radius: 1.8 },
    { key: 'podB', pick: ['tank_s'], polar: 90, radius: 1.6, chance: .5 },
  ] },
  // Nacre: basins in a triangle (two at the front sides, one behind), channels toward the gun, the pool, a pump tower.
  { id: 'basins', worlds: ['nacre'], weight: 1.2, slots: [
    { key: 'pool', pick: ['pool', 'ring'], at: [0, 0], court: true },
    { key: 'basinL', pick: ['@basin'], at: [-2.3, -1.3], anchor: [1, 0] },
    { key: 'basinR', pick: ['@basin'], like: 'basinL', at: [2.3, -1.3], anchor: [-1, 0] },
    { key: 'basinB', pick: ['@basin'], at: [0, 2.4], anchor: [0, -1] },
    { key: 'chanL', pick: ['@pipe'], run: { axis: 'x', length: 2 }, attach: { to: 'basinL', side: 'right', gap: 0 }, chance: .9, group: 'channels' },
    { key: 'chanR', pick: ['@pipe'], run: { axis: 'x', length: 2 }, attach: { to: 'basinR', side: 'left', gap: 0 }, chance: .9, group: 'channels' },
    { key: 'chanB', pick: ['@pipe'], run: { axis: 's', length: 2 }, attach: { to: 'basinB', side: 'front', gap: 0 }, chance: .9 },
    { key: 'pump', pick: ['pump'], swap: ['pillar'], attach: { to: 'basinB', side: 'right', gap: .3 } },
    { key: 'stones', pick: ['stones'], attach: { to: 'basinB', side: 'left', gap: .3 }, chance: .5 },
  ] },
];
/** Arrangements by world and id (Vesper and Luna each have their own `pad`). */
const BY_ID = new Map(ARRANGEMENTS.flatMap(arrangement => arrangement.worlds.map(world => [`${world}:${arrangement.id}`, arrangement] as const)));
export const arrangementsOf = (world: FacilityWorld) => ARRANGEMENTS.filter(arrangement => arrangement.worlds.includes(world)).map(a => a.id);

export interface FacilitySeat { x: number; s: number; base: number }
export interface ModulePlacement { node: string; slot: string; x: number; s: number; yaw: number; top: number }
export interface FacilityPlant {
  world: FacilityWorld; arrangement: ArrangementId; mirrored: boolean;
  /** The gun's seat (world); module offsets are relative to it. */
  x: number; s: number;
  /** The plant's base height (the sink rule, from the tallest module actually placed) and that tallest top. */
  base: number; top: number;
  /** Where flat pieces (aprons, ring, pad, pool, channels) lie: the seat's ground, while buildings sink to `base`. */
  ground: number;
  modules: readonly ModulePlacement[];
  /** World rectangle covering every module, the gun's court and its sight apron: the terrain clearing. */
  bounds: Rect;
}
export interface FacilityContext {
  /** Every other ground target (world x, s): kept outside every module and in the camera's sight. */
  batteries?: readonly { x: number; s: number }[];
  /** District pads (docs/23 §4.8) a plant never covers. */
  reserved?: readonly Rect[];
  /** Plants already standing: kept `plantGap` clear, and the nearest one's arrangement is tried last. */
  plants?: readonly Pick<FacilityPlant, 'arrangement' | 'x' | 's' | 'bounds'>[];
  /** Half width the plant stays inside (default FACILITY_RULES.edge). */
  edge?: number;
}

// ── Seeded hashing: a stable function of (battery id, run seed, world), never shared with combat. ──
function mix(h: number, value: number) {
  h = Math.imul(h ^ (value | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
function textHash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const unit = (h: number) => h / 4294967296;
const rootOf = (world: FacilityWorld, id: number, seed: number) => mix(mix(mix(0x2545f491, id), seed), textHash(world));

/**
 * The arrangements in the order the composer tries them: a seeded weighted shuffle, with `avoid` (the nearest
 * plant's arrangement) moved last. The first entry is the plant's arrangement whenever it fits.
 */
export function arrangementOrder(world: FacilityWorld, id: number, seed: number, avoid?: ArrangementId): ArrangementId[] {
  const root = rootOf(world, id, seed);
  const order = ARRANGEMENTS.filter(a => a.worlds.includes(world))
    .map(a => ({ id: a.id, key: -Math.log(1 - unit(mix(root, textHash(a.id)))) / a.weight }))
    .sort((a, b) => a.key - b.key).map(a => a.id);
  const at = avoid ? order.indexOf(avoid) : -1;
  if (at >= 0 && order.length > 1) order.push(...order.splice(at, 1));
  return order;
}

// ── Footprints: oriented boxes in the local (x, s) plane. ──
interface Box { x: number; s: number; hx: number; hs: number; yaw: number }
const QUARTER = Math.PI / 2, DEG = Math.PI / 180;
function extent(hx: number, hs: number, yaw: number): [number, number] {
  const c = Math.abs(Math.cos(yaw)), n = Math.abs(Math.sin(yaw));
  return [c * hx + n * hs, n * hx + c * hs];
}
const rectOf = (box: Box): Rect => {
  const [ex, es] = extent(box.hx, box.hs, box.yaw);
  return { minX: box.x - ex, maxX: box.x + ex, minS: box.s - es, maxS: box.s + es };
};
/** Separating-axis test: true when the boxes interpenetrate more than `eps`. */
function boxesOverlap(a: Box, b: Box, eps: number) {
  const dx = b.x - a.x, ds = b.s - a.s;
  const radius = (box: Box, ux: number, us: number) => {
    const c = Math.cos(box.yaw), n = Math.sin(box.yaw);
    return box.hx * Math.abs(c * ux + n * us) + box.hs * Math.abs(-n * ux + c * us);
  };
  for (const yaw of [a.yaw, a.yaw + QUARTER, b.yaw, b.yaw + QUARTER]) {
    const ux = Math.cos(yaw), us = Math.sin(yaw);
    if (Math.abs(dx * ux + ds * us) >= radius(a, ux, us) + radius(b, ux, us) - eps) return false;
  }
  return true;
}
const rectsOverlap = (a: Rect, b: Rect, gap = 0) => a.minX - gap < b.maxX && a.maxX + gap > b.minX && a.minS - gap < b.maxS && a.maxS + gap > b.minS;
function pointNear(box: Box, x: number, s: number, margin: number) {
  const dx = x - box.x, ds = s - box.s, c = Math.cos(box.yaw), n = Math.sin(box.yaw);
  return Math.abs(dx * c + ds * n) < box.hx + margin && Math.abs(-dx * n + ds * c) < box.hs + margin;
}
const COURT: Box = { x: 0, s: 0, hx: FACILITY_RULES.court.x, hs: FACILITY_RULES.court.s, yaw: 0 };
/** The clearing always covers the court and an apron in front of the gun, so terrain scenery never stands in its sight. */
const SIGHT: Rect = { minX: -FACILITY_RULES.sight.x, maxX: FACILITY_RULES.sight.x, minS: -1.8, maxS: FACILITY_RULES.court.s };
/** Rule 2 for a gun at local (gx, gs): a module wholly in front of it and across its sight strip must stay low. */
function hidesGun(box: Box, top: number, gx: number, gs: number) {
  const { x, gun, slope, margin } = FACILITY_RULES.sight;
  const far = rectOf(box).maxS;
  if (far >= gs || !boxesOverlap(box, { x: gx, s: gs, hx: x, hs: 1e4, yaw: 0 }, 0)) return false;
  return top > gun + slope * (gs - far) - margin;
}

// ── Composition ──
interface Piece extends Box { key: string; module: FacilityModule; court: boolean; optional: boolean; run: boolean }
const isFlat = (module: FacilityModule) => !!module.flat || module.top <= FACILITY_RULES.court.flatTop;
/** The modules a template entry (names and `@roles`) stands for on a world. */
export function resolve(world: FacilityWorld, names: readonly string[]): FacilityModule[] {
  const out: FacilityModule[] = [];
  for (const name of names) for (const short of name.startsWith('@') ? PALETTE[world][name.slice(1)] ?? [] : [name]) {
    const module = MODULES_BY_NODE.get(`fk_${world}_${short}`);
    if (module && !out.includes(module)) out.push(module);
  }
  return out;
}
/** A quarter turn the module allows with this footprint (t, or the same footprint at t + 2), else null. */
function quarter(module: FacilityModule, turn: number): number | null {
  if (module.turns === 'free') return turn;
  for (const t of [turn, (turn + 2) % 4]) if (module.turns.includes(t as Turn)) return t;
  return null;
}
/** The module's yaw in this slot, or null when it cannot take the slot's orientation. */
function orient(module: FacilityModule, slot: Slot, h: number): number | null {
  if (slot.polar !== undefined) {
    if (module.turns === 'free') return (slot.polar - 90) * DEG;
    return quarter(module, 0) === 0 ? 0 : null;
  }
  if (slot.run) { const t = quarter(module, slot.run.axis === 'x' ? 0 : 1); return t === null ? null : t * QUARTER; }
  const turns = module.turns;
  if (turns === 'free') return unit(mix(h, 3)) * Math.PI * 2;
  const wanted = slot.turn === undefined ? (turns.length === 4 ? turns : [0]) : typeof slot.turn === 'number' ? [slot.turn] : slot.turn;
  const options = wanted.filter(t => turns.includes(t as Turn));
  return options.length ? options[Math.floor(unit(mix(h, 3)) * options.length)] * QUARTER : null;
}
function mirrorYaw(module: FacilityModule, yaw: number) {
  if (module.turns === 'free') return -yaw;
  return (quarter(module, (4 - Math.round(yaw / QUARTER) % 4) % 4) ?? 0) * QUARTER;
}

/** One pass over the template in the unmirrored frame; `excluded` optional slots are left out. */
function build(world: FacilityWorld, arrangement: Arrangement, root: number, limit: number, excluded: ReadonlySet<string>,
  dense: boolean): Piece[] | null {
  const placed = new Map<string, { rect: Rect; node: string }>(), pieces: Piece[] = [];
  for (const slot of arrangement.slots) {
    const optional = slot.chance !== undefined, h = mix(root, textHash(slot.key));
    if (excluded.has(slot.key)) continue;
    if (optional && !dense && unit(mix(root, textHash(slot.group ?? slot.key) ^ 0x5bd1e995)) >= slot.chance!) continue;
    // Rule 3: only modules low enough for this seat; the swap list stands in for tall ones.
    const fits = (names: readonly string[]) => resolve(world, names).filter(m => m.top <= limit && orient(m, slot, h) !== null);
    let candidates = fits(slot.pick);
    if (!candidates.length && slot.swap) candidates = fits(slot.swap);
    if (!candidates.length) { if (optional) continue; return null; }
    const liked = slot.like ? placed.get(slot.like)?.node : undefined;
    const module = candidates.find(m => m.node === liked) ?? candidates[Math.floor(unit(mix(h, 2)) * candidates.length)];
    const yaw = orient(module, slot, h)!;
    let [hx, hs] = extent(module.half[0], module.half[1], yaw);
    let offsets: [number, number][] = [[0, 0]];
    if (slot.run) {
      const period = module.tiles ?? module.half[0] * 2, n = Math.max(1, Math.round(slot.run.length / period));
      offsets = Array.from({ length: n }, (_, i) => {
        const d = (i - (n - 1) / 2) * period;
        return slot.run!.axis === 'x' ? [d, 0] : [0, d];
      });
      if (slot.run.axis === 'x') hx += (n - 1) / 2 * period; else hs += (n - 1) / 2 * period;
    }
    let x: number, s: number;
    if (slot.polar !== undefined) {
      const r = slot.radius ?? module.arc ?? 0;
      x = r * Math.cos(slot.polar * DEG); s = r * Math.sin(slot.polar * DEG);
    } else if (slot.attach) {
      const target = (typeof slot.attach.to === 'string' ? [slot.attach.to] : slot.attach.to).map(key => placed.get(key)).find(Boolean);
      if (!target) { if (optional) continue; return null; }
      const t = target.rect, gap = slot.attach.gap ?? .15, align = slot.attach.align ?? 0;
      const along = (min: number, max: number, half: number) => align < 0 ? min + half : align > 0 ? max - half : (min + max) / 2;
      const side = slot.attach.side;
      x = side === 'left' ? t.minX - gap - hx : side === 'right' ? t.maxX + gap + hx : along(t.minX, t.maxX, hx);
      s = side === 'front' ? t.minS - gap - hs : side === 'back' ? t.maxS + gap + hs : along(t.minS, t.maxS, hs);
    } else {
      const spot = slot.spots?.[Math.floor(unit(mix(h, 4)) * slot.spots.length)];
      const [ax, as] = spot ? [spot[2], spot[3]] : slot.anchor ?? [0, 0], [px, ps] = spot ?? slot.at ?? [0, 0];
      x = px - ax * hx; s = ps - as * hs;
    }
    placed.set(slot.key, { rect: { minX: x - hx, maxX: x + hx, minS: s - hs, maxS: s + hs }, node: module.node });
    for (const [ox, os] of offsets) pieces.push({ key: slot.key, module, x: x + ox, s: s + os, hx: module.half[0], hs: module.half[1], yaw,
      court: !!slot.court, optional, run: !!slot.run });
  }
  return pieces;
}

/**
 * Rules 1, 2 and 4 on a built layout (seat-local, mirrored). Offending optional slots are added to `drop`; a
 * required one fails the attempt (returns false).
 */
function check(pieces: readonly Piece[], seat: FacilitySeat, context: FacilityContext, drop: Set<string>) {
  const offend = (piece: Piece) => { if (!piece.optional) return false; drop.add(piece.key); return true; };
  const edge = context.edge ?? FACILITY_RULES.edge;
  for (const piece of pieces) {
    const top = piece.module.top, r = rectOf(piece);
    // Rule 1: the gun's court holds only flat modules. Rule 2: nothing hides the gun from the camera.
    if (!isFlat(piece.module) && boxesOverlap(piece, COURT, 0) && !offend(piece)) return false;
    if (hidesGun(piece, top, 0, 0) && !offend(piece)) return false;
    // Rule 4: inside the world, off district pads, clear of other plants, other batteries outside and in sight.
    const world = { minX: r.minX + seat.x, maxX: r.maxX + seat.x, minS: r.minS + seat.s, maxS: r.maxS + seat.s };
    let bad = world.minX < -edge || world.maxX > edge
      || (context.reserved ?? []).some(pad => rectsOverlap(world, pad))
      || (context.plants ?? []).some(plant => rectsOverlap(world, plant.bounds, FACILITY_RULES.plantGap));
    for (const gun of context.batteries ?? []) {
      const gx = gun.x - seat.x, gs = gun.s - seat.s;
      if (pointNear(piece, gx, gs, FACILITY_RULES.batteryMargin) || hidesGun(piece, top, gx, gs)) bad = true;
    }
    if (bad && !offend(piece)) return false;
  }
  // Modules never overlap one another; only the court piece may lie under others.
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const a = pieces[i], b = pieces[j];
    if (a.court || b.court || (a.run && a.key === b.key) || !boxesOverlap(a, b, FACILITY_RULES.overlap)) continue;
    if (!(b.optional ? offend(b) : offend(a))) return false;
  }
  return true;
}

const counted = (pieces: readonly Piece[]) => pieces.filter(p => p.module.roles[0] !== 'apron' && p.module.roles[0] !== 'ring').length;
const unionOf = (rects: readonly Rect[], seed: Rect) => rects.reduce((u, r) => ({ minX: Math.min(u.minX, r.minX), maxX: Math.max(u.maxX, r.maxX),
  minS: Math.min(u.minS, r.minS), maxS: Math.max(u.maxS, r.maxS) }), seed);
const toWorld = (r: Rect, seat: FacilitySeat): Rect => ({ minX: r.minX + seat.x, maxX: r.maxX + seat.x, minS: r.minS + seat.s, maxS: r.maxS + seat.s });
/** Rule 4 for one extra piece (a connector or an apron tile): world, pads, other plants, other batteries. */
function clearOutside(piece: Box, top: number, seat: FacilitySeat, context: FacilityContext, sight: boolean) {
  const edge = context.edge ?? FACILITY_RULES.edge, world = toWorld(rectOf(piece), seat);
  if (world.minX < -edge || world.maxX > edge) return false;
  if ((context.reserved ?? []).some(pad => rectsOverlap(world, pad))) return false;
  if ((context.plants ?? []).some(plant => rectsOverlap(world, plant.bounds, FACILITY_RULES.plantGap))) return false;
  return !(context.batteries ?? []).some(gun => pointNear(piece, gun.x - seat.x, gun.s - seat.s, FACILITY_RULES.batteryMargin)
    || (sight && hidesGun(piece, top, gun.x - seat.x, gun.s - seat.s)));
}

/** Single pipe (or channel) pieces bridging an axis-aligned gap one piece spans between two neighbouring modules. */
function connectors(world: FacilityWorld, pieces: readonly Piece[], seat: FacilitySeat, context: FacilityContext): Piece[] {
  const pipe = world === 'luna' ? undefined : resolve(world, ['@pipe'])[0];
  if (!pipe) return [];
  const span = pipe.tiles ?? pipe.half[0] * 2, added: Piece[] = [];
  const solid = pieces.filter(p => !isFlat(p.module) && !p.run);
  for (let i = 0; i < solid.length && added.length < GROUND.links; i++) for (let j = i + 1; j < solid.length && added.length < GROUND.links; j++) {
    const a = rectOf(solid[i]), b = rectOf(solid[j]);
    for (const axis of ['x', 's'] as const) {
      const [lo, hi] = axis === 'x' ? (a.maxX <= b.minX ? [a, b] : [b, a]) : (a.maxS <= b.minS ? [a, b] : [b, a]);
      const gap = axis === 'x' ? hi.minX - lo.maxX : hi.minS - lo.maxS;
      const from = axis === 'x' ? Math.max(a.minS, b.minS) : Math.max(a.minX, b.minX), to = axis === 'x' ? Math.min(a.maxS, b.maxS) : Math.min(a.maxX, b.maxX);
      if (gap < span - FACILITY_RULES.overlap * 2 || gap > span + .6 || to - from < .9) continue;
      const turn = quarter(pipe, axis === 'x' ? 0 : 1);
      if (turn === null) continue;
      const mid = axis === 'x' ? (lo.maxX + hi.minX) / 2 : (lo.maxS + hi.minS) / 2, across = (from + to) / 2;
      const piece: Piece = { key: `link${added.length}`, module: pipe, x: axis === 'x' ? mid : across, s: axis === 'x' ? across : mid,
        hx: pipe.half[0], hs: pipe.half[1], yaw: turn * QUARTER, court: false, optional: true, run: false };
      // Never across the gun's court or the sight apron in front of it.
      const sight = { x: (SIGHT.minX + SIGHT.maxX) / 2, s: (SIGHT.minS + SIGHT.maxS) / 2, hx: (SIGHT.maxX - SIGHT.minX) / 2, hs: (SIGHT.maxS - SIGHT.minS) / 2, yaw: 0 };
      if (boxesOverlap(piece, sight, 0) || hidesGun(piece, pipe.top, 0, 0)) continue;
      if ([...pieces, ...added].some(p => !p.court && boxesOverlap(p, piece, FACILITY_RULES.overlap))) continue;
      if (!clearOutside(piece, pipe.top, seat, context, true)) continue;
      added.push(piece);
    }
  }
  return added;
}

/** Ground slabs on the gun-aligned grid under the plant's modules (Luna has none). */
function aprons(world: FacilityWorld, pieces: readonly Piece[], seat: FacilitySeat, context: FacilityContext, within: Rect): Piece[] {
  const apron = resolve(world, ['apron'])[0];
  if (!apron) return [];
  const period = apron.tiles ?? apron.half[0] * 2, [hx, hs] = apron.half, out: Piece[] = [];
  // One clean lot: the rectangle around every building (plus the margin), and the gun's own court without it, so
  // the slab stops at the gun unless buildings stand in front of it (user review, 20 October).
  const buildings = pieces.filter(p => !p.court).map(rectOf);
  const hull = unionOf(buildings, buildings[0] ?? rectOf(COURT));
  const targets = [{ minX: hull.minX - GROUND.margin, maxX: hull.maxX + GROUND.margin, minS: hull.minS - GROUND.margin, maxS: hull.maxS + GROUND.margin }, rectOf(COURT)];
  for (let i = Math.ceil((within.minX + hx) / period - 1e-9); i * period + hx <= within.maxX + 1e-9; i++)
    for (let k = Math.ceil((within.minS + hs) / period - 1e-9); k * period + hs <= within.maxS + 1e-9 && out.length < GROUND.max; k++) {
      const tile: Piece = { key: 'apron', module: apron, x: i * period, s: k * period, hx, hs, yaw: 0, court: false, optional: true, run: true };
      const r = rectOf(tile);
      if (!targets.some(target => rectsOverlap(r, target, -.05))) continue;
      if (clearOutside(tile, apron.top, seat, context, false)) out.push(tile);
    }
  return out;
}

function attempt(world: FacilityWorld, arrangement: Arrangement, root: number, limit: number, mirrored: boolean,
  seat: FacilitySeat, context: FacilityContext): FacilityPlant | null {
  // First the seeded optional slots; a plant too sparse for its world then retries with every optional slot built.
  for (const dense of [false, true]) {
    const excluded = new Set<string>();
    for (let round = 0; round < 6; round++) {
      const built = build(world, arrangement, root, limit, excluded, dense);
      if (!built || !built.some(piece => !piece.court)) return null;
      const placed = mirrored ? built.map(p => ({ ...p, x: -p.x, yaw: mirrorYaw(p.module, p.yaw) })) : built;
      const drop = new Set<string>();
      if (!check(placed, seat, context, drop)) return null;
      if (drop.size) { drop.forEach(key => excluded.add(key)); continue; }
      const pieces = [...placed, ...connectors(world, placed, seat, context)];
      if (counted(pieces) < MIN_MODULES[world]) break;
      // The clearing (every module, the gun's court and its sight apron) keeps off pads and other plants too.
      const core = unionOf(pieces.map(rectOf), SIGHT), coreWorld = toWorld(core, seat);
      if ((context.reserved ?? []).some(pad => rectsOverlap(coreWorld, pad))) return null;
      if ((context.plants ?? []).some(plant => rectsOverlap(coreWorld, plant.bounds, FACILITY_RULES.plantGap))) return null;
      // Aprons may reach `slack` beyond the modules unless that brings the clearing onto a pad or another plant.
      let slabs = aprons(world, pieces, seat, context, { minX: core.minX - GROUND.slack, maxX: core.maxX + GROUND.slack,
        minS: core.minS - GROUND.slack, maxS: core.maxS + GROUND.slack });
      let bounds = toWorld(unionOf(slabs.map(rectOf), core), seat);
      if ((context.reserved ?? []).some(pad => rectsOverlap(bounds, pad)) || (context.plants ?? []).some(plant => rectsOverlap(bounds, plant.bounds, FACILITY_RULES.plantGap))) {
        slabs = aprons(world, pieces, seat, context, core);
        bounds = coreWorld;
      }
      const top = Math.max(...pieces.map(p => p.module.top));
      return {
        world, arrangement: arrangement.id, mirrored, x: seat.x, s: seat.s, base: plantBase(seat.base, top), top, ground: seat.base, bounds,
        modules: [...slabs, ...pieces].map(p => ({ node: p.module.node, slot: p.key, x: p.x, s: p.s, yaw: p.yaw, top: p.module.top })),
      };
    }
  }
  return null;
}

/** Whether this battery gets a plant at all on its world (PLANT_CHANCE), seeded like everything else. */
export const wantsPlant = (world: FacilityWorld, id: number, seed: number) =>
  unit(mix(rootOf(world, id, seed), 0x7f4a7c15)) < PLANT_CHANCE[world];
/** The arrangement this battery gets wherever its first choice fits, or null when its world leaves it without a plant. */
export const plannedArrangement = (world: FacilityWorld, id: number, seed: number) =>
  wantsPlant(world, id, seed) ? arrangementOrder(world, id, seed)[0] ?? null : null;

/**
 * Composes the plant around a battery, or returns null (the battery keeps its legacy emplacement). Tries the
 * arrangements in `arrangementOrder`, each in its seeded mirror and then the other; within one, offending optional
 * slots are dropped before giving up on it.
 */
export function composeFacility(world: FacilityWorld, id: number, seed: number, seat: FacilitySeat,
  context: FacilityContext = {}): FacilityPlant | null {
  if (!wantsPlant(world, id, seed)) return null;
  const limit = topLimit(seat.base);
  let nearest: ArrangementId | undefined, best = Infinity;
  for (const plant of context.plants ?? []) {
    const d = Math.hypot(plant.x - seat.x, plant.s - seat.s);
    if (d < best) { best = d; nearest = plant.arrangement; }
  }
  const root = rootOf(world, id, seed);
  for (const arrangementId of arrangementOrder(world, id, seed, nearest)) {
    const arrangement = BY_ID.get(`${world}:${arrangementId}`)!, branch = mix(root, textHash(arrangementId));
    const flip = unit(mix(branch, 0x51ed27)) < .5;
    for (const mirrored of [flip, !flip]) {
      const plant = attempt(world, arrangement, branch, limit, mirrored, seat, context);
      if (plant) return plant;
    }
  }
  return null;
}

/** Upper bound on one plant's instances of each node of a world (instance capacities). */
export function nodeBudget(world: FacilityWorld): Map<string, number> {
  const budget = new Map<string, number>();
  for (const arrangement of ARRANGEMENTS) {
    if (!arrangement.worlds.includes(world)) continue;
    const uses = new Map<string, number>();
    for (const slot of arrangement.slots) for (const module of resolve(world, [...slot.pick, ...(slot.swap ?? [])])) {
      const n = slot.run ? Math.max(1, Math.round(slot.run.length / (module.tiles ?? module.half[0] * 2))) : 1;
      uses.set(module.node, (uses.get(module.node) ?? 0) + n);
    }
    uses.forEach((n, node) => budget.set(node, Math.max(budget.get(node) ?? 0, n)));
  }
  const apron = resolve(world, ['apron'])[0], pipe = world === 'luna' ? undefined : resolve(world, ['@pipe'])[0];
  if (apron) budget.set(apron.node, GROUND.max);
  if (pipe) budget.set(pipe.node, (budget.get(pipe.node) ?? 0) + GROUND.links);
  return budget;
}
