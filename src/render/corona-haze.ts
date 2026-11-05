import * as THREE from 'three';

/**
 * Corona's smoke over the plasma (docs/37; user, 5 November 2026: "realistically the lava needs some kind of misty partial
 * fog or something it looks too clean"): two thin layers just over the sea, render-only.
 *
 * - A low layer of dark smoke in drifting patches (partial: open plasma shows between them) and, a little higher, a
 *   glowing orange mist lit from below. Both ride the terrain frame and drift slowly on their own, so the patches pass
 *   with the ground and churn as they go.
 * - Under the rock: the layers stand at sea + 0.4 and sea + 1.35, below the lowest island tier (1.5 over the sea), so they
 *   veil only the plasma and the cliff feet; the rock and everything over it draw in front.
 * - Phone-cheap: two planes over the view, each two lookups of one small tiling noise texture (built once, no
 *   Math.random), no depth writes. Uses no simulation state.
 */
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
uniform sampler2D hazeNoise; uniform float hazeTime; uniform vec3 hazeColor; uniform float hazeAlpha; uniform float hazeScale;
uniform vec2 hazeDrift; uniform float hazeLow; uniform float hazeHigh; uniform float hazeChannel;
varying vec2 vGround;
void main() {
  vec2 p = vGround * hazeScale + hazeDrift * hazeTime;
  vec2 warp = texture2D( hazeNoise, p * 0.37 + vec2( 0.31, 0.77 ) ).rg - 0.5;
  vec4 a = texture2D( hazeNoise, p + warp * 0.35 ), b = texture2D( hazeNoise, p * 2.3 - hazeDrift * hazeTime * 1.7 + 0.5 );
  float n = mix( a.r, a.g, hazeChannel ) * 0.7 + mix( b.g, b.r, hazeChannel ) * 0.3;
  float cover = smoothstep( hazeLow, hazeHigh, n );
  if ( cover <= 0.003 ) discard;
  gl_FragColor = vec4( hazeColor, cover * hazeAlpha );
}`;

export function createCoronaHaze(scene: THREE.Scene) {
  const texture = noiseTexture(), group = new THREE.Group(); group.name = 'Corona haze'; group.visible = false; scene.add(group);
  const shared = { hazeNoise: { value: texture }, hazeTime: { value: 0 }, hazeDistance: { value: 0 } };
  const layer = (height: number, color: number, alpha: number, scale: number, drift: [number, number], low: number, high: number, channel: number, order: number) => {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
      uniforms: { ...shared, hazeColor: { value: new THREE.Color().setHex(color, THREE.SRGBColorSpace) }, hazeAlpha: { value: alpha },
        hazeScale: { value: scale }, hazeDrift: { value: new THREE.Vector2(...drift) }, hazeLow: { value: low }, hazeHigh: { value: high }, hazeChannel: { value: channel } },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH).rotateX(-Math.PI / 2), material);
    mesh.position.y = height; mesh.renderOrder = order; mesh.frustumCulled = false; group.add(mesh);
    return mesh;
  };
  let layers: THREE.Mesh[] = [];
  return {
    /** `active`: Corona under the camera. `centerZ`: world z of the view's middle. `sea`: the plasma's level. */
    update(time: number, distance: number, centerZ: number, active: boolean, sea: number) {
      group.visible = active;
      if (!active) return;
      if (!layers.length) layers = [
        // Dark smoke drifting in patches low over the plasma.
        layer(sea + .4, 0x1c100b, .85, .05, [.006, -.004], .36, .66, 0, 1),
        // Glowing mist a little higher, lit by the plasma under it, thinner and broader.
        layer(sea + 1.35, 0xc8582a, .38, .032, [-.004, -.0025], .34, .72, 1, 1),
      ];
      shared.hazeTime.value = time; shared.hazeDistance.value = distance;
      for (const mesh of layers) mesh.position.z = centerZ;
    },
    dispose() {
      for (const mesh of layers) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
      texture.dispose(); scene.remove(group);
    },
  };
}
