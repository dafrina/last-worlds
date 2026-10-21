import { VIEW } from '../shared/contracts';
import { KHEPRI_DISTRICTS } from './settlement-grammars';

/**
 * Pure Khepri landform field (docs/13 §2): miniaturized macro geography seen from high above —
 * massifs and ridgelines, dendritic canyon networks at any angle, tiered plateaus, basins and passes.
 * Every value is a function of `seed` plus global world coordinates, so any section or sample agrees
 * regardless of load order. No three.js, DOM, combat, loot, or Math.random.
 */
export const WORLD_HALF = VIEW.worldWidth / 2;
/**
 * Khepri's scenery cap: tops of kit pieces, outpost modules and pipe racks stay 0.8 under the flight plane
 * (VIEW.flightHeight 3.8), the same clearance Vesper and Nacre keep (terrain version 13, docs/26; 2.2 before).
 */
export const SCENERY_MAX_HEIGHT = 3.0;
/** Highest mesa and butte tops (2.0 before version 13); the scenery cap still crowns them. */
export const TERRAIN_MAX_HEIGHT = 2.4;
/** Deepest canyon floors (docs/26: canyon country reaches about −9; −8 before version 13). */
export const TERRAIN_MIN_HEIGHT = -10;
/** The old landform band: elevation 0 at FLOOR_LEVEL, 1 at the old rim height 2.0 (the mineral masks keep their meaning). */
const FLOOR_LEVEL = -6.3, RELIEF = 2 - FLOOR_LEVEL;
/** Authored routes (center patrol, west/east optional routes) get softly calmer terrain, never walls. */
export type Route = 0 | 1 | 2;
export const ROUTES: readonly Route[] = [0, 1, 2];
/**
 * Side routes sit about two thirds of the way out, where the camera can nearly centre them: ±7.5 in the 24-wide world
 * (21 October; ±9.5 in the 30-wide world before).
 */
export const ROUTE_AXES = [-7.5, 0, 7.5] as const;

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

/**
 * Seeded regions that alternate along the route (docs/13 §2, docs/26 §2): canyon country, mesa country, open basins
 * with buttes, mineral flats, a dune sea and stepped escarpments. Never the same mood twice in a row.
 */
export type Mood = 'canyons' | 'mesas' | 'basins' | 'flats' | 'dunes' | 'escarpment';
export const MOODS: readonly Mood[] = ['canyons', 'mesas', 'basins', 'flats', 'dunes', 'escarpment'];
export interface MoodParams {
  /** Elevation bias. */ lift: number;
  /** Relief scale around the mid level. */ relief: number;
  /** Canyon carving strength. */ carve: number;
  /** Terracing into plateaus and ledges. */ terrace: number;
  /** Mineral veins and pools. */ mineral: number;
  /** Tall alien features: stacks, hoodoos, crystal spires. */ stacks: number;
  /** Canyon floor depth, 0 (about −6) to 1 (about −9), and how wide the floors open. */ depth: number;
  /** Height of one terrace riser (world units): ledges and benches follow it. */ step: number;
  /** Mesas and buttes standing on the ground (density, 0–1). */ mesas: number;
  /** Share of small, tall buttes among them (0–1). */ buttes: number;
  /** Dune amplitude (world units). */ dunes: number;
  /** Regional escarpment staircase (0–1). */ tilt: number;
}
export const MOOD_PARAMS: Readonly<Record<Mood, MoodParams>> = {
  canyons: { lift: 0.1, relief: 1, carve: 1, terrace: 0.75, mineral: 0.8, stacks: 0.7, depth: 1, step: 1.3, mesas: 0.2, buttes: 0.6, dunes: 0, tilt: 0.1 },
  mesas: { lift: -0.06, relief: 0.95, carve: 0.45, terrace: 0.95, mineral: 0.6, stacks: 0.5, depth: 0.45, step: 1.6, mesas: 1, buttes: 0.3, dunes: 0.12, tilt: 0 },
  basins: { lift: -0.16, relief: 0.95, carve: 0.4, terrace: 0.5, mineral: 0.9, stacks: 1, depth: 0.3, step: 1.1, mesas: 0.6, buttes: 0.85, dunes: 0.25, tilt: 0 },
  flats: { lift: -0.08, relief: 0.55, carve: 0.3, terrace: 0.35, mineral: 1.7, stacks: 0.6, depth: 0.15, step: 0.9, mesas: 0.2, buttes: 0.5, dunes: 0.18, tilt: 0 },
  dunes: { lift: -0.02, relief: 0.45, carve: 0.2, terrace: 0.2, mineral: 0.4, stacks: 0.35, depth: 0.2, step: 1, mesas: 0.15, buttes: 0.7, dunes: 0.85, tilt: 0 },
  escarpment: { lift: 0.04, relief: 0.9, carve: 0.5, terrace: 1, mineral: 0.6, stacks: 0.6, depth: 0.6, step: 1.45, mesas: 0.3, buttes: 0.4, dunes: 0, tilt: 1 },
};
const PARAM_KEYS = Object.keys(MOOD_PARAMS.canyons) as (keyof MoodParams)[];
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
/** Mood of a route segment: shuffled blocks of every mood, never the same mood twice in a row. */
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
  const b = MOOD_PARAMS[moodOf(seed, segment + 1)], out = { ...a };
  for (const key of PARAM_KEYS) out[key] = mix(a[key], b[key], t);
  return out;
}
/** Neutral parameters for planets that do not use Khepri's moods (rows still carry a set for shared code). */
export const NEUTRAL_MOOD: MoodParams = { lift: 0, relief: 1, carve: 0, terrace: 0, mineral: 0, stacks: 0, depth: 0, step: 1, mesas: 0, buttes: 0, dunes: 0, tilt: 0 };

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

