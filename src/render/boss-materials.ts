import * as THREE from 'three';
import type { BossPart } from '../shared/contracts';

/** Keep the approved PBR atlases, including normals and metallic/roughness maps.
 * Only damageable parts need private material instances. All textures remain shared.
 */
export function retainBossMaterials(model: THREE.Group, prefix: string, partOf: (name: string) => BossPart | null) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), geometries = new Set<THREE.BufferGeometry>();
  const copies = new Map<string, THREE.MeshStandardMaterial>(), heat = new Map<BossPart, THREE.MeshStandardMaterial>();
  const hull: THREE.MeshStandardMaterial[] = [];
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    let owner: THREE.Object3D | null = object;
    while (owner && !owner.name.startsWith(prefix)) owner = owner.parent;
    const name = owner?.name ?? '', part = partOf(name), wreck = name.endsWith('_wreck');
    const retained = (Array.isArray(object.material) ? object.material : [object.material]).map(original => {
      const source = original as THREE.MeshStandardMaterial;
      materials.add(source);
      for (const value of Object.values(source)) if (value instanceof THREE.Texture) textures.add(value);
      const key = `${source.uuid}:${part ?? 'hull'}:${wreck}`;
      let material = copies.get(key);
      if (!material) {
        material = source.clone(); materials.add(material); copies.set(key, material);
        material.envMapIntensity = .85;
        if (wreck) { material.color.multiplyScalar(.18); material.emissiveIntensity = 0; material.roughness = 1; material.metalness = .2; }
        else if (part && (!heat.has(part) || /glow/i.test(source.name))) heat.set(part, material);
        else if (!part) hull.push(material);
      }
      return material;
    });
    object.material = Array.isArray(object.material) ? retained : retained[0];
    object.castShadow = !/glow/i.test(retained[0].name); object.receiveShadow = true;
  });
  return { heat, hull, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); } };
}
