import * as THREE from 'three';
import { SCENERY_MAX_HEIGHT, TERRAIN_MIN_HEIGHT } from '../world/terrain';

/** What the camera sees of the world between two heights: world x and forward s (= −z, relative to the camera's frame). */
export interface ViewFootprint { minX: number; maxX: number; minS: number; maxS: number }

const corner = new THREE.Vector3(), far = new THREE.Vector3(), direction = new THREE.Vector3();
/**
 * The ground footprint of the view (render only; 21 October, after the perspective lens let scenery pop in at the top and
 * corners): the four corner rays of the frustum, cut at the lowest ground and the highest scenery, bound the x and s any
 * scenery can show at. Under the orthographic camera this is the old rectangle plus the parallax of the heights; under a
 * perspective lens the far end is wider and reaches further ahead over low ground.
 */
export function viewFootprint(camera: THREE.Camera, low = TERRAIN_MIN_HEIGHT, high = SCENERY_MAX_HEIGHT + 1, out: ViewFootprint = { minX: 0, maxX: 0, minS: 0, maxS: 0 }): ViewFootprint {
  out.minX = out.minS = Infinity; out.maxX = out.maxS = -Infinity;
  for (const nx of [-1, 1]) for (const ny of [-1, 1]) {
    corner.set(nx, ny, -1).unproject(camera); far.set(nx, ny, 1).unproject(camera);
    direction.subVectors(far, corner);
    if (Math.abs(direction.y) < 1e-6) continue;
    for (const y of [low, high]) {
      const t = (y - corner.y) / direction.y;
      if (t < 0) continue;
      const x = corner.x + direction.x * t, s = -(corner.z + direction.z * t);
      out.minX = Math.min(out.minX, x); out.maxX = Math.max(out.maxX, x);
      out.minS = Math.min(out.minS, s); out.maxS = Math.max(out.maxS, s);
    }
  }
  return out;
}
