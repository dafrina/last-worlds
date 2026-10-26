import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { UMBRA_SCENERY_MAX, UMBRA_SPIRE_MAX } from '../../src/world/terrain-umbra';
import { KIT, UMBRA_CLIFF_KINDS, UMBRA_KIT_KINDS, createTerrainStream, generateTerrainSection, terrainSample } from '../../src/world/terrain';

const UMBRA = { planet: 'umbra' as const }, HALF = VIEW.worldWidth / 2;
const TALL = new Set(['umbHill', 'umbPeak', 'umbSpire', 'umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk', 'umbDock']);

describe('Umbra scenery (docs/28)', () => {
  it('prefetches the added walls and footprint checks without synchronous fallbacks at maximum scroll speed', () => {
    const stream = createTerrainStream(8831, UMBRA);
    for (let frame = 0; frame < 60 * 80; frame++) {
      const distance = frame * 5.5 / 60;
      const sections = stream.update(distance);
      let budget = 30; stream.prefetch(distance, () => budget-- > 0);
      if (frame % 1200 === 0) for (const section of sections) expect(section).toEqual(generateTerrainSection(8831, section.index, UMBRA));
    }
    expect(stream.stats.fallbacks).toBe(0);
    expect(stream.stats.startup).toBe(3);
    expect(stream.stats.prefetched).toBeGreaterThan(5);
  });
  it('seats every structure footprint on solid plateau, including crescent docks and satellite pads', () => {
    const buildings = new Set(['umbMonolith', 'umbPylon', 'umbGate', 'umbReactor', 'umbObelisk', 'umbDock', 'umbPad']);
    const seen = new Set<string>(); let count = 0;
    for (const seed of [8831, 93, 7, 221]) for (let index = 0; index < 10; index++) {
      for (const p of generateTerrainSection(seed, index, UMBRA).instances) {
        if (!buildings.has(p.kind)) continue;
        seen.add(p.kind); count++;
        const spec = KIT[p.kind], c = Math.cos(p.rotation), sn = Math.sin(p.rotation);
        const foundation = p.y + (p.kind === 'umbDock' ? p.height * .33 : 0); // Dock's lower deck, above its buried spikes.
        // Independent dense surface probes: no visible base can sit above empty canyon space. Includes the middle,
        // where a narrow crack can slip between otherwise supported corners.
        for (let u = -1; u <= 1.001; u += .1) for (let v = -1; v <= 1.001; v += .1) {
          const x = spec.halfX * p.scale * u, z = spec.halfZ * p.scale * v;
          const ground = terrainSample(seed, p.x + c * x + sn * z, p.s + sn * x - c * z, UMBRA).height;
          expect(ground, `${p.kind} seed ${seed} at ${p.x},${p.s}`).toBeGreaterThanOrEqual(foundation - .015);
          expect(ground - foundation).toBeLessThan(.3);
          expect(ground).toBeGreaterThan(-2.1);
        }
      }
    }
    // Grounding is not implemented by removing the infrastructure.
    expect(count).toBeGreaterThan(35);
    expect(seen).toEqual(buildings);
  });
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
