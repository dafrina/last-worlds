import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WARDEN } from '../content/warden';
import { VIEW, type BossPart, type RunState } from '../shared/contracts';
import { hash, particleLayer } from './bastion-view';

/**
 * WARDEN-1 presentation (docs/19 §2): a decommissioned human lunar defence lander, modelled in Blender
 * (public/assets/luna/warden.glb, art/warden); a code-built stand-in renders until the model has loaded. Render-only:
 * it reads boss state and never applies damage or decides anything the simulation uses. Clean grey-white panels,
 * hazard striping, blue solar wings, four landing legs; the command module (core) between two turret pods.
 * It descends on its thrusters during the arrival and settles on its legs.
 */
const PARTS = ['left', 'right', 'core'] as const;
/** Local footprint (x half-width, z half-depth) for seating and the terrain exclusion. */
export const WARDEN_FOOTPRINT = { halfWidth: 3.0, halfDepth: 2.6 } as const;
/** Local +z faces the player (smaller s). */
const socket = (part: BossPart) => new THREE.Vector3(part === 'core' ? 0 : part === 'left' ? -WARDEN.podOffset : WARDEN.podOffset, 0, part === 'core' ? -WARDEN.commandS : 0);
/** Height of the descent at the start of the arrival. */
const DESCENT = 4.5;

interface Shutter { object: THREE.Object3D; closed: THREE.Vector3; open: THREE.Vector3 }
interface PartRig { group: THREE.Group; live: THREE.Object3D[]; wreck: THREE.Object3D; shutters: Shutter[]; heat: THREE.MeshStandardMaterial; gun?: THREE.Object3D; gunYaw: number; open: number }
interface Rig { chassis: THREE.Group; parts: Map<BossPart, PartRig>; thrusters: THREE.Group; beacon: THREE.MeshStandardMaterial; model: boolean; dispose(): void }
/** How far each of warden.glb's two core hatches slides outward along local x when the command module opens. */
const HATCH_SLIDE = .8;

export async function loadWardenModel(url: string): Promise<THREE.Group> {
  return (await new GLTFLoader().loadAsync(url)).scene;
}

/** Descent thruster flames (render-only effects) at the given sockets, hidden until the arrival. */
function thrusterFlames(sockets: THREE.Vector3[], material: THREE.Material): THREE.Group {
  const thrusters = new THREE.Group(), cone = new THREE.ConeGeometry(.22, 1.1, 10, 1, true).translate(0, .55, 0).rotateX(Math.PI);
  for (const at of sockets) { const flame = new THREE.Mesh(cone, material); flame.position.copy(at); thrusters.add(flame); }
  thrusters.visible = false;
  return thrusters;
}

/**
 * Builds the rig from warden.glb (art/warden): `warden_hull`, `warden_pod_left|right` (+ `_wreck`), `warden_core`
 * (+ `_wreck`), `warden_core_hatch_0|1`, and `warden_beacon` / `warden_thruster_N` empties. The authored paint
 * materials stay; `warden_glow` faces on a weak point take that part's heat material so hits and damage flare it.
 */
