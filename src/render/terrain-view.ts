import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { VIEW, type GraphicsQuality } from '../shared/contracts';
import {
  FLOE_FOOTPRINT, KIT, KIT_KINDS, PLANETS, ROAD_STEP, SHARED_NODES, TERRAIN_STEP, createTerrainStream, kitNodeName, moduleSize, pieceBounds, routeOfInput, routedWorld,
  terrainHeight, worldAt, worldOf, type DistrictSite,
  type Floe, type IndustryPiece, type PlanetId, type RoadPath, type RoutedWorld, type TerrainInput, type TerrainRoute, type TerrainSection, type World, type WorldInput,
} from '../world/terrain';
import {
  GROUND_TILE, INFRA_NODES, VESPER_INFRA_NODES, createFallbackKit, createFallbackVesperInfra, createWaterMaterial, loadNacreKit, loadVesperInfra, loadVesperKit,
  type KitGeometries,
} from './terrain-kit';

/**
 * Hidden preview switch: `?planet=vesper` renders that planet's world in any run (look tests before its mission
 * ships; it is not offered in any menu). Seating that reads the view's `world` getter follows it.
 */
const DEV_PLANET: PlanetId | null = (() => {
  try {
    if (typeof location === 'undefined') return null;
    const planet = new URLSearchParams(location.search).get('planet');
    return planet && planet in PLANETS ? planet as PlanetId : null;
  } catch { return null; }
})();
const devWorld = (input?: WorldInput): WorldInput => {
  if (!DEV_PLANET) return input;
  return { planet: DEV_PLANET, arena: input && 'fromS' in input ? input : input?.arena };
};
/** The preview switch on a route: every stretch shows that planet, with the route's own arenas. */
const devRoutes = new Map<string, TerrainRoute>();
function devRoute(route: TerrainRoute): TerrainRoute {
  if (!DEV_PLANET) return route;
  const key = `${route.key}|preview:${DEV_PLANET}`;
  let made = devRoutes.get(key);
  if (!made) {
    const planet = DEV_PLANET, swap = (world: World) => worldOf({ planet, arena: world.arena });
    made = { key, worldAt: s => swap(route.worldAt(s)), lookAt: () => planet,
      spans: (from, to) => route.spans(from, to).reduce<{ world: World; from: number; to: number }[]>((out, span) => {
        const world = swap(span.world), tail = out[out.length - 1];
        if (tail && tail.world === world) tail.to = span.to; else out.push({ world, from: span.from, to: span.to });
        return out;
      }, []) };
    devRoutes.set(key, made);
  }
  return made;
}
/** How far ahead (world units) a route's coming planets have their kits loaded: well before any jump. */
const PRELOAD_AHEAD = 400;
const KHEPRI_HAULERS = ['infra_cargo_0', 'infra_cargo_1', 'infra_cargo_2'], VESPER_HAULERS = ['vesper_ice_hauler'];
/** Slow presentation-only floe drift: circling speed (rad/s) and gentle yaw sway. */
const FLOE_SPIN = 0.07, FLOE_SWAY = 0.05;

/** Extra world units around the frustum kept in the compacted instance set, and the camera travel that triggers recompaction. */
const CULL_MARGIN = 2.2, RECOMPACT = 1.1;

interface Cullable { object: THREE.Object3D; box: THREE.Box3; triangles: number }
/** Per-node instance data of one section in section-local space (z = −(s − startS)). */
interface Prepared { matrices: Float32Array; colors: Float32Array; boxes: Float32Array; cosmetic: Uint8Array; count: number }
interface SectionView {
  index: number; startS: number; group: THREE.Group; cullables: Cullable[];
  instanced: THREE.InstancedMesh[]; geometries: THREE.BufferGeometry[]; prepared: Map<string, Prepared>;
  /** Road centrelines touching this section, for haulers. */
  roads: Map<string, RoadPath>;
  /** Shadow-only merged caster strips (layer SHADOW_CASTER_LAYER); rebuilt when kit geometry changes. */
  casters: THREE.Mesh[];
  /** Pack ice drawn by animate() (drifting, presentation only), and its section's sea level. */
  floes: readonly Floe[]; sea: number;
  /** Vent-stack tops (world x, y and forward s) for the live features. */
  vents: readonly { x: number; y: number; s: number }[];
  /** District pads reaching the section (render-only reservations, docs/23). */
  sites: readonly DistrictSite[];
}
interface Batch { mesh: THREE.InstancedMesh; capacity: number; triangles: number }
export interface TerrainViewOptions {
  scene: THREE.Scene;
  groundMaterial: THREE.Material; kitMaterial: THREE.Material; infraMaterial: THREE.Material; boundaryMaterial: THREE.Material;
  /** Palette-from-masks material for the shared industrial kit (docs/14). */
  sharedMaterial: THREE.Material;
  /** Road ribbon material (graded dust, ruts, berms). */
  roadMaterial: THREE.Material;
  /** Code-built infrastructure stand-ins, used until (or unless) khepri-infra.glb provides real nodes. */
  fallbackInfra: KitGeometries;
  /** Code-built pipes and tanks, used until (or unless) industrial-kit.glb provides real nodes. */
  fallbackShared: KitGeometries;
  /** Ocean material hook (planets with a sea); a placeholder is created when omitted. */
  waterMaterial?: THREE.Material;
  /** Base URL for per-planet assets loaded on first use (Vesper kits); defaults to the app base. */
  assetBase?: string;
  /** Called when the world's planet changes (lighting/palette rigs); the ground material's own hook runs too. */
  onPlanet?: (planet: PlanetId) => void;
}
export interface TerrainStats {
  calls: number; triangles: number; instances: number; haulers: number;
  kit: 'glb' | 'fallback'; infra: 'glb' | 'fallback'; shared: 'glb' | 'fallback';
}
const SHARED = new Set<string>(SHARED_NODES);
/** Background haulers are drawn at 75% of the cargo node (1.05 × 1.75 footprint) so they read as traffic. */
const HAULER_SCALE = 0.75, HAULER_HALF_WIDTH = 1.05 / 2 * HAULER_SCALE, HAULER_HALF_LENGTH = 1.75 / 2 * HAULER_SCALE;
/** Lane offset from the road centreline: two haulers pass 0.8 apart, just clear of each other. */
const HAULER_LANE = 0.4, HAULER_CAPACITY = 48;

/** A render-only rectangle in world (x, s) whose scenery pieces are hidden, e.g. under a boss fortress. */
export interface TerrainExclusion { minX: number; maxX: number; minS: number; maxS: number }
/**
 * Live presentation features in three.js world space (x, y, z = distance − s), rebuilt by every animate() for
 * the pieces near the view: drifting pack ice (waterline centre, yaw about +y, half extents along the piece's
 * own x and z) and vent-stack tops (steam). Effects read these instead of the batches' names. Never gameplay.
 */
