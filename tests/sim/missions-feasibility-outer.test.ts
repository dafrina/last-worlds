import { describe, expect, it } from 'vitest';
import { campaign, seedDrawing, type Attempt } from './mission-harness';
import type { MissionId } from '../../src/shared/contracts';

/*
 * Every world mission can be done in the real game (docs/35 § 5), Nacre, Amnion and Umbra; see
 * missions-feasibility-inner.test.ts for the method. Cumulative objectives (Nest Breaker, Heartbreaker, Brood Extermination,
 * Gravity Slingshot) take several attempts: the plans below are what a player might fly, and the test counts them.
 */

function clear(mission: MissionId, plan: readonly Attempt[]) {
  const world = campaign(mission);
  let flown = 0;
  for (const attempt of plan) {
    if (!world.missing().length) break;
    world.fly(attempt); flown++;
  }
  return { flown, missing: world.missing(), credits: world.store.read().credits, parts: world.store.read().parts };
}
const count = (sites: string[], ...ids: string[]) => sites.filter(id => ids.includes(id)).length;

describe('world missions are all reachable', () => {
  it('Nacre: all twelve, Three Paths on an attempt that draws three sites, the Seeker Array for Seeker Sweep', () => {
    const three = (from: number) => seedDrawing('deep-bloom', sites => sites.length >= 3, from);
    const plan: Attempt[] = [
      { seed: three(1), rank: 2, specials: true },
      { seed: 1, weapon: 'seeker', rank: 0 },
      { seed: three(three(1) + 1), rank: 2, specials: true },
      { seed: three(three(three(1) + 1) + 1), weapon: 'fan', rank: 2, specials: true },
      { seed: 2, weapon: 'seeker', rank: 2 },
    ];
    const result = clear('deep-bloom', plan);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([525, 3]);
    expect(result.flown).toBeLessThanOrEqual(3);
  }, 120_000);

  it('Amnion: all twelve; Nest Breaker, Heartbreaker and Brood Extermination add up across attempts', () => {
    const hives = (from: number) => seedDrawing('brood-strike', sites => count(sites, 'brood-hive') >= 1 && count(sites, 'brood-hive', 'spawning-pool') >= 2, from);
    const seeds: number[] = [];
    for (let from = 1; seeds.length < 6; from = seeds.at(-1)! + 1) seeds.push(hives(from));
    const plan: Attempt[] = [
      { seed: seeds[0], rank: 2, specials: true },
      { seed: seeds[1], rank: 2, style: 'ground' },
      { seed: seeds[2], rank: 2, specials: true },
      { seed: seeds[3], rank: 2 },
      { seed: seeds[4], rank: 2, specials: true },
      { seed: seeds[5], rank: 2 },
    ];
    const result = clear('brood-strike', plan);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([600, 4]);
  }, 180_000);

  it('Umbra: all twelve; Veteran of the Void on Veteran, Gravity Slingshot with the Spectre across attempts', () => {
    const plan: Attempt[] = [
      { seed: 1, ship: 'spectre', rank: 2, difficulty: 'veteran', specials: true },
      ...Array.from({ length: 11 }, (_, i): Attempt => ({ seed: 2 + i, ship: 'spectre', rank: i % 2 ? 2 : 0 })),
    ];
    const result = clear('final-horizon', plan);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([600, 4]);
  }, 240_000);
});
