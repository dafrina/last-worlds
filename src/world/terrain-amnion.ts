import { NEUTRAL_MOOD, WORLD_HALF, clamp, crispStep, hash, mix, noise, routeCalm, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import { cliffWallSteps } from './terrain-walls';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { ARENA_CLEARING, arenaAt, arenaWeight } from './terrain-arena';

/**
 * Amnion, the Brood Wastes (docs/27, user 23 October 2026, after art/concepts/amnion-brood-wastes): pale plateaus of
 * bone crust, cracked into plates and dimpled with egg hollows, split by deep sheer-walled canyons whose dark flesh-red
 * floors carry a glowing yolk river and pools. Dry, hot and calcified, where Nacre is wet and cool. The canyons wind
 * along the flight, with narrower side cracks; bone mountains with sharp ridged crests rise from the plateau interiors
 * (user, 23 October: "definitely also add mountains not only mesa canyons"). Hostile shots are hot red with a white core here
 * (src/render/scene.ts), the core carrying them over the dark flesh. Pure functions of seed and world coordinates.
 *
 * Milestone 1 is the ground and its light only: the bone-and-sinew cliff walls, egg clutches, spires, nests and bridges
 * come from a Blender kit next (no scatter until then).
 */
/** Landmark site lattice: rows along s, three lanes across the world. */
const SITE_ROW = 16, SITE_LANES = [-7.5, 0, 7.5];
/**
 * Plateau tiers, the canyon floor and the highest crest (world height; the terrain's own cap is 2.4). The whole level
 * sits 1.2 lower than at first (user, 23 October: "lower the whole level a bit" so the tusks can grow under the flight
 * plane, and "make the canyons slightly less deep": 3.0 under the plateau instead of 3.6); the mountains keep their
 * peaks, so they gained relief.
 */
const PLATEAU = -0.9, TIER = 0.5, FLOOR = -3.9, PEAK = 2.4;
/** The plateau's base level (the boss stands on it). */
export const AMNION_PLATEAU = PLATEAU;
/** Scenery cap: the same clearance under the flight plane (3.8) as Vesper's and Nacre's. */
export const AMNION_SCENERY_MAX = 3.0;
/**
 * The tusks alone (great tusks, brood nests, tusk groves) may rise higher (user, 23 October: "the spikes could be even
 * higher"): 0.4 under the flight plane instead of 0.8. Anything under the plane can never cover a ship or a shot from
 * the camera above it; the margin only keeps the thin tips from crowding the ships' layer.
 */
export const AMNION_TUSK_MAX = 3.4;
const TUSKS: ReadonlySet<string> = new Set(['boneSpire', 'broodNest', 'hive', 'broodRuin']);
const NEUTRAL: MoodParams = NEUTRAL_MOOD;

/* ---------------------------------------------------------------- masks */

const ridged = (value: number) => { const r = 1 - Math.abs(2 * value - 1); return r * r; };

export interface AmnionMasks {
  /** 0 canyon … 1 plateau (crisp at the canyon lip). */ plateau: number;
  /** Yolk river along a canyon's centre, 0 … 1. */ yolk: number;
  /** Upper plateau tier, 0 … 1. */ tier: number;
  /** Egg hollow on the plateau, 0 … 1 (shallow pits where clutches sit). */ hollow: number;
  /** Distance to the nearest canyon centre in its noise units over its half-width (0 centre, 1 lip). */ across: number;
  /** Bone massif (mountains) weight, 0 … 1: only in plateau interiors, well back from the canyon lips. */ massif: number;
  /** A ruin's clearing (no crevasse, no mountain), 0 … 1. */ clear: number;
  /** A ruin's sunken courtyard, 0 … 1 (1 on its floor). */ pit: number;
  /** Distance to the ruin's centre over the courtyard radius (99 far from any ruin). */ ruin: number;
}
/**
 * Jagged crevasses (user, 23 October: "the concept shows jagged zigzag crevasses, not those windy canyons", then "too
 * uniform, same width canyons and too rounded ... sharp and hostile and biological edged"): two lanes down the world,
 * each a chain of straight runs that turn at sharp angles every 5–9 units, broken off for stretches. The width is set
 * at every turn, so a crevasse tapers from narrow slits to wide chasms, and it closes to a pointed wedge where it
 * breaks off. Each lip has its own two-scale serration and, now and then, a fang jutting into the gap. Narrower side
 * cracks run off some turns to a point. Pure functions of seed and position.
 */
const LANES = [-5.5, 5.5], KNOT = 7, TOOTH = 1.4, SERRATION = 0.45, FANG = 2.6, TIP = 0.12;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function knot(seed: number, lane: number, k: number): [number, number] {
  const s = (k + (hash(seed ^ 0xa1d1, lane, k) - 0.5) * 0.55) * KNOT;
  const x = clamp(LANES[lane] + (hash(seed ^ 0xa1d2, lane, k) - 0.5) * 10, -WORLD_HALF + 1.5, WORLD_HALF - 1.5);
  return [x, s];
}
/** Half-width at a turn: a third narrow slits (0.85–1.2), half canyons (1.5–2.7), a fifth wide chasms (3–4.6). */
function knotHalf(seed: number, lane: number, k: number): number {
  const r = hash(seed ^ 0xa1d4, lane, k);
  return r < 0.3 ? 0.85 + r / 0.3 * 0.35 : r < 0.78 ? 1.5 + (r - 0.3) / 0.48 * 1.2 : 3 + (r - 0.78) / 0.22 * 1.6;
}
/** A lane is unbroken crust for stretches of three segments, about one stretch in four. */
const broken = (seed: number, lane: number, k: number) => hash(seed ^ 0xa1d3, lane, Math.floor(k / 3)) < 0.25;
/** A piecewise-linear zigzag in −1 … 1 (sharp corners, never smooth). */
export function zigzag(seed: number, u: number, side: number): number {
  const i = Math.floor(u);
  return lerp(hash(seed, i, side), hash(seed, i + 1, side), u - i) * 2 - 1;
}
/** The same zigzag closed round a ring of n teeth (`turn` 0 … 1 once round): no seam where the angle wraps. */
function ringZigzag(seed: number, turn: number, n: number): number {
  const u = turn * n, i = Math.floor(u);
  return lerp(hash(seed, i % n, 0), hash(seed, (i + 1) % n, 0), u - i) * 2 - 1;
}
/**
 * Distance from (x, s) to the segment a–b over its local half-width, 1 at the lip. The half-width tapers from halfA to
 * halfB; each side's lip has its own serration (teeth every 1.4, finer every 0.45) and its own occasional fang.
 */
function segmentAcross(x: number, s: number, ax: number, as: number, bx: number, bs: number, halfA: number, halfB: number, jagSeed: number): number {
  const vx = bx - ax, vs = bs - as, length = Math.hypot(vx, vs) || 1;
  const t = clamp(((x - ax) * vx + (s - as) * vs) / (length * length), 0, 1), along = t * length;
  const side = (x - ax) * vs - (s - as) * vx >= 0 ? 1 : 0;
  const serrate = 0.28 * zigzag(jagSeed, along / TOOTH, side) + 0.12 * zigzag(jagSeed ^ 0x5e, along / SERRATION, side);
  const f = along / FANG, fi = Math.floor(f), fang = hash(jagSeed ^ 0xfa, fi, side) < 0.4
    ? Math.max(0, 1 - Math.abs(f - fi - 0.5) / 0.16) * (0.35 + 0.3 * hash(jagSeed ^ 0xfb, fi, side)) : 0;
  const half = Math.max(TIP, lerp(halfA, halfB, t)) * Math.max(0.3, 1 + serrate - fang);
  return Math.hypot(x - ax - vx * t, s - as - vs * t) / half;
}
/** A main crevasse segment from a to b: its half-width at each end (pointed where the lane breaks off). */
export interface CrevasseSegment { ax: number; as: number; bx: number; bs: number; halfA: number; halfB: number; lane: number; k: number }
export function crevasseSegment(seed: number, lane: number, k: number): CrevasseSegment | null {
  if (broken(seed, lane, k)) return null;
  const [ax, as] = knot(seed, lane, k), [bx, bs] = knot(seed, lane, k + 1);
  const halfA = broken(seed, lane, k - 1) ? TIP : knotHalf(seed, lane, k), halfB = broken(seed, lane, k + 1) ? TIP : knotHalf(seed, lane, k + 1);
  return { ax, as, bx, bs, halfA, halfB, lane, k };
}
/** Every main crevasse segment that reaches [s0, s1). */
export function crevasseSegments(seed: number, s0: number, s1: number): CrevasseSegment[] {
  const out: CrevasseSegment[] = [];
  for (let lane = 0; lane < LANES.length; lane++) for (let k = Math.floor(s0 / KNOT) - 2; k <= Math.floor(s1 / KNOT) + 1; k++) {
    const segment = crevasseSegment(seed, lane, k);
    if (segment && Math.max(segment.as, segment.bs) >= s0 && Math.min(segment.as, segment.bs) < s1) out.push(segment);
  }
  return out;
}
/** Nearest crevasse at a point: over its half-width (1 at the lip) and whether it is a main crevasse (with yolk). Umbra
 * reuses the layout with its own seed (docs/28). */
export function crevasse(seed: number, x: number, s: number): { across: number; main: number } {
  let across = 99, main = 99;
  const k0 = Math.floor(s / KNOT);
  for (let lane = 0; lane < LANES.length; lane++) for (let k = k0 - 2; k <= k0 + 1; k++) {
    const segment = crevasseSegment(seed, lane, k);
    if (!segment) continue;
    const { ax, as, bx, bs, halfA, halfB } = segment;
    const a = segmentAcross(x, s, ax, as, bx, bs, halfA, halfB, seed ^ (lane * 977 + k * 31));
    across = Math.min(across, a); main = Math.min(main, a);
    // A side crack from this turn, at a steep angle off the lane, narrowing to a point.
    if (hash(seed ^ 0xa1d5, lane, k) < 0.4) {
      const side = hash(seed ^ 0xa1d6, lane, k) < 0.5 ? -1 : 1, angle = (0.9 + hash(seed ^ 0xa1d7, lane, k) * 0.6) * side;
      const len = 4 + hash(seed ^ 0xa1d8, lane, k) * 4, cx = ax + Math.sin(angle) * len, cs = as + Math.cos(angle) * len * 0.6;
      across = Math.min(across, segmentAcross(x, s, ax, as, cx, cs, 0.9 + hash(seed ^ 0xa1d9, lane, k) * 0.5, TIP, seed ^ (lane * 541 + k * 17 + 3)));
    }
  }
  return { across, main };
}

/**
 * Broken crust plates (user, 23 October: "too rounded"): cells about 3.4 across, each its own slab raised or sunk a
 * little and tilted, split from its neighbours by a sharp crack. Returns the slab offset and the crack (1 on it).
 */
function plates(seed: number, x: number, s: number): { offset: number; crack: number } {
  const size = 3.4, gx = Math.floor(x / size), gs = Math.floor(s / size);
  let f1 = 99, f2 = 99, cx = 0, cs = 0, id = 0;
  for (let dx = -1; dx <= 1; dx++) for (let ds = -1; ds <= 1; ds++) {
    const px = (gx + dx + hash(seed ^ 0xa2a1, gx + dx, gs + ds)) * size, ps = (gs + ds + hash(seed ^ 0xa2a2, gx + dx, gs + ds)) * size;
    const d = Math.hypot(x - px, s - ps);
    if (d < f1) { f2 = f1; f1 = d; cx = px; cs = ps; id = hash(seed ^ 0xa2a3, gx + dx, gs + ds); } else if (d < f2) f2 = d;
  }
  const tilt = (id * 6.283), lean = 0.05 * hash(seed ^ 0xa2a4, Math.round(cx * 7), Math.round(cs * 7));
  return { offset: (id - 0.5) * 0.24 + ((x - cx) * Math.cos(tilt) + (s - cs) * Math.sin(tilt)) * lean, crack: 1 - smoothRange(0, 0.14, f2 - f1) };
}

/**
 * Ruins (user, 23 October: "occasional huge clusters with gigantic horns kinda like a ruin", "big areas on the base but
 * also high and imposing"): at most one per 64 units of flight, each a broad clearing (no crevasse, no mountain) round
 * a sunken courtyard 8–9 across whose floor lies 2.7 under the plateau ("even higher horns"), so its tusks rise about
 * 7 from the floor to the tusk cap. The ruin piece stands on the courtyard floor.
 */
export const RUIN_ROW = 64, RUIN_FLOOR = -3.6;
export interface RuinSite { x: number; s: number; r: number }
export function ruinSite(seed: number, row: number): RuinSite | null {
  if (row < 1 || hash(seed ^ 0xa3a1, row, 0) > 0.6) return null;
  return { x: (hash(seed ^ 0xa3a2, row, 0) - 0.5) * 7, s: (row + 0.5 + (hash(seed ^ 0xa3a3, row, 0) - 0.5) * 0.4) * RUIN_ROW, r: 4 + hash(seed ^ 0xa3a4, row, 0) * 0.6 };
}
function nearestRuin(seed: number, x: number, s: number): { site: RuinSite; d: number } | null {
  const row = Math.floor(s / RUIN_ROW);
  let best: { site: RuinSite; d: number } | null = null;
  for (let r = row - 1; r <= row + 1; r++) {
    const site = ruinSite(seed, r);
    if (!site) continue;
    const d = Math.hypot(x - site.x, s - site.s) / site.r;
    if (!best || d < best.d) best = { site, d };
  }
  return best;
}

/** Amnion's masks at a point (landform, colour and scatter). An arena weight flattens the plateau around the boss. */
export function amnionMasks(seed: number, x: number, s: number, platform = 0): AmnionMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xa1a1, x * 0.045, s * 0.04) - 0.5) * 9, qs = s + (noise(seed ^ 0xa1a2, x * 0.045 + 5.1, s * 0.04) - 0.5) * 9;
  const { across, main } = crevasse(seed, x, s);
  // Sheer lips (crispStep), and no canyon inside the boss clearing.
  const plateau = Math.max(crispStep((across - 0.86) / 0.24 + 0.5), platform);
  // The yolk: a narrow channel down a main crevasse's middle, broken into runs and pools (dark flesh between).
  const flow = smoothRange(0.38, 0.6, noise(seed ^ 0xa1da, x * 0.16, s * 0.12));
  const yolk = (1 - smoothRange(0.06, 0.22 + 0.12 * flow, main)) * (0.25 + 0.75 * flow) * (1 - platform);
  const tier = smoothRange(0.56, 0.6, noise(seed ^ 0xa1a7, qx * 0.06, qs * 0.055)) * (1 - calm * 0.5) * (1 - platform);
  const pit = noise(seed ^ 0xa1a8, x * 0.32, s * 0.3), field = smoothRange(0.5, 0.7, noise(seed ^ 0xa1a9, x * 0.06, s * 0.06));
  const hollow = smoothRange(0.68, 0.86, pit) * field * smoothRange(0.85, 1, plateau) * (1 - platform);
  // Mountains: broad massifs in their own regions, set well back from any canyon lip (the canyons keep their clean shape).
  const back = smoothRange(1.15, 1.7, across);
  // (Fewer, bigger massifs: about one tenth of the ground; the crust between stays smooth slabs, as in the concept.)
  const massif = smoothRange(0.56, 0.72, noise(seed ^ 0xa1c1, qx * 0.035, qs * 0.03)) * back * (1 - calm * 0.4) * (1 - platform);
  // A ruin's clearing and its sunken courtyard (sheer-walled, with a jagged rim of its own).
  const near = nearestRuin(seed, x, s), ruin = near ? near.d : 99;
  const clear = (1 - smoothRange(1.25, 1.9, ruin)) * (1 - platform);
  // The courtyard's rim: big irregular teeth and a finer serration (never a clean circle).
  const turnAt = near ? (Math.atan2(s - near.site.s, x - near.site.x) / (2 * Math.PI) + 1) % 1 : 0;
  const rim = near ? 1 + 0.13 * ringZigzag(seed ^ 0xa3a5, turnAt, 11) + 0.05 * ringZigzag(seed ^ 0xa3a6, turnAt, 38) : 1;
  const sunk = (1 - crispStep((ruin / rim - 0.97) / 0.08 + 0.5)) * (1 - platform);
  return {
    plateau: Math.max(plateau, clear), yolk: yolk * (1 - clear), tier: tier * (1 - clear), hollow: hollow * (1 - massif) * (1 - clear),
    across: mix(across, 9, clear), massif: massif * (1 - clear), clear, pit: sunk, ruin,
  };
}

