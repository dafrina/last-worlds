import { describe, expect, it } from 'vitest';
import {
  KHEPRI_DISTRICTS, MODULES, PLANETS, ROAD_ENDS, createTerrainStream, districtHidden, districtPlan, districtsNear, edgesNear, generateTerrainSection, padDistance,
  pieceBounds, resetTerrainCaches, roadPath, rotatePiece, routeCenter, sectionSteps, settlementsNear, terrainHeight, worldOf,
  type DistrictPlan, type IndustryPiece, type RoadEnd, type RoadMesh, type RoadPath, type TerrainSection,
} from '../../src/world/terrain';
import { districtPlanSteps, socketOffset } from '../../src/world/terrain-districts';
import { districtRoadsSteps, fadeProfile, roadRibbons } from '../../src/world/terrain-network';
import { finish } from '../../src/world/terrain-work';
import { runRoute } from '../../src/render/terrain-route';
import { endlessSchedule } from '../../src/content/endless';
import { VIEW } from '../../src/shared/contracts';

const KHEPRI = PLANETS.khepri, POLICY = KHEPRI_DISTRICTS, WORLD = worldOf({ planet: 'khepri' });
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const plans = () => SEEDS.map(seed => [seed, districtPlan(seed, KHEPRI, 0)] as const).filter((entry): entry is readonly [number, DistrictPlan] => entry[1] !== null);
const HALF = VIEW.worldWidth / 2;

/** Centreline end points (world x, y, s) of a pipe piece: straights and valves both ways, tees add the branch, elbows two arms. */
function pipeEnds(piece: IndustryPiece): [number, number, number][] {
  const z = piece.scaleZ, local: [number, number, number][] = piece.node.endsWith('elbow') ? [[0, 0.35, -1], [1, 0.35, 0]]
    : piece.node.endsWith('tee') ? [[0, 0.35, -1], [0, 0.35, 1], [1, 0.35, 0]] : [[0, 0.35, -z], [0, 0.35, z]];
  return local.map(v => { const [x, y, z] = rotatePiece(piece.rotation, piece.pitch, piece.roll, v); return [piece.x + x, piece.y + y, piece.s - z]; });
}
/** Axis-aligned world footprint of a placed module (quarter turns only). */
function footprint(node: string, x: number, s: number, yaw: number) {
  const [hx, hz] = MODULES[node].half, turned = Math.abs(Math.sin(yaw)) > 0.5;
  const [ax, as] = turned ? [hz, hx] : [hx, hz];
  return { minX: x - ax, maxX: x + ax, minS: s - as, maxS: s + as };
}
const overlap = (a: { minX: number; maxX: number; minS: number; maxS: number }, b: typeof a, slack = 0) =>
  a.minX < b.maxX - slack && a.maxX > b.minX + slack && a.minS < b.maxS - slack && a.maxS > b.minS + slack;