export interface FloeFeature { id: string; kind: 'floe' | 'iceberg'; x: number; y: number; z: number; rx: number; rz: number; yaw: number }
export interface VentFeature { x: number; y: number; z: number }
export interface TerrainFeatures { readonly floes: readonly FloeFeature[]; readonly vents: readonly VentFeature[] }
/** Exclusion updates within this distance reuse the last compaction (the applied rectangle is grown by it). */
const EXCLUSION_SLACK = 0.25;

/** Lateral caster strips per section (each 9 units wide); the shadow camera frustum culls the rest. */
const CASTER_STRIPS = 4;
/**
 * Only meaningful casters (formations, columns, landmarks, outpost machinery and tanks) put shadows into the
 * map; rocks, pebbles, crystals, boulders, fallen columns, pipes, cargo and flat pads only receive.
 */
const CASTER_NODES = new Set<string>([
  // Tall Nacre pieces (crags and the builders' ruins) ground themselves with real shadows on High too.
  ...(['clump', 'column', 'spire', 'wall', 'rosette', 'hoodoo', 'crystalSpire', 'mireCrag', 'ruinTower', 'ruinFort', 'ruinPillars'] as const).flatMap(kind => Array.from({ length: KIT[kind].variants }, (_, v) => kitNodeName(kind, v))),
  'infra_refinery', 'infra_drill_rig', 'infra_silo', 'infra_comm_dish', 'infra_relay', 'infra_habitat_0', 'infra_habitat_1',
  'tank_vertical_0', 'tank_vertical_1', 'tank_sphere', 'tank_horizontal', 'khepri_processing_tower',
]);

const piecePosition = new THREE.Vector3(), pieceRotation = new THREE.Euler(), pieceQuaternion = new THREE.Quaternion(), pieceScale = new THREE.Vector3();
/**
 * Instance matrix of a shared-kit piece in section-local space (z = −(s − startS)): yaw, then pitch about
 * local x, then roll about local z (Euler 'YXZ'), and a stretch along local y and z. Shared with the tests
 * that check laid pipelines join up.
 */
export function industryMatrix(piece: IndustryPiece, startS: number, target = new THREE.Matrix4()): THREE.Matrix4 {
  pieceRotation.set(piece.pitch, piece.rotation, piece.roll, 'YXZ');
  return target.compose(piecePosition.set(piece.x, piece.y, -(piece.s - startS)), pieceQuaternion.setFromEuler(pieceRotation),
    pieceScale.set(1, piece.scaleY, piece.scaleZ));
}

