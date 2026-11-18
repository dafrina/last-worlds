import {
  WORLD_HALF, bench, clamp, cliff, crispStep, hash, mix, noise, routeCalm, smooth, smoothRange, NEUTRAL_MOOD, type Landform, type MoodParams,
} from './terrain-layout';
import { FLOE_FOOTPRINT, FLOE_SETS, KIT, kitNodeName, type FloeSetKind, type KitInstance, type ScatterField } from './scenery-kit';
import { MODULE_HEIGHT, compoundSlot, districtLevel, type CompoundSlot } from './terrain-settlements';
import type { Archetype, PlacedModule, Settlement } from './settlement-geometry';
import type { Work } from './terrain-work';
import { cliffWallSteps } from './terrain-walls';
import { createScatterSink } from './scatter-sink';
import type { Floe, PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaAt, type TerrainArena } from './terrain-arena';
import { SEAT_A, SEAT_ROWS, SEAT_STEP, SEAT_X } from './stronghold-seat';
import { lensEye } from '../shared/lens';
import { VIEW } from '../shared/contracts';

/**
 * Vesper, the Glass Frontier (docs/17 §1, §4; docs/26): half land, half water since terrain version 15 (user,
 * 21 October; 70% land before). Flat-topped ice shelves at several levels end in sheer, fractured ice walls over a sea
 * at −3.6 (−1.2 before version 16: the lower sea makes the ice walls as tall as Khepri's canyons, user 21 October) and
 * are broken by open leads, fjord-like inlets and bays, with a pack-ice sea of drifting floes now and then. Crevasse fields,
 * pressure ridges, snow drifts and a few dark rock outcrops dress the shelves. Pure functions of seed and
 * world coordinates, like Khepri.
 */
/**
 * The whole Vesper level sits this much lower (sea, ice, outposts and pieces alike; user, 18 November: "Could we lower the
 * vesper sea and current terrain to have more room to scale the mountains?", as Amnion's did on 23 October; 1.25 that day,
 * 2.5 after "And yeah lower vesper" and 3.75 after "we can also lower the sea some more", the same day). A whole number of
 * grid steps, so every quarter-unit level (pads, shelves) keeps its place on the grid. Vesper's relief is still built in
 * its first frame (SEA0) and lowered as a whole.
 */
export const VESPER_DROP = 3.75;
const SEA0 = -3.6, DROP = VESPER_DROP;
export const VESPER_SEA_LEVEL = SEA0 - DROP;
const SEA = VESPER_SEA_LEVEL;
/**
 * The highest anything may stand over Vesper: the same 0.8 clearance under the flight plane (3.8) that Khepri's 2.2 kept
 * under the original plane at 3.0. HELION STRONGHOLD's mountains reach it; everything else on Vesper is lowered with the
 * level, under VESPER_PIECE_MAX.
 */
export const VESPER_SCENERY_MAX = 3.0;
/** The cap of Vesper's pieces and outposts (its shelf emplacements, cranes and masts), lowered with the level. */
export const VESPER_PIECE_MAX = VESPER_SCENERY_MAX - DROP;
/**
 * HELION STRONGHOLD's seat as built, past its arena's start (docs/17 §5): the model's origin (its foot at the sea, the
 * fortress's axis at x 0) as tools/blender/boss_stronghold.py builds it, where the release lens sees the reactor's aim point
 * on its combat target at the stop (the stop is 9 past `fromS`). Its plan (STRONGHOLD) and its measured top
 * (src/world/stronghold-seat.ts) are in this frame. (25.517 at the boss's row 11.5 before it moved closer, 17 November.)
 */
export const STRONGHOLD_BUILT_AT = 23.652;
/**
 * The fortress on a ledge (user, 18 November: "maybe have it sit on a middle layer, where theres cliff as now behind and
 * sideways of is as now, but also a cliff and mountain walls layer below it in front to accentuate that its a mountain"):
 * the model as built is lifted this much, by scaling it about the release lens's eye at the stop with the camera centred
 * (STRONGHOLD_EYE). Every point keeps its line of sight, so with the camera centred the fortress fills the same pixels and
 * each weak point still lies on its combat target, its terrace guns too (src/content/ark.ts); it stands nearer the eye, at
 * STRONGHOLD_SCALE of its built size, its top (the bridge, 1.61 as built) at 3.34, under the flight plane.
 */
// (2 until the user's "i thought we can also increase the fortresses height", 18 November: since the ship climbs over it
// after the kill, its rear and upper structure behind its targets may stand over the flight plane; its cannons, front
// terrace and door stay under it, the cannons' tops at 3.19. Its seat 2.5 higher, the ascent below it 2.5 taller.)
export const STRONGHOLD_LIFT = 4.5;
/** The sea level the model was built at (tools/blender/boss_stronghold.py, Vesper 1.25 lower): its frame's foot. */
export const STRONGHOLD_BUILT_SEA = SEA0 - 1.25;
/** The lens's eye with the camera centred at the stop: arena-relative s and height. */
const STRONGHOLD_EYE = (() => { const eye = lensEye(0); return { a: 9 + eye.s, y: eye.y }; })();
export const STRONGHOLD_SCALE = 1 - STRONGHOLD_LIFT / (STRONGHOLD_EYE.y - STRONGHOLD_BUILT_SEA);
/**
 * The fortress moved down the screen (user, 18 November: "really move the stronghold further down the screen, its so high
 * up"): its row 9 → 8.1 (src/content/ark.ts; 8.1 is the lowest its Needle launch waves allow: they fire 4.5 before its row
 * and must stay 3.5 before the player's, tests/sim/fairness.test.ts), the lifted model slid this much toward the camera
 * along s, so the reactor's aim (1.278 over the built foot) lands exactly on its moved target; the cannons, nearer the
 * flight plane, land 0.03 short of theirs (a slide moves a point's line of sight by less the higher it stands).
 */
export const STRONGHOLD_SLIDE = -0.9 * (STRONGHOLD_EYE.y - (STRONGHOLD_EYE.y + STRONGHOLD_SCALE * (STRONGHOLD_BUILT_SEA + 1.278 - STRONGHOLD_EYE.y)))
  / (STRONGHOLD_EYE.y - VIEW.flightHeight);
/**
 * Where the renderer seats the lifted model past its arena's start (its origin; its foot at STRONGHOLD_BASE), before, during
 * and after its fight; the arena's ground is shaped round it (strongholdGround). tests/world/stronghold-projection.test.ts
 * checks the model's weak points against their targets there.
 */
export const STRONGHOLD_AT = STRONGHOLD_EYE.a + STRONGHOLD_SCALE * (STRONGHOLD_BUILT_AT - STRONGHOLD_EYE.a) + STRONGHOLD_SLIDE;
export const STRONGHOLD_BASE = STRONGHOLD_BUILT_SEA + STRONGHOLD_LIFT;
/** Arena-relative s and a height of the built frame as lifted (and slid). */
const lifted = (a: number) => STRONGHOLD_EYE.a + STRONGHOLD_SCALE * (a - STRONGHOLD_EYE.a) + STRONGHOLD_SLIDE;
const liftedHeight = (h: number) => STRONGHOLD_EYE.y + STRONGHOLD_SCALE * (h - STRONGHOLD_EYE.y);
/** World x and arena-relative s back in the built frame. */
const builtX = (x: number) => x / STRONGHOLD_SCALE, builtA = (a: number) => STRONGHOLD_EYE.a + (a - STRONGHOLD_SLIDE - STRONGHOLD_EYE.a) / STRONGHOLD_SCALE;

/* ---------------------------------------------------------------- moods */

export type VesperMood = 'shelf' | 'pack' | 'crevasse' | 'radiator' | 'icefall' | 'nunatak';
export const VESPER_MOODS: readonly VesperMood[] = ['shelf', 'pack', 'crevasse', 'radiator', 'icefall', 'nunatak'];
export interface VesperParams {
  /** Share of land (shelf ice). */ land: number;
  /** Open leads cutting through the shelves. */ leads: number;
  /** Crevasse fields. */ crevasse: number;
  /** Pressure ridges. */ ridge: number;
  /** Dark rock outcrops and nunataks. */ rock: number;
  /** Floes and icebergs on open water. */ floes: number;
  /** Typical shelf top height. */ top: number;
  /** Height of one ice-cliff step between shelf levels (docs/26 §4). */ step: number;
  /** How far the shelves climb inland from the coast, in levels. */ stairs: number;
  /** Wide, winding sea inlets (fjords) cutting into the shelves (version 15). */ inlets: number;
  /** Ice plateaus: tabular blocks standing a tier or two over the shelf on sheer walls (version 16). */ mesa: number;
}
/**
 * Land shares measured over long routes (seeds 93, 8831, 11, 4242, 7; docs/26 §4): the six moods and the inlets keep
 * the planet at about 50% land (0.49–0.51 per seed). Shelves stand at several levels: low ice feet at the coast, stepping up inland in ice cliffs.
 */
