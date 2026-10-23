import * as THREE from 'three';
import { WORLD_PAINT_GLSL, setWorldPaint, worldGlow, worldPaintUniforms } from './world-paint';
import { applySurfaceFinish } from './surface-finish';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOE_FOOTPRINT, KHEPRI_CLIFF_KINDS, KIT, KIT_KINDS, MODULES, NACRE_KIT_KINDS, SHARED_NODES, VESPER_CLIFF_KINDS, VESPER_KIT_KINDS, kitNodeName, type KitKind, type PlanetId, type SharedNode } from '../world/terrain';
import { createScenicProp, type Materials, type PropKind } from './models';
import { createNacrePiece } from './nacre-kit';

/** Kit geometry by node name (`basalt_clump_0` …). Attributes: position, normal, color, glow. */
export type KitGeometries = Map<string, THREE.BufferGeometry>;

const linear = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
const TOP = linear(0xa86638), SIDE = linear(0x4a3a2f), CREVICE = linear(0x2e241f);
const ROCK = linear(0x55402f), CRYSTAL = linear(0x2fe0d4);

function rand(seed: number, i: number): number {
  let n = Math.imul(seed ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(i + 0x51, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 15), 0xc2b2ae35);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

/** Collects flat-shaded triangles with per-vertex colour and glow, wound to face `outward`. */
class Builder {
  positions: number[] = []; colors: number[] = []; glow: number[] = [];
  private readonly ab = new THREE.Vector3(); private readonly ac = new THREE.Vector3();
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, shine: number, outward: THREE.Vector3) {
    const normal = this.ab.subVectors(b, a).cross(this.ac.subVectors(c, a));
    const [p, q] = normal.dot(outward) < 0 ? [c, b] : [b, c];
    this.positions.push(a.x, a.y, a.z, p.x, p.y, p.z, q.x, q.y, q.z);
    for (let i = 0; i < 3; i++) { this.colors.push(color.r, color.g, color.b); this.glow.push(shine); }
  }
  /** Polygonal column from y0 to top with a small bevel and optionally tilted (broken) cap. */
  prism(x: number, z: number, radius: number, top: number, sides: number, turn: number, tilt: number, y0 = -0.12, crack = false) {
    const ring = (y: number, r: number, i: number, slope: number) => {
      const a = turn + i / sides * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      return new THREE.Vector3(px, y + (px - x) * slope, pz);
    };
    const bevel = Math.min(0.04, radius * 0.18), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < sides; i++) {
      const mid = turn + (i + 0.5) / sides * Math.PI * 2, out = new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid));
      const a0 = ring(y0, radius, i, 0), a1 = ring(y0, radius, i + 1, 0);
      const b0 = ring(top - bevel, radius, i, tilt), b1 = ring(top - bevel, radius, i + 1, tilt);
      const mineral = crack && i === 0;
      const side = SIDE.clone().lerp(CREVICE, 0.2 + 0.45 * rand(sides * 31 + Math.round(x * 97 + z * 41), i));
      // Lower half of each face darkened as baked crevice occlusion.
      const low = new THREE.Vector3().lerpVectors(a0, b0, 0.45), low1 = new THREE.Vector3().lerpVectors(a1, b1, 0.45);
      const base = mineral ? CRYSTAL : side.clone().lerp(CREVICE, 0.4);
      this.tri(a0, a1, low1, base, mineral ? 1 : 0, out); this.tri(a0, low1, low, base, mineral ? 1 : 0, out);
      this.tri(low, low1, b1, mineral ? CRYSTAL : side, mineral ? 1 : 0, out); this.tri(low, b1, b0, mineral ? CRYSTAL : side, mineral ? 1 : 0, out);
      const c0 = ring(top, radius - bevel, i, tilt), c1 = ring(top, radius - bevel, i + 1, tilt);
      const rim = SIDE.clone().lerp(TOP, 0.6), slant = out.clone().add(up);
      this.tri(b0, b1, c1, rim, 0, slant); this.tri(b0, c1, c0, rim, 0, slant);
      this.tri(new THREE.Vector3(x, top, z), c1, c0, TOP, 0, up);
    }
  }
  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('glow', new THREE.Float32BufferAttribute(this.glow, 1));
    // Non-indexed triangles: computed vertex normals are flat face normals (hard basalt edges).
    geometry.computeVertexNormals();
    return geometry;
  }
}

/**
 * Stand-in for a columnar basalt cliff wall (the cliff kit's `cliff_wall` contract: x ±1.05, z −0.6…0.35, base y 0,
 * top exactly 1): a back block filling the slope and a row of hexagonal columns of uneven height in front.
 */
function cliffWallStandIn(variant: number): THREE.BufferGeometry {
  const builder = new Builder(), seed = 9001 + variant * 31;
  // (About 280 triangles, near the shipped pieces' budget, so a missing kit never strains the terrain budget.)
  for (let i = 0; i < 3; i++) builder.prism(-0.7 + i * 0.7, -0.3, 0.32, 0.97 + rand(seed, i) * 0.03, 5, rand(seed, i + 9) * 3, 0, 0);
  for (let i = 0; i < 5; i++) {
    const x = -0.84 + i * 0.42 + (rand(seed, i + 20) - 0.5) * 0.06, z = 0.06 + (rand(seed, i + 30) - 0.5) * 0.16;
    builder.prism(x, z, 0.2 + rand(seed, i + 40) * 0.04, i === 2 ? 1 : 0.72 + rand(seed, i + 50) * 0.26, 5, rand(seed, i + 60) * 3, 0, 0);
  }
  return builder.geometry();
}

function fallbackPiece(kind: KitKind, variant: number): THREE.BufferGeometry {
  if (kind === 'cliffWall') return cliffWallStandIn(variant);
  if ((VESPER_KIT_KINDS as readonly string[]).includes(kind) || kind === 'iceWall') return vesperFallbackPiece(kind, variant);
  if ((NACRE_KIT_KINDS as readonly string[]).includes(kind)) return createNacrePiece(kind, variant);
  const builder = new Builder(), seed = (KIT_KINDS as readonly string[]).indexOf(kind) * 101 + variant * 13;
  const cluster = (count: number, spreadX: number, spreadZ: number, minTop: number, size: number) => {
    for (let i = 0; i < count; i++) {
      const u = i === 0 ? 0 : rand(seed, i + 2) * 2 - 1, w = i === 0 ? 0 : rand(seed, i + 30) * 2 - 1;
      const top = i === 0 ? 1 : minTop + rand(seed, i + 40) * (0.97 - minTop);
      const tilt = rand(seed, i + 60) < 0.25 ? (rand(seed, i + 80) - 0.5) * 0.5 : 0;
      builder.prism(u * spreadX, w * spreadZ, size + rand(seed, i + 20) * 0.1, top, 5 + (i % 3 === 0 ? 1 : 0),
        rand(seed, i + 100) * 3, tilt, -0.12, kind === 'clump' && i === 2 && variant % 2 === 0);
    }
  };
  const lump = (radius: number, squash: number, tint: THREE.Color) => {
    const rock = new THREE.DodecahedronGeometry(radius, 0), p = rock.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), center = new THREE.Vector3();
    const warp = (v: THREE.Vector3) => {
      const k = Math.round((v.x + 1) * 37 + (v.y + 1) * 71 + (v.z + 1) * 113), jitter = 0.82 + rand(seed, k) * 0.3;
      return v.set(v.x * jitter, Math.max(-0.08, v.y * squash * jitter + radius * squash * 0.5), v.z * jitter);
    };
    for (let i = 0; i < p.count; i += 3) {
      warp(a.fromBufferAttribute(p, i)); warp(b.fromBufferAttribute(p, i + 1)); warp(c.fromBufferAttribute(p, i + 2));
      center.copy(a).add(b).add(c).divideScalar(3);
      builder.tri(a.clone(), b.clone(), c.clone(), center.y > radius * squash * 0.7 ? tint.clone().lerp(TOP, 0.35) : tint, 0,
        center.clone().sub(new THREE.Vector3(0, radius * squash * 0.4, 0)));
    }
    rock.dispose();
  };
  if (kind === 'hoodoo') {
    // Eroded stem with a balanced, wider basalt cap.
    builder.prism(0, 0, 0.17, 0.72, 6, variant, 0);
    builder.prism(0.03, 0.02, 0.36 + variant * 0.05, 1, 6, variant + 0.4, variant ? 0.12 : 0, 0.7);
    return builder.geometry();
  }
  if (kind === 'rosette') {
    // Fan of columns stepping down outward from a tall core.
    builder.prism(0, 0, 0.17, 1, 6, 0, 0);
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * Math.PI * 2 + rand(seed, i) * 0.3, ring = i % 2 ? 0.62 : 0.36;
      builder.prism(Math.cos(angle) * ring, Math.sin(angle) * ring, 0.14, ring > 0.5 ? 0.42 : 0.7, 5, angle, 0.25);
    }
    return builder.geometry();
  }
  if (kind === 'crystalSpire') {
    for (let i = 0; i < 4 + variant; i++) {
      const angle = i * 2.3 + variant, offset = i === 0 ? 0 : 0.22, height = i === 0 ? 1 : 0.45 + rand(seed, i) * 0.4;
      const x = Math.cos(angle) * offset, z = Math.sin(angle) * offset, r = i === 0 ? 0.16 : 0.09;
      const tip = new THREE.Vector3(x * 1.6, height, z * 1.6);
      for (let k = 0; k < 5; k++) {
        const a0 = k / 5 * Math.PI * 2 + angle, a1 = (k + 1) / 5 * Math.PI * 2 + angle, am = (a0 + a1) / 2;
        builder.tri(new THREE.Vector3(x + Math.cos(a0) * r, -0.1, z + Math.sin(a0) * r), new THREE.Vector3(x + Math.cos(a1) * r, -0.1, z + Math.sin(a1) * r),
          tip, CRYSTAL, 1, new THREE.Vector3(Math.cos(am), 0.2, Math.sin(am)));
      }
    }
    return builder.geometry();
  }
  if (kind === 'clump') cluster(5 + Math.floor(rand(seed, 0) * 4), 0.42, 0.42, 0.55, 0.15);
  else if (kind === 'spire') cluster(3 + Math.floor(rand(seed, 0) * 3), 0.22, 0.22, 0.45, 0.14);
  else if (kind === 'wall') cluster(8 + Math.floor(rand(seed, 0) * 5), 1.05, 0.35, 0.5, 0.15);
  else if (kind === 'column') builder.prism(0, 0, 0.22 + variant * 0.025, 1, variant === 1 ? 5 : 6, variant, variant === 2 ? 0.25 : 0);
  else if (kind === 'rock') lump(0.42, 0.55, ROCK);
  else if (kind === 'boulder') lump(0.55, 0.75, ROCK);
  else if (kind === 'fallen') {
    // Toppled columns: prisms laid along x, built upright then rotated onto their side.
    const lying = new Builder();
    lying.prism(0, 0, 0.2, 0.7, 6, variant, 0, -0.7);
    lying.prism(0.32, 0.05, 0.17, 0.2, 5, variant + 1, 0.2, -0.3);
    const geometry = lying.geometry().rotateZ(Math.PI / 2).translate(0, 0.17, 0);
    return geometry;
  } else {
    const shards = 3 + variant;
    for (let i = 0; i < shards; i++) {
      const angle = i * 2.1 + variant, lean = i === 0 ? 0 : 0.28, x = Math.cos(angle) * (i === 0 ? 0 : 0.16), z = Math.sin(angle) * (i === 0 ? 0 : 0.16);
      const height = i === 0 ? 0.8 : 0.35 + rand(seed, i) * 0.3, r = 0.08 + rand(seed, i + 9) * 0.05;
      const tip = new THREE.Vector3(x + Math.cos(angle) * lean * height, height, z + Math.sin(angle) * lean * height);
      for (let k = 0; k < 4; k++) {
        const a0 = k / 4 * Math.PI * 2 + angle, a1 = (k + 1) / 4 * Math.PI * 2 + angle, am = (a0 + a1) / 2;
        const p0 = new THREE.Vector3(x + Math.cos(a0) * r, -0.05, z + Math.sin(a0) * r);
        const p1 = new THREE.Vector3(x + Math.cos(a1) * r, -0.05, z + Math.sin(a1) * r);
        builder.tri(p0, p1, tip, CRYSTAL, 1, new THREE.Vector3(Math.cos(am), 0.3, Math.sin(am)));
      }
    }
  }
  return builder.geometry();
}

