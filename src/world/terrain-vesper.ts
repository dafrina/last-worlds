import {
  WORLD_HALF, bench, clamp, hash, mix, noise, routeCalm, smooth, smoothRange, NEUTRAL_MOOD, type Landform, type MoodParams,
} from './terrain-layout';
import { FLOE_FOOTPRINT, FLOE_SETS, KIT, kitNodeName, type FloeSetKind, type KitInstance, type ScatterField } from './terrain-scatter';
import { MODULE_HEIGHT, type Archetype, type PlacedModule, type Settlement } from './terrain-settlements';
import type { Work } from './terrain-work';
import type { Floe, PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaWeight, type TerrainArena } from './terrain-arena';

/**
 * Vesper, the Glass Frontier (docs/17 §1, §4): mostly land. Big snowy ice shelves (0.6–2.0) cover about 70%
 * of the route (tested over long stretches); they end in sheer ice cliffs over a sea at −1.2 and are broken by
 * open leads, inlets and occasional bays, with a pack-ice sea of drifting floes now and then. Crevasse fields,
 * pressure ridges, snow drifts and a few dark rock outcrops dress the shelves. Pure functions of seed and
 * world coordinates, like Khepri.
 */
export const VESPER_SEA_LEVEL = -1.2;
const SEA = VESPER_SEA_LEVEL;
/**
 * Vesper's scenery cap: the same 0.8 clearance under the flight plane (3.8) that Khepri's 2.2 kept under the
 * original plane at 3.0, so shelf emplacements, cranes and masts fit on 0.6–2.0 shelves.
 */
export const VESPER_SCENERY_MAX = 3.0;

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
  /** Height of one ice-cliff step between shelf levels (docs/26 §3). */ step: number;
  /** How far the shelves climb inland from the coast, in levels. */ stairs: number;
}
/**
 * Land shares measured over long routes (seeds 93, 8831, 11, 4242, 7; docs/26 §3): the six moods keep the planet at
 * about 70% land. Shelves stand at several levels: low ice feet at the coast, stepping up inland in ice cliffs.
 */
const MOOD_SETTINGS: Readonly<Record<VesperMood, VesperParams>> = {
  // Shelf coast: big shelves and their cliffs against open water, leads and scattered floes.
  shelf: { land: 0.66, leads: 0.7, crevasse: 0.3, ridge: 0.4, rock: 0.45, floes: 0.5, top: 0.9, step: 1.05, stairs: 1.6 },
  // Pack-ice sea: mostly water crowded with floes and bergs, a few low shelf islands.
  pack: { land: 0.25, leads: 0.3, crevasse: 0.1, ridge: 0.5, rock: 0.2, floes: 1, top: 0.55, step: 0.8, stairs: 0.8 },
  // Crevasse plateau: a high continuous shelf torn by crevasse fields.
  crevasse: { land: 0.86, leads: 0.35, crevasse: 1, ridge: 0.45, rock: 0.25, floes: 0.35, top: 1.4, step: 1.15, stairs: 1.4 },
  // Radiator plains: broad, quiet shelves at two or three levels (the factions' radiator fields).
  radiator: { land: 0.8, leads: 0.45, crevasse: 0.15, ridge: 0.2, rock: 0.3, floes: 0.45, top: 1.0, step: 1.25, stairs: 1.2 },
  // Icefall: an ice plateau stepping up in many short cliffs, with pressure ridges along the steps.
  icefall: { land: 0.7, leads: 0.4, crevasse: 0.55, ridge: 0.7, rock: 0.35, floes: 0.4, top: 1.0, step: 0.8, stairs: 2.4 },
  // Nunataks: dark rock peaks breaking through the ice, snow-capped, between broad shelves.
  nunatak: { land: 0.62, leads: 0.45, crevasse: 0.3, ridge: 0.3, rock: 1, floes: 0.45, top: 0.9, step: 1.05, stairs: 1.4 },
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
  // Sheer cliffs: membership flips within a few tenths of a unit.
  let land = smoothRange(-1, 1, (mass - threshold) / 0.012);
  // Open leads: narrow winding water channels across the shelves.
  const lead = (1 - smoothRange(0.01, 0.032, Math.abs(noise(seed ^ 0x9a6, qx * 0.05, qs * 0.044) - 0.5))) * smoothRange(0.15, 0.4, p.leads);
  land *= 1 - lead;
  const field = smoothRange(0.42, 0.62, noise(seed ^ 0x9a9, x * 0.05 + 2.3, s * 0.05)) * Math.min(1, p.crevasse * 1.4) * (1 - calm * 0.85);
  const crack = (1 - smoothRange(0.008, 0.034, Math.abs(noise(seed ^ 0x9aa, qx * 0.34, qs * 0.11) - 0.5))) * field;
  const ridge = smoothRange(0.78, 0.97, ridged(noise(seed ^ 0x9a8, qx * 0.09, qs * 0.13))) * Math.min(1, p.ridge * 1.6) * (1 - calm * 0.7);
  const rock = smoothRange(0.68, 0.86, noise(seed ^ 0x9ab, x * 0.16, s * 0.15)) * Math.min(1, p.rock * 1.6) * (1 - calm * 0.6);
  // Wind-packed dunes: long, low ridges aligned with the prevailing wind (from the upper left), finite in length.
  const along = x * WIND_X + s * WIND_S, across = -x * WIND_S + s * WIND_X;
  const dune = smoothRange(0.5, 0.85, noise(seed ^ 0x9af, along * 0.07, across * 0.36)) * smoothRange(0.3, 0.7, noise(seed ^ 0x9b0, x * 0.04, s * 0.04));
  return { land, crack, ridge, rock, mass, dune, threshold, calm };
}

