import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HELION_ARK } from '../../src/content/ark';
import { VIEW } from '../../src/shared/contracts';
import { lensEye, toFlightPlane } from '../../src/shared/lens';
import { createRun } from '../../src/sim/game';
import { startBoss } from '../../src/sim/boss';
import { BOSS_ASSETS } from '../../src/render/boss-assets';
import { STRONGHOLD_FOOTPRINT, createStrongholdView } from '../../src/render/stronghold-view';
import { STRONGHOLD_AT, STRONGHOLD_BASE, STRONGHOLD_BUILT_AT, STRONGHOLD_BUILT_SEA, STRONGHOLD_SCALE } from '../../src/world/terrain-vesper';
import { SEAT_A, SEAT_ROWS, SEAT_STEP, SEAT_X } from '../../src/world/stronghold-seat';
import { terrainHeight } from '../../src/world/terrain';
import { asset, stubGltfDecoding } from '../helpers/assets';

stubGltfDecoding();

/**
 * HELION STRONGHOLD's placement (docs/17 §5): the renderer seats the model at STRONGHOLD_AT past its arena's start, scaled
 * by STRONGHOLD_SCALE onto its ledge (its foot at STRONGHOLD_BASE), and with the camera centred (where it rests through most
 * of a fight) the release lens sees each weak point of the model on its combat target. The model's frame: glTF (y up, +z
 * toward the player); s = the seat − z.
 */
const SEAT = STRONGHOLD_AT - 9;   // its origin past the player's row at the stop (the stop is 9 past the arena's start)
const ROW = HELION_ARK.row, K = STRONGHOLD_SCALE;
/** A point of the model (its own frame) as seated, in the lens frame at the stop. */
const seated = (p: THREE.Vector3) => ({ x: K * p.x, y: STRONGHOLD_BASE + K * p.y, s: SEAT - K * p.z });
const onPlane = (object: THREE.Object3D) => {
  const p = seated(object.getWorldPosition(new THREE.Vector3()));
  return toFlightPlane(0, p.x, p.y, p.s);
};

