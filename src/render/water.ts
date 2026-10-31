import { liveInstances } from './instances';
import * as THREE from 'three';

/**
 * Vesper's ocean (docs/17 §1), render-only and phone-cheap: one opaque draw per visible water strip, no reflection
 * pass. The terrain view supplies the sea-level sheets; each vertex carries `depth` (sea level minus seabed) and
 * `shore` (signed distance to the waterline, + over water, clamped ±1).
 *
 * - Colour: shallows `#1f6a8f` → deep `#0d3557` by depth.
 * - Swell: four analytic travelling waves in the terrain's own frame (x, s), so the pattern rides the scrolling
 *   world and is continuous across sections; normals only, the surface stays flat.
 * - Light: the standard PBR path (sun, sky fill, shadows) at low roughness, so the sun leaves bloom-hot glints on
 *   wave flanks, and the prefiltered sky gives a Fresnel sheen.
 * - Foam: broken, gently lapping white bands along every shoreline (ice cliffs and shelves).
 *
 * `createFoam` adds one instanced draw of soft foam collars around drifting floes and V-shaped wakes behind moving
 * hulls (later the Helion Ark via its `ark_wake_anchor`).
 */
const WATER_VERTEX_HEAD = /* glsl */`
attribute float shore; attribute float depth;
uniform float waterScroll;
varying float vShore; varying float vDepth; varying vec2 vSea;`;
const WATER_FRAGMENT_HEAD = /* glsl */`
uniform float waterTime; uniform vec3 deepColor; uniform vec3 shallowColor; uniform vec3 foamColor; uniform float swell; uniform float foamGlow; uniform vec3 bloomTint; uniform float bloomAmount;
uniform float crisp;
varying float vShore; varying float vDepth; varying vec2 vSea;
float seaHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float seaNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( seaHash( i ), seaHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( seaHash( i + vec2( 0.0, 1.0 ) ), seaHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
/** Gradient of the swell height field h(x, s): four directional waves, long and slow to short and quick. */
vec2 swellGradient( vec2 p, float t ) {
  vec2 g = vec2( 0.0 );
  vec2 d = normalize( vec2( 0.82, 0.57 ) ); g += d * cos( dot( d, p ) * 1.4 + t * 0.9 ) * 0.09;
  d = normalize( vec2( -0.45, 0.89 ) ); g += d * cos( dot( d, p ) * 2.3 + t * 1.3 ) * 0.075;
  d = normalize( vec2( 0.25, -0.97 ) ); g += d * cos( dot( d, p ) * 4.1 + t * 1.9 ) * 0.06;
  d = normalize( vec2( -0.93, -0.36 ) ); g += d * cos( dot( d, p ) * 7.3 + t * 2.7 ) * 0.045;
  // Short chop, so the high sun catches wave flanks as sparse glints.
  d = normalize( vec2( 0.6, -0.8 ) ); g += d * cos( dot( d, p ) * 12.7 + t * 3.6 ) * 0.035;
  return g;
}`;

export interface Water {
  material: THREE.MeshStandardMaterial;
  /** Simulation time (seconds) and the run's forward distance (terrain frame). */
  update(time: number, distance: number): void;
  setEnvironment(texture: THREE.Texture | null): void;
  /** Planet palette: Vesper's ocean, or Nacre's indigo mire with a calm swell and soft teal glow at the shores. */
  setPlanet(planet: string): void;
  dispose(): void;
}

