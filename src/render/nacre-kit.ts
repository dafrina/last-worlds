import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KitKind } from '../world/terrain-scatter';

/**
 * Code-built stand-ins for the Nacre kit (docs/20), drawn until public/assets/nacre/nacre-kit.glb has loaded (and
 * in tests). Low-poly versions of the authored pieces in the same proportions and colours, one merged
 * vertex-colour/glow mesh per node. Glowing faces carry glow = their colour's brightest channel, as the GLB
 * extraction gives them, so the Nacre kit look emits the same colour either way.
 */
const C = {
  rock: 0x1a1e28, rockTop: 0x3a4864, moss: 0x16302c, speck: 0x62f4e4,
  cap: 0x2ab4c2, capCore: 0xe4fff9, capRim: 0x8ffaf4, stem: 0x1a7f8c,
  tube: 0x1c98a8, mouth: 0xa2fbf4, goblet: 0x7a52d8, gobletMouth: 0xd2adff, pad: 0x1c4e43, padRim: 0x3a7f68,
  stone: 0x1c1f27, stoneLit: 0x2b303c, orange: 0xff8a2a, cyan: 0x40f2ee, panel: 0x4ea8ff, amber: 0xffb455,
} as const;
const color = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
const brightness = (hex: number) => { const c = color(hex); return Math.max(c.r, c.g, c.b); };
function rand(seed: number, n: number) { let x = Math.imul(seed ^ 0x369dea0f, 0x45d9f3b) ^ Math.imul(n + 13, 0x27d4eb2d); x = Math.imul(x ^ x >>> 15, 0x85ebca6b); return ((x ^ x >>> 13) >>> 0) / 4294967296; }

class Piece {
  parts: THREE.BufferGeometry[] = [];
  /** Adds a flat-shaded part in one colour; `glowing` parts emit that colour under the Nacre look. */
  add(geometry: THREE.BufferGeometry, tint: number, glowing = false) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.computeVertexNormals();
    const c = color(tint), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(count).fill(glowing ? brightness(tint) : 0), 1));
    this.parts.push(g);
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, tint: number, glowing = false, angle = 0) {
    this.add(new THREE.BoxGeometry(w, h, d).rotateY(angle).translate(x, y, z), tint, glowing);
  }
  /** Frustum from y0 to y1 (radii r0 → r1), `sides` facets. */
  cone(x: number, z: number, r0: number, r1: number, y0: number, y1: number, sides: number, tint: number, glowing = false, open = false) {
    this.add(new THREE.CylinderGeometry(r1, r0, y1 - y0, sides, 1, open).translate(x, (y0 + y1) / 2, z), tint, glowing);
  }
  disc(x: number, y: number, z: number, r: number, sides: number, tint: number, glowing = false) {
    this.add(new THREE.CircleGeometry(r, sides).rotateX(-Math.PI / 2).translate(x, y, z), tint, glowing);
  }
  finish() { const g = mergeGeometries(this.parts, false)!; this.parts.forEach(p => p.dispose()); g.computeBoundingBox(); g.computeBoundingSphere(); return g; }
}

