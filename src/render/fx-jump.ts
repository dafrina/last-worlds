import * as THREE from 'three';
import { VIEW, type RunState } from '../shared/contracts';

/**
 * Hyperdrive jump between planets (docs/18 §4), render-only and phone-cheap: two draws while active, none otherwise.
 *
 * - A veil plane just under the flight plane darkens the world to deep space; the hero, shots and markers stay on top.
 * - Star streaks on that plane race past, toward the bottom of the screen, fanning out from a point beyond the top
 *   (the ship flies up-screen); their length and speed follow the jump's speed profile. The camera never moves.
 * - A bright flash at the midpoint (the planet switch) blooms on High; the new planet then streams in as the veil lifts.
 * - Reduced motion: no streaks and no flash, only a slow fade to deep blue and back.
 * - If the next planet's assets are not ready at the flash, the veil holds (up to `MAX_HOLD`) instead of popping.
 * - A jump with no destination (the campaign's victory warp: `from === to`) never lifts back onto the level the
 *   ship left (user, 20 October): after the flash the veil deepens to opaque deep space and the streaks keep racing
 *   at cruise behind the results, on the wall clock once the frozen victory state stops advancing.
 * - The launch warp (user, 21 October: "use the warp animation instead [of the loading panel] and for endless it'll be
 *   just a longer warp"): while a flight's world is prepared the ship cruises through opaque deep space on the wall
 *   clock; on arrival a flash breaks out and the veil lifts onto the world over ARRIVE seconds.
 */
