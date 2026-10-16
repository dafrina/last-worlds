import * as THREE from 'three';
import { VIEW, type EnemyKind, type GameRenderer, type GraphicsQuality, type RunState } from '../shared/contracts';
import { SUN_DIRECTION, TERRAIN_MIN_HEIGHT, terrainHeight, worldOf, type PlanetId, type TerrainArena, type World, type WorldInput } from '../world/terrain';
import { arenaStopDistance } from '../sim/bastion';
import { missionBoss } from '../content/bosses';
import { runPlanet } from '../content/missions';
import { runRoute } from './terrain-route';
import { loadCraftNodes, loadKhepriCraft, loadNacreCraft, type KhepriCraftNode, type NacreCraftNode } from './models';
import { PICKUP_ICONS, PICKUP_ICON_SIZE, createPickupIconTextures, pickupIcon, type PickupIcon } from './pickup-icons';
import { VESPER_CRAFT_NODES, createDesertEnvironment, createEnemy, createHero, createIceEnvironment, createLunaEnvironment, createMireEnvironment, createMaterials, createPontoonGeometry, loadVesperCraft, type VesperCraftNode } from './models';
import { arkPlacement, createArkView, loadArkModel } from './ark-view';
import { HELION_ARK } from '../content/ark';
import { createFoam, createWater, type FoamRing } from './water';
import { createFallbackInfra, createFallbackShared, createSharedMaterial, createTerrainMaterials, loadKhepriInfra, loadKhepriKit, loadKhepriTextures, loadSharedKit } from './terrain-kit';
import { createTerrainView } from './terrain-view';
import { createPostPipeline } from './post-pipeline';
import { createFx, type Plume } from './fx-particles';
import { createJumpFx } from './fx-jump';
import { endlessSectorPlan } from '../content/endless';
import { BASTION_FOOTPRINT, createBastionView, loadBastionModel } from './bastion-view';
import { WARDEN_FOOTPRINT, createWardenView, loadWardenModel } from './warden-view';
import { createVeilView, loadVeilModel, veilPlacement } from './veil-view';
import { VEIL } from '../content/veil';
import { WARDEN } from '../content/warden';
import { BASTION } from '../content/bastion';

const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation);
/** Per-frame CPU budget for generating the next terrain section ahead of need. */
const PREFETCH_BUDGET_MS = 3;
const COT_ELEVATION = 1 / Math.tan(ELEVATION);
const TACTICAL_HEIGHT = VIEW.width * 16 / 9;

/**
 * Fit a device-sized canvas without stretching models or exposing enemies earlier on tall phones.
 * Keep the canonical 9:16 view's top and horizontal span; extra height reveals foreground below it.
 * The ground/target projection and simulation coordinates stay identical on every device.
 */
export function fitFlightViewport(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, width: number, height: number): void {
  camera.setViewOffset(width, width * 16 / 9, 0, 0, width, height);
}

/**
 * Height of what a ground piece rests on: the terrain, or the sea surface over water (planets with an ocean).
 * On a dry planet (Khepri) this is exactly terrainHeight.
 */
export function surfaceHeight(seed: number, x: number, s: number, world?: WorldInput | World): number {
  const ground = terrainHeight(seed, x, s, world), sea = world ? worldOf(world).planet.seaLevel : null;
  return sea === null ? ground : Math.max(ground, sea);
}

/** Public for projection verification: actual ground core and logical target share a pixel. */
export function groundForwardPosition(logicalS: number, coreHeight: number): number {
  return logicalS - (coreHeight - VIEW.flightHeight) * COT_ELEVATION;
}

/**
 * Place a ground model on generated terrain at any level (valley floor, slope, ledge or peak) while
 * preserving its exact logical target pixel. The search spans the full terrain depth: a core at height
 * h sits (3 − h)·cot(elevation) further forward than its logical row.
 */
export function groundPlacement(seed: number, distance: number, x: number, logicalS: number, coreHeight: number, arena?: WorldInput | World) {
  let lo = logicalS - 1, hi = logicalS + (VIEW.flightHeight - TERRAIN_MIN_HEIGHT - coreHeight) * COT_ELEVATION + 1;
  for (let i = 0; i < 26; i++) {
    const s = (lo + hi) / 2, baseHeight = surfaceHeight(seed, x, distance + s, arena);
    if (s + (baseHeight + coreHeight - VIEW.flightHeight) * COT_ELEVATION < logicalS) lo = s; else hi = s;
  }
  const baseHeight = surfaceHeight(seed, x, distance + (lo + hi) / 2, arena);
  return { baseHeight, s: groundForwardPosition(logicalS, baseHeight + coreHeight) };
}

/**
 * A boss mission's static arena in world s (docs/15, docs/17 §5): the scroll stops at a mission-determined distance
 * and the world generator shapes the platform there (Rolling Thunder: a flat basalt platform, 566–601; Cold Vector:
 * open ocean, 911–955). Read from the mission boss's own arena constants. Passed from the run's start so the window
 * never rebuilds mid-flight; endless and training have none.
 */
export function missionArena(config: RunState['config']): TerrainArena | undefined {
  const boss = config.mode === 'campaign' ? missionBoss(config.mission) : null;
  if (!boss) return undefined;
  const stop = arenaStopDistance(boss.arena);
  return { fromS: stop + boss.arena.platform.from, toS: stop + boss.arena.platform.to };
}

/**
 * Bastion-9 seating (render-only): the wide hull rests on the highest ground under its footprint so it never
 * sinks into a ridge, and its target sockets still project exactly onto their logical combat rows.
 */
export function bastionPlacement(seed: number, distance: number, x: number, logicalS: number, arena?: TerrainArena | WorldInput | World,
  footprint: { halfWidth: number; halfDepth: number } = BASTION_FOOTPRINT, targetHeight: number = BASTION.targetHeight) {
  let { s } = groundPlacement(seed, distance, x, logicalS, targetHeight, arena), baseHeight = -Infinity;
  for (let pass = 0; pass < 3; pass++) {
    baseHeight = -Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      // Local +z faces the player, which is toward smaller s.
      const dx = i / 2 * (footprint.halfWidth - .2), dz = j / 2 * (footprint.halfDepth - .2);
      baseHeight = Math.max(baseHeight, terrainHeight(seed, x + dx, distance + s - dz, arena));
    }
    s = groundForwardPosition(logicalS, baseHeight + targetHeight);
  }
  return { baseHeight, s };
}

/** Experimental slight perspective (look-dev switch `?camera=perspective`): a long lens keeps parallax small. */
export const PERSPECTIVE_FOV = 20;

export function configureCamera(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, x: number): void {
  const centerS = (VIEW.minS + VIEW.maxS) / 2;
  const target = new THREE.Vector3(x, VIEW.flightHeight, -centerS);
  // A perspective lens is placed so the tactical height fits the view at the centre depth, matching the ortho frame.
  const distance = camera instanceof THREE.PerspectiveCamera ? TACTICAL_HEIGHT / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) : 36;
  camera.position.set(x, target.y + Math.sin(ELEVATION) * distance, target.z + Math.cos(ELEVATION) * distance);
  camera.lookAt(target); camera.updateMatrixWorld();
}

/**
 * Perspective seating (render-only): follow the camera ray through the logical flight-plane target down to
 * terrain + core height, so the physical core covers its logical target pixel under any lens.
 */
export function rayPlacement(camera: THREE.Camera, seed: number, distance: number, x: number, logicalS: number, coreHeight: number, baseFloor = -Infinity, arena?: WorldInput | World) {
  const target = new THREE.Vector3(x, VIEW.flightHeight, -logicalS);
  const direction = camera instanceof THREE.PerspectiveCamera ? target.clone().sub(camera.position).normalize() : camera.getWorldDirection(new THREE.Vector3());
  const at = (t: number) => target.clone().addScaledVector(direction, t);
  const ground = (point: THREE.Vector3) => Math.max(baseFloor, surfaceHeight(seed, point.x, distance - point.z, arena));
  let lo = 0, hi = (VIEW.flightHeight - TERRAIN_MIN_HEIGHT + 2) / Math.max(.2, -direction.y);
  for (let i = 0; i < 28; i++) {
    const t = (lo + hi) / 2, point = at(t);
    if (point.y > ground(point) + coreHeight) lo = t; else hi = t;
  }
  const point = at((lo + hi) / 2);
  return { x: point.x, s: -point.z, baseHeight: point.y - coreHeight };
}

/**
 * Experimental "rectified" slight perspective (look-dev switch `?camera=rectified`): the image plane is parallel
 * to the flight plane, so the flight plane maps exactly as the orthographic view (same VIEW rectangle, player row
 * and edges), while terrain below it gains perspective scale and outward-leaning verticals. The centre of
 * projection sits `distance` units along the canonical 55° view direction from the view centre.
 */
