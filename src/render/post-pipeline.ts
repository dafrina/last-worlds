import * as THREE from 'three';

/**
 * High-tier post-processing in six full-screen draws (docs/05 §9: subtle bloom, disabled first under load).
 *
 * The scene renders once into an HDR target. Bloom is *selective by energy*: only pixels whose
 * linear radiance exceeds `threshold` (emissive cores, vents, lamps, engines, crystals and pool rims, which are
 * authored above 1.0) feed a quarter-resolution dual-filter chain (prefilter ↓¼, ↓⅛, ↓1/16, ↑⅛, ↑¼). Sunlit
 * surfaces stay below the threshold, so terrain, craft armour and projectiles never smear.
 *
 * One composite pass then antialiases (FXAA), adds the bloom, applies exposure, Neutral tone mapping, a restrained warm grade and
 * a soft vignette, and writes sRGB to the canvas. The Low tier never creates or runs this pipeline.
 */
export interface PostSettings {
  exposure: number;
  /** Linear radiance where bloom starts (soft knee below it). */
  threshold: number; knee: number;
  strength: number;
  /** Warm lift added to the darkest tones before tone mapping (linear RGB). */
  lift: THREE.Color;
  saturation: number;
  /** Display-space contrast around mid-grey (1 = none). */
  contrast: number;
  /** 0 = none; darkening at the corners. */
  vignette: number;
  /** Distance haze toward the top of the frame: linear RGB in xyz, amount in w (0 = none). */
  haze: THREE.Vector4;
  /**
   * World fog (22 October, "add fog"), from the scene's depth: its colour (linear radiance); height fog settling in low
   * ground (top and bottom world heights, amount); distance haze (start distance, density, amount).
   */
  fogColor: THREE.Color; fogHeight: THREE.Vector3; fogDistance: THREE.Vector3;
}

const VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

/** Quarter-resolution prefilter: 4 bilinear taps cover a 4×4 block; each tap is thresholded (soft knee) and
 * weighted by 1/(1+luma) (Karis average) so single hot pixels cannot flicker. */
const PREFILTER = /* glsl */`
uniform sampler2D source; uniform vec2 texel; uniform float threshold; uniform float knee;
varying vec2 vUv;
vec3 bright( vec3 c ) {
  float l = max( c.r, max( c.g, c.b ) );
  float soft = clamp( l - threshold + knee, 0.0, 2.0 * knee );
  soft = soft * soft / ( 4.0 * knee + 1e-4 );
  float w = max( soft, l - threshold ) / max( l, 1e-4 );
  return c * w / ( 1.0 + l * 0.25 );
}
void main() {
  vec3 c = bright( texture2D( source, vUv + texel * vec2( -1.0, -1.0 ) ).rgb )
    + bright( texture2D( source, vUv + texel * vec2( 1.0, -1.0 ) ).rgb )
    + bright( texture2D( source, vUv + texel * vec2( -1.0, 1.0 ) ).rgb )
    + bright( texture2D( source, vUv + texel * vec2( 1.0, 1.0 ) ).rgb );
  gl_FragColor = vec4( c * 0.25, 1.0 );
}`;

/** Dual-filter downsample (5 taps). */
const DOWN = /* glsl */`
uniform sampler2D source; uniform vec2 texel; varying vec2 vUv;
void main() {
  vec3 c = texture2D( source, vUv ).rgb * 4.0;
  c += texture2D( source, vUv + texel * vec2( -1.0, -1.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( 1.0, -1.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( -1.0, 1.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( 1.0, 1.0 ) ).rgb;
  gl_FragColor = vec4( c / 8.0, 1.0 );
}`;

