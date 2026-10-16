import { CAMPAIGN_ORDER, CREDIT_MULTIPLIER, MAX_RANK, RANK_PRICES, REACTORS, REACTOR_IDS, REWARDS, SHIELD_IDS, SHIELD_TECH, SPECIALS, SPECIAL_IDS, STARTER, WEAPON_IDS, WEAPON_PRICES, type Loadout } from '../content/equipment';
import type { Difficulty, MissionId, ReactorId, RunConfig, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';

/**
 * Campaign progression (docs/21): one local profile with the credit balance, owned equipment, main-weapon ranks,
 * the equipped four-slot loadout, mission clears (which unlock the next mission) and banked attempt receipts.
 * Campaign only: endless never reads or writes it. Every change re-reads storage first and writes the whole profile;
 * banking an attempt is idempotent by attempt ID. An unreadable or unknown save is never overwritten: the profile
 * then runs in memory for the session and says so.
 */
export const CAMPAIGN_KEY = 'last-worlds.campaign.v1';
export type Slot = 'weapon' | 'special' | 'shield' | 'reactor';
export type ItemId = WeaponId | SpecialId | ShieldTechId | ReactorId;
export interface MissionRecord { clears: Record<Difficulty, number>; best: Partial<Record<Difficulty, number>>; firstClearPaid: boolean }
export interface CampaignProfile {
  version: 1;
  credits: number;
  owned: { weapon: WeaponId[]; special: SpecialId[]; shield: ShieldTechId[]; reactor: ReactorId[] };
  ranks: Record<WeaponId, number>;
  loadout: Loadout;
  missions: Partial<Record<MissionId, MissionRecord>>;
  /** Banked attempts (newest first, bounded): reopening results or a repeated call never pays twice. */
  receipts: { id: string; total: number }[];
}
export interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export type AttemptOutcome = 'complete' | 'failed' | 'abandoned';
export interface AttemptResult {
  id: string; mission: MissionId; difficulty: Difficulty; outcome: AttemptOutcome;
  /** The run's credits: collected pickups plus the boss reward if the boss fell. */
  credits: number; bossKilled: boolean; seconds: number;
}
export interface Payout {
  collected: number; boss: number; mission: number; multiplier: number; firstClear: number; total: number;
  balance: number; unlocked: MissionId | null; repeat: boolean;
}

const RECEIPT_LIMIT = 200;
export const SLOT_ITEMS: { readonly [S in Slot]: readonly Loadout[S][] } = { weapon: WEAPON_IDS, special: SPECIAL_IDS, shield: SHIELD_IDS, reactor: REACTOR_IDS };
export function itemPrice(slot: Slot, id: ItemId): number {
  return slot === 'weapon' ? WEAPON_PRICES[id as WeaponId] : slot === 'special' ? SPECIALS[id as SpecialId].price
    : slot === 'shield' ? SHIELD_TECH[id as ShieldTechId].price : REACTORS[id as ReactorId].price;
}

export function freshProfile(): CampaignProfile {
  return {
    version: 1, credits: 0,
    owned: { weapon: [STARTER.weapon], special: [STARTER.special], shield: [STARTER.shield], reactor: [STARTER.reactor] },
    ranks: { pulse: 0, fan: 0, seeker: 0 }, loadout: { ...STARTER }, missions: {}, receipts: [],
  };
}

const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
function decode(raw: string): CampaignProfile {
  const data = JSON.parse(raw) as CampaignProfile;
  const ownedValid = data?.owned && (Object.keys(SLOT_ITEMS) as Slot[]).every(slot => Array.isArray(data.owned[slot])
    && data.owned[slot].every(id => (SLOT_ITEMS[slot] as readonly string[]).includes(id)) && data.owned[slot].includes(STARTER[slot] as never));
  const loadoutValid = data?.loadout && (Object.keys(SLOT_ITEMS) as Slot[]).every(slot => (data.owned[slot] as readonly string[]).includes(data.loadout[slot]));
  const ranksValid = data?.ranks && WEAPON_IDS.every(id => count(data.ranks[id]) && data.ranks[id] <= MAX_RANK);
  const missionsValid = data?.missions && typeof data.missions === 'object' && Object.entries(data.missions).every(([id, record]) =>
    (CAMPAIGN_ORDER as readonly string[]).includes(id) && record && typeof record.firstClearPaid === 'boolean'
    && (['relaxed', 'standard', 'veteran'] as const).every(d => count(record.clears?.[d])));
  const receiptsValid = Array.isArray(data?.receipts) && data.receipts.every(r => r && typeof r.id === 'string' && count(r.total));
  if (data?.version !== 1 || !count(data.credits) || !ownedValid || !loadoutValid || !ranksValid || !missionsValid || !receiptsValid) {
    throw new Error('Unsupported campaign profile');
  }
  return data;
}

/** Which missions can be launched: Training always; each later one once the mission before it has been cleared. */
export function unlockedMissions(profile: CampaignProfile): MissionId[] {
  const open: MissionId[] = [];
  for (const [index, mission] of CAMPAIGN_ORDER.entries()) {
    if (index === 0 || cleared(profile, CAMPAIGN_ORDER[index - 1])) open.push(mission); else break;
  }
  return open;
}
export const cleared = (profile: CampaignProfile, mission: MissionId) => {
  const clears = profile.missions[mission]?.clears;
  return !!clears && clears.relaxed + clears.standard + clears.veteran > 0;
};

/** Credits an attempt banks (docs/11 §4); `firstClear` is paid only on the mission's first success. */
export function payout(profile: CampaignProfile, result: AttemptResult): Omit<Payout, 'balance' | 'unlocked' | 'repeat'> {
  const multiplier = CREDIT_MULTIPLIER[result.difficulty];
  const boss = result.outcome === 'complete' && result.bossKilled ? REWARDS.boss : 0;
  const collected = Math.max(0, Math.floor(result.credits) - (result.bossKilled ? REWARDS.boss : 0));
  if (result.outcome !== 'complete') return { collected, boss: 0, mission: 0, multiplier, firstClear: 0, total: Math.floor(multiplier * REWARDS.failureShare * collected) };
  const firstClear = profile.missions[result.mission]?.firstClearPaid ? 0 : REWARDS.firstClear;
  return { collected, boss, mission: REWARDS.success, multiplier, firstClear, total: Math.floor(multiplier * (collected + boss + REWARDS.success)) + firstClear };
}

/** The run config for a campaign launch: the mission, difficulty and the equipped loadout with its weapon's rank. */
export function campaignConfig(profile: CampaignProfile, mission: MissionId, difficulty: Difficulty, seed: number): RunConfig {
  const { weapon, special, shield, reactor } = profile.loadout;
  return { mode: 'campaign', seed, mission, difficulty, weapon, special, shield, reactor, rank: profile.ranks[weapon] };
}

export function createCampaignProfile(storage?: ProfileStorage) {
  let profile = freshProfile();
  let status: 'saved' | 'session' | 'unreadable' = storage ? 'saved' : 'session';
  const reload = () => {
    if (status !== 'saved' || !storage) return;
    try { const raw = storage.getItem(CAMPAIGN_KEY); if (raw !== null) profile = decode(raw); }
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
    /** Buys an item for its slot if affordable and not owned yet; returns whether it was bought. */
    buy(slot: Slot, id: ItemId): boolean {
      return transact(p => {
        const owned = p.owned[slot] as ItemId[], price = itemPrice(slot, id);
        if (owned.includes(id) || p.credits < price) return false;
        p.credits -= price; owned.push(id);
        return true;
      });
    },
    /** Raises an owned main weapon one rank if affordable; returns whether it was upgraded. */
    upgrade(weapon: WeaponId): boolean {
      return transact(p => {
        const rank = p.ranks[weapon], price = RANK_PRICES[rank];
        if (!p.owned.weapon.includes(weapon) || rank >= MAX_RANK || price === undefined || p.credits < price) return false;
        p.credits -= price; p.ranks[weapon] = rank + 1;
        return true;
      });
    },
    /** Equips an owned item in its slot (free). */
    equip(slot: Slot, id: ItemId): boolean {
      return transact(p => {
        if (!(p.owned[slot] as ItemId[]).includes(id)) return false;
        (p.loadout as unknown as Record<Slot, ItemId>)[slot] = id;
        return true;
      });
    },
    /** Banks one attempt exactly once (by its ID): credits, clears, best time, first-clear receipt and unlocks. */
    settle(result: AttemptResult): Payout {
      return transact(p => {
        const earlier = p.receipts.find(receipt => receipt.id === result.id);
        const pay = payout(p, result);
        if (earlier) return { ...pay, total: earlier.total, balance: p.credits, unlocked: null, repeat: true };
        const before = unlockedMissions(p);
        p.credits += pay.total;
        if (result.outcome === 'complete') {
          const record = p.missions[result.mission] ?? { clears: { relaxed: 0, standard: 0, veteran: 0 }, best: {}, firstClearPaid: false };
          record.clears[result.difficulty] += 1;
          record.best[result.difficulty] = Math.min(record.best[result.difficulty] ?? Infinity, Math.round(result.seconds * 10) / 10);
          if (pay.firstClear) record.firstClearPaid = true;
          p.missions[result.mission] = record;
        }
        p.receipts = [{ id: result.id, total: pay.total }, ...p.receipts].slice(0, RECEIPT_LIMIT);
        const unlocked = unlockedMissions(p).find(mission => !before.includes(mission)) ?? null;
        return { ...pay, balance: p.credits, unlocked, repeat: false };
      });
    },
  };
}
export type CampaignProfileStore = ReturnType<typeof createCampaignProfile>;
