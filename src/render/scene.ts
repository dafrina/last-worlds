import * as THREE from 'three';
import { VIEW, type EnemyKind, type GameRenderer, type GraphicsQuality, type Pickup, type RunState } from '../shared/contracts';
import { SUN_DIRECTION, TERRAIN_MIN_HEIGHT, terrainHeight } from '../world/terrain';
import { createDesertEnvironment, createEnemy, createHero, createMaterials, createPickupModel } from './models';
import { createFallbackInfra, createFallbackShared, createSharedMaterial, createTerrainMaterials, loadKhepriInfra, loadKhepriKit, loadKhepriTextures, loadSharedKit } from './terrain-kit';
import { createTerrainView } from './terrain-view';
import { createPostPipeline } from './post-pipeline';
import { createFx, type Plume } from './fx-particles';
import { BASTION_FOOTPRINT, createBastionView, loadBastionModel } from './bastion-view';
import { BASTION } from '../content/bastion';

const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation);
/** Per-frame CPU budget for generating the next terrain section ahead of need. */
const PREFETCH_BUDGET_MS = 3;
const COT_ELEVATION = 1 / Math.tan(ELEVATION);
const TACTICAL_HEIGHT = VIEW.width * 16 / 9;

/** Public for projection verification: actual ground core and logical target share a pixel. */
export function groundForwardPosition(logicalS: number, coreHeight: number): number {
  return logicalS - (coreHeight - VIEW.flightHeight) * COT_ELEVATION;
}

/**
 * Place a ground model on generated terrain at any level (valley floor, slope, ledge or peak) while
 * preserving its exact logical target pixel. The search spans the full terrain depth: a core at height
 * h sits (3 − h)·cot(elevation) further forward than its logical row.
 */
export function groundPlacement(seed: number, distance: number, x: number, logicalS: number, coreHeight: number) {
  let lo = logicalS - 1, hi = logicalS + (VIEW.flightHeight - TERRAIN_MIN_HEIGHT - coreHeight) * COT_ELEVATION + 1;
  for (let i = 0; i < 26; i++) {
    const s = (lo + hi) / 2, baseHeight = terrainHeight(seed, x, distance + s);
    if (s + (baseHeight + coreHeight - VIEW.flightHeight) * COT_ELEVATION < logicalS) lo = s; else hi = s;
  }
  const baseHeight = terrainHeight(seed, x, distance + (lo + hi) / 2);
  return { baseHeight, s: groundForwardPosition(logicalS, baseHeight + coreHeight) };
}

/**
 * Bastion-9 seating (render-only): the wide hull rests on the highest ground under its footprint so it never
 * sinks into a ridge, and its target sockets still project exactly onto their logical combat rows.
 */