describe('Khepri refinery districts (docs/23 §5)', () => {
  it('plans a district in most slots, identically whether planned at once or in resumable steps', () => {
    const found = plans();
    // 23 of 40 seeds in the 24-wide world (21 October; at least 26 in the 30-wide world): less room beside the lane.
    expect(found.length).toBeGreaterThanOrEqual(22);
    // The sides, directions and positions vary with the seed.
    expect(new Set(found.map(([, plan]) => plan.side)).size).toBe(2);
    expect(new Set(found.map(([, plan]) => plan.dir)).size).toBe(2);
    for (const [seed, plan] of found.slice(0, 4)) {
      resetTerrainCaches();
      const work = districtPlanSteps(seed, KHEPRI, 0);
      let step = work.next(), count = 0;
      while (!step.done) { step = work.next(); count++; }
      expect(count).toBeGreaterThan(50);
      expect(step.value).toEqual(plan);
    }
  });

  it('terraces each district inside its window, the world and clear of the centre lane, under the structure cap', () => {
    for (const [seed, plan] of plans()) {
      expect(plan.minS).toBeGreaterThanOrEqual(POLICY.first);
      expect(plan.maxS).toBeLessThanOrEqual(POLICY.first + POLICY.length);
      plan.lots.forEach((lot, i) => {
        expect(Math.abs(lot.x) + lot.hx).toBeLessThanOrEqual(HALF - 0.3);
        for (let s = lot.s - lot.hs; s <= lot.s + lot.hs; s += 1) expect(Math.abs(lot.x - lot.side * lot.hx - routeCenter(seed, 1, s)), `${seed} lane`).toBeGreaterThanOrEqual(POLICY.lane - 1e-9);
        if (i > 0) expect(Math.abs(lot.level - plan.lots[i - 1].level)).toBeLessThanOrEqual(POLICY.graph.maxStep);
        for (const module of lot.modules) {
          const spec = MODULES[module.node];
          expect((module.base ?? lot.level) + spec.top, `${seed} ${module.node} cap`).toBeLessThanOrEqual(POLICY.structureMax + 1e-9);
          // Fully on the flattened pad: no corner overhangs the falloff.
          const box = footprint(module.node, module.x, module.s, module.yaw);
          for (const [x, s] of [[box.minX, box.minS], [box.minX, box.maxS], [box.maxX, box.minS], [box.maxX, box.maxS]]) expect(padDistance(lot, x, s), `${seed} ${module.id}`).toBeLessThanOrEqual(1e-6);
        }
      });
      for (const piece of plan.pieces) expect(pieceBounds(piece).maxY).toBeLessThanOrEqual(POLICY.structureMax);
    }
  });

  it('never stacks pieces: modules keep apart, and pipes pass beside them (haulers park on their crawler tracks)', () => {
    for (const [seed, plan] of plans()) {
      const modules = plan.lots.flatMap(lot => lot.modules).map(module => ({ module, box: footprint(module.node, module.x, module.s, module.yaw) }));
      for (let i = 0; i < modules.length; i++) for (let j = i + 1; j < modules.length; j++) {
        const [a, b] = [modules[i], modules[j]], parked = [a.module.node, b.module.node].some(n => n.startsWith('infra_cargo')) && [a.module.node, b.module.node].includes('infra_track_segment');
        const tiles = a.module.node === 'infra_track_segment' && b.module.node === 'infra_track_segment';
        if (!parked && !tiles) expect(overlap(a.box, b.box, 0.02), `${seed} ${a.module.id} / ${b.module.id}`).toBe(false);
      }
      for (const piece of plan.pieces.filter(piece => piece.node !== 'pipe_support')) {
        // A pipe end may run onto the slab of the module it feeds (the refinery's inlets sit up to 0.52 inside its contract box).
        const b = pieceBounds(piece), core = { minX: b.minX + 0.6, maxX: b.maxX - 0.6, minS: b.minS + 0.6, maxS: b.maxS - 0.6 };
        for (const { module, box } of modules) expect(overlap(core, box, 0.05), `${seed} ${piece.id} through ${module.id}`).toBe(false);
      }
    }
  });

  it('joins its pipework end to end at the pad level; open ends only meet module sockets or close in a valve', () => {
    let fed = 0;
    for (const [seed, plan] of plans()) {
      const lot = plan.lots[1], pipes = plan.pieces.filter(piece => piece.node !== 'pipe_support');
      const ends = pipes.flatMap(piece => pipeEnds(piece).map(end => ({ piece, end })));
      const sockets = lot.modules.flatMap(module => MODULES[module.node].sockets.map(socket => {
        const [ox, os] = socketOffset(module.yaw, socket.at[0], socket.at[2]), [nx, ns] = socketOffset(module.yaw, ...([[0, -1], [1, 0], [0, 1], [-1, 0]][socket.facing] as [number, number]));
        return { module, x: module.x + ox, s: module.s + os, nx, ns, wall: module.node === 'facility' };
      }));
      for (const { piece, end } of ends) {
        expect(end[1], piece.id).toBeCloseTo(lot.level + 0.35, 9);
        const joined = ends.some(other => other.piece !== piece && Math.hypot(other.end[0] - end[0], other.end[2] - end[2]) < 1e-6);
        if (joined) continue;
        const socket = sockets.find(item => {
          const dx = end[0] - item.x, ds = end[2] - item.s, normal = Math.abs(dx * item.nx + ds * item.ns), lateral = Math.abs(dx * item.ns - ds * item.nx);
          return normal < 0.03 && lateral < (item.wall ? 0.6 : 0.03);
        });
        if (socket) { fed++; continue; }
        expect(piece.node, `${seed} open end of ${piece.id}`).toBe('pipe_valve');
      }
    }
    expect(fed).toBeGreaterThan(plans().length * 4);
  });

  it('owns every district piece once, in any section order, with nothing dropped at a section seam or the cap', () => {
    for (const seed of [11, 93]) {
      const plan = districtPlan(seed, KHEPRI, 0)!;
      const indices = Array.from({ length: Math.floor(plan.maxS / VIEW.sectionLength) - Math.floor(plan.minS / VIEW.sectionLength) + 1 }, (_, i) => Math.floor(plan.minS / VIEW.sectionLength) + i);
      expect(indices.length).toBeGreaterThanOrEqual(2);
      resetTerrainCaches();
      const ordered = indices.map(index => generateTerrainSection(seed, index));
      resetTerrainCaches();
      const shuffled = [...indices].reverse().map(index => generateTerrainSection(seed, index)).reverse();
      expect(shuffled).toEqual(ordered);
      const ids = (sections: TerrainSection[]) => sections.flatMap(section => [...section.props.filter(prop => prop.group.startsWith(plan.id)).map(prop => prop.id),
        ...section.industry.filter(piece => piece.group.startsWith(plan.id)).map(piece => piece.id)]);
      const owned = ids(ordered);
      expect(new Set(owned).size).toBe(owned.length);
      expect(owned.length).toBe(plan.lots.reduce((n, lot) => n + lot.modules.length, 0) + plan.pieces.length);
      // Pads are flat where pieces stand, so nothing floats or sinks.
      for (const section of ordered) for (const prop of section.props.filter(prop => prop.group.startsWith(plan.id))) {
        const lot = plan.lots.find(item => item.id === prop.group)!;
        expect(terrainHeight(seed, prop.x, prop.s)).toBeCloseTo(lot.level, 6);
      }
      expect(ordered.some(section => section.sites?.length)).toBe(true);
    }
  });

  it('streams a district from prefetched, resumable work exactly like synchronous generation', () => {
    const route = runRoute({ mode: 'campaign', mission: 'bastion' });
    for (const speed of [5, 11]) {
      resetTerrainCaches();
      const stream = createTerrainStream(11, route);
      let distance = 330;
      for (let frame = 0; distance < 640; frame++) {
        distance += speed / 60;
        stream.update(distance);
        let left = 30;
        stream.prefetch(distance, () => left-- > 0);
      }
      expect(stream.stats.fallbacks).toBe(0);
      for (const section of stream.update(distance)) expect(section).toEqual(generateTerrainSection(11, section.index, route));
    }
    // Two district sections advanced alternately one step at a time share every plan and path cache mid-search.
    resetTerrainCaches();
    const a = sectionSteps(93, 13, route), b = sectionSteps(93, 14, route);
    let ra = a.next(), rb = b.next();
    while (!ra.done || !rb.done) { if (!ra.done) ra = a.next(); if (!rb.done) rb = b.next(); }
    resetTerrainCaches();
    expect(ra.value).toEqual(generateTerrainSection(93, 13, route));
    expect(rb.value).toEqual(generateTerrainSection(93, 14, route));
  }, 120_000);

  it('connects each district to the network at its gates; internal roads end at gates and yards and avoid pieces', () => {
    let reached = 0;
    const found = plans();
    for (const [seed, plan] of found) {
      const roads = finish(districtRoadsSteps(seed, plan, WORLD)), last = (r: typeof roads[number]) => [r.x[r.x.length - 1], r.s[r.s.length - 1]];
      const spine = roads.find(road => road.id.endsWith(':spine'))!, yard = plan.spine[plan.spine.length - 1];
      // The spine continues the main gate's network road (joined), or starts on the hub yard; it ends on the last yard.
      const near = (road: typeof spine, [x, s]: readonly [number, number]) => Math.min(...Array.from(road.x, (rx, i) => Math.hypot(rx - x, road.s[i] - s)));
      if (spine.ends![0] === 'joined') { expect(Math.hypot(spine.x[0] - plan.gates[0].x, spine.s[0] - plan.gates[0].s)).toBeLessThanOrEqual(1.5); reached++; }
      else expect([spine.x[0], spine.s[0]]).toEqual([...plan.hubYard]);
      expect(near(spine, plan.hubYard)).toBeLessThan(0.3);
      expect(last(spine)[0]).toBeCloseTo(yard[0], 9); expect(last(spine)[1]).toBeCloseTo(yard[1], 9);
      expect(spine.ends![1]).toBe('apron');
      for (const spur of roads.filter(road => road !== spine && !/:\d+$/.test(road.id))) {
        const gate = plan.gates.find(item => spur.id.endsWith(`:${item.id}`))!;
        expect(Math.hypot(spur.x[0] - gate.x, spur.s[0] - gate.s)).toBeLessThanOrEqual(1.5);
        expect(spur.ends).toEqual(['joined', 'joined']);
        expect(last(spur)[0]).toBeCloseTo(plan.hubYard[0], 9); expect(last(spur)[1]).toBeCloseTo(plan.hubYard[1], 9);
        if (spine.ends![0] !== 'joined') reached++;
      }
      const modules = plan.lots.flatMap(lot => lot.modules).filter(module => !module.node.startsWith('infra_track') && !module.node.startsWith('infra_cargo'));
      for (const road of roads) for (let i = 0; i < road.x.length; i++) {
        if (i > 0) expect(Math.abs(road.y[i] - road.y[i - 1]) / (road.length[i] - road.length[i - 1]), `${seed} ${road.id} grade`).toBeLessThanOrEqual(0.8);
        for (const module of modules) {
          const box = footprint(module.node, module.x, module.s, module.yaw);
          expect(road.x[i] > box.minX - 0.5 && road.x[i] < box.maxX + 0.5 && road.s[i] > box.minS - 0.5 && road.s[i] < box.maxS + 0.5, `${seed} ${road.id} over ${module.id}`).toBe(false);
        }
      }
      // Network roads keep off the lots behind the hub, and off every district piece.
      const pieces = plan.lots.flatMap(lot => lot.modules).map(module => footprint(module.node, module.x, module.s, module.yaw));
      for (const edge of edgesNear(seed, plan.minS - 20, plan.maxS + 20, WORLD)) {
        const road = edge.road ? roadPath(seed, edge, WORLD) : null;
        if (road) for (let i = 0; i < road.x.length; i++) {
          for (const lot of plan.lots.slice(1)) expect(padDistance(lot, road.x[i], road.s[i]), `${seed} ${edge.id}`).toBeGreaterThan(-0.5);
          for (const box of pieces) expect(road.x[i] > box.minX - 0.3 && road.x[i] < box.maxX + 0.3 && road.s[i] > box.minS - 0.3 && road.s[i] < box.maxS + 0.3, `${seed} ${edge.id} over a piece`).toBe(false);
        }
      }
    }
    expect(reached / found.length).toBeGreaterThanOrEqual(0.75);
    // In a run's own world (Rolling Thunder drops the edges near its arena) every joined network end continues into a
    // district road, and every district road starts at a gate's network road or on its yard: nothing dangles.
    const route = runRoute({ mode: 'campaign', mission: 'bastion' });
    for (const [seed, plan] of found.slice(0, 12)) {
      const roads = new Map<string, RoadPath>();
      for (let index = Math.floor(plan.minS / VIEW.sectionLength) - 1; index <= Math.floor(plan.maxS / VIEW.sectionLength) + 1; index++) {
        for (const road of generateTerrainSection(seed, index, route).roadPaths) roads.set(road.id, road);
      }
      const internal = (road: RoadPath) => road.id.startsWith(`${plan.id}:road:`);
      const district = [...roads.values()].filter(internal), network = [...roads.values()].filter(road => !internal(road));
      const starts = district.map(road => [road.x[0], road.s[0]]);
      for (const road of network) road.ends?.forEach((kind, end) => {
        if (kind !== 'joined') return;
        const i = end ? road.x.length - 1 : 0;
        expect(starts.some(([x, s]) => Math.hypot(x - road.x[i], s - road.s[i]) < 1e-9), `${seed} ${road.id}`).toBe(true);
      });
      for (const road of district.filter(road => road.ends![0] === 'joined')) {
        expect(network.some(other => other.ends?.some((kind, end) => kind === 'joined' && Math.hypot(other.x[end ? other.x.length - 1 : 0] - road.x[0], other.s[end ? other.s.length - 1 : 0] - road.s[0]) < 1e-9)), `${seed} ${road.id}`).toBe(true);
      }
    }
  }, 180_000);

  it('leaves quiet ground beside a district and keeps districts off arenas, planet seams and jumps', () => {
    for (const [seed, plan] of plans()) {
      for (const site of settlementsNear(seed, plan.minS - 60, plan.maxS + 60, undefined, KHEPRI)) {
        if (site.district || site.side !== plan.side) continue;
        expect(site.s + site.hs < plan.minS - POLICY.quiet + 3 || site.s - site.hs > plan.maxS + POLICY.quiet - 3, `${seed} ${site.id}`).toBe(true);
      }
    }
    // Rolling Thunder: at most one district, before the Bastion arena's approach.
    const thunder = runRoute({ mode: 'campaign', mission: 'bastion' });
    for (const seed of SEEDS) {
      const visible = districtsNear(seed, KHEPRI, 0, 720).filter(plan => !districtHidden(plan, POLICY, thunder.worldAt(plan.minS).arena));
      expect(visible.length).toBeLessThanOrEqual(1);
      for (const plan of visible) expect(plan.maxS).toBeLessThanOrEqual(666 - 20 - POLICY.arenaBefore);
    }
    // Endless: no more than two per Khepri stint, never across a route segment, never near a seam or a jump.
    const endless = runRoute({ mode: 'endless' }), schedule = endlessSchedule({ mode: 'endless' });
    const stretches = schedule.stretches(0, 20000);
    for (const seed of [11, 93, 4242]) for (const stretch of stretches.filter(item => item.planet === 'khepri')) {
      const visible = districtsNear(seed, KHEPRI, stretch.from, stretch.to).filter(plan => {
        const world = endless.worldAt(plan.minS);
        return world.planet === KHEPRI && !districtHidden(plan, POLICY, world.arena);
      });
      expect(visible.length).toBeLessThanOrEqual(2);
      for (const plan of visible) {
        expect(endless.worldAt(plan.maxS)).toBe(endless.worldAt(plan.minS));
        for (const seam of [stretch.from, stretch.to]) expect(Math.min(Math.abs(plan.minS - seam), Math.abs(plan.maxS - seam))).toBeGreaterThanOrEqual(80);
      }
    }
  }, 120_000);

  it('switches off completely: without the policy, outposts and sections are the pre-district ones', () => {
    const plan = districtPlan(93, KHEPRI, 0)!;
    const index = Math.floor((plan.minS + plan.maxS) / 2 / VIEW.sectionLength);
    const withDistrict = generateTerrainSection(93, index);
    expect(withDistrict.props.some(prop => prop.group.startsWith(plan.id))).toBe(true);
    const saved = KHEPRI.districts;
    try {
      KHEPRI.districts = null; resetTerrainCaches();
      const without = generateTerrainSection(93, index);
      expect(without.props.some(prop => prop.group.startsWith('district:'))).toBe(false);
      expect(without.sites).toBeUndefined();
    } finally { KHEPRI.districts = saved; resetTerrainCaches(); }
    expect(generateTerrainSection(93, index)).toEqual(withDistrict);
  });
});