/**
 * The smooth regional level a point's benches are cut from (world height): domain-warped massifs, ridgelines and a
 * mid-scale swell, an escarpment ramp in staircase country, and calm routes pulled toward their region's own level.
 */
function levelField(seed: number, x: number, s: number, mood: MoodParams, calm: number): { level: number; massif: number; qx: number; qs: number } {
  const qx = x + (noise(seed ^ 0x77a, x * 0.03, s * 0.026) - 0.5) * 16;
  const qs = s + (noise(seed ^ 0x77b, x * 0.03 + 5.2, s * 0.026) - 0.5) * 16;
  const massif = smoothRange(0.28, 0.74, fbm(seed ^ 0x593ff, qx * 0.03, qs * 0.026));
  const ridge = ridged(noise(seed ^ 0x2b1d, qx * 0.06, qs * 0.052)), crest = ridged(noise(seed ^ 0x2b1e, qx * 0.14, qs * 0.12));
  let e = 0.5 + (massif - 0.5) * 0.85 + ridge * 0.24 * (0.5 + massif) + crest * 0.07 * massif + mood.lift;
  // A mid-scale swell (about 12 units across) puts several bench levels into one view.
  e += (noise(seed ^ 0x2b1f, qx * 0.085, qs * 0.075) - 0.5) * 0.3;
  // Escarpments: a long regional ramp that turns slowly (never along the flight line); the benches step it.
  if (mood.tilt > 0) {
    const angle = Math.PI / 2 + (noise(seed ^ 0x7a11, s * 0.006, 1.5) - 0.5) * 2.2, along = x * Math.cos(angle) + s * Math.sin(angle);
    e += mood.tilt * 0.3 * Math.sin(along * 0.085 + (noise(seed ^ 0x7a12, x * 0.04, s * 0.04) - 0.5) * 2.4);
  }
  e = 0.58 + (e - 0.58) * mood.relief;
  let level = FLOOR_LEVEL + e * RELIEF;
  // Calm routes soften relief toward their region's own level (not one global level) instead of walling it off.
  const regional = FLOOR_LEVEL + (0.56 + (massif - 0.5) * 0.45 + mood.lift) * RELIEF;
  level = mix(level, regional + (level - regional) * 0.45, calm * 0.65);
  // Strata: thick and thin beds alternate (a monotonic warp of the level), so the benches are not all one height.
  level += STRATA * Math.sin(level * Math.PI * 2 / STRATA_PERIOD);
  return { level, massif, qx, qs };
}

/**
 * Cuts a smooth level field into flat benches whose risers are `riser` world units wide whatever the slope (`slope` is
 * |∇level|), each a crisp cliff (`cliff`: hard rim, talus foot). Where contours crowd closer than about 1.2 risers the field keeps its smooth slope, so a riser never
 * shrinks under two grid cells (no stair aliasing). `phase` offsets the bench heights; `strength` blends (0 = smooth).
 * `edges` (default: the level) is the field whose contours place the cliffs, so fine relief can make cliff lines wander
 * into spurs and bays without roughening the slopes in between; `slope` is then its gradient.
 */