/** A faceted black rock pinnacle with a blue-lit cap. */
function pinnacle(p: Piece, x: number, z: number, r: number, h: number, seed: number) {
  p.cone(x, z, r, r * 0.3, -0.12, h * 0.82, 5, C.rock);
  p.add(new THREE.ConeGeometry(r * 0.3, h * 0.18, 5).rotateY(rand(seed, 1) * 6).translate(x, h * 0.91, z), C.rockTop);
}
function lotus(p: Piece, x: number, z: number, r: number, h: number) {
  p.cone(x, z, r * 0.06, r * 0.05, -0.1, h * 0.8, 5, C.stem, true);
  p.cone(x, z, r * 0.06, r * 0.26, h * 0.8, h * 0.92, 6, C.stem, true, true);
  p.add(new THREE.ConeGeometry(r, h * 0.06, 14, 1, true).rotateX(Math.PI).translate(x, h * 0.95, z), C.cap, true);
  p.disc(x, h * 0.985, z, r * 0.9, 14, C.cap, true);
  p.disc(x, h, z, r * 0.2, 8, C.capCore, true);
}
function tube(p: Piece, x: number, z: number, r: number, h: number) {
  p.cone(x, z, r, r * 0.9, -0.1, h * 0.85, 6, C.tube, true);
  p.cone(x, z, r * 0.9, r * 1.7, h * 0.85, h, 6, C.mouth, true, true);
}
function goblet(p: Piece, x: number, z: number, r: number, h: number) {
  p.cone(x, z, 0.02, 0.016, -0.1, h * 0.55, 4, C.goblet, true);
  p.cone(x, z, 0.02, r, h * 0.55, h, 6, C.goblet, true, true);
  p.disc(x, h * 0.9, z, r * 0.7, 6, C.gobletMouth, true);
}
function speckles(p: Piece, seed: number, r: number, count: number, y = 0.04) {
  for (let i = 0; i < count; i++) {
    const a = rand(seed, i) * Math.PI * 2, d = r * (0.3 + rand(seed, i + 50) * 0.7);
    p.add(new THREE.TetrahedronGeometry(0.035).translate(Math.cos(a) * d, y, Math.sin(a) * d), C.speck, true);
  }
}
function moss(p: Piece, r: number, h: number) { p.add(new THREE.SphereGeometry(r, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h / r, 1).translate(0, -0.03, 0), C.moss); }
function plinth(p: Piece, r: number, h: number, sides = 8) {
  p.cone(0, 0, r, r * 0.95, -0.12, h * 0.5, sides, C.stone);
  p.cone(0, 0, r * 0.8, r * 0.76, h * 0.5, h, sides, C.stoneLit);
}