export function bastionPlacement(seed: number, distance: number, x: number, logicalS: number) {
  let { s } = groundPlacement(seed, distance, x, logicalS, BASTION.targetHeight), baseHeight = -Infinity;
  for (let pass = 0; pass < 3; pass++) {
    baseHeight = -Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      // Local +z faces the player, which is toward smaller s.
      const dx = i / 2 * (BASTION_FOOTPRINT.halfWidth - .2), dz = j / 2 * (BASTION_FOOTPRINT.halfDepth - .2);
      baseHeight = Math.max(baseHeight, terrainHeight(seed, x + dx, distance + s - dz));
    }
    s = groundForwardPosition(logicalS, baseHeight + BASTION.targetHeight);
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
export function rayPlacement(camera: THREE.Camera, seed: number, distance: number, x: number, logicalS: number, coreHeight: number, baseFloor = -Infinity) {
  const target = new THREE.Vector3(x, VIEW.flightHeight, -logicalS);
  const direction = camera instanceof THREE.PerspectiveCamera ? target.clone().sub(camera.position).normalize() : camera.getWorldDirection(new THREE.Vector3());
  const at = (t: number) => target.clone().addScaledVector(direction, t);
  const ground = (point: THREE.Vector3) => Math.max(baseFloor, terrainHeight(seed, point.x, distance - point.z));
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
export function configureRectified(camera: THREE.PerspectiveCamera, x: number, distance: number): void {
  const centerS = (VIEW.minS + VIEW.maxS) / 2;
  const cx = x, cy = VIEW.flightHeight + Math.sin(ELEVATION) * distance, cz = -centerS + Math.cos(ELEVATION) * distance;
  camera.position.set(cx, cy, cz); camera.up.set(0, 0, -1); camera.lookAt(cx, cy - 1, cz); camera.updateMatrixWorld();
  // Camera space: X = world x − cx, Y (screen up) = cz + s, depth = height above the plane.
  const k = camera.near / (cy - VIEW.flightHeight);
  camera.projectionMatrix.makePerspective((-VIEW.width / 2) * k, (VIEW.width / 2) * k, (cz + VIEW.maxS) * k, (cz + VIEW.minS) * k, camera.near, camera.far);
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
 * Light-space extents of everything the camera can see within the shadow slab, relative to the view target
 * (constant while the camera only translates). The shadow frustum is fitted once, then follows the view.
 */
export function shadowExtents(camera: THREE.Camera, target: THREE.Vector3) {
  const lightCamera = new THREE.OrthographicCamera();
  lightCamera.position.copy(SUN).multiplyScalar(SHADOW_LIGHT_DISTANCE); lightCamera.lookAt(0, 0, 0); lightCamera.updateMatrixWorld();
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
  const reach = (SHADOW_SLAB.top - SHADOW_SLAB.bottom) / SUN.y;
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
  const camera = cameraMode === 'perspective' ? new THREE.PerspectiveCamera(lens, 9 / 16, 1, 260)
    : cameraMode === 'rectified' ? new THREE.PerspectiveCamera(20, 9 / 16, 1, 260)
    : new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, TACTICAL_HEIGHT / 2, -TACTICAL_HEIGHT / 2, .1, 100);
  const placeCamera = (x: number) => {
    if (cameraMode === 'rectified') configureRectified(camera as THREE.PerspectiveCamera, x, rectifiedDepth); else configureCamera(camera, x);
  };
  placeCamera(0);

  // Lighting after the concept: a warm low sun from the upper left (docs/13 §1) with soft, shortened shadows;
  // a warm sky/rust-ground fill so shade reads as umber, never night; and a low rust bounce from the opposite
  // side that lifts camera-facing cliff faces and gives hulls a second, warmer edge.
  const hemisphere = new THREE.HemisphereLight(0xffdcb8, 0x7a4024, 1.35);
  const sunlight = new THREE.DirectionalLight(0xffd8ac, 3.3);
  const bounce = new THREE.DirectionalLight(0xd97a4a, 0.6);
  const bounceOffset = new THREE.Vector3(-SUN.x, .32, -SUN.z).normalize().multiplyScalar(30);
  sunlight.castShadow = true; sunlight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunlight.shadow.bias = -.0005; sunlight.shadow.normalBias = .025; sunlight.shadow.radius = 2.6; sunlight.shadow.intensity = .82;
  scene.add(hemisphere, sunlight, sunlight.target, bounce, bounce.target);
  // The shadow frustum is fitted once to the visible slab, then follows the view snapped to whole texels in the
  // terrain's own frame, so static casters never shimmer while the world scrolls.
  const viewTarget = new THREE.Vector3(0, VIEW.flightHeight, -(VIEW.minS + VIEW.maxS) / 2);
  const extents = shadowExtents(camera, viewTarget);
  Object.assign(sunlight.shadow.camera, { left: extents.left, right: extents.right, top: extents.top, bottom: extents.bottom,
    near: Math.max(.5, extents.near), far: extents.far });
  sunlight.shadow.camera.updateProjectionMatrix();
  const texel = { x: (extents.right - extents.left) / SHADOW_MAP_SIZE, y: (extents.top - extents.bottom) / SHADOW_MAP_SIZE };
  const shadowAnchor = new THREE.Vector3();
  const placeSun = (cameraX: number, distance: number) => {
    // Terrain frame: world z = distance − s, so z − distance is fixed on the ground.
    shadowAnchor.set(cameraX, viewTarget.y, viewTarget.z - distance);
    const a = shadowAnchor.dot(extents.right3), b = shadowAnchor.dot(extents.up3);
    shadowAnchor.addScaledVector(extents.right3, Math.round(a / texel.x) * texel.x - a).addScaledVector(extents.up3, Math.round(b / texel.y) * texel.y - b);
    sunlight.target.position.set(shadowAnchor.x, shadowAnchor.y, shadowAnchor.z + distance);
    sunlight.position.copy(sunlight.target.position).addScaledVector(SUN, SHADOW_LIGHT_DISTANCE);
    bounce.target.position.copy(sunlight.target.position); bounce.position.copy(bounce.target.position).add(bounceOffset);
  };
  // High tier: HDR scene + selective bloom + graded composite in 6 full-screen draws; Low renders direct.
  const post = createPostPipeline(renderer, { exposure: 1.0, threshold: 1.0, knee: .35, strength: .7,
    lift: new THREE.Color(.011, .0058, .0026), saturation: 1.06, vignette: .2 });
  const materials = createMaterials();
  const bastion = createBastionView(scene);
  const terrainMaterials = createTerrainMaterials();
  const groundMaterial = terrainMaterials.ground, kitMaterial = terrainMaterials.kit;
  const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0xd8c08a, transparent: true, opacity: .52 });
  const sharedMaterial = createSharedMaterial();
  // Prefiltered desert sky: craft metals and outpost machinery reflect warm light instead of reading flat black.
  const environment = createDesertEnvironment(renderer, SUN);
  materials.craft.envMap = environment.texture; sharedMaterial.envMap = environment.texture; terrainMaterials.setEnvironment(environment.texture);
  const terrain = createTerrainView({ scene, groundMaterial, kitMaterial, infraMaterial: terrainMaterials.infra, boundaryMaterial,
    sharedMaterial, roadMaterial: terrainMaterials.roads, fallbackInfra: createFallbackInfra(materials), fallbackShared: createFallbackShared() });
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
  const hero = createHero(materials); scene.add(hero);
  const ENEMY_KINDS: readonly EnemyKind[] = ['dart', 'weaver', 'turret', 'lancer'];
  const ENEMY_CAPACITY = 32;
  const craftGeometry = (model: THREE.Group) => (model.children[0] as THREE.Mesh).geometry;
  // Ground targets on every terrain level (docs/13 §2), render-only: where terrain in front hides a turret,
  // a faint silhouette shows through (drawn before the turret, only where it lies behind existing depth).
  const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0xffd39a, opacity: .32, depthFunc: THREE.GreaterDepth,
    depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const enemyBatches = new Map<EnemyKind, { mesh: THREE.InstancedMesh; ghost?: THREE.InstancedMesh }>();
  for (const kind of ENEMY_KINDS) {
    const geometry = craftGeometry(createEnemy(kind, materials));
    const mesh = new THREE.InstancedMesh(geometry, materials.craft, ENEMY_CAPACITY);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = `Khepri ${kind} craft`;
    // Ground turrets cast into the High shadow map and take shadows; flying craft use readable blob shadows.
    mesh.castShadow = mesh.receiveShadow = kind === 'turret';
    let ghost: THREE.InstancedMesh | undefined;
    if (kind === 'turret') {
      mesh.renderOrder = 2;
      ghost = new THREE.InstancedMesh(geometry, silhouetteMaterial, ENEMY_CAPACITY);
      ghost.instanceMatrix = mesh.instanceMatrix; ghost.frustumCulled = false; ghost.count = 0; ghost.renderOrder = 1; scene.add(ghost);
    }
    scene.add(mesh); enemyBatches.set(kind, { mesh, ghost });
  }
  // On slopes a foundation plinth reaches down to the lowest ground under the turret footprint.
  const plinthGeometry = new THREE.CylinderGeometry(.6, .66, 1, 6); plinthGeometry.translate(0, .5, 0);
  const plinths = new THREE.InstancedMesh(plinthGeometry, materials.dark, 32);
  plinths.instanceMatrix.setUsage(THREE.DynamicDrawUsage); plinths.frustumCulled = false; plinths.count = 0; plinths.receiveShadow = true; scene.add(plinths);
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
  const shield = new THREE.Mesh(new THREE.RingGeometry(.52, .548, 32), shieldMaterial);
  shield.rotation.x = -ELEVATION; shield.renderOrder = 8; scene.add(shield);

  const friendlyMaterial = new THREE.MeshBasicMaterial({ color: 0xbcfff8, depthTest: false, depthWrite: false });
  const hostileMaterial = new THREE.MeshBasicMaterial({ color: 0xff8869, depthTest: false, depthWrite: false });
  const hostileCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffe7c4, depthTest: false, depthWrite: false });
  const projectileGeometry = new THREE.SphereGeometry(1, 6, 4);
  const friendly = new THREE.InstancedMesh(projectileGeometry, friendlyMaterial, 1024);
  const hostile = new THREE.InstancedMesh(projectileGeometry, hostileMaterial, 1024);
  const hostileCores = new THREE.InstancedMesh(projectileGeometry, hostileCoreMaterial, 1024);
  for (const mesh of [friendly, hostile, hostileCores]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.count = 0; scene.add(mesh);
  }
  const pickupBatches=new Map<Pickup['kind'],THREE.InstancedMesh[]>();
  for(const kind of ['shield','weapon','power','credit'] as const) {
    const template=createPickupModel(kind);
    const batch=template.children.map(object=>{
      const part=object as THREE.Mesh;
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,128);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.renderOrder=7;mesh.count=0;scene.add(mesh);return mesh;
    });pickupBatches.set(kind,batch);
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,next==='high'?1.5:1)); renderer.setSize(drawingWidth, drawingHeight, false); resizePost();
      // Shadow maps are a High-tier feature; toggling them recompiles the affected programs once.
      renderer.shadowMap.enabled = sunlight.castShadow = next === 'high';
      scene.traverse(object => { const material = (object as THREE.Mesh).material; (Array.isArray(material) ? material : material ? [material] : []).forEach(m => { m.needsUpdate = true; }); });
      lastStatsTick=-Infinity;
    },
    resize(width, height) {
      if (disposed) return;
      drawingWidth = Math.max(1, Math.floor(width)); drawingHeight = Math.max(1, Math.floor(height));
      renderer.setSize(drawingWidth, drawingHeight, false); resizePost();
    },
    render(state, alpha) {
      if (disposed) return;
      renderer.info.reset();
      // Interpolation is presentation-only; the view follows the exact authoritative camera.
      void alpha;
      const terrainStart = performance.now();
      terrain.update(state.config.seed, state.distance); placeCamera(state.cameraX); terrain.cull(camera);
      const terrainUpdate = performance.now() - terrainStart;
      let bossPlacement: { x?: number; s: number; baseHeight: number } | null = state.boss ? bastionPlacement(state.config.seed, state.distance, state.boss.x, state.boss.s) : null;
      if (state.boss && bossPlacement && perspective) bossPlacement = rayPlacement(camera, state.config.seed, state.distance, state.boss.x, state.boss.s, BASTION.targetHeight, bossPlacement.baseHeight);
      bastion.update(state, bossPlacement);
      // While the fortress is present, scenery under its hull is hidden (render-only; ground and roads stay).
      terrain.setExclusion(bastion.footprint(state, bossPlacement));
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
        const pieces = terrain.warmupObjects();
        pieces.forEach(piece => { piece.userData.wasVisible = piece.visible; piece.visible = true; });
        renderer.compile(scene, camera);
        pieces.forEach(piece => { piece.visible = piece.userData.wasVisible; }); warmed = true;
      }
      placeSun(state.cameraX, state.distance);
      hero.position.set(state.player.x, VIEW.flightHeight, 0);
      hero.rotation.z = -state.player.vx * .016;
      shield.position.set(state.player.x, VIEW.flightHeight + .03, 0);
      shield.visible = state.time < state.player.invulnerableUntil;
      shieldMaterial.opacity = .34;
      // Engine plumes (render-only): length follows lateral speed, a slight flicker from simulation time.
      plumes.length = 0;
      const flicker = (n: number) => .92 + .08 * Math.sin(state.time * 37 + n * 1.7);
      const heroLength = (.5 + Math.abs(state.player.vx) * .03) * flicker(0);
      for (const side of [-1, 1]) plumes.push({ x: state.player.x + side * .38 * Math.cos(hero.rotation.z), z: .7, length: heroLength, width: .2, hex: 0x7ff6ea, energy: 2.6 });
      let shadowCount = 0, plinthCount = 0;
      const flightShadow = (x: number, s: number, width: number, length: number, height: number) => {
        if (shadowCount >= flightShadows.instanceMatrix.count) return;
        // Shadows fall to the lower right, away from the upper-left sun; offset kept modest for readability.
        const groundX = x + height * .22, groundS = s - height * .08;
        const groundY = terrainHeight(state.config.seed, groundX, state.distance + groundS);
        transform.position.set(groundX, groundY + .07, -groundS);
        transform.rotation.set(0, 0, 0); transform.scale.set(width, 1, length); transform.updateMatrix();
        flightShadows.setMatrixAt(shadowCount++, transform.matrix);
      };
      flightShadow(state.player.x, 0, 1.5, 1.8, VIEW.flightHeight);

      const counts = new Map<EnemyKind, number>(ENEMY_KINDS.map(kind => [kind, 0]));
      let lineCursor = 0;
      const line = (x1: number, s1: number, x2: number, s2: number, hex: number) => {
        if (lineCursor + 2 > lineVertices.length / 3) return;
        color.setHex(hex);
        lineVertices.set([x1, VIEW.flightHeight + .03, -s1, x2, VIEW.flightHeight + .03, -s2], lineCursor * 3);
        lineColors.set([color.r, color.g, color.b, color.r, color.g, color.b], lineCursor * 3); lineCursor += 2;
      };
      for (const enemy of state.enemies) {
        if (enemy.bossPart) continue;
        const isGround = enemy.kind === 'turret';
        const visible = Math.abs(enemy.x - state.cameraX) < VIEW.width / 2 + 1 && enemy.s > VIEW.minS - 2 && enemy.s < VIEW.maxS + 3;
        if (!visible) continue;
        const placement: { x?: number; s: number; baseHeight: number } = !isGround ? { baseHeight: VIEW.flightHeight, s: enemy.s }
          : perspective ? rayPlacement(camera, state.config.seed, state.distance, enemy.x, enemy.s, enemy.groundHeight)
          : groundPlacement(state.config.seed, state.distance, enemy.x, enemy.s, enemy.groundHeight);
        const batch = enemyBatches.get(enemy.kind)!, slot = counts.get(enemy.kind)!;
        if (slot < ENEMY_CAPACITY) {
          transform.position.set(placement.x ?? enemy.x, placement.baseHeight, -placement.s);
          transform.rotation.set(0, 0, enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0); transform.scale.set(1, 1, 1); transform.updateMatrix();
          batch.mesh.setMatrixAt(slot, transform.matrix); counts.set(enemy.kind, slot + 1);
        }
        if (isGround && plinthCount < plinths.instanceMatrix.count) {
          let lowest = placement.baseHeight;
          for (const [dx, ds] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) lowest = Math.min(lowest, terrainHeight(state.config.seed, enemy.x + dx, state.distance + placement.s + ds));
          if (placement.baseHeight - lowest > .08) {
            transform.position.set(enemy.x, lowest - .12, -placement.s); transform.rotation.set(0, 0, 0);
            transform.scale.set(1, placement.baseHeight + .06 - (lowest - .12), 1); transform.updateMatrix();
            plinths.setMatrixAt(plinthCount++, transform.matrix);
          }
        }
        // Flying craft keep the readable blob shadow on both tiers; ground turrets cast real shadows on High.
        if (!isGround || quality !== 'high') flightShadow(enemy.x, placement.s,
          enemy.kind === 'weaver' ? 2.2 : 1.5, enemy.kind === 'lancer' ? 2.3 : 1.9, isGround ? enemy.groundHeight : VIEW.flightHeight);
        if (!isGround) {
          // Warm engine plumes trail behind hostile craft (their nozzles face away from the player).
          const bank = enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0;
          for (const side of [-1, 1]) plumes.push({ x: enemy.x + side * .27 * Math.cos(bank), z: -enemy.s - .55, length: -.34 * flicker(enemy.id + side), width: .14, hex: 0xffa060, energy: 1.9 });
        }
        // Ground brackets are drawn on the shared proxy, exactly over the physical luminous core.
        if (isGround || enemy.warning > 0) {
          const r = enemy.radius + .13, length = .16, tint = enemy.warning > 0 ? 0xffc987 : 0xdab482;
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            line(enemy.x + sx * r, enemy.s + sy * r, enemy.x + sx * (r - length), enemy.s + sy * r, tint);
            line(enemy.x + sx * r, enemy.s + sy * r, enemy.x + sx * r, enemy.s + sy * (r - length), tint);
          }
        }
        if (enemy.warning > 0) {
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
      for (const [kind, batch] of enemyBatches) {
        const count = counts.get(kind)!;
        batch.mesh.count = count; batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.ghost) batch.ghost.count = count;
      }
      flightShadows.count = shadowCount; flightShadows.instanceMatrix.needsUpdate = true;
      plinths.count = plinthCount; plinths.instanceMatrix.needsUpdate = true;
      let friendlyCount = 0, hostileCount = 0;
      for (const shot of state.projectiles) {
        if (Math.abs(shot.x - state.cameraX) > VIEW.width / 2 + .5 || shot.s < VIEW.minS - 1 || shot.s > VIEW.maxS + 1) continue;
        transform.position.set(shot.x, VIEW.flightHeight, -shot.s);
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

      const pickupCounts: Record<Pickup['kind'],number>={shield:0,weapon:0,power:0,credit:0};
      for (const pickup of state.pickups) {
        const batch=pickupBatches.get(pickup.kind)!,i=pickupCounts[pickup.kind];
        if(i>=batch[0].instanceMatrix.count)continue;
        transform.position.set(pickup.x, VIEW.flightHeight+.06+Math.sin(state.time*2+pickup.id)*.035, -pickup.s);
        transform.rotation.set(-ELEVATION,0,Math.sin(state.time*.75+pickup.id)*.08);
        transform.scale.setScalar(1);transform.updateMatrix();
        batch.forEach(mesh=>mesh.setMatrixAt(i,transform.matrix));pickupCounts[pickup.kind]++;
      }
      pickupBatches.forEach((batch,kind)=>batch.forEach(mesh=>{mesh.count=pickupCounts[kind];mesh.instanceMatrix.needsUpdate=true;}));
      let laneCount = 0;
      for (const hazard of state.hazards) {
        if (hazard.active > 0 && hazard.warning <= 0 && laneCount < lanes.instanceMatrix.count) {
          transform.position.set(hazard.x, VIEW.flightHeight + .02, -(VIEW.minS + VIEW.maxS) / 2);
          transform.rotation.set(0, 0, 0); transform.scale.set(hazard.width, 1, 1); transform.updateMatrix(); lanes.setMatrixAt(laneCount++, transform.matrix);
        }
        for (const side of [-1, 1]) {
          const x = hazard.x + side * hazard.width / 2;
          for (let s = VIEW.minS; s < VIEW.maxS; s += 1.2) line(x, s, x, Math.min(s + .7, VIEW.maxS), hazard.warning > 0 ? 0xffc987 : 0xff9c77);
        }
      }
      lanes.count = laneCount; lanes.instanceMatrix.needsUpdate = true;
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
      fx.update(state, plumes);
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
          sections: 3, terrain: terrain.stats, stream: terrain.streamStats, bastion: bastion.stats,
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
      terrain.dispose(); terrainMaterials.dispose(); environment.dispose();
      sunlight.shadow.dispose(); post.dispose();
      renderer.dispose();
    },
  };
}