/**
 * An ocean arena's weight for the coastline around it: the platform range itself is open water (weight 1), and on
 * the ramps the open water reaches out by up to 9 units in places, so the shelf edge that frames the arena is an
 * irregular coast with bays rather than one straight line. Never below the row's own weight.
 */
function coastPlatform(seed: number, x: number, s: number, arena: TerrainArena): number {
  const reach = 9 * smoothRange(0.3, 0.75, noise(seed ^ 0xa7e1, x * 0.11, s * 0.07));
  return Math.max(arenaWeight(arena, s), arenaWeight(arena, s + reach), arenaWeight(arena, s - reach));
}
/**
 * The smooth shelf level the ice cliffs are cut from: the mood's top, a regional swell, and a climb inland from the
 * coast (low ice feet at the water, higher shelves behind them). Never below the low ice foot.
 */
function shelfLevel(seed: number, x: number, s: number, p: VesperParams, threshold: number, calm: number): number {
  const { mass } = shelfMass(seed, x, s), inland = smoothRange(0, 0.16, mass - threshold);
  const level = p.top + (noise(seed ^ 0x9a7, x * 0.055, s * 0.05) - 0.5) * 0.9 + (noise(seed ^ 0x9b3, x * 0.07, s * 0.065) - 0.5) * 0.5 * p.stairs
    + (inland - 0.45) * p.step * p.stairs;
  return mix(level, p.top, calm * 0.4);
}
/** Ice-cliff riser width between shelf levels (sheer, two grid cells) and the gradient probe. */
const ICE_RISER = 0.5, ICE_PROBE = 0.3;
/** The lowest shelf (an ice foot just above the sea) and the highest ice. */
const SHELF_LOW = SEA + 0.75, SHELF_HIGH = 2.3;
/**
 * Vesper ground: seabed under the water; on land, shelves at several levels separated by sheer ice cliffs (stepping up
 * inland from the coast), with snow drifts, pressure ridges, crevasse fields and dark nunataks breaking through.
 */
