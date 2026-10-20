import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HELION_ARK } from '../content/ark';
import { VIEW, type BossPart, type RunState } from '../shared/contracts';
import type { FoamRing, Wake } from './water';
import { applySurfaceFinish } from './surface-finish';
import { retainBossMaterials } from './approved-boss-materials';

/**
 * Helion Ark presentation (docs/17 §5), render-only: it reads the boss state and never applies damage or decides
 * anything the simulation uses. The carrier rides on the sea with its waterline (glTF y = 0) at sea level; the
 * opaque ocean hides everything below it, which is also how the wreck sinks. Target rings and brackets sit on the
 * authored sockets, which project exactly onto the logical combat rows (see arkPlacement).
 */
const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation);
const COT_ELEVATION = 1 / Math.tan(ELEVATION);
const PARTS = ['left', 'right', 'core'] as const;
/** Reference trimaran's visual footprint; target positions are independent of the outer hull. */
export const ARK_FOOTPRINT = { halfWidth: 5.7, bow: 4.4, stern: 7.46 } as const;
/** Combat sockets in the Ark's local frame (local z = −s offset): radiators (∓2.4, 0, +0.5), bridge (0, 0, −1.6). */
export function arkSocket(part: BossPart): THREE.Vector3 {
  return part === 'core' ? new THREE.Vector3(0, 0, -HELION_ARK.bridgeS)
    : new THREE.Vector3(part === 'left' ? -HELION_ARK.radiatorOffset : HELION_ARK.radiatorOffset, 0, -HELION_ARK.radiatorS);
}
const BAYS = HELION_ARK.bays.map(bay => new THREE.Vector3(bay.x, 1.0, -bay.s));

/**
 * Orthographic seating on the sea: the waterline sits at sea level and the pivot is pushed forward so every target
 * (local height 1.6) projects onto its logical row: the same rule as ground targets (docs/05 §3).
 */
export function arkPlacement(logicalS: number, sea: number): { baseHeight: number; s: number } {
  return { baseHeight: sea, s: logicalS - (sea + HELION_ARK.targetHeight - VIEW.flightHeight) * COT_ELEVATION };
}

export async function loadArkModel(url: string): Promise<THREE.Group> {
  return (await new GLTFLoader().loadAsync(url)).scene;
}

interface Slider { object: THREE.Object3D; closed: THREE.Vector3; open: THREE.Vector3 }
interface PartRig { group: THREE.Group; live: THREE.Object3D[]; wreck?: THREE.Object3D; heat: THREE.MeshStandardMaterial; shutters: Slider[]; open: number; gun?: THREE.Object3D; gunYaw?: number }
interface Rig { chassis: THREE.Group; parts: Map<BossPart, PartRig>; doors: Slider[]; lamps: THREE.MeshStandardMaterial[]; model: boolean; approved?: boolean; dispose(): void }

const glowMaterial = (color: number, intensity: number) =>
  new THREE.MeshStandardMaterial({ color: 0x140804, emissive: color, emissiveIntensity: intensity, roughness: .5, metalness: .1, toneMapped: false });

/** One merged, invisible shadow caster for the whole carrier (a single shadow draw); detailed meshes only receive. */
const shadowProxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function castShadows(chassis: THREE.Object3D) {
  if (chassis.userData.approved) return;
  chassis.getObjectByName('ark-shadow-proxy')?.removeFromParent();
  chassis.updateMatrixWorld(true);
  const inverse = chassis.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
  chassis.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = false; child.receiveShadow = true;
    if (!child.visible) return;
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
  proxy.name = 'ark-shadow-proxy'; proxy.castShadow = true; proxy.receiveShadow = false; proxy.frustumCulled = false;
  chassis.add(proxy);
}

