import * as THREE from 'three';

/**
 * Nacre's mire water (docs/20), its own material beside Vesper's ocean (src/render/water.ts, unchanged): the same opaque
 * sheets, the same palette and terms as the mire branch it replaces (indigo water, violet algae streaks and drifting
 * clouds, a faint mottled sheen, darker water and a dark film hugging the shores, a calm swell), with the "pixelated" look
 * removed (user, 3 November 2026: "adjust nacres to be less pixelated").
 *
 * Why it looked low-resolution:
 * - Every detail term was value noise evaluated per pixel: square lattice cells, smoothly interpolated, which is exactly
 *   a magnified low-resolution texture. The fine terms (colour mottling at 5 cells per unit, the algae modulation at 3,
 *   the roughness at 9, the wind chop at 2.8 × 8) put those cells at 5–16 screen pixels: visible blocks.
 * - Nothing was filtered: the chop and the roughness noise exceed a pixel's footprint over the far, foreshortened water
 *   and alias into shimmer.
 * - The shore terms followed the shore distance alone, decided by a wet/dry test on the quarter-unit ground grid, clamped
 *   and interpolated over the water sheet's half-unit triangles: the film and the dark shore band stepped along the grid.
 * - The noise hashed the unwrapped scroll (sin of numbers in the hundreds of thousands far along an endless run), which
 *   loses precision on GPUs.
 *
 * Now the detail comes from one small tileable texture (`createMireDetail`: gradient noise, no lattice cells), mipmapped
 * with anisotropic filtering, at scales where a texel is at most a few pixels, sampled four times: the broad warp, the
 * algae at the warped point, and two ripple layers drifting different ways (the normal detail, replacing the chop). The
 * shore reads the signed waterline the terrain view supplies (zero at the true shore, inside each triangle) besides the
 * shore distance. Texture coordinates use the scroll wrapped at MIRE_PERIOD (every along-scroll scale is a multiple of its
 * inverse, so the wrap never shows); the analytic swell keeps the unwrapped frame, as on Vesper.
 */
export const MIRE_PERIOD = 200;
/**
 * Texture taps, in tiles per world unit: [x from x, x from s, y from x, y from s] and a drift (tiles per second). The
 * along-scroll factors (index 1 and 3) are multiples of 1 / MIRE_PERIOD.
 */
export const MIRE_TAPS = {
  /** The broad warp field (B, A): about 0.08–0.6 features per unit, as the mire's warp was. */
  warp: { m: [0.04, 0, 0, 0.04], drift: [0, 0] },
  /** The algae at the warped point: B the streak and cloud field, A the finer second streak family and the sheen. */
  algae: { m: [0.06, 0, 0, 0.045], drift: [0, 0] },
  /** Ripples: two layers at an angle, drifting different ways (R, G slopes). */
  ripple1: { m: [0.31, 0.07, -0.06, 0.29], drift: [0.027, -0.041] },
  ripple2: { m: [-0.5, 0.13, 0.11, 0.56], drift: [-0.037, -0.019] },
} as const;
const tap = (name: keyof typeof MIRE_TAPS, at: string) => {
  const { m, drift } = MIRE_TAPS[name], f = (v: number) => v.toFixed(4);
  return `texture2D( mireMap, vec2( ${f(m[0])} * ${at}.x + ${f(m[1])} * ${at}.y, ${f(m[2])} * ${at}.x + ${f(m[3])} * ${at}.y ) + vec2( ${f(drift[0])}, ${f(drift[1])} ) * waterTime )`;
};
/** A ripple tap's slope (texture space) back in world space (the transpose of its mapping). */
const slope = (name: 'ripple1' | 'ripple2', g: string) => {
  const { m } = MIRE_TAPS[name], f = (v: number) => v.toFixed(4);
  return `vec2( ${f(m[0])} * ${g}.x + ${f(m[2])} * ${g}.y, ${f(m[1])} * ${g}.x + ${f(m[3])} * ${g}.y )`;
};

