import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, OrthographicCamera, Scene } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { VIEW } from '../../src/shared/contracts';
import { configureCamera } from '../../src/render/scene';
import { INFRA_NODES, createFallbackInfra, createFallbackShared, extractKitNode, extractNode, extractSharedNode, type KitGeometries } from '../../src/render/terrain-kit';
import { createMaterials } from '../../src/render/models';
import { createTerrainView } from '../../src/render/terrain-view';
import { KIT, KIT_KINDS, SHARED_NODES, kitNodeName } from '../../src/world/terrain';

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

/** The shipped infrastructure and shared industrial nodes (district sweeps count their real triangles). */
async function shippedNodes(file: string, names: readonly string[], extract: (node: import('three').Object3D) => import('three').BufferGeometry | null): Promise<KitGeometries> {
  const nodes: KitGeometries = new Map();
  if (!fs.existsSync(file)) return nodes;
  const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(fs.readFileSync(file).slice().buffer, '', resolve, reject));
  for (const name of names) { const node = gltf.scene.getObjectByName(name), geometry = node && extract(node); if (geometry) nodes.set(name, geometry); }
  return nodes;
}

/** Runs the real section streaming and strip culling against the gameplay camera, without WebGL. */
async function sweep(quality: 'high' | 'low', withKit: boolean, seeds: readonly number[] = [11, 93, 8831], from = 0, to = 200, infrastructure = false) {
  const scene = new Scene(), material = new MeshBasicMaterial();
  const view = createTerrainView({ scene, groundMaterial: material, kitMaterial: material, infraMaterial: material, boundaryMaterial: material,
    sharedMaterial: material, roadMaterial: material, fallbackInfra: createFallbackInfra(createMaterials()), fallbackShared: createFallbackShared() });
  const kit = withKit ? await shippedKit() : null;
  if (kit) view.setKit(kit);
  if (infrastructure) {
    view.setInfra(await shippedNodes('public/assets/khepri/khepri-infra.glb', Object.keys(INFRA_NODES), node => extractNode(node, /light/i)));
    view.setShared(await shippedNodes('public/assets/shared/industrial-kit.glb', SHARED_NODES, node => extractSharedNode(node)));
  }
  view.setQuality(quality);
  const height = VIEW.width * 16 / 9, camera = new OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, height / 2, -height / 2, 0.1, 100);
  let calls = 0, triangles = 0, total = 0, samples = 0;
  for (const seed of seeds) for (let distance = from; distance < to; distance += 4.5) for (let x = -12; x <= 12; x += 1.5) {
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

  it('stays within the budget over refinery districts with the shipped models, and Low costs less there (docs/23)', async () => {
    // Seeds 11 and 93 hold a district in slot 0 (s 498–535 and 494–531 since terrain version 13).
    const high = await sweep('high', true, [11, 93], 470, 600, true), low = await sweep('low', true, [11, 93], 470, 600, true);
    expect(high.calls).toBeLessThanOrEqual(70);
    expect(high.triangles).toBeLessThanOrEqual(90_000);
    expect(low.triangles).toBeLessThanOrEqual(high.triangles);
    expect(low.average).toBeLessThan(high.average);
    console.info(`district sweep: High ≤ ${high.calls} calls / ${high.triangles} tris (avg ${Math.round(high.average)}), Low ≤ ${low.calls} / ${low.triangles}`);
  }, 120_000);
});
