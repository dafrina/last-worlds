import type { Difficulty, MissionId, ShipId, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';

/**
 * Campaign equipment and economy (docs/02 §4–5, docs/11 §3–4, docs/21). The single runtime source for the four
 * slots (main weapon, special, shield array, ship chassis), prices, weapon ranks and mission rewards.
 * Endless never reads the campaign choices: every endless run starts with the canonical starter.
 */

/** The canonical starter: every endless run, and a fresh campaign profile. */
export const STARTER = { weapon: 'pulse', special: 'shockwave', shield: 'standard', ship: 'scrapper' } as const satisfies Loadout;
export interface Loadout { weapon: WeaponId; special: SpecialId; shield: ShieldTechId; ship: ShipId }

/** Main weapons: campaign prices (stats live in WEAPONS, src/content/balance.ts). */
export const WEAPON_PRICES: Readonly<Record<WeaponId, number>> = { pulse: 0, fan: 250, seeker: 450, rail: 600 };
export const WEAPON_BLURB: Readonly<Record<WeaponId, string>> = {
  pulse: 'Twin straight bolts. Narrow, quick and reliable.',
  fan: 'Five fixed pellets in a fan. Wide close coverage.',
  seeker: 'Alternating homing missiles on targets ahead.',
  rail: 'A heavy slug that pierces every enemy in its line. Slow: line them up.',
};

/** Two purchased campaign upgrades; endless earns the same tiers from pickups. */
export const RANK_PRICES = [150, 300] as const;
export const MAX_RANK = RANK_PRICES.length;
export const weaponRank = (rank: number) => Number.isFinite(rank) ? Math.max(0, Math.min(MAX_RANK, Math.floor(rank))) : 0;
export const WEAPON_TIERS: Readonly<Record<WeaponId, readonly string[]>> = {
  pulse: ['Twin bolts', 'Rapid twin bolts', 'Four-shot burst'],
  fan: ['Five-pellet fan', 'Nine-pellet fan', 'Rapid nine-pellet fan'],
  seeker: ['Alternating missiles', 'Paired missiles', 'Four-missile burst'],
  rail: ['One slug every 0.5 s', 'One slug every 1/3 s', 'Twin slugs every 0.45 s'],
};

/**
 * Specials: one activation per full recharge (time plus 3% per main-weapon kill, BALANCE.special.killCharge).
 * - Shockwave: a ring expanding from the ship: up to 180 damage to each target it reaches (less the further away)
 *   and clears hostile shots near the ship; 1 s invulnerability.
 * - Seeker Rack: eight missiles fan out, then accelerate and home on targets ahead (40 damage each); no clear.
 * - Siege Lance: a 0.9-wide piercing beam straight ahead from the ship for 2.4 s at 360 damage/s; the ship may steer
 *   it (0.8 s at 450/s until the user found it too short, 16 October).
 * - Gravity Well (docs/32 §2): a singularity `ahead` of the ship, fixed in the world. After `arm` s it pulls free air
 *   craft within `pullRadius` (`pullSpeed` near its centre, easing off toward the edge), burns those within `coreRadius` at `dps` (they cannot
 *   start an attack there) and removes hostile shots within `swallowRadius`, for `duration` s; then it collapses:
 *   `collapse` damage within `collapseRadius`, falling to `collapseEdge` of it at the edge.
 */
export const SPECIALS = {
  // Falloff (user, 17 October: too strong next to Seeker Rack): full damage within `full`, fading linearly to `minShare`
  // at `reach`; it clears hostile shots only within `clear` of the ship.
  shockwave: { label: 'Shockwave', recharge: 45, price: 0, blurb: 'A ring bursts out from your ship: it clears nearby shots and hits hardest up close.', speed: 26, reach: 20, full: 3, minShare: 0.2, clear: 8 },
  'seeker-rack': { label: 'Seeker Rack', recharge: 35, price: 300, blurb: 'Eight homing missiles at targets ahead.', missiles: 8, damage: 40, launchSpeed: 9, speed: 21, accel: 34, turn: 4.5, spreadTime: .3 },
  'siege-lance': { label: 'Siege Lance', recharge: 40, price: 400, blurb: 'A piercing beam straight ahead. Steer it.', width: 0.9, duration: 2.4, dps: 360 },
  'gravity-well': { label: 'Gravity Well', recharge: 40, price: 450, blurb: 'A singularity ahead pulls enemies together and swallows their shots, then collapses.',
    // User, 28 October: "the radius should be bigger and sucking in ships" (was pull 4.5 at up to 4/s, core 1.6, swallow 3.5).
    ahead: 9, arm: 0.35, duration: 2.6, pullRadius: 7, pullSpeed: 7, coreRadius: 2, dps: 40, swallowRadius: 4.5, collapse: 200, collapseRadius: 3.5, collapseEdge: 0.5 },
} as const satisfies Readonly<Record<SpecialId, { label: string; recharge: number; price: number; blurb: string; [tuning: string]: string | number }>>;

/** All ships can collect up to five shields. Equipment changes the starting reserve only. */
export const MAX_SHIELDS = 5;
export const SHIELD_TECH = {
  standard: { label: 'Standard Array', charges: 3, cell: 1, price: 0, blurb: 'Start with three shields. Pickups fill to five.' },
  bulwark: { label: 'Bulwark Array', charges: 4, cell: 1, price: 250, blurb: 'Start with four shields. Pickups fill to five.' },
  aegis: { label: 'Aegis Array', charges: 5, cell: 1, price: 400, blurb: 'Start with all five shields.' },
} as const satisfies Readonly<Record<ShieldTechId, { label: string; charges: number; cell: number; price: number; blurb: string }>>;

export interface ShipSpec {
  label: string; blurb: string; model: string;
  extraLives: number; pickupReach: number; killCharge: number; overdrive: number;
  /** Frame, propulsion and core respectively. One guaranteed part per listed mission clear, any difficulty. */
  parts: readonly MissionId[];
}
/** Shared art is intentional for this progression slice. All chassis use identical handling and hit regions. */
export const SHIPS: Readonly<Record<ShipId, ShipSpec>> = {
  scrapper: { label: 'Scrapper', blurb: 'Salvage rig · 40% wider pickup attraction.', model: 'shared/hero-scrapper.glb', extraLives: 0, pickupReach: 1.4, killCharge: 1, overdrive: 0, parts: [] },
  ironclad: { label: 'Ironclad', blurb: 'Reserve fighter · one extra starting life.', model: 'shared/hero-scrapper.glb', extraLives: 1, pickupReach: 1, killCharge: 1, overdrive: 0, parts: ['training', 'bastion', 'cold-vector'] },
  interceptor: { label: 'Interceptor', blurb: 'Assault core · 50% more special charge from main-weapon kills.', model: 'shared/hero-scrapper.glb', extraLives: 0, pickupReach: 1, killCharge: 1.5, overdrive: 0, parts: ['bastion', 'cold-vector', 'deep-bloom'] },
  spectre: { label: 'Spectre', blurb: 'Alien core · specials boost main firing rate 25% for three seconds.', model: 'shared/hero-scrapper.glb', extraLives: 0, pickupReach: 1, killCharge: 1, overdrive: 3, parts: ['deep-bloom', 'brood-strike', 'final-horizon'] },
};
export const SHIP_PART_NAMES = ['Frame', 'Propulsion', 'Core'] as const;

export const WEAPON_IDS: readonly WeaponId[] = ['pulse', 'fan', 'seeker', 'rail'];
export const SPECIAL_IDS = Object.keys(SPECIALS) as SpecialId[];
export const SHIELD_IDS = Object.keys(SHIELD_TECH) as ShieldTechId[];
export const SHIP_IDS = Object.keys(SHIPS) as ShipId[];

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
