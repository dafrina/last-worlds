import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import {
  ARENA_LEVEL, ARENA_RAMP, KIT, TERRAIN_STEP, createTerrainStream, generateTerrainSection, terrainHeight, terrainSample, type TerrainArena,
} from '../../src/world/terrain';

/** Rolling Thunder's Bastion-9 platform: the scroll stops at 555; the fight needs s 546–581 (BASTION.arena). */
const ARENA: TerrainArena = { fromS: 566, toS: 601 };
const HALF = VIEW.worldWidth / 2, SEEDS = [11, 93, 8831];
const sectionsOver = (s0: number, s1: number) => {
  const list: number[] = [];
  for (let i = Math.floor(s0 / VIEW.sectionLength); i <= Math.floor(s1 / VIEW.sectionLength); i++) list.push(i);
  return list;
};

describe('mission arena platform', () => {
  it('changes nothing without an arena, and nothing far from one', () => {
    for (const seed of SEEDS) for (const index of [0, 4, 9]) {
      expect(generateTerrainSection(seed, index, ARENA)).toEqual(generateTerrainSection(seed, index));
    }
    expect(terrainHeight(93, 3, 120, ARENA)).toBe(terrainHeight(93, 3, 120));
    expect(terrainHeight(93, 3, 620, ARENA)).not.toBe(terrainHeight(93, 3, 620));
  });

  it('settles into a broad flat paved floor across the full width, with only a low lip at the edges', () => {
    for (const seed of SEEDS) {
      let banks = 0;
      for (let s = ARENA.fromS; s <= ARENA.toS; s += 1.5) for (let x = -HALF; x <= HALF; x += 0.5) {
        const height = terrainHeight(seed, x, s, ARENA);
        if (Math.abs(x) <= HALF - 1.6) {
          expect(Math.abs(height - ARENA_LEVEL)).toBeLessThan(0.25);
          // Gentle relief only (worn paving joints a few centimetres deep): no step over 0.16 per half unit.
          expect(Math.abs(terrainHeight(seed, x + TERRAIN_STEP, s, ARENA) - height)).toBeLessThan(0.16);
          expect(Math.abs(terrainHeight(seed, x, s + TERRAIN_STEP, ARENA) - height)).toBeLessThan(0.16);
        } else {
          expect(height).toBeLessThan(0.9);
          if (height > 0.3) banks++;
        }
        const sample = terrainSample(seed, x, s, ARENA);
        expect(sample.height).toBe(height);
        expect(sample.mineral).toBe(0);
      }
      expect(banks).toBeGreaterThan(20);
    }
  });

  it('keeps outposts, roads, pipelines and tall scatter off the platform and its ramps; frames its edges', () => {
    for (const seed of SEEDS) {
      let framing = 0;
      for (const index of sectionsOver(ARENA.fromS - ARENA_RAMP, ARENA.toS + ARENA_RAMP)) {
        const section = generateTerrainSection(seed, index, ARENA), inside = (s: number) => s >= ARENA.fromS - ARENA_RAMP && s <= ARENA.toS + ARENA_RAMP;
        for (const prop of section.props) expect(inside(prop.s)).toBe(false);
        for (const piece of section.industry) expect(inside(piece.s)).toBe(false);
        for (const road of section.roadPaths) for (const s of road.s) expect(inside(s)).toBe(false);
        for (const piece of section.instances) {
          const top = piece.height * KIT[piece.kind].height, at = `${piece.kind} at ${piece.x.toFixed(1)},${piece.s.toFixed(1)}`;
          // The ramp in (and out) carries nothing tall.
          if (inside(piece.s) && (piece.s < ARENA.fromS || piece.s > ARENA.toS)) expect(top, at).toBeLessThanOrEqual(0.6);
          if (piece.s < ARENA.fromS || piece.s > ARENA.toS) continue;
          if (Math.abs(piece.x) < HALF - 2.4) expect(top, at).toBeLessThan(0.4);
          else { expect(top).toBeLessThan(2.2); if (piece.kind === 'column' || piece.kind === 'clump' || piece.kind === 'wall') framing++; }
        }
        // Seating queries agree with the mesh.
        for (let v = 0; v < section.across * section.along; v += 97) {
          const x = section.positions[v * 3], s = section.startS - section.positions[v * 3 + 2];
          expect(terrainHeight(seed, x, s, ARENA)).toBeCloseTo(section.positions[v * 3 + 1], 5);
        }
      }
      expect(framing).toBeGreaterThan(4);
    }
  });

  it('streams the arena identically to synchronous generation, without seams', () => {
    const seed = 93, stream = createTerrainStream(seed, ARENA);
    const sections = stream.update(ARENA.fromS + 10);
    for (const section of sections) expect(section).toEqual(generateTerrainSection(seed, section.index, ARENA));
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i], b = sections[i + 1], last = (a.along - 1) * a.across;
      for (let column = 0; column < a.across; column++) expect(a.positions[(last + column) * 3 + 1]).toBe(b.positions[column * 3 + 1]);
    }
  });
});
