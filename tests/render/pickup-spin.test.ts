import { describe, expect, it } from 'vitest';
import { pickupSpin } from '../../src/render/scene';

/** Drops turn a full circle, quickly, and face the camera most of the time (user, 7 November). */
describe('pickup spin', () => {
  const cycle = 3, samples = Array.from({ length: 3000 }, (_, i) => pickupSpin(i * cycle / 3000));
  it('makes one full turn a cycle and is continuous across the cycle boundary', () => {
    const angles = samples.map(s => s.angle);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(Math.PI * 2 - .7);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    for (let i = 1; i <= samples.length; i++) {
      const a = samples[i - 1].angle, b = i < samples.length ? samples[i].angle : pickupSpin(cycle).angle;
      expect(Math.abs(wrap(b - a))).toBeLessThan(.12); // no jump between 1 ms samples (the overshoot included)
    }
  });
  it('is readable (within 45° of facing) over 85% of the time, and glints right after a turn', () => {
    const readable = samples.filter(s => Math.cos(s.angle) > .7).length / samples.length;
    expect(readable).toBeGreaterThan(.85);
    expect(pickupSpin(0).light).toBeGreaterThan(1.3);
    expect(pickupSpin(1.5).light).toBeLessThanOrEqual(1);
  });
});
