import { NEUTRAL_MOOD, WORLD_HALF, clamp, hash, mix, noise, routeCalm, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type KitKind, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaWeight, type TerrainArena } from './terrain-arena';

/**
 * Nacre, the Luminous Mire (docs/03 §1, docs/20), after the middle panel of art/concepts/01-worlds-direction.png:
 * indigo water with violet algae winding between ragged islands of dark moss; massifs of jagged black faceted rock
 * rising from them; a dense glowing jungle of lotus caps, glass tubes and violet goblets; lily rafts in the
 * shallows; and the ruins of the mire's builders (monolith towers, fortresses, ring platforms, conduit bridges,
 * drowned pillars). About half land. Every piece is a Blender node of nacre-kit.glb (art/nacre-kit/README.md).
 * Pure functions of seed and world coordinates.
 */
export const NACRE_SEA_LEVEL = -0.6;
const SEA = NACRE_SEA_LEVEL;
/** Scenery cap: the same clearance under the flight plane (3.8) as Vesper's, so towers and crags can stand tall. */
export const NACRE_SCENERY_MAX = 3.0;
const NEUTRAL: MoodParams = NEUTRAL_MOOD;

/* ---------------------------------------------------------------- masks */

export interface NacreMasks {
  /** 0 open water … 1 solid island. */ land: number;
  /** Craggy black rock massif weight (the mountains). */ rock: number;
  /** Bioluminescent moss patches (colour, speckle glow and flora density). */ glow: number;
  /** Low jungle ground (dense flora) between the shore and the crags. */ grove: number;
}
const ridged = (value: number) => { const r = 1 - Math.abs(2 * value - 1); return r * r; };
/** Nacre's masks at a point, shared by landform, colour and scatter. An arena weight opens the water. */
export function nacreMasks(seed: number, x: number, s: number, platform = 0): NacreMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xb1a1, x * 0.05, s * 0.045) - 0.5) * 10, qs = s + (noise(seed ^ 0xb1a2, x * 0.05 + 3.3, s * 0.045) - 0.5) * 10;
  // Ragged coasts: broad island masses, smaller lobes and a fine fringe of inlets and spits.
  const mass = noise(seed ^ 0xb1a3, qx * 0.12, qs * 0.105) * 0.5 + noise(seed ^ 0xb1a4, qx * 0.29, qs * 0.26) * 0.3
    + noise(seed ^ 0xb1a5, qx * 0.7, qs * 0.66) * 0.13 + noise(seed ^ 0xb1b0, x * 1.7, s * 1.6) * 0.07;
  // Islands where the mass clears ~0.53 (about half land; raised over an arena so the mire opens around the boss).
  const threshold = mix(0.53, 1.3, platform);
  let land = smoothRange(-1, 1, (mass - threshold) / 0.03);
  // Winding channels cut through bigger islands.
  const channel = 1 - smoothRange(0.015, 0.05, Math.abs(noise(seed ^ 0xb1a6, qx * 0.07, qs * 0.065) - 0.5));
  land *= 1 - channel * 0.9;
  // Massifs rise from the island interiors (how far inland: mass above the threshold), calmer near the routes.
  const inland = smoothRange(threshold + 0.01, threshold + 0.1, mass);
  // (Version 16: more of the islands carry a massif; 0.3–0.52 before.)
  const rock = inland * smoothRange(0.24, 0.46, noise(seed ^ 0xb1a7, x * 0.09, s * 0.08)) * land * (1 - calm * 0.3);
  const glow = smoothRange(0.45, 0.7, noise(seed ^ 0xb1a8, x * 0.2 + 7.7, s * 0.19));
  const grove = land * (1 - rock) * smoothRange(0.3, 0.55, noise(seed ^ 0xb1a9, x * 0.13 + 1.9, s * 0.12));
  return { land, rock, glow, grove };
}

/**
 * Mire ground: a shallow indigo bed under the water, low mossy shelves at the shores, and black rock massifs
 * stepping up in broken ledges from the island interiors (the crag pieces stand on them). `tone` carries the moss
 * glow (the speckles themselves are moss-tuft pieces).
 */
