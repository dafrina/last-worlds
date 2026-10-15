import { WORLD_HALF, clamp, hash, mix, noise, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import { MODULE_HEIGHT, SETTLEMENT_CELL, type Archetype, type PlacedModule, type Settlement } from './terrain-settlements';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';

/**
 * Khepri's moon, the training ground (docs/19): grey regolith pocked with impact craters at three scales, smooth
 * dark mare plains with fewer of them, and a handful of small outposts. No water, no roads, no pipelines.
 * Every piece reuses the Khepri kit and infrastructure models. Pure functions of seed and world coordinates.
 */
const NEUTRAL: MoodParams = { lift: 0, relief: 1, carve: 0, terrace: 0, mineral: 0, stacks: 0 };
/** Moon scenery keeps Khepri's clearance under the flight plane. */
export const MOON_SCENERY_MAX = 2.2;

/* ---------------------------------------------------------------- craters */

interface CraterScale { cell: number; chance: number; radius: readonly [number, number]; depth: number; rim: number; floor: number; salt: number }
/**
 * Crater families, largest first. Depth and rim are fractions of the radius; `floor` flattens the bowl (big
 * craters have broad flat floors and steep walls, small ones are simple bowls). A crater's reach (its ejecta
 * apron, 1.8 radii) stays inside its cell's 3 × 3 neighbourhood.
 */
const CRATERS: readonly CraterScale[] = [
  { cell: 40, chance: 0.7, radius: [7.5, 13], depth: 0.16, rim: 0.045, floor: 4, salt: 0xc4a1 },
  { cell: 11, chance: 0.8, radius: [2.2, 4.4], depth: 0.26, rim: 0.07, floor: 2.6, salt: 0xc4a2 },
  { cell: 4.2, chance: 0.75, radius: [0.75, 1.6], depth: 0.3, rim: 0.08, floor: 2, salt: 0xc4a3 },
  { cell: 2, chance: 0.6, radius: [0.38, 0.7], depth: 0.28, rim: 0.07, floor: 2, salt: 0xc4a4 },
];
const REACH = 1.8;

/** Mare (dark basalt plains): 0 on the highlands, 1 deep in a mare. */
export function moonMare(seed: number, x: number, s: number): number {
  const wx = x + (noise(seed ^ 0xa1e2, x * 0.03, s * 0.03) - 0.5) * 18;
  return smoothRange(0.56, 0.7, noise(seed ^ 0xa1e1, wx * 0.014, s * 0.011));
}

export interface CraterField {
  /** Height added by every crater at the point. */ height: number;
  /** Inside a bowl (0..1, deepest at the centre). */ bowl: number;
  /** Bright fresh ejecta (0..1) around young craters. */ ejecta: number;
  /** Closeness to a rim crest (0..1), for boulders. */ rim: number;
}
/** All craters touching a point, summed: bowl, raised rim and an ejecta apron that fades by 1.8 radii. */
export function moonCraters(seed: number, x: number, s: number): CraterField {
  const out: CraterField = { height: 0, bowl: 0, ejecta: 0, rim: 0 };
  for (const scale of CRATERS) {
    const ci = Math.floor(x / scale.cell), cj = Math.floor(s / scale.cell);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj, h = (k: number) => hash(seed ^ scale.salt, i * 7 + k, j);
      const cx = (i + 0.2 + h(0) * 0.6) * scale.cell, cs = (j + 0.2 + h(1) * 0.6) * scale.cell;
      const r = mix(scale.radius[0], scale.radius[1], h(3)), d = Math.hypot(x - cx, s - cs) / r;
      // Out of reach first (cheap); then mare plains, which are younger: fewer craters survive on them.
      if (d >= REACH) continue;
      const roll = h(2);
      if (roll > scale.chance || roll > scale.chance * (1 - 0.45 * moonMare(seed, cx, cs))) continue;
      const depth = scale.depth * r, rim = scale.rim * r;
      if (d < 1) {
        // Flat-floored bowl rising steeply to the rim crest; big craters get a small central peak.
        out.height += -depth + (depth + rim) * Math.pow(d, scale.floor);
        if (r > 10.5) out.height += 0.5 * (1 - smoothRange(0, 0.2, d));
        out.bowl = Math.max(out.bowl, 1 - Math.pow(d, scale.floor));
      } else {
        const t = 1 - smoothRange(1, REACH, d);
        out.height += rim * t * t;
      }
      out.rim = Math.max(out.rim, 1 - smoothRange(0, 0.25, Math.abs(d - 1)));
      // About one crater in six is young, with a bright apron.
      if (h(4) < 0.17) out.ejecta = Math.max(out.ejecta, (1 - smoothRange(0.9, 2.1 * (0.85 + h(5) * 0.3), d)) * (d > 0.85 ? 1 : 0.55));
    }
  }
  return out;
}

/* ---------------------------------------------------------------- landform */