/**
 * Brood ground: plateaus of bone crust in two tiers (gently domed, a little rolling, egg hollows sunk into them), sheer
 * canyon walls down to a dark flesh floor that sags toward its glowing yolk river. `pool` carries the yolk (the ground
 * shader's glowing crackle network), `tone` the crust patches.
 */
export function amnionLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const m = amnionMasks(seed, x, s, arenaAt(row.arena, seed, x, s));
  // The crust: broken, tilted plates split by sharp cracks (user, 23 October: "too rounded"), a faint swell under them.
  const slab = plates(seed, x, s), calmCrust = 1 - m.massif;
  const dome = (noise(seed ^ 0xa1b1, x * 0.11, s * 0.1) - 0.5) * 0.08 + (slab.offset - slab.crack * 0.14) * calmCrust;
  // Mountains: blade crests (cubed ridges, two octaves, the finer one stretched into spines) cut into stepped strata
  // with sharp risers ("sharp and hostile"), on the massifs, up to the cap. Every riser takes the flesh colour of the
  // canyon walls, a red maze of ledges over the bone (user, 23 October: "that looks cool tho, i like it!"), then "reduce
  // the maze like structures a bit, its cool a little but not so many".
  const blade = (v: number) => { const r = 1 - Math.abs(2 * v - 1); return r * r * r; };
  const crest = blade(noise(seed ^ 0xa1c2, x * 0.26, s * 0.21)) * 0.65 + blade(noise(seed ^ 0xa1c3, x * 0.9, s * 0.35)) * 0.35;
  // Strata only on about a third of the massifs, and tall ones ("its cool a little but not so many").
  const rise = Math.pow(m.massif, 0.7) * (0.45 + 3.4 * crest), STRATUM = 0.65;
  const stepped = Math.floor(rise / STRATUM) * STRATUM + STRATUM * crispStep(((rise / STRATUM) % 1 - 0.55) / 0.3 + 0.5);
  const mountain = mix(rise, stepped, smoothRange(0.58, 0.66, noise(seed ^ 0xa1c4, x * 0.045, s * 0.04)));
  const top = Math.min(PEAK, PLATEAU + m.tier * TIER + dome - m.hollow * 0.35 + mountain);
  // Crevasse floors at different heights (user, 23 October: "the bottom of the canyons could be more different
  // heights"): deeper and shallower stretches, fleshy mounds, and a ledge along the walls partway down.
  const regional = (noise(seed ^ 0xa1b3, x * 0.08, s * 0.06) - 0.5) * 2.6;
  const mounds = ridged(noise(seed ^ 0xa1b5, x * 0.55, s * 0.5)) * 0.4 + (noise(seed ^ 0xa1b6, x * 0.4, s * 0.36) - 0.5) * 0.2;
  const ledge = smoothRange(0.42, 0.6, m.across) * 1.1;
  const floor = FLOOR + regional + mounds + ledge - m.yolk * 0.3;
  // Yolk fissures: two crossing families of jagged contour lines over the crevasse floors (Khepri's glowing veins, twice
  // as fine), broken into runs; the glowing yolk itself only pools in patches.
  const wx = x + (noise(seed ^ 0xa1e1, x * 0.3, s * 0.3) - 0.5) * 2 + (noise(seed ^ 0xa1e2, x * 1.6, s * 1.6) - 0.5) * 0.5;
  const ws = s + (noise(seed ^ 0xa1e3, x * 0.3, s * 0.3) - 0.5) * 2 + (noise(seed ^ 0xa1e4, x * 1.6, s * 1.6) - 0.5) * 0.5;
  const vein = (noise(seed ^ 0xa1e5, wx * 0.42, ws * 0.34) - 0.5) / 0.14, vein2 = (noise(seed ^ 0xa1e6, wx * 0.34 + 3.1, ws * 0.46) - 0.5) / 0.15;
  const fissures = (1 - smoothRange(0.3, 0.7, m.plateau)) * smoothRange(0.35, 0.55, noise(seed ^ 0xa1e7, x * 0.3, s * 0.3));
  const pools = m.yolk * smoothRange(0.5, 0.7, noise(seed ^ 0xa1e8, x * 0.35, s * 0.3));
  const crust = noise(seed ^ 0xa1b4, x * 0.18, s * 0.16);
  const ground: Landform & { tone: number } = {
    // `channel` carries the massif weight (the terrain grid keeps only its known fields; Amnion's colour reads it).
    // A ruin's courtyard floor: flesh, cracked with yolk fissures, a glowing pool at its heart.
    height: clamp(mix(mix(floor, top, m.plateau), RUIN_FLOOR + (slab.offset - slab.crack * 0.1) * 0.6, m.pit), -5, 2.4),
    elevation: m.plateau * (1 - m.pit * 0.85), channel: m.massif,
    pool: Math.max(pools * (1 - m.plateau), m.pit * (1 - smoothRange(0.18, 0.34, m.ruin)) * 0.9),
    vein, vein2, veins: Math.max(fissures, m.pit * smoothRange(0.35, 0.55, noise(seed ^ 0xa1e7, x * 0.3, s * 0.3))), tone: crust,
  };
  return row.arena ? emergence(seed, x, s, row.arena.fromS + ARENA_CLEARING.centre, arenaWeight(row.arena, s), ground) : ground;
}