const MOOD_SETTINGS: Readonly<Record<VesperMood, VesperParams>> = {
  // (Version 16, user 21 October, "more elevation and crazy landscaping": the sea is 2.4 lower, so the tops come down
  // with it while the highest shelves stay near the cap; the levels step in taller cliffs; ice plateaus rise above them.)
  // Shelf coast: big shelves and their cliffs against open water, leads and scattered floes.
  shelf: { land: 0.5, leads: 0.75, crevasse: 0.3, ridge: 0.4, rock: 0.45, floes: 0.5, top: -0.7, step: 1.6, stairs: 1.6, inlets: 0.9, mesa: 0.5 },
  // Pack-ice sea: mostly water crowded with floes and bergs, a few low shelf islands.
  pack: { land: 0.2, leads: 0.3, crevasse: 0.1, ridge: 0.5, rock: 0.2, floes: 1, top: -1.9, step: 1.1, stairs: 0.8, inlets: 0.2, mesa: 0.2 },
  // Crevasse plateau: a high continuous shelf torn by crevasse fields.
  crevasse: { land: 0.68, leads: 0.4, crevasse: 1, ridge: 0.45, rock: 0.25, floes: 0.35, top: 0.5, step: 1.7, stairs: 1.4, inlets: 0.4, mesa: 0.4 },
  // Radiator plains: broad, quiet shelves at two or three levels (the factions' radiator fields).
  radiator: { land: 0.62, leads: 0.5, crevasse: 0.15, ridge: 0.2, rock: 0.3, floes: 0.45, top: -0.4, step: 1.8, stairs: 1.2, inlets: 0.5, mesa: 0.3 },
  // Icefall: an ice plateau stepping up in many short cliffs, with pressure ridges along the steps.
  icefall: { land: 0.54, leads: 0.45, crevasse: 0.55, ridge: 0.7, rock: 0.35, floes: 0.4, top: -0.2, step: 1.2, stairs: 2.6, inlets: 0.6, mesa: 0.7 },
  // Nunataks: dark rock peaks breaking through the ice, snow-capped, between broad shelves.
  nunatak: { land: 0.48, leads: 0.5, crevasse: 0.3, ridge: 0.3, rock: 1, floes: 0.45, top: -0.8, step: 1.5, stairs: 1.4, inlets: 0.8, mesa: 0.5 },
};
const MOOD_LENGTH = 96, MOOD_BLEND = 26;
function permutation(seed: number, block: number): VesperMood[] {
  const order = [...VESPER_MOODS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed ^ 0x7e590, block, i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
/** Shuffled blocks of every mood, never the same mood twice in a row. */
function shuffledMood(seed: number, segment: number): VesperMood {
  const block = Math.floor(segment / VESPER_MOODS.length), raw = permutation(seed, block);
  const previousLast = permutation(seed, block - 1)[VESPER_MOODS.length - 1];
  if (raw[0] === previousLast) [raw[0], raw[1]] = [raw[1], raw[0]];
  return raw[segment - block * VESPER_MOODS.length];
}
/** Share of blocks that keep their pack-ice sea; the others turn it into a shelf mood (Vesper is mostly land). */
const PACK_BLOCKS = 1 / 2;
/**
 * Vesper moods along the route: shelf coast, crevasse plateau, radiator plains, icefalls and nunataks, with a pack-ice
 * sea in about every other block. A dropped pack-ice segment takes a land mood unlike both its neighbours, so the
 * same mood still never comes twice in a row.
 */
export function vesperMoodOf(seed: number, segment: number): VesperMood {
  const mood = shuffledMood(seed, segment), block = Math.floor(segment / VESPER_MOODS.length);
  // The opening segment is never a pack-ice sea: a run starts over land.
  if (mood !== 'pack' || (segment > 0 && hash(seed ^ 0x7e591, block, 0) < PACK_BLOCKS)) return mood;
  const before = shuffledMood(seed, segment - 1), after = shuffledMood(seed, segment + 1);
  const choices = (['shelf', 'crevasse', 'radiator', 'icefall', 'nunatak'] as const).filter(other => other !== before && other !== after);
  return choices[Math.floor(hash(seed ^ 0x7e592, segment, 0) * choices.length)];
}
const VESPER_KEYS = Object.keys(MOOD_SETTINGS.shelf) as (keyof VesperParams)[];
export function vesperParams(seed: number, s: number): VesperParams {
  const segment = Math.floor(s / MOOD_LENGTH), local = s - segment * MOOD_LENGTH;
  const t = smoothRange(MOOD_LENGTH - MOOD_BLEND, MOOD_LENGTH, local), a = MOOD_SETTINGS[vesperMoodOf(seed, segment)];
  if (t <= 0) return a;
  const b = MOOD_SETTINGS[vesperMoodOf(seed, segment + 1)], out = { ...a };
  for (const key of VESPER_KEYS) out[key] = mix(a[key], b[key], t);
  return out;
}
/** Khepri mood parameters are not used on Vesper; rows carry a neutral set for shared code. */
const NEUTRAL: MoodParams = NEUTRAL_MOOD;

/* ---------------------------------------------------------------- landform */

const ridged = (value: number) => { const r = 1 - Math.abs(2 * value - 1); return r * r; };
/** Prevailing wind direction in (x, s): drifts and sastrugi line up with it. */
const WIND_X = 0.83, WIND_S = 0.56;
/** Shelf masses at a point: warped large-scale noise (the land mask and the shelf levels both read it). */
function shelfMass(seed: number, x: number, s: number) {
  const qx = x + (noise(seed ^ 0x9a1, x * 0.035, s * 0.03) - 0.5) * 14, qs = s + (noise(seed ^ 0x9a2, x * 0.035 + 4.1, s * 0.03) - 0.5) * 14;
  const mass = noise(seed ^ 0x9a3, qx * 0.045, qs * 0.04) * 0.64 + noise(seed ^ 0x9a4, qx * 0.11, qs * 0.1) * 0.26 + noise(seed ^ 0x9a5, qx * 0.32, qs * 0.3) * 0.1;
  return { qx, qs, mass };
}
/** Land threshold of the mass (raised on an ocean arena, so shelf edges recede and keep their cliffs). */
const landThreshold = (p: VesperParams, platform: number) => mix(mix(0.66, 0.3, p.land), 1.4, platform);
/** Vesper's own masks at a point (shared by landform, colour and scatter). */
export function vesperMasks(seed: number, x: number, s: number, p: VesperParams, platform: number) {
  const calm = routeCalm(seed, x, s), { qx, qs, mass } = shelfMass(seed, x, s);
  const threshold = landThreshold(p, platform);
  // Sheer cliffs: membership flips within a few tenths of a unit. `land` is the soft mask (colour and scatter);
  // `edge` shapes the height: the same waterline, then straight up into a hard rim crease (version 14, docs/26 §10).
  const coast = (mass - threshold) / 0.024 + 0.5;
  let land = smoothRange(-1, 1, (mass - threshold) / 0.012), edge = crispStep(coast);
  // Open leads: narrow winding water channels across the shelves, their banks crisp too.
  const leadDistance = Math.abs(noise(seed ^ 0x9a6, qx * 0.05, qs * 0.044) - 0.5), leads = smoothRange(0.15, 0.4, p.leads);
  const lead = (1 - smoothRange(0.01, 0.032, leadDistance)) * leads;
  land *= 1 - lead; edge *= 1 - (1 - crispStep((leadDistance - 0.01) / 0.022)) * leads;
  // Fjord-like inlets (version 15): wide winding arms of the sea reaching into the shelves, sheer-walled too.
  const inletDistance = Math.abs(noise(seed ^ 0x9b9, qx * 0.026, qs * 0.022) - 0.5), inlets = Math.min(1, p.inlets);
  land *= 1 - (1 - smoothRange(0.02, 0.05, inletDistance)) * inlets; edge *= 1 - (1 - crispStep((inletDistance - 0.02) / 0.03)) * inlets;
  const field = smoothRange(0.42, 0.62, noise(seed ^ 0x9a9, x * 0.05 + 2.3, s * 0.05)) * Math.min(1, p.crevasse * 1.4) * (1 - calm * 0.85);
  // Crevasses: sheer-sided cracks with hard lips, in sets running diagonally across the flight line (version 13's ran
  // along it, long straight stripes down the view).
  const crackU = qx * 0.8 + qs * 0.6, crackV = qs * 0.8 - qx * 0.6;
  const crack = (1 - cliff((Math.abs(noise(seed ^ 0x9aa, crackU * 0.11, crackV * 0.34) - 0.5) - 0.008) / 0.026)) * field;
  // Rock keeps a unit or two back from every coast, lead and inlet (version 18): where it reached a shelf edge the
  // cliff had no ice wall (rock faces keep none) and its bare heightfield face read as a dark, blurred smear.
  const inland = smoothRange(0.03, 0.1, mass - threshold) * (1 - (1 - smoothRange(0.04, 0.12, leadDistance)) * leads)
    * (1 - (1 - smoothRange(0.06, 0.13, inletDistance)) * inlets);
  const ridge = smoothRange(0.78, 0.97, ridged(noise(seed ^ 0x9a8, qx * 0.09, qs * 0.13))) * Math.min(1, p.ridge * 1.6) * (1 - calm * 0.7);
  const rock = smoothRange(0.68, 0.86, noise(seed ^ 0x9ab, x * 0.16, s * 0.15)) * Math.min(1, p.rock * 1.6) * (1 - calm * 0.6) * inland;
  // Wind-packed dunes: long, low ridges aligned with the prevailing wind (from the upper left), finite in length.
  const along = x * WIND_X + s * WIND_S, across = -x * WIND_S + s * WIND_X;
  const dune = smoothRange(0.5, 0.85, noise(seed ^ 0x9af, along * 0.07, across * 0.36)) * smoothRange(0.3, 0.7, noise(seed ^ 0x9b0, x * 0.04, s * 0.04));
  return { land, edge, crack, ridge, rock, mass, dune, threshold, calm, qx, qs };
}

/* ---------------------------------------------------------------- the stronghold's mountains */

/**
 * HELION STRONGHOLD's arena (docs/17 §4). The user, 17 November: "the vesper boss should not be a rock/cliff/mountain next
 * to water, it should go from snowy/icy terrain to high alpine mountains (as well as possible)", then "have the terrain
 * around the mountains be just above sea level" and "obviously dont make it plain". Only rows of a Vesper boss arena
 * (`row.arena`) change, everything in arena-relative s:
 * - the low ground: from the approach on, Vesper's own landform is pressed down to just above the sea (`low`, `squash`):
 *   its shelves become low ice shelves with small breaks, its leads stay open dark water, its crevasses, pressure ridges,
 *   drifts and dark rock stay, frozen pools lie on the flats, and the land share rises so the sea keeps to leads and
 *   pockets; round the fortress the ground never opens to the sea;
 * - the mountains: an alpine massif (warped ridged noise: sharp crests, couloirs) rises from that low ground at the sides,
 *   beside the fortress and in a shoulder just behind it, its steep faces dark stone and its shoulders snow (vesperColor
 *   reads its tone). It keeps out of the corridor the fight and the departure fly over, and stays well under the flight
 *   plane over the play area; beyond the world's edges its peaks rise higher (ground there never hides the flight plane:
 *   the eye stays over the world, and the lines of sight to the flight plane only cross ground nearer the eye);
 * - the fortress stands at the head of the corridor, the shoulder and the side massifs round it; the ground fits its model's
 *   measured top (STRONGHOLD_SEAT), so every cut edge is buried and nothing shows through it;
 * - past the fight the corridor runs on low under the departure, the massifs come down, and Vesper's own terrain returns.
 */
const STRONGHOLD = {
  /** Where the low ground takes over past the arena's start, and where Vesper's own terrain comes back. */
  land: [-46, -16], back: [78, 98],
  /** The low ground: Vesper's land top from SHELF_LOW pressed to `low` (just above the sea) by `squash`. */
  low: SEA + 0.45, squash: 0.2,
  /**
   * The alpine mood (user, 18 November: "you may also start the alpine mood before the boss, not that it starts open snow
   * field then boom mountain"): from `rise[0]` distant ranges at the world's sides and edges, then rockier, snowier ground
   * and foothills (`rocky`), the tall peaks round and behind the fortress from `tall[0]` past the plan's front; all of it
   * comes down from `fall[0]`.
   */
  rise: [-118, -60], rocky: [-100, -30], tall: [-3, 0.5], fall: [62, 82],
  /** The corridor kept clear of the massifs (half widths): wide open, at the approach's end, beside the fortress, its pass. */
  corridor: [15.5, 9.5, 8.2, 7, 8.5],
  /**
   * The shoulder behind the fortress's roof: its crest past the plan's back and its depth into the massif there. (Until 18
   * November it kept under the roof, at 0.6, and the corridor behind it was a pass floor: both came out flat.)
   */
  shoulder: [3, 2.2],
  /**
   * The rear of the fortress embedded in its mountain (user, 18 November: "the stronghold should clip into the mountain
   * walls slightly on its backside so it really looks like part of the mountain"): over this band before the plan's back,
   * and the wider one at its outer rear corners, the rock rises against and over the model.
   */
  embed: [1.4, 3.2, 1.4],
  /**
   * The massif: its foot (the foothills', then the tall peaks'; its relief climbs from it to its top), the foothills' tops at the
   * world's edges (far, then near), the peaks' top. (Its relief was 3.6 over the foot, soft-capped, until 18 November.)
   */
  base: [SEA + 2.4, SEA + 4.4], foothills: [-2.6, -0.4], peak: VESPER_SCENERY_MAX,
  /**
   * The peaks behind the fortress, beyond the fight's play area: their summits' top, well over the flight plane (18 November:
   * 6.5, then 9 after "you can now increase vertical space even more right?"; the ship's departure climb clears it).
   */
  crag: 9,
  /**
   * Beyond the world's edges its ranges rise this much more, to `summit` at most (far, then near): no ground there ever hides
   * the flight plane (0.6 … 3.4 until 18 November).
   */
  beyond: 3, summit: [2, 6.5],
  /**
   * The fortress's plan (the model's own: tools/blender/boss_stronghold.py, its origin at STRONGHOLD_AT, the sea its z 0),
   * where no scenery stands: its front, its back behind the roof; half width over the terrace and the housings, then over
   * the roof. (The ground itself fits the model's measured top: STRONGHOLD_SEAT.)
   */
  front: 23.2, rear: 31, wide: 6.6, narrow: 5.1, waist: [27.6, 28.1],
  /** The ground just before the barrels and housings (half width, from) stays low: the mountain there could hide them. */
  barrels: [6.1, 17],
} as const;
/**
 * Over HELION STRONGHOLD's mountain, pieces stand to the scenery cap up to this far past the arena's start (the fight's play
 * area reaches 28.8, its view's top at the stop), and to the peaks' top (STRONGHOLD.crag) behind it, which the ship climbs
 * over after the kill. Its walls stand between MASSIF_WALLS past the arena's start (the approach's foothills to the jump).
 */
const MASSIF_PLAY_TOP = 30, MASSIF_WALLS = [-24, 86] as const;
/**
 * The fortress's plan about its seat (STRONGHOLD_AT) as seated: half width, front (its plinth's; the barrels jut out 1.95 over
 * the ledge, where only its works stand, src/world/stronghold-works.ts) and back (tools/blender/boss_stronghold.py bounds,
 * scaled onto its ledge). The renderer hides scenery whose box reaches into it (src/render/stronghold-view.ts).
 */
export const STRONGHOLD_FOOTPRINT = { halfWidth: 6.62 * STRONGHOLD_SCALE, front: 0.5 * STRONGHOLD_SCALE, back: 7.55 * STRONGHOLD_SCALE } as const;
/**
 * The fortress's ledge as seated, for the works round it (src/world/stronghold-works.ts): its plan's front past the arena's
 * start, its half width there, and the ledge's level (the model's foot).
 */
export const STRONGHOLD_LEDGE = { front: lifted(STRONGHOLD.front), half: STRONGHOLD.wide * STRONGHOLD_SCALE, level: liftedHeight(STRONGHOLD_BUILT_SEA + 0.15) } as const;
/**
 * The ground round and under the model, from its measured top (src/world/stronghold-seat.ts), built once: under it the
 * ground keeps 0.3 below the lowest top within half a unit (so it never shows through the model, nor across its walls);
 * outside it, the nearest top and the distance to it, out to SEAT_REACH (the ground meets the model at its edge's height
 * there, covering the cut faces, and climbs from it).
 */
const SEAT_REACH = 4.5;
let seat: { under: Float32Array; edge: Float32Array; reach: Float32Array; columns: number; rows: number; x0: number; a0: number } | null = null;
function seatField() {
  if (seat) return seat;
  const rows = SEAT_ROWS.length, columns = SEAT_ROWS[0].length, top = new Float32Array(rows * columns).fill(NaN);
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const code = SEAT_ROWS[j].charCodeAt(i);
    if (code !== 46) top[j * columns + i] = (code - 48) / 10 - 4;
  }
  // The field covers the table and SEAT_REACH round it.
  const pad = Math.round(SEAT_REACH / SEAT_STEP), fc = columns + 2 * pad, fr = rows + 2 * pad;
  const under = new Float32Array(fc * fr).fill(NaN), edge = new Float32Array(fc * fr), reach = new Float32Array(fc * fr).fill(Infinity);
  const sites: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) if (!Number.isNaN(top[j * columns + i])) sites.push(i, j);
  // A gap inside the model's outline (model on both sides of it along its row and its column: between the roof and a
  // housing, say) is under the model too: the ground keeps below the tops round it, never filling it.
  const defined = (i: number, j: number) => i >= 0 && j >= 0 && i < columns && j < rows && !Number.isNaN(top[j * columns + i]);
  const enclosed = (i: number, j: number) => {
    let sides = 0;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let k = 1; k <= 8; k++) if (defined(i + di * k, j + dj * k)) { sides++; break; }
    return sides === 4;
  };
  for (let j = 0; j < fr; j++) for (let i = 0; i < fc; i++) {
    const ti = i - pad, tj = j - pad, at = j * fc + i;
    if (defined(ti, tj) || (ti >= 0 && tj >= 0 && ti < columns && tj < rows && enclosed(ti, tj))) {
      let low = Infinity, near = -Infinity;
      for (let r = 2; r <= 6 && low === Infinity; r += 2) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (defined(ti + di, tj + dj)) { const h = top[(tj + dj) * columns + ti + di]; low = Math.min(low, h); near = Math.max(near, h); }
      }
      // (Never under the sea: the model's front stands on it, open underneath.)
      under[at] = Math.max(low - 0.3, STRONGHOLD_BUILT_SEA + 0.15); edge[at] = defined(ti, tj) ? top[tj * columns + ti] : near; reach[at] = 0;
      continue;
    }
    for (let k = 0; k < sites.length; k += 2) {
      const d = Math.hypot(sites[k] - ti, sites[k + 1] - tj) * SEAT_STEP;
      if (d < reach[at]) { reach[at] = d; edge[at] = top[sites[k + 1] * columns + sites[k]]; }
    }
  }
  return seat = { under, edge, reach, columns: fc, rows: fr, x0: -SEAT_X - pad * SEAT_STEP, a0: SEAT_A - pad * SEAT_STEP };
}
/**
 * The seat at a point (arena-relative s): `under` the ground's ceiling under the model (NaN off it), `edge` the nearest
 * top of the model and `reach` the distance to it (Infinity beyond SEAT_REACH).
 */