export function bench(level: number, slope: number, step: number, phase: number, riser: number, strength: number, edges = level): number {
  const spacing = step / Math.max(1e-4, slope), q = (edges - phase) / step, tier = Math.floor(q), up = (1 - (q - tier)) * spacing;
  const benched = phase + (tier + cliff(1 - up / riser)) * step;
  return mix(level, benched, strength * smoothRange(1.2, 2.2, spacing / riser));
}
/**
 * A cliff profile across its width, 0 at the foot and 1 at the rim (terrain version 14, docs/26 §10): the face is
 * steepest at the rim, which meets the flat top in a hard crease, and eases into a talus at the foot. (Version 13
 * used a smoothstep, which rounded both edges.)
 */
export const cliff = (t: number) => { const u = clamp(t); return u * u; };
/** Cliff with a talus: a sheer face over the top `face` share of the width carries `drop` of the height (rim crease
 * on top, a concave talus below). 0 at the foot, 1 at the rim. */
/**
 * A step that keeps a smoothstep's lower half (so a waterline or bank foot stays where it was) and then runs straight
 * up into a hard rim crease, short of where the smoothstep would have rounded off. 0 at the foot, 1 on top.
 */
export const crispStep = (t: number) => { const u = clamp(t); return u < 0.5 ? u * u * (3 - 2 * u) : Math.min(1, 0.5 + 1.5 * (u - 0.5)); };
export function cliffTalus(t: number, face = 0.45, drop = 0.75): number {
  const u = clamp(t), knee = 1 - face;
  return u >= knee ? 1 - drop + drop * (u - knee) / face : (1 - drop) * (u / knee) * (u / knee);
}

/**
 * Graded ground for Khepri's district windows (docs/23 §5.1, docs/26 §2): the flanks of every district slot's window
 * keep gentler benches, fewer mesas and shallower canyons, so a refinery district still finds level lots linked by
 * drivable grades. A pure function of position (the window, not the plan), so the planner can read the landform.
 */
export function districtGrade(x: number, s: number): number {
  // The preferred band of the process lot (where the planner looks first) and room for the hub beside it.
  const policy = KHEPRI_DISTRICTS, from = policy.prefer[0] - GRADE_REACH, to = policy.prefer[1] + GRADE_REACH;
  const slot = Math.floor((s - policy.first - from + 12) / policy.period);
  if (slot < 0) return 0;
  const local = s - (policy.first + slot * policy.period);
  return smoothRange(from - 12, from, local) * (1 - smoothRange(to, to + 12, local)) * smoothRange(2, 4, Math.abs(x));
}
/** How far beyond the preferred band the district grading reaches (world units). */
const GRADE_REACH = 26;

/** Bench riser width per unit of bench height, and its least width (≥ 2 grid cells): cliffs keep their width on any slope. */
const RISER = 0.42, RISER_MIN = 0.55;
/** Strata warp amplitude and period (world height units). */
const STRATA = 0.38, STRATA_PERIOD = 3.4;
/** Gradient probe for the benches (world units). */
const PROBE = 0.3;

