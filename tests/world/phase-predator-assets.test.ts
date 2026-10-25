import { describe, expect, it } from 'vitest';
// Match the existing asset tests: this browser project deliberately carries no Node ambient types.
const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));

describe('isolated Blender predator exports', () => {
  it.each([
    ['amnion/brood-heavy-v1.glb', 'amnion_brood_heavy'],
    ['umbra/wraith-v1.glb', 'umbra_wraith'],
  ])('%s contains only its own hierarchy and stays within its authored budget', (file, root) => {
    const buffer = fs.readFileSync(`public/assets/${file}`), decode = new TextDecoder();
    expect(decode.decode(buffer.subarray(0, 4))).toBe('glTF');
    const header = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const gltf = JSON.parse(decode.decode(buffer.subarray(20, 20 + header.getUint32(12, true))));
    expect(gltf.scenes).toHaveLength(1);
    expect(gltf.scenes[0].nodes).toHaveLength(1);
    expect(gltf.nodes[gltf.scenes[0].nodes[0]].name).toBe(root);
    expect(gltf.cameras ?? []).toHaveLength(0);
    expect(gltf.images ?? []).toHaveLength(0);
    let triangles = 0;
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) triangles += gltf.accessors[primitive.indices].count / 3;
    expect(triangles).toBeGreaterThan(5000);
    expect(triangles).toBeLessThan(16000);
    expect(buffer.length).toBeLessThan(400000);
  });
});