describe('HELION STRONGHOLD placement', () => {
  it('seats the reactor\'s aim and each cannon\'s gun on their combat targets as the centred lens sees them', async () => {
    const model = await asset(BOSS_ASSETS.ark);
    model.updateMatrixWorld(true);
    const aim = onPlane(model.getObjectByName('stronghold_core_aim')!);
    expect(aim.x).toBeCloseTo(0, 3);
    expect(aim.s).toBeCloseTo(ROW + HELION_ARK.bridgeS, 1);
    for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
      // The gun's breech (its recoil pivot) and its muzzle: on the cannon's column, the breech on the cannon's row.
      const breech = onPlane(model.getObjectByName(`stronghold_gun_${side}`)!), muzzle = onPlane(model.getObjectByName(`stronghold_muzzle_${side}`)!);
      expect(breech.x).toBeCloseTo(sign * HELION_ARK.radiatorOffset, 1);
      expect(Math.abs(breech.s - (ROW + HELION_ARK.radiatorS))).toBeLessThan(0.15);
      expect(Math.abs(muzzle.x - sign * HELION_ARK.radiatorOffset)).toBeLessThan(0.15);
      // The barrel points at the player: its muzzle is well down the screen from its breech.
      expect(breech.s - muzzle.s).toBeGreaterThan(2);
    }
    // Lifted onto its ledge it stays under the flight plane: its top (the bridge) 0.4 under it, its foot on the ledge.
    const box = new THREE.Box3().setFromObject(model);
    expect(STRONGHOLD_BASE + K * box.max.y).toBeLessThan(VIEW.flightHeight - 0.4);
    expect(STRONGHOLD_BASE).toBeCloseTo(STRONGHOLD_BUILT_SEA + 2, 9);
  });

  it('fits the ground to the model\'s measured top (src/world/stronghold-seat.ts holds the model as built, its foot at the sea)', async () => {
    const model = await asset(BOSS_ASSETS.ark);
    model.updateMatrixWorld(true);
    const meshes: THREE.Object3D[] = [];
    model.traverse(object => { if ((object as THREE.Mesh).isMesh && !/wreck|chamber|core|gun|muzzle/.test(object.name)) meshes.push(object); });
    const ray = new THREE.Raycaster();
    let differ = 0;
    SEAT_ROWS.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        ray.set(new THREE.Vector3(-SEAT_X + i * SEAT_STEP, 30, STRONGHOLD_BUILT_AT - (SEAT_A + j * SEAT_STEP)), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(meshes, false)[0];
        const measured = hit ? String.fromCharCode(48 + Math.round((STRONGHOLD_BUILT_SEA + hit.point.y + 4) * 10)) : '.';
        if (measured !== row[i]) differ++;
      }
    });
    expect(differ).toBe(0);
  }, 60_000);

  it('leaves its weak points in sight from the lens at the camera\'s centre and both extremes (no ground on the lines of sight)', async () => {
    const model = await asset(BOSS_ASSETS.ark);
    model.updateMatrixWorld(true);
    const points = ['stronghold_core_aim', 'stronghold_gun_left', 'stronghold_gun_right', 'stronghold_muzzle_left', 'stronghold_muzzle_right']
      .map(name => model.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()));
    const stop = 1075.25, from = stop - 9;   // Cold Vector's stop and arena (tests/world/terrain-vesper.test.ts)
    for (const seed of [7, 93, 8831]) {
      const world = { planet: 'vesper' as const, arena: { fromS: from, toS: stop + 35 } };
      for (const camera of [-(VIEW.worldWidth - VIEW.width) / 2, 0, (VIEW.worldWidth - VIEW.width) / 2]) {
        const eye = lensEye(camera);
        for (const p of points) {
          // The point in the lens frame (s past the player's row at the stop), then down its line of sight from the eye.
          const target = seated(p);
          for (let k = 1; k < 200; k++) {
            const t = k / 200, x = eye.x + (target.x - eye.x) * t, y = eye.y + (target.y - eye.y) * t, s = eye.s + (target.s - eye.s) * t;
            expect(terrainHeight(seed, x, stop + s, world), `${seed} camera ${camera} ${t}`).toBeLessThan(y);
          }
        }
      }
    }
  }, 60_000);

  it('draws its rings and brackets on the targets and its scenery exclusion over the fortress', async () => {
    const scene = new THREE.Scene(), view = createStrongholdView(scene);
    view.setModel(await asset(BOSS_ASSETS.ark));
    const state = createRun({ mode: 'campaign', mission: 'cold-vector', seed: 93 });
    state.time = HELION_ARK.arrivesAt; state.distance = 1075.25; startBoss(state);
    state.time += HELION_ARK.arrivalDuration + .1; state.boss!.phase = 'batteries';
    for (const target of state.enemies) if (target.bossPart !== 'core') target.damageable = true;
    const seat = { x: 0, s: SEAT, baseHeight: STRONGHOLD_BASE };
    view.update(state, seat); view.update(state, seat);
    const root = scene.getObjectByName('HELION STRONGHOLD')!;
    expect(root.visible).toBe(true);
    expect(root.position.toArray()).toEqual([0, STRONGHOLD_BASE, -SEAT]);
    expect(root.scale.toArray()).toEqual([K, K, K]);
    for (const target of state.enemies) {
      const ring = scene.getObjectByName(`stronghold-target-${target.bossPart}`)!;
      expect(ring.visible).toBe(target.damageable);
      if (target.damageable) expect(ring.position.toArray().map(v => +v.toFixed(6))).toEqual([target.x, +(VIEW.flightHeight + .02).toFixed(6), -target.s]);
    }
    const rect = view.footprint(state, seat)!;
    expect(rect.maxX - rect.minX).toBeCloseTo(STRONGHOLD_FOOTPRINT.halfWidth * 2, 6);
    expect(rect.minS).toBeLessThan(state.distance + SEAT);
    expect(rect.maxS).toBeGreaterThan(state.distance + SEAT + 6);
    // A lane fired from a live cannon starts at its muzzle, down the screen from the cannon's own row.
    const left = state.enemies.find(target => target.bossPart === 'left')!;
    const top = view.beamTop(state, left)!;
    expect(top).toBeLessThan(left.s - 2); expect(top).toBeGreaterThan(VIEW.minS);
    left.hp = 0;
    expect(view.beamTop(state, left)).toBeUndefined();
  });
});
