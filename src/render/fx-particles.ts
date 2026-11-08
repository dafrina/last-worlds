import { hostileFlashHex } from './shot-colors';
import * as THREE from 'three';
import { VIEW, type GraphicsQuality, type PlanetId, type RunState } from '../shared/contracts';
import { weaponRank } from '../content/equipment';
import { AROUND_HERO } from './hero-stencil';
import { drawnShot, type Launch } from './shot-launch';
import { liveInstances } from './instances';

/**
 * Presentation-only effects (docs/04 §5): engine plumes, muzzle flashes, impact sparks, explosions (fireball,
 * short smoke, a few debris chips) and pickup glints. Everything is driven by snapshot events the simulation
 * already emits (new projectiles, `effects`) and by simulation time; nothing here feeds back into combat.
 * Cosmetic variation is a deterministic hash, never `Math.random()` or simulation RNG.
 *
 * Two instanced draws in total: an additive layer (glows; HDR colours bloom on High) and an alpha layer (smoke
 * and debris). Friendly flashes are cyan-white, hostile ones warm coral, matching their shots. Low keeps the
 * readable core of each effect and drops most secondary particles (docs/05 §9: particles are reduced first).
 * A destroyed boss's blasts go to a second pair that draws around the hero's stencil (user, 27 October: the ship
 * seemed to fly under the boss's explosion): the wreck burns below the ship, which still shows its own hits on top.
 * A strike site's destruction (`siteBlast`, docs/33 § 6) burns in that pair too, resting on the ground where it stood.
 */
const ELEVATION = THREE.MathUtils.degToRad(VIEW.elevation);
const ADDITIVE_CAPACITY = 640, ALPHA_CAPACITY = 240, LIGHT_CAPACITY = 32, WRECK_ADDITIVE_CAPACITY = 384, WRECK_ALPHA_CAPACITY = 160;
/** Particle shapes in the shared shader. */
const ROUND = 0, PLUME = 1, STAR = 2, CHIP = 3, RING = 4;
/**
 * The hero's main-weapon shots at tiers 4 and 5 (docs/30, user 31 October: "crazier"): a little more punch, render only.
 * `grow` scales the bolt, the rail slug's streak and the muzzle flash; `energy` brightens the bolt over dark ground (HDR, so
 * it blooms on High) and the flash. Tiers 1-3 draw as before. Still cyan-white and slim, never the warm round hostile shot.
 */
const SHOT_HEAT = [{ grow: 1, energy: 1 }, { grow: 1.15, energy: 1.5 }, { grow: 1.3, energy: 2 }] as const;
export const shotHeat = (power: number) => SHOT_HEAT[Math.max(0, weaponRank(power) - 2)];

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
  /** A falling ember or fragment settles at this height (−Infinity: none). */
  floor: number;
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

/** A point in the renderer's world frame: x lateral, y up, z = −s (the ground's s less the distance flown, at that frame). */
export interface WorldPoint { x: number; y: number; z: number }
/**
 * A strike site's destruction (docs/33 § 6), from src/render/site-view.ts in the frame its last core falls ('site'), or as
 * one of the sealed vault's seals breaks before the last ('seal'). Every point is world space at that frame; the whole
 * sequence then rests on the ground (it scrolls with the terrain, never with the camera). Presentation only.
 */
