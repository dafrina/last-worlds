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
 */
const STREAKS = 120, MAX_HOLD = 4, PLANE_Y = VIEW.flightHeight - .45;
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
  let travel = 0, lastTime = -1, holdStart = -Infinity, lift = 1, wasJumping = false;

  return {
    /**
     * `ready`: the destination planet's look and assets are in (otherwise the veil holds after the flash).
     * Returns whether the jump overlay is drawing this frame.
     */
    update(state: RunState, reducedMotion: boolean, ready: boolean, linearBlend = false): boolean {
      const dt = lastTime < 0 || state.time < lastTime ? 0 : Math.min(.1, state.time - lastTime); lastTime = state.time;
      const jump = state.jump;
      let veilAmount = 0, flash = 0, intensity = 0;
      if (jump) {
        const q = THREE.MathUtils.clamp((state.time - jump.startedAt) / jump.duration, 0, 1);
        wasJumping = true; lift = 0;
        // Into deep space over the first third, out after the flash (or held while assets finish).
        const into = THREE.MathUtils.smoothstep(q, .06, .38), out = ready ? THREE.MathUtils.smoothstep(q, .62, 1) : 0;
        veilAmount = (reducedMotion ? .96 : .88) * into * (1 - out);
        if (!reducedMotion) {
          flash = Math.exp(-(((q - .5) / .045) ** 2)) * 1.2;
          intensity = Math.sin(Math.PI * q) * (1 - out * .7);
        }
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
      // Streaks travel with the hyperdrive speed (scroll), never with wall time; they stretch as it peaks.
      travel += dt * (.35 + state.scrollSpeed * .09);
      streakUniforms.travel.value = travel; streakUniforms.stretch.value = .6 + state.scrollSpeed * .28; streakUniforms.intensity.value = intensity;
      // The veil amount is perceptual; High blends in linear light, where the same darkening needs a denser veil.
      veilUniforms.veil.value = linearBlend ? 1 - Math.pow(1 - veilAmount, 2.2) : veilAmount; veilUniforms.flash.value = flash;
      const centre = (VIEW.minS + VIEW.maxS) / 2;
      veil.position.set(state.cameraX, PLANE_Y, -centre); streaks.position.set(state.cameraX, PLANE_Y + .02, 0);
      veil.visible = veilAmount > .002 || flash > .002; streaks.visible = intensity > .002;
      return veil.visible || streaks.visible;
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
