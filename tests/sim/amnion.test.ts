import { describe, expect, it } from 'vitest';
import { missionBoss } from '../../src/content/bosses';
import { resolvePlaylist } from '../../src/content/encounter-deck';
import { MISSION_PLANET } from '../../src/content/missions';
import { CAMPAIGN_ORDER } from '../../src/content/equipment';
import type { Difficulty, WeaponId } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

describe('Brood Strike over Amnion (docs/27)', () => {
  it('follows Deep Bloom and opens Dying Star, over Amnion, against THE CRADLE', () => {
    expect(CAMPAIGN_ORDER.slice(-4)).toEqual(['deep-bloom', 'brood-strike', 'dying-star', 'final-horizon']);
    expect(MISSION_PLANET['brood-strike']).toBe('amnion');
    expect(missionBoss('brood-strike')?.id).toBe('cradle');
    for (const seed of [1, 2, 3]) expect(resolvePlaylist({ mode: 'campaign', mission: 'brood-strike' }, 1, seed).length).toBeGreaterThan(35);
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
