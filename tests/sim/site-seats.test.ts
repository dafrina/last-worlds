import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/game';
import { footprintGround, siteSeat, type SiteSeat } from '../../src/sim/sites';
import { SITE_FOOTPRINT, SITE_X } from '../../src/content/sites';
import type { MissionId, PlanetId } from '../../src/shared/contracts';

/**
 * Strike-site seats (src/sim/sites.ts, workstream C; user, 30 October: "make sure none of these cross heavy cliffs"):
 * many runs on every world, each side and camera, the site's footprint at its chosen seat against its authored spot.
 */
const WORLDS: readonly [PlanetId, MissionId][] = [['luna', 'training'], ['khepri', 'bastion'], ['vesper', 'cold-vector'], ['nacre', 'deep-bloom'], ['amnion', 'brood-strike'], ['umbra', 'final-horizon']];
function survey(mission: MissionId) {
  const seats: { seat: SiteSeat; authored: SiteSeat }[] = [];
  for (let seed = 1; seed <= 8; seed++) for (const distance of [40, 160, 280, 400]) for (const side of [-1, 1]) for (const camera of [-6, 0, 6]) {
    const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed });
    state.distance = distance; state.cameraX = camera;
    const seat = siteSeat(state, side * SITE_X, 31);
    seats.push({ seat, authored: footprintGround(state, side * 8, distance + 23) });
  }
  return seats;
}
const WATER_BUILT: ReadonlySet<PlanetId> = new Set(['nacre', 'vesper']);
const quantile = (values: number[], f: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * f)];

describe('strike-site seats', () => {
  for (const [world, mission] of WORLDS) it(`${world}: sites stand on even ground, dry unless built for the mire`, () => {
    const seats = survey(mission), spread = seats.map(({ seat }) => seat.spread), authored = seats.map(({ authored }) => authored.spread);
    console.info(world, 'spread p50/p90/max', [.5, .9, 1].map(f => quantile(spread, f).toFixed(2)).join('/'), 'authored', [.5, .9, 1].map(f => quantile(authored, f).toFixed(2)).join('/'),
      'above max', Math.max(...seats.map(({ seat }) => seat.above)).toFixed(2), 'drop max', Math.max(...seats.map(({ seat }) => seat.drop)).toFixed(2),
      'wet', seats.filter(({ seat }) => seat.wet > 0).length, '/', seats.length);
    for (const { seat } of seats) {
      // Inside the world.
      expect(Math.abs(seat.x) + SITE_FOOTPRINT.x).toBeLessThanOrEqual(12 + 1e-9);
      // Never buried: almost nothing of the ground rises over the site's floor, and the drop under it stays within what
      // the foundations reach (src/render/site-view.ts SITE_FOUNDATION_MAX).
      expect(seat.above).toBeLessThanOrEqual(2);
      expect(seat.drop).toBeLessThanOrEqual(6.5);
      // Never over open water, except the worlds whose sites are built for it (Nacre's mire, Vesper's ice-shelf decks).
      if (!WATER_BUILT.has(world)) expect(seat.wet).toBe(0);
    }
    // The search does much better than the authored spot: the median footprint at most half as uneven, and on the
    // calmer worlds nine in ten within 1.5.
    expect(quantile(spread, .5)).toBeLessThanOrEqual(Math.max(.1, quantile(authored, .5) / 2));
    if (world === 'luna' || world === 'khepri' || world === 'nacre') expect(quantile(spread, .9)).toBeLessThanOrEqual(1.5);
  });
});
