import { describe, expect, it } from 'vitest';
import { createFramePacer } from '../../src/shared/frame-pacing';

describe('frame pacing', () => {
  it('turns jittered timestamps at 60 Hz into steady refresh periods without drifting from the clock', () => {
    const pacer = createFramePacer(), period = 1000 / 60;
    // The iPhone log's pattern (6 November): mostly 16-17 ms, now and then a 23 ms frame and a 10 ms one after it.
    const raw: number[] = [];
    for (let i = 0; i < 600; i++) raw.push(i % 25 === 0 ? 23 : i % 25 === 1 ? 10.3 : 1000 / 60);
    let rawTotal = 0, pacedTotal = 0;
    const paced = raw.map(ms => { rawTotal += ms; const p = pacer.paced(ms); pacedTotal += p; return p; });
    expect(new Set(paced.map(ms => ms.toFixed(3)))).toEqual(new Set([period.toFixed(3)]));
    expect(Math.abs(pacedTotal - rawTotal)).toBeLessThanOrEqual(period);
  });
  it('still advances two periods for a real dropped frame, and passes long hitches through', () => {
    const pacer = createFramePacer(), period = 1000 / 60;
    for (let i = 0; i < 60; i++) pacer.paced(period);
    expect(pacer.paced(33.4)).toBeCloseTo(2 * period, 6);
    expect(pacer.paced(400)).toBe(400);
  });
  it('finds a 120 Hz display', () => {
    const pacer = createFramePacer();
    for (let i = 0; i < 60; i++) pacer.paced(8.3 + (i % 3 - 1) * .4);
    expect(pacer.period).toBeCloseTo(1000 / 120, 6);
  });
});
