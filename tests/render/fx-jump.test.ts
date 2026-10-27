import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createJumpFx } from '../../src/render/fx-jump';
import { createRun } from '../../src/sim/game';
import { WARP } from '../../src/content/departure';

describe('launch warp veil', () => {
  it('covers the world from its first frame, even right after a victory warp', () => {
    const fx = createJumpFx(new THREE.Scene());
    // A completed mission's victory warp (a jump with nowhere to land), played to its end behind the results.
    const won = createRun({ mode: 'campaign', mission: 'training', seed: 3 });
    won.jump = { startedAt: 0, duration: WARP.duration, from: won.planet, to: won.planet };
    for (let t = 0; t <= WARP.duration; t += 1 / 30) { won.time = t; fx.update(won, false, true); }
    // "Fly again": a new run launches through the warp; its world must stay hidden while it is prepared.
    const next = createRun({ mode: 'campaign', mission: 'training', seed: 4 });
    fx.launch('cruise');
    fx.update(next, false, true);
    expect(fx.cover).toBe(1);
  });
});