/**
 * THE CRADLE's emergence site (user, 23 October: "since it will arise from the ground you can style the terrain
 * accordingly", then "make sure it raises from a fleshy canyon"): a wide canyon across the whole arena, its sheer walls
 * dark flesh (and flesh wall pieces along its lips), its serrated lips broken in teeth, a dim yolk glow far down on its
 * floor. The boss's floating island rises out of it and hovers over it. On both sides the crust is heaved up toward the
 * lips in broken, tilted plates split by glowing fissures, and two narrower serrated chasms cut diagonally through.
 * Blends into the planet's own ground about 16 out. The canyon sits `ahead` past the arena's centre, under the island:
 * the model stands further than its logical row (its target plane projects there from the plateau) and its island lies
 * behind its pivot.
 */
// Fitted to THE CRADLE (the-cradle-v2-approved.glb, 24 October): it rises in place (no slide) and spans 2.3 toward the
// player to 6.35 away from its pivot, which sits 1.65 past its row (its 1.54 target plane over the 0.8 hover), with 0.8 of
// surge either way: its middle is 3.2 past the clearing's centre, and the canyon's narrowest stretch (0.87 of halfS)
// clears it by 0.4.
export const EMERGENCE = { ahead: 3.2, halfS: 6.4, floor: -7.5, heaveX: 12, heaveS: 9.5, heave: 1.4, chasm: -4.2, reach: 16 } as const;
function emergence(seed: number, x: number, s: number, centre: number, along: number, ground: Landform & { tone: number }): Landform & { tone: number } {
  const E = EMERGENCE, ds = s - centre - E.ahead, far = Math.hypot(x / (E.reach * 1.4), ds / E.reach);
  const weight = along * (1 - smoothRange(0.8, 1, far));
  if (weight <= 0) return ground;
  // The canyon across the arena: each lip its own serration (big teeth and a finer saw), never narrower than the island.
  const side = ds > 0 ? 1 : 0;
  const lip = E.halfS * (1 + 0.1 * (zigzag(seed ^ 0xa4a1, x / 1.6, side) + 1) + 0.04 * zigzag(seed ^ 0xa4a2, x / 0.5, side));
  const canyon = 1 - crispStep((Math.abs(ds) / lip - 0.96) / 0.1 + 0.5);
  // The heave: broken plates tilted up toward the lips, fissures running out from them.
  const q = Math.max(0, Math.abs(ds) - lip) / (E.heaveS - E.halfS), slab = plates(seed ^ 0x5a, x, s);
  const fissure = 1 - smoothRange(0.05, 0.16, Math.abs(zigzag(seed ^ 0xa4a3, x / 2.2, side) * 0.5 + 0.5 - ((x / 2.2) % 1 + 1) % 1));
  const heave = PLATEAU + Math.pow(Math.max(0, 1 - q), 1.3) * E.heave * (1 - smoothRange(8, 12, Math.abs(x)) * 0.5) + slab.offset * 1.6 - slab.crack * 0.3 - fissure * smoothRange(0.05, 0.3, q) * (1 - q) * 0.8;
  // Two narrower serrated chasms running diagonally out from the canyon.
  let chasm = 0;
  for (const [angle, salt] of [[0.62, 0xa4b1], [-0.55, 0xa4b2]] as const) {
    const across = x * Math.cos(angle) - ds * Math.sin(angle), length = x * Math.sin(angle) + ds * Math.cos(angle);
    const half = 1.4 * (1 + 0.25 * zigzag(seed ^ salt, length / 1.3, across > 0 ? 1 : 0) + 0.1 * zigzag(seed ^ salt ^ 0x5e, length / 0.45, across > 0 ? 1 : 0));
    chasm = Math.max(chasm, (1 - crispStep((Math.abs(across) / half - 0.86) / 0.24 + 0.5)) * smoothRange(5, 7, Math.abs(length)));
  }
  const floor = E.floor + (noise(seed ^ 0xa4c1, x * 0.3, s * 0.3) - 0.5) * 1.2 + slab.offset;
  const height = mix(mix(heave, E.chasm + slab.offset, chasm), floor, canyon);
  const open = Math.max(canyon, chasm);
  return {
    ...ground,
    height: clamp(mix(ground.height, height, weight), -8.5, 2.4),
    elevation: mix(ground.elevation, 1 - open, weight), channel: ground.channel * (1 - weight),
    pool: mix(ground.pool, Math.max(canyon * 0.3 * smoothRange(0.45, 0.6, noise(seed ^ 0xa4c2, x * 0.25, s * 0.25)), chasm * 0.3), weight),
    veins: mix(ground.veins, Math.max(open * 0.8, fissure * smoothRange(0.05, 0.3, q) * (1 - q)), weight),
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Brood palette, linear RGB (concept: pale bone crust, ochre stains, sinew-pink lips, dark flesh walls and floors). */
export const AMNION_PALETTE = {
  bone: linear(0xe4dccd), boneShade: linear(0xc6baa4), stain: linear(0xb09878), sinew: linear(0x7e4236),
  // Darker flesh (user, 23 October: "make the flesh a bit darker").
  flesh: linear(0x44120f), floor: linear(0x260a09), hollow: linear(0x8a6a50),
} as const;

function amnionColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = AMNION_PALETTE, { seed, s } = row;
  const fine = noise(seed ^ 0x52c1, x * 1.3, s * 1.3), crust = point.tone ?? 0.5;
  const lip = smoothRange(0.75, 1, point.elevation) * (1 - smoothRange(0.98, 1, point.elevation)), steep = smoothRange(1, 2.2, slope);
  const hollow = smoothRange(0.2, 0.5, (PLATEAU + 0.1 - point.height) * point.elevation) * smoothRange(0.95, 1, point.elevation);
  // Canyon walls are flesh (below the plateau lip); mountain flanks are darker, stained bone, their crests pale.
  const canyon = 1 - smoothRange(0.85, 0.98, point.elevation), flank = steep * (1 - canyon) * smoothRange(0.1, 0.4, point.channel);
  for (let c = 0; c < 3; c++) {
    let value = mix(P.bone[c], P.boneShade[c], smoothRange(0.35, 0.7, crust) * 0.6);
    value = mix(value, P.stain[c], smoothRange(0.62, 0.82, crust) * 0.45);
    value = mix(value, P.hollow[c], hollow * 0.7);
    // Sinew at the canyon lip, flesh down the walls, a dark floor.
    value = mix(value, P.sinew[c], Math.max(lip * 0.3, rim * 0.15));
    value = mix(value, P.stain[c] * 0.82, flank * 0.7);
    // Mountains shade by height: darker stained folds between the peaks, pale crests.
    value *= mix(1, mix(0.68, 1.08, smoothRange(PLATEAU + 0.2, PEAK - 0.1, point.height)), smoothRange(0.1, 0.5, point.channel));
    value = mix(value, mix(P.floor[c], P.flesh[c], point.elevation), Math.max(steep * canyon, 1 - smoothRange(0.2, 0.6, point.elevation)));
    out[c] = value * (0.9 + fine * 0.2);
  }
  return out;
}

/* ---------------------------------------------------------------- profile */

/**
 * Brood dressing (milestone 2, after the concept's composition: user, 23 October, "looks kinda shit compared to the
 * concept", whose plateaus are crowded): egg clutches piled in the hollows and crowding the plateau edges over the
 * canyons, a few down on the canyon floors; clusters of curved bone horns on the mountains and along the canyon edges;
 * now and then a ribbed nest on open plateau; bone shards everywhere. The boss clearing keeps only shards (bosses roll
 * over them). Flesh walls (cliff-kit.glb) line the canyon lips in continuous runs (never on mountain flanks, none
 * turned away from the camera, larger segments), the rules Vesper's walls proved (docs/26).
 */
function* amnionScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [], CAP = AMNION_SCENERY_MAX;
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale > WORLD_HALF) return;
    const cap = TUSKS.has(instance.kind) ? AMNION_TUSK_MAX : CAP;
    if (instance.y + instance.height * spec.height > cap) instance = { ...instance, height: (cap - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  // Landmarks (Amnion's buildings: user, 23 October, "the nests in this level replace the buildings ... big and high"):
  // a site lattice, rows every SITE_ROW along s and three lanes, each site taken by chance; it seeks open plateau well
  // back from any crevasse and holds a brood nest or a hive spire, scaled up to 4–5 across and up to the cap.
  const landmarks: { x: number; s: number; r: number }[] = [];
  for (let row = Math.floor(startS / SITE_ROW) - 1; row <= Math.ceil((startS + size) / SITE_ROW); row++) for (let lane = 0; lane < SITE_LANES.length; lane++) {
    const h = (k: number) => hash(seed ^ 0xa7d1, row * 7 + lane, k);
    if (h(0) > 0.5) continue;
    for (let tryIndex = 0; tryIndex < 8; tryIndex++) {
      const x = SITE_LANES[lane] + (h(1 + tryIndex) - 0.5) * 6, s = (row + 0.5 + (h(11 + tryIndex) - 0.5) * 0.6) * SITE_ROW;
      if (s < startS - 4 || s >= startS + size + 4) break;
      const m = amnionMasks(seed, x, s);
      if (m.plateau < 0.99 || m.across < 1.9 || m.massif > 0.3 || m.clear > 0.02 || terrain.platform(x, s) > 0 || terrain.blocked(x, s)) continue;
      const nest = h(30) < 0.6, scale = nest ? 2.6 + h(31) * 0.5 : 2.0 + h(31) * 0.4, ground = terrain.height(x, s);
      landmarks.push({ x, s, r: (nest ? 0.9 : 0.6) * scale + 0.6 });
      add({ kind: nest ? 'broodNest' : 'hive', x, s, y: ground - 0.08, scale, height: AMNION_TUSK_MAX - ground + 0.08 - h(32) * 0.3, rotation: turn(h(33)), cosmetic: false }, h(34));
      // Egg heaps pressed against it (separate pieces: the landmark is stretched tall, eggs must stay round).
      for (let k = 0; k < (nest ? 2 : 1); k++) {
        const a = turn(h(35)) + k * (2.2 + h(36) * 1.6), d = scale * (nest ? 0.62 : 0.4), size = 1.3 + h(37 + k) * 0.6;
        add({ kind: 'eggClutch', x: x + Math.cos(a) * d, s: s + Math.sin(a) * d, y: terrain.height(x + Math.cos(a) * d, s + Math.sin(a) * d) - 0.04, scale: size, height: size, rotation: turn(h(39 + k)), cosmetic: false }, h(41 + k));
      }
      break;
    }
  }
  // The ruins: one piece on each courtyard floor, egg heaps along the courtyard wall, nothing else in the clearing.
  for (let row = Math.floor(startS / RUIN_ROW) - 1; row <= Math.floor((startS + size) / RUIN_ROW) + 1; row++) {
    const site = ruinSite(seed, row);
    if (!site || site.s < startS || site.s >= startS + size || terrain.platform(site.x, site.s) > 0) continue;
    const h = (k: number) => hash(seed ^ 0xa3b1, row, k), y = RUIN_FLOOR - 0.1;
    landmarks.push({ x: site.x, s: site.s, r: site.r * 1.9 });
    add({ kind: 'broodRuin', x: site.x, s: site.s, y, scale: site.r * 0.98, height: AMNION_TUSK_MAX - y, rotation: turn(h(0)), cosmetic: false }, h(1));
    for (let k = 0; k < 3; k++) {
      const a = turn(h(2)) + k * (1.6 + h(3 + k) * 0.8), d = site.r * 0.72, size = 1.6 + h(6 + k) * 0.7, ex = site.x + Math.cos(a) * d, es = site.s + Math.sin(a) * d;
      add({ kind: 'eggClutch', x: ex, s: es, y: terrain.height(ex, es) - 0.04, scale: size, height: size, rotation: turn(h(9 + k)), cosmetic: false }, h(12 + k));
    }
  }
  const nearLandmark = (x: number, s: number) => landmarks.some(l => Math.hypot(l.x - x, l.s - s) < l.r);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0xa7c5, i * 43 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s) || nearLandmark(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), pick = h(2), platform = terrain.platform(x, s);
    if (platform >= 0.3) {
      if (pick < 0.05) add({ kind: 'boneShards', x, s, y: ground - 0.03, scale: 0.7 + h(3) * 0.5, height: 0.7 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: true }, h(6));
      continue;
    }
    const m = amnionMasks(seed, x, s), plateau = m.plateau > 0.95, edge = plateau && drop > 1.2;
    if (plateau && slope < 0.7 && ((m.hollow > 0.35 && pick < 0.3) || (edge && pick < 0.12) || pick < 0.012)) {
      // Egg heaps (fewer and bigger, as in the concept: the big eggs about a ship across): piled in hollows, crowding
      // the edges over the canyons, now and then on open crust.
      const members = 1 + Math.floor(h(20) * (m.hollow > 0.35 ? 3 : 2));
      for (let k = 0; k < members; k++) {
        const ox = x + (k ? (h(22 + k) - 0.5) * 1.6 : 0), os = s + (k ? (h(26 + k) - 0.5) * 1.6 : 0);
        if (k && (terrain.slope(ox, os) > 0.8 || terrain.blocked(ox, os))) continue;
        const scale = 1.5 + h(30 + k) * 0.8;
        add({ kind: 'eggClutch', x: ox, s: os, y: terrain.height(ox, os) - 0.04, scale, height: scale, rotation: turn(h(34 + k)), cosmetic: k > 0 }, h(38 + k));
      }
    } else if (plateau && (m.massif > 0.35 || edge) && slope < 1.4 && pick < (m.massif > 0.35 ? 0.025 : 0.018)) {
      // Great tusks (user, 23 October: "the horns are absolutely underwhelming"): one to three big tusk pieces, the
      // first up to the cap, often with an egg heap pressed against its foot as in the concept.
      const members = 1 + Math.floor(h(40) * 3);
      for (let k = 0; k < members; k++) {
        const ox = x + (k ? (h(42 + k) - 0.5) * 1.8 : 0), os = s + (k ? (h(48 + k) - 0.5) * 1.8 : 0);
        const scale = (k ? 1.1 : 1.4) + h(54 + k) * 0.5, tall = (k ? 2.2 : 3.4) + h(60 + k) * 1.0;
        add({ kind: 'boneSpire', x: ox, s: os, y: terrain.height(ox, os) - 0.06, scale, height: tall, rotation: turn(h(66 + k)), cosmetic: k > 1 }, h(72 + k));
      }
      if (h(41) < 0.5) {
        const a = turn(h(76)), ox = x + Math.cos(a) * 0.9, os = s + Math.sin(a) * 0.9;
        if (terrain.slope(ox, os) < 0.8 && !terrain.blocked(ox, os)) add({ kind: 'eggClutch', x: ox, s: os, y: terrain.height(ox, os) - 0.04, scale: 1.1 + h(77) * 0.5, height: 1.1 + h(77) * 0.5, rotation: turn(h(78)), cosmetic: true }, h(79));
      }
    } else if (plateau && m.massif < 0.15 && slope < 0.35 && drop < 0.4 && pick < 0.004) {
      // A brood nest on open, flat plateau.
      const scale = 1 + h(80) * 0.4;
      add({ kind: 'nest', x, s, y: ground - 0.05, scale, height: 0.8 + h(81) * 0.4, rotation: turn(h(82)), cosmetic: false }, h(83));
    } else if (!plateau && m.plateau < 0.05 && m.yolk < 0.3 && slope < 0.6 && pick < 0.025) {
      // A few clutches down on the canyon floors, off the yolk.
      const scale = 0.8 + h(84) * 0.5;
      add({ kind: 'eggClutch', x, s, y: ground - 0.04, scale, height: scale, rotation: turn(h(85)), cosmetic: false }, h(86));
    } else if (plateau && pick > 0.88) {
      add({ kind: 'boneShards', x, s, y: ground - 0.03, scale: 0.7 + h(87) * 0.6, height: 0.6 + h(88) * 0.8, rotation: turn(h(89)), cosmetic: true }, h(90));
    }
  }
  // Sinew webs (user, 23 October: "fleshy strings ... hanging between the cliffs so the glow shimmers between them"):
  // then "too stringy and uniform ... should read sticky": goo sheets strung lip to lip along every main crevasse
  // segment (scaled to its width), in irregular bunches (often two or three close together, then a long gap), at
  // different depths, sagging into the gap; a few more low over the floor.
  for (const seg of crevasseSegments(seed, startS, startS + size)) {
    const vx = seg.bx - seg.ax, vs = seg.bs - seg.as, length = Math.hypot(vx, vs), dx = vx / length, ds = vs / length;
    const rotation = Math.atan2(dx, -ds);
    for (let t = 0.6, k = 0; t < length - 0.6; k++) {
      const h = (n: number) => hash(seed ^ 0xa7e1, seg.lane * 977 + seg.k * 31 + k, n);
      const x = seg.ax + dx * t, s = seg.as + ds * t, span = lerp(seg.halfA, seg.halfB, t / length) * 0.85;
      t += h(0) < 0.45 ? 0.7 + h(6) * 0.5 : 2.2 + h(6) * 2.6;
      if (s < startS || s >= startS + size || terrain.platform(x, s) > 0 || amnionMasks(seed, x, s).clear > 0.1) continue;
      // The lower of the two lips (strands anchor just under it).
      const lip = Math.min(terrain.height(x - ds * span * 1.15, s + dx * span * 1.15), terrain.height(x + ds * span * 1.15, s - dx * span * 1.15));
      const low = h(1) < 0.25, floor = terrain.height(x, s);
      const y = low ? floor + 0.5 + h(2) * 0.6 : lip - 0.15 - h(2) * Math.max(0, (lip - floor) * 0.55);
      if (y - floor < 0.3) continue;
      add({ kind: 'sinewWeb', x, s, y, scale: span * (low ? 0.8 : 1.05), height: low ? 0.4 + h(3) * 0.4 : 0.8 + h(3) * 1.2, rotation, cosmetic: h(4) > 0.6 }, h(5));
    }
  }
  const canyonLip = (x: number, s: number) => amnionMasks(seed, x, s).massif < 0.25;
  for (const wall of yield* cliffWallSteps(seed, startS, size, terrain, {
    kind: 'fleshWall', salt: 0x7c4e, minDrop: 1.5, rimSpan: 0.7, maxAway: 0.75, minRun: 3, scale: [1.2, 1.5],
    cap: CAP, accept: canyonLip, arenas: true,
  })) essential.push(wall);
  return [...essential, ...cosmetic];
}

export const AMNION: PlanetProfile = {
  id: 'amnion', seaLevel: null,
  mood: () => 'brood', params: () => NEUTRAL, local: () => null,
  landform: amnionLandform,
  // The boss clearing is shaped in the landform (no canyon there, one plateau level); the clearing core stays flat.
  // The arena's ground is THE CRADLE's emergence site, shaped in the landform (`emergence`): nothing more to flatten.
  arena() { /* shaped in amnionLandform */ },
  color: amnionColor,
  shadowTint: [0.86, 0.66, 0.6],
  sceneryMax: AMNION_SCENERY_MAX,
  settlement: () => null,
  scatter: amnionScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(), networks: false,
};
