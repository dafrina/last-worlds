import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BASTION } from '../content/bastion';
import { VIEW, type BossPart, type RunState } from '../shared/contracts';

/**
 * Bastion-9 presentation (docs/15). Render-only: it reads boss state and never applies damage or decides
 * anything the simulation uses. The production Blender model replaces the functional stand-in when
 * `bastion-9.glb` loads; target rings stay on the authored sockets either way.
 */
const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation);
const PARTS = ['left', 'right', 'core'] as const;
const TREAD_REPEAT = 1.25;
/** Local footprint of the hull (x half-width, z half-depth) for seating and the terrain exclusion. */
export const BASTION_FOOTPRINT = { halfWidth: 3.8, halfDepth: 3.3 } as const;
const socket = (part: BossPart) => new THREE.Vector3(
  part === 'core' ? 0 : part === 'left' ? -BASTION.batteryOffset : BASTION.batteryOffset, 0, part === 'core' ? -BASTION.coreRowOffset : 0);

interface Shutter { object: THREE.Object3D; closed: THREE.Vector3; open: THREE.Vector3 }
interface PartRig {
  group: THREE.Group; live: THREE.Object3D[]; gun?: THREE.Object3D; gunYaw: number; wreck?: THREE.Object3D;
  shutters: Shutter[]; heat: THREE.MeshStandardMaterial[]; open: number;
}
interface Rig { chassis: THREE.Group; parts: Map<BossPart, PartRig>; treads: THREE.Texture[]; glow: THREE.MeshStandardMaterial[]; dispose(): void }

export async function loadBastionModel(url: string): Promise<THREE.Group> {
  return (await new GLTFLoader().loadAsync(url)).scene;
}

/* ------------------------------------------------------------------ materials */

function treadTexture(): THREE.Texture {
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) for (let y = 0; y < 64; y++) { const v = y % 16 < 5 ? 70 : 210 + (y % 3) * 10; context.fillStyle = `rgb(${v},${v},${v})`; context.fillRect(0, y, 8, 1); }
  const texture = new THREE.CanvasTexture(canvas);
  // Belt v is arc length in game units; four links per tile and one link every 0.2 units.
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, TREAD_REPEAT); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const glowMaterial = (color: number, intensity: number) =>
  new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: color, emissiveIntensity: intensity, roughness: .5, metalness: .2, toneMapped: false });

/**
 * Shadows for the whole fortress come from one merged, invisible proxy (position-only geometry of every static
 * part, riding on the chassis), so the boss costs a single shadow draw instead of one per part and material.
 * Detailed meshes only receive shadows. The proxy writes neither colour nor depth in the main pass.
 */
const shadowProxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function castShadows(chassis: THREE.Object3D) {
  chassis.getObjectByName('bastion-shadow-proxy')?.removeFromParent();
  chassis.updateMatrixWorld(true);
  const inverse = chassis.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
  chassis.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = false; child.receiveShadow = true;
    if (!child.visible || child.userData.noShadowProxy) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', child.geometry.getAttribute('position').clone());
    if (child.geometry.index) geometry.setIndex(child.geometry.index.clone());
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld)); parts.push(flat);
    if (flat !== geometry) geometry.dispose();
  });
  const merged = parts.length ? mergeGeometries(parts) : null;
  parts.forEach(part => part.dispose());
  if (!merged) return;
  const proxy = new THREE.Mesh(merged, shadowProxyMaterial);
  proxy.name = 'bastion-shadow-proxy'; proxy.castShadow = true; proxy.receiveShadow = false; proxy.frustumCulled = false;
  chassis.add(proxy);
}

/* ------------------------------------------------------------------ functional stand-in */