/** Moon ground: rolling highlands and low mare plains, cratered; `channel` carries the bowl and `tone` the ejecta. */
export function moonLandform(seed: number, x: number, s: number): Landform & { tone: number } {
  const mare = moonMare(seed, x, s), craters = moonCraters(seed, x, s);
  const rolling = (noise(seed ^ 0xa1e3, x * 0.04, s * 0.035) - 0.5) * 1.3 + (noise(seed ^ 0xa1e4, x * 0.13, s * 0.12) - 0.5) * 0.35
    + (noise(seed ^ 0xa1e5, x * 0.9, s * 0.9) - 0.5) * 0.04;
  const base = mix(0.2 + rolling, -0.9 + rolling * 0.25, mare);
  return {
    height: clamp(base + craters.height, -4.5, 1.8), elevation: 1 - mare, channel: craters.bowl, pool: 0, vein: 99, vein2: 99, veins: 0,
    tone: craters.ejecta,
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Regolith palette, linear RGB: warm-grey highlands, darker blue-grey mare, bright fresh ejecta. */
export const MOON_PALETTE = {
  highland: linear(0xb4b1ab), highlandLit: linear(0xc6c3bd), mare: linear(0x7a797a), bowl: linear(0x96938e),
  wall: linear(0x8a8782), ejecta: linear(0xe4e2dd), pad: linear(0xa09e9a),
} as const;

function moonColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = MOON_PALETTE, { seed, s } = row;
  const drift = noise(seed ^ 0x51c1, x * 0.08, s * 0.06), fine = noise(seed ^ 0x51c2, x * 1.3, s * 1.3);
  const lit = smoothRange(0.45, 0.8, drift) * 0.6, steep = smoothRange(0.7, 1.8, slope), mare = 1 - point.elevation;
  for (let c = 0; c < 3; c++) {
    let value = mix(mix(P.highland[c], P.highlandLit[c], lit), P.mare[c], mare * 0.9);
    value = mix(value, P.bowl[c] * mix(1, 0.8, mare), point.channel * 0.35);
    value = mix(value, P.wall[c], steep * 0.5);
    value = mix(value, P.highlandLit[c], rim * (1 - steep) * 0.45);
    value = mix(value, P.ejecta[c], (point.tone ?? 0) * 0.55);
    value = mix(value, P.pad[c], point.industrial * 0.4);
    out[c] = value * (0.95 + fine * 0.1);
  }
  return out;
}

/* ---------------------------------------------------------------- outposts */

/**
 * Sparse outposts from the Khepri infrastructure kit: a landing pad with a relay, a comm station with solar
 * panels, or an abandoned habitat. Most cells stay empty.
 */
const MOON_ARCHETYPES: readonly Archetype[] = ['landing', 'comm', 'abandoned'];
const EXTENT: Readonly<Record<string, [number, number]>> = { landing: [3.6, 3.6], comm: [2.9, 2.9], abandoned: [2.4, 2.4] };
const OUTPOST_CHANCE = 0.24;

interface LocalModule { kind: PlacedModule['kind']; node: string; u: number; v: number; yaw: number; scale?: number }
function compose(archetype: Archetype, h: (k: number) => number): LocalModule[] {
  const m: LocalModule[] = [];
  const infra = (node: string, u: number, v: number, yaw = 0) => m.push({ kind: 'infra', node, u, v, yaw });
  const shared = (node: string, u: number, v: number, yaw = 0) => m.push({ kind: 'shared', node, u, v, yaw });
  switch (archetype) {
    case 'landing':
      infra('infra_landing_pad', -0.5, 0);
      infra('infra_relay', 2.8, -2.2);
      shared('container_0', 2.7, 0.6, Math.PI / 2);
      if (h(1) < 0.5) shared('tank_sphere', 2.6, 2.4);
      infra('infra_light_mast', -3.1, 3.1);
      break;
    case 'comm':
      infra('infra_comm_dish', -0.9, 0.9);
      infra('infra_solar_array', -1.1, -1.6); infra('infra_solar_array', 1.1, -1.6);
      if (h(1) < 0.6) infra('infra_habitat_1', 1.6, 1.4, Math.PI / 2);
      break;
    default:
      infra('infra_habitat_0', -0.6, 0.4, h(2) * 0.6);
      shared(`container_${h(3) < 0.5 ? 0 : 1}`, 1.4, -1.2, h(4) * Math.PI);
      if (h(5) < 0.5) infra('infra_solar_array', 0.6, 1.7, 0.3);
  }
  return m;
}

const memo = new Map<string, Settlement | null>();
/** The moon outpost of one cell and side, or null (about one candidate in four), on the flattest nearby ground. */
export function moonSettlement(seed: number, cell: number, side: number): Settlement | null {
  const key = `${seed}:${cell}:${side}`;
  if (memo.has(key)) return memo.get(key)!;
  const h = (k: number) => hash(seed ^ 0xa1e7 ^ (side > 0 ? 0x1000 : 0), cell * 211 + k, 6);
  let result: Settlement | null = null;
  if (h(0) < OUTPOST_CHANCE) {
    let x = 0, s = 0, best = Infinity;
    for (let k = 0; k < 6; k++) {
      const cx = side * Math.min(WORLD_HALF * (0.4 + h(1 + k) * 0.45), WORLD_HALF - 4), cs = cell * SETTLEMENT_CELL + 8 + h(10 + k) * 14;
      const heights = [[0, 0], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]].map(([dx, ds]) => moonLandform(seed, cx + dx, cs + ds).height);
      const relief = Math.max(...heights) - Math.min(...heights);
      if (relief < best) { best = relief; x = cx; s = cs; }
    }
    const archetype = MOON_ARCHETYPES[Math.floor(h(20) * MOON_ARCHETYPES.length)];
    const turns = Math.floor(h(21) * 4), mirror = h(22) < 0.5 ? -1 : 1, [hu, hv] = EXTENT[archetype];
    const [hx, hs] = turns % 2 ? [hv, hu] : [hu, hv];
    const local = compose(archetype, k => h(30 + k));
    const tallest = Math.max(...local.map(module => MODULE_HEIGHT[module.node] ?? 1));
    const level = clamp(Math.round(moonLandform(seed, x, s).height / 0.25) * 0.25, -4, MOON_SCENERY_MAX - tallest - 0.05);
    x = Math.sign(x) * Math.min(Math.abs(x), WORLD_HALF - hx - 0.3);
    const cos = [1, 0, -1, 0][turns], sin = [0, 1, 0, -1][turns];
    const modules = local.map((module, i): PlacedModule => {
      const u = module.u * mirror, v = module.v;
      return {
        id: `msettlement:${cell}:${side}:${i}`, kind: module.kind, node: module.node, x: x + u * cos - v * sin, s: s + u * sin + v * cos,
        yaw: (mirror < 0 ? -module.yaw : module.yaw) + turns * Math.PI / 2, scale: module.scale ?? 1, pick: h(200 + i),
      };
    });
    result = { id: `msettlement:${cell}:${side}`, cell, side, archetype, x, s, turns, mirror, level, hx, hs, flatten: 1, modules };
  }
  if (memo.size > 2048) memo.clear();
  memo.set(key, result);
  return result;
}

