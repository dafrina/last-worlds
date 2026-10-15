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
  /** Raised black rock (ridges and outcrops on the islands). */ rock: number;
  /** Bioluminescent moss patches (colour and flora density). */ glow: number;
  /** Dense grove (trees). */ grove: number;
}
/** Nacre's masks at a point, shared by landform, colour and scatter. An arena weight opens the water. */
export function nacreMasks(seed: number, x: number, s: number, platform = 0): NacreMasks {
  const calm = routeCalm(seed, x, s);
  const qx = x + (noise(seed ^ 0xb1a1, x * 0.04, s * 0.035) - 0.5) * 12, qs = s + (noise(seed ^ 0xb1a2, x * 0.04 + 3.3, s * 0.035) - 0.5) * 12;
  const mass = noise(seed ^ 0xb1a3, qx * 0.1, qs * 0.085) * 0.55 + noise(seed ^ 0xb1a4, qx * 0.24, qs * 0.22) * 0.33 + noise(seed ^ 0xb1a5, qx * 0.6, qs * 0.55) * 0.12;
  // Islands where the mass clears ~0.5 (raised over an arena so the mire opens up around the boss).
  const threshold = mix(0.5, 1.3, platform);
  let land = smoothRange(-1, 1, (mass - threshold) / 0.05);
  // Winding channels cut through bigger islands.
  const channel = 1 - smoothRange(0.015, 0.045, Math.abs(noise(seed ^ 0xb1a6, qx * 0.045, qs * 0.04) - 0.5));
  land *= 1 - channel * 0.9;
  const rock = smoothRange(0.58, 0.8, noise(seed ^ 0xb1a7, x * 0.2, s * 0.18)) * land * (1 - calm * 0.5);
  const glow = smoothRange(0.42, 0.68, noise(seed ^ 0xb1a8, x * 0.16 + 7.7, s * 0.15));
  const grove = smoothRange(0.45, 0.65, noise(seed ^ 0xb1a9, x * 0.11 + 1.9, s * 0.1)) * land;
  return { land, rock, glow, grove };
}

/** Mire ground: a shallow indigo bed under the water, low mossy islands, black rock ridges. `tone` carries glow. */
export function nacreLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number } {
  const m = nacreMasks(seed, x, s, row.arena ? Math.max(arenaWeight(row.arena, s), row.platform) : row.platform);
  const bed = SEA - 0.6 - noise(seed ^ 0xb1aa, x * 0.09, s * 0.08) * 0.9;
  const top = SEA + 0.25 + noise(seed ^ 0xb1ab, x * 0.12, s * 0.11) * 0.7 + (noise(seed ^ 0xb1ac, x * 0.7, s * 0.7) - 0.5) * 0.16 + m.rock * 1.3;
  return { height: clamp(mix(bed, top, m.land), -4, 1.6), elevation: m.land, channel: 0, pool: 0, vein: 99, vein2: 99, veins: 0, tone: m.glow * m.land };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** Mire palette, linear RGB (concept: indigo water, violet vegetation, teal bioluminescence, dark rock). */
export const NACRE_PALETTE = {
  moss: linear(0x2b1c46), mossLit: linear(0x4a2f74), teal: linear(0x1a5a5e), rock: linear(0x17141e), rockTop: linear(0x2c2838),
  mud: linear(0x231b36), bed: linear(0x100b26),
} as const;

function nacreColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number }, slope: number, rim: number, out: [number, number, number]) {
  const P = NACRE_PALETTE, { seed, s } = row;
  if (point.height < SEA) {
    const depth = smoothRange(0, 1.5, SEA - point.height);
    for (let c = 0; c < 3; c++) out[c] = mix(P.mud[c], P.bed[c], depth) * 0.8;
    return out;
  }
  const drift = noise(seed ^ 0x52b1, x * 0.12, s * 0.1), fine = noise(seed ^ 0x52b2, x * 1.2, s * 1.2);
  const steep = smoothRange(0.7, 1.8, slope), shore = 1 - smoothRange(0, 0.35, point.height - SEA), glow = point.tone ?? 0;
  for (let c = 0; c < 3; c++) {
    let value = mix(P.moss[c], P.mossLit[c], smoothRange(0.4, 0.8, drift) * 0.7);
    value = mix(value, P.teal[c], glow * 0.6);
    value = mix(value, P.mud[c], shore * 0.6);
    value = mix(value, mix(P.rock[c], P.rockTop[c], rim), steep * 0.85);
    out[c] = value * (0.93 + fine * 0.14);
  }
  return out;
}

