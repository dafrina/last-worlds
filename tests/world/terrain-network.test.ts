import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, MODULE_HEIGHT, ROAD_MAX_SLOPE, ROAD_STEP, SCENERY_MAX_HEIGHT, SUPPORT_HEIGHT, VIEW_HALF, edgesNear, generateTerrainSection,
  pieceBounds, pipePieces, roadPath, settlementsNear, terrainHeight, type IndustryPiece,
} from './network-helpers';

describe('settlement network (docs/13 §2)', () => {
  it('varies outposts: archetypes, compositions, rotations and mirroring', () => {
    for (const seed of [1, 93, 8831]) {
      const sites = settlementsNear(seed, 0, 900);
      expect(new Set(sites.map(site => site.archetype)).size).toBeGreaterThanOrEqual(6);
      expect(new Set(sites.map(site => site.turns)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(sites.map(site => site.mirror)).size).toBe(2);
      const signatures = new Set(sites.map(site => site.modules.map(module => module.node).sort().join(',')));
      expect(signatures.size).toBeGreaterThan(sites.length * 0.6);
      for (const archetype of ARCHETYPES) {
        const same = sites.filter(site => site.archetype === archetype);
        if (same.length > 2) expect(new Set(same.map(site => site.modules.map(module => module.node).sort().join(','))).size).toBeGreaterThan(1);
      }
    }
  });

  it('seats outposts on flattened pads at authored heights under the scenery cap', () => {
    for (const seed of [5, 93]) for (let index = 0; index < 8; index++) {
      const section = generateTerrainSection(seed, index);
      for (const prop of section.props) {
        expect(prop.height).toBe(MODULE_HEIGHT[prop.node]);
        expect(prop.baseHeight + prop.height).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT);
        if (!prop.node.startsWith('wreck')) expect(terrainHeight(seed, prop.x, prop.s)).toBeCloseTo(prop.baseHeight, 5);
      }
    }
  });

  it('builds identical network pieces per section regardless of generation order, each owned once', () => {
    const first = generateTerrainSection(8831, 6);
    for (const index of [9, 2, 6, 5]) generateTerrainSection(8831, index);
    const again = generateTerrainSection(8831, 6);
    expect(again.industry).toEqual(first.industry);
    expect(again.roads).toEqual(first.roads);
    const ids = new Map<string, number>(), segments = new Map<string, number>();
    for (let index = 0; index < 10; index++) {
      const section = generateTerrainSection(8831, index);
      for (const piece of section.industry) ids.set(piece.id, (ids.get(piece.id) ?? 0) + 1);
      for (const road of section.roadPaths) segments.set(road.id, road.x.length - 1);
      expect(section.roads.indices.length % 18).toBe(0);
    }
    expect([...ids.values()].every(count => count === 1)).toBe(true);
    expect(segments.size).toBeGreaterThan(5);
  });

  it('finds paths that follow the ground and never climb cliffs', () => {
    for (const seed of [1, 93, 8831]) {
      let roads = 0, pipes = 0, exits = 0, longest = 0;
      for (const edge of edgesNear(seed, 0, 600)) {
        const road = roadPath(seed, edge);
        if (road) {
          roads++;
          for (let i = 1; i < road.x.length; i++) {
            expect(Math.hypot(road.x[i] - road.x[i - 1], road.s[i] - road.s[i - 1])).toBeLessThanOrEqual(ROAD_STEP + 1e-6);
            expect(Math.abs(road.y[i] - road.y[i - 1]) / ROAD_STEP).toBeLessThan(ROAD_MAX_SLOPE * 1.6);
            expect(Math.abs(road.x[i])).toBeLessThanOrEqual(VIEW_HALF);
          }
          if (edge.kind === 'exit' && Math.abs(road.x[road.x.length - 1]) >= VIEW_HALF - 1.6) exits++;
          longest = Math.max(longest, Math.abs(road.s[road.s.length - 1] - road.s[0]));
        }
        // Pipeline geometry (risers, trestles, clearance, supports) is covered in terrain-pipes.test.ts.
        if (pipePieces(seed, edge).length) pipes++;
      }
      expect(roads).toBeGreaterThan(8); expect(pipes).toBeGreaterThan(2); expect(exits).toBeGreaterThan(0);
      expect(longest).toBeGreaterThan(25);
    }
  });

  it('keeps supports on the ground and every piece inside the world', () => {
    for (let index = 0; index < 10; index++) {
      const industry = generateTerrainSection(93, index).industry as IndustryPiece[], columns = new Map<string, IndustryPiece[]>();
      for (const piece of industry) {
        const box = pieceBounds(piece);
        expect(Math.max(-box.minX, box.maxX)).toBeLessThanOrEqual(VIEW_HALF);
        expect(box.maxY).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT + 1e-6);
        if (piece.node === 'pipe_support') columns.set(`${piece.x}:${piece.s}`, [...(columns.get(`${piece.x}:${piece.s}`) ?? []), piece]);
      }
      // Support columns (a rack, a stack of frames, or both) stand on the ground in the section that owns them.
      for (const column of columns.values()) {
        const lowest = Math.min(...column.map(piece => piece.y)), top = Math.max(...column.map(piece => piece.y + SUPPORT_HEIGHT * piece.scaleY));
        expect(Math.abs(lowest - terrainHeight(93, column[0].x, column[0].s))).toBeLessThanOrEqual(0.021);
        expect(top).toBeGreaterThan(lowest);
      }
    }
  });
});
