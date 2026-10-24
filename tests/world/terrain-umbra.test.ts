import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { UMBRA_SCENERY_MAX, UMBRA_SPIRE_MAX } from '../../src/world/terrain-umbra';
import { KIT, UMBRA_CLIFF_KINDS, UMBRA_KIT_KINDS, generateTerrainSection, terrainSample } from '../../src/world/terrain';

const UMBRA = { planet: 'umbra' as const }, HALF = VIEW.worldWidth / 2;
const TALL = new Set(['umbHill', 'umbPeak', 'umbSpire', 'umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk', 'umbDock']);

describe('Umbra scenery (docs/28)', () => {
  it('keeps spires and structures 0.4 under the flight plane, everything else under the 3.0 cap, all inside the world', () => {
    expect(UMBRA_SPIRE_MAX).toBeLessThanOrEqual(VIEW.flightHeight - 0.4 + 1e-9);
    const kinds = new Set<string>();
    for (const seed of [8831, 93]) for (let index = 0; index < 8; index++) {
      for (const piece of generateTerrainSection(seed, index, UMBRA).instances) {
        const spec = KIT[piece.kind], top = piece.y + piece.height * spec.height;
        expect([...UMBRA_KIT_KINDS, ...UMBRA_CLIFF_KINDS]).toContain(piece.kind);
        expect(top).toBeLessThanOrEqual((TALL.has(piece.kind) ? UMBRA_SPIRE_MAX : UMBRA_SCENERY_MAX) + 1e-9);
        expect(Math.abs(piece.x) + spec.radius * piece.scale).toBeLessThanOrEqual(HALF + 1e-9);
        kinds.add(piece.kind);
      }
    }
    // Hills, rocks, floating cliffs, sparse cliff walls and at least one kind of structure all appear.
    for (const kind of ['umbHill', 'umbPeak', 'umbFloat', 'voidWall']) expect(kinds).toContain(kind);
    expect(['umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk'].some(kind => kinds.has(kind))).toBe(true);
  });

  it('is a plateau of glass plates over canyons deep in the fog; the hills are kit massifs on it', () => {
    let deep = 0;
    for (let s = 0; s < 400; s += 0.5) for (let x = -12; x <= 12; x += 0.5) {
      const h = terrainSample(8831, x, s, UMBRA).height;
      // Only the plates' slight tilt lifts the ground over the plateau (-1.8).
      expect(h).toBeLessThanOrEqual(-1.5);
      if (h < -4) deep++;
    }
    expect(deep).toBeGreaterThan(2000);
    let hills = 0;
    for (let index = 0; index < 8; index++) hills += generateTerrainSection(8831, index, UMBRA).instances.filter(piece => piece.kind === 'umbHill').length;
    expect(hills).toBeGreaterThan(40);
  });
});
