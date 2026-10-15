import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createFallbackKit, extractKitNode } from '../../src/render/terrain-kit';
import { KIT, KIT_KINDS, kitNodeName, type KitKind } from '../../src/world/terrain';

const KIT_FILE = 'public/assets/khepri/khepri-kit.glb';
// Node built-ins without @types/node: a non-literal specifier keeps the typecheck dependency-free.
const fs: { existsSync(path: string): boolean; readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));

function expectContract(kind: KitKind, geometry: BufferGeometry) {
  for (const name of ['position', 'normal', 'color', 'glow']) expect(geometry.getAttribute(name)).toBeDefined();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  if (KIT[kind].exactTop) expect(box.max.y).toBeCloseTo(KIT[kind].height, 4);
  else expect(box.max.y).toBeLessThanOrEqual(KIT[kind].height + 1e-6);
  expect(box.min.y).toBeGreaterThan(-0.2);
  expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(KIT[kind].halfX + 1e-6);
  expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(KIT[kind].halfZ + 1e-6);
  // Crystals glow everywhere, fading with the shards' vertex brightness toward their base.
  if (kind === 'crystal') expect(Math.min(...geometry.getAttribute('glow').array)).toBeGreaterThan(0.3);
}

describe('Khepri kit integration', () => {
  it('provides fallback geometry for every contract node within the kit bounds', () => {
    const kit = createFallbackKit();
    for (const kind of KIT_KINDS) for (let variant = 0; variant < KIT[kind].variants; variant++) {
      const geometry = kit.get(kitNodeName(kind, variant));
      expect(geometry).toBeDefined();
      expectContract(kind, geometry!);
    }
  });

  it('normalizes a stray oversized export so the height cap holds, and keeps the mineral split', () => {
    const node = new Group(); node.position.set(5, 0, 3);
    const basalt = new Mesh(new BoxGeometry(3, 3, 3).translate(0, 1.5, 0), new MeshStandardMaterial({ name: 'khepri_basalt' }));
    const mineral = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshStandardMaterial({ name: 'khepri_mineral', color: 0x2fe0d4 }));
    node.add(basalt, mineral);
    const geometry = extractKitNode(node, 'clump')!;
    expectContract('clump', geometry);
    const glow = [...geometry.getAttribute('glow').array];
    expect(glow.filter(value => value === 1).length).toBe(mineral.geometry.index!.count);
    expect(glow.filter(value => value === 0).length).toBe(basalt.geometry.index!.count);
  });

  it.skipIf(!fs.existsSync(KIT_FILE))('extracts every contract node from the shipped Blender kit', async () => {
    const bytes = fs.readFileSync(KIT_FILE);
    const gltf = await new Promise<GLTF>((resolve, reject) =>
      new GLTFLoader().parse(bytes.slice().buffer, '', resolve, reject));
    const budget: Partial<Record<KitKind, number>> = { clump: 450, column: 80, rock: 60, crystal: 160, spire: 450, wall: 700, fallen: 200, boulder: 120, crystalSpire: 300, rosette: 600, hoodoo: 250 };
    const missing: string[] = [];
    for (const kind of KIT_KINDS) for (let variant = 0; variant < KIT[kind].variants; variant++) {
      const node = gltf.scene.getObjectByName(kitNodeName(kind, variant));
      // Nodes still being authored fall back at runtime; every node present must meet the contract.
      if (!node) { missing.push(kitNodeName(kind, variant)); continue; }
      const geometry = extractKitNode(node, kind);
      expect(geometry).not.toBeNull();
      expectContract(kind, geometry!);
      expect(geometry!.getAttribute('position').count / 3).toBeLessThanOrEqual(budget[kind] ?? Infinity);
    }
    for (const name of ['basalt_clump_0', 'basalt_column_0', 'rock_0', 'crystal_0']) expect(missing).not.toContain(name);
  });
});
