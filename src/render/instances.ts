import type * as THREE from 'three';

/**
 * Dynamic instanced data (performance, 30 October): three.js uploads a whole attribute when it has no update range, so
 * each frame re-sent every pool's full capacity (about 0.8 MB). Upload only the live instances, and skip drawing an
 * empty batch (an empty visible batch still costs its program and uniform setup every frame).
 */
export function liveInstances(mesh: THREE.InstancedMesh, count: number, extra: readonly (THREE.BufferAttribute | null | undefined)[] = []): void {
  mesh.count = count; mesh.visible = count > 0;
  for (const attribute of [mesh.instanceMatrix, mesh.instanceColor, ...extra]) {
    if (!attribute) continue;
    attribute.clearUpdateRanges();
    if (count > 0) { attribute.addUpdateRange(0, count * attribute.itemSize); attribute.needsUpdate = true; }
  }
}

/** The same for a line or point buffer drawn up to `vertices`: upload only that range, and draw nothing when empty. */
export function liveVertices(object: THREE.Object3D, geometry: THREE.BufferGeometry, vertices: number, names: readonly string[] = ['position', 'color']): void {
  geometry.setDrawRange(0, vertices); object.visible = vertices > 0;
  for (const name of names) {
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attribute) continue;
    attribute.clearUpdateRanges();
    if (vertices > 0) { attribute.addUpdateRange(0, vertices * attribute.itemSize); attribute.needsUpdate = true; }
  }
}