function tint(seed: number, x: number, s: number): number {
  let n = Math.imul(Math.round(x * 131) ^ seed, 0x27d4eb2d) ^ Math.imul(Math.round(s * 113), 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

const triangleCount = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

/**
 * Streams procedural sections into scenery. Ground is split into lateral strips culled by exact boxes.
 * Kit and infrastructure pieces use one InstancedMesh per node, refilled with only the instances whose
 * boxes intersect the (margin-expanded) view whenever the camera has moved past the margin, so draw
 * calls stay bounded by the node count and triangles by what is actually on screen. Presentation only.
 */
export function createTerrainView(options: TerrainViewOptions) {
  const { scene, groundMaterial, kitMaterial, infraMaterial, boundaryMaterial, sharedMaterial, roadMaterial } = options;
  let kit: KitGeometries = createFallbackKit(), infra: KitGeometries = new Map(options.fallbackInfra), shared: KitGeometries = new Map(options.fallbackShared);
  let kitSource: TerrainStats['kit'] = 'fallback', infraSource: TerrainStats['infra'] = 'fallback', sharedSource: TerrainStats['shared'] = 'fallback';
  let quality: GraphicsQuality = 'high', seed: number | null = null, stream = createTerrainStream(0);
  /** The world (planet and mission arena) the current stream was built with, or its route (endless cycle). */
  let world: World = worldOf(), route: TerrainRoute | null = null, sourceKey = '';
  /** The planet the look shows (ground material, onPlanet); on a route it switches at a jump's flash. */
  let lookPlanet: PlanetId | null = null, viewFallbacks = 0;
  let water: THREE.Material | null = options.waterMaterial ?? null;
  const loadedPlanets = new Set<PlanetId>(['khepri']);
  const views = new Map<number, SectionView>(), batches = new Map<string, Batch>();
  const pieces = new THREE.Group(); pieces.name = 'Khepri instanced scenery'; scene.add(pieces);
  const edgeGeometry = new THREE.BoxGeometry(0.06, 0.018, 1.5);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), worldBox = new THREE.Box3(), offset = new THREE.Vector3();
  const stats: TerrainStats = { calls: 0, triangles: 0, instances: 0, haulers: 0, kit: kitSource, infra: infraSource, shared: sharedSource };
  let distance = 0, origin = 0, lastCameraX = NaN, lastDistance = NaN, lastViewX = 0, dirty = true;
  /** Applied exclusion (grown by the slack), or null: hidden scenery under e.g. a boss fortress. */
  let exclusion: TerrainExclusion | null = null, requested: TerrainExclusion | null = null;
  let facilityClearings: readonly TerrainExclusion[] = [];

  const nodeGeometry = (name: string) => kit.get(name) ?? infra.get(name) ?? shared.get(name);
  // Khepri infrastructure and the district kit (`khepri_*`, same materials) draw with the infra material.
  const nodeMaterial = (name: string) => name.startsWith('infra_') || name.startsWith('khepri_') ? infraMaterial : SHARED.has(name) ? sharedMaterial : kitMaterial;
  function createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, name: string) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, color.setRGB(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.name = name;
    // Instanced pieces take the sun's shadow; casting goes through the merged caster strips (one draw per strip).
    mesh.castShadow = false; mesh.receiveShadow = true;
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
  /** Rear axle of each hauler drawn this frame (world space), for render-only dust puffs. */
  const haulerDust: { x: number; y: number; z: number }[] = [];
  /**
   * Roads that mostly run on top of another road (a shared corridor) carry no haulers, so two never stack. Decided once
   * per road id, never per frame, so a hauler never blinks out and back.
   */
  const sharedCorridor = new Map<string, boolean>();
  function corridorShared(road: RoadPath, roads: ReadonlyMap<string, RoadPath>): boolean {
    let shared = sharedCorridor.get(road.id);
    if (shared !== undefined) return shared;
    let near = 0, samples = 0;
    for (let i = 0; i < road.x.length; i += 4) {
      samples++;
      search: for (const other of roads.values()) {
        if (other.id === road.id || sharedCorridor.get(other.id) === true) continue;
        for (let j = 0; j < other.x.length; j += 2) if (Math.abs(other.x[j] - road.x[i]) < 1.2 && Math.abs(other.s[j] - road.s[i]) < 1.2) { near++; break search; }
      }
    }
    shared = samples > 0 && near / samples > 0.3;
    sharedCorridor.set(road.id, shared);
    return shared;
  }
  /** Live features (pooled objects, refilled by animate()). */
  const floeFeatures: FloeFeature[] = [], ventFeatures: VentFeature[] = [], features: TerrainFeatures = { floes: floeFeatures, vents: ventFeatures };
  let floeUsed = 0, ventUsed = 0;
  /** Dynamic hauler meshes (one per cargo model), refilled every frame by animate(). */
  const haulers = new Map<string, THREE.InstancedMesh>();
  function hauler(name: string): THREE.InstancedMesh | null {
    const geometry = infra.get(name);
    if (!geometry) return null;
    let mesh = haulers.get(name);
    if (!mesh || mesh.geometry !== geometry) {
      if (mesh) { scene.remove(mesh); mesh.dispose(); }
      // Room for every hauler in view: an overflow would drop haulers in and out as the draw order changes (flicker).
      mesh = new THREE.InstancedMesh(geometry, infraMaterial, HAULER_CAPACITY);
      // Same program variant as the static batches (instance colour present), so no compile hitch on first sight.
      for (let i = 0; i < HAULER_CAPACITY; i++) mesh.setColorAt(i, color.setRGB(1, 1, 1));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Khepri hauler ${name}`;
      mesh.castShadow = false; mesh.receiveShadow = true;
      haulers.set(name, mesh); scene.add(mesh);
    }
    return mesh;
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

  /* ------------------------------------------------------------ shadow casters (only the High tier renders them) */
  /**
   * Caster strips are shadow-only: they report a frustum hit only for the sun's shadow frustum (set by the
   * renderer on High), so the main pass culls them and terrain shadows cost a few draws instead of one per node.
   */
  let casterFrustum: THREE.Frustum | null = null;
  const casterMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  /** World-space rectangle (minX, maxX, minZ, maxZ) whose caster pieces collapse, e.g. under the boss fortress. */
  const casterExclusion = { value: new THREE.Vector4(1, -1, 1, -1) };
  const casterClearings = { value: Array.from({length:12}, () => new THREE.Vector4(1,-1,1,-1)) };
  const casterClearingCount = { value: 0 };
  const casterDepth = new THREE.MeshDepthMaterial();
  casterDepth.onBeforeCompile = shader => {
    shader.uniforms.casterExclusion = casterExclusion;
    shader.uniforms.casterClearings = casterClearings;
    shader.uniforms.casterClearingCount = casterClearingCount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 anchor;\nuniform vec4 casterExclusion; uniform vec4 casterClearings[12]; uniform int casterClearingCount;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec2 anchorWorld = ( modelMatrix * vec4( anchor.x, 0.0, anchor.y, 1.0 ) ).xz;
  if ( anchorWorld.x > casterExclusion.x && anchorWorld.x < casterExclusion.y && anchorWorld.y > casterExclusion.z && anchorWorld.y < casterExclusion.w ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  for ( int i = 0; i < 12; i++ ) {
    if ( i >= casterClearingCount ) break;
    vec4 c = casterClearings[i];
    if ( anchorWorld.x > c.x && anchorWorld.x < c.y && anchorWorld.y > c.z && anchorWorld.y < c.w ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  }`);
  };
  casterDepth.customProgramCacheKey = () => 'khepri-caster-depth';
  /** Position-only, vertex-welded copies of caster nodes (flat-shaded kit triangles share corners). */
  const proxies = new Map<string, { position: Float32Array; index: Uint32Array }>();
  function proxy(name: string) {
    let entry = proxies.get(name);
    if (entry) return entry;
    const source = nodeGeometry(name);
    if (!source) return null;
    const positions = new THREE.BufferGeometry(); positions.setAttribute('position', source.getAttribute('position'));
    if (source.index) positions.setIndex(source.index);
    const welded = mergeVertices(positions, 1e-4);
    const count = welded.getAttribute('position').count;
    const index = welded.index ? Uint32Array.from(welded.index.array as ArrayLike<number>) : Uint32Array.from({ length: count }, (_, i) => i);
    entry = { position: Float32Array.from(welded.getAttribute('position').array as ArrayLike<number>), index };
    welded.dispose(); proxies.set(name, entry);
    return entry;
  }
  /**
   * Merges the section's meaningful casters into a few static, shadow-only strips in section-local space.
   * Resumable: one strip per step, so the section build stays within the per-frame streaming budget.
   */
  function* casterSteps(view: SectionView): Generator<void, void, void> {
    view.casters.forEach(mesh => { view.group.remove(mesh); mesh.geometry.dispose(); }); view.casters = [];
    type Shape = NonNullable<ReturnType<typeof proxy>>;
    const strips = Array.from({ length: CASTER_STRIPS }, () => ({ vertices: 0, indices: 0, items: [] as { shape: Shape; data: Prepared; i: number }[] }));
    for (const [name, data] of view.prepared) {
      if (!CASTER_NODES.has(name)) continue;
      const shape = proxy(name);
      if (!shape) continue;
      for (let i = 0; i < data.count; i++) {
        const x = (data.boxes[i * 6] + data.boxes[i * 6 + 3]) / 2;
        const strip = strips[Math.min(CASTER_STRIPS - 1, Math.max(0, Math.floor((x + VIEW.worldWidth / 2) / (VIEW.worldWidth / CASTER_STRIPS))))];
        strip.items.push({ shape, data, i }); strip.vertices += shape.position.length / 3; strip.indices += shape.index.length;
      }
    }
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    for (const strip of strips) {
      if (!strip.items.length) continue;
      const position = new Float32Array(strip.vertices * 3), anchor = new Float32Array(strip.vertices * 2), index = new Uint32Array(strip.indices);
      let v = 0, k = 0;
      for (const { shape, data, i } of strip.items) {
        const base = v;
        matrix.fromArray(data.matrices, i * 16);
        const ax = (data.boxes[i * 6] + data.boxes[i * 6 + 3]) / 2, az = (data.boxes[i * 6 + 2] + data.boxes[i * 6 + 5]) / 2;
        for (let j = 0; j < shape.position.length; j += 3, v++) {
          point.set(shape.position[j], shape.position[j + 1], shape.position[j + 2]).applyMatrix4(matrix);
          position[v * 3] = point.x; position[v * 3 + 1] = point.y; position[v * 3 + 2] = point.z;
          anchor[v * 2] = ax; anchor[v * 2 + 1] = az;
        }
        for (let j = 0; j < shape.index.length; j++) index[k++] = base + shape.index[j];
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3)); geometry.setAttribute('anchor', new THREE.BufferAttribute(anchor, 2));
      geometry.setIndex(new THREE.BufferAttribute(index, 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, casterMaterial); mesh.name = `Khepri shadow casters ${view.index}`;
      mesh.castShadow = true; mesh.receiveShadow = false; mesh.customDepthMaterial = casterDepth;
      mesh.intersectsFrustum = frustum => frustum === casterFrustum && frustum.intersectsObject(mesh);
      view.group.add(mesh); view.casters.push(mesh);
      yield;
    }
  }
  function buildCasters(view: SectionView) { for (const _ of casterSteps(view)) void _; }
  /** Caster proxies follow the loaded kit: rebuild every live (and prebuilt) section once when nodes change. */
  function refreshCasters() {
    proxies.clear();
    for (const view of views.values()) buildCasters(view);
    if (prebuilt?.view) buildCasters(prebuilt.view);
    // A half-built prefetched view would keep stand-in casters; drop it and let prefetch rebuild it.
    else if (prebuilt) discardPrebuilt();
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
      const localS = prop.s - section.startS, z = -localS;
      transform.position.set(prop.x, prop.baseHeight, z); transform.rotation.set(0, prop.rotation, 0);
      transform.scale.set(1, 1, 1); transform.updateMatrix();
      // Contract bounds from the module registry (Khepri nodes: the same numbers as INFRA_NODES; Vesper nodes get their own).
      const size = moduleSize(prop.node) ?? INFRA_NODES[prop.node]?.size ?? [1, 1, 1], half = Math.hypot(size[0], size[2]) / 2 + 0.1;
      const box = new THREE.Box3(new THREE.Vector3(prop.x - half, prop.baseHeight - 0.1, z - half), new THREE.Vector3(prop.x + half, prop.baseHeight + size[1] + 0.1, z + half));
      push(prop.node, transform.matrix.clone(), new THREE.Color(1, 1, 1), box, prop.cosmetic === true);
    }
    for (const piece of section.industry) {
      // Pipes are posed by generation (pitched runs, vertical risers, stretched supports); boxes cover the rotated piece.
      const bounds = pieceBounds(piece), margin = 0.05;
      const box = new THREE.Box3(new THREE.Vector3(bounds.minX - margin, bounds.minY - margin, -(bounds.maxS - section.startS) - margin),
        new THREE.Vector3(bounds.maxX + margin, bounds.maxY + margin, -(bounds.minS - section.startS) + margin));
      push(piece.node, industryMatrix(piece, section.startS), new THREE.Color(1, 1, 1), box, piece.cosmetic === true);
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

  function* buildGround(section: TerrainSection, view: SectionView): Generator<void, void, void> {
    const vertices = section.across * section.along, uv = new Float32Array(vertices * 2), surface = new Float32Array(vertices * 4);
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
    yield;
    for (let b = 0; b < section.strips.length; b++) {
      const strip = section.strips[b], geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(index); geometry.setDrawRange(strip.start, strip.count);
      const box = new THREE.Box3(new THREE.Vector3(strip.minX, Infinity, -section.size), new THREE.Vector3(strip.maxX, -Infinity, 0));
      const first = Math.round((strip.minX + VIEW.worldWidth / 2) / TERRAIN_STEP), last = Math.round((strip.maxX + VIEW.worldWidth / 2) / TERRAIN_STEP);
      for (let row = 0; row < section.along; row++) for (let column = first; column <= last; column++) {
        const y = section.positions[(row * section.across + column) * 3 + 1];
        box.min.y = Math.min(box.min.y, y); box.max.y = Math.max(box.max.y, y);
      }
      geometry.boundingBox = box.clone(); geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      // Ground takes shadows from scenery (its own relief shading is baked); it does not cast.
      const ground = new THREE.Mesh(geometry, groundMaterial); ground.name = `Khepri ground ${section.index}:${b}`; ground.receiveShadow = true;
      const holder = new THREE.Group(); holder.add(ground); view.group.add(holder);
      view.geometries.push(geometry);
      const cullable: Cullable = { object: holder, box, triangles: strip.count / 3 };
      view.cullables.push(cullable);
      yield;
      // World limits read as quiet surveyed flight-border lines on the outermost strips only.
      if (b !== 0 && b !== section.strips.length - 1) continue;
      const x = (b === 0 ? -1 : 1) * (VIEW.worldWidth / 2 - 0.06);
      const marks = new THREE.InstancedMesh(edgeGeometry, boundaryMaterial, Math.ceil(section.size / 3));
      let i = 0;
      for (let s = 0; s < section.size; s += 3) {
        transform.position.set(x, terrainHeight(section.seed, x, section.startS + s, route ?? world) + 0.035, -s);
        transform.rotation.set(0, 0, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); marks.setMatrixAt(i++, transform.matrix);
      }
      marks.count = i; marks.computeBoundingSphere(); holder.add(marks); view.instanced.push(marks);
      cullable.triangles += i * 12;
      yield;
    }
  }

  /** Resumable view build: instance preparation, each ground strip, and the road mesh are separate steps. */
  function* buildSteps(section: TerrainSection): Generator<void, SectionView, void> {
    const group = new THREE.Group(); group.name = `Khepri procedural section ${section.index}`;
    const view: SectionView = { index: section.index, startS: section.startS, group, cullables: [], instanced: [], geometries: [], prepared: prepare(section), roads: new Map(), casters: [], floes: section.floes ?? [], sea: section.water?.level ?? 0,
      vents: section.instances.filter(piece => piece.kind === 'vent').map(piece => ({ x: piece.x, y: piece.y + piece.height * KIT.vent.height, s: piece.s })),
      sites: section.sites ?? [] };
    yield;
    yield* casterSteps(view);
    yield* buildGround(section, view);
    buildRoads(section, view);
    if (section.water) { yield; buildWater(section, view); }
    return view;
  }

  /**
   * Placeholder ocean for one section: a sea-level sheet on the half-unit grid, only where the ground is under
   * or near the water, with depth tint and foam in vertex colours and `shore`/`depth` attributes for a real shader.
   */
  function buildWater(section: TerrainSection, view: SectionView) {
    const { level, shore } = section.water!, stride = 2, columns = (section.across - 1) / stride + 1, rows = (section.along - 1) / stride + 1;
    const positions = new Float32Array(columns * rows * 3), colors = new Float32Array(columns * rows * 3);
    const shoreAttribute = new Float32Array(columns * rows), depthAttribute = new Float32Array(columns * rows), indices: number[] = [];
    const deep = new THREE.Color().setHex(0x0d3557, THREE.SRGBColorSpace), shallow = new THREE.Color().setHex(0x1f6a8f, THREE.SRGBColorSpace);
    const foam = new THREE.Color().setHex(0xeef6fb, THREE.SRGBColorSpace), color = new THREE.Color();
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
      const v = r * columns + c, g = (r * stride) * section.across + c * stride, ground = section.positions[g * 3 + 1], distance = shore[g];
      positions[v * 3] = section.positions[g * 3]; positions[v * 3 + 1] = level; positions[v * 3 + 2] = section.positions[g * 3 + 2];
      const depth = Math.max(0, level - ground);
      // A soft foam band over the whole clamped distance (±1), so the half-unit grid never shows as steps.
      const band = Math.max(0, 1 - Math.abs(distance)), soft = band * band * (3 - 2 * band);
      color.copy(shallow).lerp(deep, Math.min(1, depth / 2.2)).lerp(foam, soft * 0.35);
      color.toArray(colors, v * 3); shoreAttribute[v] = distance; depthAttribute[v] = depth;
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c, b = a + 1, d = a + columns, e = d + 1;
      // Skip sheets entirely over dry shelf (the ground hides them anyway).
      if (Math.max(shoreAttribute[a], shoreAttribute[b], shoreAttribute[d], shoreAttribute[e]) < -0.6) continue;
      indices.push(a, b, d, b, e, d);
    }
    if (!indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(columns * rows * 3).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    // Vertex colours feed only the placeholder material; a supplied water material reads shore and depth.
    if (!options.waterMaterial) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('shore', new THREE.BufferAttribute(shoreAttribute, 1));
    geometry.setAttribute('depth', new THREE.BufferAttribute(depthAttribute, 1));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    water ??= createWaterMaterial();
    const mesh = new THREE.Mesh(geometry, water); mesh.name = `Vesper water ${section.index}`; mesh.receiveShadow = true;
    const holder = new THREE.Group(); holder.add(mesh); view.group.add(holder); view.geometries.push(geometry);
    view.cullables.push({ object: holder, box: geometry.boundingBox!.clone().expandByScalar(0.1), triangles: indices.length / 3 });
  }

  /** The look follows a planet: the ground material's own hook and the caller's rig (onPlanet). */
  function applyLook(planet: PlanetId) {
    if (planet === lookPlanet) return;
    lookPlanet = planet;
    (groundMaterial.userData.setPlanet as ((planet: PlanetId) => void) | undefined)?.(planet);
    options.onPlanet?.(planet);
  }
  /** Loads a planet's own kits on first use (Vesper: ice kit and infrastructure; fallbacks render meanwhile). */
  function ensurePlanet(planet: PlanetId) {
    if (loadedPlanets.has(planet)) return;
    loadedPlanets.add(planet);
    if (planet === 'nacre') {
      // Nacre's Blender kit (rock, flora, ruins); the light code-built stand-ins draw until it arrives.
      const base = options.assetBase ?? (import.meta.env?.BASE_URL ?? './');
      loadNacreKit(`${base}assets/nacre/nacre-kit.glb`).then(loaded => { if (!disposed) self.setKit(loaded); else loaded.forEach(g => g.dispose()); })
        .catch(error => console.warn('Nacre kit unavailable; using stand-ins.', error));
      return;
    }
    if (planet !== 'vesper') return;
    self.setInfra(createFallbackVesperInfra());
    const base = options.assetBase ?? (import.meta.env?.BASE_URL ?? './');
    loadVesperKit(`${base}assets/vesper/vesper-kit.glb`).then(loaded => { if (!disposed) self.setKit(loaded); else loaded.forEach(g => g.dispose()); })
      .catch(error => console.warn('Vesper kit unavailable; using fallback ice.', error));
    loadVesperInfra(`${base}assets/vesper/vesper-infra.glb`).then(loaded => { if (!disposed) self.setInfra(loaded); else loaded.forEach(g => g.dispose()); })
      .catch(error => console.warn('Vesper infrastructure unavailable; using stand-ins.', error));
  }
  let disposed = false;
  /** Drifting pack ice (one dynamic batch per kit node), refilled every frame by animate(). */
  const floeMeshes = new Map<string, THREE.InstancedMesh>();
  function floeMesh(name: string, needed: number): THREE.InstancedMesh | null {
    const geometry = kit.get(name);
    if (!geometry) return null;
    let mesh = floeMeshes.get(name);
    if (!mesh || mesh.geometry !== geometry || mesh.instanceMatrix.count < needed) {
      const capacity = Math.max(32, 2 ** Math.ceil(Math.log2(Math.max(needed, 1))));
      if (mesh) { scene.remove(mesh); mesh.dispose(); }
      mesh = new THREE.InstancedMesh(geometry, kitMaterial, capacity);
      for (let i = 0; i < capacity; i++) mesh.setColorAt(i, color.setRGB(1, 1, 1));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Vesper ${name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      floeMeshes.set(name, mesh); scene.add(mesh);
    }
    return mesh;
  }
  function buildSection(section: TerrainSection): SectionView {
    const work = buildSteps(section);
    let step = work.next();
    while (!step.done) step = work.next();
    scene.add(step.value.group); dirty = true;
    return step.value;
  }
  /** A view built ahead (in budgeted steps) for the prefetched section, attached when that section enters the window. */
  let prebuilt: { section: TerrainSection; work: Generator<void, SectionView, void>; view: SectionView | null } | null = null;
  const discardPrebuilt = () => {
    if (!prebuilt) return;
    if (prebuilt.view) disposeView(prebuilt.view);
    else { const partial = prebuilt.work.return(undefined as never); void partial; }
    prebuilt = null;
  };

  /** One ribbon mesh per section for the road segments that start in it, culled by its box. */
  function buildRoads(section: TerrainSection, view: SectionView) {
    const roads = section.roads;
    if (!roads.indices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(roads.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(roads.uvs, 2));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(roads.alpha, 1));
    geometry.setAttribute('shade', new THREE.BufferAttribute(roads.shade, 1));
    geometry.setIndex(new THREE.BufferAttribute(roads.indices, 1));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, roadMaterial); mesh.name = `Khepri roads ${section.index}`; mesh.renderOrder = 1; mesh.receiveShadow = true;
    const holder = new THREE.Group(); holder.add(mesh); view.group.add(holder); view.geometries.push(geometry);
    view.cullables.push({ object: holder, box: geometry.boundingBox!.clone().expandByScalar(0.1), triangles: roads.indices.length / 3 });
    for (const road of section.roadPaths) view.roads.set(road.id, road);
  }
  function disposeView(view: SectionView) {
    scene.remove(view.group);
    view.casters.forEach(mesh => mesh.geometry.dispose()); view.casters = [];
    view.instanced.forEach(mesh => mesh.dispose());
    view.geometries.forEach(geometry => geometry.dispose());
    dirty = true;
  }

  /** Refill every node batch with the instances whose boxes meet the margin-expanded frustum. */
  function compact() {
    const counts = new Map<string, number>();
    origin = views.size ? Math.min(...[...views.values()].map(view => view.startS)) : 0;
    const viewLeft = lastViewX - VIEW.width / 2 - CULL_MARGIN - 0.5, viewRight = lastViewX + VIEW.width / 2 + CULL_MARGIN + 0.5;
    let instances = 0;
    for (const view of views.values()) {
      const zShift = distance - view.startS, matrixShift = origin - view.startS;
      // Exclusion in this section's local z (z = −(s − startS)); null costs one check per instance.
      const hide = exclusion && { minX: exclusion.minX, maxX: exclusion.maxX, minZ: view.startS - exclusion.maxS, maxZ: view.startS - exclusion.minS };
      for (const [name, data] of view.prepared) {
        const entry = batch(name);
        if (!entry) continue;
        let slot = counts.get(name) ?? 0;
        for (let i = 0; i < data.count; i++) {
          if (quality === 'low' && data.cosmetic[i]) break;
          const b = i * 6;
          // Cheap lateral reject first: the view is 12 wide in a 36-wide world, so most pieces fail here.
          if (data.boxes[b + 3] < viewLeft || data.boxes[b] > viewRight) continue;
          if (hide && data.boxes[b + 3] > hide.minX && data.boxes[b] < hide.maxX && data.boxes[b + 5] > hide.minZ && data.boxes[b + 2] < hide.maxZ) continue;
          // Same box-centre anchor as the shadow proxy, so a removed rock cannot leave a ghost shadow.
          const ax = (data.boxes[b] + data.boxes[b + 3]) / 2, as = view.startS - (data.boxes[b + 2] + data.boxes[b + 5]) / 2;
          if (facilityClearings.some(c => ax > c.minX && ax < c.maxX && as > c.minS && as < c.maxS)) continue;
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
    views.forEach(disposeView); views.clear(); sharedCorridor.clear();
    for (const section of sections) {
      const view = buildSection(section);
      view.group.position.z = distance - section.startS; views.set(section.index, view);
    }
    dirty = true;
  }

  const self = {
    /**
     * Keeps the three-section window built for the seed and forward distance. `next` is the world:
     * `{ planet, arena }` (a bare arena still means Khepri; omit for Khepri without an arena), or a route
     * (`routeOf` over the run's schedule: planet stretches and boss arenas by distance, docs/18 §3). A new seed
     * or world rebuilds the window. On a route the window never rebuilds: sections ahead of a planet switch are
     * prefetched with the next planet, its kits load well ahead, and the look switches at the jump's flash.
     */
    update(nextSeed: number, nextDistance: number, next?: TerrainInput) {
      distance = nextDistance;
      const nextRoute = routeOfInput(next), targetRoute = nextRoute ? devRoute(nextRoute) : null;
      const target = targetRoute ? targetRoute.worldAt(distance) : worldOf(devWorld(next as WorldInput));
      const key = targetRoute ? `route:${targetRoute.key}` : target.key;
      if (seed !== nextSeed || key !== sourceKey) {
        views.forEach(disposeView); views.clear(); stream.clear(); sharedCorridor.clear();
        discardPrebuilt();
        seed = nextSeed; route = targetRoute; sourceKey = key; stream = createTerrainStream(seed, route ?? target);
      }
      world = target;
      if (route) for (const span of route.spans(distance - VIEW.sectionLength, distance + PRELOAD_AHEAD)) ensurePlanet(span.world.planet.id);
      else ensurePlanet(world.planet.id);
      applyLook(route ? route.lookAt(distance) : world.planet.id);
      const active = stream.update(distance), live = new Set(active.map(section => section.index)), starting = views.size === 0;
      for (const [index, view] of views) if (!live.has(index)) { disposeView(view); views.delete(index); }
      for (const section of active) {
        let view = views.get(section.index);
        if (!view && prebuilt?.section === section && prebuilt.view) { view = prebuilt.view; prebuilt = null; scene.add(view.group); dirty = true; }
        if (!view && prebuilt?.section === section) discardPrebuilt();
        // A view built here, mid-flight, is a synchronous fallback (prefetch builds views ahead in steps).
        if (!view) { view = buildSection(section); views.set(section.index, view); if (!starting) viewFallbacks++; }
        views.set(section.index, view);
        view.group.position.z = distance - section.startS;
      }
      if (prebuilt && !live.has(prebuilt.section.index) && prebuilt.section.index < Math.floor(distance / VIEW.sectionLength)) discardPrebuilt();
    },
    /**
     * Spends spare frame time ahead of need: first advances the next section's generation in resumable steps,
     * then (in a later frame) builds its view off-scene. `more()` is the caller's per-frame budget check.
     */
    prefetch(more: () => boolean) {
      if (seed === null) return;
      if (!stream.prefetch(distance, more) || !more()) return;
      const upcoming = stream.upcoming();
      if (upcoming && prebuilt?.section !== upcoming) { discardPrebuilt(); prebuilt = { section: upcoming, work: buildSteps(upcoming), view: null }; }
      while (prebuilt && !prebuilt.view && more()) {
        const step = prebuilt.work.next();
        if (step.done) prebuilt.view = step.value;
      }
    },
    /** Section generation (startup, prefetched, fallbacks) plus views built synchronously mid-flight. */
    get streamStats() { return { ...stream.stats, viewFallbacks }; },
    /** The directional light's shadow frustum: caster strips draw only in that pass (null: never). */
    setShadowFrustum(frustum: THREE.Frustum | null) { casterFrustum = frustum; },
    /**
     * Render-only exclusion in world (x, s): kit, infrastructure, shared and pipeline instances whose boxes
     * overlap it are hidden while it is set (ground and roads stay); haulers skip it too. Generation is
     * untouched. Small moves reuse the last compaction; null clears it.
     */
    setExclusion(rect: TerrainExclusion | null) {
      if (!rect) { if (exclusion) { exclusion = null; requested = null; dirty = true; } return; }
      if (requested && exclusion && Math.abs(rect.minX - requested.minX) <= EXCLUSION_SLACK && Math.abs(rect.maxX - requested.maxX) <= EXCLUSION_SLACK
        && Math.abs(rect.minS - requested.minS) <= EXCLUSION_SLACK && Math.abs(rect.maxS - requested.maxS) <= EXCLUSION_SLACK) return;
      requested = { ...rect };
      exclusion = { minX: rect.minX - EXCLUSION_SLACK, maxX: rect.maxX + EXCLUSION_SLACK, minS: rect.minS - EXCLUSION_SLACK, maxS: rect.maxS + EXCLUSION_SLACK };
      dirty = true;
    },
    /**
     * District pads in the live window (world x, s): battery compounds and emplacements keep out of them, so no
     * clearing ever hides a district piece (docs/23 §4.8). Render-only; targets never move.
     */
    reservedSites(): readonly TerrainExclusion[] {
      const seen = new Map<string, TerrainExclusion>();
      for (const view of views.values()) for (const site of view.sites) seen.set(site.id, site);
      return [...seen.values()];
    },
    /** Stable, bounded render-only clearings for battery compounds. Never changes terrain or targeting. */
    setFacilityClearings(rects: readonly TerrainExclusion[]) {
      if (rects.length === facilityClearings.length && rects.every((r,i) => r.minX === facilityClearings[i].minX && r.minS === facilityClearings[i].minS)) return;
      facilityClearings = rects.slice(0,12); dirty = true;
    },
    /** Culls ground strips by exact boxes and recompacts piece instances when the view moved past the margin. */
    cull(camera: THREE.Camera) {
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      if (dirty || Math.abs(camera.position.x - lastCameraX) > RECOMPACT || Math.abs(distance - lastDistance) > RECOMPACT) {
        lastViewX = camera.position.x; compact(); dirty = false; lastCameraX = camera.position.x; lastDistance = distance;
      }
      pieces.position.z = distance - origin;
      // Caster exclusion in world xz (z = distance − s); an inverted rectangle disables it.
      if (exclusion) casterExclusion.value.set(exclusion.minX, exclusion.maxX, distance - exclusion.maxS, distance - exclusion.minS);
      else casterExclusion.value.set(1, -1, 1, -1);
      casterClearingCount.value = facilityClearings.length;
      facilityClearings.forEach((c,i) => casterClearings.value[i].set(c.minX,c.maxX,distance-c.maxS,distance-c.minS));
      let calls = 0, triangles = 0;
      for (const view of views.values()) for (const cullable of view.cullables) {
        worldBox.copy(cullable.box).translate(offset.set(0, 0, view.group.position.z));
        const visible = frustum.intersectsBox(worldBox);
        cullable.object.visible = visible;
        if (visible) { calls += cullable.object.children.length; triangles += cullable.triangles; }
      }
      for (const entry of batches.values()) if (entry.mesh.count > 0) { calls++; triangles += entry.triangles * entry.mesh.count; }
      for (const mesh of haulers.values()) if (mesh.count > 0) { calls++; triangles += triangleCount(mesh.geometry) * mesh.count; }
      for (const mesh of floeMeshes.values()) if (mesh.count > 0) { calls++; triangles += triangleCount(mesh.geometry) * mesh.count; }
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
      refreshCasters();
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
      refreshCasters();
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
      refreshCasters();
      for (const [name, geometry] of previous) if (shared.get(name) !== geometry) geometry.dispose();
      dirty = true;
    },
    /**
     * Haulers drive the roads (presentation only: seed + time, never collision or targets). Each road carries
     * one or two haulers shuttling back and forth; the low tier keeps fewer. A road's haulers share one speed, half
     * a round trip apart, and keep to the right-hand lane, so they pass side by side instead of through each other;
     * a road sharing another's corridor carries none (corridorShared).
     */
    animate(time: number, cameraX: number) {
      let count = 0; haulerDust.length = 0;
      // Each road's own planet picks its haulers: Vesper's ice haulers face +Z (Khepri's cargo cabs face −Z).
      const used = new Map<string, number>(), roads = new Map<string, RoadPath>(), source = route ?? world;
      for (const view of views.values()) for (const [id, road] of view.roads) roads.set(id, road);
      for (const road of roads.values()) {
        const total = road.length[road.length.length - 1];
        if (total < 4 || corridorShared(road, roads)) continue;
        const key = road.id.length * 131 + road.x.length * 7 + Math.round(road.s[0] * 3);
        const quota = (quality === 'low' ? 0.5 : 1) * (1 + (tint(key, 1, 2) < 0.45 ? 1 : 0));
        for (let k = 0; k < Math.ceil(quota); k++) {
          if (quota < 1 && tint(key, 3, k) > quota) continue;
          const speed = 0.7 + tint(key, 5, 0) * 0.6, travel = (tint(key, 7, 0) * total * 2 + k * total + time * speed) % (total * 2);
          const forward = travel < total, along = forward ? travel : total * 2 - travel;
          const i = Math.min(road.x.length - 2, Math.floor(along / ROAD_STEP)), f = along / ROAD_STEP - i;
          // Right-hand lane, easing onto the centreline at the road ends where a hauler turns around.
          const segX = (road.x[i + 1] - road.x[i]) * (forward ? 1 : -1), segS = (road.s[i + 1] - road.s[i]) * (forward ? 1 : -1), segL = Math.hypot(segX, segS) || 1;
          const lane = HAULER_LANE * THREE.MathUtils.smoothstep(Math.min(along, total - along), 0, 1.5);
          const x = road.x[i] + (road.x[i + 1] - road.x[i]) * f + segS / segL * lane, s = road.s[i] + (road.s[i + 1] - road.s[i]) * f - segX / segL * lane;
          if (Math.abs(x - cameraX) > 7.5 || s - distance < -9 || s - distance > 30) continue;
          if (exclusion && x > exclusion.minX && x < exclusion.maxX && s > exclusion.minS && s < exclusion.maxS) continue;
          const y = road.y[i] + (road.y[i + 1] - road.y[i]) * f;
          const dx = (road.x[i + 1] - road.x[i]) * (forward ? 1 : -1), ds = (road.s[i + 1] - road.s[i]) * (forward ? 1 : -1);
          const roadWorld = worldAt(source, s), vesper = roadWorld.planet.id === 'vesper', nodes = vesper ? VESPER_HAULERS : KHEPRI_HAULERS;
          const node = nodes[Math.floor(tint(key, 9, k) * nodes.length)], mesh = hauler(node), slot = used.get(node) ?? 0;
          if (!mesh || slot >= mesh.instanceMatrix.count) continue;
          // Cabs face −z: yaw so local −z points along the direction of travel. Haulers are background traffic,
          // drawn smaller than the cargo node so they never read as ground enemies, and seated on the ground under
          // all four corners: pitch and roll follow the slope, and the body lifts until no corner sinks.
          const yaw = Math.atan2(-dx, ds), fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
          const ground = (a: number, b: number) => terrainHeight(seed ?? 0, x + fx * HAULER_HALF_LENGTH * a + rx * HAULER_HALF_WIDTH * b,
            s - (fz * HAULER_HALF_LENGTH * a + rz * HAULER_HALF_WIDTH * b), roadWorld.bare);
          const frontLeft = ground(1, -1), frontRight = ground(1, 1), backLeft = ground(-1, -1), backRight = ground(-1, 1);
          const rise = (frontLeft + frontRight - backLeft - backRight) / 2, bank = (frontRight + backRight - frontLeft - backLeft) / 2;
          // Steep cut roads tilt the hauler up to a limit (it is always drawn: skipping a frame made it blink).
          const pitch = THREE.MathUtils.clamp(Math.atan2(rise, 2 * HAULER_HALF_LENGTH), -0.45, 0.45), roll = THREE.MathUtils.clamp(Math.atan2(bank, 2 * HAULER_HALF_WIDTH), -0.35, 0.35);
          const base = Math.max(y, (frontLeft + frontRight + backLeft + backRight) / 4);
          let lift = 0;
          for (const [a, b, h] of [[1, -1, frontLeft], [1, 1, frontRight], [-1, -1, backLeft], [-1, 1, backRight]]) {
            lift = Math.max(lift, h - (base + a * rise / 2 + b * bank / 2));
          }
          lift = Math.min(lift, 0.3);
          transform.position.set(x, base + lift + 0.05, distance - s); transform.rotation.set(pitch, vesper ? yaw + Math.PI : yaw, vesper ? -roll : roll, 'YXZ');
          transform.scale.setScalar(HAULER_SCALE); transform.updateMatrix(); transform.rotation.order = 'XYZ';
          mesh.setMatrixAt(slot, transform.matrix); used.set(node, slot + 1); count++;
          haulerDust.push({ x: x - fx * HAULER_HALF_LENGTH, y: base + lift, z: distance - s - fz * HAULER_HALF_LENGTH });
        }
      }
      haulers.forEach((mesh, name) => {
        const shown = used.get(name) ?? 0; mesh.count = shown; mesh.visible = shown > 0; mesh.instanceMatrix.needsUpdate = true;
      });
      stats.haulers = count;
      // Pack ice drifts slowly around its base position (seed + time only; never collision or targets).
      const visible = new Map<string, Floe[]>(), seaOf = new Map<Floe, number>();
      for (const view of views.values()) for (const floe of view.floes) {
        if (Math.abs(floe.x - cameraX) > 8.6 || floe.s - distance < -9 || floe.s - distance > 30) continue;
        if (exclusion && floe.x > exclusion.minX && floe.x < exclusion.maxX && floe.s > exclusion.minS && floe.s < exclusion.maxS) continue;
        const name = kitNodeName(floe.kind, floe.variant), list = visible.get(name) ?? [];
        list.push(floe); visible.set(name, list); seaOf.set(floe, view.sea);
      }
      for (const [name, mesh] of floeMeshes) if (!visible.has(name)) { mesh.count = 0; mesh.visible = false; }
      floeUsed = 0;
      for (const [name, list] of visible) {
        const mesh = floeMesh(name, list.length);
        if (!mesh) continue;
        list.forEach((floe, i) => {
          const angle = floe.phase + time * FLOE_SPIN * (floe.kind === 'iceberg' ? 0.5 : 1), sway = Math.sin(time * 0.11 + floe.phase) * FLOE_SWAY;
          // A cracked set's pieces sway about the set origin together (three.js yaw about +y, s = −z).
          let bx = floe.x, bz = -floe.s;
          if (floe.originX !== undefined && floe.originS !== undefined) {
            const ox = floe.x - floe.originX, oz = floe.originS - floe.s, c = Math.cos(sway), n = Math.sin(sway);
            bx = floe.originX + ox * c + oz * n; bz = -floe.originS - ox * n + oz * c;
          }
          const x = bx + Math.cos(angle) * floe.radius, z = distance + bz - Math.sin(angle) * floe.radius, yaw = floe.rotation + sway;
          const [hx, hz] = FLOE_FOOTPRINT[name] ?? [KIT[floe.kind].halfX, KIT[floe.kind].halfZ];
          const sea = seaOf.get(floe)!;
          transform.position.set(x, sea + Math.sin(time * 0.9 + floe.phase) * 0.015, z);
          transform.rotation.set(0, yaw, 0);
          transform.scale.set(floe.scaleX, floe.height, floe.scaleZ); transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          const feature = floeFeatures[floeUsed] ??= { id: '', kind: 'floe', x: 0, y: 0, z: 0, rx: 0, rz: 0, yaw: 0 };
          feature.id = floe.id; feature.kind = floe.kind === 'iceberg' ? 'iceberg' : 'floe'; feature.x = x; feature.y = sea; feature.z = z;
          feature.rx = hx * floe.scaleX; feature.rz = hz * floe.scaleZ; feature.yaw = yaw; floeUsed++;
        });
        mesh.count = list.length; mesh.visible = true; mesh.instanceMatrix.needsUpdate = true;
      }
      floeFeatures.length = floeUsed;
      // Vent tops near the view (steam), skipping any exclusion like the instances themselves.
      ventUsed = 0;
      for (const view of views.values()) for (const vent of view.vents) {
        if (Math.abs(vent.x - cameraX) > VIEW.width / 2 + 1 || vent.s - distance < -9 || vent.s - distance > 30) continue;
        if (exclusion && vent.x > exclusion.minX && vent.x < exclusion.maxX && vent.s > exclusion.minS && vent.s < exclusion.maxS) continue;
        const feature = ventFeatures[ventUsed] ??= { x: 0, y: 0, z: 0 };
        feature.x = vent.x; feature.y = vent.y; feature.z = distance - vent.s; ventUsed++;
      }
      ventFeatures.length = ventUsed;
    },
    /** Every node batch, made visible, so a warm-up compile covers all scenery programs. */
    warmupObjects(): THREE.Object3D[] {
      for (const kind of KIT_KINDS) for (let v = 0; v < KIT[kind].variants; v++) batch(kitNodeName(kind, v));
      for (const name of [...Object.keys(INFRA_NODES), ...SHARED_NODES]) batch(name);
      return [...batches.values()].map(entry => entry.mesh);
    },
    get stats(): Readonly<TerrainStats> { return stats; },
    /** Where haulers kick up dust this frame (presentation only). */
    get haulerDust(): readonly { x: number; y: number; z: number }[] { return haulerDust; },
    /** Live floes and vent tops in world space, as of the last animate() (empty on dry planets). */
    get features(): TerrainFeatures { return features; },
    dispose() {
      views.forEach(disposeView); views.clear(); stream.clear();
      discardPrebuilt();
      batches.forEach(entry => entry.mesh.dispose()); batches.clear(); scene.remove(pieces);
      haulers.forEach(mesh => { scene.remove(mesh); mesh.dispose(); }); haulers.clear();
      floeMeshes.forEach(mesh => { scene.remove(mesh); mesh.dispose(); }); floeMeshes.clear();
      if (water && !options.waterMaterial) water.dispose();
      disposed = true;
      kit.forEach(geometry => geometry.dispose()); infra.forEach(geometry => geometry.dispose()); shared.forEach(geometry => geometry.dispose());
      edgeGeometry.dispose(); casterMaterial.dispose(); casterDepth.dispose(); proxies.clear();
    },
    /** Rebuilds live sections, e.g. after a layout-affecting change; kept for completeness. */
    rebuild: rebuildAll,
    /**
     * The world at the current scroll distance (after the preview switch). On a route it is a routed world:
     * its planet and arena are those under the ship, and height queries given it resolve every distance on
     * the route (seating across a planet seam stays right).
     */
    get world(): World | RoutedWorld { return route ? routedWorld(route, world) : world; },
    /** The route being streamed, if any. */
    get route(): TerrainRoute | null { return route; },
  };
  return self;
}
