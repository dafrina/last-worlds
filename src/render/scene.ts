import { createHeroTrail, HERO_TRAIL_STRIPS } from './hero-trail';
import { createBeamLight, createPhaseHoles } from './combat-light';
import { liveInstances, dynamicBatch } from './instances';
import { createSilhouetteMaterial, planarShadow, silhouetteShade } from './craft-shadows';
export { liveInstances } from './instances';
import { SHIP_PERKS } from '../content/ship-perks';
import { HERO_STENCIL } from './hero-stencil';
import { drawnShot, launchFrom, type Launch } from './shot-launch';
import * as THREE from 'three';
import { BOSS_ASSETS } from './boss-assets';
import { createFacilityView } from './facility-view';
import { createSiteView } from './site-view';
import { VIEW, type Enemy, type EnemyKind, type GameRenderer, type GraphicsQuality, type Projectile, type RunState } from '../shared/contracts';
import { PLANETS, SCENERY_MAX_HEIGHT, SUN_DIRECTION, TERRAIN_MIN_HEIGHT, setSunBehind, sunBehind, terrainHeight, worldOf, type PlanetId, type TerrainArena, type World, type WorldInput } from '../world/terrain';
import { AMNION_PLATEAU } from '../world/terrain-amnion';
import { UMBRA_PLATEAU } from '../world/terrain-umbra';
import { CITADEL_AT } from '../world/terrain-nahara';
import { arenaStopDistance } from '../sim/boss';
import { HUNTERS } from '../content/hunters';
import { hunterCharges } from '../sim/hunters';
import { RELIC_ARMOR, beamSpec, relicExposed } from '../sim/attacks';
import { ENEMIES } from '../content/balance';
import { missionBoss } from '../content/bosses';
import { runPlanet } from '../content/missions';
import { runRoute } from './terrain-route';
import { loadCoronaCraft, loadCraftNodes, loadKhepriCraft, loadNacreCraft, loadNaharaCraft, loadUmbraCraft, type CoronaCraftNode, type NaharaCraftNode, type KhepriCraftNode, type NacreCraft, type NacreCraftNode, type UmbraCraftNode } from './models';
import { SPECIALS } from '../content/equipment';
import { PICKUP_ICONS, PICKUP_ICON_SIZE, createPickupBumpTextures, createPickupIconTextures, pickupIcon, type PickupIcon } from './pickup-icons';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VESPER_CRAFT_NODES, createDesertEnvironment, createEnemy, createHero, createIceEnvironment, createLunaEnvironment, createMireEnvironment, createVoidEnvironment, createMaterials, createPontoonGeometry, loadVesperCraft, type VesperCraftNode } from './models';
import { arkPlacement, createArkView, loadArkModel } from './ark-view';
import { HELION_ARK } from '../content/ark';
import { createFoam, createWater, type FoamRing } from './water';
import { createCoronaArcs } from './corona-arcs';
import { createCoronaHaze } from './corona-haze';
import { createAmbientMotes } from './ambient-motes';
import { CORONA_SEA_LEVEL } from '../world/terrain-corona';
import { createMireWater } from './mire-water';
import { createFallbackInfra, createFallbackShared, createSharedMaterial, createTerrainMaterials, loadDistrictKit, loadKhepriInfra, loadKhepriKit, loadKhepriTextures, loadSharedKit } from './terrain-kit';
import { createTerrainView } from './terrain-view';
import { createPostPipeline } from './post-pipeline';
import { hostileHues } from './shot-colors';
import { createFx, shotHeat, type Plume } from './fx-particles';
import { createJumpFx } from './fx-jump';
import { endlessSectorPlan } from '../content/endless';
import { BASTION_FOOTPRINT, createBastionView, loadBastionModel } from './bastion-view';
import { WARDEN_FOOTPRINT, createWardenView, loadWardenModel } from './warden-view';
import { CITADEL_STYLE, CRADLE_STYLE, ECLIPSE_STYLE, HELIOPHAGE_STYLE, VEIL_STYLE, createVeilView, loadVeilModel, veilPlacement } from './veil-view';
import { WARDEN } from '../content/warden';
import { WRAITH } from '../content/wraith';
import { BASTION } from '../content/bastion';
import { setWorldPaint, worldGlow, type WorldPaintUniforms } from './world-paint';
import { planeZAtScreenY, viewFootprint, type ViewFootprint } from './view-footprint';
import { PONTOON_DECK } from '../world/run-route';
import { LENS_FOV, fromFlightPlane, lensFollow } from '../shared/lens';
import type { PlanetLook } from '../shared/renderer-types';
import { loadHeroModel, preloadHeroLook } from './hero-craft';
import { DEFAULT_LOOK, HERO_DEFAULT_PAINT, heroLookKey, shownHero } from '../content/hero-parts';
import type { HeroLook, ShipId } from '../shared/contracts';

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
    // Row by row (mobile performance pass, 3 November): the terrain keeps its last four rows, so walking each row's five
    // points together builds 5 rows a pass instead of 25 (the same 25 heights, the same maximum).
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      // Local +z faces the player, which is toward smaller s.
      const dx = i / 2 * (footprint.halfWidth - .2), dz = j / 2 * (footprint.halfDepth - .2);
      baseHeight = Math.max(baseHeight, terrainHeight(seed, x + dx, distance + s - dz, arena));
    }
    s = groundForwardPosition(logicalS, baseHeight + targetHeight);
  }
  return { baseHeight, s };
}

/**
 * The release camera (user, 21 October 2026: "Set it to 25 fov for the next release"): a perspective lens of 25°
 * vertical field of view, placed so the tactical height fits at the centre depth. `?camera=ortho` shows the previous
 * orthographic camera; to revert, set DEFAULT_CAMERA back to 'ortho'.
 */
export const DEFAULT_CAMERA: 'ortho' | 'perspective' | 'rectified' = 'perspective';
/**
 * The lens (src/shared/lens.ts): the simulation projects ground enemies through the same numbers, so look-dev lenses
 * (`?fov=`, `?camera=ortho|rectified`) show ground targets slightly off their gameplay positions; the release lens is exact.
 */
export const PERSPECTIVE_FOV = LENS_FOV;
/** The camera shake's largest offset (world units) at full trauma (explosions and hits; user, 13 November: "slight"). */
const SHAKE_AMPLITUDE = .1;

export function configureCamera(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, x: number): void {
  const centerS = (VIEW.minS + VIEW.maxS) / 2;
  const target = new THREE.Vector3(x, VIEW.flightHeight, -centerS);
  // A perspective lens is placed so the tactical height fits the view at the centre depth, matching the ortho frame.
  const distance = camera instanceof THREE.PerspectiveCamera ? TACTICAL_HEIGHT / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) : 36;
  camera.position.set(x, target.y + Math.sin(ELEVATION) * distance, target.z + Math.cos(ELEVATION) * distance);
  camera.lookAt(target); camera.updateMatrixWorld();
}

/**
 * How much further a perspective camera follows the simulation's camera toward the world edges (render only): the view
 * is narrower at the ship's row than at its centre, so with the camera at its usual limit a ship hugging an edge would be
 * cut off. The factor puts the camera where the ship, up to its wingtips, stays inside the view at its row (25°: 1.10).
 */
export const perspectiveFollow = (fov: number): number => lensFollow(fov);

/**
 * Perspective seating (render-only): follow the camera ray through the logical flight-plane target down to
 * terrain + core height, so the physical core covers its logical target pixel under any lens.
 */
const rayTarget = new THREE.Vector3(), rayDirection = new THREE.Vector3(), rayPoint = new THREE.Vector3();
export function rayPlacement(camera: THREE.Camera, seed: number, distance: number, x: number, logicalS: number, coreHeight: number, baseFloor = -Infinity, arena?: WorldInput | World) {
  // Scratch vectors (bosses seat through this every frame): the same arithmetic as fresh ones.
  const target = rayTarget.set(x, VIEW.flightHeight, -logicalS);
  const direction = camera instanceof THREE.PerspectiveCamera ? rayDirection.copy(target).sub(camera.position).normalize() : camera.getWorldDirection(rayDirection);
  const at = (t: number) => rayPoint.copy(target).addScaledVector(direction, t);
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
/** A battery's shot column: chevron spacing and how fast they flow down it, relative to the battery (units, units/s). */
const CHEVRON_GAP = 2, CHEVRON_FLOW = 2.2;
/** Constant tables the frame reads (docs/38 PF3: not rebuilt per enemy per frame). */
const SIDES = [-1, 1] as const, DASH_STREAKS = [-.12, .16] as const, LINE_ATTRIBUTES = ['position', 'color'] as const;
/** A battery's seat is checked at these corners for a plinth (x, s offsets). */
const PLINTH_CORNERS = [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]] as const;
/** A windup's aim rays: a turret's three-round fan, one ray otherwise. */
const TURRET_FAN = [-.14, 0, .14] as const, SINGLE_RAY = [0] as const;
const NO_ENGINES: readonly (readonly [number, number])[] = [];
/** Engine plume flicker from simulation time (render only). */
const flicker = (time: number, n: number) => .92 + .08 * Math.sin(time * 37 + n * 1.7);
/** Mission-start entrance: duration (s) and how far along the view ray toward the camera the hero starts. */
const HERO_ENTRANCE = 1.6, HERO_ENTRANCE_LIFT = 7;
/**
 * The perspective camera's near plane. The camera stands about 44.6 units from the flight plane, and the nearest thing it
 * ever draws is the hero's entrance pose, about 35 units out (HERO_ENTRANCE_LIFT closer, 2.6 times its size). A depth
 * buffer spends most of its precision just past the near plane: at 1 a phone's buffer resolved the ground only to several
 * centimetres, and the ice walls standing that close before Vesper's cliff faces flashed through them (user, 5 November:
 * the cliff faces "z-flashing", on the phone only). At 20 the precision at the ground is about 20 times finer.
 */
const CAMERA_NEAR = 20;
/** How much further out the Helion Ark's glide-in is drawn at its start (render only; see its placement). */
const ARK_GLIDE = 8;
/** The Interceptor's barrel roll over its sidestep, and the speed streaks it leaves (seconds; render only). */
const DASH_ROLL = .3, DASH_STREAK = .28;

/** Tuned by the user in the light playground (playground.html, 22 October): brighter sky fill and bounce, a higher sun on
 * Khepri, stronger bloom on Khepri and Nacre, and each level's fog. Vesper keeps its shipped light (its cliffs) with the
 * user's fog (23 October). */
const LOOKS: Record<PlanetId, PlanetLook> = {
  khepri: {
    background: 0x6a3a22, sunElevation: 67, sun: [0xffeedb, 7], hemisphere: [0xc6c9cc, 0x493627, 1.7], bounce: [0xc59d7b, .79],
    shadowIntensity: .8, blobShadow: 0x2a1a12, lowExposure: 1,
    post: { exposure: 1.09, threshold: 1.21, knee: .25, strength: .79, lift: [.004, .003, .002], saturation: .9, contrast: 1.08, vignette: .18,
      haze: [.45, .36, .28, .08],
      fog: { color: 0xc8916a, energy: .81, height: [-1.05, -7, .17], distance: [39.5, .041, .16] } },
    environment: 'desert',
  },
  vesper: {
    background: 0x0d3557, sunElevation: 52, sun: [0xf2f6ff, 3.1], hemisphere: [0xb7c5d6, 0x405775, .85], bounce: [0x9fbcdc, .35],
    shadowIntensity: .72, blobShadow: 0x10243c, lowExposure: 1,
    post: { exposure: 1, threshold: 1.4, knee: .25, strength: .38, lift: [.0025, .0045, .0085], saturation: .9, contrast: 1.08, vignette: .16,
      haze: [.82, .9, .98, .155],
      // The user's playground fog (23 October): a pale low mist over the sea and down the cliffs, the shelves clear.
      fog: { color: 0xc4d8ea, energy: 1.09, height: [-2.3, -9.05, .24], distance: [40.5, .041, .12] } },
    environment: 'ice',
  },
  // Luna, Khepri's moon (docs/19): a low hard white sun over grey regolith, long crisp crater shadows, a black sky and
  // a faint grey fill (regolith bounce); a pale dust veil over the low ground and a darker top (user's playground tuning).
  luna: {
    background: 0x07080a, sunElevation: 30, sun: [0xfffaf2, 4.2], hemisphere: [0x8e939c, 0x4a4845, .75], bounce: [0xa8a6a0, .7],
    shadowIntensity: .88, blobShadow: 0x111214, lowExposure: 1,
    post: { exposure: 1, threshold: 1.05, knee: .35, strength: .6, lift: [.003, .003, .0036], saturation: .96, contrast: 1.09, vignette: .26,
      haze: [0, 0, 0, .1],
      fog: { color: 0xffffff, energy: .49, height: [3.1, -6.35, .39], distance: [38.5, .029, .07] } },
    environment: 'luna',
  },
  // Nacre (docs/20): a lilac sun under a violet sky, strong violet sky fill so the dark islands stay readable, a strong
  // cold-blue bounce that lights the camera-facing sides of the black rock (the concept's blue-lit crags), a bloom
  // threshold that lets the bioluminescence glow without washing out, and a faint violet mist.
  nacre: {
    background: 0x1b2035, sunElevation: 33, sun: [0xe8e2f5, 6.2], hemisphere: [0x9fa8bb, 0x1e2036, 1.53], bounce: [0x8094bd, 1.66],
    shadowIntensity: .73, blobShadow: 0x120a28, lowExposure: 1.09,
    post: { exposure: 1.1, threshold: 1.2, knee: .25, strength: 1.18, lift: [.005, .004, .008], saturation: .92, contrast: 1.1, vignette: .42,
      haze: [.32, .34, .47, .085],
      fog: { color: 0x6a5c9a, energy: 1.35, height: [.2, -3.75, .33], distance: [48, .115, .45] } },
    environment: 'mire',
  },
  // Amnion (docs/27): a warm afternoon sun low from the upper left over pale bone (long shadows, as in the concept), warm
  // sky fill, a flesh-red bounce in the canyons and a bloom that lets the yolk glow without washing the bone out. Sun,
  // shadow, haze and the warm mist rising out of the canyons are the user's playground settings (23 October, tuned on
  // the lowered level).
  amnion: {
    background: 0x2a1a14, sunElevation: 29, sun: [0xfff4e6, 8], hemisphere: [0xd2cdc2, 0x3a1a14, .7], bounce: [0xb07a68, .61],
    shadowIntensity: .75, blobShadow: 0x2a1410, lowExposure: 1,
    post: { exposure: 1, threshold: 1.15, knee: .3, strength: .85, lift: [.006, .004, .003], saturation: 1, contrast: 1.1, vignette: .3,
      haze: [.6, .54, .48, .085],
      fog: { color: 0x894b2a, energy: 1.27, height: [1.2, -4.55, .42], distance: [45, .04, .05] } },
    environment: 'desert',
  },
  // Umbra (docs/28): an eternal eclipse. No sun, only a cold violet-white rim light low from the upper left, a violet
  // sky fill and a strong violet bounce on the camera-facing sides so the black glass reads (as Nacre's blue bounce does
  // for its dark rock), the eclipse's sky in every glossy surface, and the canyons lost in a glowing purple fog.
  // Corona (docs/37): the star fills the horizon. A low, overwhelming orange-white key light, a hot bounce from the plasma
  // below, strong bloom and warm haze. Khepri's warm desert sky in its reflections until it has its own.
  corona: {
    // Black basalt under a white-gold star; the light comes up from the plasma (bounce), not down from a warm sky.
    background: 0x1a0904, sunElevation: 26, sun: [0xfff2e2, 4.4], hemisphere: [0x7a706a, 0x2a1408, .7], bounce: [0xff7a18, .8],
    shadowIntensity: .7, blobShadow: 0x0a0402, lowExposure: 1.05,
    // Bloom 1 (user, 6 November; was 1.1): the plasma's glow had softened THE HELIOPHAGE over it.
    post: { exposure: 1.04, threshold: 1.05, knee: .3, strength: 1, lift: [.006, .004, .003], saturation: 1.1, contrast: 1.14, vignette: .38,
      haze: [.55, .2, .05, .03],
      fog: { color: 0xff5a18, energy: 1.0, height: [-6.68, -7.2, .5], distance: [44, .04, .16] } },
    environment: 'desert',
  },
  // Nahara (docs/39, after art/concepts/nahara/01-world): a warm sun high over the sandstone, a cool sky fill, warm bounce
  // off the canyon walls, and a teal haze filling the chasm (full at its floor, thinning up its walls, the terrace tops
  // clear), with a little teal distance haze.
  nahara: {
    // (User's playground look, 13 November: a higher sun, a stronger shadow, the haze rising up the canyon walls.)
    background: 0x24342f, sunElevation: 52, sun: [0xffe6c4, 7.3], hemisphere: [0xc4d2cc, 0x4a3828, .87], bounce: [0xc8966a, .77],
    shadowIntensity: .9, blobShadow: 0x2a1e14, lowExposure: 1.02,
    post: { exposure: 1.04, threshold: 1.15, knee: .3, strength: .7, lift: [.004, .005, .005], saturation: .96, contrast: 1.08, vignette: .24,
      haze: [.42, .62, .58, .115],
      fog: { color: 0x5d958c, energy: 1.25, height: [-.65, -5.9, .31], distance: [44, .073, .06] } },
    environment: 'desert',
  },
  umbra: {
    background: 0x0a0812, sunElevation: 30, sun: [0xe2dcff, 4.4], hemisphere: [0x4a4662, 0x0a0812, .75], bounce: [0x6a5ab0, .85],
    shadowIntensity: .7, blobShadow: 0x05040a, lowExposure: 1.1,
    post: { exposure: 1.12, threshold: 1.1, knee: .3, strength: 1.05, lift: [.006, .004, .012], saturation: .95, contrast: 1.1, vignette: .4,
      haze: [.32, .26, .55, .09],
      fog: { color: 0x8a7cc8, energy: 1.15, height: [-2.3, -5.6, .5], distance: [44, .06, .22] } },
    environment: 'void',
  },
};
const DEFAULT_LOOKS: Readonly<Record<PlanetId, PlanetLook>> = structuredClone(LOOKS);
// Look-dev: `?lookset=vesper.sun.1:4.2,vesper.hemisphere.2:.5` sets look values by path at startup (development only).
if (import.meta.env?.DEV && typeof location !== 'undefined') for (const entry of (new URLSearchParams(location.search).get('lookset') ?? '').split(',').filter(Boolean)) {
  const [path, value] = entry.split(':'), keys = path.split('.'), last = keys.pop()!;
  const parent = keys.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], LOOKS) as Record<string, number> | undefined;
  if (parent && last in parent && Number.isFinite(Number(value))) parent[last] = Number(value);
}
const KHEPRI_SUN_ELEVATION = LOOKS.khepri.sunElevation;
/** Typical lit ground radiance per planet, for the Low silhouettes' displayed darkness (craft-shadows.ts `silhouetteShade`). */
const SILHOUETTE_GROUND: Record<PlanetId, number> = { vesper: 2, luna: .9, khepri: .35, amnion: .5, nacre: .15, corona: .2, nahara: .5, umbra: .12 };
/**
 * Unit vector toward a planet's sun at its elevation: ahead of the ship and to the left (10:30, shadows to the lower right),
 * or behind it and to the left (7:30, shadows up the screen to the right) on a world whose sun stands behind
 * (PlanetProfile.sunBehind, the side the terrain's baked shading takes too).
 */
function sunDirection(elevationDegrees: number, behind = false): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  return new THREE.Vector3(SUN_DIRECTION.x, 0, behind ? SUN_DIRECTION.s : -SUN_DIRECTION.s).normalize().multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation));
}

/**
 * Vesper stand-ins for the current enemy kinds until the combat agent adds Vesper kinds (one table):
 * dart/lancer → Needle, weaver → Diamond, turret → missile battery. Scale keeps them readable next to Khepri
 * sizes; engines are the authored exhaust sockets (art/vesper-craft/README.md).
 */