export function createWater(): Water {
  const linear = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const uniforms = {
    waterTime: { value: 0 }, waterScroll: { value: 0 }, swell: { value: 1 }, foamGlow: { value: 0 }, bloomTint: { value: new THREE.Color() }, bloomAmount: { value: 0 },
    crisp: { value: 0 },
    deepColor: { value: linear(0x0d3557) }, shallowColor: { value: linear(0x1f6a8f) }, foamColor: { value: linear(0xeef6fb) },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, envMapIntensity: 0.32 });
  material.name = 'vesper_water';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${WATER_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShore = shore; vDepth = depth;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  // Terrain frame: world z = distance − s, so (x, distance − z) is fixed on the ground and continuous across sections.
  vec4 seaWorld = modelMatrix * vec4( transformed, 1.0 );
  vSea = vec2( seaWorld.x, waterScroll - seaWorld.z );`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${WATER_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float calm = smoothstep( -0.1, 0.9, vShore );
  diffuseColor.rgb = mix( shallowColor, deepColor, smoothstep( 0.0, 2.4, vDepth ) );
  // Nacre: violet algae blooms streak the mire (warped noise in the terrain frame, so they ride the scroll).
  if ( bloomAmount > 0.0 ) {
    // Nacre: deep indigo water streaked with violet algae (fuzzy, broken streaks drawn out along the channels and a
    // few drifting clouds), a faint mottled sky sheen, darker water at the shores. All in the terrain frame.
    vec2 warp = vec2( seaNoise( vSea * 0.11 ), seaNoise( vSea * 0.1 + 7.0 ) ) * 7.0;
    vec2 p = vSea + warp + vec2( seaNoise( vSea * 0.37 + 2.0 ), seaNoise( vSea * 0.33 + 9.0 ) ) * 1.6;
    float streak = 1.0 - smoothstep( 0.02, 0.15, abs( seaNoise( p * vec2( 0.38, 0.26 ) ) - 0.5 ) );
    float streak2 = 1.0 - smoothstep( 0.01, 0.07, abs( seaNoise( p * 0.85 + 11.0 ) - 0.5 ) );
    float breakup = smoothstep( 0.32, 0.72, seaNoise( p * 0.3 + 5.0 ) );
    float drift = smoothstep( 0.63, 0.84, seaNoise( p * 0.2 + 3.0 ) * 0.7 + seaNoise( p * 0.8 ) * 0.3 );
    float bloom = clamp( streak * breakup * 0.8 + streak2 * breakup * drift * 0.5 + drift * 0.6, 0.0, 1.0 );
    bloom *= 0.75 + 0.25 * seaNoise( vSea * 3.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, bloomTint, bloom * bloomAmount );
    float sheen = seaNoise( vSea * vec2( 0.7, 1.1 ) + warp * 0.6 ) * 0.7 + seaNoise( vSea * 2.3 ) * 0.3;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.07, 0.12, 0.34 ), smoothstep( 0.6, 0.95, sheen ) * 0.45 * ( 1.0 - bloom * 0.7 ) );
    diffuseColor.rgb *= ( 0.84 + seaNoise( vSea * 5.0 + warp ) * 0.26 ) * mix( 0.7, 1.0, smoothstep( 0.0, 0.7, vShore ) );
  }
  // Shoreline foam: a broken band that laps in and out; streaks drift with the swell.
  float lap = 0.5 + 0.5 * sin( waterTime * 1.3 + seaNoise( vSea * 0.7 ) * 6.2832 );
  float breakup = seaNoise( vSea * vec2( 3.1, 2.3 ) + vec2( waterTime * 0.12, 0.0 ) );
  float foam = ( 1.0 - smoothstep( 0.04, 0.2 + 0.16 * lap, vShore ) ) * smoothstep( 0.22, 0.62, breakup + 0.25 * ( 1.0 - smoothstep( 0.0, 0.08, vShore ) ) );
  foam = clamp( foam, 0.0, 1.0 );
  diffuseColor.rgb = mix( diffuseColor.rgb, foamColor, foam * mix( 0.92, 0.2, bloomAmount ) );
  // Vesper (crisp, 21 October: "improve the sharpness of the water"): sparse small whitecaps on the open sea, hard-edged
  // in pixels (fwidth), riding the swell; none in the calm water at the shore.
  if ( crisp > 0.0 ) {
    // Crests stretched across the wind (thin streaks, not flakes), broken inside, few and small.
    vec2 capUv = vSea * vec2( 3.2, 9.0 ) + vec2( waterTime * .06, waterTime * -.1 );
    float cap = seaNoise( capUv ) * .6 + seaNoise( capUv * 2.3 + 4.0 ) * .4;
    float capEdge = max( fwidth( cap ), 1e-4 ) * 1.2, level = .83 - .03 * sin( waterTime * .9 + seaNoise( vSea * .4 ) * 6.2832 );
    float whitecap = smoothstep( level - capEdge, level + capEdge, cap ) * smoothstep( .35, .6, seaNoise( vSea * .9 + 2.0 ) ) * calm * crisp;
    whitecap *= .55 + .45 * seaNoise( capUv * 4.1 + 9.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, foamColor * .9, whitecap * .75 );
    foam = max( foam, whitecap * .5 );
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor + seaNoise( vSea * 9.0 ) * .1, 0.85, foam );')
      // Nacre: the shoreline band glows (bioluminescent film) instead of reading as white foam.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += foamColor * foam * foamGlow;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  // Swell normals (world space → view space); calmer and flatter right at the shore.
  vec2 waveSlope = swellGradient( vSea, waterTime ) * swell * mix( 0.45, 1.0, calm ) * ( 1.0 - foam * 0.7 );
  // Short wind ripples catch the sky in narrow broken highlights, rather than broad blurry colour bands.
  vec2 windUv = vSea * vec2( 2.8, 8.0 ) + vec2( waterTime * .17, waterTime * -.11 );
  float chop = seaNoise( windUv + seaNoise( vSea * 1.3 ) * 3.0 );
  waveSlope += vec2( seaNoise( windUv + 1.7 ) - .5, chop - .5 ) * .28 * ( 1.0 - foam ) * ( 1.0 - .5 * crisp );
  // Vesper: sharp-crested ripples (ridged noise) in two crossing trains, so the sun breaks into crisp small glints.
  if ( crisp > 0.0 ) {
    vec2 r1 = vSea * vec2( 3.4, 5.2 ) + vec2( waterTime * .21, -waterTime * .3 ), r2 = vSea * vec2( -4.6, 3.9 ) + vec2( -waterTime * .26, waterTime * .17 );
    float a = seaNoise( r1 ), b = seaNoise( r2 ), ea = .01;
    vec2 ga = vec2( seaNoise( r1 + vec2( ea, 0.0 ) ) - a, seaNoise( r1 + vec2( 0.0, ea ) ) - a ) / ea;
    vec2 gb = vec2( seaNoise( r2 + vec2( ea, 0.0 ) ) - b, seaNoise( r2 + vec2( 0.0, ea ) ) - b ) / ea;
    // Ridged: the slope flips sign across each crest, which sharpens it into a line.
    waveSlope += ( sign( a - .5 ) * ga * vec2( 3.4, 5.2 ) + sign( b - .5 ) * gb * vec2( -4.6, 3.9 ) ) * .018 * crisp * calm * ( 1.0 - foam );
  }
  vec3 waveNormal = normalize( vec3( -waveSlope.x, 1.0, waveSlope.y ) );
  normal = normalize( ( viewMatrix * vec4( waveNormal, 0.0 ) ).xyz );`);
  };
  material.customProgramCacheKey = () => 'vesper-water';
  return {
    material,
    update(time, distance) { uniforms.waterTime.value = time; uniforms.waterScroll.value = distance; },
    setEnvironment(texture) { if (material.envMap !== texture) { material.envMap = texture; material.needsUpdate = true; } },
    setPlanet(planet) {
      const nacre = planet === 'nacre';
      // (Vesper since 21 October: deeper navy against brighter shallows, crisp ripples and whitecaps, tighter glints.)
      uniforms.deepColor.value.copy(linear(nacre ? 0x292e4c : 0x0f2b45)); uniforms.shallowColor.value.copy(linear(nacre ? 0x35455c : 0x2f6e88));
      uniforms.crisp.value = nacre ? 0 : 1;
      uniforms.bloomTint.value.copy(linear(0x716485)); uniforms.bloomAmount.value = nacre ? 0.34 : 0;
      uniforms.foamColor.value.copy(linear(nacre ? 0x1a3c5a : 0xeef6fb)); uniforms.swell.value = nacre ? 0.6 : 1; uniforms.foamGlow.value = nacre ? 0.03 : 0;
      material.roughness = nacre ? 0.23 : 0.07; material.envMapIntensity = nacre ? 0.7 : 0.5;
    },
    dispose() { material.dispose(); },
  };
}

