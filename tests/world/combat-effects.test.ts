import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createFx } from '../../src/render/fx-particles';
import { createRun } from '../../src/sim/game';
import { startBoss } from '../../src/sim/bastion';
import { particleLayer } from '../../src/render/bastion-view';
import { createJumpFx } from '../../src/render/fx-jump';
import { HERO_STENCIL } from '../../src/render/hero-stencil';

it('boss death smoke follows exact world distance even when the presentation clock is paused', () => {
  const scene = new THREE.Scene(), fx = createFx(scene);
  const state = createRun({ mode: 'campaign', mission: 'bastion', seed: 2 });
  startBoss(state); state.boss!.phase = 'destroyed';
  state.effects.push({ id: state.nextId++, kind: 'bossBlast', x: 0, s: 12, ttl: 3, duration: 3 });
  fx.update(state, []);
  // A destroyed boss burns in the wreck layer, which draws around the hero (user, 27 October: the ship flew under it).
  const smoke = scene.getObjectByName('fx wreck smoke') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  expect(smoke.count).toBeGreaterThan(0);
  expect((scene.getObjectByName('fx smoke') as THREE.InstancedMesh).count).toBe(0);
  expect(smoke.material.stencilWrite && smoke.material.stencilFunc).toBe(THREE.NotEqualStencilFunc);
  expect(smoke.material.stencilRef).toBe(HERO_STENCIL);
  const before = new THREE.Matrix4(), after = new THREE.Matrix4(); smoke.getMatrixAt(0, before);
  state.distance += 47; state.tick++; state.scrollSpeed = 999;
  fx.update(state, []); smoke.getMatrixAt(0, after);
  expect(after.elements[14] - before.elements[14]).toBeCloseTo(47, 4);
  expect(after.elements[12]).toBe(before.elements[12]);
  fx.dispose();
});

it('launch warp is opaque and cannot be depth-occluded by tall terrain', () => {
  const scene = new THREE.Scene(), jump = createJumpFx(scene);
  const state = createRun({ mode: 'campaign', mission: 'final-horizon', seed: 2 });
  jump.launch('cruise'); jump.update(state, true, true);
  const veil = scene.getObjectByName('jump veil') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  expect(veil.visible).toBe(true);
  expect(veil.material.uniforms.veil.value).toBe(1);
  expect(veil.material.depthTest).toBe(false);
  jump.dispose();
});

it('new wreck puffs are not shifted twice during a fast departure', () => {
  const scene = new THREE.Scene(), layer = particleLayer(scene, 8, false);
  const puff = { x:0,y:1,z:-12,vx:0,vy:0,vz:0,life:4,size:1,grow:0,alpha:1,color:0xffffff,drag:0,lift:0 };
  layer.emit(puff); layer.step(0,0);
  layer.shift(8);
  layer.emit({...puff,z:-4}); layer.step(0,0);
  const mesh = scene.children[0] as THREE.InstancedMesh;
  const a = new THREE.Matrix4(), b = new THREE.Matrix4();
  mesh.getMatrixAt(0,a); mesh.getMatrixAt(1,b);
  expect(a.elements[14]).toBe(-4);
  expect(b.elements[14]).toBe(-4);
  layer.clear(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose();
});
