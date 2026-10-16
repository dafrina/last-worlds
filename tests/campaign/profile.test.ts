import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, campaignConfig, createCampaignProfile, unlockedMissions, type AttemptResult } from '../../src/campaign/profile';
import { RANK_PRICES, REWARDS, STARTER } from '../../src/content/equipment';

function memory(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(CAMPAIGN_KEY, initial);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const clear = (id: string, extra: Partial<AttemptResult> = {}): AttemptResult =>
  ({ id, mission: 'training', difficulty: 'standard', outcome: 'complete', credits: 100 + REWARDS.boss, bossKilled: true, seconds: 150, ...extra });

describe('campaign profile (docs/21)', () => {
  it('starts with the canonical starter, no credits and only Training open', () => {
    const profile = createCampaignProfile(memory()).read();
    expect(profile.credits).toBe(0);
    expect(profile.loadout).toEqual(STARTER);
    expect(unlockedMissions(profile)).toEqual(['training']);
  });

  it('pays a first clear once, banks each attempt exactly once and unlocks the next mission', () => {
    const store = createCampaignProfile(memory());
    const first = store.settle(clear('a1'));
    // Everything scaled ×0.5: floor(0.5 × 1 × (100 collected + 60 boss + 80 mission)) + floor(0.5 × 150) first clear.
    expect(first).toMatchObject({ collected: 50, boss: 30, mission: 40, firstClear: 75, total: 195, balance: 195, unlocked: 'bastion', repeat: false });
    const again = store.settle(clear('a1'));
    expect(again).toMatchObject({ total: 195, balance: 195, repeat: true, unlocked: null });
    const second = store.settle(clear('a2'));
    expect(second).toMatchObject({ firstClear: 0, total: 120, balance: 315, unlocked: null });
    expect(unlockedMissions(store.read())).toEqual(['training', 'bastion']);
    expect(store.read().missions.training?.clears.standard).toBe(2);
  });

  it('banks half the collected credits for a failed or abandoned attempt, scaled by difficulty, with no unlock', () => {
    const store = createCampaignProfile(memory());
    expect(store.settle(clear('f1', { outcome: 'failed', credits: 90, bossKilled: false, difficulty: 'veteran' }))).toMatchObject({ total: 27, unlocked: null });
    expect(store.settle(clear('f2', { outcome: 'abandoned', credits: 41, bossKilled: false, difficulty: 'relaxed' }))).toMatchObject({ total: 8 });
    expect(unlockedMissions(store.read())).toEqual(['training']);
    expect(store.read().missions.training).toBeUndefined();
  });

  it('buys only affordable, unowned items; equips owned ones; ranks cost the documented prices', () => {
    const store = createCampaignProfile(memory());
    expect(store.buy('weapon', 'fan')).toBe(false);
    store.settle(clear('c1', { credits: 600 }));
    const before = store.read().credits;
    expect(store.buy('weapon', 'fan')).toBe(true);
    expect(store.buy('weapon', 'fan')).toBe(false);
    expect(store.read().credits).toBe(before - 250);
    expect(store.equip('special', 'siege-lance')).toBe(false);
    expect(store.equip('weapon', 'fan')).toBe(true);
    expect(store.upgrade('fan')).toBe(true);
    expect(store.read().ranks.fan).toBe(1);
    expect(store.read().credits).toBe(before - 250 - RANK_PRICES[0]);
    const config = campaignConfig(store.read(), 'training', 'standard', 7);
    expect(config).toMatchObject({ mode: 'campaign', weapon: 'fan', rank: 1, special: 'shockwave', shield: 'standard', reactor: 'balanced' });
  });

  it('persists through storage and never overwrites an unreadable save', () => {
    const storage = memory();
    createCampaignProfile(storage).settle(clear('p1'));
    expect(createCampaignProfile(storage).read().credits).toBe(195);
    const broken = memory('{"version":9,"credits":"lots"}');
    const store = createCampaignProfile(broken);
    expect(store.status()).toBe('unreadable');
    store.settle(clear('p2'));
    expect(broken.values.get(CAMPAIGN_KEY)).toBe('{"version":9,"credits":"lots"}');
    expect(store.read().credits).toBe(195);
  });
});