function fallbackRig(): Rig {
  const chassis = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x827864, roughness: .64, metalness: .5 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x333a38, roughness: .7, metalness: .4 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x684736, roughness: .85, metalness: .2 });
  const hullParts: THREE.Mesh[] = [];
  const box = (group: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material, batch = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); group.add(mesh); if (batch) hullParts.push(mesh); return mesh;
  };
  box(chassis, [5.4, .6, 4.8], [0, .65, -.4], edge, true);
  box(chassis, [4.6, .42, 4.3], [0, 1.08, -.5], armor, true);
  box(chassis, [2.1, .32, 1.5], [0, 1.4, 1.15], rust, true);
  for (const side of [-1, 1]) {
    box(chassis, [1.05, .72, 5.7], [side * 2.85, .4, -.4], edge, true);
    box(chassis, [.9, .14, 5.3], [side * 2.85, .86, -.4], armor, true);
    for (let i = 0; i < 9; i++) box(chassis, [1.08, .12, .16], [side * 2.85, .06, -2.8 + i * .6], rust, true);
    box(chassis, [.12, .12, 3.8], [side * 1.45, 1.37, -.6], edge, true);
    box(chassis, [.4, .24, .35], [side * 2.8, 1.04, 2.1], rust, true);
  }
  chassis.updateMatrixWorld(true);
  for (const material of [armor, edge, rust]) {
    const meshes = hullParts.filter(mesh => mesh.material === material);
    const merged = mergeGeometries(meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)));
    meshes.forEach(mesh => { chassis.remove(mesh); mesh.geometry.dispose(); });
    if (merged) chassis.add(new THREE.Mesh(merged, material));
  }
  const parts = new Map<BossPart, PartRig>();
  const coreHeat = glowMaterial(0xff8a3c, 1.2), batteryHeat = [glowMaterial(0xff9a50, 1), glowMaterial(0xff9a50, 1)];
  for (const part of PARTS) {
    const core = part === 'core', group = new THREE.Group(); group.position.copy(socket(part)); chassis.add(group);
    const live: THREE.Object3D[] = [box(group, core ? [3.1, .2, 2.9] : [1.25, .36, 1.5], [0, 1.24, 0], edge)];
    const heat = core ? coreHeat : batteryHeat[part === 'left' ? 0 : 1];
    if (core) {
      const chamber = new THREE.Mesh(new THREE.CylinderGeometry(.97, 1.02, .12, 24), heat);
      chamber.position.y = BASTION.targetHeight - .09; group.add(chamber); live.push(chamber);
    } else live.push(box(group, [.5, .1, .5], [0, 1.44, 0], heat));
    const shutterSize: [number, number, number] = core ? [1.45, .15, 2.7] : [1.05, .18, 1.25];
    const shutters = (core ? [-1, 1] : [0]).map(side => {
      const object = box(group, shutterSize, [side * .73, BASTION.targetHeight + .09, 0], armor);
      const closed = object.position.clone(), open = core ? closed.clone().add(new THREE.Vector3(side * 1.25, -.05, 0)) : closed.clone().add(new THREE.Vector3(0, -.12, -.95));
      return { object, closed, open };
    });
    const gun = core ? undefined : box(group, [.22, .18, 1.3], [0, 1.45, .9], edge);
    parts.set(part, { group, live, gun, gunYaw: 0, shutters, heat: [heat], open: 0 });
  }
  return { chassis, parts, treads: [], glow: [], dispose() { chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); [armor, edge, rust, coreHeat, ...batteryHeat].forEach(m => m.dispose()); } };
}

/* ------------------------------------------------------------------ production model */

