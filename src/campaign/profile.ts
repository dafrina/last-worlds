import { CAMPAIGN_ORDER, CREDIT_MULTIPLIER, MAX_RANK, RANK_PRICES, SHIPS, SHIP_IDS, SHIP_PART_NAMES, REWARDS, SHIELD_IDS, SHIELD_TECH, SPECIALS, SPECIAL_IDS, STARTER, WEAPON_IDS, WEAPON_PRICES, type Loadout } from '../content/equipment';
import type { Difficulty, MissionId, ShipId, RunConfig, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';

/**
 * Campaign progression (docs/21): one local profile with the credit balance, owned equipment, main-weapon ranks,
 * the equipped four-slot loadout, mission clears (which unlock the next mission) and banked attempt receipts.
 * Campaign only: endless never reads or writes it. Every change re-reads storage first and writes the whole profile;
 * banking an attempt is idempotent by attempt ID. An unreadable or unknown save is never overwritten: the profile
 * then runs in memory for the session and says so.
 */
export const CAMPAIGN_KEY = 'last-worlds.campaign.v1';
export const CAMPAIGN_BACKUP_KEY = 'last-worlds.campaign.v1.backup';
export type Slot = 'weapon' | 'special' | 'shield' | 'ship';
export type ItemId = WeaponId | SpecialId | ShieldTechId | ShipId;
export interface MissionRecord { clears: Record<Difficulty, number>; best: Partial<Record<Difficulty, number>>; firstClearPaid: boolean }
export interface CampaignProfile {
  version: 2;
  credits: number;
  owned: { weapon: WeaponId[]; special: SpecialId[]; shield: ShieldTechId[]; ship: ShipId[] };
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
  balance: number; unlocked: MissionId | null; repeat: boolean; salvage: string[];
}

const RECEIPT_LIMIT = 200;
export const SLOT_ITEMS: { readonly [S in Slot]: readonly Loadout[S][] } = { weapon: WEAPON_IDS, special: SPECIAL_IDS, shield: SHIELD_IDS, ship: SHIP_IDS };
export function itemPrice(slot: Slot, id: ItemId): number {
  return slot === 'weapon' ? WEAPON_PRICES[id as WeaponId] : slot === 'special' ? SPECIALS[id as SpecialId].price
    : slot === 'shield' ? SHIELD_TECH[id as ShieldTechId].price : 0;
}

export function freshProfile(): CampaignProfile {
  return {
    version: 2, credits: 0,
    owned: { weapon: [STARTER.weapon], special: [STARTER.special], shield: [STARTER.shield], ship: [STARTER.ship] },
    ranks: { pulse: 0, fan: 0, seeker: 0 }, loadout: { ...STARTER }, missions: {}, receipts: [],
  };
}

const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
function decode(raw: string): CampaignProfile {
  const data = JSON.parse(raw) as CampaignProfile;
  const legacy = (data.version as number) === 1;
  const slots = legacy ? { weapon: WEAPON_IDS, special: SPECIAL_IDS, shield: ['standard', 'bulwark', 'flux'], reactor: ['balanced', 'vector', 'precision'] } : SLOT_ITEMS;
  const defaults = legacy ? { ...STARTER, reactor: 'balanced' } : STARTER;
  const savedOwned = data?.owned as unknown as Record<string, string[]>;
  const savedLoadout = data?.loadout as unknown as Record<string, string>;
  const ownedValid = savedOwned && Object.entries(slots).every(([slot, ids]) => Array.isArray(savedOwned[slot])
    && savedOwned[slot].every(id => (ids as readonly string[]).includes(id))
    && savedOwned[slot].includes((defaults as Record<string, string>)[slot]));
  const loadoutValid = ownedValid && savedLoadout && Object.keys(slots).every(slot => savedOwned[slot].includes(savedLoadout[slot]));
  const ranksValid = data?.ranks && WEAPON_IDS.every(id => count(data.ranks[id]) && data.ranks[id] <= (legacy ? 3 : MAX_RANK));
  const missionsValid = data?.missions && typeof data.missions === 'object' && Object.entries(data.missions).every(([id, record]) =>
    (CAMPAIGN_ORDER as readonly string[]).includes(id) && record && typeof record.firstClearPaid === 'boolean'
    && (['relaxed', 'standard', 'veteran'] as const).every(d => count(record.clears?.[d])));
  const receiptsValid = Array.isArray(data?.receipts) && data.receipts.every(r => r && typeof r.id === 'string' && count(r.total));
  if ((!legacy && data?.version !== 2) || !count(data.credits) || !ownedValid || !loadoutValid || !ranksValid || !missionsValid || !receiptsValid) {
    throw new Error('Unsupported campaign profile');
  }
  if (!legacy) return data;
  // Keep all records/receipts and every still-supported purchase. Retired purchases are refunded exactly once.
  const migrated = structuredClone(data);
  migrated.version = 2;
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

/** Parts derive from persisted clears: no duplicate drops, separate currency or retroactive random rolls. */
export function shipParts(profile: CampaignProfile, ship: ShipId) {
  return SHIPS[ship].parts.map((mission, index) => ({ name: SHIP_PART_NAMES[index], mission, collected: cleared(profile, mission) }));
}

/** Credits an attempt banks (docs/11 §4); `firstClear` is paid only on the mission's first success. */
export function payout(profile: CampaignProfile, result: AttemptResult): Omit<Payout, 'balance' | 'unlocked' | 'repeat' | 'salvage'> {
  const multiplier = CREDIT_MULTIPLIER[result.difficulty];
  const boss = result.outcome === 'complete' && result.bossKilled ? REWARDS.boss : 0;
  const collected = Math.max(0, Math.floor(result.credits) - (result.bossKilled ? REWARDS.boss : 0));
  // The breakdown shows the rewards as paid (scaled); the run's collected credits are scaled the same way.
  const scale = REWARDS.scale, shown = Math.floor(collected * scale);
  if (result.outcome !== 'complete') return { collected: shown, boss: 0, mission: 0, multiplier, firstClear: 0, total: Math.floor(scale * multiplier * REWARDS.failureShare * collected) };
  const firstClear = profile.missions[result.mission]?.firstClearPaid ? 0 : Math.floor(scale * REWARDS.firstClear);
  return { collected: shown, boss: Math.floor(boss * scale), mission: Math.floor(REWARDS.success * scale), multiplier, firstClear, total: Math.floor(scale * multiplier * (collected + boss + REWARDS.success)) + firstClear };
}

/** The run config for a campaign launch: the mission, difficulty and the equipped loadout with its weapon's rank. */
export function campaignConfig(profile: CampaignProfile, mission: MissionId, difficulty: Difficulty, seed: number): RunConfig {
  const { weapon, special, shield, ship } = profile.loadout;
  return { mode: 'campaign', seed, mission, difficulty, weapon, special, shield, ship, rank: profile.ranks[weapon] };
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
        if (JSON.parse(raw).version === 1) {
          // Do not replace the original unless an exact backup was safely stored first.
          try {
            if (storage.getItem(CAMPAIGN_BACKUP_KEY) === null) storage.setItem(CAMPAIGN_BACKUP_KEY, raw);
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
    /** Buys an item for its slot if affordable and not owned yet; returns whether it was bought. */
    buy(slot: Slot, id: ItemId): boolean {
      return transact(p => {
        if (!(SLOT_ITEMS[slot] as readonly string[]).includes(id) || slot === 'ship') return false;
        if (slot === 'shield' && id === 'aegis' && !p.owned.shield.includes('bulwark')) return false;
        const owned = p.owned[slot] as ItemId[], price = itemPrice(slot, id);
        if (owned.includes(id) || p.credits < price) return false;
        p.credits -= price; owned.push(id);
        return true;
      });
    },
    /** Assemble a chassis after collecting all three named parts. No credit cost and no duplicate rewards. */
    assemble(ship: ShipId): boolean {
      return transact(p => {
        if (!SHIP_IDS.includes(ship) || p.owned.ship.includes(ship) || !shipParts(p, ship).every(part => part.collected)) return false;
        p.owned.ship.push(ship);
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
        if (earlier) return { ...pay, total: earlier.total, balance: p.credits, unlocked: null, repeat: true, salvage: [] };
        const before = unlockedMissions(p);
        const salvage = result.outcome === 'complete' && !cleared(p, result.mission)
          ? SHIP_IDS.flatMap(ship => shipParts(p, ship).filter(part => part.mission === result.mission).map(part => `${SHIPS[ship].label} ${part.name}`)) : [];
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
        return { ...pay, balance: p.credits, unlocked, repeat: false, salvage };
      });
    },
  };
}
export type CampaignProfileStore = ReturnType<typeof createCampaignProfile>;