/** Functional stand-in until helion-ark.glb loads: black hull, pale superstructure, glowing radiators and bridge. */
function fallbackRig(): Rig {
  const chassis = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: .35, metalness: .05 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd3dae1, roughness: .4, metalness: .03 });
  const box = (parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...at); parent.add(mesh); return mesh;
  };
  box(chassis, [5.2, 1.1, 11.4], [0, .1, -1.5], armor); box(chassis, [2.8, .8, 4.2], [0, 1.0, -3.4], trim);
  const parts = new Map<BossPart, PartRig>(), heats: THREE.MeshStandardMaterial[] = [];
  for (const part of PARTS) {
    const group = new THREE.Group(); group.position.copy(arkSocket(part)); chassis.add(group);
    const heat = glowMaterial(0xff7a26, 1.2); heats.push(heat);
    const live = [box(group, part === 'core' ? [1.8, .5, 1.2] : [1.4, .5, 1.3], [0, 1.35, 0], armor), box(group, [.5, .1, .5], [0, 1.62, 0], heat)];
    const shutters = part === 'core' ? [-1, 1].map(side => {
      const object = box(group, [.9, .12, .9], [side * .47, 1.71, .36], armor);
      return { object, closed: object.position.clone(), open: object.position.clone().add(new THREE.Vector3(side * 1.0, 0, 0)) };
    }) : [];
    parts.set(part, { group, live, heat, shutters, open: 0 });
  }
  const doors = BAYS.map(bay => {
    const object = box(chassis, [.7, .06, .9], [bay.x, 1.06, bay.z], trim);
    return { object, closed: object.position.clone(), open: object.position.clone().add(new THREE.Vector3(Math.sign(bay.x) * .9, 0, 0)) };
  });
  return { chassis, parts, doors, lamps: [], model: false,
    dispose() { chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); [armor, trim, ...heats].forEach(m => m.dispose()); } };
}

/** Builds the rig from helion-ark.glb: every node is top-level and its translation is its socket (art/vesper-ark). */
function modelRig(model: THREE.Group): Rig {
  const chassis = new THREE.Group();
  const approved = !!model.getObjectByName('ark_approved_v4'); chassis.userData.approved = approved;
  model.updateMatrixWorld(true);
  const armor = applySurfaceFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .33, metalness: .68, envMapIntensity: 1.0 }), 'metal', .8, .02);
  const trim = applySurfaceFinish(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .41, metalness: .28, envMapIntensity: 1.0 }), 'metal', .8, .012);
  const lamps = glowMaterial(0xff7a26, 1.5), embers = glowMaterial(0xff5a1a, .9);
  const heats = new Map<BossPart, THREE.MeshStandardMaterial>(PARTS.map(part => [part, glowMaterial(0xff7a26, 1.2)]));
  const owned: THREE.Material[] = [armor, trim, lamps, embers, ...heats.values()];
  const paintMaps = new Set<THREE.Texture>();
  const node = (name: string) => model.getObjectByName(name);
  const retained = approved ? retainBossMaterials(model, 'ark_', name => name.includes('bridge') ? 'core' : name.includes('radiator_left') || name.includes('turret_left') ? 'left' : name.includes('radiator_right') || name.includes('turret_right') ? 'right' : null) : null;
  if (!approved) model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let owner: THREE.Object3D = object;
    while (owner.parent && owner.parent !== model) owner = owner.parent;
    const name = owner.name, source = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.Material;
    if (/glow/i.test(source.name)) {
      const part: BossPart | null = name.includes('bridge') && !name.includes('shutter') ? 'core' : name.includes('radiator_left') ? 'left' : name.includes('radiator_right') ? 'right' : null;
      object.material = name.includes('wreck') ? embers : part ? heats.get(part)! : lamps;
    } else {
      const target = /trim/i.test(source.name) ? trim : armor;
      const map = (source as THREE.MeshStandardMaterial).map;
      if (map) { target.map = map; paintMaps.add(map); }
      object.material = target;
    }
  });
  const take = (parent: THREE.Object3D, name: string) => { const object = node(name); if (object) parent.attach(object); return object; };
  const parts = new Map<BossPart, PartRig>();
  for (const part of PARTS) {
    const group = new THREE.Group(); group.position.copy(arkSocket(part)); chassis.add(group); group.updateMatrixWorld(true);
    if (part === 'core') {
      const live = [take(group, 'ark_bridge')].filter(Boolean) as THREE.Object3D[];
      // Armoured halves on the bridge front slide apart along ∓x by about 1.0 to expose the lens.
      const shutters = (['ark_bridge_shutter_a', 'ark_bridge_shutter_b'] as const).map((name, i) => {
        const object = take(group, name);
        return object ? { object, closed: object.position.clone(), open: object.position.clone().add(new THREE.Vector3(i === 0 ? -1.0 : 1.0, 0, 0)) } : null;
      }).filter(Boolean) as Slider[];
      parts.set(part, { group, live, heat: retained?.heat.get(part) ?? heats.get(part)!, shutters, open: 0 });
    } else {
      const live = [take(group, `ark_radiator_${part}`)].filter(Boolean) as THREE.Object3D[];
      const wreck = take(group, `ark_radiator_${part}_wreck`);
      if (wreck) wreck.visible = false;
      const gun = take(group, `ark_turret_${part}`); if (gun) live.push(gun);
      parts.set(part, { group, live, wreck, gun, gunYaw: 0, heat: retained?.heat.get(part) ?? heats.get(part)!, shutters: [], open: 1 });
    }
  }
  for (const name of ['ark_hull', 'ark_bay_left', 'ark_bay_right']) take(chassis, name);
  // Bay doors slide outward along ∓x by about 0.9 to open.
  const doors = (['left', 'right'] as const).map(side => {
    const object = take(chassis, `ark_bay_${side}_door`);
    return object ? { object, closed: object.position.clone(), open: object.position.clone().add(new THREE.Vector3(side === 'left' ? -.9 : .9, 0, 0)) } : null;
  }).filter(Boolean) as Slider[];
  return { chassis, parts, doors, lamps: retained?.hull ?? [lamps], model: true, approved,
    dispose() { if (retained) retained.dispose(); else chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); owned.forEach(m => m.dispose()); paintMaps.forEach(t => t.dispose()); } };
}

