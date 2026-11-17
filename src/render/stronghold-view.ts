import { liveVertices } from './instances';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VIEW, type BossPart, type Enemy, type GraphicsQuality, type RunState } from '../shared/contracts';
import { toFlightPlane } from '../shared/lens';
import { retainBossMaterials } from './boss-materials';
import { SIDES, hash, markerWriter, particleLayer } from './bastion-view';
import type { FoamRing, Wake } from './water';
import { HELION_ARK } from '../content/ark';

/**
 * HELION STRONGHOLD (docs/17 §5, docs/43 §8-10), Vesper's boss, render-only: it reads the boss state (id `ark`) and never
 * applies damage or decides anything the simulation uses. A fortress built into the cliff at the head of Cold Vector's
 * arena (src/world/terrain-vesper.ts, the stronghold's massif): it stands there before its fight, awakens on arrival, and
 * stays as a wreck after it. Its model is public/assets/vesper/helion-stronghold.glb (tools/blender/boss_stronghold.py),
 * placed so that, with the camera centred, each weak point lies on the release lens's line of sight through its combat
 * target; target rings and brackets are drawn on the flight plane at the targets themselves.
 *
 * Presentation only: the cannons charge (their housings and muzzles glow), recoil and vent steam when their lanes fire;
 * the blast door's leaves part when the reactor opens; Needles leave from the hatches beside the door. A destroyed cannon
 * throws sparks, fragments and smoke and its broken barrel sags. At the kill the reactor flares, pipes burst, the radar mast
 * falls, explosions go off inside, then the reactor's light dies; the wreck stays in its mountain.
 */
const P = 'stronghold_';
const PARTS = ['left', 'right', 'core'] as const;
/** The fortress's plan about its origin (tools/blender/boss_stronghold.py bounds): half width, front (muzzles) and back. */
export const STRONGHOLD_FOOTPRINT = { halfWidth: 6.45, front: 1.85, back: 7.4 } as const;
/** Recoil: how far a gun slides back into its housing when its lane fires, and how fast it runs out again. */
const RECOIL = { distance: .42, kick: .05, settle: 3.2 } as const;
/** A broken barrel's sag (radians, nose down) and how long it takes to settle. */
const SAG = { angle: .34, time: 1.3 } as const;
/** The awakening on arrival (as THE CITADEL's, src/render/carrier-view.ts AWAKEN): dormant glow, then each part in turn. */
const AWAKEN = { dormant: .25, order: { left: .25, right: .45, core: .7 } as Record<BossPart, number>, ignite: .5 };
/** The hull's painted glows (emblem, slits, pipes): the export's emission strength. */
const HULL_GLOW = 2.2;
/** Steam, sparks and smoke. */
const FX = { spark: 0xffa15a, hot: 0xfff2cf, flash: 0xffd6a0, steam: 0xe8f0f6, smoke: 0x1e2226, debris: 0x2a2f35 } as const;

export async function loadStrongholdModel(url: string): Promise<THREE.Group> {
  return (await new GLTFLoader().loadAsync(url)).scene;
}

interface Gun { live: THREE.Object3D; wreck: THREE.Object3D | null; gun: THREE.Object3D | null; gunRest: THREE.Vector3; gunWreck: THREE.Object3D | null;
  muzzle: THREE.Object3D | null; heat: THREE.MeshStandardMaterial; firedAt: number; diedAt: number; charging: boolean; live0: boolean }
interface Rig {
  model: THREE.Group; guns: Map<'left' | 'right', Gun>;
  core: { live: THREE.Object3D | null; wreck: THREE.Object3D | null; heat: THREE.MeshStandardMaterial | null; aim: THREE.Vector3 };
  doors: { object: THREE.Object3D; closed: THREE.Vector3; side: -1 | 1 }[]; slide: number;
  radar: { object: THREE.Object3D; rest: THREE.Euler; restY: number } | null;
  bays: THREE.Vector3[]; vents: THREE.Vector3[]; lamps: THREE.MeshStandardMaterial[];
  dispose(): void;
}

