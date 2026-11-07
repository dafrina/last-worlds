import { describe, expect, it } from 'vitest';
import { pickupSpin } from '../../src/render/scene';

/** Drops turn constantly, slowly face on and quickly edge on (user, 7 November). */
describe('pickup spin', () => {
  const cycle = 3, samples = Array.from({ length: 3000 }, (_, i) => pickupSpin(i * cycle / 3000));
  it('never stops turning: one full turn a cycle, always forward, continuous across the cycle boundary', () => {
    const angles = samples.map(s => s.angle);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(Math.PI * 2 - .05);
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThan(angles[i - 1]);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    for (let i = 1; i <= samples.length; i++) {
      const a = samples[i - 1].angle, b = i < samples.length ? samples[i].angle : pickupSpin(cycle).angle;
      expect(Math.abs(wrap(b - a))).toBeLessThan(.12); // no jump between 1 ms samples (the overshoot included)
    }
  });
  it('turns slowly while either face shows and quickly through the edge, readable about 70% of the time', () => {
    // Both faces carry the icon: readable within 45° of either face.
    const readable = samples.filter(s => Math.abs(Math.cos(s.angle)) > .7).length / samples.length;
    expect(readable).toBeGreaterThan(.66);
    const speed = (t: number) => (pickupSpin(t + .001).angle - pickupSpin(t).angle) / .001;
    expect(speed(0)).toBeGreaterThan(.4); // still turning face on (about 30°/s), front and back alike
    expect(speed(cycle / 2 + .001)).toBeGreaterThan(.4);
    expect(speed(cycle / 4) / speed(0)).toBeGreaterThan(5); // quick through the edge
    expect(Math.max(...samples.map(s => s.light))).toBeGreaterThan(1.4); // the glint
  });
});
