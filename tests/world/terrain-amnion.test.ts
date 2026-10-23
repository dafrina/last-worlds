import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { AMNION_SCENERY_MAX, AMNION_TUSK_MAX } from '../../src/world/terrain-amnion';
import { AMNION_CLIFF_KINDS, AMNION_KIT_KINDS, KIT, generateTerrainSection } from '../../src/world/terrain';

const AMNION = { planet: 'amnion' as const }, HALF = VIEW.worldWidth / 2, TUSKS = new Set(['boneSpire', 'broodNest', 'hive', 'broodRuin']);

describe('Amnion scenery (docs/27)', () => {
  it('keeps the tusks 0.4 under the flight plane and everything else under the 3.0 cap', () => {
    expect(AMNION_TUSK_MAX).toBeLessThanOrEqual(VIEW.flightHeight - 0.4 + 1e-9);
    let tusks = 0;
    for (const seed of [8831, 93]) for (let index = 0; index < 8; index++) {
      for (const piece of generateTerrainSection(seed, index, AMNION).instances) {
        const spec = KIT[piece.kind], top = piece.y + piece.height * spec.height;
        expect([...AMNION_KIT_KINDS, ...AMNION_CLIFF_KINDS]).toContain(piece.kind);
        expect(top).toBeLessThanOrEqual((TUSKS.has(piece.kind) ? AMNION_TUSK_MAX : AMNION_SCENERY_MAX) + 1e-9);
        expect(Math.abs(piece.x) + spec.radius * piece.scale).toBeLessThanOrEqual(HALF + 1e-9);
        if (TUSKS.has(piece.kind) && top > AMNION_SCENERY_MAX) tusks++;
      }
    }
    expect(tusks).toBeGreaterThan(0);
  });
});