const SNOW = linear(0xe9eef3), SNOW_SHADE = linear(0xb9c8d8), ICE = linear(0x8fc3e6), ICE_DEEP = linear(0x2e6f9e), CHARCOAL = linear(0x2a2d31);
/** Code-built Vesper stand-ins (ice, snow and rock lumps at contract size) until vesper-kit.glb loads. */
function vesperFallbackPiece(kind: KitKind, variant: number): THREE.BufferGeometry {
  const builder = new Builder(), seed = (VESPER_KIT_KINDS as readonly string[]).indexOf(kind) * 211 + variant * 17 + 5;
  const up = new THREE.Vector3(0, 1, 0);
  /** A faceted slab: an irregular polygon footprint extruded from y0 to top, ice walls and a snow top. */
  const slab = (cx: number, cz: number, rx: number, rz: number, y0: number, top: number, sides: number, wall: THREE.Color, cap: THREE.Color) => {
    const ring = Array.from({ length: sides }, (_, i) => {
      const a = i / sides * Math.PI * 2 + rand(seed, i) * 0.4, k = 0.75 + rand(seed, i + 40) * 0.3;
      return new THREE.Vector3(cx + Math.cos(a) * rx * k, 0, cz + Math.sin(a) * rz * k);
    });
    const center = new THREE.Vector3(cx, top, cz);
    for (let i = 0; i < sides; i++) {
      const a = ring[i], b = ring[(i + 1) % sides], out = new THREE.Vector3((a.x + b.x) / 2 - cx, 0, (a.z + b.z) / 2 - cz);
      const a0 = new THREE.Vector3(a.x, y0, a.z), b0 = new THREE.Vector3(b.x, y0, b.z), a1 = new THREE.Vector3(a.x, top, a.z), b1 = new THREE.Vector3(b.x, top, b.z);
      const shade = wall.clone().lerp(ICE_DEEP, rand(seed, i + 80) * 0.35);
      builder.tri(a0, b0, b1, shade, 0, out); builder.tri(a0, b1, a1, shade, 0, out);
      builder.tri(a1, b1, center, cap, 0, up);
    }
  };
  switch (kind) {
    case 'iceWall':
      // Stand-in ice-shelf wall: blocky slabs across the segment, snow-capped, the middle one reaching the top.
      for (let i = 0; i < 4; i++) slab(-0.78 + i * 0.52, -0.12 + rand(seed, i + 7) * 0.08, 0.3, 0.42, 0, i === 1 ? 1 : 0.84 + rand(seed, i + 9) * 0.15, 5, ICE, SNOW);
      break;
    case 'iceCliff':
      for (let i = 0; i < 4; i++) slab(-0.9 + i * 0.6, rand(seed, i + 7) * 0.1, 0.36, 0.45, -0.15, 0.82 + rand(seed, i + 9) * 0.18, 5, ICE, SNOW);
      break;
    case 'serac': slab(0, 0, 0.36, 0.28, -0.12, 1, 5, ICE, SNOW); break;
    case 'iceSpire': slab(0, 0, 0.25, 0.24, -0.12, 0.55, 5, ICE, SNOW); slab(0.03, 0.02, 0.14, 0.13, 0.5, 1, 4, ICE, SNOW); break;
    case 'iceberg': slab(0, 0, 0.62, 0.52, -0.55, 0.5 + variant * 0.1, 7, ICE, SNOW); break;
    case 'floe': case 'floePairA': case 'floePairB': case 'floeTripleC': {
      // Sized like the node it stands in for, so placement spacing holds before the kit loads.
      const [hx, hz] = FLOE_FOOTPRINT[kitNodeName(kind, variant)] ?? [0.5, 0.5];
      slab(0, 0, hx, hz, -0.15, 0.09, 6 + (variant % 3), ICE, SNOW); break;
    }
    case 'ridge': for (let i = 0; i < 4; i++) slab(-0.75 + i * 0.5, 0, 0.3, 0.32, -0.1, 0.2 + rand(seed, i) * 0.15, 4, SNOW_SHADE, SNOW); break;
    case 'drift': slab(0, 0, 0.82, 0.48, -0.12, 0.3, 8, SNOW_SHADE, SNOW); break;
    case 'outcrop': slab(0, 0, 0.4, 0.32, -0.12, 0.6 + variant * 0.1, 6, CHARCOAL, SNOW); break;
    default: slab(0, 0, 0.3, 0.3, -0.12, 0.95, 6, CHARCOAL, SNOW_SHADE); break;
  }
  return builder.geometry();
}

/** Simple procedural stand-ins so the game renders before (or without) the Blender kits. */
export function createFallbackKit(): KitGeometries {
  const kit: KitGeometries = new Map();
  for (const kind of [...KIT_KINDS, ...VESPER_KIT_KINDS, ...NACRE_KIT_KINDS, ...KHEPRI_CLIFF_KINDS, ...VESPER_CLIFF_KINDS]) for (let v = 0; v < KIT[kind].variants; v++) {
    const geometry = normalizeKitGeometry(fallbackPiece(kind, v), kind);
    if (geometry) kit.set(kitNodeName(kind, v), geometry);
  }
  return kit;
}

function toFloat3(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, count: number, tint: THREE.Color): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3] = attribute.getX(i) * tint.r; out[i * 3 + 1] = attribute.getY(i) * tint.g; out[i * 3 + 2] = attribute.getZ(i) * tint.b;
  }
  return out;
}

/**
 * Converts one glTF node (possibly several primitives) into a single geometry in node space with
 * position, normal, linear `color` (COLOR_0 × base colour) and `glow` (emissive mask: faces whose
 * material name matches `emissive`, weighted by vertex brightness so crystal shards fade to the base).
 */
export function extractNode(node: THREE.Object3D, emissive: RegExp, allEmissive = false): THREE.BufferGeometry | null {
  node.updateMatrixWorld(true);
  const inverse = node.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
  node.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
    const glowing = allEmissive || emissive.test(material?.name ?? '');
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const position = source.getAttribute('position');
    if (!position) { source.dispose(); return; }
    const count = position.count, part = new THREE.BufferGeometry(), white = new THREE.Color(1, 1, 1);
    part.setAttribute('position', new THREE.Float32BufferAttribute(toFloat3(position, count, white), 3));
    const tint = material?.color ? material.color.clone() : white;
    const sourceColor = source.getAttribute('color'), glow = new Float32Array(count);
    if (sourceColor) {
      part.setAttribute('color', new THREE.Float32BufferAttribute(toFloat3(sourceColor, count, tint), 3));
      for (let i = 0; i < count; i++) glow[i] = glowing ? Math.max(sourceColor.getX(i), sourceColor.getY(i), sourceColor.getZ(i)) : 0;
    } else {
      const flat = glowing ? tint : (tint.getHex() !== 0xffffff ? tint : SIDE);
      part.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [flat.r, flat.g, flat.b]).flat(), 3));
      glow.fill(glowing ? 1 : 0);
    }
    part.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    const local = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    part.applyMatrix4(local);
    const normal = source.getAttribute('normal');
    if (normal) {
      part.setAttribute('normal', new THREE.Float32BufferAttribute(toFloat3(normal, count, white), 3));
      part.getAttribute('normal').applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(local));
    } else part.computeVertexNormals();
    parts.push(part); source.dispose();
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (merged) { merged.computeBoundingBox(); merged.computeBoundingSphere(); }
  return merged;
}

/** Terrain kit node in node space, normalized to its contract bounds. */
export function extractKitNode(node: THREE.Object3D, kind: KitKind, emissive = /mineral/i): THREE.BufferGeometry | null {
  const geometry = extractNode(node, emissive, kind === 'crystal');
  return geometry ? normalizeKitGeometry(geometry, kind) : null;
}

/** Enforce the contract bounds so a stray export can never break the height cap. */
function normalizeKitGeometry(geometry: THREE.BufferGeometry, kind: KitKind): THREE.BufferGeometry | null {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, limit = KIT[kind];
  const top = box.max.y, halfX = Math.max(-box.min.x, box.max.x), halfZ = Math.max(-box.min.z, box.max.z);
  if (top <= 0 || !Number.isFinite(top)) { geometry.dispose(); return null; }
  const sy = limit.exactTop || top > limit.height ? limit.height / top : 1;
  const sxz = Math.min(1, limit.halfX / halfX, limit.halfZ / halfZ);
  if (sy !== 1 || sxz !== 1) geometry.scale(sxz, sy, sxz);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

async function loadNodes(url: string, names: readonly string[], extract: (node: THREE.Object3D, name: string) => THREE.BufferGeometry | null) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const found: KitGeometries = new Map();
  for (const name of names) {
    let node: THREE.Object3D | undefined;
    gltf.scene.traverse(object => { if (!node && object.name === name) node = object; });
    const geometry = node ? extract(node, name) : null;
    if (geometry) found.set(name, geometry);
  }
  gltf.scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose());
  });
  return found;
}

/** Loads the Blender terrain kit; nodes it lacks keep their fallback. */
export function loadKhepriKit(url: string): Promise<KitGeometries> { return loadKit(url, KIT_KINDS); }
/** Loads Vesper's ice kit (vesper-kit.glb); nodes it lacks keep their fallback. */
export function loadVesperKit(url: string): Promise<KitGeometries> { return loadKit(url, VESPER_KIT_KINDS); }
/**
 * Loads Nacre's kit (nacre-kit.glb, art/nacre-kit/README.md); nodes it lacks keep their stand-in. Faces of the
 * `nacre_glow` material glow with their own COLOR_0 (weight = its brightest channel; see the Nacre kit look).
 */
export function loadNacreKit(url: string): Promise<KitGeometries> { return loadKit(url, NACRE_KIT_KINDS, /glow/i); }
/**
 * Loads a world's cliff kit (`<world>/cliff-kit.glb`, docs/26 §11): Khepri's columnar basalt walls (also Luna's) or
 * Vesper's ice-shelf walls. Nodes it lacks keep their stand-ins.
 */
export function loadCliffKit(url: string, planet: 'khepri' | 'vesper'): Promise<KitGeometries> {
  return loadKit(url, planet === 'vesper' ? VESPER_CLIFF_KINDS : KHEPRI_CLIFF_KINDS);
}
function loadKit(url: string, kinds: readonly KitKind[], emissive?: RegExp): Promise<KitGeometries> {
  const names = kinds.flatMap(kind => Array.from({ length: KIT[kind].variants }, (_, v) => kitNodeName(kind, v)));
  // Longest prefix first: `ice_cliff_0` must not match a shorter prefix.
  const byPrefix = [...kinds].sort((a, b) => KIT[b].prefix.length - KIT[a].prefix.length);
  return loadNodes(url, names, (node, name) => extractKitNode(node, byPrefix.find(kind => name.startsWith(`${KIT[kind].prefix}_`))!, emissive));
}

/* ---------------------------------------------------------------- infrastructure (docs/13 §3b) */

/** Real-size infrastructure nodes (x × height × z) and the code-built stand-in each falls back to. */
export const INFRA_NODES: Readonly<Record<string, { kind?: PropKind; size: readonly [number, number, number] }>> = {
  infra_landing_pad: { kind: 'landingPad', size: [5.4, 0.3, 6.2] },
  infra_refinery: { kind: 'refinery', size: [4.1, 1.6, 5.1] },
  infra_relay: { kind: 'relay', size: [0.85, 1.6, 1.0] },
  infra_cargo_0: { kind: 'cargo', size: [1.05, 0.65, 1.75] },
  infra_cargo_1: { kind: 'cargo', size: [1.05, 0.65, 1.75] },
  infra_cargo_2: { kind: 'cargo', size: [1.05, 0.65, 1.75] },
  infra_track_segment: { kind: 'track', size: [1.35, 0.05, 2.0] },
  infra_drill_rig: { size: [1.5, 1.96, 1.32] }, infra_habitat_0: { size: [1.38, 0.78, 0.74] }, infra_habitat_1: { size: [1.32, 0.78, 1.02] },
  infra_comm_dish: { size: [1.0, 1.25, 1.0] }, infra_solar_array: { size: [2.2, 0.45, 0.74] }, infra_light_mast: { size: [0.38, 1.5, 0.36] },
  infra_silo: { size: [0.94, 1.75, 0.94] }, wreck_0: { size: [2.36, 0.39, 1.36] }, wreck_1: { size: [2.12, 0.54, 1.46] },
};
/** Vesper infrastructure nodes (vesper-infra.glb, art/vesper-infra/README.md): real-size bounds x × height × z. */
export const VESPER_INFRA_NODES: Readonly<Record<string, { size: readonly [number, number, number] }>> = {
  vesper_radiator_array: { size: [2.0, 0.86, 0.76] }, vesper_missile_site: { size: [1.74, 1.79, 2.2] }, vesper_cannon_site: { size: [1.66, 0.89, 2.42] },
  vesper_cryo_dome: { size: [1.58, 0.99, 1.82] }, vesper_habitat_0: { size: [1.4, 0.94, 1.56] }, vesper_habitat_1: { size: [1.1, 0.84, 0.96] },
  vesper_pier_segment: { size: [1.4, 1.24, 2.0] }, vesper_crane: { size: [1.26, 2.15, 2.3] }, vesper_comm_needle: { size: [0.74, 2.21, 0.7] },
  vesper_ice_hauler: { size: [1.1, 0.69, 1.96] }, vesper_icebreaker: { size: [1.04, 1.62, 3.32] },
};

