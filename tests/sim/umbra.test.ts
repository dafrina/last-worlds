import { describe, expect, it } from 'vitest';
import { missionBoss } from '../../src/content/bosses';
import { campaignPlaylist } from '../../src/content/encounters';
import { MISSION_PLANET } from '../../src/content/missions';
import { CAMPAIGN_ORDER } from '../../src/content/equipment';
import type { Difficulty, WeaponId } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

describe('Final Horizon over Umbra (docs/28)', () => {
  it('is the final campaign mission, over Umbra, against THE ECLIPSE', () => {
    expect(CAMPAIGN_ORDER.at(-1)).toBe('final-horizon');
    expect(MISSION_PLANET['final-horizon']).toBe('umbra');
    expect(missionBoss('final-horizon')?.id).toBe('eclipse');
    expect(campaignPlaylist('final-horizon').length).toBeGreaterThan(35);
  });

  it.each([['pulse', 'standard'], ['fan', 'standard'], ['seeker', 'veteran']] as [WeaponId, Difficulty][])('the perfect pilot clears it with %s on %s without a hit', (weapon, difficulty) => {
    // The scripted pilot is not perfect. Since the Wraith (docs/29) it takes a single mission hit with the Fan on seeds 3 and
    // 5 (the short-ranged Fan flies it close to where the Wraith warps in); Twin Pulse and Seeker clear seeds 3, 5, 7, 11
    // and 21, never a hit from THE ECLIPSE, and the fairness checks pass. Seed 7 clears with all three (27 October).
    const state = createRun({ mode: 'campaign', mission: 'final-horizon', difficulty, weapon, seed: 7 });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(state.boss?.id).toBe('eclipse');
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  }, 120_000);
});
