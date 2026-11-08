import { describe, expect, it } from 'vitest';
import { ENDLESS_CYCLE, endlessScroll } from '../../src/content/endless';
import { createTerrainStream, generateTerrainSection, sectionSource } from '../../src/world/terrain';
import { SEED, jumps, route } from './terrain-route-setup';

/* Split from terrain-route.test.ts for parallel runs (docs/38 T1). */
describe('terrain routes from the run schedule (docs/18 §3)', () => {
  it('streams through every planet jump at peak hyperdrive speed from prefetched sections, with no fallback, swapping planets at the flash', () => {
    for (const { plan, jump } of jumps) {
      const stream = createTerrainStream(SEED, route);
      // The boss falls a second after the stop: exercise the faster jump over the outgoing terrain buffer too.
      const timeline = ENDLESS_CYCLE.bossSector, bossEnd = timeline.decelStart + timeline.decelDuration + 1;
      let peak = 0, maxSteps = 0, previous = -Infinity;
      const checked: number[] = [];
      for (let tau = timeline.decelStart - 20; tau < bossEnd + ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration + 14; tau += 1 / 60) {
        const scroll = endlessScroll(plan, tau, bossEnd), distance = scroll.phase === 'next' ? jump.endDistance + (tau - bossEnd - 5) * jump.cruise : scroll.distance;
        peak = Math.max(peak, scroll.speed);
        expect(distance).toBeGreaterThanOrEqual(previous - 1e-9);
        const window = stream.update(distance);
        // The last frame before the flash shows the outgoing versions, the first from it the incoming ones (the swap).
        if ((previous < jump.flashDistance) !== (distance < jump.flashDistance) || (distance < jump.flashDistance && distance + 1 / 60 * scroll.speed >= jump.flashDistance)) {
          for (const section of window) expect(section).toEqual(generateTerrainSection(SEED, section.index, sectionSource(route, section.index, distance)));
          checked.push(distance);
        }
        previous = distance;
        // The same slice as the flight tests: thirty resumable steps a frame (about a millisecond).
        let used = 0, left = 30;
        stream.prefetch(distance, () => { const more = left-- > 0; if (more) used++; return more; });
        maxSteps = Math.max(maxSteps, used);
      }
      // `jump.peak` is the speed at mid-warp; the fastest moment is at or just past it.
      expect(peak).toBeGreaterThanOrEqual(jump.peak - 0.05);
      expect(peak).toBeLessThan(jump.peak + 2);
      expect(peak).toBeGreaterThan(11);
      expect(stream.stats.startup).toBe(3);
      expect(stream.stats.fallbacks).toBe(0);
      expect(stream.stats.prefetched).toBeGreaterThanOrEqual(2);
      expect(checked.filter(distance => distance < jump.flashDistance).length).toBeGreaterThan(0);
      expect(checked.filter(distance => distance >= jump.flashDistance).length).toBe(1);
      for (const section of stream.update(previous)) expect(section).toEqual(generateTerrainSection(SEED, section.index, route));
    }
  }, 240_000); // Streams every planet's terrain at jump speed, both route versions since the swap under the veil (31 October): about 14 s here, over 60 s on a CI runner.
});