const GRAPHITE = linear(0x3a3c3e), OCHRE = linear(0x9a6a3a), RUST = linear(0x7a4a30), AMBER = linear(0xffb060);
/** Primitive stand-ins for the settlement pieces (vertex colour + amber lamp glow), at contract size. */
function primitiveInfra(name: string): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, color: THREE.Color, lamp = 0) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, count = g.getAttribute('position').count;
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(count).fill(lamp), 1));
    parts.push(g);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color) => add(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color);
  const lamp = (x: number, y: number, z: number) => add(new THREE.SphereGeometry(0.05, 6, 4).translate(x, y, z), AMBER, 1);
  switch (name) {
    case 'infra_drill_rig':
      box(1.3, 0.25, 1.1, 0, 0, 0, GRAPHITE);
      for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [0, 0.4]]) add(new THREE.CylinderGeometry(0.04, 0.06, 1.7, 5).translate(x * 0.6, 1.1, z * 0.6), OCHRE);
      box(0.3, 0.4, 0.3, 0, 1.5, 0, GRAPHITE); lamp(0, 1.92, 0); break;
    case 'infra_habitat_0': case 'infra_habitat_1':
      add(new THREE.CylinderGeometry(0.34, 0.34, name.endsWith('0') ? 1.3 : 1.2, 10).rotateZ(Math.PI / 2).translate(0, 0.38, 0), OCHRE);
      box(0.4, 0.2, 0.3, 0, 0.62, 0, GRAPHITE); lamp(0.5, 0.6, 0.3); break;
    case 'infra_comm_dish':
      add(new THREE.CylinderGeometry(0.06, 0.12, 0.8, 6).translate(0, 0.4, 0), GRAPHITE);
      add(new THREE.SphereGeometry(0.48, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-0.9).translate(0, 0.95, 0), OCHRE); lamp(0, 1.2, 0); break;
    case 'infra_solar_array':
      box(2.1, 0.06, 0.7, 0, 0.32, 0, linear(0x22303a)); box(0.08, 0.32, 0.08, -0.8, 0, 0, GRAPHITE); box(0.08, 0.32, 0.08, 0.8, 0, 0, GRAPHITE); break;
    case 'infra_light_mast':
      add(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 6).translate(0, 0.7, 0), GRAPHITE); box(0.3, 0.06, 0.12, 0, 1.4, 0, GRAPHITE); lamp(-0.1, 1.46, 0); lamp(0.1, 1.46, 0); break;
    case 'infra_silo':
      add(new THREE.CylinderGeometry(0.42, 0.42, 1.45, 12).translate(0, 0.73, 0), OCHRE);
      add(new THREE.ConeGeometry(0.42, 0.3, 12).translate(0, 1.6, 0), GRAPHITE); lamp(0, 1.72, 0); break;
    case 'khepri_processing_tower':
      // Stand-in landmark: a footed core with two columns and a stack, pipe stubs mid-face, a beacon at 3.5.
      box(3, 0.4, 3, 0, 0, 0, GRAPHITE); box(1.6, 2.2, 1.6, 0, 0.4, 0, OCHRE);
      add(new THREE.CylinderGeometry(0.42, 0.42, 2.7, 10).translate(-0.85, 1.75, 0.6), GRAPHITE);
      add(new THREE.CylinderGeometry(0.36, 0.36, 2.4, 10).translate(0.85, 1.6, -0.6), GRAPHITE);
      add(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 8).translate(0, 2.98, 0), RUST);
      for (const [x, z, ry] of [[0, -1.25, 0], [0, 1.25, 0], [1.25, 0, Math.PI / 2], [-1.25, 0, Math.PI / 2]] as const) {
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8).rotateX(Math.PI / 2).rotateY(ry).translate(x, 0.35, z), GRAPHITE);
      }
      lamp(0, 3.45, 0); break;
    case 'wreck_0': case 'wreck_1':
      box(1.8, 0.3, 0.9, 0, 0, 0, RUST); box(0.7, 0.18, 1.3, 0.4, 0.15, 0, GRAPHITE);
      add(new THREE.ConeGeometry(0.2, 0.5, 4).rotateZ(1.2).translate(-0.8, 0.3, 0.2), linear(0x2fe0d4), 0.6); break;
    default: return null;
  }
  const merged = mergeGeometries(parts); parts.forEach(part => part.dispose());
  if (merged) { merged.computeVertexNormals(); merged.computeBoundingBox(); merged.computeBoundingSphere(); }
  return merged;
}

/** Bakes the code-built props (one mesh per material) into single vertex-coloured geometries at real size. */
export function createFallbackInfra(materials: Materials): KitGeometries {
  const infra: KitGeometries = new Map();
  for (const name of DISTRICT_NODES) { const geometry = primitiveInfra(name); if (geometry) infra.set(name, geometry); }
  for (const [name, { kind, size }] of Object.entries(INFRA_NODES)) {
    if (!kind) { const geometry = primitiveInfra(name); if (geometry) infra.set(name, geometry); continue; }
    const model = createScenicProp(kind, materials), parts: THREE.BufferGeometry[] = [];
    model.updateMatrixWorld(true);
    model.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      const count = source.getAttribute('position').count, part = new THREE.BufferGeometry();
      part.setAttribute('position', source.getAttribute('position').clone());
      part.setAttribute('normal', source.getAttribute('normal').clone());
      const color = material.color, light = material instanceof THREE.MeshBasicMaterial ? 1 : 0;
      part.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
      part.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(count).fill(light), 1));
      part.applyMatrix4(mesh.matrixWorld); parts.push(part); source.dispose();
    });
    model.traverse(object => { if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose(); });
    const merged = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!merged) continue;
    merged.scale(size[0], size[1], size[2]); merged.computeBoundingBox(); merged.computeBoundingSphere();
    infra.set(name, merged);
  }
  return infra;
}

/** District-kit nodes (district-kit.glb, tools/blender/khepri_district_kit.py): the registry's 'district-kit' modules. */
export const DISTRICT_NODES: readonly string[] = Object.values(MODULES).filter(spec => spec.source === 'district-kit').map(spec => spec.node);
/** Loads the district kit (same materials as khepri-infra.glb). Missing nodes keep their code-built stand-in. */
export function loadDistrictKit(url: string): Promise<KitGeometries> {
  return loadNodes(url, DISTRICT_NODES, node => extractNode(node, /light/i));
}
/** Loads the modelled infrastructure kit; amber `khepri_light` faces glow. Missing nodes keep their fallback. */
export function loadKhepriInfra(url: string): Promise<KitGeometries> {
  return loadNodes(url, Object.keys(INFRA_NODES), node => extractNode(node, /light/i));
}
/** Loads Vesper's infrastructure (black ceramic, orange `vesper_glow` faces glow). Missing nodes keep their stand-in. */
export function loadVesperInfra(url: string): Promise<KitGeometries> {
  return loadNodes(url, Object.keys(VESPER_INFRA_NODES), node => extractNode(node, /glow/i));
}
/** Code-built Vesper infrastructure stand-ins: black ceramic boxes with orange glow strips, at real size. */
export function createFallbackVesperInfra(): KitGeometries {
  const infra: KitGeometries = new Map(), black = linear(0x15181b), pale = linear(0xd3dae1), glow = linear(0xff7a26);
  for (const [name, { size: [w, h, d] }] of Object.entries(VESPER_INFRA_NODES)) {
    const parts: THREE.BufferGeometry[] = [];
    const add = (geometry: THREE.BufferGeometry, color: THREE.Color, lamp = 0) => {
      const g = geometry.toNonIndexed(), count = g.getAttribute('position').count;
      g.deleteAttribute('uv');
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(count).fill(lamp), 1));
      parts.push(g);
    };
    const water = name === 'vesper_pier_segment' || name === 'vesper_icebreaker', y0 = water ? -0.6 : -0.05;
    add(new THREE.BoxGeometry(w * 0.9, (h + y0) * 0.7 - y0 * 0.7, d * 0.9).translate(0, y0 + ((h + y0) * 0.7 - y0 * 0.7) / 2, 0), black);
    add(new THREE.BoxGeometry(w * 0.5, h * 0.3, d * 0.5).translate(0, h * 0.85 - h * 0.15, 0), pale);
    add(new THREE.BoxGeometry(w * 0.92, 0.05, 0.05).translate(0, h * 0.5, d * 0.46), glow, 1);
    const merged = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (merged) { merged.computeVertexNormals(); merged.computeBoundingBox(); merged.computeBoundingSphere(); infra.set(name, merged); }
  }
  return infra;
}

/**
 * Placeholder ocean (docs/17 §1) until the graphics agent's water shader: vertex colours carry depth tint
 * (shallows → deep) and white foam near the waterline; `shore` and `depth` attributes stay on the mesh for a
 * real shader to use. Its own material, so it can be swapped wholesale.
 */
export function createWaterMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 });
  material.name = 'vesper_water_placeholder';
  return material;
}

/** Runtime detail maps derived from Poly Haven CC0 sources (see report / art/source/polyhaven). */
export interface KhepriTextures {
  groundDetail: THREE.Texture | null;
  basaltDetail: THREE.Texture | null; basaltNormal: THREE.Texture | null;
  /** Layered cliff rock (Poly Haven `cliff_side`, docs/26 §11) on Khepri's and Luna's walls: x along, y up the wall. */
  cliffDetail: THREE.Texture | null; cliffNormal: THREE.Texture | null;
}
const TEXTURE_FILES: Record<keyof KhepriTextures, string> = {
  groundDetail: 'khepri-ground-detail.jpg',
  basaltDetail: 'khepri-basalt-detail.jpg', basaltNormal: 'khepri-basalt-normal.jpg',
  cliffDetail: 'cliff-rock-detail.jpg', cliffNormal: 'cliff-rock-normal.jpg',
};
/** Vesper's fractured ice-wall maps (docs/26 §11), loaded with the planet's scenery (the terrain view's prepare). */
interface WallTextures { detail: THREE.Texture | null; normal: THREE.Texture | null }
const VESPER_WALL_FILES: Record<keyof WallTextures, string> = { detail: 'ice-wall-detail.jpg', normal: 'ice-wall-normal.jpg' };

/** Loads each map independently; a failed map stays null and its procedural fallback remains. */
export function loadKhepriTextures(base: string, anisotropy: number): Promise<KhepriTextures> {
  return loadDataTextures(base, TEXTURE_FILES, anisotropy);
}
async function loadDataTextures<K extends string>(base: string, files: Record<K, string>, anisotropy: number): Promise<Record<K, THREE.Texture | null>> {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(Object.entries<string>(files).map(async ([key, file]) => {
    try {
      const texture = await loader.loadAsync(`${base}${file}`);
      // Detail maps hold luminance ratios (0.5 = neutral) and normals hold vectors: both are data.
      texture.colorSpace = THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = anisotropy; texture.needsUpdate = true;
      return [key, texture] as const;
    } catch {
      return [key, null] as const;
    }
  }));
  return Object.fromEntries(entries) as Record<K, THREE.Texture | null>;
}

/**
 * Runtime-generated tileable data texture (0.5 = neutral):
 * R = procedural dust grain, the stand-in until/unless the Poly Haven detail map loads;
 * G = columnar-basalt top mosaic (jittered Voronoi cells, dark crevices) for mesa surfaces.
 */
/**
 * Vesper ground detail (runtime-generated, no external source): smooth wind-packed snow with soft sastrugi
 * ripples running with the prevailing wind and a very light grain, luminance only (mean 0.5, tileable over
 * the ground tile). No pebbles: snow must never read as sand.
 */