export function nacreLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const m = nacreMasks(seed, x, s, row.arena ? Math.max(arenaWeight(row.arena, s), row.platform) : row.platform);
  const bed = SEA - 0.45 - noise(seed ^ 0xb1aa, x * 0.09, s * 0.08) * 0.8;
  const crag = ridged(noise(seed ^ 0xb1ad, x * 0.2, s * 0.18)) * 0.6 + ridged(noise(seed ^ 0xb1ae, x * 0.5, s * 0.46)) * 0.4;
  const shore = SEA + 0.1 + noise(seed ^ 0xb1ab, x * 0.15, s * 0.14) * 0.22 + (noise(seed ^ 0xb1ac, x * 0.9, s * 0.9) - 0.5) * 0.08;
  // Version 16 (user, 21 October: "more elevation changes and mountains"): the massifs are real mountains of rock, up to
  // about three units over the shore in stacked ledges (0.8 before), with the crags standing on them; the islands roll
  // in low hills between them.
  let peak = Math.pow(m.rock, 0.6) * (0.6 + crag * 2.8);
  // Broken ledges: heights snap toward steps of 0.35, so the rock ground reads as stacked ledges, not smooth hills.
  const stepped = Math.floor(peak / 0.35) * 0.35 + smoothRange(0.65, 1, (peak / 0.35) % 1) * 0.35;
  peak = mix(peak, stepped, 0.75);
  const hills = smoothRange(0.35, 0.8, noise(seed ^ 0xb1af, x * 0.11, s * 0.1)) * 0.75 * smoothRange(0.2, 0.9, m.land) * (1 - m.rock);
  const moss = m.land * (1 - m.rock) * m.glow;
  return {
    height: clamp(mix(bed, shore + hills + peak, m.land), -4, 2.4), elevation: m.land, channel: m.rock,
    pool: 0, vein: 99, vein2: 99, veins: 0, tone: moss,
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Mire palette, linear RGB (concept: black crags with blue-lit rims, dark green-teal moss with glow, violet moss). */
export const NACRE_PALETTE = {
  moss: linear(0x1b3b33), mossViolet: linear(0x2c2650), teal: linear(0x24605a), rock: linear(0x1b202c), rockLit: linear(0x3a4a68),
  mud: linear(0x161428), bed: linear(0x121858),
} as const;

function nacreColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = NACRE_PALETTE, { seed, s } = row;
  if (point.height < SEA) {
    const depth = smoothRange(0, 1.5, SEA - point.height);
    for (let c = 0; c < 3; c++) out[c] = mix(P.mud[c], P.bed[c], depth) * 0.8;
    return out;
  }
  const patch = noise(seed ^ 0x52b1, x * 0.14, s * 0.12), fine = noise(seed ^ 0x52b2, x * 1.4, s * 1.4);
  const steep = smoothRange(0.5, 1.4, slope), shore = 1 - smoothRange(0, 0.25, point.height - SEA), glow = point.tone ?? 0, crag = point.channel;
  for (let c = 0; c < 3; c++) {
    let value = mix(P.moss[c], P.mossViolet[c], smoothRange(0.38, 0.72, patch));
    value = mix(value, P.teal[c], glow * 0.6);
    value = mix(value, P.mud[c], shore * 0.55);
    // Crags: near-black faceted rock; rims and ledge tops catch a cold blue light.
    // (Version 16: ridges and ledge tops catch more of the light, so the taller massifs read in the dark.)
    const rock = mix(P.rock[c], P.rockLit[c], Math.min(1, rim * 1.2 + (1 - steep) * 0.3));
    value = mix(value, rock, Math.max(steep * 0.9, crag * 0.8));
    out[c] = value * (0.88 + fine * 0.24);
  }
  return out;
}

/* ---------------------------------------------------------------- scatter */