/* ---------------------------------------------------------------- scatter */

/**
 * Nacre dressing: lily pads and glowing caps on shallow water near shores, reeds along the waterline, caps and
 * crystals on glowing moss, violet trees in groves, black rocks on ridges and rare tall monoliths. Arenas stay clear.
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
  const turn = (pick: number) => pick * Math.PI * 2, cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x7d4e, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s)) continue;
    const platform = terrain.platform(s);
    if (platform >= 0.5 || (platform > 0 && h(30) < platform * 2)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), pick = h(2), m = nacreMasks(seed, x, s, platform);
    const depth = SEA - ground;
    if (depth > 0) {
      // Shallow water: lily pads (sometimes with a small cap) float at the surface near shores.
      if ((depth < 0.8 && pick < 0.22) || pick < 0.012) {
        const scale = 0.6 + h(3) * 0.7;
        add({ kind: 'lilyPad', x, s, y: SEA, scale, height: scale, rotation: turn(h(5)), cosmetic: h(7) > 0.5 }, h(6), 1);
      }
      continue;
    }
    if (ground - SEA < 0.2 && slope < 0.9 && pick < 0.3) {
      const scale = 0.7 + h(3) * 0.5;
      add({ kind: 'reed', x, s, y: ground - 0.05, scale, height: 0.45 + h(4) * 0.35, rotation: turn(h(5)), cosmetic: h(7) > 0.45 }, h(6));
    } else if (m.rock > 0.3 && pick < 0.16) {
      const scale = 0.7 + h(3) * 0.6;
      add({ kind: 'mireRock', x, s, y: ground - 0.12, scale, height: scale, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (m.grove > 0.3 && slope < 1 && pick < 0.14) {
      const scale = 0.85 + h(3) * 0.35;
      add({ kind: 'mireTree', x, s, y: ground - 0.06, scale, height: 1.1 + h(4) * 0.9, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (m.glow > 0.25 && slope < 0.8 && pick < 0.17) {
      const scale = 0.6 + h(3) * 0.6;
      add({ kind: 'bloomCap', x, s, y: ground - 0.05, scale, height: 0.45 + h(4) * 0.75, rotation: turn(h(5)), cosmetic: false }, h(6));
    } else if (m.glow > 0.4 && pick < 0.21) {
      const scale = 0.6 + h(3) * 0.4;
      add({ kind: 'mireCrystal', x, s, y: ground - 0.05, scale, height: 0.4 + h(4) * 0.5, rotation: turn(h(5)), cosmetic: h(7) > 0.6 }, h(6));
    } else if (slope < 0.6 && m.land > 0.85 && pick < 0.005) {
      const scale = 0.9 + h(3) * 0.3;
      add({ kind: 'monolith', x, s, y: ground - 0.1, scale, height: 1.6 + h(4) * 1.1, rotation: turn(h(5)) * 0.25, cosmetic: false }, h(6));
    } else if (m.land > 0.6 && pick < 0.06) {
      // Filler so no island reads bare: small caps and dark pebbles anywhere on land.
      const scale = 0.35 + h(3) * 0.3;
      add({ kind: h(8) < 0.6 ? 'bloomCap' : 'mireRock', x, s, y: ground - 0.05, scale, height: scale * 0.8, rotation: turn(h(5)), cosmetic: true }, h(6));
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
