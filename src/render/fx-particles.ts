import * as THREE from 'three';
import { VIEW, type GraphicsQuality, type RunState } from '../shared/contracts';

/**
 * Presentation-only effects (docs/04 §5): engine plumes, muzzle flashes, impact sparks, explosions (fireball,
 * short smoke, a few debris chips) and pickup glints. Everything is driven by snapshot events the simulation
 * already emits (new projectiles, `effects`) and by simulation time; nothing here feeds back into combat.
 * Cosmetic variation is a deterministic hash, never `Math.random()` or simulation RNG.
 *
 * Two instanced draws in total: an additive layer (glows; HDR colours bloom on High) and an alpha layer (smoke
 * and debris). Friendly flashes are cyan-white, hostile ones warm coral, matching their shots. Low keeps the
 * readable core of each effect and drops most secondary particles (docs/05 §9: particles are reduced first).
 */
const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation);
const ADDITIVE_CAPACITY = 240, ALPHA_CAPACITY = 72;
/** Particle shapes in the shared shader. */
const ROUND = 0, PLUME = 1, STAR = 2, CHIP = 3;

const VERTEX = /* glsl */`
attribute vec2 aParams; varying vec2 vParams; varying vec2 vUv; varying vec3 vColor;
void main() {
  vUv = uv; vParams = aParams; vColor = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`;
const FRAGMENT = /* glsl */`
uniform float additive; varying vec2 vParams; varying vec2 vUv; varying vec3 vColor;
void main() {
  vec2 p = vUv - 0.5; float shape = vParams.y, a;
  if ( shape < 0.5 ) a = smoothstep( 0.5, 0.0, length( p ) );
  else if ( shape < 1.5 ) a = pow( clamp( vUv.y, 0.0, 1.0 ), 1.6 ) * smoothstep( 0.5, 0.05, abs( p.x ) );
  else if ( shape < 2.5 ) a = max( exp( -abs( p.x ) * 40.0 ) * smoothstep( 0.5, 0.0, abs( p.y ) ), exp( -abs( p.y ) * 40.0 ) * smoothstep( 0.5, 0.0, abs( p.x ) ) ) + smoothstep( 0.18, 0.0, length( p ) );
  else a = step( abs( p.x ) + abs( p.y ) * 0.8, 0.42 );
  a *= vParams.x;
  if ( a < 0.003 ) discard;
  gl_FragColor = additive > 0.5 ? vec4( vColor * a, a ) : vec4( vColor, a );
}`;

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; grow: number; stretch: number;
  r: number; g: number; b: number; alpha: number; shape: number; flat: boolean; drag: number; fall: number;
  /** Fraction of the scroll speed the particle drifts with (1 = rests on the ground, 0 = rides the flight plane). */
  drift: number;
}
/** An engine plume in world space: nozzle at (x, z), extending `length` along z (positive = toward the player). */
export interface Plume { x: number; z: number; length: number; width: number; hex: number; energy: number }
/** Planet surface hooks (Vesper): sea height under a world point (null over land) and steam vents (world space). */
export interface FxSurface { splash(x: number, z: number): number | null; vents: readonly { x: number; y: number; z: number }[] }
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function layer(scene: THREE.Scene, capacity: number, additive: boolean) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aParams', params);
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { additive: { value: additive ? 1 : 0 } },
    // Glows draw over everything like the other combat markers; smoke and ground dust respect terrain depth.
    transparent: true, depthWrite: false, depthTest: !additive, toneMapped: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = additive ? 6 : 5; mesh.name = additive ? 'fx glow' : 'fx smoke';
  scene.add(mesh);
  const pool: Particle[] = [];
  for (let i = 0; i < capacity; i++) pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, stretch: 1, r: 1, g: 1, b: 1, alpha: 1, shape: 0, flat: false, drag: 0, fall: 0, drift: 0 });
  let live = 0;
  return { mesh, params, pool, get live() { return live; }, set live(n: number) { live = n; }, capacity, geometry, material };
}

