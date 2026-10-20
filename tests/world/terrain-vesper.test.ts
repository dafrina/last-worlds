import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { MISSION_PLANET, runPlanet } from '../../src/content/missions';
import { vesperMoodOf } from '../../src/world/terrain-vesper';
import { HELION_ARK } from '../../src/content/ark';
import { arenaStopDistance } from '../../src/sim/bastion';
import { missionArena } from '../../src/render/scene';
import {
  ARENA_RAMP, FLOE_SETS, KIT, PLANETS, ROAD_ENDS, VESPER_SEA_LEVEL, createTerrainStream, edgesNear, generateTerrainSection, pieceBounds, pipeRun, resetTerrainCaches, roadPath,
  sectionSteps, settlementsNear, terrainHeight, worldOf, type TerrainSection,
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
    // Version 11 (20 October 2026: Khepri refinery districts and blended road ends, docs/23; 93:14 and 11:15 hold a
    // district, 93:17 its quiet buffer's network, 11:5 road ends). A deliberate Khepri change updates these.
    const recorded = new Map([['11:5', '0a35aa617c498347'], ['93:17', 'd2f697ee4aa9cbf5'], ['8831:0', '6f8ab45f5ca93567'],
      ['93:14', 'a075fa7a78c1ae3f'], ['11:15', '339fca3c12a77833']]);
    // Version 10 (recorded 17 October 2026): the rollback switches `KHEPRI.districts = null` and `ROAD_ENDS.taper = 0`
    // must restore it exactly.
    const legacy = new Map([['11:5', '1a3d335a519d4f15'], ['93:17', 'fb13f53000739644'], ['8831:0', '6f8ab45f5ca93567'],
      ['93:14', 'ee056c613dce01b5'], ['11:15', 'cf32b85aed253436']]);
    const check = (fingerprints: Map<string, string>) => {
      for (const [key, value] of fingerprints) {
        const [seed, index] = key.split(':').map(Number);
        expect(legacyFingerprint(generateTerrainSection(seed, index)), key).toBe(value);
      }
      // The arena hides the slot's district and its quiet cells lie elsewhere: unchanged either way.
      expect(legacyFingerprint(generateTerrainSection(93, 16, arena))).toBe('461ca4d8c9f0203f');
    };
    check(recorded);
    const policy = PLANETS.khepri.districts, taper = ROAD_ENDS.taper;
    try {
      PLANETS.khepri.districts = null; ROAD_ENDS.taper = 0; resetTerrainCaches();
      check(legacy);
    } finally { PLANETS.khepri.districts = policy; ROAD_ENDS.taper = taper; resetTerrainCaches(); }
  });

  it('maps missions to planets; endless starts on Luna', () => {
    expect(MISSION_PLANET['cold-vector']).toBe('vesper');
    expect(MISSION_PLANET.bastion).toBe('khepri');
    expect(runPlanet({ mode: 'campaign', mission: 'cold-vector' })).toBe('vesper');
    expect(runPlanet({ mode: 'endless', mission: 'cold-vector' })).toBe('luna');
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
    // Mostly the kit's jagged outlines and cracked sets; the first convex plates (floe_0–3) only now and then.
    const pieces = [...sections, ...pack].flatMap(({ section }) => section.floes!).filter(floe => floe.kind !== 'iceberg');
    const convex = pieces.filter(floe => floe.kind === 'floe' && floe.variant < 4).length;
    expect(convex / pieces.length).toBeLessThan(0.2);
    expect(pieces.some(floe => floe.kind === 'floe' && floe.variant >= 8)).toBe(true);
    expect(pieces.some(floe => floe.kind === 'floe' && floe.variant >= 4 && floe.variant <= 5)).toBe(true);
    // Cracked sets: every piece at origin + R(yaw)·offset × one factor per set, all with the set's yaw and scale.
    const sets = new Map<string, typeof pieces>();
    for (const floe of pieces) if (floe.id.startsWith('set:')) sets.set(floe.id.slice(0, floe.id.lastIndexOf(':')), [...sets.get(floe.id.slice(0, floe.id.lastIndexOf(':'))) ?? [], floe]);
    expect(sets.size).toBeGreaterThan(5);
    for (const group of sets.values()) {
      const factors = group.map(floe => {
        expect(floe.kind in FLOE_SETS).toBe(true);
        expect(floe.rotation).toBe(group[0].rotation); expect(floe.scaleX).toBe(group[0].scaleX); expect(floe.originX).toBe(group[0].originX);
        // Back into the set's frame (three.js axes: z = −s; yaw about +y).
        const dx = floe.x - floe.originX!, dz = floe.originS! - floe.s, c = Math.cos(floe.rotation), n = Math.sin(floe.rotation);
        const lx = dx * c - dz * n, lz = dx * n + dz * c, [ox, oz] = FLOE_SETS[floe.kind as keyof typeof FLOE_SETS].offsets[floe.variant];
        expect(Math.abs(lx * oz - lz * ox)).toBeLessThan(1e-9);
        return Math.hypot(lx, lz) / Math.hypot(ox, oz);
      });
      for (const factor of factors) { expect(factor).toBeCloseTo(factors[0], 9); expect(factor / group[0].scaleX).toBeGreaterThanOrEqual(1); expect(factor / group[0].scaleX).toBeLessThanOrEqual(1.3 + 1e-9); }
    }
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

  it('opens the Cold Vector ocean arena (926–970): open water, nothing afloat on it, calm ramps with distant bergs only', () => {
    // The mission's arena comes from the Ark's own constants: the scroll stops at 935.
    const config = { mode: 'campaign', mission: 'cold-vector', seed: 93 } as Parameters<typeof missionArena>[0];
    const arena = missionArena(config)!, world = { planet: 'vesper' as const, arena };
    expect(arenaStopDistance(HELION_ARK.arena)).toBe(935);
    expect(arena).toEqual({ fromS: 926, toS: 970 });
    expect(missionArena({ ...config, mission: 'bastion' })).toEqual({ fromS: 666, toS: 701 });
    expect(missionArena({ ...config, mode: 'endless' })).toBeUndefined();
    for (const seed of [93, 8831, 11]) {
      for (let s = arena.fromS; s <= arena.toS; s += 1) for (let x = -HALF; x <= HALF; x += 0.5) expect(terrainHeight(seed, x, s, world)).toBeLessThan(SEA - 0.5);
      const inside = (s: number) => s >= arena.fromS && s <= arena.toS, ramp = (s: number) => !inside(s) && s > arena.fromS - ARENA_RAMP && s < arena.toS + ARENA_RAMP;
      let land = 0;
      for (let index = Math.floor((arena.fromS - ARENA_RAMP) / VIEW.sectionLength); index <= Math.floor((arena.toS + ARENA_RAMP) / VIEW.sectionLength); index++) {
        const section = generateTerrainSection(seed, index, world);
        for (const floe of section.floes!) {
          expect(inside(floe.s)).toBe(false);
          if (ramp(floe.s)) { expect(floe.kind).toBe('iceberg'); expect(Math.abs(floe.x)).toBeGreaterThan(HALF - 4); }
        }
        for (const piece of section.instances) expect(inside(piece.s)).toBe(false);
        for (const prop of section.props) expect(inside(prop.s)).toBe(false);
      }
      // The shelf edge pulls back but still frames the approach: there is shelf ice on the ramp before the platform.
      for (let s = arena.fromS - ARENA_RAMP; s < arena.fromS - 10; s += 1) for (let x = -HALF; x <= HALF; x += 1) if (terrainHeight(seed, x, s, world) >= SEA) land++;
      expect(land).toBeGreaterThan(0);
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
