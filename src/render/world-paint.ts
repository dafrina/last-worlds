import * as THREE from 'three';
import type { PlanetId } from '../shared/contracts';

/**
 * Per-world paint for enemies, outposts, industry and battery compounds (presentation only; user, 21 October 2026):
 * the Moon white with orange glow (blue as the third colour), Khepri rusty and orange, Vesper metallic white with blue
 * glow, Nacre dark green and purple with purple glow.
 *
 * Shaders recolour by brightness: a surface keeps its own light and dark (panels, seams, wear and baked shading), and
 * only its hue moves toward the world's ramp from `dark` to `light` by `amount`. Glow parts keep their brightness and
 * take the world's glow colour. Models and their textures are unchanged.
 */
export interface WorldPaint {
  /** Ramp ends (sRGB): what the darkest and the brightest surfaces become. */
  dark: number; light: number;
  /** Glow colour (sRGB) and the third accent where a world needs one. */
  glow: number; accent: number;
}
export const WORLD_PAINT: Readonly<Record<PlanetId, WorldPaint>> = {
  luna: { dark: 0x666a70, light: 0xf4f4f0, glow: 0xff8a3a, accent: 0x6cc4ff },
  khepri: { dark: 0x2c1a10, light: 0xcc7a40, glow: 0xff9040, accent: 0xffc070 },
  vesper: { dark: 0x56616d, light: 0xf2f6fa, glow: 0x52c2ff, accent: 0xd8f1ff },
  nacre: { dark: 0x140e24, light: 0x3c5e4c, glow: 0xb46cff, accent: 0x6a3fb0 },
  // Amnion (docs/27): flesh-dark to bone, with yolk glow.
  amnion: { dark: 0x3a1814, light: 0xd8c8a8, glow: 0xffc23a, accent: 0xb04a3a },
};
/** How far each kind of thing moves toward its world's ramp (0 keeps its authored paint). */
export type PaintTarget = 'craft' | 'building' | 'facility';
const AMOUNT: Readonly<Record<PaintTarget, Readonly<Record<PlanetId, number>>>> = {
  // Khepri's craft and buildings are already rust and ochre: a light touch there.
  craft: { luna: 0.85, khepri: 0.35, vesper: 0.75, nacre: 0.65, amnion: 0.7 },
  building: { luna: 0.9, khepri: 0.3, vesper: 0.85, nacre: 0.7, amnion: 0.75 },
  facility: { luna: 0.75, khepri: 0.25, vesper: 0.7, nacre: 0.55, amnion: 0.6 },
};

export interface WorldPaintUniforms {
  worldDark: { value: THREE.Color }; worldLight: { value: THREE.Color }; worldGlow: { value: THREE.Color };
  /** x: paint amount, y: glow swap (0 keeps the authored glow colour). */
  worldPaint: { value: THREE.Vector2 };
}
export function worldPaintUniforms(): WorldPaintUniforms {
  return { worldDark: { value: new THREE.Color() }, worldLight: { value: new THREE.Color() }, worldGlow: { value: new THREE.Color() }, worldPaint: { value: new THREE.Vector2(0, 0) } };
}
const linear = (hex: number) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
/** Points the uniforms at a world's paint (null: authored paint, as for the hero). */
export function setWorldPaint(uniforms: WorldPaintUniforms, planet: PlanetId | null, target: PaintTarget) {
  if (!planet) { uniforms.worldPaint.value.set(0, 0); return; }
  const paint = WORLD_PAINT[planet];
  uniforms.worldDark.value.copy(linear(paint.dark)); uniforms.worldLight.value.copy(linear(paint.light)); uniforms.worldGlow.value.copy(linear(paint.glow));
  uniforms.worldPaint.value.set(AMOUNT[target][planet], 1);
}
/** The world glow colour (linear) at a given HDR strength, for materials that set their glow directly. */
export const worldGlow = (planet: PlanetId, strength = 1) => linear(WORLD_PAINT[planet].glow).multiplyScalar(strength);

/** GLSL: the uniforms and the two recolour functions (linear colour in and out). */
export const WORLD_PAINT_GLSL = `
uniform vec3 worldDark; uniform vec3 worldLight; uniform vec3 worldGlow; uniform vec2 worldPaint;
vec3 worldRepaint( vec3 c ) {
  if ( worldPaint.x <= 0.0 ) return c;
  float l = sqrt( max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 ) );
  return mix( c, mix( worldDark, worldLight, smoothstep( 0.04, 0.82, l ) ), worldPaint.x );
}
vec3 worldReglow( vec3 g ) {
  if ( worldPaint.y <= 0.0 ) return g;
  float l = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) ), w = max( dot( worldGlow, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 );
  return mix( g, worldGlow * ( l / w ), worldPaint.y );
}`;

const painted = new WeakSet<THREE.Material>();
/**
 * Paints a loaded (textured GLB) material for its world, once: glow materials take the world's glow at their own
 * brightness; the others recolour after their maps and vertex colours (a program of their own per world).
 */
export function paintMaterial(material: THREE.MeshStandardMaterial, planet: PlanetId, target: PaintTarget) {
  if (painted.has(material)) return;
  painted.add(material);
  if (/glow/i.test(material.name)) {
    const brightness = material.emissive.r * 0.2126 + material.emissive.g * 0.7152 + material.emissive.b * 0.0722, glow = linear(WORLD_PAINT[planet].glow);
    const own = glow.r * 0.2126 + glow.g * 0.7152 + glow.b * 0.0722;
    if (brightness > 0) material.emissive.copy(glow.multiplyScalar(brightness / own));
    return;
  }
  const uniforms = worldPaintUniforms();
  setWorldPaint(uniforms, planet, target);
  const previous = material.onBeforeCompile.bind(material), previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>${WORLD_PAINT_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = worldRepaint( diffuseColor.rgb );');
  };
  material.customProgramCacheKey = () => `${previousKey()}|paint-${planet}-${target}`;
  material.needsUpdate = true;
}
