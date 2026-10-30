import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/game';
import { MATCH_ROW, lineOfSightGround } from '../../src/sim/ground';
import { GUARD_CLEARANCE, SITE_DROP_MAX, footprintGround, guardIntrusion, guardSpots, siteSeat, type SiteSeat } from '../../src/sim/sites';
import { spawnMembers } from '../../src/sim/spawn';
import { FORMATIONS, siteCoreFormation, type FormationId } from '../../src/content/formations';
import { SITES, SITE_CORE_HEIGHT, SITE_FOOTPRINT, SITE_X, sitePool } from '../../src/content/sites';
import { toFlightPlane, lensEye } from '../../src/shared/lens';
import { SITE_IDS, VIEW, type MissionId, type PlanetId, type SiteId } from '../../src/shared/contracts';

/**
 * Strike-site seats (src/sim/sites.ts, workstream C; user, 30 October: "make sure none of these cross heavy cliffs"):
 * many runs on every world, each side and camera and each of the world's sites with its own guard ring, the site's
 * footprint at its chosen seat against its authored spot (where the line of sight through its track meets the ground).
 */
const WORLDS: readonly [PlanetId, MissionId][] = [['luna', 'training'], ['khepri', 'bastion'], ['vesper', 'cold-vector'], ['nacre', 'deep-bloom'], ['amnion', 'brood-strike'], ['umbra', 'final-horizon']];
function survey(world: PlanetId, mission: MissionId) {
  const seats: { seat: SiteSeat; authored: SiteSeat; site: SiteId; intrusion: number }[] = [], pool = sitePool(world).map(site => site.id);
  let k = 0;
  for (let seed = 1; seed <= 8; seed++) for (const distance of [40, 160, 280, 400]) for (const side of [-1, 1] as const) for (const camera of [-6, 0, 6]) {
    const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed });
    state.distance = distance; state.cameraX = camera;
    // Each of the world's sites in turn, with its own guard ring to keep clear.
    const site = pool[k++ % pool.length], guards = guardSpots(state, site, side * SITE_X, side, 0);
    const seat = siteSeat(state, side * SITE_X, 31, guards), sight = lineOfSightGround(state, side * SITE_X, 31 - MATCH_ROW, .85).at;
    seats.push({ seat, authored: footprintGround(state, sight.x, distance + 31 - MATCH_ROW + sight.s), site, intrusion: guardIntrusion(guards, seat.x, seat.s) });
  }
  return seats;
}
const WATER_BUILT: ReadonlySet<PlanetId> = new Set(['nacre', 'vesper']);
/**
 * Regression bounds on the footprint's unevenness at the chosen seats (ground spread, 10th to 90th percentile), measured
 * 30 October with about 10% headroom. The window is small (the core stays in its guards' ring, src/sim/sites.ts
 * SEAT_SEARCH; SEAT_WIDE only for a seat over heavy relief), so on Amnion's pitted flesh plains and some of Umbra's plates
 * cut by narrow canyons a seat still straddles a pit or a crack: the render's site pad levels it.
 */
const SPREAD_P90: Readonly<Record<PlanetId, number>> = { luna: 1.6, khepri: 2.7, vesper: 3.3, nacre: 2.1, amnion: 4.8, umbra: 4.3 };
/** How far into the footprint's edge a guard may stand at worst (the models keep their rim clear of structures). */
const GUARD_RIM = .6;
const quantile = (values: number[], f: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * f)];