export function createNacrePiece(kind: KitKind, variant: number): THREE.BufferGeometry {
  const p = new Piece(), seed = kind.length * 71 + variant * 307;
  switch (kind) {
    case 'mireRock':
      pinnacle(p, 0, 0, 0.3, 1, seed);
      for (let i = 0; i < 4 + variant; i++) { const a = i * 2.4, d = 0.3 + rand(seed, i) * 0.12; pinnacle(p, Math.cos(a) * d, Math.sin(a) * d, 0.17, 0.35 + rand(seed, i + 9) * 0.4, seed + i); }
      moss(p, 0.6, 0.06); speckles(p, seed, 0.6, 8);
      break;
    case 'mireCrag':
      pinnacle(p, 0, 0, 0.36, 2.4, seed);
      for (let i = 0; i < 6 + variant; i++) { const a = i * 2.4, d = 0.35 + rand(seed, i) * 0.33; pinnacle(p, Math.cos(a) * d, Math.sin(a) * d, 0.26, 0.8 + rand(seed, i + 9) * 1.1, seed + i); }
      moss(p, 0.92, 0.08); speckles(p, seed, 0.9, 12);
      break;
    case 'lotus':
      if (variant === 0) lotus(p, 0, 0, 0.74, 1);
      else if (variant === 1) { lotus(p, -0.18, -0.08, 0.6, 1); lotus(p, 0.45, 0.3, 0.3, 0.55); }
      else { lotus(p, 0.05, -0.22, 0.48, 1); lotus(p, -0.42, 0.25, 0.32, 0.66); lotus(p, 0.42, 0.32, 0.26, 0.45); }
      break;
    case 'lotusGrove':
      lotus(p, 0.08, -0.15, 0.62, 1); lotus(p, -0.5, 0.12, 0.38, 0.62); lotus(p, 0.42, 0.42, 0.3, 0.45);
      for (let i = 0; i < 3; i++) tube(p, -0.2 + i * 0.15, 0.55, 0.045, 0.35 + i * 0.08);
      moss(p, 0.88, 0.05); speckles(p, seed, 0.85, 10);
      break;
    case 'glassTube':
      for (let i = 0; i < 4 + variant; i++) { const a = i * 2.4, d = i ? 0.1 + 0.24 * Math.sqrt(i / 6) : 0; tube(p, Math.cos(a) * d, Math.sin(a) * d, 0.055, i ? 0.45 + rand(seed, i) * 0.4 : 1); }
      break;
    case 'goblet':
      for (let i = 0; i < 4 + variant * 2; i++) { const a = i * 2.4 + 0.5, d = i ? 0.12 + 0.22 * Math.sqrt(i / 6) : 0; goblet(p, Math.cos(a) * d, Math.sin(a) * d, i ? 0.11 : 0.14, i ? 0.5 + rand(seed, i) * 0.35 : 1); }
      break;
    case 'lilyRaft':
      for (let i = 0; i < 4 + variant * 2; i++) {
        const a = i * 2.4, d = i ? 0.25 + rand(seed, i) * 0.4 : 0, r = i ? 0.12 + rand(seed, i + 7) * 0.14 : 0.3;
        p.disc(Math.cos(a) * d, 0.012 + (i % 3) * 0.004, Math.sin(a) * d, r, 9, i % 2 ? C.padRim : C.pad);
      }
      break;
    case 'mossTuft':
      moss(p, 0.42, 0.22); speckles(p, seed, 0.5, 10, 0.12);
      break;
    case 'ruinTower':
      plinth(p, 0.95, 0.58);
      p.cone(0, 0, 0.5, 0.38, 0.58, variant ? 2.2 : 2.55, 8, C.stone);
      if (!variant) { p.cone(0, 0, 0.4, 0.3, 2.55, 2.75, 8, C.stoneLit); p.add(new THREE.ConeGeometry(0.12, 0.25, 6).translate(0, 2.88, 0), C.stone); }
      p.box(0.075, 1.3, 0.02, 0, 1.45, 0.46, C.orange, true);
      break;
    case 'ruinFort':
      plinth(p, 1.45, 0.34);
      p.box(1, 0.7, 0.64, 0, 0.7, -0.42, C.stone);
      for (const side of [-1, 1]) { p.box(0.46, variant && side > 0 ? 1.3 : 2.3, 0.44, side * 0.55, variant && side > 0 ? 0.99 : 1.49, -0.55, C.stone); p.box(0.05, 1.2, 0.02, side * 0.55, 1.2, -0.32, C.orange, true); }
      p.add(new THREE.RingGeometry(0.42, 0.5, 16).rotateX(-Math.PI / 2).translate(0, 0.41, 0.5), C.cyan, true);
      break;
    case 'ruinRing':
      plinth(p, 1.15, 0.24, 16);
      p.add(new THREE.RingGeometry(0.64, 0.74, 16).rotateX(-Math.PI / 2).translate(0, 0.245, 0), C.cyan, true);
      p.cone(0, 0, 0.3, 0.28, 0.24, 0.34, 12, C.stone); p.disc(0, 0.343, 0, 0.14, 10, C.capCore, true);
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; p.box(0.12, 0.2, 0.12, Math.cos(a) * 0.86, 0.33, Math.sin(a) * 0.86, C.stone); p.box(0.07, 0.03, 0.07, Math.cos(a) * 0.86, 0.445, Math.sin(a) * 0.86, C.amber, true); }
      break;
    case 'ruinBridge':
      for (const [z0, z1] of variant ? [[-1.5, -0.4], [0.32, 1.5]] : [[-1.5, 1.5]]) {
        p.box(0.52, 0.14, z1 - z0, 0, 0.6, (z0 + z1) / 2, C.stone);
        p.box(0.15, 0.012, (z1 - z0) * 0.9, 0, 0.68, (z0 + z1) / 2, C.panel, true);
      }
      for (const z of [-0.95, 0.95]) p.box(0.28, 0.65, 0.34, 0, 0.2, z, C.stone);
      break;
    case 'ruinPillars':
      for (const [x, z, h] of variant ? [[-0.18, 0, 1], [0.3, 0.12, 0.62]] : [[0, 0, 1], [0.42, -0.22, 0.72], [-0.32, -0.28, 0.5]]) p.box(0.32, h + 0.12, 0.32, x, (h - 0.12) / 2, z, C.stone);
      p.box(0.04, 0.6, 0.02, variant ? -0.18 : 0, 0.5, 0.17, C.orange, true);
      moss(p, 0.55, 0.05);
      break;
    case 'ruinRubble':
      for (let i = 0; i < 6 + variant * 2; i++) { const a = rand(seed, i) * 6.3, d = rand(seed, i + 20) * 0.55; p.box(0.2, 0.14, 0.16, Math.cos(a) * d, 0.04, Math.sin(a) * d, C.stone, false, a); }
      moss(p, 0.65, 0.05);
      break;
    default: throw new Error(`Not a Nacre kit piece: ${kind}`);
  }
  return p.finish();
}
