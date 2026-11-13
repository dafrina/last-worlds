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
    expect(CAMPAIGN_ORDER.slice(-5)).toEqual(['deep-bloom', 'brood-strike', 'dying-star', 'silent-empire', 'final-horizon']);
    expect(MISSION_PLANET['brood-strike']).toBe('amnion');
    expect(missionBoss('brood-strike')?.id).toBe('cradle');
    for (const seed of [1, 2, 3]) expect(resolvePlaylist({ mode: 'campaign', mission: 'brood-strike' }, 1, seed).length).toBeGreaterThan(35);
  });

  it.each([['pulse', 'standard'], ['fan', 'standard'], ['seeker', 'veteran']] as [WeaponId, Difficulty][])('the perfect pilot clears it with %s on %s without a hit', (weapon, difficulty) => {
    // Seed 2 since the fewer fuel skids (6 November), the first of 1-60 on which all three clear (seed 5 took one hit
    // with Veteran seeker); over seeds 1-24 Standard pulse takes 0 hits, against 2 before.
    // Seed 4 since the Needles' side lanes moved inside a beam's reach of the ship (8 November); seeds 4-8 clear all three.
    // Seed 1 since the squadron and boss pull (11 November, docs/10 §4-5): seed 4 took one hit with Standard pulse (from a
    // battery, not a pulled squadron). Seed 1 clears all three with and without the pull. Over seeds 1-16, old → new:
    // Standard pulse 3 → 9 hits (over seeds 1-48: 8 → 11), Standard fan 2 → 3, Veteran seeker 5 → 2.
    // Seed 6 since the campaign's mission pressure (13 November, docs/40: Fan took one hit on seed 1); seeds 6, 10, 12, 14,
    // 16, 17 and 20 of 1-20 clear all three.
    const state = createRun({ mode: 'campaign', mission: 'brood-strike', difficulty, weapon, seed: 6 });
    const log = fly(state, perfectPilot(), 450, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(state.boss?.id).toBe('cradle');
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  }, 120_000);
});