/** Dual-filter tent upsample of the coarser level, added to the same-resolution downsample (wide + tight glow). */
const UP = /* glsl */`
uniform sampler2D source; uniform sampler2D detail; uniform vec2 texel; varying vec2 vUv;
void main() {
  vec3 c = texture2D( source, vUv + texel * vec2( -2.0, 0.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( 2.0, 0.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( 0.0, -2.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( 0.0, 2.0 ) ).rgb;
  c += texture2D( source, vUv + texel * vec2( -1.0, -1.0 ) ).rgb * 2.0;
  c += texture2D( source, vUv + texel * vec2( 1.0, -1.0 ) ).rgb * 2.0;
  c += texture2D( source, vUv + texel * vec2( -1.0, 1.0 ) ).rgb * 2.0;
  c += texture2D( source, vUv + texel * vec2( 1.0, 1.0 ) ).rgb * 2.0;
  gl_FragColor = vec4( c / 12.0 + texture2D( detail, vUv ).rgb, 1.0 );
}`;

const COMPOSITE = /* glsl */`
uniform sampler2D scene; uniform sampler2D bloom; uniform vec2 texel;
uniform float exposure; uniform float strength; uniform vec3 lift; uniform float saturation; uniform float contrast; uniform float vignette; uniform vec2 aspect;
uniform vec4 haze;
uniform sampler2D depthMap; uniform mat4 viewInverse; uniform mat4 projectionInverse;
uniform vec3 fogColor; uniform vec3 fogHeight; uniform vec3 fogDistance;
varying vec2 vUv;
/**
 * World fog from the scene depth (user, 22 October: "only the lower half of the terrain ... mountainous areas stay clear"):
 * it lies in the low ground below each level's fog top, thicker far away where the line of sight crosses more of it.
 * Emissive cores (shots, engines, explosions) keep their punch.
 */
vec3 fog( vec3 color ) {
  float depth = texture2D( depthMap, vUv ).r;
  if ( depth >= 1.0 || fogHeight.z + fogDistance.z <= 0.0 ) return color;
  vec4 view = projectionInverse * vec4( vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
  vec3 world = ( viewInverse * vec4( view.xyz / view.w, 1.0 ) ).xyz;
  float distance = length( world - viewInverse[ 3 ].xyz );
  float low = fogHeight.z * smoothstep( fogHeight.x, fogHeight.y, world.y ) * mix( 0.55, 1.0, smoothstep( 38.0, 68.0, distance ) );
  // The distance haze lives in the same low layer: far valleys turn misty while ridges and plateaus stay clear.
  float far = fogDistance.z * ( 1.0 - exp( -fogDistance.y * max( 0.0, distance - fogDistance.x ) ) ) * smoothstep( fogHeight.x + 1.2, fogHeight.x - 0.8, world.y );
  float amount = ( 1.0 - ( 1.0 - low ) * ( 1.0 - far ) ) * ( 1.0 - smoothstep( 1.2, 3.0, max( color.r, max( color.g, color.b ) ) ) );
  return mix( color, fogColor, amount );
}
/** Compressed (Reinhard) luma, so FXAA edge detection behaves on HDR input. */
float edgeLuma( vec3 c ) { float l = dot( c, vec3( 0.299, 0.587, 0.114 ) ) * exposure; return l / ( 1.0 + l ); }
/**
 * Compact FXAA (NVIDIA's console variant): 5 taps decide whether a pixel sits on a contrasted edge; only edge
 * pixels take 4 more taps along it. Replaces MSAA on the HDR target, which cost more than the whole bloom chain.
 */
vec3 antialiased( vec2 uv ) {
  vec3 m = texture2D( scene, uv ).rgb;
  float nw = edgeLuma( texture2D( scene, uv + texel * vec2( -1.0, -1.0 ) ).rgb ), ne = edgeLuma( texture2D( scene, uv + texel * vec2( 1.0, -1.0 ) ).rgb );
  float sw = edgeLuma( texture2D( scene, uv + texel * vec2( -1.0, 1.0 ) ).rgb ), se = edgeLuma( texture2D( scene, uv + texel * vec2( 1.0, 1.0 ) ).rgb );
  float lm = edgeLuma( m ), lo = min( lm, min( min( nw, ne ), min( sw, se ) ) ), hi = max( lm, max( max( nw, ne ), max( sw, se ) ) );
  if ( hi - lo < max( 0.04, hi * 0.15 ) ) return m;
  vec2 dir = vec2( -( ( nw + ne ) - ( sw + se ) ), ( nw + sw ) - ( ne + se ) );
  float reduce = max( ( nw + ne + sw + se ) * 0.03125, 1.0 / 128.0 );
  dir = clamp( dir / ( min( abs( dir.x ), abs( dir.y ) ) + reduce ), vec2( -8.0 ), vec2( 8.0 ) ) * texel;
  vec3 a = 0.5 * ( texture2D( scene, uv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( scene, uv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
  vec3 b = a * 0.5 + 0.25 * ( texture2D( scene, uv - dir * 0.5 ).rgb + texture2D( scene, uv + dir * 0.5 ).rgb );
  float lb = edgeLuma( b );
  return ( lb < lo || lb > hi ) ? a : b;
}
vec3 neutral( vec3 color ) {
  // Khronos PBR Neutral, as three.js NeutralToneMapping (keeps the saturated rust and turquoise palette).
  const float start = 0.76; const float desaturation = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < start ) return color;
  float d = 1.0 - start;
  float newPeak = 1.0 - d * d / ( peak + d - start );
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / ( desaturation * ( peak - newPeak ) + 1.0 );
  return mix( color, vec3( newPeak ), g );
}
vec3 srgb( vec3 c ) {
  return mix( c * 12.92, pow( c, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), step( vec3( 0.0031308 ), c ) );
}
void main() {
  vec3 color = fog( antialiased( vUv ) ) + texture2D( bloom, vUv ).rgb * strength;
  color *= exposure;
  // Warm lift in the deepest tones only: shadows read as warm umber, never as night.
  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color += lift * ( 1.0 - smoothstep( 0.0, 0.18, luma ) );
  color = clamp( neutral( color ), 0.0, 1.0 );
  color = mix( vec3( dot( color, vec3( 0.2126, 0.7152, 0.0722 ) ) ), color, saturation );
  // Planet air: a faint haze thickening toward the far (upper) edge of the view.
  color = mix( color, haze.rgb, haze.a * smoothstep( 0.4, 1.0, vUv.y ) );
  vec2 p = ( vUv - 0.5 ) * aspect;
  color *= 1.0 - vignette * smoothstep( 0.35, 0.95, dot( p, p ) * 2.0 );
  // Ordered dither hides 8-bit banding in the vignette and haze gradients.
  float dither = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5;
  vec3 display = srgb( clamp( color, 0.0, 1.0 ) );
  display = clamp( ( display - 0.5 ) * contrast + 0.5, 0.0, 1.0 );
  gl_FragColor = vec4( display + dither / 255.0, 1.0 );
}`;

