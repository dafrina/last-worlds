import { describe, expect, it } from 'vitest';
import {
  KIT, KIT_MAX_SCALE, MOOD_LENGTH, RETAINED_SECTIONS, SCENERY_MAX_HEIGHT, SUN_DIRECTION, TERRAIN_MAX_HEIGHT, TERRAIN_MIN_HEIGHT,
  TERRAIN_STEP, createTerrainStream, generateTerrainSection, moodOf, routeCenter, terrainHeight, terrainSample, type TerrainSection,
} from '../../src/world/terrain';
import { VIEW } from '../../src/shared/contracts';

const HALF = VIEW.worldWidth / 2;
const top = (instance: TerrainSection['instances'][number]) => instance.y + instance.height * KIT[instance.kind].height;
const slopeAt = (seed: number, x: number, s: number) => Math.hypot(
  (terrainHeight(seed, x + 0.25, s) - terrainHeight(seed, x - 0.25, s)) / 0.5, (terrainHeight(seed, x, s + 0.25) - terrainHeight(seed, x, s - 0.25)) / 0.5);

/** Samples a viewport-sized 12 × 26 window on a unit lattice. */
function window(seed: number, x0: number, s0: number) {
  const heights: number[] = [], slopes: number[] = [];
  for (let s = s0; s < s0 + 26; s++) for (let x = x0; x < x0 + 12; x++) {
    heights.push(terrainHeight(seed, x + 0.5, s + 0.5)); slopes.push(slopeAt(seed, x + 0.5, s + 0.5));
  }
  return { heights, slopes, relief: Math.max(...heights) - Math.min(...heights) };
}

