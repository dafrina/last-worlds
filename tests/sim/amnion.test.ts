import { describe, expect, it } from 'vitest';
import { missionBoss } from '../../src/content/bosses';
import { campaignPlaylist } from '../../src/content/encounters';
import { MISSION_PLANET } from '../../src/content/missions';
import { CAMPAIGN_ORDER } from '../../src/content/equipment';
import type { Difficulty, WeaponId } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

describe('Brood Strike over Amnion (docs/27)', () => {
  it('is the final campaign mission, over Amnion, against THE CRADLE', () => {
    expect(CAMPAIGN_ORDER.at(-1)).toBe('brood-strike');
    expect(MISSION_PLANET['brood-strike']).toBe('amnion');
    expect(missionBoss('brood-strike')?.id).toBe('cradle');
    expect(campaignPlaylist('brood-strike').length).toBeGreaterThan(35);
  });

  it.each([['pulse', 'standard'], ['fan', 'standard'], ['seeker', 'veteran']] as [WeaponId, Difficulty][])('the perfect pilot clears it with %s on %s without a hit', (weapon, difficulty) => {
    const state = createRun({ mode: 'campaign', mission: 'brood-strike', difficulty, weapon, seed: 5 });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(state.boss?.id).toBe('cradle');
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  }, 120_000);
});
