import { VIEW } from '../shared/contracts';

/**
 * Pure Khepri landform field (docs/13 §2): miniaturized macro geography seen from high above —
 * massifs and ridgelines, dendritic canyon networks at any angle, tiered plateaus, basins and passes.
 * Every value is a function of `seed` plus global world coordinates, so any section or sample agrees
 * regardless of load order. No three.js, DOM, combat, loot, or Math.random.
 */
export const WORLD_HALF = VIEW.worldWidth / 2;
/** Scenery tops never exceed this, leaving 0.8 clearance under the flight plane at y = 3. */
export const SCENERY_MAX_HEIGHT = 2.2;
/** Heightfield rims stay below the scenery cap so rim columns can still crown them. */
export const TERRAIN_MAX_HEIGHT = 2;
/** Deepest valley floors (docs/13 §2: about −6, never below −8). */
export const TERRAIN_MIN_HEIGHT = -8;
const FLOOR_LEVEL = -6.3, RELIEF = TERRAIN_MAX_HEIGHT - FLOOR_LEVEL;
/** Authored routes (center patrol, west/east optional routes) get softly calmer terrain, never walls. */
export type Route = 0 | 1 | 2;
export const ROUTES: readonly Route[] = [0, 1, 2];
export const ROUTE_AXES = [-11.5, 0, 11.5] as const;

/** Low warm sun from the upper left and beyond the top of the view; shadows fall to the lower right. */
const SUN_ELEVATION = 28 * Math.PI / 180;
/** Unit vector toward the sun in world (x, y, s); three.js uses z = -s. */
export const SUN_DIRECTION = {
  x: -Math.cos(SUN_ELEVATION) / Math.SQRT2, y: Math.sin(SUN_ELEVATION), s: Math.cos(SUN_ELEVATION) / Math.SQRT2,
} as const;
/** Height a sun ray gains per unit of horizontal travel. */
export const SUN_RISE = Math.tan(SUN_ELEVATION);

