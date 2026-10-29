import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { craftFromScene, type NacreCraft } from './models';
import { ROLE, loadHeroKit, tint } from './hero-assembly';
import { DEFAULT_LOOK, HERO_DEFAULT_PAINT, HERO_REMODELLED, HERO_SLOTS, heroDesignFile, heroPartNode } from '../content/hero-parts';
import type { HeroDesign, HeroLook, ShipId } from '../shared/contracts';

/** A ship's look ready to draw: its object, the plume sockets ([x, z] in model units), its radius, and what to free. */
export interface HeroModel { object: THREE.Object3D; engines: [number, number][]; radius: number; dispose(): void }

/**
 * A ship's look as drawable model (docs/31). A remodelled chassis is its four textured parts from their design files
 * (geometry shared with the loaded file, materials painted per look; up to one draw per design used). Any other chassis is
 * its kit's parts merged into one craft drawn with `craft`, the shared craft material.
 */
export async function loadHeroModel(ship: ShipId, look: HeroLook = DEFAULT_LOOK, craft?: THREE.Material, base?: string): Promise<HeroModel | null> {
  if (HERO_REMODELLED.has(ship)) return loadRemodel(ship, look, base);
  const model = await loadHeroCraft(ship, look, base);
  if (!model) return null;
  const mesh = new THREE.Mesh(model.geometry, craft ?? new THREE.MeshStandardMaterial({ vertexColors: true }));
  return { object: mesh, engines: model.engines, radius: model.geometry.boundingSphere?.radius ?? 1, dispose: () => model.geometry.dispose() };
}

/** Starts downloading a look's design files, so its launch finds them cached (the campaign screen). */
export function preloadHeroLook(ship: ShipId, look: HeroLook, base?: string) {
  if (!HERO_REMODELLED.has(ship)) return;
  for (const design of new Set(HERO_SLOTS.map(slot => look.parts[slot]))) loadDesign(ship, design, base).catch(() => undefined);
}

const designFiles = new Map<string, Promise<GLTF>>();
function loadDesign(ship: ShipId, design: HeroDesign, base = (import.meta.env?.BASE_URL ?? './') + 'assets/'): Promise<GLTF> {
  const file = base + heroDesignFile(ship, design);
  if (!designFiles.has(file)) designFiles.set(file, new GLTFLoader().loadAsync(file).catch(error => { designFiles.delete(file); throw error; }));
  return designFiles.get(file)!;
}

async function loadRemodel(ship: ShipId, look: HeroLook, base?: string): Promise<HeroModel> {
  const designs = [...new Set(HERO_SLOTS.map(slot => look.parts[slot]))];
  const files = new Map(await Promise.all(designs.map(async design => [design, await loadDesign(ship, design, base)] as const)));
  const defaults = HERO_DEFAULT_PAINT[ship], paint = { ...defaults, ...look.paint };
  const copies = new Map<THREE.Material, THREE.Material>();
  const paintOf = (material: THREE.Material) => {
    if (!copies.has(material)) {
      const copy = (material as THREE.MeshStandardMaterial).clone();
      if (/glow/i.test(copy.name)) { copy.color.setHex(paint.glow); copy.emissive.setHex(paint.glow); }
      else repaint(copy, defaults, paint);   // the trim colour (`secondary`) is no longer offered; old looks keep it unused
      copies.set(material, copy);
    }
    return copies.get(material)!;
  };
  const object = new THREE.Group();
  object.name = `${ship} ${HERO_SLOTS.map(slot => look.parts[slot]).join('')}`;
  for (const slot of HERO_SLOTS) {
    const node = files.get(look.parts[slot])!.scene.getObjectByName(heroPartNode(ship, slot, look.parts[slot]));
    if (!node) continue;
    node.updateWorldMatrix(true, true);
    node.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = Array.isArray(child.material) ? child.material.map(paintOf) : paintOf(child.material);
      const mesh = new THREE.Mesh(child.geometry, material);
      mesh.applyMatrix4(child.matrixWorld);
      object.add(mesh);
    });
  }
  const engines: [number, number][] = [];
  const prefix = `${heroPartNode(ship, 'engines', look.parts.engines)}_engine_`;
  files.get(look.parts.engines)!.scene.traverse(child => {
    if (child.name.startsWith(prefix)) { const p = child.getWorldPosition(new THREE.Vector3()); engines.push([p.x, p.z]); }
  });
  const radius = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere()).radius;
  return { object, engines, radius, dispose: () => copies.forEach(material => material.dispose()) };
}