const STREAKS = 120, MAX_HOLD = 4, PLANE_Y = VIEW.flightHeight - .45;
/** Launch warp: seconds from arrival to the clear world, and to the flash's peak (when the flight starts). */
export const ARRIVE = .95, ARRIVE_FLASH = .14;
const VEIL_VERTEX = /* glsl */`void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const VEIL_FRAGMENT = /* glsl */`
uniform float veil; uniform float flash; uniform vec3 veilColor; uniform vec3 flashColor;
void main() { gl_FragColor = vec4( veilColor * veil + flashColor * flash, veil ); }`;
const STREAK_VERTEX = /* glsl */`
attribute vec4 aStreak; uniform float travel; uniform float stretch; uniform float span; varying float vFade; varying float vAlong;
void main() {
  // aStreak: x in −1..1, phase, speed factor, size factor. Streaks run from the far (top) end toward the near end.
  float cycle = fract( aStreak.y + travel * aStreak.z );
  float s = mix( ${(VIEW.maxS + 6).toFixed(1)}, ${(VIEW.minS - 3).toFixed(1)}, cycle );
  float spread = mix( .25, 1.0, cycle );
  float x = aStreak.x * span * spread;
  float len = stretch * ( .4 + .6 * aStreak.w ) * ( .3 + cycle );
  vec3 p = vec3( x + position.x * ( .025 + .02 * aStreak.w ), 0.0, -s + position.y * len );
  vAlong = position.y + .5; vFade = smoothstep( 0.0, .15, cycle ) * ( 1.0 - smoothstep( .85, 1.0, cycle ) ) * ( .45 + .55 * aStreak.w );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
}`;
const STREAK_FRAGMENT = /* glsl */`
uniform float intensity; uniform vec3 streakColor; varying float vFade; varying float vAlong;
void main() {
  float a = vFade * intensity * smoothstep( 0.0, .7, vAlong );
  if ( a < .004 ) discard;
  gl_FragColor = vec4( streakColor * a, a );
}`;

/** Deterministic cosmetic noise (never simulation RNG). */
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function createJumpFx(scene: THREE.Scene) {
  const veilUniforms = {
    veil: { value: 0 }, flash: { value: 0 },
    veilColor: { value: new THREE.Color().setHex(0x050a18, THREE.SRGBColorSpace) }, flashColor: { value: new THREE.Color(2.6, 2.7, 3.0) },
  };
  // Premultiplied blending: the veil darkens what is below, the flash adds light on top of it.
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(60, 80).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    vertexShader: VEIL_VERTEX, fragmentShader: VEIL_FRAGMENT, uniforms: veilUniforms, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  veil.frustumCulled = false; veil.renderOrder = 11; veil.visible = false; veil.name = 'jump veil';
  const streakUniforms = {
    travel: { value: 0 }, stretch: { value: 1 }, span: { value: 9 }, intensity: { value: 0 },
    streakColor: { value: new THREE.Color(1.5, 1.75, 2.2) },
  };
  const plane = new THREE.PlaneGeometry(1, 1), streakGeometry = new THREE.InstancedBufferGeometry();
  streakGeometry.setIndex(plane.getIndex()); streakGeometry.setAttribute('position', plane.getAttribute('position'));
  const params = new Float32Array(STREAKS * 4);
  for (let i = 0; i < STREAKS; i++) params.set([hash(i) * 2 - 1, hash(i + 31.7), .6 + hash(i + 7.3) * .9, hash(i + 13.1)], i * 4);
  streakGeometry.setAttribute('aStreak', new THREE.InstancedBufferAttribute(params, 4));
  streakGeometry.instanceCount = STREAKS;
  const streaks = new THREE.Mesh(streakGeometry, new THREE.ShaderMaterial({
    vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT, uniforms: streakUniforms, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  streaks.frustumCulled = false; streaks.renderOrder = 12; streaks.visible = false; streaks.name = 'jump streaks';
  scene.add(veil, streaks);
  let travel = 0, lastTime = -1, lastWall = -1, holdStart = -Infinity, lift = 1, wasJumping = false;
  /** The launch warp: off, cruising while the world is prepared, or arriving (since `launchAt`, wall seconds). */
  let launch: 'off' | 'cruise' | 'arrive' = 'off', launchAt = 0;

  return {
    /**
     * `ready`: the destination planet's look and assets are in (otherwise the veil holds after the flash).
     * Returns whether the jump overlay is drawing this frame.
     */
    update(state: RunState, reducedMotion: boolean, ready: boolean, linearBlend = false): boolean {
      let dt = lastTime < 0 || state.time < lastTime ? 0 : Math.min(.1, state.time - lastTime); lastTime = state.time;
      const wall = performance.now() / 1000, wallDt = lastWall < 0 ? 0 : Math.min(.1, wall - lastWall); lastWall = wall;
      const jump = state.jump, terminal = !!jump && jump.from === jump.to;
      let veilAmount = 0, flash = 0, intensity = 0, cruise = false;
      if (launch !== 'off' && !jump) {
        // The launch warp runs on the wall clock: the prepared run is still paused.
        const since = wall - launchAt;
        if (launch === 'arrive' && since >= ARRIVE) launch = 'off';
        else {
          const out = launch === 'arrive' ? THREE.MathUtils.smoothstep(since, ARRIVE_FLASH * .8, ARRIVE) : 0;
          veilAmount = 1 - out; cruise = true; dt = wallDt;
          if (!reducedMotion) {
            intensity = .9 * (1 - out);
            if (launch === 'arrive') flash = Math.exp(-(((since - ARRIVE_FLASH) / .07) ** 2)) * 1.2;
          }
        }
      }
      if (jump) {
        const q = THREE.MathUtils.clamp((state.time - jump.startedAt) / jump.duration, 0, 1);
        wasJumping = true; lift = 0;
        // Into deep space over the first third, out after the flash (or held while assets finish). A victory warp
        // has nowhere to land: it deepens to opaque space instead and keeps cruising.
        const into = THREE.MathUtils.smoothstep(q, .06, .38), out = terminal ? 0 : ready ? THREE.MathUtils.smoothstep(q, .62, 1) : 0;
        veilAmount = (reducedMotion ? .96 : .88) * into * (1 - out);
        if (terminal) veilAmount += (1 - veilAmount) * THREE.MathUtils.smoothstep(q, .5, .85);
        if (!reducedMotion) {
          flash = Math.exp(-(((q - .5) / .045) ** 2)) * 1.2;
          intensity = terminal ? (q < .5 ? Math.sin(Math.PI * q) : Math.max(.6, Math.sin(Math.PI * q))) : Math.sin(Math.PI * q) * (1 - out * .7);
        }
        if (terminal && dt === 0) dt = wallDt;
        if (!ready && q >= .62) holdStart = Math.min(holdStart === -Infinity ? state.time : holdStart, state.time);
      } else if (wasJumping) {
        // After the sim's jump ends: keep the veil until the new planet is ready (bounded), then lift it.
        if (!ready && holdStart > -Infinity && state.time - holdStart < MAX_HOLD) { veilAmount = reducedMotion ? .96 : .88; intensity = reducedMotion ? 0 : .35; }
        else {
          lift = Math.min(1, lift + dt / .6);
          veilAmount = (reducedMotion ? .96 : .88) * (1 - lift) * (holdStart > -Infinity ? 1 : 0);
          if (lift >= 1) { wasJumping = false; holdStart = -Infinity; }
        }
      }
      // Streaks travel with the hyperdrive speed (scroll), never with wall time; they stretch as it peaks. (The launch warp
      // cruises at a fixed hyperdrive speed.)
      const speed = cruise ? 9 : state.scrollSpeed;
      travel += dt * (.35 + speed * .09);
      streakUniforms.travel.value = travel; streakUniforms.stretch.value = .6 + speed * .28; streakUniforms.intensity.value = intensity;
      // The veil amount is perceptual; High blends in linear light, where the same darkening needs a denser veil.
      veilUniforms.veil.value = linearBlend ? 1 - Math.pow(1 - veilAmount, 2.2) : veilAmount; veilUniforms.flash.value = flash;
      const centre = (VIEW.minS + VIEW.maxS) / 2;
      veil.position.set(state.cameraX, PLANE_Y, -centre); streaks.position.set(state.cameraX, PLANE_Y + .02, 0);
      veil.visible = veilAmount > .002 || flash > .002; streaks.visible = intensity > .002;
      return veil.visible || streaks.visible;
    },
    /**
     * The launch warp: 'cruise' while a flight's world is prepared, 'arrive' to break out (returns ARRIVE_FLASH, the delay
     * to the flash, when the flight should start), 'off' to drop it (a cancelled launch).
     */
    launch(mode: 'cruise' | 'arrive' | 'off'): number {
      if (mode === 'arrive' && launch === 'off') return 0;
      launch = mode; launchAt = performance.now() / 1000;
      return mode === 'arrive' ? ARRIVE_FLASH : 0;
    },
    /** Hidden meshes the renderer's warm-up compile should include (no shader compile on the first jump). */
    get objects(): THREE.Object3D[] { return [veil, streaks]; },
    dispose() {
      scene.remove(veil, streaks); veil.geometry.dispose(); (veil.material as THREE.Material).dispose();
      streakGeometry.dispose(); (streaks.material as THREE.Material).dispose();
    },
  };
}
export type JumpFx = ReturnType<typeof createJumpFx>;