export function vesperLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const p = row.local as VesperParams, m = vesperMasks(seed, x, s, p, row.arena ? coastPlatform(seed, x, s, row.arena) : row.platform);
  const seabed = SEA - 1.5 - noise(seed ^ 0x9ac, x * 0.07, s * 0.06) * 1.6;
  let top = seabed;
  if (m.land > 0) {
    // Ragged ice edges: fine relief moves the cliff lines into spurs and bays without roughening the shelves.
    const jag = (u: number, v: number) => (noise(seed ^ 0x9b8, u * 0.3, v * 0.28) - 0.5) * 0.4;
    const level = shelfLevel(seed, x, s, p, m.threshold, m.calm), edges = level + jag(x, s);
    const gx = (shelfLevel(seed, x + ICE_PROBE, s, p, m.threshold, m.calm) + jag(x + ICE_PROBE, s) - edges) / ICE_PROBE;
    const gs = (shelfLevel(seed, x, s + ICE_PROBE, p, m.threshold, m.calm) + jag(x, s + ICE_PROBE) - edges) / ICE_PROBE;
    const phase = noise(seed ^ 0x9b4, x * 0.02 + 1.7, s * 0.018) * p.step;
    // Snow ramps: here and there a step softens into a drift slope, so tracks can climb between shelf levels.
    const ramp = smoothRange(0.6, 0.74, noise(seed ^ 0x9b7, x * 0.07, s * 0.065));
    top = clamp(bench(level, Math.hypot(gx, gs), p.step, phase, ICE_RISER, 0.92 * (1 - ramp), edges), SHELF_LOW, SHELF_HIGH);
    top += (noise(seed ^ 0x9ad, x * 0.25, s * 0.3) - 0.5) * 0.14 + (noise(seed ^ 0x9ae, x * 1.3, s * 1.2) - 0.5) * 0.03;
    // Pressure ridges: jagged walls of broken ice; drifts: wind-packed snow; nunataks: dark rock peaks.
    top += m.ridge * (0.45 + 0.35 * ridged(noise(seed ^ 0x9b5, x * 0.6, s * 0.55)));
    top += m.dune * 0.38 * (1 - m.crack);
    if (m.rock > 0) top += m.rock * (0.5 + 1.1 * smooth(ridged(noise(seed ^ 0x9b6, x * 0.3, s * 0.28)) * m.rock));
    // Crevasses: deep, sheer cracks that never open to the sea (their floors stay ice).
    top = Math.max(Math.min(top, SEA + 0.35), top - m.crack * 1.5);
  }
  const height = mix(seabed, top, m.land);
  return {
    height: clamp(height, -8, 2.4), elevation: m.land, channel: m.crack * m.land, pool: 0, vein: 99, vein2: 99, veins: 0,
    tone: m.rock * m.land,
  };
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
  const steep = smoothRange(0.9, 2.4, slope), shade = smoothRange(0.35, 0.8, drift) * 0.35;
  const cliff = smoothRange(SEA, 1.6, point.height), rock = smoothRange(0.25, 0.6, point.tone ?? 0);
  // Snow caps stay on the flat tops of outcrops; their flanks show charcoal rock.
  const bare = rock * (0.35 + 0.65 * smoothRange(0.3, 0.9, slope));
  for (let c = 0; c < 3; c++) {
    let snow = mix(P.snow[c], P.snowShade[c], shade + (1 - point.elevation) * 0.3);
    snow = mix(snow, P.iceDeep[c], point.channel * 0.85);
    snow = mix(snow, P.snow[c], rim * (1 - steep) * 0.4);
    const ice = mix(P.iceDeep[c], P.iceLight[c], cliff) * (0.9 + fine * 0.2);
    out[c] = mix(mix(snow, ice, steep), P.rock[c] * (0.9 + fine * 0.2), bare);
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
/** Chance that a cell's flank holds an outpost when it finds dry, level shelf (0.88 before version 13). */
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

const memo = new Map<string, Settlement | null>();
/** The Vesper settlement candidate of one cell and side: on shelf ice only (never on water). */
export function vesperSettlement(seed: number, cell: number, side: number): Settlement | null {
  const key = `${seed}:${cell}:${side}`;
  if (memo.has(key)) return memo.get(key)!;
  const h = (k: number) => hash(seed ^ 0x7e5e ^ (side > 0 ? 0x1000 : 0), cell * 211 + k, 5);
  let result: Settlement | null = null;
  const ground = (x: number, s: number) => vesperLandform(seed, x, s, { seed, s, params: NEUTRAL, local: vesperParams(seed, s), platform: 0 }).height;
  if (h(0) < OUTPOST_CHANCE) {
    let x = 0, s = 0, best = Infinity;
    for (let k = 0; k < 9; k++) {
      // Candidates from about a third of the half width out (some in view beside the centre lane), clamped up front (largest
      // pad) so a harbour's measured edge distance stays valid.
      const cx = side * Math.min(WORLD_HALF * (0.35 + h(1 + k) * 0.48), WORLD_HALF - 4.1), cs = cell * CELL + 8 + h(10 + k) * 14;
      const heights = [[0, 0], [2.6, 0], [-2.6, 0], [0, 3], [0, -3]].map(([dx, ds]) => ground(cx + dx, cs + ds));
      if (Math.min(...heights) < SEA + 0.5) continue;
      // Flat shelf first, and low shelf over high (tall masts and tanks only fit under the cap on the lower levels).
      const cost = Math.max(...heights) - Math.min(...heights) + 0.5 * Math.max(0, heights[0] - 1.1);
      if (cost < best) { best = cost; x = cx; s = cs; }
    }
    if (best < Infinity) {
      // A shelf edge within reach makes a harbour possible: find the nearest water in the four directions.
      // (Never toward the near world edge: the jetty must fit inside the world.)
      let water = -1, edge = Infinity;
      [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, ds], turn) => {
        if (dx !== 0 && Math.abs(x + dx * 12) > WORLD_HALF) return;
        for (let d = 2.5; d <= 6; d += 0.5) if (ground(x + dx * d, s + ds * d) < SEA) { if (d < edge) { edge = d; water = turn; } break; }
      });
      const allowed = VESPER_ARCHETYPES.filter(a => a !== 'harbour' || water >= 0), total = allowed.reduce((sum, a) => sum + WEIGHTS[a], 0);
      let roll = hash(seed ^ 0x7e5f ^ (side > 0 ? 0x1000 : 0), cell, 4) * total, archetype: Archetype = allowed[allowed.length - 1];
      for (const a of allowed) { roll -= WEIGHTS[a]; if (roll <= 0) { archetype = a; break; } }
      // Harbours turn their quay toward the water; others take a seeded quarter turn.
      const turns = archetype === 'harbour' ? water : Math.floor(h(21) * 4), mirror = archetype === 'harbour' ? 1 : h(22) < 0.5 ? -1 : 1;
      const [hu, hv] = EXTENT[archetype], [hx, hs] = turns % 2 ? [hv, hu] : [hu, hv];
      // The pad keeps its shelf's level; pieces too tall for the room under the cap there are swapped for lower ones.
      const level = clamp(Math.round(ground(x, s) / 0.25) * 0.25, SEA + 0.75, 2.25), room = VESPER_SCENERY_MAX - 0.05 - level;
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
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [], CAP = VESPER_SCENERY_MAX;
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number, shade?: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale > WORLD_HALF) return;
    if (instance.y + instance.height * spec.height > CAP) instance = { ...instance, height: (CAP - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: shade ?? terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7c1a, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s)) continue;
    const platform = terrain.platform(s);
    if (platform >= 0.5 || (platform > 0 && h(30) < platform * 2)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), rise = terrain.rise(x, s), drop = terrain.drop(x, s), pick = h(2);
    const gx = terrain.gradientX(x, s), gs = terrain.gradientS(x, s), steepness = Math.hypot(gx, gs);
    const p = vesperParams(seed, s), m = vesperMasks(seed, x, s, p, platform);
    // Water is dressed by the coarser cliff pass below (and drifting floes); shelves get the land pieces here.
    if (ground < SEA) continue;
    if (m.crack > 0.2 && slope < 1.4 && pick < 0.07) {
      add({ kind: 'serac', x, s, y: ground, scale: 0.8 + h(3) * 0.4, height: 0.45 + h(4) * 0.5, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (m.ridge > 0.5 && pick < 0.12) {
      const scale = 0.85 + h(3) * 0.3;
      add({ kind: 'ridge', x, s, y: ground, scale, height: scale, rotation: Math.atan2(-gx, gs) + Math.PI / 2 + (h(4) - 0.5) * 0.4, cosmetic: h(7) > 0.6 }, h(5));
    } else if (m.rock > 0.3 && pick < 0.32) {
      const scale = 0.8 + h(3) * 0.5;
      add({ kind: 'outcrop', x, s, y: ground, scale, height: scale, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (drop > 0.9 && slope < 1 && pick < 0.025) {
      add({ kind: 'iceSpire', x, s, y: ground, scale: 0.85 + h(3) * 0.3, height: 0.8 + h(4) * 0.9, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (slope < 0.5 && m.land > 0.9 && terrain.industrial(x, s) > 0.01 && pick < 0.08) {
      // Vent stacks are outpost plant: they stand on the fringe of a pad, never alone on the shelf.
      const scale = 0.9 + h(3) * 0.2;
      add({ kind: 'vent', x, s, y: ground, scale, height: scale, rotation: turn(h(5)), cosmetic: false }, h(6));
    }
  }
  // Ice-cliff faces: one long wall per lattice cell where a shelf cliff meets open water. A wall stands flush
  // in the face (front just out from the cliff foot, body inside the shelf) with its top just under the rim, so
  // neighbours read as one continuous faceted face with an undercut waterline, not a row of pillars in front of
  // it. Base at sea level, +Z out to sea, long axis along the edge. Now and then a calved block lies at the foot.
  const lattice = CLIFF_CELL, across = Math.floor(WORLD_HALF * 2 / lattice);
  for (let j = Math.floor(startS / lattice); j < Math.ceil((startS + size) / lattice); j++) for (let i = 0; i < across; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7c2b, i * 43 + k, j);
    if (terrain.platform((j + 0.5) * lattice) >= 0.5) continue;
    let found: { x: number; s: number } | null = null;
    for (let k = 0; k < 9 && !found; k++) {
      const x = -WORLD_HALF + (i + 0.2 + (k % 3) * 0.3) * lattice, s = (j + 0.2 + Math.floor(k / 3) * 0.3) * lattice;
      if (terrain.height(x, s) < SEA && terrain.rise(x, s) > 1.2) found = { x, s };
    }
    if (!found) continue;
    const gx = terrain.gradientX(found.x, found.s), gs = terrain.gradientS(found.x, found.s), steepness = Math.hypot(gx, gs);
    if (steepness < 0.05) continue;
    const ux = gx / steepness, us = gs / steepness;
    if (terrain.height(found.x - ux * 1.8, found.s - us * 1.8) > SEA - 0.3) continue;
    let foot = -1;
    for (let d = 0.25; d <= 1.75; d += 0.25) if (terrain.height(found.x + ux * d, found.s + us * d) >= SEA) { foot = d; break; }
    if (foot < 0) continue;
    const top = Math.min(CAP, terrain.height(found.x + ux * (foot + 1.2), found.s + us * (foot + 1.2)));
    if (top - SEA < 0.6 || h(2) > 0.8) continue;
    // The wall's front face (half its depth, 0.48 × scale, out from its centre) sits 0.12 seaward of the foot.
    const scale = 1.45 + h(3) * 0.2, inset = 0.48 * scale - 0.12, fx = found.x + ux * (foot + inset), fs = found.s + us * (foot + inset);
    add({ kind: 'iceCliff', x: fx, s: fs, y: SEA, scale, height: (top - SEA) * 0.92, rotation: Math.atan2(-ux, us), cosmetic: false }, h(5), 1);
    if (h(6) < 0.25) {
      const d = 0.5 + h(7) * 0.8, block = 0.6 + h(8) * 0.4;
      add({ kind: 'serac', x: found.x + ux * foot - ux * d + (h(9) - 0.5) * 1.2, s: found.s + us * foot - us * d, y: SEA - 0.3, scale: block, height: 0.4 + h(10) * 0.4, rotation: h(11) * Math.PI * 2, cosmetic: true }, h(12), 1);
    }
  }
  // Inner ice cliffs between shelf levels (docs/26 §3): the same faceted wall pieces stand flush in each step, front
  // at its foot and top just under its rim, one per lattice cell along it, so a level change reads as an ice face
  // (as on the coast) rather than a smeared snow bank. Never in water, on pads or in an arena.
  for (let j = Math.floor(startS / lattice); j < Math.ceil((startS + size) / lattice); j++) for (let i = 0; i < across; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7c2d, i * 47 + k, j);
    if (h(0) > 0.92 || terrain.platform((j + 0.5) * lattice) > 0) continue;
    let found: { x: number; s: number } | null = null;
    for (let k = 0; k < 25 && !found; k++) {
      const x = -WORLD_HALF + (i + 0.1 + (k % 5) * 0.2) * lattice, s = (j + 0.1 + Math.floor(k / 5) * 0.2) * lattice;
      if (terrain.height(x, s) > SEA + 0.25 && terrain.slope(x, s) > 1.1 && !terrain.blocked(x, s) && terrain.industrial(x, s) < 0.05) found = { x, s };
    }
    if (!found) continue;
    const gx = terrain.gradientX(found.x, found.s), gs = terrain.gradientS(found.x, found.s), n = Math.hypot(gx, gs);
    const ux = gx / n, us = gs / n;
    // Foot and rim: walk down and up the step until the ground levels out.
    let down = 0, up = 0;
    while (down < 1.5 && terrain.slope(found.x - ux * (down + 0.125), found.s - us * (down + 0.125)) > 0.6) down += 0.125;
    while (up < 1.5 && terrain.slope(found.x + ux * (up + 0.125), found.s + us * (up + 0.125)) > 0.6) up += 0.125;
    const fx = found.x - ux * (down + 0.125), fs = found.s - us * (down + 0.125), tx = found.x + ux * (up + 0.125), ts = found.s + us * (up + 0.125);
    const base = terrain.height(fx, fs), top = Math.min(CAP, terrain.height(tx, ts));
    if (top - base < 0.45 || base < SEA + 0.2 || terrain.industrial(tx, ts) > 0.05 || terrain.blocked(fx, fs)) continue;
    // The wall's front face (0.48 × scale out from its centre) stands 0.1 in front of the foot.
    const scale = 1.25 + h(3) * 0.15, inset = 0.48 * scale - 0.1;
    add({ kind: 'iceCliff', x: fx + ux * inset, s: fs + us * inset, y: base - 0.08, scale, height: (top - base + 0.08) * 0.95, rotation: Math.atan2(-ux, us), cosmetic: false }, h(5));
  }
  return [...essential, ...cosmetic];
}
const CLIFF_CELL = 3.4;

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
  if (h(2) > 0.55 || arenaWeight(arena, s) > 0 || packDensity(seed, x, s, vesperParams(seed, s)) < 0.62) return null;
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
      decide(x, s, packDensity(seed, x, s, vesperParams(seed, s)), arenaWeight(arena, s), h, i, j);
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
  // The ocean arena is shaped in the landform itself (shelves recede); the seabed just deepens a little.
  arena(row, _x, point) { point.height = Math.min(point.height, mix(point.height, SEA - 2.6, row.platform)); },
  color: vesperColor,
  shadowTint: [0.62, 0.74, 1],
  sceneryMax: VESPER_SCENERY_MAX,
  settlement: vesperSettlement,
  scatter: vesperScatterSteps,
  floes: vesperFloes,
  industrial: new Set(['radiator', 'missile', 'cryo', 'exchanger', 'reactor']), quiet: new Set(),
};
