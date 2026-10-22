import { describe, expect, it } from 'vitest';
import { MISSION_PLANET, runPlanet } from '../../src/content/missions';
import { runRoute } from '../../src/render/terrain-route';
import { LUNA_SCENERY_MAX, lunaCraters, lunaMare, lunaMoodOf } from '../../src/world/terrain-luna';
import { KIT, generateTerrainSection, terrainHeight } from '../../src/world/terrain';

const LUNA = { planet: 'luna' } as const;

describe('luna training world (docs/19)', () => {
  it('flies Training over Luna and opens endless there; the other missions keep their planets', () => {
    expect(MISSION_PLANET.training).toBe('luna');
    expect(runPlanet({ mode: 'campaign', mission: 'training' })).toBe('luna');
    expect(runPlanet({ mode: 'campaign', mission: 'bastion' })).toBe('khepri');
    expect(runPlanet({ mode: 'endless', mission: 'training' })).toBe('luna');
    const route = runRoute({ mode: 'campaign', mission: 'training' });
    for (const s of [0, 500, 3000]) expect(route.worldAt(s).planet.id).toBe('luna');
  });

  it('is deterministic and dry, with no pipelines, and keeps scenery under its cap', () => {
    for (const seed of [93, 4242]) for (const index of [0, 3, 7]) {
      const section = generateTerrainSection(seed, index, LUNA);
      expect(generateTerrainSection(seed, index, LUNA)).toEqual(section);
      expect(section.water).toBeUndefined(); expect(section.floes).toBeUndefined();
      // Version 16 already connects lunar bases with rover tracks; denser v17 reaches them in these samples.
      expect(section.industry.every(piece => !piece.node.startsWith('pipe_'))).toBe(true);
      for (const kit of section.instances) expect(kit.y + kit.height * KIT[kit.kind].height).toBeLessThanOrEqual(LUNA_SCENERY_MAX + 1e-9);
      for (const prop of section.props) expect(prop.baseHeight + prop.height).toBeLessThanOrEqual(LUNA_SCENERY_MAX + 1e-9);
      // Only Khepri kit pieces are reused (no new models).
      expect(section.instances.every(kit => ['rock', 'boulder', 'clump'].includes(kit.kind))).toBe(true);
    }
  });

  it('is cratered: bowls sink below their rims, and craters are common', () => {
    let bowls = 0, samples = 0;
    for (let s = 0; s < 400; s += 1.7) for (let x = -14; x <= 14; x += 1.9) { samples++; if (lunaCraters(93, x, s).bowl > 0.3) bowls++; }
    expect(bowls / samples).toBeGreaterThan(0.15);
    const heights = Array.from({ length: 800 }, (_, i) => terrainHeight(93, (i % 20) * 1.4 - 14, Math.floor(i / 20) * 5, LUNA));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1.5);
  });

  it('varies its relief (docs/26 §4): highlands stand over the maria, craters of every age, rilles and scarps', () => {
    let mare = 0, highland = 0, fresh = 0, worn = 0, samples = 0;
    const high: number[] = [], low: number[] = [];
    for (let s = 0; s < 2400; s += 2.3) for (let x = -14; x <= 14; x += 2.9) {
      samples++;
      const h = terrainHeight(93, x, s, LUNA), m = lunaMare(93, x, s);
      if (m > 0.9) { mare++; low.push(h); } else if (m < 0.1) { highland++; high.push(h); }
    }
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    // Both kinds of ground along the route, the highlands well above the maria, and the highlands rugged.
    expect(mare / samples).toBeGreaterThan(0.12); expect(highland / samples).toBeGreaterThan(0.35);
    expect(mean(high) - mean(low)).toBeGreaterThan(1.5);
    expect(Math.max(...high) - Math.min(...high)).toBeGreaterThan(4);
    // Craters at four scales, fresh and deep or old and worn: their depth over radius varies widely.
    for (let s = 0; s < 3000; s += 5) for (let x = -12; x <= 12; x += 3) {
      const field = lunaCraters(93, x, s);
      if (field.bowl > 0.97) { if (field.height < -1.2) fresh++; else if (field.height > -0.5) worn++; }
    }
    expect(fresh).toBeGreaterThan(10); expect(worn).toBeGreaterThan(10);
    // The route passes highland, mare, basin-rim and crater-field regions.
    expect(new Set(Array.from({ length: 16 }, (_, i) => lunaMoodOf(93, i))).size).toBe(4);
  });

  it('shows more outposts without filling every section with bases', () => {
    let outposts = 0;
    for (let index = 0; index < 30; index++) outposts += new Set(generateTerrainSection(93, index, LUNA).props.map(prop => prop.group)).size;
    // User 22 October: increase building frequency. This route previously had fewer than 30 appearances.
    expect(outposts).toBeGreaterThan(30); expect(outposts).toBeLessThan(50);
  });
});
