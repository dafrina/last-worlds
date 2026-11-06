import * as THREE from 'three';
import type { PlanetId } from '../shared/contracts';
import { VIEW } from '../shared/contracts';

/**
 * Drifting particles over each world (user, 6 November 2026: "drifting particles would be great. Dust on khepri, snow on
 * vesper etc. Except moon"): render-only, no simulation state.
 *
 * - One draw: a fixed cloud of points whose motion is all in the vertex shader (wind, fall or rise, sway); the CPU only
 *   sets a few uniforms a frame. Each point lives in the terrain frame (it scrolls with the ground, plus its wind), so at
 *   its own height it slides past at its own parallax; the cloud wraps around the camera, wider and deeper than the view,
 *   so points never pop in sight.
 * - Below the flight plane (`top` under VIEW.flightHeight), small and faint, so nothing reads as a shot. Depth-tested: the
 *   ground and models hide the points under them.
 * - Sparse (user: "Doesnt need all that much tbh"): 90-220 a world. Built once from a fixed integer hash (no Math.random);
 *   Low graphics draws half of them.
 */
interface Motes {
  count: number; color: number; /** Radiance (over 1 blooms under additive blending). */ energy: number; opacity: number;
  /** World size of a point. */ size: number; additive: boolean;
  /** Height band (world y). */ bottom: number; top: number;
  /** Drift per second: across (x), along the run (s; positive drifts ahead, against the scroll), up (y; negative falls). */
  wind: [number, number, number];
  /** Sway amplitude (world units) and rate. */ sway: number; swayRate: number;
  /** 0 steady … 1 flickering. */ twinkle: number;
}

const TOP = VIEW.flightHeight - .55;
const MOTES: Partial<Record<PlanetId, Motes>> = {
  // Khepri: fine sand dust on the desert wind, blowing across the dunes.
  khepri: { count: 200, color: 0xecd2ae, energy: 1, opacity: .45, size: .12, additive: false, bottom: -1.5, top: TOP, wind: [1.6, -.4, .05], sway: .25, swayRate: .9, twinkle: 0 },
  // Vesper: snow, falling and drifting with the wind.
  vesper: { count: 220, color: 0xf6f9ff, energy: 1, opacity: .9, size: .19, additive: false, bottom: -3, top: TOP, wind: [.55, .3, -.9], sway: .35, swayRate: 1.3, twinkle: 0 },
  // Nacre: glowing plankton over the mire, slow and blinking.
  nacre: { count: 90, color: 0x7fe6ff, energy: 2.2, opacity: .8, size: .13, additive: true, bottom: -1.2, top: TOP, wind: [.12, .1, .08], sway: .3, swayRate: .5, twinkle: .8 },
  // Amnion: spores rising out of the canyons in the warm air.
  amnion: { count: 120, color: 0xf3dcb4, energy: 1.1, opacity: .55, size: .16, additive: false, bottom: -3.5, top: TOP, wind: [.2, .15, .35], sway: .3, swayRate: .6, twinkle: 0 },
  // Corona: embers rising off the plasma, flickering.
  corona: { count: 140, color: 0xff8a30, energy: 2.6, opacity: .9, size: .11, additive: true, bottom: -6.4, top: TOP, wind: [.35, .5, 1.1], sway: .2, swayRate: 1.6, twinkle: .6 },
  // Umbra: faint violet ash in the eclipse.
  umbra: { count: 90, color: 0xb4a2ff, energy: 1.4, opacity: .6, size: .12, additive: true, bottom: -2.5, top: TOP, wind: [.25, -.15, -.12], sway: .3, swayRate: .5, twinkle: .4 },
};
/** The wrapped volume around the camera: wider and deeper than the view footprint (the far edge sits well past maxS). */
const WIDTH = 34, BEHIND = 9, AHEAD = 34;
const MAX = Math.max(...Object.values(MOTES).map(m => m!.count));