function seatAt(x: number, a: number): { under: number; edge: number; reach: number } {
  const f = seatField(), u = (x - f.x0) / SEAT_STEP, v = (a - f.a0) / SEAT_STEP;
  if (u < 0 || v < 0 || u > f.columns - 1 || v > f.rows - 1) return { under: NaN, edge: 0, reach: Infinity };
  const i = Math.min(f.columns - 2, Math.floor(u)), j = Math.min(f.rows - 2, Math.floor(v)), fu = u - i, fv = v - j;
  const at = j * f.columns + i, corners = [at, at + 1, at + f.columns, at + f.columns + 1], weights = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv];
  let under = 0, edge = 0, reach = 0;
  // (A corner that carries no weight is left out, to rounding: off the model its `under` is NaN.)
  for (let k = 0; k < 4; k++) if (weights[k] > 1e-6) { under += f.under[corners[k]] * weights[k]; edge += f.edge[corners[k]] * weights[k]; reach += Math.min(f.reach[corners[k]], SEAT_REACH + 1) * weights[k]; }
  return { under, edge, reach: reach > SEAT_REACH ? Infinity : reach };
}
/** Units outside the fortress's plan (x and arena-relative s in the built frame; negative inside it). */
function fortressOutside(x: number, a: number): number {
  const c = STRONGHOLD, half = mix(c.wide, c.narrow, smoothRange(c.waist[0], c.waist[1], a));
  const dx = Math.abs(x) - half, ds = Math.max(c.front - a, a - c.rear);
  return dx > 0 && ds > 0 ? Math.hypot(dx, ds) : Math.max(dx, ds);
}
/**
 * Whether a point is clear of the fortress (its plan, and unless `barrels` is false its barrels over the valley in front),
 * by `margin`.
 */
export function strongholdClear(arena: TerrainArena | undefined, x: number, s: number, margin = 0, barrels = true): boolean {
  if (!arena) return true;
  const bx = builtX(x), a = builtA(s - arena.fromS);
  return fortressOutside(bx, a) > margin + .3 && !(barrels && Math.abs(bx) < STRONGHOLD.wide + margin && a > STRONGHOLD.front - 2 - margin && a < STRONGHOLD.rear);
}
/**
 * The massif's relief (0 … 1): domain-warped ridged noise, ridges with sharp crests over broad snowy valleys, and crags
 * along them.
 */
function alpine(seed: number, x: number, a: number): number {
  const wx = x + (noise(seed ^ 0x5721, x * 0.07, a * 0.06) - 0.5) * 7, wa = a + (noise(seed ^ 0x5722, x * 0.07 + 3.7, a * 0.06) - 0.5) * 7;
  const crest = (n: number) => 1 - Math.abs(2 * n - 1);
  const r1 = smoothRange(0.3, 0.97, crest(noise(seed ^ 0x5723, wx * 0.19, wa * 0.16)));
  const r2 = smoothRange(0.4, 1, crest(noise(seed ^ 0x5724, wx * 0.43, wa * 0.4)));
  return r1 * 0.82 + r2 * 0.18 * (0.3 + 0.7 * r1);
}
/** HELION STRONGHOLD's ground at a point of its arena (see STRONGHOLD); null away from it. */
export interface StrongholdGround {
  /** How far the low ground has taken over (1 through the arena), and the rockier, snowier ground before it. */
  land: number; rocky: number;
  /** A frozen pool's share at the point (on the low ground's flats). */
  pool: number;
  /** The massif's share, its ground and its tone (1 plus its rock share: vesperColor's massif stone). */
  massif: number; height: number; tone: number;
  /** The highest the ground may stand under and round the model, and the lowest at its edge (burying its cut faces). */
  cap: number; bury: number;
  /** The highest the ground may stand here. */
  ceiling: number;
  /** The fortress's ledge and its cliff's share at the point (1 on them). */
  ledge: number;
}
/**
 * How far the fortress's ledge runs out before its plan's front at world x (user, 18 November: "maybe dont make it a hard rule
 * to have cliffs right in front of the fortress, but make it so it can also appear mid screen, like the area of the middle
 * ledge is not fixed"): the arena's own, from the seed and the arena, from just below the fortress to past mid-screen,
 * tilted across the view and curving (its spurs and bays are the cliff's own, in strongholdGround).
 */
export function strongholdReach(arena: TerrainArena, seed: number, x: number): number {
  const h = (k: number) => hash(seed ^ 0x5750, Math.round(arena.fromS * 4), k);
  const out = 0.35 + 1.9 * h(0), tilt = (h(1) - 0.5) * 0.2;
  const curve = (noise(seed ^ 0x5751, x * 0.18, arena.fromS * 0.01) - 0.5) * 1.4;
  return Math.max(0.25, out + tilt * x + curve);
}
/**
 * One drop of the fortress's cliff: its share of the whole drop, its face's run, the tier below it (the last has none), and
 * how its face bites into its rim (the exponent of its profile: lower is sheerer at the rim).
 */
interface CliffStep { share: number; run: number; tier: number; bite: number }
/**
 * The drops from the fortress's ledge to the low ground at world x (user, 18 November: "make them more varied, jagged, maybe a
 * second or third layer too", then "It looks to staggered and even, put some rocky cliffs and make it more jagged"): the
 * arena's own count (three to five), each band its own height varying along x (a tall face here, a low step there), faces
 * sheer on buttresses and drawn out in gullies, and each tier's width wandering along x on its own, so the faces are offset
 * rather than stacked in parallel: a tier pinches out where two faces merge into one taller face and widens into a shelf
 * elsewhere. (Until 18 November, v8, the shares and tiers varied little along x and the bands echoed the ledge's outline.)
 */
function strongholdSteps(arena: TerrainArena, seed: number, x: number, buttress: number, gully: number): CliffStep[] {
  const h = (k: number) => hash(seed ^ 0x5753, Math.round(arena.fromS * 4), k);
  const count = 3 + (h(0) < 0.4 ? 0 : h(1) < 0.6 ? 1 : 2), steps: CliffStep[] = [];
  let left = 1;
  for (let k = 0; k < count; k++) {
    const share = k === count - 1 ? left
      : left * clamp(1 / (count - k) + (h(2 + k) - 0.5) * 0.4 + (noise(seed ^ (0x5754 + k), x * 0.33 + k * 3.1, 0.5) - 0.5) * 0.55, 0.12, 0.75);
    left -= share;
    const run = (0.3 + 0.65 * noise(seed ^ (0x5758 + k), x * 0.9, 1.5)) * mix(1, 0.5, buttress) * mix(1, 2, gully);
    const pinch = mix(0.06, 1.75, smoothRange(0.3, 0.72, noise(seed ^ (0x575c + k), x * 0.3 + k * 7.3, 2.5)));
    const tier = k === count - 1 ? 0 : (0.9 + 1.5 * h(7 + k)) * pinch * (0.8 + 0.4 * noise(seed ^ (0x5760 + k), x * 1.1, 3.5));
    steps.push({ share, run, tier, bite: 0.35 + 0.45 * noise(seed ^ (0x5768 + k), x * 1.7, 4.5) });
  }
  return steps;
}
/**
 * Rock needles standing on the ascent's tiers and spurs (user, 18 November: "make it more jagged"): their height over the
 * ground at world x and `u` units out from the ledge's edge, from a jittered lattice in (x, u).
 */