/** Ruin-site lattice: rows along s, three lanes across the 30-unit world. */
const SITE_ROW = 13, SITE_LANES = 3;
/** Jittered-grid cells of the big-piece passes (crags and rock; flora). */
const CRAG_CELL = 1.5, FLORA_CELL = 1.35;
interface Disc { x: number; s: number; r: number }

/**
 * Nacre dressing after the concept, in four passes (each yields per row for the streaming budget):
 * 1. ruin sites: a sanctuary (monolith tower bridged to a ring platform), a fortress with a conduit bridge to a
 *    tower, a lone tower among broken pillars, or drowned pillars; small gardens and rubble around them;
 * 2. massifs: jagged crags packed on the rock mask, rock clusters on their margins, on the islands and in the shallows;
 * 3. jungle: lotus groves, lotus caps, glass tubes and violet goblets on the low ground and at the shores;
 * 4. cover: lily rafts in the shallows, moss tufts with glowing speckles at rock feet, shores and moss patches.
 * Ruins are scenery only (never cover or targets). Arenas stay clear.
 */
export function* nacreScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [], CAP = NACRE_SCENERY_MAX;
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number, shade?: number, variant?: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale > WORLD_HALF) return false;
    if (instance.y + instance.height * spec.height > CAP) instance = { ...instance, height: (CAP - instance.y) / spec.height };
    if (instance.height <= 0.05) return false;
    const placed: KitInstance = { ...instance, variant: variant ?? Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: shade ?? terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
    return true;
  };
  const turn = (pick: number) => pick * Math.PI * 2;
  /** Glowing flora keeps most of its light in shade (instance tint multiplies the emitted colour). */
  const glowShade = (x: number, s: number) => 0.7 + 0.3 * terrain.shade(x, s);
  const open = (x: number, s: number) => terrain.platform(s) === 0 && !terrain.blocked(x, s);
  /** Lowest ground under a footprint (centre and four points at `r`), so pieces never float on slopes. */
  const floor = (x: number, s: number, r: number) => Math.min(terrain.height(x, s), terrain.height(x + r, s), terrain.height(x - r, s), terrain.height(x, s + r), terrain.height(x, s - r));
  const ruins: Disc[] = [], big: Disc[] = [];
  const hits = (list: Disc[], x: number, s: number, r: number, slack = 1) => list.some(d => (d.x - x) ** 2 + (d.s - s) ** 2 < ((d.r + r) * slack) ** 2);

  // 1. Ruin sites (sampled one row beyond the section on both sides so a bridge's partner is known).
  for (let j = Math.floor((startS - SITE_ROW) / SITE_ROW); j <= Math.ceil((startS + size) / SITE_ROW); j++) {
    for (let i = 0; i < SITE_LANES; i++) {
      const h = (k: number) => hash(seed ^ 0x7d5f, i * 97 + k, j);
      if (h(0) > 0.8) continue;
      const lane = WORLD_HALF * 2 / SITE_LANES;
      const style = h(1);
      const drowned = style > 0.86;
      let site: { x: number; s: number; base: number } | undefined;
      for (let probe = 0; probe < 8 && !site; probe++) {
        const x = -WORLD_HALF + (i + 0.2 + h(2 + probe * 2) * 0.6) * lane, s = (j + 0.15 + h(3 + probe * 2) * 0.7) * SITE_ROW;
        if (!open(x, s)) continue;
        const y = terrain.height(x, s), lo = floor(x, s, 0.8), hi = Math.max(y, terrain.height(x + 0.8, s), terrain.height(x - 0.8, s), terrain.height(x, s + 0.8), terrain.height(x, s - 0.8));
        if (drowned ? y > SEA - 0.15 || y < SEA - 1.1 : y < SEA - 0.75 || hi - lo > 0.4 || y > SEA + 0.9) continue;
        site = { x, s, base: drowned ? y : Math.max(SEA - 0.1, hi - 0.04) };
      }
      if (!site) continue;
      const { x, s, base } = site, facing = (h(20) - 0.5) * 0.9;
      const garden = (cx: number, cs: number, radius: number, count: number) => {
        for (let k = 0; k < count; k++) {
          const a = turn(h(40 + k)), d = radius + h(50 + k) * 0.7, tx = cx + Math.cos(a) * d, ts = cs + Math.sin(a) * d, y = terrain.height(tx, ts);
          if (!open(tx, ts) || y < SEA - 0.35) continue;
          const kind: KitKind = k % 3 === 0 ? 'glassTube' : k % 3 === 1 ? 'goblet' : 'lotus';
          const height = kind === 'lotus' ? 0.9 + h(60 + k) * 0.6 : 0.6 + h(60 + k) * 0.5, scale = 0.75 + h(70 + k) * 0.35;
          // Gardens grow up to the ruins, never through a plinth.
          if (hits(ruins, tx, ts, KIT[kind].halfX * scale * 0.8)) continue;
          add({ kind, x: tx, s: ts, y: Math.max(SEA - 0.1, y) - 0.04, scale, height, rotation: turn(h(80 + k)), cosmetic: false }, h(90 + k), glowShade(tx, ts));
        }
      };
      if (drowned) {
        // Drowned ruins: broken pillars and rubble rising from the shallows.
        ruins.push({ x, s, r: 0.8 });
        add({ kind: 'ruinPillars', x, s, y: base, scale: 0.95 + h(21) * 0.25, height: SEA - base + 1.1 + h(22) * 0.8, rotation: facing, cosmetic: false }, h(23));
        const rx = x + (h(24) - 0.5) * 2.4, rs = s + 1 + h(25);
        if (open(rx, rs) && terrain.height(rx, rs) > SEA - 0.9) add({ kind: 'ruinRubble', x: rx, s: rs, y: Math.max(terrain.height(rx, rs), SEA - 0.25), scale: 1, height: 1, rotation: turn(h(26)), cosmetic: false }, h(27));
        continue;
      }
      if (style < 0.42) {
        // Sanctuary: a monolith tower bridged to a ring platform (or a second, broken tower).
        const towerHeight = 2.7 + h(21) * 0.5, a = facing + (h(22) < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (h(23) - 0.5) * 0.6, span = 4.5;
        ruins.push({ x, s, r: 1.25 });
        add({ kind: 'ruinTower', x, s, y: base, scale: 1.15, height: towerHeight, rotation: facing, cosmetic: false }, 0, undefined, h(24) < 0.12 ? 1 : 0);
        const px = x + Math.sin(a) * span, ps = s - Math.cos(a) * span;
        const partnerGround = terrain.height(px, ps);
        if (Math.abs(px) < WORLD_HALF - 1.4 && open(px, ps) && partnerGround > SEA - 0.6 && partnerGround < base + 0.3) {
          const ring = h(25) < 0.65;
          ruins.push({ x: px, s: ps, r: 1.2 });
          if (ring) add({ kind: 'ruinRing', x: px, s: ps, y: base - 0.02, scale: 1, height: 1, rotation: turn(h(26)), cosmetic: false }, h(27));
          else add({ kind: 'ruinTower', x: px, s: ps, y: base, scale: 0.9, height: towerHeight * 0.8, rotation: facing, cosmetic: false }, 0, undefined, 1);
          const mx = (x + px) / 2, ms = (s + ps) / 2;
          ruins.push({ x: mx, s: ms, r: 0.7 });
          add({ kind: 'ruinBridge', x: mx, s: ms, y: base, scale: (span - 2) / 3 + 0.12, height: 1, rotation: a, cosmetic: false }, h(28), undefined, h(29) < 0.3 ? 1 : 0);
        }
        garden(x, s, 1.5, 6);
      } else if (style < 0.62) {
        // Fortress with a conduit bridge east to a tower or pillars.
        ruins.push({ x, s, r: 1.65 });
        add({ kind: 'ruinFort', x, s, y: base, scale: 1, height: 2.5 + h(21) * 0.4, rotation: facing * 0.5, cosmetic: false }, h(22));
        const px = x + 4.6 * Math.cos(facing * 0.5), ps = s + 4.6 * Math.sin(facing * 0.5);
        if (Math.abs(px) < WORLD_HALF - 1.2 && open(px, ps) && terrain.height(px, ps) > SEA - 0.6) {
          const pBase = Math.max(SEA - 0.08, terrain.height(px, ps) - 0.04);
          ruins.push({ x: px, s: ps, r: 1 }, { x: (x + px) / 2 + 0.4, s: (s + ps) / 2, r: 0.7 });
          if (h(23) < 0.6) add({ kind: 'ruinTower', x: px, s: ps, y: pBase, scale: 0.85, height: 2.4 + h(24) * 0.5, rotation: facing, cosmetic: false }, 0, undefined, h(25) < 0.25 ? 1 : 0);
          else add({ kind: 'ruinPillars', x: px, s: ps, y: pBase, scale: 1.1, height: 1.2 + h(24) * 0.6, rotation: facing, cosmetic: false }, h(25));
          add({ kind: 'ruinBridge', x: (x + px) / 2 + 0.35 * Math.cos(facing * 0.5), s: (s + ps) / 2 + 0.35 * Math.sin(facing * 0.5), y: base, scale: 0.95, height: 1,
            rotation: Math.PI / 2 + facing * 0.5, cosmetic: false }, h(26), undefined, h(27) < 0.35 ? 1 : 0);
        }
        garden(x, s, 1.9, 7);
      } else {
        // A lone monolith (often broken) among broken pillars and rubble.
        ruins.push({ x, s, r: 1.1 });
        add({ kind: 'ruinTower', x, s, y: base, scale: 1.05 + h(21) * 0.15, height: 2.6 + h(22) * 0.7, rotation: facing, cosmetic: false }, 0, undefined, h(23) < 0.3 ? 1 : 0);
        const a = turn(h(24)), px = x + Math.cos(a) * 2.2, ps = s + Math.sin(a) * 2.2;
        if (open(px, ps) && terrain.height(px, ps) > SEA - 0.9) {
          ruins.push({ x: px, s: ps, r: 0.7 });
          add({ kind: h(25) < 0.5 ? 'ruinPillars' : 'ruinRubble', x: px, s: ps, y: Math.max(SEA - 0.25, terrain.height(px, ps) - 0.04), scale: 1, height: 0.9 + h(26) * 0.6, rotation: facing, cosmetic: false }, h(27));
        }
        garden(x, s, 1.4, 5);
      }
    }
  }
  yield;

  // 2. Massifs: crags packed on the rock mask, rock clusters on their margins, on islands and in the shallows.
  for (let j = Math.floor(startS / CRAG_CELL); j < Math.ceil((startS + size) / CRAG_CELL); j++) {
    for (let i = 0; i < Math.ceil(WORLD_HALF * 2 / CRAG_CELL); i++) {
      const h = (k: number) => hash(seed ^ 0x6c31, i * 53 + k, j);
      const x = -WORLD_HALF + (i + 0.15 + h(0) * 0.7) * CRAG_CELL, s = (j + 0.15 + h(1) * 0.7) * CRAG_CELL;
      if (s < startS || s >= startS + size || !open(x, s) || hits(ruins, x, s, 0.6)) continue;
      const ground = terrain.height(x, s), m = nacreMasks(seed, x, s), pick = h(2);
      if (m.rock > 0.15 && ground > SEA + 0.05) {
        // Crags gather in heaps (a cluster field) and stand tallest on the massif's high core.
        const p = smoothRange(0.12, 0.5, m.rock) * smoothRange(0.2, 0.5, noise(seed ^ 0x6c32, x * 0.3, s * 0.28));
        const core = smoothRange(0.25, 0.7, m.rock);
        if (pick < 0.7 * p + 0.08 * core && !hits(big, x, s, 0.5)) {
          // Now and then a landmark spire on the massif core rises to the scenery cap.
          const scale = 0.9 + h(3) * 0.3, height = core > 0.6 && h(9) < 0.25 ? CAP + 1 : 1.8 + core * 1.2 + h(4) * 0.6;
          if (add({ kind: 'mireCrag', x, s, y: floor(x, s, 0.7 * scale) - 0.04, scale, height, rotation: turn(h(5)), cosmetic: false }, h(6))) big.push({ x, s, r: 0.9 * scale });
        } else if (pick < 0.7 * p + 0.08 * core + 0.3) {
          const scale = 0.75 + h(3) * 0.4;
          if (add({ kind: 'mireRock', x, s, y: floor(x, s, 0.45 * scale) - 0.04, scale, height: 0.55 + core * 0.4 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: false }, h(6))) big.push({ x, s, r: 0.55 * scale });
        }
      } else if (ground > SEA + 0.02 && pick < 0.06 + 0.06 * m.land * (1 - m.grove) + (ground - SEA < 0.22 ? 0.14 : 0)) {
        // Rock outcrops on the islands, and a ragged fringe of black rock along the shores.
        const scale = 0.7 + h(3) * 0.4;
        if (add({ kind: 'mireRock', x, s, y: floor(x, s, 0.45 * scale) - 0.04, scale, height: 0.5 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: false }, h(6))) big.push({ x, s, r: 0.55 * scale });
      } else if (ground < SEA && ground > SEA - 0.9 && pick > 0.95) {
        // Black rock rising from the shallows (its base on the bed).
        const scale = 0.7 + h(3) * 0.45, crag = h(7) < 0.35;
        if (add({ kind: crag ? 'mireCrag' : 'mireRock', x, s, y: ground - 0.04, scale, height: SEA - ground + (crag ? 1.4 + h(4) * 1.2 : 0.4 + h(4) * 0.5), rotation: turn(h(5)), cosmetic: false }, h(6))) big.push({ x, s, r: 0.6 * scale });
      }
    }
    yield;
  }

  // 3. Jungle: groves, lotus caps, glass tubes and goblets on the low ground and at the shores (and a few lotus in the shallows).
  for (let j = Math.floor(startS / FLORA_CELL); j < Math.ceil((startS + size) / FLORA_CELL); j++) {
    for (let i = 0; i < Math.ceil(WORLD_HALF * 2 / FLORA_CELL); i++) {
      const h = (k: number) => hash(seed ^ 0x5e17, i * 61 + k, j);
      const x = -WORLD_HALF + (i + 0.15 + h(0) * 0.7) * FLORA_CELL, s = (j + 0.15 + h(1) * 0.7) * FLORA_CELL;
      if (s < startS || s >= startS + size || !open(x, s) || hits(ruins, x, s, 0.5)) continue;
      const ground = terrain.height(x, s), slope = terrain.slope(x, s), m = nacreMasks(seed, x, s), pick = h(2);
      if (ground < SEA) {
        if (ground > SEA - 0.5 && m.land > 0.05 && pick < 0.06 && !hits(big, x, s, 0.4)) {
          add({ kind: 'lotus', x, s, y: SEA - 0.12, scale: 0.7 + h(3) * 0.35, height: 0.8 + h(4) * 0.5, rotation: turn(h(5)), cosmetic: false }, h(6), 1);
        }
        continue;
      }
      if (slope > 1.3) continue;
      if (m.rock > 0.45) {
        // Among the crags: glowing tubes and goblets in the gaps.
        if (pick < 0.22 && !hits(big, x, s, 0.25, 0.7)) {
          const kind: KitKind = h(8) < 0.6 ? 'glassTube' : 'goblet', scale = 0.75 + h(3) * 0.3;
          add({ kind, x, s, y: floor(x, s, 0.2) - 0.04, scale, height: 0.55 + h(4) * 0.5, rotation: turn(h(5)), cosmetic: false }, h(6), glowShade(x, s));
        }
        continue;
      }
      const shore = ground - SEA < 0.2, foot = smoothRange(0.04, 0.25, m.rock);
      const jungle = Math.min(1, Math.max(m.grove, shore ? 0.55 : 0, foot) + 0.2) * (1 - smoothRange(0.38, 0.45, m.rock));
      let kind: KitKind | null = null, height = 1, scale = 1, r = 0.5;
      const groveP = 0.18 * jungle, lotusP = groveP + 0.22 * (0.3 + jungle), tubeP = lotusP + 0.16 * (0.4 + jungle), gobletP = tubeP + 0.1 * (0.3 + m.glow + foot);
      if (pick < groveP) { kind = 'lotusGrove'; height = 1.3 + h(4) * 0.8; scale = 0.85 + h(3) * 0.3; r = 0.85; }
      else if (pick < lotusP) { kind = 'lotus'; height = 0.85 + h(4) * 0.8; scale = 0.7 + h(3) * 0.45; r = 0.6; }
      else if (pick < tubeP) { kind = 'glassTube'; height = 0.6 + h(4) * 0.7; scale = 0.8 + h(3) * 0.4; r = 0.4; }
      else if (pick < gobletP) { kind = 'goblet'; height = 0.5 + h(4) * 0.45; scale = 0.8 + h(3) * 0.35; r = 0.35; }
      if (!kind || hits(big, x, s, r * scale, 0.75)) continue;
      if (add({ kind, x, s, y: floor(x, s, r * 0.5 * scale) - 0.04, scale, height, rotation: turn(h(5)), cosmetic: false }, h(6), glowShade(x, s))) big.push({ x, s, r: r * scale * 0.8 });
    }
    yield;
  }

  // 4. Cover: lily rafts in the shallows, moss tufts with speckles at rock feet, shores and glowing patches.
  const cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) {
    for (let i = 0; i < columns; i++) {
      const h = (k: number) => hash(seed ^ 0x7d4e, i * 41 + k, j);
      const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
      if (s < startS || s >= startS + size || !open(x, s) || hits(ruins, x, s, 0.2)) continue;
      const ground = terrain.height(x, s), pick = h(2), depth = SEA - ground;
      if (depth > 0) {
        const raft = smoothRange(0.45, 0.72, noise(seed ^ 0x7d60, x * 0.3, s * 0.3));
        if (depth < 0.65 && pick < 0.02 + 0.32 * raft && !hits(big, x, s, 0.3)) {
          add({ kind: 'lilyRaft', x, s, y: SEA, scale: 0.55 + h(3) * 0.6, height: 1, rotation: turn(h(5)), cosmetic: h(7) > 0.55 }, h(6), 1);
        }
        continue;
      }
      const m = nacreMasks(seed, x, s), shore = ground - SEA < 0.2;
      const want = m.rock > 0.05 ? 0.32 : shore ? 0.26 : 0.1 + 0.25 * m.glow;
      if (pick < want && terrain.slope(x, s) < 1.4) {
        const scale = 0.7 + h(3) * 0.5;
        add({ kind: 'mossTuft', x, s, y: ground - 0.03, scale, height: 0.16 + h(4) * 0.18, rotation: turn(h(5)), cosmetic: h(7) > 0.3 }, h(6), glowShade(x, s));
      }
    }
    yield;
  }
  return [...essential, ...cosmetic];
}

/* ---------------------------------------------------------------- profile */

export const NACRE: PlanetProfile = {
  id: 'nacre', seaLevel: SEA,
  mood: () => 'mire', params: () => NEUTRAL, local: () => null,
  landform: nacreLandform,
  // The boss arena is shaped in the landform itself (the islands recede into open mire); the bed deepens a little.
  arena(row, _x, point) { point.height = Math.min(point.height, mix(point.height, SEA - 1.2, row.platform)); },
  color: nacreColor,
  shadowTint: [0.66, 0.58, 1],
  sceneryMax: NACRE_SCENERY_MAX,
  settlement: () => null,
  scatter: nacreScatterSteps,
  floes: function* () { return []; },
  industrial: new Set(), quiet: new Set(), networks: false,
};
export type { TerrainArena };