// Keyed by kind name so the table also covers the Vesper kinds (needle, diamond, missile) the combat side adds.
export const VESPER_CRAFT: Readonly<Record<string, { node: VesperCraftNode; scale: number; engines: readonly (readonly [number, number])[] }>> = {
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
export const NACRE_CRAFT: Readonly<Record<Exclude<EnemyKind, 'fuel'>, { node: NacreCraftNode; scale: number }>> = {
  dart: { node: 'nacre_shard', scale: 1 }, needle: { node: 'nacre_shard', scale: 1.1 }, lancer: { node: 'nacre_veil', scale: 1.1 },
  weaver: { node: 'nacre_veil', scale: 1 }, diamond: { node: 'nacre_orrery', scale: 1 }, pulsar: { node: 'nacre_pulsar', scale: 1.1 }, turret: { node: 'nacre_spore', scale: 1 }, missile: { node: 'nacre_spore', scale: 1 },
  wraith: { node: 'nacre_veil', scale: 1 },
  skimmer: { node: 'nacre_shard', scale: 0.85 }, relic: { node: 'nacre_orrery', scale: 1.1 },
};

/**
 * The Umbral fleet (docs/28, tools/blender/umbra_craft.py): on Umbra every kind flies an Umbral model, and THE ECLIPSE's
 * drone waves use the drone (scaled to a pod's size). Plume colour is violet.
 */
export const UMBRA_CRAFT: Readonly<Record<Exclude<EnemyKind, 'fuel'>, { node: UmbraCraftNode; scale: number }>> = {
  dart: { node: 'umbra_interceptor', scale: 1 }, needle: { node: 'umbra_interceptor', scale: 0.9 }, weaver: { node: 'umbra_fighter', scale: 0.95 },
  lancer: { node: 'umbra_hunter', scale: 1.05 }, diamond: { node: 'umbra_carrier', scale: 1 }, pulsar: { node: 'umbra_artillery', scale: 1 },
  turret: { node: 'umbra_turret', scale: 1 }, missile: { node: 'umbra_turret', scale: 1 },
  wraith: { node: 'umbra_hunter', scale: 1 },
  skimmer: { node: 'umbra_interceptor', scale: 0.85 }, relic: { node: 'umbra_carrier', scale: 1.1 },
};
export const UMBRA_DRONE_SCALE = 1.45;
/** Corona's fleet (docs/37, tools/blender/corona_craft.py): the same roles as Umbra's, the Wraith its own crescent ship. */
export const CORONA_CRAFT: Readonly<Record<Exclude<EnemyKind, 'fuel'>, { node: CoronaCraftNode; scale: number }>> = {
  dart: { node: 'corona_interceptor', scale: 1 }, needle: { node: 'corona_interceptor', scale: 0.9 }, weaver: { node: 'corona_fighter', scale: 0.95 },
  lancer: { node: 'corona_hunter', scale: 1.05 }, diamond: { node: 'corona_carrier', scale: 1 }, pulsar: { node: 'corona_artillery', scale: 1 },
  turret: { node: 'corona_turret', scale: 1 }, missile: { node: 'corona_turret', scale: 1 },
  wraith: { node: 'corona_wraith', scale: 0.76 },
  skimmer: { node: 'corona_interceptor', scale: 0.85 }, relic: { node: 'corona_carrier', scale: 1.1 },
};
export const CORONA_DRONE_SCALE = 1.45;
/**
 * Nahara's fleet (docs/39, tools/blender/nahara_fleet.py), each kind on its model, sized to its role. Of these only the
 * dart, needle, weaver, pulsar, wraith, skimmer, relic and the batteries fly on Nahara; the rest have a model too.
 */
export const NAHARA_CRAFT: Readonly<Record<Exclude<EnemyKind, 'fuel'>, { node: NaharaCraftNode; scale: number }>> = {
  dart: { node: 'nahara_hunter', scale: 0.85 }, needle: { node: 'nahara_hunter', scale: 0.72 }, weaver: { node: 'nahara_hunter', scale: 1 },
  lancer: { node: 'nahara_obelisk', scale: 0.95 }, pulsar: { node: 'nahara_obelisk', scale: 1.1 }, diamond: { node: 'nahara_sunspike', scale: 0.9 },
  wraith: { node: 'nahara_sunspike', scale: 1.1 }, skimmer: { node: 'nahara_skimmer', scale: 1 }, relic: { node: 'nahara_relic', scale: 1.05 },
  turret: { node: 'nahara_battery', scale: 1.1 }, missile: { node: 'nahara_battery', scale: 1.1 },
};
export const NAHARA_DRONE_SCALE = 1.45;

/** Khepri craft node per kind (Vesper kinds borrow the nearest Khepri silhouette until their own models load). */
export const KHEPRI_NODE: Readonly<Record<Exclude<EnemyKind, 'fuel'>, KhepriCraftNode>> = {
  dart: 'khepri_dart', lancer: 'khepri_lancer', weaver: 'khepri_weaver', turret: 'khepri_turret', needle: 'khepri_dart', diamond: 'khepri_weaver', missile: 'khepri_turret', pulsar: 'khepri_weaver',
  wraith: 'khepri_lancer', skimmer: 'khepri_dart', relic: 'khepri_weaver',
};
/** Engine sockets (x, z) of the Khepri craft, from tools/blender/khepri_craft.py SOCKETS (glTF z toward the player). */
const KHEPRI_ENGINES: Readonly<Record<KhepriCraftNode, readonly (readonly [number, number])[]>> = {
  khepri_dart: [[-.45, -.43], [.45, -.43], [0, -.49]], khepri_lancer: [[-.17, -.51], [.17, -.51]],
  khepri_weaver: [[-.09, -.45], [.09, -.45]], khepri_turret: [],
};

/** Every enemy kind the renderer draws (Khepri and Vesper); ground kinds stand on terrain or float on the sea. */
const ENEMY_KINDS: readonly EnemyKind[] = ['dart', 'weaver', 'turret', 'lancer', 'needle', 'diamond', 'missile', 'fuel', 'pulsar', 'wraith', 'skimmer', 'relic'];
const GROUND_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['turret', 'missile', 'fuel']);
/** Loot props and ground wrecks (art/loot-props, Blender): the fuel skid target and what destroyed ground targets leave. */
const LOOT_NODES = ['loot_fuel', 'wreck_turret_0', 'wreck_turret_1', 'wreck_fuel', 'fx_missile'] as const;
/** At most this many wrecks stay on the ground at once (oldest go first). */
const WRECK_CAPACITY = 24;
/** Vesper faction kinds: always their own models once vesper-craft.glb is in, on any planet. */
export const VESPER_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['needle', 'diamond', 'missile']);
/** Code-built Khepri model each kind uses until (or unless) its Vesper model is available. */
const KHEPRI_STAND_IN: Readonly<Record<EnemyKind, 'dart' | 'weaver' | 'turret' | 'lancer'>> = {
  dart: 'dart', weaver: 'weaver', turret: 'turret', lancer: 'lancer', needle: 'dart', diamond: 'weaver', missile: 'turret', fuel: 'turret', pulsar: 'weaver',
  wraith: 'lancer', skimmer: 'dart', relic: 'weaver',
};
// The pontoon deck under a ground battery over open water: PONTOON_DECK (src/world/run-route.ts, shared with the
// simulation's ground seats).
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

/**
 * Where a craft's shadow lands (render-only, Low tier): the first ground the sun's ray through the craft's centre meets,
 * as the High shadow map finds it: a coarse march down the ray, then a bisection. Matches the High offset for any sun.
 */
export function blobLanding(sun: THREE.Vector3, x: number, s: number, height: number, ground: (x: number, s: number) => number) {
  const kx = -sun.x / Math.max(.05, sun.y), ks = sun.z / Math.max(.05, sun.y);
  // Along the ray a drop of d below the craft is at (x + kx·d, s + ks·d); it has landed once the ground reaches it.
  const at = (d: number) => ground(x + kx * d, s + ks * d) - (height - d);
  const reach = height - TERRAIN_MIN_HEIGHT + .5, steps = 6;
  let above = 0, below = reach, fa = at(0), fb = 0;
  if (fa >= 0) return { x, s, y: ground(x, s) };
  for (let i = 1; i <= steps; i++) { const d = reach * i / steps, f = at(d); if (f >= 0) { below = d; fb = f; break; } above = d; fa = f; }
  for (let i = 0; i < 3; i++) { const d = (above + below) / 2, f = at(d); if (f >= 0) { below = d; fb = f; } else { above = d; fa = f; } }
  // Final linear step between the bracketing samples (exact on a plane).
  const d = fb - fa > 1e-9 ? above + (below - above) * -fa / (fb - fa) : below;
  return { x: x + kx * d, s: s + ks * d, y: height - d };
}

/**
 * World matrices for drawing (performance, 31 October): what three.js's scene update does every frame (every local
 * matrix composed, every world matrix recomputed), minus subtrees that are hidden and so neither drawn nor cast. A hidden
 * object is brought up to date the frame it is shown again, before it draws.
 */
export function updateShown(object: THREE.Object3D, parentWorld: THREE.Matrix4 | null): void {
  if (!object.visible) return;
  if (object.matrixAutoUpdate) object.updateMatrix();
  if (parentWorld) object.matrixWorld.multiplyMatrices(parentWorld, object.matrix); else object.matrixWorld.copy(object.matrix);
  object.matrixWorldNeedsUpdate = false;
  if ((object as THREE.Camera).isCamera) (object as THREE.Camera).matrixWorldInverse.copy(object.matrixWorld).invert();
  const children = object.children;
  for (let i = 0; i < children.length; i++) updateShown(children[i], object.matrixWorld);
}

/**
 * QA evidence for the render-list cost (polish pass, 30 October): objects in the scene graph, those that would be visited
 * for drawing (visible chain), drawable meshes among them, and visible instanced batches with nothing to draw.
 */
function graphStats(scene: THREE.Scene, names?: Record<string, number>) {
  let objects = 0, visible = 0, drawables = 0, emptyBatches = 0, autoMatrix = 0, casters = 0;
  const walk = (object: THREE.Object3D) => {
    objects++; if (object.matrixAutoUpdate) autoMatrix++;
    if (!object.visible) { object.traverse(() => { objects++; }); objects--; return; }
    visible++;
    if ((object as THREE.Mesh).isMesh || (object as THREE.LineSegments).isLine || (object as THREE.Points).isPoints) {
      drawables++; if (object.castShadow) casters++;
      if (names) { const key = (object.name || `${object.parent?.name || object.parent?.type}/${object.type}/${(object as THREE.Mesh).geometry?.type}/${((object as THREE.Mesh).material as THREE.Material)?.type}`).replace(/[\d:]+$/, '#'); names[key] = (names[key] ?? 0) + 1; }
      if ((object as THREE.InstancedMesh).isInstancedMesh && (object as THREE.InstancedMesh).count === 0) emptyBatches++;
    }
    for (const child of object.children) walk(child);
  };
  walk(scene);
  return { objects, visible, drawables, emptyBatches, autoMatrix, casters, ...(names ? { names } : {}) };
}

/**
 * A drop's turn at time `t` (seconds): the angle about its upright axis and its light. It never stops turning (user, 7
 * November: "They should turn constantly just slower when face on"). Both faces carry the icon, so each half turn is one
 * move: slow while a face shows (about 30°/s), quick through the edge (about 210°/s), a sine ease per half turn. Easing
 * the whole turn instead looked like two quick flips and then a standstill (user: "they make two quick turns then stay
 * still"). Readable (within 45° of a face) about 70% of the time; a glint as each face swings past the light.
 */
const PICKUP_CYCLE = 3, PICKUP_EASE = .75;
export function pickupSpin(t: number): { angle: number; light: number } {
  const halves = ((t / PICKUP_CYCLE) % 1 + 1) % 1 * 2, f = halves % 1;
  const angle = Math.PI * (Math.floor(halves) + f - PICKUP_EASE * Math.sin(2 * Math.PI * f) / (2 * Math.PI));
  const turned = ((angle % Math.PI) + Math.PI) % Math.PI, glint = Math.exp(-(((turned - .35) / .14) ** 2));
  return { angle, light: .7 + .3 * Math.abs(Math.cos(angle)) + .6 * glint };
}

