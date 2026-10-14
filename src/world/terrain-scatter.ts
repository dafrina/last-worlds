import { SCENERY_MAX_HEIGHT, WORLD_HALF, clamp, hash, mix, noise, smoothRange, type MoodParams } from './terrain-layout';

/** Kit pieces from public/assets/khepri/khepri-kit.glb (docs/13 §3); base-center pivots, +Y up. */
export type KitKind = 'clump' | 'column' | 'rock' | 'crystal' | 'spire' | 'wall' | 'fallen' | 'boulder' | 'crystalSpire' | 'rosette' | 'hoodoo';
export const KIT_KINDS: readonly KitKind[] = ['clump', 'column', 'rock', 'crystal', 'spire', 'wall', 'fallen', 'boulder', 'crystalSpire', 'rosette', 'hoodoo'];
/** Data-driven kit table: node prefix, variant count, contract bounds (half extents) and node height. */
export const KIT: Readonly<Record<KitKind, {
  prefix: string; variants: number;
  /** Contract half footprint along local x and z. */
  halfX: number; halfZ: number;
  /** Contract height of the unscaled node; `exactTop` nodes reach it exactly. */
  height: number; exactTop: boolean;
  /** Conservative footprint radius at scale 1. */
  radius: number;
}>> = {
  clump: { prefix: 'basalt_clump', variants: 6, halfX: 0.8, halfZ: 0.8, height: 1, exactTop: true, radius: Math.hypot(0.8, 0.8) },
  column: { prefix: 'basalt_column', variants: 3, halfX: 0.3, halfZ: 0.3, height: 1, exactTop: true, radius: Math.hypot(0.3, 0.3) },
  rock: { prefix: 'rock', variants: 6, halfX: 0.5, halfZ: 0.5, height: 0.7, exactTop: false, radius: Math.hypot(0.5, 0.5) },
  crystal: { prefix: 'crystal', variants: 3, halfX: 0.5, halfZ: 0.5, height: 0.8, exactTop: false, radius: Math.hypot(0.5, 0.5) },
  spire: { prefix: 'basalt_spire', variants: 3, halfX: 0.5, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(0.5, 0.5) },
  wall: { prefix: 'basalt_wall', variants: 3, halfX: 1.3, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(1.3, 0.6) },
  fallen: { prefix: 'basalt_fallen', variants: 2, halfX: 0.8, halfZ: 0.3, height: 0.5, exactTop: false, radius: Math.hypot(0.8, 0.3) },
  boulder: { prefix: 'boulder', variants: 2, halfX: 0.6, halfZ: 0.6, height: 0.9, exactTop: false, radius: Math.hypot(0.6, 0.6) },
  crystalSpire: { prefix: 'crystal_spire', variants: 2, halfX: 0.6, halfZ: 0.6, height: 1, exactTop: true, radius: Math.hypot(0.6, 0.6) },
  rosette: { prefix: 'basalt_rosette', variants: 1, halfX: 0.9, halfZ: 0.9, height: 1, exactTop: true, radius: Math.hypot(0.9, 0.9) },
  hoodoo: { prefix: 'hoodoo', variants: 2, halfX: 0.5, halfZ: 0.5, height: 1, exactTop: true, radius: Math.hypot(0.5, 0.5) },
};
export const kitNodeName = (kind: KitKind, variant: number) => `${KIT[kind].prefix}_${variant}`;
/** The runtime may vary footprint scale by at most ±20%. */
export const KIT_MAX_SCALE = 1.2;

/** Lateral ground strips per section; off-screen strips are culled. */
export const TERRAIN_STRIPS = 4;
export const STRIP_WIDTH = (WORLD_HALF * 2) / TERRAIN_STRIPS;
export const stripOf = (x: number) => clamp(Math.floor((x + WORLD_HALF) / STRIP_WIDTH), 0, TERRAIN_STRIPS - 1);

export interface KitInstance {
  kind: KitKind; variant: number;
  /** Base center in world coordinates; y is the pivot height. */
  x: number; s: number; y: number;
  /** Uniform footprint scale (0.8–1.2) and vertical scale applied to the node. */
  scale: number; height: number; rotation: number;
  /** Baked sun-shadow and occlusion factor at the base, for presentation tinting. */
  shade: number;
  /** Cosmetic scatter that the low graphics tier may skip; never layout or anything simulated. */
  cosmetic: boolean;
}

