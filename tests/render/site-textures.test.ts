import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { RunState } from '../../src/shared/contracts';
import { VIEW } from '../../src/shared/contracts';

// Each site file brings its own textures (atlas, normal map); the GLB loading is replaced by a box with a textured material.
const loaded: THREE.Texture[] = [];
vi.mock('../../src/render/models', () => ({
  loadTexturedNodes: async (_url: string, names: readonly string[]) => {
    const map = new THREE.Texture(), normalMap = new THREE.Texture();
    loaded.push(map, normalMap);
    return new Map(names.map(name => [name, [{ geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshStandardMaterial({ name: name.endsWith('_core') ? 'site_core_glow' : 'site_paint', emissive: 0xffffff, map, normalMap }) }]]));
  },
}));
const { createSiteView } = await import('../../src/render/site-view');

const view = { minX: -20, maxX: 20, minS: VIEW.minS - 3, maxS: VIEW.maxS + 6 };
const run = (tick: number) => ({ config: { mode: 'endless', seed: 1 }, tick, time: tick, distance: 100, enemies: [], effects: [] }) as unknown as RunState;

// Mobile performance pass (docs/36): a world left behind released its site templates' geometry and materials but not their
// textures, which stayed on the GPU for the session while a revisit loaded new ones (endless cycles its planets).
describe('strike-site textures across planet switches', () => {
  it('frees a left world\'s site textures with its templates', async () => {
    const scene = new THREE.Scene(), sites = createSiteView(scene, () => undefined);
    await sites.prepare('khepri');
    sites.update(run(1), 'khepri', view);
    const khepri = [...loaded];
    expect(khepri.length).toBeGreaterThan(0);
    const freed = new Set<THREE.Texture>();
    for (const texture of khepri) texture.addEventListener('dispose', () => freed.add(texture));
    // The next world is prefetched and flown: Khepri's sites are released, textures included.
    await sites.prepare('vesper');
    sites.update(run(2), 'vesper', view);
    expect(khepri.filter(texture => !freed.has(texture))).toEqual([]);
    // The current world's own textures stay.
    const vesper = loaded.filter(texture => !khepri.includes(texture)), live = new Set<THREE.Texture>();
    for (const texture of vesper) texture.addEventListener('dispose', () => live.add(texture));
    sites.update(run(3), 'vesper', view);
    expect(live.size).toBe(0);
  });
});
