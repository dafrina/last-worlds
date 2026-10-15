import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { MISSION_PLANET, runPlanet } from '../../src/content/missions';
import { vesperMoodOf } from '../../src/world/terrain-vesper';
import {
  KIT, VESPER_SEA_LEVEL, createTerrainStream, edgesNear, generateTerrainSection, pieceBounds, pipeRun, roadPath, sectionSteps, settlementsNear,
  terrainHeight, worldOf, type TerrainSection,
} from '../../src/world/terrain';

const VESPER = { planet: 'vesper' as const }, SEA = VESPER_SEA_LEVEL, HALF = VIEW.worldWidth / 2;
const crypto: { createHash(kind: string): { update(data: string | Uint8Array): { digest(encoding: string): string } } } = await import(['node', 'crypto'].join(':'));

describe('planet profiles (docs/17 §2)', () => {
  it('keeps Khepri byte-identical: default, explicit profile, legacy arena and recorded fingerprints agree', () => {
    for (const [seed, index] of [[11, 5], [93, 17], [8831, 0]] as const) {
      const section = generateTerrainSection(seed, index);
      expect(generateTerrainSection(seed, index, { planet: 'khepri' })).toEqual(section);
      expect(section.water).toBeUndefined();
      expect(section.floes).toBeUndefined();
    }
    const arena = { fromS: 566, toS: 601 };
    expect(generateTerrainSection(93, 16, arena)).toEqual(generateTerrainSection(93, 16, { planet: 'khepri', arena }));
    expect(worldOf(arena)).toBe(worldOf({ planet: 'khepri', arena }));
    // Recorded with the pre-planet generator (TERRAIN_VERSION 9). A deliberate Khepri change updates these.
    const recorded = new Map([['11:5', '860d590a433b13ec'], ['93:17', '66e3012399ffc178'], ['8831:0', '284f12ef192a1fdf']]);
    for (const [key, value] of recorded) {
      const [seed, index] = key.split(':').map(Number);
      expect(legacyFingerprint(generateTerrainSection(seed, index)), key).toBe(value);
    }
    expect(legacyFingerprint(generateTerrainSection(93, 16, arena))).toBe('461ca4d8c9f0203f');
  });

  it('maps missions to planets; endless stays on Khepri', () => {
    expect(MISSION_PLANET['cold-vector']).toBe('vesper');
    expect(MISSION_PLANET.bastion).toBe('khepri');
    expect(runPlanet({ mode: 'campaign', mission: 'cold-vector' })).toBe('vesper');
    expect(runPlanet({ mode: 'endless', mission: 'cold-vector' })).toBe('khepri');
  });
});