/** Section-backed terrain queries for scatter (bilinear on the section's grids; exact heights outside them). */
export interface ScatterField {
  height(x: number, s: number): number;
  /** |∇h|, the largest drop and rise within one unit, and the height gradient. */
  slope(x: number, s: number): number; drop(x: number, s: number): number; rise(x: number, s: number): number;
  gradientX(x: number, s: number): number; gradientS(x: number, s: number): number;
  elevation(x: number, s: number): number; industrial(x: number, s: number): number;
  veins(x: number, s: number): number; pool(x: number, s: number): number; shade(x: number, s: number): number;
  mood(s: number): MoodParams;
  /** True where pipelines or tanks stand; scatter keeps clear. */
  blocked(x: number, s: number): boolean;
}

/**
 * Deterministic kit dressing for one section, classified from the landform: rim crowns of columns,
 * clumps and wall segments; crystal spires breaking out of faces; talus, fallen columns, boulders and
 * towering stacks at cliff feet; hoodoos, rosettes and sparse rocks on open ground; crystals at pools.
 * Cells are global, so a section's pieces never depend on which sections were generated first.
 */
export function scatterKit(seed: number, startS: number, size: number, terrain: ScatterField): KitInstance[] {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [];
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number, shade?: number) => {
    const { kind, x, s, scale } = instance, spec = KIT[kind];
    if (s < startS || s >= startS + size) return;
    if (Math.abs(x) + spec.radius * scale > WORLD_HALF) return;
    if (instance.y + instance.height * spec.height > SCENERY_MAX_HEIGHT) {
      // Real-size pieces are never squashed to fit the cap; stretchable ones are trimmed.
      if (kind === 'fallen' || kind === 'boulder') return;
      instance = { ...instance, height: (SCENERY_MAX_HEIGHT - instance.y) / spec.height };
    }
    if (instance.height <= 0.05) return;
    const variant = Math.min(spec.variants - 1, Math.floor(pick * spec.variants));
    const placed: KitInstance = { ...instance, variant, shade: shade ?? terrain.shade(x, s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  const turn = (pick: number) => pick * Math.PI * 2;
  const cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    const h = (k: number) => hash(seed ^ 0x6c1a, i * 41 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.industrial(x, s) > 0.2 || terrain.blocked(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), rise = terrain.rise(x, s);
    const mood = terrain.mood(s), pick = h(2);
    const gx = terrain.gradientX(x, s), gs = terrain.gradientS(x, s);
    const along = Math.hypot(gx, gs) > 0.05 ? Math.atan2(gx, -gs) : turn(h(3));
    if (rise > 1 && slope < 1.1) {
      // Cliff feet: columnar pieces fill the face from its foot (stacked columns, not paving), with
      // talus, fallen columns and boulders below and now and then a towering stack or hoodoo.
      const closeness = smoothRange(1, 3, rise), face = h(11);
      if (face < 0.62) {
        const kind = h(12) < 0.36 ? 'wall' : 'clump', top = Math.min(SCENERY_MAX_HEIGHT, ground + rise * (0.5 + h(13) * 0.45));
        add({ kind, x, s, y: ground - 0.1, scale: 0.9 + h(14) * 0.3, height: top - ground + 0.1,
          rotation: kind === 'wall' ? along + (h(15) - 0.5) * 0.3 : turn(h(15)), cosmetic: false }, h(16), 1);
      }
      if (pick < 0.05 * mood.stacks) {
        const kind = h(4) < 0.5 ? 'spire' : 'hoodoo', height = Math.min(3.6, rise * (0.45 + h(5) * 0.45) + 0.4);
        add({ kind, x: x + (h(17) - 0.5) * 0.6, s, y: ground - 0.1, scale: 0.9 + h(6) * 0.3, height, rotation: turn(h(7)), cosmetic: false }, h(8));
      } else if (pick < 0.12) {
        { const scale = 0.85 + h(4) * 0.3; add({ kind: 'fallen', x, s, y: ground - 0.06, scale, height: scale, rotation: turn(h(6)), cosmetic: false }, h(7)); }
      } else if (pick < 0.18) {
        const scale = 0.8 + h(4) * 0.4;
        add({ kind: 'boulder', x, s, y: ground - 0.08, scale, height: scale, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (pick < 0.18 + 0.4 * closeness) {
        const scale = mix(0.3, 0.75, closeness) * (0.85 + h(4) * 0.3);
        add({ kind: 'rock', x, s, y: ground - 0.04, scale, height: scale * (0.75 + h(5) * 0.45), rotation: turn(h(6)), cosmetic: h(7) > 0.5 }, h(8));
      }
    } else if (drop > 0.7 && slope < 1) {
      // Rims and ledges: sparse groups of protruding columns, occasionally a spire or rosette.
      if (pick > 0.24) continue;
      const kind = h(5) < 0.08 * mood.stacks ? 'rosette' : h(5) < 0.14 ? 'spire' : 'column';
      const members = kind === 'column' ? 2 + Math.floor(h(10) * 2) : 1;
      for (let m = 0; m < members; m++) {
        const ox = x + (m ? (h(20 + m) - 0.5) * 0.9 : 0), os = s + (m ? (h(24 + m) - 0.5) * 0.9 : 0), base = terrain.height(ox, os);
        const top = Math.min(SCENERY_MAX_HEIGHT, base + (kind === 'spire' ? 0.6 + h(6) * 0.9 : 0.12 + h(6 + m) * 0.35));
        if (top - base < 0.05) continue;
        add({ kind, x: ox, s: os, y: base - 0.3, scale: 0.85 + h(8) * 0.35, height: top - base + 0.3, rotation: turn(h(7 + m)),
          cosmetic: kind === 'column' && m > 0 }, h(9), 1);
      }
    } else if (slope > 1.5) {
      // Steep faces stay clean (the shader draws column striation); crystal growths break out in places.
      if (pick < 0.035 * mood.mineral && ground < 1.4) {
        const scale = 0.85 + h(4) * 0.35;
        add({ kind: 'crystalSpire', x, s, y: ground - 0.25, scale, height: 0.8 + h(5) * 0.9, rotation: turn(h(6)), cosmetic: false }, h(7));
      }
    } else {
      // Open ground: crystals and crystal spires at pools, hoodoos and rosettes, sparse rocks and boulder fields.
      const field = smoothRange(0.68, 0.84, noise(seed ^ 0x4a7c, x * 0.12, s * 0.12)), pool = terrain.pool(x, s), veins = terrain.veins(x, s);
      if (pool > 0.3 && pick < 0.06) {
        const scale = 0.9 + h(4) * 0.3;
        add({ kind: 'crystalSpire', x, s, y: ground - 0.12, scale, height: 0.9 + h(5) * 1.1, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (pool > 0.3 && pick < 0.36) {
        const scale = 0.55 + h(4) * 0.45;
        add({ kind: 'crystal', x, s, y: ground - 0.05, scale, height: scale * (0.85 + h(5) * 0.3), rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (slope < 0.45 && ground < 0 && pick < 0.014 * mood.stacks) {
        add({ kind: 'hoodoo', x, s, y: ground - 0.08, scale: 0.85 + h(4) * 0.35, height: 1 + h(5) * 1.6, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (slope < 0.45 && pick < 0.014 * mood.stacks + 0.008) {
        add({ kind: 'rosette', x, s, y: ground - 0.15, scale: 0.85 + h(4) * 0.3, height: 0.6 + h(5) * 0.8, rotation: turn(h(6)), cosmetic: false }, h(7));
      } else if (veins > 0.6 && pick < 0.04) {
        const scale = 0.4 + h(4) * 0.35;
        add({ kind: 'crystal', x, s, y: ground - 0.05, scale, height: scale, rotation: turn(h(6)), cosmetic: true }, h(7));
      } else if (pick < (ground > 0.5 ? 0.06 : 0.03) + field * 0.2) {
        const big = field > 0.3 && h(8) < 0.3, kind = big ? (h(9) < 0.6 ? 'boulder' : 'fallen') : 'rock';
        const scale = big ? 0.8 + h(4) * 0.35 : 0.14 + h(4) * h(4) * 0.4 + field * 0.15;
        // Fallen columns and boulders keep their modelled proportions (uniform scale); rocks vary in height.
        add({ kind, x, s, y: ground - 0.05, scale, height: big ? scale : scale * (0.75 + h(5) * 0.35),
          rotation: turn(h(6)), cosmetic: !big || h(10) > 0.6 }, h(7));
      }
    }
  }
  return [...essential, ...cosmetic];
}