export function configureRectified(camera: THREE.PerspectiveCamera, x: number, distance: number, aspect = 9 / 16): void {
  const centerS = (VIEW.minS + VIEW.maxS) / 2;
  const cx = x, cy = VIEW.flightHeight + Math.sin(ELEVATION) * distance, cz = -centerS + Math.cos(ELEVATION) * distance;
  camera.position.set(cx, cy, cz); camera.up.set(0, 0, -1); camera.lookAt(cx, cy - 1, cz); camera.updateMatrixWorld();
  // Camera space: X = world x − cx, Y (screen up) = cz + s, depth = height above the plane.
  const k = camera.near / (cy - VIEW.flightHeight);
  const nearS = VIEW.maxS - (VIEW.maxS - VIEW.minS) * (9 / 16) / aspect;
  camera.projectionMatrix.makePerspective((-VIEW.width / 2) * k, (VIEW.width / 2) * k, (cz + VIEW.maxS) * k, (cz + nearS) * k, camera.near, camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/**
 * Real-time sun (High-tier shadow map and both tiers' key light): the generator's azimuth from the upper left
 * and behind the view, raised to 38° so cast shadows run ~1.3× an object's height instead of ~1.9× (the baked
 * relief shading keeps its lower sun; the two read as one light at phone size).
 */
const SUN_ELEVATION = THREE.MathUtils.degToRad(38);
export const SUN = new THREE.Vector3(SUN_DIRECTION.x, 0, -SUN_DIRECTION.s).normalize().multiplyScalar(Math.cos(SUN_ELEVATION)).setY(Math.sin(SUN_ELEVATION));
/** Height band that can receive (terrain floor) or cast (scenery, fortress superstructure) shadows. */
const SHADOW_SLAB = { bottom: TERRAIN_MIN_HEIGHT - .2, top: 3.7 } as const;
const SHADOW_MAP_SIZE = 1536, SHADOW_LIGHT_DISTANCE = 60;
/**
 * The authored Scrapper is ~1.0 unit wide; the user asked for the hero to fly at the planned top-tier size
 * (1.7 units, docs/04 §9). Render-only: the collision radius is owned by the simulation.
 */
/**
 * Hero render scale. The user first asked for a larger hitbox (sim playerRadius), not a larger model; later (15 October)
 * for the model 10% larger. Render-only: collision stays the simulation's 0.42 radius.
 */
export const HERO_SCALE = 1.1;
/** Mission-start entrance: duration (s) and how far along the view ray toward the camera the hero starts. */
const HERO_ENTRANCE = 1.6, HERO_ENTRANCE_LIFT = 7;

/**
 * Per-planet light and grade (docs/13 §1, docs/17 §1). Khepri's values are the shipped look. Vesper: a high, pale,
 * slightly cool sun with blue shadows from a cool sky fill, snow kept just under the bloom threshold so it reads
 * bright white without clipping or smearing, a cool shadow lift and a faint white-blue haze toward the horizon.
 */
interface PlanetLook {
  background: number; sunElevation: number; sun: [number, number]; hemisphere: [number, number, number]; bounce: [number, number];
  shadowIntensity: number; blobShadow: number; lowExposure: number;
  post: { exposure: number; threshold: number; knee: number; strength: number; lift: [number, number, number]; saturation: number; contrast: number; vignette: number;
    haze: [number, number, number, number] };
  environment: 'desert' | 'ice' | 'luna' | 'mire';
}
const LOOKS: Readonly<Record<PlanetId, PlanetLook>> = {
  khepri: {
    background: 0x6a3a22, sunElevation: 38, sun: [0xffeedb, 4.0], hemisphere: [0xd9c6b2, 0x6a3420, 1.05], bounce: [0xd08050, 1.0],
    shadowIntensity: .82, blobShadow: 0x2a1a12, lowExposure: 1.0,
    post: { exposure: 1.0, threshold: 1.0, knee: .35, strength: .7, lift: [.007, .0038, .0018], saturation: 1.0, contrast: 1.07, vignette: .24, haze: [0, 0, 0, 0] },
    environment: 'desert',
  },
  vesper: {
    background: 0x0d3557, sunElevation: 58, sun: [0xf2f6ff, 2.6], hemisphere: [0xa8c6ec, 0x4f6f8f, 1.35], bounce: [0x9fbcdc, .45],
    shadowIntensity: .72, blobShadow: 0x10243c, lowExposure: 1.0,
    post: { exposure: 1.0, threshold: 1.2, knee: .3, strength: .75, lift: [.0025, .0045, .0085], saturation: 1.02, contrast: 1.05, vignette: .2,
      haze: [.82, .9, .98, .025] },
    environment: 'ice',
  },
  // Luna, Khepri's moon (docs/19): a low hard white sun over grey regolith, long crisp crater shadows, a black sky and
  // only a faint grey fill (regolith bounce), so shade stays readable on a phone without any haze.
  luna: {
    background: 0x07080a, sunElevation: 30, sun: [0xfffaf2, 4.2], hemisphere: [0x8e939c, 0x4a4845, .75], bounce: [0xa8a6a0, .7],
    shadowIntensity: .88, blobShadow: 0x111214, lowExposure: 1.0,
    post: { exposure: 1.0, threshold: 1.05, knee: .35, strength: .6, lift: [.003, .003, .0036], saturation: .96, contrast: 1.09, vignette: .26,
      haze: [0, 0, 0, 0] },
    environment: 'luna',
  },
  // Nacre (docs/20): a lilac sun under a violet sky, strong violet sky fill so the dark islands stay readable, a strong
  // cold-blue bounce that lights the camera-facing sides of the black rock (the concept's blue-lit crags), a bloom
  // threshold that lets the bioluminescence glow without washing out, and a faint violet mist.
  nacre: {
    background: 0x1a1040, sunElevation: 34, sun: [0xdcd6ff, 4.1], hemisphere: [0x8c84dc, 0x24245e, 1.2], bounce: [0x6a98f0, 1.5],
    shadowIntensity: .7, blobShadow: 0x120a28, lowExposure: 1.08,
    post: { exposure: 1.06, threshold: .9, knee: .35, strength: .75, lift: [.004, .003, .009], saturation: 1.04, contrast: 1.08, vignette: .26,
      haze: [.36, .3, .62, .025] },
    environment: 'mire',
  },
};
/** Unit vector toward a planet's sun: the shared upper-left azimuth (shadows to the lower right) at its elevation. */
function sunDirection(elevationDegrees: number): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  return new THREE.Vector3(SUN_DIRECTION.x, 0, -SUN_DIRECTION.s).normalize().multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation));
}

/**
 * Vesper stand-ins for the current enemy kinds until the combat agent adds Vesper kinds (one table):
 * dart/lancer → Needle, weaver → Diamond, turret → missile battery. Scale keeps them readable next to Khepri
 * sizes; engines are the authored exhaust sockets (art/vesper-craft/README.md).
 */
// Keyed by kind name so the table also covers the Vesper kinds (needle, diamond, missile) the combat side adds.
const VESPER_CRAFT: Readonly<Record<string, { node: VesperCraftNode; scale: number; engines: readonly (readonly [number, number])[] }>> = {
  dart: { node: 'vesper_needle', scale: 1.25, engines: [[-.065, -.48], [.065, -.48]] },
  lancer: { node: 'vesper_needle', scale: 1.45, engines: [[-.065, -.48], [.065, -.48]] },
  weaver: { node: 'vesper_diamond', scale: 1.05, engines: [[-.14, -.58], [0, -.58], [.14, -.58]] },
  turret: { node: 'vesper_missile_battery', scale: 1.15, engines: [] },
  needle: { node: 'vesper_needle', scale: 1.25, engines: [[-.065, -.48], [.065, -.48]] },
  diamond: { node: 'vesper_diamond', scale: 1.05, engines: [[-.14, -.58], [0, -.58], [.14, -.58]] },
  missile: { node: 'vesper_missile_battery', scale: 1.15, engines: [] },
};

/**
 * Nacre's own craft (art/nacre-craft, after the ORRERY, SHARD and VEIL concepts): on Nacre every kind flies a Nacre
 * model, and THE VEIL's pod waves use the pod. Plume colour is teal.
 */
const NACRE_CRAFT: Readonly<Record<Exclude<EnemyKind, 'fuel'>, { node: NacreCraftNode; scale: number }>> = {
  dart: { node: 'nacre_shard', scale: 1 }, needle: { node: 'nacre_shard', scale: 1.1 }, lancer: { node: 'nacre_veil', scale: 1.1 },
  weaver: { node: 'nacre_veil', scale: 1 }, diamond: { node: 'nacre_orrery', scale: 1 }, turret: { node: 'nacre_spore', scale: 1 }, missile: { node: 'nacre_spore', scale: 1 },
};

/** Khepri craft node per kind (Vesper kinds borrow the nearest Khepri silhouette until their own models load). */
const KHEPRI_NODE: Readonly<Record<Exclude<EnemyKind, 'fuel'>, KhepriCraftNode>> = {
  dart: 'khepri_dart', lancer: 'khepri_lancer', weaver: 'khepri_weaver', turret: 'khepri_turret', needle: 'khepri_dart', diamond: 'khepri_weaver', missile: 'khepri_turret',
};
/** Engine sockets (x, z) of the Khepri craft, from tools/blender/khepri_craft.py SOCKETS (glTF z toward the player). */
const KHEPRI_ENGINES: Readonly<Record<KhepriCraftNode, readonly (readonly [number, number])[]>> = {
  khepri_dart: [[-.45, -.43], [.45, -.43], [0, -.49]], khepri_lancer: [[-.17, -.51], [.17, -.51]],
  khepri_weaver: [[-.09, -.45], [.09, -.45]], khepri_turret: [],
};

/** Every enemy kind the renderer draws (Khepri and Vesper); ground kinds stand on terrain or float on the sea. */
const ENEMY_KINDS: readonly EnemyKind[] = ['dart', 'weaver', 'turret', 'lancer', 'needle', 'diamond', 'missile', 'fuel'];
const GROUND_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['turret', 'missile', 'fuel']);
/** Loot props and ground wrecks (art/loot-props, Blender): the fuel skid target and what destroyed ground targets leave. */
const LOOT_NODES = ['loot_fuel', 'wreck_turret_0', 'wreck_turret_1', 'wreck_fuel'] as const;
/** At most this many wrecks stay on the ground at once (oldest go first). */
const WRECK_CAPACITY = 24;
/** Vesper faction kinds: always their own models once vesper-craft.glb is in, on any planet. */
const VESPER_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['needle', 'diamond', 'missile']);
/** Code-built Khepri model each kind uses until (or unless) its Vesper model is available. */
const KHEPRI_STAND_IN: Readonly<Record<EnemyKind, 'dart' | 'weaver' | 'turret' | 'lancer'>> = {
  dart: 'dart', weaver: 'weaver', turret: 'turret', lancer: 'lancer', needle: 'dart', diamond: 'weaver', missile: 'turret', fuel: 'turret',
};
/** Deck height of the render-only pontoon a ground battery rides on when the simulation seats it over open water. */
const PONTOON_DECK = .14;
const WHITE = new THREE.Color(1, 1, 1);
/** Hit flash (render-only): a craft struck by any shot glows over-bright for this long, fading out. */
const HIT_FLASH = .12;

/**
 * Light-space extents of everything the camera can see within the shadow slab, relative to the view target
 * (constant while the camera only translates). The shadow frustum is fitted once, then follows the view.
 */
export function shadowExtents(camera: THREE.Camera, target: THREE.Vector3, sun = SUN) {
  const lightCamera = new THREE.OrthographicCamera();
  lightCamera.position.copy(sun).multiplyScalar(SHADOW_LIGHT_DISTANCE); lightCamera.lookAt(0, 0, 0); lightCamera.updateMatrixWorld();
  const ndc = new THREE.Vector3(), origin = new THREE.Vector3(), direction = new THREE.Vector3();
  const box = new THREE.Box3();
  for (const nx of [-1, 1]) for (const ny of [-1, 1]) {
    origin.set(nx, ny, -1).unproject(camera); direction.copy(ndc.set(nx, ny, 1).unproject(camera)).sub(origin).normalize();
    for (const y of [SHADOW_SLAB.bottom, SHADOW_SLAB.top]) {
      const point = origin.clone().addScaledVector(direction, (y - origin.y) / direction.y).sub(target);
      box.expandByPoint(point.applyMatrix4(lightCamera.matrixWorldInverse));
    }
  }
  // Depths are distances from the light (placed SHADOW_LIGHT_DISTANCE sunward of the target). Casters up to the
  // slab top may stand sunward of the visible area: extend the near side along the light.
  const reach = (SHADOW_SLAB.top - SHADOW_SLAB.bottom) / sun.y;
  return { left: box.min.x, right: box.max.x, bottom: box.min.y, top: box.max.y, near: -box.max.z - reach - 1, far: -box.min.z + 1,
    right3: new THREE.Vector3().setFromMatrixColumn(lightCamera.matrixWorld, 0), up3: new THREE.Vector3().setFromMatrixColumn(lightCamera.matrixWorld, 1) };
}