describe('Vesper generator (docs/17 §4)', () => {
  const sections = [93, 8831].flatMap(seed => [2, 3, 8].map(index => ({ seed, section: generateTerrainSection(seed, index, VESPER) })));

  it('lays snowy shelves (0.6–2.0) ending in sheer cliffs over a sea at −1.2, with water metadata', () => {
    let land = 0, shelf = 0, wet = 0, cliffs = 0;
    for (const { section } of sections) {
      const { across, along } = section;
      expect(section.water!.level).toBe(SEA);
      expect(section.water!.shore.length).toBe(across * along);
      for (let v = 0; v < across * along; v++) {
        const y = section.positions[v * 3 + 1], shore = section.water!.shore[v];
        expect(y).toBeLessThanOrEqual(2);
        expect(Math.abs(shore)).toBeLessThanOrEqual(1);
        expect(shore > 0).toBe(y < SEA);
        if (y < SEA) wet++; else { land++; if (y >= 0.6) shelf++; }
        // Sheer: vertices beside the waterline drop over a short distance.
        if (v % across < across - 1 && (y - SEA) * (section.positions[(v + 1) * 3 + 1] - SEA) < 0 && Math.abs(y - section.positions[(v + 1) * 3 + 1]) > 1.2) cliffs++;
      }
    }
    expect(wet / (wet + land)).toBeGreaterThan(0.2);
    expect(wet / (wet + land)).toBeLessThan(0.7);
    expect(shelf / land).toBeGreaterThan(0.85);
    expect(cliffs).toBeGreaterThan(50);
  });

  it('is mostly land: about 70% shelf, land or rock and 30% open water over long stretches of the route', () => {
    // Land is anything at or above the waterline across the whole world width (the camera pans over all of it);
    // water is leads, inlets, bays and pack-ice seas (floes float on water and count as water).
    const fractions = [93, 8831, 11, 4242, 7].map(seed => {
      let land = 0, total = 0;
      for (let s = 0.5; s < 3072; s += 1) for (let x = -HALF + 0.5; x < HALF; x += 1) { total++; if (terrainHeight(seed, x, s, VESPER) >= SEA) land++; }
      return land / total;
    });
    const mean = fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
    expect(mean).toBeGreaterThanOrEqual(0.65); expect(mean).toBeLessThanOrEqual(0.75);
    for (const fraction of fractions) { expect(fraction).toBeGreaterThan(0.6); expect(fraction).toBeLessThan(0.8); }
  });

  it('joins seams and streams incrementally exactly like synchronous generation', () => {
    const seed = 93, a = generateTerrainSection(seed, 4, VESPER), b = generateTerrainSection(seed, 5, VESPER), last = (a.along - 1) * a.across;
    for (let c = 0; c < a.across; c++) {
      expect(a.positions[(last + c) * 3 + 1]).toBe(b.positions[c * 3 + 1]);
      expect([...a.colors.slice((last + c) * 3, (last + c) * 3 + 3)]).toEqual([...b.colors.slice(c * 3, c * 3 + 3)]);
      expect(a.water!.shore[last + c]).toBe(b.water!.shore[c]);
    }
    const steps = sectionSteps(seed, 6, VESPER), other = sectionSteps(seed, 7, VESPER);
    let x = steps.next(), y = other.next();
    while (!x.done || !y.done) { if (!x.done) x = steps.next(); if (!y.done) y = other.next(); }
    expect(x.value).toEqual(generateTerrainSection(seed, 6, VESPER));
    expect(y.value).toEqual(generateTerrainSection(seed, 7, VESPER));
    const stream = createTerrainStream(seed, VESPER);
    for (const section of stream.update(5 * VIEW.sectionLength)) expect(section).toEqual(generateTerrainSection(seed, section.index, VESPER));
  });

  it('floats pack ice on open water with stable ids, and keeps every piece under Vesper’s cap', () => {
    // The usual sections plus two in each seed's first pack-ice sea (rarer now that Vesper is mostly land).
    const pack = [93, 8831].flatMap(seed => {
      let segment = 1;
      while (vesperMoodOf(seed, segment) !== 'pack') segment++;
      const first = Math.floor((segment * 96 + 30) / VIEW.sectionLength);
      return [first, first + 1].map(index => ({ seed, section: generateTerrainSection(seed, index, VESPER) }));
    });
    for (const { seed, section } of [...sections, ...pack]) {
      const ids = new Set<string>();
      for (const floe of section.floes!) {
        expect(ids.has(floe.id)).toBe(false); ids.add(floe.id);
        expect(floe.s).toBeGreaterThanOrEqual(section.startS); expect(floe.s).toBeLessThan(section.startS + section.size);
        expect(terrainHeight(seed, floe.x, floe.s, VESPER)).toBeLessThan(SEA - 0.25);
        expect(Math.abs(floe.x)).toBeLessThanOrEqual(HALF);
      }
      expect(generateTerrainSection(seed, section.index, VESPER).floes).toEqual(section.floes);
      for (const piece of section.instances) expect(piece.y + piece.height * KIT[piece.kind].height).toBeLessThanOrEqual(3 + 1e-9);
      for (const prop of section.props) expect(prop.baseHeight + prop.height).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(pack.reduce((n, { section }) => n + section.floes!.length, 0)).toBeGreaterThan(200);
    expect(pack.flatMap(({ section }) => section.floes!).some(floe => floe.id.startsWith('cracked:'))).toBe(true);
  });

  it('settles on shelf ice: harbours run jetties over open water; tracks stay off water; pipelines trestle across leads', () => {
    let harbours = 0, piers = 0, tracks = 0, pipes = 0, reached = 0;
    for (const seed of [93, 8831, 11]) {
      for (const site of settlementsNear(seed, 0, 900, undefined, worldOf(VESPER).planet)) {
        expect(site.level).toBeGreaterThanOrEqual(0.6);
        if (site.archetype !== 'harbour') continue;
        harbours++;
        for (const module of site.modules) if (module.base !== undefined) {
          piers++;
          expect(terrainHeight(seed, module.x, module.s, VESPER)).toBeLessThan(SEA - 0.3);
        }
      }
      for (const edge of edgesNear(seed, 0, 900, VESPER)) {
        const road = roadPath(seed, edge, VESPER);
        if (road) { tracks++; for (let i = 0; i < road.x.length; i++) expect(terrainHeight(seed, road.x[i], road.s[i], VESPER)).toBeGreaterThan(SEA); }
        if (!edge.pipe) continue;
        pipes++;
        const run = pipeRun(seed, edge, VESPER);
        if (run.reached) reached++;
        // A line too far across open water is not built; a built one never ends at a shelf edge.
        expect(run.reached || run.pieces.length === 0).toBe(true);
        // Pipes cross leads on trestles: over water only supports reach down, the pipe itself stays above the sea.
        for (const piece of run.pieces) if (piece.node !== 'pipe_support' && terrainHeight(seed, piece.x, piece.s, VESPER) < SEA) expect(pieceBounds(piece).minY).toBeGreaterThan(SEA);
      }
    }
    expect(harbours).toBeGreaterThan(0); expect(piers).toBeGreaterThan(0); expect(tracks).toBeGreaterThan(10);
    expect(reached / pipes).toBeGreaterThanOrEqual(0.8);
  });

  it('opens the ocean arena: open water across the platform, only distant icebergs, no shelves or scatter', () => {
    const arena = { fromS: 1180, toS: 1215 }, world = { planet: 'vesper' as const, arena };
    for (const seed of [93, 8831]) {
      for (let s = arena.fromS; s <= arena.toS; s += 1) for (let x = -HALF; x <= HALF; x += 0.5) expect(terrainHeight(seed, x, s, world)).toBeLessThan(SEA - 0.5);
      for (let index = Math.floor(arena.fromS / VIEW.sectionLength); index <= Math.floor(arena.toS / VIEW.sectionLength); index++) {
        const section = generateTerrainSection(seed, index, world), inside = (s: number) => s >= arena.fromS && s <= arena.toS;
        for (const floe of section.floes!) if (inside(floe.s)) { expect(floe.kind).toBe('iceberg'); expect(Math.abs(floe.x)).toBeGreaterThan(HALF - 4); }
        for (const piece of section.instances) expect(inside(piece.s)).toBe(false);
        for (const prop of section.props) expect(inside(prop.s)).toBe(false);
      }
      // Far from the arena nothing changes.
      expect(generateTerrainSection(seed, 3, world)).toEqual(generateTerrainSection(seed, 3, VESPER));
    }
  });
});

/** Content fingerprint of a section (mesh arrays, pieces, roads): one sha256 over the parts, as recorded. */
function legacyFingerprint(section: TerrainSection) {
  const hash = crypto.createHash('sha256') as unknown as { update(data: string | Uint8Array): unknown; digest(encoding: string): string };
  for (const key of ['positions', 'colors', 'normals', 'glow', 'edges', 'rock', 'indices'] as const) hash.update(new Uint8Array((section[key] as Float32Array).buffer));
  for (const array of [section.roads.positions, section.roads.uvs, section.roads.alpha, section.roads.shade, section.roads.indices]) hash.update(new Uint8Array(array.buffer));
  hash.update(JSON.stringify([section.strips, section.props, section.instances, section.industry, section.roadPaths.map(r => [r.id, [...r.x], [...r.s], [...r.y]])]));
  return hash.digest('hex').slice(0, 16);
}