const VERTEX_HEAD = /* glsl */`
attribute float shore; attribute float depth; attribute float waterline;
uniform float waterScroll; uniform float tileScroll;
varying float vShore; varying float vDepth; varying float vWaterline; varying vec2 vSea; varying vec2 vTile;`;
const FRAGMENT_HEAD = /* glsl */`
uniform float waterTime; uniform vec3 deepColor; uniform vec3 shallowColor; uniform vec3 foamColor; uniform vec3 bloomTint;
uniform float swell; uniform float foamGlow; uniform float bloomAmount; uniform float rippleStrength; uniform sampler2D mireMap;
varying float vShore; varying float vDepth; varying float vWaterline; varying vec2 vSea; varying vec2 vTile;
/** Gradient of the swell height field h(x, s): the ocean's waves (src/render/water.ts), calmer on the mire. */
vec2 swellGradient( vec2 p, float t ) {
  vec2 g = vec2( 0.0 );
  vec2 d = normalize( vec2( 0.82, 0.57 ) ); g += d * cos( dot( d, p ) * 1.4 + t * 0.9 ) * 0.09;
  d = normalize( vec2( -0.45, 0.89 ) ); g += d * cos( dot( d, p ) * 2.3 + t * 1.3 ) * 0.075;
  d = normalize( vec2( 0.25, -0.97 ) ); g += d * cos( dot( d, p ) * 4.1 + t * 1.9 ) * 0.06;
  d = normalize( vec2( -0.93, -0.36 ) ); g += d * cos( dot( d, p ) * 7.3 + t * 2.7 ) * 0.045;
  d = normalize( vec2( 0.6, -0.8 ) ); g += d * cos( dot( d, p ) * 12.7 + t * 3.6 ) * 0.035;
  return g;
}`;
const COLOR = /* glsl */`
  float calm = smoothstep( -0.1, 0.9, vShore );
  diffuseColor.rgb = mix( shallowColor, deepColor, smoothstep( 0.0, 2.4, vDepth ) );
  vec2 q = vTile;
  // World units per pixel: where ripples shrink under a pixel the mips flatten them and the surface turns satin instead.
  float mireFar = smoothstep( 0.035, 0.15, length( fwidth( q ) ) );
  // The shore: the signed waterline crosses zero at the true shore inside each triangle; the shore distance is coarse.
  float shoreLine = min( vShore, max( vWaterline, 0.0 ) * 1.5 );
  // Violet algae: fuzzy streaks drawn out along the channels, broken up, and a few drifting clouds (static in the terrain
  // frame, so they ride the scroll), from the warped algae field.
  vec4 broad = ${tap('warp', 'q')};
  vec2 p = q + broad.ba * 7.0;
  vec4 algae = ${tap('algae', 'p')};
  float streak = 1.0 - smoothstep( 0.02, 0.15, abs( algae.b - 0.5 ) );
  float streak2 = 1.0 - smoothstep( 0.01, 0.07, abs( algae.a - 0.5 ) );
  float breakup = smoothstep( 0.32, 0.72, broad.a );
  float drift = smoothstep( 0.66, 0.86, algae.b * 0.7 + broad.b * 0.3 );
  float bloom = clamp( streak * breakup * 0.8 + streak2 * breakup * drift * 0.5 + drift * 0.6, 0.0, 1.0 );
  // Fine detail from the two ripple layers (filtered: it settles to neutral with distance).
  vec4 r1 = ${tap('ripple1', 'q')}, r2 = ${tap('ripple2', 'q')};
  vec2 g1 = r1.rg * 2.0 - 1.0, g2 = r2.rg * 2.0 - 1.0;
  float fine = clamp( 0.5 + 0.45 * ( g1.x + g2.y ), 0.0, 1.0 );
  bloom *= 0.75 + 0.25 * fine;
  diffuseColor.rgb = mix( diffuseColor.rgb, bloomTint, bloom * bloomAmount );
  // A faint mottled sky sheen, then the fine mottling and darker water at the shores.
  float sheen = algae.a * 0.7 + broad.b * 0.3;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.07, 0.12, 0.34 ), smoothstep( 0.6, 0.95, sheen ) * 0.45 * ( 1.0 - bloom * 0.7 ) );
  diffuseColor.rgb *= ( 0.87 + fine * 0.2 ) * mix( 0.7, 1.0, smoothstep( 0.0, 0.7, shoreLine ) );
  // The dark shoreline film: a broken band that laps in and out (broken up by the ripples, so it moves with them).
  float lap = 0.5 + 0.5 * sin( waterTime * 1.3 + broad.a * 6.2832 );
  float filmBreak = clamp( 0.5 + 0.45 * ( g1.y - g2.x ), 0.0, 1.0 );
  float foam = ( 1.0 - smoothstep( 0.04, 0.2 + 0.16 * lap, shoreLine ) ) * smoothstep( 0.22, 0.62, filmBreak + 0.25 * ( 1.0 - smoothstep( 0.0, 0.08, shoreLine ) ) );
  foam = clamp( foam, 0.0, 1.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, foamColor, foam * mix( 0.92, 0.2, bloomAmount ) );`;
