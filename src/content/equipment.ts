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
 * Main weapon ranks 0–3 raise the rate of fire, up to double at rank 3 (×1.33, ×1.67, ×2; user request, 16 October
 * 2026, replacing +8% damage per rank). Campaign only. `RANK_PRICES[r]` buys rank r + 1 for one weapon.
 */
export const RANK_PRICES = [150, 300, 500] as const;
export const MAX_RANK = RANK_PRICES.length;
export const rankFireRate = (rank: number) => 1 + Math.max(0, Math.min(MAX_RANK, Math.floor(rank))) / MAX_RANK;

/**
 * Specials: one activation per full recharge (time plus 3% per main-weapon kill, BALANCE.special.killCharge).
 * - Shockwave: a ring expanding from the ship: up to 180 damage to each target it reaches (less the further away)
 *   and clears hostile shots near the ship; 1 s invulnerability.
 * - Seeker Rack: eight missiles fan out, then accelerate and home on targets ahead (40 damage each); no clear.
 * - Siege Lance: a 0.9-wide piercing beam straight ahead from the ship for 2.4 s at 360 damage/s; the ship may steer
 *   it (0.8 s at 450/s until the user found it too short, 16 October).
 */
export const SPECIALS = {
  // Falloff (user, 17 October: too strong next to Seeker Rack): full damage within `full`, fading linearly to `minShare`
  // at `reach`; it clears hostile shots only within `clear` of the ship.
  shockwave: { label: 'Shockwave', recharge: 45, price: 0, blurb: 'A ring bursts out from your ship: it clears nearby shots and hits hardest up close.', speed: 26, reach: 20, full: 3, minShare: 0.2, clear: 8 },
  'seeker-rack': { label: 'Seeker Rack', recharge: 35, price: 300, blurb: 'Eight homing missiles at targets ahead.', missiles: 8, damage: 40, launchSpeed: 5, speed: 21, accel: 34, turn: 4.5 },
  'siege-lance': { label: 'Siege Lance', recharge: 40, price: 400, blurb: 'A piercing beam straight ahead. Steer it.', width: 0.9, duration: 2.4, dps: 360 },
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
// Brood Strike (Amnion, docs/27) opens once Deep Bloom is cleared; Final Horizon (Umbra, docs/28) is the final mission since
// 24 October and opens once Brood Strike is cleared.
export const CAMPAIGN_ORDER: readonly MissionId[] = ['training', 'bastion', 'cold-vector', 'deep-bloom', 'brood-strike', 'final-horizon'];

/**
 * Mission income (docs/11 §4), all scaled by `scale` (halved on 16 October: the user found the payout too high). With
 * C = collected credits, B = the boss reward (already in the run's credits when the boss falls), M = the difficulty
 * multiplier and S = scale:
 * - success: floor(S × M × (C + B + success)) + floor(S × firstClear) once per mission;
 * - failure or abandon: floor(S × M × failureShare × C).
 */
export const REWARDS = { success: 80, boss: 60, firstClear: 150, failureShare: 0.5, scale: 0.5 } as const;
export const CREDIT_MULTIPLIER: Readonly<Record<Difficulty, number>> = { relaxed: 0.85, standard: 1, veteran: 1.2 };