export function createFx(scene: THREE.Scene) {
  const glow = layer(scene, ADDITIVE_CAPACITY, true), smoke = layer(scene, ALPHA_CAPACITY, false);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  let quality: GraphicsQuality = 'high', lastTime = -1, lastTick = -1, lastEffect = -1, lastShot = -1, seed = 0;

  const emit = (target: typeof glow, p: Partial<Particle> & { x: number; y: number; z: number; life: number; size: number }) => {
    if (target.live >= target.capacity) return;
    const q = target.pool[target.live++];
    q.x = p.x; q.y = p.y; q.z = p.z; q.vx = p.vx ?? 0; q.vy = p.vy ?? 0; q.vz = p.vz ?? 0; q.age = 0; q.life = p.life;
    q.size = p.size; q.grow = p.grow ?? 0; q.stretch = p.stretch ?? 1; q.alpha = p.alpha ?? 1; q.shape = p.shape ?? ROUND;
    q.flat = p.flat ?? false; q.drag = p.drag ?? 0; q.fall = p.fall ?? 0; q.r = p.r ?? 1; q.g = p.g ?? 1; q.b = p.b ?? 1; q.drift = p.drift ?? 0;
  };
  const tint = (hex: number, energy: number) => { color.setHex(hex).multiplyScalar(energy); return { r: color.r, g: color.g, b: color.b }; };
  const full = () => quality === 'high';

  /** Short additive fan of streaks, mostly in the flight plane. */
  const sparks = (x: number, z: number, count: number, hex: number, speed: number, n: number) => {
    for (let i = 0; i < count; i++) {
      const a = hash(n + i * 7.3) * Math.PI * 2, v = speed * (0.55 + hash(n + i * 3.1) * 0.9);
      emit(glow, { x, y: VIEW.flightHeight + .05, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, life: .16 + hash(n + i) * .16, size: .07, stretch: 3.2,
        shape: ROUND, flat: true, drag: 5, alpha: 1, ...tint(hex, 2.6) });
    }
  };
  const flash = (x: number, z: number, size: number, life: number, hex: number, energy: number) =>
    emit(glow, { x, y: VIEW.flightHeight + .08, z, life, size, grow: size * .6, alpha: 1, shape: ROUND, ...tint(hex, energy) });

  /** Snow-white spray where falling debris meets open water: a flat ring of foam and a few droplets. */
  function spray(x: number, sea: number, z: number, n: number) {
    emit(smoke, { x, y: sea + .03, z, life: .7, size: .5, grow: 1.6, alpha: .55, shape: ROUND, flat: true, drift: 1, ...tint(0xf4f9fc, 1) });
    for (let k = 0; k < (full() ? 7 : 3); k++) {
      const a = hash(n + k * 2.7) * Math.PI * 2, v = .6 + hash(n + k * 5.1) * 1.1;
      emit(smoke, { x: x + Math.cos(a) * .15, y: sea + .05, z: z + Math.sin(a) * .15, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2.2 + hash(n + k) * 1.6,
        fall: 7.5, drag: .8, life: .5 + hash(n + k * 3.3) * .25, size: .1 + hash(n + k * 7) * .07, alpha: .9, shape: ROUND, drift: 1, ...tint(0xeef6fb, 1) });
    }
  }
  let surface: FxSurface | null = null;
  function explosion(x: number, z: number, n: number) {
    const y = VIEW.flightHeight + .06;
    const sea = surface?.splash(x, z) ?? null;
    if (sea !== null) spray(x, sea, z, n);
    flash(x, z, 1.5, .11, 0xfff1d0, 2.2);
    const fire = full() ? 4 : 2;
    for (let k = 0; k < fire; k++) {
      const a = hash(n + k * 5.7) * Math.PI * 2, d = .12 + hash(n + k) * .22;
      emit(glow, { x: x + Math.cos(a) * d, y: y + k * .02, z: z + Math.sin(a) * d, vx: Math.cos(a) * .7, vz: Math.sin(a) * .7, life: .32 + hash(n + k * 2.1) * .22,
        size: .42 + k * .1, grow: .9, drag: 3, alpha: .95, shape: ROUND, ...tint(k === 0 ? 0xffe2a8 : k === 1 ? 0xffa04a : 0xff6a28, 2.4 - k * .35) });
    }
    sparks(x, z, full() ? 9 : 5, 0xffc078, 6.5, n * 3.3);
    if (!full()) return;
    for (let k = 0; k < 3; k++) {
      const a = hash(n + k * 9.1) * Math.PI * 2;
      emit(smoke, { x: x + Math.cos(a) * .15, y: y - .1, z: z + Math.sin(a) * .15, vx: Math.cos(a) * .35, vy: .25, vz: Math.sin(a) * .35,
        life: .8 + hash(n + k) * .4, size: .5, grow: 1.1, drag: 1.5, alpha: .42, shape: ROUND, drift: .5, ...tint(k === 1 ? 0x46382f : 0x2c2622, 1) });
    }
    for (let k = 0; k < 5; k++) {
      const a = hash(n + k * 4.9 + 1) * Math.PI * 2, v = 2.2 + hash(n + k * 1.9) * 2.6;
      emit(smoke, { x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: -.4, life: .45 + hash(n + k) * .25, size: .11 + hash(n + k * 3) * .07,
        drag: 1.2, fall: 6, alpha: .95, shape: CHIP, drift: .5, ...tint(0x1b1714, 1) });
    }
  }

  /** New snapshot events → particle spawns. Rewinds (a new run, retry) reset the cursors. */
  function spawn(state: RunState) {
    if (state.tick < lastTick || seed !== state.config.seed) { lastEffect = -1; lastShot = -1; glow.live = 0; smoke.live = 0; seed = state.config.seed; }
    lastTick = state.tick;
    let maxEffect = lastEffect;
    for (const effect of state.effects) {
      if (effect.id <= lastEffect) continue;
      maxEffect = Math.max(maxEffect, effect.id);
      const z = -effect.s;
      if (effect.kind === 'explosion') explosion(effect.x, z, effect.id);
      else if (effect.kind === 'hit') { flash(effect.x, z, .38, .07, 0xffd2a0, 1.8); sparks(effect.x, z, full() ? 5 : 3, 0xffb070, 4.2, effect.id); }
      else if (effect.kind === 'shield') sparks(effect.x, z, full() ? 10 : 5, 0x9ffff2, 5, effect.id);
      else if (effect.kind === 'pickup') for (let i = 0; i < (full() ? 4 : 2); i++) emit(glow, { x: effect.x + (hash(effect.id + i) - .5) * .5, y: VIEW.flightHeight + .1,
        z: z + (hash(effect.id + i * 3) - .5) * .5, life: .25, size: .32, grow: -.2, shape: STAR, alpha: 1, ...tint(0xfff4d8, 1.6) });
      else if (effect.kind === 'special') flash(effect.x, z, 2.2, .16, 0xc8fff8, 1.6);
    }
    lastEffect = maxEffect;
    let maxShot = lastShot;
    for (const shot of state.projectiles) {
      if (shot.id <= lastShot) continue;
      maxShot = Math.max(maxShot, shot.id);
      if (Math.abs(shot.x - state.cameraX) > VIEW.width / 2 + 1) continue;
      // Muzzle flash at the logical origin; colour follows the shot's team.
      if (shot.friendly) flash(shot.previousX, -shot.previousS, .3, .06, 0xd8fff9, 1.5);
      else flash(shot.previousX, -shot.previousS, .42, .09, 0xff9a78, 1.25);
    }
    lastShot = maxShot;
  }

  function step(target: typeof glow, dt: number) {
    let write = 0;
    for (let i = 0; i < target.live; i++) {
      const p = target.pool[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp - p.fall * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (write !== i) { const keep = target.pool[write]; target.pool[write] = p; target.pool[i] = keep; }
      write++;
    }
    target.live = write;
  }
  function write(target: typeof glow, extra = 0) {
    const params = target.params.array as Float32Array;
    for (let i = 0; i < target.live; i++) {
      const p = target.pool[i], t = p.age / p.life, size = Math.max(.01, p.size + p.grow * t);
      transform.position.set(p.x, p.y, p.z);
      if (p.flat) transform.rotation.set(-Math.PI / 2, 0, Math.atan2(-p.vx, -p.vz));
      else transform.rotation.set(-ELEVATION, 0, 0);
      transform.scale.set(size, size * p.stretch, 1); transform.updateMatrix();
      target.mesh.setMatrixAt(i, transform.matrix); target.mesh.setColorAt(i, color.setRGB(p.r, p.g, p.b));
      params[i * 2] = p.alpha * (1 - t * t); params[i * 2 + 1] = p.shape;
    }
    target.mesh.count = target.live + extra;
  }
  /** Engine plumes and pickup glints are per-frame overlays appended after the live particles. */
  function overlay(state: RunState, plumes: readonly Plume[]) {
    let n = glow.live;
    const params = glow.params.array as Float32Array, add = (matrix: THREE.Matrix4, r: number, g: number, b: number, alpha: number, shape: number) => {
      if (n >= glow.capacity) return;
      glow.mesh.setMatrixAt(n, matrix); glow.mesh.setColorAt(n, color.setRGB(r, g, b)); params[n * 2] = alpha; params[n * 2 + 1] = shape; n++;
    };
    for (const plume of plumes) {
      // Lies in the flight plane; uv.y = 1 at the nozzle, fading toward the tail.
      transform.position.set(plume.x, VIEW.flightHeight + .02, plume.z + plume.length / 2);
      transform.rotation.set(-Math.PI / 2, 0, plume.length > 0 ? 0 : Math.PI); transform.scale.set(plume.width, Math.abs(plume.length), 1); transform.updateMatrix();
      color.setHex(plume.hex).multiplyScalar(plume.energy); add(transform.matrix, color.r, color.g, color.b, 1, PLUME);
    }
    for (const pickup of state.pickups) {
      if (Math.abs(pickup.x - state.cameraX) > VIEW.width / 2 + 1) continue;
      const pulse = Math.pow(Math.max(0, Math.sin(state.time * 3.4 + pickup.id * 1.7)), 10);
      if (pulse < .02) continue;
      const hex = pickup.kind === 'shield' ? 0xa8fff2 : pickup.kind === 'credit' ? 0xffe2a0 : pickup.kind === 'weapon' ? 0xe0ccff : 0xfff2dc;
      transform.position.set(pickup.x + .2, VIEW.flightHeight + .2, -pickup.s - .14); transform.rotation.set(-ELEVATION, 0, .3);
      transform.scale.setScalar(.34 + .12 * pulse); transform.updateMatrix();
      color.setHex(hex).multiplyScalar(1.7 * pulse); add(transform.matrix, color.r, color.g, color.b, pulse, STAR);
    }
    glow.mesh.count = n;
  }
  return {
    setQuality(next: GraphicsQuality) { quality = next; },
    /** Advance by simulation time (frozen while paused or in still fixtures) and rebuild both instanced layers. */
    update(state: RunState, plumes: readonly Plume[], dust: readonly { x: number; y: number; z: number }[] = [], planetSurface: FxSurface | null = null) {
      const previous = lastTime, dt = lastTime < 0 || state.time < lastTime ? 0 : Math.min(.1, state.time - lastTime); lastTime = state.time;
      surface = planetSurface;
      spawn(state);
      // Steam from vent stacks: a slow, soft column (about two puffs a second each; High only).
      if (full() && dt > 0 && planetSurface && Math.floor(state.time * 2) !== Math.floor(previous * 2)) planetSurface.vents.forEach((vent, i) => emit(smoke, {
        x: vent.x + (hash(state.time + i * 3.1) - .5) * .12, y: vent.y, z: vent.z, vx: .08, vy: .55, life: 1.8, size: .25, grow: 1.1, drag: .3,
        alpha: .28, shape: ROUND, drift: 1, ...tint(0xe8f0f6, 1) }));
      // Haulers kick up a light dust trail on High (about three puffs a second each); it rests on the ground.
      if (full() && dt > 0 && Math.floor(state.time * 3) !== Math.floor(previous * 3)) dust.forEach((source, i) => emit(smoke, {
        x: source.x + (hash(state.time + i) - .5) * .2, y: source.y + .08, z: source.z, vy: .18, life: .9, size: .22, grow: .6, drag: 1,
        alpha: .3, shape: ROUND, drift: 1, ...tint(0xb27c4e, 1) }));
      step(glow, dt); step(smoke, dt);
      // The ground scrolls toward the player: ground dust moves with it, air smoke partly, glows ride the flight plane.
      // Uses the run's live scroll speed when the simulation exposes it (endless ramp, boss stop).
      const scroll = (state as RunState & { scrollSpeed?: number }).scrollSpeed ?? VIEW.scrollSpeed;
      for (let i = 0; i < smoke.live; i++) smoke.pool[i].z += scroll * dt * smoke.pool[i].drift;
      write(glow); write(smoke); overlay(state, plumes);
      for (const target of [glow, smoke]) {
        target.mesh.instanceMatrix.needsUpdate = true; target.params.needsUpdate = true;
        if (target.mesh.instanceColor) target.mesh.instanceColor.needsUpdate = true;
      }
    },
    get particles() { return glow.live + smoke.live; },
    dispose() {
      for (const target of [glow, smoke]) { scene.remove(target.mesh); target.mesh.dispose(); target.geometry.dispose(); target.material.dispose(); }
    },
  };
}
export type Fx = ReturnType<typeof createFx>;
