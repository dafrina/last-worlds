import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEIL } from '../content/veil';
import { VIEW, type BossPart, type RunState } from '../shared/contracts';
import { hash, particleLayer } from './bastion-view';

/**
 * THE VEIL presentation (docs/20): a giant biological starship after the "Veil" concept, built in code. Render-only:
 * it reads boss state and never applies damage. A long, flattened iridescent purple hull with pale bone ribs and a
 * carapace spine, two pairs of huge flat crescent blades sweeping past the edges of the view, bulbous gill pods with
 * glowing teal slits (the first pair), a glowing teal heart behind four membrane petals (the core), trailing tendrils
 * and teal stern engines. It rises out of the mire on arrival and sinks back into it when destroyed.
 */
const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation), COT_ELEVATION = 1 / Math.tan(ELEVATION);
const PARTS = ['left', 'right', 'core'] as const;
/** Local +z faces the player (smaller s). */
const socket = (part: BossPart) => new THREE.Vector3(part === 'core' ? 0 : part === 'left' ? -VEIL.podOffset : VEIL.podOffset, 0, part === 'core' ? -VEIL.heartS : -VEIL.podS);
/** Hull footprint (x half-width, z half-depth) for the terrain exclusion (the blades overhang water anyway). */
export const VEIL_FOOTPRINT = { halfWidth: 7.5, halfDepth: 9 } as const;
/** How deep the hull starts under the mire as it rises, and how far it sinks when destroyed. */
const RISE = 3.2, SINK = 4.2;

/** Its waterline seat: the target plane (VEIL.targetHeight above the mire) projects onto the logical rows. */
export function veilPlacement(logicalS: number, sea: number): { baseHeight: number; s: number } {
  return { baseHeight: sea, s: logicalS - (sea + VEIL.targetHeight - VIEW.flightHeight) * COT_ELEVATION };
}

interface PartRig { group: THREE.Group; live: THREE.Object3D[]; wreck: THREE.Object3D; petals: { object: THREE.Object3D; closed: THREE.Euler; open: THREE.Euler }[]; heat: THREE.MeshStandardMaterial; open: number }

const glowMaterial = (color: number, intensity: number) =>
  new THREE.MeshStandardMaterial({ color: 0x08201e, emissive: color, emissiveIntensity: intensity, roughness: .4, metalness: .1, toneMapped: false });

/** A flat crescent blade in the xz plane (outer and inner arcs meeting at two points), extruded thin in y. */
function crescent(length: number, width: number, bend: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(), steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = (t - .5) * Math.PI * bend, x = Math.sin(a) * length / 2, z = (1 - Math.cos(a)) * length * .35;
    i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps, a = (t - .5) * Math.PI * bend, w = Math.sin(t * Math.PI) * width;
    shape.lineTo(Math.sin(a) * (length / 2 - w * .2), (1 - Math.cos(a)) * length * .35 + w);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * .4, bevelSize: thickness * .6, bevelSegments: 1, curveSegments: 4 });
  geometry.rotateX(Math.PI / 2); geometry.center();
  return geometry;
}

