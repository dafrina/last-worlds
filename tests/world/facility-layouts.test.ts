import { describe, expect, it } from 'vitest';
import { FACILITY_MODULES, MODULES_BY_NODE, type FacilityWorld } from '../../src/render/facility-kit';
import {
  ARRANGEMENTS, MIN_MODULES, PLANT_CHANCE, arrangementOrder, arrangementsOf, composeFacility, nodeBudget, plannedArrangement, resolve,
  wantsPlant, type ArrangementId, type FacilityContext, type FacilityPlant, type FacilitySeat, type Rect,
} from '../../src/render/facility-layouts';
import { VIEW } from '../../src/shared/contracts';

/**
 * docs/25 §Rules, checked on the composer's output with geometry written independently of it: each module's
 * footprint is a polygon from the registry (half, yaw), compared by separating axes over its edges.
 */
const WORLDS = [...new Set(FACILITY_MODULES.map(module => module.world))] as FacilityWorld[];
type Point = [number, number];
const polygon = (x: number, s: number, [hx, hs]: readonly [number, number], yaw: number): Point[] =>
  ([[-hx, -hs], [hx, -hs], [hx, hs], [-hx, hs]] as Point[]).map(([px, ps]) =>
    [x + px * Math.cos(yaw) - ps * Math.sin(yaw), s + px * Math.sin(yaw) + ps * Math.cos(yaw)]);
const rectangle = (minX: number, maxX: number, minS: number, maxS: number): Point[] => [[minX, minS], [maxX, minS], [maxX, maxS], [minX, maxS]];
/** How deep two convex polygons interpenetrate (≤ 0: apart or touching). */
function penetration(a: Point[], b: Point[]) {
  let least = Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [x0, s0] = poly[i], [x1, s1] = poly[(i + 1) % poly.length], len = Math.hypot(x1 - x0, s1 - s0);
    const nx = -(s1 - s0) / len, ns = (x1 - x0) / len;
    const project = (p: Point[]) => p.map(([x, s]) => x * nx + s * ns);
    const pa = project(a), pb = project(b);
    least = Math.min(least, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
  }
  return least;
}
function distanceTo(poly: Point[], [x, s]: Point) {
  if (penetration(poly, rectangle(x - 1e-6, x + 1e-6, s - 1e-6, s + 1e-6)) > 0) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x0, s0] = poly[i], [x1, s1] = poly[(i + 1) % poly.length];
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (s - s0) * (s1 - s0)) / ((x1 - x0) ** 2 + (s1 - s0) ** 2)));
    best = Math.min(best, Math.hypot(x - x0 - t * (x1 - x0), s - s0 - t * (s1 - s0)));
  }
  return best;
}
const overlaps = (a: Rect, b: Rect, gap = 0) => a.minX - gap < b.maxX && a.maxX + gap > b.minX && a.minS - gap < b.maxS && a.maxS + gap > b.minS;