describe('strike-site seats', () => {
  for (const [world, mission] of WORLDS) it(`${world}: sites stand on even ground, dry unless built for the mire, clear of their guards`, () => {
    const seats = survey(world, mission), spread = seats.map(({ seat }) => seat.spread), authored = seats.map(({ authored }) => authored.spread);
    const above = seats.map(({ seat }) => seat.above), clear = seats.filter(({ intrusion }) => intrusion === 0).length;
    console.info(world, 'spread p50/p90/max', [.5, .9, 1].map(f => quantile(spread, f).toFixed(2)).join('/'), 'authored', [.5, .9, 1].map(f => quantile(authored, f).toFixed(2)).join('/'),
      'above p90/max', quantile(above, .9).toFixed(2), Math.max(...above).toFixed(2), 'drop max', Math.max(...seats.map(({ seat }) => seat.drop)).toFixed(2),
      'fill p50/p90/max', [.5, .9, 1].map(f => quantile(seats.map(({ seat }) => seat.fill), f).toFixed(2)).join('/'),
      'wet', seats.filter(({ seat }) => seat.wet > 0).length, '/', seats.length, 'base max', Math.max(...seats.map(({ seat }) => seat.base)).toFixed(2),
      'guards clear', clear, '/', seats.length, 'on footprint', seats.filter(({ intrusion }) => intrusion >= GUARD_CLEARANCE).length, 'deepest', Math.max(...seats.map(({ intrusion }) => intrusion)).toFixed(2));
    for (const { seat, intrusion, site } of seats) {
      // Inside the world.
      expect(Math.abs(seat.x) + SITE_FOOTPRINT.x).toBeLessThanOrEqual(12 + 1e-9);
      // A guard battery whose line of sight slides far over uneven ground can end up at the footprint's rim, never deep in it.
      expect(intrusion, `${world} ${site}`).toBeLessThan(GUARD_CLEARANCE + GUARD_RIM);
      // Never buried: almost nothing of the ground rises over the site's floor, and the drop under it stays within what
      // the foundations fill.
      expect(seat.above).toBeLessThanOrEqual(2.4);
      expect(seat.drop).toBeLessThanOrEqual(SITE_DROP_MAX);
      // Never over open water, except the worlds whose sites are built for it (Nacre's mire, Vesper's ice-shelf decks).
      if (!WATER_BUILT.has(world)) expect(seat.wet).toBe(0);
    }
    // Guards keep their whole clearance band in six seats of seven, and stand on the footprint's rim in at most one in thirty.
    expect(clear / seats.length).toBeGreaterThanOrEqual(.85);
    expect(seats.filter(({ intrusion }) => intrusion >= GUARD_CLEARANCE).length / seats.length).toBeLessThanOrEqual(.03);
    // Ground poking through the floor is rare and low.
    expect(quantile(above, .9)).toBeLessThanOrEqual(.7);
    // The search does better than the authored spot at the median, and the tail is bounded.
    expect(quantile(spread, .5)).toBeLessThanOrEqual(quantile(authored, .5) * .85);
    expect(quantile(spread, .9)).toBeLessThanOrEqual(SPREAD_P90[world]);
  });

  it('spawns every site\'s guard as authored and its core on the seat: guards off the footprint, the core on its floor under the flight plane, seen where its proxy is', () => {
    const eye = lensEye(0).y, spreadAt = (y: number) => (eye - y) / (eye - VIEW.flightHeight);
    for (const site of SITE_IDS) for (const [world, mission] of WORLDS) {
      if (!SITES[site].worlds.includes(world)) continue;
      for (const seed of [3, 7]) for (const side of [-1, 1] as const) {
        const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed });
        state.distance = 150; state.enemies = [];
        const first = state.nextId;
        const ground = (SITES[site].guard[world] ?? []).filter(placement => FORMATIONS[placement.formation].entry === 'ground');
        // Without the seat (the same guard formations spawned alone) the guards stand exactly where they do with it.
        const alone = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed });
        alone.distance = 150; alone.enemies = [];
        for (const placement of ground) spawnMembers(alone, placement.formation, side * SITE_X, side);
        for (const formation of [...ground.map(placement => placement.formation), siteCoreFormation(site)] as FormationId[])
          spawnMembers(state, formation, side * SITE_X, side);
        const spawned = state.enemies.filter(enemy => enemy.id >= first), cores = spawned.filter(enemy => enemy.site === site), guards = spawned.filter(enemy => !enemy.site);
        expect(cores.length, `${site} ${world}`).toBe(site === 'sealed-vault' ? 3 : 1);
        expect(guards.map(enemy => [enemy.x, enemy.s, enemy.age])).toEqual(alone.enemies.map(enemy => [enemy.x, enemy.s, enemy.age]));
        // The site's centre: a core's anchor less its seat in the group (the vault's seals sit around it), as the renderer finds it.
        const core0 = cores[0], slot = FORMATIONS[core0.formation!.template as FormationId].slots[core0.formation!.slot];
        const k = spreadAt(core0.ground!.base + core0.groundHeight);
        const centre = { x: core0.ground!.x - (slot.dx ?? 0) * core0.formation!.mirror * k, s: core0.ground!.s - (slot.ds ?? 0) * k };
        for (const guard of guards) {
          const dx = Math.abs(guard.ground!.x - centre.x), ds = guard.ground!.s - centre.s;
          expect(dx >= SITE_FOOTPRINT.x - GUARD_RIM || ds <= SITE_FOOTPRINT.s[0] + GUARD_RIM || ds >= SITE_FOOTPRINT.s[1] - GUARD_RIM,
            `${site} ${world} seed ${seed} side ${side}: guard at (${dx.toFixed(2)}, ${ds.toFixed(2)}) inside the footprint`).toBe(true);
        }
        for (const core of cores) {
          expect(core.groundHeight).toBe(SITE_CORE_HEIGHT[site]);
          expect(core.ground!.base + core.groundHeight, `${site} ${world}: core under the flight plane`).toBeLessThanOrEqual(VIEW.flightHeight - .45 + 1e-9);
          // Its gameplay position (its proxy) is where its drawn core is seen through the lens.
          const seen = toFlightPlane(state.cameraX, core.ground!.x, core.ground!.base + core.groundHeight, core.ground!.s);
          expect(seen.x).toBeCloseTo(core.x, 6); expect(seen.s).toBeCloseTo(core.s, 6);
          // Still on its side route, inside the world.
          expect(Math.abs(core.ground!.x), `${site} ${world}`).toBeGreaterThan(4);
          expect(Math.abs(core.ground!.x), `${site} ${world}`).toBeLessThanOrEqual(12 - SITE_FOOTPRINT.x + (site === 'sealed-vault' ? 1.2 : .05));
        }
      }
    }
  });

  it('is deterministic: the same run, tick and camera give the same seat', () => {
    const make = () => { const state = createRun({ mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 5 }); state.distance = 220; state.cameraX = 2; return state; };
    const a = make(), b = make();
    expect(siteSeat(a, SITE_X, 31, guardSpots(a, 'airfield', SITE_X, 1, 0))).toEqual(siteSeat(b, SITE_X, 31, guardSpots(b, 'airfield', SITE_X, 1, 0)));
  });
});