export function createSnowDetailTexture(): THREE.DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4), tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    // Integer frequencies keep the tile seamless; the warp makes the ripples wander like real sastrugi.
    const warp = 0.9 * Math.sin(tau * (2 * u - v)) + 0.5 * Math.sin(tau * (u + 3 * v) + 1.3);
    const ripple = Math.sin(tau * (5 * u + 8 * v) + warp), soft = Math.sin(tau * (2 * u + 3 * v) + 0.7 * warp);
    const patches = Math.sin(tau * (u + v)) * Math.sin(tau * (2 * u - v) + 0.4);
    const grain = (rand(131, y * size + x) - 0.5) * 0.035;
    const value = 0.5 + 0.018 * ripple * (0.6 + 0.4 * soft) + 0.018 * patches + grain * .6;
    const byte = Math.max(0, Math.min(255, Math.round(value * 255)));
    data.set([byte, byte, byte, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/**
 * Crack network for open ground (terrain version 16, after the concept's ice plains; runtime-generated, tileable, linear
 * data): R = polygonal plate cracks (jittered Voronoi edges about a ninth of the tile apart, warped so they run jagged,
 * each edge its own strength so the network breaks off in places), G = a finer crisscross of thin lines, patchy.
 * 0 = no crack, 1 = the darkest line core.
 */
export function createCrackTexture(): THREE.DataTexture {
  const size = 512, data = new Uint8Array(size * size * 4);
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  /** Tileable value noise over `period` cells of the tile. */
  const value = (period: number, x: number, y: number, salt: number) => {
    const gx = x / size * period, gy = y / size * period, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), v = (a: number, b: number) => rand(salt, wrap(a, period) * 977 + wrap(b, period));
    return (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) + (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy;
  };
  /** Voronoi edge distance (pixels, half of F2 − F1) on a jittered `grid`, and a strength for the edge found. */
  const cells = (grid: number, x: number, y: number, salt: number): [number, number] => {
    const cell = size / grid, cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let f1 = Infinity, f2 = Infinity, a = 0, b = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gi = wrap(cx + i, grid), gj = wrap(cy + j, grid), id = gj * grid + gi;
      const px = (cx + i + 0.1 + 0.8 * rand(salt, id)) * cell, py = (cy + j + 0.1 + 0.8 * rand(salt + 1, id)) * cell;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; b = a; f1 = d; a = id; } else if (d < f2) { f2 = d; b = id; }
    }
    return [(f2 - f1) / 2, rand(salt + 2, Math.min(a, b) * 4099 + Math.max(a, b))];
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Jagged runs: warp the lookup by a few pixels of tileable noise at two scales.
    const wx = x + (value(16, x, y, 301) - 0.5) * 9 + (value(48, x, y, 303) - 0.5) * 3;
    const wy = y + (value(16, x, y, 302) - 0.5) * 9 + (value(48, x, y, 304) - 0.5) * 3;
    const [plate, plateStrength] = cells(9, wx, wy, 311);
    const plates = (1 - smooth(0.6, 1.9, plate)) * smooth(0.18, 0.5, plateStrength) * (0.55 + 0.45 * plateStrength);
    const [fine, fineStrength] = cells(23, wx * 1.07 + 13, wy * 0.93 + 7, 321);
    const patch = smooth(0.42, 0.68, value(6, x, y, 331));
    const fines = (1 - smooth(0.35, 1.2, fine)) * smooth(0.45, 0.75, fineStrength) * patch;
    data.set([Math.round(plates * 255), Math.round(fines * 255), 0, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

export function createDetailTexture(): THREE.DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4);
  const lattice = (period: number, x: number, y: number, salt: number) => {
    const cell = size / period, gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v = (a: number, b: number) => rand(salt, ((a % period) + period) % period * 977 + ((b % period) + period) % period);
    return (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) + (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy;
  };
  const pebbles: [number, number, number][] = [];
  for (let i = 0; i < 140; i++) pebbles.push([rand(77, i) * size, rand(78, i) * size, 1.2 + rand(79, i) * 2.6]);
  const grid = 11, cell = size / grid, seeds: [number, number, number][] = [];
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    seeds.push([(i + 0.15 + rand(91, j * grid + i) * 0.7) * cell, (j + 0.15 + rand(92, j * grid + i) * 0.7) * cell, rand(93, j * grid + i)]);
  }
  const wrap = (d: number) => Math.min(Math.abs(d), size - Math.abs(d));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let grain = 1 + (lattice(16, x, y, 3) - 0.5) * 0.12 + (lattice(64, x, y, 5) - 0.5) * 0.1 + (rand(11, y * size + x) - 0.5) * 0.08;
    for (const [px, py, r] of pebbles) {
      const d = Math.hypot(wrap(x - px), wrap(y - py));
      if (d < r + 1) grain *= 0.72 + 0.28 * Math.min(1, Math.max(0, d - r + 0.5));
    }
    let first = Infinity, second = Infinity, tone = 0;
    for (const [px, py, value] of seeds) {
      const d = Math.hypot(wrap(x - px), wrap(y - py));
      if (d < first) { second = first; first = d; tone = value; } else if (d < second) second = d;
    }
    // Each cell is one column top: its own lit tone, a darker crevice ring, and a faint rim.
    const edge = second - first, crevice = Math.min(1, Math.max(0, (edge - 1) / 2.6));
    // A few sunken (shaded) columns break the regularity; the rest vary in lit tone.
    const lit = tone < 0.14 ? 0.45 + tone : 0.72 + tone * 0.5;
    const top = lit * (0.28 + 0.72 * crevice) * (1 + 0.07 * Math.max(0, 1 - Math.abs(edge - 5) / 2.5));
    data.set([Math.round(Math.min(1, grain / 2) * 255), Math.round(Math.min(1, top / 2) * 255), 128, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** World units per ground detail tile; divides the section length so uv is seam-continuous. */
export const GROUND_TILE = 6;
/** World units per basalt detail tile on cliff columns and mesa tops. */
const BASALT_TILE = 1.3, FACE_TILE = 2.2;
/**
 * World units per cliff-rock or ice-wall tile (docs/26 §11), on the ground's wall triangles and the kit's wall pieces
 * alike: the rock's ledges read from the 55° camera without the tile repeating along a rim.
 */
const WALL_TILE = 3.5;
/** Wall detail strength per planet (luminance contrast) and the wall normal map's strength (High only). */
const WALL_DETAIL: Partial<Record<PlanetId, { contrast: number; normal: number }>> = {
  khepri: { contrast: 0.95, normal: 0.9 }, vesper: { contrast: 1.2, normal: 0.9 }, luna: { contrast: 0.75, normal: 0.8 },
};

const GLOW_VERTEX = '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying float vHazeY;';
/**
 * Wall pieces' detail (docs/26 §11): faces carry the full rock (or ice) map; tops keep a quieter grain, so a rim stays
 * a clean edge. The grain is kept apart for the Vesper ice colouring after the vertex colours.
 */
const WALL_DETAIL_FRAGMENT = `#ifdef USE_MAP
  float wallGrain = 1.0 + ( texture2D( map, vMapUv ).r * 2.0 - 1.0 ) * wallContrast * mix( 1.0, 0.35, vWallTop ) * ( 1.0 - clamp( vGlow, 0.0, 1.0 ) );
#else
  float wallGrain = 1.0;
#endif
  diffuseColor.rgb *= wallGrain;`;
/**
 * Wall faces match the ground's own wall triangles (docs/26 §10–11): lifted where they face the camera, like bounce
 * light off the floor, so the rock's ledges read on the shaded side. On Vesper they become the concept's glacier ice,
 * pale blue-white high up and deep blue toward the foot (following the piece's own colour ramp), under clean snow caps;
 * on Khepri their rust caps darken to weathered rock.
 */
const WALL_COLOR_FRAGMENT = `
  float wallIceShade = 0.0;
  vec3 wallFacet = vec3( 0.0, 0.0, 1.0 );
  if ( vesperLook > 0.5 ) {
    // Crisp ice (user, 21 October: "a bit more crisp and pointy"): each flat facet's own plane against the sun splits
    // pale cyan-white lit faces from deep, saturated blue shadowed ones, over the kit's own colours (ice blue faces,
    // abyss-blue cracks that stay dark, snow on the rim only).
    wallFacet = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
    float iceSun = 0.5;
    #if NUM_DIR_LIGHTS > 0
      iceSun = dot( wallFacet, directionalLights[ 0 ].direction );
    #endif
    float iceLight = dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), crack = 1.0 - smoothstep( 0.04, 0.14, iceLight );
    float cap = smoothstep( 0.5, 0.85, vWallTop ), iceLit = smoothstep( -0.05, 0.3, iceSun ) * ( 1.0 - crack );
    vec3 iceShade = diffuseColor.rgb * vec3( 0.55, 0.8, 1.15 ), iceBright = mix( diffuseColor.rgb, vec3( 0.62, 0.86, 1.0 ) * wallGrain, 0.6 );
    diffuseColor.rgb = mix( mix( iceShade, iceBright, iceLit ), vec3( 0.9, 0.94, 0.98 ) * ( 0.94 + 0.06 * wallGrain ), cap );
    wallIceShade = ( 1.0 - iceLit ) * ( 1.0 - cap );
    // Shadowed ice keeps its colour (a little light through the ice) instead of going grey.
    totalEmissiveRadiance += vec3( 0.004, 0.035, 0.13 ) * wallIceShade;
  } else {
    // Khepri: the caps read as the rock itself (the concept's dark, weathered column tops), not as bright slabs.
    vec3 capRock = vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * vec3( 1.45, 1.0, 0.8 );
    diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, capRock, 0.5 ) * 0.42, vWallTop );
  }
  diffuseColor.rgb *= 1.0 + ( vesperLook > 0.5 ? 0.25 : 1.1 ) * ( 1.0 - vWallTop ) * clamp( normalize( vNormal ).z * 1.4, 0.0, 1.0 );`;
/**
 * Wall pieces' map coordinates (docs/26 §11): faces take u along the piece (its own x, or z on its ends, in world units
 * after the instance's stretch) and v up in world units, so ledges stay level however tall a piece is scaled; tops
 * take the world-planar map. Each piece shifts u by its position, so neighbours do not repeat the same rock.
 */
const WALL_UV_VERTEX = `#include <uv_vertex>
  #ifdef USE_INSTANCING
    mat4 wallMatrix = instanceMatrix;
  #else
    mat4 wallMatrix = mat4( 1.0 );
  #endif
  vec3 wallScale = vec3( length( wallMatrix[ 0 ].xyz ), length( wallMatrix[ 1 ].xyz ), length( wallMatrix[ 2 ].xyz ) );
  vec3 wallPosition = ( wallMatrix * vec4( position, 1.0 ) ).xyz;
  // The face's normal under the instance's stretch (inverse scale): a top stays a top at any wall height.
  vec3 wallFacing = normalize( normal / wallScale );
  vWallTop = smoothstep( 0.55, 0.8, wallFacing.y );
  float wallShift = dot( wallMatrix[ 3 ].xz, vec2( 0.37, 0.61 ) );
  vec2 wallUv = ( abs( wallFacing.y ) > 0.7 ? wallPosition.xz
    : vec2( ( abs( wallFacing.x ) > abs( wallFacing.z ) ? position.z * wallScale.z : position.x * wallScale.x ) + wallShift, wallPosition.y ) ) * wallTile;
  #ifdef USE_MAP
    vMapUv = wallUv;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv = wallUv;
  #endif`;
const GLOW_FRAGMENT = '#include <common>\nuniform vec3 glowColor;\nuniform float detailContrast;\nvarying float vGlow;';
const EMISSIVE = '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowColor * vGlow;';
/**
 * Vesper kit surfaces (docs/17 §1, art/vesper-kit). The kit's COLOR_0 already separates the materials: ice is
 * saturated blue, snow near-white, rock dark grey. Ice turns glossy with a translucent inner glow that deepens toward
 * its blue base, plus a crisp bright rim along the top edge; snow and ice tops carry sparse sun-glints.
 */
const VESPER_KIT_HEAD = `
uniform float vesperLook; uniform float lunaLook; uniform float nacreLook; uniform float beaconTime; varying float vPieceY;
float vesperHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }`;
const VESPER_KIT_SURFACE = `
  float vesperIce = 0.0, vesperSnow = 0.0;
  vec3 vesperBase = diffuseColor.rgb;
  if ( vesperLook > 0.5 ) {
    float hi = max( vesperBase.r, max( vesperBase.g, vesperBase.b ) ), lo = min( vesperBase.r, min( vesperBase.g, vesperBase.b ) );
    float saturation = ( hi - lo ) / max( hi, 1e-3 );
    vesperIce = smoothstep( 0.3, 0.46, saturation );
    vesperSnow = ( 1.0 - vesperIce ) * smoothstep( 0.25, 0.5, hi );
    // Glacier blue: deepen and saturate ice toward the base of each wall (the kit's pale tops stay pale).
    vec3 glacier = pow( vesperBase, vec3( 1.35 ) ) * vec3( 0.7, 0.95, 1.25 );
    diffuseColor.rgb = mix( vesperBase, mix( glacier, vesperBase, smoothstep( 0.55, 0.95, vPieceY ) ), vesperIce );
    vesperBase = diffuseColor.rgb;
  }`;
const VESPER_KIT_EMISSIVE = `
  if ( vesperLook > 0.5 ) {
    vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
    // Translucency: ice gives back some of its own blue (stronger on faces turned toward the viewer).
    float facing = clamp( dot( normal, vec3( 0.0, 0.0, 1.0 ) ), 0.0, 1.0 );
    totalEmissiveRadiance += vesperBase * vesperIce * ( 0.035 + 0.055 * facing );
    // Crisp top rim on ice walls: a thin bright band just under the snow cap of pieces scaled to their top.
    float rim = smoothstep( 0.9, 0.97, vPieceY ) * ( 1.0 - smoothstep( 0.985, 1.0, vPieceY ) ) * ( 1.0 - abs( worldNormal.y ) );
    totalEmissiveRadiance += vec3( 0.75, 0.9, 1.0 ) * rim * vesperIce * 0.16;
    // Sparse glints on snow and ice tops that twinkle slowly (world-fixed cells, render time).
    #ifdef USE_MAP
      vec2 cell = floor( vMapUv * 46.0 );
      float glint = step( 0.9965, vesperHash( cell + floor( beaconTime * 1.5 + vesperHash( cell ) * 4.0 ) * 0.37 ) );
      totalEmissiveRadiance += vec3( 1.6, 1.8, 2.0 ) * glint * ( vesperSnow + vesperIce ) * smoothstep( 0.6, 0.9, worldNormal.y );
    #endif
  }`;
/** World height for depth haze; instanced pieces include their instance transform. */
const HAZE_VERTEX = `#include <project_vertex>
  #ifdef USE_INSTANCING
    vHazeY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
  #else
    vHazeY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
  #endif`;
/** Cool teal/violet haze settling in deep valleys against the warm sun (docs/13 §1). */
const HAZE_FRAGMENT = `#include <opaque_fragment>
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, smoothstep( hazeTop, hazeBottom, vHazeY ) * hazeStrength );`;
const HAZE_UNIFORMS = '\nuniform vec3 hazeColor;\nuniform float hazeTop;\nuniform float hazeBottom;\nuniform float hazeStrength;\nvarying float vHazeY;';
/**
 * Haze tuned for valley floors near −6 and rims near 2: a faint dusky violet that *lifts* the depths (its
 * radiance sits above a shadowed valley floor), so deep canyons read as distance and air, never as night.
 */
const haze = () => ({
  hazeColor: { value: linear(0x6e6070) }, hazeTop: { value: -2.6 }, hazeBottom: { value: -7 }, hazeStrength: { value: 0.34 },
});

/** Unit-luminance chroma of an sRGB colour, linear (a wall hue the shader scales by the ground's own light). */
function hueOf(hex: number): THREE.Color {
  const { r, g, b } = linear(hex), l = r * 0.2126 + g * 0.7152 + b * 0.0722;
  return new THREE.Color(r / l, g / l, b / l);
}
/**
 * Wall materials for crisp cliffs (docs/26 §10, after art/concepts/01-worlds-direction.png): Khepri dark warm columnar
 * basalt, Vesper blue ice split by vertical fractures, Luna darker regolith. `shade` scales the ground's light on the
 * wall; `crease` turns on the hard rim and foot shading. Nacre has none (its smooth look stays exactly as it was).
 */
/** Vesper's ice-wall map on terrain walls: its strength and its sampling sharpness (see the iceCrisp uniform). */
const ICE_CRISP: [number, number] = [0.45, 1];
/** Look-dev: `?icecrisp=strength,sharpness` overrides ICE_CRISP. */
const iceCrispOverride = (): [number, number] | null => {
  if (typeof location === 'undefined') return null;
  const asked = new URLSearchParams(location.search).get('icecrisp')?.split(',').map(Number);
  return asked && asked.length === 2 && asked.every(Number.isFinite) ? [asked[0], asked[1]] : null;
};
const KHEPRI_WALL = { hue: hueOf(0x6a4a36), shade: 0.82, columns: 1, crease: 1 };
const WALL_LOOK: Partial<Record<PlanetId, { hue: THREE.Color; shade: number; columns: number; crease: number }>> = {
  khepri: KHEPRI_WALL,
  vesper: { hue: hueOf(0x5f9fd0), shade: 0.9, columns: 0, crease: 1 },
  // Luna keeps smooth normals: its many small crater bowls would facet on the height grid; walls still take the
  // darker regolith per face.
  luna: { hue: hueOf(0x8a8780), shade: 0.72, columns: 0, crease: 0 },
};

/**
 * Ground, kit and infrastructure materials. Colour stays in the Khepri palette (vertex colours); textures
 * only add contrast-limited luminance detail and normals. Low tier drops normal maps; layout never changes.
 */
export function createTerrainMaterials() {
  const time = { beaconTime: { value: 0 } };
  /** 0 Khepri (basalt, unchanged), 1 Vesper (ice/snow/rock shading in the kit material); lunaLook greys the basalt. */
  const kitLook = { vesperLook: { value: 0 }, lunaLook: { value: 0 }, nacreLook: { value: 0 } };
  /** Kit glow: Khepri's mineral cyan; on Vesper the only glowing faces it draws are radiator/lamp bands (orange). */
  const kitGlow = { glowColor: { value: linear(0x8ffcf0).multiplyScalar(1.55) }, detailContrast: { value: 0.9 } };
  const fallback = createDetailTexture();
  const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flatNormal.needsUpdate = true;
  const uniforms = {
    rockMap: { value: fallback as THREE.Texture }, faceScale: { value: 1 / FACE_TILE }, kitTile: { value: 1 / BASALT_TILE },
  };
  /**
   * Wall maps (docs/26 §11): wallMapOn 1 while the planet's cliff-rock or ice-wall map is the rockMap; the wall normal
   * map's strength (0 = off: Low tier, a missing map, or Nacre).
   */
  const wallMaps = { wallNormal: { value: flatNormal as THREE.Texture }, wallNormalOn: { value: 0 }, wallMapOn: { value: 0 } };
  /**
   * Crack network on open ground (version 16; Vesper's ice plains and Luna's regolith, after the concepts): crackLook 0
   * leaves Khepri and Nacre exactly as they were. crackTint is the line colour as a multiplier.
   */
  const crackLook = { crackMap: { value: flatNormal as THREE.Texture }, crackLook: { value: 0 }, crackTint: { value: new THREE.Vector3(1, 1, 1) } };
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, map: fallback, roughness: 1, metalness: 0, envMapIntensity: .18, normalScale: new THREE.Vector2(0.7, 0.7) });
  // Persistent uniform objects so a planet switch can retune them (Khepri values are the originals).
  const groundHaze = haze(), groundLook = { groundIce: {value: 0}, glowColor: { value: linear(0x8ffcf0).multiplyScalar(0.75) }, detailContrast: { value: 1.4 } };
  /**
   * Crisp cliffs (terrain version 14, docs/26 §10): on Khepri, Vesper and Luna each triangle's own plane decides top or
   * wall (hard rims, faceted wall shading, the wall's own material); Nacre keeps the smooth look exactly (cliffLook 0).
   */
  const cliffLook = { cliffLook: { value: 1 }, creaseLook: { value: KHEPRI_WALL.crease }, wallHue: { value: KHEPRI_WALL.hue.clone() },
    wallShade: { value: KHEPRI_WALL.shade }, wallColumns: { value: KHEPRI_WALL.columns },
    // Vesper's ice walls (user, 22 October: "more crispy ... darker sharp texture like in the original concept"): how much the
    // ice map shapes the wall (x) and its sampling sharpness (y: derivative scale; under 1 samples a sharper level).
    iceCrisp: { value: new THREE.Vector2(...ICE_CRISP) },
    // How upright a terrain face must be to shade as a wall (the up component of its normal: fully a wall at y, not at all
    // at x). Vesper's cliffs are near-vertical: only its truly sheer faces turn to ice (23 October: at Khepri's 0.62–0.42,
    // single steep triangles on rounded shoulders showed as blue facets beside the ice walls).
    cliffSteep: { value: new THREE.Vector2(0.62, 0.42) } };
  ground.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, groundHaze, groundLook, cliffLook, wallMaps, crackLook);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
// surface: x vein presence, y pool glow, z steepness; veins: signed distances to two crossing vein families.
attribute vec4 surface;\nattribute vec2 veins;\nvarying vec4 vSurface;\nvarying vec2 vVeins;\nvarying vec3 vLocal;\nvarying vec3 vFace;\nvarying float vHazeY;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surface;\nvVeins = veins;\nvLocal = position;\nvFace = normal;')
      .replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
// How fast (per pixel) a wall's facing direction may swing before its maps leave the along-face mapping (see wallBend).
#define WALL_BEND_START 0.005
#define WALL_BEND_FULL 0.018
// One set of fractured ice columns along a column coordinate: the position across its column (x) and the column's lean to
// the sun (y), each column broken into blocks at uneven ledges with a ridge splitting it into two facets.
vec2 iceColumns( float column, float height ) {
  float iceIndex = floor( column ), iceEdge = fract( column );
  float iceBlock = floor( height * 0.45 + fract( sin( iceIndex * 5.31 ) * 43758.5453 ) );
  float iceLean = fract( sin( iceIndex * 19.17 + 3.1 ) * 43758.5453 ) * 2.0 - 1.0 + 0.5 * ( fract( sin( iceIndex * 7.7 + iceBlock * 91.3 ) * 43758.5453 ) - 0.5 );
  float iceRidge = 0.35 + 0.3 * fract( sin( iceIndex * 3.73 + iceBlock * 17.1 ) * 43758.5453 );
  return vec2( iceEdge, iceLean + ( iceEdge < iceRidge ? -0.45 : 0.45 ) );
}
uniform vec3 glowColor;\nuniform float detailContrast;\nvarying vec4 vSurface;\nvarying vec2 vVeins;\nvarying vec3 vLocal;\nvarying vec3 vFace;
uniform sampler2D rockMap;\nuniform float faceScale; uniform float groundIce;${HAZE_UNIFORMS}
uniform float cliffLook;\nuniform vec2 cliffSteep;\nuniform float creaseLook;\nuniform vec3 wallHue;\nuniform float wallShade;\nuniform float wallColumns;\nuniform vec2 iceCrisp;
uniform sampler2D wallNormal;\nuniform float wallNormalOn;\nuniform float wallMapOn;
uniform sampler2D crackMap;\nuniform float crackLook;\nuniform vec3 crackTint;
// Periodic value noise in section-local units: the lattice repeats every 36 units along z, so it is seamless
// across section joins (36·scale must be an integer).
float khepriHash( vec2 p, float period ) { return fract( sin( dot( vec2( p.x, mod( p.y, period ) ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float khepriNoise( vec2 local, float scale ) {
  vec2 cell = local * scale, i = floor( cell ), f = fract( cell ); f = f * f * ( 3.0 - 2.0 * f );
  float period = 36.0 * scale;
  return mix( mix( khepriHash( i, period ), khepriHash( i + vec2( 1.0, 0.0 ), period ), f.x ),
    mix( khepriHash( i + vec2( 0.0, 1.0 ), period ), khepriHash( i + vec2( 1.0, 1.0 ), period ), f.x ), f.y );
}
/** Cellular (F2 − F1) distance for crystalline crackle; same seamless period rule as khepriNoise. */
float khepriCells( vec2 local, float scale ) {
  vec2 p = local * scale, i = floor( p ), f = fract( p );
  float period = 36.0 * scale, f1 = 8.0, f2 = 8.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = vec2( float( x ), float( y ) ), c = i + g;
    vec2 o = vec2( khepriHash( c, period ), khepriHash( c + vec2( 31.0, 0.0 ), period ) ) * 0.8 + 0.1;
    float d = length( g + o - f );
    if ( d < f1 ) { f2 = f1; f1 = d; } else if ( d < f2 ) f2 = d;
  }
  return f2 - f1;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // Glowing mineral cracks: each family's signed distance interpolates cleanly; crossings come from taking
  // the nearer line per fragment (never per vertex, which would zig-zag). Width is measured in pixels
  // (|d| / fwidth(d)): a ~1 px luminous core inside a ~3 px dark fissure lip. Brightness breaks up along the
  // crack (periodic value noise, seamless across 36-unit sections), so networks read as cracks, not lightning.
  vec2 pixels = abs( vVeins ) / max( fwidth( vVeins ), vec2( 1e-4 ) );
  vec2 cores = vec2( 1.0 ) - smoothstep( vec2( 0.2 ), vec2( 0.85 ), pixels );
  vec2 lips = vec2( 1.0 ) - smoothstep( vec2( 0.7 ), vec2( 2.4 ), pixels );
  float vein = 0.0, crack = 0.0, shore = 0.0, pool = 0.0, sparkle = 0.0;
  if ( vSurface.x > 0.01 || vSurface.y > 0.12 ) {
    float patchy = smoothstep( 0.3, 0.72, khepriNoise( vLocal.xz, 0.5 ) );
    vein = vSurface.x * max( cores.x, cores.y ) * patchy;
    crack = vSurface.x * max( lips.x, lips.y ) * mix( 0.45, 1.0, patchy );
    // Mineral pools read as crystalline deposits, not outlined shapes: a dark teal bed shot through with a glowing
    // crackle network (cells ~0.3 units, lines ~1–2 px via fwidth) and a faint soft rim. The mask lives on a
    // 0.5-unit grid, so its edge is warped by noise to hide the grid polygons.
    float level = vSurface.y + ( khepriNoise( vLocal.xz + vec2( 7.3, 0.0 ), 1.25 ) - 0.5 ) * 0.3;
    pool = smoothstep( 0.36, 0.56, level );
    if ( pool > 0.0 ) {
      float cells = khepriCells( vLocal.xz, 3.0 ), width = max( fwidth( cells ), 1e-4 );
      sparkle = pool * ( 1.0 - smoothstep( 0.6 * width, 1.9 * width, cells ) ) * mix( 0.5, 1.0, patchy );
    }
    shore = ( smoothstep( 0.24, 0.4, level ) - smoothstep( 0.4, 0.6, level ) ) * 0.6;
  }
  diffuseColor.rgb *= 1.0 - crack * 0.5;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.02, 0.16, 0.15 ), vein * 0.75 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.014, 0.055, 0.06 ), pool * 0.85 );
  // Cracks glow just below the bloom threshold; the crackle network inside pools reaches it (soft halo on High).
  totalEmissiveRadiance += glowColor * ( vein * 1.15 + shore * 0.3 + pool * 0.12 + sparkle * 1.2 );`)
      .replace('#include <map_fragment>', `// Crisp cliffs: the triangle's own plane (screen derivatives, as flat shading takes it) says top or wall, so a
// rim is a hard edge between a top triangle and a wall triangle. Smooth ground keeps the vertex values (cliffLook 0:
// exactly the version 13 path).
// (A uniform branch: derivatives stay in uniform control flow, and worlds without cliffs pay nothing.) The world's up
// axis in view space is the view matrix's second column, so the face's tilt is one dot product.
vec3 cliffFace = vec3( 0.0, 0.0, 1.0 ), cliffDx = vec3( 0.0 ), cliffDy = vec3( 0.0 );
float cliffUp = 1.0, cliffWall = 0.0;
if ( cliffLook > 0.0 ) {
  cliffDx = dFdx( vViewPosition ); cliffDy = dFdy( vViewPosition );
  cliffFace = normalize( cross( cliffDx, cliffDy ) );
  cliffUp = abs( dot( cliffFace, viewMatrix[ 1 ].xyz ) );
  cliffWall = cliffLook * smoothstep( cliffSteep.x, cliffSteep.y, cliffUp );
}
float vRock = cliffLook > 0.0 ? cliffWall : vSurface.z;
#ifdef USE_MAP
  // One dust tap; vertex-colour drift hides the tile repetition. Three taps in total on High (dust, rock, normal).
  float dustA = texture2D( map, vMapUv ).r * 2.0;
  // Steep faces: basalt detail projected on the vertical plane they face, with columnar striation. With a wall map
  // (version 15: cliff rock, or Vesper's ice wall) the map's x runs along the wall and its y up it, so the rock's
  // ledges lie level instead of stretching down the drop.
  // The across-face coordinate follows the face's own horizontal direction continuously, so walls running
  // diagonally keep straight columns instead of flipping between x and z projections (chevron stripes).
  // Flat ground (most pixels) skips this path; derivatives are taken outside the branch.
  vec2 faceDir = normalize( vFace.xz + vec2( 1e-4, 0.0 ) );
  float across = dot( vLocal.xz, vec2( -faceDir.y, faceDir.x ) );
  vec2 faceUv = vec2( across, vLocal.y ) * faceScale, faceDx = dFdx( faceUv ), faceDy = dFdy( faceUv );
  // Where the face's direction swings from pixel to pixel (a wall curving, or tipping toward a rim or foot), the along-face
  // coordinate bends with it and squeezes the map's cracks into wavy contour bands (user, 22 October: "like texture
  // moire"). There the wall maps (rock, Vesper's ice cracks and their normals) take two fixed projections, along x and
  // along z, blended by the way the face points; straight walls keep the crisp along-face mapping. (wallBend: 0 straight.)
  float wallBend = smoothstep( WALL_BEND_START, WALL_BEND_FULL, length( fwidth( faceDir ) ) );
  vec3 localDx = dFdx( vLocal ), localDy = dFdy( vLocal );
  vec2 wallUvX = vec2( vLocal.z, vLocal.y ) * faceScale, wallDxX = vec2( localDx.z, localDx.y ) * faceScale, wallDyX = vec2( localDy.z, localDy.y ) * faceScale;
  vec2 wallUvZ = vec2( vLocal.x, vLocal.y ) * faceScale, wallDxZ = vec2( localDx.x, localDx.y ) * faceScale, wallDyZ = vec2( localDy.x, localDy.y ) * faceScale;
  vec2 wallBlend = pow( abs( faceDir ), vec2( 6.0 ) ); wallBlend /= wallBlend.x + wallBlend.y;
  float detail = dustA;
  if ( vRock > 0.01 ) {
    float rockD = textureGrad( rockMap, faceUv, faceDx * iceCrisp.y, faceDy * iceCrisp.y ).r * 2.0;
    if ( wallBend > 0.0 ) rockD = mix( rockD, ( textureGrad( rockMap, wallUvX, wallDxX, wallDyX ).r * wallBlend.x + textureGrad( rockMap, wallUvZ, wallDxZ, wallDyZ ).r * wallBlend.y ) * 2.0, wallBend );
    float columnIndex = floor( across * 2.7 );
    // Per-column tone from an ALU hash rather than another texture tap.
    float tone = 0.82 + 0.36 * fract( sin( columnIndex * 12.9898 + floor( vLocal.y * 0.9 + columnIndex * 0.37 ) * 78.233 ) * 43758.5453 );
    float edge = fract( across * 2.7 );
    float seamLine = smoothstep( 0.0, 0.1, edge ) * smoothstep( 1.0, 0.88, edge );
    float rockDetail = rockD * tone * mix( 0.5, 1.0, seamLine );
    // Columnar basalt (Khepri, after the concept art): sheer faces split into vertical fractured columns, each in its
    // own tone with deep dark seams (anti-aliased in pixels) and vertical streaks.
    if ( wallColumns > 0.0 ) {
      float columnTone = 0.72 + 0.56 * fract( sin( columnIndex * 7.13 + 1.7 ) * 43758.5453 );
      float columnWidth = max( fwidth( across * 2.7 ) * 1.5, 0.08 );
      float columnSeam = smoothstep( 0.0, columnWidth, edge ) * smoothstep( 1.0, 1.0 - columnWidth, edge );
      float streak = 0.88 + 0.24 * khepriNoise( vec2( across * 8.0, vLocal.y * 0.5 ), 1.0 );
      rockDetail = mix( rockDetail, rockD * columnTone * streak * mix( 0.32, 1.0, columnSeam ), wallColumns );
    }
    // Ice faces carry fine fracture strata instead of the desert's block masonry texture.
    // (Crisp-cliff worlds stretch the fractures vertically: the concept's blocky ice walls split top to bottom.)
    float fracture = khepriNoise( mix( vec2( across + vLocal.y * .17, vLocal.y ), vec2( across * 2.2, vLocal.y * 0.3 ), cliffLook ), 4.0 );
    float iceStrata = .86 + .2 * fracture + .025 * sin( vLocal.y * 42.0 + fracture * 8.0 );
    // Vesper with its ice-wall map: the map's fractured ice, its blocky vertical splits kept from the strata.
    iceStrata = mix( iceStrata, rockD * ( .9 + .1 * fracture ), wallMapOn );
    detail = mix( dustA, mix( rockDetail, iceStrata, groundIce ), vRock );
  }
  diffuseColor.rgb *= 1.0 + ( detail - 1.0 ) * detailContrast;
  // Cracks across open ground (version 16): plate cracks every ~9 units' tile and a finer crisscross on a 4-unit tile,
  // both dividing the 36-unit section so they run on across its joins. Walls keep their own material.
  if ( crackLook > 0.0 ) {
    float plates = texture2D( crackMap, vLocal.xz / 9.0 ).r, hairlines = texture2D( crackMap, vLocal.xz / 4.0 + vec2( 0.37, 0.61 ) ).g;
    float cracked = clamp( plates + hairlines * 0.55, 0.0, 1.0 ) * crackLook * ( 1.0 - vRock );
    diffuseColor.rgb *= mix( vec3( 1.0 ), crackTint, cracked );
  }
#endif
  // Camera-facing cliff faces sit in the generator's baked (lower-sun) shade; lift them like warm bounce light
  // off the sunlit floor so columns keep readable detail instead of going black (both tiers).
  // Crisp-cliff worlds lift them further, so the concept's dark faces still show their columns and fractures.
  // (Vesper's ice walls keep their facet contrast instead: little lift there.)
  diffuseColor.rgb *= 1.0 + ( 0.6 + 0.5 * cliffLook ) * ( 1.0 - 0.75 * groundIce ) * vRock * clamp( vFace.z * 1.4, 0.0, 1.0 );`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  // Walls take their own material after the vertex colours: the wall hue at the ground's light (baked shade kept).
  if ( cliffWall > 0.0 ) diffuseColor.rgb = mix( diffuseColor.rgb, wallHue * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * wallShade, cliffWall );
  // Vesper's ice walls match the kit's ice shards (docs/26 §11): the face against the sun splits pale cyan-white lit ice
  // from deep, saturated blue shadowed ice, at the ground's baked light. (By the smooth normal: per triangle, the 0.25
  // height grid read as pixel stairs along every crevasse. The kit's shards carry the hard facets.)
  // Version 16: the face splits into vertical fractured columns, like the kit's shards and the concept's ice walls. Each
  // column (and each block of it, broken at uneven ledges) leans its own way to the sun, with abyss-blue seams between.
  // (Derivatives are taken here, outside the per-pixel branch.)
  // The columns are cut along the face; where its direction swings (a curving wall) they move onto two fixed projections
  // (along z for faces toward ±x, along x for faces toward ±z), so they never bend into contour-like bands (22 October).
  vec2 iceDir = normalize( vFace.xz + vec2( 1e-4, 0.0 ) ), iceBlend = pow( abs( iceDir ), vec2( 24.0 ) );
  iceBlend /= iceBlend.x + iceBlend.y;
  float iceBend = smoothstep( WALL_BEND_START, WALL_BEND_FULL, length( fwidth( iceDir ) ) );
  float iceColumn = dot( vLocal.xz, vec2( -iceDir.y, iceDir.x ) ) * 0.75, iceSeamWidth = max( fwidth( iceColumn ) * 1.3, 0.06 );
  float iceColumnX = vLocal.z * 0.75, iceColumnZ = vLocal.x * 0.75;
  float iceSeamWidthX = max( fwidth( iceColumnX ) * 1.3, 0.06 ), iceSeamWidthZ = max( fwidth( iceColumnZ ) * 1.3, 0.06 );
  if ( groundIce > 0.5 && cliffWall > 0.0 ) {
    float iceSun = 0.5;
    #if NUM_DIR_LIGHTS > 0
      iceSun = dot( normalize( vNormal ), directionalLights[ 0 ].direction );
    #endif
    vec2 iceA = iceColumns( iceColumn, vLocal.y );
    float iceLean = iceA.y, iceSeam = smoothstep( 0.0, iceSeamWidth, iceA.x ) * smoothstep( 1.0, 1.0 - iceSeamWidth, iceA.x );
    if ( iceBend > 0.0 ) {
      vec2 iceX = iceColumns( iceColumnX, vLocal.y ), iceZ = iceColumns( iceColumnZ, vLocal.y );
      iceLean = mix( iceLean, iceX.y * iceBlend.x + iceZ.y * iceBlend.y, iceBend );
      iceSeam = mix( iceSeam, smoothstep( 0.0, iceSeamWidthX, iceX.x ) * smoothstep( 1.0, 1.0 - iceSeamWidthX, iceX.x ) * iceBlend.x
        + smoothstep( 0.0, iceSeamWidthZ, iceZ.x ) * smoothstep( 1.0, 1.0 - iceSeamWidthZ, iceZ.x ) * iceBlend.y, iceBend );
    }
    // Faint facets only (23 October): the walls carry the fractured look; a bare face with strong column facets read as
    // grey streaks (user: "doesn't look great").
    iceSun += iceLean * 0.18;
    float iceLit = smoothstep( -0.05, 0.3, iceSun ), baked = clamp( dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / 0.8, 0.4, 1.0 );
    // Shadowed ice deepens toward the waterline, like the kit's ramp; shallow crevasse lips stay a lighter blue.
    vec3 iceShade = mix( vec3( 0.03, 0.17, 0.46 ), vec3( 0.2, 0.45, 0.78 ), smoothstep( -3.4, 1.6, vLocal.y ) ), iceBright = vec3( 0.68, 0.88, 1.0 );
    vec3 iceTone = mix( vec3( 0.015, 0.08, 0.26 ), mix( iceShade, iceBright, iceLit ), 0.55 + 0.45 * iceSeam );
    // The ice map at its strength (x).
    float iceDetail = clamp( detail, 0.0, 2.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, iceTone * baked * ( 1.0 + ( iceDetail - 1.0 ) * iceCrisp.x ), cliffWall );
    totalEmissiveRadiance += vec3( 0.004, 0.035, 0.13 ) * ( 1.0 - iceLit ) * cliffWall;
  }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  // A flat-lying triangle whose smooth vertex normal leans away from its own plane borders a rim or a cliff foot: it is
  // shaded by its plane, so a top stays flat right up to its edge (a hard rim) and a floor right up to the wall's foot.
  // Walls keep their smooth normals (faceted walls would show the height grid's steps), and hills, dunes and swales,
  // whose planes and normals agree, stay smooth.
  if ( creaseLook > 0.0 ) {
    float crease = creaseLook * smoothstep( 0.99, 0.94, dot( normal, cliffFace ) ) * smoothstep( 0.72, 0.88, cliffUp );
    normal = normalize( mix( normal, cliffFace, crease ) );
  }
  // Wall relief (High): the wall map's normals on wall triangles only, in the frame the wall uv spans (screen
  // derivatives, as three's own normal maps do without tangents). Tops and rims keep their crisp planes.
#ifdef USE_MAP
  if ( wallNormalOn > 0.0 && cliffWall > 0.01 ) {
    // The along-face frame on straight walls; where the face bends, the same two projections as the wall map, blended.
    vec3 wallQ1 = cross( -cliffDy, normal ), wallQ0 = cross( normal, -cliffDx );
    vec3 wallN = textureGrad( wallNormal, faceUv, faceDx, faceDy ).xyz * 2.0 - 1.0;
    vec3 wallT = wallQ1 * faceDx.x + wallQ0 * faceDy.x, wallB = wallQ1 * faceDx.y + wallQ0 * faceDy.y;
    float wallDet = max( dot( wallT, wallT ), dot( wallB, wallB ) );
    vec3 relief = wallDet > 0.0 ? normalize( ( wallT * wallN.x + wallB * wallN.y ) * ( wallNormalOn * inversesqrt( wallDet ) ) + normal * wallN.z ) : normal;
    if ( wallBend > 0.0 ) {
    vec3 wallNX = textureGrad( wallNormal, wallUvX, wallDxX, wallDyX ).xyz * 2.0 - 1.0, wallNZ = textureGrad( wallNormal, wallUvZ, wallDxZ, wallDyZ ).xyz * 2.0 - 1.0;
    vec3 wallTX = wallQ1 * wallDxX.x + wallQ0 * wallDyX.x, wallBX = wallQ1 * wallDxX.y + wallQ0 * wallDyX.y;
    vec3 wallTZ = wallQ1 * wallDxZ.x + wallQ0 * wallDyZ.x, wallBZ = wallQ1 * wallDxZ.y + wallQ0 * wallDyZ.y;
    float wallDetX = max( dot( wallTX, wallTX ), dot( wallBX, wallBX ) ), wallDetZ = max( dot( wallTZ, wallTZ ), dot( wallBZ, wallBZ ) );
    vec3 wallBump = vec3( 0.0 );
    if ( wallDetX > 0.0 ) wallBump += ( wallTX * wallNX.x + wallBX * wallNX.y ) * ( inversesqrt( wallDetX ) * wallBlend.x );
    if ( wallDetZ > 0.0 ) wallBump += ( wallTZ * wallNZ.x + wallBZ * wallNZ.y ) * ( inversesqrt( wallDetZ ) * wallBlend.y );
    relief = normalize( mix( relief, normalize( wallBump * wallNormalOn + normal * ( wallNX.z * wallBlend.x + wallNZ.z * wallBlend.y ) ), wallBend ) );
    }
    normal = normalize( mix( normal, relief, cliffWall ) );
  }
#endif`)
      .replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  ground.customProgramCacheKey = () => 'khepri-ground';

  const infra = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.55 });
  /** Planet look of the infrastructure lamps: Khepri amber; Vesper's orange radiator glow (see setLook). */
  const infraGlow = { glowColor: { value: linear(0xffb060).multiplyScalar(3.4) }, detailContrast: { value: 0 } };
  /** World paint of the outposts (src/render/world-paint.ts; version 16, user 21 October). */
  const infraPaint = worldPaintUniforms();
  infra.onBeforeCompile = shader => {
    // Work lights and beacons sit above the bloom threshold (true glows); hulls stay below it.
    Object.assign(shader.uniforms, haze(), time, infraGlow, infraPaint);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `${GLOW_VERTEX}\nuniform float beaconTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  // Amber beacons blink: each instance gets its own phase from its position; some lamps stay steady.
  #ifdef USE_INSTANCING
    float beaconPhase = fract( sin( dot( instanceMatrix[ 3 ].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  #else
    float beaconPhase = 0.0;
  #endif
  float beaconPulse = beaconPhase < 0.35 ? 1.0 : 0.25 + 0.75 * smoothstep( 0.55, 0.75, fract( beaconTime * ( 0.45 + beaconPhase * 0.4 ) + beaconPhase ) );
  vGlow = glow * beaconPulse;`).replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', GLOW_FRAGMENT + HAZE_UNIFORMS + WORLD_PAINT_GLSL)
      // The world's paint (Luna's clean white hardware, docs/19; Vesper's metallic white; Nacre's dark green and purple;
      // a rustier Khepri). Lamps keep glowing in the world's glow colour (setLook).
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = worldRepaint( diffuseColor.rgb );`)
      .replace('#include <emissivemap_fragment>', EMISSIVE).replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  infra.customProgramCacheKey = () => 'khepri-infra';
  const kit = new THREE.MeshStandardMaterial({ vertexColors: true, map: fallback, roughness: 0.86, metalness: 0, normalScale: new THREE.Vector2(0.85, 0.85) });
  /**
   * Cliff walls (docs/26 §11): the kit's look on the wall pieces (cliff_wall_*, ice_wall_*), with the planet's wall map
   * laid along each piece (x along the rim, y up in world units), so the rock's ledges stay level at any height scale.
   * Its own program instead of a per-vertex flag: no extra draws (one batch per node either way).
   */
  const kitWall = new THREE.MeshStandardMaterial({ vertexColors: true, map: fallback, roughness: 0.86, metalness: 0, normalScale: new THREE.Vector2(0.9, 0.9) });
  const wallLook = { wallTile: { value: 1 / WALL_TILE }, wallContrast: { value: WALL_DETAIL.khepri!.contrast } };
  const kitShader = (wall: boolean) => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    // Crystal growths and mineral crack faces are true glows (bloom on High); basalt stays matte.
    Object.assign(shader.uniforms, uniforms, haze(), time, kitLook, kitGlow, wall ? wallLook : {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${GLOW_VERTEX}\nuniform float kitTile;\nvarying float vPieceY;${wall ? '\nuniform float wallTile;\nvarying float vWallTop;' : ''}`)
      .replace('#include <uv_vertex>', wall ? WALL_UV_VERTEX : `#include <uv_vertex>
  // Cheap box projection in section space: one planar axis per (flat) face, immune to instance scaling.
  #ifdef USE_INSTANCING
    vec3 boxPosition = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
    vec3 boxNormal = abs( mat3( instanceMatrix ) * normal );
  #else
    vec3 boxPosition = position;
    vec3 boxNormal = abs( normal );
  #endif
  vec2 boxUv = ( boxNormal.y > max( boxNormal.x, boxNormal.z ) ? boxPosition.xz : ( boxNormal.x > boxNormal.z ? boxPosition.zy : boxPosition.xy ) ) * kitTile;
  #ifdef USE_MAP
    vMapUv = boxUv;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv = boxUv;
  #endif`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvPieceY = position.y;')
      .replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', GLOW_FRAGMENT + HAZE_UNIFORMS + VESPER_KIT_HEAD + (wall ? '\nuniform float wallContrast;\nvarying float vWallTop;' : ''))
      // Nacre's flora emits its own vertex colour (teal, violet, orange) instead of the shared glow colour.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += mix( glowColor, diffuseColor.rgb * 1.8, nacreLook ) * vGlow;' + VESPER_KIT_EMISSIVE)
      .replace('#include <map_fragment>', wall ? WALL_DETAIL_FRAGMENT + VESPER_KIT_SURFACE : `#ifdef USE_MAP
  float detail = texture2D( map, vMapUv ).r * 2.0;
  diffuseColor.rgb *= 1.0 + ( detail - 1.0 ) * detailContrast * ( 1.0 - clamp( vGlow, 0.0, 1.0 ) ) * ( 1.0 - vesperLook * .65 );
#endif
${VESPER_KIT_SURFACE}`)
      // Luna (docs/19): after the vertex colours, the Khepri basalt pieces turn to grey rock (luminance kept, lifted).
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * vec3( 1.5, 1.48, 1.44 ), lunaLook );${wall ? WALL_COLOR_FRAGMENT : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, 0.2, vesperIce );')
      .replace('#include <opaque_fragment>', HAZE_FRAGMENT);
    // Wall tops keep their own plane (most of the relief stays on the faces).
    if (wall) shader.fragmentShader = shader.fragmentShader
      // Vesper's ice shards keep hard, flat facets (the kit is flat-shaded; this holds under any interpolation).
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  if ( vesperLook > 0.5 ) normal = wallFacet;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize( mix( normal, nonPerturbedNormal, vWallTop * 0.75 ) );`);
  };
  kit.onBeforeCompile = kitShader(false);
  kit.customProgramCacheKey = () => 'khepri-kit';
  kitWall.onBeforeCompile = kitShader(true);
  kitWall.customProgramCacheKey = () => 'khepri-kit-wall';
  kit.userData.wallMaterial = kitWall;
  applySurfaceFinish(kit, 'stone', 1.5, .045);
  applySurfaceFinish(infra, 'metal', .8, .018);

  const roads = createRoadMaterial(), dustTrack = roads.map;
  let snowTrack: THREE.DataTexture | null = null, lunaTrack: THREE.DataTexture | null = null;
  let textures: KhepriTextures | null = null, normals = true;
  /** The planet whose wall maps are on (docs/26 §11) and Vesper's ice-wall maps once loaded. */
  let wallPlanet: PlanetId = 'khepri', vesperWalls: WallTextures | null = null, vesperWallsLoad: Promise<void> | null = null;
  /** Vesper's snow detail while that planet is active (null on Khepri). */
  let snowDetail: THREE.DataTexture | null = null, snowTexture: THREE.DataTexture | null = null, crackTexture: THREE.DataTexture | null = null;
  /** Retunes the ground and roads for a planet: Vesper snow takes its own ripple detail, cool haze and snow tracks. */
  const setPlanet = (planet: PlanetId) => {
    const vesper = planet === 'vesper', luna = planet === 'luna', nacre = planet === 'nacre', khepri = haze();
    groundLook.groundIce.value = vesper ? 1 : 0;
    const wall = WALL_LOOK[planet];
    cliffLook.cliffLook.value = wall ? 1 : 0;
    cliffLook.creaseLook.value = wall?.crease ?? 0;
    cliffLook.cliffSteep.value.set(vesper ? 0.42 : 0.62, vesper ? 0.3 : 0.42);
    const crisp: [number, number] = vesper ? iceCrispOverride() ?? ICE_CRISP : [0.18, 1]; cliffLook.iceCrisp.value.set(...crisp);
    if (wall) { cliffLook.wallHue.value.copy(wall.hue); cliffLook.wallShade.value = wall.shade; cliffLook.wallColumns.value = wall.columns; }
    ground.color.setHex(vesper || luna ? 0xffffff : nacre ? 0xd5d9e1 : 0xc2c4c8);
    if (vesper && !snowTexture) snowTexture = createSnowDetailTexture();
    const nextDetail = vesper ? snowTexture : null;
    const walls = planet !== wallPlanet;
    wallPlanet = planet;
    if (nextDetail !== snowDetail || walls) { snowDetail = nextDetail; apply(); }
    groundLook.detailContrast.value = vesper ? 0.9 : luna ? 0.6 : nacre ? 0.8 : .8;
    // Cracks (version 16): blue-grey lines in Vesper's snow and ice, dark fractures in Luna's regolith.
    if ((vesper || luna) && !crackTexture) crackTexture = createCrackTexture();
    crackLook.crackMap.value = crackTexture ?? flatNormal;
    crackLook.crackLook.value = vesper ? 0.55 : luna ? 0.45 : 0;
    crackLook.crackTint.value.set(...(vesper ? [0.6, 0.74, 0.92] : [0.5, 0.5, 0.52]) as [number, number, number]);
    groundHaze.hazeColor.value.copy(vesper ? linear(0xcfe0ee) : nacre ? linear(0x4a3a90) : khepri.hazeColor.value);
    // Luna has no air: no haze in its craters.
    groundHaze.hazeStrength.value = vesper ? 0.12 : luna ? 0 : nacre ? 0.15 : khepri.hazeStrength.value;
    if (vesper && !snowTrack) snowTrack = createRoadTexture('snow');
    if (luna && !lunaTrack) lunaTrack = createRoadTexture('regolith');
    roads.map = vesper ? snowTrack : luna ? lunaTrack : dustTrack; roads.needsUpdate = true;
  };
  ground.userData.setPlanet = setPlanet;
  /**
   * A planet's own wall maps, for the terrain view's prepare (docs/26 §11): Vesper's ice walls load with its scenery,
   * so nothing appears late; Khepri's and Luna's cliff rock comes with the Khepri textures. A failed map settles too
   * (null: the procedural wall detail remains).
   */
  ground.userData.loadPlanetTextures = (planet: PlanetId, base: string): Promise<void> => {
    // The crack network (version 16) is built here, in prepare (before a flight or a jump), never at the switch itself.
    if ((planet === 'vesper' || planet === 'luna') && !crackTexture) crackTexture = createCrackTexture();
    if (planet !== 'vesper') return Promise.resolve();
    return vesperWallsLoad ??= loadDataTextures(`${base}assets/vesper/textures/`, VESPER_WALL_FILES, 2).then(loaded => {
      if (disposed) { Object.values(loaded).forEach(texture => texture?.dispose()); return; }
      vesperWalls = loaded; apply();
    });
  };
  let disposed = false;
  const apply = () => {
    ground.map = snowDetail ?? textures?.groundDetail ?? fallback;
    kit.map = snowDetail ?? textures?.basaltDetail ?? fallback;
    // Walls (docs/26 §11): Vesper's ice-wall maps, cliff rock on Khepri and Luna (Luna's walls grey it as usual);
    // without one, the version 14 basalt detail and procedural ice strata remain. Nacre has no walls.
    const vesper = wallPlanet === 'vesper', look = WALL_DETAIL[wallPlanet];
    const wallMap = !look ? null : vesper ? vesperWalls?.detail ?? null : textures?.cliffDetail ?? null;
    const wallNormal = !look || !normals ? null : vesper ? vesperWalls?.normal ?? null : textures?.cliffNormal ?? null;
    uniforms.rockMap.value = wallMap ?? textures?.basaltDetail ?? fallback;
    uniforms.faceScale.value = wallMap ? 1 / WALL_TILE : 1 / FACE_TILE;
    wallMaps.wallMapOn.value = wallMap ? 1 : 0;
    wallMaps.wallNormal.value = wallNormal ?? flatNormal;
    wallMaps.wallNormalOn.value = wallNormal ? look!.normal : 0;
    wallLook.wallContrast.value = look?.contrast ?? WALL_DETAIL.khepri!.contrast;
    kitWall.map = wallMap ?? kit.map;
    kitWall.normalMap = wallNormal;
    // The ground stays without a normal map on every tier: at full-screen coverage its derivative-based
    // tangent frame is the most expensive term, and the luminance detail already carries the grain.
    ground.normalMap = null;
    kit.normalMap = normals && !snowDetail ? textures?.basaltNormal ?? null : null;
    ground.needsUpdate = true; kit.needsUpdate = true; kitWall.needsUpdate = true;
  };
  return {
    ground, kit, kitWall, infra, roads,
    /** Planet look (ground grain, haze, road surface); the terrain view also calls it through ground.userData. */
    setPlanet,
    /** Presentation time for blinking beacons (seconds); never read by the simulation. */
    setTime(seconds: number) { time.beaconTime.value = seconds; },
    setTextures(next: KhepriTextures) { textures = next; apply(); },
    /** Low tier skips normal maps (a cosmetic cost), never layout or colour. */
    setNormalMaps(enabled: boolean) { if (enabled !== normals) { normals = enabled; apply(); } },
    /** Prefiltered desert sky for machinery reflections (graphite metal and paint); terrain stays matte. */
    setEnvironment(texture: THREE.Texture | null) {
      infra.envMap = texture; kit.envMap = texture; kit.envMapIntensity = .35; kitWall.envMap = texture; kitWall.envMapIntensity = .35;
      infra.needsUpdate = true; kit.needsUpdate = true; kitWall.needsUpdate = true;
    },
    /**
     * Planet look of the kit and infrastructure materials (graphics rig; the ground has its own setPlanet).
     * Khepri restores the original values exactly. Vesper: kit pieces read their COLOR_0 as ice (saturated blue,
     * glossy, translucent-looking, crisp top rim), snow (bright, sparkling) or rock, and infrastructure becomes
     * glossy black ceramic with orange radiator glow.
     */
    setLook(planet: PlanetId) {
      const vesper = planet === 'vesper';
      kitLook.vesperLook.value = vesper ? 1 : 0; kitLook.lunaLook.value = planet === 'luna' ? 1 : 0; kitLook.nacreLook.value = planet === 'nacre' ? 1 : 0;
      // (Version 16: Vesper's radiator and lamp bands glow blue, the world's glow, instead of orange.)
      kitGlow.glowColor.value.copy(vesper ? worldGlow('vesper', 3.6) : linear(0x8ffcf0).multiplyScalar(1.55));
      infraGlow.glowColor.value.copy(worldGlow(planet, vesper ? 3.6 : 3.4));
      setWorldPaint(infraPaint, planet, 'building');
      // Vesper's hardware reads as brushed metal and white enamel (black ceramic before version 16).
      infra.roughness = vesper ? 0.35 : 0.55; infra.metalness = vesper ? 0.45 : 0.3; infra.envMapIntensity = vesper ? 0.9 : 0.55;
    },
    dispose() {
      ground.dispose(); kit.dispose(); kitWall.dispose(); infra.dispose(); roads.dispose(); dustTrack?.dispose(); snowTrack?.dispose(); lunaTrack?.dispose(); snowTexture?.dispose(); crackTexture?.dispose(); fallback.dispose(); flatNormal.dispose();
      if (textures) Object.values(textures).forEach(texture => texture?.dispose());
      if (vesperWalls) Object.values(vesperWalls).forEach(texture => texture?.dispose());
      disposed = true;
    },
  };
}

/* ---------------------------------------------------------------- shared industrial kit (docs/14) */

/** Material class carried in the `glow` attribute: 0 metal, 0.5 paint, 1 lamp. COLOR_0 stays a mask set. */
const SHARED_CLASS = { metal: 0, paint: 0.5, light: 1 } as const;

/** Extracts a shared-kit node keeping COLOR_0 as masks (R AO, G wear, B dust) and the material class. */
export function extractSharedNode(node: THREE.Object3D): THREE.BufferGeometry | null {
  node.updateMatrixWorld(true);
  const inverse = node.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
  node.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = ((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material | undefined)?.name ?? '';
    const cls = /light/i.test(name) ? SHARED_CLASS.light : /paint/i.test(name) ? SHARED_CLASS.paint : SHARED_CLASS.metal;
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const position = source.getAttribute('position');
    if (!position) { source.dispose(); return; }
    const count = position.count, part = new THREE.BufferGeometry(), white = new THREE.Color(1, 1, 1);
    part.setAttribute('position', new THREE.Float32BufferAttribute(toFloat3(position, count, white), 3));
    const masks = source.getAttribute('color');
    part.setAttribute('color', masks ? new THREE.Float32BufferAttribute(toFloat3(masks, count, white), 3)
      : new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0.3]).flat(), 3));
    part.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(count).fill(cls), 1));
    const local = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    part.applyMatrix4(local);
    const normal = source.getAttribute('normal');
    if (normal) {
      part.setAttribute('normal', new THREE.Float32BufferAttribute(toFloat3(normal, count, white), 3));
      part.getAttribute('normal').applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(local));
    } else part.computeVertexNormals();
    parts.push(part); source.dispose();
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (merged) { merged.computeBoundingBox(); merged.computeBoundingSphere(); }
  return merged;
}

export function loadSharedKit(url: string): Promise<KitGeometries> {
  return loadNodes(url, SHARED_NODES, node => extractSharedNode(node));
}

/** Code-built stand-ins at contract size (pipe centreline 0.35, 2-unit cells), with neutral masks. */
export function createFallbackShared(): KitGeometries {
  const kit: KitGeometries = new Map();
  const part = (geometry: THREE.BufferGeometry, cls: number, ao = 1) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry; const count = g.getAttribute('position').count;
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [ao, 0.1, 0.35]).flat(), 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(count).fill(cls), 1));
    return g;
  };
  const pipe = (radius: number, length: number, along: 'x' | 'z', cx: number, cz: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, length, 10, 1, true);
    g.rotateX(Math.PI / 2); if (along === 'x') g.rotateY(Math.PI / 2);
    return part(g.translate(cx, 0.35, cz), SHARED_CLASS.metal);
  };
  const flange = (radius: number, along: 'x' | 'z', cx: number, cz: number) => {
    const g = new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, 0.04, 10);
    g.rotateX(Math.PI / 2); if (along === 'x') g.rotateY(Math.PI / 2);
    return part(g.translate(cx, 0.35, cz), SHARED_CLASS.paint);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, cls: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), cls);
  const build = (name: SharedNode, pieces: THREE.BufferGeometry[]) => {
    const merged = mergeGeometries(pieces); pieces.forEach(p => p.dispose());
    if (merged) { merged.computeVertexNormals(); merged.computeBoundingBox(); merged.computeBoundingSphere(); kit.set(name, merged); }
  };
  for (const [size, r] of [['s', 0.08], ['l', 0.16]] as const) {
    build(`pipe_${size}_straight`, [pipe(r, 2, 'z', 0, 0), flange(r, 'z', 0, -0.98), flange(r, 'z', 0, 0.98)]);
    build(`pipe_${size}_elbow`, [pipe(r, 1, 'z', 0, -0.5), pipe(r, 1, 'x', 0.5, 0), part(new THREE.SphereGeometry(r * 1.05, 10, 6).translate(0, 0.35, 0), SHARED_CLASS.metal),
      flange(r, 'z', 0, -0.98), flange(r, 'x', 0.98, 0)]);
    build(`pipe_${size}_tee`, [pipe(r, 2, 'z', 0, 0), pipe(r, 1, 'x', 0.5, 0), box(r * 3, r * 3, r * 3, 0, 0.35 - r * 1.5, 0, SHARED_CLASS.paint),
      flange(r, 'z', 0, -0.98), flange(r, 'z', 0, 0.98), flange(r, 'x', 0.98, 0)]);
  }
  build('pipe_valve', [pipe(0.16, 2, 'z', 0, 0), box(0.5, 0.42, 0.5, 0, 0.12, 0, SHARED_CLASS.paint), box(0.12, 0.25, 0.12, 0, 0.54, 0, SHARED_CLASS.metal),
    part(new THREE.SphereGeometry(0.05, 6, 4).translate(0.2, 0.7, 0), SHARED_CLASS.light)]);
  build('pipe_support', [box(0.06, 0.62, 0.06, -0.32, 0, 0, SHARED_CLASS.metal), box(0.06, 0.62, 0.06, 0.32, 0, 0, SHARED_CLASS.metal),
    box(0.7, 0.05, 0.12, 0, 0.14, 0, SHARED_CLASS.metal), box(0.7, 0.04, 0.08, 0, 0.58, 0, SHARED_CLASS.metal)]);
  const tank = (name: SharedNode, radius: number, height: number) => build(name, [
    part(new THREE.CylinderGeometry(radius, radius, height, 16).translate(0, height / 2, 0), SHARED_CLASS.metal),
    part(new THREE.ConeGeometry(radius, 0.15, 16).translate(0, height + 0.075, 0), SHARED_CLASS.metal),
    part(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.1, 16).translate(0, height * 0.65, 0), SHARED_CLASS.paint),
    part(new THREE.SphereGeometry(0.05, 6, 4).translate(0, height + 0.2, 0), SHARED_CLASS.light)]);
  tank('tank_vertical_0', 0.58, 1.25); tank('tank_vertical_1', 0.5, 1.27);
  build('tank_sphere', [part(new THREE.SphereGeometry(0.55, 16, 10).translate(0, 0.9, 0), SHARED_CLASS.metal),
    part(new THREE.CylinderGeometry(0.56, 0.56, 0.08, 16).translate(0, 0.9, 0), SHARED_CLASS.paint),
    ...[0, 1, 2, 3, 4, 5].map(i => box(0.06, 0.6, 0.06, Math.cos(i * Math.PI / 3) * 0.42, 0, Math.sin(i * Math.PI / 3) * 0.42, SHARED_CLASS.metal))]);
  build('tank_horizontal', [part(new THREE.CylinderGeometry(0.36, 0.36, 1.8, 16).rotateZ(Math.PI / 2).translate(0, 0.52, 0), SHARED_CLASS.metal),
    box(0.12, 0.3, 0.6, -0.55, 0, 0, SHARED_CLASS.paint), box(0.12, 0.3, 0.6, 0.55, 0, 0, SHARED_CLASS.paint)]);
  build('container_0', [box(1.18, 0.52, 0.62, 0, 0, 0, SHARED_CLASS.paint)]);
  // Facility stand-in: hall, annex and stack (the Blender node replaces it once industrial-kit.glb loads).
  build('facility', [box(2.7, 0.1, 2.1, 0, 0, 0, SHARED_CLASS.metal), box(1.9, 1.04, 1.5, -0.25, 0.1, -0.15, SHARED_CLASS.paint),
    box(0.6, 0.64, 0.9, 1.05, 0.1, 0.2, SHARED_CLASS.metal), part(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 10).translate(0.45, 1.47, -0.55), SHARED_CLASS.metal),
    box(1.7, 0.09, 0.02, -0.25, 0.94, 0.62, SHARED_CLASS.light)]);
  build('container_1', [box(0.5, 0.28, 0.6, -0.27, 0, 0, SHARED_CLASS.paint), box(0.5, 0.28, 0.6, 0.27, 0, 0, SHARED_CLASS.paint), box(0.5, 0.28, 0.6, 0, 0.28, 0, SHARED_CLASS.paint)]);
  return kit;
}

/** Shared-kit colours per world (sRGB): metal, paint, wear, dust. Khepri's metal is rusted steel since version 16. */
const SHARED_PALETTE: Readonly<Record<PlanetId, readonly [number, number, number, number]>> = {
  khepri: [0x4a382c, 0xb8602a, 0xc8a888, 0xa8683a],
  luna: [0xb4b7bb, 0xeceeef, 0xf4f4f2, 0x9a9893],
  vesper: [0x76828e, 0xe8eef4, 0xd3dae1, 0xe3ebf2],
  nacre: [0x221c36, 0x2f4c3c, 0x4a3a6c, 0x2a2440],
};
/** Khepri palette for the shared kit (docs/14 §2): graphite metal, ochre/rust paint, ochre dust, amber lamps. */
export function createSharedMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55, envMapIntensity: 0.55 });
  const palette = {
    metalColor: { value: linear(0x3e4044) }, paintColor: { value: linear(0xb06a2e) }, wearColor: { value: linear(0xc8b8a0) },
    dustColor: { value: linear(0xa8683a) }, lampColor: { value: linear(0xffb060).multiplyScalar(3.4) },
  };
  /**
   * Planet palette for the mask-driven kit (docs/17 §3; version 16, user 21 October): the Moon white enamel with orange
   * lamps, Khepri rusted steel and orange paint, Vesper brushed metal and white enamel with blue lamps, Nacre dark violet
   * steel and moss-green paint with purple lamps.
   */
  material.userData.setPlanet = (planet: PlanetId) => {
    const [metal, paint, wear, dust] = SHARED_PALETTE[planet];
    palette.metalColor.value.copy(linear(metal)); palette.paintColor.value.copy(linear(paint));
    palette.wearColor.value.copy(linear(wear)); palette.dustColor.value.copy(linear(dust));
    palette.lampColor.value.copy(worldGlow(planet, planet === 'vesper' ? 3.6 : 3.4));
    material.metalness = planet === 'luna' ? 0.3 : 0.55; material.roughness = planet === 'vesper' ? 0.35 : 0.55;
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, haze(), palette);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', GLOW_VERTEX)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;').replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGlow;\nuniform vec3 metalColor;\nuniform vec3 paintColor;\nuniform vec3 wearColor;\nuniform vec3 dustColor;\nuniform vec3 lampColor;${HAZE_UNIFORMS}`)
      .replace('#include <color_fragment>', `// COLOR_0 is a mask set: base → wear (G) → dust (B) → × AO (R).
  float paint = step( 0.25, vGlow ) * ( 1.0 - step( 0.75, vGlow ) ), lamp = step( 0.75, vGlow );
  vec3 composed = mix( metalColor, paintColor, paint );
  composed = mix( composed, wearColor, vColor.g * 0.6 );
  composed = mix( composed, dustColor, vColor.b * 0.65 );
  diffuseColor.rgb = composed * mix( 0.35, 1.0, vColor.r );`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - paint;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += lampColor * lamp;')
      .replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'shared-industrial';
  return applySurfaceFinish(material, 'metal', .65, .022);
}