/** Every docs/25 rule the plant breaks (empty when it keeps them all). */
function audit(plant: FacilityPlant, seat: FacilitySeat, context: FacilityContext = {}): string[] {
  const broken: string[] = [], slope = Math.tan(55 * Math.PI / 180);
  const modules = plant.modules.map(m => {
    const module = MODULES_BY_NODE.get(m.node)!;
    return { ...m, module, poly: polygon(m.x, m.s, module.half, m.yaw), flat: !!module.flat || module.top <= .2 };
  });
  const limit = Math.min(3.25, 3.7 - seat.base);
  // Rule 3: heights, the sink and the roof clearance.
  expect(plant.top).toBe(Math.max(...modules.map(m => m.module.top)));
  if (plant.top > limit + 1e-9) broken.push(`rule 3: top ${plant.top} over ${limit}`);
  if (seat.base - plant.base > .35 + 1e-9 || plant.base > seat.base) broken.push(`rule 3: base ${plant.base} from seat ${seat.base}`);
  if (plant.base + plant.top > VIEW.flightHeight - .45 + 1e-9) broken.push('rule 3: roof above the flight clearance');
  for (const m of modules) {
    if (m.top !== m.module.top) broken.push(`${m.node}: top not from the registry`);
    // Rule 1: the gun's court.
    if (!m.flat && penetration(m.poly, rectangle(-.65, .65, -.7, .7)) > 1e-9) broken.push(`rule 1: ${m.slot} ${m.node} in the court`);
    // Rule 2: line of sight to the gun and to every other battery.
    for (const [gx, gs] of [[0, 0], ...(context.batteries ?? []).map(b => [b.x - seat.x, b.s - seat.s])]) {
      const far = Math.max(...m.poly.map(p => p[1]));
      if (far < gs && penetration(m.poly, rectangle(gx - .9, gx + .9, -1e4, 1e4)) > 1e-9 && m.module.top > .85 + slope * (gs - far) - .1 + 1e-9)
        broken.push(`rule 2: ${m.slot} ${m.node} hides the gun at ${gx},${gs}`);
    }
    // Rule 4: world, pads, other plants, other batteries.
    const edge = context.edge ?? 14.7;
    if (m.poly.some(([x]) => Math.abs(x + seat.x) > edge + 1e-9)) broken.push(`rule 4: ${m.node} outside the world`);
    for (const b of context.batteries ?? []) if (distanceTo(m.poly, [b.x - seat.x, b.s - seat.s]) < .4 - 1e-9) broken.push(`rule 4: ${m.node} over a battery`);
    for (const [x, s] of m.poly) {
      const b = plant.bounds;
      if (x + seat.x < b.minX - 1e-9 || x + seat.x > b.maxX + 1e-9 || s + seat.s < b.minS - 1e-9 || s + seat.s > b.maxS + 1e-9) broken.push('bounds miss a module');
    }
  }
  if (plant.bounds.minX > seat.x - .9 || plant.bounds.maxX < seat.x + .9 || plant.bounds.minS > seat.s - 1.8 || plant.bounds.maxS < seat.s + .7)
    broken.push('bounds miss the court or its sight apron');
  for (const pad of context.reserved ?? []) if (overlaps(plant.bounds, pad)) broken.push('rule 4: covers a district pad');
  // Aprons: flat slabs on the gun-aligned 2-unit grid, inside the clearing, off pads and other plants (checked above).
  for (const m of modules.filter(m => m.module.roles.includes('apron'))) {
    if (Math.abs(m.x / 2 - Math.round(m.x / 2)) > 1e-9 || Math.abs(m.s / 2 - Math.round(m.s / 2)) > 1e-9 || m.yaw !== 0) broken.push('apron off the grid');
    for (const pad of context.reserved ?? []) if (penetration(m.poly.map(([x, s]) => [x + seat.x, s + seat.s] as Point), rectangle(pad.minX, pad.maxX, pad.minS, pad.maxS)) > 1e-9) broken.push('apron on a pad');
  }
  const counted = modules.filter(m => m.module.roles[0] !== 'apron' && m.module.roles[0] !== 'ring').length;
  if (counted < MIN_MODULES[plant.world]) broken.push(`only ${counted} modules`);
  for (const other of context.plants ?? []) if (overlaps(plant.bounds, other.bounds, 1 - 1e-9)) broken.push('rule 4: closer than 1 to another plant');
  // Modules never overlap; only the flat court piece centred on the gun may lie under others.
  for (let i = 0; i < modules.length; i++) for (let j = i + 1; j < modules.length; j++) {
    const a = modules[i], b = modules[j];
    // The court piece and the aprons may lie under anything; tiles of one run may meet.
    const under = (m: typeof a) => (m.flat && Math.abs(m.x) < 1e-9 && Math.abs(m.s) < 1e-9) || m.module.roles.includes('apron');
    if (under(a) || under(b) || (a.slot === b.slot && a.node === b.node && a.module.tiles)) continue;
    if (penetration(a.poly, b.poly) > .02 + 1e-9) broken.push(`overlap: ${a.slot} ${a.node} / ${b.slot} ${b.node}`);
  }
  return broken;
}