export function createRenderer(canvas: HTMLCanvasElement): GameRenderer {
  // The stencil marks the hero's pixels: the jump veil and a boss's death blasts never cover the ship (src/render/hero-stencil.ts).
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: true });
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
  // The renderer refreshes world matrices for what can be drawn only (updateShown): hidden subtrees (parked boss rigs,
  // culled terrain strips, facility variants) were recomposed every frame.
  scene.updateMatrixWorld = () => updateShown(scene, null);
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const qaStats = !!import.meta.env?.DEV || query.has('perf');
  // DEFAULT_CAMERA unless a look-dev switch asks for another: `?camera=ortho`, `?camera=perspective[&fov=15..30]` or
  // `?camera=rectified[&depth=60]`.
  const asked = query.get('camera'), cameraMode = asked === 'ortho' || asked === 'perspective' || asked === 'rectified' ? asked : DEFAULT_CAMERA;
  const perspective = cameraMode !== 'ortho';
  const lens = Number(query.get('fov')) || PERSPECTIVE_FOV, rectifiedDepth = Number(query.get('depth')) || 60.5;
  let viewportAspect = 9 / 16;
  const camera = cameraMode === 'perspective' ? new THREE.PerspectiveCamera(lens, 9 / 16, CAMERA_NEAR, 260)
    : cameraMode === 'rectified' ? new THREE.PerspectiveCamera(20, 9 / 16, 1, 260)
    : new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, TACTICAL_HEIGHT / 2, -TACTICAL_HEIGHT / 2, .1, 100);
  const follow = cameraMode === 'perspective' ? perspectiveFollow(lens) : 1;
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
    lift: new THREE.Color(.007, .0038, .0018), saturation: 1.0, contrast: 1.07, vignette: .24, haze: new THREE.Vector4(0, 0, 0, 0),
    fogColor: new THREE.Color(), fogHeight: new THREE.Vector3(), fogDistance: new THREE.Vector3() });
  const materials = createMaterials();
  /** Shadow-depth materials of the craft batches, one per source material (casterDepthOf). */
  const casterDepths = new Map<THREE.Material, THREE.MeshDepthMaterial>();
  const bastion = createBastionView(scene);
  const terrainMaterials = createTerrainMaterials();
  const groundMaterial = terrainMaterials.ground, kitMaterial = terrainMaterials.kit;
  const sharedMaterial = createSharedMaterial();
  // Prefiltered desert sky: craft metals and outpost machinery reflect warm light instead of reading flat black.
  const environment = createDesertEnvironment(renderer, SUN);
  scene.environment = environment.texture;
  materials.craft.envMap = materials.enemyCraft.envMap = environment.texture; sharedMaterial.envMap = environment.texture; terrainMaterials.setEnvironment(environment.texture);
  /**
   * The other worlds' skies, each made on first use (Khepri, Amnion and Corona reflect the desert one). One map, so
   * dispose frees every sky that was made (docs/38 V9: the ice sky used to be missed).
   */
  const SKIES = {
    ice: [createIceEnvironment, 'vesper'], luna: [createLunaEnvironment, 'luna'], mire: [createMireEnvironment, 'nacre'], void: [createVoidEnvironment, 'umbra'],
  } as const;
  const skies = new Map<keyof typeof SKIES, THREE.WebGLRenderTarget>();
  const skyOf = (kind: PlanetLook['environment']): THREE.WebGLRenderTarget => {
    if (kind === 'desert') return environment;
    let made = skies.get(kind);
    if (!made) {
      const [create, world] = SKIES[kind];
      made = create(renderer, sunDirection(LOOKS[world].sunElevation));
      skies.set(kind, made);
    }
    return made;
  };
  const water = createWater(), foam = createFoam(scene), coronaArcs = createCoronaArcs(scene), coronaHaze = createCoronaHaze(scene), motes = createAmbientMotes(scene);
  /** Nacre's water: its own material (src/render/mire-water.ts); the sea sheets wear it while the look is Nacre's. */
  const mireWater = createMireWater();
  let planet: PlanetId = 'khepri', terrainPlanet: PlanetId = 'khepri';
  /** Look-dev only: `?planet=` makes the terrain stream another planet; the look then follows the terrain's report. */
  const lookOverride = !!import.meta.env?.DEV && query.has('planet');
  /**
   * The planet look rig: lights, sun direction and shadow fit, sky reflections, material palettes, grade and haze,
   * background and blob shadows. It follows `state.planet` (the run's planet, which an endless jump switches at its
   * flash), so the switch happens under the flash and never mid-sector.
   */
  /** Bright ground (Vesper's snow) washes out the pale hero bolts: they gain a dark outline and a deeper cyan there. */
  let brightGround = false;
  /** Lights, grade and fog of a look: cheap, no material changes (the playground tunes these live). */
  const applyLight = (next: PlanetId, look: PlanetLook) => {
    scene.background = new THREE.Color(look.background);
    const behind = sunBehind(next);
    sun.copy(next === 'khepri' && !behind && look.sunElevation === KHEPRI_SUN_ELEVATION ? SUN : sunDirection(look.sunElevation, behind));
    bounceOffset.set(-sun.x, .32, -sun.z).normalize().multiplyScalar(30);
    sunlight.color.setHex(look.sun[0]); sunlight.intensity = look.sun[1]; sunlight.shadow.intensity = look.shadowIntensity;
    hemisphere.color.setHex(look.hemisphere[0]); hemisphere.groundColor.setHex(look.hemisphere[1]); hemisphere.intensity = look.hemisphere[2];
    bounce.color.setHex(look.bounce[0]); bounce.intensity = look.bounce[1];
    fitShadow();
    const settings = post.settings;
    settings.exposure.value = look.post.exposure; settings.strength.value = look.post.strength; settings.saturation.value = look.post.saturation;
    settings.contrast.value = look.post.contrast; settings.vignette.value = look.post.vignette; settings.lift.value.setRGB(...look.post.lift);
    settings.haze.value.set(...look.post.haze); post.setThreshold(look.post.threshold, look.post.knee);
    // World fog (`?fog=0` turns it off for look-dev comparisons).
    const fog = look.post.fog, fogOff = query.get('fog') === '0';
    settings.fogColor.value.setHex(fog.color).multiplyScalar(fog.energy);
    settings.fogHeight.value.set(fog.height[0], fog.height[1], fogOff ? 0 : fog.height[2]);
    settings.fogDistance.value.set(fog.distance[0], fog.distance[1], fogOff ? 0 : fog.distance[2]);
    renderer.toneMappingExposure = look.lowExposure;
    // Low-tier silhouettes keep the share of light the High shadow leaves (src/render/craft-shadows.ts).
    const shadowLight = { ...look, sunElevation: next === 'khepri' && look.sunElevation === KHEPRI_SUN_ELEVATION ? THREE.MathUtils.radToDeg(SUN_ELEVATION) : look.sunElevation };
    silhouetteShade(shadowLight, craftSilhouetteMaterial.color, SILHOUETTE_GROUND[next]);
    // Dark open water, where a High shadow takes only the faint diffuse share of the sea's light.
    silhouetteShade(shadowLight, seaShade, .1).lerp(WHITE, .5);
  };
  const applyLook = (next: PlanetId) => {
    brightGround = next === 'vesper';
    planet = next;
    const look = LOOKS[next];
    applyLight(next, look);
    shadowMaterial.color.setHex(look.blobShadow);
    const sky = skyOf(look.environment).texture;
    scene.environment = sky;
    materials.craft.envMap = sky; materials.craft.needsUpdate = true; materials.enemyCraft.envMap = sky; materials.enemyCraft.needsUpdate = true;
    materials.prop.envMap = sky; materials.prop.needsUpdate = true;
    // Enemies wear their world's paint (src/render/world-paint.ts): white with orange glow on the Moon, rust and orange on
    // Khepri, metallic white with blue glow on Vesper, dark green and purple with purple glow on Nacre. The hero keeps its own.
    setWorldPaint(materials.enemyCraft.userData.worldPaint as WorldPaintUniforms, next, 'craft');
    // The see-through silhouette of half-buried batteries follows the world's glow.
    silhouetteMaterial.color.copy(worldGlow(next)).lerp(new THREE.Color(1, 1, 1), 0.45);
    sharedMaterial.envMap = sky; sharedMaterial.needsUpdate = true;
    terrainMaterials.setEnvironment(sky); water.setEnvironment(sky); water.setPlanet(next); mireWater.setEnvironment(sky);
    terrainMaterials.setLook(next); (sharedMaterial.userData.setPlanet as ((planet: PlanetId) => void) | undefined)?.(next);
    if (next === 'vesper') { ensureCraft(next); ensureArk(); } else foam.clear();
    // (Amnion flies Nacre's organic craft as a stand-in until its own faction exists; THE CRADLE has its own model: docs/27.)
    if (next === 'nacre') { ensureNacreCraft(); ensureVeil(); void mireWater.prepare(); }
    if (next === 'amnion') { ensureNacreCraft(); ensurePredator(next); ensureCradle(); }
    if (next === 'umbra') { ensureUmbraCraft(); ensurePredator(next); ensureEclipse(); }
    // (Corona flies its own fleet, the Wraith included; THE ECLIPSE stands in for THE HELIOPHAGE until its own: docs/37.)
    if (next === 'corona') { ensureCoronaCraft(); ensureHeliophage(); }
    // (Nahara flies its own fleet, Corona's while it loads; THE ECLIPSE stands in for THE CITADEL until its own model: docs/39.)
    if (next === 'nahara') { ensureNaharaCraft(); ensureCoronaCraft(); ensureCitadel(); }
    if (next === 'luna') ensureWarden();
    warmed = false;
  };
  const terrain = createTerrainView({ scene, groundMaterial, kitMaterial, infraMaterial: terrainMaterials.infra,
    sharedMaterial, roadMaterial: terrainMaterials.roads, fallbackInfra: createFallbackInfra(materials), fallbackShared: createFallbackShared(),
    waterMaterial: water.material, mireMaterial: mireWater.material, onPlanet: next => { terrainPlanet = next; } });
  terrain.setShadowFrustum(sunlight.shadow.getFrustum());
  let disposed = false, warmed = false;
  const uploaded = new WeakSet<THREE.Texture>();
  /** Textures in the scene a mid-flight warm-up left for a hidden one (or the jump's warp) to upload. */
  let texturesPending = false;
  /** Uploads up to `limit` scene textures not uploaded yet; whether any are left. */
  const uploadPending = (limit: number) => {
    let left = limit, more = false;
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || more) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        for (const value of Object.values(material)) if (value instanceof THREE.Texture && !uploaded.has(value)) {
          if (left <= 0) { more = true; return; }
          renderer.initTexture(value); uploaded.add(value); left--;
        }
    });
    return more;
  };
  // The Blender kit streams in after start; fallback pieces render until (or unless) it arrives.
  const terrainLoad = loadKhepriKit(`${import.meta.env.BASE_URL}assets/khepri/khepri-kit.glb`).then(kit => {
    if (disposed) { kit.forEach(geometry => geometry.dispose()); return; }
    terrain.setKit(kit); warmed = false;
  }).catch(error => console.warn('Khepri kit unavailable; using fallback scenery.', error));
  // Modelled outposts replace the code-built stand-ins when khepri-infra.glb exists (docs/13 §3b).
  const infraLoad = loadKhepriInfra(`${import.meta.env.BASE_URL}assets/khepri/khepri-infra.glb`).then(infra => {
    if (disposed) { infra.forEach(geometry => geometry.dispose()); return; }
    terrain.setInfra(infra); warmed = false;
  }).catch(() => { /* Not shipped yet: the code-built outposts remain. */ });
  // The district kit (docs/23): the refinery's processing tower; a code-built stand-in until it loads.
  const districtLoad = loadDistrictKit(`${import.meta.env.BASE_URL}assets/khepri/district-kit.glb`).then(nodes => {
    if (disposed) { nodes.forEach(geometry => geometry.dispose()); return; }
    terrain.setInfra(nodes); warmed = false;
  }).catch(() => { /* The code-built tower remains. */ });
  // Shared pipes and tanks (docs/14), shaded from the Khepri palette; code-built stand-ins until they load.
  const sharedLoad = loadSharedKit(`${import.meta.env.BASE_URL}assets/shared/industrial-kit.glb`).then(shared => {
    if (disposed) { shared.forEach(geometry => geometry.dispose()); return; }
    terrain.setShared(shared); emplacementGeometry = shared; warmed = false;
  }).catch(() => { /* Not shipped: the code-built stand-ins remain. */ });
  // The production fortress (docs/15) replaces the functional stand-in; if it fails, the stand-in remains.
  const bastionLoad = loadBastionModel(`${import.meta.env.BASE_URL}assets/${BOSS_ASSETS.bastion}`).then(model => {
    if (disposed) return;
    bastion.setModel(model); warmed = false;
  }).catch(error => console.warn('Bastion-9 model unavailable; using the functional fortress.', error));
  // Detail maps are optional polish: any map that fails keeps its procedural stand-in.
  const texturesLoad = loadKhepriTextures(`${import.meta.env.BASE_URL}assets/khepri/textures/`, Math.min(2, renderer.capabilities.getMaxAnisotropy())).then(textures => {
    if (disposed) { Object.values(textures).forEach(texture => texture?.dispose()); return; }
    terrainMaterials.setTextures(textures); warmed = false;
  });
  // Every craft is one mesh with the shared craft material; enemies of a kind are one instanced draw.
  const hero = createHero(materials); hero.scale.setScalar(HERO_SCALE); scene.add(hero);
  /**
   * The hero writes HERO_STENCIL where it is drawn. The craft material is shared (pontoons), so the hero's own draw
   * switches the stencil write on and off around itself: render state only, never a different shader.
   */
  const markHero = (object: THREE.Object3D) => object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.onBeforeRender = (_r, _s, _c, _g, material) => {
      material.stencilWrite = true; material.stencilRef = HERO_STENCIL; material.stencilFunc = THREE.AlwaysStencilFunc; material.stencilZPass = THREE.ReplaceStencilOp;
    };
    child.onAfterRender = (_r, _s, _c, _g, material) => {
      material.stencilWrite = false; material.stencilRef = 0; material.stencilZPass = THREE.KeepStencilOp;
    };
  });
  markHero(hero);
  let heroModel = 'fallback';
  /**
   * A shadow-only copy of a model's meshes merged into one position-only mesh: it draws in the sun's shadow pass only
   * (the main pass culls it), so a many-part ship casts its shadow in one draw. Same silhouette, so the same shadow.
   */
  const casterMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  /** The hero's Low-tier silhouette (src/render/craft-shadows.ts), placed every frame from the hero's own matrix. */
  const heroSilhouette = new THREE.Mesh(new THREE.BufferGeometry(), createSilhouetteMaterial());
  heroSilhouette.matrixAutoUpdate = false; heroSilhouette.frustumCulled = false; heroSilhouette.visible = false; heroSilhouette.renderOrder = 1;
  heroSilhouette.name = 'hero silhouette';
  const seaShade = new THREE.Color(1, 1, 1);
  const flatProjection = new THREE.Matrix4(), flatten = new THREE.Matrix4(), NOWHERE = new THREE.Matrix4().makeScale(0, 0, 0);
  function shadowCaster(root: THREE.Object3D): THREE.Mesh | null {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert(), local = new THREE.Matrix4(), point = new THREE.Vector3(), positions: number[] = [];
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      local.multiplyMatrices(inverse, object.matrixWorld);
      const position = object.geometry.getAttribute('position'), index = object.geometry.index;
      const count = index ? index.count : position.count;
      for (let i = 0; i < count; i++) { point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(local); positions.push(point.x, point.y, point.z); }
    });
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const caster = new THREE.Mesh(geometry, casterMaterial); caster.name = 'hero shadow caster';
    caster.castShadow = true; caster.receiveShadow = false;
    const shadowFrustum = sunlight.shadow.getFrustum();
    caster.intersectsFrustum = frustum => frustum === shadowFrustum;
    return caster;
  }
  // The code-built stand-in's silhouette until the ship's model loads.
  heroSilhouette.geometry = shadowCaster(hero)?.geometry ?? heroSilhouette.geometry; scene.add(heroSilhouette);
  // The hero is the flight's ship as the player built it (docs/31): its chassis's parts, repainted (src/render/hero-craft.ts). Endless
  // and the menus fly the default Scrapper; campaign visual unlocks never reach endless (AGENTS.md invariant 14).
  // `heroShown` is the look on screen; while the requested look (`heroKey`) is loading the hero stays hidden, so a launch
  // never flashes the previous ship (user, 28 October: "the base ship is briefly visible" under the warp).
  let heroKey = '', heroShown = '', heroEngines: [number, number][] = [[-.38, .7], [.38, .7]], heroGlow = 0x7ff6ea;
  // Endless shows the campaign's equipped chassis and look as cosmetics (docs/33 § 2; src/content/hero-parts.ts).
  const heroOf = shownHero;
  const showHero = (ship: ShipId, look: HeroLook): Promise<void> => {
    const key = heroLookKey(ship, look);
    if (key === heroKey) return heroPending;
    heroKey = key;
    heroGlow = look.paint?.glow ?? HERO_DEFAULT_PAINT[ship].glow;
    heroPending = loadHeroModel(ship, look).then(model => {
      if (!model) return;
      if (disposed || key !== heroKey) { model.dispose(); return; }
      heroDispose(); hero.clear();
      model.object.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = true; } });
      // One merged shadow-only caster for the whole ship (performance, 31 October: each part cast its own shadow draw).
      const caster = shadowCaster(model.object);
      if (caster) { model.object.add(caster); heroSilhouette.geometry = caster.geometry; }
      hero.add(model.object); markHero(model.object); heroModel = 'glb'; warmed = false;
      heroDispose = () => { model.dispose(); caster?.geometry.dispose(); };
      if (model.engines.length) heroEngines = model.engines;
      heroShown = key;
    }).catch(error => { if (key === heroKey) heroShown = key; console.warn('Hero model unavailable; retaining the current ship.', error); });
    return heroPending;
  };
  let heroPending: Promise<void> = Promise.resolve();
  /** Frees what the hero on screen owns (the stand-in's geometry; a loaded look's own materials, never shared files). */
  let heroDispose = () => hero.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  const heroLoad = showHero('scrapper', DEFAULT_LOOK);
  /**
   * The hangar's ship picture (docs/31): a ship's look drawn by this renderer into a target once per look, as one still
   * (user, 29 October: the turning preview "lags as fuck ... make the image bigger, maybe not needed to turn"; it drew 36
   * views, each read back from the GPU). Menus never open a second WebGL context on phones.
   */
  async function heroPreview(ship: ShipId, look: HeroLook, width: number, height: number): Promise<HTMLCanvasElement | null> {
    const model = await loadHeroModel(ship, look);
    if (!model || disposed) { model?.dispose(); return null; }
    const stage = new THREE.Scene(), mesh = new THREE.Group().add(model.object);
    stage.environment = scene.environment;
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-3, 5, 3);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.3); rim.position.set(3, 2, -4);
    stage.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2622, 1.1), key, rim, mesh);
    // A high three-quarter view of the nose: the ship banks slightly toward the light.
    mesh.rotation.set(0, Math.PI * .78, 0);
    const view = new THREE.PerspectiveCamera(22, width / height, .1, 40), radius = model.radius;
    // The bounding sphere overstates a flat ship's size: frame a little inside it.
    const fit = radius / Math.sin(THREE.MathUtils.degToRad(view.fov / 2)) * .66;
    view.position.set(0, fit * .62, fit * .79); view.lookAt(0, -radius * .05, 0);
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const still = document.createElement('canvas'); still.width = width; still.height = height;
    const context = still.getContext('2d'), image = context?.createImageData(width, height), pixels = new Uint8Array(width * height * 4);
    const previous = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(stage, view);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(previous); renderer.setClearColor(clear, alpha);
    // WebGL rows run bottom-up: flip into the canvas.
    if (context && image) {
      for (let row = 0; row < height; row++) image.data.set(pixels.subarray((height - 1 - row) * width * 4, (height - row) * width * 4), row * width * 4);
      context.putImageData(image, 0, 0);
    }
    target.dispose(); model.dispose();
    return still;
  }
  const facilities = createFacilityView(scene, () => { warmed = false; });
  // Strike sites (docs/33): site models around their core targets (src/render/site-view.ts). A destroyed site's sequence
  // burns in the effects layers, anchored to the ground where it stood (fx-particles.ts `siteBlast`, emitted in fx.update).
  const sites = createSiteView(scene, () => { warmed = false; }, blast => fx.siteBlast(blast));
  const ENEMY_CAPACITY = 32;
  /** Low tier: each craft batch's flattened silhouette along the sun (src/render/craft-shadows.ts), one draw per batch. */
  const craftSilhouetteMaterial = createSilhouetteMaterial();
  const silhouettes = new Map<THREE.InstancedMesh, THREE.InstancedMesh>();
  const withSilhouette = (mesh: THREE.InstancedMesh) => {
    const flat = new THREE.InstancedMesh(mesh.geometry, craftSilhouetteMaterial, ENEMY_CAPACITY);
    dynamicBatch(flat); flat.visible = false;
    flat.renderOrder = 1; flat.name = `${mesh.name} silhouette`; scene.add(flat); silhouettes.set(mesh, flat);
  };
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
    const mesh = new THREE.InstancedMesh(geometry, kind === 'fuel' ? materials.prop : materials.enemyCraft, ENEMY_CAPACITY);
    dynamicBatch(mesh); mesh.name = `Khepri ${kind} craft`;
    // Every craft casts into the High shadow map and takes shadows, like the hero (polish pass, 30 October: the
    // flying craft's blob shadows read "whack" beside the hero's real one); Low draws sun-placed blobs for all.
    mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = casterDepthOf(mesh.material as THREE.Material);
    let ghost: THREE.InstancedMesh | undefined;
    // The see-through silhouette marks hidden threats; harmless fuel skids go without (their buried half read as wood).
    if (GROUND_KINDS.has(kind) && kind !== 'fuel') {
      mesh.renderOrder = 2;
      ghost = new THREE.InstancedMesh(geometry, silhouetteMaterial, ENEMY_CAPACITY);
      ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
    }
    for (let i = 0; i < ENEMY_CAPACITY; i++) mesh.setColorAt(i, WHITE);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh); enemyBatches.set(kind, { mesh, ghost }); withSilhouette(mesh);
  }
  /**
   * Khepri craft (khepri-craft.glb, Blender): replaces the code-built stand-ins in the Khepri batches once loaded. The
   * batches use the shared enemy material, so Luna's steel-blue repaint applies to these models too.
   */
  let khepriEngines: ReadonlyMap<EnemyKind, readonly (readonly [number, number])[]> | null = null;
  const khepriLoad = loadKhepriCraft(`${import.meta.env.BASE_URL}assets/khepri/khepri-craft.glb`).then(nodes => {
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
  /** Seeker Rack missiles (fx_missile), yawed along their flight; the plain shot stands in until the model loads. */
  let missiles: THREE.InstancedMesh | null = null;
  const lootLoad = loadCraftNodes(`${import.meta.env.BASE_URL}assets/shared/loot-props.glb`, LOOT_NODES).then(nodes => {
    if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
    const fuel = nodes.get('loot_fuel'), batch = enemyBatches.get('fuel');
    if (fuel && batch) { batch.mesh.geometry = fuel.geometry; if (batch.ghost) batch.ghost.geometry = fuel.geometry; }
    for (const name of ['wreck_turret_0', 'wreck_turret_1', 'wreck_fuel'] as const) {
      const craft = nodes.get(name);
      if (!craft) continue;
      const mesh = new THREE.InstancedMesh(craft.geometry, materials.prop, WRECK_CAPACITY);
      dynamicBatch(mesh); mesh.name = `Wreck ${name}`;
      mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = casterDepthOf(mesh.material as THREE.Material);
      for (let i = 0; i < WRECK_CAPACITY; i++) mesh.setColorAt(i, WHITE);
      scene.add(mesh); wreckBatches.set(name, mesh);
    }
    const missile = nodes.get('fx_missile');
    if (missile) {
      missiles = new THREE.InstancedMesh(missile.geometry, materials.prop, 32);
      dynamicBatch(missiles); missiles.renderOrder = 10; missiles.name = 'Seeker Rack missiles';
      for (let i = 0; i < 32; i++) missiles.setColorAt(i, WHITE);
      scene.add(missiles);
    }
    warmed = false;
  }).catch(error => console.warn('Loot props unavailable (loot-props.glb); fuel skids use a stand-in and kills leave no wrecks.', error));
  /**
   * Ground wrecks (render-only): a ground target that vanishes on screen with the simulation's kill explosion at its
   * position leaves a wreck on the terrain at that world spot; it scrolls away with the ground. Targets cleared by a
   * boss's arrival or a jump leave nothing (no explosion there).
   */
  const wrecks: { node: 'wreck_turret_0' | 'wreck_turret_1' | 'wreck_fuel'; x: number; worldS: number; yaw: number; y: number }[] = [];
  /**
   * Battery emplacements (render-only; user, 17 October 2026: buildings near the turrets). The first time a ground
   * battery stands on Khepri or Vesper ground, a few shared-kit pieces are laid out around it, anchored to the ground
   * like the wrecks: a facility hall behind it, or tanks and freight. They stay after the battery falls.
   */
  type EmplacementNode = 'facility' | 'container_0' | 'container_1' | 'tank_horizontal' | 'tank_vertical_1' | 'tank_sphere';
  const EMPLACEMENT_LAYOUTS: readonly (readonly [EmplacementNode, number, number, number])[][] = [
    [['facility', 0, 2.5, 0], ['container_0', 1.5, 0.2, Math.PI / 2]],
    [['tank_vertical_1', 1.3, 0.9, 0], ['tank_horizontal', -0.2, 1.7, 0], ['container_1', -1.4, 0.3, 0.3]],
    [['tank_sphere', 0, 1.8, 0], ['container_0', -1.4, 0.6, Math.PI / 2], ['container_1', 1.4, 0.4, 0]],
    [['facility', 0, 2.5, 0]],
  ];
  const EMPLACEMENT_RADIUS: Readonly<Record<EmplacementNode, number>> = { facility: 1.55, container_0: .65, container_1: .65, tank_horizontal: 1.05, tank_vertical_1: .6, tank_sphere: .65 };
  const emplacements: { node: EmplacementNode; x: number; worldS: number; y: number; yaw: number }[] = [], emplaced = new Set<number>();
  const emplacementBatches = new Map<EmplacementNode, THREE.InstancedMesh>();
  let emplacementGeometry: ReadonlyMap<string, THREE.BufferGeometry> = createFallbackShared();
  const emplacementMesh = (node: EmplacementNode) => {
    const geometry = emplacementGeometry.get(node);
    if (!geometry) return null;
    let mesh = emplacementBatches.get(node);
    if (!mesh || mesh.geometry !== geometry) {
      if (mesh) { scene.remove(mesh); mesh.dispose(); }
      mesh = new THREE.InstancedMesh(geometry, sharedMaterial, 48);
      dynamicBatch(mesh); mesh.name = `Emplacement ${node}`;
      mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = casterDepthOf(mesh.material as THREE.Material);
      for (let i = 0; i < 48; i++) mesh.setColorAt(i, WHITE);
      scene.add(mesh); emplacementBatches.set(node, mesh);
    }
    return mesh;
  };
  /** A ground target last frame: logical (x, s) for matching its kill explosion; drawn ground spot for the wreck. */
  type GroundSeen = { kind: EnemyKind; x: number; s: number; afloat: boolean; groundX: number; /** World s. */ groundS: number; base: number; late?: boolean };
  /**
   * Ground batteries that deploy in view (render only; user, 31 October: infrastructure "pop ins ... especially late in
   * levels"). A ground cue the director could not lead in from beyond the top edge (src/sim/game.ts leadGround: late in a
   * level it runs behind its schedule, or its admission came late in the lead window) spawns at or just past its entry,
   * at the top edge: its gun rises out of the ground over DEPLOY seconds instead of appearing in one frame, and its plant
   * keeps only the modules behind it, which scroll in already standing (facility-view.ts `late`; user, 3 November: "keeping
   * the turrets with the rise ... just make sure other ground stuff is loaded already"). A battery first seen beyond
   * DEPLOY_ROW never sinks. Leading the late ones in as well moved late-level timing enough to make Final Horizon or Deep
   * Bloom 20-60% harder for the test pilot (measured 31 October and 3 November), so this stays visual.
   */
  const deploying = new Map<number, number>(), groundKnown = new Set<number>();
  const DEPLOY = 1, DEPLOY_DEPTH = 2.2, DEPLOY_ROW = 25.5, DEPLOY_FRESH = .3;
  const groundSeen = new Map<number, GroundSeen>();
  let wreckRun: RunState['config'] | null = null, wreckTick = -1;
  /** Vent-stack tops near the view, for steam (terrain view's live features). */
  const collectVents = (cameraX: number) => terrain.features.vents.filter(vent => Math.abs(vent.x - cameraX) < VIEW.width / 2 + 1);
  /** Vesper craft batches (same kinds, Vesper models), created once vesper-craft.glb has loaded. */
  const enemyHp = new Map<number, number>(), enemyHitAt = new Map<number, number>(), hitColor = new THREE.Color();
  let hitTick = 0;
  /** Nacre craft batches by node, created once nacre-craft.glb has loaded (Nacre runs only). */
  type FactionBatch = { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh; engines: [number, number][]; plume: number };
  /** One instanced batch per faction node (a ground node also gets its see-through silhouette), on the enemy material. */
  function factionBatches<N extends string>(nodes: Map<N, NacreCraft>, label: string, groundNode: N | null, plume: (name: N) => number, material = materials.enemyCraft): Map<N, FactionBatch> {
    const batches = new Map<N, FactionBatch>();
    for (const [name, craft] of nodes) {
      const ground = name === groundNode;
      const mesh = new THREE.InstancedMesh(craft.geometry, material, ENEMY_CAPACITY);
      dynamicBatch(mesh); mesh.name = `${label} ${name}`;
      mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = casterDepthOf(mesh.material as THREE.Material);
      for (let i = 0; i < ENEMY_CAPACITY; i++) mesh.setColorAt(i, WHITE);
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      let ghost: THREE.InstancedMesh | undefined;
      if (ground) {
        mesh.renderOrder = 2;
        ghost = new THREE.InstancedMesh(craft.geometry, silhouetteMaterial, ENEMY_CAPACITY);
        ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
      }
      scene.add(mesh); batches.set(name, { mesh, ghost, engines: craft.engines, plume: plume(name) }); withSilhouette(mesh);
    }
    return batches;
  }
  const predatorBatches = new Map<string, FactionBatch>(), predatorLoads = new Map<PlanetId, Promise<void>>();
  function ensurePredator(next: PlanetId): Promise<void> | undefined {
    if (next !== 'amnion' && next !== 'umbra') return undefined;
    if (predatorLoads.has(next)) return predatorLoads.get(next);
    const name = next === 'amnion' ? 'amnion_brood_heavy' : 'umbra_wraith';
    const file = next === 'amnion' ? 'brood-heavy-v1.glb' : 'wraith-v2.glb';
    const loading = loadCraftNodes(`${import.meta.env.BASE_URL}assets/${next}/${file}`, [name]).then(nodes => {
      if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
      for (const [key, batch] of factionBatches(nodes, 'Predator', null, () => 0x8a6cff, materials.alienCraft)) predatorBatches.set(key, batch);
      warmed = false;
    }).catch(error => console.warn(`${name} unavailable; using faction fallback.`, error));
    predatorLoads.set(next, loading); return loading;
  }
  /** The Umbral fleet's batches, created once umbra-craft.glb has loaded (Umbra runs only). */
  let umbraBatches: Map<UmbraCraftNode, FactionBatch> | null = null, umbraLoad: Promise<void> | undefined;
  function ensureUmbraCraft() {
    return umbraLoad ??= loadUmbraCraft(`${import.meta.env.BASE_URL}assets/umbra/umbra-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
      umbraBatches = factionBatches(nodes, 'Umbra', 'umbra_turret', () => 0x8a6cff); warmed = false;
    }).catch(error => console.warn('Umbral fleet unavailable (umbra-craft.glb); using Khepri and Vesper models.', error));
  }
  /** Corona's fleet (corona-craft.glb, docs/37), the Wraith among it. */
  let coronaBatches: Map<CoronaCraftNode, FactionBatch> | null = null, coronaLoad: Promise<void> | undefined;
  function ensureCoronaCraft() {
    return coronaLoad ??= loadCoronaCraft(`${import.meta.env.BASE_URL}assets/corona/corona-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
      coronaBatches = factionBatches(nodes, 'Corona', 'corona_turret', () => 0xffb040); warmed = false;
    }).catch(error => console.warn('Corona fleet unavailable (corona-craft.glb); using Khepri and Vesper models.', error));
  }
  let naharaBatches: Map<NaharaCraftNode, FactionBatch> | null = null, naharaLoad: Promise<void> | undefined;
  function ensureNaharaCraft() {
    return naharaLoad ??= loadNaharaCraft(`${import.meta.env.BASE_URL}assets/nahara/nahara-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
      naharaBatches = factionBatches(nodes, 'Nahara', 'nahara_battery', () => 0x43d8c8); warmed = false;
    }).catch(error => console.warn('Nahara fleet unavailable (nahara-craft.glb); using Corona\'s.', error));
  }
  let nacreBatches: Map<NacreCraftNode, FactionBatch> | null = null, nacreRequested = false;
  let nacreLoad: Promise<void> | undefined;
  function ensureNacreCraft() {
    if (nacreRequested) return nacreLoad!;
    nacreRequested = true;
    return nacreLoad = loadNacreCraft(`${import.meta.env.BASE_URL}assets/nacre/nacre-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(craft => craft.geometry.dispose()); return; }
      // The Shard's engines glow amber like its seams (art/nacre-craft); the others burn teal.
      nacreBatches = factionBatches(nodes, 'Nacre', 'nacre_spore', name => name === 'nacre_shard' ? 0xffa040 : 0x46f0dc); warmed = false;
    }).catch(error => console.warn('Nacre craft unavailable (nacre-craft.glb); using Khepri and Vesper models.', error));
  }
  let vesperBatches: Map<EnemyKind, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }> | null = null, craftRequested = false;
  let craftLoad: Promise<void> | undefined;
  function ensureCraft(next: PlanetId | 'kinds') {
    if (next === 'khepri' || next === 'luna') return Promise.resolve();
    if (craftRequested) return craftLoad!;
    craftRequested = true;
    return craftLoad = loadVesperCraft(`${import.meta.env.BASE_URL}assets/vesper/vesper-craft.glb`).then(nodes => {
      if (disposed) { nodes.forEach(geometry => geometry.dispose()); return; }
      const batches = new Map<EnemyKind, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }>();
      for (const kind of ENEMY_KINDS) {
        // Kinds without a Vesper model (the fuel skid) keep their own batch.
        const craft = VESPER_CRAFT[kind as keyof typeof VESPER_CRAFT] as typeof VESPER_CRAFT[keyof typeof VESPER_CRAFT] | undefined;
        const geometry = craft && nodes.get(craft.node);
        if (!geometry) continue;
        const mesh = new THREE.InstancedMesh(geometry, materials.enemyCraft, ENEMY_CAPACITY);
        dynamicBatch(mesh); mesh.name = `Vesper ${kind} craft`;
        mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = casterDepthOf(mesh.material as THREE.Material);
        let ghost: THREE.InstancedMesh | undefined;
        if (GROUND_KINDS.has(kind)) {
          mesh.renderOrder = 2;
          ghost = new THREE.InstancedMesh(geometry, silhouetteMaterial, ENEMY_CAPACITY);
          ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
        }
        for (let i = 0; i < ENEMY_CAPACITY; i++) mesh.setColorAt(i, WHITE);
        mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh); batches.set(kind, { mesh, ghost }); withSilhouette(mesh);
      }
      vesperBatches = batches; warmed = false;
    }).catch(error => console.warn(`Vesper craft unavailable (${VESPER_CRAFT_NODES.join(', ')}); using Khepri models.`, error));
  }
  // On slopes a foundation plinth reaches down to the lowest ground under the turret footprint.
  const plinthGeometry = new THREE.CylinderGeometry(.6, .66, 1, 6); plinthGeometry.translate(0, .5, 0);
  const plinths = new THREE.InstancedMesh(plinthGeometry, materials.dark, 32);
  dynamicBatch(plinths); plinths.receiveShadow = true; scene.add(plinths);
  // Over open water a ground battery rides a small black-ceramic pontoon instead (render-only, one draw).
  const pontoons = new THREE.InstancedMesh(createPontoonGeometry(), materials.craft, 32);
  dynamicBatch(pontoons); pontoons.receiveShadow = true; pontoons.name = 'battery pontoons';
  // Corona (docs/37): a battery over the plasma rides a black basalt raft, not Vesper's white pontoon, and leaves no foam.
  const basaltRaft = new THREE.MeshStandardMaterial({ color: 0x24201d, roughness: .85, metalness: .15 });
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
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 192);
  // Soft lane and column fills under the dashed edges: a light veil that reads on snow and on water alike.
  const laneFills = new THREE.InstancedMesh(stripGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .26,
    depthTest: false, depthWrite: false }), 64);
  /*
   * Aim rays (user, 27 October: the fade "looks staggered and the end of the indicators has a weird dark blocky
   * background"): one quad per ray whose vertex alpha fades smoothly from the muzzle toward the target and softly toward
   * its edges. The fade is in opacity, never in colour: a colour fade darkened bright ground into grey blocks.
   */
  const rayGeometry = new THREE.PlaneGeometry(1, 1, 4, 8); rayGeometry.rotateX(-Math.PI / 2);
  const rayPosition = rayGeometry.getAttribute('position'), rayAlpha = new Float32Array(rayPosition.count * 4);
  for (let i = 0; i < rayPosition.count; i++) {
    // The strip's local +z end is its target (x2, s2), −z its muzzle; x runs across it.
    const along = rayPosition.getZ(i) + .5, across = Math.abs(rayPosition.getX(i)) * 2;
    rayAlpha.set([1, 1, 1, (.1 + .9 * Math.pow(1 - along, 1.3)) * (1 - across * across)], i * 4);
  }
  rayGeometry.setAttribute('color', new THREE.BufferAttribute(rayAlpha, 4));
  const rayFills = new THREE.InstancedMesh(rayGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .3, vertexColors: true,
    depthTest: false, depthWrite: false }), 64);
  const rayCores = new THREE.InstancedMesh(rayGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, vertexColors: true,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 64);
  // The hero's contrail (user, 8 November: "a trail would be cool on my ship or just bigger jet"): additive, in its glow.
  // Feather each side of the trail into the world, with a bright filament down the middle.
  const trailGeometry = new THREE.PlaneGeometry(1, 1, 4, 1);
  const trailPositions = trailGeometry.getAttribute('position'), trailColors = new Float32Array(trailPositions.count * 4);
  for (let i = 0; i < trailPositions.count; i++) {
    const across = 1 - Math.abs(2 * trailPositions.getX(i));
    trailColors.set([1, 1, 1, across * across], i * 4);
  }
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 4)); trailGeometry.rotateX(-Math.PI / 2);
  const heroTrails = new THREE.InstancedMesh(trailGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8,
    vertexColors: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), HERO_TRAIL_STRIPS);
  const lanes = [telegraphs, flashLanes, laneFills, rayFills, rayCores, heroTrails], laneCounts = new Map<THREE.InstancedMesh, number>();
  for (const mesh of lanes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 9; scene.add(mesh);
  }
  // The Helion Ark (docs/17 §5) rides on the sea; its model loads on first use, Bastion-9 stays untouched.
  const ark = createArkView(scene);
  const warden = createWardenView(scene);
  const veil = createVeilView(scene);
  const cradle = createVeilView(scene, CRADLE_STYLE);
  const eclipse = createVeilView(scene, ECLIPSE_STYLE), heliophage = createVeilView(scene, HELIOPHAGE_STYLE), citadel = createVeilView(scene, CITADEL_STYLE);
  /**
   * The hovering bosses (veil-view.ts) and the ground each one's seat rests on: THE VEIL the world's sea (no `ground`: the
   * mire's level), the others their plateau raised by their hover.
   */
  // The camera shake's state (cosmetic, render only): trauma, the clock, the last hit, lives and effect seen.
  let shakeTrauma = 0, shakeTime = -1, shakeHit = -Infinity, shakeLives = 0, shakeEffect = -1;
  // THE CITADEL's standing state: the arena (by its start) whose temple has fallen, and the run clock last seen.
  let citadelFallen: number | null = null, citadelSeen = -Infinity;
  const HOVERING_BOSSES = [
    { view: veil, id: 'veil', ground: undefined, style: VEIL_STYLE },
    { view: cradle, id: 'cradle', ground: AMNION_PLATEAU + CRADLE_STYLE.hover, style: CRADLE_STYLE },
    { view: eclipse, id: 'eclipse', ground: UMBRA_PLATEAU + ECLIPSE_STYLE.hover, style: ECLIPSE_STYLE },
    { view: heliophage, id: 'heliophage', ground: UMBRA_PLATEAU + HELIOPHAGE_STYLE.hover, style: HELIOPHAGE_STYLE },
    // THE CITADEL stands on Nahara's arena plateau (the same level as Umbra's).
    { view: citadel, id: 'citadel', ground: UMBRA_PLATEAU + CITADEL_STYLE.hover, style: CITADEL_STYLE },
  ] as const;
  /**
   * A boss's production model, loaded once (docs/38 R3): applied unless the renderer is gone, then the next frame warms
   * again; on failure the code-built stand-in (the Ark: its functional carrier) keeps rendering.
   */
  const lazyAsset = <T,>(load: () => Promise<T>, apply: (model: T) => void, unavailable: string) => {
    let once: Promise<void> | undefined;
    return () => once ??= load().then(model => { if (!disposed) { apply(model); warmed = false; } }).catch(error => console.warn(unavailable, error));
  };
  const bossAsset = (id: keyof typeof BOSS_ASSETS) => `${import.meta.env.BASE_URL}assets/${BOSS_ASSETS[id]}`;
  /** WARDEN-1 loads with Luna, THE VEIL with Nacre, THE CRADLE with Amnion, THE HELIOPHAGE with Corona, THE ECLIPSE with Umbra. */
  const ensureWarden = lazyAsset(() => loadWardenModel(bossAsset('warden')), model => warden.setModel(model), 'WARDEN-1 model unavailable; using the code-built stand-in.');
  const ensureVeil = lazyAsset(() => loadVeilModel(bossAsset('veil')), model => veil.setModel(model), 'THE VEIL model unavailable; using the code-built stand-in.');
  const ensureCradle = lazyAsset(() => loadVeilModel(bossAsset('cradle')), model => cradle.setModel(model), 'THE CRADLE model unavailable; using the code-built stand-in.');
  const ensureEclipse = lazyAsset(() => loadVeilModel(bossAsset('eclipse')), model => eclipse.setModel(model), 'THE ECLIPSE model unavailable; using the code-built stand-in.');
  const ensureHeliophage = lazyAsset(() => loadVeilModel(bossAsset('heliophage')), model => heliophage.setModel(model), 'THE HELIOPHAGE model unavailable; using the code-built stand-in.');
  const ensureCitadel = lazyAsset(() => loadVeilModel(bossAsset('citadel')), model => citadel.setModel(model), 'THE CITADEL model unavailable; using the code-built stand-in.');
  const ensureArk = lazyAsset(() => loadArkModel(bossAsset('ark')), model => ark.setModel(model), 'Helion Ark model unavailable; using the functional carrier.');
  /*
   * Endless planet cycle (docs/18 §4): the next planet's render assets load during the boss sector, never mid-jump,
   * and stay cached. Khepri's load at start; Vesper's are its craft, the Helion Ark and its prefiltered sky.
   */
  const prepared = new Set<PlanetId>();
  const preloads = new Map<PlanetId, Promise<void>>();
  const facilityPrefetches = new Map<PlanetId, Promise<void>>();
  const preload = (next: PlanetId): Promise<void> => {
    // Pin the next world's facility kit: the current-world update must not evict a prefetch.
    const facilityLoad = facilities.prepare(next);
    if (preloads.has(next) && facilityPrefetches.get(next) === facilityLoad) return preloads.get(next)!;
    facilityPrefetches.set(next, facilityLoad);
    const bossLoad = next === 'vesper' ? ensureArk() : next === 'nacre' ? ensureVeil() : next === 'amnion' ? ensureCradle() : next === 'umbra' ? ensureEclipse() : next === 'nahara' ? ensureCitadel() : next === 'corona' ? ensureHeliophage() : next === 'luna' ? ensureWarden() : bastionLoad;
    if (next === 'vesper' && !skies.has('ice')) { skyOf('ice'); warmed = false; }
    const loading = Promise.all([terrainLoad, infraLoad, districtLoad, sharedLoad, texturesLoad, heroLoad, khepriLoad, lootLoad,
      terrain.prepare(next), facilityLoad, sites.prepare(next), bossLoad, ensureCraft(next), ensurePredator(next), next === 'nacre' || next === 'amnion' ? ensureNacreCraft() : next === 'umbra' ? ensureUmbraCraft() : next === 'corona' ? ensureCoronaCraft() : next === 'nahara' ? ensureNaharaCraft() : undefined,
      // Nacre's water detail, built in slices off the frame (src/render/mire-water.ts).
      next === 'nacre' ? mireWater.prepare() : undefined]).then(() => { prepared.add(next); });
    preloads.set(next, loading); return loading;
  };
  // A jump also waits for its terrain swap (both versions of the sections it changes, built ahead; docs/18, 31 October).
  const planetReady = (next: PlanetId) => prepared.has(next) && facilities.isReady(next) && terrain.swapReady();
  const jumpFx = createJumpFx(scene);
  /**
   * Ground batteries' rounds as drawn (src/render/shot-launch.ts): each battery's forecast muzzle and drawn spot while it
   * winds up, and the launch of each round it released.
   */
  const batteryWindups = new Map<number, { muzzle: { x: number; s: number }; x: number; s: number }>();
  const launches = new Map<number, Launch>(), seenShots = new Set<number>(), liveShots = new Set<number>();
  let launchTick = -1;
  const beamLight = createBeamLight(scene), phaseHoles = createPhaseHoles(scene);
  const footprint: ViewFootprint = { minX: 0, maxX: 0, minS: 0, maxS: 0 };
  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  /** Reduced motion turns the jump into a plain fade (OS setting; `?motion=reduce` for look-dev). */
  const reducedMotion = () => query.get('motion') === 'reduce' || !!motionQuery?.matches;
  let jumpActive = false, lastRenderTime = 0, warmedJump = -1, hiddenWarm = false;
  const knownPrograms = new WeakSet<object>();
  // Development builds only: the scene and camera for look-dev probes (where things first appear on screen, pop-in checks).
  if (import.meta.env.DEV) Object.assign(window, { __probeScene: scene, __probeCamera: camera });
  /**
   * Each craft material's own shadow-depth material (performance, 31 October). three.js shares one depth material across
   * casters and only copies each one's texture onto it, without choosing a new program for it, so which variant compiled
   * depended on the draw order: the launch warm-up compiled the dart batch's without its texture and the first dart then
   * compiled the real one mid-flight (480 ms). A depth material per source material always carries the same texture.
   */
  function casterDepthOf(material: THREE.Material): THREE.MeshDepthMaterial {
    let depth = casterDepths.get(material);
    if (!depth) { depth = new THREE.MeshDepthMaterial(); casterDepths.set(material, depth); }
    return depth;
  }
  /**
   * The shadow-depth material of instanced casters without their own (mobile performance pass, 3 November). three.js's
   * one shared depth material changed its program (instancing on, off) wherever a batch (foundations, floes, the Bastion's
   * track links) was drawn between single meshes (the hero's caster, a site's parts): two program lookups and full uniform
   * refreshes every frame. A plain depth material like three.js's own (it shares its programs and copies the same state
   * from each caster), so the shadow map is unchanged. Casters three.js gives a variant of their own (alpha-tested,
   * displaced, clipped) keep it.
   */
  const instancedDepth = new THREE.MeshDepthMaterial();
  const sharesDefaultDepth = (material: THREE.Material | THREE.Material[]) => {
    if (Array.isArray(material)) return false;
    const m = material as THREE.MeshStandardMaterial;
    return !(m.clippingPlanes?.length || (m.displacementMap && m.displacementScale !== 0) || (m.alphaMap && m.alphaTest > 0) || (m.map && m.alphaTest > 0) || m.alphaToCoverage);
  };
  const separateInstancedCasters = (root: THREE.Object3D) => root.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh && mesh.castShadow && !mesh.customDepthMaterial && sharesDefaultDepth(mesh.material)) mesh.customDepthMaterial = instancedDepth;
  });
  const transform = new THREE.Object3D(), color = new THREE.Color();
  /** Per-frame scratch (reused, never reallocated): instance counts per batch and the live enemy ids. */
  const counts = new Map<THREE.InstancedMesh, number>(), liveIds = new Set<number>();

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

  const shieldScale = HERO_SCALE * 1.2;
  const shieldMaterial = new THREE.MeshBasicMaterial({ color: 0xb1fff1, transparent: true, opacity: .35, depthWrite: false, depthTest: false });
  const shield = new THREE.Mesh(new THREE.RingGeometry(.52, .548, 32), shieldMaterial); shield.scale.setScalar(shieldScale);
  shield.rotation.x = -ELEVATION; shield.renderOrder = 8; scene.add(shield);
  // Energy shields (user, 22 October): the hero's painted shell while it has shield charges, and each hunter's shell in its
  // world's glow. Bright at the rim and faint over the craft, so the ship's real (smaller) hit region stays readable.
  const shellGeometry = new THREE.SphereGeometry(1, 64, 32);
  const shellMaterial = () => new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, energy: { value: 1 }, time: { value: 0 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() { vec4 world = modelMatrix * vec4(position, 1.0); vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz); vLocal = position; gl_Position = projectionMatrix * viewMatrix * world; }`,
    // User, 8 November: the shield "looks a bit low res". A wider, softer rim, a faint honeycomb whose lines are
    // antialiased (fwidth) so they hold at a phone's render scale, and a slow sweep; still faint over the craft.
    fragmentShader: `uniform vec3 color; uniform float energy; uniform float time; varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      const vec2 HEX = vec2(1.0, 1.7320508);
      float hexLine(vec2 uv) {
        vec4 cell = floor(vec4(uv, uv - vec2(.5, 1.0)) / HEX.xyxy) + .5;
        vec4 h = vec4(uv - cell.xy * HEX, uv - (cell.zw + .5) * HEX);
        vec2 p = abs(dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw);
        float edge = .5 - max(dot(p, HEX * .5), p.x);
        float aa = fwidth(edge) * 1.2;
        return 1.0 - smoothstep(.025, .025 + aa, edge);
      }
      void main() { float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, 2.6), halo = pow(1.0 - facing, 1.2);
        float cells = hexLine(vLocal.xz * 3.4 + vec2(0.0, time * .12));
        float sweep = smoothstep(.0, .18, fract(vLocal.z * .55 - time * .35)) * (1.0 - smoothstep(.18, .42, fract(vLocal.z * .55 - time * .35)));
        float a = clamp((rim * .8 + halo * .07 + cells * (.06 + .22 * halo) + sweep * .08 * halo + .02) * energy, 0.0, .9);
        // Blended, not added: an HDR-bright colour shows as a coloured rim over snow and still blooms over dark ground.
        gl_FragColor = vec4(color * (1.2 + energy + cells * .4), a); }`,
    transparent: true, depthWrite: false,
  });
  const shell = (hex: number) => { const mesh = new THREE.Mesh(shellGeometry, shellMaterial()); (mesh.material as THREE.ShaderMaterial).uniforms.color.value.setHex(hex); mesh.renderOrder = 7; mesh.visible = false; scene.add(mesh); return mesh; };
  const heroShell = shell(0x4aa8ff);
  /** Hunter shells by world glow; one per live hunter (at most a few on screen). */
  /** Each planet's glow: hunter shields and the halo of enemy beams wear it. */
  const PLANET_GLOW: Record<PlanetId, number> = { luna: 0x8fd0ff, khepri: 0xff8a2a, vesper: 0x3fd8ff, nacre: 0x3ff0c8, amnion: 0xffc23a, corona: 0xff3a22, nahara: 0x43d8c8, umbra: 0x9a7cff };
  const hunterShells = Array.from({ length: 4 }, () => shell(0xffffff));
  /** Shield charges seen last frame (hero: −1) and when a shell broke, for its last flare. */
  const shellSeen = new Map<number, number>(), shellBroke = new Map<number, number>();
  const SHELL_BREAK = .35;
  /** A shell's energy: by charges left, a flash when hit, a short flare as its last charge breaks (0 when gone). */
  const shellEnergy = (id: number, charges: number, max: number, hitAt: number, time: number): { energy: number; grow: number } => {
    const before = shellSeen.get(id);
    if (before !== undefined && before > 0 && charges === 0) shellBroke.set(id, time);
    shellSeen.set(id, charges);
    if (charges > 0) return { energy: (.55 + .45 * charges / max) * (1 + 1.4 * Math.max(0, 1 - (time - hitAt) / .3)), grow: 1 };
    const u = (time - (shellBroke.get(id) ?? -9)) / SHELL_BREAK;
    return u >= 0 && u < 1 ? { energy: 2.2 * (1 - u), grow: 1 + .45 * u } : { energy: 0, grow: 1 };
  };

  // Shots never hide behind ground: no depth test, and `transparent` puts them in the last (transparent) list so
  // they draw after roads and other blended ground passes, which would otherwise paint over them.
  const friendlyMaterial = new THREE.MeshBasicMaterial({ color: 0xbcfff8, depthTest: false, depthWrite: false, transparent: true });
  // Hostile shot colours per world (a core and a pale centre that the bloom carries): shot-colors.ts `hostileHues`.
  const hostileMaterial = new THREE.MeshBasicMaterial({ color: 0xff8869, depthTest: false, depthWrite: false, transparent: true });
  const hostileCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffe7c4, depthTest: false, depthWrite: false, transparent: true });
  const projectileGeometry = new THREE.SphereGeometry(1, 6, 4);
  const friendly = new THREE.InstancedMesh(projectileGeometry, friendlyMaterial, 1024);
  const friendlyOutlineMaterial = new THREE.MeshBasicMaterial({ color: 0x041624, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
  const friendlyOutline = new THREE.InstancedMesh(projectileGeometry, friendlyOutlineMaterial, 1024);
  friendlyOutline.instanceMatrix.setUsage(THREE.DynamicDrawUsage); friendlyOutline.frustumCulled = false; friendlyOutline.renderOrder = 9;
  friendlyOutline.count = 0; scene.add(friendlyOutline);
  /** A Fracture Wave's wall shots in flight this frame (linked by a band, docs/39). */
  const wallShots: Projectile[] = [];
  const hostile = new THREE.InstancedMesh(projectileGeometry, hostileMaterial, 1024);
  const hostileCores = new THREE.InstancedMesh(projectileGeometry, hostileCoreMaterial, 1024);
  for (const mesh of [friendly, hostile, hostileCores]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = mesh === hostileCores ? 11 : 10; mesh.count = 0; scene.add(mesh);
  }
  // Drop icons: one antialiased, mipmapped canvas sprite per icon (weapon drops show their own gun), one draw each.
  const pickupTextures = createPickupIconTextures(renderer.capabilities.getMaxAnisotropy());
  const pickupGeometry = new THREE.PlaneGeometry(PICKUP_ICON_SIZE, PICKUP_ICON_SIZE), pickupShade = new THREE.Color();
  const pickupBatches = new Map<PickupIcon, THREE.InstancedMesh>();
  for (const icon of PICKUP_ICONS) {
    // Both sides: the drop spins a full turn (its back shows during the quick turn).
    const material = new THREE.MeshBasicMaterial({ map: pickupTextures.get(icon)!, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(pickupGeometry, material, 64);
    for (let i = 0; i < 64; i++) mesh.setColorAt(i, WHITE);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.count = 0; scene.add(mesh);
    pickupBatches.set(icon, mesh);
  }
  /**
   * 3D drop tokens (user, 7 November; tools/blender/pickup_tokens.py): a bevelled slab in each icon's frame outline, the
   * icon on both faces, embossed (bump map from the icon), its frame and glyph softly self-lit so they read on dark
   * worlds, the rim in the frame's colour. They replace the flat icons once loaded; the credit diamond is the lightest.
   */
  const tokenNode = (icon: PickupIcon) => icon.startsWith('weapon') ? 'tok_weapon' : `tok_${icon}`;
  const pickupBumps = createPickupBumpTextures(pickupTextures);
  void new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/shared/pickup-tokens.glb`).then(gltf => {
    if (disposed) return;
    const geometries = new Map<string, THREE.BufferGeometry>();
    gltf.scene.traverse(object => { if ((object as THREE.Mesh).isMesh) geometries.set(object.name, (object as THREE.Mesh).geometry); });
    for (const [icon, mesh] of pickupBatches) {
      const geometry = geometries.get(tokenNode(icon));
      if (!geometry) continue;
      const map = pickupTextures.get(icon)!;
      (mesh.material as THREE.Material).dispose();
      mesh.geometry = geometry;
      mesh.material = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .85,
        bumpMap: pickupBumps.get(icon)!, bumpScale: 4, metalness: .55, roughness: .3 });
    }
  }).catch(error => console.warn('Drop tokens unavailable; keeping the flat icons.', error));
  // Shockwave: a bright rim and a soft trailing band expanding from where the ship fired it (radius from the sim).
  const shockMaterials = [0, 1].map(k => new THREE.MeshBasicMaterial({ color: new THREE.Color(k ? 0x5fd8ff : 0xc8fff8).multiplyScalar(k ? 1.2 : 2.4),
    transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const shockRings = [new THREE.RingGeometry(.93, 1, 160), new THREE.RingGeometry(.8, .93, 160)].map((geometry, k) => {
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, shockMaterials[k]); mesh.renderOrder = 9; mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh); return mesh;
  });
  // Gravity Well (docs/32 §3): a black core in a spinning accretion ring, with faint rings at its pull and core radii.
  const wellSpec = SPECIALS['gravity-well'];
  const well = new THREE.Group(); well.visible = false; scene.add(well);
  const wellCore = new THREE.Mesh(new THREE.SphereGeometry(.5, 24, 16), new THREE.MeshBasicMaterial({ color: 0x020205, depthTest: false, depthWrite: false }));
  const wellRingMaterial = new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: .9, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
  const wellAccretion = new THREE.Mesh(new THREE.RingGeometry(.58, 1.05, 64, 1).rotateX(-Math.PI / 2), wellRingMaterial);
  const wellHalo = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.6, 64, 1).rotateX(-Math.PI / 2), wellRingMaterial.clone());
  const wellReach = [wellSpec.pullRadius, wellSpec.coreRadius].map(radius => new THREE.Mesh(new THREE.RingGeometry(radius - .04, radius, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: .2, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  // Swirl texture on the accretion ring: brighter arcs, so its spin reads.
  const swirl = wellAccretion.geometry.getAttribute('position'), swirlColor = new Float32Array(swirl.count * 3);
  for (let i = 0; i < swirl.count; i++) {
    const a = Math.atan2(swirl.getZ(i), swirl.getX(i)), r = Math.hypot(swirl.getX(i), swirl.getZ(i)), k = (.55 + .45 * Math.sin(a * 3 + r * 6)) * (r < .8 ? 1.4 : .8);
    swirlColor.set([k, k, k], i * 3);
  }
  wellAccretion.geometry.setAttribute('color', new THREE.BufferAttribute(swirlColor, 3)); wellRingMaterial.vertexColors = true;
  for (const mesh of [wellHalo, ...wellReach, wellAccretion, wellCore]) { mesh.renderOrder = 9; mesh.frustumCulled = false; well.add(mesh); }
  wellCore.renderOrder = 10;
  let wellSwallowed = 0, wellFlashAt = -1;
  // The well's lens (user, 28 October: "actually distort the view underneath"). High warps the frame in the post composite;
  // Low copies the drawn frame while a well is out and redraws the disc around it through the same warp.
  const wellLens = { on: false, x: .5, y: .5, radius: 0, strength: 0, swirl: 0 };
  const lensPoint = new THREE.Vector3(), lensEdge = new THREE.Vector3(), drawingSize = new THREE.Vector2();
  const lensScene = new THREE.Scene(), lensCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const lensMaterial = new THREE.ShaderMaterial({
    uniforms: { frame: { value: null }, lens: { value: new THREE.Vector4() }, lensSwirl: { value: 0 }, ratio: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `uniform sampler2D frame; uniform vec4 lens; uniform float lensSwirl; uniform float ratio; varying vec2 vUv;
      void main() {
        vec2 d = ( vUv - lens.xy ) * vec2( ratio, 1.0 );
        float r = length( d );
        if ( r >= lens.z ) discard;
        float f = 1.0 - r / lens.z; f *= f;
        float a = lensSwirl * f, c = cos( a ), s = sin( a );
        d = mat2( c, s, -s, c ) * d * ( 1.0 + lens.w * f * 1.8 );
        gl_FragColor = texture2D( frame, clamp( lens.xy + d / vec2( ratio, 1.0 ), vec2( 0.0 ), vec2( 1.0 ) ) );
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const lensQuad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), lensMaterial);
  lensQuad.frustumCulled = false; lensScene.add(lensQuad);
  let lensFrame: THREE.FramebufferTexture | null = null;
  // Rail Driver slugs (docs/32 §3): render-only trails from muzzle to head, fading out after the slug is gone; a fresh
  // slug kicks the hero back a touch.
  const railTrails = new Map<number, { x0: number; s0: number; x: number; s: number; endedAt?: number }>();
  let railKickAt = -1, railTick = -1;
  // Gameplay-shaped rings stay (shockwave radius, shield break, pickup, burst marker); fx adds the cosmetic layer.
  // Flat rings face the camera one way only, so the single pass draws exactly what three.js's two passes over a transparent
  // double-sided material drew (back faces: none), in half the draws (mobile performance pass, 3 November). So do the
  // shockwave and the Gravity Well's rings.
  const effectMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthWrite: false, depthTest: false, side: THREE.DoubleSide, forceSinglePass: true });
  const effects = new THREE.InstancedMesh(new THREE.RingGeometry(.85, 1, 24), effectMaterial, 128);
  effects.setColorAt(0, color.setHex(0xffffff));
  effects.instanceMatrix.setUsage(THREE.DynamicDrawUsage); effects.frustumCulled = false; effects.renderOrder = 6; effects.count = 0; scene.add(effects);
  const fx = createFx(scene);
  /** This frame's plumes: pooled objects (docs/38 PF3), filled by `plume` and read by fx.update in the same frame. */
  const plumes: Plume[] = [], plumePool: Plume[] = [];
  let plumeCount = 0;
  const plume = (x: number, z: number, length: number, width: number, hex: number, energy: number, round = false) => {
    const p = plumePool[plumeCount] ??= { x: 0, z: 0, length: 0, width: 0, hex: 0, energy: 0, round: false };
    p.x = x; p.z = z; p.length = length; p.width = width; p.hex = hex; p.energy = energy; p.round = round;
    plumes[plumeCount++] = p;
  };
  const heroTrail = createHeroTrail();
  let trailEndZ = planeZAtScreenY(camera, VIEW.flightHeight + .035, .975);
  let trailRun: RunState | null = null, trailLives = 0, trailLook = '';

  const lineVertices = new Float32Array(16384 * 3), lineColors = new Float32Array(16384 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(lineVertices, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .7, depthTest: false, depthWrite: false }));
  lines.frustumCulled = false; lines.renderOrder = 9; scene.add(lines);

  let lastStatsTick = -Infinity;
  /** QA overdraw proxy: the lane strips' (beams, telegraphs, trails) summed area this frame, world units² at the flight plane. */
  let laneArea = 0;
  /** Per-frame terrain CPU work (update, cull, animate, prefetch), for streaming QA. */
  const terrainWork = { last: 0, max: 0, over4: 0, frames: 0, renderMax: 0, updateMax: 0, animateMax: 0, prefetchMax: 0 };
  /** Draw calls per pass in the last frame (shadow map, main scene, post), for the budget evidence. */
  const passes = { shadow: 0, main: 0, post: 0 };
  // QA instrumentation only: count the draws three.js issues inside its shadow pass.
  const renderShadows = renderer.shadowMap.render.bind(renderer.shadowMap);
  renderer.shadowMap.render = (lights, shadowScene, view) => {
    const before = renderer.info.render.calls; renderShadows(lights, shadowScene, view); passes.shadow += renderer.info.render.calls - before;
  };
  /*
   * The frame's lane, telegraph and marker writers (defined once: docs/38 PF3, not recreated every frame). `strip` adds a
   * lane quad to a layer; `line` a marker segment to the line buffer (`lineCursor`, reset each frame).
   */
  const strip = (x1: number, s1: number, x2: number, s2: number, width: number, hex: number, layer = telegraphs, energy = 1) => {
    const index = laneCounts.get(layer) ?? 0;
    if (index >= layer.instanceMatrix.count) return;
    laneArea += width * Math.hypot(x2 - x1, s2 - s1);
    transform.position.set((x1 + x2) / 2, VIEW.flightHeight + .035, -(s1 + s2) / 2);
    transform.rotation.set(0, Math.atan2(x2 - x1, -(s2 - s1)), 0); transform.scale.set(width, 1, Math.hypot(x2 - x1, s2 - s1)); transform.updateMatrix();
    layer.setMatrixAt(index, transform.matrix); layer.setColorAt(index, color.setHex(hex).multiplyScalar(energy));
    laneCounts.set(layer, index + 1);
  };
  const trailSegment = (x0: number, s0: number, x1: number, s1: number, width: number, energy: number) =>
    strip(x0, s0, x1, s1, width, heroGlow, heroTrails, energy);
  /*
   * Enemy beams (user, 23 October: the dashed lanes "look dated under the new graphics"; "make it a faint red preview
   * which then turns white with a red glow ... maybe make the laser glow in the color of the glow on their specific
   * planet"). The preview: a faint red veil from the source down with a thin red centre, flaring brighter through its
   * last 0.2 s (`flare` 0 … 1), the cue that it fires. The live beam: a white-hot core in a halo of the planet's glow,
   * shimmering, with a flare at the emitter.
   */
  const beamPreview = (x: number, top: number, width: number, flare: number) => {
    const breathe = 1;
    plume(x, -top, .01, .3 + flare * Math.max(.5, width), 0xff563c, .6 + flare * 3, true);
    strip(x, top, x, VIEW.minS, width, 0xff2a1e, laneFills, (.55 + flare * .6) * breathe);
    strip(x, top, x, VIEW.minS, Math.min(.08, width * .25), 0xff4a36, flashLanes, (.5 + flare * 1.6) * breathe);
    if (flare > 0) strip(x, top, x, VIEW.minS, width * .9, 0xff3424, flashLanes, flare * .7);
  };
  const beamLive = (x: number, top: number, width: number) => {
    const glow = PLANET_GLOW[planet];
    beamLight.add(x, top, width, glow);
    plume(x, -top, .01, Math.max(.7, width * 1.15), glow, 3.2, true);
    plume(x, -top, .01, Math.max(.25, width * .35), 0xffffff, 3.5, true);
  };
  /*
   * Shot telegraphs (user, 23 October: "I really dont like the dashed lines anymore"; "why some of the ground targets
   * draw a warning like a laser even tho they shoot balls"), in the shot colour so they never read as a beam or as
   * the player's fire. Timing is the simulation's, unchanged. An aim ray: a solid thin line bright at the muzzle,
   * fading smoothly toward its target (the ray layers' vertex alpha), brightening as the shot charges (`charge` 0 … 1),
   * and a swelling muzzle glow. A shot column (a straight-firing battery): chevrons sliding down it.
   */
  let shotHex = 0;
  const muzzle = (x: number, s: number, charge: number) => plume(x, -s + .3, .01, .45 + charge * .5, shotHex, 1.2 + charge * 2.4, true);
  const aimRay = (x0: number, s0: number, x1: number, s1: number, charge: number) => {
    strip(x0, s0, x1, s1, .3, shotHex, rayFills, .9);
    strip(x0, s0, x1, s1, .1, shotHex, rayCores, .8 + charge * 1.6);
  };
  /*
   * A battery's shot column (user, 27 October: the arrows looked frozen, and the column and its muzzle stayed put on
   * screen while the ground scrolled under them): it hangs from the battery as it scrolls, through the point on the
   * player's row its shot will cross (the forecast muzzle's column), and chevrons at a fixed spacing flow down it.
   * Chevrons only, no veil: a veiled column read as a beam lane.
   */
  const shotColumn = (x0: number, s0: number, aimX: number, charge: number, time: number) => {
    const dx = aimX - x0, ds = -Math.max(.5, s0), length = Math.hypot(dx, ds), ux = dx / length, us = ds / length;
    const span = (s0 - VIEW.minS) / -us, flow = (time * CHEVRON_FLOW) % CHEVRON_GAP;
    for (let d = .5 + flow; d < span; d += CHEVRON_GAP) {
      const x = x0 + ux * d, s = s0 + us * d, energy = (.65 + charge * .65) * (1 - d / span * .45) * THREE.MathUtils.smoothstep(d, .5, .5 + CHEVRON_GAP);
      for (const side of SIDES) strip(x - (ux + side * us) * .3, s - (us - side * ux) * .3, x, s, .12, shotHex, flashLanes, energy);
    }
  };
  const chargeOf = (enemy: Enemy) => 1 - Math.min(1, enemy.warning / Math.max(.1, ENEMIES[enemy.kind].warning));
  let lineCursor = 0;
  const line = (x1: number, s1: number, x2: number, s2: number, hex: number) => {
    if (lineCursor + 2 > lineVertices.length / 3) return;
    color.setHex(hex);
    const i = lineCursor * 3, y = VIEW.flightHeight + .03;
    lineVertices[i] = x1; lineVertices[i + 1] = y; lineVertices[i + 2] = -s1; lineVertices[i + 3] = x2; lineVertices[i + 4] = y; lineVertices[i + 5] = -s2;
    lineColors[i] = lineColors[i + 3] = color.r; lineColors[i + 1] = lineColors[i + 4] = color.g; lineColors[i + 2] = lineColors[i + 5] = color.b; lineCursor += 2;
  };
  /** The enemy with this id, or undefined (a loop: no closure per lookup, docs/38 PF3). */
  const enemyWithId = (state: RunState, id: number): Enemy | undefined => {
    for (const enemy of state.enemies) if (enemy.id === id) return enemy;
    return undefined;
  };
  /** What fires a beam lane: a Needle at its aim, a locked beam ship, or the boss column over it (the first in the run's order). */
  const beamSource = (state: RunState, hazard: RunState['hazards'][number]): Enemy | undefined => {
    for (const enemy of state.enemies) if ((enemy.hp > 0 || enemy.bossPart) && (enemy.bossPart ? Math.abs(enemy.x - hazard.x) < hazard.width / 2 + .3
      : enemy.kind === 'needle' ? Math.abs(enemy.aimX - hazard.x) < 1e-6 : !!enemy.lock && Math.abs(enemy.x - hazard.x) < .05)) return enemy;
    return undefined;
  };
  /** A frame's per-enemy seat (scratch: read at once, never kept). */
  const enemySeat: { x?: number; s: number; baseHeight: number } = { x: undefined, s: 0, baseHeight: 0 };
  const seatAt = (x: number | undefined, s: number, baseHeight: number) => { enemySeat.x = x; enemySeat.s = s; enemySeat.baseHeight = baseHeight; return enemySeat; };
  /** Ground batteries that released a round since the last frame (scratch, refilled each frame). */
  const releasedBatteries: { muzzle: { x: number; s: number }; x: number; s: number }[] = [];
  /** A craft batch set's instance counts for the frame (and its Low silhouettes and ghosts). */
  const settleBatches = (set: ReadonlyMap<unknown, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }> | null) => {
    if (set) for (const batch of set.values()) {
      const count = counts.get(batch.mesh) ?? 0;
      liveInstances(batch.mesh, count);
      const flat = silhouettes.get(batch.mesh);
      if (flat) { flat.geometry = batch.mesh.geometry; liveInstances(flat, quality === 'high' ? 0 : count); }
      if (batch.ghost) { batch.ghost.count = count; batch.ghost.visible = count > 0; }
    }
  };
  /** The hero's place, size and roll this frame; returns how far its mission-start entrance has played (0 to 1). */
  function poseHero(state: RunState): number {
    hero.visible = state.player.lives > 0 && heroShown === heroKey;
    // Mission-start entrance (render-only): the hero starts close to the camera (large, out along the view ray, so it
    // keeps its screen position under the orthographic lens) and drops to flight height with one barrel roll.
    // Under the launch warp the hero cruises in that start pose, over the veil; the flight starts at the warp's breakout,
    // so the drop plays as the world appears (user, 27 October: the drop had been skipped under the warp).
    const entrance = state.time >= HERO_ENTRANCE ? 1 : 1 - Math.pow(1 - Math.max(0, state.time) / HERO_ENTRANCE, 3);
    const lift = (1 - entrance) * HERO_ENTRANCE_LIFT;
    hero.position.set(state.player.x, VIEW.flightHeight + lift * Math.sin(ELEVATION), lift * Math.cos(ELEVATION));
    // Rail Driver recoil (render only): a short kick back, springing home in 0.1 s.
    if (railKickAt >= 0 && state.time >= railKickAt) hero.position.z += .06 * Math.max(0, 1 - (state.time - railKickAt) / .1);
    hero.scale.setScalar(HERO_SCALE * (1 + (1 - entrance) * 1.6));
    hero.rotation.z = -state.player.vx * .016 + (1 - entrance) * Math.PI * 2;
    // Interceptor Barrel Roll: one roll into the sidestep (user, 30 October: "the roll is just visual for the side dash"),
    // most of the turn while the ship slides, settling just after the dash ends.
    const dash = state.player.dash, rollAge = dash ? (state.time - dash.startedAt) / DASH_ROLL : 1;
    if (dash && rollAge >= 0 && rollAge < 1) hero.rotation.z -= dash.direction * Math.PI * 2 * (1 - Math.pow(1 - rollAge, 3));
    return entrance;
  }
  /**
   * A launch-warp frame before the flight's world is prepared (performance, 29 October: the warp's first frame generated
   * the new terrain and compiled every program, so a tap showed nothing for seconds). The opaque veil hides the world, so
   * the last frame's world stays as it was and only the warp and the cruising ship move. The full frame after
   * `launchWarp('ready')` generates and warms the destination, under the warp (user: "if it hangs during the warp its
   * fine thats what its for").
   */
  function holdFrame(state: RunState) {
    heroTrail.clear(); heroTrails.count = 0;
    placeCamera(state.cameraX * follow);
    poseHero(state);
    shield.visible = heroShell.visible = false;
    jumpFx.update(state, reducedMotion(), false, quality === 'high');
    post.settings.cover.value = jumpFx.cover;
    if (quality === 'high') post.render(scene, camera); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  }
  let launchHold = false;
  let drawingWidth = 1, drawingHeight = 1;
  const resizePost = () => post.setSize(drawingWidth * renderer.getPixelRatio(), drawingHeight * renderer.getPixelRatio());
  return {
    prepare: preload,
    prepareHero: config => showHero(...heroOf(config)),
    preloadHero: preloadHeroLook,
    heroPreview,
    /** The playground (playground.html): a level's look as shipped, and a live replacement for it. */
    lookOf: (world: PlanetId) => ({ ...structuredClone(DEFAULT_LOOKS[world]), sunBehind: PLANETS[world].sunBehind ? 1 : 0 }),
    tuneLook(world: PlanetId, look: PlanetLook) {
      // The sun's side is the world's (its baked shading too): a change re-bakes the terrain window.
      if (look.sunBehind !== undefined && look.sunBehind >= .5 !== sunBehind(world)) {
        const behind = look.sunBehind >= .5;
        setSunBehind(world, behind === (PLANETS[world].sunBehind ?? false) ? null : behind);
        terrain.invalidate();
      }
      const { sunBehind: _side, ...rest } = look; void _side;
      LOOKS[world] = structuredClone(rest);
      if (world === planet) { applyLight(world, LOOKS[world]); shadowMaterial.color.setHex(LOOKS[world].blobShadow); }
    },
    // Each launch warms every program in its real form under the warp (see the warm-up in render), in the first full
    // frame after 'ready'; until then the warp only holds (holdFrame).
    launchWarp: mode => {
      launchHold = mode === 'cruise';
      if (mode === 'ready') return 0;
      if (mode === 'cruise') warmed = false;
      return jumpFx.launch(mode);
    },
    isReady: planetReady,
    setQuality(next) {
      if(disposed)return;quality=next;terrain.setQuality(next);terrainMaterials.setNormalMaps(next==='high');fx.setQuality(next);motes.setQuality(next);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,next==='high'?1.5:1)); resizePost();
      // Shadow maps are a High-tier feature; toggling them recompiles the affected programs once.
      renderer.shadowMap.enabled = sunlight.castShadow = next === 'high';
      warmed = false;
      scene.traverse(object => { const material = (object as THREE.Mesh).material; (Array.isArray(material) ? material : material ? [material] : []).forEach(m => { m.needsUpdate = true; }); });
      lastStatsTick=-Infinity;
    },
    resize(width, height) {
      if (disposed) return;
      drawingWidth = Math.max(1, Math.floor(width)); drawingHeight = Math.max(1, Math.floor(height));
      viewportAspect = drawingWidth / drawingHeight;
      if (cameraMode !== 'rectified') fitFlightViewport(camera, drawingWidth, drawingHeight);
      placeCamera(camera.position.x); fitShadow();
      trailEndZ = planeZAtScreenY(camera, VIEW.flightHeight + .035, .975);
      renderer.setSize(drawingWidth, drawingHeight, false); resizePost();
      lastStatsTick = -Infinity;
    },
    render(state, alpha) {
      void showHero(...heroOf(state.config));
      if (disposed) return;
      renderer.info.reset();
      if (launchHold) { holdFrame(state); return; }
      // Interpolation is presentation-only; the view follows the exact authoritative camera.
      void alpha;
      lastRenderTime = state.time; hiddenWarm = false;
      const terrainStart = performance.now();
      // The run's schedule drives the terrain (docs/18 §3): planet stretches and boss arenas by distance; a campaign is one planet.
      terrain.update(state.config.seed, state.distance, runRoute(state.config)); placeCamera(state.cameraX * follow); terrain.cull(camera);
      // What the camera sees of the ground this frame: every draw range below reads it (no pop-in at the lens's far end).
      const view = viewFootprint(camera, TERRAIN_MIN_HEIGHT, SCENERY_MAX_HEIGHT + 1, footprint);
      /** The streamed world under the ship (planet and arena); seating given it resolves each distance on the route. */
      const world = terrain.world, arena = world.arena;
      // Corona's arcs (docs/37): render-only loops of plasma between the islands, seeded in the terrain frame.
      coronaArcs.update(state.time, state.config.seed, state.distance, view.minS, view.maxS, world.planet.id === 'corona',
        (x, s) => terrainHeight(state.config.seed, x, s, world), CORONA_SEA_LEVEL, VIEW.flightHeight);
      coronaHaze.update(state.time, state.distance, -(view.minS + view.maxS) / 2, world.planet.id === 'corona', CORONA_SEA_LEVEL);
      // Each world's drifting dust, snow, spores or embers (render-only; none on Luna, none in the ortho debug view).
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) motes.update(world.planet.id, state.time, state.distance, camera as THREE.PerspectiveCamera, drawingHeight * renderer.getPixelRatio());
      const lookPlanet: PlanetId = lookOverride ? terrainPlanet : state.planet ?? runPlanet(state.config);
      if (lookPlanet !== planet) applyLook(lookPlanet);
      if (state.config.mode === 'endless') {
        const plan = endlessSectorPlan(Math.max(1, state.sector));
        if (plan.jump && state.time - state.sectorStartedAt > 8) preload(plan.jump.to);
      }
      const terrainUpdate = performance.now() - terrainStart;
      // Boss routing: the Helion Ark rides the sea, WARDEN-1 lands on Luna, THE VEIL hovers over the mire; Bastion-9
      // otherwise. A wreck stays anchored to the ground and falls behind with it, through a warp too.
      const boss = state.boss;
      const isArk = boss?.id === 'ark', isWarden = boss?.id === 'warden', isVeil = boss?.id === 'veil', isCradle = boss?.id === 'cradle', isEclipse = boss?.id === 'eclipse', isHeliophage = boss?.id === 'heliophage', isCitadel = boss?.id === 'citadel';
      {
        let seat: { x?: number; s: number; baseHeight: number } | null = isWarden && boss
          ? bastionPlacement(state.config.seed, state.distance, boss.x, boss.s, arena, WARDEN_FOOTPRINT, WARDEN.targetHeight) : null;
        if (isWarden && boss && seat && perspective) seat = rayPlacement(camera, state.config.seed, state.distance, boss.x, boss.s, WARDEN.targetHeight, seat.baseHeight, arena);
        warden.update(state, seat);
        if (isWarden) terrain.setExclusion(warden.footprint(state, seat));
      }
      {
        // THE VEIL hovers over the mire: its target plane sits VEIL.targetHeight above the water. THE CRADLE's island rises
        // out of the flesh canyon its arena digs (src/world/terrain-amnion.ts, `emergence`) and hovers over the plateau:
        // its seat is raised by the hover, so its target plane still projects onto the logical rows.
        for (const { view, id, ground: plateau, style } of HOVERING_BOSSES) {
          // (A rig may stand in for another boss: `stands`.)
          const mine = !!boss && (boss.id === id || !!style.stands?.includes(boss.id)), ground = plateau ?? world.planet.seaLevel ?? 0, height = style.content.targetHeight;
          let seat: { x?: number; s: number; baseHeight: number } | null = mine && boss ? veilPlacement(boss.s, ground, height) : null;
          if (mine && boss && perspective) seat = rayPlacement(camera, state.config.seed, state.distance, boss.x, boss.s, height, ground, world);
          // THE CITADEL stands in its arena before and after its fight (intact, then a wreck), at the seat its fight takes.
          let standing: 'intact' | 'wrecked' | null = null;
          if (id === 'citadel') {
            const arena = world.planet.id === 'nahara' ? world.arena : undefined;
            if (state.time < citadelSeen) citadelFallen = null;
            citadelSeen = state.time;
            if (mine && boss?.phase === 'destroyed' && arena) citadelFallen = arena.fromS;
            if (!boss && arena) standing = citadelFallen === arena.fromS ? 'wrecked' : 'intact';
            // Always its fixed seat in the arena (the camera ray gives the same within a few hundredths at the stop, but it
            // moves while the scroll is still settling: the temple shifted as its fight began; user, 13 November).
            if (arena && (standing || mine)) seat = { x: mine && boss ? boss.x : 0, s: arena.fromS + CITADEL_AT - state.distance, baseHeight: ground };
          }
          view.update(state, seat, standing);
          if (mine) terrain.setExclusion(view.footprint(state, seat));
        }
      }
      if (!isArk && !isWarden && !isVeil && !isCradle && !isEclipse && !isHeliophage && !isCitadel) {
        let bossPlacement: { x?: number; s: number; baseHeight: number } | null = boss ? bastionPlacement(state.config.seed, state.distance, boss.x, boss.s, arena) : null;
        if (boss && bossPlacement && perspective) bossPlacement = rayPlacement(camera, state.config.seed, state.distance, boss.x, boss.s, BASTION.targetHeight, bossPlacement.baseHeight, arena);
        bastion.update(state, bossPlacement);
        // While the fortress is present, scenery under its hull is hidden (render-only; ground and roads stay).
        terrain.setExclusion(bastion.footprint(state, bossPlacement));
      } else bastion.update(state, null); // Clear the previous fortress and its FX on every boss/world switch.
      // Waterline on the sea; targets (local height 1.6) project onto their logical rows (rayPlacement under a lens).
      const sea = world.planet.seaLevel ?? 0;
      let arkSeat: { x?: number; s: number; baseHeight: number } | null = null;
      if (isArk && boss) {
        ensureArk();
        // Its glide-in is drawn from ARK_GLIDE further out, closing to the simulated row as the arrival ends (render only:
        // nothing on it is a target or attacks before then). The simulation's entry row puts its bow just inside the top
        // of the view at sea level, where it faded in out of the fog (user, 31 October: bosses "pop in").
        const glide = boss.phase === 'arrival' ? ARK_GLIDE * Math.max(0, 1 - (state.time - boss.startedAt) / HELION_ARK.arrivalDuration) : 0;
        arkSeat = perspective ? rayPlacement(camera, state.config.seed, state.distance, boss.x, boss.s + glide, HELION_ARK.targetHeight, sea, world)
          : arkPlacement(boss.s + glide, sea);
      }
      ark.update(state, arkSeat);
      if (isArk) terrain.setExclusion(ark.footprint(state, arkSeat));
      // Haulers and beacons run on simulation time (frozen while paused); presentation only.
      const animateStart = performance.now();
      terrain.animate(state.time); terrainMaterials.setTime(state.time);
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
      // A planet jump warms the next world's programs at its flash, while the screen is white.
      const flashing = !!state.jump && state.time >= state.jump.startedAt + state.jump.duration * .48;
      if (flashing && warmedJump !== state.jump!.startedAt) { warmedJump = state.jump!.startedAt; warmed = false; }
      if (!warmed) {
        // Preview rendering warms all authored craft/material programs before the first fight.
        // Instance-color attributes above are allocated now, avoiding a new program on first loot/hit.
        // Boss rigs stay hidden until their arrival; they are in the scene, so the walk below shows and compiles every part
        // (wrecks, shutters, thrusters included) now, and a boss glides in instead of stalling on its first frame.
        const pieces = [...terrain.warmupObjects(), ...facilities.warmupObjects(), ...sites.warmupObjects(), ...jumpFx.objects];
        separateInstancedCasters(scene); pieces.forEach(separateInstancedCasters);
        // Every object is drawn once in its real form (performance, 22 October: programs compiled mid-flight stalled
        // frames by 50-400 ms): hidden ones shown and nothing culled, so empty instanced batches, the shield and the
        // effects compile too.
        // Each object's state is kept once (a Set, not a search of the list per object: docs/38 PF1).
        const restore: [THREE.Object3D, boolean, boolean][] = [], kept = new Set<THREE.Object3D>();
        const show = (object: THREE.Object3D) => {
          if (!kept.has(object)) { kept.add(object); restore.push([object, object.visible, object.frustumCulled]); }
          object.visible = true; object.frustumCulled = false;
        };
        scene.traverse(show);
        for (const piece of pieces) piece.traverse(show);
        // An empty batch draws one instance while warming: every pass, the shadow pass's depth programs included, then
        // compiles it (performance, 31 October: a dart batch's shadow program compiled on the first dart, 480 ms).
        const emptied: THREE.InstancedMesh[] = [];
        scene.traverse(object => { if ((object as THREE.InstancedMesh).isInstancedMesh && (object as THREE.InstancedMesh).count === 0) { (object as THREE.InstancedMesh).count = 1; emptied.push(object as THREE.InstancedMesh); } });
        hiddenWarm = state.tick === 0 || jumpFx.launching || flashing;
        // Upload decoded atlases now, including hidden facility/boss materials. Shader compilation
        // alone does not upload textures and otherwise defers that cost to the first visible draw.
        // Only under cover (the launch warp, a jump's flash): mid-flight, the next world's kits arriving for its jump
        // (endless, 8 s into a boss sector) uploaded three 2048² atlases in one frame, 0.54 s in the bench (mobile
        // performance pass, 3 November). They upload one a frame once the boss has fallen and through the jump (below), the
        // flash takes any left, and anything drawn sooner uploads as it first draws.
        if (hiddenWarm) { uploadPending(Infinity); texturesPending = false; } else texturesPending = true;
        if (hiddenWarm) {
          // Hidden (a flight's first frame under the launch warp, or a jump's flash): one real frame through the actual pipeline compiles
          // every variant, the HDR target's untoned programs and the shadow pass's depth programs included. The frame
          // below draws over it.
          if (quality === 'high') post.render(scene, camera); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
          renderer.compile(lensScene, lensCamera);
        } else {
          // Mid-flight (a later planet's kits arrived): compile for the target the scene draws into, in the background
          // where the browser compiles in parallel, so the flight does not stall.
          renderer.setRenderTarget(quality === 'high' ? post.target : null);
          void renderer.compileAsync(scene, camera).catch(() => undefined);
          renderer.setRenderTarget(null);
        }
        for (const [object, visible, culled] of restore) { object.visible = visible; object.frustumCulled = culled; }
        for (const mesh of emptied) mesh.count = 0;
        warmed = true; lastStatsTick = -Infinity;
      }
      // After a boss falls (its wreck hold, the departure) and through a jump's warp (no combat; the flash warms the next
      // world), textures a mid-flight warm-up left pending upload one a frame, so the flash does not take them all at once.
      if (texturesPending && !hiddenWarm && (state.jump || state.boss?.clearedAt !== undefined)) texturesPending = uploadPending(1);
      placeSun(state.cameraX, state.distance);
      // The last life lost: the hero is gone (its explosion plays on in the death afterglow, see main.ts).
      const heroAlive = state.player.lives > 0;
      const entrance = poseHero(state);
      shield.position.set(state.player.x, VIEW.flightHeight + .03, 0);
      shield.visible = heroAlive && state.time < state.player.invulnerableUntil;
      shieldMaterial.color.setHex(heroGlow);
      shieldMaterial.opacity = .34;
      {
        const { energy, grow } = shellEnergy(-1, heroAlive ? state.player.shields : 0, Math.max(1, state.player.maxShields), state.player.lastHitAt, state.time);
        heroShell.visible = heroAlive && entrance > .9 && energy > 0;
        heroShell.position.copy(hero.position); heroShell.scale.setScalar(.66 * shieldScale * grow);
        const uniforms = (heroShell.material as THREE.ShaderMaterial).uniforms; uniforms.color.value.setHex(heroGlow); uniforms.energy.value = energy; uniforms.time.value = state.time;
      }
      // Engine plumes (render-only): length follows lateral speed, a slight flicker from simulation time.
      plumeCount = 0;
      // Only the round light belongs to the nozzle. All visible exhaust behind it follows the recorded flight path.
      if (heroAlive && entrance > .9) for (const [ex, ez] of heroEngines) {
        plume(hero.position.x + ex * HERO_SCALE * Math.cos(hero.rotation.z), hero.position.z + ez * HERO_SCALE, 0,
          .32 * HERO_SCALE * Math.sqrt(2 / Math.max(2, heroEngines.length)) * flicker(state.time, 0), heroGlow, 3.2, true);
      }
      let shadowCount = 0, plinthCount = 0;
      const groundAt = (gx: number, gs: number) => surfaceHeight(state.config.seed, gx, state.distance + gs, world);
      const seaLevel = world.planet.seaLevel, onSea = (y: number) => seaLevel !== null && y <= seaLevel + .01;
      // The hero's Low shadow: its merged silhouette flattened along the sun (High: the shadow map).
      heroSilhouette.visible = quality !== 'high' && hero.visible && !!heroSilhouette.geometry.getAttribute('position');
      if (heroSilhouette.visible) {
        hero.updateMatrix();
        const ground = blobLanding(sun, hero.position.x, -hero.position.z, hero.position.y, groundAt).y;
        heroSilhouette.matrix.multiplyMatrices(planarShadow(sun, ground + .02, flatProjection), hero.matrix);
        // Open water mostly reflects the sky, so a High shadow shows only faintly on it; craft silhouettes stay off the sea
        // and the hero's is lightened there.
        (heroSilhouette.material as THREE.MeshBasicMaterial).color.copy(onSea(ground) ? seaShade : craftSilhouetteMaterial.color);
      }

      // Instance counts per batch mesh: each enemy fills the batch of the model it actually uses (a Vesper kind keeps its
      // own model on any planet).
      counts.clear();
      // Hit flashes: compare each craft's hp with the last frame (a new run restarts the record).
      if (state.tick < hitTick) { enemyHp.clear(); enemyHitAt.clear(); deploying.clear(); groundKnown.clear(); }
      hitTick = state.tick;
      liveIds.clear(); for (const enemy of state.enemies) liveIds.add(enemy.id);
      for (const [id] of enemyHp) if (!liveIds.has(id)) { enemyHp.delete(id); enemyHitAt.delete(id); }
      beamLight.begin(); phaseHoles.begin();
      // The Wraith's teleport rim: Corona's molten red-orange, Nahara's turquoise (user, 13 November: "the wraith was still
      // purple"), Umbra's violet elsewhere.
      if (world.planet.id === 'corona') phaseHoles.tint(1, .32, .06);
      else if (world.planet.id === 'nahara') phaseHoles.tint(.12, .72, .66);
      else phaseHoles.tint(.4, .1, .85);
      let pontoonCount = 0; laneCounts.clear(); pontoonRings.length = 0;
      pontoons.material = planet === 'corona' ? basaltRaft : materials.craft;
      laneArea = 0;
      // This frame's shot colour for the telegraphs (`muzzle`, `aimRay`, `shotColumn`).
      shotHex = hostileHues(planet)[0];
      // Vesper flies its own faction's craft once loaded (Khepri models meanwhile).
      const activeBatches = planet === 'vesper' && vesperBatches ? vesperBatches : enemyBatches;
      lineCursor = 0;
      // Strike sites first: a site core's own model is left out below (the site draws its core).
      sites.update(state, planet, view, (x, s) => surfaceHeight(state.config.seed, x, s, world));
      terrainMaterials.setSitePads(sites.pads, sites.keeps, state.distance);
      const groundNow = new Map<number, GroundSeen>();
      for (const enemy of state.enemies) {
        if (enemy.bossPart) continue;
        const isGround = GROUND_KINDS.has(enemy.kind);
        const visible = enemy.x > view.minX - 1 && enemy.x < view.maxX + 1 && enemy.s > view.minS - 2 && enemy.s < view.maxS + 3;
        if (!visible && !isGround) continue;
        // Ground enemies stand at their anchor on the terrain (src/sim/ground.ts, 21 October): fixed in the world, scrolling
        // with it, while the simulation's position is that anchor seen through the same lens (src/shared/lens.ts), so model,
        // compound, shots and hits agree on screen. Over open water the anchor is a pontoon deck. (Enemies without an
        // anchor, from raw test fixtures, keep the orthographic seat.)
        const anchor = isGround ? enemy.ground : undefined;
        const afloat = anchor ? anchor.afloat : isGround && world.planet.seaLevel !== null && surfaceHeight(state.config.seed, enemy.x, state.distance + enemy.s, world) <= sea + 1e-6
          && terrainHeight(state.config.seed, enemy.x, state.distance + enemy.s, world) < sea - .05;
        const coreHeight = enemy.groundHeight + (afloat ? PONTOON_DECK : 0);
        const placement: { x?: number; s: number; baseHeight: number } = !isGround ? seatAt(undefined, enemy.s, VIEW.flightHeight)
          : anchor ? seatAt(anchor.x, anchor.s, anchor.base - (anchor.afloat ? PONTOON_DECK : 0))
          : groundPlacement(state.config.seed, state.distance, enemy.x, enemy.s, coreHeight, world);
        // Only a battery that has just spawned deploys: one first drawn later (a frame after a fast-forward, a paused or
        // hidden tab) is long in place, and sinking it then put it under Vesper's water as a pale silhouette (3 November).
        if (isGround && enemy.formation && !groundKnown.has(enemy.id)) { groundKnown.add(enemy.id); if (enemy.s < DEPLOY_ROW && enemy.age < DEPLOY_FRESH) deploying.set(enemy.id, state.time); }
        const deployed = deploying.get(enemy.id), rise = deployed !== undefined ? 1 - THREE.MathUtils.smoothstep(state.time - deployed, 0, DEPLOY) : 0;
        // On open water the pontoon stays on the surface and its gun unfolds on the deck (it never sinks under the sea).
        const sink = afloat ? 0 : rise * DEPLOY_DEPTH, unfold = afloat ? 1 - rise * .8 : 1;
        if (rise > 0) placement.baseHeight -= sink; else deploying.delete(enemy.id);
        // A site core seats no compound or emplacement and leaves no wreck: its site stands there (site-view.ts).
        const siteCore = sites.hidesCore(enemy.id);
        if (isGround && enemy.hp > 0 && !enemy.site) groundNow.set(enemy.id, { kind: enemy.kind, x: enemy.x, s: enemy.s, afloat, groundX: placement.x ?? enemy.x, groundS: state.distance + placement.s, base: placement.baseHeight + sink, late: deploying.has(enemy.id) });
        // A compound is much wider than its gun. Seat all live ground batteries ahead of the view,
        // including lateral neighbours; only the small gun draw uses the tight visibility test.
        if (!visible) continue;
        if (afloat) {
          if (!siteCore && pontoonCount < pontoons.instanceMatrix.count) {
            transform.position.set(placement.x ?? enemy.x, placement.baseHeight + Math.sin(state.time * 1.1 + enemy.id) * .012, -placement.s);
            transform.rotation.set(0, enemy.id * .7, 0); transform.scale.setScalar(1); transform.updateMatrix(); pontoons.setMatrixAt(pontoonCount++, transform.matrix);
            if (planet === 'vesper') pontoonRings.push({ x: placement.x ?? enemy.x, z: -placement.s, y: sea, yaw: 0, rx: .8, rz: .8, strength: .55 });
          }
          placement.baseHeight += PONTOON_DECK;
        }
        if (VESPER_KINDS.has(enemy.kind) && !craftRequested) ensureCraft('kinds');
        const pod = enemy.formation?.template === 'veil-pods';
        const nacreNode: NacreCraftNode | null = (planet === 'nacre' || planet === 'amnion') && nacreBatches && enemy.kind !== 'fuel' ? (pod ? 'nacre_pod' : NACRE_CRAFT[enemy.kind].node) : null;
        const umbraNode: UmbraCraftNode | null = planet === 'umbra' && umbraBatches && enemy.kind !== 'fuel' ? (pod ? 'umbra_drone' : UMBRA_CRAFT[enemy.kind].node) : null;
        const naharaNode: NaharaCraftNode | null = planet === 'nahara' && naharaBatches && enemy.kind !== 'fuel' ? (pod ? 'nahara_drone' : NAHARA_CRAFT[enemy.kind].node) : null;
        const coronaNode: CoronaCraftNode | null = (planet === 'corona' || (planet === 'nahara' && !naharaBatches)) && coronaBatches && enemy.kind !== 'fuel' ? (pod ? 'corona_drone' : CORONA_CRAFT[enemy.kind].node) : null;
        // The world's own faction (Nacre's craft also stand in on Amnion), else Vesper's or Khepri's models.
        const predator = pod ? undefined : (planet === 'amnion' && enemy.kind === 'diamond' ? predatorBatches.get('amnion_brood_heavy')
          : planet === 'umbra' && enemy.kind === 'wraith' ? predatorBatches.get('umbra_wraith') : undefined);
        const nacreBatch = predator ?? (naharaNode ? naharaBatches!.get(naharaNode) : coronaNode ? coronaBatches!.get(coronaNode) : umbraNode ? umbraBatches!.get(umbraNode) : nacreNode ? nacreBatches!.get(nacreNode) : undefined);
        const useVesper = !nacreBatch && enemy.kind !== 'fuel' && !!vesperBatches && (activeBatches === vesperBatches || VESPER_KINDS.has(enemy.kind));
        const batch = nacreBatch ?? (useVesper ? vesperBatches!.get(enemy.kind) : undefined) ?? enemyBatches.get(enemy.kind)!, slot = counts.get(batch.mesh) ?? 0;
        const vesperCraft = useVesper ? VESPER_CRAFT[enemy.kind as keyof typeof VESPER_CRAFT] ?? null : null;
        const craftScale = predator ? (enemy.kind === 'wraith' ? .76 : .82) : naharaNode && enemy.kind !== 'fuel' ? (pod ? NAHARA_DRONE_SCALE : NAHARA_CRAFT[enemy.kind].scale)
          : coronaNode && enemy.kind !== 'fuel' ? (pod ? CORONA_DRONE_SCALE : CORONA_CRAFT[enemy.kind].scale)
          : umbraNode && enemy.kind !== 'fuel' ? (pod ? UMBRA_DRONE_SCALE : UMBRA_CRAFT[enemy.kind].scale)
          : nacreBatch ? (nacreNode === 'nacre_pod' || enemy.kind === 'fuel' ? 1 : NACRE_CRAFT[enemy.kind].scale) : vesperCraft?.scale ?? 1;
        if (slot < ENEMY_CAPACITY && !siteCore && !((state.boss?.id === 'cradle' ? cradle : state.boss?.id === 'eclipse' ? eclipse : state.boss?.id === 'citadel' ? citadel : state.boss?.id === 'heliophage' ? heliophage : veil).hasPodModel && enemy.formation?.template === 'veil-pods')) {
          transform.position.set(placement.x ?? enemy.x, placement.baseHeight, -placement.s);
          // A craft breaking off for a boss turns toward the side it leaves by and banks into the turn.
          const turn = enemy.leaving && !isGround ? THREE.MathUtils.smoothstep(state.time - enemy.leaving.at, 0, .5) * enemy.leaving.side : 0;
          transform.rotation.set(0, turn * 1.9, (enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0) + turn * .5); transform.scale.setScalar(craftScale * unfold);
          const blink = enemy.blink, phase = blink ? (state.time - blink.startedAt) / WRAITH.teleport : 1;
          if (blink && phase >= 0 && phase < 1) {
            // Collapse at departure and unfold at arrival; never fly across the gap.
            const departing = phase < .5, u = departing ? phase * 2 : (phase - .5) * 2;
            const size = departing ? 1 - u * u : u * u;
            transform.position.set(departing ? blink.fromX : enemy.x, VIEW.flightHeight, -(departing ? blink.fromS : enemy.s));
            transform.scale.multiplyScalar(Math.max(.001, size));
            phaseHoles.add(blink.fromX, blink.fromS, 2.4 * Math.max(0, 1 - phase * 2));
            phaseHoles.add(enemy.x, enemy.s, 2.4 * Math.max(0, 1 - Math.abs(phase - .55) / .45));
          }
          transform.updateMatrix();
          batch.mesh.setMatrixAt(slot, transform.matrix); counts.set(batch.mesh, slot + 1);
          if (quality !== 'high') {
            // Ground kinds flatten onto their own base; craft onto the ground where the sun puts their shadow.
            const ground = isGround ? placement.baseHeight : blobLanding(sun, placement.x ?? enemy.x, placement.s, VIEW.flightHeight, groundAt).y;
            silhouettes.get(batch.mesh)?.setMatrixAt(slot, !isGround && onSea(ground) ? NOWHERE : flatten.multiplyMatrices(planarShadow(sun, ground + .02, flatProjection), transform.matrix));
          }
          const seen = enemyHp.get(enemy.id); enemyHp.set(enemy.id, enemy.hp);
          if (seen !== undefined && enemy.hp < seen) enemyHitAt.set(enemy.id, state.time);
          const kick = Math.max(0, 1 - (state.time - (enemyHitAt.get(enemy.id) ?? -9)) / HIT_FLASH);
          // A Relic Shield glows teal while its core is exposed (docs/39).
          const open = enemy.kind === 'relic' && relicExposed(enemy, state.time) ? 1 : 0;
          batch.mesh.setColorAt(slot, hitColor.setRGB(1 + 1.9 * kick + .1 * open, 1 + 1.6 * kick + .7 * open, 1 + 1.2 * kick + .65 * open));
        }
        if (isGround && !afloat && !siteCore && plinthCount < plinths.instanceMatrix.count) {
          let lowest = placement.baseHeight;
          // (At the seated x: under a perspective lens the ray moves a gun sideways off its logical x.)
          const seatX = placement.x ?? enemy.x;
          for (const [dx, ds] of PLINTH_CORNERS) lowest = Math.min(lowest, surfaceHeight(state.config.seed, seatX + dx, state.distance + placement.s + ds, world));
          if (placement.baseHeight - lowest > .08) {
            transform.position.set(seatX, lowest - .12, -placement.s); transform.rotation.set(0, 0, 0);
            transform.scale.set(1, placement.baseHeight + .06 - (lowest - .12), 1); transform.updateMatrix();
            plinths.setMatrixAt(plinthCount++, transform.matrix);
          }
        }
        // Plumes trail straight up the screen, so a craft turning away to leave for a boss draws none.
        if (!isGround && !enemy.leaving) {
          // Warm engine plumes trail behind hostile craft (their nozzles face away from the player).
          const bank = enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0;
          if (nacreBatch) for (const [ex, ez] of nacreBatch.engines) plume(enemy.x + ex * craftScale * Math.cos(bank), -enemy.s + ez * craftScale,
            -.3 * flicker(state.time, enemy.id + ex * 13), .12, nacreBatch.plume, 2.2);
          else if (vesperCraft) for (const [ex, ez] of vesperCraft.engines) plume(enemy.x + ex * vesperCraft.scale * Math.cos(bank), -enemy.s + ez * vesperCraft.scale,
            -.3 * flicker(state.time, enemy.id + ex * 13), .11, 0xff7a26, 2.2);
          else if (khepriEngines) for (const [ex, ez] of khepriEngines.get(enemy.kind) ?? NO_ENGINES) plume(enemy.x + ex * Math.cos(bank), -enemy.s + ez,
            -.32 * flicker(state.time, enemy.id + ex * 13), .12, 0xffa060, 1.9);
          else for (const side of SIDES) plume(enemy.x + side * .27 * Math.cos(bank), -enemy.s - .55, -.34 * flicker(state.time, enemy.id + side), .14, 0xffa060, 1.9);
        }
        if (enemy.kind === 'relic' && enemy.hp > enemy.maxHp * RELIC_ARMOR.breakBelow) {
          // Its armour: a closed bronze ring of six plates, turning slowly; while it is open (winding up and just after it
          // fires) the plates part and glow teal. Once broken it draws none.
          const open = relicExposed(enemy, state.time), r = enemy.radius + .32, part = open ? .26 : 0;
          for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + state.time * .5 + part, b = (k + 1) * Math.PI / 3 + state.time * .5 - part;
            line(enemy.x + Math.cos(a) * r, enemy.s + Math.sin(a) * r, enemy.x + Math.cos(b) * r, enemy.s + Math.sin(b) * r, open ? 0x6ffff0 : 0xd8a35a);
          }
        }
        // Ground brackets are drawn on the shared proxy, exactly over the physical luminous core.
        if (isGround || enemy.warning > 0) {
          const r = enemy.radius + .13, length = .16, tint = enemy.warning > 0 ? 0xffc987 : 0xdab482;
          for (const sx of SIDES) for (const sy of SIDES) {
            line(enemy.x + sx * r, enemy.s + sy * r, enemy.x + sx * (r - length), enemy.s + sy * r, tint);
            line(enemy.x + sx * r, enemy.s + sy * r, enemy.x + sx * r, enemy.s + sy * (r - length), tint);
          }
        }
        if (enemy.warning > 0 && enemy.kind === 'pulsar') {
          // Pulsar windup: an aim ray to the ship, following it (its stream will track the ship).
          aimRay(enemy.x, enemy.s, state.player.x, 0, chargeOf(enemy)); muzzle(enemy.x, enemy.s, chargeOf(enemy));
        } else if (enemy.warning > 0 && enemy.kind === 'needle') {
          // Needle windup: the beam's faint red preview at its committed aim, from the Needle down (beamPreview).
          beamPreview(enemy.aimX, enemy.s, .4, chargeOf(enemy));
        } else if (enemy.warning > 0 && enemy.kind === 'missile') {
          // Missile battery: a straight shot column from the battery down past the player row (non-tracking).
          shotColumn(enemy.x, enemy.s, enemy.ground?.muzzle?.x ?? enemy.x, chargeOf(enemy), state.time); muzzle(enemy.x, enemy.s, chargeOf(enemy));
        } else if (enemy.warning > 0 && enemy.kind === 'diamond') {
          // Diamond: an aim ray from the firing wing, and a bracket on the side it lands (1.2 to that side of the aim).
          const side = (enemy.volleys ?? 0) % 2 === 0 ? -1 : 1, wing = enemy.x + side * .55, charge = chargeOf(enemy);
          aimRay(wing, enemy.s, enemy.aimX, 0, charge); muzzle(wing, enemy.s, charge);
          strip(enemy.aimX - side * .35, .7, enemy.aimX, .35, .07, shotHex, flashLanes, .9 + charge); strip(enemy.aimX - side * .35, 0, enemy.aimX, .35, .07, shotHex, flashLanes, .9 + charge);
        } else if (enemy.warning > 0 && enemy.kind === 'lancer') {
          // Lancer: a beam ship; its windup is the beam's red preview from the Lancer down at its aim.
          beamPreview(enemy.aimX, enemy.s, beamSpec('lancer').width, chargeOf(enemy));
        } else if (enemy.warning > 0) {
          // Aimed shots: a ray to where they will cross the player's row; a turret's three-round spread shows its fan.
          const charge = chargeOf(enemy), angles = enemy.kind === 'turret' ? TURRET_FAN : SINGLE_RAY;
          const aim = Math.atan2(enemy.aimX - enemy.x, enemy.s);
          for (const turn of angles) aimRay(enemy.x, enemy.s, enemy.x + Math.tan(aim + turn) * enemy.s, 0, charge * (turn ? .7 : 1));
          muzzle(enemy.x, enemy.s, charge);
        }
      }
      // Hunter shells (src/sim/hunters.ts): one per live hunter in view, in the world's glow, dimming charge by charge.
      let shellCount = 0;
      for (const enemy of state.enemies) {
        if (!enemy.hunter || enemy.hp <= 0 || shellCount >= hunterShells.length || (enemy.blink && state.time - enemy.blink.startedAt < WRAITH.teleport)) continue;
        const { energy, grow } = shellEnergy(enemy.id, hunterCharges(enemy), HUNTERS.shield.charges, enemyHitAt.get(enemy.id) ?? -9, state.time);
        if (energy <= 0) continue;
        const mesh = hunterShells[shellCount++], uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        mesh.position.set(enemy.x, VIEW.flightHeight, -enemy.s); mesh.scale.setScalar((enemy.radius * 1.6 + .25) * grow);
        uniforms.color.value.setHex(PLANET_GLOW[planet]); uniforms.energy.value = energy * 1.4; uniforms.time.value = state.time + enemy.id; mesh.visible = true;
      }
      for (let i = shellCount; i < hunterShells.length; i++) hunterShells[i].visible = false;
      for (const id of shellSeen.keys()) if (id >= 0 && !liveIds.has(id)) { shellSeen.delete(id); shellBroke.delete(id); }
      // Ground wrecks: a new run (or a rewind) clears them; a ground target killed on screen leaves one.
      if (wreckRun !== state.config || state.tick < wreckTick) { wrecks.length = 0; groundSeen.clear(); emplacements.length = 0; emplaced.clear(); wreckRun = state.config; }
      // District pads are reserved (docs/23 §4.8): compounds and emplacement pieces keep out; batteries never move.
      // Strike sites are reserved too, and their clearings come first (the terrain takes at most 12).
      const siteClearings = sites.clearings;
      const reserved = [...terrain.reservedSites(), ...siteClearings];
      facilities.update(state, planet, groundNow, reserved, (x, s) => surfaceHeight(state.config.seed, x, s, world), view);
      terrain.setFacilityClearings([...siteClearings, ...facilities.clearings]);
      // The compact legacy layout is retained for guns that cannot seat a larger compound.
      if (planet === 'khepri' || planet === 'vesper') for (const [id, spot] of groundNow) {
        if (emplaced.has(id) || spot.afloat || spot.kind === 'fuel' || facilities.contains(id)) continue;
        emplaced.add(id);
        const roll = Math.abs(Math.sin(id * 78.233) * 43758.5453 % 1);
        if (roll < .25) continue;
        const layout = EMPLACEMENT_LAYOUTS[Math.floor(roll * 997) % EMPLACEMENT_LAYOUTS.length], flip = roll * 13 % 1 < .5 ? -1 : 1;
        for (const [node, dx, ds, yaw] of layout) {
          const r = EMPLACEMENT_RADIUS[node];
          // The authored spot first, then alternatives around the battery: the first that is clear and level wins.
          const spots: [number, number][] = [[dx, ds], [-dx, ds], [dx + 2.4, ds - 1], [dx - 2.4, ds - 1], [dx, ds + 1.2], [2.8, -0.8], [-2.8, -0.8]];
          for (const [ox, os] of spots) {
            const x = spot.groundX + ox * flip, worldS = spot.groundS + os;
            if (Math.abs(x) > VIEW.worldWidth / 2 - r) continue;
            if (reserved.some(site => x + r > site.minX && x - r < site.maxX && worldS + r > site.minS && worldS - r < site.maxS)) continue;
            // Clear of every battery (its own too) and of the other emplacement pieces.
            let blocked = Math.hypot(ox, os) < r + .7;
            for (const [other, o] of groundNow) if (other !== id && Math.hypot(o.groundX - x, o.groundS - worldS) < r + .75) blocked = true;
            for (const e of emplacements) if (Math.hypot(e.x - x, e.worldS - worldS) < r + EMPLACEMENT_RADIUS[e.node] + .1) blocked = true;
            if (blocked) continue;
            // On dry, fairly level ground, seated at the mean height (a hall tolerates ±0.35, the rest ±0.25).
            const offsets = [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].map(([cx, cs]) => [x + cx * .8, worldS + cs * .8]);
            const corners = offsets.map(([px, ps]) => surfaceHeight(state.config.seed, px, ps, world));
            if (Math.max(...corners) - Math.min(...corners) > (node === 'facility' ? .7 : .5)) continue;
            if (world.planet.seaLevel !== null && offsets.some(([px, ps]) => terrainHeight(state.config.seed, px, ps, world) < sea - .05)) continue;
            emplacements.push({ node, x, worldS, y: corners.reduce((sum, h) => sum + h, 0) / corners.length - .04, yaw: flip < 0 && yaw ? -yaw : yaw });
            break;
          }
        }
        if (emplacements.length > 60) emplacements.splice(0, emplacements.length - 60);
      }
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
        if (!mesh || wreck.x < view.minX - 2 || wreck.x > view.maxX + 2) continue;
        transform.position.set(wreck.x, wreck.y, -(wreck.worldS - state.distance)); transform.rotation.set(0, wreck.yaw, 0); transform.scale.setScalar(1); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      wreckBatches.forEach(mesh => liveInstances(mesh, mesh.count));
      for (let i = emplacements.length - 1; i >= 0; i--) if (emplacements[i].worldS - state.distance < VIEW.minS - 4) emplacements.splice(i, 1);
      emplacementBatches.forEach(mesh => { mesh.count = 0; });
      for (const piece of emplacements) {
        const mesh = emplacementMesh(piece.node);
        if (!mesh || mesh.count >= mesh.instanceMatrix.count || piece.x < view.minX - 3 || piece.x > view.maxX + 3) continue;
        transform.position.set(piece.x, piece.y, -(piece.worldS - state.distance)); transform.rotation.set(0, piece.yaw, 0); transform.scale.setScalar(1); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      emplacementBatches.forEach(mesh => liveInstances(mesh, mesh.count));
      settleBatches(enemyBatches); settleBatches(vesperBatches); settleBatches(nacreBatches); settleBatches(umbraBatches); settleBatches(coronaBatches); settleBatches(naharaBatches); settleBatches(predatorBatches);
      liveInstances(flightShadows, shadowCount); liveInstances(plinths, plinthCount); liveInstances(pontoons, pontoonCount);
      // A round a ground battery released since the last frame is drawn leaving from the battery as drawn.
      if (state.tick < launchTick) { batteryWindups.clear(); launches.clear(); seenShots.clear(); }
      launchTick = state.tick;
      releasedBatteries.length = 0;
      for (const [id, windup] of batteryWindups) {
        const battery = enemyWithId(state, id);
        if (battery?.ground?.muzzle) continue;
        releasedBatteries.push(battery ? { ...windup, x: battery.x, s: battery.s } : windup); batteryWindups.delete(id);
      }
      // A battery still winding up keeps its record, rewritten in place (a released one was taken out above).
      for (const enemy of state.enemies) if (enemy.ground?.muzzle) {
        const forecast = enemy.ground.muzzle, windup = batteryWindups.get(enemy.id);
        if (windup) { windup.muzzle.x = forecast.x; windup.muzzle.s = forecast.s; windup.x = enemy.x; windup.s = enemy.s; }
        else batteryWindups.set(enemy.id, { muzzle: { x: forecast.x, s: forecast.s }, x: enemy.x, s: enemy.s });
      }
      liveShots.clear(); for (const shot of state.projectiles) liveShots.add(shot.id);
      for (const id of seenShots) if (!liveShots.has(id)) { seenShots.delete(id); launches.delete(id); }
      for (const shot of state.projectiles) {
        if (shot.friendly || seenShots.has(shot.id)) continue;
        seenShots.add(shot.id);
        for (const battery of releasedBatteries) {
          const launch = launchFrom(shot, battery.muzzle, battery);
          if (launch) { launches.set(shot.id, launch); break; }
        }
      }
      let friendlyCount = 0, hostileCount = 0, missileCount = 0;
      // Main-weapon tiers 4 and 5 draw hotter and larger (fx-particles `shotHeat`); everything in flight follows the current tier.
      const heat = shotHeat(state.player.power);
      // Amnion uses acid-green fire over its warm yolk canyons
      // with a pale core, apart from the yolk and from the player's own white-cyan shots (docs/27).
      hostileMaterial.color.setHex(hostileHues(planet)[0]); hostileCoreMaterial.color.setHex(hostileHues(planet)[1]);
      // A new run (or a replay) restarts the tick: drop the old run's trails.
      if (state.tick < railTick) { railTrails.clear(); railKickAt = -1; }
      railTick = state.tick;
      for (const trail of railTrails.values()) trail.endedAt ??= state.time;
      for (const sim of state.projectiles) {
        if (!sim.pierced) continue;
        const trail = railTrails.get(sim.id);
        if (trail) { trail.x = sim.x; trail.s = sim.s; trail.endedAt = undefined; }
        else { railTrails.set(sim.id, { x0: sim.x - sim.vx * .02, s0: .55, x: sim.x, s: sim.s }); railKickAt = state.time; }
      }
      for (const [id, trail] of railTrails) {
        const fade = trail.endedAt === undefined ? 1 : 1 - (state.time - trail.endedAt) / .14;
        if (fade <= 0) { railTrails.delete(id); continue; }
        // Tapered: faint near the muzzle, brighter toward the slug, so it reads as a shot, not a standing beam.
        const head = Math.min(trail.s, VIEW.maxS + 1);
        for (let k = 0; k < 3; k++) {
          const a = k / 3, b = (k + 1) / 3, glow = (.35 + .4 * k) * fade;
          const xa = trail.x0 + (trail.x - trail.x0) * a, sa = trail.s0 + (head - trail.s0) * a, xb = trail.x0 + (trail.x - trail.x0) * b, sb = trail.s0 + (head - trail.s0) * b;
          strip(xa, sa, xb, sb, .12 + .04 * k, 0x5ff3ff, flashLanes, glow);
          strip(xa, sa, xb, sb, .04, 0xffffff, flashLanes, glow * 1.5);
        }
        // The slug itself: a white-hot streak at the head while it flies.
        if (trail.endedAt === undefined) strip(trail.x, Math.max(trail.s0, head - 1.2 * heat.grow), trail.x, head, .17 * heat.grow, 0xffffff, flashLanes, 2.6);
      }
      if (trailRun !== state || trailLives !== state.player.lives || trailLook !== heroShown) heroTrail.clear();
      trailRun = state; trailLives = state.player.lives; trailLook = heroShown;
      if (!heroAlive || entrance <= .9 || state.jump) heroTrail.clear();
      else heroTrail.draw(state.time, state.distance, hero.position.x, hero.position.z, Math.cos(hero.rotation.z), heroEngines, HERO_SCALE, trailEndZ, trailSegment);
      // Interceptor Barrel Roll: two speed streaks from where the dash started to the ship's trailing wing, fading out.
      const dash = state.player.dash, dashFade = dash ? 1 - (state.time - dash.startedAt) / DASH_STREAK : 0;
      if (dash && dashFade > 0 && dashFade <= 1) {
        const tail = state.player.x - dash.direction * .45;
        if ((tail - dash.fromX) * dash.direction > .1) for (const s of DASH_STREAKS) strip(dash.fromX, s, tail, s, .05, 0x5ff3ff, flashLanes, dashFade * 1.4);
      }
      const [hostileHex] = hostileHues(planet);
      wallShots.length = 0;
      for (const sim of state.projectiles) {
        // A held shot that shows before it flies (a Skimmer's split, a Fracture Wave's wall, docs/39): a harmless glint,
        // pulsing and growing until it leaves.
        if (sim.delay && sim.show && sim.delay <= sim.show && !sim.friendly && Math.abs(sim.x - state.cameraX) <= VIEW.width / 2 + .5) {
          // A ring closing in on its point, and a tick along the way it will fly.
          const u = 1 - sim.delay / sim.show, pulse = .6 + .4 * Math.sin(state.time * 34 + sim.id), r = .42 - .22 * u;
          for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + state.time * 3, b = a + .7;
            strip(sim.x + Math.cos(a) * r, sim.s + Math.sin(a) * r, sim.x + Math.cos(b) * r, sim.s + Math.sin(b) * r, .045, hostileHex, flashLanes, (.6 + 1.2 * u) * pulse);
          }
          const speed = Math.hypot(sim.vx, sim.vs) || 1, reach = .25 + .45 * u;
          strip(sim.x, sim.s, sim.x + sim.vx / speed * reach, sim.s + sim.vs / speed * reach, .05, 0xffffff, flashLanes, .9 * u * pulse);
        }
        // A Fracture Wave's wall in flight: its shots linked by a faint band, so the wall and its gap read at a glance.
        if (sim.show && !sim.friendly && !sim.delay && sim.vx === 0 && sim.ttl > 0) wallShots.push(sim);
        // A Boomerang Barrage shot flares as it turns (its lateral speed passing through zero).
        if (!sim.friendly && sim.ax && !sim.delay && Math.abs(sim.x - state.cameraX) <= VIEW.width / 2 + .5) {
          const turning = Math.max(0, 1 - Math.abs(sim.vx) / 1.4);
          if (turning > 0) for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2 + state.time * 6, r = .3 + .15 * (1 - turning);
            strip(sim.x + Math.cos(a) * r, sim.s + Math.sin(a) * r, sim.x + Math.cos(a + .9) * r, sim.s + Math.sin(a + .9) * r, .04, hostileHex, flashLanes, 1.4 * turning);
          }
        }
        if (sim.delay || sim.pierced || Math.abs(sim.x - state.cameraX) > VIEW.width / 2 + .5 || sim.s < VIEW.minS - 1 || sim.s > VIEW.maxS + 1) continue;
        if (sim.reflected) {
          const orbit = sim.orbit;
          if (orbit) {
            const end = orbit.angle + orbit.direction * Math.PI * orbit.elapsed / SHIP_PERKS.reflectDuration;
            const span = Math.min(orbit.elapsed / SHIP_PERKS.reflectDuration * Math.PI, 1.3);
            for (let i = 0; i < 8; i++) {
              const a = end - orbit.direction * span * (1 - i / 8), b = end - orbit.direction * span * (1 - (i + 1) / 8);
              // A narrow dark backing keeps the arc readable over Luna snow without extra bloom.
              strip(state.player.x + Math.cos(a) * orbit.radius, Math.sin(a) * orbit.radius,
                state.player.x + Math.cos(b) * orbit.radius, Math.sin(b) * orbit.radius, .09, 0x392354, telegraphs, 1);
              strip(state.player.x + Math.cos(a) * orbit.radius, Math.sin(a) * orbit.radius,
                state.player.x + Math.cos(b) * orbit.radius, Math.sin(b) * orbit.radius, .045, 0xb58aff, flashLanes, .35 + i * .1);
            }
          } else {
            const speed = Math.hypot(sim.vx, sim.vs) || 1;
            strip(sim.x - sim.vx / speed * .45, sim.s - sim.vs / speed * .45, sim.x, sim.s, .065, 0xb58aff, flashLanes, 1);
          }
        }
        // A launched round is drawn where its launch puts it (its place and heading; the rest is the projectile's own).
        const launch = sim.friendly ? undefined : launches.get(sim.id), at = launch ? drawnShot(sim, launch) : sim;
        transform.position.set(at.x, VIEW.flightHeight + .04, -at.s);
        transform.rotation.set(0, Math.atan2(at.vx, -at.vs), 0);
        if (sim.special && missiles) {
          // Model nose toward +Z: yaw it along the flight (world z = −s); scaled up a touch so it reads as a missile.
          transform.rotation.set(0, Math.atan2(at.vx, -at.vs), 0); transform.scale.setScalar(1.25); transform.updateMatrix();
          if (missileCount < missiles.instanceMatrix.count) missiles.setMatrixAt(missileCount++, transform.matrix);
        } else if (sim.friendly) {
          if (brightGround && friendlyCount < friendly.instanceMatrix.count) {
            transform.scale.set(.1 * heat.grow, .05, .36 * heat.grow); transform.updateMatrix(); friendlyOutline.setMatrixAt(friendlyCount, transform.matrix);
          }
          transform.scale.set(.045 * heat.grow, .045, .27 * heat.grow); transform.updateMatrix();
          if (friendlyCount < friendly.instanceMatrix.count) friendly.setMatrixAt(friendlyCount++, transform.matrix);
        } else {
          transform.scale.set(sim.radius * 1.25, .08, sim.radius * 1.65); transform.updateMatrix();
          if (hostileCount < hostile.instanceMatrix.count) {
            hostile.setMatrixAt(hostileCount, transform.matrix);
            transform.scale.multiplyScalar(.49); transform.updateMatrix(); hostileCores.setMatrixAt(hostileCount++, transform.matrix);
          }
          // Known moving threats keep world trajectories; panning reveals these edge chevrons.
        }
      }
      wallShots.sort((p, q) => p.s - q.s || p.x - q.x);
      for (let i = 1; i < wallShots.length; i++) {
        const p = wallShots[i - 1], q = wallShots[i];
        if (Math.abs(p.s - q.s) > 1e-3 || q.x - p.x > 1.3 || Math.abs(q.x - state.cameraX) > VIEW.width / 2 + 1.5) continue;
        strip(p.x + .14, p.s, q.x - .14, q.s, .065, hostileHex, flashLanes, .75);
      }
      for (const shot of state.projectiles) {
        if (shot.friendly || shot.s < -.2 || shot.s > 4) continue;
        const dx = shot.x - state.cameraX;
        if (Math.abs(dx) <= VIEW.width / 2 || Math.abs(dx) >= VIEW.width / 2 + 2 || dx * shot.vx >= 0) continue;
        const x = state.cameraX + Math.sign(dx) * 5.8;
        line(x, shot.s, x - Math.sign(dx) * .2, shot.s + .2, 0xffa174);
        line(x, shot.s, x - Math.sign(dx) * .2, shot.s - .2, 0xffa174);
      }
      if (missiles) liveInstances(missiles, missileCount);
      liveInstances(friendly, friendlyCount); liveInstances(hostile, hostileCount); liveInstances(hostileCores, hostileCount);
      liveInstances(friendlyOutline, brightGround ? friendlyCount : 0);
      friendlyMaterial.color.setHex(brightGround ? 0x1fd2ff : 0xbcfff8);
      if (!brightGround) friendlyMaterial.color.multiplyScalar(heat.energy);

      pickupBatches.forEach(mesh => { mesh.count = 0; });
      for (const pickup of state.pickups) {
        const mesh = pickupBatches.get(pickupIcon(pickup))!;
        if (mesh.count >= mesh.instanceMatrix.count) continue;
        // A gentle bob and sway, plus a soft breathing scale so drops catch the eye; they fade in their last 2 s.
        const breathe = 1 + Math.sin(state.time * 3.2 + pickup.id) * .045, fade = pickup.ttl < 2 ? .55 + .45 * Math.abs(Math.cos(state.time * 9)) : 1;
        transform.position.set(pickup.x, VIEW.flightHeight + .06 + Math.sin(state.time * 2 + pickup.id) * .035, -pickup.s);
        // A full turn about its upright axis (user, 7 November: "full 360 but ... when we see it it turns slow but when its
        // turning it turns quickly"): three quarters of each cycle it faces the camera, drifting slowly through ±17°; the
        // last quarter is one quick turn with an elastic settle. A glint right after the turn, a little darker side-on.
        const spin = pickupSpin(state.time + pickup.id * .73);
        transform.rotation.set(-ELEVATION, spin.angle, Math.sin(state.time * .75 + pickup.id) * .08);
        transform.scale.setScalar(breathe * (pickup.ttl < 2 ? fade : 1)); transform.updateMatrix();
        mesh.setColorAt(mesh.count, pickupShade.setScalar(spin.light));
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      pickupBatches.forEach(mesh => { liveInstances(mesh, mesh.count); if (mesh.count && mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
      // Siege Lance (campaign special): a bright piercing beam straight ahead from the ship's nose while it fires.
      if (state.lance && state.time < state.lance.until) {
        const left = state.lance.until - state.time, flare = Math.min(1, left / .12) * (.85 + .15 * Math.sin(state.time * 60));
        strip(state.player.x, .5, state.player.x, VIEW.maxS + 2, .9, 0x7fefff, flashLanes, 1.6 * flare);
        strip(state.player.x, .5, state.player.x, VIEW.maxS + 2, .32, 0xffffff, flashLanes, 2.6 * flare);
      }
      for (const hazard of state.hazards) {
        // A beam runs from whatever fires it (a Needle at its aim, a locked beam ship, the boss column over it; else the
        // boss's row) down past the bottom of the view, never up past its source (user, 23 October: lasers "extend way
        // beyond the enemies past them to the top of the screen").
        const source = beamSource(state, hazard);
        const top = Math.min(VIEW.maxS, source ? source.s : state.boss ? state.boss.s : VIEW.maxS);
        if (hazard.warning > 0) beamPreview(hazard.x, top, hazard.width, 1 - Math.min(1, hazard.warning / 1.4));
        else if (hazard.active > 0) beamLive(hazard.x, top, hazard.width);
      }
      beamLight.end(); phaseHoles.end();
      for (const mesh of lanes) liveInstances(mesh, laneCounts.get(mesh) ?? 0);
      const wave = state.shockwave;
      shockRings.forEach((ring, k) => {
        ring.visible = !!wave;
        if (!wave) return;
        const radius = Math.max(.2, SPECIALS.shockwave.speed * (state.time - wave.startedAt)), fade = 1 - Math.min(1, radius / SPECIALS.shockwave.reach);
        ring.position.set(wave.x, VIEW.flightHeight + .05, -wave.s); ring.scale.setScalar(radius);
        shockMaterials[k].opacity = (k ? .22 : .95) * fade;
      });
      // Gravity Well: flies from the nose to its anchor while arming, then spins; swallowing a shot flashes the ring.
      const live = state.well;
      well.visible = !!live;
      if (live) {
        const arm = Math.min(1, (state.time - live.startedAt) / Math.max(1e-3, live.armedAt - live.startedAt)), ease = 1 - (1 - arm) ** 3;
        const sPos = .6 + (live.s - .6) * ease, ending = Math.max(0, 1 - (live.until - state.time) / .35);
        if (live.swallowed > wellSwallowed) wellFlashAt = state.time;
        wellSwallowed = live.swallowed;
        const wellFlash = wellFlashAt < 0 ? 0 : Math.max(0, 1 - (state.time - wellFlashAt) * 5);
        well.position.set(live.x, VIEW.flightHeight + .06, -sPos);
        const grow = 1.35 * (.35 + .65 * ease) * (1 - .55 * ending);
        well.scale.setScalar(grow);
        wellAccretion.rotation.y = state.time * 3.4; wellHalo.rotation.y = -state.time * 1.3;
        wellRingMaterial.opacity = .75 + .25 * wellFlash;
        (wellHalo.material as THREE.MeshBasicMaterial).opacity = (.22 + .3 * wellFlash) * ease;
        wellReach.forEach((ring, k) => { (ring.material as THREE.MeshBasicMaterial).opacity = (k ? .16 : .2) * ease * (.8 + .2 * Math.sin(state.time * 5 + k)); ring.scale.setScalar(1 / Math.max(.2, grow)); });
        // The lens: on screen where the well is, as wide as its swallow radius (every shot it bends there is removed anyway, and
        // the ship's row is never warped), deepening as it nears its collapse.
        well.updateMatrixWorld();
        lensPoint.set(live.x, VIEW.flightHeight, -sPos).project(camera); lensEdge.set(live.x + wellSpec.swallowRadius, VIEW.flightHeight, -sPos).project(camera);
        const aspect = drawingWidth / Math.max(1, drawingHeight);
        wellLens.on = true; wellLens.x = lensPoint.x * .5 + .5; wellLens.y = lensPoint.y * .5 + .5;
        wellLens.radius = Math.abs(lensEdge.x - lensPoint.x) * .5 * aspect * ease;
        wellLens.strength = (.45 + .45 * ending) * ease * (1 - Math.max(0, (state.time - live.until + .06) / .06));
        wellLens.swirl = (1.5 + .6 * Math.sin(state.time * 2.2)) * ease;
      } else { wellSwallowed = 0; wellLens.on = false; }
      post.settings.lens.value.set(wellLens.x, wellLens.y, wellLens.radius, wellLens.on ? wellLens.strength : 0); post.settings.lensSwirl.value = wellLens.swirl;
      let effectCount = 0;
      for (const effect of state.effects) {
        if (effect.kind === 'special') continue;
        if (effectCount >= effects.instanceMatrix.count) break;
        const age = Math.max(0, Math.min(1, 1 - effect.ttl / effect.duration));
        const radius = effect.kind === 'bossBlast' ? 1 + age * 11 : effect.kind === 'blast' ? .4 + age * 3 : effect.kind === 'explosion' ? .15 + age * .8 : .08 + age * .4;
        transform.position.set(effect.x, VIEW.flightHeight + .04, -effect.s);
        transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.setScalar(radius); transform.updateMatrix();
        effects.setMatrixAt(effectCount, transform.matrix);
        const tint = effect.kind === 'explosion' || effect.kind === 'hit' || effect.kind === 'blast' || effect.kind === 'bossBlast' ? 0xf9b67f : effect.kind === 'shield' ? heroGlow : 0x97e7da;
        color.setHex(tint).multiplyScalar(1 - age * .75); effects.setColorAt(effectCount++, color);
      }
      liveInstances(effects, effectCount);
      // Vesper: debris that falls on open water throws snow-white spray; vent stacks breathe steam.
      const seaHeight = world.planet.seaLevel;
      // An explosion's light lands where the view ray through it meets the ground (or the sea), like a ground target.
      const ground = (x: number, z: number) => {
        const seat = (y: number) => { const at = fromFlightPlane(state.cameraX, x, -z, y); return { at, gap: y - surfaceHeight(state.config.seed, at.x, state.distance + at.s, world) }; };
        let above: number = VIEW.flightHeight, below = above;
        for (let y = above - 1; y >= TERRAIN_MIN_HEIGHT - 1; y -= 1) { if (seat(y).gap <= 0) { below = y; break; } above = y; }
        if (below === VIEW.flightHeight) return null;
        for (let i = 0; i < 6; i++) { const mid = (above + below) / 2; if (seat(mid).gap > 0) above = mid; else below = mid; }
        const y = (above + below) / 2, { at } = seat(y);
        return { x: at.x, y, z: -at.s };
      };
      plumes.length = plumeCount;
      fx.update(state, plumes, terrain.haulerDust, planet === 'vesper' && seaHeight !== null ? {
        splash: (x, z) => terrainHeight(state.config.seed, x, state.distance - z, world) < seaHeight - .05 ? seaHeight : null,
        vents: collectVents(state.cameraX), ground,
      } : { splash: () => null, vents: [], ground }, id => launches.get(id), heroGlow);
      // The ocean and its foam follow the terrain, which streams the next planet ahead of a jump's flash.
      water.update(state.time, state.distance); mireWater.update(state.time, state.distance);
      const arkFoam = ark.foam;
      // Floes carry their own coastline foam (terrain-view.ts); the oval rings are for round pontoons and the Ark.
      // The Ark's rings join the pontoons' in this frame's scratch list (foam.update reads it at once).
      for (const ring of arkFoam.rings) pontoonRings.push(ring);
      foam.update(state.time, pontoonRings, arkFoam.wakes);
      jumpActive = jumpFx.update(state, reducedMotion(), planetReady(state.jump?.to ?? state.planet ?? planet), quality === 'high');
      post.settings.cover.value = jumpFx.cover;
      lineGeometry.setDrawRange(0, lineCursor); lines.visible = lineCursor > 0;
      for (const name of LINE_ATTRIBUTES) {
        const attribute = lineGeometry.getAttribute(name) as THREE.BufferAttribute;
        attribute.clearUpdateRanges();
        if (lineCursor > 0) { attribute.addUpdateRange(0, lineCursor * 3); attribute.needsUpdate = true; }
      }
      // A slight camera shake on explosions and hits (user, 13 November), only for the draw: placements and rays this frame
      // used the true camera. Trauma from new effects and a hit decays quickly; the offset grows with its square.
      // (A new run restarts the clock and the ids: start afresh.)
      if (state.time < shakeTime) { shakeTrauma = 0; shakeEffect = -1; shakeHit = state.player.lastHitAt; shakeLives = state.livesLost; }
      const shakeDt = shakeTime < 0 || state.time < shakeTime ? 0 : Math.min(.1, state.time - shakeTime); shakeTime = state.time;
      shakeTrauma = Math.max(0, shakeTrauma - shakeDt * 2.2);
      if (state.player.lastHitAt !== shakeHit) { if (shakeDt > 0 && state.player.lastHitAt > state.time - .2) shakeTrauma += state.livesLost > shakeLives ? .65 : .4; shakeHit = state.player.lastHitAt; }
      shakeLives = state.livesLost;
      for (const effect of state.effects) if (effect.id > shakeEffect) {
        shakeEffect = effect.id;
        if (shakeDt > 0) shakeTrauma += effect.kind === 'bossBlast' ? .6 : effect.kind === 'blast' ? .14 : effect.kind === 'explosion' ? .07 : 0;
      }
      shakeTrauma = Math.min(1, shakeTrauma);
      const shake = reducedMotion() || jumpActive ? 0 : shakeTrauma * shakeTrauma * SHAKE_AMPLITUDE;
      const shakeX = shake * (Math.sin(state.time * 47.3) + .5 * Math.sin(state.time * 89.1)), shakeY = shake * (Math.sin(state.time * 53.7 + 1.3) + .5 * Math.sin(state.time * 97.9 + .4));
      if (shake > 0) { camera.position.x += shakeX; camera.position.y += shakeY; camera.updateMatrixWorld(); }
      const renderStart = performance.now();
      passes.shadow = 0;
      if (quality === 'high') {
        post.render(scene, camera);
        passes.post = 6; passes.main = renderer.info.render.calls - passes.shadow - passes.post;
      } else {
        renderer.setRenderTarget(null); renderer.render(scene, camera);
        passes.shadow = passes.post = 0; passes.main = renderer.info.render.calls;
        if (wellLens.on && wellLens.strength > 0) {
          renderer.getDrawingBufferSize(drawingSize);
          if (!lensFrame || lensFrame.image.width !== drawingSize.x || lensFrame.image.height !== drawingSize.y) { lensFrame?.dispose(); lensFrame = new THREE.FramebufferTexture(drawingSize.x, drawingSize.y); }
          renderer.copyFramebufferToTexture(lensFrame);
          lensMaterial.uniforms.frame.value = lensFrame; lensMaterial.uniforms.ratio.value = drawingSize.x / Math.max(1, drawingSize.y);
          lensMaterial.uniforms.lens.value.set(wellLens.x, wellLens.y, wellLens.radius, wellLens.strength); lensMaterial.uniforms.lensSwirl.value = wellLens.swirl;
          const clear = renderer.autoClear; renderer.autoClear = false; renderer.render(lensScene, lensCamera); renderer.autoClear = clear;
        }
      }
      if (shake > 0) { camera.position.x -= shakeX; camera.position.y -= shakeY; camera.updateMatrixWorld(); }
      if (state.tick > 0) terrainWork.renderMax = Math.max(terrainWork.renderMax, performance.now() - renderStart);
      // Development evidence: shader programs compiled after the warm-up stall a frame (a hang on phones).
      if (import.meta.env.DEV && warmed) {
        const programs = renderer.info.programs ?? [];
        const log = ((window as unknown as { __lateShaders?: string[] }).__lateShaders ??= []);
        for (const program of programs) if (!knownPrograms.has(program)) {
          knownPrograms.add(program);
          log.push(`${state.time.toFixed(2)} created ${program.name} ${(performance.now() - renderStart).toFixed(0)}ms ${program.cacheKey.replace(/\s+/g, ' ').slice(0, 300)}`);
        }
        // A program compiled ahead but first used now also stalls (the driver finishes compiling on first use).
        for (const program of programs as unknown as { name: string; cacheKey: string; getUniforms(): unknown; __watched?: boolean; __used?: boolean }[]) {
          if (program.__watched) continue;
          // Programs created by a hidden warm-up render were used by it already.
          program.__watched = true; program.__used = hiddenWarm;
          const original = program.getUniforms.bind(program);
          program.getUniforms = () => {
            if (!program.__used) {
              program.__used = true;
              ((window as unknown as { __lateShaders?: string[] }).__lateShaders ??= []).push(`${lastRenderTime.toFixed(2)} first-use ${program.name} ${program.cacheKey.replace(/\s+/g, ' ').slice(0, 300)}`);
            }
            return original();
          };
        }
      }
      // QA stats (a scene walk and a JSON string every second) only where something reads them: development (the browser
      // specs, the perf bench) and the `?perf` overlay; never on an ordinary production flight (docs/38 PF2).
      if (qaStats && (state.tick - lastStatsTick >= 60 || state.tick < lastStatsTick)) {
        // Read-only browser QA evidence; never a gameplay HUD or a simulation input.
        canvas.dataset.renderStats = JSON.stringify({
          sections: 3, terrain: terrain.stats, stream: terrain.streamStats, bastion: bastion.stats, ark: ark.stats, warden: warden.stats, veil: veil.stats, cradle: cradle.stats, eclipse: eclipse.stats, planet, jump: jumpActive,
          terrainWorkMs: { last: +terrainWork.last.toFixed(2), max: +terrainWork.max.toFixed(2), over4: terrainWork.over4, frames: terrainWork.frames,
            renderMax: +terrainWork.renderMax.toFixed(2), updateMax: +terrainWork.updateMax.toFixed(2),
            animateMax: +terrainWork.animateMax.toFixed(2), prefetchMax: +terrainWork.prefetchMax.toFixed(2) },
          calls: renderer.info.render.calls, passes: { ...passes }, tier: quality, camera: cameraMode, pixelRatio: renderer.getPixelRatio(),antialias:true,
          triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0,
          textures: renderer.info.memory.textures, particles: fx.particles, fxCoverage: fx.coverage, laneCoverage: Math.round(laneArea / (VIEW.width * TACTICAL_HEIGHT) * 1000) / 1000, heroModel, facilities: facilities.stats, sites: sites.stats, enemies: [...counts.values()].reduce((n, count) => n + count, 0),
          predators: Object.fromEntries([...predatorBatches].map(([name, batch]) => [name, batch.mesh.count])),
          graph: graphStats(scene, query.has('graph') ? {} : undefined),
        });
        lastStatsTick = state.tick;
      }
    },
    /** `?perf` run log (src/ui/perf-log.ts): this frame's counters, read-only. */
    perfSample() {
      const stream = terrain.streamStats as { prefetched?: number; fallbacks?: number; startup?: number };
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs?.length ?? 0,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, terrainMs: terrainWork.last,
        prefetched: stream.prefetched ?? 0, fallbacks: stream.fallbacks ?? 0, startup: stream.startup ?? 0,
        particles: fx.particles, planet, quality, pixelRatio: renderer.getPixelRatio() };
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
      fx.dispose(); facilities.dispose(); sites.dispose(); scene.traverse(collect);
      const textures=new Set<THREE.Texture>();
      usedMaterials.forEach(material=>Object.values(material).forEach(value=>{if(value instanceof THREE.Texture && value !== environment.texture)textures.add(value);}));
      geometries.forEach(geometry => geometry.dispose()); usedMaterials.forEach(material => material.dispose());textures.forEach(texture=>texture.dispose());
      terrain.dispose(); terrainMaterials.dispose(); mireWater.dispose(); coronaArcs.dispose(); coronaHaze.dispose(); motes.dispose(); basaltRaft.dispose(); environment.dispose(); skies.forEach(sky => sky.dispose());
      lensFrame?.dispose(); lensMaterial.dispose(); lensQuad.geometry.dispose();
      sunlight.shadow.dispose(); post.dispose(); jumpFx.dispose(); beamLight.dispose(); phaseHoles.dispose(); instancedDepth.dispose();
      renderer.dispose();
    },
  };
}