/** A soft foam collar around a floating piece (world xz, footprint radii, yaw); `strength` 0–1 (default 0.5). */
export interface FoamRing { x: number; z: number; rx: number; rz: number; yaw: number; y: number; strength?: number }
/** A V wake behind a moving hull: apex at (x, z), trailing along `heading` + π, `length` units, `strength` 0–1. */
export interface Wake { x: number; z: number; y: number; heading: number; length: number; width: number; strength: number }

const FOAM_VERTEX = /* glsl */`
attribute vec3 aFoam; varying vec2 vUv; varying vec3 vFoam;
void main() { vUv = uv; vFoam = aFoam; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); }`;
const FOAM_FRAGMENT = /* glsl */`
uniform float foamTime; uniform vec3 foamTint; varying vec2 vUv; varying vec3 vFoam;
float foamHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float foamNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( foamHash( i ), foamHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( foamHash( i + vec2( 0.0, 1.0 ) ), foamHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
void main() {
  vec2 p = vUv * 2.0 - 1.0; float a;
  if ( vFoam.y < 0.5 ) {
    // Collar: a ring hugging the ellipse edge (r ≈ 0.78), feathered outward, broken and lapping.
    float r = length( p );
    float ring = smoothstep( 0.6, 0.78, r ) * ( 1.0 - smoothstep( 0.8, 0.98, r ) );
    float n = foamNoise( p * 4.0 + vFoam.z * 7.0 + vec2( foamTime * 0.35, 0.0 ) );
    a = ring * smoothstep( 0.25, 0.7, n + 0.25 * sin( foamTime * 1.6 + vFoam.z * 9.0 ) );
  } else {
    // Wake: two diverging arms from the apex (top of the quad) fading along the trail, plus a faint centre line.
    float along = 1.0 - vUv.y, spread = 0.12 + along * 0.85;
    float arm = 1.0 - smoothstep( 0.0, 0.14, abs( abs( p.x ) - spread * 0.9 ) );
    float centre = ( 1.0 - smoothstep( 0.0, 0.08, abs( p.x ) ) ) * 0.4;
    float n = foamNoise( vec2( p.x * 6.0, along * 9.0 - foamTime * 1.2 ) );
    a = max( arm, centre ) * ( 1.0 - along ) * smoothstep( 0.2, 0.6, n );
  }
  a *= vFoam.x;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( foamTint, a );
}`;

