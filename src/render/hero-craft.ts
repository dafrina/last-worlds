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
      else repaint(copy, defaults, paint);
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
 * The paint of a textured part: texels near the model's own paint or trim colour (same tone, at least half as bright)
 * take the chosen colour at their own brightness, so wear, panels and shading stay. Unchanged paint costs nothing.
 */
function repaint(material: THREE.MeshStandardMaterial, from: { primary: number; secondary: number }, to: { primary: number; secondary: number }) {
  if (from.primary === to.primary && from.secondary === to.secondary) return;
  const colour = (hex: number) => new THREE.Color(hex);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      heroFromP: { value: colour(from.primary) }, heroToP: { value: colour(to.primary) }, heroP: { value: from.primary === to.primary ? 0 : 1 },
      heroFromS: { value: colour(from.secondary) }, heroToS: { value: colour(to.secondary) }, heroS: { value: from.secondary === to.secondary ? 0 : 1 },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 heroFromP, heroToP, heroFromS, heroToS; uniform float heroP, heroS;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        const vec3 W = vec3( .2126, .7152, .0722 );
        vec3 c = diffuseColor.rgb; float l = max( dot( c, W ), 1e-4 );
        float lp = max( dot( heroFromP, W ), 1e-4 ), ls = max( dot( heroFromS, W ), 1e-4 );
        float wp = heroP * ( 1. - smoothstep( .1, .3, length( c / l - heroFromP / lp ) ) ) * smoothstep( lp * .35, lp * .6, l );
        float ws = heroS * ( 1. - smoothstep( .15, .4, length( c / l - heroFromS / ls ) ) ) * smoothstep( ls * .3, ls * .55, l ) * ( 1. - wp );
        diffuseColor.rgb = mix( mix( c, heroToS * ( l / ls ), ws ), heroToP * ( l / lp ), wp );
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
