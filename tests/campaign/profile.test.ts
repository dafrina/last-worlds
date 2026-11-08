import { describe, expect, it } from 'vitest';
import { CAMPAIGN_BACKUP_KEY, CAMPAIGN_KEY, CAMPAIGN_V2_BACKUP_KEY, CAMPAIGN_V3_BACKUP_KEY, PROFILE_VERSION, awardOnce, freshProfile, campaignConfig, createCampaignProfile, itemPrice, rankPrice, unlockedMissions, type AttemptResult, type CampaignProfile } from '../../src/campaign/profile';
import { CAMPAIGN_ORDER, CREDIT_SCALE, RANK_PARTS, RANK_PRICES, REWARDS, SHIPS, SHIP_IDS, SPECIALS, STARTER, WEAPON_PRICES } from '../../src/content/equipment';
import { HERO_DESIGN_PARTS, HERO_DESIGN_PRICES, HERO_REMODELLED } from '../../src/content/hero-parts';
import { createRun } from '../../src/sim/game';
import { memoryStorage } from '../helpers/storage';

/** An in-memory browser storage, holding `initial` as the campaign save when given. */
const memory = (initial?: string) => memoryStorage(initial === undefined ? {} : { [CAMPAIGN_KEY]: initial });
const clear = (id: string, extra: Partial<AttemptResult> = {}): AttemptResult =>
  ({ id, mission: 'training', difficulty: 'standard', outcome: 'complete', credits: 100 + REWARDS.boss, bossKilled: true, seconds: 150, ...extra });
/** A store whose save starts with these balances (and anything else `change` sets). */
function funded(credits: number, parts = 0, change: (profile: CampaignProfile) => void = () => {}) {
  const profile = freshProfile(); profile.credits = credits; profile.parts = parts; change(profile);
  const storage = memory(JSON.stringify(profile));
  return { storage, store: createCampaignProfile(storage) };
}
/** A version-3 save as the 29 October – 3 November build wrote it: Shockwave the starter, no selected levels. */
function v3(change: (profile: Record<string, unknown> & CampaignProfile) => void = () => {}) {
  const { selected: _selected, ...rest } = freshProfile();
  const profile = { ...rest, version: 3, owned: { ...rest.owned, special: ['shockwave'] }, loadout: { ...rest.loadout, special: 'shockwave' } } as unknown as Record<string, unknown> & CampaignProfile;
  change(profile);
  return profile;
}