export interface SiteBlast {
  kind: 'site' | 'seal'; finish: PlanetId;
  /** The kill explosions (the simulation's effect ids) this anchored sequence replaces: its core's, when it was matched (and
   * those of any vault seals that broke in the same frame, whose own blasts it covers). */
  effects: readonly number[];
  /** The core's centre, the site's floor (its ground height), the middle of its footprint and the footprint's half size. */
  core: WorldPoint; floor: number; centre: { x: number; z: number }; half: { x: number; z: number };
  /** Over the site's main masses (a tower, the hangars, the freighter's halves): the staggered secondary blasts. */
  masses: readonly WorldPoint[];
  /** The core's own glow (sRGB hex): the first flash and the shock ring wear it. */
  accent: number;
  /** Cosmetic variation (the site's first core id). */
  seed: number;
}
/** A world's fire for its strike sites' destruction: warm fire on the frontier, the world's glow on Nacre and Umbra, ichor on Amnion. */
export interface SiteFire {
  flash: number;
  /** Fireballs burn from these (hot, warm) and cool to `cool`. */
  fire: readonly [number, number]; cool: number;
  /** Embers and hot shards, at birth and as they die on the ground. */
  ember: readonly [number, number];
  /** Smoke as it rises (dark) and as it thins (pale); fragments (the site's paint, and burnt). */
  smoke: readonly [number, number]; chips: readonly [number, number];
  /** The blast's light on the ground, and the ruin's heat as it cools (src/render/site-view.ts). */
  light: number; heat: number;
  /** Amnion's brood: splashes of ichor (pale, yolk, blood) among the fire. */
  ichor?: readonly [number, number, number];
}
export const SITE_FIRE: Readonly<Record<PlanetId, SiteFire>> = {
  luna: { flash: 0xfff6e2, fire: [0xffe2a8, 0xffa452], cool: 0xa02a0a, ember: [0xfff0b8, 0xff4a12], smoke: [0x2c2a28, 0x8c8884], chips: [0xd4d2cc, 0x262422], light: 0xff9a48, heat: 0xff5a1a },
  khepri: { flash: 0xfff0d2, fire: [0xffd488, 0xff8a30], cool: 0x921c06, ember: [0xffe8a0, 0xff3a08], smoke: [0x2e2218, 0x8c705a], chips: [0xc49468, 0x382214], light: 0xff8a38, heat: 0xff4a12 },
  vesper: { flash: 0xf4fbff, fire: [0xffe8bc, 0xffaa62], cool: 0xa83010, ember: [0xfff4c8, 0xff5a1a], smoke: [0x3a3e44, 0xc4ced8], chips: [0xe6ecf2, 0x2a2e36], light: 0xffb070, heat: 0xff6020 },
  nacre: { flash: 0xe6fff8, fire: [0xc8fff0, 0x3ff0c8], cool: 0x0a5450, ember: [0xe0fff4, 0x22d0b0], smoke: [0x34403e, 0x9ab4ac], chips: [0xc4c0ae, 0x2c283e], light: 0x58f0d0, heat: 0x2ad8b8 },
  corona: { flash: 0xfff2d8, fire: [0xffe0a0, 0xff8a2a], cool: 0x8a2a08, ember: [0xfff0c0, 0xff6a20], smoke: [0x3a2418, 0x8a6048], chips: [0x2a2420, 0x6a3a20], light: 0xffa040, heat: 0xff6020 },
  umbra: { flash: 0xf4eeff, fire: [0xe2d6ff, 0x9a7cff], cool: 0x30147a, ember: [0xf0e8ff, 0x8a60ff], smoke: [0x382e4e, 0x7a70a0], chips: [0x1c1a26, 0x6a5ab0], light: 0xa88cff, heat: 0x8a60ff },
  amnion: { flash: 0xfff4e8, fire: [0xffe4a4, 0xffb442], cool: 0x861810, ember: [0xfff0c0, 0xff4420], smoke: [0x381a12, 0x9c6c58], chips: [0xdcd2c0, 0x5e261c], light: 0xffa848, heat: 0xff5a20,
    ichor: [0xfff2ee, 0xffc23a, 0xff3a2e] },
};
/** The wind a site's smoke column leans in (world units a second, x and z): toward the open side and away from the camera. */
const SITE_WIND = { x: .3, z: -.16 } as const;

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

function layer(scene: THREE.Scene, capacity: number, additive: boolean, light = false, underHero = false) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aParams', params);
  const material = light
    ? new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: LIGHT_FRAGMENT, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor })
    : new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { additive: { value: additive ? 1 : 0 } },
      // Glows draw over everything like the other combat markers; smoke and ground dust respect terrain depth.
      transparent: true, depthWrite: false, depthTest: !additive, toneMapped: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, ...(underHero ? AROUND_HERO : {}) });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = light ? 4 : additive ? 6 : 5;
  mesh.name = (underHero ? 'fx wreck ' : 'fx ') + (light ? 'ground light' : additive ? 'glow' : 'smoke');
  scene.add(mesh);
  const pool: Particle[] = [];
  for (let i = 0; i < capacity; i++) pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, stretch: 1, r: 1, g: 1, b: 1, r2: 1, g2: 1, b2: 1, alpha: 1, shape: 0, flat: false, drag: 0, fall: 0, drift: 0, floor: -Infinity });
  let live = 0;
  /** The attributes uploaded with the instances each frame (liveInstances). */
  const uploads = [params];
  return { mesh, params, uploads, pool, get live() { return live; }, set live(n: number) { live = n; }, capacity, geometry, material };
}

