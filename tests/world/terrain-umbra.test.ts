import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { UMBRA_SCENERY_MAX, UMBRA_SPIRE_MAX } from '../../src/world/terrain-umbra';
import { KIT, UMBRA_KIT_KINDS, generateTerrainSection, terrainSample } from '../../src/world/terrain';

const UMBRA = { planet: 'umbra' as const }, HALF = VIEW.worldWidth / 2;
const TALL = new Set(['umbPeak', 'umbSpire', 'umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk', 'umbDock']);

describe('Umbra scenery (docs/28)', () => {
  it('keeps spires and structures 0.4 under the flight plane, everything else under the 3.0 cap, all inside the world', () => {
    expect(UMBRA_SPIRE_MAX).toBeLessThanOrEqual(VIEW.flightHeight - 0.4 + 1e-9);
    const kinds = new Set<string>();
    for (const seed of [8831, 93]) for (let index = 0; index < 8; index++) {
      for (const piece of generateTerrainSection(seed, index, UMBRA).instances) {
        const spec = KIT[piece.kind], top = piece.y + piece.height * spec.height;
        expect(UMBRA_KIT_KINDS).toContain(piece.kind);
        expect(top).toBeLessThanOrEqual((TALL.has(piece.kind) ? UMBRA_SPIRE_MAX : UMBRA_SCENERY_MAX) + 1e-9);
        expect(Math.abs(piece.x) + spec.radius * piece.scale).toBeLessThanOrEqual(HALF + 1e-9);
        kinds.add(piece.kind);
      }
    }
    // Peaks, spires, floating cliffs and at least one kind of structure all appear.
    for (const kind of ['umbPeak', 'umbSpire', 'umbFloat']) expect(kinds).toContain(kind);
    expect(['umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk'].some(kind => kinds.has(kind))).toBe(true);
  });

  it('has faceted hills well above the plateau and canyons deep in the fog, never above the terrain cap', () => {
    let high = 0, deep = 0;
    for (let s = 0; s < 400; s += 0.5) for (let x = -12; x <= 12; x += 0.5) {
      const h = terrainSample(8831, x, s, UMBRA).height;
      expect(h).toBeLessThanOrEqual(2.4 + 1e-9);
      if (h > 0) high++;
      if (h < -4) deep++;
    }
    expect(high).toBeGreaterThan(200);
    expect(deep).toBeGreaterThan(2000);
  });
});
