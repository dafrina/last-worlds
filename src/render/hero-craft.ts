import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { craftFromScene, type NacreCraft } from './models';
import { ROLE, loadHeroKit, tint } from './hero-assembly';
import { DEFAULT_LOOK, HERO_DEFAULT_PAINT, HERO_SLOTS, heroPartNode } from '../content/hero-parts';
import type { HeroLook, ShipId } from '../shared/contracts';

/**
 * A ship's look as one craft in the shared craft format (one draw, docs/31): its four kit parts repainted and merged, and
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
