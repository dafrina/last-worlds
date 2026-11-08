import { describe, expect, it } from 'vitest';
import type { RunConfig } from '../../src/shared/contracts';
import { runPlanet } from '../../src/content/missions';
import { missionArena } from '../../src/render/scene';
import { runRoute } from '../../src/render/terrain-route';
import { generateTerrainSection } from '../../src/world/terrain';
import { SEED, route } from './terrain-route-setup';

/* Split from terrain-route.test.ts for parallel runs (docs/38 T1). */
describe('terrain routes from the run schedule (docs/18 §3)', () => {
  it('keeps every campaign mission byte-identical to its single world', () => {
    for (const mission of ['training', 'bastion', 'cold-vector'] as const) {
      const config = { mode: 'campaign', mission, seed: SEED } as RunConfig, world = { planet: runPlanet(config), arena: missionArena(config) };
      for (const index of [0, 15, 16, 25, 26]) expect(generateTerrainSection(SEED, index, runRoute(config))).toEqual(generateTerrainSection(SEED, index, world));
    }
    // Endless opens on Luna, exactly Luna's own world (no arena reaches the first sections).
    for (const index of [0, 1, 4]) expect(generateTerrainSection(SEED, index, route)).toEqual(generateTerrainSection(SEED, index, { planet: 'luna' }));
    // 36 full sections: CI runners need well over the default 30 s (it timed out there on 15 October).
  }, 120_000);
});