export function hash(seed: number, x: number, y: number): number {
  let n = (seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x119de1f3)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export const clamp = (n: number, low = 0, high = 1) => Math.min(high, Math.max(low, n));
export const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const smoothRange = (low: number, high: number, n: number) => smooth((n - low) / (high - low));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function noise(seed: number, x: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(s), tx = smooth(x - ix), ty = smooth(s - iy);
  return mix(mix(hash(seed, ix, iy), hash(seed, ix + 1, iy), tx),
    mix(hash(seed, ix, iy + 1), hash(seed, ix + 1, iy + 1), tx), ty);
}
function fbm(seed: number, x: number, s: number): number {
  return noise(seed, x, s) * 0.62 + noise(seed ^ 0x51ed, x * 2.03 + 7.1, s * 2.03) * 0.27 + noise(seed ^ 0xa3c1, x * 4.1, s * 4.1) * 0.11;
}
/** Ridged noise: sharp crests where the base noise crosses its midpoint. */
const ridged = (value: number) => { const r = 1 - Math.abs(2 * value - 1); return r * r; };

/** sRGB hex to linear RGB, the space three.js expects for vertex colours. */
function linear(hex: number): readonly [number, number, number] {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
}
/** Concept palette (docs/13 §1), in linear RGB. */
export const PALETTE = {
  dust: linear(0xa65a2c), dustLit: linear(0xc47a44), dustDark: linear(0x8a4424), rimDust: linear(0xc08a52),
  valley: linear(0x5e3424), basalt: linear(0x4a3a2f), basaltDark: linear(0x2e241d),
  mineralBed: linear(0x1d6f69), industrial: linear(0x6e5442),
} as const;

/* ---------------------------------------------------------------- moods */

/** Seeded regions that alternate along the route (docs/13 §2; chapter 3 open/industrial/landmark families). */
export type Mood = 'canyons' | 'mesas' | 'basins' | 'flats';
export const MOODS: readonly Mood[] = ['canyons', 'mesas', 'basins', 'flats'];
export interface MoodParams {
  /** Elevation bias. */ lift: number;
  /** Relief scale around the mid level. */ relief: number;
  /** Canyon carving strength. */ carve: number;
  /** Terracing into plateaus and ledges. */ terrace: number;
  /** Mineral veins and pools. */ mineral: number;
  /** Tall alien features: stacks, hoodoos, crystal spires. */ stacks: number;
}
export const MOOD_PARAMS: Readonly<Record<Mood, MoodParams>> = {
  canyons: { lift: 0.06, relief: 1.15, carve: 1, terrace: 0.55, mineral: 0.8, stacks: 0.7 },
  mesas: { lift: 0.1, relief: 1, carve: 0.6, terrace: 1, mineral: 0.6, stacks: 0.5 },
  basins: { lift: -0.04, relief: 1, carve: 0.5, terrace: 0.5, mineral: 0.8, stacks: 1 },
  flats: { lift: -0.06, relief: 0.6, carve: 0.35, terrace: 0.35, mineral: 1.7, stacks: 0.6 },
};
export const MOOD_LENGTH = 96;
const MOOD_BLEND = 26;
function moodPermutation(seed: number, block: number): Mood[] {
  const order = [...MOODS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed ^ 0x6d00d, block, i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
/** Mood of a route segment: shuffled blocks of four, never the same mood twice in a row. */
export function moodOf(seed: number, segment: number): Mood {
  const block = Math.floor(segment / MOODS.length), raw = moodPermutation(seed, block);
  const previousLast = moodPermutation(seed, block - 1)[MOODS.length - 1];
  // Swapping the first two keeps each block's last entry stable, so the rule never cascades.
  if (raw[0] === previousLast) [raw[0], raw[1]] = [raw[1], raw[0]];
  return raw[segment - block * MOODS.length];
}
export function moodAt(seed: number, s: number): Mood { return moodOf(seed, Math.floor(s / MOOD_LENGTH)); }
export function moodParams(seed: number, s: number): MoodParams {
  const segment = Math.floor(s / MOOD_LENGTH), local = s - segment * MOOD_LENGTH;
  const t = smoothRange(MOOD_LENGTH - MOOD_BLEND, MOOD_LENGTH, local);
  const a = MOOD_PARAMS[moodOf(seed, segment)];
  if (t <= 0) return a;
  const b = MOOD_PARAMS[moodOf(seed, segment + 1)];
  return { lift: mix(a.lift, b.lift, t), relief: mix(a.relief, b.relief, t), carve: mix(a.carve, b.carve, t),
    terrace: mix(a.terrace, b.terrace, t), mineral: mix(a.mineral, b.mineral, t), stacks: mix(a.stacks, b.stacks, t) };
}

/* ---------------------------------------------------------------- routes and districts */

interface Phases { center: [number, number]; west: number; east: number }
let memoSeed = NaN;
let memoPhases: Phases = { center: [0, 0], west: 0, east: 0 };
function phases(seed: number): Phases {
  if (seed !== memoSeed) {
    const tau = Math.PI * 2;
    memoPhases = { center: [hash(seed, 19, 71) * tau, hash(seed, 23, 5) * tau], west: hash(seed, 31, 17) * tau, east: hash(seed, 37, 29) * tau };
    memoSeed = seed;
  }
  return memoPhases;
}
/** Gently wandering centerline of an authored route; terrain is calmer near it (never walls). */
export function routeCenter(seed: number, route: Route, s: number): number {
  const p = phases(seed);
  const center = Math.sin(s * 0.043 + p.center[0]) * 1.75 + Math.sin(s * 0.107 + p.center[1]) * 0.85;
  if (route === 1) return center;
  return ROUTE_AXES[route] + center * 0.45 + Math.sin(s * 0.071 + (route === 0 ? p.west : p.east)) * 0.95;
}
export function routeCalm(seed: number, x: number, s: number): number {
  let calm = 0;
  for (const route of ROUTES) {
    const d = (x - routeCenter(seed, route, s)) / (route === 1 ? 3.6 : 2.6);
    calm = Math.max(calm, Math.exp(-d * d) * (route === 1 ? 0.6 : 0.4));
  }
  return calm;
}

export interface District { id: string; cell: number; x: number; s: number; side: number; variation: number }
export const DISTRICT_SPACING = 72;
/** One composed outpost per 72 forward units, on ground flattened to the local landform level. */
export function district(seed: number, cell: number): District {
  const variation = hash(seed ^ 0x20d15, cell, 7);
  const side = hash(seed ^ 0x73a1, cell, 9) < 0.5 ? -1 : 1;
  return { id: `district:${cell}`, cell, x: side * 12.6, s: cell * DISTRICT_SPACING + 20 + hash(seed ^ 0x3e19, cell, 2) * 10, side, variation };
}
const PAD_HALF_X = 5.8, PAD_HALF_S = 11.6, PAD_CORNER = 2.2;
function districtDistance(site: District, x: number, s: number): number {
  const qx = Math.abs(x - (site.x - site.side * 0.4)) - (PAD_HALF_X - PAD_CORNER);
  const qs = Math.abs(s - site.s) - (PAD_HALF_S - PAD_CORNER);
  return Math.hypot(Math.max(qx, 0), Math.max(qs, 0)) + Math.min(Math.max(qx, qs), 0) - PAD_CORNER;
}
/** The pad level: the landform height at the outpost center, snapped to a half-unit terrace. */
function districtLevel(seed: number, site: District): number {
  const raw = landform(seed, site.x, site.s, moodParams(seed, site.s)).height;
  // Capped so 1.6-tall refineries and relays (and ~1.5 tanks) stay under the 2.2 scenery cap.
  return clamp(Math.round(raw / 0.5) * 0.5, FLOOR_LEVEL + 0.3, 0.5);
}

/* ---------------------------------------------------------------- landform */

export interface Landform {
  height: number;
  /** 0..1 elevation before mapping to height; 0 = deepest floors, 1 = highest rims. */
  elevation: number;
  /** Canyon-bottom mask (trunk and tributary channels). */ channel: number;
  /** Terraced mineral-pool mask in valley bottoms. */ pool: number;
  /** Signed distances (world units, approximate) to the two crossing vein-line families, and vein presence. */
  vein: number; vein2: number; veins: number;
}

/** Macro geography: domain-warped massifs and ridges, carved by dendritic canyon networks, terraced. */
export function landform(seed: number, x: number, s: number, mood: MoodParams, calm = routeCalm(seed, x, s)): Landform {
  const qx = x + (noise(seed ^ 0x77a, x * 0.03, s * 0.026) - 0.5) * 16;
  const qs = s + (noise(seed ^ 0x77b, x * 0.03 + 5.2, s * 0.026) - 0.5) * 16;
  const massif = smoothRange(0.28, 0.74, fbm(seed ^ 0x593ff, qx * 0.03, qs * 0.026));
  const ridge = ridged(noise(seed ^ 0x2b1d, qx * 0.06, qs * 0.052)), crest = ridged(noise(seed ^ 0x2b1e, qx * 0.14, qs * 0.12));
  let e = 0.5 + (massif - 0.5) * 0.85 + ridge * 0.24 * (0.5 + massif) + crest * 0.07 * massif + mood.lift;
  // Dendritic canyons: contour lines of warped noise at two scales (trunks and tributaries) at any angle.
  // Channel walls span several grid cells so deep cuts never alias into stair steps.
  const trunk = 1 - smoothRange(0.006, 0.05, Math.abs(noise(seed ^ 0x3c57, qx * 0.034, qs * 0.03) - 0.5));
  const tributary = (1 - smoothRange(0.003, 0.026, Math.abs(noise(seed ^ 0x3c58, qx * 0.085, qs * 0.075) - 0.5))) * smoothRange(0.4, 0.7, e);
  const channel = Math.max(trunk, tributary * 0.8) * mood.carve;
  e = 0.58 + (e - 0.58) * mood.relief;
  e *= 1 - 0.95 * channel;
  // Calm routes soften relief toward a gentle mid level instead of walling it off.
  e = mix(e, 0.56 + (e - 0.56) * 0.45, calm * 0.65);
  // Terraces: tiered plateaus with short steep risers (ledges partway down the slopes).
  const tiers = 4, level = clamp(e) * tiers, step = Math.floor(level), fraction = level - step;
  // Risers span ≥ 2 grid cells so diagonal cliffs don't alias into sawtooth stair steps.
  const stepped = Math.min(tiers, step + smoothRange(0.55, 1, fraction)) / tiers;
  e = clamp(mix(e, stepped, mood.terrace * (1 - calm * 0.5)));
  // Mid-frequency erosion relief keeps broad tops and floors from reading as smeared flats.
  let height = FLOOR_LEVEL + e * RELIEF + (noise(seed ^ 0x4e57, x * 0.75, s * 0.7) - 0.5) * 0.12 + (noise(seed ^ 0x4e58, x * 1.7, s * 1.6) - 0.5) * 0.04;
  // Terraced mineral pools in the lowest valley bottoms: shallow stepped basins.
  // Small, scattered pools: large cyan areas would compete with the player's cyan shots.
  const blob = smoothRange(0.74, 0.86, noise(seed ^ 0x3c59, x * 0.7, s * 0.7));
  const pool = blob * smoothRange(0.22, 0.06, e) * smoothRange(0.4, 1.2, mood.mineral + 0.5);
  // Terraced pool steps stay continuous (short smooth risers) so seating and normals never jump.
  if (pool > 0) { const level = pool * 3, step = Math.floor(level); height -= (step + smoothRange(0.8, 1, level - step)) * 0.12; }
  // Vein networks: two warped families of contour lines cross and branch; broken into segments.
  // A small high-frequency warp turns smooth contours into jagged cracks.
  const wx = x + (noise(seed ^ 0x6e1f, x * 0.2, s * 0.2) - 0.5) * 3 + (noise(seed ^ 0x6e23, x * 1.1, s * 1.1) - 0.5) * 0.7;
  const ws = s + (noise(seed ^ 0x6e20, x * 0.2, s * 0.2) - 0.5) * 3 + (noise(seed ^ 0x6e24, x * 1.1, s * 1.1) - 0.5) * 0.7;
  const a = (noise(seed ^ 0x6e1d, wx * 0.21, ws * 0.17) - 0.5) / 0.14, b = (noise(seed ^ 0x6e21, wx * 0.17 + 3.1, ws * 0.23) - 0.5) / 0.15;
  const broken = smoothRange(0.42, 0.58, noise(seed ^ 0x6e22, x * 0.28, s * 0.28));
  const veins = broken * smoothRange(0.55, 0.75, noise(seed ^ 0x6e1e, x * 0.07, s * 0.06) * 0.6 + mood.mineral * 0.25) * smoothRange(0.7, 0.35, e);
  return { height: clamp(height, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT), elevation: e, channel, pool, vein: a, vein2: b, veins };
}

/* ---------------------------------------------------------------- rows and points */

/** Everything constant along one forward row. */
export interface TerrainRow { seed: number; s: number; mood: Mood; params: MoodParams; sites: { site: District; level: number }[] }
export function terrainRow(seed: number, s: number): TerrainRow {
  const sites: TerrainRow['sites'] = [];
  for (let cell = Math.floor(s / DISTRICT_SPACING) - 1; cell <= Math.floor(s / DISTRICT_SPACING) + 1; cell++) {
    const site = district(seed, cell);
    if (Math.abs(s - site.s) < PAD_HALF_S + 4) sites.push({ site, level: districtLevel(seed, site) });
  }
  return { seed, s, mood: moodAt(seed, s), params: moodParams(seed, s), sites };
}

export interface TerrainPoint extends Landform { industrial: number }
export function rowPoint(row: TerrainRow, x: number): TerrainPoint {
  const form = landform(row.seed, x, row.s, row.params);
  let industrial = 0, height = form.height;
  for (const { site, level } of row.sites) {
    const influence = 1 - smoothRange(-1.2, 2.2, districtDistance(site, x, row.s));
    if (influence > industrial) { industrial = influence; height = mix(form.height, level, influence); }
  }
  return { ...form, height, industrial, pool: form.pool * (1 - industrial), veins: form.veins * (1 - industrial) };
}
export function heightAt(seed: number, x: number, s: number): number {
  return rowPoint(terrainRow(seed, s), x).height;
}

/* ---------------------------------------------------------------- colour */

/**
 * Slope-driven albedo (linear RGB): steep faces dark columnar basalt, flat ground ochre dust, rims and
 * ledges lighter dust, valley bottoms darker with minerals. `slope` is |∇h| from central differences.
 */
export function pointColor(row: TerrainRow, x: number, point: TerrainPoint, slope: number, rim: number): [number, number, number] {
  const { seed, s } = row;
  const drift = noise(seed ^ 0x51ab, x * 0.05, s * 0.032), broad = noise(seed ^ 0x5a1b, x * 0.11, s * 0.08);
  const fine = noise(seed ^ 0x1234, x * 0.9, s * 0.9);
  const P = PALETTE;
  const lit = smoothRange(0.4, 0.78, drift) * 0.7, dark = smoothRange(0.55, 0.85, broad) * 0.5 * (1 - lit);
  // Only real depths grade toward darker umber; Khepri stays rust-ochre (the shader adds a light haze on top).
  const steep = smoothRange(0.7, 1.6, slope), low = smoothRange(-2.5, -6, point.height);
  const pick = (channel: number) => {
    let ground = mix(P.dust[channel], P.dustLit[channel], lit);
    ground = mix(ground, P.dustDark[channel], Math.max(dark, point.channel * 0.6));
    ground = mix(ground, P.valley[channel], low * 0.6);
    ground = mix(ground, P.rimDust[channel], rim * (1 - steep) * 0.7);
    let value = mix(ground, mix(P.basalt[channel], P.basaltDark[channel], fine), steep * 0.92);
    value = mix(value, P.industrial[channel], point.industrial * 0.35);
    return mix(value, P.mineralBed[channel], point.pool * 0.25);
  };
  const grain = 0.96 + fine * 0.08;
  return [pick(0) * grain, pick(1) * grain, pick(2) * grain];
}
