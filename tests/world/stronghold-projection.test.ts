import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HELION_ARK } from '../../src/content/ark';
import { VIEW } from '../../src/shared/contracts';
import { toFlightPlane } from '../../src/shared/lens';
import { createRun } from '../../src/sim/game';
import { startBoss } from '../../src/sim/boss';
import { BOSS_ASSETS } from '../../src/render/boss-assets';
import { STRONGHOLD_FOOTPRINT, createStrongholdView } from '../../src/render/stronghold-view';
import { STRONGHOLD_AT, VESPER_SEA_LEVEL } from '../../src/world/terrain-vesper';
import { asset, stubGltfDecoding } from '../helpers/assets';

stubGltfDecoding();

/**
 * HELION STRONGHOLD's placement (docs/17 §5): the renderer seats the model at STRONGHOLD_AT past its arena's start with its
 * foot at the sea, and with the camera centred (where it rests through most of a fight) the release lens sees each weak
 * point of the model on its combat target. The model's frame: glTF (y up, +z toward the player); s = the seat − z.
 */
const SEAT = STRONGHOLD_AT - 9;   // its origin past the player's row at the stop (the stop is 9 past the arena's start)
const ROW = HELION_ARK.row;
const onPlane = (object: THREE.Object3D) => {
  const p = object.getWorldPosition(new THREE.Vector3());
  return toFlightPlane(0, p.x, VESPER_SEA_LEVEL + p.y, SEAT - p.z);
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
  });

  it('draws its rings and brackets on the targets and its scenery exclusion over the fortress', async () => {
    const scene = new THREE.Scene(), view = createStrongholdView(scene);
    view.setModel(await asset(BOSS_ASSETS.ark));
    const state = createRun({ mode: 'campaign', mission: 'cold-vector', seed: 93 });
    state.time = HELION_ARK.arrivesAt; state.distance = 1075.25; startBoss(state);
    state.time += HELION_ARK.arrivalDuration + .1; state.boss!.phase = 'batteries';
    for (const target of state.enemies) if (target.bossPart !== 'core') target.damageable = true;
    const seat = { x: 0, s: SEAT, baseHeight: VESPER_SEA_LEVEL };
    view.update(state, seat); view.update(state, seat);
    const root = scene.getObjectByName('HELION STRONGHOLD')!;
    expect(root.visible).toBe(true);
    expect(root.position.toArray()).toEqual([0, VESPER_SEA_LEVEL, -SEAT]);
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
