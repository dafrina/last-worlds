import { WORLD_HALF, clamp, hash, mix, noise, routeCalm, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import { arenaWeight, type TerrainArena } from './terrain-arena';

/**
 * Nacre, the Luminous Mire (docs/03 §1, docs/20): indigo water threading between low dark islands of moss and
 * black rock, glowing teal caps and lily pads, reeds at the shores, violet canopy trees, violet crystals and dark
 * alien monoliths with orange slits. About half land. Pure functions of seed and world coordinates.
 */
export const NACRE_SEA_LEVEL = -0.6;
const SEA = NACRE_SEA_LEVEL;
/** Scenery cap: the same clearance under the flight plane (3.8) as Vesper's, so monoliths and trees can stand tall. */
export const NACRE_SCENERY_MAX = 3.0;
const NEUTRAL: MoodParams = { lift: 0, relief: 1, carve: 0, terrace: 0, mineral: 0, stacks: 0 };

/* ---------------------------------------------------------------- masks */

export interface NacreMasks {
  /** 0 open water … 1 solid island. */ land: number;
  /** Craggy black rock massif weight (the mountains). */ rock: number;
  /** Bioluminescent moss patches (colour and flora density). */ glow: number;
  /** Low jungle ground (dense flora) between the shore and the crags. */ grove: number;
}
const ridged = (value: number) => { const r = 1 - Math.abs(2 * value - 1); return r * r; };
/** Nacre's masks at a point, shared by landform, colour and scatter. An arena weight opens the water. */
export function nacreMasks(seed: number, x: number, s: number, platform = 0): NacreMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xb1a1, x * 0.04, s * 0.035) - 0.5) * 12, qs = s + (noise(seed ^ 0xb1a2, x * 0.04 + 3.3, s * 0.035) - 0.5) * 12;
  const mass = noise(seed ^ 0xb1a3, qx * 0.09, qs * 0.08) * 0.55 + noise(seed ^ 0xb1a4, qx * 0.22, qs * 0.2) * 0.33 + noise(seed ^ 0xb1a5, qx * 0.6, qs * 0.55) * 0.12;
  // Islands where the mass clears ~0.53 (about 45% land; raised over an arena so the mire opens around the boss).
  const threshold = mix(0.53, 1.3, platform);
  let land = smoothRange(-1, 1, (mass - threshold) / 0.04);
  // Winding channels cut through bigger islands.
  const channel = 1 - smoothRange(0.015, 0.045, Math.abs(noise(seed ^ 0xb1a6, qx * 0.045, qs * 0.04) - 0.5));
  land *= 1 - channel * 0.9;
  // Massifs rise from the island interiors (how far inland: mass above the threshold), calmer near the routes.
  const inland = smoothRange(threshold + 0.005, threshold + 0.09, mass);
  const rock = inland * smoothRange(0.22, 0.4, noise(seed ^ 0xb1a7, x * 0.08, s * 0.07)) * land * (1 - calm * 0.35);
  const glow = smoothRange(0.42, 0.68, noise(seed ^ 0xb1a8, x * 0.16 + 7.7, s * 0.15));
  const grove = land * (1 - rock) * smoothRange(0.35, 0.6, noise(seed ^ 0xb1a9, x * 0.11 + 1.9, s * 0.1));
  return { land, rock, glow, grove };
}

/**
 * Mire ground: a shallow indigo bed under the water, low mossy shores, and craggy black rock massifs stepping up
 * in faceted ledges to near the scenery cap (the concept's jagged rock islands). `tone` carries the moss glow.
 */
export function nacreLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const m = nacreMasks(seed, x, s, row.arena ? Math.max(arenaWeight(row.arena, s), row.platform) : row.platform);
  const bed = SEA - 0.6 - noise(seed ^ 0xb1aa, x * 0.09, s * 0.08) * 0.9;
  const crag = ridged(noise(seed ^ 0xb1ad, x * 0.16, s * 0.14)) * 0.6 + ridged(noise(seed ^ 0xb1ae, x * 0.42, s * 0.38)) * 0.4;
  const shore = SEA + 0.15 + noise(seed ^ 0xb1ab, x * 0.12, s * 0.11) * 0.35 + (noise(seed ^ 0xb1ac, x * 0.8, s * 0.8) - 0.5) * 0.12;
  let peak = Math.pow(m.rock, 0.6) * (0.9 + crag * 1.7);
  // Faceted ledges: heights snap toward steps of 0.32, so the crags read as stacked broken rock, not smooth hills.
  const stepped = Math.floor(peak / 0.32) * 0.32 + smoothRange(0.75, 1, (peak / 0.32) % 1) * 0.32;
  peak = mix(peak, stepped, 0.7);
  return { height: clamp(mix(bed, shore + peak, m.land), -4, 2), elevation: m.land, channel: m.rock, pool: 0, vein: 99, vein2: 99, veins: 0, tone: m.glow * m.land * (1 - m.rock) };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Mire palette, linear RGB (concept: indigo water, black crags with blue light, teal moss with glow, violet bloom). */
