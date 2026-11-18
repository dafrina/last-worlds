import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { MISSION_PLANET, runPlanet } from '../../src/content/missions';
import { VESPER_SCENERY_MAX, strongholdClear, strongholdGround, vesperLandform, vesperMoodOf, vesperParams } from '../../src/world/terrain-vesper';
import { SEAT_A, SEAT_ROWS, SEAT_STEP, SEAT_X } from '../../src/world/stronghold-seat';
import { endlessSectorPlan } from '../../src/content/endless';
import { runRoute } from '../../src/world/run-route';
import { NEUTRAL_MOOD } from '../../src/world/terrain-layout';
import { HELION_ARK } from '../../src/content/ark';
import { arenaStopDistance } from '../../src/sim/boss';
import { missionArena } from '../../src/render/scene';
import {
  ARENA_RAMP, FLOE_SETS, beyondArenaClearing, inArenaCore, KIT, MODULE_HEIGHT, PLANETS, ROAD_ENDS, TERRAIN_MAX_HEIGHT, VESPER_SEA_LEVEL, createTerrainStream, edgesNear, generateTerrainSection, pieceBounds, pipeRun, resetTerrainCaches, roadPath,
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
    // Version 16 (21 October 2026: outposts stand in compounds and the mesh carries 5-unit aprons beyond the world edges for
    // the perspective camera, docs/26 §12; Khepri's landform is unchanged, its outposts and their networks move). 93:14 and 11:14 hold a district, 93:17 the quiet buffer's network, 11:5 a fading road
    // end. A deliberate Khepri change updates these. (Version 15: 11:5 84081784ea55aee1, 93:17 7c282c4d5369bfeb, 8831:0
    // d05a930b9d9eaae4, 93:14 0720d390ce865bc1, 11:14 b947c188f94f5283. Version 14, 30 wide: 11:5 6264a0925fd1cf0a,
    // 93:17 e0f86d546be5a503, 8831:0 90c9e92d18c19e9a, 93:14 e3dc7b61ebd1e5fd, 11:14 3829bbfc897fdd83.)
    // Version 21 (28 October 2026): Khepri's roads only where they serve something (works to and beside works, districts,
    // facing compounds; no meanders); roads ending at the shore of a sea planet stand. (Version 20: 11:5 b8a9ccd8cff8cbfe, 93:14 10f9aa7f1cf4a57b, 11:14 f1f33bfa91b42115; legacy 11:5
    // a56a6c4901ef40c3, 93:14 5ea8309c56efda4d, 11:14 88bb97bd1dcd9b46.)
    // Version 20 (28 October 2026): roads straightened and curved (district roads too), partial roads no longer built. (Version 19: 11:5
    // e00567c3297502de, 93:14 1e9365cc6e5332b2, 11:14 fc6d5a4b5ae53608; legacy 11:5 69299a4fe79c13ef, 93:14
    // aa1b91571f267314, 11:14 c8308ba3d774a54f.)
    // 5 November 2026: no wall placed twice at one spot (terrain-walls.ts; user: "places twice the cliff models"). (Before:
    // 93:17 4662497471aeb69d, 8831:0 0af0ef5231085b24, current and legacy alike.)
    // 6 November 2026: the ground's index ranges cut into TERRAIN_BANDS along s (culling; the same vertices and the same
    // triangles as a set, checked, in another order). (Before: 11:5 0092c2abedbd98cf, 93:17 12b58c5f3501156c, 8831:0
    // 5a6ca43d89f31563, 93:14 a3bb6c7412f4c8f9, 11:14 f1f33bfa91b42115; legacy 11:5 0587a46149e8ed94, 93:14
    // b69217949ec23f37, 11:14 9b5ae055aac23117; arena e483adf3f792cc6f.)
    const recorded = new Map([['11:5', 'e95ea503284ab909'], ['93:17', '612648448b748c88'], ['8831:0', '521110ffb209f178'],
      ['93:14', '3f5a488044b27b41'], ['11:14', 'e8c1f5e87ab06f69']]);
    // The rollback switches `KHEPRI.districts = null` and `ROAD_ENDS.taper = 0` still take out the districts and the
    // blended road ends exactly, on the current landform.
    const legacy = new Map([['11:5', 'd39eead1479f6a7d'], ['93:17', '612648448b748c88'], ['8831:0', '521110ffb209f178'],
      ['93:14', 'fcf6012713d48aa4'], ['11:14', '50bececf775aca57']]);
    const check = (fingerprints: Map<string, string>) => {
      for (const [key, value] of fingerprints) {
        const [seed, index] = key.split(':').map(Number);
        expect(legacyFingerprint(generateTerrainSection(seed, index)), key).toBe(value);
      }
      // The arena hides the slot's district and its quiet cells lie elsewhere: unchanged either way.
      expect(legacyFingerprint(generateTerrainSection(93, 16, arena))).toBe('cf692ce9c9c16fa7');
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

  it('lays snowy shelves at several levels (−0.45 to 2.4) ending in sheer cliffs over a sea at −1.2, with water metadata', () => {
    let land = 0, wet = 0, cliffs = 0;
    const levels = new Map<number, number>();
    for (const { section } of sections) {
      const { across, along } = section;
      expect(section.water!.level).toBe(SEA);
      expect(section.water!.shore.length).toBe(across * along);
      for (let v = 0; v < across * along; v++) {
        const y = section.positions[v * 3 + 1], shore = section.water!.shore[v];
        expect(y).toBeLessThanOrEqual(Math.fround(TERRAIN_MAX_HEIGHT));
        expect(Math.abs(shore)).toBeLessThanOrEqual(1);
        expect(shore > 0).toBe(y < SEA);
        if (y < SEA) wet++; else { land++; levels.set(Math.floor(y / 0.5), (levels.get(Math.floor(y / 0.5)) ?? 0) + 1); }
        // Sheer: vertices beside the waterline drop over a short distance.
        if (v % across < across - 1 && (y - SEA) * (section.positions[(v + 1) * 3 + 1] - SEA) < 0 && Math.abs(y - section.positions[(v + 1) * 3 + 1]) > 1.2) cliffs++;
      }
    }
    expect(wet / (wet + land)).toBeGreaterThan(0.2);
    expect(wet / (wet + land)).toBeLessThan(0.7);
    // Version 13 (docs/26 §4): no single shelf level holds most of the ice; at least four half-unit bands hold 8% each
    // (version 12: one band, 0.5–1.5, held nearly everything).
    expect(Math.max(...levels.values()) / land).toBeLessThan(0.45);
    expect([...levels.values()].filter(n => n >= land * 0.08).length).toBeGreaterThanOrEqual(4);
    expect(cliffs).toBeGreaterThan(50);
  });

  it('is half land, half water over long stretches of the route (user, 21 October; 70/30 before terrain version 15)', () => {
    // Land is anything at or above the waterline across the whole world width (the camera pans over all of it);
    // water is leads, inlets, bays and pack-ice seas (floes float on water and count as water).
    const fractions = [93, 8831, 11, 4242, 7].map(seed => {
      let land = 0, total = 0;
      for (let s = 0.5; s < 3072; s += 1) for (let x = -HALF + 0.5; x < HALF; x += 1) { total++; if (terrainHeight(seed, x, s, VESPER) >= SEA) land++; }
      return land / total;
    });
    const mean = fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
    expect(mean).toBeGreaterThanOrEqual(0.45); expect(mean).toBeLessThanOrEqual(0.55);
    for (const fraction of fractions) { expect(fraction).toBeGreaterThan(0.4); expect(fraction).toBeLessThan(0.6); }
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
    // The usual sections plus two in each seed's first pack-ice sea.
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
        // On ice above the sea, and at its own shelf's level: no pad sinks into a pit under the cap (docs/26 §5).
        expect(site.level).toBeGreaterThanOrEqual(SEA + 0.75);
        const raw = vesperLandform(seed, site.x, site.s, { seed, s: site.s, params: NEUTRAL_MOOD, local: vesperParams(seed, site.s), platform: 0 }).height;
        // (The level snaps to quarter units and tops out at 2.25 under the highest ice.)
        expect(Math.abs(site.level - raw)).toBeLessThanOrEqual(0.2);
        for (const module of site.modules) if (module.kind !== 'kit' && module.base === undefined) expect(site.level + MODULE_HEIGHT[module.node]).toBeLessThanOrEqual(3 + 1e-9);
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

  it('shows a healthy share of outposts in view, every archetype of the facility sheet, fewer than Khepri (docs/26 §5)', () => {
    // Buildings (outpost pieces and their tanks, halls and containers; pipes not counted) per km within |x| ≤ 7, the
    // band the centred camera shows. Version 12: Vesper 54–63 against Khepri 89–118 (most outposts stood off to the
    // sides, many sunk into pits under the scenery cap); version 13: Vesper 81–86 against Khepri 82–116.
    const archetypes = new Set<string>();
    let vesperTotal = 0, khepriTotal = 0;
    for (const seed of [93, 8831, 11]) {
      let vesper = 0, khepri = 0;
      for (let index = 1; index <= 28; index++) {
        for (const [planet, add] of [['vesper', (n: number) => { vesper += n; }], ['khepri', (n: number) => { khepri += n; }]] as const) {
          const section = generateTerrainSection(seed, index, { planet });
          add(section.props.filter(prop => Math.abs(prop.x) <= 7).length + section.industry.filter(piece => !piece.node.startsWith('pipe_') && Math.abs(piece.x) <= 7).length);
        }
      }
      const km = 28 * VIEW.sectionLength / 1000;
      // (Version 15 turned half of Vesper to water, user 21 October: 56–93 per km since.)
      expect(vesper / km).toBeGreaterThan(50);
      vesperTotal += vesper; khepriTotal += khepri;
      for (const site of settlementsNear(seed, 0, 3000, undefined, worldOf(VESPER).planet)) archetypes.add(site.archetype);
    }
    expect(vesperTotal).toBeLessThan(khepriTotal);
    expect([...archetypes].sort()).toEqual(['cryo', 'exchanger', 'harbour', 'missile', 'plant', 'radiator', 'reactor']);
  }, 180_000);

  it('lays Cold Vector\'s arena (its stop −9 … +35) low just above the sea, rich and not plain, with HELION STRONGHOLD at the head of its corridor and mountains at its sides', () => {
    // The mission's arena comes from the boss's own constants: the scroll stops at 1075.25 (935 before pace 1.15, 6 November).
    const config = { mode: 'campaign', mission: 'cold-vector', seed: 93 } as Parameters<typeof missionArena>[0];
    const arena = missionArena(config)!, world = { planet: 'vesper' as const, arena }, stop = arenaStopDistance(HELION_ARK.arena);
    expect(stop).toBeCloseTo(1075.25, 9);
    expect(arena).toEqual({ fromS: stop - 9, toS: stop + 35 });
    expect(missionArena({ ...config, mission: 'bastion' })).toEqual({ fromS: 776.25 - 9, toS: 776.25 + 26 });
    expect(missionArena({ ...config, mode: 'endless' })).toBeUndefined();
    const at = (seed: number, x: number, a: number) => terrainHeight(seed, x, arena.fromS + a, world);
    // The model's measured top (src/world/stronghold-seat.ts) by world x and arena-relative s; NaN off the model.
    const top = (x: number, a: number) => {
      const row = SEAT_ROWS[Math.round((a - SEAT_A) / SEAT_STEP)], code = row?.charCodeAt(Math.round((x + SEAT_X) / SEAT_STEP));
      return code === undefined || code === 46 || Number.isNaN(code) ? NaN : (code - 48) / 10 - 4;
    };
    for (const seed of [93, 8831, 11]) {
      let land = 0, wet = 0, nearWet = 0, pressed = 0, varied = 0, corridorHigh = -Infinity, beyond = -Infinity, peaks = -Infinity, lanes = -Infinity;
      const heights: number[] = [];
      for (let a = -12; a <= 76; a += 0.5) for (let x = -HALF; x <= HALF; x += 0.5) {
        const h = at(seed, x, a);
        // The play area keeps under the scenery cap, 0.8 under the flight plane; the ground under the fight's lanes before
        // the fortress stays low, the tall peaks stand beside and behind it.
        expect(h, `${x}, ${a}`).toBeLessThanOrEqual(VESPER_SCENERY_MAX);
        if (a > -12 && a < 20 && Math.abs(x) < 7) lanes = Math.max(lanes, h);
        if (a > 22 && a < 42 && Math.abs(x) > 7) peaks = Math.max(peaks, h);
        if (Number.isNaN(top(x, a))) {
          if (h < SEA) { wet++; if (a > 18 && a < 34 && Math.abs(x) < 9) nearWet++; } else land++;
          // The low ground: just above the sea where it is not mountain.
          if (h >= SEA && Math.abs(x) < 7 && a > 0 && a < 20) { pressed += h < -1.6 ? 1 : 0; heights.push(h); }
        }
        // The corridor the fight and the departure fly over stays low past the fortress's shoulder.
        if (a > 40 && a < 60 && Math.abs(x) < 5) corridorHigh = Math.max(corridorHigh, h);
      }
      // Mostly land, its leads and pockets of dark water kept; none round the fortress.
      expect(land / (land + wet)).toBeGreaterThan(0.7);
      expect(wet).toBeGreaterThan(0);
      expect(nearWet).toBe(0);
      // Low: just above the sea, and not plain: its relief (ridges, drifts, rock, crevasses, small shelf breaks) varies.
      expect(pressed / heights.length).toBeGreaterThan(0.85);
      const mean = heights.reduce((sum, h) => sum + h, 0) / heights.length;
      varied = Math.sqrt(heights.reduce((sum, h) => sum + (h - mean) ** 2, 0) / heights.length);
      expect(mean).toBeLessThan(SEA + 1.4);
      expect(varied).toBeGreaterThan(0.12);
      expect(corridorHigh).toBeLessThan(-1);
      expect(lanes).toBeLessThan(SEA + 3.5);
      expect(peaks).toBeGreaterThan(2.2);
      // Beyond the world's edges the mountains rise over the play area's ground (whose massif keeps to 0.6 inside it).
      for (let a = 0; a <= 60; a += 1) for (const x of [-15, -14, 14, 15]) beyond = Math.max(beyond, at(seed, x, a));
      expect(beyond).toBeGreaterThan(1.8);
      // The ground before the fortress stays well under its barrels (−0.7) and housings.
      for (let a = 16; a <= 22; a += 0.5) for (let x = -5; x <= 5; x += 0.5) expect(at(seed, x, a), `${x}, ${a}`).toBeLessThan(-1.2);
      // The ground keeps under the model, except its rear, which the mountain takes in, and meets it at its edge (burying
      // the cut faces).
      for (let a = SEAT_A; a < SEAT_A + SEAT_ROWS.length * SEAT_STEP; a += SEAT_STEP) for (let x = -SEAT_X; x <= SEAT_X; x += SEAT_STEP) {
        const t = top(x, a), rear = a > 29.5 || (a > 27.7 && Math.abs(x) > 3.6);
        if (!Number.isNaN(t)) { if (!rear) expect(at(seed, x, a), `${x}, ${a}`).toBeLessThan(Math.max(t - 0.05, SEA + 0.2)); continue; }
        const near = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([i, j]) => top(x + i * SEAT_STEP, a + j * SEAT_STEP)).filter(h => !Number.isNaN(h));
        if (near.length && Math.abs(x) > 6) expect(at(seed, x, a), `${x}, ${a}`).toBeGreaterThan(Math.max(...near) - 0.05);
      }
      // The land takes over before the arena; far from it nothing changes.
      expect(generateTerrainSection(seed, 3, world)).toEqual(generateTerrainSection(seed, 3, VESPER));
      expect(terrainHeight(seed, 2, arena.fromS + 110, world)).toBe(terrainHeight(seed, 2, arena.fromS + 110, VESPER));
      // Nothing stands in the fortress's plan; no outposts in the arena; no ice walls on the mountains or round the fortress;
      // crags round it; floes only on the open water.
      const inside = (s: number) => s >= arena.fromS - ARENA_RAMP && s <= arena.toS + ARENA_RAMP;
      let rocks = 0;
      for (let index = Math.floor((arena.fromS - ARENA_RAMP) / VIEW.sectionLength); index <= Math.floor((arena.toS + ARENA_RAMP) / VIEW.sectionLength); index++) {
        const section = generateTerrainSection(seed, index, world);
        for (const piece of section.instances) {
          const where = `${piece.kind} at ${piece.x.toFixed(2)}, ${(piece.s - arena.fromS).toFixed(2)}`;
          expect(strongholdClear(arena, piece.x, piece.s), where).toBe(true);
          const hold = strongholdGround(arena, seed, piece.x, piece.s)!;
          if (piece.kind === 'iceWall') expect(hold.massif < 0.05 && strongholdClear(arena, piece.x, piece.s, 2), where).toBe(true);
          const a = piece.s - arena.fromS;
          if (piece.kind === 'outcrop' && a > 20 && a < 34 && Math.abs(piece.x) < 9) rocks++;
        }
        for (const prop of section.props) expect(inside(prop.s)).toBe(false);
      }
      expect(rocks).toBeGreaterThan(10);
    }
  }, 180_000);

  it('builds the stronghold\'s mountains deterministically, streamed as generated, and on the endless Vesper boss stop too', () => {
    const config = { mode: 'campaign', mission: 'cold-vector', seed: 8831 } as Parameters<typeof missionArena>[0];
    const arena = missionArena(config)!, world = { planet: 'vesper' as const, arena };
    const first = Math.floor((arena.fromS + 18) / VIEW.sectionLength), last = Math.floor((arena.fromS + 60) / VIEW.sectionLength);
    for (let index = first; index <= last; index++) {
      const section = generateTerrainSection(8831, index, world);
      resetTerrainCaches();
      expect(generateTerrainSection(8831, index, world)).toEqual(section);
    }
    const stream = createTerrainStream(8831, world), sections = stream.update(arena.fromS + 20);
    for (const section of sections) expect(section).toEqual(generateTerrainSection(8831, section.index, world));
    // Endless reaches Vesper's boss stop (sector 7) with the same arena shape: land, the valley and the mountains at its stop.
    const plan = endlessSectorPlan(7);
    expect(plan.boss).toBe('ark');
    const route = runRoute({ mode: 'endless' }), from = plan.stop!.platform.from;
    expect(route.worldAt(from + 27).planet.id).toBe('vesper');
    for (const [x, a] of [[0, 18], [3, 20], [0, 45]]) {
      const h = terrainHeight(21, x, from + a, route);
      expect(h, `${x}, ${a}`).toBeGreaterThan(SEA); expect(h, `${x}, ${a}`).toBeLessThan(-1.2);
    }
    let beyond = -Infinity;
    for (let a = 10; a <= 50; a += 1) beyond = Math.max(beyond, terrainHeight(21, -14.5, from + a, route), terrainHeight(21, 14.5, from + a, route));
    expect(beyond).toBeGreaterThan(1.8);
  }, 120_000);
});

/** Content fingerprint of a section (mesh arrays, pieces, roads): one sha256 over the parts, as recorded. */
function legacyFingerprint(section: TerrainSection) {
  const hash = crypto.createHash('sha256') as unknown as { update(data: string | Uint8Array): unknown; digest(encoding: string): string };
  for (const key of ['positions', 'colors', 'normals', 'glow', 'edges', 'rock', 'indices'] as const) hash.update(new Uint8Array((section[key] as Float32Array).buffer));
  for (const array of [section.roads.positions, section.roads.uvs, section.roads.alpha, section.roads.shade, section.roads.indices]) hash.update(new Uint8Array(array.buffer));
  hash.update(JSON.stringify([section.strips, section.props, section.instances, section.industry, section.roadPaths.map(r => [r.id, [...r.x], [...r.s], [...r.y]])]));
  return hash.digest('hex').slice(0, 16);
}