function buildRig() {
  const chassis = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x4a2b7c, roughness: .3, metalness: .65, envMapIntensity: 1.2 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xcfc2ea, roughness: .35, metalness: .55, envMapIntensity: 1.1 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x241638, roughness: .6, metalness: .2 });
  const sinew = glowMaterial(0x3ff2d8, 1.4), engine = glowMaterial(0x6af6ff, 2.6);
  const owned: { dispose(): void }[] = [shell, bone, flesh, sinew, engine];
  const statics = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, transform?: (g: THREE.BufferGeometry) => void) => {
    transform?.(geometry); const list = statics.get(material) ?? []; list.push(geometry.index ? geometry.toNonIndexed() : geometry); statics.set(material, list);
  };
  // Hull: a lathed spindle laid along z (nose toward the player at +5.5, stern far behind at −10), flattened.
  const profile = [[0, 0], [.55, .6], [1.25, 1.8], [1.85, 4], [2.05, 6.5], [1.9, 9], [1.4, 11.5], [.8, 13.6], [.35, 15.2], [0, 15.6]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(profile, 18), shell, g => { g.rotateX(-Math.PI / 2); g.translate(0, 0, 5.5); g.scale(1, .5, 1); g.translate(0, 1.55, 0); });
  // Carapace spine: overlapping plates down the back.
  for (let i = 0; i < 9; i++) add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), bone, g => {
    const z = 3.6 - i * 1.45, w = .9 - Math.abs(i - 3) * .07;
    g.scale(w, .32, .9); g.translate(0, 2.0 - Math.abs(i - 3) * .02, z);
  });
  // Bone ribs arching across the hull.
  for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(1.95 - Math.abs(i - 3) * .12, .09, 6, 18, Math.PI), bone, g => {
    g.scale(1, .55, 1); g.translate(0, 1.5, 0); g.translate(0, 0, 2.4 - i * 1.7);
  });
  // Two pairs of huge flat crescent blades sweeping from the flanks past the view's edges.
  for (const side of [-1, 1]) {
    add(crescent(9.5, 1.1, .85, .12), bone, g => { g.rotateY(side * .35); g.rotateZ(side * -.12); g.translate(side * 4.6, 1.75, -1.6); });
    add(crescent(7, .85, .9, .1), shell, g => { g.rotateY(side * .6); g.rotateZ(side * -.18); g.translate(side * 4.1, 1.35, -4.6); });
    // Glowing sinew lines along the blade roots.
    add(new THREE.BoxGeometry(2.6, .05, .08), sinew, g => { g.rotateY(side * .3); g.translate(side * 2.6, 1.9, -1.2); });
  }
  // Glowing veins running along both flanks of the hull.
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
    const points = Array.from({ length: 8 }, (_, i) => { const z = 4.6 - i * 1.7, r = Math.max(.3, 2.05 - Math.abs(z + 1.2) * .16) * (.62 + k * .14);
      return new THREE.Vector3(side * r, 1.55 + .62 * Math.sqrt(Math.max(0, 1 - (r / 2.1) ** 2)) * (1 - k * .3) + Math.sin(i * 1.3 + k) * .05, z); });
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, .045, 4), sinew);
  }
  // Trailing tendrils under the stern, with glowing tips.
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * .55, curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 1.1, -6), new THREE.Vector3(x * 1.3, .6, -8.5), new THREE.Vector3(x * 1.6 + Math.sin(i) * .5, .25, -11.5)]);
    add(new THREE.TubeGeometry(curve, 10, .1, 5), flesh);
    add(new THREE.SphereGeometry(.14, 8, 6), sinew, g => g.translate(x * 1.6 + Math.sin(i) * .5, .25, -11.5));
  }
  // Stern engines.
  for (const side of [-1, 1]) add(new THREE.ConeGeometry(.45, 1.2, 12, 1, true), engine, g => { g.rotateX(-Math.PI / 2); g.translate(side * .7, 1.5, -10.1); });
  for (const [material, list] of statics) {
    const merged = mergeGeometries(list); list.forEach(geometry => geometry.dispose());
    if (merged) { const mesh = new THREE.Mesh(merged, material); mesh.castShadow = material !== engine && material !== sinew; mesh.receiveShadow = true; chassis.add(mesh); owned.push(merged); }
  }

  const parts = new Map<BossPart, PartRig>();
  for (const part of PARTS) {
    const core = part === 'core', group = new THREE.Group(); group.position.copy(socket(part)); chassis.add(group);
    const heat = glowMaterial(0x3ff2d8, 1.2); owned.push(heat);
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; group.add(object); return object;
    };
    const live: THREE.Object3D[] = [];
    const petals: PartRig['petals'] = [];
    if (core) {
      // The heart: a glowing sphere in a dark iris ring, behind four membrane petals that fold open.
      live.push(mesh(new THREE.SphereGeometry(.72, 20, 12), heat, 0, VEIL.targetHeight - .3, 0));
      live.push(mesh(new THREE.TorusGeometry(.92, .16, 8, 24).rotateX(Math.PI / 2), flesh, 0, VEIL.targetHeight - .15, 0));
      for (let k = 0; k < 4; k++) {
        const hinge = new THREE.Group(); hinge.position.set(0, VEIL.targetHeight + .02, 0); hinge.rotation.y = k * Math.PI / 2 + Math.PI / 4; group.add(hinge);
        const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI / 2, 0, Math.PI / 2), shell); petal.scale.set(1, .35, 1); petal.castShadow = true; hinge.add(petal);
        petals.push({ object: hinge, closed: hinge.rotation.clone(), open: new THREE.Euler(0, hinge.rotation.y, 0) });
      }
    } else {
      // Gill pod: a bulbous sac on the flank with three glowing slits.
      const sac = mesh(new THREE.SphereGeometry(.85, 16, 10), shell, 0, 1.75, 0); sac.scale.set(1, .7, 1.35); live.push(sac);
      for (let k = 0; k < 3; k++) { const slit = mesh(new THREE.BoxGeometry(.08, .06, .9), heat, (k - 1) * .3, 2.3 - Math.abs(k - 1) * .05, 0); live.push(slit); }
    }
    const wreck = mesh(core ? new THREE.SphereGeometry(.7, 10, 6) : new THREE.SphereGeometry(.65, 10, 6), flesh, 0, core ? VEIL.targetHeight - .4 : 1.6, 0);
    wreck.scale.set(1, .4, 1.2); wreck.visible = false;
    parts.set(part, { group, live, wreck, petals, heat, open: 0 });
  }
  return { chassis, parts, engine, sinew, dispose() { chassis.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); owned.forEach(item => item.dispose()); } };
}