export function createRenderer(canvas: HTMLCanvasElement): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let quality: GraphicsQuality='high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps the saturated rust/turquoise palette instead of washing it toward grey.
  // Low renders straight to the canvas with it; High applies the same curve in its composite pass.
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  // High tier: real sun shadows (docs/05 §9 allows bounded shadow maps on higher tiers); Low keeps blob shadows.
  // Only meaningful casters are drawn into it: merged terrain caster strips, ground turrets and the fortress.
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  // Stats accumulate over every pass of a frame (shadow map, scene, bloom), reset once per frame below.
  renderer.info.autoReset = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x6a3a22);
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  // Look-dev only: `?camera=perspective[&fov=15..25]` or `?camera=rectified[&depth=60]`. Orthographic stays the default.
  const cameraMode = query.get('camera') === 'perspective' ? 'perspective' : query.get('camera') === 'rectified' ? 'rectified' : 'ortho';
  const perspective = cameraMode !== 'ortho';
  const lens = Number(query.get('fov')) || PERSPECTIVE_FOV, rectifiedDepth = Number(query.get('depth')) || 60.5;
  let viewportAspect = 9 / 16;
  const camera = cameraMode === 'perspective' ? new THREE.PerspectiveCamera(lens, 9 / 16, 1, 260)
    : cameraMode === 'rectified' ? new THREE.PerspectiveCamera(20, 9 / 16, 1, 260)
    : new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, TACTICAL_HEIGHT / 2, -TACTICAL_HEIGHT / 2, .1, 100);
  const placeCamera = (x: number) => {
    if (cameraMode === 'rectified') configureRectified(camera as THREE.PerspectiveCamera, x, rectifiedDepth, viewportAspect); else configureCamera(camera, x);
  };
  placeCamera(0);

  // Lighting after the concept: a warm low sun from the upper left (docs/13 §1) with soft, shortened shadows;
  // a warm sky/rust-ground fill so shade reads as umber, never night; and a low rust bounce from the opposite
  // side that lifts camera-facing cliff faces and gives hulls a second, warmer edge.
  const hemisphere = new THREE.HemisphereLight(0xd9c6b2, 0x6a3420, 1.05);
  const sunlight = new THREE.DirectionalLight(0xffeedb, 4.0);
  const bounce = new THREE.DirectionalLight(0xd08050, 1.0);
  /** The active planet's sun (Khepri: SUN) and the bounce light's offset opposite it. */
  const sun = SUN.clone(), bounceOffset = new THREE.Vector3(-SUN.x, .32, -SUN.z).normalize().multiplyScalar(30);
  sunlight.castShadow = true; sunlight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunlight.shadow.bias = -.0005; sunlight.shadow.normalBias = .025; sunlight.shadow.radius = 2.6; sunlight.shadow.intensity = .82;
  scene.add(hemisphere, sunlight, sunlight.target, bounce, bounce.target);
  // The shadow frustum is fitted once to the visible slab, then follows the view snapped to whole texels in the
  // terrain's own frame, so static casters never shimmer while the world scrolls.
  const viewTarget = new THREE.Vector3(0, VIEW.flightHeight, -(VIEW.minS + VIEW.maxS) / 2);
  let extents = shadowExtents(camera, viewTarget);
  const texel = { x: 1, y: 1 };
  const fitShadow = () => {
    extents = shadowExtents(camera, viewTarget, sun);
    Object.assign(sunlight.shadow.camera, { left: extents.left, right: extents.right, top: extents.top, bottom: extents.bottom,
      near: Math.max(.5, extents.near), far: extents.far });
    sunlight.shadow.camera.updateProjectionMatrix();
    texel.x = (extents.right - extents.left) / SHADOW_MAP_SIZE; texel.y = (extents.top - extents.bottom) / SHADOW_MAP_SIZE;
  };
  fitShadow();
  const shadowAnchor = new THREE.Vector3();
  const placeSun = (cameraX: number, distance: number) => {
    // Terrain frame: world z = distance − s, so z − distance is fixed on the ground.
    shadowAnchor.set(cameraX, viewTarget.y, viewTarget.z - distance);
    const a = shadowAnchor.dot(extents.right3), b = shadowAnchor.dot(extents.up3);
    shadowAnchor.addScaledVector(extents.right3, Math.round(a / texel.x) * texel.x - a).addScaledVector(extents.up3, Math.round(b / texel.y) * texel.y - b);
    sunlight.target.position.set(shadowAnchor.x, shadowAnchor.y, shadowAnchor.z + distance);
    sunlight.position.copy(sunlight.target.position).addScaledVector(sun, SHADOW_LIGHT_DISTANCE);
    bounce.target.position.copy(sunlight.target.position); bounce.position.copy(bounce.target.position).add(bounceOffset);
  };
  // High tier: HDR scene + selective bloom + graded composite in 6 full-screen draws; Low renders direct.
  const post = createPostPipeline(renderer, { exposure: 1.0, threshold: 1.0, knee: .35, strength: .7,
    lift: new THREE.Color(.007, .0038, .0018), saturation: 1.0, contrast: 1.07, vignette: .24, haze: new THREE.Vector4(0, 0, 0, 0) });
  const materials = createMaterials();
  const bastion = createBastionView(scene);
  const terrainMaterials = createTerrainMaterials();
  const groundMaterial = terrainMaterials.ground, kitMaterial = terrainMaterials.kit;
  const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0xd8c08a, transparent: true, opacity: .52 });
  const sharedMaterial = createSharedMaterial();
  // Prefiltered desert sky: craft metals and outpost machinery reflect warm light instead of reading flat black.
  const environment = createDesertEnvironment(renderer, SUN);
  materials.craft.envMap = materials.enemyCraft.envMap = environment.texture; sharedMaterial.envMap = environment.texture; terrainMaterials.setEnvironment(environment.texture);
  /** Vesper's sky (made on first use) and ocean; Khepri never creates either. */
  let iceEnvironment: THREE.WebGLRenderTarget | null = null, lunaEnvironment: THREE.WebGLRenderTarget | null = null, mireEnvironment: THREE.WebGLRenderTarget | null = null;
  const water = createWater(), foam = createFoam(scene), floeRings: FoamRing[] = [];
  let planet: PlanetId = 'khepri', terrainPlanet: PlanetId = 'khepri';
  /** Look-dev only: `?planet=` makes the terrain stream another planet; the look then follows the terrain's report. */
  const lookOverride = !!import.meta.env?.DEV && query.has('planet');
  /**
   * The planet look rig: lights, sun direction and shadow fit, sky reflections, material palettes, grade and haze,
   * background and blob shadows. It follows `state.planet` (the run's planet, which an endless jump switches at its
   * flash), so the switch happens under the flash and never mid-sector.
   */
  const applyLook = (next: PlanetId) => {
    planet = next;
    const look = LOOKS[next];
    scene.background = new THREE.Color(look.background);
    sun.copy(next === 'khepri' ? SUN : sunDirection(look.sunElevation));
    bounceOffset.set(-sun.x, .32, -sun.z).normalize().multiplyScalar(30);
    sunlight.color.setHex(look.sun[0]); sunlight.intensity = look.sun[1]; sunlight.shadow.intensity = look.shadowIntensity;
    hemisphere.color.setHex(look.hemisphere[0]); hemisphere.groundColor.setHex(look.hemisphere[1]); hemisphere.intensity = look.hemisphere[2];
    bounce.color.setHex(look.bounce[0]); bounce.intensity = look.bounce[1];
    fitShadow();
    const settings = post.settings;
    settings.exposure.value = look.post.exposure; settings.strength.value = look.post.strength; settings.saturation.value = look.post.saturation;
    settings.contrast.value = look.post.contrast; settings.vignette.value = look.post.vignette; settings.lift.value.setRGB(...look.post.lift);
    settings.haze.value.set(...look.post.haze); post.setThreshold(look.post.threshold, look.post.knee);
    renderer.toneMappingExposure = look.lowExposure;
    shadowMaterial.color.setHex(look.blobShadow);
    if (look.environment === 'ice') iceEnvironment ??= createIceEnvironment(renderer, sunDirection(LOOKS.vesper.sunElevation));
    if (look.environment === 'luna') lunaEnvironment ??= createLunaEnvironment(renderer, sunDirection(LOOKS.luna.sunElevation));
    if (look.environment === 'mire') mireEnvironment ??= createMireEnvironment(renderer, sunDirection(LOOKS.nacre.sunElevation));
    const sky = look.environment === 'ice' && iceEnvironment ? iceEnvironment.texture : look.environment === 'luna' && lunaEnvironment ? lunaEnvironment.texture
      : look.environment === 'mire' && mireEnvironment ? mireEnvironment.texture : environment.texture;
    materials.craft.envMap = sky; materials.craft.needsUpdate = true; materials.enemyCraft.envMap = sky; materials.enemyCraft.needsUpdate = true;
    // On Luna the Khepri-built enemies wear steel-blue paint, so they read apart from the hero against grey regolith.
    (materials.enemyCraft.userData.paintSwap as { value: number }).value = next === 'luna' ? 1 : 0;
    sharedMaterial.envMap = sky; sharedMaterial.needsUpdate = true;
    terrainMaterials.setEnvironment(sky); water.setEnvironment(sky); water.setPlanet(next);
    terrainMaterials.setLook(next); (sharedMaterial.userData.setPlanet as ((planet: PlanetId) => void) | undefined)?.(next);
    if (next === 'vesper') ensureCraft(next); else foam.clear();
    if (next === 'nacre') { ensureNacreCraft(); ensureVeil(); }
    if (next === 'luna') ensureWarden();
    warmed = false;
  };
  const terrain = createTerrainView({ scene, groundMaterial, kitMaterial, infraMaterial: terrainMaterials.infra, boundaryMaterial,
    sharedMaterial, roadMaterial: terrainMaterials.roads, fallbackInfra: createFallbackInfra(materials), fallbackShared: createFallbackShared(),
    waterMaterial: water.material, onPlanet: next => { terrainPlanet = next; } });
  terrain.setShadowFrustum(sunlight.shadow.getFrustum());
  let disposed = false, warmed = false;
  // The Blender kit streams in after start; fallback pieces render until (or unless) it arrives.
  loadKhepriKit(`${import.meta.env.BASE_URL}assets/khepri/khepri-kit.glb`).then(kit => {
    if (disposed) { kit.forEach(geometry => geometry.dispose()); return; }
    terrain.setKit(kit); warmed = false;
  }).catch(error => console.warn('Khepri kit unavailable; using fallback scenery.', error));
  // Modelled outposts replace the code-built stand-ins when khepri-infra.glb exists (docs/13 §3b).
  loadKhepriInfra(`${import.meta.env.BASE_URL}assets/khepri/khepri-infra.glb`).then(infra => {
    if (disposed) { infra.forEach(geometry => geometry.dispose()); return; }
    terrain.setInfra(infra); warmed = false;
  }).catch(() => { /* Not shipped yet: the code-built outposts remain. */ });
  // Shared pipes and tanks (docs/14), shaded from the Khepri palette; code-built stand-ins until they load.
  loadSharedKit(`${import.meta.env.BASE_URL}assets/shared/industrial-kit.glb`).then(shared => {
    if (disposed) { shared.forEach(geometry => geometry.dispose()); return; }
    terrain.setShared(shared); warmed = false;
  }).catch(() => { /* Not shipped: the code-built stand-ins remain. */ });
  // The production fortress (docs/15) replaces the functional stand-in; if it fails, the stand-in remains.
  loadBastionModel(`${import.meta.env.BASE_URL}assets/khepri/bastion-9.glb`).then(model => {
    if (disposed) return;
    bastion.setModel(model); warmed = false;
  }).catch(error => console.warn('Bastion-9 model unavailable; using the functional fortress.', error));
  // Detail maps are optional polish: any map that fails keeps its procedural stand-in.
  loadKhepriTextures(`${import.meta.env.BASE_URL}assets/khepri/textures/`, Math.min(2, renderer.capabilities.getMaxAnisotropy())).then(textures => {
    if (disposed) { Object.values(textures).forEach(texture => texture?.dispose()); return; }
    terrainMaterials.setTextures(textures); warmed = false;
  });
  // Every craft is one mesh with the shared craft material; enemies of a kind are one instanced draw.
  const hero = createHero(materials); hero.scale.setScalar(HERO_SCALE); scene.add(hero);
  const ENEMY_CAPACITY = 32;
  const craftGeometry = (model: THREE.Group) => (model.children[0] as THREE.Mesh).geometry;
  // Ground targets on every terrain level (docs/13 §2), render-only: where terrain in front hides a turret,
  // a faint silhouette shows through (drawn before the turret, only where it lies behind existing depth).
  const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0xffd39a, opacity: .32, depthFunc: THREE.GreaterDepth,
    depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const enemyBatches = new Map<EnemyKind, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }>();
  const standIns = new Map<string, THREE.BufferGeometry>();
  for (const kind of ENEMY_KINDS) {
    const model = KHEPRI_STAND_IN[kind];
    if (!standIns.has(model)) standIns.set(model, craftGeometry(createEnemy(model, materials)));
    const geometry = standIns.get(model)!;
    // The fuel skid keeps its hazard red on every planet (Luna's steel-blue repaint is for the Khepri craft).
    const mesh = new THREE.InstancedMesh(geometry, kind === 'fuel' ? materials.craft : materials.enemyCraft, ENEMY_CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Khepri ${kind} craft`;
    // Ground turrets cast into the High shadow map and take shadows; flying craft use readable blob shadows.
    mesh.castShadow = mesh.receiveShadow = GROUND_KINDS.has(kind);
    let ghost: THREE.InstancedMesh | undefined;
    if (GROUND_KINDS.has(kind)) {
      mesh.renderOrder = 2;
      ghost = new THREE.InstancedMesh(geometry, silhouetteMaterial, ENEMY_CAPACITY);
      ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
    }
    for (let i = 0; i < ENEMY_CAPACITY; i++) mesh.setColorAt(i, WHITE);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh); enemyBatches.set(kind, { mesh, ghost });
  }
  /**
   * Khepri craft (khepri-craft.glb, Blender): replaces the code-built stand-ins in the Khepri batches once loaded. The
   * batches use the shared enemy material, so Luna's steel-blue repaint applies to these models too.
   */
  let khepriEngines: ReadonlyMap<EnemyKind, readonly (readonly [number, number])[]> | null = null;
  loadKhepriCraft(`${import.meta.env.BASE_URL}assets/khepri/khepri-craft.glb`).then(nodes => {
    if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
    for (const kind of ENEMY_KINDS) {
      if (kind === 'fuel') continue;
      const craft = nodes.get(KHEPRI_NODE[kind]), batch = enemyBatches.get(kind);
      if (!craft || !batch) continue;
      batch.mesh.geometry = craft.geometry; if (batch.ghost) batch.ghost.geometry = craft.geometry;
    }
    khepriEngines = new Map(ENEMY_KINDS.filter(kind => kind !== 'fuel').map(kind => [kind, KHEPRI_ENGINES[KHEPRI_NODE[kind as Exclude<EnemyKind, 'fuel'>]]]));
    warmed = false;
  }).catch(error => console.warn('Khepri craft unavailable (khepri-craft.glb); using the code-built stand-ins.', error));
  /** Wreck batches by node (loot-props.glb); the fuel skid's model replaces its stand-in in the enemy batches. */
  const wreckBatches = new Map<string, THREE.InstancedMesh>();
  loadCraftNodes(`${import.meta.env.BASE_URL}assets/shared/loot-props.glb`, LOOT_NODES).then(nodes => {
    if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
    const fuel = nodes.get('loot_fuel'), batch = enemyBatches.get('fuel');
    if (fuel && batch) { batch.mesh.geometry = fuel.geometry; if (batch.ghost) batch.ghost.geometry = fuel.geometry; }
    for (const name of ['wreck_turret_0', 'wreck_turret_1', 'wreck_fuel'] as const) {
      const craft = nodes.get(name);
      if (!craft) continue;
      const mesh = new THREE.InstancedMesh(craft.geometry, materials.craft, WRECK_CAPACITY);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Wreck ${name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      for (let i = 0; i < WRECK_CAPACITY; i++) mesh.setColorAt(i, WHITE);
      scene.add(mesh); wreckBatches.set(name, mesh);
    }
    warmed = false;
  }).catch(error => console.warn('Loot props unavailable (loot-props.glb); fuel skids use a stand-in and kills leave no wrecks.', error));
  /**
   * Ground wrecks (render-only): a ground target that vanishes on screen with the simulation's kill explosion at its
   * position leaves a wreck on the terrain at that world spot; it scrolls away with the ground. Targets cleared by a
   * boss's arrival or a jump leave nothing (no explosion there).
   */
  const wrecks: { node: 'wreck_turret_0' | 'wreck_turret_1' | 'wreck_fuel'; x: number; worldS: number; yaw: number; y: number }[] = [];
  /** A ground target last frame: logical (x, s) for matching its kill explosion; drawn ground spot for the wreck. */
  type GroundSeen = { kind: EnemyKind; x: number; s: number; afloat: boolean; groundX: number; /** World s. */ groundS: number; base: number };
  const groundSeen = new Map<number, GroundSeen>();
  let wreckRun: RunState['config'] | null = null, wreckTick = -1;
  /** Foam collars for drifting floes and bergs, from the terrain view's live features (world space, real footprints). */
  function collectFloeRings(): FoamRing[] {
    floeRings.length = 0;
    for (const floe of terrain.features.floes) floeRings.push({ x: floe.x, z: floe.z, y: floe.y, yaw: floe.yaw, rx: floe.rx, rz: floe.rz });
    return floeRings;
  }
  /** Vent-stack tops near the view, for steam (terrain view's live features). */
  const collectVents = (cameraX: number) => terrain.features.vents.filter(vent => Math.abs(vent.x - cameraX) < VIEW.width / 2 + 1);
  /** Vesper craft batches (same kinds, Vesper models), created once vesper-craft.glb has loaded. */
  const enemyHp = new Map<number, number>(), enemyHitAt = new Map<number, number>(), hitColor = new THREE.Color();
  let hitTick = 0;
  /** Nacre craft batches by node, created once nacre-craft.glb has loaded (Nacre runs only). */
  let nacreBatches: Map<NacreCraftNode, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh; engines: [number, number][]; plume: number }> | null = null, nacreRequested = false;
  function ensureNacreCraft() {
    if (nacreRequested) return;
    nacreRequested = true;
    loadNacreCraft(`${import.meta.env.BASE_URL}assets/nacre/nacre-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
      const batches = new Map<NacreCraftNode, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh; engines: [number, number][]; plume: number }>();
      for (const [name, craft] of nodes) {
        const ground = name === 'nacre_spore';
        const mesh = new THREE.InstancedMesh(craft.geometry, materials.craft, ENEMY_CAPACITY);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Nacre ${name}`;
        mesh.castShadow = mesh.receiveShadow = ground;
        for (let i = 0; i < ENEMY_CAPACITY; i++) mesh.setColorAt(i, WHITE);
        mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        let ghost: THREE.InstancedMesh | undefined;
        if (ground) {
          mesh.renderOrder = 2;
          ghost = new THREE.InstancedMesh(craft.geometry, silhouetteMaterial, ENEMY_CAPACITY);
          ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
        }
        // The Shard's engines glow amber like its seams (art/nacre-craft); the others burn teal.
        scene.add(mesh); batches.set(name, { mesh, ghost, engines: craft.engines, plume: name === 'nacre_shard' ? 0xffa040 : 0x46f0dc });
      }
      nacreBatches = batches; warmed = false;
    }).catch(error => console.warn('Nacre craft unavailable (nacre-craft.glb); using Khepri and Vesper models.', error));
  }
  let vesperBatches: Map<EnemyKind, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }> | null = null, craftRequested = false;
  function ensureCraft(next: PlanetId | 'kinds') {
    if (next === 'khepri' || next === 'luna' || craftRequested) return;
    craftRequested = true;
    loadVesperCraft(`${import.meta.env.BASE_URL}assets/vesper/vesper-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(geometry => geometry.dispose()); return; }
      const batches = new Map<EnemyKind, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }>();
      for (const kind of ENEMY_KINDS) {
        const geometry = nodes.get(VESPER_CRAFT[kind].node);
        if (!geometry) continue;
        const mesh = new THREE.InstancedMesh(geometry, materials.craft, ENEMY_CAPACITY);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Vesper ${kind} craft`;
        mesh.castShadow = mesh.receiveShadow = GROUND_KINDS.has(kind);
        let ghost: THREE.InstancedMesh | undefined;
        if (GROUND_KINDS.has(kind)) {
          mesh.renderOrder = 2;
          ghost = new THREE.InstancedMesh(geometry, silhouetteMaterial, ENEMY_CAPACITY);
          ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
        }
        for (let i = 0; i < ENEMY_CAPACITY; i++) mesh.setColorAt(i, WHITE);
        mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh); batches.set(kind, { mesh, ghost });
      }
      vesperBatches = batches; warmed = false;
    }).catch(error => console.warn(`Vesper craft unavailable (${VESPER_CRAFT_NODES.join(', ')}); using Khepri models.`, error));
  }
  // On slopes a foundation plinth reaches down to the lowest ground under the turret footprint.
  const plinthGeometry = new THREE.CylinderGeometry(.6, .66, 1, 6); plinthGeometry.translate(0, .5, 0);
  const plinths = new THREE.InstancedMesh(plinthGeometry, materials.dark, 32);
  plinths.instanceMatrix.setUsage(THREE.DynamicDrawUsage); plinths.frustumCulled = false; plinths.count = 0; plinths.receiveShadow = true; scene.add(plinths);
  // Over open water a ground battery rides a small black-ceramic pontoon instead (render-only, one draw).
  const pontoons = new THREE.InstancedMesh(createPontoonGeometry(), materials.craft, 32);
  pontoons.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pontoons.frustumCulled = false; pontoons.count = 0; pontoons.receiveShadow = true; pontoons.name = 'battery pontoons';
  scene.add(pontoons);
  const pontoonRings: FoamRing[] = [];
  /*
   * Telegraph strips for the Vesper kinds: flat quads in the flight plane (readable at phone size, unlike 1 px
   * lines), one draw. Needle windup: a dashed 0.4 lane at its aim; missile battery: its own column; Diamond: the
   * wing that fires and the side it brackets. A second, additive layer flashes a Needle lane bright for the 0.2 s
   * before its beam (bloom on High).
   */
  const stripGeometry = new THREE.PlaneGeometry(1, 1); stripGeometry.rotateX(-Math.PI / 2);
  const telegraphs = new THREE.InstancedMesh(stripGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85,
    depthTest: false, depthWrite: false }), 512);
  const flashLanes = new THREE.InstancedMesh(stripGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 32);
  // Soft lane and column fills under the dashed edges: a light veil that reads on snow and on water alike.
  const laneFills = new THREE.InstancedMesh(stripGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .26,
    depthTest: false, depthWrite: false }), 32);
  for (const mesh of [telegraphs, flashLanes, laneFills]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 9; scene.add(mesh);
  }
  // The Helion Ark (docs/17 §5) rides on the sea; its model loads on first use, Bastion-9 stays untouched.
  const ark = createArkView(scene);
  const warden = createWardenView(scene);
  const veil = createVeilView(scene);
  let wardenRequested = false;
  /** WARDEN-1's production model (warden.glb) loads with Luna; the code-built stand-in renders until then. */
  const ensureWarden = () => {
    if (wardenRequested) return;
    wardenRequested = true;
    loadWardenModel(`${import.meta.env.BASE_URL}assets/luna/warden.glb`).then(model => { if (!disposed) { warden.setModel(model); warmed = false; } })
      .catch(error => console.warn('WARDEN-1 model unavailable; using the code-built stand-in.', error));
  };
  let veilRequested = false;
  /** THE VEIL's production model (the-veil.glb) loads with Nacre; the code-built stand-in renders until then. */
  const ensureVeil = () => {
    if (veilRequested) return;
    veilRequested = true;
    loadVeilModel(`${import.meta.env.BASE_URL}assets/nacre/the-veil.glb`).then(model => { if (!disposed) { veil.setModel(model); warmed = false; } })
      .catch(error => console.warn('THE VEIL model unavailable; using the code-built stand-in.', error));
  };
  let arkRequested = false;
  const ensureArk = () => {
    if (arkRequested) return;
    arkRequested = true;
    loadArkModel(`${import.meta.env.BASE_URL}assets/vesper/helion-ark.glb`).then(model => { if (!disposed) { ark.setModel(model); warmed = false; } })
      .catch(error => console.warn('Helion Ark model unavailable; using the functional carrier.', error));
  };
  /*
   * Endless planet cycle (docs/18 §4): the next planet's render assets load during the boss sector, never mid-jump,
   * and stay cached. Khepri's load at start; Vesper's are its craft, the Helion Ark and its prefiltered sky.
   */
  const preload = (next: PlanetId) => {
    // Nacre flies its own craft (and keeps the Vesper models as a fallback): both load before the jump.
    if (next === 'nacre') { ensureNacreCraft(); ensureVeil(); ensureCraft('kinds'); return; }
    if (next !== 'vesper') return;
    ensureCraft('vesper'); ensureArk();
    if (!iceEnvironment) { iceEnvironment = createIceEnvironment(renderer, sunDirection(LOOKS.vesper.sunElevation)); warmed = false; }
  };
  const planetReady = (next: PlanetId) => next === 'nacre' ? !!nacreBatches || !!vesperBatches : next !== 'vesper' || (!!vesperBatches && !!iceEnvironment);
  const jumpFx = createJumpFx(scene);
  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  /** Reduced motion turns the jump into a plain fade (OS setting; `?motion=reduce` for look-dev). */
  const reducedMotion = () => query.get('motion') === 'reduce' || !!motionQuery?.matches;
  let jumpActive = false;
  const transform = new THREE.Object3D(), color = new THREE.Color();

  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 32;
  const shadowContext = shadowCanvas.getContext('2d');
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(16, 16, 2, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,0.65)'); gradient.addColorStop(.4, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 32, 32);
  }
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x2a1a12, map: shadowTexture, transparent: true, opacity: .55, depthWrite: false });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1); shadowGeometry.rotateX(-Math.PI / 2);
  const flightShadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, 64);
  flightShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flightShadows.frustumCulled = false;
  flightShadows.count = 0; flightShadows.renderOrder = 1; scene.add(flightShadows);

  const shieldMaterial = new THREE.MeshBasicMaterial({ color: 0xb1fff1, transparent: true, opacity: .35, depthWrite: false, depthTest: false });
  const shield = new THREE.Mesh(new THREE.RingGeometry(.52, .548, 32), shieldMaterial); shield.scale.setScalar(HERO_SCALE);
  shield.rotation.x = -ELEVATION; shield.renderOrder = 8; scene.add(shield);

  // Shots never hide behind ground: no depth test, and `transparent` puts them in the last (transparent) list so
  // they draw after roads and other blended ground passes, which would otherwise paint over them.
  const friendlyMaterial = new THREE.MeshBasicMaterial({ color: 0xbcfff8, depthTest: false, depthWrite: false, transparent: true });
  const hostileMaterial = new THREE.MeshBasicMaterial({ color: 0xff8869, depthTest: false, depthWrite: false, transparent: true });
  const hostileCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffe7c4, depthTest: false, depthWrite: false, transparent: true });
  const projectileGeometry = new THREE.SphereGeometry(1, 6, 4);
  const friendly = new THREE.InstancedMesh(projectileGeometry, friendlyMaterial, 1024);
  const hostile = new THREE.InstancedMesh(projectileGeometry, hostileMaterial, 1024);
  const hostileCores = new THREE.InstancedMesh(projectileGeometry, hostileCoreMaterial, 1024);
  for (const mesh of [friendly, hostile, hostileCores]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = mesh === hostileCores ? 11 : 10; mesh.count = 0; scene.add(mesh);
  }
  // Drop icons: one antialiased, mipmapped canvas sprite per icon (weapon drops show their own gun), one draw each.
  const pickupTextures = createPickupIconTextures(renderer.capabilities.getMaxAnisotropy());
  const pickupGeometry = new THREE.PlaneGeometry(PICKUP_ICON_SIZE, PICKUP_ICON_SIZE);
  const pickupBatches = new Map<PickupIcon, THREE.InstancedMesh>();
  for (const icon of PICKUP_ICONS) {
    const material = new THREE.MeshBasicMaterial({ map: pickupTextures.get(icon)!, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(pickupGeometry, material, 64);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.count = 0; scene.add(mesh);
    pickupBatches.set(icon, mesh);
  }
  // Gameplay-shaped rings stay (shockwave radius, shield break, pickup, burst marker); fx adds the cosmetic layer.
  const effectMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const effects = new THREE.InstancedMesh(new THREE.RingGeometry(.85, 1, 24), effectMaterial, 128);
  effects.setColorAt(0, color.setHex(0xffffff));
  effects.instanceMatrix.setUsage(THREE.DynamicDrawUsage); effects.frustumCulled = false; effects.renderOrder = 6; effects.count = 0; scene.add(effects);
  const fx = createFx(scene);
  const plumes: Plume[] = [];

  const laneGeometry = new THREE.PlaneGeometry(1, VIEW.maxS - VIEW.minS);
  laneGeometry.rotateX(-Math.PI / 2);
  const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xff6f48, opacity: .34, transparent: true, depthWrite: false, depthTest: false });
  const lanes = new THREE.InstancedMesh(laneGeometry, laneMaterial, 32);
  lanes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lanes.frustumCulled = false; lanes.renderOrder = 5; lanes.count = 0; scene.add(lanes);

  const lineVertices = new Float32Array(16384 * 3), lineColors = new Float32Array(16384 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(lineVertices, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .7, depthTest: false, depthWrite: false }));
  lines.frustumCulled = false; lines.renderOrder = 9; scene.add(lines);

  let lastStatsTick = -Infinity;
  /** Per-frame terrain CPU work (update, cull, animate, prefetch), for streaming QA. */
  const terrainWork = { last: 0, max: 0, over4: 0, frames: 0, renderMax: 0, updateMax: 0, animateMax: 0, prefetchMax: 0 };
  /** Draw calls per pass in the last frame (shadow map, main scene, post), for the budget evidence. */
  const passes = { shadow: 0, main: 0, post: 0 };
  // QA instrumentation only: count the draws three.js issues inside its shadow pass.
  const renderShadows = renderer.shadowMap.render.bind(renderer.shadowMap);
  renderer.shadowMap.render = (lights, shadowScene, view) => {
    const before = renderer.info.render.calls; renderShadows(lights, shadowScene, view); passes.shadow += renderer.info.render.calls - before;
  };
  let drawingWidth = 1, drawingHeight = 1;
  const resizePost = () => post.setSize(drawingWidth * renderer.getPixelRatio(), drawingHeight * renderer.getPixelRatio());
  return {
    setQuality(next) {
      if(disposed)return;quality=next;terrain.setQuality(next);terrainMaterials.setNormalMaps(next==='high');fx.setQuality(next);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,next==='high'?1.5:1)); resizePost();
      // Shadow maps are a High-tier feature; toggling them recompiles the affected programs once.
      renderer.shadowMap.enabled = sunlight.castShadow = next === 'high';
      scene.traverse(object => { const material = (object as THREE.Mesh).material; (Array.isArray(material) ? material : material ? [material] : []).forEach(m => { m.needsUpdate = true; }); });
      lastStatsTick=-Infinity;
    },
    resize(width, height) {
      if (disposed) return;
      drawingWidth = Math.max(1, Math.floor(width)); drawingHeight = Math.max(1, Math.floor(height));
      viewportAspect = drawingWidth / drawingHeight;
      if (cameraMode !== 'rectified') fitFlightViewport(camera, drawingWidth, drawingHeight);
      placeCamera(camera.position.x); fitShadow();
      renderer.setSize(drawingWidth, drawingHeight, false); resizePost();
      lastStatsTick = -Infinity;
    },
    render(state, alpha) {
      if (disposed) return;
      renderer.info.reset();
      // Interpolation is presentation-only; the view follows the exact authoritative camera.
      void alpha;
      const terrainStart = performance.now();
      // The run's schedule drives the terrain (docs/18 §3): planet stretches and boss arenas by distance; a campaign is one planet.
      terrain.update(state.config.seed, state.distance, runRoute(state.config)); placeCamera(state.cameraX); terrain.cull(camera);
      /** The streamed world under the ship (planet and arena); seating given it resolves each distance on the route. */
      const world = terrain.world, arena = world.arena;
      const lookPlanet: PlanetId = lookOverride ? terrainPlanet : state.planet ?? runPlanet(state.config);
      if (lookPlanet !== planet) applyLook(lookPlanet);
      if (state.config.mode === 'endless') {
        const plan = endlessSectorPlan(Math.max(1, state.sector));
        if (plan.jump && state.time - state.sectorStartedAt > 8) preload(plan.jump.to);
      }
      const terrainUpdate = performance.now() - terrainStart;
      // Boss routing: the Helion Ark rides the sea, WARDEN-1 lands on Luna; every other boss is Bastion-9.
      const isArk = state.boss?.id === 'ark', isWarden = state.boss?.id === 'warden', isVeil = state.boss?.id === 'veil';
      {
        let seat: { x?: number; s: number; baseHeight: number } | null = isWarden && state.boss
          ? bastionPlacement(state.config.seed, state.distance, state.boss.x, state.boss.s, arena, WARDEN_FOOTPRINT, WARDEN.targetHeight) : null;
        if (isWarden && state.boss && seat && perspective) seat = rayPlacement(camera, state.config.seed, state.distance, state.boss.x, state.boss.s, WARDEN.targetHeight, seat.baseHeight, arena);
        warden.update(state, seat);
        if (isWarden) terrain.setExclusion(warden.footprint(state, seat));
      }
      {
        // THE VEIL hovers over the mire: its target plane sits VEIL.targetHeight above the water.
        const mire = world.planet.seaLevel ?? 0;
        let seat: { x?: number; s: number; baseHeight: number } | null = isVeil && state.boss ? veilPlacement(state.boss.s, mire) : null;
        if (isVeil && state.boss && perspective) seat = rayPlacement(camera, state.config.seed, state.distance, state.boss.x, state.boss.s, VEIL.targetHeight, mire, world);
        veil.update(state, seat);
        if (isVeil) terrain.setExclusion(veil.footprint(state, seat));
      }
      if (!isArk && !isWarden && !isVeil) {
        let bossPlacement: { x?: number; s: number; baseHeight: number } | null = state.boss ? bastionPlacement(state.config.seed, state.distance, state.boss.x, state.boss.s, arena) : null;
        if (state.boss && bossPlacement && perspective) bossPlacement = rayPlacement(camera, state.config.seed, state.distance, state.boss.x, state.boss.s, BASTION.targetHeight, bossPlacement.baseHeight, arena);
        bastion.update(state, bossPlacement);
        // While the fortress is present, scenery under its hull is hidden (render-only; ground and roads stay).
        terrain.setExclusion(bastion.footprint(state, bossPlacement));
      }
      // Waterline on the sea; targets (local height 1.6) project onto their logical rows (rayPlacement under a lens).
      const sea = world.planet.seaLevel ?? 0;
      let arkSeat: { x?: number; s: number; baseHeight: number } | null = null;
      if (isArk && state.boss) {
        ensureArk();
        arkSeat = perspective ? rayPlacement(camera, state.config.seed, state.distance, state.boss.x, state.boss.s, HELION_ARK.targetHeight, sea, world)
          : arkPlacement(state.boss.s, sea);
      }
      ark.update(state, arkSeat);
      if (isArk) terrain.setExclusion(ark.footprint(state, arkSeat));
      // Haulers and beacons run on simulation time (frozen while paused); presentation only.
      const animateStart = performance.now();
      terrain.animate(state.time, state.cameraX); terrainMaterials.setTime(state.time);
      // Spare budget each frame generates the next section (and then its view) ahead of need, so streaming
      // never needs a long synchronous generation mid-flight.
      const prefetchStart = performance.now(), prefetchEnd = prefetchStart + PREFETCH_BUDGET_MS;
      terrain.prefetch(() => performance.now() < prefetchEnd);
      const now = performance.now(), work = terrainUpdate + now - animateStart;
      terrainWork.last = work; terrainWork.frames++;
      if (state.tick > 0) {
        terrainWork.max = Math.max(terrainWork.max, work); if (work > 4) terrainWork.over4++;
        terrainWork.updateMax = Math.max(terrainWork.updateMax, terrainUpdate);
        terrainWork.animateMax = Math.max(terrainWork.animateMax, prefetchStart - animateStart);
        terrainWork.prefetchMax = Math.max(terrainWork.prefetchMax, now - prefetchStart);
      }
      if (!warmed) {
        // Preview rendering warms all authored craft/material programs before the first fight.
        // Instance-color attributes above are allocated now, avoiding a new program on first loot/hit.
        // Boss rigs stay hidden until their arrival; compile every part (wrecks, shutters, thrusters included) now, so
        // a boss's first frame never stalls on shader compilation and it glides in instead of popping up mid-view.
        const bossParts: THREE.Object3D[] = [];
        for (const name of ['Bastion-9', 'Helion Ark', 'WARDEN-1', 'THE VEIL']) scene.getObjectByName(name)?.traverse(object => { bossParts.push(object); });
        const pieces = [...terrain.warmupObjects(), ...jumpFx.objects, ...bossParts];
        pieces.forEach(piece => { piece.userData.wasVisible = piece.visible; piece.visible = true; });
        renderer.compile(scene, camera);
        pieces.forEach(piece => { piece.visible = piece.userData.wasVisible; }); warmed = true;
      }
      placeSun(state.cameraX, state.distance);
      // The last life lost: the hero is gone (its explosion plays on in the death afterglow, see main.ts).
      const heroAlive = state.player.lives > 0;
      hero.visible = heroAlive;
      // Mission-start entrance (render-only): the hero starts close to the camera (large, out along the view ray, so it
      // keeps its screen position under the orthographic lens) and drops to flight height with one barrel roll.
      const entrance = state.time < HERO_ENTRANCE ? 1 - Math.pow(1 - Math.max(0, state.time) / HERO_ENTRANCE, 3) : 1;
      const lift = (1 - entrance) * HERO_ENTRANCE_LIFT;
      hero.position.set(state.player.x, VIEW.flightHeight + lift * Math.sin(ELEVATION), lift * Math.cos(ELEVATION));
      hero.scale.setScalar(HERO_SCALE * (1 + (1 - entrance) * 1.6));
      hero.rotation.z = -state.player.vx * .016 + (1 - entrance) * Math.PI * 2;
      shield.position.set(state.player.x, VIEW.flightHeight + .03, 0);
      shield.visible = heroAlive && state.time < state.player.invulnerableUntil;
      shieldMaterial.opacity = .34;
      // Engine plumes (render-only): length follows lateral speed, a slight flicker from simulation time.
      plumes.length = 0;
      const flicker = (n: number) => .92 + .08 * Math.sin(state.time * 37 + n * 1.7);
      const heroLength = (.5 + Math.abs(state.player.vx) * .03) * flicker(0) * HERO_SCALE;
      if (heroAlive && entrance > .9) for (const side of [-1, 1]) plumes.push({ x: state.player.x + side * .38 * HERO_SCALE * Math.cos(hero.rotation.z), z: .7 * HERO_SCALE, length: heroLength,
        width: .2 * HERO_SCALE, hex: 0x7ff6ea, energy: 2.6 });
      let shadowCount = 0, plinthCount = 0;
      const flightShadow = (x: number, s: number, width: number, length: number, height: number) => {
        if (shadowCount >= flightShadows.instanceMatrix.count) return;
        // Shadows fall to the lower right, away from the upper-left sun; offset kept modest for readability.
        const groundX = x + height * .22, groundS = s - height * .08;
        const groundY = surfaceHeight(state.config.seed, groundX, state.distance + groundS, world);
        transform.position.set(groundX, groundY + .07, -groundS);
        transform.rotation.set(0, 0, 0); transform.scale.set(width, 1, length); transform.updateMatrix();
        flightShadows.setMatrixAt(shadowCount++, transform.matrix);
      };
      flightShadow(state.player.x, 0, 1.5 * HERO_SCALE, 1.8 * HERO_SCALE, VIEW.flightHeight);

      // Instance counts per batch mesh: each enemy fills the batch of the model it actually uses (a Vesper kind keeps its
      // own model on any planet).
      const counts = new Map<THREE.InstancedMesh, number>();
      // Hit flashes: compare each craft's hp with the last frame (a new run restarts the record).
      if (state.tick < hitTick) { enemyHp.clear(); enemyHitAt.clear(); }
      hitTick = state.tick;
      for (const [id] of enemyHp) if (!state.enemies.some(enemy => enemy.id === id)) { enemyHp.delete(id); enemyHitAt.delete(id); }
      let pontoonCount = 0, stripCount = 0, flashCount = 0, fillCount = 0; pontoonRings.length = 0;
      const strip = (x1: number, s1: number, x2: number, s2: number, width: number, hex: number, layer = telegraphs, energy = 1) => {
        const index = layer === telegraphs ? stripCount : layer === flashLanes ? flashCount : fillCount;
        if (index >= layer.instanceMatrix.count) return;
        transform.position.set((x1 + x2) / 2, VIEW.flightHeight + .035, -(s1 + s2) / 2);
        transform.rotation.set(0, Math.atan2(x2 - x1, -(s2 - s1)), 0); transform.scale.set(width, 1, Math.hypot(x2 - x1, s2 - s1)); transform.updateMatrix();
        layer.setMatrixAt(index, transform.matrix); layer.setColorAt(index, color.setHex(hex).multiplyScalar(energy));
        if (layer === telegraphs) stripCount++; else if (layer === flashLanes) flashCount++; else fillCount++;
      };
      // Vesper flies its own faction's craft once loaded (Khepri models meanwhile).
      const activeBatches = planet === 'vesper' && vesperBatches ? vesperBatches : enemyBatches;
      let lineCursor = 0;
      const line = (x1: number, s1: number, x2: number, s2: number, hex: number) => {
        if (lineCursor + 2 > lineVertices.length / 3) return;
        color.setHex(hex);
        lineVertices.set([x1, VIEW.flightHeight + .03, -s1, x2, VIEW.flightHeight + .03, -s2], lineCursor * 3);
        lineColors.set([color.r, color.g, color.b, color.r, color.g, color.b], lineCursor * 3); lineCursor += 2;
      };
      const groundNow = new Map<number, GroundSeen>();
      for (const enemy of state.enemies) {
        if (enemy.bossPart) continue;
        const isGround = GROUND_KINDS.has(enemy.kind);
        const visible = Math.abs(enemy.x - state.cameraX) < VIEW.width / 2 + 1 && enemy.s > VIEW.minS - 2 && enemy.s < VIEW.maxS + 3;
        if (!visible) continue;
        // A ground battery over open water rides a pontoon: its core sits PONTOON_DECK higher, still on its logical pixel.
        const afloat = isGround && world.planet.seaLevel !== null && surfaceHeight(state.config.seed, enemy.x, state.distance + enemy.s, world) <= sea + 1e-6
          && terrainHeight(state.config.seed, enemy.x, state.distance + enemy.s, world) < sea - .05;
        const coreHeight = enemy.groundHeight + (afloat ? PONTOON_DECK : 0);
        const placement: { x?: number; s: number; baseHeight: number } = !isGround ? { baseHeight: VIEW.flightHeight, s: enemy.s }
          : perspective ? rayPlacement(camera, state.config.seed, state.distance, enemy.x, enemy.s, coreHeight, -Infinity, world)
          : groundPlacement(state.config.seed, state.distance, enemy.x, enemy.s, coreHeight, world);
        if (isGround && enemy.hp > 0) groundNow.set(enemy.id, { kind: enemy.kind, x: enemy.x, s: enemy.s, afloat, groundX: placement.x ?? enemy.x, groundS: state.distance + placement.s, base: placement.baseHeight });
        if (afloat) {
          if (pontoonCount < pontoons.instanceMatrix.count) {
            transform.position.set(placement.x ?? enemy.x, placement.baseHeight + Math.sin(state.time * 1.1 + enemy.id) * .012, -placement.s);
            transform.rotation.set(0, enemy.id * .7, 0); transform.scale.setScalar(1); transform.updateMatrix(); pontoons.setMatrixAt(pontoonCount++, transform.matrix);
            pontoonRings.push({ x: placement.x ?? enemy.x, z: -placement.s, y: sea, yaw: 0, rx: .8, rz: .8, strength: .55 });
          }
          placement.baseHeight += PONTOON_DECK;
        }
        if (VESPER_KINDS.has(enemy.kind) && !craftRequested) ensureCraft('kinds');
        const nacreNode: NacreCraftNode | null = planet === 'nacre' && nacreBatches && enemy.kind !== 'fuel' ? (enemy.formation?.template === 'veil-pods' ? 'nacre_pod' : NACRE_CRAFT[enemy.kind].node) : null;
        const nacreBatch = nacreNode ? nacreBatches!.get(nacreNode) : undefined;
        const useVesper = !nacreBatch && enemy.kind !== 'fuel' && !!vesperBatches && (activeBatches === vesperBatches || VESPER_KINDS.has(enemy.kind));
        const batch = nacreBatch ?? (useVesper ? vesperBatches!.get(enemy.kind) : undefined) ?? enemyBatches.get(enemy.kind)!, slot = counts.get(batch.mesh) ?? 0;
        const vesperCraft = useVesper ? VESPER_CRAFT[enemy.kind] : null;
        const craftScale = nacreBatch ? (nacreNode === 'nacre_pod' || enemy.kind === 'fuel' ? 1 : NACRE_CRAFT[enemy.kind].scale) : vesperCraft?.scale ?? 1;
        if (slot < ENEMY_CAPACITY) {
          transform.position.set(placement.x ?? enemy.x, placement.baseHeight, -placement.s);
          transform.rotation.set(0, 0, enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0); transform.scale.setScalar(craftScale); transform.updateMatrix();
          batch.mesh.setMatrixAt(slot, transform.matrix); counts.set(batch.mesh, slot + 1);
          const seen = enemyHp.get(enemy.id); enemyHp.set(enemy.id, enemy.hp);
          if (seen !== undefined && enemy.hp < seen) enemyHitAt.set(enemy.id, state.time);
          const kick = Math.max(0, 1 - (state.time - (enemyHitAt.get(enemy.id) ?? -9)) / HIT_FLASH);
          batch.mesh.setColorAt(slot, hitColor.setRGB(1 + 1.9 * kick, 1 + 1.6 * kick, 1 + 1.2 * kick));
        }
        if (isGround && !afloat && plinthCount < plinths.instanceMatrix.count) {
          let lowest = placement.baseHeight;
          for (const [dx, ds] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) lowest = Math.min(lowest, surfaceHeight(state.config.seed, enemy.x + dx, state.distance + placement.s + ds, world));
          if (placement.baseHeight - lowest > .08) {
            transform.position.set(enemy.x, lowest - .12, -placement.s); transform.rotation.set(0, 0, 0);
            transform.scale.set(1, placement.baseHeight + .06 - (lowest - .12), 1); transform.updateMatrix();
            plinths.setMatrixAt(plinthCount++, transform.matrix);
          }
        }
        // Flying craft keep the readable blob shadow on both tiers; ground turrets cast real shadows on High.
        if (!isGround || quality !== 'high') flightShadow(enemy.x, placement.s,
          enemy.kind === 'weaver' || enemy.kind === 'diamond' ? 2.2 : 1.5, enemy.kind === 'lancer' ? 2.3 : enemy.kind === 'diamond' ? 2.1 : 1.9, isGround ? enemy.groundHeight : VIEW.flightHeight);
        if (!isGround) {
          // Warm engine plumes trail behind hostile craft (their nozzles face away from the player).
          const bank = enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0;
          if (nacreBatch) for (const [ex, ez] of nacreBatch.engines) plumes.push({ x: enemy.x + ex * craftScale * Math.cos(bank), z: -enemy.s + ez * craftScale,
            length: -.3 * flicker(enemy.id + ex * 13), width: .12, hex: nacreBatch.plume, energy: 2.2 });
          else if (vesperCraft) for (const [ex, ez] of vesperCraft.engines) plumes.push({ x: enemy.x + ex * vesperCraft.scale * Math.cos(bank), z: -enemy.s + ez * vesperCraft.scale,
            length: -.3 * flicker(enemy.id + ex * 13), width: .11, hex: 0xff7a26, energy: 2.2 });
          else if (khepriEngines) for (const [ex, ez] of khepriEngines.get(enemy.kind) ?? []) plumes.push({ x: enemy.x + ex * Math.cos(bank), z: -enemy.s + ez,
            length: -.32 * flicker(enemy.id + ex * 13), width: .12, hex: 0xffa060, energy: 1.9 });
          else for (const side of [-1, 1]) plumes.push({ x: enemy.x + side * .27 * Math.cos(bank), z: -enemy.s - .55, length: -.34 * flicker(enemy.id + side), width: .14, hex: 0xffa060, energy: 1.9 });
        }
        // Ground brackets are drawn on the shared proxy, exactly over the physical luminous core.
        if (isGround || enemy.warning > 0) {
          const r = enemy.radius + .13, length = .16, tint = enemy.warning > 0 ? 0xffc987 : 0xdab482;
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            line(enemy.x + sx * r, enemy.s + sy * r, enemy.x + sx * (r - length), enemy.s + sy * r, tint);
            line(enemy.x + sx * r, enemy.s + sy * r, enemy.x + sx * r, enemy.s + sy * (r - length), tint);
          }
        }
        if (enemy.warning > 0 && enemy.kind === 'needle') {
          // Needle windup: a dashed 0.4 lane down the whole view at its committed aim, with a faint fill.
          strip(enemy.aimX, VIEW.minS, enemy.aimX, VIEW.maxS, .4, 0x6a4020, laneFills);
          for (let s = VIEW.minS; s < VIEW.maxS; s += 1.2) for (const side of [-1, 1]) strip(enemy.aimX + side * .2, s, enemy.aimX + side * .2, Math.min(s + .7, VIEW.maxS), .055, 0xffc06a);
        } else if (enemy.warning > 0 && enemy.kind === 'missile') {
          // Missile battery: a straight marked column from the battery down past the player row (non-tracking).
          strip(enemy.x, enemy.s, enemy.x, VIEW.minS, .4, 0x6a2c1a, laneFills);
          for (let s = enemy.s - .2; s > VIEW.minS; s -= 1.0) for (const side of [-1, 1]) strip(enemy.x + side * .2, s, enemy.x + side * .2, Math.max(s - .6, VIEW.minS), .055, 0xff9a6a);
          strip(enemy.x - .3, enemy.s - .45, enemy.x, enemy.s - .75, .06, 0xffc28a); strip(enemy.x + .3, enemy.s - .45, enemy.x, enemy.s - .75, .06, 0xffc28a);
        } else if (enemy.warning > 0 && enemy.kind === 'diamond') {
          // Diamond: the firing wing and the side it brackets (the volley lands 1.2 to that side of the committed x).
          const side = (enemy.volleys ?? 0) % 2 === 0 ? -1 : 1, wing = enemy.x + side * .55;
          for (let i = 0; i < 6; i++) {
            const a = i / 6, b = (i + .45) / 6;
            strip(THREE.MathUtils.lerp(wing, enemy.aimX, a), enemy.s * (1 - a), THREE.MathUtils.lerp(wing, enemy.aimX, b), enemy.s * (1 - b), .06, 0xffa874);
          }
          strip(enemy.aimX - side * .35, .7, enemy.aimX, .35, .06, 0xffc28a); strip(enemy.aimX - side * .35, 0, enemy.aimX, .35, .06, 0xffc28a);
        } else if (enemy.warning > 0) {
          const targetX = enemy.aimX;
          if (enemy.kind === 'lancer') {
            for (let s = VIEW.minS; s < VIEW.maxS; s += 1.2) {
              line(targetX - .4, s, targetX - .4, s + .6, 0xe2ac69);
              line(targetX + .4, s, targetX + .4, s + .6, 0xe2ac69);
            }
          } else {
            for (let i = 0; i < 6; i++) {
              const a = i / 6, b = (i + .4) / 6;
              line(THREE.MathUtils.lerp(enemy.x, targetX, a), enemy.s * (1 - a), THREE.MathUtils.lerp(enemy.x, targetX, b), enemy.s * (1 - b), 0xbd815d);
            }
          }
        }
      }
      // Ground wrecks: a new run (or a rewind) clears them; a ground target killed on screen leaves one.
      if (wreckRun !== state.config || state.tick < wreckTick) { wrecks.length = 0; groundSeen.clear(); wreckRun = state.config; }
      wreckTick = state.tick;
      for (const [id, last] of groundSeen) {
        if (groundNow.has(id) || last.afloat || last.s < VIEW.minS) continue;
        const exploded = state.effects.some(effect => effect.kind === 'explosion' && Math.abs(effect.x - last.x) < .4 && Math.abs(effect.s - last.s) < .6);
        if (!exploded) continue;
        const hash = Math.sin(id * 12.9898) * 43758.5453 % 1;
        wrecks.push({ node: last.kind === 'fuel' ? 'wreck_fuel' : Math.abs(hash) < .5 ? 'wreck_turret_0' : 'wreck_turret_1', x: last.groundX,
          worldS: last.groundS, yaw: hash * Math.PI * 2, y: last.base });
        if (wrecks.length > WRECK_CAPACITY) wrecks.shift();
      }
      groundSeen.clear(); groundNow.forEach((value, id) => groundSeen.set(id, value));
      for (let i = wrecks.length - 1; i >= 0; i--) if (wrecks[i].worldS - state.distance < VIEW.minS - 4) wrecks.splice(i, 1);
      wreckBatches.forEach(mesh => { mesh.count = 0; });
      for (const wreck of wrecks) {
        const mesh = wreckBatches.get(wreck.node);
        if (!mesh || Math.abs(wreck.x - state.cameraX) > VIEW.width / 2 + 2) continue;
        transform.position.set(wreck.x, wreck.y, -(wreck.worldS - state.distance)); transform.rotation.set(0, wreck.yaw, 0); transform.scale.setScalar(1); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      wreckBatches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
      for (const set of [enemyBatches, vesperBatches, nacreBatches] as const) if (set) for (const batch of set.values()) {
        const count = counts.get(batch.mesh) ?? 0;
        batch.mesh.count = count; batch.mesh.instanceMatrix.needsUpdate = true; if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
        if (batch.ghost) batch.ghost.count = count;
      }
      flightShadows.count = shadowCount; flightShadows.instanceMatrix.needsUpdate = true;
      plinths.count = plinthCount; plinths.instanceMatrix.needsUpdate = true;
      pontoons.count = pontoonCount; pontoons.instanceMatrix.needsUpdate = true;
      let friendlyCount = 0, hostileCount = 0;
      for (const shot of state.projectiles) {
        if (Math.abs(shot.x - state.cameraX) > VIEW.width / 2 + .5 || shot.s < VIEW.minS - 1 || shot.s > VIEW.maxS + 1) continue;
        transform.position.set(shot.x, VIEW.flightHeight + .04, -shot.s);
        transform.rotation.set(0, Math.atan2(shot.vx, -shot.vs), 0);
        if (shot.friendly) {
          transform.scale.set(.045, .045, .27); transform.updateMatrix();
          if (friendlyCount < friendly.instanceMatrix.count) friendly.setMatrixAt(friendlyCount++, transform.matrix);
        } else {
          transform.scale.set(shot.radius * 1.25, .08, shot.radius * 1.65); transform.updateMatrix();
          if (hostileCount < hostile.instanceMatrix.count) {
            hostile.setMatrixAt(hostileCount, transform.matrix);
            transform.scale.multiplyScalar(.49); transform.updateMatrix(); hostileCores.setMatrixAt(hostileCount++, transform.matrix);
          }
          // Known moving threats keep world trajectories; panning reveals these edge chevrons.
        }
      }
      for (const shot of state.projectiles) {
        if (shot.friendly || shot.s < -.2 || shot.s > 4) continue;
        const dx = shot.x - state.cameraX;
        if (Math.abs(dx) <= VIEW.width / 2 || Math.abs(dx) >= VIEW.width / 2 + 2 || dx * shot.vx >= 0) continue;
        const x = state.cameraX + Math.sign(dx) * 5.8;
        line(x, shot.s, x - Math.sign(dx) * .2, shot.s + .2, 0xffa174);
        line(x, shot.s, x - Math.sign(dx) * .2, shot.s - .2, 0xffa174);
      }
      friendly.count = friendlyCount; hostile.count = hostileCores.count = hostileCount;
      for (const mesh of [friendly, hostile, hostileCores]) mesh.instanceMatrix.needsUpdate = true;

      pickupBatches.forEach(mesh => { mesh.count = 0; });
      for (const pickup of state.pickups) {
        const mesh = pickupBatches.get(pickupIcon(pickup))!;
        if (mesh.count >= mesh.instanceMatrix.count) continue;
        // A gentle bob and sway, plus a soft breathing scale so drops catch the eye; they fade in their last 2 s.
        const breathe = 1 + Math.sin(state.time * 3.2 + pickup.id) * .045, fade = pickup.ttl < 2 ? .55 + .45 * Math.abs(Math.cos(state.time * 9)) : 1;
        transform.position.set(pickup.x, VIEW.flightHeight + .06 + Math.sin(state.time * 2 + pickup.id) * .035, -pickup.s);
        transform.rotation.set(-ELEVATION, 0, Math.sin(state.time * .75 + pickup.id) * .08);
        transform.scale.setScalar(breathe * (pickup.ttl < 2 ? fade : 1)); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      pickupBatches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
      let laneCount = 0;
      // Siege Lance (campaign special): a bright piercing beam straight ahead from the ship's nose while it fires.
      if (state.lance && state.time < state.lance.until) {
        const left = state.lance.until - state.time, flare = Math.min(1, left / .12) * (.85 + .15 * Math.sin(state.time * 60));
        strip(state.player.x, .5, state.player.x, VIEW.maxS + 2, .9, 0x7fefff, flashLanes, 1.6 * flare);
        strip(state.player.x, .5, state.player.x, VIEW.maxS + 2, .32, 0xffffff, flashLanes, 2.6 * flare);
      }
      for (const hazard of state.hazards) {
        // A Needle's narrow lane flashes bright for its last 0.2 s before the beam (Khepri lanes are all wider).
        if (hazard.width <= .45 && hazard.warning > 0) {
          const pulse = .6 + .4 * Math.sin(state.time * 40);
          strip(hazard.x, VIEW.minS, hazard.x, VIEW.maxS, hazard.width, 0xffd6a0, flashLanes, 1.8 * pulse);
          const source = state.enemies.find(enemy => enemy.kind === 'needle' && Math.abs(enemy.aimX - hazard.x) < 1e-6);
          if (source) plumes.push({ x: source.x, z: -source.s + .5, length: .01, width: .8, hex: 0xffe0b0, energy: 3, round: true });
        }
        if (hazard.active > 0 && hazard.warning <= 0 && laneCount < lanes.instanceMatrix.count) {
          // A live beam starts at whatever fired it (a locked beam ship, or the boss column right above it) and runs down.
          const source = state.enemies.find(enemy => enemy.hp > 0 && (enemy.bossPart ? Math.abs(enemy.x - hazard.x) < hazard.width / 2 + .3 : !!enemy.lock && Math.abs(enemy.x - hazard.x) < .05));
          const top = Math.min(VIEW.maxS, source ? source.s : VIEW.maxS), length = top - VIEW.minS;
          transform.position.set(hazard.x, VIEW.flightHeight + .02, -(VIEW.minS + top) / 2);
          transform.rotation.set(0, 0, 0); transform.scale.set(hazard.width, 1, length / (VIEW.maxS - VIEW.minS)); transform.updateMatrix(); lanes.setMatrixAt(laneCount++, transform.matrix);
        }
        for (const side of [-1, 1]) {
          const x = hazard.x + side * hazard.width / 2;
          for (let s = VIEW.minS; s < VIEW.maxS; s += 1.2) line(x, s, x, Math.min(s + .7, VIEW.maxS), hazard.warning > 0 ? 0xffc987 : 0xff9c77);
        }
      }
      lanes.count = laneCount; lanes.instanceMatrix.needsUpdate = true;
      for (const [mesh, count] of [[telegraphs, stripCount], [flashLanes, flashCount], [laneFills, fillCount]] as const) {
        mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      let effectCount = 0;
      for (const effect of state.effects) {
        if (effectCount >= effects.instanceMatrix.count) break;
        const age = Math.max(0, Math.min(1, 1 - effect.ttl / effect.duration));
        const radius = effect.kind === 'special' ? .4 + age * 6 : effect.kind === 'explosion' ? .15 + age * .8 : .08 + age * .4;
        transform.position.set(effect.x, VIEW.flightHeight + .04, -effect.s);
        transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.setScalar(radius); transform.updateMatrix();
        effects.setMatrixAt(effectCount, transform.matrix);
        const tint = effect.kind === 'explosion' || effect.kind === 'hit' ? 0xf9b67f : 0x97e7da;
        color.setHex(tint).multiplyScalar(1 - age * .75); effects.setColorAt(effectCount++, color);
      }
      effects.count = effectCount; effects.instanceMatrix.needsUpdate = true; if (effects.instanceColor) effects.instanceColor.needsUpdate = true;
      // Vesper: debris that falls on open water throws snow-white spray; vent stacks breathe steam.
      const seaHeight = world.planet.seaLevel;
      fx.update(state, plumes, terrain.haulerDust, planet === 'vesper' && seaHeight !== null ? {
        splash: (x, z) => terrainHeight(state.config.seed, x, state.distance - z, world) < seaHeight - .05 ? seaHeight : null,
        vents: collectVents(state.cameraX),
      } : null);
      // The ocean and its foam follow the terrain, which streams the next planet ahead of a jump's flash.
      water.update(state.time, state.distance);
      const arkFoam = ark.foam;
      foam.update(state.time, [...collectFloeRings(), ...pontoonRings, ...arkFoam.rings], arkFoam.wakes);
      jumpActive = jumpFx.update(state, reducedMotion(), planetReady(state.jump?.to ?? state.planet ?? planet), quality === 'high');
      lineGeometry.setDrawRange(0, lineCursor);
      lineGeometry.getAttribute('position').needsUpdate = true; lineGeometry.getAttribute('color').needsUpdate = true;
      const renderStart = performance.now();
      passes.shadow = 0;
      if (quality === 'high') {
        post.render(scene, camera);
        passes.post = 6; passes.main = renderer.info.render.calls - passes.shadow - passes.post;
      } else {
        renderer.setRenderTarget(null); renderer.render(scene, camera);
        passes.shadow = passes.post = 0; passes.main = renderer.info.render.calls;
      }
      if (state.tick > 0) terrainWork.renderMax = Math.max(terrainWork.renderMax, performance.now() - renderStart);
      if (state.tick - lastStatsTick >= 60 || state.tick < lastStatsTick) {
        // Read-only browser QA evidence; never a gameplay HUD or a simulation input.
        canvas.dataset.renderStats = JSON.stringify({
          sections: 3, terrain: terrain.stats, stream: terrain.streamStats, bastion: bastion.stats, ark: ark.stats, planet, jump: jumpActive,
          terrainWorkMs: { last: +terrainWork.last.toFixed(2), max: +terrainWork.max.toFixed(2), over4: terrainWork.over4, frames: terrainWork.frames,
            renderMax: +terrainWork.renderMax.toFixed(2), updateMax: +terrainWork.updateMax.toFixed(2),
            animateMax: +terrainWork.animateMax.toFixed(2), prefetchMax: +terrainWork.prefetchMax.toFixed(2) },
          calls: renderer.info.render.calls, passes: { ...passes }, tier: quality, camera: cameraMode, pixelRatio: renderer.getPixelRatio(),antialias:true,
          triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures, particles: fx.particles, enemies: [...counts.values()].reduce((n, count) => n + count, 0),
        });
        lastStatsTick = state.tick;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(), usedMaterials = new Set<THREE.Material>();
      const collect = (object: THREE.Object3D) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          const all = Array.isArray(object.material) ? object.material : [object.material]; all.forEach(material => usedMaterials.add(material));
        }
        if (object instanceof THREE.InstancedMesh) object.dispose();
      };
      fx.dispose(); scene.traverse(collect);
      const textures=new Set<THREE.Texture>();
      usedMaterials.forEach(material=>Object.values(material).forEach(value=>{if(value instanceof THREE.Texture && value !== environment.texture)textures.add(value);}));
      geometries.forEach(geometry => geometry.dispose()); usedMaterials.forEach(material => material.dispose());textures.forEach(texture=>texture.dispose());
      terrain.dispose(); terrainMaterials.dispose(); environment.dispose(); lunaEnvironment?.dispose(); mireEnvironment?.dispose();
      sunlight.shadow.dispose(); post.dispose(); jumpFx.dispose();
      renderer.dispose();
    },
  };
}
