import { NEUTRAL_MOOD, WORLD_HALF, bench, clamp, crispStep, hash, mix, noise, routeCalm, routeCenter, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaAt } from './terrain-arena';
import { cliffWallSteps } from './terrain-walls';
import { UMBRA, UMBRA_PLATEAU, UMBRA_SCENERY_MAX, UMBRA_SPIRE_MAX } from './terrain-umbra';

/*
 * CORONA, the Dying Star (docs/37; user, 5 November 2026, after art/concepts/corona/01-world): "A world so close to its
 * star that its surface is being torn apart. Not ordinary lava: vast oceans of radiant plasma, black magnetic structures
 * rising out of the light, and colossal glowing arcs crossing between the islands."
 *
 * After the concept: a sea of gold plasma about half the ground; black basalt islands standing out of it behind sheer
 * cliff walls, a winding causeway of basalt along the central route (broken now and then by a plasma crossing), tabular
 * mesas raised a tier or two over the islands, jagged black spires rising straight out of the plasma, and glowing cracks
 * through the rock, hottest toward the shore. THE HELIOPHAGE (THE ECLIPSE's rig, its placeholder) floats over the world's
 * own ground, its arena only levelled of mesas and tall dressing. Until Corona's own kit exists (stage 2) the dressing is Umbra's obsidian kit and cliff walls,
 * their glow burning the star's orange (src/render/terrain-kit.ts, glowHue). Pure functions of seed and position.
 */

/** The plateau (the islands' level; THE HELIOPHAGE's seat is measured from it, as THE ECLIPSE's). */
const PLATEAU = UMBRA_PLATEAU;
/** The plasma sea: 2.4 below the plateau, so the island cliffs stand well out of it. */
export const CORONA_SEA_LEVEL = PLATEAU - 2.4;
const SEA = CORONA_SEA_LEVEL;
/** Mesa tiers over the land (sheer-walled; the wall kit lines their faces as the coasts'). */
const MESA_STEP = 1.3, TIER_STEP = 1;
/**
 * Stepped land (user, 5 November: "make the terrain height vary more, like khepri"): a regional level from just over the
 * plasma (LOW) up about four units, cut into tiers STEP apart by sheer risers RISER wide (Khepri's and Vesper's `bench`);
 * the causeway keeps to the lower tiers, the boss arena to the plateau. TOP caps it all under the scenery cap.
 */
const LOW = PLATEAU - 0.4, RISE = 4, STEP = 1.1, RISER = 0.45, PROBE = 0.3, TOP = 2.3;
const NEUTRAL: MoodParams = NEUTRAL_MOOD;
const TALL: ReadonlySet<string> = new Set(['clump', 'column', 'spire', 'corExtractor', 'corCollector', 'corHangar', 'corRefinery', 'corGantry', 'corDome']);
/** Landmark site lattice (Corona's infrastructure kit, tools/blender/corona_kit.py). */
const SITE_ROW = 22, SITE_LANES = [-7.5, 0, 7.5];

/* ---------------------------------------------------------------- masks */

