import * as THREE from 'three';

/**
 * Nahara's moving sand (user, 14 November: "nahara still feels very empty"; the questionnaire: "moving sand", drifting
 * sand streams and dust devils crossing the ground). Render only: nothing here is simulated, and nothing reaches the
 * flight plane, so no streak or grain reads as a shot.
 *
 * - Sand streams: long, faint ribbons of blown sand gliding across the ground with the wind, each draped over the terrain
 *   under it (its heights sampled once, when it starts, along the whole path it will travel), its grain scrolling along
 *   it faster than the ribbon itself moves. Over a drop (the canyon) a ribbon thins out and is gone: the sand blows off
 *   the rim. One draw for all of them.
 * - Dust devils: now and then a small whirl of sand drifting with the wind, one draw of points.
 * - Everything is placed from a fixed integer hash of its slot and generation (no Math.random), in the terrain frame
 *   (it scrolls with the ground) round the camera. Low graphics keeps half the streams and no dust devils.
 */
const WIND = { x: 1.9, s: -0.35 } as const;
/** Ribbons: count (high), segments along each, length and width ranges, lift over the ground, life range (seconds). */
const STREAM = { count: 36, segments: 10, length: [3.2, 6.5], width: [0.35, 0.8], lift: 0.1, life: [3.5, 6.5], opacity: 0.5 } as const;
/** Where they start, about the camera (x) and the view (s from the camera's ground distance). */
const AREA = { halfX: 13, nearS: -4, farS: 26 } as const;
/**
 * The open ground's lowest level (the hills' valleys reach about -5; the canyon floor is -8.5): no stream starts under it,
 * and one fades out before it gets there, so none hangs in the canyon, where a pale line in the lane could read as a shot.
 */
const GROUND_FLOOR = -5.2;
/** Height samples along a ribbon's path, this far apart. */
const SAMPLE = 0.6;
/** Dust devils: points per devil, at most this many at once, its height, life, the pause between them. */
const DEVIL = { points: 90, count: 2, height: 2.6, life: 6, rest: [5, 11] } as const;

