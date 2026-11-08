import type * as THREE from 'three';
import { DynamicDrawUsage } from 'three';

const NONE: readonly THREE.BufferAttribute[] = [], LINE_ATTRIBUTES: readonly string[] = ['position', 'color'];

/**
 * Dynamic instanced data (performance, 30 October): three.js uploads a whole attribute when it has no update range, so
 * each frame re-sent every pool's full capacity (about 0.8 MB). Upload only the live instances, and skip drawing an
 * empty batch (an empty visible batch still costs its program and uniform setup every frame).
 */
export function liveInstances(mesh: THREE.InstancedMesh, count: number, extra: readonly (THREE.BufferAttribute | null | undefined)[] = NONE): void {
  mesh.count = count; mesh.visible = count > 0;
  // Called for every batch every frame (docs/38 PF3): no list of the attributes is built.
  liveRange(mesh.instanceMatrix, count); liveRange(mesh.instanceColor, count);
  for (const attribute of extra) liveRange(attribute, count);
}
/** Uploads an attribute's first `count` items (its update range), or nothing when `count` is 0. */
function liveRange(attribute: THREE.BufferAttribute | null | undefined, count: number): void {
  if (!attribute) return;
  attribute.clearUpdateRanges();
  if (count > 0) { attribute.addUpdateRange(0, count * attribute.itemSize); attribute.needsUpdate = true; }
}

/** The same for a line or point buffer drawn up to `vertices`: upload only that range, and draw nothing when empty. */
export function liveVertices(object: THREE.Object3D, geometry: THREE.BufferGeometry, vertices: number, names: readonly string[] = LINE_ATTRIBUTES): void {
  geometry.setDrawRange(0, vertices); object.visible = vertices > 0;
  for (const name of names) liveRange(geometry.getAttribute(name) as THREE.BufferAttribute | undefined, vertices);
}

/**
 * A batch whose instances are rewritten every frame (docs/38 R4): dynamic matrix usage, never culled as a whole (its
 * instances span the view), nothing drawn until a frame fills it. The caller adds its name, order and shadows.
 */
export function dynamicBatch<T extends THREE.InstancedMesh>(mesh: T): T {
  mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
  return mesh;
}