export function createFoam(scene: THREE.Scene, capacity = 64) {
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aFoam', params);
  const uniforms = { foamTime: { value: 0 }, foamTint: { value: new THREE.Color().setHex(0xf2f8fc, THREE.SRGBColorSpace) } };
  const material = new THREE.ShaderMaterial({ vertexShader: FOAM_VERTEX, fragmentShader: FOAM_FRAGMENT, uniforms, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 1; mesh.name = 'Vesper foam';
  scene.add(mesh);
  const transform = new THREE.Object3D();
  return {
    /** Rings around floes and wakes behind hulls; both rest on the water surface (render-only). */
    update(time: number, rings: readonly FoamRing[], wakes: readonly Wake[]) {
      uniforms.foamTime.value = time;
      let n = 0;
      const array = params.array as Float32Array;
      for (const ring of rings) {
        if (n >= capacity) break;
        transform.position.set(ring.x, ring.y + 0.012, ring.z); transform.rotation.set(0, ring.yaw, 0);
        // The collar peaks just inside the footprint ellipse, so foam shows only where the floe outline dips inward.
        transform.scale.set(ring.rx * 2.3, 1, ring.rz * 2.3); transform.updateMatrix(); mesh.setMatrixAt(n, transform.matrix);
        array.set([ring.strength ?? 0.5, 0, Math.abs(ring.x * 0.37 + ring.z * 0.11) % 1], n * 3); n++;
      }
      for (const wake of wakes) {
        if (n >= capacity) break;
        // Quad centre trails behind the apex; local −z (uv.y = 1) is the apex end.
        transform.position.set(wake.x + Math.sin(wake.heading) * wake.length / 2, wake.y + 0.014, wake.z + Math.cos(wake.heading) * wake.length / 2);
        transform.rotation.set(0, wake.heading, 0); transform.scale.set(wake.width, 1, wake.length); transform.updateMatrix(); mesh.setMatrixAt(n, transform.matrix);
        array.set([wake.strength, 1, 0], n * 3); n++;
      }
      liveInstances(mesh, n, [params]);
    },
    clear() { liveInstances(mesh, 0); },
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
export type Foam = ReturnType<typeof createFoam>;