/** Mesa and butte lattice cell (world units): at most one per cell; every shape stays within its 3 × 3 neighbourhood. */
const MESA_CELL = 12;
/** Cap-rock riser width (sheer, at least two grid cells so it never aliases) and talus apron reach, world units. */
const CAP_RISER = 0.45, TALUS = 2.6;
interface MesaCell {
  x: number; s: number; cos: number; sin: number;
  /** Cap-rock half axes, the mean radius, the flat top's height and its rise over the ground it was set on. */
  rx: number; rs: number; r: number; top: number; rise: number;
  /** A stepped mesa's upper tier: radius fraction (0 = none) and its top. */
  tier: number; tierTop: number;
}
const mesaMemo = new Map<number, MesaCell | null>();
let mesaSeed = NaN;
/** The mesa or butte of one lattice cell (pure in seed and cell; memoized). Its mood and ground are read at its centre. */
function mesaCell(seed: number, i: number, j: number): MesaCell | null {
  if (seed !== mesaSeed) { mesaMemo.clear(); mesaSeed = seed; }
  const key = j * 16 + i + 8;
  const known = mesaMemo.get(key);
  if (known !== undefined) return known;
  const h = (k: number) => hash(seed ^ 0x3e50, i * 13 + k, j);
  const cx = (i + 0.2 + h(1) * 0.6) * MESA_CELL, cs = (j + 0.2 + h(2) * 0.6) * MESA_CELL;
  const mood = moodParams(seed, cs), calm = routeCalm(seed, cx, cs);
  let cell: MesaCell | null = null;
  if (Math.abs(cx) < WORLD_HALF + 4 && h(0) < mood.mesas * 0.8 * Math.max(0.35, 1 - calm * 1.1) * (1 - 0.85 * districtGrade(cx, cs))) {
    const butte = h(3) < mood.buttes;
    const r = butte ? 0.9 + h(4) * 1.1 : 2.2 + h(4) * 3.2, stretch = 0.75 + h(5) * 0.55, angle = h(6) * Math.PI;
    // Tops rise over the ground at their own centre, so mesas in view stand at several heights.
    const ground = levelField(seed, cx, cs, mood, calm).level;
    const rise = butte ? 2 + h(7) * 2.6 : 1.3 + h(7) * 2.2;
    const top = Math.min(TERRAIN_MAX_HEIGHT - 0.1, ground + rise);
    const tier = !butte && r > 3.2 && h(8) < 0.45 ? 0.38 + h(9) * 0.22 : 0;
    cell = { x: cx, s: cs, cos: Math.cos(angle), sin: Math.sin(angle), rx: r * stretch, rs: r / stretch, r, top, rise: top - ground + 1.2,
      tier, tierTop: Math.min(TERRAIN_MAX_HEIGHT - 0.05, top + 0.8 + h(10) * 0.8) };
    if (top - ground < 0.8) cell = null;
  }
  if (mesaMemo.size > 4096) mesaMemo.clear();
  mesaMemo.set(key, cell);
  return cell;
}
/** Highest mesa or butte surface at a point (flat cap-rock top, sheer riser, talus apron), or −Infinity. */
function mesaSurface(seed: number, x: number, s: number): number {
  const ci = Math.floor(x / MESA_CELL), cj = Math.floor(s / MESA_CELL);
  let best = -Infinity, wx = NaN, ws = NaN;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const c = mesaCell(seed, ci + di, cj + dj), reach = c ? c.r * 1.45 + CAP_RISER + 0.12 * c.rise + TALUS + 1.3 : 0;
    if (!c || Math.abs(x - c.x) > reach || Math.abs(s - c.s) > reach) continue;
    // Eroded outlines: one shared warp for every cell near the point.
    if (Number.isNaN(wx)) {
      wx = x + (noise(seed ^ 0x3e51, x * 0.24, s * 0.22) - 0.5) * 1.7 + (noise(seed ^ 0x3e53, x * 0.8, s * 0.75) - 0.5) * 0.45;
      ws = s + (noise(seed ^ 0x3e52, x * 0.24 + 3.7, s * 0.22) - 0.5) * 1.7 + (noise(seed ^ 0x3e54, x * 0.8 + 1.3, s * 0.75) - 0.5) * 0.45;
    }
    const dx = wx - c.x, ds = ws - c.s, u = (dx * c.cos + ds * c.sin) / c.rx, v = (-dx * c.sin + ds * c.cos) / c.rs;
    const d = Math.hypot(u, v), out = (d - 1) * c.r;
    // The cap rock drops most of the rise at once (its width grows with the drop, so it never aliases); the talus
    // apron carries the rest down below the ground.
    const cap = CAP_RISER + 0.12 * c.rise;
    if (out > cap + TALUS) continue;
    // The rim is a hard crease: the cap rock falls away steepest at its edge (version 14; a smoothstep rounded it).
    let surface = c.top - c.rise * (0.62 * (1 - cliff(1 - out / cap)) + 0.5 * smoothRange(cap * 0.5, cap + TALUS, out));
    if (c.tier > 0) surface = Math.max(surface, c.tierTop - (c.tierTop - c.top + 0.3) * (1 - cliff(1 - (d - c.tier) * c.r / (CAP_RISER + 0.12 * (c.tierTop - c.top)))));
    if (surface > best) best = surface;
  }
  return best;
}

/** Wind direction (x, s) the dunes line up across: from the upper left, like the low sun. */
const DUNE_X = 0.8, DUNE_S = 0.6, DUNE_LENGTH = 6.5;