describe('campaign profile (docs/21)', () => {
  it('starts with the canonical starter (the Seeker Rack free), no credits, level 1 everywhere and only Training open', () => {
    const profile = createCampaignProfile(memory()).read();
    expect(profile.credits).toBe(0);
    expect(profile.loadout).toEqual(STARTER);
    expect(STARTER.special).toBe('seeker-rack');
    expect(profile.owned.special).toEqual(['seeker-rack']);
    expect(profile.selected).toEqual({ pulse: 0, fan: 0, seeker: 0, rail: 0 });
    expect(unlockedMissions(profile)).toEqual(['training']);
  });

  it('pays a first clear once, banks each attempt exactly once and unlocks the next mission', () => {
    const store = createCampaignProfile(memory()), s = CREDIT_SCALE.training;
    const first = store.settle(clear('a1'));
    // floor(S × 1 × (100 collected + 60 boss + 80 mission)) + 75 first clear, S the world's credit scale.
    const repeat = Math.floor(s * (100 + 60 + 80));
    expect(first).toMatchObject({ collected: Math.floor(100 * s), boss: Math.floor(60 * s), mission: Math.floor(80 * s), firstClear: REWARDS.firstClear,
      total: repeat + REWARDS.firstClear, balance: repeat + REWARDS.firstClear, unlocked: 'bastion', repeat: false });
    const again = store.settle(clear('a1'));
    expect(again).toMatchObject({ total: repeat + REWARDS.firstClear, balance: repeat + REWARDS.firstClear, repeat: true, unlocked: null });
    const second = store.settle(clear('a2'));
    expect(second).toMatchObject({ firstClear: 0, total: repeat, balance: 2 * repeat + REWARDS.firstClear, unlocked: null });
    expect(unlockedMissions(store.read())).toEqual(['training', 'bastion']);
    expect(store.read().missions.training?.clears.standard).toBe(2);
  });

  it('scales each world\'s pay by its own credit scale, later worlds paying more', () => {
    const scales = CAMPAIGN_ORDER.map(mission => CREDIT_SCALE[mission]);
    expect(scales.slice(0, 5)).toEqual([...scales.slice(0, 5)].sort((a, b) => a - b));
    for (const mission of CAMPAIGN_ORDER) {
      const repeat = freshProfile(); repeat.missions[mission] = { clears: { relaxed: 0, standard: 1, veteran: 0 }, best: {}, firstClearPaid: true };
      const store = createCampaignProfile(memory(JSON.stringify(repeat)));
      expect(store.settle(clear(`r-${mission}`, { mission })).total).toBe(Math.floor(CREDIT_SCALE[mission] * 240));
    }
  });

  it('banks half the collected credits for a failed or abandoned attempt, scaled by world and difficulty, with no unlock', () => {
    const store = createCampaignProfile(memory()), s = CREDIT_SCALE.training;
    expect(store.settle(clear('f1', { outcome: 'failed', credits: 90, bossKilled: false, difficulty: 'veteran' }))).toMatchObject({ total: Math.floor(s * 1.2 * 0.5 * 90), unlocked: null });
    expect(store.settle(clear('f2', { outcome: 'abandoned', credits: 41, bossKilled: false, difficulty: 'relaxed' }))).toMatchObject({ total: Math.floor(s * 0.85 * 0.5 * 41) });
    expect(unlockedMissions(store.read())).toEqual(['training']);
    expect(store.read().missions.training).toBeUndefined();
  });

  it('buys only affordable, unowned items; equips owned ones; the launch flies the selected level', () => {
    const { store } = funded(600);
    expect(store.buy('weapon', 'fan')).toBe(true);
    expect(store.buy('weapon', 'fan')).toBe(false);
    expect(store.read().credits).toBe(350);
    expect(store.buy('weapon', 'seeker')).toBe(true);
    expect(store.buy('weapon', 'rail')).toBe(false); // 100 left
    expect(store.read().credits).toBe(100);
    expect(store.equip('special', 'siege-lance')).toBe(false);
    expect(store.equip('weapon', 'fan')).toBe(true);
    const config = campaignConfig(store.read(), 'training', 'standard', 7);
    expect(config).toMatchObject({ mode: 'campaign', weapon: 'fan', rank: 0, special: 'seeker-rack', shield: 'standard', ship: 'scrapper' });
  });

  it('persists through storage and never overwrites an unreadable save', () => {
    const storage = memory(), paid = Math.floor(CREDIT_SCALE.training * 240) + REWARDS.firstClear;
    createCampaignProfile(storage).settle(clear('p1'));
    expect(createCampaignProfile(storage).read().credits).toBe(paid);
    const broken = memory('{"version":9,"credits":"lots"}');
    const store = createCampaignProfile(broken);
    expect(store.status()).toBe('unreadable');
    store.settle(clear('p2'));
    expect(broken.values.get(CAMPAIGN_KEY)).toBe('{"version":9,"credits":"lots"}');
    expect(store.read().credits).toBe(paid);
  });
});

