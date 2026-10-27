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
const ADDITIVE_CAPACITY = 640, ALPHA_CAPACITY = 240, LIGHT_CAPACITY = 32;
/** Particle shapes in the shared shader. */
const ROUND = 0, PLUME = 1, STAR = 2, CHIP = 3, RING = 4;

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
  if ( shape < 0.5 ) {
    // Turbulent edges give smoke/fire volume without adding overlapping particle layers.
    float folds = sin( p.x * 31.0 + sin( p.y * 23.0 ) ) * sin( p.y * 27.0 - p.x * 13.0 );
    a = smoothstep( 0.49, 0.03, length( p ) + folds * .045 );
  }
  else if ( shape < 1.5 ) {
    float tail = clamp( vUv.y, 0.0, 1.0 );
    float width = .035 + .23 * pow( tail, .7 );
    float body = smoothstep( width, width * .15, abs( p.x ) ) * pow( tail, .85 );
    // A narrow core and shock diamonds, within the existing single plume quad.
    float diamonds = pow( max( 0.0, cos( tail * 29.0 ) ), 6.0 ) * smoothstep( .10, .01, abs( p.x ) );
    a = body * .65 + diamonds * tail * .5;
  }
  else if ( shape < 2.5 ) a = max( exp( -abs( p.x ) * 40.0 ) * smoothstep( 0.5, 0.0, abs( p.y ) ), exp( -abs( p.y ) * 40.0 ) * smoothstep( 0.5, 0.0, abs( p.x ) ) ) + smoothstep( 0.18, 0.0, length( p ) );
  else if ( shape < 3.5 ) a = step( abs( p.x ) + abs( p.y ) * 0.8, 0.42 );
  else a = smoothstep( .07, .015, abs( length( p ) - .39 ) );
  a *= vParams.x;
  if ( a < 0.003 ) discard;
  gl_FragColor = additive > 0.5 ? vec4( vColor * a, a ) : vec4( vColor, a );
}`;

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  /** Negative while a delayed particle waits to appear. */
  age: number; life: number; size: number; grow: number; stretch: number;
  /** Colour at birth and at the end of life (fire cools, smoke pales). */
  r: number; g: number; b: number; r2: number; g2: number; b2: number; alpha: number; shape: number; flat: boolean; drag: number; fall: number;
  /** Fraction of the scroll speed the particle drifts with (1 = rests on the ground, 0 = rides the flight plane). */
  drift: number;
}
/** An engine plume in world space: nozzle at (x, z), extending `length` along z (positive = toward the player). */
export interface Plume { x: number; z: number; length: number; width: number; hex: number; energy: number; round?: boolean }
/** Planet surface hooks (Vesper): sea height under a world point (null over land) and steam vents (world space). */
export interface FxSurface {
  splash(x: number, z: number): number | null; vents: readonly { x: number; y: number; z: number }[];
  /** Where the view ray through a flight-plane point (x, z) meets the ground: an explosion's light lands there. */
  ground?(x: number, z: number): { x: number; y: number; z: number } | null;
}
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Ground light (22 October, "improve explosions"): a soft disc on the terrain that brightens what it covers in proportion
 * to its own colour (destination × (1 + light)), so an explosion lights the ground and nearby hulls instead of painting
 * an orange sticker over them.
 */
const LIGHT_FRAGMENT = /* glsl */`
varying vec2 vParams; varying vec2 vUv; varying vec3 vColor;
void main() {
  float d = length( vUv - 0.5 ) * 2.0, a = vParams.x * pow( max( 0.0, 1.0 - d * d ), 2.0 );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( vColor * a, 1.0 );
}`;

function layer(scene: THREE.Scene, capacity: number, additive: boolean, light = false) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aParams', params);
  const material = light
    ? new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: LIGHT_FRAGMENT, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor })
    : new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { additive: { value: additive ? 1 : 0 } },
      // Glows draw over everything like the other combat markers; smoke and ground dust respect terrain depth.
      transparent: true, depthWrite: false, depthTest: !additive, toneMapped: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = light ? 4 : additive ? 6 : 5; mesh.name = light ? 'fx ground light' : additive ? 'fx glow' : 'fx smoke';
  scene.add(mesh);
  const pool: Particle[] = [];
  for (let i = 0; i < capacity; i++) pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, stretch: 1, r: 1, g: 1, b: 1, r2: 1, g2: 1, b2: 1, alpha: 1, shape: 0, flat: false, drag: 0, fall: 0, drift: 0 });
  let live = 0;
  return { mesh, params, pool, get live() { return live; }, set live(n: number) { live = n; }, capacity, geometry, material };
}

export function createFx(scene: THREE.Scene) {
  const glow = layer(scene, ADDITIVE_CAPACITY, true), smoke = layer(scene, ALPHA_CAPACITY, false), ground = layer(scene, LIGHT_CAPACITY, true, true);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  let lastDistance = 0, anchoredEmission = false;
  let quality: GraphicsQuality = 'high', lastTime = -1, lastTick = -1, lastEffect = -1, lastShot = -1, seed = 0;

  const emit = (target: typeof glow, p: Partial<Particle> & { x: number; y: number; z: number; life: number; size: number; delay?: number }) => {
    if (target.live >= target.capacity) return;
    const q = target.pool[target.live++];
    q.x = p.x; q.y = p.y; q.z = p.z; q.vx = p.vx ?? 0; q.vy = p.vy ?? 0; q.vz = p.vz ?? 0; q.age = -(p.delay ?? 0); q.life = p.life;
    q.size = p.size; q.grow = p.grow ?? 0; q.stretch = p.stretch ?? 1; q.alpha = p.alpha ?? 1; q.shape = p.shape ?? ROUND;
    q.flat = p.flat ?? false; q.drag = p.drag ?? 0; q.fall = p.fall ?? 0; q.r = p.r ?? 1; q.g = p.g ?? 1; q.b = p.b ?? 1; q.drift = anchoredEmission ? 1 : p.drift ?? 0;
    q.r2 = p.r2 ?? q.r; q.g2 = p.g2 ?? q.g; q.b2 = p.b2 ?? q.b;
  };
  const tint = (hex: number, energy: number) => { color.setHex(hex).multiplyScalar(energy); return { r: color.r, g: color.g, b: color.b }; };
  /** A colour ramp from `hex` at birth to `end` at death. */
  const ramp = (hex: number, energy: number, end: number, endEnergy: number) => {
    const from = tint(hex, energy); color.setHex(end).multiplyScalar(endEnergy);
    return { ...from, r2: color.r, g2: color.g, b2: color.b };
  };
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
  /** The explosion's light on the ground (and hulls) around it, where the view ray through it meets the terrain. */
  function light(x: number, z: number, size: number, life: number, hex: number, energy: number, delay = 0) {
    const at = surface?.ground?.(x, z);
    if (!at) return;
    emit(ground, { x: at.x, y: at.y + .05, z: at.z, life, size, grow: size * .25, alpha: 1, flat: true, delay, ...tint(hex, energy) });
  }
  /**
   * An airframe or battery going up (22 October, "improve explosions"): a white-hot flash and its light on the ground,
   * a fireball that cools from yellow-white to deep red with two late secondary bursts, a fast thin shockwave, embers
   * thrown out on arcs, debris chips and a smoke plume that billows up, darkens and lingers. Low keeps the flash, the
   * fireball and a few sparks.
   */
  function explosion(x: number, z: number, n: number) {
    const y = VIEW.flightHeight + .06;
    const sea = surface?.splash(x, z) ?? null;
    if (sea !== null) spray(x, sea, z, n);
    flash(x, z, 1.7, .1, 0xfff6e0, 2.8);
    emit(glow, { x, y, z, life: .38, size: 1.9, grow: 1.2, alpha: .45, shape: ROUND, ...ramp(0xffb060, 1.4, 0xff5a1a, .3) });
    light(x, z, 5.5, .5, 0xff9a48, .75);
    const fire = full() ? 5 : 2;
    for (let k = 0; k < fire; k++) {
      const a = hash(n + k * 5.7) * Math.PI * 2, d = .1 + hash(n + k) * .26, v = .5 + hash(n + k * 1.3) * .6;
      emit(glow, { x: x + Math.cos(a) * d, y: y + k * .02, z: z + Math.sin(a) * d, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: .25,
        life: .4 + hash(n + k * 2.1) * .3, size: .38 + hash(n + k * 4.3) * .22, grow: 1.1, drag: 2.6, alpha: .95, shape: ROUND,
        ...ramp(k < 2 ? 0xfff0c0 : 0xffc070, 3 - k * .2, 0xc8300c, .55) });
    }
    if (full()) {
      // Two secondary bursts a beat later, off to the sides.
      for (let k = 0; k < 2; k++) {
        const a = hash(n + k * 8.3 + 2) * Math.PI * 2, d = .35 + hash(n + k * 6.1) * .3, delay = .08 + k * .07 + hash(n + k) * .05;
        emit(glow, { x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, life: .36, size: .32, grow: 1.3, drag: 2, alpha: .9, delay, shape: ROUND,
          ...ramp(0xffe2a0, 2.6, 0xd2400f, .5) });
      }
      emit(glow, { x, y, z, life: .24, size: .5, grow: 3.4, alpha: .55, shape: RING, flat: true, ...ramp(0xfff0d8, 1.6, 0xff9a50, .6) });
      // Embers: bright points thrown up and out, falling back on short arcs.
      for (let k = 0; k < 8; k++) {
        const a = hash(n + k * 3.7 + 5) * Math.PI * 2, v = 2.2 + hash(n + k * 2.3) * 2.8;
        emit(glow, { x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1.6 + hash(n + k * 1.1) * 2.4, fall: 7, drag: 1.4,
          life: .5 + hash(n + k * 5.9) * .4, size: .07 + hash(n + k * 2.9) * .05, alpha: 1, shape: ROUND, ...ramp(0xfff0b0, 3.2, 0xff4010, 1.2) });
      }
    }
    sparks(x, z, full() ? 9 : 5, 0xffc078, 6.5, n * 3.3);
    if (!full()) return;
    // Smoke: dark and dense at first, billowing up and paling as it thins; it drifts with the ground.
    for (let k = 0; k < 5; k++) {
      const a = hash(n + k * 9.1) * Math.PI * 2, d = .1 + hash(n + k * 1.7) * .25;
      emit(smoke, { x: x + Math.cos(a) * d, y: y - .1, z: z + Math.sin(a) * d, vx: Math.cos(a) * .3, vy: .45 + hash(n + k * 3.9) * .3, vz: Math.sin(a) * .3,
        life: 1.1 + hash(n + k) * .6, size: .38 + hash(n + k * 2.2) * .18, grow: 1.5, drag: 1.3, alpha: .5, delay: .06 + k * .03, shape: ROUND, drift: .5,
        ...ramp(k % 2 ? 0x2a2420 : 0x3a3330, 1, 0x6e6a66, 1) });
    }
    for (let k = 0; k < 8; k++) {
      const a = hash(n + k * 4.9 + 1) * Math.PI * 2, v = 2.2 + hash(n + k * 1.9) * 2.8;
      emit(smoke, { x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: .6 + hash(n + k * 7.7) * 1.4, life: .55 + hash(n + k) * .3, size: .09 + hash(n + k * 3) * .08,
        drag: 1.2, fall: 7, alpha: .95, shape: CHIP, drift: .5, ...tint(0x1b1714, 1) });
    }
  }

  /** A big orange fireball with a ring of fire and debris (fuel skids; `size` 2–3 for a boss wreck's last detonation). */
  function blast(x: number, z: number, n: number, size: number) {
    flash(x, z, 2.8 * size, .28 + .1 * size, 0xff8a30, 2.4);
    light(x, z, 9 * size, .8, 0xff8a38, .95);
    const ring = full() ? 6 + Math.round(size * 2) : 3 + Math.round(size);
    for (let k = 0; k < ring; k++) { const a = k / ring * Math.PI * 2; explosion(x + Math.cos(a) * 1.1 * size, z + Math.sin(a) * 1.1 * size, n * 7 + k); }
    sparks(x, z, (full() ? 22 : 10) * Math.ceil(size), 0xffc070, 7.5 * Math.sqrt(size), n);
  }

  /**
   * A boss's last detonation (user, 22 October: "a big big bang"): a blinding core that swells into a towering fireball,
   * cooling from white through orange to deep red; two shockwave rings racing out across the view; the light of it over
   * the whole arena; a ring of secondary blasts; hundreds of embers and debris on long arcs; and a smoke column that
   * lingers over the wreck. The flash is brief and capped (no full-screen white). Low keeps the core, the rings, the
   * blasts and fewer sparks.
   */
  function bossBlast(x: number, z: number, n: number) {
    const y = VIEW.flightHeight + .1;
    flash(x, z, 6, .16, 0xfff0d0, 2);
    light(x, z, 26, 1.8, 0xff7a28, 1.2);
    light(x, z, 12, .6, 0xffd090, 1.2, .05);
    // The fireball: a small white-hot heart inside layered fire that swells and cools from orange to deep red (kept below
    // white: overlapping additive layers wash out to a pale ball).
    // Dark smoke at once, under the fire: the contrast that makes the fireball read over bright ground.
    if (full()) for (let k = 0; k < 10; k++) {
      const a = hash(n + k * 6.1 + 4) * Math.PI * 2, d = .5 + hash(n + k * 1.4) * 2;
      emit(smoke, { x: x + Math.cos(a) * d, y: y - .3, z: z + Math.sin(a) * d, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: .3, life: 1.6 + hash(n + k) * .8,
        size: 1.6 + hash(n + k * 2.8) * 1, grow: 1.8, drag: 1.2, alpha: .75, delay: .04, shape: ROUND, drift: .4, ...ramp(0x1c1612, 1, 0x4a4440, 1) });
    }
    emit(glow, { x, y: y + .2, z, life: .4, size: 2.2, grow: 1.8, alpha: .9, shape: ROUND, ...ramp(0xfff0c0, 2, 0xff7a20, .8) });
    for (let k = 0; k < (full() ? 18 : 7); k++) {
      const a = hash(n + k * 3.3) * Math.PI * 2, d = .2 + hash(n + k) * 2.2, v = .8 + hash(n + k * 1.9) * 1.8;
      emit(glow, { x: x + Math.cos(a) * d, y: y + .1 + k * .02, z: z + Math.sin(a) * d, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: .5,
        life: .7 + hash(n + k * 2.7) * .7, size: 1.1 + hash(n + k * 4.1) * 1.2, grow: 1.8, drag: 1.4, alpha: .9, delay: hash(n + k * 5) * .3, shape: ROUND,
        ...ramp(k % 3 ? 0xffa040 : 0xffd070, 2.2, 0x901404, .4) });
    }
    // Shockwaves: a fast hot ring and a slower, wider one.
    emit(glow, { x, y, z, life: .7, size: 1.2, grow: 22, alpha: .75, shape: RING, flat: true, ...ramp(0xffc070, 2.2, 0xff4a10, .4) });
    emit(glow, { x, y: y - .02, z, life: 1.3, size: 1.5, grow: 15, alpha: .45, delay: .12, shape: RING, flat: true, ...ramp(0xff9a48, 1.5, 0x9a2008, .25) });
    // (The explosions racing outward after it come from the simulation, one at a time: src/sim/bastion.ts deathSequence.)
    sparks(x, z, full() ? 40 : 20, 0xffc070, 11, n * 1.7);
    if (!full()) return;
    // Embers and burning debris on long arcs.
    for (let k = 0; k < 70; k++) {
      const a = hash(n + k * 2.9 + 11) * Math.PI * 2, v = 3 + hash(n + k * 1.3) * 7;
      emit(glow, { x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + hash(n + k * 4.7) * 5, fall: 6, drag: .9,
        life: .9 + hash(n + k * 6.1) * 1.1, size: .09 + hash(n + k * 2.1) * .1, alpha: 1, delay: hash(n + k) * .2, shape: ROUND, ...ramp(0xfff2b8, 3.4, 0xff3a0c, 1) });
    }
    for (let k = 0; k < 24; k++) {
      const a = hash(n + k * 5.3 + 7) * Math.PI * 2, v = 2.5 + hash(n + k * 3.7) * 5;
      emit(smoke, { x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1.5 + hash(n + k * 8.1) * 3.5, fall: 7, drag: .9,
        life: .9 + hash(n + k) * .6, size: .14 + hash(n + k * 1.1) * .16, alpha: .95, shape: CHIP, drift: .5, ...tint(0x1d1814, 1) });
    }
    // The smoke column: dark, billowing up and out, lingering over the wreck.
    for (let k = 0; k < 16; k++) {
      const a = hash(n + k * 7.7 + 3) * Math.PI * 2, d = hash(n + k * 2.6) * 2.2;
      emit(smoke, { x: x + Math.cos(a) * d, y: y - .2, z: z + Math.sin(a) * d, vx: Math.cos(a) * .5, vy: .6 + hash(n + k * 3.4) * .6, vz: Math.sin(a) * .5,
        life: 2.4 + hash(n + k) * 1.4, size: 1.1 + hash(n + k * 1.6) * .8, grow: 2.2, drag: .8, alpha: .55, delay: .25 + k * .05, shape: ROUND, drift: .4,
        ...ramp(k % 2 ? 0x241e1a : 0x332c28, 1, 0x5e5955, 1) });
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
      anchoredEmission = state.boss?.phase === 'destroyed' && ['explosion', 'blast', 'bossBlast'].includes(effect.kind);
      const z = -effect.s;
      if (effect.kind === 'explosion') explosion(effect.x, z, effect.id);
      else if (effect.kind === 'blast') blast(effect.x, z, effect.id, 1);
      else if (effect.kind === 'bossBlast') bossBlast(effect.x, z, effect.id);
      else if (effect.kind === 'hit') { flash(effect.x, z, .38, .07, 0xffd2a0, 1.8); sparks(effect.x, z, full() ? 5 : 3, 0xffb070, 4.2, effect.id); }
      else if (effect.kind === 'shield') sparks(effect.x, z, full() ? 10 : 5, 0x9ffff2, 5, effect.id);
      else if (effect.kind === 'pickup') for (let i = 0; i < (full() ? 4 : 2); i++) emit(glow, { x: effect.x + (hash(effect.id + i) - .5) * .5, y: VIEW.flightHeight + .1,
        z: z + (hash(effect.id + i * 3) - .5) * .5, life: .25, size: .32, grow: -.2, shape: STAR, alpha: 1, ...tint(0xfff4d8, 1.6) });
      else if (effect.kind === 'special') flash(effect.x, z, 2.2, .16, 0xc8fff8, 1.6);
    }
    anchoredEmission = false;
    lastEffect = maxEffect;
    let maxShot = lastShot;
    for (const shot of state.projectiles) {
      if (shot.id <= lastShot) continue;
      maxShot = Math.max(maxShot, shot.id);
      if (shot.delay || Math.abs(shot.x - state.cameraX) > VIEW.width / 2 + 1) continue;
      // Muzzle flash at the logical origin; colour follows the shot's team.
      if (shot.friendly) flash(shot.previousX, -shot.previousS, .3, .06, 0xd8fff9, 1.5);
      // (Amnion's hostile shots are violet: src/render/scene.ts.)
      else flash(shot.previousX, -shot.previousS, .42, .09, state.planet === 'amnion' ? 0xff3a2e : 0xff9a78, 1.25);
    }
    lastShot = maxShot;
  }

  function step(target: typeof glow, dt: number) {
    let write = 0;
    for (let i = 0; i < target.live; i++) {
      const p = target.pool[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.age < 0) {
        // Still waiting to appear: keep it, motionless.
        if (write !== i) { const keep = target.pool[write]; target.pool[write] = p; target.pool[i] = keep; }
        write++; continue;
      }
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
      const p = target.pool[i], t = Math.max(0, p.age / p.life), size = Math.max(.01, p.size + p.grow * t);
      transform.position.set(p.x, p.y, p.z);
      if (p.flat) transform.rotation.set(-Math.PI / 2, 0, Math.atan2(-p.vx, -p.vz));
      else transform.rotation.set(-ELEVATION, 0, 0);
      transform.scale.set(size, size * p.stretch, 1); transform.updateMatrix();
      target.mesh.setMatrixAt(i, transform.matrix); target.mesh.setColorAt(i, color.setRGB(p.r + (p.r2 - p.r) * t, p.g + (p.g2 - p.g) * t, p.b + (p.b2 - p.b) * t));
      params[i * 2] = p.age < 0 ? 0 : p.alpha * (1 - t * t); params[i * 2 + 1] = p.shape;
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
      if (plume.round) {
        // A one-frame glow (e.g. a Needle's muzzle charging) facing the camera, `width` across.
        transform.position.set(plume.x, VIEW.flightHeight + .06, plume.z); transform.rotation.set(-ELEVATION, 0, 0); transform.scale.set(plume.width, plume.width, 1);
        transform.updateMatrix(); color.setHex(plume.hex).multiplyScalar(plume.energy); add(transform.matrix, color.r, color.g, color.b, 1, ROUND);
        continue;
      }
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
      const shift = lastTime < 0 || state.time < lastTime || seed !== state.config.seed ? 0 : Math.max(0, state.distance - lastDistance); lastDistance = state.distance;
      // Move only existing particles; new effects already use this snapshot's world position.
      for (const layer of [glow, smoke, ground]) for (let i = 0; i < layer.live; i++) layer.pool[i].z += shift * (layer === ground ? 1 : layer.pool[i].drift);
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
      // Seeker Rack missiles: a hot nozzle glow and a grey smoke trail laid along their path.
      if (dt > 0) for (const shot of state.projectiles) {
        if (!shot.special || shot.ttl <= 0) continue;
        const speed = Math.hypot(shot.vx, shot.vs) || 1, bx = -shot.vx / speed * .24, bs = -shot.vs / speed * .24;
        emit(glow, { x: shot.x + bx, y: VIEW.flightHeight + .05, z: -(shot.s + bs), life: .08, size: .2, grow: -.4, alpha: 1, shape: ROUND, ...tint(0xffc070, 2.4) });
        for (let k = 0; k < (full() ? 2 : 1); k++) {
          const f = k / 2, x = shot.previousX + (shot.x - shot.previousX) * f + bx, s = shot.previousS + (shot.s - shot.previousS) * f + bs;
          emit(smoke, { x: x + (hash(shot.id + state.tick + k) - .5) * .05, y: VIEW.flightHeight, z: -s, vy: .05, life: .55 + hash(shot.id + k) * .25,
            size: .1, grow: .55, drag: 1.5, alpha: .5, shape: ROUND, drift: .25, ...tint(0xd8dde2, 1) });
        }
      }
      step(glow, dt); step(smoke, dt); step(ground, dt);
      write(glow); write(smoke); write(ground); overlay(state, plumes);
      for (const target of [glow, smoke, ground]) {
        target.mesh.instanceMatrix.needsUpdate = true; target.params.needsUpdate = true;
        if (target.mesh.instanceColor) target.mesh.instanceColor.needsUpdate = true;
      }
    },
    get particles() { return glow.live + smoke.live; },
    dispose() {
      for (const target of [glow, smoke, ground]) { scene.remove(target.mesh); target.mesh.dispose(); target.geometry.dispose(); target.material.dispose(); }
    },
  };
}
export type Fx = ReturnType<typeof createFx>;