/**
 * Macro geography (docs/13 §2, docs/26 §2): a smooth regional level (massifs, ridges, a mid-scale swell, escarpment
 * ramps) cut into flat benches with crisp cliffs of fixed width, whose riser height and level offset drift from region
 * to region (never one fixed set of plateau heights); carved by dendritic canyons with flat, stepped floors (deep in
 * canyon country); crowned by mesas and buttes at their own heights; swept into dunes on the ergs.
 */
export function landform(seed: number, x: number, s: number, mood: MoodParams, calm = routeCalm(seed, x, s)): Landform {
  const field = levelField(seed, x, s, mood, calm);
  // Benches: the regional level, cut along its contours into flat steps with RISER-wide cliffs. Where contours crowd
  // closer than a riser the ground keeps the smooth slope (no sub-cell stair aliasing).
  const step = mood.step * (0.85 + noise(seed ^ 0x7e10, x * 0.015, s * 0.012) * 0.3);
  const phase = noise(seed ^ 0x7e11, x * 0.013 + 2.1, s * 0.011) * step;
  const east = levelField(seed, x + PROBE, s, mood, calm), north = levelField(seed, x, s + PROBE, mood, calm);
  // Eroded bench edges: fine relief makes every cliff line wander into spurs and bays (it moves the edges only).
  const jag = (u: number, v: number) => (noise(seed ^ 0x2b20, u * 0.2, v * 0.19) - 0.5) * 0.5 + (noise(seed ^ 0x2b21, u * 0.55, v * 0.5) - 0.5) * 0.2;
  const edges = field.level + jag(x, s);
  const gx = (east.level + jag(x + PROBE, s) - edges) / PROBE, gs = (north.level + jag(x, s + PROBE) - edges) / PROBE;
  // Ramps: here and there the benches merge into talus slopes, so tracks can climb between levels.
  const ramp = smoothRange(0.6, 0.74, noise(seed ^ 0x7e12, x * 0.07, s * 0.065)), graded = 1 - 0.6 * districtGrade(x, s);
  let height = bench(field.level, Math.hypot(gx, gs), step, phase, Math.max(RISER_MIN, RISER * step), mood.terrace * (1 - calm * 0.5) * (1 - ramp) * graded, edges);
  let e = clamp((field.level - FLOOR_LEVEL) / RELIEF);
  // Dendritic canyons along contour lines of warped noise at two scales (trunks and tributaries), at any angle. The
  // distance to each centreline (the contour value over its gradient) shapes them in world units: flat floors that
  // sink deeper (to about −9) and open wider in canyon country, walls about 3 steep on average (no stair aliasing),
  // stepping down in flat ledges; shallow washes where the mood barely carves.
  const floor = mix(-5.6, -8.8, mood.depth) + (noise(seed ^ 0x3c5b, x * 0.05, s * 0.05) - 0.5) * 0.7;
  const along = (f: { qx: number; qs: number }, salt: number, fx: number, fs: number) => noise(seed ^ salt, f.qx * fx, f.qs * fs) - 0.5;
  const t0 = along(field, 0x3c57, 0.034, 0.03), trunkGrad = Math.hypot(along(east, 0x3c57, 0.034, 0.03) - t0, along(north, 0x3c57, 0.034, 0.03) - t0) / PROBE;
  const trunkDistance = Math.abs(t0) / Math.max(trunkGrad, 1e-4), drop = Math.max(0, height - floor);
  const wall = Math.max(1.1, drop / 3), t = clamp((trunkDistance - mix(0.5, 3, mood.depth)) / wall), k = t * 3, ledge = Math.floor(k);
  // A sheer face under a hard rim with a talus below (ledged in deep canyons, each ledge with its own crisp rim).
  const profile = mix(cliffTalus(t), (ledge + cliff((k - ledge - 0.45) / 0.55)) / 3, 0.7 * mood.depth);
  const trunk = (1 - profile) * mood.carve * graded;
  if (trunk > 0) height = mix(height, Math.min(height, floor), trunk);
  // Tributaries: narrower, shallower side canyons cut into the higher ground.
  const r0 = along(field, 0x3c58, 0.085, 0.075), tributaryGrad = Math.hypot(along(east, 0x3c58, 0.085, 0.075) - r0, along(north, 0x3c58, 0.085, 0.075) - r0) / PROBE;
  const sideFloor = Math.max(floor, height - 3.2), sideWall = Math.max(0.8, (height - sideFloor) / 2.2);
  const tributary = (1 - cliff((Math.abs(r0) / Math.max(tributaryGrad, 1e-4) - 0.3) / sideWall)) * 0.8 * smoothRange(0.4, 0.7, e) * mood.carve * graded;
  if (tributary > 0) height = mix(height, Math.min(height, sideFloor), tributary);
  const channel = Math.max(trunk, tributary);
  // Mesas and buttes stand on whatever ground they rise from (canyon floors included).
  height = Math.max(height, mesaSurface(seed, x, s));
  // Dunes on the ergs: long crests across the wind, gentle backs and short slip faces, broken into finite lengths.
  if (mood.dunes > 0) {
    const along = x * DUNE_X + s * DUNE_S, across = -x * DUNE_S + s * DUNE_X;
    const wave = (along + (noise(seed ^ 0x5d01, along * 0.05, across * 0.08) - 0.5) * 6 + (noise(seed ^ 0x5d02, x * 0.2, s * 0.2) - 0.5) * 1.2) / DUNE_LENGTH;
    const p = wave - Math.floor(wave), profile = p < 0.7 ? smooth(p / 0.7) : 1 - smooth((p - 0.7) / 0.3);
    const crests = smoothRange(0.3, 0.62, noise(seed ^ 0x5d03, along * 0.045, across * 0.11));
    height += mood.dunes * profile * crests * (1 - channel * 0.8) * (1 - calm * 0.4);
  }
  // Mid-frequency erosion relief keeps broad tops and floors from reading as smeared flats.
  height += (noise(seed ^ 0x4e57, x * 0.75, s * 0.7) - 0.5) * 0.12 + (noise(seed ^ 0x4e58, x * 1.7, s * 1.6) - 0.5) * 0.04;
  // Occasional impact craters: a bowl, a raised rim and a faint ejecta blanket.
  height += crater(seed, x, s, calm).height;
  // Elevation keeps its old band (0 at −6.3, 1 at 2.0) so the mineral masks below and the colours keep their meaning.
  e = clamp((height - FLOOR_LEVEL) / RELIEF);
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

/* ---------------------------------------------------------------- craters */

const CRATER_CELL = 22;
/** Height offset of nearby craters and how close a point is to a rim (0..1, for ejecta scatter). */
export function crater(seed: number, x: number, s: number, calm = 0): { height: number; rim: number } {
  let height = 0, rim = 0;
  for (let j = Math.floor(s / CRATER_CELL) - 1; j <= Math.floor(s / CRATER_CELL) + 1; j++) for (let i = -2; i <= 1; i++) {
    if (hash(seed ^ 0xc4a7, i, j) > 0.42) continue;
    const cx = (i + 0.2 + hash(seed ^ 0xc4a8, i, j) * 0.6) * CRATER_CELL, cs = (j + 0.2 + hash(seed ^ 0xc4a9, i, j) * 0.6) * CRATER_CELL;
    const radius = 1.4 + hash(seed ^ 0xc4aa, i, j) * 1.9, d = Math.hypot(x - cx, s - cs) / radius;
    if (d > 2.4) continue;
    const depth = (0.45 + hash(seed ^ 0xc4ab, i, j) * 0.5) * (1 - calm), lip = radius * 0.1 * (1 - calm);
    height += (d < 1 ? -depth * (1 - d * d) : 0) + lip * Math.exp(-(((d - 1) / 0.22) ** 2)) + (d > 1 ? lip * 0.25 * (1 - smoothRange(1, 2.4, d)) : 0);
    rim = Math.max(rim, (1 - smoothRange(0.8, 1.9, d)) * smoothRange(0.75, 1, d));
  }
  return { height, rim };
}

/* ---------------------------------------------------------------- colour */

/**
 * Slope-driven albedo (linear RGB): steep faces dark columnar basalt, flat ground ochre dust, rims and
 * ledges lighter dust, valley bottoms darker with minerals. `slope` is |∇h| from central differences.
 */
export function pointColor(row: { seed: number; s: number }, x: number, point: Landform & { industrial: number; platform?: number; paving?: number; plate?: number }, slope: number, rim: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
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
    // Arena paving: plates varying in tone, cracks weathered dark.
    if (point.platform) value = mix(value, mix(value * (0.95 + 0.11 * (point.plate ?? 0)), P.dustDark[channel], (point.paving ?? 0) * 0.55), point.platform);
    return mix(value, P.mineralBed[channel], point.pool * 0.25);
  };
  const grain = 0.96 + fine * 0.08;
  out[0] = pick(0) * grain; out[1] = pick(1) * grain; out[2] = pick(2) * grain;
  return out;
}
