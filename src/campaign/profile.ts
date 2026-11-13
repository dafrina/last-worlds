import { CAMPAIGN_ORDER, CREDIT_MULTIPLIER, CREDIT_SCALE, MAX_RANK, RANK_PARTS, RANK_PRICES, SHIPS, SHIP_IDS, REWARDS, SHIELD_IDS, SHIELD_TECH, SPECIALS, SPECIAL_IDS, STARTER, WEAPON_IDS, WEAPON_PRICES, type Loadout, type Price } from '../content/equipment';
import type { Difficulty, HeroDesign, HeroLook, HeroSlot, MissionId, ShipId, RunConfig, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';
import { DEFAULT_LOOK, HERO_DESIGN_PARTS, HERO_DESIGN_PRICES, HERO_SLOTS, heroDesignId, heroDesigns, validLook } from '../content/hero-parts';

/**
 * Campaign progression (docs/21): one local profile with the credit and parts balances, owned equipment, main-weapon
 * ranks (bought and selected), the equipped four-slot loadout, mission clears (which unlock the next mission) and banked
 * attempt receipts.
 * Endless never writes it; it reads only the equipped ship's look, as cosmetics (`endlessConfig`, docs/33 § 2). Every
 * change re-reads storage first and writes the whole profile; banking an attempt is idempotent by attempt ID. An
 * unreadable or unknown save is never overwritten: the profile then runs in memory for the session and says so. An older
 * schema is migrated, and the exact original is kept under its version's backup key before the migrated save replaces it.
 */
export const CAMPAIGN_KEY = 'last-worlds.campaign.v1';
/** The backup of a version-1 save, written once before its migration replaced it. */
export const CAMPAIGN_BACKUP_KEY = 'last-worlds.campaign.v1.backup';
/** The backup of a version-2 save (before parts, docs/33), written once before its migration replaced it. */
export const CAMPAIGN_V2_BACKUP_KEY = 'last-worlds.campaign.v2.backup';
/** The backup of a version-3 save (before the 3 November 2026 shop and selected levels), written once before its migration. */
export const CAMPAIGN_V3_BACKUP_KEY = 'last-worlds.campaign.v3.backup';
/** The backup of a version-4 save (before The Silent Empire joined the campaign order, 12 November 2026). */
export const CAMPAIGN_V4_BACKUP_KEY = 'last-worlds.campaign.v4.backup';
const BACKUP_KEYS: Readonly<Record<number, string>> = { 1: CAMPAIGN_BACKUP_KEY, 2: CAMPAIGN_V2_BACKUP_KEY, 3: CAMPAIGN_V3_BACKUP_KEY, 4: CAMPAIGN_V4_BACKUP_KEY };
export const PROFILE_VERSION = 5;
export type Slot = 'weapon' | 'special' | 'shield' | 'ship';
export type ItemId = WeaponId | SpecialId | ShieldTechId | ShipId;
export interface MissionRecord { clears: Record<Difficulty, number>; best: Partial<Record<Difficulty, number>>; firstClearPaid: boolean }
export interface CampaignProfile {
  /**
   * 5 since 12 November 2026 (The Silent Empire inserted before Final Horizon, `opened`); 4 since 3 November 2026 (the shop
   * in both currencies, selected weapon levels, the Seeker Rack as the free starter); versions 4 to 1 are migrated on load.
   */
  version: 5;
  credits: number;
  /** Parts (docs/33): the campaign's second, rare currency, from strike sites; ships, upgrades, specials and designs take them. */
  parts: number;
  owned: { weapon: WeaponId[]; special: SpecialId[]; shield: ShieldTechId[]; ship: ShipId[] };
  /** The highest rank bought per weapon (0 = level 1, MAX_RANK = level 5). Never lowered: a bought level is never lost. */
  ranks: Record<WeaponId, number>;
  /**
   * The rank each weapon flies (0 to its bought rank): chosen freely in the hangar, the one level a campaign run uses
   * (`campaignConfig`). Only the pilot's choice or a new upgrade changes it.
   */
  selected: Record<WeaponId, number>;
  loadout: Loadout;
  missions: Partial<Record<MissionId, MissionRecord>>;
  /** Banked attempts (newest first, bounded): reopening results or a repeated call never pays twice. */
  receipts: { id: string; total: number; parts?: number }[];
  /**
   * Modular ship parts bought (docs/31): `ship:slot:design` ids of B and C designs (A comes with the chassis), and each
   * ship's chosen look. Cosmetic; added after version-2 saves existed, so both are optional.
   */
  designs?: string[];
  looks?: Partial<Record<ShipId, HeroLook>>;
  /**
   * One-time rewards already paid (`awardOnce`): their receipt ids. Kept apart from the attempt receipts, which are
   * bounded, so an old award can never fall off the list and pay again.
   */
  awards?: string[];
  /**
   * The mission system's own state (its board and progress), opaque here: stored and carried through every load and
   * migration unchanged. Named `missionBoard` because `missions` already holds the campaign's mission clears.
   */
  missionBoard?: MissionSave;
  /**
   * Missions a migration keeps open whatever the order: ones a save had unlocked before a mission was inserted ahead of them
   * (Final Horizon for a save that had cleared Dying Star before The Silent Empire existed, docs/39). Absent when none.
   */
  opened?: MissionId[];
}
/** The mission system's saved state: its shape belongs to that system (src/campaign/missions*.ts), not to the profile. */
export type MissionSave = unknown;
export interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export type AttemptOutcome = 'complete' | 'failed' | 'abandoned';
export interface AttemptResult {
  id: string; mission: MissionId; difficulty: Difficulty; outcome: AttemptOutcome;
  /** The run's credits: collected pickups plus the boss reward if the boss fell. */
  credits: number; bossKilled: boolean; seconds: number;
  /** Parts collected in the run (docs/33); banked in full, whatever the outcome. */
  parts?: number;
}
export interface Payout {
  collected: number; boss: number; mission: number; multiplier: number; firstClear: number; total: number;
  balance: number; unlocked: MissionId | null; repeat: boolean;
  /** Parts this attempt banked, and the parts balance after it. */
  parts: number; partsBalance: number;
}

const RECEIPT_LIMIT = 200;
export const SLOT_ITEMS: { readonly [S in Slot]: readonly Loadout[S][] } = { weapon: WEAPON_IDS, special: SPECIAL_IDS, shield: SHIELD_IDS, ship: SHIP_IDS };
/** An item's campaign price in credits and parts (user, 3 November 2026). */
export function itemPrice(slot: Slot, id: ItemId): Price {
  if (slot === 'weapon') return { credits: WEAPON_PRICES[id as WeaponId], parts: 0 };
  if (slot === 'special') return { credits: SPECIALS[id as SpecialId].price, parts: SPECIALS[id as SpecialId].parts };
  if (slot === 'shield') return { credits: SHIELD_TECH[id as ShieldTechId].price, parts: 0 };
  return { credits: SHIPS[id as ShipId].price, parts: SHIPS[id as ShipId].parts };
}
/** The next upgrade of a weapon at `rank` (its step to rank + 1), or null at the top level. */
export function rankPrice(rank: number): Price | null {
  return rank >= 0 && rank < MAX_RANK ? { credits: RANK_PRICES[rank], parts: RANK_PARTS[rank] } : null;
}
/** Whether the balances cover a price: credits AND parts. */
export const affords = (profile: CampaignProfile, price: Price) => profile.credits >= price.credits && profile.parts >= price.parts;

export function freshProfile(): CampaignProfile {
  return {
    version: 5, credits: 0, parts: 0,
    owned: { weapon: [STARTER.weapon], special: [STARTER.special], shield: [STARTER.shield], ship: [STARTER.ship] },
    ranks: { pulse: 0, fan: 0, seeker: 0, rail: 0 }, selected: { pulse: 0, fan: 0, seeker: 0, rail: 0 },
    loadout: { ...STARTER }, missions: {}, receipts: [],
  };
}

/** Main weapons added after version-2 saves existed; a save without their rank is still valid. */
const LATER_WEAPONS: readonly WeaponId[] = ['rail'];
/** The starter a version 1-3 save always owns: the Shockwave was the free special until 3 November 2026. */
const V3_STARTER = { weapon: 'pulse', special: 'shockwave', shield: 'standard', ship: 'scrapper' } as const;
/**
 * Versions 1-3: the mission clears that collected each chassis's frame, propulsion and core before ships were bought with
 * parts (3 November 2026). A save that held all three of a chassis's pieces could assemble it for free: it keeps the ship.
 */
const V3_CHASSIS_PIECES: Readonly<Partial<Record<ShipId, readonly MissionId[]>>> = {
  ironclad: ['training', 'bastion', 'cold-vector'], interceptor: ['bastion', 'cold-vector', 'deep-bloom'], spectre: ['deep-bloom', 'brood-strike', 'final-horizon'],
};
const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const unsupported = () => new Error('Unsupported campaign profile');
interface SaveRules { slots: Readonly<Record<string, readonly string[]>>; starter: Readonly<Record<string, string>>; maxRank: number; parts: boolean; selected: boolean }

/**
 * Whether a parsed save is well formed under its version's rules: the items of each slot (and the starter it must own),
 * the highest rank, and whether it carries parts and selected ranks.
 */
function wellFormed(data: CampaignProfile, rules: SaveRules): boolean {
  const savedOwned = data?.owned as unknown as Record<string, string[]>;
  const savedLoadout = data?.loadout as unknown as Record<string, string>;
  const ownedValid = !!savedOwned && Object.entries(rules.slots).every(([slot, ids]) => Array.isArray(savedOwned[slot])
    && savedOwned[slot].every(id => ids.includes(id)) && savedOwned[slot].includes(rules.starter[slot]));
  const loadoutValid = ownedValid && !!savedLoadout && Object.keys(rules.slots).every(slot => savedOwned[slot].includes(savedLoadout[slot]));
  // A weapon added after a save was written has no rank in it yet: it starts at 0 (the Rail Driver, docs/32).
  if (data?.ranks && typeof data.ranks === 'object') for (const id of LATER_WEAPONS) data.ranks[id] ??= 0;
  const ranksValid = !!data?.ranks && WEAPON_IDS.every(id => count(data.ranks[id]) && data.ranks[id] <= rules.maxRank);
  // A selected rank is one the save bought: never above it.
  const selectedValid = !rules.selected || (ranksValid && !!data.selected && typeof data.selected === 'object'
    && WEAPON_IDS.every(id => count(data.selected[id]) && data.selected[id] <= data.ranks[id]));
  const missionsValid = !!data?.missions && typeof data.missions === 'object' && Object.entries(data.missions).every(([id, record]) =>
    (CAMPAIGN_ORDER as readonly string[]).includes(id) && record && typeof record.firstClearPaid === 'boolean'
    && (['relaxed', 'standard', 'veteran'] as const).every(d => count(record.clears?.[d])));
  const receiptsValid = Array.isArray(data?.receipts) && data.receipts.every(r => r && typeof r.id === 'string' && count(r.total) && (r.parts === undefined || count(r.parts)));
  // Paid one-time rewards guard against paying twice: a malformed list makes the save unreadable rather than guessed at.
  const awardsValid = data?.awards === undefined || (Array.isArray(data.awards) && data.awards.every(id => typeof id === 'string'));
  const openedValid = data?.opened === undefined || (Array.isArray(data.opened) && data.opened.every(id => (CAMPAIGN_ORDER as readonly string[]).includes(id)));
  return count(data?.credits) && (!rules.parts || count(data.parts)) && ownedValid && loadoutValid && ranksValid && selectedValid
    && missionsValid && receiptsValid && awardsValid && openedValid;
}

/** Reads a save of any supported version as the current one; throws for anything unreadable or unknown. */
function decode(raw: string): CampaignProfile {
  const data = JSON.parse(raw) as CampaignProfile;
  const version = data?.version as number;
  const rules: SaveRules = { slots: SLOT_ITEMS, starter: STARTER, maxRank: MAX_RANK, parts: true, selected: true };
  if (version === PROFILE_VERSION) {
    if (!wellFormed(data, rules)) throw unsupported();
    return cleanLooks(data);
  }
  if (version === 4) {
    // Version 4 had no `opened`: one there is not a version-4 save.
    if (data.opened !== undefined || !wellFormed(data, rules)) throw unsupported();
    return cleanLooks(toVersion5(data));
  }
  if (version === 3 || version === 2 || version === 1) return cleanLooks(toVersion5(toVersion4(toVersion3(data))));
  throw unsupported();
}

/** Versions 1 and 2 read as version 3, and every one is checked by the version-3 rules, exactly as the version-3 build read them. */
function toVersion3(data: CampaignProfile): CampaignProfile {
  // Version 2 had no parts balance (docs/33): it starts with none. Everything else is read exactly as before.
  if ((data.version as number) === 2) {
    if (data.parts !== undefined) throw unsupported();
    data.parts = 0; (data as { version: number }).version = 3;
  }
  const legacy = (data.version as number) === 1;
  const slots = legacy ? { weapon: WEAPON_IDS, special: SPECIAL_IDS, shield: ['standard', 'bulwark', 'flux'], reactor: ['balanced', 'vector', 'precision'] } : SLOT_ITEMS;
  const rules: SaveRules = { slots, starter: legacy ? { ...V3_STARTER, reactor: 'balanced' } : V3_STARTER, maxRank: legacy ? 3 : MAX_RANK, parts: !legacy, selected: false };
  if (!wellFormed(data, rules)) throw unsupported();
  if (!legacy) return data;
  // Keep all records/receipts and every still-supported purchase. Retired purchases are refunded exactly once.
  const savedOwned = data.owned as unknown as Record<string, string[]>, savedLoadout = data.loadout as unknown as Record<string, string>;
  const migrated = structuredClone(data);
  (migrated as { version: number }).version = 3; migrated.parts = 0;
  for (const id of WEAPON_IDS) {
    if (migrated.ranks[id] === 3) { migrated.ranks[id] = 2; migrated.credits += 500; }
  }
  for (const id of ['vector', 'precision']) if (savedOwned.reactor.includes(id)) migrated.credits += 250;
  if (savedOwned.shield.includes('flux')) migrated.credits += 250;
  migrated.owned = { weapon: data.owned.weapon, special: data.owned.special,
    shield: savedOwned.shield.filter(id => id !== 'flux') as ShieldTechId[], ship: ['scrapper'] };
  migrated.loadout = { weapon: data.loadout.weapon, special: data.loadout.special, ship: 'scrapper',
    shield: savedLoadout.shield === 'flux' ? (savedOwned.shield.includes('bulwark') ? 'bulwark' : 'standard') : data.loadout.shield };
  return migrated;
}

/**
 * Version 3 → 4 (the shop of 3 November 2026), removing nothing a save owns: every item, ship, design, rank, credit,
 * part, record and receipt stays. Added: each weapon flies its bought rank (`selected`, as it did before); the Seeker Rack
 * joins the owned specials (the new free starter) while the Shockwave stays owned and the equipped special stays; and a
 * chassis whose three mission pieces were all collected but never assembled becomes owned (ships are bought with parts now).
 */
function toVersion4(data: CampaignProfile): CampaignProfile {
  const migrated = structuredClone(data);
  (migrated as { version: number }).version = 4;
  migrated.selected = { ...migrated.ranks };
  if (!migrated.owned.special.includes(STARTER.special)) migrated.owned.special.push(STARTER.special);
  for (const ship of SHIP_IDS) {
    const pieces = V3_CHASSIS_PIECES[ship];
    if (pieces && !migrated.owned.ship.includes(ship) && pieces.every(mission => cleared(migrated, mission))) migrated.owned.ship.push(ship);
  }
  return migrated;
}

/** The campaign order before The Silent Empire (versions 1-4). */
const ORDER_V4: readonly MissionId[] = CAMPAIGN_ORDER.filter(mission => mission !== 'silent-empire');
/**
 * Version 4 → 5 (The Silent Empire inserted before Final Horizon, 12 November 2026), removing and locking nothing: every
 * mission the save had open under the old order stays open (`opened`, only when the new order alone would close one).
 */
function toVersion5(data: CampaignProfile): CampaignProfile {
  const migrated = structuredClone(data) as CampaignProfile;
  (migrated as { version: number }).version = 5;
  const before = unlockedIn(migrated, ORDER_V4), now = new Set(unlockedMissions(migrated));
  const kept = before.filter(mission => !now.has(mission));
  if (kept.length) migrated.opened = kept;
  return migrated;
}

/**
 * The cosmetic ship fields, cleaned rather than refused (a broken paint never costs a save its progress): unknown design
 * ids are dropped, and a look keeps only designs the profile owns (others fall back to A).
 */
function cleanLooks(profile: CampaignProfile): CampaignProfile {
  const known = new Set(SHIP_IDS.flatMap(ship => HERO_SLOTS.flatMap(slot => heroDesigns(ship).filter(d => d !== 'a').map(d => heroDesignId(ship, slot, d)))));
  if (profile.designs !== undefined) profile.designs = Array.isArray(profile.designs) ? [...new Set(profile.designs.filter(id => known.has(id)))] : [];
  if (profile.looks !== undefined) {
    const looks: Partial<Record<ShipId, HeroLook>> = {};
    for (const ship of SHIP_IDS) {
      const look = validLook(profile.looks?.[ship], ship);
      if (look) looks[ship] = { ...look, parts: Object.fromEntries(HERO_SLOTS.map(slot => [slot, ownsDesign(profile, ship, slot, look.parts[slot]) ? look.parts[slot] : 'a'])) as HeroLook['parts'] };
    }
    profile.looks = looks;
  }
  return profile;
}
/** Whether a profile may fit a part design: A always, the others once bought. */
export const ownsDesign = (profile: CampaignProfile, ship: ShipId, slot: HeroSlot, design: HeroDesign) =>
  design === 'a' || (profile.designs ?? []).includes(heroDesignId(ship, slot, design));
/** A ship's chosen look (the default for one never customised). */
export const lookOf = (profile: CampaignProfile, ship: ShipId): HeroLook => profile.looks?.[ship] ?? DEFAULT_LOOK;

/** Which missions can be launched: Training always; each later one once the mission before it has been cleared. */
export function unlockedMissions(profile: CampaignProfile): MissionId[] {
  return unlockedIn(profile, CAMPAIGN_ORDER);
}
function unlockedIn(profile: CampaignProfile, order: readonly MissionId[]): MissionId[] {
  const open: MissionId[] = [];
  const kept = (mission: MissionId) => profile.missions[mission] !== undefined || !!profile.opened?.includes(mission);
  for (const [index, mission] of order.entries()) {
    // Open once the mission before it is cleared, or if the pilot already has a record on it or a migration kept it open: a
    // mission added in the middle of the order (The Silent Empire before Final Horizon, 12 November, docs/39) never locks
    // one already reached.
    if (index === 0 || cleared(profile, order[index - 1]) || kept(mission)) open.push(mission);
    else if (!order.slice(index + 1).some(kept)) break;
  }
  return open;
}
export const cleared = (profile: CampaignProfile, mission: MissionId) => {
  const clears = profile.missions[mission]?.clears;
  return !!clears && clears.relaxed + clears.standard + clears.veteran > 0;
};

/**
 * Pays a one-time reward (the mission system's): `credits` and `parts` together, at most once per `id` (a non-empty
 * receipt id, kept in `awards`). Changes `profile` in place and returns whether it was newly granted; an id already paid,
 * an empty id or a negative or fractional amount grants nothing. Call it inside one store transaction (`award`, or
 * `missionTransaction` together with the mission state), so the reward and its receipt are saved at once.
 */
export function awardOnce(profile: CampaignProfile, id: string, credits: number, parts: number): boolean {
  if (typeof id !== 'string' || !id || !count(credits) || !count(parts)) return false;
  const awards = profile.awards ?? [];
  if (awards.includes(id)) return false;
  profile.credits += credits; profile.parts += parts; profile.awards = [...awards, id];
  return true;
}

/**
 * Credits an attempt banks (docs/11 §4, docs/30 § Income): scaled by its world's CREDIT_SCALE; `firstClear` is paid only
 * on the mission's first success.
 */
export function payout(profile: CampaignProfile, result: AttemptResult): Omit<Payout, 'balance' | 'unlocked' | 'repeat' | 'parts' | 'partsBalance'> {
  const multiplier = CREDIT_MULTIPLIER[result.difficulty];
  const boss = result.outcome === 'complete' && result.bossKilled ? REWARDS.boss : 0;
  const collected = Math.max(0, Math.floor(result.credits) - (result.bossKilled ? REWARDS.boss : 0));
  // The breakdown shows the rewards as paid (scaled); the run's collected credits are scaled the same way.
  const scale = CREDIT_SCALE[result.mission], shown = Math.floor(collected * scale);
  if (result.outcome !== 'complete') return { collected: shown, boss: 0, mission: 0, multiplier, firstClear: 0, total: Math.floor(scale * multiplier * REWARDS.failureShare * collected) };
  const firstClear = profile.missions[result.mission]?.firstClearPaid ? 0 : REWARDS.firstClear;
  return { collected: shown, boss: Math.floor(boss * scale), mission: Math.floor(REWARDS.success * scale), multiplier, firstClear, total: Math.floor(scale * multiplier * (collected + boss + REWARDS.success)) + firstClear };
}

/**
 * The run config for a campaign launch: the mission, difficulty and the equipped loadout, with the weapon's selected rank:
 * the one level the run flies (pattern, rate and damage). Campaign runs never change it: power cells and weapon drops act
 * only in endless, and a lost life lowers the tier only in endless (src/sim/game.ts).
 */
export function campaignConfig(profile: CampaignProfile, mission: MissionId, difficulty: Difficulty, seed: number): RunConfig {
  const { weapon, special, shield, ship } = profile.loadout;
  return { mode: 'campaign', seed, mission, difficulty, weapon, special, shield, ship, rank: profile.selected[weapon], hero: lookOf(profile, ship) };
}

/**
 * The run config for an endless launch: the equipped ship's chassis (including its global perk) and cosmetic look (
 * `heroShip`, `hero`). Nothing else of the profile: createRun gives endless the starter loadout whatever it is passed.
 */
export function endlessConfig(profile: CampaignProfile, seed: number): RunConfig {
  const ship = profile.loadout.ship;
  return { mode: 'endless', seed, heroShip: ship, hero: lookOf(profile, ship) };
}

export function createCampaignProfile(storage?: ProfileStorage) {
  let profile = freshProfile();
  let status: 'saved' | 'session' | 'unreadable' = storage ? 'saved' : 'session';
  const reload = () => {
    if (status !== 'saved' || !storage) return;
    try {
      const raw = storage.getItem(CAMPAIGN_KEY);
      if (raw !== null) {
        const next = decode(raw);
        profile = next;
        const version = JSON.parse(raw).version;
        if (version !== PROFILE_VERSION) {
          // Do not replace the original unless an exact backup was safely stored first (one key per old version).
          const backup = BACKUP_KEYS[version];
          try {
            if (storage.getItem(backup) === null) storage.setItem(backup, raw);
            storage.setItem(CAMPAIGN_KEY, JSON.stringify(next));
          } catch { status = 'session'; }
        }
      }
    }
    catch { status = 'unreadable'; }
  };
  const save = () => {
    if (status !== 'saved' || !storage) return;
    try { storage.setItem(CAMPAIGN_KEY, JSON.stringify(profile)); } catch { status = 'session'; }
  };
  reload();
  /** Applies one change against the freshest stored profile, then writes it back. */
  const transact = <T>(change: (p: CampaignProfile) => T): T => { reload(); const result = change(profile); save(); return result; };

  return {
    read(): CampaignProfile { reload(); return structuredClone(profile); },
    status() { return status; },
    /**
     * Buys an item (a ship too) for its slot if not owned yet and both its credits and its parts are affordable, taking
     * both at once; returns whether it was bought.
     */
    buy(slot: Slot, id: ItemId): boolean {
      return transact(p => {
        if (!(SLOT_ITEMS[slot] as readonly string[]).includes(id)) return false;
        if (slot === 'shield' && id === 'aegis' && !p.owned.shield.includes('bulwark')) return false;
        const owned = p.owned[slot] as ItemId[], price = itemPrice(slot, id);
        if (owned.includes(id) || !affords(p, price)) return false;
        p.credits -= price.credits; p.parts -= price.parts; owned.push(id);
        return true;
      });
    },
    /**
     * Buys an owned main weapon's next level if both its credits and parts are affordable (both are consumed) and selects
     * it, as buying an item equips it; returns whether it was upgraded.
     */
    upgrade(weapon: WeaponId): boolean {
      return transact(p => {
        const rank = p.ranks[weapon], price = rankPrice(rank);
        if (!p.owned.weapon.includes(weapon) || !price || !affords(p, price)) return false;
        p.credits -= price.credits; p.parts -= price.parts; p.ranks[weapon] = rank + 1; p.selected[weapon] = rank + 1;
        return true;
      });
    },
    /** Selects the level an owned weapon flies: any rank from 0 up to the one bought, free. Returns whether it was saved. */
    selectRank(weapon: WeaponId, rank: number): boolean {
      return transact(p => {
        if (!p.owned.weapon.includes(weapon) || !count(rank) || rank > p.ranks[weapon]) return false;
        p.selected[weapon] = rank;
        return true;
      });
    },
    /** Buys a part design (B onward) for an owned ship if both its parts and its credits are affordable; returns whether it was bought. */
    buyDesign(ship: ShipId, slot: HeroSlot, design: HeroDesign): boolean {
      return transact(p => {
        if (!p.owned.ship.includes(ship) || !HERO_SLOTS.includes(slot) || !heroDesigns(ship).includes(design) || ownsDesign(p, ship, slot, design)) return false;
        const credits = HERO_DESIGN_PRICES[design], parts = HERO_DESIGN_PARTS[design];
        if (p.credits < credits || p.parts < parts) return false;
        p.credits -= credits; p.parts -= parts; p.designs = [...(p.designs ?? []), heroDesignId(ship, slot, design)];
        return true;
      });
    },
    /** Sets an owned ship's look (free): every part owned, paint whole colours. Returns whether it was saved. */
    setLook(ship: ShipId, look: HeroLook): boolean {
      return transact(p => {
        const clean = validLook(look, ship);
        if (!clean || !p.owned.ship.includes(ship) || !HERO_SLOTS.every(slot => ownsDesign(p, ship, slot, clean.parts[slot]))) return false;
        p.looks = { ...p.looks, [ship]: clean };
        return true;
      });
    },
    /** Pays a one-time reward (`awardOnce`) and saves it; returns whether it was newly granted. */
    award(id: string, credits: number, parts: number): boolean {
      return transact(p => awardOnce(p, id, credits, parts));
    },
    /**
     * The mission system's transaction: `change` runs against the freshest stored profile and everything it changes is
     * saved together. It should change only `missionBoard` and pay rewards only through `awardOnce`.
     */
    missionTransaction<T>(change: (profile: CampaignProfile) => T): T {
      return transact(change);
    },
    /** Equips an owned item in its slot (free). */
    equip(slot: Slot, id: ItemId): boolean {
      return transact(p => {
        if (!(p.owned[slot] as ItemId[]).includes(id)) return false;
        (p.loadout as unknown as Record<Slot, ItemId>)[slot] = id;
        return true;
      });
    },
    /** Banks one attempt exactly once (by its ID): credits, parts, clears, best time, first-clear receipt and unlocks. */
    settle(result: AttemptResult): Payout {
      return transact(p => {
        const earlier = p.receipts.find(receipt => receipt.id === result.id);
        const pay = payout(p, result);
        if (earlier) return { ...pay, total: earlier.total, balance: p.credits, unlocked: null, repeat: true, parts: earlier.parts ?? 0, partsBalance: p.parts };
        // Parts are banked in full with any outcome, a failed or abandoned attempt included (docs/33 § 2).
        const parts = Math.max(0, Math.floor(result.parts ?? 0));
        const before = unlockedMissions(p);
        p.credits += pay.total;
        p.parts += parts;
        if (result.outcome === 'complete') {
          const record = p.missions[result.mission] ?? { clears: { relaxed: 0, standard: 0, veteran: 0 }, best: {}, firstClearPaid: false };
          record.clears[result.difficulty] += 1;
          record.best[result.difficulty] = Math.min(record.best[result.difficulty] ?? Infinity, Math.round(result.seconds * 10) / 10);
          if (pay.firstClear) record.firstClearPaid = true;
          p.missions[result.mission] = record;
        }
        p.receipts = [{ id: result.id, total: pay.total, ...(parts ? { parts } : {}) }, ...p.receipts].slice(0, RECEIPT_LIMIT);
        const unlocked = unlockedMissions(p).find(mission => !before.includes(mission)) ?? null;
        return { ...pay, balance: p.credits, unlocked, repeat: false, parts, partsBalance: p.parts };
      });
    },
  };
}
export type CampaignProfileStore = ReturnType<typeof createCampaignProfile>;
