import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, OrthographicCamera, Scene } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { VIEW } from '../../src/shared/contracts';
import { configureCamera } from '../../src/render/scene';
import { createFallbackInfra, createFallbackShared, extractKitNode, type KitGeometries } from '../../src/render/terrain-kit';
import { createMaterials } from '../../src/render/models';
import { createTerrainView } from '../../src/render/terrain-view';
import { KIT, KIT_KINDS, kitNodeName } from '../../src/world/terrain';

const KIT_FILE = 'public/assets/khepri/khepri-kit.glb';
const fs: { existsSync(path: string): boolean; readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));

async function shippedKit(): Promise<KitGeometries | null> {
  if (!fs.existsSync(KIT_FILE)) return null;
  const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(fs.readFileSync(KIT_FILE).slice().buffer, '', resolve, reject));
  const kit: KitGeometries = new Map();
  for (const kind of KIT_KINDS) for (let v = 0; v < KIT[kind].variants; v++) {
    const node = gltf.scene.getObjectByName(kitNodeName(kind, v)), geometry = node && extractKitNode(node, kind);
    if (geometry) kit.set(kitNodeName(kind, v), geometry);
  }
  return kit;
}

/** Runs the real section streaming and strip culling against the gameplay camera, without WebGL. */
async function sweep(quality: 'high' | 'low', withKit: boolean) {
  const scene = new Scene(), material = new MeshBasicMaterial();
  const view = createTerrainView({ scene, groundMaterial: material, kitMaterial: material, infraMaterial: material, boundaryMaterial: material,
    sharedMaterial: material, roadMaterial: material, fallbackInfra: createFallbackInfra(createMaterials()), fallbackShared: createFallbackShared() });
  const kit = withKit ? await shippedKit() : null;
  if (kit) view.setKit(kit);
  view.setQuality(quality);
  const height = VIEW.width * 16 / 9, camera = new OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, height / 2, -height / 2, 0.1, 100);
  let calls = 0, triangles = 0, total = 0, samples = 0;
  for (const seed of [11, 93, 8831]) for (let distance = 0; distance < 200; distance += 4.5) for (let x = -12; x <= 12; x += 1.5) {
    view.update(seed, distance); configureCamera(camera, x); view.cull(camera); view.animate(distance / 4, x); view.cull(camera);
    calls = Math.max(calls, view.stats.calls); triangles = Math.max(triangles, view.stats.triangles);
    total += view.stats.triangles; samples++;
  }
  view.dispose();
  return { calls, triangles, average: total / samples, kit: view.stats.kit };
}

describe('terrain render budget (docs/13 §4)', () => {
  it('stays within 70 draw calls and 90k visible triangles on High across the whole lateral range', async () => {
    const high = await sweep('high', true);
    expect(high.calls).toBeLessThanOrEqual(70);
    expect(high.triangles).toBeLessThanOrEqual(90_000);
  }, 60_000);

  it('only ever reduces cost on Low and works with the fallback kit', async () => {
    const [high, low, fallback] = [await sweep('high', true), await sweep('low', true), await sweep('high', false)];
    expect(low.triangles).toBeLessThanOrEqual(high.triangles);
    expect(low.average).toBeLessThan(high.average);
    expect(fallback.kit).toBe('fallback');
    expect(fallback.calls).toBeLessThanOrEqual(70);
  }, 60_000);
});