export function createVeilView(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'THE VEIL'; root.visible = false; scene.add(root);
  const rig = buildRig(); root.add(rig.chassis);
  const rings = new Map<BossPart, { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }>();
  for (const part of PARTS) {
    const core = part === 'core', material = new THREE.MeshBasicMaterial({ color: 0xffb77c, depthTest: false, depthWrite: false });
    const ring = new THREE.RingGeometry(core ? .95 : .3, core ? 1.2 : .48, core ? 32 : 16); ring.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(ring, material); mesh.renderOrder = 4; mesh.position.copy(socket(part)).setY(VEIL.targetHeight); root.add(mesh); rings.set(part, { mesh, material });
  }
  const shock = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ffff0).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  shock.renderOrder = 5; shock.visible = false; scene.add(shock);
  const mist = particleLayer(scene, 320, false), sparks = particleLayer(scene, 420, true);
  const vertices = new Float32Array(192 * 3), colors = new Float32Array(192 * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const markers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
  markers.frustumCulled = false; markers.renderOrder = 9; scene.add(markers);
  const tint = new THREE.Color(), world = new THREE.Vector3();
  let lastTime = -1, encounter = -1;
  const alive = new Map<BossPart, boolean>(), deadAt = new Map<BossPart, number>();
  const hpSeen = new Map<number, number>(), hitAt = new Map<number, number>();
  const local = (x: number, y: number, z: number) => root.localToWorld(world.set(x, y, z)).clone();
  const burst = (at: THREE.Vector3, count: number, seed: number, power = 1, color = 0x8ffff0) => {
    for (let i = 0; i < count; i++) {
      const a = hash(seed + i) * Math.PI * 2, up = hash(seed + i * 1.7 + 3), speed = (1.5 + hash(seed + i * 2.3) * 3.5) * power;
      sparks.emit({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed, vy: 1 + up * 3 * power, vz: Math.sin(a) * speed, life: .45 + up * .6,
        size: .16 + up * .2, grow: -.08, alpha: 1, color: up > .7 ? 0xf2fff8 : color, drag: 2.5, lift: -9 });
    }
  };
  const flash = (at: THREE.Vector3, size: number, seed: number, color = 0xc8fff2) =>
    sparks.emit({ x: at.x, y: at.y + .3, z: at.z, vx: 0, vy: .4, vz: 0, life: .32 + hash(seed) * .15, size, grow: size * .9, alpha: .95, color, drag: 0, lift: 0 });
  const steam = (at: THREE.Vector3, seed: number, scale = 1) =>
    mist.emit({ x: at.x + (hash(seed) - .5) * .8, y: at.y + .1, z: at.z + (hash(seed + 9) - .5) * .8, vx: (hash(seed + 2) - .5) * .5, vy: .6 + hash(seed + 4) * .5,
      vz: (hash(seed + 6) - .5) * .5, life: 2.4, size: .7 * scale, grow: 1.8 * scale, alpha: .4, color: 0x9a86d0, drag: 1, lift: .2 });
  const ichor = (at: THREE.Vector3, size: number, seed: number) => {
    for (let k = 0; k < 3; k++) sparks.emit({ x: at.x + (hash(seed + k) - .5) * size * .6, y: at.y + .2 + k * .15, z: at.z + (hash(seed + k + 4) - .5) * size * .6,
      vx: (hash(seed + k + 8) - .5) * 1.2, vy: .8 + hash(seed + k) * 1.2, vz: (hash(seed + k + 12) - .5) * 1.2, life: .6 + hash(seed + k + 2) * .35,
      size: size * (.55 + k * .2), grow: size * .9, alpha: .9, color: k === 0 ? 0xeafff8 : k === 1 ? 0x56f6dc : 0xa070ff, drag: 1.5, lift: .5 });
    steam(at, seed * 3 + 1, size * .9);
  };

  return {
    footprint(state: RunState, placement: { s: number } | null) {
      if (!state.boss || !placement) return null;
      return { minX: state.boss.x - VEIL_FOOTPRINT.halfWidth, maxX: state.boss.x + VEIL_FOOTPRINT.halfWidth,
        minS: state.distance + placement.s - 6, maxS: state.distance + placement.s + 12 };
    },
    update(state: RunState, placement: { baseHeight: number; s: number; x?: number } | null) {
      const boss = state.boss && state.boss.id === 'veil' ? state.boss : null;
      root.visible = !!boss; markers.visible = !!boss;
      const dt = lastTime < 0 ? 0 : Math.min(.1, Math.max(0, state.time - lastTime)); lastTime = state.time;
      if (!boss || !placement) { shock.visible = false; mist.clear(); sparks.clear(); alive.clear(); deadAt.clear(); hpSeen.clear(); encounter = -1; return; }
      if (encounter !== boss.startedAt) { encounter = boss.startedAt; mist.clear(); sparks.clear(); alive.clear(); deadAt.clear(); hpSeen.clear(); rig.parts.forEach(p => { p.open = 0; }); }
      const age = state.time - boss.startedAt, phaseAge = state.time - boss.phaseStartedAt;
      const destroyed = boss.phase === 'destroyed', overload = boss.phase === 'overload', arriving = boss.phase === 'arrival';
      // Rising out of the mire during the arrival; a slow breathing bob while alive; sinking after its death.
      const rise = arriving ? 1 - THREE.MathUtils.smoothstep(age, 0, VEIL.arrivalDuration) : 0;
      const sink = destroyed ? THREE.MathUtils.smoothstep(phaseAge, 1.6, 5.5) : 0;
      const bob = destroyed ? 0 : Math.sin(state.time * .9) * .06;
      root.position.set(placement.x ?? boss.x, placement.baseHeight - rise * rise * RISE - sink * SINK + bob, -placement.s);
      root.updateMatrixWorld(true);
      rig.chassis.rotation.set(-sink * .12 + Math.sin(state.time * .6) * .01, 0, sink * .16 + Math.sin(state.time * .45) * .012);
      if ((arriving && rise > .05) || (destroyed && sink > 0 && sink < 1)) for (let k = 0; k < 3; k++) if (hash(state.time * 37 + k) < 22 * dt) {
        steam(local((hash(state.time + k) - .5) * 9, -root.position.y + placement.baseHeight + .1, (hash(state.time + k + 1) - .5) * 12), state.time * 41 + k, 1.6);
      }
      rig.engine.emissiveIntensity = destroyed ? Math.max(0, 2.6 - phaseAge) : 2.4 + .4 * Math.sin(state.time * 5);
      rig.sinew.emissiveIntensity = destroyed ? Math.max(0, 1.4 - phaseAge * .5) : 1.2 + .5 * Math.sin(state.time * 1.7);
      if (destroyed) {
        const before = phaseAge - dt;
        for (let k = 0; k < 12; k++) { const at = .1 * k; if (before < at && phaseAge >= at) burst(local((hash(k + 3) - .5) * 8, 1.8, (hash(k + 5) - .5) * 10), 10, k * 13 + encounter, 1); }
        for (let k = 0; k < 10; k++) {
          const at = .4 + k * .18, spot = local((hash(k + 21) - .5) * 7, 1.8, (hash(k + 23) - .5) * 9);
          if (before < at && phaseAge >= at) { flash(spot, 2.2 + hash(k), k); ichor(spot, 1.6 + hash(k + 40), k * 17 + encounter); }
        }
        if (before < 1.9 && phaseAge >= 1.9) { const heart = local(0, VEIL.targetHeight, -VEIL.heartS); flash(heart, 6.5, 99); ichor(heart, 3.6, 4242 + encounter); burst(heart, 70, 777 + encounter, 2.2); }
      }
      const ring = THREE.MathUtils.clamp((phaseAge - 1.9) / 1.2, 0, 1);
      shock.visible = destroyed && ring > 0 && ring < 1;
      if (shock.visible) {
        shock.position.set(placement.x ?? boss.x, placement.baseHeight + .1, -placement.s);
        shock.scale.setScalar(2 + Math.sqrt(ring) * 10); (shock.material as THREE.MeshBasicMaterial).opacity = (1 - ring) * (1 - ring);
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
        const living = enemy.hp > 0 && !(destroyed && enemy.bossPart === 'core' && phaseAge > 1.95);
        if (alive.get(enemy.bossPart) && !living) {
          deadAt.set(enemy.bossPart, state.time);
          const at = local(part.group.position.x, 1.9, part.group.position.z);
          burst(at, 30, enemy.id * 7, 1.2); flash(at, 2, enemy.id); ichor(at, 1.5, enemy.id * 5);
        }
        alive.set(enemy.bossPart, living);
        const seen = hpSeen.get(enemy.id); hpSeen.set(enemy.id, enemy.hp);
        if (seen !== undefined && enemy.hp < seen && living) {
          if (state.time - (hitAt.get(enemy.id) ?? -9) > .07) { const at = local(part.group.position.x, 2, part.group.position.z); burst(at, 7, state.tick * 7 + enemy.id, .7); flash(at, .9, state.tick + enemy.id); }
          hitAt.set(enemy.id, state.time);
        }
        const kick = Math.max(0, 1 - (state.time - (hitAt.get(enemy.id) ?? -9)) / .16);
        const died = deadAt.get(enemy.bossPart);
        if (died !== undefined && state.time - died < 7 && hash(state.time * 13 + enemy.id) < 5 * dt) steam(local(part.group.position.x, 1.8, part.group.position.z), state.time * 31 + enemy.id, .9);
        part.live.forEach(object => { object.visible = living; });
        part.wreck.visible = !living;
        // The heart's petals fold open once it can be damaged.
        const wantOpen = enemy.damageable !== false || !living ? 1 : 0;
        part.open += THREE.MathUtils.clamp(wantOpen - part.open, -dt * 1.4, dt * 1.4);
        const eased = THREE.MathUtils.smoothstep(part.open, 0, 1);
        part.petals.forEach(petal => { petal.object.rotation.set(-eased * 1.15, petal.closed.y, 0, 'YXZ'); });
        const fraction = Math.max(0, enemy.hp / enemy.maxHp);
        const pulse = overload && enemy.bossPart === 'core' ? .5 + .5 * Math.abs(Math.sin(state.time * 12)) : .85 + .15 * Math.sin(state.time * 2.2);
        part.heat.emissiveIntensity = living ? (1.2 + (1 - fraction) * 1.8 + (enemy.warning > 0 ? 1.4 : 0)) * pulse + kick * 2.8 : 0;
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
      mist.step(dt, groundShift); sparks.step(dt, groundShift);
      geometry.setDrawRange(0, cursor);
      geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('color').needsUpdate = true;
    },
    get stats() { return { particles: mist.count + sparks.count }; },
    dispose() { rig.dispose(); scene.remove(root, shock, markers); geometry.dispose(); },
  };
}