/** Battery ids that get a plant on this world (Luna leaves most batteries without one). */
const planted = (world: FacilityWorld, seed: number, count: number) => {
  const ids: number[] = [];
  for (let id = 1; ids.length < count; id++) if (wantsPlant(world, id, seed)) ids.push(id);
  return ids;
};
/** Deterministic pseudo-random numbers for the test's own scenes (never the composer's). */
function sequence(seed: number) { let h = seed >>> 0; return () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 >>> 0) / 4294967296); }

describe('modular facility layouts (docs/25)', () => {
  it('authors sound templates for every world', () => {
    for (const world of WORLDS) expect(arrangementsOf(world).length, world).toBeGreaterThanOrEqual(5);
    for (const arrangement of ARRANGEMENTS) {
      const required = new Set(arrangement.slots.filter(slot => slot.chance === undefined).map(slot => slot.key));
      for (const slot of arrangement.slots) {
        // A required slot never depends on an optional one, and every slot has a module in each of its worlds.
        if (required.has(slot.key) && slot.attach) {
          const targets = typeof slot.attach.to === 'string' ? [slot.attach.to] : slot.attach.to;
          expect(required.has(targets[targets.length - 1]), `${arrangement.id}.${slot.key}`).toBe(true);
        }
        for (const world of arrangement.worlds) expect(resolve(world, slot.pick).length, `${world} ${arrangement.id}.${slot.key}`).toBeGreaterThan(0);
      }
      expect(arrangement.slots.filter(slot => slot.court).length).toBeLessThanOrEqual(1);
    }
    // Luna: single small facilities, never walls, pipe runs or the other worlds' compounds (user, 20 October).
    for (const arrangement of ARRANGEMENTS.filter(a => a.worlds.includes('luna'))) {
      expect(arrangement.worlds).toEqual(['luna']);
      for (const slot of arrangement.slots) for (const module of resolve('luna', [...slot.pick, ...(slot.swap ?? [])]))
        expect(module.roles.some(role => role === 'wall' || role === 'pipe'), `${arrangement.id} ${module.node}`).toBe(false);
    }
    for (const world of WORLDS) for (const [node, n] of nodeBudget(world)) {
      expect(MODULES_BY_NODE.get(node)?.world).toBe(world); expect(n).toBeGreaterThan(0);
    }
  });

  it('is deterministic per battery and run, and varies between them', () => {
    const seat = { x: 2, s: 300, base: .3 };
    for (const world of WORLDS) {
      const ids = planted(world, 8831, 30);
      const a = composeFacility(world, ids[0], 8831, seat), b = composeFacility(world, ids[0], 8831, seat);
      expect(a).toEqual(b); expect(a).not.toBeNull();
      expect(a!.arrangement).toBe(plannedArrangement(world, ids[0], 8831));
      const layouts = new Set(ids.map(id => JSON.stringify(composeFacility(world, id, 8831, seat)?.modules)));
      expect(layouts.size).toBeGreaterThan(world === 'luna' ? 12 : 20);
      expect(arrangementOrder(world, 41, 8831)).toEqual(arrangementOrder(world, 41, 8831));
    }
  });

  it('keeps rules 1–5 for many seeds, ids, seat heights, edges, neighbours and district pads', () => {
    const composed = new Map<FacilityWorld, number>(), checked = new Map<FacilityWorld, number>();
    for (const world of WORLDS) for (const seed of [8831, 17, 424242]) {
      const random = sequence(seed * 31 + world.length);
      for (let id = 1; id <= 70; id++) for (const base of [0, .4, .8, 1.2]) {
        const x = [0, -6, 9, 12.4, -13.6][id % 5] + (random() - .5), seat = { x, s: 100 + id * 3, base };
        const context: FacilityContext = {};
        if (id % 3 === 0) context.batteries = [{ x: x + (random() - .5) * 9, s: seat.s + (random() - .3) * 8 }, { x: x + 3.5, s: seat.s - 1 }];
        if (id % 4 === 1) context.reserved = [{ minX: x + 2 + random() * 2, maxX: x + 7, minS: seat.s - 3, maxS: seat.s + 6 }];
        if (id % 5 === 2) {
          const other = composeFacility(world, id + 1000, seed, { x: x - 9, s: seat.s + 2, base: 0 });
          if (other) context.plants = [other];
        }
        const plant = composeFacility(world, id, seed, seat, context);
        if (!wantsPlant(world, id, seed)) { expect(plant).toBeNull(); continue; }
        checked.set(world, (checked.get(world) ?? 0) + 1);
        if (!plant) continue;
        composed.set(world, (composed.get(world) ?? 0) + 1);
        expect(audit(plant, seat, context), `${world} ${plant.arrangement} id ${id} seed ${seed} base ${base}`).toEqual([]);
        expect(plant.world).toBe(world); expect(arrangementsOf(world)).toContain(plant.arrangement);
        if (world === 'luna') expect(plant.modules.length).toBeLessThanOrEqual(4);
        else expect(plant.modules.some(m => m.node.endsWith('_apron')), `${world} ${plant.arrangement} has ground`).toBe(true);
      }
    }
    // Fallbacks keep almost every planted battery in a plant despite edges, pads and neighbours.
    for (const world of WORLDS) expect(composed.get(world)! / checked.get(world)!, world).toBeGreaterThan(.85);
  });

  it('swaps or drops tall modules on high seats and keeps the higher roofs on low ground', () => {
    for (const world of WORLDS) {
      let tall = 0;
      const ids = planted(world, 8831, 120);
      for (const id of ids) {
        const low = composeFacility(world, id, 8831, { x: 0, s: 50, base: 0 })!;
        if (low.top > 2.65) tall++;
        const high = composeFacility(world, id, 8831, { x: 0, s: 50, base: 1.2 });
        if (high) expect(high.top, `${world} ${id}`).toBeLessThanOrEqual(2.5);
        // Ground too high for even the lowest required module keeps the legacy emplacement.
        expect(composeFacility(world, id, 8831, { x: 0, s: 50, base: 3.2 })).toBeNull();
      }
      expect(tall, world).toBeGreaterThan(world === 'luna' ? 10 : 30);
    }
  });

  it('falls back to another arrangement, then to none', () => {
    const world: FacilityWorld = 'khepri', seat = { x: 0, s: 80, base: 0 };
    const id = Array.from({ length: 400 }, (_, i) => i + 1).find(i => arrangementOrder(world, i, 8831)[0] === 'court')!;
    // A pad right behind the gun rules out the U (its landmark stands there); something else stands instead.
    const behind = { minX: -1.2, maxX: 1.2, minS: 81.6, maxS: 86 };
    const plant = composeFacility(world, id, 8831, seat, { reserved: [behind] });
    expect(plant?.arrangement).not.toBe('court');
    // A pad over the gun itself leaves nothing.
    expect(composeFacility(world, id, 8831, seat, { reserved: [{ minX: -1, maxX: 1, minS: 79, maxS: 81 }] })).toBeNull();
    // Another battery inside every arrangement's reach leaves nothing as well.
    expect(composeFacility(world, id, 8831, seat, { batteries: [{ x: .3, s: 80.2 }, { x: -1.6, s: 81 }, { x: 1.6, s: 81 }, { x: 0, s: 81.9 }] })).toBeNull();
  });

  it('spreads arrangements: none above 35% of a world, the court at 25% or less, every one reachable', () => {
    for (const world of WORLDS) {
      const counts = new Map<ArrangementId, number>();
      let total = 0;
      for (const seed of [8831, 99, 31337]) for (const id of planted(world, seed, 200)) for (const base of [0, .4, .8, 1.2]) {
        const plant = composeFacility(world, id, seed, { x: 0, s: 40, base });
        if (!plant) continue;
        total++; counts.set(plant.arrangement, (counts.get(plant.arrangement) ?? 0) + 1);
      }
      for (const arrangement of arrangementsOf(world)) {
        const share = (counts.get(arrangement) ?? 0) / total;
        expect(share, `${world} ${arrangement}`).toBeGreaterThan(.03);
        expect(share, `${world} ${arrangement}`).toBeLessThanOrEqual(arrangement === 'court' ? .25 : .35);
      }
    }
  });

  it('prefers a different arrangement from the nearest plant', () => {
    for (const world of WORLDS) {
      const plants: FacilityPlant[] = [];
      let repeats = 0;
      for (const id of planted(world, 8831, 120)) {
        const plant = composeFacility(world, id, 8831, { x: (id % 2) * 4 - 2, s: id * 12, base: .2 }, { plants: plants.slice(-3) })!;
        if (plants.length && plants[plants.length - 1].arrangement === plant.arrangement) repeats++;
        plants.push(plant);
      }
      expect(repeats, world).toBeLessThanOrEqual(2);
    }
  });

  it('leaves most Luna batteries bare and keeps every other world fully planted', () => {
    for (const world of WORLDS) {
      const ids = Array.from({ length: 2000 }, (_, i) => i + 1), rate = ids.filter(id => wantsPlant(world, id, 8831)).length / ids.length;
      if (world === 'luna') { expect(rate).toBeGreaterThan(.2); expect(rate).toBeLessThan(.4); } else expect(rate).toBe(1);
      expect(PLANT_CHANCE[world]).toBeCloseTo(world === 'luna' ? .3 : 1);
      // The decision is seeded per battery and run, like the layout.
      expect(ids.slice(0, 50).map(id => wantsPlant(world, id, 8831))).toEqual(ids.slice(0, 50).map(id => wantsPlant(world, id, 8831)));
    }
    let plants = 0;
    for (let id = 1; id <= 1000; id++) if (composeFacility('luna', id, 8831, { x: 0, s: 50, base: .2 })) plants++;
    expect(plants / 1000).toBeGreaterThan(.2); expect(plants / 1000).toBeLessThan(.4);
  });

  it('lays aprons under every module of a plant on Khepri, Vesper and Nacre, and keeps them off neighbours', () => {
    for (const world of ['khepri', 'vesper', 'nacre'] as const) for (const id of planted(world, 8831, 40)) {
      const plant = composeFacility(world, id, 8831, { x: 0, s: 60, base: .3 })!;
      const tiles = plant.modules.filter(m => m.node.endsWith('_apron'));
      // Each solid module's centre stands on a slab (tiles are 2 × 2, centred on the grid).
      for (const m of plant.modules.filter(m => !MODULES_BY_NODE.get(m.node)!.flat))
        expect(tiles.some(tile => Math.abs(tile.x - m.x) <= 1 + 1e-9 && Math.abs(tile.s - m.s) <= 1 + 1e-9), `${world} ${plant.arrangement} ${m.slot}`).toBe(true);
      // A neighbouring plant and a pad right beside it: slabs stay off both, and the plant keeps its gap.
      const pad = { minX: plant.bounds.maxX + .2, maxX: plant.bounds.maxX + 4, minS: 55, maxS: 70 };
      const other = composeFacility(world, id + 500, 8831, { x: -14, s: 60, base: .3 });
      const context: FacilityContext = { reserved: [pad], plants: other ? [other] : [] };
      const near = composeFacility(world, id, 8831, { x: 0, s: 60, base: .3 }, context);
      if (near) expect(audit(near, { x: 0, s: 60, base: .3 }, context)).toEqual([]);
    }
    for (const id of planted('luna', 8831, 20)) expect(composeFacility('luna', id, 8831, { x: 0, s: 60, base: .3 })!.modules.some(m => m.node.endsWith('_apron'))).toBe(false);
  });

  it('stays cheap enough to run once per battery', () => {
    const start = performance.now();
    for (let id = 1; id <= 400; id++) composeFacility(WORLDS[id % WORLDS.length], id, 8831, { x: 12, s: id * 5, base: 1 },
      { batteries: [{ x: 13, s: id * 5 + 1 }], reserved: [{ minX: 9, maxX: 11, minS: id * 5, maxS: id * 5 + 4 }] });
    // Under 2 ms each even on a loaded CI runner (typically ~0.1 ms).
    expect((performance.now() - start) / 400).toBeLessThan(2);
  });
});
