import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOSS_ASSETS } from '../../src/render/boss-assets';
import { CRADLE_STYLE, bossDue, createCarrierView, walkInClearance } from '../../src/render/carrier-view';
import { WALK_IN } from '../../src/render/cradle-gait';
import { WALKER } from '../../src/render/cradle-walker';
import { configureCamera, fitFlightViewport, missionArena, rayPlacement } from '../../src/render/scene';
import { BOSSES } from '../../src/content/bosses';
import { arenaScroll, startBoss } from '../../src/sim/boss';
import { createRun } from '../../src/sim/game';
import { LENS_FOLLOW, LENS_FOV } from '../../src/shared/lens';
import { worldOf } from '../../src/world/terrain-planet';
import { SUN_DIRECTION } from '../../src/world/terrain';
import { asset, stubGltfDecoding } from '../helpers/assets';

stubGltfDecoding();

/** Amnion's sun (scene.ts LOOKS.amnion.sunElevation 29°, ahead and to the left): its shadows fall long to the lower right. */
const AMNION_SUN = (() => {
  const elevation = THREE.MathUtils.degToRad(29);
  return new THREE.Vector3(SUN_DIRECTION.x, 0, -SUN_DIRECTION.s).normalize().multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation));
})();

/**
 * How many of the walker's drawn vertices (its legs as skinned), or of their sun shadows on its floor, project inside
 * the camera's frame.
 */
function seen(root: THREE.Object3D, camera: THREE.Camera, floor: number): number {
  let count = 0;
  const v = new THREE.Vector3(), shadow = new THREE.Vector3();
  const inside = (p: THREE.Vector3) => { const q = p.project(camera); return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && Math.abs(q.z) <= 1; };
  root.traverseVisible(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (mesh as THREE.SkinnedMesh).skeleton.update();
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
      shadow.copy(v).addScaledVector(AMNION_SUN, -Math.max(0, v.y - floor) / AMNION_SUN.y);
      if (inside(v) || inside(shadow)) count++;
    }
  });
  return count;
}

/**
 * THE CRADLE's walk-in through the real view, rig and camera (user, 18 November: "on mobile the cradle pops in when half
 * on screen already"): Brood Strike from the walk-in's lead before the arrival, with the ship (and the camera) held at
 * one x, the seat as scene.ts gives it (before the arrival its arrival seat carried with the ground).
 */
describe('THE CRADLE walk-in (render-only)', () => {
  const screens = [[390, 844], [360, 780], [405, 720]] as const;
  it.each(screens)('starts wholly out of sight at %ix%i and walks in at its heavy pace, at its post by the arrival\'s end', async (width, height) => {
    const model = await asset(BOSS_ASSETS.cradle);
    const def = BOSSES.cradle;
    for (const cameraX of [-6, -3, 0, 1.5, 3, 6]) {
      const camera = new THREE.PerspectiveCamera(LENS_FOV, 9 / 16, .1, 260);
      fitFlightViewport(camera, width, height); configureCamera(camera, cameraX * LENS_FOLLOW);
      const scene = new THREE.Scene(), view = createCarrierView(scene, CRADLE_STYLE, { camera: () => camera, sun: () => AMNION_SUN });
      view.setModel(model.clone(true));
      const run = createRun({ mode: 'campaign', mission: 'brood-strike', seed: 4242, difficulty: 'standard' });
      const world = worldOf({ planet: 'amnion', arena: missionArena(run.config) });
      run.cameraX = cameraX;
      const root = scene.getObjectByName(CRADLE_STYLE.name)!;
      let first = true, lastX = 0, fastest = 0, seatX = 0;
      for (let tick = 0; tick <= (WALK_IN.lead + WALK_IN.end + .2) * 60; tick++) {
        run.time = def.arrivesAt - WALK_IN.lead + tick / 60;
        run.distance = arenaScroll(run.time, null, def.arena).distance;
        if (run.time >= def.arrivesAt) startBoss(run, def);
        let seat: { x?: number; s: number; baseHeight: number }, arrivesAt: number | null = null;
        if (run.boss) seat = rayPlacement(camera, run.config.seed, run.distance, run.boss.x, run.boss.s, WALKER.targetHeight, WALKER.floor, world);
        else {
          const due = bossDue(run)!;
          const early = rayPlacement(camera, run.config.seed, due.distance, 0, def.entryS, WALKER.targetHeight, WALKER.floor, world);
          seat = { ...early, s: early.s + due.distance - run.distance }; arrivesAt = due.at;
        }
        view.update(run, seat, null, arrivesAt);
        // (Shown from its lead before the arrival on, give or take a tick.)
        if (!root.visible) { expect(first && tick < 2).toBe(true); continue; }
        root.updateMatrixWorld(true);
        if (first) {
          // Its first frame: body, legs (as skinned), contact shadow and cast shadow all beyond the frame.
          expect(seen(root, camera, seat.baseHeight), `${width}x${height} camera ${cameraX}: vertices in view at its start`).toBe(0);
          // From the side away from where the view looks (the side its shadow trails on when the view is near its post).
          if (Math.abs(cameraX) > 2) expect(Math.sign(root.position.x - (seat.x ?? 0)), `${width}x${height} camera ${cameraX}: side`).toBe(cameraX > 0 ? -1 : 1);
          first = false;
        } else fastest = Math.max(fastest, Math.abs(root.position.x - lastX) * 60);
        lastX = root.position.x; seatX = seat.x ?? 0;
      }
      expect(fastest, `${width}x${height} camera ${cameraX}: fastest`).toBeLessThanOrEqual(WALK_IN.speed + .01);
      expect(fastest).toBeGreaterThan(WALK_IN.speed * .95);
      expect(Math.abs(lastX - seatX), 'at its post').toBeLessThan(1e-9);
      view.dispose();
    }
  });

  it('measures how far out of sight it must start from the actual camera: further when the view looks at it', () => {
    const outline = [-1, 1].flatMap(x => [-1, 1].flatMap(z => [new THREE.Vector3(x * 6, 0, z * 5), new THREE.Vector3(x * 6, 6, z * 5)]));
    const camera = new THREE.PerspectiveCamera(LENS_FOV, 9 / 16, .1, 260);
    fitFlightViewport(camera, 390, 844);
    const seat = new THREE.Vector3(0, WALKER.floor, -15);
    configureCamera(camera, 0);
    const centred = walkInClearance(camera, seat, 1, outline);
    expect(walkInClearance(camera, seat, -1, outline)).toBeCloseTo(centred, 6);
    // Just beyond it every point is out of the frame; just short of it one is not.
    const at = (offset: number) => outline.map(p => p.clone().add(seat).setX(seat.x + offset + p.x).project(camera).x);
    expect(Math.min(...at(centred + .01))).toBeGreaterThan(1);
    expect(Math.min(...at(centred - .01))).toBeLessThan(1);
    configureCamera(camera, 6 * LENS_FOLLOW);
    expect(walkInClearance(camera, seat, -1, outline)).toBeLessThan(centred - 5);
    expect(walkInClearance(camera, seat, 1, outline)).toBeGreaterThan(centred + 5);
  });
});
