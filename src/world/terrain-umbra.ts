import { NEUTRAL_MOOD, WORLD_HALF, clamp, crispStep, hash, mix, noise, routeCalm, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { ARENA_CLEARING, arenaAt, arenaWeight } from './terrain-arena';
import { cliffWallSteps } from './terrain-walls';
import { crevasse, crevasseSegments, zigzag } from './terrain-amnion';

/**
 * Umbra, the Eternal Eclipse (docs/28, user 24 October 2026, after art/concepts/umbra): the final planet. Shattered
 * obsidian plateaus, black and glossy, cracked by thin glowing violet faults; Amnion's jagged crevasses ("i like the
 * crevasces geometry of amnion for this") falling away into a glowing purple fog; and above the plateau only "very
 * pointy spikey mountains". "Much simpler" than Amnion: one plateau level of shattered glass plates split by cracks, no
 * tiers, hollows, strata or ruins. The hills are the kit's fractured obsidian massifs, a few large planar faces broken
 * along cracks, overlapping into ranges, with sharp rocks among them (user, 24 October: "why is there rounding on the
 * edges? i want it sharp. also, variate the hills more"; "less spikey as a vibe and more cracked and sharp"): as
 * heightfield pyramids their ridges were rounded or stepped by the 0.25 grid. Floating cliffs drift in the canyons; the kit's cliff shards line
 * only scattered stretches of the lips. Pure functions of seed and position.
 */
/** Umbra's own crevasse layout from Amnion's generator. */
const SALT = 0x0b5c;
/**
 * The plateau and the crevasse floor (deep, lost in the fog). The plateau sits 0.9 under Amnion's so the hills rise over
 * 5 units to the spire cap ("i want sharp edges and spikey mountains").
 */
const PLATEAU = -1.8, FLOOR = -5.6;
/** The plateau's level (THE ECLIPSE's seat is measured from it). */
export const UMBRA_PLATEAU = PLATEAU;
/** Scenery cap: the same clearance under the flight plane (3.8) as Amnion's. */
export const UMBRA_SCENERY_MAX = 3.0;
/** Spires and landmarks may rise to 0.4 under the flight plane, as Amnion's tusks. */
export const UMBRA_SPIRE_MAX = 3.4;
const TALL: ReadonlySet<string> = new Set(['umbHill', 'umbPeak', 'umbSpire', 'umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk', 'umbDock']);
const NEUTRAL: MoodParams = NEUTRAL_MOOD;
/** Landmark site lattice: rows along s, three lanes across the world (Amnion's, sparser). */
const SITE_ROW = 18, SITE_LANES = [-7.5, 0, 7.5];

/* ---------------------------------------------------------------- masks */

export interface UmbraMasks {
  /** 0 canyon … 1 plateau (crisp at the canyon lip). */ plateau: number;
  /** Distance to the nearest crevasse over its half-width (0 centre, 1 lip). */ across: number;
  /** Spike-mountain weight, 0 … 1: only on the plateau, well back from the canyon lips. */ massif: number;
}
export function umbraMasks(seed: number, x: number, s: number, platform = 0): UmbraMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xb1a1, x * 0.045, s * 0.04) - 0.5) * 9, qs = s + (noise(seed ^ 0xb1a2, x * 0.045 + 5.1, s * 0.04) - 0.5) * 9;
  const { across } = crevasse(seed ^ SALT, x, s);
  const plateau = Math.max(crispStep((across - 0.86) / 0.24 + 0.5), platform);
  // Spike mountains in their own regions (about a sixth of the ground), back from any lip so the canyons keep their shape.
  const back = smoothRange(1.15, 1.7, across);
  const massif = smoothRange(0.52, 0.68, noise(seed ^ 0xb1c1, qx * 0.04, qs * 0.035)) * back * (1 - calm * 0.4) * (1 - platform);
  return { plateau, across, massif };
}

