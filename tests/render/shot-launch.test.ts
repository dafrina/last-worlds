import { describe, expect, it } from 'vitest';
import { drawnShot, launchFrom } from '../../src/render/shot-launch';

describe('ground battery rounds as drawn', () => {
  // The simulation fired from its forecast muzzle; the camera has since moved the battery 1.5 across the view.
  const muzzle = { x: 2, s: 9 }, battery = { x: 3.5, s: 9.05 };
  const at = (t: number, vx: number, vs: number) => ({ x: muzzle.x + vx * t, s: muzzle.s - .2 + vs * t, vx, vs });

  it('leave from the battery as drawn and meet the simulated round at the player row, in a straight line', () => {
    const vx = 1.2, vs = -14, launch = launchFrom(at(1 / 60, vx, vs), muzzle, battery)!;
    expect(launch).not.toBeNull();
    const start = drawnShot(at(0, vx, vs), launch);
    expect(start.x).toBeCloseTo(battery.x, 9); expect(start.s).toBeCloseTo(battery.s - .2, 9);
    const row = (muzzle.s - .2) / -vs, end = drawnShot(at(row, vx, vs), launch);
    expect(end.x).toBeCloseTo(at(row, vx, vs).x, 9); expect(end.s).toBeCloseTo(0, 9);
    // Halfway along the simulated path the drawn round lies on the line from start to end.
    const mid = drawnShot(at(row / 2, vx, vs), launch), u = (start.s - mid.s) / (start.s - end.s);
    expect(mid.x).toBeCloseTo(start.x + (end.x - start.x) * u, 9);
    // Its drawn heading follows that line.
    expect(mid.vx / mid.vs).toBeCloseTo((end.x - start.x) / (end.s - start.s), 9);
  });

  it('never claims a round from somewhere else', () => {
    expect(launchFrom(at(1 / 60, 0, -14), muzzle, battery)).not.toBeNull();
    expect(launchFrom({ ...at(1 / 60, 0, -14), x: muzzle.x + 2 }, muzzle, battery)).toBeNull();
    expect(launchFrom(at(.6, 0, -14), muzzle, battery)).toBeNull();
  });
});