describe('road ends blend into the ground (user, 20 October)', () => {
  /** A straight test road along s at x = 2 (ground is the real Khepri field). */
  const road = (ends: readonly [RoadEnd, RoadEnd]): RoadPath => {
    const n = 41, xs = new Float64Array(n).fill(2), ss = Float64Array.from({ length: n }, (_, i) => 100 + i * 0.5);
    return { id: 'test', x: xs, s: ss, y: Float64Array.from(ss, s => terrainHeight(5, 2, s)), length: Float64Array.from({ length: n }, (_, i) => i * 0.5), ends };
  };
  const along = (mesh: RoadMesh, startS: number) => Array.from({ length: mesh.alpha.length }, (_, i) => ({ s: startS - mesh.positions[i * 3 + 2], x: mesh.positions[i * 3], alpha: mesh.alpha[i] }));

  it('fades and narrows dead ends, runs an apron onto pads, and leaves joins and the middle untouched', () => {
    const mesh = roadRibbons(5, [road(['fade', 'apron'])], 90, 40), points = along(mesh, 90);
    const at = (s: number) => points.filter(p => Math.abs(p.s - s) < 1e-6);
    // The fading start: a rounded tip, invisible and sunk at the end, 38% wide where the tip begins, full road from
    // 3.5 units in.
    expect(Math.max(...at(100).map(p => p.alpha))).toBe(0);
    expect(Math.max(...at(100).map(p => Math.abs(p.x - 2)))).toBeCloseTo(0, 6);
    expect(Math.max(...at(100.5).map(p => Math.abs(p.x - 2)))).toBeCloseTo(0.82 * fadeProfile(0.5)[0], 6);
    expect(fadeProfile(0.15 * ROAD_ENDS.taper)[0]).toBeCloseTo(0.38, 6);
    expect(Math.max(...at(101.5).map(p => p.alpha))).toBeGreaterThan(0);
    expect(Math.max(...at(101.5).map(p => p.alpha))).toBeLessThan(0.6);
    expect(Math.max(...at(104).map(p => p.alpha))).toBe(1);
    // The apron end: the road thins over its last unit, then the ribbon runs 2.5 flush past it, widening as it fades.
    expect(Math.max(...at(119).map(p => p.alpha))).toBe(1);
    expect(Math.max(...at(120).map(p => p.alpha))).toBeCloseTo(0.7, 6);
    expect(Math.max(...at(122.5).map(p => p.alpha))).toBe(0);
    expect(Math.max(...at(122.5).map(p => Math.abs(p.x - 2)))).toBeCloseTo(0.82 * 1.35, 6);
    const joined = along(roadRibbons(5, [road(['joined', 'joined'])], 90, 40), 90);
    expect(Math.min(...joined.filter(p => Math.abs(p.x - 2) < 0.6).map(p => p.alpha))).toBe(1);
    expect(Math.max(...joined.map(p => p.s))).toBe(120);
  });

  it('is seam-safe: a road ending at a section boundary is drawn the same in pieces as in one', () => {
    const whole = along(roadRibbons(5, [road(['fade', 'apron'])], 90, 40), 90);
    // The apron belongs to the section holding the end sample (s = 120), whichever side of a seam it reaches.
    const parts = [...along(roadRibbons(5, [road(['fade', 'apron'])], 90, 30), 90), ...along(roadRibbons(5, [road(['fade', 'apron'])], 120, 30), 120)];
    const key = (p: { s: number; x: number; alpha: number }) => `${p.s.toFixed(5)}:${p.x.toFixed(5)}:${p.alpha.toFixed(5)}`;
    expect(parts.map(key).sort()).toEqual(whole.map(key).sort());
  });

  it('switches back to square-cut ends (terrain version 10) with ROAD_ENDS.taper = 0', () => {
    const taper = ROAD_ENDS.taper;
    try {
      ROAD_ENDS.taper = 0;
      const points = along(roadRibbons(5, [road(['fade', 'apron'])], 90, 40), 90);
      expect(Math.max(...points.map(p => p.s))).toBe(120);
      expect(Math.min(...points.filter(p => Math.abs(p.x - 2) < 0.6).map(p => p.alpha))).toBe(1);
    } finally { ROAD_ENDS.taper = taper; }
  });

  it('wears the ground to gravel around fading ends, identically on both sides of a section seam', () => {
    // Seed 11's road settlement:5:1>chain fades out in the open in section 5 (terrain version 16's compounds; version 15
    // had settlement:12:1>chain in section 11, the 30-wide world settlement:10:1>chain in section 9).
    const plain = (() => { const taper = ROAD_ENDS.taper; try { ROAD_ENDS.taper = 0; resetTerrainCaches(); return generateTerrainSection(11, 5); } finally { ROAD_ENDS.taper = taper; resetTerrainCaches(); } })();
    const worn = generateTerrainSection(11, 5);
    let darker = 0;
    for (let v = 0; v < worn.colors.length / 3; v++) {
      const before = plain.colors[v * 3] + plain.colors[v * 3 + 1] + plain.colors[v * 3 + 2], after = worn.colors[v * 3] + worn.colors[v * 3 + 1] + worn.colors[v * 3 + 2];
      if (after < before - 1e-6) darker++;
    }
    expect(darker).toBeGreaterThan(40);
    // The shared boundary row of two neighbours carries the same colours (wear included).
    const next = generateTerrainSection(11, 6), across = worn.across;
    for (let c = 0; c < across; c++) for (let k = 0; k < 3; k++) expect(next.colors[c * 3 + k]).toBe(worn.colors[((worn.along - 1) * across + c) * 3 + k]);
  });

  it('marks every network road end: aprons at outposts, joins at district gates, fades in the open', () => {
    const kinds = new Map<RoadEnd, number>();
    // Four seeds over 1,000 units: Khepri builds roads only where they serve something since version 21.
    for (const seed of [11, 93, 5, 8831]) for (const edge of edgesNear(seed, 0, 1000, WORLD)) {
      const path = edge.road ? roadPath(seed, edge, WORLD) : null;
      if (!path) continue;
      expect(path.ends).toBeDefined();
      for (const kind of path.ends!) kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      if (path.ends![1] === 'joined') expect(edge.b.site?.district?.role).toBe('hub');
    }
    expect(kinds.get('apron')).toBeGreaterThan(10);
    expect(kinds.get('fade')).toBeGreaterThan(2);
    expect(kinds.get('joined')).toBeGreaterThanOrEqual(1);
  });
});