function modelRig(model: THREE.Group): Rig {
  const chassis = new THREE.Group();
  model.updateMatrixWorld(true);
  const beacon = glowMaterial(0xff3020, 2.4), thruster = glowMaterial(0x9fd8ff, 3), lamp = glowMaterial(0xff5a1e, 1.6);
  const owned: { dispose(): void }[] = [beacon, thruster, lamp];
  const heats = new Map<BossPart, THREE.MeshStandardMaterial>(PARTS.map(part => [part, glowMaterial(part === 'core' ? 0xff8a3c : 0xff9a50, 1.1)]));
  heats.forEach(material => owned.push(material));
  const partOf = (name: string): BossPart | null => name.startsWith('warden_core') ? 'core' : name.startsWith('warden_pod_left') ? 'left' : name.startsWith('warden_pod_right') ? 'right' : null;
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let owner: THREE.Object3D | null = object;
    while (owner && !owner.name.startsWith('warden_')) owner = owner.parent;
    const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.Material;
    const part = owner ? partOf(owner.name) : null, wreck = owner?.name.endsWith('_wreck') ?? false;
    if (/glow/i.test(material.name ?? '')) { material.dispose(); object.material = part && !wreck ? heats.get(part)! : lamp; object.castShadow = false; }
    else { owned.push(material); object.castShadow = true; }
    object.receiveShadow = true;
  });
  const node = (name: string) => model.getObjectByName(name);
  const at = (name: string) => node(name)?.getWorldPosition(new THREE.Vector3());
  const hull = node('warden_hull'); if (hull) chassis.attach(hull);
  const beaconAt = at('warden_beacon');
  if (beaconAt) { const light = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), beacon); light.position.copy(beaconAt); chassis.add(light); }
  const thrusters = thrusterFlames([0, 1, 2, 3].map(k => at(`warden_thruster_${k}`)).filter(Boolean) as THREE.Vector3[], thruster);
  chassis.add(thrusters);
  const parts = new Map<BossPart, PartRig>();
  for (const part of PARTS) {
    const group = new THREE.Group(); group.position.copy(socket(part)); chassis.add(group); group.updateMatrixWorld(true);
    const take = (name: string) => { const object = node(name); if (object) group.attach(object); return object ?? null; };
    const base = part === 'core' ? 'warden_core' : `warden_pod_${part}`;
    const body = take(base), live = body ? [body] : [];
    const wreck = take(`${base}_wreck`) ?? new THREE.Group(); wreck.visible = false;
    const shutters: Shutter[] = part === 'core' ? [0, 1].map(k => take(`warden_core_hatch_${k}`)).filter(Boolean).map(object => {
      const closed = object!.position.clone(), open = closed.clone().add(new THREE.Vector3(Math.sign(closed.x) * HATCH_SLIDE, 0, 0));
      return { object: object!, closed, open };
    }) : [];
    // A pod turns as a whole toward its aim while it winds up.
    parts.set(part, { group, live, wreck, shutters, heat: heats.get(part)!, gun: part === 'core' ? undefined : body ?? undefined, gunYaw: 0, open: 0 });
  }
  return { chassis, parts, thrusters, beacon, model: true, dispose() { chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); owned.forEach(item => item.dispose()); } };
}

function hazardTexture(): THREE.Texture {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 8;
  const context = canvas.getContext('2d');
  if (context) for (let x = -8; x < 72; x += 8) {
    context.fillStyle = '#e8b81e'; context.beginPath(); context.moveTo(x, 8); context.lineTo(x + 4, 0); context.lineTo(x + 8, 0); context.lineTo(x + 4, 8); context.fill();
    context.fillStyle = '#1a1a1a'; context.beginPath(); context.moveTo(x + 4, 8); context.lineTo(x + 8, 0); context.lineTo(x + 12, 0); context.lineTo(x + 8, 8); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping; texture.repeat.set(6, 1); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function solarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#1b3358'; context.fillRect(0, 0, 32, 32);
    context.fillStyle = '#9fb3c8'; for (let i = 0; i <= 32; i += 8) { context.fillRect(i, 0, 1, 32); context.fillRect(0, i, 32, 1); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 2); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const glowMaterial = (color: number, intensity: number) =>
  new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: color, emissiveIntensity: intensity, roughness: .5, metalness: .2, toneMapped: false });

