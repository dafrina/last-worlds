import * as THREE from 'three';
import { VIEW, type EnemyKind, type GameRenderer, type GraphicsQuality, type Pickup, type RunState } from '../shared/contracts';
import { SUN_DIRECTION, TERRAIN_MIN_HEIGHT, terrainHeight } from '../world/terrain';
import { createEnemy, createHero, createMaterials, createPickupModel } from './models';
import { createFallbackInfra, createFallbackShared, createSharedMaterial, createTerrainMaterials, loadKhepriInfra, loadKhepriKit, loadKhepriTextures, loadSharedKit } from './terrain-kit';
import { createTerrainView } from './terrain-view';
import { createBastionView } from './bastion-view';
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

export function configureCamera(camera: THREE.OrthographicCamera, x: number): void {
  const centerS = (VIEW.minS + VIEW.maxS) / 2;
  const target = new THREE.Vector3(x, VIEW.flightHeight, -centerS);
  camera.position.set(x, target.y + Math.sin(ELEVATION) * 36, target.z + Math.cos(ELEVATION) * 36);
  camera.lookAt(target); camera.updateMatrixWorld();
}

export function createRenderer(canvas: HTMLCanvasElement): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let quality: GraphicsQuality='high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral tone mapping keeps the saturated rust/turquoise palette instead of washing it toward grey.
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x5a3420);
  const camera = new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, TACTICAL_HEIGHT / 2, -TACTICAL_HEIGHT / 2, .1, 100);
  configureCamera(camera, 0);
  // Warm sky fill and rust bounce; the low sun sits upper-left beyond the top of the view (docs/13 §1),
  // so plateau tops are lit, camera-facing faces fall into shade, and shadows run to the lower right.
  scene.add(new THREE.HemisphereLight(0xd8d4d0, 0x56321f, 1.0));
  const sunlight = new THREE.DirectionalLight(0xfff0dc, 4.2);
  const sunOffset = new THREE.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, -SUN_DIRECTION.s).multiplyScalar(30);
  scene.add(sunlight, sunlight.target);
  const materials = createMaterials();
  const bastion = createBastionView(scene);
  const terrainMaterials = createTerrainMaterials();
  const groundMaterial = terrainMaterials.ground, kitMaterial = terrainMaterials.kit;
  const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0xd8c08a, transparent: true, opacity: .52 });
  const sharedMaterial = createSharedMaterial();
  const terrain = createTerrainView({ scene, groundMaterial, kitMaterial, infraMaterial: terrainMaterials.infra, boundaryMaterial,
    sharedMaterial, roadMaterial: terrainMaterials.roads, fallbackInfra: createFallbackInfra(materials), fallbackShared: createFallbackShared() });
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
  // Detail maps are optional polish: any map that fails keeps its procedural stand-in.
  loadKhepriTextures(`${import.meta.env.BASE_URL}assets/khepri/textures/`, Math.min(2, renderer.capabilities.getMaxAnisotropy())).then(textures => {
    if (disposed) { Object.values(textures).forEach(texture => texture?.dispose()); return; }
    terrainMaterials.setTextures(textures); warmed = false;
  });
  const hero = createHero(materials); scene.add(hero);
  const enemyTemplates = new Map<EnemyKind, THREE.Group>(['dart', 'weaver', 'turret', 'lancer'].map(kind => [kind as EnemyKind, createEnemy(kind as EnemyKind, materials)]));
  // Ground targets on every terrain level (docs/13 §2), render-only: where terrain in front hides a turret,
  // a faint silhouette shows through (drawn before the turret, only where it lies behind existing depth).
  const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0xffd39a, opacity: .32, depthFunc: THREE.GreaterDepth,
    depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  {
    const turret = enemyTemplates.get('turret')!, ghosts = new THREE.Group();
    turret.children.forEach(child => {
      const mesh = child as THREE.Mesh; mesh.renderOrder = 2;
      const ghost = new THREE.Mesh(mesh.geometry, silhouetteMaterial); ghost.renderOrder = 1; ghosts.add(ghost);
    });
    turret.add(ghosts);
  }
  // On slopes a foundation plinth reaches down to the lowest ground under the turret footprint.
  const plinthGeometry = new THREE.CylinderGeometry(.6, .66, 1, 6); plinthGeometry.translate(0, .5, 0);
  const plinths = new THREE.InstancedMesh(plinthGeometry, materials.dark, 32);
  plinths.instanceMatrix.setUsage(THREE.DynamicDrawUsage); plinths.frustumCulled = false; plinths.count = 0; scene.add(plinths);
  const enemyModels = new Map<number, { kind: EnemyKind; model: THREE.Group }>();
  const enemyPool = new Map<EnemyKind, THREE.Group[]>();
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
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x211d18, map: shadowTexture, transparent: true, opacity: .6, depthWrite: false });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1); shadowGeometry.rotateX(-Math.PI / 2);
  const flightShadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, 64);
  flightShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flightShadows.frustumCulled = false;
  flightShadows.count = 0; flightShadows.renderOrder = 1; scene.add(flightShadows);

  const exhaustMaterial = new THREE.MeshBasicMaterial({ color: 0x72f0e5, transparent: true, opacity: .65, depthWrite: false });
  const exhaustGeometry = new THREE.ConeGeometry(.066, .4, 6);
  const exhausts = [-1, 1].map(side => {
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial); exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * .38, .015, .69); hero.add(exhaust); return exhaust;
  });
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
  const effectMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const effects = new THREE.InstancedMesh(new THREE.RingGeometry(.85, 1, 24), effectMaterial, 128);
  effects.setColorAt(0, color.setHex(0xffffff));
  effects.instanceMatrix.setUsage(THREE.DynamicDrawUsage); effects.frustumCulled = false; effects.renderOrder = 6; effects.count = 0; scene.add(effects);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.09), effectMaterial, 1024);
  sparks.setColorAt(0, color.setHex(0xffffff));
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sparks.frustumCulled = false; sparks.renderOrder = 6; sparks.count = 0; scene.add(sparks);

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
  return {
    setQuality(next) {
      if(disposed)return;quality=next;terrain.setQuality(next);terrainMaterials.setNormalMaps(next==='high');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,next==='high'?1.5:1));
      lastStatsTick=-Infinity;
    },
    resize(width, height) {
      if (disposed) return;
      renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), false);
    },
    render(state, alpha) {
      if (disposed) return;
      // Interpolation is presentation-only; the view follows the exact authoritative camera.
      void alpha;
      const terrainStart = performance.now();
      terrain.update(state.config.seed, state.distance); configureCamera(camera, state.cameraX); terrain.cull(camera);
      const terrainUpdate = performance.now() - terrainStart;
      bastion.update(state, state.boss ? groundPlacement(state.config.seed, state.distance, state.boss.x, state.boss.s, BASTION.targetHeight) : null);
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
        const templates = [...enemyTemplates.values()], pieces = terrain.warmupObjects();
        scene.add(...templates); pieces.forEach(piece => { piece.userData.wasVisible = piece.visible; piece.visible = true; });
        renderer.compile(scene, camera);
        scene.remove(...templates); pieces.forEach(piece => { piece.visible = piece.userData.wasVisible; }); warmed = true;
      }
      sunlight.target.position.set(state.cameraX, 0, -8); sunlight.position.copy(sunlight.target.position).add(sunOffset);
      hero.position.set(state.player.x, VIEW.flightHeight, 0);
      hero.rotation.z = -state.player.vx * .016;
      exhausts.forEach(exhaust => { exhaust.scale.y = 1 + Math.abs(state.player.vx) * .027; });
      shield.position.set(state.player.x, VIEW.flightHeight + .03, 0);
      shield.visible = state.time < state.player.invulnerableUntil;
      shieldMaterial.opacity = .34;
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

      const liveEnemies = new Set(state.enemies.map(enemy => enemy.id));
      for (const [id, entry] of enemyModels) if (!liveEnemies.has(id)) {
        scene.remove(entry.model); enemyModels.delete(id);
        const pool = enemyPool.get(entry.kind) ?? [];
        if (pool.length < 32) pool.push(entry.model);
        enemyPool.set(entry.kind, pool);
      }
      let lineCursor = 0;
      const line = (x1: number, s1: number, x2: number, s2: number, hex: number) => {
        if (lineCursor + 2 > lineVertices.length / 3) return;
        color.setHex(hex);
        lineVertices.set([x1, VIEW.flightHeight + .03, -s1, x2, VIEW.flightHeight + .03, -s2], lineCursor * 3);
        lineColors.set([color.r, color.g, color.b, color.r, color.g, color.b], lineCursor * 3); lineCursor += 2;
      };
      for (const enemy of state.enemies) {
        if (enemy.bossPart) continue;
        let entry = enemyModels.get(enemy.id);
        if (!entry || entry.kind !== enemy.kind) {
          if (entry) scene.remove(entry.model);
          const model = enemyPool.get(enemy.kind)?.pop() ?? enemyTemplates.get(enemy.kind)!.clone();
          entry = { kind: enemy.kind, model }; enemyModels.set(enemy.id, entry); scene.add(model);
        }
        const isGround = enemy.kind === 'turret';
        const placement=isGround?groundPlacement(state.config.seed,state.distance,enemy.x,enemy.s,enemy.groundHeight):{baseHeight:VIEW.flightHeight,s:enemy.s};
        entry.model.position.set(enemy.x,placement.baseHeight,-placement.s);
        if (isGround && plinthCount < plinths.instanceMatrix.count) {
          let lowest = placement.baseHeight;
          for (const [dx, ds] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) lowest = Math.min(lowest, terrainHeight(state.config.seed, enemy.x + dx, state.distance + placement.s + ds));
          if (placement.baseHeight - lowest > .08) {
            transform.position.set(enemy.x, lowest - .12, -placement.s); transform.rotation.set(0, 0, 0);
            transform.scale.set(1, placement.baseHeight + .06 - (lowest - .12), 1); transform.updateMatrix();
            plinths.setMatrixAt(plinthCount++, transform.matrix);
          }
        }
        entry.model.rotation.z = enemy.kind === 'weaver' ? Math.cos(enemy.age * 1.5) * .12 : 0;
        const visible = Math.abs(enemy.x - state.cameraX) < VIEW.width / 2 + 1 && enemy.s > VIEW.minS - 2 && enemy.s < VIEW.maxS + 3;
        entry.model.visible = visible;
        if (!visible) continue;
        flightShadow(enemy.x, placement.s,
          enemy.kind === 'weaver' ? 2.2 : 1.5, enemy.kind === 'lancer' ? 2.3 : 1.9, isGround ? enemy.groundHeight : VIEW.flightHeight);
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
      let effectCount = 0, sparkCount = 0;
      for (const effect of state.effects) {
        if (effectCount >= effects.instanceMatrix.count) break;
        const age = Math.max(0, Math.min(1, 1 - effect.ttl / effect.duration));
        const radius = effect.kind === 'special' ? .4 + age * 6 : effect.kind === 'explosion' ? .15 + age * .8 : .08 + age * .4;
        transform.position.set(effect.x, VIEW.flightHeight + .04, -effect.s);
        transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.setScalar(radius); transform.updateMatrix();
        effects.setMatrixAt(effectCount, transform.matrix);
        const tint = effect.kind === 'explosion' || effect.kind === 'hit' ? 0xf9b67f : 0x97e7da;
        color.setHex(tint).multiplyScalar(1 - age * .75); effects.setColorAt(effectCount++, color);
        if (effect.kind === 'explosion') for (let i = 0; i < 7 && sparkCount < sparks.instanceMatrix.count; i++) {
          const angle = i * Math.PI * 2 / 7 + effect.id * .1;
          transform.position.set(effect.x + Math.cos(angle) * age * 1.3, VIEW.flightHeight + .06, -effect.s + Math.sin(angle) * age * 1.3);
          transform.scale.setScalar(1 - age * .8); transform.rotation.set(angle, age * 3, 0); transform.updateMatrix();
          sparks.setMatrixAt(sparkCount, transform.matrix); sparks.setColorAt(sparkCount++, color);
        }
      }
      effects.count = effectCount; sparks.count = sparkCount;
      for (const mesh of [effects, sparks]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      lineGeometry.setDrawRange(0, lineCursor);
      lineGeometry.getAttribute('position').needsUpdate = true; lineGeometry.getAttribute('color').needsUpdate = true;
      const renderStart = performance.now();
      renderer.render(scene, camera);
      if (state.tick > 0) terrainWork.renderMax = Math.max(terrainWork.renderMax, performance.now() - renderStart);
      if (state.tick - lastStatsTick >= 60 || state.tick < lastStatsTick) {
        // Read-only browser QA evidence; never a gameplay HUD or a simulation input.
        canvas.dataset.renderStats = JSON.stringify({
          sections: 3, terrain: terrain.stats, stream: terrain.streamStats,
          terrainWorkMs: { last: +terrainWork.last.toFixed(2), max: +terrainWork.max.toFixed(2), over4: terrainWork.over4, frames: terrainWork.frames,
            renderMax: +terrainWork.renderMax.toFixed(2), updateMax: +terrainWork.updateMax.toFixed(2),
            animateMax: +terrainWork.animateMax.toFixed(2), prefetchMax: +terrainWork.prefetchMax.toFixed(2) },
          calls: renderer.info.render.calls, tier: quality, pixelRatio: renderer.getPixelRatio(),antialias:true,
          triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures, pooledEnemies: [...enemyPool.values()].reduce((n, pool) => n + pool.length, 0),
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
      scene.traverse(collect); enemyTemplates.forEach(model => model.traverse(collect));
      enemyPool.forEach(pool => pool.forEach(model => model.traverse(collect)));
      const textures=new Set<THREE.Texture>();
      usedMaterials.forEach(material=>Object.values(material).forEach(value=>{if(value instanceof THREE.Texture)textures.add(value);}));
      geometries.forEach(geometry => geometry.dispose()); usedMaterials.forEach(material => material.dispose());textures.forEach(texture=>texture.dispose());
      terrain.dispose(); terrainMaterials.dispose(); enemyModels.clear(); enemyPool.clear();
      sunlight.shadow.dispose();
      renderer.dispose();
    },
  };
}
