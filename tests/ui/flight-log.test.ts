import { describe, expect, it } from 'vitest';
import { createFlightLog, FLIGHT_LOG_KEY, type LogStorage } from '../../src/ui/flight-log';
import { createRun } from '../../src/sim/game';

function memory() {
  const values = new Map<string, string>();
  const storage: LogStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  return storage;
}

describe('observational flight log', () => {
  it('checkpoints deltas, finalizes once, and survives reopening', () => {
    const storage = memory(), log = createFlightLog(storage, () => 'first');
    const run = createRun({ mode: 'endless', seed: 1 });
    log.observe(run);
    run.time = 15; run.kills = 4; run.specialsUsed = 1; run.score = 400;
    log.observe(run); log.observe(run);
    run.phase = 'paused'; log.observe(run); log.observe(run);
    run.phase = 'over'; run.time = 24; run.kills = 7; run.score = 700; run.sector = 2;
    log.observe(run); log.observe(run); log.observe(run, true);
    const data = createFlightLog(storage).read();
    expect(data.endless).toMatchObject({ flights: 1, kills: 7, seconds: 24, specials: 1, lost: 1, retired: 0, bestScore: 700, bestSector: 2 });
    expect(data.recent).toHaveLength(1);
  });

  it('keeps modes independent and never changes gameplay state', () => {
    const log = createFlightLog(memory());
    const campaign = createRun({ mode: 'campaign', difficulty: 'veteran', seed: 2 });
    log.observe(campaign);
    campaign.time = 120; campaign.kills = 12; campaign.phase = 'complete';
    const before = structuredClone(campaign);
    log.observe(campaign);
    expect(campaign).toEqual(before);
    const endless = createRun({ mode: 'endless', seed: 3 });
    log.observe(endless); endless.kills = 8; log.observe(endless, true);
    expect(log.read().campaign).toMatchObject({ kills: 12, clears: 1, retired: 0 });
    expect(log.read().endless).toMatchObject({ kills: 8, clears: 0, retired: 1 });
    expect(log.read().recent[1].difficulty).toBe('veteran');
  });

  it('retains an interrupted checkpoint without inventing a completed score', () => {
    const storage = memory(), log = createFlightLog(storage);
    const run = createRun({ mode: 'endless', seed: 1 }); log.observe(run);
    run.time = 6; run.score = 500; run.kills = 5;
    log.observe(run, false, true);
    const reopened = createFlightLog(storage).read();
    expect(reopened.endless).toMatchObject({ seconds: 6, kills: 5, bestScore: 0, lost: 0, retired: 0 });
    expect(reopened.recent[0].outcome).toBe('interrupted');
  });

  it('preserves malformed or future-version saves', () => {
    for (const raw of ['not json', '{"version":99}', '{"version":1,"campaign":null}']) {
      const storage = memory(); storage.setItem(FLIGHT_LOG_KEY, raw);
      const log = createFlightLog(storage);
      const run = createRun({ mode: 'endless', seed: 1 }); log.observe(run);
      run.kills = 2; log.observe(run, true);
      expect(log.status()).toBe('unreadable');
      expect(storage.getItem(FLIGHT_LOG_KEY)).toBe(raw);
      expect(log.read().endless.kills).toBe(2);
    }
  });

  it('keeps session statistics when storage writes fail', () => {
    const log = createFlightLog({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    const run = createRun({ mode: 'campaign', seed: 1 }); log.observe(run);
    run.time = 8; log.observe(run, true);
    expect(log.status()).toBe('session');
    expect(log.read().campaign).toMatchObject({ flights: 1, seconds: 8, retired: 1 });
  });

  it('merges sequential checkpoints from independent tabs without overwriting totals', () => {
    const storage = memory();
    const one = createFlightLog(storage, () => 'one'), two = createFlightLog(storage, () => 'two');
    const a = createRun({ mode: 'endless', seed: 1 }), b = createRun({ mode: 'endless', seed: 2 });
    one.observe(a); two.observe(b);
    a.time = 10; a.kills = 3; one.observe(a);
    b.time = 11; b.kills = 4; two.observe(b, true);
    a.time = 12; a.kills = 5; one.observe(a, true);
    expect(createFlightLog(storage).read().endless).toMatchObject({ flights: 2, kills: 9, seconds: 23, retired: 2 });
  });

  it('bounds recent history while preserving lifetime counters', () => {
    const log = createFlightLog(memory());
    for (let n = 0; n < 60; n++) {
      const run = createRun({ mode: 'endless', seed: n }); log.observe(run);
      run.time = 3; run.kills = 1; log.observe(run, true);
    }
    expect(log.read().recent).toHaveLength(50);
    expect(log.read().endless).toMatchObject({ flights: 60, kills: 60, seconds: 180 });
  });

  it('does not count late-attached debug scenarios as real flights', () => {
    const log = createFlightLog(memory());
    const run = createRun({ mode: 'campaign', seed: 1 }); run.time = 120; run.phase = 'complete';
    log.observe(run); log.observe(run, true);
    expect(log.read().campaign.flights).toBe(0);
  });
});