/**
 * The paint of a textured part (user, 29 October: "Lets just make one color for the ship and one for glow"): every texel
 * takes the ship colour at its own brightness relative to the model's paint, so panels, wear and shading stay; texels lit in
 * the model's glow colour take the glow colour instead. The earlier rule matched texels to a measured paint and trim
 * swatch and missed most of the baked Tripo finish (the trim reached none of it), so the brown rust never changed. The
 * model's own look costs nothing.
 */
function repaint(material: THREE.MeshStandardMaterial, from: { primary: number; glow: number }, to: { primary: number; glow: number }) {
  if (from.primary === to.primary && from.glow === to.glow) return;
  const colour = (hex: number) => new THREE.Color(hex);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      heroFromP: { value: colour(from.primary) }, heroToP: { value: colour(to.primary) }, heroP: { value: from.primary === to.primary ? 0 : 1 },
      heroFromG: { value: colour(from.glow) }, heroToG: { value: colour(to.glow) }, heroG: { value: from.glow === to.glow ? 0 : 1 },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 heroFromP, heroToP, heroFromG, heroToG; uniform float heroP, heroG;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        const vec3 W = vec3( .2126, .7152, .0722 );
        vec3 c = diffuseColor.rgb; float l = max( dot( c, W ), 1e-4 );
        float lp = max( dot( heroFromP, W ), 1e-4 ), lg = max( dot( heroFromG, W ), 1e-4 );
        float chroma = max( c.r, max( c.g, c.b ) ) - min( c.r, min( c.g, c.b ) );
        float glow = ( 1. - smoothstep( .25, .5, length( c / l - heroFromG / lg ) ) ) * smoothstep( .06, .15, chroma );
        vec3 painted = mix( c, min( heroToP * ( l / lp ), vec3( 1. ) ), heroP );
        diffuseColor.rgb = mix( painted, mix( c, min( heroToG * ( l / lg ), vec3( 1. ) ), heroG ), glow );
      }`);
  };
  material.customProgramCacheKey = () => 'hero-paint';
}

/**
 * A kit chassis's look as one craft in the shared craft format (one draw, docs/31): its four kit parts repainted and merged, and
 * the engine sockets of its propulsion part (for the plumes). The kit is loaded once per chassis and left untouched.
 */
export async function loadHeroCraft(ship: ShipId, look: HeroLook = DEFAULT_LOOK, base?: string): Promise<NacreCraft | null> {
  const gltf = await loadHeroKit(ship, base);
  const defaults = HERO_DEFAULT_PAINT[ship], paint = { ...defaults, ...look.paint };
  const names = HERO_SLOTS.map(slot => heroPartNode(ship, slot, look.parts[slot]));
  const parts = craftFromScene(gltf.scene, names, (mesh, material) => {
    const geometry = mesh.geometry.clone(), copy = material.clone();
    if (/glow/i.test(copy.name)) { copy.color.setHex(paint.glow); copy.emissive.setHex(paint.glow); }
    if (paint.primary !== defaults.primary) tint(geometry, ROLE.primary, new THREE.Color(paint.primary), new THREE.Color(defaults.primary));
    if (paint.secondary !== defaults.secondary) tint(geometry, ROLE.secondary, new THREE.Color(paint.secondary), new THREE.Color(defaults.secondary));
    return { geometry, material: copy };
  });
  const geometries = names.map(name => parts.get(name)?.geometry).filter((geometry): geometry is THREE.BufferGeometry => !!geometry);
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries);
  geometries.forEach(geometry => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return { geometry: merged, engines: parts.get(heroPartNode(ship, 'engines', look.parts.engines))?.engines ?? [] };
}
