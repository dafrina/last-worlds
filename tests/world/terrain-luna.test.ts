import { describe, expect, it } from 'vitest';
import { MISSION_PLANET, runPlanet } from '../../src/content/missions';
import { runRoute } from '../../src/render/terrain-route';
import { LUNA_SCENERY_MAX, lunaCraters } from '../../src/world/terrain-luna';
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

  it('is deterministic and dry, with no roads or pipelines, and keeps scenery under its cap', () => {
    for (const seed of [93, 4242]) for (const index of [0, 3, 7]) {
      const section = generateTerrainSection(seed, index, LUNA);
      expect(generateTerrainSection(seed, index, LUNA)).toEqual(section);
      expect(section.water).toBeUndefined(); expect(section.floes).toBeUndefined();
      expect(section.roadPaths).toHaveLength(0); expect(section.industry.every(piece => !piece.node.startsWith('pipe_'))).toBe(true);
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

  it('keeps outposts sparse', () => {
    let outposts = 0;
    for (let index = 0; index < 30; index++) outposts += new Set(generateTerrainSection(93, index, LUNA).props.map(prop => prop.group)).size;
    expect(outposts).toBeGreaterThan(0); expect(outposts).toBeLessThan(30);
  });
});
