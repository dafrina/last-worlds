import { afterAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { bastionPlacement, groundForwardPosition, groundPlacement } from '../../src/render/scene';
import { BASTION } from '../../src/content/bastion';
import { createSilhouetteMaterial } from '../../src/render/craft-shadows';
import { createBastionView } from '../../src/render/bastion-view';
import { createWardenView } from '../../src/render/warden-view';
import { createVeilView } from '../../src/render/veil-view';
import { createArkView } from '../../src/render/ark-view';
import { BOSS_ASSETS } from '../../src/render/boss-assets';
import { BASTION_FOOTPRINT } from '../../src/render/bastion-view';
import { terrainHeight } from '../../src/world/terrain';
import type { Enemy, RunState } from '../../src/shared/contracts';

const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
// Geometry and rigs in Node; image decoding is Chromium's (as in tests/world/cinematic-assets.test.ts).
vi.stubGlobal('self', globalThis);
vi.stubGlobal('createImageBitmap', async () => ({ width: 512, height: 512, close() {} }));
afterAll(() => vi.unstubAllGlobals());
async function asset(path: string) {
  const bytes = fs.readFileSync(`public/assets/${path}`);
  return (await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.slice().buffer, '', resolve, reject))).scene;
}
const materialsOf = (object: THREE.Object3D) => {
  const material = (object as THREE.Mesh).material;
  return Array.isArray(material) ? material : material ? [material] : [];
};

// Mobile performance pass (docs/36): three.js draws a transparent double-sided built-in material twice a frame (back faces,
// then front faces) and looks its program up again before each; a material drawn both instanced and as a single mesh
// switches its program twice a frame. Neither changes a pixel here, so neither may come back.
describe('draws without redundant passes or program switches', () => {
  it('draws Low silhouettes and the bosses\' flat rings in one pass', () => {
    expect(createSilhouetteMaterial().forceSinglePass).toBe(true);
    // WARDEN-1's hazard stripes paint a canvas: a blank one stands in.
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const scene = new THREE.Scene();
    createBastionView(scene); createWardenView(scene); createVeilView(scene);
    const twoPass: string[] = [];
    scene.traverse(object => {
      for (const material of materialsOf(object)) if (material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass) twoPass.push(`${object.name || object.type}: ${material.type}`);
    });
    expect(twoPass).toEqual([]);
  });

  it('keeps every boss\'s empty particle layers out of the render list', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const scene = new THREE.Scene();
    createBastionView(scene); createWardenView(scene); createVeilView(scene); createArkView(scene);
    // Nothing is flying: an empty batch still costs a render-list entry and a program setup a frame, so none may be drawn.
    const drawn: string[] = [];
    const walk = (object: THREE.Object3D) => {
      if (!object.visible) return;
      if ((object as THREE.InstancedMesh).isInstancedMesh && (object as THREE.InstancedMesh).count === 0) drawn.push(object.name || object.type);
      object.children.forEach(walk);
    };
    walk(scene);
    expect(drawn).toEqual([]);
  });

  it('seats the Bastion on the same highest ground, walked row by row', () => {
    // The previous column-by-column walk over the footprint, as a reference: the same points, so exactly the same seat.
    const reference = (seed: number, distance: number, x: number, logicalS: number, arena: { fromS: number; toS: number }) => {
      let { s } = groundPlacement(seed, distance, x, logicalS, BASTION.targetHeight, arena), baseHeight = -Infinity;
      for (let pass = 0; pass < 3; pass++) {
        baseHeight = -Infinity;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
          const dx = i / 2 * (BASTION_FOOTPRINT.halfWidth - .2), dz = j / 2 * (BASTION_FOOTPRINT.halfDepth - .2);
          baseHeight = Math.max(baseHeight, terrainHeight(seed, x + dx, distance + s - dz, arena));
        }
        s = groundForwardPosition(logicalS, baseHeight + BASTION.targetHeight);
      }
      return { baseHeight, s };
    };
    const arena = { fromS: 560, toS: 610 };
    for (const [distance, x, s] of [[590, 0, 12], [590, .75, 13.5], [540, -2.3, 9.1], [700, 3.1, 15]] as const)
      expect(bastionPlacement(4242, distance, x, s, arena)).toEqual(reference(4242, distance, x, s, arena));
  });

  it('gives the Bastion\'s track links their own materials with their guns\' look', async () => {
    const scene = new THREE.Scene(), bastion = createBastionView(scene);
    bastion.setModel(await asset(BOSS_ASSETS.bastion));
    const root = scene.getObjectByName('Bastion-9') ?? scene;
    const instanced = new Set<THREE.Material>(), single = new Set<THREE.Material>();
    root.traverse(object => { if ((object as THREE.Mesh).isMesh) for (const material of materialsOf(object)) ((object as THREE.InstancedMesh).isInstancedMesh ? instanced : single).add(material); });
    expect(instanced.size).toBeGreaterThan(0);
    expect([...instanced].filter(material => single.has(material)).map(material => material.name)).toEqual([]);
    // A battery under fire: its heat (and the hull's glow) reach the links' copies exactly.
    const part = (bossPart: Enemy['bossPart'], x: number, hp: number, warning = 0) => ({ id: x + 10, kind: 'turret', x, s: 13, originX: x, hp, maxHp: 100, radius: .8, age: 1,
      nextAttack: 9, warning, aimX: 0, groundHeight: 0, bossPart }) as unknown as Enemy;
    const state = { config: { mode: 'campaign', seed: 1 }, tick: 600, time: 10, distance: 590, scrollSpeed: 0, effects: [], projectiles: [], hazards: [],
      boss: { id: 'bastion', phase: 'batteries', startedAt: 2, phaseStartedAt: 5, x: 0, s: 13, vs: 0, vx: 0 },
      enemies: [part('left', -2, 40, 1), part('right', 2, 90), part('core', 0, 100)] } as unknown as RunState;
    bastion.update(state, { baseHeight: 0, s: 13 });
    // Each side's links still look exactly like that battery's gun, which wore the same material before.
    const look = (name: string) => {
      const m = (scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      return [m.name, m.color.getHex(), m.emissive.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.envMapIntensity, m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.vertexColors];
    };
    for (const side of ['left', 'right']) expect(look(`bastion_track_link_${side}_0_moving`), side).toEqual(look(`bastion_gun_${side}_1`));
  });
});
