import { describe, expect, it } from 'vitest';
import { CAMPAIGN_BACKUP_KEY, CAMPAIGN_KEY, CAMPAIGN_V2_BACKUP_KEY, PROFILE_VERSION, freshProfile, shipParts, campaignConfig, createCampaignProfile, unlockedMissions, type AttemptResult } from '../../src/campaign/profile';
import { RANK_PRICES, REWARDS, SHIP_IDS, STARTER } from '../../src/content/equipment';
import { HERO_DESIGN_PARTS, HERO_DESIGN_PRICES, HERO_REMODELLED } from '../../src/content/hero-parts';

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
    expect(config).toMatchObject({ mode: 'campaign', weapon: 'fan', rank: 1, special: 'shockwave', shield: 'standard', ship: 'scrapper' });
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


describe('ship parts and v1 migration', () => {
  const legacy = () => ({ ...freshProfile(), version: 1, credits: 100,
    owned: { weapon: ['pulse', 'fan', 'seeker'], special: ['shockwave'], shield: ['standard', 'bulwark', 'flux'], reactor: ['balanced', 'vector', 'precision'] },
    ranks: { pulse: 3, fan: 2, seeker: 3 },
    loadout: { weapon: 'fan', special: 'shockwave', shield: 'flux', reactor: 'vector' },
    missions: { training: { clears: { relaxed: 0, standard: 1, veteran: 0 }, best: { standard: 110 }, firstClearPaid: true } },
    receipts: [{ id: 'old-flight', total: 195 }],
  });

  it('backs up the exact old save, preserves progress and refunds retired purchases once', () => {
    const raw = JSON.stringify(legacy()), storage = memory(raw), store = createCampaignProfile(storage);
    expect(store.status()).toBe('saved');
    expect(storage.getItem(CAMPAIGN_BACKUP_KEY)).toBe(raw);
    const profile = store.read();
    expect(profile.version).toBe(3);
    expect(profile.parts).toBe(0);
    expect(profile.credits).toBe(1850); // 100 + two retired 500-credit ranks + two 250-credit drives + Flux 250.
    expect(profile.ranks).toEqual({ pulse: 2, fan: 2, seeker: 2, rail: 0 });
    expect(profile.loadout).toMatchObject({ weapon: 'fan', shield: 'bulwark', ship: 'scrapper' });
    expect(profile.missions).toEqual(legacy().missions);
    expect(profile.receipts).toEqual(legacy().receipts);
    expect(createCampaignProfile(storage).read()).toEqual(profile);
    expect(store.settle(clear('old-flight')).repeat).toBe(true);
    expect(store.read().credits).toBe(1850);
  });

  it('does not overwrite the original if its migration backup cannot be written', () => {
    const raw = JSON.stringify(legacy()), storage = memory(raw);
    const store = createCampaignProfile({ ...storage, setItem() { throw new Error('full'); } });
    expect(store.status()).toBe('session');
    expect(store.read().credits).toBe(1850);
    store.upgrade('fan');
    expect(storage.getItem(CAMPAIGN_KEY)).toBe(raw);
    expect(store.read().credits).toBe(1850);
  });

  it('collects named parts on clears only, assembles once, and persists the selected chassis', () => {
    const storage = memory(), store = createCampaignProfile(storage);
    expect(store.buy('ship', 'ironclad')).toBe(false);
    expect(store.equip('ship', 'ironclad')).toBe(false);
    expect(store.assemble('ironclad')).toBe(false);
    store.settle(clear('failed', { outcome: 'failed' }));
    expect(shipParts(store.read(), 'ironclad').filter(p => p.collected)).toHaveLength(0);
    expect(store.settle(clear('training')).salvage).toContain('Ironclad Frame');
    expect(store.settle(clear('training')).salvage).toEqual([]);
    expect(store.settle(clear('training-again')).salvage).toEqual([]);
    store.settle(clear('khepri', { mission: 'bastion', difficulty: 'relaxed' }));
    expect(store.assemble('ironclad')).toBe(false);
    store.settle(clear('vesper', { mission: 'cold-vector', difficulty: 'veteran' }));
    const credits = store.read().credits;
    expect(store.assemble('ironclad')).toBe(true);
    expect(store.assemble('ironclad')).toBe(false);
    expect(store.read().credits).toBe(credits);
    expect(store.equip('ship', 'ironclad')).toBe(true);
    expect(campaignConfig(createCampaignProfile(storage).read(), 'training', 'standard', 1).ship).toBe('ironclad');
  });

  it('enforces the two-upgrade limit and sequential shield purchases', () => {
    const profile = freshProfile(); profile.credits = 5000;
    const store = createCampaignProfile(memory(JSON.stringify(profile)));
    expect(store.buy('shield', 'aegis')).toBe(false);
    expect(store.buy('shield', 'bulwark')).toBe(true);
    expect(store.buy('shield', 'aegis')).toBe(true);
    expect(store.upgrade('pulse')).toBe(true);
    expect(store.upgrade('pulse')).toBe(true);
    const balance = store.read().credits;
    expect(store.upgrade('pulse')).toBe(false);
    expect(store.read().credits).toBe(balance);
    expect(store.buy('weapon', 'ironclad')).toBe(false);
  });

  it('loads a version-2 save written before the Rail Driver existed, its rank starting at 0, and keeps it intact', () => {
    const old = freshProfile() as unknown as { credits: number; ranks: Record<string, number> };
    old.credits = 900; old.ranks.pulse = 2; delete old.ranks.rail;
    const raw = JSON.stringify(old), storage = memory(raw), store = createCampaignProfile(storage);
    expect(store.read()).toMatchObject({ credits: 900, ranks: { pulse: 2, rail: 0 } });
    expect(store.status()).toBe('saved');
    expect(store.buy('weapon', 'rail')).toBe(true);
    expect(store.read()).toMatchObject({ credits: 300, owned: { weapon: ['pulse', 'rail'] } });
  });

  it('sells B and C part designs for owned ships once, fits only owned designs, and launches with the look', () => {
    const store = createCampaignProfile(memory());
    store.settle(clear('c1', { credits: 2000, parts: 10 }));
    expect(store.buyDesign('ironclad', 'wings', 'b')).toBe(false); // not an owned ship
    const before = store.read().credits;
    expect(store.setLook('scrapper', { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' } })).toBe(false);
    expect(store.buyDesign('scrapper', 'hull', 'b')).toBe(true);
    expect(store.buyDesign('scrapper', 'hull', 'b')).toBe(false);
    expect(store.read().credits).toBe(before - HERO_DESIGN_PRICES.b);
    expect(store.setLook('scrapper', { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' }, paint: { primary: 0x803020 } })).toBe(true);
    expect(campaignConfig(store.read(), 'training', 'standard', 1).hero).toEqual({ parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' }, paint: { primary: 0x803020 } });
  });

  it('offers designs D and E only on a remodelled chassis (docs/31), and drops them from a kit chassis on load', () => {
    const store = createCampaignProfile(memory());
    store.settle(clear('c1', { credits: 2000, parts: 10 }));
    const before = store.read().credits;
    expect(store.buyDesign('scrapper', 'wings', 'e')).toBe(true);
    expect(store.read().credits).toBe(before - HERO_DESIGN_PRICES.e);
    expect(store.setLook('scrapper', { parts: { hull: 'a', wings: 'e', engines: 'a', cockpit: 'a' } })).toBe(true);
    // While some chassis are still kits (docs/31), a D on one of them is dropped on load and its look cleaned.
    const kit = SHIP_IDS.find(ship => !HERO_REMODELLED.has(ship));
    if (!kit) return;
    const saved = { ...freshProfile(), owned: { ...freshProfile().owned, ship: ['scrapper', kit] }, designs: [`${kit}:hull:d`, 'scrapper:hull:d'],
      looks: { [kit]: { parts: { hull: 'd', wings: 'a', engines: 'a', cockpit: 'a' } } } };
    const profile = createCampaignProfile(memory(JSON.stringify(saved))).read();
    expect(profile.designs).toEqual(['scrapper:hull:d']);
    expect(profile.looks).toEqual({});
  });

  it('cleans broken ship looks on load instead of refusing the save', () => {
    const saved = { ...freshProfile(), credits: 7, designs: ['scrapper:hull:b', 'bogus', 'scrapper:wings:a'],
      looks: { scrapper: { parts: { hull: 'b', wings: 'c', engines: 'a', cockpit: 'a' } }, ironclad: { parts: { hull: 'z' } } } };
    const profile = createCampaignProfile(memory(JSON.stringify(saved))).read();
    expect(profile.credits).toBe(7);
    expect(profile.designs).toEqual(['scrapper:hull:b']);
    // Wings C was never bought: it falls back to A. The malformed Ironclad look is dropped.
    expect(profile.looks).toEqual({ scrapper: { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' } } });
  });
});

describe('parts (docs/33): the save, banking and design prices', () => {
  /** A version-2 save as the game wrote it before parts: with bought designs and a look. */
  const v2 = () => {
    const { parts: _parts, ...profile } = { ...freshProfile(), version: 2, credits: 420, designs: ['scrapper:hull:b'],
      looks: { scrapper: { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' } } }, receipts: [{ id: 'old', total: 90 }] };
    return profile;
  };

  it('migrates a version-2 save to version 3 with no parts, keeping its designs, after backing up the exact original', () => {
    const raw = JSON.stringify(v2()), storage = memory(raw), store = createCampaignProfile(storage);
    expect(store.status()).toBe('saved');
    expect(storage.getItem(CAMPAIGN_V2_BACKUP_KEY)).toBe(raw);
    const profile = store.read();
    expect(profile).toMatchObject({ version: PROFILE_VERSION, parts: 0, credits: 420, designs: ['scrapper:hull:b'] });
    expect(JSON.parse(storage.getItem(CAMPAIGN_KEY)!)).toEqual(profile);
    expect(store.settle(clear('old')).repeat).toBe(true);
    // Reloading the migrated save neither migrates nor backs up again.
    storage.values.set(CAMPAIGN_V2_BACKUP_KEY, 'kept');
    expect(createCampaignProfile(storage).read()).toEqual(store.read());
    expect(storage.getItem(CAMPAIGN_V2_BACKUP_KEY)).toBe('kept');
  });

  it('never overwrites a version-2 save whose backup cannot be written, nor a save with a broken parts balance', () => {
    const raw = JSON.stringify(v2()), storage = memory(raw);
    const store = createCampaignProfile({ ...storage, setItem() { throw new Error('full'); } });
    expect(store.status()).toBe('session');
    expect(store.read()).toMatchObject({ parts: 0, credits: 420 });
    expect(storage.getItem(CAMPAIGN_KEY)).toBe(raw);
    for (const parts of [-1, 1.5, '3', null]) {
      const bad = JSON.stringify({ ...freshProfile(), parts }), broken = memory(bad);
      const reader = createCampaignProfile(broken);
      expect(reader.status(), String(parts)).toBe('unreadable');
      reader.settle(clear('x', { parts: 2 }));
      expect(broken.values.get(CAMPAIGN_KEY)).toBe(bad);
    }
  });

  it('banks an attempt\'s parts in full whatever its outcome, exactly once per attempt', () => {
    const storage = memory(), store = createCampaignProfile(storage);
    expect(store.settle(clear('won', { parts: 2 }))).toMatchObject({ parts: 2, partsBalance: 2 });
    expect(store.settle(clear('lost', { outcome: 'failed', bossKilled: false, credits: 30, parts: 1 }))).toMatchObject({ parts: 1, partsBalance: 3 });
    expect(store.settle(clear('left', { outcome: 'abandoned', bossKilled: false, credits: 0, parts: 3 }))).toMatchObject({ parts: 3, partsBalance: 6 });
    // Reopening results or settling again pays nothing more, and reports what was banked.
    expect(store.settle(clear('lost', { outcome: 'failed', bossKilled: false, credits: 30, parts: 1 }))).toMatchObject({ repeat: true, parts: 1, partsBalance: 6 });
    expect(createCampaignProfile(storage).read().parts).toBe(6);
    expect(store.settle(clear('none'))).toMatchObject({ parts: 0, partsBalance: 6 });
  });

  it('prices designs B–E in parts plus credits, and buying needs both', () => {
    expect(HERO_DESIGN_PARTS).toEqual({ a: 0, b: 1, c: 1, d: 2, e: 3 });
    expect(HERO_DESIGN_PRICES).toEqual({ a: 0, b: 80, c: 160, d: 240, e: 320 });
    const store = createCampaignProfile(memory());
    store.settle(clear('rich', { credits: 2000 }));
    expect(store.buyDesign('scrapper', 'hull', 'b')).toBe(false); // credits but no parts
    store.settle(clear('parts', { parts: 3, credits: 0, bossKilled: false, outcome: 'failed' }));
    const before = store.read();
    expect(store.buyDesign('scrapper', 'hull', 'e')).toBe(true);
    expect(store.read()).toMatchObject({ parts: before.parts - 3, credits: before.credits - 320 });
    expect(store.buyDesign('scrapper', 'wings', 'b')).toBe(false); // no parts left
    // Parts but no credits.
    const poor = freshProfile(); poor.parts = 5;
    const broke = createCampaignProfile(memory(JSON.stringify(poor)));
    expect(broke.buyDesign('scrapper', 'hull', 'b')).toBe(false);
    expect(broke.read()).toMatchObject({ parts: 5, credits: 0 });
  });
});
