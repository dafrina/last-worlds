import { describe, expect, it } from 'vitest';
import { leanFromOrientation, TILT_DEAD, TILT_FULL, tiltSteer } from '../../src/input/tilt';
import { createControlState } from '../../src/input/controls';
import { STEP } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';

describe('tilt steering', () => {
  it('ignores a small lean and saturates at full lean', () => {
    expect(tiltSteer(0)).toBe(0);
    expect(tiltSteer(TILT_DEAD * .9)).toBe(0);
    expect(tiltSteer(-TILT_DEAD * .9)).toBe(0);
    expect(tiltSteer(TILT_FULL)).toBe(1);
    expect(tiltSteer(-1)).toBe(-1);
    const half = tiltSteer((TILT_DEAD + TILT_FULL) / 2);
    expect(half).toBeCloseTo(.5, 6);
  });

  it('reads the side lean the same at any forward pitch', () => {
    // Leaning the right edge down 15° gives the same share flat or held up at 45° and 70°.
    for (const pitch of [0, 45, 70]) {
      const gamma = Math.asin(Math.sin(15 * Math.PI / 180) / Math.cos(pitch * Math.PI / 180)) * 180 / Math.PI;
      expect(leanFromOrientation(pitch, gamma)).toBeCloseTo(Math.sin(15 * Math.PI / 180), 6);
    }
    expect(leanFromOrientation(40, 20)).toBeGreaterThan(0);
    expect(leanFromOrientation(40, 20, 180)).toBeLessThan(0);
  });

  it('touch halves and keys still give full steps', () => {
    const controls = createControlState(() => 0);
    controls.pointerDown(1, 'left');
    expect(controls.sample().horizontal).toBe(-1);
    controls.pointerUp(1);
    expect(controls.sample().horizontal).toBe(0);
  });

  it('a partial lean flies at that share of full speed, and stays inside the map', () => {
    const speedAt = (horizontal: number) => {
      const run = createRun({ mode: 'endless', seed: 3 });
      run.player.invulnerableUntil = Infinity;
      for (let i = 0; i < 30; i++) stepRun(run, { horizontal, specialPressed: false, pausePressed: false }, STEP);
      return run.player.vx;
    };
    const full = speedAt(1);
    expect(full).toBeGreaterThan(0);
    expect(speedAt(.5)).toBeCloseTo(full / 2, 3);
    expect(speedAt(-.5)).toBeCloseTo(-full / 2, 3);
    expect(speedAt(7)).toBeCloseTo(full, 6);
    expect(speedAt(Number.NaN)).toBe(0);
  });
});
