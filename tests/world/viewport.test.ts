import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { configureCamera, fitFlightViewport, groundForwardPosition } from '../../src/render/scene';
import { INCOMING_PICKUP_S } from '../../src/sim/pickup-placement';
import { LENS_FOV, flightTopEdge } from '../../src/shared/lens';
import { VIEW } from '../../src/shared/contracts';

const makeCamera = (perspective = false) => {
  const camera = perspective ? new THREE.PerspectiveCamera(20, 9 / 16, 1, 260)
    : new THREE.OrthographicCamera(-6, 6, 12 * 16 / 18, -12 * 16 / 18, .1, 100);
  configureCamera(camera, 0); return camera;
};
const pixel = (point: THREE.Vector3, camera: THREE.Camera, width: number, height: number) => {
  const p = point.clone().project(camera); return new THREE.Vector2((p.x + 1) * width / 2, (1 - p.y) * height / 2);
};

describe('device-sized flight camera', () => {
  it('scheduled supplies enter across the top edge on short and tall screens', () => {
    const camera = new THREE.PerspectiveCamera(LENS_FOV, 9 / 16, .1, 260);
    configureCamera(camera, 0);
    for (const height of [640, 844, 932]) {
      fitFlightViewport(camera, 390, height);
      const at = (s: number) => pixel(new THREE.Vector3(0, VIEW.flightHeight, -s), camera, 390, height).y;
      expect(at(flightTopEdge())).toBeCloseTo(0, 6);
      expect(at(INCOMING_PICKUP_S)).toBeLessThan(0);
      expect(at(flightTopEdge() - .1)).toBeGreaterThan(0);
    }
  });

  it.each([false, true])('extends the foreground without stretching ships or moving the approach (perspective=%s)', perspective => {
    const camera = makeCamera(perspective), width = 390, originalHeight = width * 16 / 9;
    const points = [new THREE.Vector3(-4, 3.8, -18), new THREE.Vector3(0, 3.8, 0), new THREE.Vector3(2, 1, -12)];
    const original = points.map(p => pixel(p, camera, width, originalHeight));
    for (const height of [700, 844, 932, originalHeight]) {
      fitFlightViewport(camera, width, height);
      for (const [i, point] of points.entries()) {
        const at = pixel(point, camera, width, height);
        // Same pixel displacement on both axes: the extra screen space cannot stretch a ship or its hit region.
        expect(at.x).toBeCloseTo(original[i].x, 6); expect(at.y).toBeCloseTo(original[i].y, 6);
      }
      const top = new THREE.Vector3(0, 1, -1).unproject(camera);
      expect(Number.isFinite(top.y)).toBe(true);
    }
  });

  it('keeps physical ground cores over their hit targets after every aspect and lateral camera change', () => {
    const camera = makeCamera();
    for (const [width, height] of [[320,568],[390,844],[430,932],[220,390],[480,853]]) {
      fitFlightViewport(camera, width, height);
      for (const x of [-9.5, 0, 9.5]) for (const coreHeight of [-6, 0, 1.5, 2.2]) {
        configureCamera(camera, x);
        const physical = new THREE.Vector3(x, coreHeight, -groundForwardPosition(12, coreHeight)).project(camera);
        const logical = new THREE.Vector3(x, VIEW.flightHeight, -12).project(camera);
        expect(physical.x).toBeCloseTo(logical.x, 6); expect(physical.y).toBeCloseTo(logical.y, 6);
      }
    }
  });
});