/** Builds the rig from bastion-9.glb, keeping each node's authored placement (docs/15 node contract). */
function modelRig(model: THREE.Group): Rig {
  const chassis = new THREE.Group();
  model.updateMatrixWorld(true);
  const armor = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .45 });
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .3 });
  const lamps = glowMaterial(0xffa04a, 1.6);
  const treadMaps: THREE.Texture[] = [], owned: THREE.Material[] = [armor, trim, lamps];
  const heats = new Map<BossPart, THREE.MeshStandardMaterial>(PARTS.map(part => [part, glowMaterial(part === 'core' ? 0xff7a30 : 0xff9a50, 1.2)]));
  heats.forEach(material => owned.push(material));
  const node = (name: string) => model.getObjectByName(name);
  const partOf = (name: string): BossPart | null => name.includes('core') ? 'core' : name.includes('left') ? 'left' : name.includes('right') ? 'right' : null;
  // Replace authored materials with runtime ones (vertex colours kept); treads get a scrolling belt map.
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const owner = object.parent?.name.startsWith('bastion_') ? object.parent.name : object.name;
    const source = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.Material;
    const isGlow = source.name.includes('glow'), isTread = owner.includes('tread');
    if (isGlow) {
      const part = partOf(owner);
      object.material = part && !owner.includes('wreck') && !owner.includes('shutter') ? heats.get(part)! : lamps;
    } else if (isTread) {
      const map = treadTexture(); treadMaps.push(map);
      const belt = (source.name.includes('trim') ? trim : armor).clone(); belt.map = map; owned.push(belt); object.material = belt;
    } else object.material = source.name.includes('trim') ? trim : armor;
  });
  const parts = new Map<BossPart, PartRig>();
  for (const part of PARTS) {
    const group = new THREE.Group(); group.position.copy(socket(part)); chassis.add(group); group.updateMatrixWorld(true);
    const take = (name: string) => { const object = node(name); if (object) group.attach(object); return object; };
    const side = part === 'core' ? '' : part;
    const live = [take(part === 'core' ? 'bastion_core' : `bastion_battery_${side}`)].filter(Boolean) as THREE.Object3D[];
    const gun = part === 'core' ? undefined : take(`bastion_gun_${side}`);
    if (gun) live.push(gun);
    const wreck = part === 'core' ? undefined : take(`bastion_battery_${side}_wreck`);
    if (wreck) wreck.visible = false;
    const shutterNodes = (part === 'core' ? ['bastion_core_shutter_a', 'bastion_core_shutter_b'] : [`bastion_shutter_${side}`]).map(take).filter(Boolean) as THREE.Object3D[];
    const shutters = shutterNodes.map(object => {
      const closed = object.position.clone(), centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      const direction = Math.sign(centre.x - group.getWorldPosition(new THREE.Vector3()).x) || 1;
      // Core halves clear the ring at 1.1; battery lids retract back and down behind the gun.
      const open = part === 'core' ? closed.clone().add(new THREE.Vector3(direction * 1.1, -.04, 0)) : closed.clone().add(new THREE.Vector3(0, -.12, -.75));
      return { object, closed, open };
    });
    parts.set(part, { group, live, gun, gunYaw: 0, shutters, heat: [heats.get(part)!], open: 0 });
  }
  // Everything else (hull, treads, lamps) rides on the chassis as authored.
  for (const name of ['bastion_hull', 'bastion_tread_left', 'bastion_tread_right']) { const object = node(name); if (object) chassis.attach(object); }
  return { chassis, parts, treads: treadMaps, glow: [lamps],
    dispose() { chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); owned.forEach(m => m.dispose()); treadMaps.forEach(t => t.dispose()); } };
}

/* ------------------------------------------------------------------ particles */

const PARTICLE_VERTEX = `
attribute float aAlpha; varying float vAlpha; varying vec2 vUv; varying vec3 vColor;
void main() {
  vUv = uv; vAlpha = aAlpha; vColor = vec3( 1.0 );
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`;
const PARTICLE_FRAGMENT = `
uniform float additive; varying float vAlpha; varying vec2 vUv; varying vec3 vColor;
void main() {
  float a = smoothstep( 0.5, 0.05, length( vUv - 0.5 ) ) * vAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = additive > 0.5 ? vec4( vColor * a * 2.4, a ) : vec4( vColor, a );
}`;
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; alpha: number; color: number; drag: number; lift: number }

