import { describe, expect, it } from 'vitest';
import { heroLift, smootherstep } from '../../src/render/hero-climb';
import { BOSSES } from '../../src/content/bosses';
import { DEPARTURE, DEPARTURE_CLIMB, WARP, WRECK_HOLD } from '../../src/content/departure';
import { arenaScroll, arenaStopDistance } from '../../src/sim/boss';
import { createRun } from '../../src/sim/game';
import { VIEW, type BossId, type RunState } from '../../src/shared/contracts';

const KILL = 300, STEP = 1 / 120;
const { height, from, over } = DEPARTURE_CLIMB;

/** A run whose boss fell at KILL (only what the climb reads). */
function fallen(mode: 'campaign' | 'endless', id: BossId = 'ark'): RunState {
  const state = createRun(mode === 'campaign' ? { mode, mission: 'cold-vector', seed: 4 } : { mode, seed: 4 });
  state.boss = { id, phase: 'destroyed', clearedAt: KILL } as RunState['boss'];
  return state;
}
const liftAt = (state: RunState, time: number) => { state.time = time; return heroLift(state); };
/** Seconds after the kill at which a campaign departure has flown `units` past its stop. */
function departed(units: number, id: BossId = 'ark'): number {
  const arena = BOSSES[id].arena;
  let lo = 0, hi = WRECK_HOLD + DEPARTURE.duration;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (arenaScroll(KILL + mid, KILL, arena).distance - arenaStopDistance(arena) < units) lo = mid; else hi = mid;
  }
  return hi;
}

describe('departure climb (render only)', () => {
  it('is zero with no boss, while the boss lives and until the climb starts', () => {
    const state = fallen('campaign');
    expect(liftAt(state, KILL - 1)).toBe(0);
    expect(liftAt(state, KILL + from - 1e-6)).toBe(0);
    expect(liftAt(state, KILL + from)).toBeCloseTo(0, 12);
    state.boss!.clearedAt = undefined;
    expect(liftAt(state, KILL + 3)).toBe(0);
    state.boss = null;
    expect(liftAt(state, KILL + 3)).toBe(0);
  });

  it('every boss climbs, and clears HELION STRONGHOLD\'s peaks (9.0) at 10.8 once the departure has flown 20 units', () => {
    for (const id of Object.keys(BOSSES) as BossId[]) {
      const state = fallen('campaign', id), climb = BOSSES[id].departureClimb ?? DEPARTURE_CLIMB, clear = departed(20, id);
      expect(clear).toBeGreaterThan(WRECK_HOLD);
      if (id === 'ark') expect(VIEW.flightHeight + liftAt(state, KILL + clear)).toBeGreaterThanOrEqual(10.8 - 1e-9);
      // Into the campaign's victory warp (src/main.ts) it only rises, then holds.
      const end = WRECK_HOLD + DEPARTURE.duration + WARP.duration;
      let last = 0;
      for (let t = 0; t <= end; t += STEP) {
        const lift = liftAt(state, KILL + t);
        expect(lift).toBeGreaterThanOrEqual(last - 1e-12);
        last = lift;
      }
      expect(last).toBeCloseTo(climb.height, 9);
    }
  });

  it('eases in and out: no step in height or climb rate anywhere', () => {
    const state = fallen('campaign');
    // smootherstep's slope tops out at 15/8, its curvature at 10/√3.
    const most = height * 15 / 8 / over, bend = height * 10 / Math.sqrt(3) / over ** 2;
    let lastRate = 0;
    for (let t = -1; t <= 8; t += STEP) {
      const rate = (liftAt(state, KILL + t + STEP) - liftAt(state, KILL + t)) / STEP;
      expect(rate).toBeLessThanOrEqual(most + 1e-6);
      expect(Math.abs(rate - lastRate)).toBeLessThan(bend * STEP * 1.01 + 1e-6);
      lastRate = rate;
    }
    expect(smootherstep(-1)).toBe(0); expect(smootherstep(.5)).toBe(.5); expect(smootherstep(2)).toBe(1);
  });

  it('endless: holds over the old planet until the flash, then lands on the flight plane by the end of the jump', () => {
    const state = fallen('endless'), startedAt = KILL + WRECK_HOLD + DEPARTURE.duration;
    state.jump = { startedAt, duration: WARP.duration, from: 'vesper', to: 'khepri' };
    const flash = startedAt + WARP.duration / 2;
    expect(liftAt(state, KILL + departed(20))).toBeCloseTo(height, 9);
    expect(liftAt(state, flash)).toBeCloseTo(height, 9);
    let last = Infinity;
    for (let t = flash; t <= startedAt + WARP.duration; t += STEP) {
      const lift = liftAt(state, t);
      expect(lift).toBeLessThanOrEqual(last + 1e-12);
      last = lift;
    }
    expect(liftAt(state, startedAt + WARP.duration)).toBe(0);
  });
});
