import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SUN, blobLanding, liveInstances } from '../../src/render/scene';

describe('Low-tier craft shadow placement', () => {
  it('lands where the sun ray through the craft meets flat ground', () => {
    const at = blobLanding(SUN, 1, 5, 3.8, () => 0);
    // A point on the ray from the craft away from the sun, at ground height.
    const t = 3.8 / SUN.y;
    expect(at.y).toBe(0);
    expect(at.x).toBeCloseTo(1 - SUN.x * t, 6);
    expect(at.s).toBeCloseTo(5 + SUN.z * t, 6);
  });
  it('shortens the offset over raised ground and follows a lower sun further', () => {
    const flat = blobLanding(SUN, 0, 0, 3.8, () => 0), raised = blobLanding(SUN, 0, 0, 3.8, () => 2);
    expect(Math.hypot(raised.x, raised.s)).toBeLessThan(Math.hypot(flat.x, flat.s));
    const low = new THREE.Vector3(SUN.x, 0, SUN.z).normalize().multiplyScalar(Math.cos(.5)).setY(Math.sin(.5));
    const longer = blobLanding(low, 0, 0, 3.8, () => 0);
    expect(Math.hypot(longer.x, longer.s)).toBeGreaterThan(Math.hypot(flat.x, flat.s));
  });
});

describe('dynamic instance uploads', () => {
  it('uploads only the live instances and hides an empty batch', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 64);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    const version = mesh.instanceMatrix.version;
    liveInstances(mesh, 3);
    expect(mesh.visible).toBe(true);
    expect(mesh.count).toBe(3);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 48 }]);
    expect(mesh.instanceColor!.updateRanges).toEqual([{ start: 0, count: 9 }]);
    expect(mesh.instanceMatrix.version).toBeGreaterThan(version);
    const after = mesh.instanceMatrix.version;
    liveInstances(mesh, 0);
    expect(mesh.visible).toBe(false);
    expect(mesh.instanceMatrix.version).toBe(after);
  });
});