export function createFx(scene: THREE.Scene) {
  const glow = layer(scene, ADDITIVE_CAPACITY, true), smoke = layer(scene, ALPHA_CAPACITY, false), ground = layer(scene, LIGHT_CAPACITY, true, true);
  const wreckGlow = layer(scene, WRECK_ADDITIVE_CAPACITY, true, false, true), wreckSmoke = layer(scene, WRECK_ALPHA_CAPACITY, false, false, true);
  const layers = [glow, smoke, ground, wreckGlow, wreckSmoke];
  const transform = new THREE.Object3D(), color = new THREE.Color(), mixing = new THREE.Color();
  let lastDistance = 0, anchoredEmission = false;
  /** Strike sites destroyed since the last update (site-view.ts), and the kill explosions their sequences replace. */
  const pendingSites: SiteBlast[] = [], replaced = new Set<number>();
  /** Ground batteries' rounds as drawn (src/render/shot-launch.ts), from the renderer. */
  let launchOf: (id: number) => Launch | undefined = () => undefined;
  let quality: GraphicsQuality = 'high', lastTime = -1, lastTick = -1, lastEffect = -1, lastShot = -1, seed = 0;

  const emit = (into: typeof glow, p: Partial<Particle> & { x: number; y: number; z: number; life: number; size: number; delay?: number }) => {
    // A destroyed boss's blasts burn below the ship (the wreck pair draws around the hero).
    const target = anchoredEmission ? into === glow ? wreckGlow : into === smoke ? wreckSmoke : into : into;
    if (target.live >= target.capacity) return;
    const q = target.pool[target.live++];
    q.x = p.x; q.y = p.y; q.z = p.z; q.vx = p.vx ?? 0; q.vy = p.vy ?? 0; q.vz = p.vz ?? 0; q.age = -(p.delay ?? 0); q.life = p.life;
    q.size = p.size; q.grow = p.grow ?? 0; q.stretch = p.stretch ?? 1; q.alpha = p.alpha ?? 1; q.shape = p.shape ?? ROUND;
    q.flat = p.flat ?? false; q.drag = p.drag ?? 0; q.fall = p.fall ?? 0; q.r = p.r ?? 1; q.g = p.g ?? 1; q.b = p.b ?? 1; q.drift = anchoredEmission ? 1 : p.drift ?? 0;
    q.r2 = p.r2 ?? q.r; q.g2 = p.g2 ?? q.g; q.b2 = p.b2 ?? q.b; q.floor = p.floor ?? -Infinity;
  };
  const tint = (hex: number, energy: number) => { color.setHex(hex).multiplyScalar(energy); return { r: color.r, g: color.g, b: color.b }; };
  /** A colour ramp from `hex` at birth to `end` at death. */
  const ramp = (hex: number, energy: number, end: number, endEnergy: number) => {
    const from = tint(hex, energy); color.setHex(end).multiplyScalar(endEnergy);
    return { ...from, r2: color.r, g2: color.g, b2: color.b };
  };
  const full = () => quality === 'high';
  /** sRGB hex `a` toward `b` by `t` (a site core's glow, whitened for its flash). */
  const mixHex = (a: number, b: number, t: number) => color.setHex(a).lerp(mixing.setHex(b), t).getHex();

  /** Short additive fan of streaks, mostly in the flight plane (or level at height `y`, after `delay`). */
  const sparks = (x: number, z: number, count: number, hex: number, speed: number, n: number, y = VIEW.flightHeight + .05, delay = 0) => {
    for (let i = 0; i < count; i++) {
      const a = hash(n + i * 7.3) * Math.PI * 2, v = speed * (0.55 + hash(n + i * 3.1) * 0.9);
      emit(glow, { x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, life: .16 + hash(n + i) * .16, size: .07, stretch: 3.2,
        shape: ROUND, flat: true, drag: 5, alpha: 1, delay, ...tint(hex, 2.6) });
    }
  };
  const flash = (x: number, z: number, size: number, life: number, hex: number, energy: number, y = VIEW.flightHeight + .08, delay = 0) =>
    emit(glow, { x, y, z, life, size, grow: size * .6, alpha: 1, shape: ROUND, delay, ...tint(hex, energy) });

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
    // (The explosions racing outward after it come from the simulation, one at a time: src/sim/boss.ts deathSequence.)
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

  /* ---- Strike sites (docs/33 § 6): world points on the ground, emitted with `anchoredEmission` (the wreck pair, drift 1). ---- */

  /** Embers (and the first `shards` as hot shards) thrown up and out on arcs; they settle glowing on the floor and die there. */
  function siteEmbers(at: WorldPoint, floor: number, count: number, speed: number, fire: SiteFire, n: number, delay: number, shards = 0) {
    for (let k = 0; k < count; k++) {
      const a = hash(n + k * 3.7 + 5) * Math.PI * 2, v = speed * (.4 + hash(n + k * 2.3) * .8), shard = k < shards;
      emit(glow, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1.6 + hash(n + k * 1.1) * 3, fall: 7, drag: .9, floor: floor + .04,
        life: 1.2 + hash(n + k * 5.9) * 1, size: shard ? .13 + hash(n + k * 2.9) * .09 : .07 + hash(n + k * 2.9) * .06, alpha: 1, delay: delay + hash(n + k) * .08,
        shape: shard ? CHIP : ROUND, ...ramp(fire.ember[0], shard ? 2.4 : 3.2, fire.ember[1], shard ? .5 : 1) });
    }
  }
  /** Fragments of the site (its paint, and burnt) thrown off on arcs; they land on the floor and fade there. */
  function siteFragments(at: WorldPoint, floor: number, count: number, speed: number, fire: SiteFire, n: number, delay: number) {
    for (let k = 0; k < count; k++) {
      const a = hash(n + k * 4.9 + 1) * Math.PI * 2, v = speed * (.45 + hash(n + k * 1.9) * .8);
      emit(smoke, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1.8 + hash(n + k * 7.7) * 2.6, fall: 8, drag: .8, floor: floor + .03,
        life: 1.3 + hash(n + k) * .8, size: .12 + hash(n + k * 3) * .14, alpha: .95, delay: delay + hash(n + k * 2) * .06, shape: CHIP, ...tint(fire.chips[k % 3 ? 1 : 0], 1) });
    }
  }
  /** A puff of the smoke column: it climbs from a burning point, leans with the wind and pales as it thins. */
  function sitePlume(at: WorldPoint, size: number, life: number, fire: SiteFire, n: number, delay: number, alpha = .42) {
    emit(smoke, { x: at.x + (hash(n) - .5) * .5, y: at.y + .3 + size * .35, z: at.z + (hash(n + 3) - .5) * .5, vx: SITE_WIND.x * (.6 + hash(n + 5) * .8), vz: SITE_WIND.z,
      vy: .55 + hash(n + 7) * .4, drag: .2, life, size, grow: size * 1.6, alpha, delay, shape: ROUND, ...ramp(fire.smoke[0], 1, fire.smoke[1], 1) });
  }
  /** Amnion's brood bleeds instead of burning: three layered splashes (pale, yolk, blood) rising and spreading (the carriers' ichor). */
  function siteIchor(at: WorldPoint, size: number, fire: SiteFire, n: number, delay: number) {
    const colours = fire.ichor!;
    for (let k = 0; k < 3; k++) emit(glow, { x: at.x + (hash(n + k) - .5) * size * .6, y: at.y + .15 + k * .12, z: at.z + (hash(n + k + 4) - .5) * size * .6,
      vx: (hash(n + k + 8) - .5) * 1.2, vy: .8 + hash(n + k) * 1.1, vz: (hash(n + k + 12) - .5) * 1.2, drag: 1.5, life: .55 + hash(n + k + 2) * .35,
      size: size * (.55 + k * .2), grow: size * .9, alpha: .9, delay: delay + k * .03, shape: ROUND, ...ramp(colours[k], k ? 2.2 : 2.6, fire.cool, .4) });
  }
  /** A fire puff (or on Amnion an ichor splash) climbing out of a blast. */
  function sitePuff(at: WorldPoint, size: number, fire: SiteFire, n: number, delay: number, k: number) {
    if (fire.ichor && k % 2 === 0) { siteIchor(at, size * 1.2, fire, n, delay); return; }
    const a = hash(n + 5.7) * Math.PI * 2, v = .35 + hash(n + 1.3) * .55;
    emit(glow, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: .5 + hash(n + 3.1) * .6, drag: 2, life: .6 + hash(n + 2.1) * .4,
      size, grow: size * 1.4, alpha: .9, delay, shape: ROUND, ...ramp(k % 2 ? fire.fire[1] : fire.fire[0], 2.6, fire.cool, .5) });
  }
  /**
   * One blast of a site's sequence at a world point (a secondary blast over one of its masses, or a vault seal breaking): a
   * flash and its light on the ground, a fireball (ichor on Amnion), embers and hot shards that settle on the floor, fragments,
   * and on High a few sparks and smoke. `scale` 1 is a secondary blast.
   */
  function siteBurst(at: WorldPoint, floor: number, scale: number, fire: SiteFire, n: number, delay: number) {
    const hi = full();
    flash(at.x, at.z, 2.8 * scale, .14, fire.flash, 2.2, at.y + .15, delay);
    emit(ground, { x: at.x, y: floor + .05, z: at.z, life: .5, size: 4.5 * scale, grow: 1.2 * scale, alpha: 1, flat: true, delay, ...tint(fire.light, .7) });
    emit(glow, { x: at.x, y: at.y + .2, z: at.z, vy: .6, drag: 1.2, life: .65, size: 1.8 * scale, grow: 1.6 * scale, alpha: .9, delay, shape: ROUND, ...ramp(fire.fire[0], 2.4, fire.cool, .4) });
    for (let k = 0; k < (hi ? 3 : 1); k++) {
      const a = hash(n + k * 5.7) * Math.PI * 2, d = (.15 + hash(n + k) * .45) * scale;
      sitePuff({ x: at.x + Math.cos(a) * d, y: at.y + .1 + k * .1, z: at.z + Math.sin(a) * d }, (.8 + hash(n + k * 4.3) * .45) * scale, fire, n + k * 13, delay + .02 + k * .04, k);
    }
    siteEmbers(at, floor, hi ? 7 : 2, 2.8 * scale, fire, n * 1.7, delay, 2);
    siteFragments(at, floor, hi ? 4 : 2, 2.4 * scale, fire, n * 2.3, delay);
    if (!hi) return;
    sparks(at.x, at.z, 5, fire.ember[0], 5 * scale, n * 3.1, floor + .12, delay);
    for (let k = 0; k < 2; k++) sitePlume(at, 1 * scale, 1.4 + hash(n + k) * .5, fire, n + k * 5.3, delay + .1 + k * .12, .48);
  }
  /**
   * A strike site's destruction (docs/33 § 6; user, 3 November: "comparable in style to boss explosions, but scaled
   * appropriately"): about two seconds, resting on the ground where the site stood, in the wreck pair (it burns below the
   * ship). The kill: the core's glow flashes white-hot with a short wash over the whole footprint (the site turns to its ruin
   * under it: site-view.ts), a fireball climbs out of the core with its light on the ground, shock rings in the core's colour
   * sweep out past the site, sparks skitter, fragments of its paint and hot shards are thrown off and embers arc out. Then
   * secondary blasts walk over the site's main masses, nearest the core first (0.2–1.1 s), and a smoke column climbs and leans
   * with the wind while the embers settle on the floor and die there, handing over to the ruin's own. About half a boss's
   * last detonation (bossBlast) and none of the boss's blasts racing outward. Low keeps the flashes, the fireball, the ring,
   * three secondary blasts and a few embers, fragments and puffs.
   */
  function siteBlast(b: SiteBlast) {
    const fire = SITE_FIRE[b.finish], n = b.seed * 13.37, hi = full(), { core, floor } = b, white = mixHex(b.accent, 0xffffff, .55);
    anchoredEmission = true;
    if (b.kind === 'seal') {
      // A vault seal breaking before the last: one blast at the seal, in its crystal's light.
      flash(core.x, core.z, 2.4, .12, white, 2.4, core.y + .1);
      emit(glow, { x: core.x, y: floor + .12, z: core.z, life: .32, size: .5, grow: 4.2, alpha: .6, shape: RING, flat: true, ...ramp(white, 1.8, fire.light, .4) });
      siteBurst(core, floor, .85, fire, n, 0);
      anchoredEmission = false;
      return;
    }
    const span = Math.hypot(b.half.x, b.half.z);
    flash(core.x, core.z, 4.2, .18, white, 2.6, core.y + .15);
    emit(glow, { x: b.centre.x, y: floor + 1.1, z: b.centre.z, life: .2, size: span * 2, grow: span * .5, alpha: .42, shape: ROUND, ...tint(fire.flash, 1.3) });
    emit(ground, { x: core.x, y: floor + .05, z: core.z, life: .75, size: span * 2.1, grow: span * .6, alpha: 1, flat: true, ...tint(fire.light, .65) });
    // Dark smoke at once, under the fire: the contrast that makes the fireball read over pale ground.
    for (let k = 0; k < (hi ? 6 : 1); k++) {
      const a = hash(n + k * 6.1 + 4) * Math.PI * 2, d = .3 + hash(n + k * 1.4) * .8;
      emit(smoke, { x: core.x + Math.cos(a) * d, y: core.y + .2, z: core.z + Math.sin(a) * d, vx: Math.cos(a) * .6, vz: Math.sin(a) * .6, vy: .35, drag: 1.2,
        life: 1.5 + hash(n + k) * .6, size: 1.3 + hash(n + k * 2.8) * .7, grow: 2, alpha: .7, delay: .04, shape: ROUND, ...ramp(fire.smoke[0], .8, fire.smoke[1], 1) });
    }
    // The fireball: a hot heart rising out of the core, and puffs climbing around it.
    emit(glow, { x: core.x, y: core.y + .3, z: core.z, vy: .8, drag: 1, life: .8, size: 2.6, grow: 2.4, alpha: .9, shape: ROUND, ...ramp(fire.fire[0], 2.2, fire.cool, .4) });
    for (let k = 0; k < (hi ? 10 : 3); k++) {
      const a = hash(n + k * 3.3) * Math.PI * 2, d = .3 + hash(n + k) * .9;
      sitePuff({ x: core.x + Math.cos(a) * d, y: core.y + .1 + k * .05, z: core.z + Math.sin(a) * d }, .9 + hash(n + k * 4.1) * .6, fire, n + k * 17, hash(n + k * 5) * .14, k);
    }
    // Shock rings in the core's colour, racing out past the site's edges.
    emit(glow, { x: core.x, y: floor + .12, z: core.z, life: .5, size: .8, grow: span * 3.3, alpha: .75, shape: RING, flat: true, ...ramp(white, 2, fire.light, .5) });
    if (hi) emit(glow, { x: core.x, y: floor + .1, z: core.z, life: .85, size: 1, grow: span * 2.3, alpha: .4, delay: .07, shape: RING, flat: true, ...ramp(fire.fire[1], 1.4, fire.cool, .25) });
    sparks(core.x, core.z, hi ? 18 : 8, fire.ember[0], 7, n * 1.3, floor + .12);
    siteEmbers(core, floor, hi ? 32 : 8, 4, fire, n * 1.9, 0, hi ? 10 : 3);
    siteFragments(core, floor, hi ? 16 : 5, 3.2, fire, n * 2.7, 0);
    // Secondary blasts over the site's main masses, nearest the core first.
    const masses = [...b.masses].sort((p, q) => Math.hypot(p.x - core.x, p.z - core.z) - Math.hypot(q.x - core.x, q.z - core.z)).slice(0, hi ? 4 : 3);
    masses.forEach((mass, i) => siteBurst(mass, floor, 1, fire, n + 31 * (i + 1), .2 + i * .27 + hash(n + i) * .08));
    // The smoke column: from the core and the masses, climbing and leaning with the wind, paling as it thins.
    for (let k = 0; k < (hi ? 14 : 3); k++) {
      const from = k % 3 === 0 || !masses.length ? core : masses[k % masses.length];
      sitePlume(from, 1.4 + hash(n + k * 1.6) * .7, 1.8 + hash(n + k) * .7, fire, n + k * 7.7, .2 + k * .05, .58);
    }
    anchoredEmission = false;
  }

  /** New snapshot events → particle spawns. Rewinds (a new run, retry) reset the cursors. */
  function spawn(state: RunState, heroGlow: number) {
    // A new run or a rewind: the last run's fire (its wrecks' too) goes out.
    if (state.tick < lastTick || seed !== state.config.seed) { lastEffect = -1; lastShot = -1; glow.live = 0; smoke.live = 0; wreckGlow.live = 0; wreckSmoke.live = 0; seed = state.config.seed; }
    lastTick = state.tick;
    // Strike sites destroyed this frame: their anchored sequences replace the cores' kill explosions.
    for (const blast of pendingSites) { blast.effects.forEach(id => replaced.add(id)); siteBlast(blast); }
    pendingSites.length = 0;
    let maxEffect = lastEffect;
    for (const effect of state.effects) {
      if (effect.id <= lastEffect) continue;
      maxEffect = Math.max(maxEffect, effect.id);
      if (replaced.has(effect.id)) continue;
      anchoredEmission = state.boss?.phase === 'destroyed' && ['explosion', 'blast', 'bossBlast'].includes(effect.kind);
      const z = -effect.s;
      if (effect.kind === 'explosion') explosion(effect.x, z, effect.id);
      else if (effect.kind === 'blast') blast(effect.x, z, effect.id, 1);
      else if (effect.kind === 'bossBlast') bossBlast(effect.x, z, effect.id);
      else if (effect.kind === 'hit') { flash(effect.x, z, .38, .07, 0xffd2a0, 1.8); sparks(effect.x, z, full() ? 5 : 3, 0xffb070, 4.2, effect.id); }
      else if (effect.kind === 'shield') sparks(effect.x, z, full() ? 10 : 5, heroGlow, 5, effect.id);
      else if (effect.kind === 'pickup') for (let i = 0; i < (full() ? 4 : 2); i++) emit(glow, { x: effect.x + (hash(effect.id + i) - .5) * .5, y: VIEW.flightHeight + .1,
        z: z + (hash(effect.id + i * 3) - .5) * .5, life: .25, size: .32, grow: -.2, shape: STAR, alpha: 1, ...tint(0xfff4d8, 1.6) });
      else if (effect.kind === 'special') flash(effect.x, z, 2.2, .16, 0xc8fff8, 1.6);
    }
    anchoredEmission = false;
    replaced.clear();
    lastEffect = maxEffect;
    let maxShot = lastShot;
    const heat = shotHeat(state.player.power);
    for (const shot of state.projectiles) {
      if (shot.id <= lastShot) continue;
      maxShot = Math.max(maxShot, shot.id);
      if (shot.delay || Math.abs(shot.x - state.cameraX) > VIEW.width / 2 + 1) continue;
      // Muzzle flash at the logical origin; colour follows the shot's team. Main-weapon tiers 4 and 5 flash larger.
      if (shot.friendly) {
        const punch = shot.weapon ? heat : SHOT_HEAT[0];
        flash(shot.previousX, -shot.previousS, .3 * punch.grow, .06, 0xd8fff9, 1.5 * Math.sqrt(punch.energy));
      }
      // A ground battery's round flashes at the battery as drawn.
      else {
        const launch = launchOf(shot.id), at = launch ? drawnShot({ x: shot.previousX, s: shot.previousS, vx: shot.vx, vs: shot.vs }, launch) : { x: shot.previousX, s: shot.previousS };
        flash(at.x, -at.s, .42, .09, hostileFlashHex(state.planet), 1.25);
      }
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
      // Landed (a site's embers and fragments): it stays on the floor and skids to a stop.
      if (p.y < p.floor) { p.y = p.floor; p.vy = 0; p.drag = Math.max(p.drag, 9); }
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
  /** QA: the overlay quads' summed area this frame (world units², at the flight plane). */
  let overlayArea = 0;
  function overlay(state: RunState, plumes: readonly Plume[]) {
    let n = glow.live;
    overlayArea = 0;
    const params = glow.params.array as Float32Array, add = (matrix: THREE.Matrix4, r: number, g: number, b: number, alpha: number, shape: number) => {
      if (n >= glow.capacity) return;
      glow.mesh.setMatrixAt(n, matrix); glow.mesh.setColorAt(n, color.setRGB(r, g, b)); params[n * 2] = alpha; params[n * 2 + 1] = shape; n++;
    };
    for (const plume of plumes) {
      if (plume.round) {
        // A one-frame glow (e.g. a Needle's muzzle charging) facing the camera, `width` across.
        transform.position.set(plume.x, VIEW.flightHeight + .06, plume.z); transform.rotation.set(-ELEVATION, 0, 0); transform.scale.set(plume.width, plume.width, 1);
        transform.updateMatrix(); color.setHex(plume.hex).multiplyScalar(plume.energy); add(transform.matrix, color.r, color.g, color.b, 1, ROUND);
        overlayArea += plume.width * plume.width;
        continue;
      }
      // Lies in the flight plane; uv.y = 1 at the nozzle, fading toward the tail.
      transform.position.set(plume.x, VIEW.flightHeight + .02, plume.z + plume.length / 2);
      transform.rotation.set(-Math.PI / 2, 0, plume.length > 0 ? 0 : Math.PI); transform.scale.set(plume.width, Math.abs(plume.length), 1); transform.updateMatrix();
      color.setHex(plume.hex).multiplyScalar(plume.energy); add(transform.matrix, color.r, color.g, color.b, 1, PLUME);
      overlayArea += plume.width * Math.abs(plume.length);
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
    update(state: RunState, plumes: readonly Plume[], dust: readonly { x: number; y: number; z: number }[] = [], planetSurface: FxSurface | null = null,
      launches: (id: number) => Launch | undefined = () => undefined, heroGlow = 0x7ff6ea) {
      launchOf = launches;
      const shift = lastTime < 0 || state.time < lastTime || seed !== state.config.seed ? 0 : Math.max(0, state.distance - lastDistance); lastDistance = state.distance;
      // Move only existing particles; new effects already use this snapshot's world position.
      for (const layer of layers) for (let i = 0; i < layer.live; i++) layer.pool[i].z += shift * (layer === ground ? 1 : layer.pool[i].drift);
      const previous = lastTime, dt = lastTime < 0 || state.time < lastTime ? 0 : Math.min(.1, state.time - lastTime); lastTime = state.time;
      surface = planetSurface;
      spawn(state, heroGlow);
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
      for (const target of layers) { step(target, dt); write(target); }
      overlay(state, plumes);
      // Upload only the live particles (three.js re-sends a whole pool without an update range) and skip empty layers.
      for (const target of layers) liveInstances(target.mesh, target.mesh.count, target.uploads);
    },
    /**
     * A strike site was destroyed (src/render/site-view.ts, in this frame before `update`): its sequence is emitted in the next
     * update, at the world points given, and its core's kill explosion is left out (the sequence replaces it).
     */
    siteBlast(blast: SiteBlast) { if (pendingSites.length < 8) pendingSites.push(blast); },
    get particles() { return glow.live + smoke.live + wreckGlow.live + wreckSmoke.live; },
    /**
     * QA overdraw proxy (mobile performance pass, 3 November): each layer's live quads (overlay plumes included in `glow`),
     * summed area over the view's own area at the flight plane (VIEW.width × the tactical height): 1 is one full-screen
     * layer of transparent fill. Quads are counted whole (a soft particle's transparent corners still cost fill).
     */
    get coverage() {
      const view = VIEW.width * VIEW.width * 16 / 9, area = (target: typeof glow) => {
        let sum = 0;
        for (let i = 0; i < target.live; i++) { const p = target.pool[i]; if (p.age < 0) continue; const size = Math.max(.01, p.size + p.grow * Math.max(0, p.age / p.life)); sum += size * size * p.stretch; }
        return sum;
      };
      const round = (value: number) => Math.round(value / view * 1000) / 1000;
      return { glow: round(area(glow) + overlayArea), smoke: round(area(smoke)), ground: round(area(ground)), wreckGlow: round(area(wreckGlow)), wreckSmoke: round(area(wreckSmoke)) };
    },
    /** Live particles against each pool's capacity (QA and tests). */
    get pools() {
      return Object.fromEntries(([['glow', glow], ['smoke', smoke], ['ground', ground], ['wreckGlow', wreckGlow], ['wreckSmoke', wreckSmoke]] as const)
        .map(([name, target]) => [name, { live: target.live, capacity: target.capacity }])) as Record<'glow' | 'smoke' | 'ground' | 'wreckGlow' | 'wreckSmoke', { live: number; capacity: number }>;
    },
    dispose() {
      for (const target of layers) { scene.remove(target.mesh); target.mesh.dispose(); target.geometry.dispose(); target.material.dispose(); }
    },
  };
}
export type Fx = ReturnType<typeof createFx>;
