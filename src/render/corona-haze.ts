import * as THREE from 'three';

/**
 * Corona's smoke over the plasma (docs/37; user, 5 November 2026: "realistically the lava needs some kind of misty partial
 * fog or something it looks too clean", then "the smoke above lava looks like its everywhere, like a plane ... mask it a
 * bit as if we faking volumetric clouds"): banks of smoke, render-only.
 *
 * - Banks, not a sheet: a broad coverage field gathers the smoke into separate banks with open plasma between them.
 * - Faked volume: SLICES stacked planes sample one density field; each higher slice shows only the denser core (its
 *   threshold rises), so a bank domes up and its slices slide over each other as the ground passes (real parallax).
 *   Thick at the cores (user: "You can make them really thick at points"): dark and warm low down, a lit grey on top. The plasma is far brighter than white (HDR), so a
 *   half-clear slice over it hardly shows: a bank's core is all its slices stacked, nearly opaque; its rim one or two.
 * - Under the rock: every slice stays under the lowest island tier (1.8 over the sea), so the banks veil the plasma and
 *   the cliff feet, never the land.
 * - Phone-cheap: one small tiling noise texture (built once, no Math.random), a few lookups per slice, no depth writes,
 *   discarded outside the banks. Coverage measured on the texture: about a third of the plasma under some smoke, about
 *   7% under every slice (thick). Uses no simulation state.
 */
const SLICES = 6, BOTTOM = .2, SPACING = .28;
const SIZE = 128, WIDTH = 64, DEPTH = 96;

/** Tileable fractal value noise, 0 … 1, SIZE² (a fixed integer hash: identical every run). */
function noiseTexture(): THREE.DataTexture {
  const hash = (x: number, y: number, o: number) => {
    let h = Math.imul((x & 1023) + o * 7919, 0x27d4eb2d) ^ Math.imul((y & 1023) + 0x165667b1, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  const value = (x: number, y: number, period: number, o: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const h = (i: number, j: number) => hash(((x0 + i) % period + period) % period, ((y0 + j) % period + period) % period, o);
    return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
  };
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let sum = 0, amp = .5, norm = 0;
    for (let k = 0, cells = 4; k < 4; k++, cells *= 2, amp *= .5) { sum += value(x / SIZE * cells, y / SIZE * cells, cells, k) * amp; norm += amp; }
    const n = sum / norm, i = (y * SIZE + x) * 4;
    // R: the fractal; G: the same shifted half a tile (a second, uncorrelated-looking field for the other layer).
    data[i] = Math.round(n * 255);
    data[i + 3] = 255;
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) data[(y * SIZE + x) * 4 + 1] = data[(((y + SIZE / 2) % SIZE) * SIZE + (x + SIZE / 3 | 0) % SIZE) * 4];
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

const VERTEX = /* glsl */`
varying vec2 vGround;
uniform float hazeDistance;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vGround = vec2( world.x, hazeDistance - world.z );   // terrain frame: x, run distance s
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const FRAGMENT = /* glsl */`
uniform sampler2D hazeNoise; uniform float hazeTime; uniform float hazeLevel; uniform vec3 hazeColor; uniform float hazeAlpha;
varying vec2 vGround;
void main() {
  // One density field for every slice: broad banks (coverage) carved by billowing detail, drifting and churning slowly.
  vec2 p = vGround * 0.045 + vec2( 0.006, -0.004 ) * hazeTime;
  float cover = smoothstep( 0.44, 0.62, texture2D( hazeNoise, vGround * 0.028 + vec2( 0.003, 0.002 ) * hazeTime + 0.37 ).g );
  if ( cover <= 0.0 ) discard;
  vec2 warp = texture2D( hazeNoise, p * 0.5 + 0.71 ).rg - 0.5;
  float detail = texture2D( hazeNoise, p + warp * 0.4 ).r * 0.65 + texture2D( hazeNoise, p * 2.4 - vec2( 0.01, 0.006 ) * hazeTime + 0.5 ).g * 0.35;
  float density = cover * smoothstep( 0.4, 0.58, detail );
  // Higher slices need denser smoke: the bank's top is its dense core, domed.
  float threshold = 0.04 + hazeLevel * 0.55;
  float a = smoothstep( threshold, threshold + 0.1, density );
  if ( a <= 0.003 ) discard;
  gl_FragColor = vec4( hazeColor, a * hazeAlpha );
}`;

export function createCoronaHaze(scene: THREE.Scene) {
  const texture = noiseTexture(), group = new THREE.Group(); group.name = 'Corona haze'; group.visible = false; scene.add(group);
  const shared = { hazeNoise: { value: texture }, hazeTime: { value: 0 }, hazeDistance: { value: 0 } };
  const glow = new THREE.Color().setHex(0x5a2814, THREE.SRGBColorSpace), smoke = new THREE.Color().setHex(0x7a726c, THREE.SRGBColorSpace);
  const geometry = new THREE.PlaneGeometry(WIDTH, DEPTH).rotateX(-Math.PI / 2);
  let slices: THREE.Mesh[] = [];
  const build = (sea: number) => Array.from({ length: SLICES }, (_, i) => {
    const level = i / (SLICES - 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
      uniforms: { ...shared, hazeLevel: { value: level }, hazeColor: { value: glow.clone().lerp(smoke, level) }, hazeAlpha: { value: .66 } },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = sea + BOTTOM + i * SPACING; mesh.renderOrder = 1; mesh.frustumCulled = false; group.add(mesh);
    return mesh;
  });
  return {
    /** `active`: Corona under the camera. `centerZ`: world z of the view's middle. `sea`: the plasma's level. */
    update(time: number, distance: number, centerZ: number, active: boolean, sea: number) {
      group.visible = active;
      if (!active) return;
      if (!slices.length) slices = build(sea);
      shared.hazeTime.value = time; shared.hazeDistance.value = distance;
      for (const mesh of slices) mesh.position.z = centerZ;
    },
    dispose() {
      for (const mesh of slices) (mesh.material as THREE.Material).dispose();
      geometry.dispose(); texture.dispose(); scene.remove(group);
    },
  };
}