describe('the shop (user, 3 November 2026): prices in credits and parts', () => {
  it('prices every item as decided', () => {
    expect(WEAPON_PRICES).toEqual({ pulse: 0, fan: 250, seeker: 250, rail: 250 });
    expect(RANK_PRICES).toEqual([250, 500, 750, 1000]);
    expect(RANK_PARTS).toEqual([0, 3, 5, 10]);
    expect([0, 1, 2, 3, 4].map(rankPrice)).toEqual([{ credits: 250, parts: 0 }, { credits: 500, parts: 3 }, { credits: 750, parts: 5 }, { credits: 1000, parts: 10 }, null]);
    expect(Object.fromEntries(Object.entries(SPECIALS).map(([id, s]) => [id, [s.price, s.parts]]))).toEqual({
      'seeker-rack': [0, 0], 'siege-lance': [250, 1], shockwave: [450, 1], 'gravity-well': [350, 1] });
    expect(Object.fromEntries(SHIP_IDS.map(ship => [ship, itemPrice('ship', ship)]))).toEqual({
      scrapper: { credits: 0, parts: 0 }, ironclad: { credits: 0, parts: 4 }, interceptor: { credits: 0, parts: 4 }, spectre: { credits: 0, parts: 4 } });
    expect(itemPrice('shield', 'bulwark')).toEqual({ credits: 250, parts: 0 });
    expect(itemPrice('shield', 'aegis')).toEqual({ credits: 400, parts: 0 });
    expect(HERO_DESIGN_PRICES).toEqual({ a: 0, b: 50, c: 50, d: 50, e: 50 });
    expect(HERO_DESIGN_PARTS).toEqual({ a: 0, b: 1, c: 1, d: 1, e: 1 });
  });

  it('needs enough credits AND parts, takes both at once, never twice and never below zero', () => {
    // Credits but no part: the Shockwave stays unbought and nothing is taken.
    const rich = funded(1000).store;
    expect(rich.buy('special', 'shockwave')).toBe(false);
    expect(rich.read()).toMatchObject({ credits: 1000, parts: 0, owned: { special: ['seeker-rack'] } });
    // A part but too few credits.
    const poor = funded(449, 1).store;
    expect(poor.buy('special', 'shockwave')).toBe(false);
    expect(poor.read()).toMatchObject({ credits: 449, parts: 1 });
    // Exactly enough: both balances reach zero, and a second purchase is refused.
    const { store, storage } = funded(450, 1);
    expect(store.buy('special', 'shockwave')).toBe(true);
    expect(store.read()).toMatchObject({ credits: 0, parts: 0, owned: { special: ['seeker-rack', 'shockwave'] } });
    expect(store.buy('special', 'shockwave')).toBe(false);
    expect(createCampaignProfile(storage).read()).toMatchObject({ credits: 0, parts: 0, owned: { special: ['seeker-rack', 'shockwave'] } });
    // The free starter is never bought again; an unknown item never sells.
    expect(store.buy('special', 'seeker-rack')).toBe(false);
    expect(store.buy('weapon', 'ironclad')).toBe(false);
  });

  it('sells a ship for four parts and no credits, once, and the hangar can then equip it; it persists', () => {
    const { store, storage } = funded(0, 3);
    expect(store.buy('ship', 'ironclad')).toBe(false);
    expect(store.equip('ship', 'ironclad')).toBe(false);
    // Clears no longer collect chassis pieces: only parts buy a ship.
    store.settle(clear('t1')); store.settle(clear('k1', { mission: 'bastion' })); store.settle(clear('v1', { mission: 'cold-vector' }));
    expect(store.read().owned.ship).toEqual(['scrapper']);
    store.settle(clear('part', { outcome: 'failed', bossKilled: false, credits: 0, parts: 2 }));
    const credits = store.read().credits;
    expect(store.buy('ship', 'ironclad')).toBe(true);
    expect(store.read()).toMatchObject({ credits, parts: 1, owned: { ship: ['scrapper', 'ironclad'] } });
    expect(store.buy('ship', 'ironclad')).toBe(false);
    expect(store.buy('ship', 'spectre')).toBe(false);
    expect(store.equip('ship', 'ironclad')).toBe(true);
    expect(campaignConfig(createCampaignProfile(storage).read(), 'training', 'standard', 1).ship).toBe('ironclad');
    expect(SHIPS.ironclad.parts).toBe(4);
  });

  it('enforces the four-upgrade limit at the decided prices, consuming credits and parts, and sequential shield purchases', () => {
    const { store } = funded(5000, 18);
    expect(store.buy('shield', 'aegis')).toBe(false);
    expect(store.buy('shield', 'bulwark')).toBe(true);
    expect(store.buy('shield', 'aegis')).toBe(true);
    for (const [rank, credits] of RANK_PRICES.entries()) {
      const before = store.read();
      expect(store.upgrade('pulse')).toBe(true);
      // Buying a level also selects it, as buying an item equips it.
      expect(store.read()).toMatchObject({ credits: before.credits - credits, parts: before.parts - RANK_PARTS[rank], ranks: { pulse: rank + 1 }, selected: { pulse: rank + 1 } });
    }
    expect(store.read()).toMatchObject({ credits: 5000 - 650 - 2500, parts: 0 });
    expect(store.upgrade('pulse')).toBe(false);
    expect(store.read()).toMatchObject({ credits: 1850, parts: 0, ranks: { pulse: 4 } });
    expect(campaignConfig(store.read(), 'training', 'standard', 1).rank).toBe(4);
  });

  it('cannot buy a level it cannot afford in either currency, and an unowned weapon has no upgrades', () => {
    for (const [credits, parts] of [[999, 10], [1000, 9]]) {
      const { store } = funded(credits, parts, profile => { profile.ranks.pulse = 3; profile.selected.pulse = 3; });
      expect(store.upgrade('pulse')).toBe(false);
      expect(store.upgrade('fan')).toBe(false);
      expect(store.read()).toMatchObject({ credits, parts, ranks: { pulse: 3, fan: 0 }, selected: { pulse: 3 } });
    }
  });
});

