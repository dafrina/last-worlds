import { NEUTRAL_MOOD, WORLD_HALF, clamp, crispStep, hash, mix, noise, routeCalm, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import { cliffWallSteps } from './terrain-walls';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaAt } from './terrain-arena';

/**
 * Amnion, the Brood Wastes (docs/27, user 23 October 2026, after art/concepts/amnion-brood-wastes): pale plateaus of
 * bone crust, cracked into plates and dimpled with egg hollows, split by deep sheer-walled canyons whose dark flesh-red
 * floors carry a glowing yolk river and pools. Dry, hot and calcified, where Nacre is wet and cool. The canyons wind
 * along the flight, with narrower side cracks; bone mountains with sharp ridged crests rise from the plateau interiors
 * (user, 23 October: "definitely also add mountains not only mesa canyons"). Hostile shots are violet here
 * (src/render/scene.ts) so they never hide in the warm glow. Pure functions of seed and world coordinates.
 *
 * Milestone 1 is the ground and its light only: the bone-and-sinew cliff walls, egg clutches, spires, nests and bridges
 * come from a Blender kit next (no scatter until then).
 */
/** Plateau tiers, the canyon floor and the highest crest (world height; the terrain's own cap is 2.4). */
const PLATEAU = 0.3, TIER = 0.5, FLOOR = -3.3, PEAK = 2.4;
/** The plateau's base level (the boss stands on it). */
export const AMNION_PLATEAU = PLATEAU;
/** Scenery cap: the same clearance under the flight plane (3.8) as Vesper's and Nacre's. */
export const AMNION_SCENERY_MAX = 3.0;
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
}
/**
 * Jagged crevasses (user, 23 October: "the concept shows jagged zigzag crevasses, not those windy canyons"): two lanes
 * down the world, each a chain of straight runs that turn at sharp angles every 5–9 units, broken off for stretches so
 * crevasses start and end; their lips jog in and out every 1.2 units (broken crust plates, not a clean line); narrower
 * straight side cracks branch off at some turns. Pure functions of seed and position.
 */
const LANES = [-5.5, 5.5], KNOT = 7, JAG = 1.2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function knot(seed: number, lane: number, k: number): [number, number] {
  const s = (k + (hash(seed ^ 0xa1d1, lane, k) - 0.5) * 0.55) * KNOT;
  const x = clamp(LANES[lane] + (hash(seed ^ 0xa1d2, lane, k) - 0.5) * 10, -WORLD_HALF + 1.5, WORLD_HALF - 1.5);
  return [x, s];
}
/** Distance from (x, s) to the segment a–b over its half-width (with the lip's jog along the segment), 1 at the lip. */
function segmentAcross(x: number, s: number, ax: number, as: number, bx: number, bs: number, half: number, jagSeed: number): number {
  const vx = bx - ax, vs = bs - as, length = Math.hypot(vx, vs) || 1;
  const t = clamp(((x - ax) * vx + (s - as) * vs) / (length * length), 0, 1);
  const u = t * length / JAG, i = Math.floor(u);
  const jog = lerp(hash(jagSeed, i, 7), hash(jagSeed, i + 1, 7), u - i) * 2 - 1;
  return Math.hypot(x - ax - vx * t, s - as - vs * t) / (half * (1 + 0.22 * jog));
}
/** Nearest crevasse at a point: over its half-width (1 at the lip) and whether it is a main crevasse (with yolk). */
function crevasse(seed: number, x: number, s: number): { across: number; main: number } {
  let across = 99, main = 99;
  const k0 = Math.floor(s / KNOT);
  for (let lane = 0; lane < LANES.length; lane++) for (let k = k0 - 2; k <= k0 + 1; k++) {
    // Each lane runs in stretches of three segments: about one stretch in four is unbroken crust.
    if (hash(seed ^ 0xa1d3, lane, Math.floor(k / 3)) < 0.25) continue;
    const [ax, as] = knot(seed, lane, k), [bx, bs] = knot(seed, lane, k + 1);
    const half = 1.5 + hash(seed ^ 0xa1d4, lane, k) * 1.5;
    const a = segmentAcross(x, s, ax, as, bx, bs, half, seed ^ (lane * 977 + k * 31));
    across = Math.min(across, a); main = Math.min(main, a);
    // A side crack from this turn, at a steep angle off the lane, narrower.
    if (hash(seed ^ 0xa1d5, lane, k) < 0.4) {
      const side = hash(seed ^ 0xa1d6, lane, k) < 0.5 ? -1 : 1, angle = (0.9 + hash(seed ^ 0xa1d7, lane, k) * 0.6) * side;
      const len = 4 + hash(seed ^ 0xa1d8, lane, k) * 4, cx = ax + Math.sin(angle) * len, cs = as + Math.cos(angle) * len * 0.6;
      across = Math.min(across, segmentAcross(x, s, ax, as, cx, cs, 0.8 + hash(seed ^ 0xa1d9, lane, k) * 0.5, seed ^ (lane * 541 + k * 17 + 3)));
    }
  }
  return { across, main };
}

/** Amnion's masks at a point (landform, colour and scatter). An arena weight flattens the plateau around the boss. */
export function amnionMasks(seed: number, x: number, s: number, platform = 0): AmnionMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xa1a1, x * 0.045, s * 0.04) - 0.5) * 9, qs = s + (noise(seed ^ 0xa1a2, x * 0.045 + 5.1, s * 0.04) - 0.5) * 9;
  const { across, main } = crevasse(seed, x, s);
  // Sheer lips (crispStep), and no canyon inside the boss clearing.
  const plateau = Math.max(crispStep((across - 0.82) / 0.36 + 0.5), platform);
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
  return { plateau, yolk, tier, hollow: hollow * (1 - massif), across, massif };
}

