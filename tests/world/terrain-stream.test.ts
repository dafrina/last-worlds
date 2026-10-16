import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/shared/contracts';
import { createTerrainStream, generateTerrainSection, sectionSteps } from '../../src/world/terrain';

/** A budget that allows `steps` resumable steps per call, like a per-frame time slice. */
const steps = (count: number) => { let left = count; return () => left-- > 0; };

describe('incremental terrain streaming', () => {
  it('produces sections identical to synchronous generation, even when interleaved', () => {
    for (const seed of [7, 8831]) {
      // Two sections advanced alternately one step at a time share path caches mid-search.
      const a = sectionSteps(seed, 4), b = sectionSteps(seed, 5);
      let ra = a.next(), rb = b.next(), stepsTaken = 0;
      while (!ra.done || !rb.done) {
        if (!ra.done) ra = a.next();
        if (!rb.done) rb = b.next();
        stepsTaken++;
      }
      expect(stepsTaken).toBeGreaterThan(100);
      expect(ra.value).toEqual(generateTerrainSection(seed, 4));
      expect(rb.value).toEqual(generateTerrainSection(seed, 5));
    }
  });

  it('streams a long flight from prefetched sections with no synchronous fallback after start', () => {
    const seed = 4242, stream = createTerrainStream(seed);
    let maxSteps = 0;
    for (let frame = 0; frame < 60 * 70; frame++) {
      const distance = frame * VIEW.scrollSpeed / 60;
      const sections = stream.update(distance);
      // Small slices: a few dozen resumable steps per frame (about a millisecond of work each frame).
      let used = 0;
      const budget = steps(30);
      stream.prefetch(distance, () => { const more = budget(); if (more) used++; return more; });
      maxSteps = Math.max(maxSteps, used);
      if (frame % 600 === 0) for (const section of sections) expect(section).toEqual(generateTerrainSection(seed, section.index));
    }
    expect(stream.stats.startup).toBe(3);
    expect(stream.stats.fallbacks).toBe(0);
    expect(stream.stats.prefetched).toBeGreaterThan(5);
    expect(maxSteps).toBeLessThanOrEqual(30);
  }, 90_000);

  it('keeps up at the fastest endless pace and holds still through a stop (boss arena)', () => {
    const arena = { fromS: 566, toS: 601 };
    for (const [speed, area] of [[5.5, undefined], [5.5, arena]] as const) {
      const stream = createTerrainStream(4242, area);
      let distance = 0;
      for (let frame = 0; frame < 60 * 140; frame++) {
        // Stop on the platform (Rolling Thunder holds at 555) for about 25 s, then go on: the window and
        // prefetch must simply hold.
        const stopped = area && distance >= 555 && frame < 60 * 140 - 600;
        if (!stopped) distance += speed / 60;
        stream.update(distance);
        stream.prefetch(distance, steps(30));
      }
      expect(stream.stats.fallbacks).toBe(0);
      expect(stream.stats.startup).toBe(3);
      if (area) for (const section of stream.update(distance)) expect(section).toEqual(generateTerrainSection(4242, section.index, area));
    }
  });

  it('falls back to synchronous generation (counted) when a seek outruns the prefetch', () => {
    const stream = createTerrainStream(99);
    stream.update(0);
    // Jumping two sections ahead keeps section 1 but needs 2 and 3 before any prefetch ran.
    const ahead = stream.update(2 * VIEW.sectionLength + 1);
    expect(stream.stats.fallbacks).toBe(2);
    expect(ahead.map(section => section.index)).toEqual([1, 2, 3]);
    expect(ahead[2]).toEqual(generateTerrainSection(99, 3));
    // A seek that leaves nothing of the window is a restart, counted separately from mid-flight fallbacks.
    stream.update(40 * VIEW.sectionLength);
    expect(stream.stats.startup).toBe(6);
  });
});
