import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ORDER, EXPECTED_RANK, WEAPONS, flyMission } from './balance-setup';

/**
 * Campaign completion at the expected equipment (docs/40, fast CI set): the perfect pilot finishes every mission on
 * Standard with the weapon rank expected there (EXPECTED_RANK), no specials, no pickups. Late missions are no longer held
 * to Level 1: the progression's levels are what the campaign is balanced around. The extended sweep over every weapon,
 * level, difficulty and many seeds is tests/sim/balance-report.test.ts.
 */
describe('campaign completion at the expected weapon tier', () => {
  it('expects the tiers to rise through the campaign, from Level 1 to Level 5', () => {
    const ranks = CAMPAIGN_ORDER.map(mission => EXPECTED_RANK[mission]);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    expect(ranks[0]).toBe(0);
    // (User, 13 November: Nahara and Umbra expect the Level 5 weapon.)
    expect(EXPECTED_RANK['final-horizon']).toBe(4);
    expect(EXPECTED_RANK['silent-empire']).toBe(4);
  });

  it.each(CAMPAIGN_ORDER)('%s: the Twin Pulse at its expected tier completes it without losing a life', mission => {
    const result = flyMission(mission, 'pulse', EXPECTED_RANK[mission], 'standard', 21);
    expect(result.completed, `${mission} ${JSON.stringify(result)}`).toBe(true);
    expect(result.livesLost).toBe(0);
    expect(result.bossDown).not.toBeNull();
  });

  // Every weapon family stays viable at the late missions' expected tier.
  it.each(['silent-empire', 'final-horizon'] as const)('%s: every main weapon at the expected tier completes it', mission => {
    for (const weapon of WEAPONS) {
      const result = flyMission(mission, weapon, EXPECTED_RANK[mission], 'standard', 22);
      expect(result.completed, `${mission} ${weapon}`).toBe(true);
      expect(result.livesLost, `${mission} ${weapon}`).toBe(0);
    }
  });

  // (One fight is noisy, neighbouring levels can swap on a seed: 13 November seed 21 gave L2 89.6 s, L3 95.1 s. The shape
  // holds on every seed: Level 1 drags, Level 5 is clearly stronger than the expected Level 4.)
  it('final-horizon: Level 1 drags THE ECLIPSE fight out, Level 5 clearly beats Level 4', () => {
    const fights = [0, 3, 4].map(rank => flyMission('final-horizon', 'pulse', rank, 'standard', 21).bossFight!);
    expect(fights[0], `${fights}`).toBeGreaterThan(fights[1] * 2);
    expect(fights[2], `${fights}`).toBeLessThan(fights[1] * 0.75);
  });
});