describe('seeded Khepri landforms', () => {
  it('recreates identical sections, instances and props independently of generation order', () => {
    const first = generateTerrainSection(8831, 7);
    generateTerrainSection(8831, 1); generateTerrainSection(8831, 8); generateTerrainSection(42, 7);
    expect(generateTerrainSection(8831, 7)).toEqual(first);
    const stream = createTerrainStream(8831);
    stream.update(40 * VIEW.sectionLength);
    expect(stream.update(7 * VIEW.sectionLength + 3).find(section => section.index === 7)).toEqual(first);
    const other = generateTerrainSection(8832, 7);
    expect(other.positions).not.toEqual(first.positions);
    expect(other.instances).not.toEqual(first.instances);
  });

  it('joins positions, colours, normals and surface channels without seams', () => {
    for (const seed of [93, 4041]) for (const index of [-2, -1, 0, 2, 19]) {
      const a = generateTerrainSection(seed, index), b = generateTerrainSection(seed, index + 1), { across, along } = a;
      expect(along).toBe(VIEW.sectionLength / TERRAIN_STEP + 1);
      expect(across).toBe(VIEW.worldWidth / TERRAIN_STEP + 1);
      for (let column = 0; column < across; column++) {
        const end = (along - 1) * across + column, start = column;
        expect(a.positions[end * 3 + 1]).toBe(b.positions[start * 3 + 1]);
        expect([...a.colors.slice(end * 3, end * 3 + 3)]).toEqual([...b.colors.slice(start * 3, start * 3 + 3)]);
        expect([...a.normals.slice(end * 3, end * 3 + 3)]).toEqual([...b.normals.slice(start * 3, start * 3 + 3)]);
        expect([a.glow[end * 2], a.glow[end * 2 + 1], a.edges[end * 2], a.edges[end * 2 + 1], a.rock[end]]).toEqual([b.glow[start * 2], b.glow[start * 2 + 1], b.edges[start * 2], b.edges[start * 2 + 1], b.rock[start]]);
      }
    }
  });

  it('meshes the quarter-unit grid adaptively without cracks, and seams share the same boundary edges', () => {
    for (const seed of [93, 8831]) {
      const edgesOf = (section: TerrainSection) => {
        const count = new Map<string, number>(), key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
        for (let i = 0; i < section.indices.length; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const k = key(section.indices[i + a], section.indices[i + b]); count.set(k, (count.get(k) ?? 0) + 1);
        }
        return count;
      };
      const a = generateTerrainSection(seed, 4), b = generateTerrainSection(seed, 5), { across, along } = a;
      // Flat ground uses half-unit quads; relief keeps the quarter-unit grid.
      expect(a.indices.length / 3).toBeLessThan((across - 1) * (along - 1) * 2 * 0.8);
      expect(a.indices.length / 3).toBeGreaterThan((across - 1) * (along - 1) / 2 * 1.05);
      const onBorder = (v: number) => v % across === 0 || v % across === across - 1 || v < across || v >= (along - 1) * across;
      // A closed sheet: every inner edge is shared by exactly two triangles (no T-junction cracks).
      for (const [edge, n] of edgesOf(a)) {
        const [u, v] = edge.split(':').map(Number);
        if (onBorder(u) && onBorder(v) && (Math.floor(u / across) === Math.floor(v / across) || u % across === v % across)) expect(n).toBe(1);
        else expect(n, edge).toBe(2);
      }
      // The last row of one section and the first of the next are split at the same vertices.
      const lastRow = [...edgesOf(a).keys()].map(k => k.split(':').map(Number)).filter(([u, v]) => u >= (along - 1) * across && v >= (along - 1) * across)
        .map(([u, v]) => `${u - (along - 1) * across}:${v - (along - 1) * across}`).sort();
      const firstRow = [...edgesOf(b).keys()].map(k => k.split(':').map(Number)).filter(([u, v]) => u < across && v < across).map(([u, v]) => `${u}:${v}`).sort();
      expect(lastRow).toEqual(firstRow);
    }
  });

  it('spans deep valleys to high rims within [−8, 2.2] and keeps every piece inside its section and the world', () => {
    expect(TERRAIN_MIN_HEIGHT).toBeGreaterThanOrEqual(-8); expect(SCENERY_MAX_HEIGHT).toBe(2.2);
    let lowest = Infinity, highest = -Infinity;
    for (let seed = 0; seed < 8; seed++) for (let index = -1; index < 5; index++) {
      const section = generateTerrainSection(seed, index);
      let normalError = 0;
      for (let i = 0; i < section.positions.length; i += 3) {
        expect(Math.abs(section.positions[i])).toBeLessThanOrEqual(HALF);
        lowest = Math.min(lowest, section.positions[i + 1]); highest = Math.max(highest, section.positions[i + 1]);
        normalError = Math.max(normalError, Math.abs(Math.hypot(...section.normals.slice(i, i + 3)) - 1));
      }
      expect(normalError).toBeLessThan(1e-6);
      expect(Math.max(...section.indices)).toBeLessThan(section.positions.length / 3);
      expect(section.strips.reduce((sum, strip) => sum + strip.count, 0)).toBe(section.indices.length);
      for (const instance of section.instances) {
        expect(instance.s).toBeGreaterThanOrEqual(section.startS); expect(instance.s).toBeLessThan(section.startS + section.size);
        expect(Math.abs(instance.x) + KIT[instance.kind].radius * instance.scale).toBeLessThanOrEqual(HALF + 1e-9);
        expect(top(instance)).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT + 1e-9);
        expect(instance.height).toBeGreaterThan(0); expect(instance.scale).toBeLessThanOrEqual(KIT_MAX_SCALE);
        expect(instance.variant).toBeLessThan(KIT[instance.kind].variants);
      }
      for (const prop of section.props) expect(prop.baseHeight + prop.height).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT + 1e-9);
    }
    expect(lowest).toBeGreaterThanOrEqual(TERRAIN_MIN_HEIGHT); expect(lowest).toBeLessThan(-5);
    expect(highest).toBeLessThanOrEqual(TERRAIN_MAX_HEIGHT); expect(highest).toBeGreaterThan(1.5);
  });

  it('builds varied macro geography whose valleys are not aligned with the flight direction', () => {
    for (const seed of [1, 93, 8831]) {
      const reliefs: number[] = [], angles: number[] = [];
      for (let s0 = 0; s0 < 600; s0 += 26) for (const x0 of [-18, -6, 6]) {
        const { relief } = window(seed, x0, s0);
        reliefs.push(relief);
        // Structure tensor of the height gradient: valleys run perpendicular to its dominant direction.
        let xx = 0, ss = 0, xs = 0;
        for (let s = s0; s < s0 + 26; s += 1) for (let x = x0; x < x0 + 12; x += 1) {
          const gx = terrainHeight(seed, x + 1, s) - terrainHeight(seed, x, s), gs = terrainHeight(seed, x, s + 1) - terrainHeight(seed, x, s);
          xx += gx * gx; ss += gs * gs; xs += gx * gs;
        }
        if (relief > 2) angles.push(((0.5 * Math.atan2(2 * xs, xx - ss) * 180 / Math.PI) + 180) % 180);
      }
      expect(Math.max(...reliefs)).toBeGreaterThan(5);
      expect(Math.min(...reliefs)).toBeLessThan(Math.max(...reliefs) / 2);
      // Gradient orientations near 0° mean valleys along the flight direction; they must not dominate.
      const alongS = angles.filter(angle => angle < 20 || angle > 160).length;
      expect(alongS / angles.length).toBeLessThan(0.5);
      expect(new Set(angles.map(angle => Math.floor(angle / 45))).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps plenty of calm ground in every viewport window, calmer along the authored routes', () => {
    for (const seed of [1, 93, 8831]) {
      let routeSlope = 0, routeSamples = 0, awaySlope = 0, awaySamples = 0;
      for (let s0 = 0; s0 < 500; s0 += 13) for (let x0 = -18; x0 <= 6; x0 += 4) {
        const { slopes } = window(seed, x0, s0);
        expect(slopes.filter(slope => slope < 0.5).length / slopes.length).toBeGreaterThan(0.4);
        expect(slopes.filter(slope => slope > 1.5).length / slopes.length).toBeLessThan(0.35);
      }
      for (let s = 0; s < 800; s += 2.3) {
        for (const route of [0, 1, 2] as const) { routeSlope += slopeAt(seed, routeCenter(seed, route, s), s); routeSamples++; }
        for (const x of [-6, 6, -16, 16]) { awaySlope += slopeAt(seed, x, s); awaySamples++; }
      }
      expect(routeSlope / routeSamples).toBeLessThan(awaySlope / awaySamples);
    }
  });

  it('alternates terrain moods along the route', () => {
    for (const seed of [1, 93, 8831]) for (let segment = -3; segment < 40; segment++) expect(moodOf(seed, segment + 1)).not.toBe(moodOf(seed, segment));
    expect(MOOD_LENGTH).toBeGreaterThan(VIEW.sectionLength);
  });

  it('dresses rims, faces, feet and open ground within bounded per-section budgets', () => {
    for (const seed of [3, 93, 8831]) for (let index = 0; index < 6; index++) {
      const section = generateTerrainSection(seed, index), count: Record<string, number> = {};
      for (const instance of section.instances) count[instance.kind] = (count[instance.kind] ?? 0) + 1;
      expect(section.instances.length).toBeLessThanOrEqual(900);
      expect(count.clump ?? 0).toBeLessThanOrEqual(320); expect(count.rock ?? 0).toBeLessThanOrEqual(400);
      for (const instance of section.instances) if (instance.cosmetic) expect(['rock', 'column', 'crystal', 'boulder', 'fallen']).toContain(instance.kind);
      // Fallen columns and boulders are real-size pieces: never stretched vertically.
      for (const instance of section.instances) if (instance.kind === 'fallen' || instance.kind === 'boulder') expect(instance.height).toBe(instance.scale);
      const firstCosmetic = section.instances.findIndex(instance => instance.cosmetic);
      if (firstCosmetic >= 0) expect(section.instances.slice(firstCosmetic).every(instance => instance.cosmetic)).toBe(true);
    }
    const kinds = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(index => generateTerrainSection(93, index).instances.map(instance => instance.kind)));
    for (const kind of ['clump', 'wall', 'rock', 'boulder', 'fallen', 'crystal', 'hoodoo']) expect(kinds).toContain(kind);
  });

  it('bakes cast shadows only below higher ground toward the sun, and minerals only on calm low ground', () => {
    let shadowed = 0;
    const horizontal = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.s);
    for (const seed of [7, 93]) for (const index of [0, 3]) {
      const section = generateTerrainSection(seed, index);
      for (let v = 0; v < section.across * section.along; v += 3) {
        const x = section.positions[v * 3], y = section.positions[v * 3 + 1], s = section.startS - section.positions[v * 3 + 2];
        const albedo = terrainSample(seed, x, s);
        expect(albedo.height).toBeCloseTo(y, 5);
        // Cliff-foot occlusion darkens by at most 28%; anything darker is a cast shadow.
        if (section.colors[v * 3] < albedo.color[0] * 0.6) {
          shadowed++;
          let blocker = -Infinity;
          for (let d = 0.35; d <= 12; d += 0.35) blocker = Math.max(blocker, terrainHeight(seed, x + SUN_DIRECTION.x / horizontal * d, s + SUN_DIRECTION.s / horizontal * d));
          expect(blocker).toBeGreaterThan(y + 0.3);
        }
        if (section.glow[v * 2 + 1] > 0.1) expect(albedo.elevation).toBeLessThan(0.25);
        if (section.glow[v * 2] > 0.1) expect(albedo.slope).toBeLessThan(1);
      }
    }
    expect(shadowed).toBeGreaterThan(200);
  });

  it('keeps a bounded cache during long endless runs and arbitrary seeks', () => {
    const stream = createTerrainStream(128);
    const original = stream.update(0)[1];
    for (let d = 0; d <= 36000; d += 900) {
      const sections = stream.update(d);
      expect(stream.size).toBe(RETAINED_SECTIONS);
      expect(sections.map(s => s.index)).toEqual([d / 36 - 1, d / 36, d / 36 + 1]);
    }
    expect(stream.update(0)[1]).toEqual(original);
    stream.clear(); expect(stream.size).toBe(0);
  });

  it('rejects nonfinite world requests before allocating terrain', () => {
    expect(() => generateTerrainSection(NaN, 0)).toThrow();
    expect(() => generateTerrainSection(1, 0.1)).toThrow();
    expect(() => createTerrainStream(1).update(Infinity)).toThrow();
  });
});