export interface CoronaMasks {
  /** Soft land mask (colour and scatter) and the crisp coast that shapes the height. */ land: number; edge: number;
  /** 0 at the shore … 1 a couple of units inland. */ inland: number;
  /** Mesa and its second tier, 0 … 1 each (crisp). */ mesa: number; tier: number;
  calm: number;
}
export function coronaMasks(seed: number, x: number, s: number, platform = 0): CoronaMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xc1a1, x * 0.04, s * 0.035) - 0.5) * 12, qs = s + (noise(seed ^ 0xc1a2, x * 0.04 + 5.3, s * 0.035) - 0.5) * 12;
  let mass = noise(seed ^ 0xc1a3, qx * 0.055, qs * 0.05) * 0.5 + noise(seed ^ 0xc1a4, qx * 0.15, qs * 0.14) * 0.33 + noise(seed ^ 0xc1a5, qx * 0.42, qs * 0.4) * 0.17;
  // The causeway: the central route stays basalt for long stretches, broken now and then by a plasma crossing.
  const d = (x - routeCenter(seed, 1, s)) / 3.6, keep = smoothRange(0.18, 0.4, noise(seed ^ 0xc1a6, s * 0.025, 1.7));
  mass += Math.exp(-d * d) * 0.34 * keep;
  // About half the ground is plasma. The boss arena keeps the world's own ground (user, 5 November: "no need for a special
  // lava only lake for the boss, he will float anyway"); only its mesas are levelled (below), so none rises into the hull.
  const threshold = 0.49;
  const land = smoothRange(-1, 1, (mass - threshold) / 0.012), edge = crispStep((mass - threshold) / 0.02 + 0.5);
  const inland = smoothRange(0.02, 0.12, mass - threshold);
  // Mesas: tabular blocks over the islands' cores, never on the causeway.
  const field = noise(seed ^ 0xc1b1, qx * 0.08, qs * 0.075) * 0.75 + noise(seed ^ 0xc1b2, qx * 0.22, qs * 0.2) * 0.25;
  const core = smoothRange(0.05, 0.1, mass - threshold) * (1 - smoothRange(0.25, 0.5, calm)) * (1 - platform);
  const mesa = crispStep((field - 0.58) / 0.025 + 0.5) * core, tier = crispStep((field - 0.69) / 0.025 + 0.5) * mesa;
  return { land, edge, inland, mesa, tier, calm };
}

/** Basalt plates about 3.6 across, each tilted a hair its own way and its own tone; the cracks are the shader's. */
function plates(seed: number, x: number, s: number): { offset: number; tone: number } {
  const size = 3.6, gx = Math.floor(x / size), gs = Math.floor(s / size);
  let f1 = 99, id = 0, cx = 0, cs = 0;
  for (let dx = -1; dx <= 1; dx++) for (let ds = -1; ds <= 1; ds++) {
    const px = (gx + dx + hash(seed ^ 0xc2a1, gx + dx, gs + ds)) * size, ps = (gs + ds + hash(seed ^ 0xc2a2, gx + dx, gs + ds)) * size;
    const d = Math.hypot(x - px, s - ps);
    if (d < f1) { f1 = d; cx = px; cs = ps; id = hash(seed ^ 0xc2a3, gx + dx, gs + ds); }
  }
  const tilt = id * 6.283, lean = 0.03 * hash(seed ^ 0xc2a4, Math.round(cx * 7), Math.round(cs * 7));
  return { offset: ((x - cx) * Math.cos(tilt) + (s - cs) * Math.sin(tilt)) * lean, tone: id };
}

/** The smooth regional land level the tiers are cut from (world height), with fine jag so the risers wander into spurs. */
function landLevel(seed: number, x: number, s: number, platform: number): number {
  const qx = x + (noise(seed ^ 0xc1d3, x * 0.03, s * 0.026) - 0.5) * 14, qs = s + (noise(seed ^ 0xc1d4, x * 0.03 + 3.3, s * 0.026) - 0.5) * 14;
  const field = noise(seed ^ 0xc1d1, qx * 0.05, qs * 0.045) * 0.6 + noise(seed ^ 0xc1d2, qx * 0.13, qs * 0.12) * 0.3 + noise(seed ^ 0xc1d5, qx * 0.3, qs * 0.28) * 0.1;
  const calm = routeCalm(seed, x, s);
  const level = LOW + smoothRange(0.25, 0.8, field) * RISE * (1 - calm * 0.55);
  return mix(level, PLATEAU, platform) + (noise(seed ^ 0xc1d6, x * 0.35, s * 0.32) - 0.5) * 0.35;
}

