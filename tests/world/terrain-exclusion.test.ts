import { describe, expect, it } from 'vitest';
import { InstancedMesh, MeshBasicMaterial, OrthographicCamera, Scene } from 'three';
import { VIEW } from '../../src/shared/contracts';
import { configureCamera } from '../../src/render/scene';
import { createFallbackInfra, createFallbackShared } from '../../src/render/terrain-kit';
import { createMaterials } from '../../src/render/models';
import { createTerrainView } from '../../src/render/terrain-view';
import { generateTerrainSection } from '../../src/world/terrain';

/** World (x, s) pivots of every drawn scenery instance. */
function drawn(scene: Scene, distance: number) {
  const group = scene.getObjectByName('Khepri instanced scenery')!, pivots: [number, number][] = [];
  group.traverse(object => {
    const mesh = object as InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.visible) return;
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) pivots.push([m[i * 16 + 12], distance - (m[i * 16 + 14] + group.position.z)]);
  });
  return pivots;
}

describe('terrain exclusion (boss arena)', () => {
  it('hides scenery instances under the rectangle while set, restores them when cleared, and leaves generation alone', () => {
    const scene = new Scene(), material = new MeshBasicMaterial();
    const view = createTerrainView({ scene, groundMaterial: material, kitMaterial: material, infraMaterial: material,
      sharedMaterial: material, roadMaterial: material, fallbackInfra: createFallbackInfra(createMaterials()), fallbackShared: createFallbackShared() });
    const height = VIEW.width * 16 / 9, camera = new OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, height / 2, -height / 2, 0.1, 100);
    const seed = 93, distance = 60, before = generateTerrainSection(seed, 2);
    view.update(seed, distance); configureCamera(camera, 0); view.cull(camera);
    const all = drawn(scene, distance), rect = { minX: -4, maxX: 4, minS: distance + 2, maxS: distance + 12 };
    const inside = ([x, s]: [number, number]) => x > rect.minX && x < rect.maxX && s > rect.minS && s < rect.maxS;
    expect(all.filter(inside).length).toBeGreaterThan(3);

    view.setExclusion(rect); view.cull(camera);
    const kept = drawn(scene, distance);
    expect(kept.filter(inside)).toEqual([]);
    expect(kept.length).toBeLessThan(all.length);
    // Small moves (a drifting fortress) reuse the last compaction; clearing restores everything.
    view.setExclusion({ ...rect, minX: rect.minX + 0.1, maxX: rect.maxX + 0.1 }); view.cull(camera);
    expect(drawn(scene, distance).length).toBe(kept.length);
    view.setExclusion(null); view.cull(camera);
    expect(drawn(scene, distance).length).toBe(all.length);
    expect(generateTerrainSection(seed, 2)).toEqual(before);
    view.dispose();
  });
});