function particleLayer(scene: THREE.Scene, capacity: number, additive: boolean) {
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-ELEVATION);
  const material = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT, uniforms: { additive: { value: additive ? 1 : 0 } },
    transparent: true, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aAlpha', alpha);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color());
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = additive ? 5 : 3; scene.add(mesh);
  const live: Particle[] = [], transform = new THREE.Object3D(), color = new THREE.Color();
  return {
    emit(p: Omit<Particle, 'age'>) { if (live.length < capacity) live.push({ ...p, age: 0 }); },
    step(dt: number, groundShift: number) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]; p.age += dt;
        if (p.age >= p.life) { live.splice(i, 1); continue; }
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp + p.lift * dt;
        // Particles rest in the ground frame, which slides toward the player as the world scrolls.
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt + groundShift;
      }
      live.forEach((p, i) => {
        const t = p.age / p.life;
        transform.position.set(p.x, p.y, p.z); transform.scale.setScalar(p.size + p.grow * t); transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, color.setHex(p.color));
        alpha.setX(i, p.alpha * (1 - t) * Math.min(1, p.age * 12));
      });
      mesh.count = live.length; mesh.instanceMatrix.needsUpdate = true; alpha.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    clear() { live.length = 0; mesh.count = 0; },
    get count() { return live.length; },
  };
}

/* ------------------------------------------------------------------ view */

