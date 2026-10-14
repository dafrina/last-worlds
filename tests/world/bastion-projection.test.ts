import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { BASTION } from '../../src/content/bastion';
import { VIEW } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { startBastion } from '../../src/sim/bastion';
import { createBastionView } from '../../src/render/bastion-view';
import { configureCamera, groundPlacement } from '../../src/render/scene';

describe('fortress target projection', () => {
  it('aligns every model socket to its actual collision target at both camera extremes and over terrain relief', () => {
    const scene = new THREE.Scene(), view = createBastionView(scene);
    const camera = new THREE.OrthographicCamera(-6, 6, 12 * 16 / 18, -12 * 16 / 18, .1, 100);
    for (const cameraX of [-12, 0, 12]) for (const distance of [460, 520, 800]) {
      const state = createRun({ mode: 'campaign', mission: 'bastion', seed: 8831 });
      state.cameraX = cameraX; state.distance = distance; startBastion(state);
      state.boss!.s = 13;
      for (const target of state.enemies) target.s = 13 + (target.bossPart === 'core' ? BASTION.coreRowOffset : 0);
      view.update(state, groundPlacement(state.config.seed, distance, state.boss!.x, 13, BASTION.targetHeight));
      scene.updateMatrixWorld(true); configureCamera(camera, cameraX);
      for (const target of state.enemies) {
        const physical = scene.getObjectByName(`bastion-target-${target.bossPart}`)!.getWorldPosition(new THREE.Vector3()).project(camera);
        const logical = new THREE.Vector3(target.x, VIEW.flightHeight, -target.s).project(camera);
        expect(physical.x).toBeCloseTo(logical.x, 6);
        expect(physical.y).toBeCloseTo(logical.y, 6);
      }
    }
  });
});
