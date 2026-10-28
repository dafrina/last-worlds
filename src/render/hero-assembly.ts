/**
 * Modular hero ships (docs/31-hero-ships.md): four chassis, each with four part slots (hull, wings, engines, cockpit) in
 * three designs, mixed and matched within a chassis. Every design of a chassis is authored around the same anchors
 * (tools/blender/hero_kit.py), so a build is just the chosen part nodes put together. Cosmetic only: the hit region,
 * handling and gun origins never depend on the parts (docs/04 section 9).
 *
 * Recolouring: each face's paint role is in its vertex colour's alpha (0.75 primary paint, 0.5 secondary paint, 1 metal,
 * glass and the rest). A recolour tints a role's faces, keeping their baked lightness (shading, wear); the glow material
 * takes its own tint.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const HERO_CHASSIS = ['scrapper', 'ironclad', 'interceptor', 'spectre'] as const;
export type HeroChassis = (typeof HERO_CHASSIS)[number];
export const HERO_SLOTS = ['hull', 'wings', 'engines', 'cockpit'] as const;
export type HeroSlot = (typeof HERO_SLOTS)[number];
export const HERO_DESIGNS = ['a', 'b', 'c'] as const;
export type HeroDesign = (typeof HERO_DESIGNS)[number];
/** A ship as the player built it: one design per slot, and optional paint (linear-free hex colours). */
export interface HeroBuild { chassis: HeroChassis; parts: Record<HeroSlot, HeroDesign>; paint?: { primary?: number; secondary?: number; glow?: number } }

export const heroKitFile = (chassis: HeroChassis) => `shared/hero-${chassis}-kit.glb`;
export const heroPartNode = (chassis: HeroChassis, slot: HeroSlot, design: HeroDesign) => `hero_${chassis}_${slot}_${design}`;
/** The kit's own colours (as authored): what a build without paint shows. */
export const HERO_DEFAULT_PAINT: Record<HeroChassis, { primary: number; secondary: number; glow: number }> = {
  scrapper: { primary: 0xc8c9bd, secondary: 0x78442f, glow: 0x78f9f1 },
  ironclad: { primary: 0x3d4528, secondary: 0xb58a1c, glow: 0xff4a24 },
  interceptor: { primary: 0xd9dde2, secondary: 0x1f4f9a, glow: 0x5aa8ff },
  spectre: { primary: 0x17141e, secondary: 0xa9adb8, glow: 0xb46cff },
};
const ROLE = { primary: .75, secondary: .5 } as const;

const files = new Map<string, Promise<GLTF>>();
/** Loads a chassis kit once (shared by every build of that chassis). */
export function loadHeroKit(chassis: HeroChassis, base = (import.meta.env?.BASE_URL ?? './') + 'assets/'): Promise<GLTF> {
  const file = base + heroKitFile(chassis);
  if (!files.has(file)) files.set(file, new GLTFLoader().loadAsync(file));
  return files.get(file)!;
}

/** Tints the faces of a paint role, keeping each vertex's baked lightness. */
function tint(geometry: THREE.BufferGeometry, role: number, colour: THREE.Color) {
  const attribute = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!attribute || attribute.itemSize < 4) return;
  const lum = colour.r * .2126 + colour.g * .7152 + colour.b * .0722 || 1e-3;
  for (let i = 0; i < attribute.count; i++) {
    if (Math.abs(attribute.getW(i) - role) > .06) continue;
    const r = attribute.getX(i), g = attribute.getY(i), b = attribute.getZ(i), light = r * .2126 + g * .7152 + b * .0722;
    attribute.setXYZ(i, colour.r / lum * light, colour.g / lum * light, colour.b / lum * light);
  }
  attribute.needsUpdate = true;
}

/**
 * A build as one object: copies of its four part nodes (their own geometry, so a recolour never touches the kit), tinted
 * by its paint, and the engine sockets of its engines design (world positions of `_engine_` empties, for the plumes).
 */
export async function assembleHero(build: HeroBuild): Promise<{ object: THREE.Group; engines: THREE.Vector3[] }> {
  const gltf = await loadHeroKit(build.chassis);
  const defaults = HERO_DEFAULT_PAINT[build.chassis], paint = { ...defaults, ...build.paint };
  const primary = new THREE.Color(paint.primary), secondary = new THREE.Color(paint.secondary), glow = new THREE.Color(paint.glow);
  const object = new THREE.Group();
  object.name = `${build.chassis} ${HERO_SLOTS.map(slot => build.parts[slot]).join('')}`;
  for (const slot of HERO_SLOTS) {
    const node = gltf.scene.getObjectByName(heroPartNode(build.chassis, slot, build.parts[slot]));
    if (!node) continue;
    const copy = node.clone(true);
    copy.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
        const copied = (material as THREE.MeshStandardMaterial).clone();
        if (/glow/i.test(copied.name)) { copied.color.copy(glow); copied.emissive.copy(glow); copied.emissiveIntensity = 2.2; }
        return copied;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      if (paint.primary !== defaults.primary) tint(mesh.geometry, ROLE.primary, primary);
      if (paint.secondary !== defaults.secondary) tint(mesh.geometry, ROLE.secondary, secondary);
    });
    object.add(copy);
  }
  const engines: THREE.Vector3[] = [];
  const prefix = `${heroPartNode(build.chassis, 'engines', build.parts.engines)}_engine_`;
  gltf.scene.traverse(child => { if (child.name.startsWith(prefix)) engines.push(child.getWorldPosition(new THREE.Vector3())); });
  return { object, engines };
}

/** A seeded random build of a chassis (the hangar's "shuffle"). */
export function randomHeroBuild(chassis: HeroChassis, random = Math.random): HeroBuild {
  const pick = () => HERO_DESIGNS[Math.floor(random() * HERO_DESIGNS.length)];
  return { chassis, parts: { hull: pick(), wings: pick(), engines: pick(), cockpit: pick() } };
}