/** Deterministic cosmetic noise (presentation only; never touches simulation RNG). */
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function createBastionView(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'Bastion-9'; root.visible = false; scene.add(root);
  let rig = fallbackRig(); castShadows(rig.chassis); root.add(rig.chassis);
  // Target rings sit on the authored sockets, outside the chassis so destruction poses never move them.
  const rings = new Map<BossPart, { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }>();
  for (const part of PARTS) {
    const core = part === 'core', material = new THREE.MeshBasicMaterial({ color: 0xffb77c, depthTest: false, depthWrite: false });
    const ring = new THREE.RingGeometry(core ? 1 : .23, core ? 1.25 : .4, core ? 32 : 16); ring.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(ring, material); mesh.name = `bastion-target-${part}`; mesh.renderOrder = 4;
    mesh.position.copy(socket(part)).setY(BASTION.targetHeight); root.add(mesh); rings.set(part, { mesh, material });
  }
  // A faint silhouette keeps the fortress recognisable when a canyon lip hides the chassis.
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(6.7, .1, 5.7), new THREE.MeshBasicMaterial({ color: 0xd5aa7c, transparent: true, opacity: .06, depthTest: false, depthWrite: false }));
  ghost.position.set(0, .95, -.4); ghost.renderOrder = 2; root.add(ghost);
  // A thin, hot shock ring (bright enough to bloom), not a broad translucent disc.
  const shock = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb070).multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  shock.renderOrder = 5; shock.visible = false; scene.add(shock);
  const dust = particleLayer(scene, 340, false), sparks = particleLayer(scene, 360, true);
  const vertices = new Float32Array(256 * 3), colors = new Float32Array(256 * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const markers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
  markers.frustumCulled = false; markers.renderOrder = 9; scene.add(markers);
  const tint = new THREE.Color(), world = new THREE.Vector3();
  let lastTime = -1, emitCarry = 0, treadOffset = 0, encounter = -1;
  const alive = new Map<BossPart, boolean>(), deadAt = new Map<BossPart, number>();

  const burst = (at: THREE.Vector3, count: number, seed: number, power = 1) => {
    for (let i = 0; i < count; i++) {
      const a = hash(seed + i) * Math.PI * 2, up = hash(seed + i * 1.7 + 3), speed = (1.5 + hash(seed + i * 2.3) * 3.5) * power;
      sparks.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed, vy: 1 + up * 3 * power, vz: Math.sin(a) * speed, life: .45 + up * .6,
        size: .16 + up * .18, grow: -.08, alpha: 1, color: up > .7 ? 0xfff2cf : 0xffa15a, drag: 2.5, lift: -9 });
    }
  };
  const flash = (at: THREE.Vector3, size: number, seed: number) =>
    sparks.emit({ x: at.x, y: at.y + .3, z: at.z, vx: 0, vy: .4, vz: 0, life: .32 + hash(seed) * .15, size, grow: size * .9, alpha: .95, color: 0xffd6a0, drag: 0, lift: 0 });
  const puff = (at: THREE.Vector3, seed: number, dark: boolean, scale = 1) =>
    dust.emit({ x: at.x + (hash(seed) - .5) * .5, y: at.y + .1, z: at.z + (hash(seed + 9) - .5) * .5, vx: (hash(seed + 2) - .5) * .6, vy: .35 + hash(seed + 4) * .5,
      vz: (hash(seed + 6) - .5) * .6, life: dark ? 2.6 : 1.5, size: (dark ? .7 : .55) * scale, grow: (dark ? 1.6 : 1.2) * scale,
      alpha: dark ? .5 : .42, color: dark ? 0x2b2522 : 0xb07a4c, drag: 1.2, lift: dark ? .25 : -.05 });
  const fireball = (at: THREE.Vector3, size: number, seed: number) => {
    for (let k = 0; k < 3; k++) sparks.emit({ x: at.x + (hash(seed + k) - .5) * size * .6, y: at.y + .2 + k * .15, z: at.z + (hash(seed + k + 4) - .5) * size * .6,
      vx: (hash(seed + k + 8) - .5) * 1.2, vy: .8 + hash(seed + k) * 1.2, vz: (hash(seed + k + 12) - .5) * 1.2, life: .55 + hash(seed + k + 2) * .35,
      size: size * (.55 + k * .2), grow: size * .9, alpha: .9, color: k === 0 ? 0xfff0c0 : k === 1 ? 0xffa04a : 0xff6a24, drag: 1.5, lift: .6 });
    puff(at, seed * 3 + 1, true, size * .9);
  };
  const debris = (at: THREE.Vector3, count: number, seed: number) => {
    for (let i = 0; i < count; i++) {
      const a = hash(seed + i * 3.1) * Math.PI * 2, speed = 2.5 + hash(seed + i) * 4;
      dust.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed, vy: 3 + hash(seed + i * 1.3) * 4, vz: Math.sin(a) * speed, life: .9 + hash(seed + i * 2.7) * .6,
        size: .14 + hash(seed + i * 4.1) * .16, grow: 0, alpha: .95, color: 0x1d1714, drag: .4, lift: -14 });
    }
  };
  const local = (x: number, y: number, z: number) => root.localToWorld(world.set(x, y, z)).clone();

  return {
    /** Swap the functional stand-in for the production model once bastion-9.glb has loaded. */
    setModel(model: THREE.Group) {
      root.remove(rig.chassis); rig.dispose(); rig = modelRig(model); castShadows(rig.chassis); root.add(rig.chassis);
    },
    /** Hull rectangle in world (x, s) for the terrain exclusion, or null while no fortress is present. */
    footprint(state: RunState, placement: { s: number } | null) {
      if (!state.boss || !placement) return null;
      return { minX: state.boss.x - BASTION_FOOTPRINT.halfWidth - .4, maxX: state.boss.x + BASTION_FOOTPRINT.halfWidth + .4,
        minS: state.distance + placement.s - BASTION_FOOTPRINT.halfDepth - .4, maxS: state.distance + placement.s + BASTION_FOOTPRINT.halfDepth + .4 };
    },
    update(state: RunState, placement: { baseHeight: number; s: number; x?: number } | null) {
      const boss = state.boss;
      root.visible = !!boss; markers.visible = !!boss;
      const dt = lastTime < 0 ? 0 : Math.min(.1, Math.max(0, state.time - lastTime)); lastTime = state.time;
      if (!boss || !placement) { shock.visible = false; dust.clear(); sparks.clear(); alive.clear(); deadAt.clear(); encounter = -1; return; }
      if (encounter !== boss.startedAt) { encounter = boss.startedAt; dust.clear(); sparks.clear(); alive.clear(); deadAt.clear(); rig.parts.forEach(p => { p.open = 0; }); }
      root.position.set(placement.x ?? boss.x, placement.baseHeight, -placement.s);
      root.updateMatrixWorld(true);
      const age = state.time - boss.startedAt, phaseAge = state.time - boss.phaseStartedAt;
      const destroyed = boss.phase === 'destroyed', overload = boss.phase === 'overload';

      // Treads move at the hull's ground-relative speed: its combat-plane motion plus the terrain scroll
      // (which stops for the arena fight), so a parked fortress stops and a manoeuvring one crawls.
      const groundSpeed = destroyed ? 0 : (boss.vs ?? 0) + state.scrollSpeed;
      treadOffset = (treadOffset + groundSpeed * dt * TREAD_REPEAT) % 1;
      rig.treads.forEach(map => { map.offset.y = treadOffset; });
      emitCarry += dt * Math.min(26, Math.abs(groundSpeed) * 5 + Math.abs(boss.vx ?? 0) * 6);
      for (; emitCarry >= 1; emitCarry--) {
        const n = state.time * 97 + emitCarry, side = hash(n) < .5 ? -1 : 1;
        puff(local(side * 2.85 + (hash(n + 1) - .5) * .8, 0, (hash(n + 2) < .5 ? -1 : 1) * 2.6), n, false, boss.phase === 'arrival' ? 1.25 : .8);
      }

      // Chassis pose: settles after arrival; collapses during destruction (sparks → flashes → tilt → shock ring).
      const settle = boss.phase === 'arrival' ? Math.sin(age * 9) * .012 * (1 - age / BASTION.arrivalDuration) : 0;
      const collapse = destroyed ? THREE.MathUtils.smoothstep(phaseAge, 1.1, 2.5) : 0;
      rig.chassis.position.y = -collapse * .42 + settle;
      rig.chassis.rotation.set(-collapse * .05, 0, collapse * .1);
      if (destroyed) {
        const before = phaseAge - dt;
        for (let k = 0; k < 9; k++) {
          const at = .12 * k;
          if (before < at && phaseAge >= at) burst(local((hash(k + 3) - .5) * 5.6, 1.2, (hash(k + 5) - .5) * 4.6), 9, k * 13 + encounter, .9);
        }
        for (let k = 0; k < 8; k++) {
          const at = .45 + k * .2, spot = local((hash(k + 21) - .5) * 5, 1.2, (hash(k + 23) - .5) * 4.2);
          if (before < at && phaseAge >= at) { flash(spot, 2 + hash(k) * 1.2, k); fireball(spot, 1.4 + hash(k + 40) * .9, k * 17 + encounter); debris(spot, 10, k * 29 + encounter); }
        }
        if (before < 2.05 && phaseAge >= 2.05) {
          const heart = local(0, 1.3, -1.35);
          flash(heart, 5.5, 99); fireball(heart, 3.4, 4242 + encounter); burst(heart, 60, 777 + encounter, 2); debris(heart, 34, 919 + encounter);
          for (let k = 0; k < 4; k++) fireball(local((k % 2 ? 1 : -1) * 2.2, 1.2, (k < 2 ? .4 : -2)), 2, 600 + k + encounter);
        }
        const smokeRate = phaseAge < .6 ? 0 : phaseAge < 2.2 ? 8 : phaseAge < 5 ? 16 : 4;
        for (let k = 0; k < 3; k++) if (hash(state.time * 41 + k) < smokeRate * dt) puff(local((hash(state.time + k) - .5) * 4.8, 1.1, (hash(state.time + k + 1) - .5) * 3.8), state.time * 53 + k, true, 1.9);
      }
      const ring = THREE.MathUtils.clamp((phaseAge - 2.05) / 1.05, 0, 1);
      shock.visible = destroyed && ring > 0 && ring < 1;
      if (shock.visible) {
        shock.position.set(placement.x ?? boss.x, placement.baseHeight + .15, -placement.s);
        shock.scale.setScalar(1.2 + Math.sqrt(ring) * 7.5); (shock.material as THREE.MeshBasicMaterial).opacity = (1 - ring) * (1 - ring);
      }

      let cursor = 0;
      const line = (x: number, s: number, xx: number, ss: number, color: number) => {
        tint.setHex(color); vertices.set([x, VIEW.flightHeight + .03, -s, xx, VIEW.flightHeight + .03, -ss], cursor * 3);
        colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], cursor * 3); cursor += 2;
      };
      for (const enemy of state.enemies) {
        if (!enemy.bossPart) continue;
        const part = rig.parts.get(enemy.bossPart)!, target = rings.get(enemy.bossPart)!;
        const living = enemy.hp > 0 && !(destroyed && enemy.bossPart === 'core' && phaseAge > 2.05);
        // A module that just broke throws sparks, then trails smoke from its wreck.
        if (alive.get(enemy.bossPart) && !living) { deadAt.set(enemy.bossPart, state.time); burst(local(part.group.position.x, 1.5, part.group.position.z), 26, enemy.id * 7, 1.2); flash(local(part.group.position.x, 1.4, part.group.position.z), 1.6, enemy.id); }
        alive.set(enemy.bossPart, living);
        const died = deadAt.get(enemy.bossPart);
        if (died !== undefined && state.time - died < 7 && hash(state.time * 13 + enemy.id) < 5 * dt) puff(local(part.group.position.x, 1.5, part.group.position.z), state.time * 31 + enemy.id, true, .8);
        part.live.forEach(object => { object.visible = living; });
        if (part.wreck) part.wreck.visible = !living;
        if (!part.wreck && enemy.bossPart !== 'core') part.group.rotation.z = living ? 0 : (enemy.bossPart === 'left' ? -.14 : .14);
        // Shutters slide open when the module becomes damageable, and close over a protected one.
        const wantOpen = enemy.damageable !== false || !living ? 1 : 0;
        part.open += THREE.MathUtils.clamp(wantOpen - part.open, -dt * 1.6, dt * 1.6);
        const eased = THREE.MathUtils.smoothstep(part.open, 0, 1);
        part.shutters.forEach(shutter => { shutter.object.position.lerpVectors(shutter.closed, shutter.open, eased); shutter.object.visible = living || enemy.bossPart === 'core'; });
        if (part.gun) {
          const yaw = enemy.warning > 0 ? Math.atan2(enemy.aimX - enemy.x, enemy.s) : 0;
          part.gunYaw += (yaw - part.gunYaw) * Math.min(1, dt * 8); part.gun.rotation.y = part.gunYaw;
        }
        // Heat: brighter as armour is lost; overload flickers; warnings flare.
        const fraction = Math.max(0, enemy.hp / enemy.maxHp);
        const pulse = overload && enemy.bossPart === 'core' ? .55 + .45 * Math.sin(state.time * 14) : 1;
        part.heat.forEach(material => { material.emissiveIntensity = living ? (1 + (1 - fraction) * 1.6 + (enemy.warning > 0 ? 1.2 : 0)) * pulse : 0; });
        target.mesh.visible = enemy.hp > 0 && enemy.damageable !== false;
        target.material.color.setHex(enemy.warning > 0 ? 0xffecd0 : 0xffb77c).multiplyScalar(.45 + .55 * fraction);
        if (enemy.hp <= 0 || enemy.damageable === false) continue;
        const r = enemy.radius + .15, color = enemy.warning > 0 ? 0xffd59a : 0xdbbe8b;
        for (const x of [-1, 1]) for (const s of [-1, 1]) {
          line(enemy.x + x * r, enemy.s + s * r, enemy.x + x * (r - .25), enemy.s + s * r, color);
          line(enemy.x + x * r, enemy.s + s * r, enemy.x + x * r, enemy.s + s * (r - .25), color);
        }
        if (enemy.warning > 0 && boss.attack === 'burst') {
          for (let i = 0; i < 6; i++) {
            const a = i / 6, b = (i + .45) / 6;
            line(THREE.MathUtils.lerp(enemy.x, enemy.aimX, a), enemy.s * (1 - a), THREE.MathUtils.lerp(enemy.x, enemy.aimX, b), enemy.s * (1 - b), 0xd1a275);
          }
        }
      }
      rig.glow.forEach(material => { material.emissiveIntensity = destroyed ? Math.max(0, 1.6 - phaseAge * .8) : 1.4 + .3 * Math.sin(state.time * 3); });
      const groundShift = state.scrollSpeed * dt;
      dust.step(dt, groundShift); sparks.step(dt, groundShift);
      geometry.setDrawRange(0, cursor);
      geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('color').needsUpdate = true;
    },
    get stats() { return { model: rig.treads.length > 0 || rig.glow.length > 0 ? 'glb' : 'fallback', particles: dust.count + sparks.count }; },
  };
}