describe('selected weapon levels (user, 3 November 2026)', () => {
  it('selects any bought level for free, never beyond it, and never loses or refunds a bought level', () => {
    const { store, storage } = funded(0, 0, profile => { profile.ranks.pulse = 4; profile.selected.pulse = 4; });
    expect(store.selectRank('pulse', 0)).toBe(true);
    expect(store.read()).toMatchObject({ credits: 0, parts: 0, ranks: { pulse: 4 }, selected: { pulse: 0 } });
    expect(store.selectRank('pulse', 2)).toBe(true);
    for (const rank of [5, -1, 1.5, NaN]) expect(store.selectRank('pulse', rank), String(rank)).toBe(false);
    expect(store.selectRank('fan', 0)).toBe(false); // not owned
    expect(store.read()).toMatchObject({ ranks: { pulse: 4 }, selected: { pulse: 2 } });
    // Reloading the save keeps it.
    expect(createCampaignProfile(storage).read().selected.pulse).toBe(2);
  });

  it('is the one level the campaign flies: a level-5 owner flies Luna at level 1 (First Flight), whatever else changes', () => {
    const { store, storage } = funded(1500, 8, profile => {
      profile.ranks.pulse = 4; profile.selected.pulse = 4; profile.owned.weapon.push('fan'); profile.ranks.fan = 2; profile.selected.fan = 2;
      profile.owned.ship.push('ironclad');
    });
    expect(store.selectRank('pulse', 0)).toBe(true);
    const config = campaignConfig(store.read(), 'training', 'standard', 3);
    expect(config).toMatchObject({ weapon: 'pulse', rank: 0 });
    expect(createRun(config).player).toMatchObject({ weapon: 'pulse', power: 0 });
    // Each weapon keeps its own level through equipping another and back, a ship change, buying and a reload.
    expect(store.equip('weapon', 'fan')).toBe(true);
    expect(campaignConfig(store.read(), 'training', 'standard', 3).rank).toBe(2);
    expect(store.equip('weapon', 'pulse')).toBe(true);
    expect(store.equip('ship', 'ironclad')).toBe(true);
    expect(store.buy('shield', 'bulwark')).toBe(true);
    store.settle(clear('flown'));
    expect(campaignConfig(createCampaignProfile(storage).read(), 'training', 'standard', 3)).toMatchObject({ weapon: 'pulse', rank: 0, ship: 'ironclad' });
    // An upgrade of another weapon leaves this one's selection alone.
    expect(store.upgrade('fan')).toBe(true);
    expect(store.read().selected).toMatchObject({ pulse: 0, fan: 3 });
  });

  it('a selected level above the bought one, or a missing selection, makes a save unreadable and it is never overwritten', () => {
    for (const change of [(p: CampaignProfile) => { p.selected.pulse = 1; }, (p: CampaignProfile) => { delete (p as Partial<CampaignProfile>).selected; },
      (p: CampaignProfile) => { p.selected.fan = -1; }, (p: CampaignProfile) => { p.ranks.pulse = 5; p.selected.pulse = 0; }]) {
      const profile = freshProfile(); change(profile);
      const raw = JSON.stringify(profile), storage = memory(raw), store = createCampaignProfile(storage);
      expect(store.status()).toBe('unreadable');
      store.settle(clear('x'));
      expect(storage.getItem(CAMPAIGN_KEY)).toBe(raw);
    }
  });
});