const VERTEX = /* glsl */`
attribute vec4 seed;
uniform float motesTime; uniform float motesDistance; uniform float motesCameraX; uniform float motesScale;
uniform vec3 motesWind; uniform vec2 motesBand; uniform vec2 motesSway; uniform float motesSize; uniform float motesTwinkle;
varying float vAlpha;
void main() {
  float t = motesTime;
  // Terrain frame (x, run distance s), drifting with the wind; then wrapped around the camera.
  float x = seed.x * ${WIDTH.toFixed(1)} + motesWind.x * t + sin( t * motesSway.y + seed.w * 6.283 ) * motesSway.x;
  float sWorld = seed.z * ${(BEHIND + AHEAD).toFixed(1)} + motesWind.y * t;
  float sView = mod( sWorld - motesDistance + ${BEHIND.toFixed(1)}, ${(BEHIND + AHEAD).toFixed(1)} ) - ${BEHIND.toFixed(1)};
  x = mod( x - motesCameraX + ${(WIDTH / 2).toFixed(1)}, ${WIDTH.toFixed(1)} ) + motesCameraX - ${(WIDTH / 2).toFixed(1)};
  float band = motesBand.y - motesBand.x;
  float y = motesBand.x + mod( seed.y * band + motesWind.z * t + cos( t * motesSway.y * 0.7 + seed.w * 4.1 ) * motesSway.x * 0.5, band );
  vec4 view = viewMatrix * vec4( x, y, -sView, 1.0 );
  gl_Position = projectionMatrix * view;
  gl_PointSize = max( 1.0, motesSize * ( 0.6 + 0.8 * fract( seed.w * 7.13 ) ) * motesScale / -view.z );
  // Fade in and out at the band's ends (no pop where a point wraps vertically), and flicker.
  float edge = smoothstep( 0.0, 0.12, ( y - motesBand.x ) / band ) * smoothstep( 1.0, 0.85, ( y - motesBand.x ) / band );
  float flicker = 1.0 - motesTwinkle * ( 0.5 + 0.5 * sin( t * ( 2.0 + 5.0 * seed.w ) + seed.x * 40.0 ) );
  vAlpha = edge * flicker;
}`;
const FRAGMENT = /* glsl */`
uniform vec3 motesColor; uniform float motesOpacity;
varying float vAlpha;
void main() {
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  float a = ( 1.0 - smoothstep( 0.35, 1.0, d ) ) * vAlpha * motesOpacity;
  if ( a <= 0.004 ) discard;
  gl_FragColor = vec4( motesColor, a );
}`;

/** A fixed integer hash in 0 … 1 (identical every run). */
const hash = (i: number, k: number) => {
  let h = Math.imul(i + 0x9e37 * k, 0x27d4eb2d) ^ Math.imul(k + 0x1656, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

export function createAmbientMotes(scene: THREE.Scene) {
  const seeds = new Float32Array(MAX * 4);
  for (let i = 0; i < MAX; i++) for (let k = 0; k < 4; k++) seeds[i * 4 + k] = hash(i, k + 1);
  const geometry = new THREE.BufferGeometry();
  // three needs a position attribute to draw; the shader places every point from its seed.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    motesTime: { value: 0 }, motesDistance: { value: 0 }, motesCameraX: { value: 0 }, motesScale: { value: 1 },
    motesWind: { value: new THREE.Vector3() }, motesBand: { value: new THREE.Vector2() }, motesSway: { value: new THREE.Vector2() },
    motesSize: { value: .05 }, motesTwinkle: { value: 0 }, motesColor: { value: new THREE.Color() }, motesOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, transparent: true, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.name = 'Ambient motes'; points.frustumCulled = false; points.renderOrder = 2; points.visible = false;
  scene.add(points);
  let current: PlanetId | null = null, low = false;

  const apply = (planet: PlanetId) => {
    const motes = MOTES[planet]; current = planet;
    if (!motes) return;
    uniforms.motesWind.value.set(...motes.wind); uniforms.motesBand.value.set(motes.bottom, motes.top);
    uniforms.motesSway.value.set(motes.sway, motes.swayRate); uniforms.motesSize.value = motes.size; uniforms.motesTwinkle.value = motes.twinkle;
    uniforms.motesColor.value.setHex(motes.color, THREE.SRGBColorSpace).multiplyScalar(motes.energy); uniforms.motesOpacity.value = motes.opacity;
    material.blending = motes.additive ? THREE.AdditiveBlending : THREE.NormalBlending; material.needsUpdate = true;
  };

  return {
    /** `planet`: the world under the camera. `pixelHeight`: the drawing buffer's height (point sizes follow it). */
    update(planet: PlanetId, time: number, distance: number, camera: THREE.PerspectiveCamera, pixelHeight: number) {
      if (planet !== current) apply(planet);
      const motes = MOTES[planet];
      points.visible = !!motes;
      if (!motes) return;
      geometry.setDrawRange(0, low ? motes.count >> 1 : motes.count);
      uniforms.motesTime.value = time; uniforms.motesDistance.value = distance; uniforms.motesCameraX.value = camera.position.x;
      uniforms.motesScale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    setQuality(quality: 'high' | 'low') { low = quality === 'low'; },
    dispose() { scene.remove(points); geometry.dispose(); material.dispose(); },
  };
}