function strongholdNeedles(seed: number, arena: TerrainArena, x: number, u: number): number {
  const salt = seed ^ 0x5769, k = Math.round(arena.fromS * 4), cx = 2.1, cu = 1.6;
  let top = 0;
  for (let i = Math.floor(x / cx) - 1; i <= Math.floor(x / cx) + 1; i++) for (let j = Math.floor(u / cu) - 1; j <= Math.floor(u / cu) + 1; j++) {
    const h = (n: number) => hash(salt, i * 131 + j * 7 + k, n);
    if (h(0) > 0.34) continue;
    const px = (i + 0.2 + 0.6 * h(1)) * cx, pu = (j + 0.2 + 0.6 * h(2)) * cu, r = 0.35 + 0.35 * h(3);
    const d = Math.hypot(x - px, (u - pu) * 1.2) / r;
    if (d < 1) top = Math.max(top, (1 - d) ** 1.3 * (0.6 + 1.1 * h(4)));
  }
  return top;
}
export function strongholdGround(arena: TerrainArena | undefined, seed: number, x: number, s: number): StrongholdGround | null {
  if (!arena) return null;
  const c = STRONGHOLD, a = s - arena.fromS, ax = Math.abs(x);
  if (a < c.rise[0] - 8 || a > c.back[1] + 8) return null;
  // Ragged fronts: where the low ground takes over and where Vesper's own terrain comes back wander along x.
  const land = smoothRange(c.land[0], c.land[1], a + (noise(seed ^ 0x5731, x * 0.12, 0.5) - 0.5) * 12)
    * (1 - smoothRange(c.back[0], c.back[1], a + (noise(seed ^ 0x5732, x * 0.12, 1.5) - 0.5) * 12));
  // Into the massif: past the corridor's side (narrowing over the approach to the fortress, a pass behind it, wider again past
  // it), in the shoulder behind the fortress's roof, or round its sides; broken into spurs and bays, and kept back from the
  // ground before its barrels. Past the fortress the fronts where the tall peaks end and the massifs come down wander along x
  // (`aw`), so none of them crosses the departure's view in a straight line.
  const aw = a + (noise(seed ^ 0x573b, x * 0.09, 2.5) - 0.5) * 10;
  // (The fortress's own plan, its seat and the rock round it are in the built frame, `bx` and `ba`; its front and rear as
  // lifted mark the corridor's and the peaks' changes.)
  const bx = builtX(x), ba = builtA(a), bax = Math.abs(bx), front = lifted(c.front), back = lifted(c.rear);
  const k = c.corridor;
  const half = k[0] - (k[0] - k[1]) * smoothRange(c.rise[0], c.land[1], a) - (k[1] - k[2]) * smoothRange(c.land[1], front - 2, a)
    - (k[2] - k[3]) * smoothRange(back, back + 2, a) + (k[4] - k[3]) * smoothRange(back + 14, back + 22, aw) + (k[0] - k[4]) * smoothRange(c.fall[0], c.fall[1], aw);
  const jag = (noise(seed ^ 0x5733, x * 0.16, a * 0.16) - 0.5) * 3 + (noise(seed ^ 0x5734, x * 0.45, a * 0.42) - 0.5) * 0.8;
  const waist = smoothRange(c.waist[0], c.waist[1], ba), plan = mix(c.wide, c.narrow, waist), out = fortressOutside(bx, ba);
  const guard = 1 - smoothRange(0, 4.5, Math.hypot(Math.max(0, bax - c.barrels[0]), Math.max(0, c.barrels[1] - ba, ba - c.front)));
  const round = ba > c.front - 0.5 && (bax > plan || ba > c.rear);
  // The shoulder: a broken ridge behind the roof, its crest wandering along x, its spurs running down into the corridor.
  const crest = c.rear + c.shoulder[0] + (noise(seed ^ 0x5739, x * 0.14, 0.5) - 0.5) * 2.4;
  const shoulder = c.shoulder[1] - Math.abs(ba - crest) * (ba < crest ? 0.8 : 0.55) + jag * 0.5;
  // The rear in the rock: from just before the plan's back (and its outer rear corners) to the shoulder's crest, then down
  // its back with it. (Until 18 November this went on rising behind the crest, and the corridor behind the fortress became
  // massif to the fall, held flat at the pass's level: a plain cut off in a straight line at the top of the fight's view.)
  const rear = ba > c.rear - c.embed[0] || (ba > c.rear - c.embed[1] && bax > plan - c.embed[2]);
  const embed = rear ? 2.2 + Math.min(1.5, Math.max(ba - c.rear + c.embed[0], bax - plan + c.embed[2])) * 1.6 - Math.max(0, ba - crest) * 0.9 + jag * 0.3 : -9;
  // The peak behind the fortress (user, 18 November: "lower third mountain base, middle third the ascend and top third peak
  // with the fortress between 2 and 3"): past its shoulder the mountain rises over the flight plane across the whole width,
  // beyond the fight's play area (its top 19.8 past the player's row, 28.8 past the arena's start) and so out of the fight's
  // view, seen as the ship climbs over it after the kill (BossDefinition.departureClimb), then it comes down past the
  // departure. Its fronts wander along x.
  const crag = smoothRange(back + 2.5, back + 7, aw) * (1 - smoothRange(back + 18, back + 27, aw));
  const depth = Math.max(ax - half + jag - guard * 3, ax < half ? shoulder : -9, round ? 2.6 - out * 0.6 + jag * 0.3 : -9, embed, crag * 3.5 - 0.5 + jag * 0.3);
  const presence = smoothRange(c.rise[0], c.rise[1], a) * (1 - smoothRange(c.fall[0], c.fall[1], aw));
  const approach = smoothRange(c.rise[0], front + c.tall[0], a), tall = smoothRange(front + c.tall[0], front + c.tall[1], a) * (1 - smoothRange(back + 12, back + 22, aw));
  const r = alpine(seed, x, a), beyond = smoothRange(WORLD_HALF + 0.3, WORLD_HALF + 3, ax), climb = smoothRange(-0.5, 3.5, depth);
  const summit = mix(c.summit[0], c.summit[1], approach);
  // The tops: the foothills toward the world's edges rise over the approach (inside the world they keep low: a pilot at its
  // edge flies over them), the peaks round and behind the fortress reach VESPER_SCENERY_MAX (the lowered level gives them
  // their height), and beyond the world's edges the ranges rise from the start, to tall summits by the fortress.
  const edges = mix(c.foothills[0], c.foothills[1], approach);
  const sides = mix(mix(edges - 1, edges, smoothRange(half + 0.5, WORLD_HALF, ax)), c.peak, tall), limit = Math.max(mix(sides, summit, beyond), mix(-9, c.crag, crag));
  // From the massif's foot to its top: ridged crests with summits and saddles along them (`peaks`), so the ground meets its
  // top only at the summits and never in a plateau (user, 18 November: "the mountain behind the boss when we fly away is
  // just cut off straight").
  const smoothPeaks = r * (0.55 + 0.45 * smoothRange(0.25, 0.75, noise(seed ^ 0x573a, x * 0.2, a * 0.2)));
  // Broken into rock steps (v8; user, 18 November: "It looks to staggered and even, put some rocky cliffs and make it more
  // jagged"): the relief climbs in terraces, each ending in a sheer rim (crispStep), their count and heights wandering with x
  // and s so they never stack evenly; Vesper's walls and crags stand in them (vesperScatterSteps). Never over the relief's own
  // height (min), so no cap or line of sight moves; round the fortress and its approach, not on the tall peaks behind it
  // (`crag`), whose summits keep their height for the departure's climb over them.
  const terraces = 2.6 + 2 * noise(seed ^ 0x576c, x * 0.11, a * 0.11), phase = noise(seed ^ 0x576d, x * 0.23, a * 0.19) * 0.8;
  const q = smoothPeaks * terraces + phase, qi = Math.floor(q);
  const stepped = Math.max(0, Math.min(smoothPeaks, (qi + crispStep(clamp((q - qi - 0.55) / 0.45)) - phase) / terraces));
  const peaks = mix(stepped, smoothPeaks, crag);
  const foot = Math.min(mix(c.base[0], c.base[1], tall) + c.beyond * beyond, limit - 1.2);
  let height = c.low + (foot - c.low) * climb + (limit - foot) * peaks * smoothRange(-1, 3, depth);
  // The ledge the fortress stands on, at its foot's level: it runs out a little before the plan's front and round its front
  // corners (strongholdReach), then steps down to the low ground in one to three broken drops (strongholdSteps): sheer
  // faces with an overhanging lip, buttresses standing out and gullies cut back, narrow tiers between them at the arena's
  // own heights and offsets, scree at the foot; the cannons jut out over it. (Beside the fortress its mountain stands over it.)
  const ledge = liftedHeight(STRONGHOLD_BUILT_SEA + 0.15);
  let tier = -Infinity, cliff = 0, footCap = Infinity;
  if (ba < c.rear - 1) {
    const buttress = smoothRange(0.5, 0.75, noise(seed ^ 0x5744, x * 0.8, 3.5)), gully = 1 - smoothRange(0.22, 0.42, noise(seed ^ 0x5744, x * 0.8, 3.5));
    const reach = Math.max(0.2, strongholdReach(arena, seed, x) + (noise(seed ^ 0x573f, x * 1.5, 1.5) - 0.5) * 0.5 + buttress * 0.8 - gully * 0.35);
    // Past the ledge's edge (world units): before the plan's front by `reach`, beside it by about a unit, the corners rounded.
    const ahead = Math.max(0, (c.front - ba) * STRONGHOLD_SCALE), beside = Math.max(0, bax - plan) * STRONGHOLD_SCALE;
    const wide = 1.1 + 0.6 * noise(seed ^ 0x573e, a * 0.35, 0.5), d = Math.cbrt((ahead / reach) ** 3 + (beside / wide) ** 3);
    // The faces' rims are sawtoothed (`tooth`), and broad rock spurs run down the ascent with its bands stepping out over
    // them (`spur`: the bands lie further out there; v8, user: "make it more jagged").
    const tooth = Math.abs(noise(seed ^ 0x5767, x * 2.3, a * 0.8) - 0.5) * 2, spur = smoothRange(0.6, 0.82, noise(seed ^ 0x5766, x * 0.3, 4.5));
    const u0 = (d - 1) * (ahead * reach + beside * wide) / (ahead + beside + 1e-6) + (noise(seed ^ 0x5745, x * 1.3, a * 1.3) - 0.5) * 0.3 + (tooth - 0.5) * 0.5;
    const u = u0 - spur * 1.3 * smoothRange(0.3, 2.5, u0);
    const steps = strongholdSteps(arena, seed, x, buttress, gully), drop = ledge - (SEA + 0.35);
    let level = ledge + (noise(seed ^ 0x5743, x * 0.7, a * 0.7) - 0.5) * 0.2, at = 0, past = Infinity;
    for (let k = 0; k < steps.length && past === Infinity; k++) {
      const step = steps[k];
      if (u < at) { past = -1; break; }
      if (u < at + step.run) { level -= step.share * drop * smoothRange(0, 1, (u - at) / step.run) ** step.bite; past = -1; break; }
      level -= step.share * drop; at += step.run;
      if (k === steps.length - 1) past = u - at;
      else if (u < at + step.tier) {
        // Scree heaped at the face's foot, then the tier's own lumps.
        level += step.share * drop * 0.2 * (1 - smoothRange(0, 0.8, u - at)) ** 2 * (0.5 + noise(seed ^ 0x576b, x * 2.6, a * 2.6))
          + (noise(seed ^ 0x5748, x * 0.9, a * 0.9) - 0.5) * 0.2;
        past = -1; break;
      } else at += step.tier;
    }
    // (Rock ribs run up the ascent and gullies cut down it, across its bands; the spurs' crests stand over their bands, and
    // rock needles over the tiers, all under the ledge.)
    const rib = smoothRange(0.6, 0.78, noise(seed ^ 0x5765, x * 0.5, 7.5)) * smoothRange(0, 1, u);
    if (past < 0) {
      tier = level + rib * 0.45 + spur * (0.3 + 0.4 * noise(seed ^ 0x576a, x * 3.1, a * 1.7)) * smoothRange(0, 1.2, u) - gully * 0.25 * smoothRange(0, 1, u);
      if (u > 0.9) tier = Math.max(tier, Math.min(tier + strongholdNeedles(seed, arena, x, u), ledge - 0.3));
      tier = Math.min(tier, ledge + 0.1); cliff = 1;
    } else if (past < 1.2) { cliff = 1 - smoothRange(0, 1.2, past); }
    // Before the cliff the low ground keeps down to its foot, rising back over a scree apron, so the cliff stands its full
    // height (the low ground's relief would otherwise fill its lower half); beside the fortress the low ground keeps its own.
    if (ba < c.front && past !== Infinity && past >= 0) footCap = SEA + 0.35 + past * 0.3 + 6 * (1 - smoothRange(0.35, 0.75, ahead / (ahead + beside + 1e-6)));
  }
  if (tier > height) height = tier;
  // The fortress: under the model the ground keeps below its top; round its front it meets the model at its edge's height
  // (burying the cut faces) and climbs from there as broken rock. Beside its rear two thirds and behind it the fortress is
  // set into its mountain (user, 18 November: "the fort looks not to be set into the mountain enough. The cliffs are like
  // cut off, not a steep slope where the fortress is set into"): the mountainside climbs straight from the model's edges,
  // steep and rough, over its rear and its upper flanks (`sink`, more toward the back), until it meets the mountain's own
  // ridged top (`crown`: summits and saddles under the cap); never a wall standing off the model, nor a flat-cut top.
  const fit = ba > SEAT_A - SEAT_REACH - 1 && ba < SEAT_A + SEAT_ROWS.length * SEAT_STEP + SEAT_REACH ? seatAt(bx, ba) : null;
  const rise = (1.5 + 0.8 * noise(seed ^ 0x5737, x * 0.32, a * 0.32)) * STRONGHOLD_SCALE, rough = (noise(seed ^ 0x5738, x * 0.8, a * 0.8) - 0.5) * 0.7;
  // (Over the fortress's back, behind its targets and inside its plan, the rock may rise with its structure over the cap:
  // the fortress itself stands over the flight plane there, and the ship climbs over both after the kill.)
  const behindTargets = smoothRange(c.front + 4, c.rear - 1, ba) * (1 - smoothRange(plan - 0.5, plan + 0.3, bax));
  const sink = 0.9 * smoothRange(c.front + 2.5, c.rear - 0.5, ba);
  const crown = Math.min(behindTargets > 0 ? mix(c.peak, liftedHeight(1.1), behindTargets) : c.peak, 1.7 + 1.3 * peaks + 0.3 * noise(seed ^ 0x5752, x * 0.6, a * 0.6) + 2.4 * behindTargets);
  let cap = Infinity, bury = -Infinity;
  // (Under it the ledge: never water either, a lead there showed through its open front.)
  if (fit && !Number.isNaN(fit.under)) {
    cap = rear ? Infinity : liftedHeight(fit.under); bury = ledge;
    // Over its rear band and rear corners the mountainside runs on over the model, rising toward the back.
    const band = rear ? Math.max(smoothRange(c.rear - c.embed[0] - 0.4, c.rear - c.embed[0] + 0.4, ba + jag * 0.25),
      smoothRange(c.rear - c.embed[1] - 0.4, c.rear - c.embed[1] + 0.4, ba) * smoothRange(plan - c.embed[2] - 0.4, plan - c.embed[2] + 0.4, bax)) : 0;
    if (band > 0) height = Math.max(height, mix(height, Math.min(crown, liftedHeight(fit.under) + 0.55 + sink * 0.5 + Math.max(0, ba - c.rear + c.embed[0]) * rise + rough * 0.5), band));
  } else if (fit && fit.reach < SEAT_REACH) {
    // (Behind its rear the low feet of its back wall, down to the sea, held the ground in a trench until 18 November: the
    // mountainside there rises from the model's top instead.)
    const edge = liftedHeight(fit.edge) + sink, slope = edge + 0.05 + Math.max(0, fit.reach - 0.25) * rise + rough * smoothRange(0.25, 1.2, fit.reach);
    if (sink > 0.02 || rear) {
      height = Math.max(height, mix(height, Math.min(slope, crown), 1 - smoothRange(3, SEAT_REACH, fit.reach)));
      cap = slope + 0.3;
    } else cap = slope;
    // (Never down to the sea round it.)
    bury = Math.max(fit.reach < 0.6 ? edge + 0.05 : -Infinity, SEA + 0.25);
  }
  // (Before the model the ledge holds: the plinth's foot never pulls it into pits.)
  if (!rear && cap < ledge + 0.1 && ba < c.front + 1 && !(fit && !Number.isNaN(fit.under))) cap = ledge + 0.1;
  cap = Math.min(cap, footCap);
  if (cap < height) height = Math.max(Math.min(height, cap), bury);
  // Rock share over 1 (vesperColor: the massif's stone, bare from a gentler slope than a nunatak's): its crests and faces
  // rock, snow filling its couloirs and lying on its shoulders.
  const tone = 1 + Math.max(smoothRange(-0.5, 2, depth) * mix(0.35, 1, smoothRange(0.2, 0.55, r)), cliff) * clamp(0.75 + 0.5 * noise(seed ^ 0x5736, x * 0.3, a * 0.3));
  const pool = smoothRange(0.7, 0.76, noise(seed ^ 0x5741, x * 0.15, a * 0.15)) * land;
  // (The ceiling only lets the massif and the buried edges stand over Vesper's own cap: it never flattens them.)
  const ceiling = Math.max(2.4 - DROP, Math.max(Math.min(height, cap), bury));
  return { ledge: cliff, land, rocky: smoothRange(c.rocky[0], c.rocky[1], a) * (1 - smoothRange(c.fall[0], c.fall[1], aw)), pool, massif: Math.max(presence * smoothRange(-2, 1, depth), cliff), height, tone, cap, bury, ceiling };
}

/**
 * The smooth shelf level the ice cliffs are cut from: the mood's top, a regional swell, and a climb inland from the
 * coast (low ice feet at the water, higher shelves behind them).
 */
function shelfLevel(seed: number, x: number, s: number, p: VesperParams, threshold: number): number {
  const { mass } = shelfMass(seed, x, s), inland = smoothRange(0, 0.16, mass - threshold);
  // (Version 13 also pulled the level toward the mood's top along the routes, which drew long ice cliffs parallel to the
  // flight line at the routes' edges; since version 14 calm routes soften the steps instead, in the landform.)
  // (Version 16: twice the regional swell, so neighbouring shelves stand tiers apart.)
  return p.top + (noise(seed ^ 0x9a7, x * 0.055, s * 0.05) - 0.5) * 2 + (noise(seed ^ 0x9b3, x * 0.07, s * 0.065) - 0.5) * 1.1 * p.stairs
    + (inland - 0.45) * p.step * p.stairs;
}
/** Ice-cliff riser width between shelf levels (sheer, two grid cells) and the gradient probe. */
const ICE_RISER = 0.5, ICE_PROBE = 0.3;
/** The lowest shelf (an ice foot just above the sea) and the highest ice (in Vesper's first frame, SEA0). */
const SHELF_LOW0 = SEA0 + 0.75, SHELF_HIGH = 2.3;
/** The lowest shelf as it stands, lowered with the level. */
const SHELF_LOW = SHELF_LOW0 - DROP;
/**
 * Ice plateaus (version 16): a warped blob field lifts tabular blocks of ice one or two tiers over the shelf they stand
 * on, behind sheer walls a few tenths wide (crispStep, as on the coast), so a plateau reads like Khepri's mesas.
 */
