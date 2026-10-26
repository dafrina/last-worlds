import { expect, it } from 'vitest';
import { MeshStandardMaterial, ShaderLib, WebGLRenderer } from 'three';
import { createTerrainMaterials } from '../../src/render/terrain-kit';
const fs: { readFileSync(path: string): Uint8Array; existsSync(path: string): boolean } = await import(['node', 'fs'].join(':'));

it('ships four isolated, bounded sharp cliff variants and retains the previous kit for rollback', () => {
  expect(fs.existsSync('public/assets/umbra/cliff-kit.glb')).toBe(true);
  const bytes = fs.readFileSync('public/assets/umbra/cliff-kit-v2.glb');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  expect(gltf.scenes).toHaveLength(1);
  expect(gltf.scenes[0].nodes.map((i: number) => gltf.nodes[i].name).sort()).toEqual(['void_wall_0', 'void_wall_1', 'void_wall_2', 'void_wall_3']);
  expect(gltf.images ?? []).toHaveLength(0);
  expect(gltf.cameras ?? []).toHaveLength(0);
  for (const mesh of gltf.meshes) {
    let tris = 0;
    for (const p of mesh.primitives) {
      tris += gltf.accessors[p.indices].count / 3;
      expect(p.attributes.NORMAL).toBeDefined();
      expect(p.attributes.COLOR_0).toBeDefined();
      const position = gltf.accessors[p.attributes.POSITION];
      expect(position.min[0]).toBeGreaterThanOrEqual(-1.051);
      expect(position.max[0]).toBeLessThanOrEqual(1.051);
      expect(position.min[1]).toBeGreaterThanOrEqual(-.151);
      expect(position.max[1]).toBeLessThanOrEqual(1.001);
    }
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThanOrEqual(650);
  }
  expect(bytes.length).toBeLessThan(160000);
});

it('replaces only the three floating-rock nodes with bounded broad shards', () => {
  const bytes = fs.readFileSync('public/assets/umbra/floating-shards-v2.glb');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  expect(gltf.scenes).toHaveLength(1);
  expect(gltf.scenes[0].nodes.map((i: number) => gltf.nodes[i].name).sort()).toEqual(['umb_float_0', 'umb_float_1', 'umb_float_2']);
  for (const mesh of gltf.meshes) {
    let count = 0;
    for (const p of mesh.primitives) {
      count += gltf.accessors[p.indices].count / 3;
      const a = gltf.accessors[p.attributes.POSITION];
      expect(a.min[0]).toBeGreaterThanOrEqual(-.841); expect(a.max[0]).toBeLessThanOrEqual(.841);
      expect(a.min[2]).toBeGreaterThanOrEqual(-.701); expect(a.max[2]).toBeLessThanOrEqual(.701);
      expect(a.min[1]).toBeGreaterThanOrEqual(-.001); expect(a.max[1]).toBeLessThanOrEqual(1.001);
      expect(p.attributes.NORMAL).toBeDefined(); expect(p.attributes.COLOR_0).toBeDefined();
    }
    expect(count).toBeLessThan(200);
  }
  expect(bytes.length).toBeLessThan(50000);
});

it('gives Umbra wall meshes the same deep fog as their floor, and restores the other worlds on switching', () => {
  const materials = createTerrainMaterials();
  const compile = (material: MeshStandardMaterial) => {
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader } as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    return shader.uniforms as Record<string, { value: unknown }>;
  };
  try {
    const ground = compile(materials.ground), wall = compile(materials.kit.userData.wallMaterial);
    const setPlanet = materials.ground.userData.setPlanet as (planet: string) => void;
    setPlanet('umbra');
    for (const key of ['hazeColor', 'hazeTop', 'hazeBottom', 'hazeStrength', 'hazeAbyss']) expect(wall[key].value).toEqual(ground[key].value);
    expect(wall.hazeAbyss.value).toBe(1);
    for (const planet of ['khepri', 'vesper', 'nacre', 'amnion', 'luna']) {
      setPlanet(planet);
      expect(wall.hazeAbyss.value).toBe(0); expect(ground.hazeAbyss.value).toBe(0);
      expect(wall.hazeStrength.value).toBe(.34);
    }
  } finally { materials.dispose(); }
});