export const NACRE_PALETTE = {
  moss: linear(0x1f4a44), mossViolet: linear(0x3a2a63), teal: linear(0x24807a), rock: linear(0x15161e), rockLit: linear(0x34405e),
  mud: linear(0x1b1534), bed: linear(0x101656),
} as const;

function nacreColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = NACRE_PALETTE, { seed, s } = row;
  if (point.height < SEA) {
    const depth = smoothRange(0, 1.5, SEA - point.height);
    for (let c = 0; c < 3; c++) out[c] = mix(P.mud[c], P.bed[c], depth) * 0.8;
    return out;
  }
  const patch = noise(seed ^ 0x52b1, x * 0.14, s * 0.12), fine = noise(seed ^ 0x52b2, x * 1.4, s * 1.4);
  const steep = smoothRange(0.5, 1.4, slope), shore = 1 - smoothRange(0, 0.3, point.height - SEA), glow = point.tone ?? 0, crag = point.channel;
  for (let c = 0; c < 3; c++) {
    let value = mix(P.moss[c], P.mossViolet[c], smoothRange(0.35, 0.7, patch));
    value = mix(value, P.teal[c], glow * 0.65);
    value = mix(value, P.mud[c], shore * 0.6);
    // Crags: near-black faceted rock; rims and ledge tops catch a cold blue light.
    const rock = mix(P.rock[c], P.rockLit[c], rim * 0.8 + (1 - steep) * 0.25);
    value = mix(value, rock, Math.max(steep * 0.9, crag * 0.85));
    out[c] = value * (0.9 + fine * 0.2);
  }
  return out;
}

/* ---------------------------------------------------------------- scatter */

/** Lattice of possible builder sites (a biological tower with its ring platform and glowing tubes). */
const SITE_CELL = 13;
/**
 * Nacre dressing after the concept: lily-pad rafts and lotus caps in the shallows, tall jagged spires and craggy
 * rock on the massifs, reeds, lotus caps and glass tubes along the shores, a dense jungle of glow-frond trees,
 * goblet flowers and tubes on the low ground, and now and then a biological tower with its ring platform.
 * Arenas stay clear.
 */