export function createPostPipeline(renderer: THREE.WebGLRenderer, settings: PostSettings) {
  const hdr = (width: number, height: number, depth = false) => {
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: depth, samples: 0,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return target;
  };
  // Scene in HDR (antialiased by FXAA in the composite; an MSAA half-float target was the costliest step);
  // bloom chain at ¼, ⅛, 1/16.
  const sceneTarget = hdr(1, 1, true);
  // The scene's depth feeds the world fog in the composite.
  sceneTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const quarter = hdr(1, 1), eighth = hdr(1, 1), sixteenth = hdr(1, 1), upEighth = hdr(1, 1), upQuarter = hdr(1, 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const prefilter = pass(PREFILTER, { source: { value: sceneTarget.texture }, texel: { value: new THREE.Vector2() },
    threshold: { value: settings.threshold }, knee: { value: settings.knee } });
  const down = pass(DOWN, { source: { value: null }, texel: { value: new THREE.Vector2() } });
  const up = pass(UP, { source: { value: null }, detail: { value: null }, texel: { value: new THREE.Vector2() } });
  const composite = pass(COMPOSITE, {
    scene: { value: sceneTarget.texture }, bloom: { value: upQuarter.texture }, exposure: { value: settings.exposure },
    strength: { value: settings.strength }, lift: { value: settings.lift }, saturation: { value: settings.saturation }, contrast: { value: settings.contrast },
    vignette: { value: settings.vignette }, aspect: { value: new THREE.Vector2(1, 1) }, texel: { value: new THREE.Vector2(1, 1) },
    haze: { value: settings.haze.clone() },
    depthMap: { value: sceneTarget.depthTexture }, viewInverse: { value: new THREE.Matrix4() }, projectionInverse: { value: new THREE.Matrix4() },
    fogColor: { value: settings.fogColor.clone() }, fogHeight: { value: settings.fogHeight.clone() }, fogDistance: { value: settings.fogDistance.clone() },
  });
  const quad = new THREE.Mesh(triangle, prefilter); quad.frustumCulled = false;
  let width = 1, height = 1;
  const draw = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    quad.material = material; renderer.setRenderTarget(target); renderer.render(quad, camera);
  };
  return {
    /** Drawing-buffer size in device pixels. */
    setSize(w: number, h: number) {
      width = Math.max(1, Math.floor(w)); height = Math.max(1, Math.floor(h));
      sceneTarget.setSize(width, height);
      const q = [Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 4))];
      quarter.setSize(q[0], q[1]); upQuarter.setSize(q[0], q[1]);
      eighth.setSize(Math.max(1, q[0] >> 1), Math.max(1, q[1] >> 1)); upEighth.setSize(Math.max(1, q[0] >> 1), Math.max(1, q[1] >> 1));
      sixteenth.setSize(Math.max(1, q[0] >> 2), Math.max(1, q[1] >> 2));
      composite.uniforms.aspect.value.set(width / Math.max(width, height) * 1.25, height / Math.max(width, height));
      composite.uniforms.texel.value.set(1 / width, 1 / height);
    },
    /** Renders the scene into the HDR target, then bloom and the graded composite to the canvas. */
    render(scene: THREE.Object3D, view: THREE.Camera) {
      const previousAutoClear = renderer.autoClear;
      renderer.setRenderTarget(sceneTarget); renderer.render(scene, view);
      composite.uniforms.viewInverse.value.copy(view.matrixWorld); composite.uniforms.projectionInverse.value.copy(view.projectionMatrixInverse);
      renderer.autoClear = false;
      prefilter.uniforms.texel.value.set(1 / width, 1 / height); draw(prefilter, quarter);
      down.uniforms.source.value = quarter.texture; down.uniforms.texel.value.set(1 / quarter.width, 1 / quarter.height); draw(down, eighth);
      down.uniforms.source.value = eighth.texture; down.uniforms.texel.value.set(1 / eighth.width, 1 / eighth.height); draw(down, sixteenth);
      up.uniforms.source.value = sixteenth.texture; up.uniforms.detail.value = eighth.texture;
      up.uniforms.texel.value.set(1 / sixteenth.width, 1 / sixteenth.height); draw(up, upEighth);
      up.uniforms.source.value = upEighth.texture; up.uniforms.detail.value = quarter.texture;
      up.uniforms.texel.value.set(1 / upEighth.width, 1 / upEighth.height); draw(up, upQuarter);
      draw(composite, null);
      renderer.autoClear = previousAutoClear;
    },
    /** The HDR scene target: programs that draw into it compile untoned and linear (the warm-up compiles for it). */
    get target() { return sceneTarget; },
    settings: composite.uniforms,
    /** Bloom threshold and knee (linear radiance), e.g. per planet so sunlit snow never smears. */
    setThreshold(threshold: number, knee: number) { prefilter.uniforms.threshold.value = threshold; prefilter.uniforms.knee.value = knee; },
    dispose() {
      [sceneTarget, quarter, eighth, sixteenth, upEighth, upQuarter].forEach(target => target.dispose());
      [prefilter, down, up, composite].forEach(material => material.dispose()); triangle.dispose();
    },
  };
}
export type PostPipeline = ReturnType<typeof createPostPipeline>;
