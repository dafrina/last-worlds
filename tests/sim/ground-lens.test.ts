import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { configureCamera } from '../../src/render/scene';
import { LENS_FOLLOW, LENS_FOV, fromFlightPlane, toFlightPlane } from '../../src/shared/lens';
import { VIEW } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { spawnMembers } from '../../src/sim/spawn';
import { groundSeat, runRoute } from '../../src/world/run-route';

/** The release camera exactly as the renderer builds it, for a simulation camera x. */
function releaseCamera(cameraX: number) {
  const camera = new THREE.PerspectiveCamera(LENS_FOV, 9 / 16, 1, 260);
  configureCamera(camera, cameraX * LENS_FOLLOW);
  camera.updateProjectionMatrix();
  return camera;
}
const ndc = (camera: THREE.Camera, x: number, y: number, s: number) => new THREE.Vector3(x, y, -s).project(camera);

describe('ground enemies under the release lens (21 October)', () => {
  it('projects onto the flight plane exactly as the renderer camera does', () => {
    for (const cameraX of [-6, -2.5, 0, 3.7, 6]) {
      const camera = releaseCamera(cameraX);
      for (const [x, y, s] of [[-11, -9, 30], [-4, -3.6, 18], [0, 0.85, 6], [5, 2.4, -4], [11.5, -6, 24]]) {
        const seen = toFlightPlane(cameraX, x, y, s), a = ndc(camera, x, y, s), b = ndc(camera, seen.x, VIEW.flightHeight, seen.s);
        expect(b.x).toBeCloseTo(a.x, 9); expect(b.y).toBeCloseTo(a.y, 9);
        const back = fromFlightPlane(cameraX, seen.x, seen.s, y);
        expect(back.x).toBeCloseTo(x, 9); expect(back.s).toBeCloseTo(s, 9);
      }
    }
  });

  it('keeps each anchor fixed on the terrain while its gameplay position is the anchor seen through the lens', () => {
    for (const [mission, distance] of [['cold-vector', 120], ['deep-bloom', 200], ['bastion', 300]] as const) {
      const state = createRun({ mode: 'campaign', mission, seed: 8831 });
      state.distance = distance; state.time = distance / 5; state.enemies = []; state.player.invulnerableUntil = Infinity;
      state.nextEncounterAt = Infinity;
      spawnMembers(state, 'battery-3', 0, 1);
      const route = runRoute(state.config), ground = state.enemies.filter(enemy => enemy.ground);
      expect(ground.length).toBeGreaterThan(0);
      const fixed = new Map(ground.map(enemy => [enemy.id, { x: enemy.ground!.x, s: state.distance + enemy.ground!.s }]));
      for (let tick = 0; tick < 240; tick++) {
        stepRun(state, { horizontal: tick < 120 ? 1 : -1, specialPressed: false, pausePressed: false });
        for (const enemy of state.enemies) {
          const g = enemy.ground, start = fixed.get(enemy.id);
          if (!g || !start) continue;
          // Fixed in the world: the anchor never slides, whatever the camera does.
          expect(g.x).toBeCloseTo(start.x, 6); expect(state.distance + g.s).toBeCloseTo(start.s, 6);
          // On the ground (or a pontoon deck), never in the air.
          expect(g.base).toBeCloseTo(groundSeat(state.config.seed, route, g.x, state.distance + g.s).base, 6);
          // The gameplay position is the anchor's core seen through the lens.
          const seen = toFlightPlane(state.cameraX, g.x, g.base + enemy.groundHeight, g.s);
          expect(enemy.x).toBeCloseTo(seen.x, 9); expect(enemy.s).toBeCloseTo(seen.s, 9);
        }
      }
    }
  });
});