export function* nacreScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [], CAP = NACRE_SCENERY_MAX;
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number, shade?: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale > WORLD_HALF) return;
    if (instance.y + instance.height * spec.height > CAP) instance = { ...instance, height: (CAP - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: shade ?? terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2;
  // Builder sites first, so the flora pass can keep clear of them.
  const sites: { x: number; s: number }[] = [];
  for (let j = Math.floor((startS - SITE_CELL) / SITE_CELL); j <= Math.ceil((startS + size) / SITE_CELL); j++) for (let i = 0; i < Math.floor(WORLD_HALF * 2 / SITE_CELL); i++) {
    const h = (k: number) => hash(seed ^ 0x7d5f, i * 31 + k, j);
    if (h(0) > 0.42) continue;
    const x = -WORLD_HALF + (i + 0.3 + h(1) * 0.4) * SITE_CELL, s = (j + 0.3 + h(2) * 0.4) * SITE_CELL;
    if (terrain.platform(s) > 0 || terrain.height(x, s) < SEA + 0.08 || terrain.slope(x, s) > 0.55 || nacreMasks(seed, x, s).rock > 0.35) continue;
    sites.push({ x, s });
    const ground = terrain.height(x, s);
    add({ kind: 'bioTower', x, s, y: ground - 0.1, scale: 0.95 + h(3) * 0.25, height: 2.3 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: false }, h(6));
    const ra = turn(h(7)), rx = x + Math.cos(ra) * 1.9, rs = s + Math.sin(ra) * 1.9;
    if (terrain.height(rx, rs) > SEA + 0.05) add({ kind: 'bioRing', x: rx, s: rs, y: terrain.height(rx, rs) - 0.05, scale: 0.8 + h(8) * 0.3, height: 1, rotation: 0, cosmetic: false }, h(9));
    for (let k = 0; k < 3; k++) {
      const a = turn(h(10 + k)), tx = x + Math.cos(a) * (1.1 + h(14 + k) * 0.6), ts = s + Math.sin(a) * (1.1 + h(18 + k) * 0.6);
      if (terrain.height(tx, ts) > SEA) add({ kind: 'glassTube', x: tx, s: ts, y: terrain.height(tx, ts) - 0.05, scale: 0.6 + h(22 + k) * 0.4, height: 0.5 + h(26 + k) * 0.5, rotation: turn(h(30 + k)), cosmetic: true }, h(34 + k));
    }
  }
  const nearSite = (x: number, s: number) => sites.some(site => Math.hypot(site.x - x, site.s - s) < 2.4);
  const cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7d4e, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.blocked(x, s) || nearSite(x, s)) continue;
    const platform = terrain.platform(s);
    if (platform >= 0.5 || (platform > 0 && h(30) < platform * 2)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), pick = h(2), m = nacreMasks(seed, x, s, platform);
    const depth = SEA - ground;
    if (depth > 0) {
      // Shallows: lily-pad rafts (clustered by a patch noise) and now and then a lotus rising from the water.
      const raft = smoothRange(0.45, 0.7, noise(seed ^ 0x7d60, x * 0.3, s * 0.3));
      if (depth < 0.9 && pick < 0.05 + 0.4 * raft) {
        const scale = 0.5 + h(3) * 0.7;
        add({ kind: 'lilyPad', x, s, y: SEA, scale, height: scale, rotation: turn(h(5)), cosmetic: h(7) > 0.4 }, h(6), 1);
      } else if (depth < 0.7 && pick > 0.985) {
        const scale = 0.7 + h(3) * 0.5;
        add({ kind: 'bloomCap', x, s, y: SEA - 0.15, scale, height: 0.7 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: false }, h(6), 1);
      }
      continue;
    }
    const shore = ground - SEA < 0.22;
    if (m.rock > 0.35 || slope > 1.1) {
      // Massifs: tall jagged spires on high ground, craggy rock everywhere on them.
      if (ground > 0.6 && slope < 1.4 && pick < 0.035) {
        const scale = 0.8 + h(3) * 0.5;
        add({ kind: 'mireSpire', x, s, y: ground - 0.15, scale, height: 1.2 + h(4) * 1.1, rotation: turn(h(5)), cosmetic: false }, h(6));
      } else if (pick < 0.11) {
        const scale = 0.6 + h(3) * 0.6;
        add({ kind: 'mireRock', x, s, y: ground - 0.15, scale, height: scale * (0.8 + h(4) * 0.5), rotation: turn(h(5)), cosmetic: h(7) > 0.6 }, h(6));
      } else if (m.glow > 0.4 && pick < 0.15) {
        add({ kind: 'glassTube', x, s, y: ground - 0.05, scale: 0.5 + h(3) * 0.3, height: 0.4 + h(4) * 0.3, rotation: turn(h(5)), cosmetic: true }, h(6));
      }
    } else if (shore) {
      if (pick < 0.22) add({ kind: 'reed', x, s, y: ground - 0.05, scale: 0.7 + h(3) * 0.5, height: 0.45 + h(4) * 0.35, rotation: turn(h(5)), cosmetic: h(7) > 0.45 }, h(6));
      else if (pick < 0.3) add({ kind: 'bloomCap', x, s, y: ground - 0.05, scale: 0.7 + h(3) * 0.6, height: 0.6 + h(4) * 0.8, rotation: turn(h(5)), cosmetic: false }, h(6));
      else if (pick < 0.36) add({ kind: 'glassTube', x, s, y: ground - 0.05, scale: 0.6 + h(3) * 0.4, height: 0.5 + h(4) * 0.6, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else {
      // Jungle: frond trees in groves, lotus caps, glass tubes and violet goblets, filler everywhere.
      const jungle = 0.35 + m.grove * 0.65;
      if (m.grove > 0.25 && pick < 0.12 * jungle) {
        add({ kind: 'mireTree', x, s, y: ground - 0.06, scale: 0.85 + h(3) * 0.4, height: 1.2 + h(4) * 1.0, rotation: turn(h(5)), cosmetic: false }, h(6));
      } else if (pick < 0.2 * jungle) {
        add({ kind: 'bloomCap', x, s, y: ground - 0.05, scale: 0.6 + h(3) * 0.6, height: 0.5 + h(4) * 0.9, rotation: turn(h(5)), cosmetic: false }, h(6));
      } else if (pick < 0.27 * jungle) {
        add({ kind: 'glassTube', x, s, y: ground - 0.05, scale: 0.6 + h(3) * 0.4, height: 0.5 + h(4) * 0.7, rotation: turn(h(5)), cosmetic: h(7) > 0.5 }, h(6));
      } else if (pick < 0.27 * jungle + 0.07 * m.glow) {
        add({ kind: 'mireCrystal', x, s, y: ground - 0.05, scale: 0.6 + h(3) * 0.4, height: 0.4 + h(4) * 0.5, rotation: turn(h(5)), cosmetic: h(7) > 0.5 }, h(6));
      } else if (pick < 0.3 * jungle + 0.08) {
        add({ kind: h(8) < 0.5 ? 'reed' : 'mireRock', x, s, y: ground - 0.06, scale: 0.4 + h(3) * 0.3, height: 0.35 + h(4) * 0.3, rotation: turn(h(5)), cosmetic: true }, h(6));
      }
    }
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
