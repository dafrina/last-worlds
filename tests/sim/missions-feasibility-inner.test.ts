import { describe, expect, it } from 'vitest';
import { campaign, seedDrawing, type Attempt } from './mission-harness';
import type { MissionId } from '../../src/shared/contracts';

/*
 * Every world mission can be done in the real game (docs/35 § 5), Luna, Khepri and Vesper. The perfect test pilot flies
 * the world's mission with the loadouts and play styles a player would pick for its objectives, attempt after attempt, through
 * the real tracker and a saved profile, until the board is cleared. Strike sites come from the deck's own seeded draw: a
 * seed is picked whose attempt draws the sites an objective needs, as a player gets such an attempt every few flights.
 */

/** Flies the plan's attempts in order until all twelve are done; returns how many it took and what is still missing. */
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
  it('Luna: all twelve, Lunar Saboteur across attempts', () => {
    const saboteur = (from: number) => seedDrawing('training', sites => count(sites, 'relay-station', 'shield-depot') >= 1, from);
    const plan: Attempt[] = [
      { seed: saboteur(1), specials: true },
      { seed: saboteur(saboteur(1) + 1), rank: 2, style: 'ground' },
      { seed: saboteur(saboteur(saboteur(1) + 1) + 1), rank: 2, specials: true },
      { seed: 40, rank: 2, style: 'ground' },
      { seed: 41, rank: 2 },
    ];
    const result = clear('training', plan);
    expect(result.missing).toEqual([]);
    expect(result.credits).toBe(375);
    expect(result.parts).toBe(4);
  }, 120_000);

  it('Khepri: all twelve, the Rail Driver for Armor Piercer, a flanking run for Flanking Maneuver', () => {
    const twoSites = (from: number) => seedDrawing('bastion', sites => sites.length >= 2, from);
    const plan: Attempt[] = [
      { seed: twoSites(1), weapon: 'rail', rank: 2, specials: true, style: 'ground' },
      { seed: 1, style: 'flank' },
      { seed: twoSites(twoSites(1) + 1), rank: 2, specials: true },
      { seed: 2, rank: 2, style: 'flank' },
      { seed: twoSites(30), rank: 2, style: 'ground' },
    ];
    const result = clear('bastion', plan);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([375, 3]);
  }, 120_000);

  it('Vesper: all twelve, the Fan Cannon for Cold Vector, Icebreaker across attempts', () => {
    const ice = (from: number) => seedDrawing('cold-vector', sites => count(sites, 'shield-depot', 'freight-terminal') >= 2, from);
    const plan: Attempt[] = [
      { seed: ice(1), weapon: 'fan', rank: 2, specials: true },
      { seed: ice(ice(1) + 1), rank: 0 },
      { seed: ice(ice(ice(1) + 1) + 1), weapon: 'fan', rank: 2 },
      { seed: ice(60), rank: 2, specials: true },
    ];
    const result = clear('cold-vector', plan);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([420, 3]);
  }, 120_000);
});