/**
 * Brood ground: plateaus of bone crust in two tiers (gently domed, a little rolling, egg hollows sunk into them), sheer
 * canyon walls down to a dark flesh floor that sags toward its glowing yolk river. `pool` carries the yolk (the ground
 * shader's glowing crackle network), `tone` the crust patches.
 */
export function amnionLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const m = amnionMasks(seed, x, s, arenaAt(row.arena, seed, x, s));
  const dome = (noise(seed ^ 0xa1b1, x * 0.11, s * 0.1) - 0.5) * 0.14 + (noise(seed ^ 0xa1b2, x * 0.5, s * 0.46) - 0.5) * 0.03;
  // Mountains: sharp ridged crests (two octaves) on the massifs, up to the cap.
  const crest = ridged(noise(seed ^ 0xa1c2, x * 0.22, s * 0.19)) * 0.7 + ridged(noise(seed ^ 0xa1c3, x * 0.52, s * 0.47)) * 0.3;
  const mountain = Math.pow(m.massif, 0.7) * (0.3 + 2.1 * crest);
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
  return {
    // `channel` carries the massif weight (the terrain grid keeps only its known fields; Amnion's colour reads it).
    height: clamp(mix(floor, top, m.plateau), -4, 2.4), elevation: m.plateau, channel: m.massif,
    pool: pools * (1 - m.plateau), vein, vein2, veins: fissures, tone: crust,
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Brood palette, linear RGB (concept: pale bone crust, ochre stains, sinew-pink lips, dark flesh walls and floors). */
export const AMNION_PALETTE = {
  bone: linear(0xe4dccd), boneShade: linear(0xc6baa4), stain: linear(0xb09878), sinew: linear(0x9a5a4c),
  flesh: linear(0x5a1d1a), floor: linear(0x34100f), hollow: linear(0x8a6a50),
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
    if (instance.y + instance.height * spec.height > CAP) instance = { ...instance, height: (CAP - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0xa7c5, i * 43 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), pick = h(2), platform = terrain.platform(x, s);
    if (platform >= 0.3) {
      if (pick < 0.05) add({ kind: 'boneShards', x, s, y: ground - 0.03, scale: 0.7 + h(3) * 0.5, height: 0.7 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: true }, h(6));
      continue;
    }
    const m = amnionMasks(seed, x, s), plateau = m.plateau > 0.95, edge = plateau && drop > 1.2;
    if (plateau && slope < 0.7 && (m.hollow > 0.35 || (edge && pick < 0.3) || pick < 0.035)) {
      // Egg clutches: piled in hollows, crowding the edges over the canyons, scattered on open crust.
      const members = 1 + Math.floor(h(20) * (m.hollow > 0.35 ? 3 : 2));
      for (let k = 0; k < members; k++) {
        const ox = x + (k ? (h(22 + k) - 0.5) * 1.1 : 0), os = s + (k ? (h(26 + k) - 0.5) * 1.1 : 0);
        if (k && (terrain.slope(ox, os) > 0.8 || terrain.blocked(ox, os))) continue;
        const scale = 1.0 + h(30 + k) * 0.8;
        add({ kind: 'eggClutch', x: ox, s: os, y: terrain.height(ox, os) - 0.04, scale, height: scale, rotation: turn(h(34 + k)), cosmetic: k > 0 }, h(38 + k));
      }
    } else if (plateau && (m.massif > 0.35 || edge) && slope < 1.4 && pick < (m.massif > 0.35 ? 0.09 : 0.06)) {
      // Horn clusters: two to five curved bone horns of mixed height.
      const members = 2 + Math.floor(h(40) * 4);
      for (let k = 0; k < members; k++) {
        const ox = x + (k ? (h(42 + k) - 0.5) * 1.2 : 0), os = s + (k ? (h(48 + k) - 0.5) * 1.2 : 0);
        const scale = 1.2 + h(54 + k) * 0.7, tall = (k ? 1.1 : 1.8) + h(60 + k) * (k ? 1 : 1);
        add({ kind: 'boneSpire', x: ox, s: os, y: terrain.height(ox, os) - 0.06, scale, height: tall, rotation: turn(h(66 + k)), cosmetic: k > 1 }, h(72 + k));
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
  const canyonLip = (x: number, s: number) => amnionMasks(seed, x, s).massif < 0.25;
  for (const wall of yield* cliffWallSteps(seed, startS, size, terrain, {
    kind: 'fleshWall', salt: 0x7c4e, minDrop: 1.5, rimSpan: 0.7, maxAway: 0.75, minRun: 3, scale: [1.2, 1.5],
    cap: CAP, accept: canyonLip,
  })) essential.push(wall);
  return [...essential, ...cosmetic];
}

export const AMNION: PlanetProfile = {
  id: 'amnion', seaLevel: null,
  mood: () => 'brood', params: () => NEUTRAL, local: () => null,
  landform: amnionLandform,
  // The boss clearing is shaped in the landform (no canyon there, one plateau level); the clearing core stays flat.
  arena(_row, _x, point, weight) { point.height = mix(point.height, PLATEAU, weight * 0.85); },
  color: amnionColor,
  shadowTint: [0.86, 0.66, 0.6],
  sceneryMax: AMNION_SCENERY_MAX,
  settlement: () => null,
  scatter: amnionScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(), networks: false,
};