function icePlateau(seed: number, qx: number, qs: number, p: VesperParams, calm: number): number {
  if (p.mesa <= 0) return 0;
  const field = noise(seed ^ 0x9c1, qx * 0.075, qs * 0.07) * 0.75 + noise(seed ^ 0x9c2, qx * 0.21, qs * 0.2) * 0.25;
  const threshold = mix(0.8, 0.6, p.mesa) + calm * 0.08;
  const block = crispStep((field - threshold) / 0.03 + 0.5);
  if (block <= 0) return 0;
  // A second tier on the plateau's core here and there.
  const tier = crispStep((field - threshold - 0.09) / 0.03 + 0.5) * smoothRange(0.45, 0.6, noise(seed ^ 0x9c3, qx * 0.05, qs * 0.05));
  return (block + tier * 0.8) * p.step * (0.85 + 0.3 * noise(seed ^ 0x9c4, qx * 0.04, qs * 0.04));
}
/** Vesper's land top at a point: shelves at several levels with sheer steps, ice plateaus, drifts, ridges, nunataks, crevasses. */
function shelfTop(seed: number, x: number, s: number, p: VesperParams, m: ReturnType<typeof vesperMasks>): number {
  // Ragged ice edges: fine relief moves the cliff lines into spurs and bays without roughening the shelves.
  const jag = (u: number, v: number) => (noise(seed ^ 0x9b8, u * 0.3, v * 0.28) - 0.5) * 0.4;
  const level = shelfLevel(seed, x, s, p, m.threshold), edges = level + jag(x, s);
  const gx = (shelfLevel(seed, x + ICE_PROBE, s, p, m.threshold) + jag(x + ICE_PROBE, s) - edges) / ICE_PROBE;
  const gs = (shelfLevel(seed, x, s + ICE_PROBE, p, m.threshold) + jag(x, s + ICE_PROBE) - edges) / ICE_PROBE;
  const phase = noise(seed ^ 0x9b4, x * 0.02 + 1.7, s * 0.018) * p.step;
  // Snow ramps: here and there a step softens into a drift slope, so tracks can climb between shelf levels.
  const ramp = smoothRange(0.6, 0.74, noise(seed ^ 0x9b7, x * 0.07, s * 0.065));
  let top = clamp(bench(level, Math.hypot(gx, gs), p.step, phase, ICE_RISER, 0.92 * (1 - ramp) * (1 - m.calm * 0.5), edges), SHELF_LOW0, SHELF_HIGH);
  top += icePlateau(seed, m.qx, m.qs, p, m.calm);
  top += (noise(seed ^ 0x9ad, x * 0.25, s * 0.3) - 0.5) * 0.14 + (noise(seed ^ 0x9ae, x * 1.3, s * 1.2) - 0.5) * 0.03;
  // Pressure ridges: jagged walls of broken ice; drifts: wind-packed snow; nunataks: dark rock peaks (version 16: taller,
  // mountains of rock standing up to about three units over the ice).
  top += m.ridge * (0.6 + 0.6 * ridged(noise(seed ^ 0x9b5, x * 0.6, s * 0.55)));
  top += m.dune * 0.38 * (1 - m.crack);
  if (m.rock > 0) top += m.rock * (0.9 + 2.4 * smooth(ridged(noise(seed ^ 0x9b6, x * 0.3, s * 0.28)) * m.rock));
  // Crevasses: deep, sheer cracks that never open to the sea (their floors stay ice). Then the whole level lowered.
  return Math.max(Math.min(top, SEA0 + 0.35), top - m.crack * 2.4) - DROP;
}
/**
 * Vesper's mood parameters where HELION STRONGHOLD's low ground has taken over (`land` 0…1): more land (the sea keeps to
 * leads and pockets), fewer inlets, and crevasses, pressure ridges and rock in every mood.
 */
function landed(p: VesperParams, land: number, rocky: number): VesperParams {
  if (land <= 0 && rocky <= 0) return p;
  return { ...p, land: mix(p.land, 1.15, land), leads: mix(p.leads, 0.55, land), inlets: p.inlets * (1 - 0.7 * land), crevasse: Math.max(p.crevasse, 0.45 * land, 0.4 * rocky),
    ridge: Math.max(p.ridge, 0.45 * land, 0.5 * rocky), rock: Math.max(p.rock, 0.5 * land, 0.6 * rocky) };
}
/** Vesper's parameters and masks at a point, with HELION STRONGHOLD's land where its arena reaches (the scatter reads them too). */
function groundMasks(seed: number, x: number, s: number, p: VesperParams, platform: number, ground: StrongholdGround | null) {
  const local = ground ? landed(p, ground.land, ground.rocky) : p;
  return { p: local, m: vesperMasks(seed, x, s, local, ground ? 0 : platform) };
}
/**
 * Vesper ground: seabed under the water; on land, shelves at several levels separated by sheer ice cliffs (stepping up
 * inland from the coast), with snow drifts, pressure ridges, crevasse fields and dark nunataks breaking through.
 */
export function vesperLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const ground = row.arena ? strongholdGround(row.arena, seed, x, s) : null;
  const { p, m } = groundMasks(seed, x, s, row.local as VesperParams, row.platform, ground);
  const seabed = SEA - 1.5 - noise(seed ^ 0x9ac, x * 0.07, s * 0.06) * 1.6;
  let top = m.land > 0 ? shelfTop(seed, x, s, p, m) : seabed;
  // HELION STRONGHOLD's low ground (a Vesper boss arena only): the land pressed down to just above the sea.
  // (Its pressure ridges, drifts and dark rock stand out of the pressed shelves: they are what keeps it from being plain.)
  if (ground && m.land > 0) {
    const relief = m.ridge * (0.25 + 0.3 * ridged(noise(seed ^ 0x9b5, x * 0.6, s * 0.55))) + m.dune * 0.22 * (1 - m.crack) + m.rock * 0.45;
    top = mix(top, STRONGHOLD.low + (top - SHELF_LOW) * STRONGHOLD.squash + relief, ground.land);
  }
  let height = mix(seabed, top, m.edge), elevation = m.land, channel = m.crack * m.land, tone = m.rock * m.land;
  // HELION STRONGHOLD (a Vesper boss arena only): frozen pools on the flats, the massif, the ground round the model.
  if (ground) {
    const pool = ground.pool * m.edge * (1 - m.crack) * (1 - m.rock);
    if (pool > 0) { height -= pool * 0.05; channel = Math.max(channel, pool * 0.5); }
    if (ground.massif > 0) {
      height = mix(height, Math.max(height, ground.height), ground.massif); elevation = mix(elevation, 1, ground.massif);
      channel *= 1 - ground.massif; tone = mix(tone, ground.tone, ground.massif);
    }
    height = Math.max(Math.min(height, ground.cap), ground.bury);
    return { height: clamp(height, -8, ground.ceiling), elevation, channel, pool: 0, vein: 99, vein2: 99, veins: 0, tone, ceiling: ground.ceiling };
  }
  return { height: clamp(height, -8 - DROP, 2.4 - DROP), elevation, channel, pool: 0, vein: 99, vein2: 99, veins: 0, tone };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** docs/17 §1 palette, linear RGB. */
export const VESPER_PALETTE = {
  snow: linear(0xe9eef3), snowShade: linear(0xb9c8d8), iceLight: linear(0x8fc3e6), iceDeep: linear(0x2e6f9e),
  rock: linear(0x2a2d31), ocean: linear(0x0d3557), shallows: linear(0x1f6a8f),
} as const;

function vesperColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = VESPER_PALETTE, { seed, s } = row;
  if (point.height < SEA) {
    // Seabed: darkened and blue, mostly hidden by the water.
    const depth = smoothRange(0, 3, SEA - point.height);
    for (let c = 0; c < 3; c++) out[c] = P.ocean[c] * mix(0.55, 0.25, depth);
    return out;
  }
  const drift = noise(seed ^ 0x51a7, x * 0.07, s * 0.05), fine = noise(seed ^ 0x51a8, x * 1.1, s * 1.1);
  if ((point.tone ?? 0) > 1) return massifColor(row, x, point, slope, rim, drift, fine, out);
  // Only true cliff faces turn to blue ice (version 19: from 0.9, rounded shoulders showed the grid as blue facets).
  const steep = smoothRange(1.5, 3, slope) * (1 - smoothRange(0.05, 0.3, point.tone ?? 0)), shade = smoothRange(0.35, 0.8, drift) * 0.35;
  const cliff = smoothRange(SEA, 1.6 - DROP, point.height), rock = smoothRange(0.25, 0.6, point.tone ?? 0);
  // Snow caps stay on the flat tops of outcrops; only their steep flanks show charcoal rock (version 18: gentle flanks
  // in charcoal read as a dark, blurred smear at the grid's resolution).
  const bare = rock * smoothRange(1, 1.5, slope);
  for (let c = 0; c < 3; c++) {
    let snow = mix(P.snow[c], P.snowShade[c], shade + (1 - point.elevation) * 0.3);
    // (A pad that flattened a crevasse keeps its snow: version 16.)
    snow = mix(snow, P.iceDeep[c], point.channel * 0.85 * (1 - (point.industrial ?? 0)));
    snow = mix(snow, P.snow[c], rim * (1 - steep) * 0.4);
    const ice = mix(P.iceDeep[c], P.iceLight[c], cliff) * (0.9 + fine * 0.2);
    out[c] = mix(mix(snow, ice, steep), P.rock[c] * (0.9 + fine * 0.2), bare);
  }
  return out;
}

/** HELION STRONGHOLD's stone (linear): dark blue-grey, after the concept's mountain. */
const STONE = linear(0x2b3036);
/**
 * HELION STRONGHOLD's massif (tone over 1, its rock share above it: strongholdGround): stone on its crests and faces from a
 * gentler slope than a nunatak's (its faces lean back, under the ice walls' steepness), snow on its shoulders and in its
 * couloirs, and dusted over the stone in streaks down the faces.
 */
function massifColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, drift: number, fine: number, out: [number, number, number]) {
  const P = VESPER_PALETTE, { seed, s } = row, share = clamp(point.tone! - 1);
  const shade = smoothRange(0.35, 0.8, drift) * 0.35;
  // Snow lies in streaks down the faces and in patches (two scales), so the stone shows through it unevenly.
  const dust = noise(seed ^ 0x51a9, x * 1.3, s * 0.45) * 0.45 + noise(seed ^ 0x51aa, x * 0.5, s * 0.5) * 0.3 + noise(seed ^ 0x51ab, x * 2.6, s * 1.1) * 0.25;
  const bare = share * smoothRange(0.6, 1.15, slope) * smoothRange(0.3, 0.6, dust + share * 0.15);
  for (let c = 0; c < 3; c++) {
    const snow = mix(mix(P.snow[c], P.snowShade[c], shade + (1 - point.elevation) * 0.3), P.snow[c], rim * 0.4);
    out[c] = mix(snow, STONE[c] * (0.65 + fine * 0.7), bare);
  }
  return out;
}

/* ---------------------------------------------------------------- settlements */

/**
 * Vesper outposts (docs/17 §4, docs/26 §5), after the facility sheet (art/concepts/facility-sheets/vesper.jpg): radiator
 * fields, defence pylons (missile and cannon sites), cryo stations, processing plants, heat exchangers (a tank row
 * with a hall and radiators), thermal reactors (a tight cluster of masts and tanks) and harbours. All of them use the
 * vesper-infra kit and the shared industrial kit.
 */
export const VESPER_ARCHETYPES = ['radiator', 'missile', 'cryo', 'plant', 'exchanger', 'reactor', 'harbour'] as const;
const WEIGHTS: Readonly<Record<string, number>> = { radiator: 0.19, missile: 0.15, cryo: 0.14, plant: 0.14, exchanger: 0.14, reactor: 0.1, harbour: 0.14 };
/** Pad half extents (lateral u, forward v). */
const EXTENT: Readonly<Record<string, [number, number]>> = {
  radiator: [3.6, 3.8], missile: [3.0, 3.2], cryo: [3.0, 3.0], plant: [3.2, 3.2], exchanger: [3.5, 3.2], reactor: [3.0, 3.0], harbour: [2.6, 3.6],
};
const CELL = 30;
/**
 * Chance that a cell's flank holds an outpost when it finds dry, level shelf (0.88 before version 13), scaled since
 * version 16 by the district level (compounds in busy stretches, empty shelf between).
 */
const OUTPOST_CHANCE = 0.92;
/**
 * Lower stand-ins for pieces too tall for a pad's room under the scenery cap, so a pad on a high shelf keeps its level
 * (no pit dug into the shelf) and its outpost keeps a full silhouette.
 */
const LOWER: Readonly<Record<string, string>> = {
  vesper_comm_needle: 'vesper_habitat_1', vesper_missile_site: 'vesper_cannon_site', vesper_crane: 'container_1',
  facility: 'container_0', tank_vertical_0: 'tank_horizontal', tank_vertical_1: 'tank_horizontal', tank_sphere: 'tank_horizontal',
  vesper_cryo_dome: 'vesper_habitat_1', tank_horizontal: 'container_1', vesper_radiator_array: 'container_0',
};