const NORMAL = /* glsl */`
  // Swell normals (world space → view space); calmer and flatter right at the shore.
  vec2 waveSlope = swellGradient( vSea, waterTime ) * swell * mix( 0.45, 1.0, calm ) * ( 1.0 - foam * 0.7 );
  // Fine ripples in two filtered layers (they replace the per-pixel value-noise chop).
  waveSlope += ( ${slope('ripple1', 'g1')} + ${slope('ripple2', 'g2')} * 0.7 ) * rippleStrength * ( 1.0 - foam );
  vec3 waveNormal = normalize( vec3( -waveSlope.x, 1.0, waveSlope.y ) );
  normal = normalize( ( viewMatrix * vec4( waveNormal, 0.0 ) ).xyz );`;

/**
 * The mire's detail texture (runtime-generated, tileable, linear data, 256²): R and G the slopes of a fine ripple height
 * field (three octaves of periodic gradient noise), B and A two independent broad fields (three octaves each), each
 * scaled to a mean of 0.5 and a spread like the value noise it replaces. Built in slices (`step` returns true when
 * done), so preparing it never holds a frame for long.
 */
export const MIRE_SIZE = 256;
export function createMireDetail() {
  const size = MIRE_SIZE, data = new Uint8Array(size * size * 4);
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'mire-detail';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  // The camera looks down at 55°: the far water is foreshortened, so the ripples keep their detail with anisotropic
  // filtering (three clamps it to the GPU's limit).
  texture.anisotropy = 4;
  const hash = (x: number, y: number, salt: number) => {
    let n = Math.imul(x + salt * 131, 374761393) ^ Math.imul(y + salt * 71, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  /** Adds weight × periodic gradient noise (`period` cells across the tile) to rows [y0, y1) of the field. */
  const octave = (out: Float32Array, period: number, weight: number, salt: number, y0: number, y1: number) => {
    const gx = new Float32Array(period * period), gy = new Float32Array(period * period);
    for (let i = 0; i < period * period; i++) { const a = hash(i % period, Math.floor(i / period), salt) * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const cell = size / period, t = new Float32Array(size), s = new Float32Array(size), i0 = new Int32Array(size), i1 = new Int32Array(size);
    for (let x = 0; x < size; x++) { const f = x / cell, i = Math.floor(f), u = f - i; t[x] = u; s[x] = u * u * u * (u * (u * 6 - 15) + 10); i0[x] = i % period; i1[x] = (i + 1) % period; }
    for (let y = y0; y < y1; y++) {
      const ty = t[y], sy = s[y], r0 = i0[y] * period, r1 = i1[y] * period, row = y * size;
      for (let x = 0; x < size; x++) {
        const tx = t[x], sx = s[x], a0 = r0 + i0[x], b0 = r0 + i1[x], c0 = r1 + i0[x], d0 = r1 + i1[x];
        const a = gx[a0] * tx + gy[a0] * ty, b = gx[b0] * (tx - 1) + gy[b0] * ty, c = gx[c0] * tx + gy[c0] * (ty - 1), d = gx[d0] * (tx - 1) + gy[d0] * (ty - 1);
        const top = a + (b - a) * sx;
        out[row + x] += (top + (c + (d - c) * sx - top) * sy) * weight;
      }
    }
  };
  const fields = { ripple: new Float32Array(size * size), broad: new Float32Array(size * size), fine: new Float32Array(size * size) };
  const slopeX = new Float32Array(size * size), slopeY = new Float32Array(size * size);
  /** Running sums for the scaling: slope² (count 2 per pixel), and each broad field's sum and sum of squares. */
  const sums = { slope: 0, broad: 0, broad2: 0, fine: 0, fine2: 0 }, scale = { slope: 1, broadMean: 0, broad: 1, fineMean: 0, fine: 1 };
  // Eight rows per slice: even before the JIT has warmed up (the first slices), a slice stays short.
  const ROWS = 8, steps: (() => void)[] = [];
  // 1. The fields, a band of rows per slice.
  for (let y = 0; y < size; y += ROWS) steps.push(() => {
    octave(fields.ripple, 8, 1, 3, y, y + ROWS); octave(fields.ripple, 16, .6, 20, y, y + ROWS); octave(fields.ripple, 32, .32, 37, y, y + ROWS);
    octave(fields.broad, 2, 1, 41, y, y + ROWS); octave(fields.broad, 4, .55, 58, y, y + ROWS); octave(fields.broad, 8, .28, 75, y, y + ROWS);
    octave(fields.fine, 4, 1, 97, y, y + ROWS); octave(fields.fine, 8, .55, 114, y, y + ROWS); octave(fields.fine, 16, .28, 131, y, y + ROWS);
    for (let i = y * size; i < (y + ROWS) * size; i++) {
      const b = fields.broad[i], f = fields.fine[i];
      sums.broad += b; sums.broad2 += b * b; sums.fine += f; sums.fine2 += f * f;
    }
  });
  // 2. The ripple slopes (central differences, wrapping), once every row exists.
  for (let y = 0; y < size; y += ROWS) steps.push(() => {
    const ripple = fields.ripple;
    for (let r = y; r < y + ROWS; r++) {
      const up = ((r + 1) % size) * size, down = ((r + size - 1) % size) * size, row = r * size;
      for (let x = 0; x < size; x++) {
        const dx = ripple[row + (x + 1) % size] - ripple[row + (x + size - 1) % size], dy = ripple[up + x] - ripple[down + x];
        slopeX[row + x] = dx; slopeY[row + x] = dy; sums.slope += dx * dx + dy * dy;
      }
    }
  });
  steps.push(() => {
    // Slopes scaled by their RMS, so ±1 holds about three standard deviations; the broad fields to a 0.2 spread.
    const n = size * size;
    scale.slope = 1 / (3 * Math.sqrt(sums.slope / (2 * n)));
    scale.broadMean = sums.broad / n; scale.broad = 0.2 / Math.sqrt(Math.max(1e-12, sums.broad2 / n - scale.broadMean ** 2));
    scale.fineMean = sums.fine / n; scale.fine = 0.2 / Math.sqrt(Math.max(1e-12, sums.fine2 / n - scale.fineMean ** 2));
  });
  // 3. Packing, a band of rows per slice.
  const byte = (v: number) => v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  for (let y = 0; y < size; y += ROWS) steps.push(() => {
    for (let i = y * size; i < (y + ROWS) * size; i++) {
      data[i * 4] = byte(0.5 + 0.5 * slopeX[i] * scale.slope);
      data[i * 4 + 1] = byte(0.5 + 0.5 * slopeY[i] * scale.slope);
      data[i * 4 + 2] = byte(0.5 + (fields.broad[i] - scale.broadMean) * scale.broad);
      data[i * 4 + 3] = byte(0.5 + (fields.fine[i] - scale.fineMean) * scale.fine);
    }
    if (y + ROWS >= size) texture.needsUpdate = true;
  });
  let next = 0;
  return {
    texture, data,
    get ready() { return next >= steps.length; },
    /** Runs one slice; true once the texture is complete. */
    step() { if (next < steps.length) steps[next++](); return next >= steps.length; },
  };
}

export interface MireWater {
  material: THREE.MeshStandardMaterial;
  /** Simulation time (seconds) and the run's forward distance (terrain frame). */
  update(time: number, distance: number): void;
  setEnvironment(texture: THREE.Texture | null): void;
  /** Builds the detail texture in slices off the frame (call ahead of the planet; idempotent); resolves when it is in. */
  prepare(): Promise<void>;
  dispose(): void;
}

export function createMireWater(): MireWater {
  const linear = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  // Until the detail is built a neutral texel (no slope, mid fields) stands in.
  const neutral = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1); neutral.needsUpdate = true;
  let detail: ReturnType<typeof createMireDetail> | null = null, building: ReturnType<typeof setTimeout> | null = null, built: Promise<void> | null = null;
  // The mire's palette (docs/20), as before: deep indigo streaked with violet algae, a dark film at the shores.
  const uniforms = {
    waterTime: { value: 0 }, waterScroll: { value: 0 }, tileScroll: { value: 0 }, mireMap: { value: neutral as THREE.Texture },
    deepColor: { value: linear(0x292e4c) }, shallowColor: { value: linear(0x35455c) }, foamColor: { value: linear(0x1a3c5a) },
    bloomTint: { value: linear(0x716485) }, bloomAmount: { value: 0.34 }, swell: { value: 0.6 }, foamGlow: { value: 0.03 },
    rippleStrength: { value: 0.5 },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.23, metalness: 0, envMapIntensity: 0.7 });
  material.name = 'nacre_water';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShore = shore; vDepth = depth; vWaterline = waterline;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  // Terrain frame: world z = distance − s, so (x, distance − z) is fixed on the ground and continuous across sections;
  // vTile is the same with the scroll wrapped (small numbers, full precision on any run length).
  vec4 seaWorld = modelMatrix * vec4( transformed, 1.0 );
  vSea = vec2( seaWorld.x, waterScroll - seaWorld.z );
  vTile = vec2( seaWorld.x, tileScroll - seaWorld.z );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix( roughnessFactor + fine * 0.1 + mireFar * 0.08, 0.85, foam );`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += foamColor * foam * foamGlow;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${NORMAL}`);
  };
  material.customProgramCacheKey = () => 'nacre-water';
  const prepare = () => built ??= new Promise<void>(resolve => {
    const making = detail = createMireDetail();
    const slice = () => {
      building = null;
      if (making.step()) { uniforms.mireMap.value = making.texture; resolve(); return; }
      building = setTimeout(slice, 0);
    };
    slice();
  });
  return {
    material,
    update(time, distance) {
      uniforms.waterTime.value = time; uniforms.waterScroll.value = distance;
      uniforms.tileScroll.value = ((distance % MIRE_PERIOD) + MIRE_PERIOD) % MIRE_PERIOD;
    },
    setEnvironment(texture) { if (material.envMap !== texture) { material.envMap = texture; material.needsUpdate = true; } },
    prepare,
    dispose() { if (building) clearTimeout(building); material.dispose(); neutral.dispose(); detail?.texture.dispose(); },
  };
}
