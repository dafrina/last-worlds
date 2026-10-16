import type { Difficulty, MissionId, ReactorId, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';

/**
 * Campaign equipment and economy (docs/02 §4–5, docs/11 §3–4, docs/21). The single runtime source for the four
 * slots (main weapon, special, shield technology, reactor technology), prices, weapon ranks and mission rewards.
 * Endless never reads the campaign choices: every endless run starts with the canonical starter.
 */

/** The canonical starter: every endless run, and a fresh campaign profile. */
export const STARTER = { weapon: 'pulse', special: 'shockwave', shield: 'standard', reactor: 'balanced' } as const satisfies Loadout;
export interface Loadout { weapon: WeaponId; special: SpecialId; shield: ShieldTechId; reactor: ReactorId }

/** Main weapons: campaign prices (stats live in WEAPONS, src/content/balance.ts). */
export const WEAPON_PRICES: Readonly<Record<WeaponId, number>> = { pulse: 0, fan: 250, seeker: 450 };
export const WEAPON_BLURB: Readonly<Record<WeaponId, string>> = {
  pulse: 'Twin straight bolts. Narrow, quick and reliable.',
  fan: 'Five fixed pellets in a fan. Wide close coverage.',
  seeker: 'Paired homing shots on targets ahead.',
};

/**
 * Main weapon ranks 0–3: each adds 8% of base damage (rank 3 = ×1.24), campaign only. `RANK_PRICES[r]` buys rank
 * r + 1 for one weapon.
 */
export const RANK_STEP = 0.08;
export const RANK_PRICES = [150, 300, 500] as const;
export const MAX_RANK = RANK_PRICES.length;
export const rankDamage = (rank: number) => 1 + RANK_STEP * Math.max(0, Math.min(MAX_RANK, Math.floor(rank)));

/**
 * Specials: one activation per full recharge (time plus 3% per main-weapon kill, BALANCE.special.killCharge).
 * - Shockwave: clears hostile shots in view, 180 damage to every target in view, 1 s invulnerability.
 * - Seeker Rack: eight homing missiles × 40 damage at targets ahead; no clear, no invulnerability.
 * - Siege Lance: a 0.9-wide piercing beam straight ahead from the ship for 0.8 s at 450 damage/s; the ship may move.
 */
export const SPECIALS = {
  shockwave: { label: 'Shockwave', recharge: 45, price: 0, blurb: 'Clears shots in view and hits everything on screen.' },
  'seeker-rack': { label: 'Seeker Rack', recharge: 35, price: 300, blurb: 'Eight homing missiles at targets ahead.', missiles: 8, damage: 40, speed: 15 },
  'siege-lance': { label: 'Siege Lance', recharge: 40, price: 400, blurb: 'A piercing beam straight ahead. Steer it.', width: 0.9, duration: 0.8, dps: 450 },
} as const satisfies Readonly<Record<SpecialId, { label: string; recharge: number; price: number; blurb: string; [tuning: string]: string | number }>>;

/** Shield technology: charge reserve and what a shield cell restores. None regenerates passively. */
export const SHIELD_TECH = {
  standard: { label: 'Standard Array', charges: 3, cell: 1, price: 0, blurb: 'Three charges. A cell restores one.' },
  bulwark: { label: 'Bulwark Array', charges: 4, cell: 1, price: 250, blurb: 'Four charges. A cell restores one.' },
  flux: { label: 'Flux Array', charges: 2, cell: 2, price: 250, blurb: 'Two charges. A cell restores both.' },
} as const satisfies Readonly<Record<ShieldTechId, { label: string; charges: number; cell: number; price: number; blurb: string }>>;

/** Reactor technology (handling at campaign pace 1): top lateral speed (units/s), acceleration and braking (units/s²). */
export const REACTORS = {
  balanced: { label: 'Balanced Drive', speed: 12, acceleration: 90, braking: 125, price: 0, blurb: 'The baseline feel.' },
  vector: { label: 'Vector Drive', speed: 14, acceleration: 75, braking: 105, price: 250, blurb: 'Faster traversal; plan your stops.' },
  precision: { label: 'Precision Drive', speed: 11, acceleration: 115, braking: 170, price: 250, blurb: 'Lower top speed; snappy start and stop.' },
} as const satisfies Readonly<Record<ReactorId, { label: string; speed: number; acceleration: number; braking: number; price: number; blurb: string }>>;

export const WEAPON_IDS: readonly WeaponId[] = ['pulse', 'fan', 'seeker'];
export const SPECIAL_IDS = Object.keys(SPECIALS) as SpecialId[];
export const SHIELD_IDS = Object.keys(SHIELD_TECH) as ShieldTechId[];
export const REACTOR_IDS = Object.keys(REACTORS) as ReactorId[];

/** Campaign missions in unlock order: clearing one (on any difficulty) unlocks the next. */
export const CAMPAIGN_ORDER: readonly MissionId[] = ['training', 'bastion', 'cold-vector', 'deep-bloom'];

/**
 * Mission income (docs/11 §4). With C = collected credits, B = the boss reward (already banked in the run's credits
 * when the boss falls) and M = the difficulty multiplier:
 * - success: floor(M × (C + B + success)) + firstClear once per mission;
 * - failure or abandon: floor(M × failureShare × C).
 */
export const REWARDS = { success: 80, boss: 60, firstClear: 150, failureShare: 0.5 } as const;
export const CREDIT_MULTIPLIER: Readonly<Record<Difficulty, number>> = { relaxed: 0.85, standard: 1, veteran: 1.2 };
