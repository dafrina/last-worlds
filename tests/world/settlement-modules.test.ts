import { describe, expect, it } from 'vitest';
import { BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MODULES, MODULE_HEIGHT, SHARED_BOUNDS, SHARED_NODES, moduleSize } from '../../src/world/terrain';
import { INFRA_NODES, VESPER_INFRA_NODES, extractNode } from '../../src/render/terrain-kit';

const fs: { existsSync(path: string): boolean; readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
async function nodes(file: string, names: readonly string[]): Promise<Map<string, BufferGeometry>> {
  const out = new Map<string, BufferGeometry>();
  if (!fs.existsSync(file)) return out;
  const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(fs.readFileSync(file).slice().buffer, '', resolve, reject));
  for (const name of names) {
    const node = gltf.scene.getObjectByName(name), geometry = node && extractNode(node, /light/i);
    if (geometry) out.set(name, geometry);
  }
  return out;
}

describe('settlement module registry (docs/23 §4.3)', () => {
  it('agrees with every legacy contract table, so it can be their single source', () => {
    for (const [node, height] of Object.entries(MODULE_HEIGHT)) expect(MODULES[node]?.top, node).toBe(height);
    for (const node of SHARED_NODES) {
      const bounds = SHARED_BOUNDS[node], spec = MODULES[node];
      expect([spec.half[0], spec.half[1], spec.top], node).toEqual([bounds.halfX, bounds.halfZ, bounds.height]);
    }
    for (const [node, { size }] of Object.entries(INFRA_NODES)) expect(moduleSize(node), node).toEqual(size);
    for (const [node, { size }] of Object.entries(VESPER_INFRA_NODES)) {
      const spec = MODULES[node];
      expect([spec.half[0] * 2, +(spec.top + spec.below).toFixed(2), spec.half[1] * 2], node).toEqual([...size]);
    }
    // The landmark shipped (district-kit.glb): no planned stand-in remains.
    expect(MODULES.khepri_processing_tower.planned).toBeUndefined();
  });

  it('puts the district pipe sockets on real surfaces of the shipped models', async () => {
    const infra = await nodes('public/assets/khepri/khepri-infra.glb', ['infra_refinery']);
    const shared = await nodes('public/assets/shared/industrial-kit.glb', ['facility', 'tank_vertical_0', 'tank_vertical_1']);
    const district = await nodes('public/assets/khepri/district-kit.glb', ['khepri_processing_tower']);
    if (!infra.size || !shared.size) return;
    const raycaster = new Raycaster(), material = new MeshBasicMaterial({ side: 2 });
    const checks: [string, BufferGeometry | undefined, Vector3, Vector3][] = [];
    for (const node of ['tank_vertical_0', 'tank_vertical_1']) for (const socket of MODULES[node].sockets) {
      const at = new Vector3(...socket.at), out = new Vector3(socket.at[0], 0, socket.at[2]).normalize();
      checks.push([`${node}.${socket.id}`, shared.get(node), at, out]);
    }
    // The header meets the hall's −x wall off centre (either way, with the layout mirrored).
    for (const z of [-0.4, 0, 0.4]) checks.push([`facility.w@${z}`, shared.get('facility'), new Vector3(-1.2, 0.35, z), new Vector3(-1, 0, 0)]);
    for (const socket of MODULES.infra_refinery.sockets) checks.push([`refinery.${socket.id}`, infra.get('infra_refinery'), new Vector3(...socket.at), new Vector3(0, 0, 1)]);
    // The processing tower's pipe stubs end in half flanges at the middle of each face.
    for (const socket of MODULES.khepri_processing_tower.sockets) {
      const out = new Vector3(socket.at[0], 0, socket.at[2]).normalize();
      checks.push([`tower.${socket.id}`, district.get('khepri_processing_tower'), new Vector3(...socket.at), out]);
    }
    for (const [name, geometry, at, out] of checks) {
      expect(geometry, name).toBeDefined();
      const mesh = new Mesh(geometry!, material);
      // From just outside the socket, straight in: the model's surface lies within 0.15 of the socket.
      raycaster.set(at.clone().addScaledVector(out, 0.5), out.clone().negate());
      const hit = raycaster.intersectObject(mesh, false)[0];
      expect(hit, name).toBeDefined();
      expect(Math.abs(hit.distance - 0.5), name).toBeLessThan(0.15);
    }
    material.dispose();
  });
});