describe('save version 4: migrating versions 3, 2 and 1 without removing anything', () => {
  it('migrates a version-3 save after backing up the exact original, keeping everything it owns', () => {
    const old = v3(p => {
      p.credits = 777; p.parts = 3;
      p.owned.weapon.push('fan', 'rail'); p.ranks = { pulse: 4, fan: 2, seeker: 0, rail: 1 };
      p.owned.special.push('siege-lance'); p.owned.shield.push('bulwark'); p.owned.ship.push('interceptor');
      p.loadout = { weapon: 'fan', special: 'siege-lance', shield: 'bulwark', ship: 'interceptor' };
      p.designs = ['scrapper:hull:e', 'interceptor:wings:b']; p.looks = { interceptor: { parts: { hull: 'a', wings: 'b', engines: 'a', cockpit: 'a' }, paint: { primary: 0x335577 } } };
      p.missions = { training: { clears: { relaxed: 1, standard: 0, veteran: 0 }, best: { relaxed: 180 }, firstClearPaid: true } };
      p.receipts = [{ id: 'old-run', total: 120, parts: 1 }];
      p.awards = ['mission:first-flight']; p.missionBoard = { board: ['first-flight'], progress: { kills: 12 } };
    });
    const raw = JSON.stringify(old), storage = memory(raw), store = createCampaignProfile(storage);
    expect(store.status()).toBe('saved');
    expect(storage.getItem(CAMPAIGN_V3_BACKUP_KEY)).toBe(raw);
    const profile = store.read();
    expect(profile).toEqual({ ...old, version: PROFILE_VERSION, selected: { pulse: 4, fan: 2, seeker: 0, rail: 1 },
      owned: { ...old.owned, special: ['shockwave', 'siege-lance', 'seeker-rack'] } });
    expect(JSON.parse(storage.getItem(CAMPAIGN_KEY)!)).toEqual(profile);
    // The receipts still guard the old attempts and awards.
    expect(store.settle(clear('old-run')).repeat).toBe(true);
    expect(store.award('mission:first-flight', 50, 1)).toBe(false);
    expect(store.read()).toMatchObject({ credits: 777, parts: 3 });
    // Reloading neither migrates nor backs up again.
    storage.values.set(CAMPAIGN_V3_BACKUP_KEY, 'kept');
    expect(createCampaignProfile(storage).read()).toEqual(store.read());
    expect(storage.getItem(CAMPAIGN_V3_BACKUP_KEY)).toBe('kept');
  });

  it('gives a Shockwave-only save the Seeker Rack free and keeps the Shockwave equipped', () => {
    const profile = createCampaignProfile(memory(JSON.stringify(v3()))).read();
    expect(profile.owned.special).toEqual(['shockwave', 'seeker-rack']);
    expect(profile.loadout.special).toBe('shockwave');
    expect(campaignConfig(profile, 'training', 'standard', 1).special).toBe('shockwave');
  });

  it('keeps a ship whose three mission pieces were all collected but not assembled; partial pieces buy nothing', () => {
    const clears = (missions: string[]) => Object.fromEntries(missions.map(m => [m, { clears: { relaxed: 0, standard: 1, veteran: 0 }, best: {}, firstClearPaid: true }]));
    // Training, Rolling Thunder and Cold Vector: the Ironclad's frame, propulsion and core; two of the Interceptor's three.
    const ready = createCampaignProfile(memory(JSON.stringify(v3(p => { p.missions = clears(['training', 'bastion', 'cold-vector']); })))).read();
    expect(ready.owned.ship).toEqual(['scrapper', 'ironclad']);
    expect(ready.loadout.ship).toBe('scrapper');
    const all = createCampaignProfile(memory(JSON.stringify(v3(p => { p.missions = clears([...CAMPAIGN_ORDER]); p.owned.ship.push('spectre'); })))).read();
    expect(all.owned.ship).toEqual(['scrapper', 'spectre', 'ironclad', 'interceptor']);
    expect(all.parts).toBe(0);
  });

  it('never overwrites a version-3 save whose backup cannot be written; it runs for the session', () => {
    const raw = JSON.stringify(v3(p => { p.credits = 300; })), storage = memory(raw);
    const store = createCampaignProfile({ ...storage, setItem() { throw new Error('full'); } });
    expect(store.status()).toBe('session');
    expect(store.read()).toMatchObject({ version: PROFILE_VERSION, credits: 300, owned: { special: ['shockwave', 'seeker-rack'] } });
    expect(storage.getItem(CAMPAIGN_KEY)).toBe(raw);
    expect(storage.getItem(CAMPAIGN_V3_BACKUP_KEY)).toBeNull();
  });

  it('refuses a version-3 save without the Shockwave starter (it was always owned), and never overwrites it', () => {
    const raw = JSON.stringify(v3(p => { p.owned.special = ['seeker-rack']; p.loadout.special = 'seeker-rack'; })), storage = memory(raw);
    expect(createCampaignProfile(storage).status()).toBe('unreadable');
    expect(storage.getItem(CAMPAIGN_KEY)).toBe(raw);
  });
});