interface LocalModule { kind: PlacedModule['kind']; node: string; u: number; v: number; yaw: number; scale?: number; base?: number }
/** Yaw that points a piece's +Z along local +u (seaward for harbours). */
const SEAWARD = Math.PI / 2;
function compose(archetype: string, h: (k: number) => number, edge: number, room: number): LocalModule[] {
  const m: LocalModule[] = [], count = (k: number, low: number, high: number) => low + Math.floor(h(k) * (high - low + 1));
  /** Swaps a piece for a lower one until it fits the pad's room (pieces with their own base, afloat, keep theirs). */
  const fit = (node: string, base?: number) => {
    let name = node;
    while (base === undefined && (MODULE_HEIGHT[name] ?? 1) > room && LOWER[name]) name = LOWER[name];
    return base === undefined && (MODULE_HEIGHT[name] ?? 1) > room ? null : name;
  };
  const piece = (kind: 'infra' | 'shared', node: string, u: number, v: number, yaw = 0, base?: number) => {
    const name = fit(node, base);
    if (name) m.push({ kind: MODULE_KIND(name) ?? kind, node: name, u, v, yaw, base });
  };
  const infra = (node: string, u: number, v: number, yaw = 0, base?: number) => piece('infra', node, u, v, yaw, base);
  const shared = (node: string, u: number, v: number, yaw = 0) => piece('shared', node, u, v, yaw);
  const kit = (node: string, u: number, v: number, scale: number) => m.push({ kind: 'kit', node, u, v, yaw: h(90 + m.length) * Math.PI * 2, scale });
  switch (archetype) {
    case 'radiator': {
      // Radiator fields: tiles every 2.0 along local x, in rows, with their mast, a header tank and a crew hut.
      const rows = count(1, 2, 3), columns = count(2, 2, 4);
      for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) infra('vesper_radiator_array', -(columns - 1) + j * 2, -2.7 + i * 1.15);
      infra('vesper_comm_needle', 2.9, 2.6); shared('tank_horizontal', -2.5, 2.5, Math.PI / 2);
      if (h(3) < 0.7) infra('vesper_habitat_1', 0.4, 2.6);
      if (h(4) < 0.5) shared('pipe_valve', -0.9, 1.6, Math.PI / 2);
      break;
    }
    case 'missile': {
      // A defence pylon line: emplacements on hex plinths facing forward (+Z), a mast, crew quarters and stores.
      const sites = count(4, 2, 3);
      for (let i = 0; i < sites; i++) infra(h(5 + i) < 0.65 ? 'vesper_missile_site' : 'vesper_cannon_site', -(sites - 1) + i * 2, -0.6 + (i % 2) * 0.8, Math.PI);
      infra('vesper_habitat_0', 1.9, 2.3); shared('container_0', -2.0, 2.3, h(8) * Math.PI);
      if (h(9) < 0.6) infra('vesper_comm_needle', -2.6, -2.4);
      for (let i = 0; i < count(10, 1, 3); i++) kit('outcrop', -2.5 + h(11 + i) * 5, -2.7 + h(15 + i) * 0.8, 0.8 + h(19 + i) * 0.3);
      break;
    }
    case 'cryo': {
      infra('vesper_cryo_dome', -0.7, 0.3);
      if (h(20) < 0.65) infra('vesper_cryo_dome', 1.6, -1.5);
      infra('vesper_habitat_0', -2.0, -2.0);
      if (h(21) < 0.6) infra('vesper_habitat_1', 0.2, -2.3);
      infra('vesper_comm_needle', 2.3, 2.3); shared('tank_sphere', -2.2, 2.1);
      for (let i = 0; i < count(22, 0, 2); i++) shared(`container_${i % 2}`, 2.4, 0.2 - i * 0.85, Math.PI / 2);
      break;
    }
    case 'plant': {
      shared('facility', -0.8, 1.2);
      infra('vesper_comm_needle', 2.4, 2.4);
      shared('tank_vertical_1', 2.0, 0.8); shared('tank_horizontal', 1.6, -1.0, Math.PI / 2);
      infra('vesper_habitat_0', -1.8, -1.9);
      for (let i = 0; i < count(26, 1, 3); i++) shared(`container_${i % 2}`, 0.1 + i * 1.2, -2.4, 0);
      if (h(27) < 0.5) infra('vesper_radiator_array', -1.0, -0.6);
      break;
    }
    case 'exchanger': {
      // Industrial heat exchanger: a row of tall exchanger tanks on a header line, the hall behind, radiators beside.
      const tanks = count(40, 3, 4);
      for (let i = 0; i < tanks; i++) shared(i % 2 ? 'tank_vertical_1' : 'tank_vertical_0', -2.1 + i * 1.4, -0.4);
      shared('pipe_valve', -2.9, 1.1, 0); shared('facility', 0.6, 1.9, Math.PI);
      for (let i = 0; i < count(41, 1, 2); i++) infra('vesper_radiator_array', -1.6 + i * 2, -2.5);
      if (h(42) < 0.6) infra('vesper_comm_needle', 2.9, -2.4);
      break;
    }
    case 'reactor': {
      // Thermal reactor: a tight, tall cluster (masts around a sphere and twin tanks), domes and quarters at its foot.
      infra('vesper_comm_needle', -0.6, 0.6); infra('vesper_comm_needle', 0.7, -0.5);
      shared('tank_sphere', 0.8, 1.1); shared('tank_vertical_0', -1.2, -0.8); shared('tank_vertical_1', -0.2, -1.6);
      infra('vesper_cryo_dome', 2.0, -1.6); infra('vesper_habitat_0', -2.1, 1.8);
      if (h(50) < 0.6) infra('vesper_habitat_1', 1.9, 2.1);
      for (let i = 0; i < count(51, 1, 2); i++) shared(`container_${i % 2}`, -2.3, -2.0 + i * 0.85, Math.PI / 2);
      break;
    }
    case 'harbour': {
      // A jetty from the cliff foot out to sea (pier tiles every 2.0 along their +Z, waterline at y = 0),
      // a crane on the shelf edge with its jib over the water, sometimes an icebreaker alongside; stores inland.
      const piers = count(22, 2, 3);
      for (let i = 0; i < piers; i++) infra('vesper_pier_segment', edge + 0.75 + i * 2, 0, SEAWARD, SEA);
      infra('vesper_crane', Math.min(edge - 0.9, 2.1), 1.2, SEAWARD);
      if (h(23) < 0.5) infra('vesper_icebreaker', edge + 0.75 + (piers - 1) * 2, 1.7, SEAWARD + (h(24) < 0.5 ? 0 : Math.PI), SEA);
      for (let i = 0; i < count(25, 1, 3); i++) shared(`container_${i % 2}`, -1.4, -2.2 + i * 0.9, Math.PI / 2);
      infra('vesper_habitat_1', -1.0, 2.2);
      break;
    }
  }
  return m;
}
/** Shared industrial nodes are 'shared' modules wherever a swap lands; Vesper nodes are 'infra'. */
const MODULE_KIND = (node: string): 'infra' | 'shared' | null => node.startsWith('vesper_') ? 'infra' : /^(tank_|container_|pipe_|facility$)/.test(node) ? 'shared' : null;

/** Probes over the largest pad (centre first), a unit or so apart. */
const PAD_PROBES: readonly (readonly [number, number])[] = [[0, 0], ...[-3, -2, -1, 0, 1, 2, 3].flatMap(dx =>
  [-3, -2, -1, 0, 1, 2, 3].map(ds => [dx, ds] as const))];
const memo = new Map<string, Settlement | null>(), spots = new Map<string, boolean>();
const vesperGround = (seed: number, x: number, s: number) =>
  vesperLandform(seed, x, s, { seed, s, params: NEUTRAL, local: vesperParams(seed, s), platform: 0 }).height;
/** The best dry, level pad spot among a cell side's candidates within a slot, or null where there is only water. */
function padSpot(seed: number, cell: number, side: number, h: (k: number) => number, slot: Pick<CompoundSlot, 'from' | 'to' | 'inner' | 'outer'>) {
  let x = 0, s = 0, best = Infinity;
  // (Fourteen tries since version 15, twenty since 16: half of Vesper is water, and the deeper relief breaks it up more.)
  for (let k = 0; k < 20; k++) {
    // Candidates from about a third of the half width out (some in view beside the centre lane), clamped up front (largest
    // pad) so a harbour's measured edge distance stays valid.
    const cx = side * Math.min(WORLD_HALF * (slot.inner + h(140 + 2 * k) * (slot.outer - slot.inner)), WORLD_HALF - 4.1);
    const cs = cell * CELL + slot.from + h(141 + 2 * k) * (slot.to - slot.from);
    // The whole pad on a grid (version 16: a lead between five probes once ran across a pad, and pads never flatten
    // water, so with the deeper sea it left a trench under the tanks).
    const heights = PAD_PROBES.map(([dx, ds]) => vesperGround(seed, cx + dx, cs + ds));
    // Mostly dry shelf: a narrow lead under the pad is filled like a causeway (terrain-ground), wider water is no place for
    // an outpost. The centre stands high enough that the pad's least level (SEA + 0.75) keeps its shelf's height.
    const dry = heights.filter(height => height >= SEA + 0.1);
    if (dry.length < heights.length * 0.85 || heights[0] < SEA + 0.6) continue;
    // Flat shelf first, and low shelf over high (tall masts and tanks only fit under the cap on the lower levels).
    const cost = Math.max(...dry) - Math.min(...dry) + 0.5 * Math.max(0, heights[0] - 1.1) + 0.15 * (heights.length - dry.length);
    if (cost < best) { best = cost; x = cx; s = cs; }
  }
  return best < Infinity ? { x, s } : null;
}
const OPEN_SLOT = { from: 8, to: 22, inner: 0.35, outer: 0.83 } as const;
/**
 * A cell side's partner-free test for compounds: its seeded roll (busier in districts, version 16; 0.92 everywhere
 * before) and dry shelf somewhere in the cell. Memoized.
 */
function vesperPresent(seed: number, cell: number, side: number): boolean {
  const key = `${seed}:${cell}:${side}`, known = spots.get(key);
  if (known !== undefined) return known;
  const h = (k: number) => hash(seed ^ 0x7e5e ^ (side > 0 ? 0x1000 : 0), cell * 211 + k, 5);
  const present = h(0) < OUTPOST_CHANCE * (0.75 + 0.6 * districtLevel(seed ^ 0x7e5e, cell)) && padSpot(seed, cell, side, h, OPEN_SLOT) !== null;
  if (spots.size > 4096) spots.clear();
  spots.set(key, present);
  return present;
}
/** The Vesper settlement candidate of one cell and side: on shelf ice only (never on water), in compounds. */
export function vesperSettlement(seed: number, cell: number, side: number): Settlement | null {
  const key = `${seed}:${cell}:${side}`;
  if (memo.has(key)) return memo.get(key)!;
  const h = (k: number) => hash(seed ^ 0x7e5e ^ (side > 0 ? 0x1000 : 0), cell * 211 + k, 5);
  let result: Settlement | null = null;
  const ground = (x: number, s: number) => vesperGround(seed, x, s);
  const slot = compoundSlot((c, sd) => vesperPresent(seed, c, sd), cell, side, 0.15, h(23), [OPEN_SLOT.inner, OPEN_SLOT.outer]);
  if (slot) {
    // The compound's slot first; a cell whose dry shelf lies outside it keeps that spot (it is still beside its partner).
    const spot = padSpot(seed, cell, side, h, slot) ?? padSpot(seed, cell, side, h, OPEN_SLOT)!;
    const { x, s } = spot;
    {
      // A shelf edge within reach makes a harbour possible: find the nearest water in the four directions.
      // (Never toward the near world edge: the jetty must fit inside the world.)
      let water = -1, edge = Infinity;
      [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, ds], turn) => {
        if (dx !== 0 && Math.abs(x + dx * 12) > WORLD_HALF) return;
        // Open water, not a narrow lead: the sea must reach on past where the jetty's first two piers would stand.
        for (let d = 2.5; d <= 6; d += 0.5) if (ground(x + dx * d, s + ds * d) < SEA) {
          const open = ground(x + dx * (d + 1.75), s + ds * (d + 1.75)) < SEA - 0.4 && ground(x + dx * (d + 3.75), s + ds * (d + 3.75)) < SEA - 0.4;
          if (open && d < edge) { edge = d; water = turn; }
          break;
        }
      });
      // (Version 16: only from a low ice foot; on the tall shelves the jetty would hang far under the crane.)
      if (ground(x, s) > SEA + 2.2) water = -1;
      const allowed = VESPER_ARCHETYPES.filter(a => a !== 'harbour' || water >= 0), total = allowed.reduce((sum, a) => sum + WEIGHTS[a], 0);
      let roll = hash(seed ^ 0x7e5f ^ (side > 0 ? 0x1000 : 0), cell, 4) * total, archetype: Archetype = allowed[allowed.length - 1];
      for (const a of allowed) { roll -= WEIGHTS[a]; if (roll <= 0) { archetype = a; break; } }
      // An outpost on the open sea's edge is a harbour half the time: its jetty and crane stand over the water.
      if (water >= 0 && hash(seed ^ 0x7e60 ^ (side > 0 ? 0x1000 : 0), cell, 4) < 0.5) archetype = 'harbour';
      // Harbours turn their quay toward the water; others take a seeded quarter turn.
      const turns = archetype === 'harbour' ? water : Math.floor(h(21) * 4), mirror = archetype === 'harbour' ? 1 : h(22) < 0.5 ? -1 : 1;
      const [hu, hv] = EXTENT[archetype], [hx, hs] = turns % 2 ? [hv, hu] : [hu, hv];
      // The pad keeps its shelf's level; pieces too tall for the room under the cap there are swapped for lower ones.
      const level = clamp(Math.round(ground(x, s) / 0.25) * 0.25, SEA + 0.75, 2.25 - DROP), room = VESPER_PIECE_MAX - 0.05 - level;
      const local = compose(archetype, k => h(30 + k), archetype === 'harbour' ? edge : 0, room);
      const cos = [1, 0, -1, 0][turns], sin = [0, 1, 0, -1][turns];
      const placed = local.map((module, i): PlacedModule => {
        const u = module.u * mirror, v = module.v;
        return {
          id: `vsettlement:${cell}:${side}:${i}`, kind: module.kind, node: module.node, x: x + u * cos - v * sin, s: s + u * sin + v * cos,
          yaw: (mirror < 0 ? -module.yaw : module.yaw) + turns * Math.PI / 2, scale: module.scale ?? 1, pick: h(200 + i),
          ...module.base !== undefined ? { base: module.base } : {},
        };
      });
      // Water pieces only over open water: the jetty runs out from the cliff until it would meet ice again.
      const afloat = (module: PlacedModule) => [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].every(([dx, ds]) => ground(module.x + dx, module.s + ds) < SEA - 0.3);
      let jetty = true;
      const modules = placed.filter(module => {
        if (module.base === undefined) return true;
        if (module.node === 'vesper_pier_segment') { jetty &&= afloat(module); return jetty; }
        return afloat(module);
      });
      result = { id: `vsettlement:${cell}:${side}`, cell, side, archetype, x, s, turns, mirror, level, hx, hs, flatten: 1, modules };
    }
  }
  if (memo.size > 2048) memo.clear();
  memo.set(key, result);
  return result;
}