/* ---------------------------------------------------------------- roads */

/** Tileable graded-dust road texture: berms at the edges, a lighter graded bed and two tyre ruts (u across, v along). */
function createRoadTexture(surface: 'dust' | 'snow' | 'regolith' = 'dust'): THREE.DataTexture {
  const width = 128, height = 256, data = new Uint8Array(width * height * 4), snow = surface === 'snow', regolith = surface === 'regolith';
  // Snow tracks: packed pale snow with blue-grey tread ruts between soft white berms. Regolith (Luna's rover tracks,
  // version 16): packed grey dust with dark tread ruts, no engineered shoulders.
  const berm = new THREE.Color(snow ? 0xf2f6fa : regolith ? 0x9a9893 : 0x83654d), bed = new THREE.Color(snow ? 0xc9d6e2 : regolith ? 0x7b7975 : 0x605a52);
  const rut = new THREE.Color(snow ? 0x8ea4bb : regolith ? 0x4f4d4a : 0x3c3731), color = new THREE.Color();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width, grain = 0.92 + rand(31, y * width + x) * 0.16, wobble = Math.sin(y / height * Math.PI * 2) * 0.012;
    const inBed = u > 0.16 && u < 0.84, rutLine = Math.min(Math.abs(u - 0.34 - wobble), Math.abs(u - 0.66 - wobble));
    color.copy(inBed ? bed : berm);
    if (inBed && rutLine < 0.045) color.lerp(rut, 0.65 * (1 - rutLine / 0.045));
    if (!snow && !regolith) {
      // Crisp engineered shoulders, expansion joints and restrained worn centre dashes.
      if (Math.abs(u - .18) < .012 || Math.abs(u - .82) < .012) color.setHex(0xaaa08a);
      if (inBed && y % 64 < 2) color.multiplyScalar(.62);
      if (Math.abs(u - .5) < .008 && y % 128 > 20 && y % 128 < 64 && rand(39, y * width + x) > .12) color.setHex(0xc4ac73);
    }
    color.convertLinearToSRGB();
    data.set([color.r * 255 * grain, color.g * 255 * grain, color.b * 255 * grain, 255].map(v => Math.min(255, Math.round(v))), (y * width + x) * 4);
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.anisotropy = 4; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/**
 * Terrain-following road ribbons: graded dust with ruts and berms, drawn over the ground with a polygon
 * offset, edges faded by a per-vertex alpha and darkened by the ground's baked shade.
 */
export function createRoadMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: createRoadTexture(), roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, haze());
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float alpha;\nattribute float shade;\nvarying float vAlpha;\nvarying float vShade;\nvarying float vHazeY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = alpha;\nvShade = shade;').replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vAlpha;\nvarying float vShade;${HAZE_UNIFORMS}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vShade;\ndiffuseColor.a *= vAlpha;')
      .replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'khepri-road';
  return material;
}