describe('version 1 migration', () => {
  const legacy = () => ({ ...freshProfile(), selected: undefined, version: 1, credits: 100,
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
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.parts).toBe(0);
    expect(profile.credits).toBe(1850); // 100 + two retired 500-credit ranks + two 250-credit drives + Flux 250.
    expect(profile.ranks).toEqual({ pulse: 2, fan: 2, seeker: 2, rail: 0 });
    expect(profile.selected).toEqual(profile.ranks);
    expect(profile.owned.special).toEqual(['shockwave', 'seeker-rack']);
    expect(profile.loadout).toMatchObject({ weapon: 'fan', special: 'shockwave', shield: 'bulwark', ship: 'scrapper' });
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
    // Purchases still work, in this session only.
    expect(store.buy('weapon', 'rail')).toBe(true);
    expect(storage.getItem(CAMPAIGN_KEY)).toBe(raw);
    expect(store.read().credits).toBe(1850 - WEAPON_PRICES.rail);
  });
});

describe('ship designs (docs/31)', () => {
  it('sells B–E part designs for owned ships once, fits only owned designs, and launches with the look', () => {
    const { store } = funded(2000, 10);
    expect(store.buyDesign('ironclad', 'wings', 'b')).toBe(false); // not an owned ship
    const before = store.read();
    expect(store.setLook('scrapper', { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' } })).toBe(false);
    expect(store.buyDesign('scrapper', 'hull', 'b')).toBe(true);
    expect(store.buyDesign('scrapper', 'hull', 'b')).toBe(false);
    expect(store.read()).toMatchObject({ credits: before.credits - 50, parts: before.parts - 1 });
    expect(store.setLook('scrapper', { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' }, paint: { primary: 0x803020 } })).toBe(true);
    expect(campaignConfig(store.read(), 'training', 'standard', 1).hero).toEqual({ parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' }, paint: { primary: 0x803020 } });
  });

  it('prices every design at 50 credits and 1 part, and buying needs both', () => {
    const { store } = funded(2000, 2);
    expect(store.buyDesign('scrapper', 'wings', 'e')).toBe(true);
    expect(store.buyDesign('scrapper', 'hull', 'd')).toBe(true);
    expect(store.read()).toMatchObject({ credits: 1900, parts: 0 });
    expect(store.buyDesign('scrapper', 'hull', 'c')).toBe(false); // no part left
    expect(store.setLook('scrapper', { parts: { hull: 'd', wings: 'e', engines: 'a', cockpit: 'a' } })).toBe(true);
    const broke = funded(49, 5).store;
    expect(broke.buyDesign('scrapper', 'hull', 'b')).toBe(false);
    expect(broke.read()).toMatchObject({ credits: 49, parts: 5 });
  });

  it('offers designs D and E only on a remodelled chassis (docs/31), and drops them from a kit chassis on load', () => {
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

describe('parts (docs/33): the version-2 save and banking', () => {
  /** A version-2 save as the game wrote it before parts: with bought designs and a look, the Shockwave its starter. */
  const v2 = () => {
    const { parts: _parts, ...profile } = { ...v3(), version: 2, credits: 420, designs: ['scrapper:hull:b'],
      looks: { scrapper: { parts: { hull: 'b', wings: 'a', engines: 'a', cockpit: 'a' } } }, receipts: [{ id: 'old', total: 90 }] };
    return profile;
  };

  it('migrates a version-2 save to the current version with no parts, keeping its designs, after backing up the exact original', () => {
    const raw = JSON.stringify(v2()), storage = memory(raw), store = createCampaignProfile(storage);
    expect(store.status()).toBe('saved');
    expect(storage.getItem(CAMPAIGN_V2_BACKUP_KEY)).toBe(raw);
    const profile = store.read();
    expect(profile).toMatchObject({ version: PROFILE_VERSION, parts: 0, credits: 420, designs: ['scrapper:hull:b'], selected: { pulse: 0 } });
    expect(JSON.parse(storage.getItem(CAMPAIGN_KEY)!)).toEqual(profile);
    expect(store.settle(clear('old')).repeat).toBe(true);
    // Reloading the migrated save neither migrates nor backs up again.
    storage.values.set(CAMPAIGN_V2_BACKUP_KEY, 'kept');
    expect(createCampaignProfile(storage).read()).toEqual(store.read());
    expect(storage.getItem(CAMPAIGN_V2_BACKUP_KEY)).toBe('kept');
  });

  it('loads a version-2 save written before the Rail Driver existed, its rank starting at 0', () => {
    const old = v2() as unknown as { credits: number; ranks: Record<string, number> };
    old.credits = 900; old.ranks.pulse = 2; delete old.ranks.rail;
    const store = createCampaignProfile(memory(JSON.stringify(old)));
    expect(store.read()).toMatchObject({ credits: 900, ranks: { pulse: 2, rail: 0 }, selected: { pulse: 2, rail: 0 } });
    expect(store.status()).toBe('saved');
    expect(store.buy('weapon', 'rail')).toBe(true);
    expect(store.read()).toMatchObject({ credits: 650, owned: { weapon: ['pulse', 'rail'] } });
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
});

describe('one-time rewards and the mission state (the mission system\'s API)', () => {
  it('pays credits and parts together once per receipt id, and persists both with the receipt', () => {
    const storage = memory(), store = createCampaignProfile(storage);
    expect(store.award('mission:first-flight', 120, 2)).toBe(true);
    expect(store.read()).toMatchObject({ credits: 120, parts: 2, awards: ['mission:first-flight'] });
    expect(store.award('mission:first-flight', 120, 2)).toBe(false);
    expect(createCampaignProfile(storage).award('mission:first-flight', 999, 9)).toBe(false);
    expect(createCampaignProfile(storage).read()).toMatchObject({ credits: 120, parts: 2 });
    // Invalid amounts or ids grant nothing and record nothing.
    for (const [id, credits, parts] of [['', 10, 0], ['x', -5, 0], ['y', 1.5, 0], ['z', 0, -1]] as const) expect(store.award(id, credits, parts)).toBe(false);
    expect(store.read()).toMatchObject({ credits: 120, parts: 2, awards: ['mission:first-flight'] });
    // A receipt outlives the bounded attempt receipts.
    for (let i = 0; i < 205; i++) store.settle(clear(`run-${i}`, { outcome: 'failed', credits: 0, bossKilled: false }));
    expect(store.award('mission:first-flight', 120, 2)).toBe(false);
  });

  it('applies awardOnce to a plain profile, and carries the mission state through saves unchanged', () => {
    const profile = freshProfile();
    expect(awardOnce(profile, 'a', 5, 1)).toBe(true);
    expect(awardOnce(profile, 'a', 5, 1)).toBe(false);
    expect(profile).toMatchObject({ credits: 5, parts: 1, awards: ['a'] });
    const storage = memory(), store = createCampaignProfile(storage);
    const board = { version: 1, progress: { 'first-flight': [1, 2] }, note: 'opaque' };
    const paid = store.missionTransaction(p => { p.missionBoard = board; return awardOnce(p, 'mission:first-flight', 50, 1); });
    expect(paid).toBe(true);
    expect(createCampaignProfile(storage).read()).toMatchObject({ credits: 50, parts: 1, missionBoard: board });
    // A malformed awards list makes the save unreadable (never overwritten) rather than risking a second payment.
    const raw = JSON.stringify({ ...freshProfile(), awards: 'all' }), broken = memory(raw);
    expect(createCampaignProfile(broken).status()).toBe('unreadable');
    expect(broken.values.get(CAMPAIGN_KEY)).toBe(raw);
  });
});