/* ---------------------------------------------------------------- scatter */

/**
 * Vesper dressing: ice-cliff segments along the waterline under shelf cliffs, seracs beside crevasses,
 * pressure-ridge slabs, snow drifts, dark rock outcrops and rare ice spires. Water stays clear (floes are
 * separate, drifting pieces). Arena platforms stay empty.
 */
export function* vesperScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  // (Crags on HELION STRONGHOLD's mountain may stand to the scenery cap over Vesper, the mountain's own, over the fight's play
  // area and to the peaks' top behind it (`massifCap`, MASSIF_PLAY_TOP); elsewhere pieces keep to VESPER_PIECE_MAX.)
  const CAP = VESPER_PIECE_MAX, onMassif = (x: number, s: number) => (strongholdGround(terrain.arena(s), seed, x, s)?.massif ?? 0) > 0.3;
  const massifCap = (x: number, s: number) => { const arena = terrain.arena(s); return arena && s - arena.fromS > MASSIF_PLAY_TOP ? STRONGHOLD.crag : VESPER_SCENERY_MAX; };
  const sink = createScatterSink({ startS, size, terrain, cap: CAP, tall: { kinds: new Set(['outcrop']), cap: STRONGHOLD.crag },
    capAt: (x, s) => onMassif(x, s) ? massifCap(x, s) : CAP }), { add } = sink;
  // HELION STRONGHOLD's arena (a Vesper boss arena): its land is dressed as any shelf, its massif only with crags, nothing
  // stands where the fortress does (its plan, its barrels and its plinth: strongholdClear); its rocks are placed below.
  const holdAt = (x: number, s: number) => strongholdGround(terrain.arena(s), seed, x, s);
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  // Dark stones keep off cliffs (user, 22 October): none within about a unit of a sheer face, above or below it, where
  // they sat on the rim of an ice wall or against its face.
  const nearCliff = (x: number, s: number) => {
    for (let k = 0; k < 16; k++) {
      const r = k < 8 ? 0.55 : 1.1, a = (k % 8) * Math.PI / 4 + (k < 8 ? 0 : Math.PI / 8);
      if (terrain.slope(x + Math.cos(a) * r, s + Math.sin(a) * r) > 1.3) return true;
    }
    return false;
  };
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7c1a, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s)) continue;
    const hold = holdAt(x, s);
    if (!strongholdClear(terrain.arena(s), x, s)) continue;
    // (The stronghold's arena is dressed all over, its fight's clearing too: strongholdClear keeps the fortress and its barrels clear.)
    const platform = hold ? 0 : terrain.platform(x, s);
    if (platform >= 0.5 || (platform > 0 && h(30) < platform * 2)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), pick = h(2);
    const gx = terrain.gradientX(x, s), gs = terrain.gradientS(x, s);
    const { m } = groundMasks(seed, x, s, vesperParams(seed, s), platform, hold);
    // Water is dressed by the coarser cliff pass below (and drifting floes); shelves get the land pieces here.
    if (ground < SEA) continue;
    // The stronghold's massif: dark crags on its shoulders, tiers and spurs, rock needles on its ascent's tiers, scree at the
    // feet of its faces (v8, user: "put some rocky cliffs and make it more jagged"; walls in its faces below), under the
    // massif's cap (its crags kept to VESPER_PIECE_MAX until v8, so none stood above its lowest slopes); nothing else.
    if (hold && hold.massif > 0.5) {
      const top = massifCap(x, s), rock = hold.tone - 1;
      if (slope < 1.1 && ground < top - 0.7 && pick < 0.012 + 0.035 * rock) {
        const scale = 0.8 + h(3) * 1.1;
        add({ kind: 'outcrop', x, s, y: ground - 0.05, scale, height: scale * (0.7 + h(4) * 0.6), rotation: turn(h(5)), cosmetic: h(7) > 0.7 }, h(6));
      } else if (hold.ledge > 0.5 && slope < 0.9 && pick > 0.965 && ground < STRONGHOLD_LEDGE.level - 1.4) {
        // A needle: a crag drawn up tall and narrow.
        // (Its top under the ledge's level and a little over: the ascent never hides the fortress's front.)
        const scale = 0.65 + h(3) * 0.45, height = Math.min(scale * (1.9 + h(4) * 1.3), (STRONGHOLD_LEDGE.level + 0.5 - ground + 0.1) / KIT.outcrop.height);
        add({ kind: 'outcrop', x, s, y: ground - 0.1, scale, height, rotation: turn(h(5)), cosmetic: false }, h(6));
      } else if (slope < 0.8 && pick > 0.72 && pick < 0.8 && terrain.rise(x, s) > 0.9) {
        // Scree: a few stones fallen to the foot of a face.
        for (let k = 0; k < 1 + Math.floor(h(20) * 3); k++) {
          const ox = x + (h(22 + k) - 0.5) * 0.9, os = s + (h(26 + k) - 0.5) * 0.9, oy = terrain.height(ox, os), scale = 0.25 + h(30 + k) * 0.3;
          if (terrain.slope(ox, os) > 0.9 || oy < SEA || !strongholdClear(terrain.arena(os), ox, os)) continue;
          add({ kind: 'outcrop', x: ox, s: os, y: oy - 0.03, scale, height: scale * (0.5 + h(34 + k) * 0.4), rotation: turn(h(38 + k)), cosmetic: true }, h(42 + k));
        }
      }
      continue;
    }
    if (m.crack > 0.2 && slope < 1.4 && pick < 0.07) {
      add({ kind: 'serac', x, s, y: ground, scale: 0.8 + h(3) * 0.4, height: 0.45 + h(4) * 0.5, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (m.ridge > 0.5 && pick < 0.12) {
      const scale = 0.85 + h(3) * 0.3;
      add({ kind: 'ridge', x, s, y: ground, scale, height: scale, rotation: Math.atan2(-gx, gs) + Math.PI / 2 + (h(4) - 0.5) * 0.4, cosmetic: h(7) > 0.6 }, h(5));
    } else if (m.rock > 0.3 && pick < 0.32 && !nearCliff(x, s)) {
      const scale = 0.8 + h(3) * 0.5;
      add({ kind: 'outcrop', x, s, y: ground, scale, height: scale, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (drop > 0.9 && slope < 1 && pick < 0.025) {
      add({ kind: 'iceSpire', x, s, y: ground, scale: 0.85 + h(3) * 0.3, height: 0.8 + h(4) * 0.9, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (slope < 0.5 && m.land > 0.9 && terrain.industrial(x, s) > 0.01 && pick < 0.08) {
      // Vent stacks are outpost plant: they stand on the fringe of a pad, never alone on the shelf.
      const scale = 0.9 + h(3) * 0.2;
      add({ kind: 'vent', x, s, y: ground, scale, height: scale, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (slope < 0.6 && drop < 0.4 && m.land > 0.9 && m.crack < 0.05 && m.ridge < 0.3) {
      // Scattered stones on the snow plains (after the cliff-study concept): small, squat outcrops alone or in loose
      // groups of up to four, thicker in stony patches and thinner along the routes. The first of a group stays on
      // the low tier.
      const stony = smoothRange(0.5, 0.8, noise(seed ^ 0x7c3b, x * 0.14, s * 0.14));
      if (h(20) >= (0.09 + stony * 0.25) * (1 - m.calm * 0.5)) continue;
      const members = 1 + Math.floor(h(21) * h(21) * 4);
      for (let k = 0; k < members; k++) {
        const ox = x + (k ? (h(22 + k) - 0.5) * 0.9 : 0), os = s + (k ? (h(26 + k) - 0.5) * 0.9 : 0);
        if (k && (terrain.slope(ox, os) > 0.6 || terrain.drop(ox, os) > 0.4 || terrain.height(ox, os) < SEA || terrain.blocked(ox, os))) continue;
        if (nearCliff(ox, os)) continue;
        const scale = (k ? 0.3 : 0.45) + h(30 + k) * h(30 + k) * (k ? 0.4 : 0.55);
        add({ kind: 'outcrop', x: ox, s: os, y: terrain.height(ox, os), scale, height: scale * (0.55 + h(34 + k) * 0.4), rotation: turn(h(38 + k)), cosmetic: k > 0 }, h(42 + k));
      }
    }
  }
  // Ice-shelf walls (docs/26 §11, after the concept's right panel): fractured, blocky, snow-capped walls stand in every
  // shelf step and along every coast cliff, those over the sea on the waterline. (They replace version 14's coast and
  // inner `iceCliff` dressing.)
  // Shelf steps and coasts, never rock peaks. A big face (1.8 or more) gets its wall wherever it is: in a crevasse or a
  // pressure-ridge region it is still a sheer shelf face, and bare it showed the heightfield's texture (user, 23 October:
  // "huge faces of walls not having them"). Lower faces only away from crevasses and ridges (they keep their own pieces).
  // Nothing under 1.2 (version 19: was 0.7; small steps and landmarks were crowded with walls).
  const shelfEdge = (x: number, s: number, drop: number) => {
    // (Not on the stronghold's massif, whose faces are rock, nor on the valley floor before it.)
    const hold = holdAt(x, s);
    if (hold && (hold.massif > 0.05 || hold.cap < 9 || !strongholdClear(terrain.arena(s), x, s, 2))) return false;
    const { m } = groundMasks(seed, x, s, vesperParams(seed, s), 0, hold);
    return drop >= 1.8 ? m.rock < 0.3 : m.crack < 0.1 && m.ridge < 0.3 && m.rock < 0.12;
  };
  const walls = { kind: 'iceWall', salt: 0x7c2e, minDrop: 1.2, rimSpan: 0.7, maxAway: 0.75, padReach: 0.6, minRun: 3, scale: [1.2, 1.5], cap: CAP, sea: SEA } as const;
  sink.keep(yield* cliffWallSteps(seed, startS, size, terrain, { ...walls, accept: shelfEdge }));
  // HELION STRONGHOLD's mountain (v8; user, 18 November: "theres no cliff models placed on the mountain. It looks to staggered
  // and even, put some rocky cliffs and make it more jagged etc."): the same walls stand in its faces, the ascent's bands and
  // the broken steps of its slopes and peaks, by the same rules (runs of three along a rim, faces toward the camera; faces
  // from 1.0), never in the fortress's plan, before its barrels only flush with the ledge, and under the massif's cap
  // (MASSIF_PLAY_TOP).
  const near = terrain.arena(startS + size / 2);
  if (near && startS + size > near.fromS + MASSIF_WALLS[0] && startS < near.fromS + MASSIF_WALLS[1]) {
    // (Its faces only: not the leads' low banks on the low ground at its foot, which keep the shelves' rule. Under the
    // barrels too, in the ascent's top face: walls keep flush with its rim, the ledge, far under the barrels.)
    // (The ascent's faces from a drop of 1.0, the slopes' and peaks' broken steps from 1.3: fewer pieces off the ascent.)
    const massifFace = (x: number, s: number, drop: number) => {
      const hold = holdAt(x, s);
      return !!hold && hold.massif > 0.3 && drop >= (hold.ledge > 0.5 ? 1 : 1.3) && terrain.height(x, s) > SEA + 0.9 && strongholdClear(terrain.arena(s), x, s, 0.5, false);
    };
    for (const wall of yield* cliffWallSteps(seed, startS, size, terrain, { ...walls, salt: 0x7c2f, minDrop: 1, cap: STRONGHOLD.crag, arenas: true, accept: massifFace })) {
      const arena = terrain.arena(wall.s), rise = wall.height * KIT.iceWall.height;
      // (Before the barrels nothing stands over the ledge.)
      const top = strongholdClear(arena, wall.x, wall.s, 0.5) ? massifCap(wall.x, wall.s) : STRONGHOLD_LEDGE.level + 0.3;
      if (!strongholdClear(arena, wall.x, wall.s, 0.5, false)) continue;
      // (Nor where the renderer would hide it, its box reaching into the fortress's plan: STRONGHOLD_FOOTPRINT.)
      const r = KIT.iceWall.radius * wall.scale, f = STRONGHOLD_FOOTPRINT, a = wall.s - (arena ?? near).fromS;
      if (Math.abs(wall.x) - r < f.halfWidth && a + r > STRONGHOLD_AT - f.front && a - r < STRONGHOLD_AT + f.back) continue;
      if (wall.y + rise > top) {
        if (top - wall.y < 0.7) continue;
        wall.height = (top - wall.y) / KIT.iceWall.height;
      }
      // (The ascent's walls are essential; the slopes' and peaks' are cosmetic, so the low graphics tier draws the ascent's
      // only: they add some 80k triangles at the stop on High.)
      sink.keep([{ ...wall, cosmetic: (holdAt(wall.x, wall.s)?.ledge ?? 0) <= 0.5 }]);
    }
  }
  // Round the fortress: crags where the mountain meets the model, along its flanks and behind its roof (they break the
  // plan's straight edges).
  const arena = terrain.arena(startS + size / 2);
  if (arena && startS + size > arena.fromS + lifted(STRONGHOLD.front) - 2 && startS < arena.fromS + lifted(STRONGHOLD.rear) + 4) {
    const c = STRONGHOLD;
    for (let k = 0; k < 44; k++) {
      const h = (i: number) => hash(seed ^ 0x5740, k, i), side = k % 2 ? 1 : -1, behind = k >= 30;
      const a = behind ? c.rear + 0.35 + h(1) * 1.6 : c.front - 0.6 + h(1) * (c.rear - c.front + 1.6);
      const half = mix(c.wide, c.narrow, smoothRange(c.waist[0], c.waist[1], a));
      const x = (behind ? (h(0) - 0.5) * 2 * (c.narrow + 1) : side * (half + 0.35 + h(0) * 1.4)) * STRONGHOLD_SCALE, s = arena.fromS + lifted(a);
      if (s < startS || s >= startS + size || !strongholdClear(arena, x, s, 0.15)) continue;
      const y = terrain.height(x, s), scale = 1.1 + h(2) * 1.1;
      if (y > (onMassif(x, s) ? VESPER_SCENERY_MAX : CAP) - 0.5 || y < SEA) continue;
      add({ kind: 'outcrop', x, s, y: y - 0.1, scale, height: scale * (0.8 + h(3) * 0.6), rotation: turn(h(4)), cosmetic: false }, h(5));
    }
  }
  return sink.finish();
}

/* ---------------------------------------------------------------- floes */

/** Pack-ice plates (jittered lattice, nearly touching) and the smaller brash at field edges. */
const PLATE_CELL = 1.35, BRASH_CELL = 0.8;
/**
 * Floe nodes by size class (art/vesper-kit/README.md). Mostly the jagged pack-ice outlines (4–9); the first
 * convex plates (0–3, two of them ridged) turn up now and then.
 */
const MEDIUM_FLOES = [6, 7] as const, LARGE_FLOES = [8, 9] as const, BRASH_FLOES = [4, 5] as const, CONVEX_FLOES = [0, 1, 2, 3] as const;
const CONVEX_SHARE = 0.12;
const floeSize = (variant: number) => { const [hx, hz] = FLOE_FOOTPRINT[kitNodeName('floe', variant)]; return 2 * Math.max(hx, hz); };
/** Pack-ice density: fields of packed plates, thinning out at their edges, with open leads between them. */
function packDensity(seed: number, x: number, s: number, p: VesperParams): number {
  // Domain-warped, so field edges are ragged and thin out into brash instead of following one noise contour.
  const wx = x + (noise(seed ^ 0xf1e5, x * 0.07, s * 0.06) - 0.5) * 12, ws = s + (noise(seed ^ 0xf1e6, x * 0.07 + 5.1, s * 0.06) - 0.5) * 12;
  const n = noise(seed ^ 0xf1e1, wx * 0.09 + 3.3, ws * 0.07) * 0.7 + noise(seed ^ 0xf1e2, wx * 0.23, ws * 0.21) * 0.3;
  const lead = 1 - smoothRange(0.015, 0.05, Math.abs(noise(seed ^ 0xf1e3, x * 0.06, s * 0.05) - 0.5));
  return smoothRange(mix(0.78, 0.3, p.floes), mix(0.98, 0.66, p.floes), n) * (1 - lead);
}
/** Big cracked plates: one candidate per field cell (two plate cells), pure in seed and position. */
const FIELD_CELL = 2.7;
interface BigPlate { kind: FloeSetKind; x: number; s: number; yaw: number; scale: number; spread: number }
/** Large triples and pairs make most big plates; the smaller pair now and then. */
const pickSet = (pick: number): FloeSetKind => pick < 0.42 ? 'floeTripleC' : pick < 0.82 ? 'floePairA' : 'floePairB';
function bigPlate(seed: number, i: number, j: number, arena: TerrainArena | undefined): BigPlate | null {
  const h = (k: number) => hash(seed ^ 0xb16e, i * 53 + k, j);
  const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.5) * FIELD_CELL, s = (j + 0.5 + (h(1) - 0.5) * 0.5) * FIELD_CELL;
  if (h(2) > 0.55 || arenaAt(arena, seed, x, s) > 0 || packDensity(seed, x, s, vesperParams(seed, s)) < 0.62) return null;
  const kind = pickSet(h(5));
  // Sets keep their cracks narrow (offsets × 1.0–1.3: the pieces have only begun to drift apart).
  return { kind, x, s, yaw: h(3) * Math.PI * 2, scale: kind === 'floePairB' ? 1.3 + h(4) * 0.5 : 1 + h(4) * 0.25, spread: 1 + h(6) * 0.3 };
}
/** Reach of a big plate's assembled outline from its origin. */
const bigReach = (plate: BigPlate) => FLOE_SETS[plate.kind].reach * plate.scale * plate.spread;
/**
 * Pack ice: fields of jagged floes packed tightly (narrow dark cracks between them) in mixed sizes, big plates
 * from the kit's cracked sets (pieces with the set's yaw at their documented offsets, drifting a little apart),
 * thinning into small brash at the field edges, open leads between fields, and now and then an iceberg. Each
 * piece has a stable id and base position; drift is presentation-only and coherent across a field (phases
 * follow smooth noise, and a set's pieces share one). A mission arena stays calm: nothing floats inside its
 * platform range, and its ramps carry only distant icebergs off the world's sides.
 */
export function* vesperFloes(seed: number, startS: number, size: number, terrain: ScatterField, arena: TerrainArena | undefined): Work<Floe[]> {
  const floes: Floe[] = [];
  // Open water all around, clear of jetties, ships and pipeline trestles.
  const open = (x: number, s: number, reach: number) => Math.abs(x) + reach <= WORLD_HALF
    && [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]].every(([dx, ds]) => terrain.height(x + dx, s + ds) < SEA - 0.25 && !terrain.blocked(x + dx, s + ds));
  const phaseAt = (x: number, s: number) => noise(seed ^ 0xf1e4, x * 0.05, s * 0.05) * Math.PI * 4;
  const inside = (s: number) => !!arena && s >= arena.fromS && s <= arena.toS;
  const fieldColumns = Math.floor(WORLD_HALF * 2 / FIELD_CELL);
  // Big cracked plates. Candidates are pure, so every section agrees on them; each piece belongs to the section
  // holding its own position and is placed only over open water there.
  const plates = new Map<number, BigPlate | null>();
  const plateAt = (i: number, j: number) => {
    const key = j * 64 + i;
    if (!plates.has(key)) plates.set(key, i < 0 || i >= fieldColumns ? null : bigPlate(seed, i, j, arena));
    return plates.get(key)!;
  };
  for (let j = Math.floor((startS - 4) / FIELD_CELL); j <= Math.floor((startS + size + 4) / FIELD_CELL); j++) {
    yield;
    for (let i = 0; i < fieldColumns; i++) {
      const plate = plateAt(i, j);
      if (!plate) continue;
      const cos = Math.cos(plate.yaw), sin = Math.sin(plate.yaw), height = 0.9 + hash(seed ^ 0xb16f, i * 59, j) * 0.3;
      FLOE_SETS[plate.kind].offsets.forEach(([u, v], k) => {
        // origin + R(yaw)·offset in three.js axes (x, z), with s = −z.
        const lu = u * plate.scale * plate.spread, lv = v * plate.scale * plate.spread;
        const x = plate.x + lu * cos + lv * sin, s = plate.s - (-lu * sin + lv * cos);
        const [hx, hz] = FLOE_FOOTPRINT[kitNodeName(plate.kind, k)];
        if (s < startS || s >= startS + size || !open(x, s, 0.8 * Math.max(hx, hz) * plate.scale)) return;
        floes.push({ id: `set:${i}:${j}:${k}`, kind: plate.kind, variant: k, x, s, scaleX: plate.scale, scaleZ: plate.scale,
          height, rotation: plate.yaw, phase: phaseAt(plate.x, plate.s), radius: 0.22, originX: plate.x, originS: plate.s });
      });
    }
  }
  const covered = (x: number, s: number) => {
    const fi = Math.floor((x + WORLD_HALF) / FIELD_CELL), fj = Math.floor(s / FIELD_CELL);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const plate = plateAt(fi + di, fj + dj);
      if (plate && Math.hypot(x - plate.x, s - plate.s) < bigReach(plate)) return true;
    }
    return false;
  };
  // Resumable: one lattice row per step.
  const place = function* (cell: number, salt: number, decide: (x: number, s: number, d: number, platform: number, h: (k: number) => number, i: number, j: number) => void): Work<void> {
    const columns = Math.floor(WORLD_HALF * 2 / cell);
    for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
      if (i === 0) yield;
      const h = (k: number) => hash(seed ^ salt, i * 37 + k, j);
      const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.3) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.3) * cell;
      if (s < startS || s >= startS + size || inside(s)) continue;
      decide(x, s, packDensity(seed, x, s, vesperParams(seed, s)), arenaAt(arena, seed, x, s), h, i, j);
    }
  };
  yield* place(PLATE_CELL, 0xf10e, (x, s, d, platform, h, i, j) => {
    const p = vesperParams(seed, s);
    // Icebergs: rare on open water; on an arena's ramps only far off to the sides.
    if (platform > 0 ? Math.abs(x) > WORLD_HALF - 4 && h(2) < 0.08 : h(2) < 0.018 * p.floes) {
      const scale = 1 + h(3) * 0.8;
      if (open(x, s, 0.8 * scale) && (platform > 0 || !covered(x, s))) floes.push({ id: `berg:${i}:${j}`, kind: 'iceberg', variant: Math.floor(h(4) * KIT.iceberg.variants), x, s,
        scaleX: scale * (0.85 + h(5) * 0.3), scaleZ: scale * (0.85 + h(6) * 0.3), height: scale * (0.7 + h(7) * 0.5), rotation: h(8) * Math.PI * 2,
        phase: phaseAt(x, s), radius: 0.12 });
      return;
    }
    if (platform > 0 || d < 0.5 || h(9) > (d - 0.5) / 0.1 || covered(x, s)) return;
    // Plates fill their cell in mixed sizes (about a third small), each node scaled to its drawn width from its
    // own footprint, with a little stretch and free rotation; neighbours may raft over each other.
    const small = h(10) < 0.32, width = small ? 0.75 + h(16) * 0.3 : 1.4 + h(16) * 0.4;
    const variant = h(13) < CONVEX_SHARE ? CONVEX_FLOES[Math.floor(h(17) * CONVEX_FLOES.length)]
      : (small ? MEDIUM_FLOES : h(17) < 0.7 ? LARGE_FLOES : MEDIUM_FLOES)[Math.floor(h(18) * 2)];
    const scale = width / floeSize(variant), sx = scale * (0.88 + h(11) * 0.24), sz = scale * (0.88 + h(12) * 0.24);
    if (!open(x, s, 0.45 * width)) return;
    floes.push({ id: `plate:${i}:${j}`, kind: 'floe', variant, x, s, scaleX: sx, scaleZ: sz,
      height: 0.8 + h(14) * 0.5, rotation: h(15) * Math.PI * 2, phase: phaseAt(x, s), radius: 0.22 });
  });
  yield* place(BRASH_CELL, 0xb2a5, (x, s, d, platform, h, i, j) => {
    // Brash: small broken pieces where a field thins out (never inside the packed core or near an arena).
    if (platform > 0 || d < 0.18 || d > 0.66 || h(2) > Math.sin((d - 0.18) / 0.48 * Math.PI) * 0.55) return;
    const variant = h(9) < 0.1 ? 3 : BRASH_FLOES[Math.floor(h(4) * 2)], width = 0.22 + h(3) * 0.38, scale = width / floeSize(variant);
    if (!open(x, s, 0.4)) return;
    floes.push({ id: `brash:${i}:${j}`, kind: 'floe', variant, x, s, scaleX: scale * (0.8 + h(5) * 0.4), scaleZ: scale * (0.8 + h(6) * 0.4),
      height: 0.6 + h(7) * 0.4, rotation: h(8) * Math.PI * 2, phase: phaseAt(x, s), radius: 0.22 });
  });
  return floes;
}

/* ---------------------------------------------------------------- profile */

export const VESPER: PlanetProfile = {
  id: 'vesper', seaLevel: SEA,
  mood: (seed, s) => vesperMoodOf(seed, Math.floor(s / MOOD_LENGTH)), params: () => NEUTRAL, local: vesperParams,
  landform: vesperLandform,
  // HELION STRONGHOLD's arena is shaped in the landform itself (strongholdGround): its clearing is the valley's snow.
  arena() {},
  color: vesperColor,
  shadowTint: [0.62, 0.74, 1],
  sceneryMax: VESPER_PIECE_MAX,
  settlement: vesperSettlement,
  scatter: vesperScatterSteps,
  floes: vesperFloes,
  industrial: new Set(['radiator', 'missile', 'cryo', 'exchanger', 'reactor']), quiet: new Set(), cliffs: true,
};