/**
 * Shattered obsidian (the concept's glass plains): plates about 4.2 across, each its own tone of black glass and tilted a
 * hair its own way, so each catches the sky's reflection differently; the cracks between them are the ground shader's
 * crack lines. Returns the plate's tilt offset and tone.
 */
function shards(seed: number, x: number, s: number): { offset: number; tone: number } {
  const size = 4.2, gx = Math.floor(x / size), gs = Math.floor(s / size);
  let f1 = 99, id = 0, cx = 0, cs = 0;
  for (let dx = -1; dx <= 1; dx++) for (let ds = -1; ds <= 1; ds++) {
    const px = (gx + dx + hash(seed ^ 0xb3a1, gx + dx, gs + ds)) * size, ps = (gs + ds + hash(seed ^ 0xb3a2, gx + dx, gs + ds)) * size;
    const d = Math.hypot(x - px, s - ps);
    if (d < f1) { f1 = d; cx = px; cs = ps; id = hash(seed ^ 0xb3a3, gx + dx, gs + ds); }
  }
  const tilt = id * 6.283, lean = 0.025 * hash(seed ^ 0xb3a4, Math.round(cx * 7), Math.round(cs * 7));
  return { offset: ((x - cx) * Math.cos(tilt) + (s - cs) * Math.sin(tilt)) * lean, tone: id };
}

/**
 * Umbra's ground. `veins` carries the glowing faults (the ground shader's vein lines), `pool` the faint glow down in the
 * fog.
 */
export function umbraLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const arena = arenaAt(row.arena, seed, x, s), m = umbraMasks(seed, x, s, arena), plate = shards(seed, x, s);
  // The plates calm to one plane under the hills (kit models), so they stand flush.
  const top = PLATEAU + plate.offset * (1 - smoothRange(0, 0.15, m.massif));
  // The crevasse floor rolls gently, lost in the fog.
  const floor = FLOOR + (noise(seed ^ 0xb1b3, x * 0.08, s * 0.06) - 0.5) * 1.2;
  // Energy faults (the concept's luminous fractures): two crossing families of jagged contour lines, as Amnion's yolk
  // fissures but finer, glowing only in patches across the open plateau.
  const wx = x + (noise(seed ^ 0xb1e1, x * 0.3, s * 0.3) - 0.5) * 2 + (noise(seed ^ 0xb1e2, x * 1.6, s * 1.6) - 0.5) * 0.5;
  const ws = s + (noise(seed ^ 0xb1e3, x * 0.3, s * 0.3) - 0.5) * 2 + (noise(seed ^ 0xb1e4, x * 1.6, s * 1.6) - 0.5) * 0.5;
  const vein = (noise(seed ^ 0xb1e5, wx * 0.5, ws * 0.4) - 0.5) / 0.14, vein2 = (noise(seed ^ 0xb1e6, wx * 0.4 + 3.1, ws * 0.55) - 0.5) / 0.15;
  const faults = smoothRange(0.56, 0.7, noise(seed ^ 0xb1e7, x * 0.07, s * 0.06)) * (1 - m.massif) * smoothRange(0.95, 1, m.plateau);
  const ground: Landform & { tone: number } = {
    height: clamp(mix(Math.min(floor, PLATEAU - 0.6), top, m.plateau), -7, 2.4),
    elevation: m.plateau, channel: m.massif,
    pool: (1 - m.plateau) * 0.25 * smoothRange(0.45, 0.65, noise(seed ^ 0xb1e8, x * 0.2, s * 0.18)),
    vein, vein2, veins: faults, tone: plate.tone,
  };
  return row.arena ? abyss(seed, x, s, row.arena.fromS + ARENA_CLEARING.centre, arenaWeight(row.arena, s), ground) : ground;
}

/**
 * THE ECLIPSE's arena: a vast abyss across the whole world, the boss floating over it, its serrated lips lined with the
 * kit's cliffs and peaks. `ahead` and `halfS` are fitted to the model's footprint (the-eclipse-v1-approved.glb).
 */
