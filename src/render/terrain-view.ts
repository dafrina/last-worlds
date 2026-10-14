import * as THREE from 'three';
import { VIEW, type GraphicsQuality } from '../shared/contracts';
import {
  KIT, KIT_KINDS, SHARED_BOUNDS, SHARED_NODES, TERRAIN_STEP, createTerrainStream, kitNodeName, terrainSample,
  type TerrainProp, type TerrainSection,
} from '../world/terrain';
import { GROUND_TILE, INFRA_NODES, TRACK_SEGMENT, createFallbackKit, type KitGeometries } from './terrain-kit';

/** Extra world units around the frustum kept in the compacted instance set, and the camera travel that triggers recompaction. */
const CULL_MARGIN = 1.2, RECOMPACT = 0.55;

interface Cullable { object: THREE.Object3D; box: THREE.Box3; triangles: number }
/** Per-node instance data of one section in section-local space (z = −(s − startS)). */
interface Prepared { matrices: Float32Array; colors: Float32Array; boxes: Float32Array; cosmetic: Uint8Array; count: number }
interface SectionView {
  index: number; startS: number; group: THREE.Group; cullables: Cullable[];
  instanced: THREE.InstancedMesh[]; geometries: THREE.BufferGeometry[]; prepared: Map<string, Prepared>;
}
interface Batch { mesh: THREE.InstancedMesh; capacity: number; triangles: number }
export interface TerrainViewOptions {
  scene: THREE.Scene;
  groundMaterial: THREE.Material; kitMaterial: THREE.Material; infraMaterial: THREE.Material; boundaryMaterial: THREE.Material;
  /** Palette-from-masks material for the shared industrial kit (docs/14). */
  sharedMaterial: THREE.Material;
  /** Code-built infrastructure stand-ins, used until (or unless) khepri-infra.glb provides real nodes. */
  fallbackInfra: KitGeometries;
  /** Code-built pipes and tanks, used until (or unless) industrial-kit.glb provides real nodes. */
  fallbackShared: KitGeometries;
}
export interface TerrainStats {
  calls: number; triangles: number; instances: number;
  kit: 'glb' | 'fallback'; infra: 'glb' | 'fallback'; shared: 'glb' | 'fallback';
}
const SHARED = new Set<string>(SHARED_NODES);

