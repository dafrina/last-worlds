import { describe, expect, it } from 'vitest';
import {
  SCENERY_MAX_HEIGHT, SHARED_BOUNDS, generateTerrainSection, pipeEnds, sectionIndustry, terrainHeight, type IndustryPiece,
} from '../../src/world/terrain';
import { VIEW } from '../../src/shared/contracts';

const isPipe = (piece: IndustryPiece) => piece.node.startsWith('pipe_') && piece.node !== 'pipe_support';

describe('shared industrial kit placement (docs/14 §4)', () => {
  it('assigns each piece to exactly one section, inside the world and under the scenery cap', () => {
    for (const seed of [5, 93]) {
      const owned = new Map<string, number>();
      for (let index = -1; index < 9; index++) {
        const section = generateTerrainSection(seed, index);
        for (const piece of section.industry) {
          owned.set(piece.id, (owned.get(piece.id) ?? 0) + 1);
          expect(piece.s).toBeGreaterThanOrEqual(section.startS); expect(piece.s).toBeLessThan(section.startS + section.size);
          const bounds = SHARED_BOUNDS[piece.node];
          expect(Math.abs(piece.x) + Math.max(bounds.halfX, bounds.halfZ)).toBeLessThanOrEqual(VIEW.worldWidth / 2);
          expect(piece.y + bounds.height * piece.scaleY).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT);
          // Pipelines keep clear of the center combat lane.
          expect(Math.abs(piece.x)).toBeGreaterThan(4.5);
        }
      }
      expect([...owned.values()].every(count => count === 1)).toBe(true);
      expect(owned.size).toBeGreaterThan(20);
    }
  });

  it('lays pipes at one run level on flat ground, so they never climb through cliffs', () => {
    for (const seed of [5, 93, 8831]) for (const piece of sectionIndustry(seed, 0, 400)) {
      const ground = terrainHeight(seed, piece.x, piece.s);
      if (isPipe(piece)) { expect(ground).toBeLessThanOrEqual(piece.y + 0.07); expect(ground).toBeGreaterThanOrEqual(piece.y - 0.23); }
      if (piece.node === 'pipe_support') { expect(piece.y).toBeCloseTo(ground, 6); expect(piece.scaleY).toBeLessThan(3); }
    }
  });

  it('joins pipe pieces end to end, leaving only the two ends of each run open', () => {
    for (const seed of [5, 93, 8831]) {
      const groups = new Map<string, IndustryPiece[]>();
      for (const piece of sectionIndustry(seed, -200, 1000)) if (isPipe(piece)) {
        const list = groups.get(piece.group) ?? []; list.push(piece); groups.set(piece.group, list);
      }
      let runs = 0;
      for (const pieces of groups.values()) {
        if (pieces.some(piece => piece.s < 0 || piece.s > 600)) continue;
        runs++;
        const ends = new Map<string, number>();
        for (const piece of pieces) for (const [x, s] of pipeEnds(piece)) {
          const key = `${x.toFixed(3)}:${s.toFixed(3)}`; ends.set(key, (ends.get(key) ?? 0) + 1);
        }
        expect([...ends.values()].every(count => count <= 2)).toBe(true);
        expect([...ends.values()].filter(count => count === 1).length).toBe(2);
      }
      expect(runs).toBeGreaterThan(4);
    }
  });

  it('clusters tank farms at outposts', () => {
    const pieces = sectionIndustry(137, 0, 300);
    const farms = new Set(pieces.filter(piece => piece.node.startsWith('tank_') && piece.group.endsWith(':farm')).map(piece => piece.group));
    expect(farms.size).toBeGreaterThanOrEqual(3);
  });
});