function buildRig(): Rig {
  const chassis = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xc8ccd1, roughness: .52, metalness: .35 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x4b5057, roughness: .6, metalness: .55 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xd8692a, roughness: .55, metalness: .2 });
  const hazardMap = hazardTexture(), solarMap = solarTexture();
  const hazard = new THREE.MeshStandardMaterial({ map: hazardMap, roughness: .6, metalness: .1 });
  const solar = new THREE.MeshStandardMaterial({ map: solarMap, roughness: .25, metalness: .6, emissive: 0x0a1630, emissiveIntensity: .4 });
  const scorched = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: .9, metalness: .2 });
  const beacon = glowMaterial(0xff3020, 2.4), thruster = glowMaterial(0x9fd8ff, 3);
  const owned: { dispose(): void }[] = [hull, frame, orange, hazard, solar, scorched, beacon, thruster, hazardMap, solarMap];
  const statics = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z);
    const list = statics.get(material) ?? []; list.push(geometry); statics.set(material, list);
  };
  // Octagonal deck with a hazard band around its rim, a lower frame ring and a central spine.
  add(new THREE.CylinderGeometry(2.05, 2.15, .32, 8), hull, 0, .62, -.3, 0, Math.PI / 8);
  add(new THREE.CylinderGeometry(2.17, 2.17, .1, 8, 1, true), hazard, 0, .62, -.3, 0, Math.PI / 8);
  add(new THREE.CylinderGeometry(1.7, 1.85, .2, 8), frame, 0, .38, -.3, 0, Math.PI / 8);
  add(new THREE.BoxGeometry(.5, .18, 3.6), frame, 0, .86, -.3);
  // Four landing legs: a strut out to a footpad, with a knee brace.
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const top = new THREE.Vector3(lx * 1.45, .55, -.3 + lz * 1.2), foot = new THREE.Vector3(lx * 2.45, .06, -.3 + lz * 2.05);
    const strut = new THREE.CylinderGeometry(.07, .07, top.distanceTo(foot), 6);
    const mid = top.clone().add(foot).multiplyScalar(.5), dir = foot.clone().sub(top).normalize();
    strut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); add(strut, frame, mid.x, mid.y, mid.z);
    add(new THREE.CylinderGeometry(.32, .38, .1, 10), frame, foot.x, .05, foot.z);
    add(new THREE.BoxGeometry(.16, .16, .16), orange, foot.x, .2, foot.z);
  }
  // Solar wings behind the deck (away from the player), on short booms.
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(.9, .06, .08), frame, side * 2.35, .95, -2.05);
    add(new THREE.BoxGeometry(1.5, .04, 1.1), solar, side * 3.3, .97, -2.05);
  }
  // Antenna mast with a dish, and fuel tanks on the deck corners.
  add(new THREE.CylinderGeometry(.04, .05, 1.1, 6), frame, -.9, 1.35, -1.7);
  add(new THREE.SphereGeometry(.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), hull, -.9, 1.92, -1.7, Math.PI * .75);
  for (const side of [-1, 1]) add(new THREE.CylinderGeometry(.26, .26, .6, 12), orange, side * 1.15, .98, -1.35, 0, 0, Math.PI / 2);
  for (const [material, list] of statics) {
    const merged = mergeGeometries(list.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry));
    list.forEach(geometry => geometry.dispose());
    if (merged) { const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; chassis.add(mesh); owned.push(merged); }
  }
  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), beacon); beaconMesh.position.set(-.9, 1.95, -1.7); chassis.add(beaconMesh);
  // Descent thrusters under the deck (visible during the arrival only).
  const thrusters = thrusterFlames([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([tx, tz]) => new THREE.Vector3(tx * .9, .55, -.3 + tz * .75)), thruster);
  chassis.add(thrusters);

  const parts = new Map<BossPart, PartRig>();
  for (const part of PARTS) {
    const core = part === 'core', group = new THREE.Group(); group.position.copy(socket(part)); chassis.add(group);
    const heat = glowMaterial(core ? 0xff8a3c : 0xff9a50, 1.1); owned.push(heat);
    const live: THREE.Object3D[] = [], mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; group.add(object); return object;
    };
    let gun: THREE.Object3D | undefined;
    if (core) {
      // Command module: a short drum with a window band (its heat glow) under a dome with two sliding hatches.
      live.push(mesh(new THREE.CylinderGeometry(.95, 1.02, .5, 16), hull, 0, 1.0, 0));
      live.push(mesh(new THREE.CylinderGeometry(.97, .97, .12, 16), heat, 0, WARDEN.targetHeight - .08, 0));
      live.push(mesh(new THREE.CylinderGeometry(.6, .6, .1, 16), frame, 0, WARDEN.targetHeight + .02, 0));
    } else {
      // Turret pod on a pylon: an armoured box with a heat vent and twin barrels toward the player.
      live.push(mesh(new THREE.CylinderGeometry(.22, .3, .5, 8), frame, 0, .9, 0));
      gun = new THREE.Group(); gun.position.set(0, 1.15, 0); group.add(gun); live.push(gun);
      const box = new THREE.Mesh(new THREE.BoxGeometry(.9, .42, .95), hull); box.castShadow = true; gun.add(box);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.92, .08, .97), orange); stripe.position.y = .12; gun.add(stripe);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(.42, .06, .42), heat); vent.position.set(0, .23, -.05); gun.add(vent);
      for (const side of [-1, 1]) { const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .8, 8), frame); barrel.rotation.x = Math.PI / 2; barrel.position.set(side * .18, 0, .8); gun.add(barrel); }
    }
    const wreck = mesh(core ? new THREE.CylinderGeometry(.8, 1.0, .35, 9) : new THREE.CylinderGeometry(.3, .38, .45, 7), scorched, 0, core ? .9 : .85, 0);
    wreck.visible = false;
    const shutters: Shutter[] = core ? [-1, 1].map(side => {
      const object = mesh(new THREE.BoxGeometry(.9, .1, 1.7), hull, side * .46, WARDEN.targetHeight + .1, 0);
      const closed = object.position.clone(), open = closed.clone().add(new THREE.Vector3(side * .95, -.05, 0));
      return { object, closed, open };
    }) : [];
    parts.set(part, { group, live, wreck, shutters, heat, gun, gunYaw: 0, open: 0 });
  }
  return {
    chassis, parts, thrusters, beacon, model: false,
    dispose() { chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); owned.forEach(item => item.dispose()); },
  };
}

