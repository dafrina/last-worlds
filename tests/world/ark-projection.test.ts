import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { HELION_ARK } from '../../src/content/ark';
import { VIEW } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { startBoss } from '../../src/sim/bastion';
import { ARK_FOOTPRINT, arkPlacement, arkSocket, createArkView } from '../../src/render/ark-view';
import { configureCamera } from '../../src/render/scene';

/** A Cold Vector run with the Helion Ark parked at a given pivot row (combat-plane coordinates). */
function arkRun(cameraX: number, row: number) {
  const state = createRun({ mode: 'campaign', mission: 'cold-vector', seed: 93 });
  state.cameraX = cameraX; state.distance = 920; startBoss(state);
  const boss = state.boss!;
  boss.s = row;
  for (const target of state.enemies) {
    const socket = arkSocket(target.bossPart!);
    target.x = boss.x + socket.x; target.s = row - socket.z;
  }
  return state;
}

describe('Helion Ark target projection', () => {
  it('runs the right boss and keeps the carrier sockets on the combat-plane targets', () => {
    const state = arkRun(0, HELION_ARK.row);
    expect(state.boss!.id).toBe('ark');
    for (const target of state.enemies) {
      const socket = arkSocket(target.bossPart!);
      const spec = target.bossPart === 'core' ? { x: 0, s: HELION_ARK.bridgeS }
        : { x: (target.bossPart === 'left' ? -1 : 1) * HELION_ARK.radiatorOffset, s: HELION_ARK.radiatorS };
      expect(socket.x).toBeCloseTo(spec.x, 9); expect(-socket.z).toBeCloseTo(spec.s, 9);
    }
  });

  it('projects every target ring exactly onto its logical target with the waterline on the sea, at both camera extremes', () => {
    const scene = new THREE.Scene(), view = createArkView(scene);
    const camera = new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, VIEW.width * 16 / 18, -VIEW.width * 16 / 18, .1, 100);
    for (const cameraX of [-9, 0, 9]) for (const row of [HELION_ARK.row - .7, HELION_ARK.row, HELION_ARK.row + .7, HELION_ARK.entryS]) for (const sea of [-1.2, -2, 0]) {
      const state = arkRun(cameraX, row), placement = arkPlacement(row, sea);
      expect(placement.baseHeight).toBe(sea);
      view.update(state, placement);
      scene.updateMatrixWorld(true); configureCamera(camera, cameraX);
      const root = scene.getObjectByName('Helion Ark')!;
      expect(root.position.y).toBeCloseTo(sea, 9);
      for (const target of state.enemies) {
        const ring = scene.getObjectByName(`ark-target-${target.bossPart}`)!.getWorldPosition(new THREE.Vector3());
        expect(ring.y).toBeCloseTo(sea + HELION_ARK.targetHeight, 9);
        const physical = ring.project(camera), logical = new THREE.Vector3(target.x, VIEW.flightHeight, -target.s).project(camera);
        expect(physical.x).toBeCloseTo(logical.x, 6);
        expect(physical.y).toBeCloseTo(logical.y, 6);
      }
      // The scenery exclusion covers the whole hull from bow to stern.
      const rect = view.footprint(state, placement)!;
      expect(rect.maxX - rect.minX).toBeGreaterThan(ARK_FOOTPRINT.halfWidth * 2);
      expect(rect.minS).toBeLessThan(state.distance + placement.s - ARK_FOOTPRINT.bow);
      expect(rect.maxS).toBeGreaterThan(state.distance + placement.s + ARK_FOOTPRINT.stern);
    }
  });
});
