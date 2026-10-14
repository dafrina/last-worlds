import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT, KIT_KINDS, SHARED_NODES, kitNodeName, type KitKind, type SharedNode } from '../world/terrain';
import { createScenicProp, type Materials, type PropKind } from './models';

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

function fallbackPiece(kind: KitKind, variant: number): THREE.BufferGeometry {
  const builder = new Builder(), seed = KIT_KINDS.indexOf(kind) * 101 + variant * 13;
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

/** Simple procedural stand-ins so the game renders before (or without) the Blender kit. */
export function createFallbackKit(): KitGeometries {
  const kit: KitGeometries = new Map();
  for (const kind of KIT_KINDS) for (let v = 0; v < KIT[kind].variants; v++) {
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
export function extractKitNode(node: THREE.Object3D, kind: KitKind): THREE.BufferGeometry | null {
  const geometry = extractNode(node, /mineral/i, kind === 'crystal');
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
export function loadKhepriKit(url: string): Promise<KitGeometries> {
  const names = KIT_KINDS.flatMap(kind => Array.from({ length: KIT[kind].variants }, (_, v) => kitNodeName(kind, v)));
  return loadNodes(url, names, (node, name) => extractKitNode(node, KIT_KINDS.find(kind => name.startsWith(`${KIT[kind].prefix}_`))!));
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

/** Loads the modelled infrastructure kit; amber `khepri_light` faces glow. Missing nodes keep their fallback. */
export function loadKhepriInfra(url: string): Promise<KitGeometries> {
  return loadNodes(url, Object.keys(INFRA_NODES), node => extractNode(node, /light/i));
}

/** Runtime detail maps derived from Poly Haven CC0 sources (see report / art/source/polyhaven). */
export interface KhepriTextures {
  groundDetail: THREE.Texture | null;
  basaltDetail: THREE.Texture | null; basaltNormal: THREE.Texture | null;
}
const TEXTURE_FILES: Record<keyof KhepriTextures, string> = {
  groundDetail: 'khepri-ground-detail.jpg',
  basaltDetail: 'khepri-basalt-detail.jpg', basaltNormal: 'khepri-basalt-normal.jpg',
};

/** Loads each map independently; a failed map stays null and its procedural fallback remains. */
export async function loadKhepriTextures(base: string, anisotropy: number): Promise<KhepriTextures> {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(Object.entries(TEXTURE_FILES).map(async ([key, file]) => {
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
  return Object.fromEntries(entries) as unknown as KhepriTextures;
}

/**
 * Runtime-generated tileable data texture (0.5 = neutral):
 * R = procedural dust grain, the stand-in until/unless the Poly Haven detail map loads;
 * G = columnar-basalt top mosaic (jittered Voronoi cells, dark crevices) for mesa surfaces.
 */
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

const GLOW_VERTEX = '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying float vHazeY;';
const GLOW_FRAGMENT = '#include <common>\nuniform vec3 glowColor;\nuniform float detailContrast;\nvarying float vGlow;';
const EMISSIVE = '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowColor * vGlow;';
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
/** Haze tuned for valley floors near −6 and rims near 2: a dusky slate veil in the depths only. */
const haze = () => ({
  hazeColor: { value: linear(0x56607a) }, hazeTop: { value: -3.2 }, hazeBottom: { value: -7 }, hazeStrength: { value: 0.3 },
});

/**
 * Ground, kit and infrastructure materials. Colour stays in the Khepri palette (vertex colours); textures
 * only add contrast-limited luminance detail and normals. Low tier drops normal maps; layout never changes.
 */
export function createTerrainMaterials() {
  const time = { beaconTime: { value: 0 } };
  const fallback = createDetailTexture();
  const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flatNormal.needsUpdate = true;
  const uniforms = {
    rockMap: { value: fallback as THREE.Texture }, faceScale: { value: 1 / FACE_TILE }, kitTile: { value: 1 / BASALT_TILE },
  };
  const ground = new THREE.MeshStandardMaterial({ vertexColors: true, map: fallback, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7) });
  ground.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, haze(), { glowColor: { value: linear(0x8ffcf0).multiplyScalar(0.75) }, detailContrast: { value: 1.3 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
// surface: x vein presence, y pool glow, z steepness; veins: signed distances to two crossing vein families.
attribute vec4 surface;\nattribute vec2 veins;\nvarying vec4 vSurface;\nvarying vec2 vVeins;\nvarying vec3 vLocal;\nvarying vec3 vFace;\nvarying float vHazeY;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surface;\nvVeins = veins;\nvLocal = position;\nvFace = normal;')
      .replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 glowColor;\nuniform float detailContrast;\nvarying vec4 vSurface;\nvarying vec2 vVeins;\nvarying vec3 vLocal;\nvarying vec3 vFace;
uniform sampler2D rockMap;\nuniform float faceScale;${HAZE_UNIFORMS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // Thin glowing vein networks: each family's signed distance interpolates cleanly; crossings come from
  // taking the nearer line per fragment (never per vertex, which would zig-zag).
  // Width is measured in pixels (|d| / fwidth(d)), so cracks stay 1–3 px wide wherever the field is shallow.
  vec2 pixels = abs( vVeins ) / max( fwidth( vVeins ), vec2( 1e-4 ) );
  vec2 lines = vec2( 1.0 ) - smoothstep( vec2( 0.5 ), vec2( 1.5 ), pixels );
  float vein = vSurface.x * max( lines.x, lines.y );
  // Pools read as dark mineral liquid with glowing terraced rims, never as flat cyan sheets that would
  // compete with the player's cyan shots.
  // Soft edges: the mask is interpolated on a 0.5-unit grid, and crisp thresholds would show its polygons.
  float poolOuter = smoothstep( 0.3, 0.58, vSurface.y ), poolInner = smoothstep( 0.55, 0.85, vSurface.y );
  float poolRim = max( 0.0, poolOuter - poolInner );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.02, 0.2, 0.18 ), vein * 0.8 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.012, 0.05, 0.055 ), poolInner * 0.9 );
  totalEmissiveRadiance += glowColor * ( vein * 2.2 + poolRim * 1.1 + poolInner * 0.12 );`)
      .replace('#include <map_fragment>', `float vRock = vSurface.z;
#ifdef USE_MAP
  // One dust tap; vertex-colour drift hides the tile repetition. Three taps in total on High (dust, rock, normal).
  float dustA = texture2D( map, vMapUv ).r * 2.0;
  // Steep faces: basalt detail projected on the vertical plane they face, with columnar striation.
  // Flat ground (most pixels) skips this path; derivatives are taken outside the branch.
  bool facesX = abs( vFace.x ) > abs( vFace.z );
  float across = facesX ? vLocal.z : vLocal.x;
  vec2 faceUv = vec2( across, vLocal.y ) * faceScale, faceDx = dFdx( faceUv ), faceDy = dFdy( faceUv );
  float detail = dustA;
  if ( vRock > 0.01 ) {
    float rockD = textureGrad( rockMap, faceUv, faceDx, faceDy ).r * 2.0;
    float columnIndex = floor( across * 2.7 );
    // Per-column tone from an ALU hash rather than another texture tap.
    float tone = 0.82 + 0.36 * fract( sin( columnIndex * 12.9898 + floor( vLocal.y * 0.9 + columnIndex * 0.37 ) * 78.233 ) * 43758.5453 );
    float edge = fract( across * 2.7 );
    float seamLine = smoothstep( 0.0, 0.1, edge ) * smoothstep( 1.0, 0.88, edge );
    detail = mix( dustA, rockD * tone * mix( 0.5, 1.0, seamLine ), vRock );
  }
  diffuseColor.rgb *= 1.0 + ( detail - 1.0 ) * detailContrast;
#endif`)
      .replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  ground.customProgramCacheKey = () => 'khepri-ground';

  const infra = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
  infra.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, haze(), time, { glowColor: { value: linear(0xffb060).multiplyScalar(1.6) }, detailContrast: { value: 0 } });
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
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', GLOW_FRAGMENT + HAZE_UNIFORMS)
      .replace('#include <emissivemap_fragment>', EMISSIVE).replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  infra.customProgramCacheKey = () => 'khepri-infra';
  const kit = new THREE.MeshStandardMaterial({ vertexColors: true, map: fallback, roughness: 0.86, metalness: 0, normalScale: new THREE.Vector2(0.85, 0.85) });
  kit.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, haze(), { glowColor: { value: linear(0x8ffcf0).multiplyScalar(0.75) }, detailContrast: { value: 0.75 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${GLOW_VERTEX}\nuniform float kitTile;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
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
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;')
      .replace('#include <project_vertex>', HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', GLOW_FRAGMENT + HAZE_UNIFORMS)
      .replace('#include <emissivemap_fragment>', EMISSIVE)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  float detail = texture2D( map, vMapUv ).r * 2.0;
  diffuseColor.rgb *= 1.0 + ( detail - 1.0 ) * detailContrast * ( 1.0 - vGlow );
#endif`)
      .replace('#include <opaque_fragment>', HAZE_FRAGMENT);
  };
  kit.customProgramCacheKey = () => 'khepri-kit';

  const roads = createRoadMaterial();
  let textures: KhepriTextures | null = null, normals = true;
  const apply = () => {
    ground.map = textures?.groundDetail ?? fallback;
    kit.map = textures?.basaltDetail ?? fallback;
    uniforms.rockMap.value = textures?.basaltDetail ?? fallback;
    // The ground stays without a normal map on every tier: at full-screen coverage its derivative-based
    // tangent frame is the most expensive term, and the luminance detail already carries the grain.
    ground.normalMap = null;
    kit.normalMap = normals ? textures?.basaltNormal ?? null : null;
    ground.needsUpdate = true; kit.needsUpdate = true;
  };
  return {
    ground, kit, infra, roads,
    /** Presentation time for blinking beacons (seconds); never read by the simulation. */
    setTime(seconds: number) { time.beaconTime.value = seconds; },
    setTextures(next: KhepriTextures) { textures = next; apply(); },
    /** Low tier skips normal maps (a cosmetic cost), never layout or colour. */
    setNormalMaps(enabled: boolean) { if (enabled !== normals) { normals = enabled; apply(); } },
    dispose() {
      ground.dispose(); kit.dispose(); infra.dispose(); roads.dispose(); (roads.map as THREE.Texture | null)?.dispose(); fallback.dispose(); flatNormal.dispose();
      if (textures) Object.values(textures).forEach(texture => texture?.dispose());
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
  build('container_1', [box(0.5, 0.28, 0.6, -0.27, 0, 0, SHARED_CLASS.paint), box(0.5, 0.28, 0.6, 0.27, 0, 0, SHARED_CLASS.paint), box(0.5, 0.28, 0.6, 0, 0.28, 0, SHARED_CLASS.paint)]);
  return kit;
}

/** Khepri palette for the shared kit (docs/14 §2): graphite metal, ochre/rust paint, ochre dust, amber lamps. */
export function createSharedMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, haze(), {
      metalColor: { value: linear(0x3e4044) }, paintColor: { value: linear(0xb06a2e) }, wearColor: { value: linear(0xc8b8a0) },
      dustColor: { value: linear(0xa8683a) }, lampColor: { value: linear(0xffb060).multiplyScalar(2.2) },
    });
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
  return material;
}

/* ---------------------------------------------------------------- roads */

/** Tileable graded-dust road texture: berms at the edges, a lighter graded bed and two tyre ruts (u across, v along). */
function createRoadTexture(): THREE.DataTexture {
  const width = 32, height = 64, data = new Uint8Array(width * height * 4);
  const berm = new THREE.Color(0x9a5a32), bed = new THREE.Color(0xbb7c4c), rut = new THREE.Color(0x6e3c22), color = new THREE.Color();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width, grain = 0.92 + rand(31, y * width + x) * 0.16, wobble = Math.sin(y / height * Math.PI * 2) * 0.012;
    const inBed = u > 0.22 && u < 0.78, rutLine = Math.min(Math.abs(u - 0.37 - wobble), Math.abs(u - 0.63 - wobble));
    color.copy(inBed ? bed : berm);
    if (inBed && rutLine < 0.045) color.lerp(rut, 0.65 * (1 - rutLine / 0.045));
    data.set([color.r * 255 * grain, color.g * 255 * grain, color.b * 255 * grain, 255].map(v => Math.min(255, Math.round(v))), (y * width + x) * 4);
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
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