export function createWardenView(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'WARDEN-1'; root.visible = false; scene.add(root);
  let rig = buildRig(); root.add(rig.chassis);
  // Target rings on the sockets, outside the chassis so the descent and the collapse never move them.
  const rings = new Map<BossPart, { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }>();
  for (const part of PARTS) {
    const core = part === 'core', material = new THREE.MeshBasicMaterial({ color: 0xffb77c, depthTest: false, depthWrite: false });
    const ring = new THREE.RingGeometry(core ? .8 : .23, core ? 1.02 : .4, core ? 32 : 16); ring.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(ring, material); mesh.renderOrder = 4; mesh.position.copy(socket(part)).setY(WARDEN.targetHeight); root.add(mesh); rings.set(part, { mesh, material });
  }
  const shock = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc890).multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  shock.renderOrder = 5; shock.visible = false; scene.add(shock);
  const dust = particleLayer(scene, 240, false), sparks = particleLayer(scene, 300, true);
  const vertices = new Float32Array(192 * 3), colors = new Float32Array(192 * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const markers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
  markers.frustumCulled = false; markers.renderOrder = 9; scene.add(markers);
  const tint = new THREE.Color(), world = new THREE.Vector3();
  let lastTime = -1, encounter = -1;
  const alive = new Map<BossPart, boolean>(), deadAt = new Map<BossPart, number>();
  /** Last seen hp and last damaging hit per part (by enemy id), for impact flares. */
  const hpSeen = new Map<number, number>(), hitAt = new Map<number, number>();
  const local = (x: number, y: number, z: number) => root.localToWorld(world.set(x, y, z)).clone();
  const burst = (at: THREE.Vector3, count: number, seed: number, power = 1) => {
    for (let i = 0; i < count; i++) {
      const a = hash(seed + i) * Math.PI * 2, up = hash(seed + i * 1.7 + 3), speed = (1.5 + hash(seed + i * 2.3) * 3.5) * power;
      sparks.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed, vy: 1 + up * 3 * power, vz: Math.sin(a) * speed, life: .45 + up * .6,
        size: .16 + up * .18, grow: -.08, alpha: 1, color: up > .7 ? 0xfff2cf : 0xffa15a, drag: 2.5, lift: -4 });
    }
  };
  const flash = (at: THREE.Vector3, size: number, seed: number) =>
    sparks.emit({ x: at.x, y: at.y + .3, z: at.z, vx: 0, vy: .4, vz: 0, life: .32 + hash(seed) * .15, size, grow: size * .9, alpha: .95, color: 0xffd6a0, drag: 0, lift: 0 });
  // Luna has no air: smoke barely rises and falls back slowly; grey regolith dust kicks up instead.
  const puff = (at: THREE.Vector3, seed: number, dark: boolean, scale = 1) =>
    dust.emit({ x: at.x + (hash(seed) - .5) * .5, y: at.y + .1, z: at.z + (hash(seed + 9) - .5) * .5, vx: (hash(seed + 2) - .5) * 1.2, vy: .5 + hash(seed + 4) * .6,
      vz: (hash(seed + 6) - .5) * 1.2, life: dark ? 2.2 : 1.4, size: (dark ? .6 : .5) * scale, grow: (dark ? 1.3 : 1.1) * scale,
      alpha: dark ? .5 : .4, color: dark ? 0x26292c : 0x9a9893, drag: 1.4, lift: -.3 });
  const fireball = (at: THREE.Vector3, size: number, seed: number) => {
    for (let k = 0; k < 3; k++) sparks.emit({ x: at.x + (hash(seed + k) - .5) * size * .6, y: at.y + .2 + k * .15, z: at.z + (hash(seed + k + 4) - .5) * size * .6,
      vx: (hash(seed + k + 8) - .5) * 1.2, vy: .8 + hash(seed + k) * 1.2, vz: (hash(seed + k + 12) - .5) * 1.2, life: .55 + hash(seed + k + 2) * .35,
      size: size * (.55 + k * .2), grow: size * .9, alpha: .9, color: k === 0 ? 0xfff0c0 : k === 1 ? 0xffa04a : 0xff6a24, drag: 1.5, lift: .3 });
    puff(at, seed * 3 + 1, true, size * .9);
  };

  return {
    /** Hull rectangle in world (x, s) for the terrain exclusion, or null while the lander is absent. */
    footprint(state: RunState, placement: { s: number } | null) {
      if (!state.boss || !placement) return null;
      return { minX: state.boss.x - WARDEN_FOOTPRINT.halfWidth - .4, maxX: state.boss.x + WARDEN_FOOTPRINT.halfWidth + .4,
        minS: state.distance + placement.s - WARDEN_FOOTPRINT.halfDepth - .4, maxS: state.distance + placement.s + WARDEN_FOOTPRINT.halfDepth + .4 };
    },
    update(state: RunState, placement: { baseHeight: number; s: number; x?: number } | null) {
      const boss = state.boss && state.boss.id === 'warden' ? state.boss : null;
      root.visible = !!boss; markers.visible = !!boss;
      const dt = lastTime < 0 ? 0 : Math.min(.1, Math.max(0, state.time - lastTime)); lastTime = state.time;
      if (!boss || !placement) { shock.visible = false; dust.clear(); sparks.clear(); alive.clear(); deadAt.clear(); hpSeen.clear(); encounter = -1; return; }
      if (encounter !== boss.startedAt) { encounter = boss.startedAt; dust.clear(); sparks.clear(); alive.clear(); deadAt.clear(); hpSeen.clear(); rig.parts.forEach(p => { p.open = 0; }); }
      const age = state.time - boss.startedAt, phaseAge = state.time - boss.phaseStartedAt;
      const destroyed = boss.phase === 'destroyed', overload = boss.phase === 'overload', arriving = boss.phase === 'arrival';
      // Descent: high on its thrusters at first, easing onto its legs by the end of the arrival (render-only).
      const landing = arriving ? 1 - THREE.MathUtils.smoothstep(age, 0, WARDEN.arrivalDuration) : 0;
      root.position.set(placement.x ?? boss.x, placement.baseHeight + landing * landing * DESCENT, -placement.s);
      root.updateMatrixWorld(true);
      rig.thrusters.visible = landing > .01;
      rig.thrusters.children.forEach((flame, i) => { flame.scale.set(1, .6 + landing * .8 + .15 * Math.sin(state.time * 40 + i), 1); });
      if (arriving && landing < .35 && landing > .02 && hash(state.time * 23) < 18 * dt) puff(local((hash(state.time) - .5) * 3, 0, (hash(state.time + 1) - .5) * 3), state.time * 31, false, 1.4);
      rig.beacon.emissiveIntensity = destroyed ? 0 : Math.sin(state.time * 4) > .2 ? 2.6 : .3;
      // Destruction: sparks, flashes, a tilt onto a broken leg, then the reactor blast and a shock ring.
      const collapse = destroyed ? THREE.MathUtils.smoothstep(phaseAge, .9, 2.1) : 0;
      rig.chassis.position.y = -collapse * .32; rig.chassis.rotation.set(-collapse * .06, 0, collapse * .14);
      if (destroyed) {
        const before = phaseAge - dt;
        for (let k = 0; k < 7; k++) { const at = .12 * k; if (before < at && phaseAge >= at) burst(local((hash(k + 3) - .5) * 3.6, 1.1, (hash(k + 5) - .5) * 3), 8, k * 13 + encounter, .8); }
        for (let k = 0; k < 6; k++) {
          const at = .4 + k * .2, spot = local((hash(k + 21) - .5) * 3.4, 1.1, (hash(k + 23) - .5) * 2.8);
          if (before < at && phaseAge >= at) { flash(spot, 1.6 + hash(k), k); fireball(spot, 1.1 + hash(k + 40) * .7, k * 17 + encounter); }
        }
        if (before < 1.8 && phaseAge >= 1.8) { const heart = local(0, 1.2, -WARDEN.commandS); flash(heart, 4.2, 99); fireball(heart, 2.6, 4242 + encounter); burst(heart, 44, 777 + encounter, 1.6); }
        if (phaseAge > .6 && phaseAge < 6 && hash(state.time * 41) < 8 * dt) puff(local((hash(state.time) - .5) * 3, 1, (hash(state.time + 1) - .5) * 2.6), state.time * 53, true, 1.4);
      }
      const ring = THREE.MathUtils.clamp((phaseAge - 1.8) / 1, 0, 1);
      shock.visible = destroyed && ring > 0 && ring < 1;
      if (shock.visible) {
        shock.position.set(placement.x ?? boss.x, placement.baseHeight + .12, -placement.s);
        shock.scale.setScalar(1 + Math.sqrt(ring) * 6); (shock.material as THREE.MeshBasicMaterial).opacity = (1 - ring) * (1 - ring);
      }
      let cursor = 0;
      const line = (x: number, s: number, xx: number, ss: number, color: number) => {
        if (cursor + 2 > vertices.length / 3) return;
        tint.setHex(color); vertices.set([x, VIEW.flightHeight + .03, -s, xx, VIEW.flightHeight + .03, -ss], cursor * 3);
        colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], cursor * 3); cursor += 2;
      };
      for (const enemy of state.enemies) {
        if (!enemy.bossPart) continue;
        const part = rig.parts.get(enemy.bossPart)!, target = rings.get(enemy.bossPart)!;
        const living = enemy.hp > 0 && !(destroyed && enemy.bossPart === 'core' && phaseAge > 1.85);
        if (alive.get(enemy.bossPart) && !living) {
          deadAt.set(enemy.bossPart, state.time);
          const at = local(part.group.position.x, 1.3, part.group.position.z);
          burst(at, 24, enemy.id * 7, 1.1); flash(at, 1.5, enemy.id); fireball(at, 1.1, enemy.id * 5);
        }
        alive.set(enemy.bossPart, living);
        // Impact: every damaging hit on a live weak point flares its heat and throws a few sparks.
        const seen = hpSeen.get(enemy.id); hpSeen.set(enemy.id, enemy.hp);
        if (seen !== undefined && enemy.hp < seen && living) {
          if (state.time - (hitAt.get(enemy.id) ?? -9) > .07) { const at = local(part.group.position.x, 1.3, part.group.position.z); burst(at, 6, state.tick * 7 + enemy.id, .6); flash(at, .7, state.tick + enemy.id); }
          hitAt.set(enemy.id, state.time);
        }
        const kick = Math.max(0, 1 - (state.time - (hitAt.get(enemy.id) ?? -9)) / .16);
        const died = deadAt.get(enemy.bossPart);
        if (died !== undefined && state.time - died < 6 && hash(state.time * 13 + enemy.id) < 5 * dt) puff(local(part.group.position.x, 1.3, part.group.position.z), state.time * 31 + enemy.id, true, .8);
        part.live.forEach(object => { object.visible = living; });
        part.wreck.visible = !living;
        // Hatches slide open when the command module becomes damageable.
        const wantOpen = enemy.damageable !== false || !living ? 1 : 0;
        part.open += THREE.MathUtils.clamp(wantOpen - part.open, -dt * 1.6, dt * 1.6);
        const eased = THREE.MathUtils.smoothstep(part.open, 0, 1);
        part.shutters.forEach(shutter => { shutter.object.position.lerpVectors(shutter.closed, shutter.open, eased); shutter.object.visible = living || enemy.bossPart === 'core'; });
        if (part.gun) {
          const yaw = enemy.warning > 0 ? Math.atan2(enemy.aimX - enemy.x, enemy.s) : 0;
          part.gunYaw += (yaw - part.gunYaw) * Math.min(1, dt * 8); part.gun.rotation.y = part.gunYaw;
        }
        const fraction = Math.max(0, enemy.hp / enemy.maxHp);
        const pulse = overload && enemy.bossPart === 'core' ? .55 + .45 * Math.sin(state.time * 14) : 1;
        part.heat.emissiveIntensity = living ? (1 + (1 - fraction) * 1.6 + (enemy.warning > 0 ? 1.2 : 0)) * pulse + kick * 2.6 : 0;
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
      const groundShift = state.scrollSpeed * dt;
      dust.step(dt, groundShift); sparks.step(dt, groundShift);
      geometry.setDrawRange(0, cursor);
      geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('color').needsUpdate = true;
    },
    /** Swap the code-built stand-in for the production model once warden.glb has loaded. */
    setModel(model: THREE.Group) { root.remove(rig.chassis); rig.dispose(); rig = modelRig(model); root.add(rig.chassis); },
    get stats() { return { model: rig.model ? 'glb' : 'fallback', particles: dust.count + sparks.count }; },
    dispose() { rig.dispose(); scene.remove(root, shock, markers); geometry.dispose(); },
  };
}