/* ---------------------------------------------------------------- scatter */

/**
 * Moon dressing from the Khepri kit: boulders and rocks strewn along crater rims and over young ejecta, a few
 * large rock clumps on the highlands, scattered small rocks elsewhere. Mare plains stay bare and quiet.
 */
export function* moonScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [], CAP = MOON_SCENERY_MAX;
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale > WORLD_HALF) return;
    if (instance.y + instance.height * spec.height > CAP) instance = { ...instance, height: (CAP - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7c3c, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s) || terrain.platform(s) > 0) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), pick = h(2);
    const craters = moonCraters(seed, x, s), mare = moonMare(seed, x, s), rough = (craters.rim * 0.7 + craters.ejecta * 0.5) * (1 - mare * 0.7);
    if (rough > 0.35 && slope < 1.6 && pick < 0.05 * rough) {
      const scale = 0.55 + h(3) * 0.5;
      add({ kind: 'boulder', x, s, y: ground - 0.08, scale, height: scale * (0.7 + h(4) * 0.4), rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (rough > 0.2 && pick < 0.05 + 0.1 * rough) {
      const scale = 0.35 + h(3) * 0.4;
      add({ kind: 'rock', x, s, y: ground - 0.04, scale, height: scale * (0.7 + h(4) * 0.4), rotation: turn(h(5)), cosmetic: h(7) > 0.4 }, h(6));
    } else if (mare < 0.3 && slope < 0.8 && pick < 0.0025) {
      const scale = 0.7 + h(3) * 0.4;
      add({ kind: 'clump', x, s, y: ground - 0.2, scale, height: 0.35 + h(4) * 0.35, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (pick < 0.012 * (1 - mare * 0.8)) {
      const scale = 0.3 + h(3) * 0.3;
      add({ kind: 'rock', x, s, y: ground - 0.04, scale, height: scale * 0.8, rotation: turn(h(5)), cosmetic: true }, h(6));
    }
  }
  return [...essential, ...cosmetic];
}

/* ---------------------------------------------------------------- profile */

export const MOON: PlanetProfile = {
  id: 'moon', seaLevel: null,
  mood: (seed, s) => moonMare(seed, 0, s) > 0.5 ? 'mare' : 'highland', params: () => NEUTRAL, local: () => null,
  landform: (seed, x, s) => moonLandform(seed, x, s),
  // Training has no arena; a flat pad level keeps the hook total.
  arena(row, _x, point) { point.height = mix(point.height, 0, row.platform); },
  color: moonColor,
  shadowTint: null,
  sceneryMax: MOON_SCENERY_MAX,
  settlement: moonSettlement,
  scatter: moonScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(MOON_ARCHETYPES),
  networks: false,
};
