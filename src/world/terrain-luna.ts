import { NEUTRAL_MOOD, WORLD_HALF, clamp, cliff, hash, mix, noise, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import { MODULE_HEIGHT, SETTLEMENT_CELL, districtLevel, type Archetype, type PlacedModule, type Settlement } from './terrain-settlements';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';

/**
 * Luna, Khepri's moon and the training ground (docs/19): grey regolith pocked with impact craters at three scales, smooth
 * dark mare plains with fewer of them, and a handful of small outposts. No water, no roads, no pipelines.
 * Every piece reuses the Khepri kit and infrastructure models. Pure functions of seed and world coordinates.
 */
const NEUTRAL: MoodParams = NEUTRAL_MOOD;
/** Luna's scenery cap: the same 0.8 clearance under the flight plane (3.8) as the other worlds (2.2 before version 13). */
export const LUNA_SCENERY_MAX = 3.0;

/* ---------------------------------------------------------------- moods */

/**
 * Regions along the route (docs/26 §4): cratered highlands, dark maria with rilles and wrinkle ridges, a basin rim of
 * mountains (montes) around a mare, and a saturated crater field. Never the same twice in a row.
 */
export type LunaMood = 'highland' | 'mare' | 'basin' | 'craters';
export const LUNA_MOODS: readonly LunaMood[] = ['highland', 'mare', 'basin', 'craters'];
export interface LunaParams {
  /** Bias toward mare plains (0 highland, 1 mostly mare). */ mare: number;
  /** Mountain massifs (montes). */ montes: number;
  /** Crater density. */ craters: number;
  /** Sinuous rilles in the maria. */ rilles: number;
  /** Lobate scarps across the highlands. */ scarps: number;
}
const LUNA_SETTINGS: Readonly<Record<LunaMood, LunaParams>> = {
  highland: { mare: 0.1, montes: 0.55, craters: 1.1, rilles: 0.2, scarps: 1 },
  mare: { mare: 1, montes: 0.1, craters: 0.65, rilles: 1, scarps: 0.3 },
  basin: { mare: 0.55, montes: 1, craters: 0.85, rilles: 0.5, scarps: 0.6 },
  craters: { mare: 0.25, montes: 0.3, craters: 1.35, rilles: 0.2, scarps: 0.5 },
};
const LUNA_LENGTH = 96, LUNA_BLEND = 26;
function lunaPermutation(seed: number, block: number): LunaMood[] {
  const order = [...LUNA_MOODS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed ^ 0xa1f0, block, i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
/** Luna's mood of a route segment: shuffled blocks, never the same mood twice in a row. */
export function lunaMoodOf(seed: number, segment: number): LunaMood {
  const block = Math.floor(segment / LUNA_MOODS.length), raw = lunaPermutation(seed, block);
  if (raw[0] === lunaPermutation(seed, block - 1)[LUNA_MOODS.length - 1]) [raw[0], raw[1]] = [raw[1], raw[0]];
  return raw[segment - block * LUNA_MOODS.length];
}
const LUNA_KEYS = Object.keys(LUNA_SETTINGS.highland) as (keyof LunaParams)[];
let paramsMemo: { seed: number; s: number; value: LunaParams } | null = null;
export function lunaParams(seed: number, s: number): LunaParams {
  if (paramsMemo && paramsMemo.seed === seed && paramsMemo.s === s) return paramsMemo.value;
  const segment = Math.floor(s / LUNA_LENGTH), t = smoothRange(LUNA_LENGTH - LUNA_BLEND, LUNA_LENGTH, s - segment * LUNA_LENGTH);
  const a = LUNA_SETTINGS[lunaMoodOf(seed, segment)];
  let value = a;
  if (t > 0) {
    const b = LUNA_SETTINGS[lunaMoodOf(seed, segment + 1)], out = { ...a };
    for (const key of LUNA_KEYS) out[key] = mix(a[key], b[key], t);
    value = out;
  }
  paramsMemo = { seed, s, value };
  return value;
}

/* ---------------------------------------------------------------- craters */

interface CraterScale { cell: number; chance: number; radius: readonly [number, number]; depth: number; rim: number; floor: number; salt: number }
/**
 * Crater families, largest first. Depth and rim are fractions of the radius; `floor` flattens the bowl (big
 * craters have broad flat floors and steep walls, small ones are simple bowls). A crater's reach (its ejecta
 * apron, 1.8 radii) stays inside its cell's 3 × 3 neighbourhood. Each crater is fresh (deep, sharp rim), mature or
 * old and degraded (shallow, soft rim), so their depths vary widely.
 */
const CRATERS: readonly CraterScale[] = [
  { cell: 44, chance: 0.72, radius: [7.5, 15], depth: 0.17, rim: 0.05, floor: 4, salt: 0xc4a1 },
  { cell: 12, chance: 0.8, radius: [2.2, 4.8], depth: 0.3, rim: 0.08, floor: 2.6, salt: 0xc4a2 },
  { cell: 4.2, chance: 0.75, radius: [0.75, 1.6], depth: 0.3, rim: 0.08, floor: 2, salt: 0xc4a3 },
  { cell: 2, chance: 0.6, radius: [0.38, 0.7], depth: 0.28, rim: 0.07, floor: 2, salt: 0xc4a4 },
];
const REACH = 1.8;
/** Fresh, mature and degraded craters: depth and rim factors. */
const AGES = [[1.6, 1.5], [1, 1], [0.45, 0.5]] as const;

/** Mare (dark basalt plains): 0 on the highlands, 1 deep in a mare; the region's mood shifts how much is mare. */
export function lunaMare(seed: number, x: number, s: number): number {
  const wx = x + (noise(seed ^ 0xa1e2, x * 0.03, s * 0.03) - 0.5) * 18, bias = (lunaParams(seed, s).mare - 0.78) * 0.22;
  return smoothRange(0.57, 0.63, noise(seed ^ 0xa1e1, wx * 0.02, s * 0.016) + bias);
}

export interface CraterField {
  /** Height added by every crater at the point. */ height: number;
  /** Inside a bowl (0..1, deepest at the centre). */ bowl: number;
  /** Bright fresh ejecta (0..1) around young craters. */ ejecta: number;
  /** Closeness to a rim crest (0..1), for boulders. */ rim: number;
}
interface Crater { cx: number; cs: number; r: number; depth: number; rim: number; floor: number; young: number; apron: number }
const craterMemo = new Map<number, Crater | null>();
let craterSeed = NaN;
/** One cell's crater (pure in seed, family and cell; memoized): mare plains, being younger, keep fewer of them. */
function craterAt(seed: number, family: number, i: number, j: number): Crater | null {
  if (seed !== craterSeed) { craterMemo.clear(); craterSeed = seed; }
  const key = ((j * 64 + i + 32) * 4) + family, known = craterMemo.get(key);
  if (known !== undefined) return known;
  const scale = CRATERS[family], h = (k: number) => hash(seed ^ scale.salt, i * 7 + k, j);
  const cx = (i + 0.2 + h(0) * 0.6) * scale.cell, cs = (j + 0.2 + h(1) * 0.6) * scale.cell, roll = h(2);
  const density = lunaParams(seed, cs).craters, chance = Math.min(0.95, scale.chance * density);
  let crater: Crater | null = null;
  if (roll <= chance && roll <= chance * (1 - 0.3 * lunaMare(seed, cx, cs))) {
    const r = mix(scale.radius[0], scale.radius[1], h(3)), age = AGES[h(6) < 0.28 ? 0 : h(6) < 0.72 ? 1 : 2];
    crater = { cx, cs, r, depth: scale.depth * r * age[0], rim: scale.rim * r * age[1], floor: scale.floor, young: h(4) < 0.17 ? 1 : 0, apron: 2.1 * (0.85 + h(5) * 0.3) };
  }
  if (craterMemo.size > 8192) craterMemo.clear();
  craterMemo.set(key, crater);
  return crater;
}
/** All craters touching a point, summed: bowl, raised rim and an ejecta apron that fades by 1.8 radii. */
export function lunaCraters(seed: number, x: number, s: number): CraterField {
  const out: CraterField = { height: 0, bowl: 0, ejecta: 0, rim: 0 };
  for (let family = 0; family < CRATERS.length; family++) {
    const scale = CRATERS[family], ci = Math.floor(x / scale.cell), cj = Math.floor(s / scale.cell);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const c = craterAt(seed, family, ci + di, cj + dj);
      if (!c) continue;
      const d = Math.hypot(x - c.cx, s - c.cs) / c.r;
      if (d >= REACH) continue;
      if (d < 1) {
        // Flat-floored bowl rising steeply to the rim crest; big craters slump into terraced walls and a central peak.
        let wall = Math.pow(d, c.floor);
        if (c.r > 7) wall = mix(wall, Math.floor(wall * 3) / 3 + cliff((wall * 3 - Math.floor(wall * 3) - 0.6) / 0.4) / 3, 0.4);
        out.height += -c.depth + (c.depth + c.rim) * wall;
        if (c.r > 7) out.height += c.depth * 0.38 * (1 - smoothRange(0, 0.16, d)) * (0.6 + 0.4 * ridgedNoise(seed, x, s));
        out.bowl = Math.max(out.bowl, 1 - Math.pow(d, c.floor));
      } else {
        const t = 1 - smoothRange(1, REACH, d);
        out.height += c.rim * t * t;
      }
      out.rim = Math.max(out.rim, 1 - smoothRange(0, 0.25, Math.abs(d - 1)));
      // About one crater in six is young, with a bright apron.
      if (c.young) out.ejecta = Math.max(out.ejecta, (1 - smoothRange(0.9, c.apron, d)) * (d > 0.85 ? 1 : 0.55));
    }
  }
  return out;
}
const ridgedNoise = (seed: number, x: number, s: number) => { const r = 1 - Math.abs(2 * noise(seed ^ 0xa1f5, x * 0.9, s * 0.9) - 1); return r * r; };

/* ---------------------------------------------------------------- landform */

/**
 * Luna ground (docs/26 §4): rugged highlands with mountain massifs and lobate scarps; dark mare plains a scarp below
 * them, with wrinkle ridges and sinuous rilles; all cratered at four scales, fresh and deep or old and worn.
 * `channel` carries the bowl and `tone` the ejecta.
 */
export function lunaLandform(seed: number, x: number, s: number): Landform & { tone: number } {
  const p = lunaParams(seed, s), mare = lunaMare(seed, x, s), craters = lunaCraters(seed, x, s);
  const rolling = (noise(seed ^ 0xa1e3, x * 0.04, s * 0.035) - 0.5) * 1.5 + (noise(seed ^ 0xa1e4, x * 0.13, s * 0.12) - 0.5) * 0.45
    + (noise(seed ^ 0xa1e5, x * 0.9, s * 0.9) - 0.5) * 0.05;
  const qx = x + (noise(seed ^ 0xa1e6, x * 0.05, s * 0.05) - 0.5) * 8, qs = s + (noise(seed ^ 0xa1e8, x * 0.05 + 3.3, s * 0.05) - 0.5) * 8;
  // Montes: ridged massifs on the highlands, strongest in a basin's rim.
  const montes = p.montes * Math.pow(1 - Math.abs(2 * noise(seed ^ 0xa1e9, qx * 0.06, qs * 0.055) - 1), 1.6) * (1 - mare);
  // Lobate scarps: curving one-sided steps across the highlands, broken into finite lengths.
  const scarp = p.scarps * cliff((noise(seed ^ 0xa1ea, qx * 0.045, qs * 0.04) - 0.5 + 0.016) / 0.032) * smoothRange(0.35, 0.6, noise(seed ^ 0xa1eb, x * 0.03, s * 0.03));
  const highland = 0.55 + rolling * 1.15 + montes * 2.1 + scarp * 0.8;
  // Maria: low dark plains with wrinkle ridges and sinuous flat-floored rilles.
  const wrinkle = Math.pow(1 - Math.abs(2 * noise(seed ^ 0xa1ec, qx * 0.07, qs * 0.06) - 1), 3) * 0.7;
  const rille = (1 - cliff((Math.abs(noise(seed ^ 0xa1ed, qx * 0.04, qs * 0.03) - 0.5) - 0.01) / 0.02)) * p.rilles;
  const plain = -1.6 + rolling * 0.5 + wrinkle - rille * 1.5;
  const base = mix(highland, plain, mare);
  return {
    height: clamp(base + craters.height, -5.5, 2.4), elevation: 1 - mare, channel: Math.max(craters.bowl, rille * mare * 0.6), pool: 0, vein: 99, vein2: 99, veins: 0,
    tone: craters.ejecta,
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Regolith palette, linear RGB: warm-grey highlands, darker blue-grey mare, bright fresh ejecta. */
export const LUNA_PALETTE = {
  highland: linear(0xb4b1ab), highlandLit: linear(0xc6c3bd), mare: linear(0x7a797a), bowl: linear(0x96938e),
  wall: linear(0x8a8782), ejecta: linear(0xe4e2dd), pad: linear(0xa09e9a),
} as const;

function lunaColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = LUNA_PALETTE, { seed, s } = row;
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
 * Sparse outposts from the Khepri infrastructure kit: a landing pad with a habitat, a comm dish with a solar
 * array, or an abandoned habitat. Most cells stay empty: the user asked for a much less populated Moon (20 October),
 * so outposts are rarer (0.24 to 0.10) and each carries only a few pieces.
 */
const LUNA_ARCHETYPES: readonly Archetype[] = ['landing', 'comm', 'abandoned'];
const EXTENT: Readonly<Record<string, [number, number]>> = { landing: [3.9, 3.9], comm: [2.9, 2.9], abandoned: [2.4, 2.4] };
const OUTPOST_CHANCE = 0.1;

interface LocalModule { kind: PlacedModule['kind']; node: string; u: number; v: number; yaw: number; scale?: number }
function compose(archetype: Archetype, h: (k: number) => number): LocalModule[] {
  const m: LocalModule[] = [];
  const infra = (node: string, u: number, v: number, yaw = 0) => m.push({ kind: 'infra', node, u, v, yaw });
  const shared = (node: string, u: number, v: number, yaw = 0) => m.push({ kind: 'shared', node, u, v, yaw });
  switch (archetype) {
    case 'landing':
      // A pad with a habitat and a light; sometimes a relay.
      infra('infra_landing_pad', -1.0, 0);
      infra('infra_habitat_0', 2.7, -2.4, Math.PI / 2);
      if (h(1) < 0.5) infra('infra_relay', 3.0, -0.6);
      infra('infra_light_mast', -3.4, 3.2);
      break;
    case 'comm':
      infra('infra_comm_dish', -0.9, 0.9);
      infra('infra_solar_array', 0, -1.6);
      if (h(1) < 0.4) infra('infra_relay', -2.3, -0.4);
      break;
    default:
      infra('infra_habitat_0', -0.6, 0.4, h(2) * 0.6);
      shared(`container_${h(3) < 0.5 ? 0 : 1}`, 1.4, -1.2, h(4) * Math.PI);
  }
  return m;
}

const memo = new Map<string, Settlement | null>();
/** The Luna outpost of one cell and side, or null (about one candidate in four), on the flattest nearby ground. */
export function lunaSettlement(seed: number, cell: number, side: number): Settlement | null {
  const key = `${seed}:${cell}:${side}`;
  if (memo.has(key)) return memo.get(key)!;
  const h = (k: number) => hash(seed ^ 0xa1e7 ^ (side > 0 ? 0x1000 : 0), cell * 211 + k, 6);
  let result: Settlement | null = null;
  // Bases gather in districts (districtLevel) instead of standing alone; Luna stays sparse overall.
  if (h(0) < OUTPOST_CHANCE * (0.25 + 1.6 * districtLevel(seed ^ 0xa1e7, cell))) {
    let x = 0, s = 0, best = Infinity;
    for (let k = 0; k < 6; k++) {
      const cx = side * Math.min(WORLD_HALF * (0.4 + h(1 + k) * 0.45), WORLD_HALF - 4), cs = cell * SETTLEMENT_CELL + 8 + h(10 + k) * 14;
      const heights = [[0, 0], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]].map(([dx, ds]) => lunaLandform(seed, cx + dx, cs + ds).height);
      const relief = Math.max(...heights) - Math.min(...heights) + 0.5 * Math.max(0, heights[0] - 1.2);
      if (relief < best) { best = relief; x = cx; s = cs; }
    }
    const archetype = LUNA_ARCHETYPES[Math.floor(h(20) * LUNA_ARCHETYPES.length)];
    const turns = Math.floor(h(21) * 4), mirror = h(22) < 0.5 ? -1 : 1, [hu, hv] = EXTENT[archetype];
    const [hx, hs] = turns % 2 ? [hv, hu] : [hu, hv];
    const local = compose(archetype, k => h(30 + k));
    const tallest = Math.max(...local.map(module => MODULE_HEIGHT[module.node] ?? 1));
    const level = clamp(Math.round(lunaLandform(seed, x, s).height / 0.25) * 0.25, -5, LUNA_SCENERY_MAX - tallest - 0.05);
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
 * Luna dressing from the Khepri kit: boulders and rocks strewn along crater rims and over young ejecta, a few
 * large rock clumps on the highlands, scattered small rocks elsewhere. Mare plains stay bare and quiet.
 */
export function* lunaScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [], CAP = LUNA_SCENERY_MAX;
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
    const craters = lunaCraters(seed, x, s), mare = lunaMare(seed, x, s), rough = (craters.rim * 0.7 + craters.ejecta * 0.5) * (1 - mare * 0.7);
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

export const LUNA: PlanetProfile = {
  id: 'luna', seaLevel: null,
  mood: (seed, s) => lunaMoodOf(seed, Math.floor(s / LUNA_LENGTH)), params: () => NEUTRAL, local: () => null,
  landform: (seed, x, s) => lunaLandform(seed, x, s),
  // Training has no arena; a flat pad level keeps the hook total.
  arena(row, _x, point) { point.height = mix(point.height, 0, row.platform); },
  color: lunaColor,
  shadowTint: null,
  sceneryMax: LUNA_SCENERY_MAX,
  settlement: lunaSettlement,
  scatter: lunaScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(LUNA_ARCHETYPES),
  networks: false, cliffs: true,
};