const hash = (i: number, k: number) => {
  let h = Math.imul(i + 0x632b * k, 0x2c1b3c6d) ^ Math.imul(k + 0x41c6, 0x297a2d39);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
const range = (r: readonly [number, number], t: number) => r[0] + (r[1] - r[0]) * t;

const STREAM_VERTEX = /* glsl */`
attribute vec3 grain; // u along the ribbon, v across it, the ribbon's own alpha
uniform float sandTime;
varying vec3 vGrain;
void main() {
  vGrain = grain;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
const STREAM_FRAGMENT = /* glsl */`
uniform float sandTime; uniform vec3 sandColor; uniform float sandOpacity;
varying vec3 vGrain;
float n1( float x ) { float i = floor( x ), f = fract( x ); float a = fract( sin( i * 91.7 ) * 43758.5 ), b = fract( sin( ( i + 1.0 ) * 91.7 ) * 43758.5 ); return mix( a, b, f * f * ( 3.0 - 2.0 * f ) ); }
void main() {
  float u = vGrain.x, v = vGrain.y;
  // Tapered at both ends, soft across; streaky grain flowing along the ribbon.
  float taper = smoothstep( 0.0, 0.3, u ) * smoothstep( 1.0, 0.55, u );
  float across = 1.0 - pow( abs( v * 2.0 - 1.0 ), 1.6 );
  float lanes = n1( v * 9.0 + 3.1 ) * 0.6 + 0.4;
  float flow = n1( u * 14.0 - sandTime * 5.0 + v * 3.0 ) * 0.7 + 0.3;
  float a = taper * across * lanes * flow * vGrain.z * sandOpacity;
  if ( a <= 0.004 ) discard;
  gl_FragColor = vec4( sandColor, a );
}`;
const DEVIL_VERTEX = /* glsl */`
attribute vec4 seed; // height share, phase, radius jitter, size jitter
uniform vec4 devils[${DEVIL.count}]; // x, ground y, view s, life share (0 … 1; < 0 off)
uniform float sandTime; uniform float sandScale;
varying float vAlpha;
void main() {
  int k = int( floor( seed.w * ${DEVIL.count}.0 ) );
  vec4 d = devils[0];
  ${Array.from({ length: DEVIL.count - 1 }, (_, i) => `if ( k == ${i + 1} ) d = devils[${i + 1}];`).join(' ')}
  float h = seed.x, life = d.w;
  float r = ( 0.12 + 0.85 * pow( h, 1.4 ) ) * ( 0.8 + 0.4 * seed.z );
  float turn = sandTime * ( 5.0 - 2.5 * h ) + seed.y * 6.2832;
  // The column leans with the wind as it climbs.
  vec3 p = vec3( d.x + cos( turn ) * r + h * 0.5, d.y + h * ${DEVIL.height.toFixed(1)}, -d.z + sin( turn ) * r * 0.8 );
  vec4 view = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * view;
  gl_PointSize = max( 1.0, ( 0.12 + 0.14 * fract( seed.x * 13.7 ) ) * sandScale / -view.z );
  float fade = smoothstep( 0.0, 0.2, life ) * smoothstep( 1.0, 0.75, life );
  vAlpha = life < 0.0 ? 0.0 : fade * ( 1.0 - h * 0.65 );
}`;
const DEVIL_FRAGMENT = /* glsl */`
uniform vec3 sandColor;
varying float vAlpha;
void main() {
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  float a = ( 1.0 - smoothstep( 0.3, 1.0, d ) ) * vAlpha * 0.7;
  if ( a <= 0.004 ) discard;
  gl_FragColor = vec4( sandColor, a );
}`;

interface Ribbon { start: number; life: number; x: number; s: number; length: number; width: number; heights: Float32Array; from: number; spawnGround: number; generation: number }

export function createSandStreams(scene: THREE.Scene) {
  const SEG = STREAM.segments, perRibbon = (SEG + 1) * 2;
  const positions = new Float32Array(STREAM.count * perRibbon * 3), grain = new Float32Array(STREAM.count * perRibbon * 3);
  const indices: number[] = [];
  for (let r = 0; r < STREAM.count; r++) for (let k = 0; k < SEG; k++) {
    const a = r * perRibbon + k * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const grainAttribute = new THREE.BufferAttribute(grain, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute); geometry.setAttribute('grain', grainAttribute); geometry.setIndex(indices);
  const uniforms = { sandTime: { value: 0 }, sandColor: { value: new THREE.Color().setHex(0xfff0d4, THREE.SRGBColorSpace) }, sandOpacity: { value: STREAM.opacity } };
  const material = new THREE.ShaderMaterial({ vertexShader: STREAM_VERTEX, fragmentShader: STREAM_FRAGMENT, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Nahara sand streams'; mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);

  const seeds = new Float32Array(DEVIL.points * DEVIL.count * 4);
  for (let i = 0; i < DEVIL.points * DEVIL.count; i++) {
    seeds[i * 4] = hash(i, 1); seeds[i * 4 + 1] = hash(i, 2); seeds[i * 4 + 2] = hash(i, 3);
    seeds[i * 4 + 3] = (Math.floor(i / DEVIL.points) + 0.5) / DEVIL.count;
  }
  const devilGeometry = new THREE.BufferGeometry();
  devilGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEVIL.points * DEVIL.count * 3), 3));
  devilGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const devilUniforms = {
    devils: { value: Array.from({ length: DEVIL.count }, () => new THREE.Vector4(0, 0, 0, -1)) },
    sandTime: uniforms.sandTime, sandScale: { value: 1 }, sandColor: { value: new THREE.Color().setHex(0xfff2da, THREE.SRGBColorSpace) },
  };
  const devilMaterial = new THREE.ShaderMaterial({ vertexShader: DEVIL_VERTEX, fragmentShader: DEVIL_FRAGMENT, uniforms: devilUniforms, transparent: true, depthWrite: false });
  const devilPoints = new THREE.Points(devilGeometry, devilMaterial);
  devilPoints.name = 'Nahara dust devils'; devilPoints.frustumCulled = false; devilPoints.renderOrder = 2; devilPoints.visible = false;
  scene.add(devilPoints);

  const ribbons: (Ribbon | null)[] = Array.from({ length: STREAM.count }, () => null);
  const devils: { start: number; x: number; s: number; next: number; generation: number }[] = Array.from({ length: DEVIL.count }, (_, k) => ({ start: -Infinity, x: 0, s: 0, next: 1.5 + k * 4, generation: 0 }));
  let lastTime = -1, low = false;

  const spawn = (slot: number, time: number, distance: number, cameraX: number, ground: (x: number, s: number) => number, generation: number, first: boolean): Ribbon => {
    const h = (k: number) => hash(slot * 977 + generation, k);
    const life = range(STREAM.life, h(1)), length = range(STREAM.length, h(2)), width = range(STREAM.width, h(3));
    // The first round starts part-way through its lives, so the sand is already moving when the world comes up.
    const start = first ? time - h(4) * life : time;
    const x = cameraX - AREA.halfX + h(5) * AREA.halfX * 2 - WIND.x * life * 0.4, s = distance + AREA.nearS + h(6) * (AREA.farS - AREA.nearS);
    // Heights along its whole path: from its tail at the start to its head at the end of its life.
    const travel = Math.hypot(WIND.x, WIND.s) * life + length, count = Math.ceil(travel / SAMPLE) + 2;
    const here = ground(x, s);
    // Over the canyon: no stream this round (it stays empty until its next generation).
    if (here < GROUND_FLOOR + 0.6) return { start, life, x, s, length, width, heights: new Float32Array(2).fill(here), from: -length, spawnGround: Infinity, generation };
    const heights = new Float32Array(count), ux = WIND.x / Math.hypot(WIND.x, WIND.s), us = WIND.s / Math.hypot(WIND.x, WIND.s);
    for (let k = 0; k < count; k++) heights[k] = ground(x - ux * length + ux * k * SAMPLE, s - us * length + us * k * SAMPLE);
    return { start, life, x, s, length, width, heights, from: -length, spawnGround: here, generation };
  };

  return {
    /** `active`: Nahara is under the camera. `ground`: the terrain height at (x, world distance s). */
    update(active: boolean, time: number, distance: number, camera: THREE.PerspectiveCamera, ground: (x: number, s: number) => number, pixelHeight: number) {
      mesh.visible = active; devilPoints.visible = active && !low;
      if (!active) { lastTime = -1; ribbons.fill(null); return; }
      // A new run (the clock went back) or a jump in it (a skipped stretch): start afresh, the sand already moving.
      const first = lastTime < 0 || time < lastTime || time - lastTime > 1;
      if (first) { ribbons.fill(null); devils.forEach((d, k) => { d.start = -Infinity; d.next = time + 1.5 + k * 4; }); }
      lastTime = time;
      uniforms.sandTime.value = time;
      const cameraX = camera.position.x, ux = WIND.x / Math.hypot(WIND.x, WIND.s), us = WIND.s / Math.hypot(WIND.x, WIND.s), vx = -us, vs = ux;
      const live = low ? STREAM.count >> 1 : STREAM.count;
      for (let r = 0; r < STREAM.count; r++) {
        let ribbon = ribbons[r];
        if (r < live && (!ribbon || time - ribbon.start >= ribbon.life)) ribbon = ribbons[r] = spawn(r, time, distance, cameraX, ground, (ribbon?.generation ?? -1) + 1, !ribbon);
        const base = r * perRibbon;
        if (r >= live || !ribbon) { for (let k = 0; k < perRibbon; k++) grain[(base + k) * 3 + 2] = 0; continue; }
        const age = time - ribbon.start, share = age / ribbon.life;
        const fade = THREE.MathUtils.smoothstep(share, 0, 0.18) * (1 - THREE.MathUtils.smoothstep(share, 0.75, 1));
        // The head's distance along its path from where its tail began.
        const head = ribbon.length + age * Math.hypot(WIND.x, WIND.s);
        for (let k = 0; k <= SEG; k++) {
          const u = k / SEG, along = head - ribbon.length * (1 - u);
          // A slow meander across the wind.
          const sway = Math.sin(along * 0.9 + r * 1.7 + time * 0.6) * 0.25;
          const cx = ribbon.x - ux * ribbon.length + ux * along + vx * sway, cs = ribbon.s - us * ribbon.length + us * along + vs * sway;
          const f = along / SAMPLE, i0 = Math.min(ribbon.heights.length - 2, Math.max(0, Math.floor(f)));
          const y = THREE.MathUtils.lerp(ribbon.heights[i0], ribbon.heights[i0 + 1], Math.min(1, Math.max(0, f - i0)));
          // Blown off a rim: gone where the ground falls away under it.
          const rim = (1 - THREE.MathUtils.smoothstep(ribbon.spawnGround - y, 0.4, 1.3)) * THREE.MathUtils.smoothstep(y, GROUND_FLOOR, GROUND_FLOOR + 0.8);
          const w = ribbon.width * (0.6 + 0.4 * Math.sin(u * Math.PI));
          for (let side = 0; side < 2; side++) {
            const v = base + k * 2 + side, o = (side - 0.5) * w;
            positions[v * 3] = cx + vx * o; positions[v * 3 + 1] = y + STREAM.lift; positions[v * 3 + 2] = -(cs + vs * o - distance);
            grain[v * 3] = u; grain[v * 3 + 1] = side; grain[v * 3 + 2] = fade * rim;
          }
        }
      }
      positionAttribute.needsUpdate = true; grainAttribute.needsUpdate = true;
      // Dust devils: each rests, then whirls for its life, drifting with the wind.
      devilUniforms.sandScale.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      devils.forEach((d, k) => {
        const slot = devilUniforms.devils.value[k];
        if (time >= d.next && time - d.start >= DEVIL.life) {
          d.generation++;
          const h = (n: number) => hash(9000 + k * 131 + d.generation, n);
          d.start = time; d.x = cameraX - 9 + h(1) * 18; d.s = distance + 2 + h(2) * 16;
          // Only on the open ground: over the canyon it skips this turn.
          if (ground(d.x, d.s) < GROUND_FLOOR + 0.6) d.start = -Infinity;
          d.next = time + DEVIL.life + range(DEVIL.rest, h(3));
        }
        const age = time - d.start;
        if (low || age < 0 || age >= DEVIL.life) { slot.set(0, 0, 0, -1); return; }
        const x = d.x + WIND.x * 0.6 * age, s = d.s + WIND.s * 0.6 * age;
        const y = ground(x, s);
        // (Drifted over the canyon: gone.)
        slot.set(x, y, s - distance, y < GROUND_FLOOR ? -1 : age / DEVIL.life);
      });
    },
    setQuality(quality: 'high' | 'low') { low = quality === 'low'; },
    dispose() { scene.remove(mesh, devilPoints); geometry.dispose(); material.dispose(); devilGeometry.dispose(); devilMaterial.dispose(); },
  };
}