/* ------------------------------------------------------------------ particles (spray, steam, sparks, smoke) */

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
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = additive ? 5 : 3; mesh.name = additive ? 'ark sparks' : 'ark mist'; scene.add(mesh);
  const live: Particle[] = [], transform = new THREE.Object3D(), color = new THREE.Color();
  return {
    emit(p: Omit<Particle, 'age'>) { if (live.length < capacity) live.push({ ...p, age: 0 }); },
    step(dt: number, groundShift: number) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]; p.age += dt;
        if (p.age >= p.life) { live.splice(i, 1); continue; }
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp + p.lift * dt;
        // Particles rest in the water's frame, which slides toward the player while the world scrolls.
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
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}

/** Deterministic cosmetic noise (presentation only; never touches simulation RNG). */
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/* ------------------------------------------------------------------ view */

export function createArkView(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'Helion Ark'; root.visible = false; scene.add(root);
  let rig = fallbackRig(); castShadows(rig.chassis); root.add(rig.chassis);
  // Target rings on the sockets, outside the chassis so the listing/sinking pose never moves them.
  const rings = new Map<BossPart, { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }>();
  for (const part of PARTS) {
    const core = part === 'core', material = new THREE.MeshBasicMaterial({ color: 0xffb77c, depthTest: false, depthWrite: false });
    const ring = new THREE.RingGeometry(core ? .8 : .55, core ? 1.0 : .72, core ? 32 : 24); ring.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(ring, material); mesh.name = `ark-target-${part}`; mesh.renderOrder = 4;
    mesh.position.copy(arkSocket(part)).setY(HELION_ARK.targetHeight); root.add(mesh); rings.set(part, { mesh, material });
  }
  const mist = particleLayer(scene, 360, false), sparks = particleLayer(scene, 320, true);
  const vertices = new Float32Array(256 * 3), colors = new Float32Array(256 * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const markers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
  markers.frustumCulled = false; markers.renderOrder = 9; scene.add(markers);
  const tint = new THREE.Color(), world = new THREE.Vector3();
  const rings3: FoamRing[] = [], wakes: Wake[] = [];
  let lastTime = -1, encounter = -1, sprayCarry = 0, doorsOpen = 0, lastNextLaunch = Infinity, lastLaunchAt = -Infinity;
  const alive = new Map<BossPart, boolean>(), deadAt = new Map<BossPart, number>();
  /** Last seen hp and last damaging hit per boss part (by enemy id), for impact flares. */
  const hpSeen = new Map<number, number>(), hitAt = new Map<number, number>();

  const local = (x: number, y: number, z: number) => root.localToWorld(world.set(x, y, z)).clone();
  const burst = (at: THREE.Vector3, count: number, seed: number, power = 1) => {
    for (let i = 0; i < count; i++) {
      const a = hash(seed + i) * Math.PI * 2, up = hash(seed + i * 1.7 + 3), speed = (1.5 + hash(seed + i * 2.3) * 3.5) * power;
      sparks.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed, vy: 1 + up * 3 * power, vz: Math.sin(a) * speed, life: .45 + up * .6,
        size: .16 + up * .18, grow: -.08, alpha: 1, color: up > .7 ? 0xfff2cf : 0xffa15a, drag: 2.5, lift: -9 });
    }
  };
  const flash = (at: THREE.Vector3, size: number, seed: number) =>
    sparks.emit({ x: at.x, y: at.y + .3, z: at.z, vx: 0, vy: .4, vz: 0, life: .32 + hash(seed) * .15, size, grow: size * .9, alpha: .95, color: 0xffd6a0, drag: 0, lift: 0 });
  const steam = (at: THREE.Vector3, seed: number, scale = 1) =>
    mist.emit({ x: at.x + (hash(seed) - .5) * .5, y: at.y + .1, z: at.z + (hash(seed + 9) - .5) * .5, vx: (hash(seed + 2) - .5) * .4, vy: .6 + hash(seed + 4) * .5,
      vz: (hash(seed + 6) - .5) * .4, life: 2.2, size: .6 * scale, grow: 1.6 * scale, alpha: .42, color: 0xe8f0f6, drag: 1, lift: .2 });
  const smoke = (at: THREE.Vector3, seed: number, scale = 1) =>
    mist.emit({ x: at.x + (hash(seed) - .5) * .5, y: at.y + .1, z: at.z + (hash(seed + 9) - .5) * .5, vx: (hash(seed + 2) - .5) * .5, vy: .4 + hash(seed + 4) * .5,
      vz: (hash(seed + 6) - .5) * .5, life: 2.6, size: .7 * scale, grow: 1.6 * scale, alpha: .5, color: 0x1e2226, drag: 1.2, lift: .25 });
  const spray = (at: THREE.Vector3, seed: number, scale = 1) =>
    mist.emit({ x: at.x, y: at.y + .05, z: at.z, vx: (hash(seed) - .5) * 1.6, vy: 1.4 + hash(seed + 3) * 1.4, vz: (hash(seed + 5) - .2) * 1.2, life: .8,
      size: .35 * scale, grow: .9 * scale, alpha: .55, color: 0xf2f8fc, drag: 1.4, lift: -3.5 });
  const fireball = (at: THREE.Vector3, size: number, seed: number) => {
    for (let k = 0; k < 3; k++) sparks.emit({ x: at.x + (hash(seed + k) - .5) * size * .6, y: at.y + .2 + k * .15, z: at.z + (hash(seed + k + 4) - .5) * size * .6,
      vx: (hash(seed + k + 8) - .5) * 1.2, vy: .8 + hash(seed + k) * 1.2, vz: (hash(seed + k + 12) - .5) * 1.2, life: .55 + hash(seed + k + 2) * .35,
      size: size * (.55 + k * .2), grow: size * .9, alpha: .9, color: k === 0 ? 0xfff0c0 : k === 1 ? 0xffa04a : 0xff6a24, drag: 1.5, lift: .6 });
    smoke(at, seed * 3 + 1, size * .9);
  };

  return {
    /** Swap the functional stand-in for the production carrier once helion-ark.glb has loaded. */
    setModel(model: THREE.Group) {
      root.remove(rig.chassis); rig.dispose(); rig = modelRig(model); castShadows(rig.chassis); root.add(rig.chassis);
    },
    /** Hull rectangle in world (x, s) for the scenery exclusion (floes and bergs under the carrier), or null. */
    footprint(state: RunState, placement: { s: number; x?: number } | null) {
      if (!state.boss || state.boss.id !== 'ark' || !placement) return null;
      const x = placement.x ?? state.boss.x;
      return { minX: x - ARK_FOOTPRINT.halfWidth - .4, maxX: x + ARK_FOOTPRINT.halfWidth + .4,
        minS: state.distance + placement.s - ARK_FOOTPRINT.bow - .4, maxS: state.distance + placement.s + ARK_FOOTPRINT.stern + .4 };
    },
    /** Foam on the ocean this frame: a collar around the hull and bow/stern wakes (consumed by the water's foam layer). */
    get foam(): { rings: readonly FoamRing[]; wakes: readonly Wake[] } { return { rings: rings3, wakes }; },
    update(state: RunState, placement: { baseHeight: number; s: number; x?: number } | null) {
      const boss = state.boss && state.boss.id === 'ark' ? state.boss : null;
      root.visible = !!boss && !!placement; markers.visible = root.visible;
      rings3.length = 0; wakes.length = 0;
      const dt = lastTime < 0 ? 0 : Math.min(.1, Math.max(0, state.time - lastTime)); lastTime = state.time;
      if (!boss || !placement) { mist.clear(); sparks.clear(); alive.clear(); deadAt.clear(); encounter = -1; return; }
      if (encounter !== boss.startedAt) {
        encounter = boss.startedAt; mist.clear(); sparks.clear(); alive.clear(); deadAt.clear(); doorsOpen = 0; lastNextLaunch = Infinity; lastLaunchAt = -Infinity;
        rig.parts.forEach(p => { p.open = p.shutters.length ? 0 : 1; });
      }
      const sea = placement.baseHeight, age = state.time - boss.startedAt, phaseAge = state.time - boss.phaseStartedAt;
      const destroyed = boss.phase === 'destroyed', overload = boss.phase === 'overload';
      root.position.set(placement.x ?? boss.x, sea, -placement.s);
      root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);

      // Ride: a slow swell on the hull; destruction lists it to starboard, noses the bow down and sinks it.
      // Timed to the extraction: the resumed scroll carries the wreck out of view about 3 s after the kill.
      const list = destroyed ? THREE.MathUtils.smoothstep(phaseAge, .5, 2.2) : 0;
      const sink = destroyed ? THREE.MathUtils.smoothstep(phaseAge, 1.0, 3.4) : 0;
      // The reference tower reaches 4.8 units; include its rise from the listing pose.
      rig.chassis.position.y = Math.sin(state.time * .9) * .025 * (1 - list) - sink * (rig.approved ? 7 : 5.8);
      rig.chassis.rotation.set(Math.sin(state.time * .6) * .006 - list * .05, 0, Math.sin(state.time * .7 + 1) * .008 + list * .22);

      // Motion over the water: combat-plane velocity plus the scroll (zero while the arena holds). The bow faces +z
      // (toward the player, −s), so forward speed is the negative of the ground-relative s speed.
      const forward = destroyed ? 0 : -((boss.vs ?? 0) + state.scrollSpeed), lateral = boss.vx ?? 0;
      const speed = Math.hypot(forward, lateral), heading = Math.PI + Math.atan2(lateral, Math.max(.01, forward)) * .5;
      const bow = local(0, 0, rig.approved ? 3.5 : ARK_FOOTPRINT.bow - .3), stern = local(0, 0, rig.approved ? -4 : -ARK_FOOTPRINT.stern), centre = local(0, 0, rig.approved ? -.2 : -1.5);
      // Gentle while it holds station (swell against the hull, a churned stern), strong while it glides in.
      const wakeStrength = destroyed ? Math.max(0, .3 - phaseAge * .06) : THREE.MathUtils.clamp(.18 + speed * .14, .18, .9);
      if (wakeStrength > 0) {
        wakes.push({ x: bow.x, z: bow.z, y: sea, heading, length: 6 + speed * 1.6, width: 6.5 + speed * .4, strength: wakeStrength * .7 });
        wakes.push({ x: stern.x, z: stern.z, y: sea, heading, length: 3 + speed * 2.5, width: 2.6, strength: Math.min(1, wakeStrength * 1.4) });
      }
      // Hull collar; while sinking it widens into a foam ring around the going-down hull.
      const spread = 1 + sink * .45;
      const foamStrength = destroyed ? .22 + .22 * Math.sin(Math.min(1, sink) * Math.PI) : rig.approved ? .16 : .28;
      if (rig.approved) {
        // The approved vessel has three separate hulls with open water between them.
        for (const side of [-1, 1]) rings3.push({ x: centre.x + side * 3.2, z: centre.z, y: sea, yaw: 0, rx: 1.15 * spread, rz: 3.65 * spread, strength: foamStrength });
        rings3.push({ x: centre.x, z: centre.z - 1.4, y: sea, yaw: 0, rx: .65 * spread, rz: 1.8 * spread, strength: foamStrength * .7 });
      } else rings3.push({ x: centre.x, z: centre.z, y: sea, yaw: 0, rx: 4.8 * spread, rz: 5.7 * spread, strength: foamStrength });
      // Spray off the bow while it glides in (and a little while it surges), thrown up by the cutwater.
      sprayCarry += dt * Math.min(30, speed * 6);
      for (; sprayCarry >= 1; sprayCarry--) {
        const n = state.time * 91 + sprayCarry, side = hash(n) < .5 ? -1 : 1;
        spray(local(side * (.4 + hash(n + 1) * 1.6), 0, ARK_FOOTPRINT.bow - .6 - hash(n + 2) * 2.2), n, boss.phase === 'arrival' ? 1.2 : .8);
      }

      // Bay doors open just before each launch and close behind it (nextLaunchAt steps forward on every launch).
      if (boss.nextLaunchAt !== lastNextLaunch) { if (Number.isFinite(lastNextLaunch) && boss.nextLaunchAt > lastNextLaunch) lastLaunchAt = lastNextLaunch; lastNextLaunch = boss.nextLaunchAt; }
      // A pure function of the launch clock (no integration), so the pose is right in any frame, paused or not.
      const opening = boss.launchesLeft > 0 ? 1 - THREE.MathUtils.smoothstep(boss.nextLaunchAt - state.time, .25, .9) : 0;
      const closing = 1 - THREE.MathUtils.smoothstep(state.time - lastLaunchAt, .5, 1.1);
      doorsOpen = destroyed ? 0 : Math.max(opening, closing);
      const doorEase = doorsOpen;
      rig.doors.forEach(door => door.object.position.lerpVectors(door.closed, door.open, doorEase));
      if (doorEase > .5 && hash(state.time * 17) < 8 * dt) for (const bay of BAYS) steam(local(bay.x, 1.1, bay.z), state.time * 23 + bay.x, .5);

      if (destroyed) {
        // Explosions march along the hull from bow to stern, then the bridge blows; steam and smoke as it settles.
        const before = phaseAge - dt;
        for (let k = 0; k < 12; k++) {
          const at = .15 * k, spot = local((hash(k + 31) - .5) * 4.6, 1.1 + hash(k + 7) * .6, 3.6 - k * .85);
          if (before < at && phaseAge >= at) { flash(spot, 1.6 + hash(k) * 1.2, k); fireball(spot, 1.2 + hash(k + 40) * .8, k * 17 + encounter); burst(spot, 8, k * 13 + encounter, .9); }
        }
        if (before < 2.0 && phaseAge >= 2.0) {
          const heart = local(0, 1.7, -1.6);
          flash(heart, 5.5, 99); fireball(heart, 3.2, 4242 + encounter); burst(heart, 50, 777 + encounter, 2);
          for (const side of [-1, 1]) fireball(local(side * 2.4, 1.4, .5), 1.8, 600 + side + encounter);
        }
        const steamRate = phaseAge < 1 ? 0 : phaseAge < 6 ? 9 : 3;
        for (let k = 0; k < 3; k++) if (hash(state.time * 41 + k) < steamRate * dt) {
          const at = local((hash(state.time + k) - .5) * 5, .3, 3 - hash(state.time + k + 1) * 9);
          at.y = Math.max(at.y, sea + .05);
          if (k === 0) smoke(at, state.time * 53 + k, 1.2); else steam(at, state.time * 53 + k, 1.2);
        }
      }

      let cursor = 0;
      const line = (x: number, s: number, xx: number, ss: number, color: number) => {
        tint.setHex(color); vertices.set([x, VIEW.flightHeight + .03, -s, xx, VIEW.flightHeight + .03, -ss], cursor * 3);
        colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], cursor * 3); cursor += 2;
      };
      for (const enemy of state.enemies) {
        if (!enemy.bossPart) continue;
        const part = rig.parts.get(enemy.bossPart)!, target = rings.get(enemy.bossPart)!;
        const living = enemy.hp > 0 && !(destroyed && enemy.bossPart === 'core' && phaseAge > 2.0);
        // A radiator that just broke swaps to its wreck with sparks, a flash, then vents steam and smoke for a while.
        if (alive.get(enemy.bossPart) && !living) {
          deadAt.set(enemy.bossPart, state.time);
          const at = local(part.group.position.x, 1.6, part.group.position.z);
          burst(at, 28, enemy.id * 7, 1.2); flash(at, 1.8, enemy.id); fireball(at, 1.3, enemy.id * 5);
        }
        alive.set(enemy.bossPart, living);
        // Impact: every damaging hit on a live weak point flares its heat and throws a few sparks from the part, so hits
        // read on a boss as clearly as on a small craft (presentation only; sparks at most every 0.07 s per part).
        const seen = hpSeen.get(enemy.id); hpSeen.set(enemy.id, enemy.hp);
        if (seen !== undefined && enemy.hp < seen && living) {
          if (state.time - (hitAt.get(enemy.id) ?? -9) > .07) {
            const at = local(part.group.position.x, 1.5, part.group.position.z);
            burst(at, 6, state.tick * 7 + enemy.id, .6); flash(at, .8, state.tick + enemy.id);
          }
          hitAt.set(enemy.id, state.time);
        }
        const kick = Math.max(0, 1 - (state.time - (hitAt.get(enemy.id) ?? -9)) / .16);
        const died = deadAt.get(enemy.bossPart);
        if (died !== undefined && state.time - died < 8 && hash(state.time * 13 + enemy.id) < 6 * dt) {
          const at = local(part.group.position.x, 1.5, part.group.position.z);
          if (hash(state.time * 7 + enemy.id) < .6) steam(at, state.time * 31 + enemy.id, .9); else smoke(at, state.time * 31 + enemy.id, .8);
        }
        part.live.forEach(object => { object.visible = living; });
        if (part.wreck) part.wreck.visible = !living;
        if (part.gun) {
          const yaw = enemy.warning > 0 ? Math.atan2(enemy.aimX - enemy.x, enemy.s) : 0;
          part.gunYaw = (part.gunYaw ?? 0) + (THREE.MathUtils.clamp(yaw, -.35, .35) - (part.gunYaw ?? 0)) * Math.min(1, dt * 7);
          part.gun.rotation.y = part.gunYaw;
        }
        // Bridge shutters slide open once the bridge is damageable (and stay open on a dead one).
        if (part.shutters.length) {
          // Open over 0.8 s from the start of the bridge phase; overload and the wreck keep them open.
          part.open = boss.phase === 'core' ? THREE.MathUtils.smoothstep(phaseAge, 0, .8) : overload || destroyed || !living ? 1 : 0;
          const eased = part.open;
          part.shutters.forEach(shutter => shutter.object.position.lerpVectors(shutter.closed, shutter.open, eased));
        }
        // Heat: brighter as armour is lost; warnings flare; the bridge flickers in overload.
        const fraction = Math.max(0, enemy.hp / enemy.maxHp);
        const pulse = overload && enemy.bossPart === 'core' ? .5 + .5 * Math.abs(Math.sin(state.time * 13)) : 1;
        part.heat.emissiveIntensity = living ? (1.1 + (1 - fraction) * 2 + (enemy.warning > 0 ? 1.4 : 0)) * pulse + kick * 2.8 : 0;
        target.mesh.visible = enemy.hp > 0 && enemy.damageable !== false;
        target.material.color.setHex(enemy.warning > 0 ? 0xffecd0 : 0xffb77c).multiplyScalar(.45 + .55 * fraction);
        if (enemy.hp <= 0 || enemy.damageable === false) continue;
        const r = enemy.radius + .15, color = kick > 0 ? 0xffffff : enemy.warning > 0 ? 0xffd59a : 0xdbbe8b;
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
      rig.lamps.forEach(material => { material.emissiveIntensity = destroyed ? Math.max(0, 1.5 - phaseAge * .5) : 1.4 + .25 * Math.sin(state.time * 2.6); });
      const groundShift = state.scrollSpeed * dt;
      mist.step(dt, groundShift); sparks.step(dt, groundShift);
      geometry.setDrawRange(0, cursor);
      geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('color').needsUpdate = true;
    },
    get stats() { return { model: rig.model ? 'glb' : 'fallback', approved: !!rig.approved, particles: mist.count + sparks.count }; },
    dispose() {
      scene.remove(root); scene.remove(markers); rig.dispose(); mist.dispose(); sparks.dispose(); geometry.dispose(); (markers.material as THREE.Material).dispose();
      rings.forEach(({ mesh, material }) => { mesh.geometry.dispose(); material.dispose(); });
    },
  };
}
export type ArkView = ReturnType<typeof createArkView>;