export const ABYSS = { ahead: 4, halfS: 9, floor: -8.5, reach: 20 } as const;
function abyss(seed: number, x: number, s: number, centre: number, along: number, ground: Landform & { tone: number }): Landform & { tone: number } {
  const A = ABYSS, ds = s - centre - A.ahead, far = Math.hypot(x / (A.reach * 1.4), ds / A.reach);
  const weight = along * (1 - smoothRange(0.8, 1, far));
  if (weight <= 0) return ground;
  const side = ds > 0 ? 1 : 0;
  const lip = A.halfS * (1 + 0.1 * (zigzag(seed ^ 0xb4a1, x / 1.6, side) + 1) + 0.04 * zigzag(seed ^ 0xb4a2, x / 0.5, side));
  const open = 1 - crispStep((Math.abs(ds) / lip - 0.96) / 0.1 + 0.5);
  const floor = A.floor + (noise(seed ^ 0xb4c1, x * 0.3, s * 0.3) - 0.5) * 1.2;
  const height = mix(PLATEAU, floor, open);
  return {
    ...ground,
    height: clamp(mix(ground.height, height, weight), -9.5, 2.4),
    elevation: mix(ground.elevation, 1 - open, weight), channel: ground.channel * (1 - weight),
    pool: mix(ground.pool, open * 0.35, weight), veins: ground.veins * (1 - weight),
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Obsidian palette, linear RGB: near-black glass with a cold violet cast; the glow is the shader's (violet faults). */
export const UMBRA_PALETTE = {
  glass: linear(0x1c1a26), glassDark: linear(0x12101a), floor: linear(0x0c0a14),
} as const;

function umbraColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, _slope: number, _rim: number, out: [number, number, number]) {
  const P = UMBRA_PALETTE, fine = noise(row.seed ^ 0x53c1, x * 1.1, row.s * 1.1), tone = point.tone ?? 0.5;
  // Each shattered plate its own tone of black glass; the canyon depths go to the darkest glass.
  const deep = 1 - smoothRange(0.2, 0.9, point.elevation);
  for (let c = 0; c < 3; c++) {
    let value = mix(P.glass[c], P.glassDark[c], smoothRange(0.3, 0.8, tone) * 0.7);
    value = mix(value, P.floor[c], deep);
    out[c] = value * (0.92 + fine * 0.16);
  }
  return out;
}

/* ---------------------------------------------------------------- dressing */

/**
 * Obsidian dressing (kit: umbra-kit.glb and cliff-kit.glb, tools/blender/umbra_kit.py): spiky obsidian cliffs along every
 * crevasse lip; clusters of needle spires on the spike mountains and along the edges; shard clutter on the plateau;
 * floating cliffs over the wide crevasses, lost in the fog; and on open plateau the faction's structures (monolith
 * towers, shield pylons, eclipse gates, arc reactors, obelisks) with small platforms beside them. The boss arena keeps
 * only shards.
 */
function* umbraScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [];
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale > WORLD_HALF) return;
    const cap = TALL.has(instance.kind) ? UMBRA_SPIRE_MAX : UMBRA_SCENERY_MAX;
    if (instance.y + instance.height * spec.height > cap) instance = { ...instance, height: (cap - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  // Landmarks: the faction's structures on open plateau, well back from the crevasses, on a sparse site lattice.
  const LANDMARKS = ['umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk'] as const;
  // Scale and height of each structure, after the kit's comparison sheet with the concept (tools/blender/umbra_kit.py).
  const LANDMARK_SIZE: Readonly<Record<(typeof LANDMARKS)[number], readonly [number, number]>> = {
    umbMonolith: [3, 3.6], umbPylon: [2.6, 3.9], umbGate: [3.4, 4.4], umbReactor: [2.6, 3.1], umbObelisk: [1.8, 3.4],
  };
  const landmarks: { x: number; s: number; r: number }[] = [];
  for (let row = Math.floor(startS / SITE_ROW) - 1; row <= Math.ceil((startS + size) / SITE_ROW); row++) for (let lane = 0; lane < SITE_LANES.length; lane++) {
    const h = (k: number) => hash(seed ^ 0xb7d1, row * 7 + lane, k);
    if (h(0) > 0.42) continue;
    for (let tryIndex = 0; tryIndex < 8; tryIndex++) {
      const x = SITE_LANES[lane] + (h(1 + tryIndex) - 0.5) * 6, s = (row + 0.5 + (h(11 + tryIndex) - 0.5) * 0.6) * SITE_ROW;
      if (s < startS - 4 || s >= startS + size + 4) break;
      const m = umbraMasks(seed, x, s);
      if (m.plateau < 0.99 || m.across < 1.9 || m.massif > 0.25 || terrain.platform(x, s) > 0 || terrain.blocked(x, s) || terrain.slope(x, s) > 0.4) continue;
      const kind = LANDMARKS[Math.floor(h(30) * LANDMARKS.length)], ground = terrain.height(x, s), [base, tall] = LANDMARK_SIZE[kind];
      const scale = base * (0.9 + h(31) * 0.2), height = tall * (0.9 + h(32) * 0.2);
      landmarks.push({ x, s, r: KIT[kind].radius * scale + 0.6 });
      // The gate's and the reactor's arcs face the camera (their front is ±z), the others turn freely.
      const rotation = kind === 'umbGate' || kind === 'umbReactor' ? (h(33) < 0.5 ? 0 : Math.PI) + (h(36) - 0.5) * 0.3 : turn(h(33));
      add({ kind, x, s, y: ground - 0.06, scale, height, rotation, cosmetic: false }, h(34));
      // A platform or two beside it.
      for (let k = 0; k < 2; k++) {
        if (h(35 + k) < 0.4) continue;
        const a = turn(h(37 + k)), d = KIT[kind].radius * scale + 0.9, px = x + Math.cos(a) * d, ps = s + Math.sin(a) * d;
        if (terrain.slope(px, ps) > 0.3 || terrain.blocked(px, ps)) continue;
        add({ kind: 'umbPad', x: px, s: ps, y: terrain.height(px, ps) - 0.02, scale: 1 + h(39 + k) * 0.4, height: 1, rotation: turn(h(41 + k)), cosmetic: true }, h(43 + k));
      }
      break;
    }
  }
  const nearLandmark = (x: number, s: number) => landmarks.some(l => Math.hypot(l.x - x, l.s - s) < l.r);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0xb7c5, i * 43 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.blocked(x, s) || nearLandmark(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), pick = h(2), platform = terrain.platform(x, s);
    if (platform >= 0.3) {
      if (pick < 0.04) add({ kind: 'umbShards', x, s, y: ground - 0.03, scale: 0.8 + h(3) * 0.5, height: 0.8 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: true }, h(6));
      continue;
    }
    const m = umbraMasks(seed, x, s), plateau = m.plateau > 0.95, edge = plateau && drop > 1.2;
    if (plateau && m.massif > 0.25 && pick < 0.13 * m.massif) {
      // The hills: overlapping fractured massifs, larger and higher toward a region's heart.
      const scale = 2 + h(95) * 1.6, height = Math.max(1.5, scale * (0.75 + h(96) * 0.45) * (0.7 + 0.3 * m.massif));
      add({ kind: 'umbHill', x, s, y: ground - 0.1, scale, height, rotation: turn(h(97)), cosmetic: false }, h(98));
    } else if (plateau && m.massif > 0.1 && pick > 0.985) {
      // Sharp obsidian rocks on and around the hills (the kit's crags, authored about 1.8 wide and 1 high), as accents on
      // the plateau and the lower slopes: as high as about 0.8–1.2 times their width.
      const scale = 1.5 + h(91) * 1.0, height = scale * (1.6 + h(92) * 0.6);
      add({ kind: 'umbPeak', x, s, y: ground - 0.1, scale, height, rotation: turn(h(93)), cosmetic: false }, h(94));
    } else if (plateau && edge && slope < 0.6 && pick < 0.004) {
      // Now and then a lone needle spire at a canyon edge ("less spikey as a vibe and more cracked and sharp").
      const scale = 1.3 + h(54) * 0.5, tall = scale * (2 + h(60) * 0.5);
      add({ kind: 'umbSpire', x, s, y: ground - 0.06, scale, height: tall, rotation: turn(h(66)), cosmetic: false }, h(72));
    } else if (plateau && slope < 0.5 && pick > 0.96) {
      add({ kind: 'umbShards', x, s, y: ground - 0.03, scale: 0.8 + h(87) * 0.6, height: 0.7 + h(88) * 0.8, rotation: turn(h(89)), cosmetic: true }, h(90));
    }
  }
  // Floating cliffs over the wider crevasses, drifting at the plateau's level and below it into the fog.
  for (const seg of crevasseSegments(seed ^ SALT, startS, startS + size)) {
    const vx = seg.bx - seg.ax, vs = seg.bs - seg.as, length = Math.hypot(vx, vs);
    for (let t = 1, k = 0; t < length - 1; k++) {
      const h = (n: number) => hash(seed ^ 0xb7e1, seg.lane * 977 + seg.k * 31 + k, n);
      const half = seg.halfA + (seg.halfB - seg.halfA) * (t / length), x = seg.ax + vx * t / length, s = seg.as + vs * t / length;
      t += 3 + h(0) * 4;
      if (half < 1.5 || h(1) > 0.6 || s < startS || s >= startS + size || terrain.platform(x, s) > 0) continue;
      // Now and then the faction's crescent dock instead, a little higher.
      const dock = h(9) < 0.12 && half > 2.4;
      const scale = dock ? 2.4 + h(2) * 0.4 : Math.min(half * 0.7, 1.3 + h(2) * 0.3), depth = dock ? 2.2 : 1.4 + h(3) * 0.4;
      const top = dock ? PLATEAU + 0.2 : PLATEAU - 0.2 - h(4) * 1.6;
      add({ kind: dock ? 'umbDock' : 'umbFloat', x: x + (h(5) - 0.5) * half * 0.6, s, y: top - depth, scale, height: depth, rotation: turn(h(6)), cosmetic: !dock && h(7) > 0.7 }, h(8));
    }
  }
  // Obsidian cliff shards along the lips, sparsely: only in scattered stretches, about a quarter of the lips (user, 24
  // October: first "the cliffs look bad, can u remove the models there", then "now add the cliff models back but sparsely").
  const sparse = (x: number, s: number) => umbraMasks(seed, x, s).massif < 0.25 && noise(seed ^ 0xb7f1, x * 0.09, s * 0.07) > 0.62;
  for (const wall of yield* cliffWallSteps(seed, startS, size, terrain, {
    kind: 'voidWall', salt: 0x7c5e, minDrop: 1.5, rimSpan: 0.7, maxAway: 0.75, minRun: 3, scale: [1.2, 1.6],
    cap: UMBRA_SCENERY_MAX, accept: sparse, arenas: true,
    // The shards' tallest spikes stand a little over the lip (their bodies still reach it).
    overtop: 0.09,
  })) essential.push(wall);
  return [...essential, ...cosmetic];
}

export const UMBRA: PlanetProfile = {
  id: 'umbra', seaLevel: null,
  mood: () => 'eclipse', params: () => NEUTRAL, local: () => null,
  landform: umbraLandform,
  // The arena's ground is THE ECLIPSE's abyss, shaped in the landform (`abyss`).
  arena() { /* shaped in umbraLandform */ },
  color: umbraColor,
  shadowTint: [0.7, 0.66, 0.86],
  sceneryMax: UMBRA_SCENERY_MAX,
  settlement: () => null,
  scatter: umbraScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(), networks: false,
};