function tint(seed: number, x: number, s: number): number {
  let n = Math.imul(Math.round(x * 131) ^ seed, 0x27d4eb2d) ^ Math.imul(Math.round(s * 113), 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

/** Infrastructure node for a district prop (cargo cycles through its three variants). */
function infraNode(prop: TerrainProp): string {
  switch (prop.kind) {
    case 'landingPad': return 'infra_landing_pad';
    case 'refinery': return 'infra_refinery';
    case 'relay': return 'infra_relay';
    case 'track': return 'infra_track_segment';
    default: return `infra_cargo_${(Number(prop.id.split(':').at(-1)) || 0) % 3}`;
  }
}

const triangleCount = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

/**
 * Streams procedural sections into scenery. Ground is split into lateral strips culled by exact boxes.
 * Kit and infrastructure pieces use one InstancedMesh per node, refilled with only the instances whose
 * boxes intersect the (margin-expanded) view whenever the camera has moved past the margin, so draw
 * calls stay bounded by the node count and triangles by what is actually on screen. Presentation only.
 */
export function createTerrainView(options: TerrainViewOptions) {
  const { scene, groundMaterial, kitMaterial, infraMaterial, boundaryMaterial, sharedMaterial } = options;
  let kit: KitGeometries = createFallbackKit(), infra: KitGeometries = new Map(options.fallbackInfra), shared: KitGeometries = new Map(options.fallbackShared);
  let kitSource: TerrainStats['kit'] = 'fallback', infraSource: TerrainStats['infra'] = 'fallback', sharedSource: TerrainStats['shared'] = 'fallback';
  let quality: GraphicsQuality = 'high', seed: number | null = null, stream = createTerrainStream(0);
  const views = new Map<number, SectionView>(), batches = new Map<string, Batch>();
  const pieces = new THREE.Group(); pieces.name = 'Khepri instanced scenery'; scene.add(pieces);
  const edgeGeometry = new THREE.BoxGeometry(0.06, 0.018, 1.5);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), worldBox = new THREE.Box3(), offset = new THREE.Vector3();
  const stats: TerrainStats = { calls: 0, triangles: 0, instances: 0, kit: kitSource, infra: infraSource, shared: sharedSource };
  let distance = 0, origin = 0, lastCameraX = NaN, lastDistance = NaN, dirty = true;

  const nodeGeometry = (name: string) => kit.get(name) ?? infra.get(name) ?? shared.get(name);
  const nodeMaterial = (name: string) => name.startsWith('infra_') ? infraMaterial : SHARED.has(name) ? sharedMaterial : kitMaterial;
  function createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, name: string) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, color.setRGB(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.name = name;
    pieces.add(mesh);
    return mesh;
  }
  function batch(name: string): Batch | null {
    const geometry = nodeGeometry(name);
    if (!geometry) return null;
    let entry = batches.get(name);
    if (!entry || entry.mesh.geometry !== geometry) {
      if (entry) { pieces.remove(entry.mesh); entry.mesh.dispose(); }
      entry = { mesh: createMesh(geometry, nodeMaterial(name), 64, `Khepri ${name}`), capacity: 64, triangles: triangleCount(geometry) };
      batches.set(name, entry); dirty = true;
    }
    return entry;
  }
  function grow(entry: Batch, needed: number) {
    if (needed <= entry.capacity) return;
    let capacity = entry.capacity;
    while (capacity < needed) capacity *= 2;
    const mesh = createMesh(entry.mesh.geometry, entry.mesh.material as THREE.Material, capacity, entry.mesh.name);
    (mesh.instanceMatrix.array as Float32Array).set(entry.mesh.instanceMatrix.array as Float32Array);
    (mesh.instanceColor!.array as Float32Array).set(entry.mesh.instanceColor!.array as Float32Array);
    pieces.remove(entry.mesh); entry.mesh.dispose();
    entry.mesh = mesh; entry.capacity = capacity;
  }

  /** Converts a section's kit instances and district props into per-node, section-local instance arrays. */
  function prepare(section: TerrainSection): Map<string, Prepared> {
    const lists = new Map<string, { matrix: THREE.Matrix4; tone: THREE.Color; box: THREE.Box3; cosmetic: boolean }[]>();
    const push = (name: string, matrix: THREE.Matrix4, tone: THREE.Color, box: THREE.Box3, cosmetic: boolean) => {
      const list = lists.get(name) ?? []; list.push({ matrix, tone, box, cosmetic }); lists.set(name, list);
    };
    for (const instance of section.instances) {
      const localS = instance.s - section.startS, spec = KIT[instance.kind];
      transform.position.set(instance.x, instance.y, -localS); transform.rotation.set(0, instance.rotation, 0);
      transform.scale.set(instance.scale, instance.height, instance.scale); transform.updateMatrix();
      const variation = 0.9 + tint(section.seed, instance.x, instance.s) * 0.16;
      const light = instance.kind === 'crystal' ? 1 : 0.35 + 0.65 * instance.shade;
      const radius = spec.radius * instance.scale;
      const box = new THREE.Box3(new THREE.Vector3(instance.x - radius, instance.y - 0.2, -localS - radius),
        new THREE.Vector3(instance.x + radius, instance.y + instance.height * spec.height, -localS + radius));
      push(kitNodeName(instance.kind, instance.variant), transform.matrix.clone(),
        new THREE.Color(variation * light, variation * light * 0.985, variation * light * 0.97), box, instance.cosmetic);
    }
    for (const prop of section.props) {
      const name = infraNode(prop), localS = prop.s - section.startS, white = new THREE.Color(1, 1, 1);
      const alongX = prop.footprint[0] > prop.footprint[1], length = Math.max(...prop.footprint);
      const tiles = prop.kind === 'track' ? Math.max(1, Math.round(length / TRACK_SEGMENT)) : 1;
      for (let i = 0; i < tiles; i++) {
        const shift = prop.kind === 'track' ? (i - (tiles - 1) / 2) * TRACK_SEGMENT : 0;
        const x = prop.x + (alongX ? shift : 0), z = -localS - (alongX ? 0 : shift);
        transform.position.set(x, prop.baseHeight, z);
        transform.rotation.set(0, prop.rotation + (alongX && prop.kind === 'track' ? Math.PI / 2 : 0), 0);
        transform.scale.set(1, 1, 1); transform.updateMatrix();
        const half = Math.max(...(INFRA_NODES[name]?.size ?? [1, 1, 1])) / 2 + 0.2;
        const box = new THREE.Box3(new THREE.Vector3(x - half, prop.baseHeight - 0.1, z - half), new THREE.Vector3(x + half, prop.baseHeight + 1.9, z + half));
        push(name, transform.matrix.clone(), white, box, false);
      }
    }
    for (const piece of section.industry) {
      const localS = piece.s - section.startS, bounds = SHARED_BOUNDS[piece.node], half = Math.max(bounds.halfX, bounds.halfZ) + 0.1;
      transform.position.set(piece.x, piece.y, -localS); transform.rotation.set(0, piece.rotation, 0);
      transform.scale.set(1, piece.scaleY, 1); transform.updateMatrix();
      const box = new THREE.Box3(new THREE.Vector3(piece.x - half, piece.y - 0.1, -localS - half),
        new THREE.Vector3(piece.x + half, piece.y + bounds.height * piece.scaleY, -localS + half));
      push(piece.node, transform.matrix.clone(), new THREE.Color(1, 1, 1), box, false);
    }
    const prepared = new Map<string, Prepared>();
    for (const [name, list] of lists) {
      // Essential instances first, so the low tier can stop early when skipping cosmetic ones.
      list.sort((a, b) => Number(a.cosmetic) - Number(b.cosmetic));
      const count = list.length, entry: Prepared = {
        matrices: new Float32Array(count * 16), colors: new Float32Array(count * 3), boxes: new Float32Array(count * 6),
        cosmetic: new Uint8Array(count), count,
      };
      list.forEach((item, i) => {
        item.matrix.toArray(entry.matrices, i * 16); item.tone.toArray(entry.colors, i * 3);
        item.box.min.toArray(entry.boxes, i * 6); item.box.max.toArray(entry.boxes, i * 6 + 3); entry.cosmetic[i] = item.cosmetic ? 1 : 0;
      });
      prepared.set(name, entry);
    }
    return prepared;
  }

  function buildGround(section: TerrainSection, view: SectionView) {
    const vertices = section.side * section.side, uv = new Float32Array(vertices * 2), surface = new Float32Array(vertices * 4);
    const veins = new Float32Array(vertices * 2);
    for (let i = 0; i < vertices; i++) {
      uv[i * 2] = section.positions[i * 3] / GROUND_TILE; uv[i * 2 + 1] = -section.positions[i * 3 + 2] / GROUND_TILE;
      surface[i * 4] = section.glow[i * 2]; surface[i * 4 + 1] = section.glow[i * 2 + 1];
      surface[i * 4 + 2] = section.rock[i]; surface[i * 4 + 3] = 0;
      veins[i * 2] = section.edges[i * 2]; veins[i * 2 + 1] = section.edges[i * 2 + 1];
    }
    // One set of section attributes shared by every strip; strips are index ranges disposed together.
    const attributes = {
      position: new THREE.BufferAttribute(section.positions, 3), normal: new THREE.BufferAttribute(section.normals, 3),
      color: new THREE.BufferAttribute(section.colors, 3), surface: new THREE.BufferAttribute(surface, 4), uv: new THREE.BufferAttribute(uv, 2),
      veins: new THREE.BufferAttribute(veins, 2),
    };
    const index = new THREE.BufferAttribute(section.indices, 1);
    section.strips.forEach((strip, b) => {
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(index); geometry.setDrawRange(strip.start, strip.count);
      const box = new THREE.Box3(new THREE.Vector3(strip.minX, Infinity, -section.size), new THREE.Vector3(strip.maxX, -Infinity, 0));
      const first = Math.round((strip.minX + VIEW.worldWidth / 2) / TERRAIN_STEP), last = Math.round((strip.maxX + VIEW.worldWidth / 2) / TERRAIN_STEP);
      for (let row = 0; row < section.side; row++) for (let column = first; column <= last; column++) {
        const y = section.positions[(row * section.side + column) * 3 + 1];
        box.min.y = Math.min(box.min.y, y); box.max.y = Math.max(box.max.y, y);
      }
      geometry.boundingBox = box.clone(); geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const ground = new THREE.Mesh(geometry, groundMaterial); ground.name = `Khepri ground ${section.index}:${b}`;
      const holder = new THREE.Group(); holder.add(ground); view.group.add(holder);
      view.geometries.push(geometry);
      const cullable: Cullable = { object: holder, box, triangles: strip.count / 3 };
      view.cullables.push(cullable);
      // World limits read as quiet surveyed flight-border lines on the outermost strips only.
      if (b !== 0 && b !== section.strips.length - 1) return;
      const x = (b === 0 ? -1 : 1) * (VIEW.worldWidth / 2 - 0.06);
      const marks = new THREE.InstancedMesh(edgeGeometry, boundaryMaterial, Math.ceil(section.size / 3));
      let i = 0;
      for (let s = 0; s < section.size; s += 3) {
        transform.position.set(x, terrainSample(section.seed, x, section.startS + s).height + 0.035, -s);
        transform.rotation.set(0, 0, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); marks.setMatrixAt(i++, transform.matrix);
      }
      marks.count = i; marks.computeBoundingSphere(); holder.add(marks); view.instanced.push(marks);
      cullable.triangles += i * 12;
    });
  }

  function buildSection(section: TerrainSection): SectionView {
    const group = new THREE.Group(); group.name = `Khepri procedural section ${section.index}`;
    const view: SectionView = { index: section.index, startS: section.startS, group, cullables: [], instanced: [], geometries: [], prepared: prepare(section) };
    buildGround(section, view);
    scene.add(group); dirty = true;
    return view;
  }
  function disposeView(view: SectionView) {
    scene.remove(view.group);
    view.instanced.forEach(mesh => mesh.dispose());
    view.geometries.forEach(geometry => geometry.dispose());
    dirty = true;
  }

  /** Refill every node batch with the instances whose boxes meet the margin-expanded frustum. */
  function compact() {
    const counts = new Map<string, number>();
    origin = views.size ? Math.min(...[...views.values()].map(view => view.startS)) : 0;
    let instances = 0;
    for (const view of views.values()) {
      const zShift = distance - view.startS, matrixShift = origin - view.startS;
      for (const [name, data] of view.prepared) {
        const entry = batch(name);
        if (!entry) continue;
        let slot = counts.get(name) ?? 0;
        for (let i = 0; i < data.count; i++) {
          if (quality === 'low' && data.cosmetic[i]) break;
          const b = i * 6;
          worldBox.min.set(data.boxes[b] - CULL_MARGIN, data.boxes[b + 1], data.boxes[b + 2] + zShift - CULL_MARGIN);
          worldBox.max.set(data.boxes[b + 3] + CULL_MARGIN, data.boxes[b + 4], data.boxes[b + 5] + zShift + CULL_MARGIN);
          if (!frustum.intersectsBox(worldBox)) continue;
          grow(entry, slot + 1);
          const target = entry.mesh.instanceMatrix.array as Float32Array;
          target.set(data.matrices.subarray(i * 16, i * 16 + 16), slot * 16);
          target[slot * 16 + 14] += matrixShift;
          (entry.mesh.instanceColor!.array as Float32Array).set(data.colors.subarray(i * 3, i * 3 + 3), slot * 3);
          slot++; instances++;
        }
        counts.set(name, slot);
      }
    }
    for (const [name, entry] of batches) {
      const count = counts.get(name) ?? 0;
      entry.mesh.count = count; entry.mesh.visible = count > 0;
      if (!count) continue;
      entry.mesh.instanceMatrix.clearUpdateRanges(); entry.mesh.instanceMatrix.addUpdateRange(0, count * 16); entry.mesh.instanceMatrix.needsUpdate = true;
      entry.mesh.instanceColor!.clearUpdateRanges(); entry.mesh.instanceColor!.addUpdateRange(0, count * 3); entry.mesh.instanceColor!.needsUpdate = true;
    }
    stats.instances = instances;
  }

  function rebuildAll() {
    const sections = seed === null ? [] : stream.update(distance);
    views.forEach(disposeView); views.clear();
    for (const section of sections) {
      const view = buildSection(section);
      view.group.position.z = distance - section.startS; views.set(section.index, view);
    }
    dirty = true;
  }

  return {
    /** Keeps the three-section window built for the current seed and forward distance. */
    update(nextSeed: number, nextDistance: number) {
      distance = nextDistance;
      if (seed !== nextSeed) {
        views.forEach(disposeView); views.clear(); stream.clear();
        seed = nextSeed; stream = createTerrainStream(seed);
      }
      const active = stream.update(distance), live = new Set(active.map(section => section.index));
      for (const [index, view] of views) if (!live.has(index)) { disposeView(view); views.delete(index); }
      for (const section of active) {
        let view = views.get(section.index);
        if (!view) { view = buildSection(section); views.set(section.index, view); }
        view.group.position.z = distance - section.startS;
      }
    },
    /** Culls ground strips by exact boxes and recompacts piece instances when the view moved past the margin. */
    cull(camera: THREE.Camera) {
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      if (dirty || Math.abs(camera.position.x - lastCameraX) > RECOMPACT || Math.abs(distance - lastDistance) > RECOMPACT) {
        compact(); dirty = false; lastCameraX = camera.position.x; lastDistance = distance;
      }
      pieces.position.z = distance - origin;
      let calls = 0, triangles = 0;
      for (const view of views.values()) for (const cullable of view.cullables) {
        worldBox.copy(cullable.box).translate(offset.set(0, 0, view.group.position.z));
        const visible = frustum.intersectsBox(worldBox);
        cullable.object.visible = visible;
        if (visible) { calls += cullable.object.children.length; triangles += cullable.triangles; }
      }
      for (const entry of batches.values()) if (entry.mesh.count > 0) { calls++; triangles += entry.triangles * entry.mesh.count; }
      stats.calls = calls; stats.triangles = Math.round(triangles); stats.kit = kitSource; stats.infra = infraSource; stats.shared = sharedSource;
    },
    setQuality(next: GraphicsQuality) {
      // Low tier skips cosmetic scatter only; layout, heights, and formations are unchanged.
      if (next !== quality) { quality = next; dirty = true; }
    },
    /** Swap in the loaded Blender kit (missing nodes keep their fallback). */
    setKit(loaded: KitGeometries) {
      const previous = kit;
      kit = new Map(previous);
      for (const [name, geometry] of loaded) kit.set(name, geometry);
      if (loaded.size) kitSource = 'glb';
      for (const name of [...batches.keys()]) batch(name);
      for (const [name, geometry] of previous) if (kit.get(name) !== geometry) geometry.dispose();
      dirty = true;
    },
    /** Swap in modelled infrastructure (missing nodes keep their code-built stand-in). */
    setInfra(loaded: KitGeometries) {
      const previous = infra;
      infra = new Map(previous);
      for (const [name, geometry] of loaded) infra.set(name, geometry);
      if (loaded.size) infraSource = 'glb';
      for (const name of [...batches.keys()]) batch(name);
      for (const [name, geometry] of previous) if (infra.get(name) !== geometry) geometry.dispose();
      dirty = true;
    },
    /** Swap in the shared industrial kit (missing nodes keep their code-built stand-in). */
    setShared(loaded: KitGeometries) {
      const previous = shared;
      shared = new Map(previous);
      for (const [name, geometry] of loaded) shared.set(name, geometry);
      if (loaded.size) sharedSource = 'glb';
      for (const name of [...batches.keys()]) batch(name);
      for (const [name, geometry] of previous) if (shared.get(name) !== geometry) geometry.dispose();
      dirty = true;
    },
    /** Every node batch, made visible, so a warm-up compile covers all scenery programs. */
    warmupObjects(): THREE.Object3D[] {
      for (const kind of KIT_KINDS) for (let v = 0; v < KIT[kind].variants; v++) batch(kitNodeName(kind, v));
      for (const name of [...Object.keys(INFRA_NODES), ...SHARED_NODES]) batch(name);
      return [...batches.values()].map(entry => entry.mesh);
    },
    get stats(): Readonly<TerrainStats> { return stats; },
    dispose() {
      views.forEach(disposeView); views.clear(); stream.clear();
      batches.forEach(entry => entry.mesh.dispose()); batches.clear(); scene.remove(pieces);
      kit.forEach(geometry => geometry.dispose()); infra.forEach(geometry => geometry.dispose()); shared.forEach(geometry => geometry.dispose());
      edgeGeometry.dispose();
    },
    /** Rebuilds live sections, e.g. after a layout-affecting change; kept for completeness. */
    rebuild: rebuildAll,
  };
}