/** Corona's ground: the plasma seabed, stepped basalt land behind sheer cliffs, mesas over it. */
export function coronaLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const platform = arenaAt(row.arena, seed, x, s), m = coronaMasks(seed, x, s, platform), plate = plates(seed, x, s);
  const seabed = SEA - 0.9 - noise(seed ^ 0xc1c1, x * 0.07, s * 0.06) * 1.2;
  const lift = (m.mesa * MESA_STEP + m.tier * TIER_STEP) * (0.9 + 0.2 * noise(seed ^ 0xc1c2, x * 0.05, s * 0.05));
  let top = PLATEAU;
  if (m.edge > 0) {
    const level = landLevel(seed, x, s, platform);
    const gx = (landLevel(seed, x + PROBE, s, platform) - level) / PROBE, gs = (landLevel(seed, x, s + PROBE, platform) - level) / PROBE;
    const phase = noise(seed ^ 0xc1d7, x * 0.02 + 1.3, s * 0.018) * STEP;
    // (The bench floors a level up to a step down: the lowest tier stays LOW, well clear of the plasma's heat haze.)
    top = clamp(bench(level, Math.hypot(gx, gs), STEP, phase, RISER, 0.95), LOW, TOP) + plate.offset;
    top = Math.min(TOP, top + lift * (1 - platform));
  }
  // Glowing cracks (two crossing families of jagged lines, as Umbra's faults), present everywhere on the rock and
  // densest toward the shore, where the plasma's heat splits it.
  const wx = x + (noise(seed ^ 0xc1e1, x * 0.3, s * 0.3) - 0.5) * 2 + (noise(seed ^ 0xc1e2, x * 1.6, s * 1.6) - 0.5) * 0.5;
  const ws = s + (noise(seed ^ 0xc1e3, x * 0.3, s * 0.3) - 0.5) * 2 + (noise(seed ^ 0xc1e4, x * 1.6, s * 1.6) - 0.5) * 0.5;
  const vein = (noise(seed ^ 0xc1e5, wx * 0.5, ws * 0.4) - 0.5) / 0.14, vein2 = (noise(seed ^ 0xc1e6, wx * 0.4 + 3.1, ws * 0.55) - 0.5) / 0.15;
  const heat = 1 - smoothRange(0.1, 0.9, m.inland);
  const veins = clamp(smoothRange(0.58, 0.72, noise(seed ^ 0xc1e7, x * 0.08, s * 0.07)) * 0.6 + heat * 0.7) * m.land;
  const ground: Landform & { tone: number } = {
    height: clamp(mix(seabed, top, m.edge), -7, 2.4),
    elevation: m.edge * (0.55 + 0.45 * smoothRange(LOW, TOP, top)), channel: 0, pool: 0,
    vein, vein2, veins, tone: plate.tone,
  };
  return ground;
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Basalt palette, linear RGB (concept: charcoal basalt, near-black in its plates' seams, heat-scorched at the shore). */
export const CORONA_PALETTE = {
  basalt: linear(0x5c5550), basaltDark: linear(0x3a3532), scorch: linear(0x4e3022), seabed: linear(0x140c08),
} as const;

function coronaColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, _slope: number, _rim: number, out: [number, number, number]) {
  const P = CORONA_PALETTE, fine = noise(row.seed ^ 0xc07a, x * 1.1, row.s * 1.1), tone = point.tone ?? 0.5;
  const shore = 1 - smoothRange(0.35, 0.6, point.elevation), under = 1 - smoothRange(0.05, 0.3, point.elevation);
  for (let c = 0; c < 3; c++) {
    let value = mix(P.basalt[c], P.basaltDark[c], smoothRange(0.3, 0.8, tone) * 0.75);
    value = mix(value, P.scorch[c], shore * 0.5);
    value = mix(value, P.seabed[c], under);
    out[c] = value * (0.88 + fine * 0.24);
  }
  return out;
}

/* ---------------------------------------------------------------- dressing */

/**
 * Corona's dressing: Khepri's basalt kit, charcoal (columnar walls along every coast, tier riser and mesa face; column
 * clusters standing out of the plasma, more of them near the shores; column crowns on the mesa rims; boulders, fallen
 * columns and rocks on the open rock), and here and there one of Corona's own infrastructure modules (corona-kit.glb)
 * on level rock. The boss arena keeps only rocks.
 */
function* coronaScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
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
  const LANDMARKS = ['corExtractor', 'corCollector', 'corHangar', 'corRefinery', 'corGantry', 'corDome'] as const;
  // Scale (footprint) and height of each module: about three units across, as tall as the concept has them.
  const LANDMARK_SIZE: Readonly<Record<(typeof LANDMARKS)[number], readonly [number, number]>> = {
    corExtractor: [2.2, 2.6], corCollector: [2.2, 3.3], corHangar: [2, 1.3], corRefinery: [2.1, 2.5], corGantry: [2, 2.1], corDome: [2.1, 2],
  };
  // A footprint fully on level rock (no coast, no mesa face under any part of it); the base sinks a hair into the lowest point.
  const supportedBase = function* (kind: keyof typeof KIT, x: number, s: number, scale: number, rotation: number): Work<number | null> {
    const spec = KIT[kind], hx = spec.halfX * scale + .12, hz = spec.halfZ * scale + .12;
    const nx = Math.ceil(hx * 2 / .3), nz = Math.ceil(hz * 2 / .3), c = Math.cos(rotation), sn = Math.sin(rotation);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= nx; i++) {
      if (i % 3 === 0) yield;
      for (let j = 0; j <= nz; j++) {
        const dx = -hx + hx * 2 * i / nx, dz = -hz + hz * 2 * j / nz;
        const px = x + c * dx + sn * dz, ps = s + sn * dx - c * dz;
        if (Math.abs(px) > WORLD_HALF || coronaMasks(seed, px, ps).edge < .999 || terrain.platform(px, ps) > 0 || terrain.blocked(px, ps)) return null;
        const y = terrain.height(px, ps);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        if (hi - lo > .22) return null;
      }
    }
    return lo - .045;
  };
  const landmarks: { x: number; s: number; r: number }[] = [];
  for (let row = Math.floor(startS / SITE_ROW) - 1; row <= Math.ceil((startS + size) / SITE_ROW); row++) for (let lane = 0; lane < SITE_LANES.length; lane++) {
    const h = (k: number) => hash(seed ^ 0xc7d1, row * 7 + lane, k);
    if (h(0) > 0.48) continue;
    for (let tryIndex = 0; tryIndex < 8; tryIndex++) {
      const x = SITE_LANES[lane] + (h(1 + tryIndex) - 0.5) * 6, s = (row + 0.5 + (h(11 + tryIndex) - 0.5) * 0.6) * SITE_ROW;
      if (s < startS - 4 || s >= startS + size + 4) break;
      const m = coronaMasks(seed, x, s);
      if (m.inland < 0.9 || m.mesa > 0.05 || terrain.platform(x, s) > 0 || terrain.blocked(x, s) || terrain.slope(x, s) > 0.4) continue;
      const kind = LANDMARKS[Math.floor(h(30) * LANDMARKS.length)], [base, tall] = LANDMARK_SIZE[kind];
      const scale = base * (0.9 + h(31) * 0.2), height = tall * (0.9 + h(32) * 0.2);
      // Modules face the camera, give or take a little (their fronts, the extractor's star and the collector's fans, read best).
      const rotation = (h(36) - 0.5) * 0.5;
      const baseY = yield* supportedBase(kind, x, s, scale, rotation);
      if (baseY === null) continue;
      landmarks.push({ x, s, r: KIT[kind].radius * scale + 0.6 });
      add({ kind, x, s, y: baseY, scale, height, rotation, cosmetic: false }, h(34));
      break;
    }
  }
  const nearLandmark = (x: number, s: number) => landmarks.some(l => Math.hypot(l.x - x, l.s - s) < l.r);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0xc7c5, i * 43 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.blocked(x, s) || nearLandmark(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), pick = h(2), platform = terrain.platform(x, s);
    if (platform >= 0.3) {
      if (ground > SEA && pick < 0.03) add({ kind: 'rock', x, s, y: ground - 0.05, scale: 0.6 + h(3) * 0.4, height: 0.6 + h(4) * 0.4, rotation: turn(h(5)), cosmetic: true }, h(6));
      continue;
    }
    const m = coronaMasks(seed, x, s);
    if (ground < SEA - 0.2) {
      // In the plasma: jagged spires near the shores (the concept's black pillars rising out of the light) and small islets.
      const nearShore = terrain.rise(x, s) > 1.2;
      if (pick < (nearShore ? 0.016 : 0.006)) {
        // A cluster now and then: a tall pillar with a shorter one or two leaning beside it.
        // Khepri's basalt (user, 5 November: "couldnt you use khepris basalt columns"), charcoal here: column clusters and
        // lone columns standing out of the light, tall enough to read from the flight plane.
        const base = SEA - 0.5, clump = h(61) < 0.6, scale = clump ? 1 + h(54) * 0.6 : 1.2 + h(54) * 0.6, tall = 3.2 + h(60) * 2.6;
        add({ kind: clump ? 'clump' : h(62) < 0.5 ? 'column' : 'spire', x, s, y: base, scale, height: tall, rotation: turn(h(66)), cosmetic: false }, h(72));
        if (h(73) < 0.5) {
          const a = turn(h(74)), d = 0.8 + h(75) * 0.5;
          add({ kind: 'column', x: x + Math.cos(a) * d, s: s + Math.sin(a) * d, y: base, scale: 1 + h(79) * 0.4, height: tall * (0.5 + h(76) * 0.25), rotation: turn(h(77)), cosmetic: true }, h(78));
        }
      }
      continue;
    }
    if (m.edge < 0.95) continue;
    const rim = drop > 0.9;
    if (rim && m.mesa > 0.5 && pick < 0.02) {
      // Crags and spires crowning the mesa rims.
      const clump = h(91) < 0.6, scale = clump ? 0.9 + h(92) * 0.5 : 1 + h(92) * 0.4, height = clump ? 0.9 + h(93) * 0.7 : 1.2 + h(93) * 0.9;
      add({ kind: clump ? 'clump' : 'column', x, s, y: ground - 0.08, scale, height, rotation: turn(h(94)), cosmetic: false }, h(95));
    } else if (rim && m.mesa < 0.1 && slope < 0.6 && pick < 0.005) {
      const scale = 1 + h(54) * 0.5, tall = 1.6 + h(60) * 1.2;
      add({ kind: 'spire', x, s, y: ground - 0.06, scale, height: tall, rotation: turn(h(66)), cosmetic: false }, h(72));
    } else if (slope < 0.5 && m.calm < 0.35 && pick > 0.985 - 0.02 * (1 - m.inland)) {
      // Broken basalt blocks: low crags, more of them toward the shore where the rock is splitting.
      const fallen = h(86) < 0.4, scale = 0.7 + h(87) * 0.6;
      add({ kind: fallen ? 'fallen' : 'boulder', x, s, y: ground - 0.08, scale, height: scale * (0.7 + h(88) * 0.4), rotation: turn(h(89)), cosmetic: true }, h(90));
    } else if (slope < 0.5 && pick > 0.965) {
      add({ kind: 'rock', x, s, y: ground - 0.05, scale: 0.5 + h(87) * 0.5, height: 0.5 + h(88) * 0.5, rotation: turn(h(89)), cosmetic: true }, h(90));
    }
  }
  // Khepri's columnar basalt walls along the coasts, tier risers and mesa faces: the islands stand out of the plasma
  // behind sheer columnar cliffs, as in the concept.
  for (const wall of yield* cliffWallSteps(seed, startS, size, terrain, {
    kind: 'cliffWall', salt: 0x7c5f, minDrop: 0.8, sea: SEA, cap: UMBRA_SCENERY_MAX, arenas: true, footDepth: 1,
  })) essential.push(wall);
  return [...essential, ...cosmetic];
}

export const CORONA: PlanetProfile = {
  ...UMBRA,
  id: 'corona', seaLevel: CORONA_SEA_LEVEL,
  mood: () => 'corona', params: () => NEUTRAL, local: () => null,
  landform: coronaLandform,
  color: coronaColor,
  // Warm shade: shadows stay umber in the star's light.
  shadowTint: [0.8, 0.74, 0.72],
  // Crisp cliffs: hard rim creases and per-face wall shading (the concept's sharp basalt), as Khepri's.
  cliffs: true,
  scatter: coronaScatterSteps,
};