function modelRig(model: THREE.Group): Rig {
  model.updateMatrixWorld(true);
  const node = (name: string) => model.getObjectByName(P + name) ?? null;
  const materials = retainBossMaterials(model, P, name => name.startsWith(P + 'core') ? 'core'
    : name.endsWith('_left') || name.endsWith('_left_wreck') ? 'left' : name.endsWith('_right') || name.endsWith('_right_wreck') ? 'right' : null);
  const fallback = new THREE.MeshStandardMaterial({ color: 0x140804, emissive: 0xff7a26, emissiveIntensity: 1.2, toneMapped: false });
  const guns = new Map<'left' | 'right', Gun>();
  for (const side of ['left', 'right'] as const) {
    const live = node(`cannon_${side}`);
    if (!live) continue;
    const wreck = node(`cannon_${side}_wreck`), gun = node(`gun_${side}`), gunWreck = node(`gun_${side}_wreck`);
    if (wreck) wreck.visible = false;
    guns.set(side, { live, wreck, gun, gunRest: gun?.position.clone() ?? new THREE.Vector3(), gunWreck, muzzle: node(`muzzle_${side}`),
      heat: materials.heat.get(side) ?? fallback, firedAt: -Infinity, diedAt: Infinity, charging: false, live0: true });
  }
  const core = node('core'), coreWreck = node('core_wreck');
  if (coreWreck) coreWreck.visible = false;
  const local = (object: THREE.Object3D | null) => object ? model.worldToLocal(object.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3();
  const tag = node('approved_v1');
  const doors = (['a', 'b'] as const).map(leaf => node(`door_${leaf}`)).filter(Boolean)
    .map((object, i) => ({ object: object!, closed: object!.position.clone(), side: (i === 0 ? -1 : 1) as -1 | 1 }));
  const radarNode = node('radar');
  const markers = (prefix: string) => { const out: THREE.Vector3[] = []; for (let k = 0; ; k++) { const m = node(`${prefix}${k}`); if (!m) break; out.push(local(m)); } return out; };
  return {
    model, guns, doors, slide: Number(tag?.userData.door_slide) || .76,
    core: { live: core, wreck: coreWreck, heat: materials.heat.get('core') ?? null, aim: local(node('core_aim')) },
    radar: radarNode ? { object: radarNode, rest: radarNode.rotation.clone(), restY: radarNode.position.y } : null,
    bays: ['left', 'right'].map(side => local(node(`bay_${side}`))), vents: markers('vent_'), lamps: materials.hull,
    dispose() { materials.dispose(); fallback.dispose(); },
  };
}

export function createStrongholdView(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'HELION STRONGHOLD'; root.visible = false; scene.add(root);
  let rig: Rig | null = null;
  // Target rings on the flight plane at the targets (the lens puts each weak point under its ring with the camera centred).
  const rings = new Map<BossPart, { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }>();
  for (const part of PARTS) {
    const core = part === 'core', material = new THREE.MeshBasicMaterial({ color: 0xffb77c, depthTest: false, depthWrite: false });
    const ring = new THREE.RingGeometry(core ? .8 : .55, core ? 1.0 : .72, core ? 32 : 24); ring.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(ring, material); mesh.name = `stronghold-target-${part}`; mesh.renderOrder = 4; mesh.visible = false;
    scene.add(mesh); rings.set(part, { mesh, material });
  }
  const mist = particleLayer(scene, 360, false), sparks = particleLayer(scene, 360, true);
  const vertices = new Float32Array(256 * 3), colors = new Float32Array(256 * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const markers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
  markers.frustumCulled = false; markers.renderOrder = 9; markers.visible = false; scene.add(markers);
  const marks = markerWriter(vertices, colors), line = marks.line;
  const world = new THREE.Vector3(), scratch = new THREE.Vector3();
  const foamRings: FoamRing[] = [], wakes: Wake[] = [];
  let lastDistance = 0, lastTime = -1, encounter = -1, low = false, launchesSeen = new Set<number>(), coreShot = 0;
  const alive = new Map<BossPart, boolean>(), hpSeen = new Map<number, number>(), hitAt = new Map<number, number>();

  /** A point of the model (its own frame) in world space, in the scratch `world` (or `out`). */
  const at = (x: number, y: number, z: number, out = world) => rig ? rig.model.localToWorld(out.set(x, y, z)) : root.localToWorld(out.set(x, y, z));
  const atV = (v: THREE.Vector3, out = world) => at(v.x, v.y, v.z, out);
  /** Low quality: half the emitters' rates (the layers' sizes stay bounded either way). */
  const chance = (rate: number, dt: number) => rate * dt * (low ? .5 : 1);
  const burst = (p: THREE.Vector3, count: number, seed: number, power = 1) => {
    for (let i = 0; i < (low ? Math.ceil(count / 2) : count); i++) {
      const a = hash(seed + i) * Math.PI * 2, up = hash(seed + i * 1.7 + 3), speed = (1.5 + hash(seed + i * 2.3) * 3.5) * power;
      sparks.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * speed, vy: 1 + up * 3 * power, vz: Math.sin(a) * speed, life: .45 + up * .6,
        size: .16 + up * .18, grow: -.08, alpha: 1, color: up > .7 ? FX.hot : FX.spark, drag: 2.5, lift: -9 });
    }
  };
  const flash = (p: THREE.Vector3, size: number, seed: number, color: number = FX.flash) =>
    sparks.emit({ x: p.x, y: p.y + .3, z: p.z, vx: 0, vy: .4, vz: 0, life: .32 + hash(seed) * .15, size, grow: size * .9, alpha: .95, color, drag: 0, lift: 0 });
  const steam = (p: THREE.Vector3, seed: number, scale = 1, vy = .6) =>
    mist.emit({ x: p.x + (hash(seed) - .5) * .4, y: p.y + .1, z: p.z + (hash(seed + 9) - .5) * .4, vx: (hash(seed + 2) - .5) * .4, vy: vy + hash(seed + 4) * .5,
      vz: (hash(seed + 6) - .5) * .4, life: 2.2, size: .5 * scale, grow: 1.6 * scale, alpha: .42, color: FX.steam, drag: 1, lift: .2 });
  const smoke = (p: THREE.Vector3, seed: number, scale = 1) =>
    mist.emit({ x: p.x + (hash(seed) - .5) * .5, y: p.y + .1, z: p.z + (hash(seed + 9) - .5) * .5, vx: (hash(seed + 2) - .5) * .5, vy: .5 + hash(seed + 4) * .5,
      vz: (hash(seed + 6) - .5) * .5, life: 2.8, size: .7 * scale, grow: 1.7 * scale, alpha: .55, color: FX.smoke, drag: 1.2, lift: .25 });
  const fireball = (p: THREE.Vector3, size: number, seed: number) => {
    for (let k = 0; k < 3; k++) sparks.emit({ x: p.x + (hash(seed + k) - .5) * size * .6, y: p.y + .2 + k * .15, z: p.z + (hash(seed + k + 4) - .5) * size * .6,
      vx: (hash(seed + k + 8) - .5) * 1.2, vy: .8 + hash(seed + k) * 1.2, vz: (hash(seed + k + 12) - .5) * 1.2, life: .55 + hash(seed + k + 2) * .35,
      size: size * (.55 + k * .2), grow: size * .9, alpha: .9, color: k === 0 ? 0xfff0c0 : k === 1 ? 0xffa04a : 0xff6a24, drag: 1.5, lift: .6 });
    smoke(p, seed * 3 + 1, size * .9);
  };
  /** Dark armour fragments thrown off a broken part, falling (presentation only). */
  const debris = (p: THREE.Vector3, count: number, seed: number) => {
    for (let i = 0; i < (low ? Math.ceil(count / 2) : count); i++) {
      const a = hash(seed + i * 3.1) * Math.PI * 2, speed = 1.2 + hash(seed + i) * 2.4;
      mist.emit({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * speed, vy: 1.5 + hash(seed + i * 1.3) * 2.5, vz: Math.sin(a) * speed * .6 + 1, life: .9 + hash(seed + i * .7) * .5,
        size: .12 + hash(seed + i * 2.9) * .14, grow: 0, alpha: 1, color: FX.debris, drag: .4, lift: -12 });
    }
  };
  const gunPart = (side: 'left' | 'right') => rig?.guns.get(side) ?? null;
  const isLane = (state: RunState, x: number, live: boolean) => state.hazards.some(h => h.source === undefined && Math.abs(h.x - x) < h.width / 2 + .3 && (live ? h.warning <= 0 && h.active > 0 : h.warning > 0));

  return {
    /** Swap in the production model once helion-stronghold.glb has loaded (nothing is drawn of the fortress before). */
    setModel(model: THREE.Group) {
      if (rig) { root.remove(rig.model); rig.dispose(); }
      rig = modelRig(model); root.add(model);
    },
    setQuality(quality: GraphicsQuality) { low = quality !== 'high'; },
    /** The fortress's plan in world (x, s) for the scenery exclusion, or null. */
    footprint(state: RunState, placement: { s: number; x?: number } | null) {
      if (!placement || !root.visible) return null;
      const x = placement.x ?? 0, f = STRONGHOLD_FOOTPRINT;
      return { minX: x - f.halfWidth, maxX: x + f.halfWidth, minS: state.distance + placement.s - f.front, maxS: state.distance + placement.s + f.back };
    },
    /** Foam on the sea for the water's foam layer: none of its own (the cliff's shoreline carries the terrain's foam). */
    get foam(): { rings: readonly FoamRing[]; wakes: readonly Wake[] } { return { rings: foamRings, wakes }; },
    /**
     * Where a lane fired from a live cannon starts on the flight plane: at its muzzle as the lens sees it (render only; the lane
     * itself is the simulation's). Undefined for anything else.
     */
    beamTop(state: RunState, source: Enemy): number | undefined {
      if (!rig || !root.visible || state.boss?.id !== 'ark' || (source.bossPart !== 'left' && source.bossPart !== 'right') || source.hp <= 0) return undefined;
      const muzzle = rig.guns.get(source.bossPart)?.muzzle;
      if (!muzzle) return undefined;
      muzzle.getWorldPosition(scratch);
      return toFlightPlane(state.cameraX, scratch.x, scratch.y, -scratch.z).s;
    },
    /**
     * `standing`: drawn without an encounter where it stands in its arena: intact before its fight, a wreck after it.
     * `placement`: the fixed seat (src/render/scene.ts: the arena's start plus STRONGHOLD_AT, its foot at the sea).
     */
    update(state: RunState, placement: { baseHeight: number; s: number; x?: number } | null, standing: 'intact' | 'wrecked' | null = null) {
      const boss = state.boss?.id === 'ark' ? state.boss : null;
      const shown = !!rig && !!placement && (!!boss || !!standing);
      root.visible = shown; markers.visible = shown && !!boss;
      foamRings.length = 0; wakes.length = 0;
      const groundShift = lastTime < 0 || state.time < lastTime ? 0 : Math.max(0, state.distance - lastDistance); lastDistance = state.distance;
      const dt = lastTime < 0 ? 0 : Math.min(.1, Math.max(0, state.time - lastTime)); lastTime = state.time;
      mist.shift(groundShift); sparks.shift(groundShift);
      for (const ring of rings.values()) ring.mesh.visible = false;
      if (!shown || !rig || !placement) {
        if (!boss) { mist.clear(); sparks.clear(); alive.clear(); hpSeen.clear(); encounter = -1; }
        mist.step(dt, 0); sparks.step(dt, 0);
        return;
      }
      root.position.set(placement.x ?? 0, placement.baseHeight, -placement.s); root.updateMatrixWorld(true);
      if (!boss) {
        // Standing: dormant before the fight, a dead wreck after it.
        const intact = standing === 'intact';
        for (const gun of rig.guns.values()) {
          gun.live.visible = intact; if (gun.wreck) gun.wreck.visible = !intact;
          if (gun.gun) gun.gun.position.copy(gun.gunRest);
          if (gun.gunWreck) gun.gunWreck.rotation.x = SAG.angle * 1.4;
          gun.heat.emissiveIntensity = intact ? AWAKEN.dormant : 0;
        }
        if (rig.core.live) rig.core.live.visible = intact; if (rig.core.wreck) rig.core.wreck.visible = !intact;
        if (rig.core.heat) rig.core.heat.emissiveIntensity = intact ? AWAKEN.dormant : 0;
        for (const door of rig.doors) door.object.position.copy(door.closed).setX(door.closed.x + (intact ? 0 : door.side * rig.slide));
        if (rig.radar) radarPose(rig.radar, intact ? 0 : 1, 0);
        for (const material of rig.lamps) material.emissiveIntensity = intact ? HULL_GLOW * AWAKEN.dormant : .12;
        mist.step(dt, 0); sparks.step(dt, 0);
        return;
      }
      if (encounter !== boss.startedAt) {
        encounter = boss.startedAt; mist.clear(); sparks.clear(); alive.clear(); hpSeen.clear(); launchesSeen = new Set(); coreShot = 0;
        for (const gun of rig.guns.values()) { gun.firedAt = -Infinity; gun.diedAt = Infinity; gun.charging = false; gun.live0 = true; }
      }
      const age = state.time - boss.startedAt, phaseAge = state.time - boss.phaseStartedAt;
      const destroyed = boss.phase === 'destroyed', overload = boss.phase === 'overload', arriving = boss.phase === 'arrival';
      const span = HELION_ARK.arrivalDuration;
      const before = phaseAge - dt;
      // The awakening: steam shaken off the vents, then the cannons and the reactor light in turn (render only).
      const wake = arriving ? THREE.MathUtils.smoothstep(age, .2, span) : 1;
      if (arriving && age - dt < .1 && age >= .1) for (const [k, vent] of rig.vents.entries()) for (let j = 0; j < 4; j++) steam(atV(vent), k * 7 + j, 1.4, 1.2);
      // The radar turns while the fortress lives; it falls at the kill.
      if (rig.radar) radarPose(rig.radar, destroyed ? THREE.MathUtils.smoothstep(phaseAge, .9, 1.7) : 0, destroyed ? 0 : state.time * .55 * wake);
      // Cooling vents: slow steam over the fight, more after each shot, a rush through the overload, burst pipes at the kill.
      const ventRate = destroyed ? (phaseAge < 2.4 ? 14 : 2) : overload ? 4 : 1.2 * wake;
      for (const [k, vent] of rig.vents.entries()) if (hash(state.time * 31 + k) < chance(ventRate, dt)) {
        const p = atV(vent);
        if (destroyed && phaseAge > 1.9 && k < 2) smoke(p, state.time * 17 + k, 1.3); else steam(p, state.time * 17 + k, destroyed ? 1.5 : 1, destroyed ? 1.6 : .6);
      }
      // Bay hatches: a flash, a puff and a trail of sparks toward each Needle as it leaves (the launch is the simulation's).
      for (const enemy of state.enemies) if (enemy.formation?.template === 'ark-launch' && !launchesSeen.has(enemy.id)) {
        launchesSeen.add(enemy.id);
        const bay = rig.bays[enemy.x < boss.x ? 0 : 1];
        if (!bay) continue;
        const from = atV(bay, scratch).clone(), to = world.set(enemy.x, VIEW.flightHeight, -enemy.s);
        flash(from, 1.3, enemy.id); burst(from, 8, enemy.id * 11, .7); steam(from, enemy.id * 13, .9);
        for (let i = 1; i <= 6; i++) { const p = world.copy(from).lerp(to, i / 7); sparks.emit({ x: p.x, y: p.y, z: p.z, vx: 0, vy: .2, vz: 0, life: .25 + i * .03, size: .26, grow: -.1, alpha: .8, color: FX.flash, drag: 0, lift: 0 }); }
      }
      if (launchesSeen.size > 64) launchesSeen.clear();
      // Bridge bursts and the reactor's shots leave from the bunker's door: a flash there as each volley appears.
      const coreTarget = state.enemies.find(enemy => enemy.bossPart === 'core');
      if (coreTarget) for (const shot of state.projectiles) if (!shot.friendly && shot.firedBy === coreTarget.id && shot.id > coreShot) {
        coreShot = shot.id; const door = atV(rig.core.aim); flash(door, 1.4, shot.id); burst(door, 5, shot.id * 3, .6);
      }

      marks.begin();
      for (const enemy of state.enemies) {
        const part = enemy.bossPart, target = part && rings.get(part);
        if (!part || !target || part === 'prow') continue;
        const living = enemy.hp > 0 && !(destroyed && part === 'core' && phaseAge > 2.0);
        const seen = hpSeen.get(enemy.id); hpSeen.set(enemy.id, enemy.hp);
        const gun = part === 'core' ? null : gunPart(part);
        const spot = part === 'core' ? atV(rig.core.aim) : gun?.gun ? gun.gun.getWorldPosition(world) : at(0, 0, 0);
        if (seen !== undefined && enemy.hp < seen && living) {
          if (state.time - (hitAt.get(enemy.id) ?? -9) > .07) { burst(spot, 6, state.tick * 7 + enemy.id, .6); flash(spot, .8, state.tick + enemy.id); }
          hitAt.set(enemy.id, state.time);
        }
        const kick = Math.max(0, 1 - (state.time - (hitAt.get(enemy.id) ?? -9)) / .16);
        const fraction = Math.max(0, enemy.hp / enemy.maxHp);
        if (gun) {
          // A cannon breaks: sparks, a flash and fire, its armour flying off; then smoke and steam for a while, the barrel sagging.
          if (alive.get(part) && !living) {
            gun.diedAt = state.time;
            const p = spot.clone(); burst(p, 30, enemy.id * 7, 1.2); flash(p, 2, enemy.id); fireball(p, 1.3, enemy.id * 5); debris(p, 12, enemy.id * 13);
          }
          gun.live.visible = living; if (gun.wreck) gun.wreck.visible = !living;
          const died = state.time - gun.diedAt;
          if (died >= 0 && died < 9 && hash(state.time * 13 + enemy.id) < chance(6, dt)) {
            const p = gun.wreck ? gun.wreck.getWorldPosition(world) : spot;
            if (hash(state.time * 7 + enemy.id) < .55) smoke(p, state.time * 31 + enemy.id, 1); else steam(p, state.time * 31 + enemy.id, .9);
          }
          if (gun.gunWreck) gun.gunWreck.rotation.x = !living ? SAG.angle * (THREE.MathUtils.smoothstep(died, 0, SAG.time) + .12 * Math.sin(Math.min(died, SAG.time) / SAG.time * Math.PI) * Math.exp(-died))
            + (destroyed ? SAG.angle * .4 * THREE.MathUtils.smoothstep(phaseAge, 1, 2) : 0) : 0;
          // Charge and fire: the lane on its column is marked (charging), then live (it fires).
          const charging = living && isLane(state, enemy.x, false), firing = living && isLane(state, enemy.x, true);
          if (firing && !gun.live0) {
            gun.firedAt = state.time;
            const muzzle = gun.muzzle ? gun.muzzle.getWorldPosition(scratch) : spot;
            flash(muzzle, 2.2, enemy.id + state.tick); burst(muzzle, 10, state.tick * 5 + enemy.id, .9);
            for (let j = 0; j < 3; j++) smoke(muzzle, state.tick * 3 + j, .8);
            const vent = rig.vents[part === 'left' ? 2 : 3];
            if (vent) for (let j = 0; j < 3; j++) steam(atV(vent), state.tick * 11 + j, 1.2, 1.3);
          }
          gun.live0 = firing;
          if (charging && gun.muzzle && hash(state.time * 53 + enemy.id) < chance(30, dt)) {
            const m = gun.muzzle.getWorldPosition(scratch), grow = 1 - Math.min(1, enemy.warning / 1.4);
            sparks.emit({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: .12, size: .25 + grow * .55, grow: .1, alpha: .9, color: grow > .7 ? FX.hot : FX.spark, drag: 0, lift: 0 });
          }
          gun.charging = charging;
          const since = state.time - gun.firedAt, recoil = since < RECOIL.kick ? since / RECOIL.kick : Math.exp(-(since - RECOIL.kick) * RECOIL.settle);
          if (gun.gun) gun.gun.position.copy(gun.gunRest).setZ(gun.gunRest.z - RECOIL.distance * (Number.isFinite(since) ? recoil : 0));
          // Heat: the housing's lining brightens as its armour goes, flares through a charge and a hit; dormant before the awakening.
          const lit = arriving ? THREE.MathUtils.smoothstep(age, AWAKEN.order[part] * span, (AWAKEN.order[part] + AWAKEN.ignite / span) * span) : 1;
          const hot = living ? (1.6 + (1 - fraction) * 1.6 + (charging ? 2.2 * (1 - Math.min(1, enemy.warning / 1.6)) : 0) + kick * 2.8) * HULL_GLOW / 2 : 0;
          gun.heat.emissiveIntensity = AWAKEN.dormant + (hot - AWAKEN.dormant) * lit;
          // A dead cannon's column still fires the overload's side lanes: the broken housing's feed flares.
          if (!living && isLane(state, enemy.x, false) && hash(state.time * 41 + enemy.id) < chance(20, dt) && gun.wreck) {
            const p = gun.wreck.getWorldPosition(scratch);
            sparks.emit({ x: p.x, y: p.y + .2, z: p.z + .5, vx: 0, vy: .3, vz: 0, life: .15, size: .6, grow: .3, alpha: .8, color: FX.spark, drag: 0, lift: 0 });
          }
        } else {
          // The reactor: behind the blast door until it opens; it flickers in its overload, flares and dies at the kill.
          if (rig.core.live) rig.core.live.visible = living; if (rig.core.wreck) rig.core.wreck.visible = !living;
          const open = boss.phase === 'core' ? THREE.MathUtils.smoothstep(phaseAge, 0, .9) : overload || destroyed || !living ? 1 : 0;
          if (boss.phase === 'core' && before < 0 && phaseAge >= 0) { const d = atV(rig.core.aim); for (const side of SIDES) steam(at(d.x + side * .8, d.y, d.z), enemy.id + side * 11, .9, 1); }
          for (const door of rig.doors) door.object.position.copy(door.closed).setX(door.closed.x + door.side * rig.slide * open);
          if (rig.core.heat) {
            const pulse = overload ? .55 + .45 * Math.abs(Math.sin(state.time * 12)) : .85 + .15 * Math.sin(state.time * 2.4);
            const dying = destroyed ? (phaseAge < 1.85 ? 1.8 + 1.4 * Math.abs(Math.sin(phaseAge * 23)) : Math.max(0, 3.2 - (phaseAge - 1.85) * 1.6)) : 0;
            rig.core.heat.emissiveIntensity = destroyed ? dying : living ? ((1.4 + (1 - fraction) * 1.8 + (enemy.warning > 0 ? 1.4 : 0)) * pulse + kick * 2.8) * wake : 0;
          }
        }
        alive.set(part, living);
        if (!enemy.damageable || enemy.hp <= 0) continue;
        target.mesh.visible = true;
        target.mesh.position.set(enemy.x, VIEW.flightHeight + .02, -enemy.s);
        target.material.color.setHex(enemy.warning > 0 ? 0xffecd0 : 0xffb77c).multiplyScalar(.45 + .55 * fraction);
        const r = enemy.radius + .15, color = kick > 0 ? 0xffffff : enemy.warning > 0 ? 0xffd59a : 0xdbbe8b;
        for (const x of SIDES) for (const s of SIDES) {
          line(enemy.x + x * r, enemy.s + s * r, enemy.x + x * (r - .25), enemy.s + s * r, color);
          line(enemy.x + x * r, enemy.s + s * r, enemy.x + x * r, enemy.s + s * (r - .25), color);
        }
        if (enemy.warning > 0 && boss.attack === 'burst') line(enemy.x, enemy.s, enemy.aimX, 0, 0xd1a275);
      }
      // The kill: the reactor destabilises (above), pipes burst (the vents), fire breaks out across the bunker, the radar mast
      // falls, explosions go off inside (with the simulation's blast at 1.85 s), then the light dies and smoke pours out.
      if (destroyed) {
        const aim = rig.core.aim;
        for (let k = 0; k < 10; k++) {
          const t = .15 + k * .17;
          if (before < t && phaseAge >= t) {
            const p = at((hash(k + 31) - .5) * 8, 2.4 + hash(k + 7) * 1.6, -1 - hash(k + 11) * 3.5);
            flash(p, 1.4 + hash(k) * 1.2, k); fireball(p, 1 + hash(k + 40) * .8, k * 17 + encounter); burst(p, 8, k * 13 + encounter, .9);
          }
        }
        if (before < 1.85 && phaseAge >= 1.85) {
          const p = atV(aim, scratch).clone(); flash(p, 5, 99); fireball(p, 3, 4242 + encounter); burst(p, 50, 777 + encounter, 2); debris(p, 16, 4343);
          for (const side of SIDES) fireball(at(aim.x + side * 1.6, aim.y + 1.5, aim.z - 1.2), 1.8, 600 + side + encounter);
        }
        if (phaseAge > 2 && phaseAge < 8 && hash(state.time * 19) < chance(7, dt)) smoke(at(aim.x + (hash(state.time) - .5) * 1.2, aim.y + .4, aim.z + .2), state.time * 23, 1.4);
      }
      for (const material of rig.lamps) material.emissiveIntensity = destroyed
        ? (phaseAge < 1.85 ? HULL_GLOW * (1.2 + .5 * Math.abs(Math.sin(phaseAge * 17))) : Math.max(.12, HULL_GLOW * (1.2 - (phaseAge - 1.85) * .5)))
        : HULL_GLOW * (AWAKEN.dormant + (1 - AWAKEN.dormant) * wake) * (overload ? .85 + .3 * Math.abs(Math.sin(state.time * 6)) : .95 + .05 * Math.sin(state.time * 2.6));
      mist.step(dt, 0); sparks.step(dt, 0);
      liveVertices(markers, geometry, marks.count); markers.visible &&= root.visible;
    },
    get stats() { return { visible: root.visible, model: rig ? 'glb' : 'none', approved: !!rig, particles: mist.count + sparks.count }; },
    dispose() {
      rig?.dispose(); scene.remove(root, markers); geometry.dispose(); (markers.material as THREE.Material).dispose();
      rings.forEach(({ mesh, material }) => { scene.remove(mesh); mesh.geometry.dispose(); material.dispose(); });
    },
  };
}

/** The radar's pose: turning about its pedestal (`turn`), or fallen (`fall` 0..1: toppled forward off its pedestal). */
function radarPose(radar: NonNullable<Rig['radar']>, fall: number, turn: number) {
  radar.object.rotation.set(radar.rest.x + fall * 1.1, radar.rest.y + turn, radar.rest.z + fall * .35);
  radar.object.position.y = radar.restY - fall * .45;
}
export type StrongholdView = ReturnType<typeof createStrongholdView>;
