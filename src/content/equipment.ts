import type { Difficulty, MissionId, ShipId, ShieldTechId, SpecialId, WeaponId } from '../shared/contracts';

/**
 * Campaign equipment and economy (docs/02 §4–5, docs/11 §3–4, docs/21, docs/30). The single runtime source for the four
 * slots (main weapon, special, shield array, ship chassis), prices, weapon ranks and mission rewards.
 * Endless never reads the campaign choices: every endless run starts with the canonical starter.
 */

/**
 * A fresh campaign profile's gear. Homing missiles (the Seeker Rack) became the free starting special on 3 November 2026
 * (user: "Homing Missiles free"); the Shockwave is bought in the campaign.
 */
export const STARTER = { weapon: 'pulse', special: 'seeker-rack', shield: 'standard', ship: 'scrapper' } as const satisfies Loadout;
/**
 * Every endless run's gear (the ship is the player's choice). Endless keeps the Shockwave, its shot clearing and its
 * moment of invulnerability (user, 3 November: "Keep Shockwave"), so the campaign's new starter leaves endless as it was.
 */
export const ENDLESS_LOADOUT = { ...STARTER, special: 'shockwave' } as const satisfies Loadout;
export interface Loadout { weapon: WeaponId; special: SpecialId; shield: ShieldTechId; ship: ShipId }

/**
 * A campaign price in both currencies (user, 3 November 2026): buying needs enough of each and takes both at once. Parts
 * are the rare second currency, from strike sites (docs/33).
 */
export interface Price { credits: number; parts: number }

/** Main weapons: campaign prices in credits, no parts (user, 3 November 2026; stats live in WEAPONS, src/content/balance.ts). */
export const WEAPON_PRICES: Readonly<Record<WeaponId, number>> = { pulse: 0, fan: 250, seeker: 250, rail: 250 };
export const WEAPON_BLURB: Readonly<Record<WeaponId, string>> = {
  pulse: 'Twin straight bolts. Narrow, quick and reliable.',
  fan: 'Five fixed pellets in a fan. Wide close coverage.',
  seeker: 'Alternating homing missiles on targets ahead.',
  rail: 'A heavy slug that pierces every enemy in its line. Slow: line them up.',
};

/**
 * Four purchased campaign upgrades per weapon (levels 2-5), the same for every main weapon; endless earns the same tiers
 * from pickups. User, 3 November 2026: credits `RANK_PRICES` plus parts `RANK_PARTS` (both consumed) for the steps 1→2,
 * 2→3, 3→4 and 4→5: 250 + 0, 500 + 3, 750 + 5 and 1,000 + 10. A whole weapon costs 2,500 credits and 18 parts, about two
 * and a half campaign loops of repeat clears (docs/30 § Income).
 */
export const RANK_PRICES = [250, 500, 750, 1000] as const;
export const RANK_PARTS = [0, 3, 5, 10] as const;
export const MAX_RANK = RANK_PRICES.length;
/**
 * Endless: power cells (or duplicate weapons) a step to the next tier takes, from tier 1 up: tiers 2 and 3 take one each,
 * tiers 4 and 5 two each (user, 31 October: "Two cells per tier"; with one, every test run reached tier 5 after about four
 * minutes and the Bastion-9 and Helion Ark fights took half as long).
 */
export const ENDLESS_TIER_CELLS = [1, 1, 2, 2] as const;
export const weaponRank = (rank: number) => Number.isFinite(rank) ? Math.max(0, Math.min(MAX_RANK, Math.floor(rank))) : 0;
export const WEAPON_TIERS: Readonly<Record<WeaponId, readonly string[]>> = {
  pulse: ['Twin bolts', 'Rapid twin bolts', 'Four-shot burst', 'Rapid four-shot burst', 'Four-stream burst'],
  fan: ['Five-pellet fan', 'Nine-pellet fan', 'Rapid nine-pellet fan', 'Faster nine-pellet fan', 'Rapid eleven-pellet fan'],
  seeker: ['Alternating missiles', 'Paired missiles', 'Four-missile burst', 'Rapid four-missile burst', 'Six-missile salvo'],
  rail: ['One slug every 0.5 s', 'One slug every 1/3 s', 'Twin slugs every 0.45 s', 'Twin slugs every 1/3 s', 'Four slugs every 0.27 s'],
};

/**
 * Specials: one activation per full recharge (time plus 3% per main-weapon kill, BALANCE.special.killCharge). Campaign
 * prices (user, 3 November 2026): `price` credits plus `parts`; the Seeker Rack is the free starter.
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
  // Hangar order (user, 6 November): Seeker Rack first, Shockwave, the most valuable, last at 450 (was 350); Seeker Rack
  // recharges in 40 s (was 35).
  'seeker-rack': { label: 'Seeker Rack', recharge: 40, price: 0, parts: 0, blurb: 'Eight homing missiles at targets ahead.', missiles: 8, damage: 40, launchSpeed: 9, speed: 21, accel: 34, turn: 4.5, spreadTime: .3 },
  'siege-lance': { label: 'Siege Lance', recharge: 40, price: 250, parts: 1, blurb: 'A piercing beam straight ahead. Steer it.', width: 0.9, duration: 2.4, dps: 360 },
  'gravity-well': { label: 'Gravity Well', recharge: 40, price: 350, parts: 1, blurb: 'A singularity ahead pulls enemies together and swallows their shots, then collapses.',
    // User, 28 October: "the radius should be bigger and sucking in ships" (was pull 4.5 at up to 4/s, core 1.6, swallow 3.5).
    ahead: 9, arm: 0.35, duration: 2.6, pullRadius: 7, pullSpeed: 7, coreRadius: 2, dps: 40, swallowRadius: 4.5, collapse: 200, collapseRadius: 3.5, collapseEdge: 0.5 },
  // Falloff (user, 17 October: too strong next to Seeker Rack): full damage within `full`, fading linearly to `minShare`
  // at `reach`; it clears hostile shots only within `clear` of the ship.
  shockwave: { label: 'Shockwave', recharge: 45, price: 450, parts: 1, blurb: 'A ring bursts out from your ship: it clears nearby shots and hits hardest up close.', speed: 26, reach: 20, full: 3, minShare: 0.2, clear: 8 },
} as const satisfies Readonly<Record<SpecialId, { label: string; recharge: number; price: number; parts: number; blurb: string; [tuning: string]: string | number }>>;

/** All ships can collect up to five shields. Equipment changes the starting reserve only. */
export const MAX_SHIELDS = 5;
export const SHIELD_TECH = {
  standard: { label: 'Standard Array', charges: 3, cell: 1, price: 0, blurb: 'Start with three shields. Pickups fill to five.' },
  bulwark: { label: 'Bulwark Array', charges: 4, cell: 1, price: 250, blurb: 'Start with four shields. Pickups fill to five.' },
  aegis: { label: 'Aegis Array', charges: 5, cell: 1, price: 400, blurb: 'Start with all five shields.' },
} as const satisfies Readonly<Record<ShieldTechId, { label: string; charges: number; cell: number; price: number; blurb: string }>>;

export interface ShipSpec {
  label: string; blurb: string; model: string;
  extraLives: number; pickupReach: number; perk: string;
  /**
   * Campaign price: `price` credits plus `parts` (user, 3 November 2026: "lets make it 4 since its 4 parts of a ship";
   * this replaced the three mission-clear chassis pieces and their assembly).
   */
  price: number; parts: number;
}
/** Global chassis perks. Part designs remain cosmetic; ordinary handling and hit regions are shared. */
export const SHIPS: Readonly<Record<ShipId, ShipSpec>> = {
  scrapper: { label: 'Scrapper', perk: 'Salvage Rig', blurb: '40% wider pickup attraction. Active in both modes.', model: 'shared/hero-scrapper.glb', extraLives: 0, pickupReach: 1.4, price: 0, parts: 0 },
  ironclad: { label: 'Ironclad', perk: 'Reserve Life', blurb: 'One extra starting life. Active in both modes.', model: 'shared/hero-scrapper.glb', extraLives: 1, pickupReach: 1, price: 0, parts: 4 },
  interceptor: { label: 'Interceptor', perk: 'Barrel Roll', blurb: 'Double-tap a steering side (or A/D or arrow key) to roll sideways out of the line of fire. 3 s cooldown. Active in both modes.', model: 'shared/hero-scrapper.glb', extraLives: 0, pickupReach: 1, price: 0, parts: 4 },
  spectre: { label: 'Spectre', perk: 'Gravitic Shield', blurb: 'While shielded, a near-miss bullet curves around your shield and returns fire. One at a time; 1.2 s cooldown. Direct hits and beams still hurt. Active in both modes.', model: 'shared/hero-scrapper.glb', extraLives: 0, pickupReach: 1, price: 0, parts: 4 },
};

export const WEAPON_IDS: readonly WeaponId[] = ['pulse', 'fan', 'seeker', 'rail'];
export const SPECIAL_IDS = Object.keys(SPECIALS) as SpecialId[];
export const SHIELD_IDS = Object.keys(SHIELD_TECH) as ShieldTechId[];
export const SHIP_IDS = Object.keys(SHIPS) as ShipId[];

/** Campaign missions in unlock order: clearing one (on any difficulty) unlocks the next. */
// Brood Strike (Amnion, docs/27) opens once Deep Bloom is cleared; Final Horizon (Umbra, docs/28) is the final mission since
// 24 October and opens once Brood Strike is cleared.
export const CAMPAIGN_ORDER: readonly MissionId[] = ['training', 'bastion', 'cold-vector', 'deep-bloom', 'brood-strike', 'dying-star', 'final-horizon'];

/**
 * Mission income (docs/11 §4, docs/30 § Income). With C = collected credits (enemy drops, strike-site loot, full-shield
 * cells), B = the boss reward (already in the run's credits when the boss falls), M = the difficulty multiplier and
 * S = the mission's CREDIT_SCALE:
 * - success: floor(S × M × (C + B + success)) + firstClear once per mission;
 * - failure or abandon: floor(S × M × failureShare × C).
 * The in-run values (enemy credits, site loot, the boss's 60) are unchanged: each world's scale sets what a run pays.
 */
export const REWARDS = { success: 80, boss: 60, firstClear: 75, failureShare: 0.5 } as const;
/**
 * Per-world credit scale (user's targets, 3 November 2026: 80 / 100 / 150 / 200 / 250-270 / 250-270 per repeat Standard
 * run on Luna / Khepri / Vesper / Nacre / Amnion / Umbra). Measured, perfect pilot collecting drops, tier-1 Twin Pulse,
 * seeds 1-12: 80 / 100 / 148 / 200 / 256 / 259, 1,043 for the six (tests/sim/weapon-tier-report.test.ts `mission:<id>`
 * reproduces them; docs/30 § Income). It replaced one global ×0.5 (16 October): 166 / 179 / 247 / 209 / 214 / 236.
 */
export const CREDIT_SCALE: Readonly<Record<MissionId, number>> = {
  // Repeatable campaign payout (first clears and side missions pay separately). 7 November: 80% of the 3 November scales.
  // 10 November (late-world curve): the last three worlds pay in campaign order; Amnion 0.48 → 0.41, Corona 0.44 → 0.425,
  // Umbra 0.44 → 0.45.
  training: 0.192, bastion: 0.224, 'cold-vector': 0.24, 'deep-bloom': 0.384, 'brood-strike': 0.410, 'dying-star': 0.425, 'final-horizon': 0.450,
};
export const CREDIT_MULTIPLIER: Readonly<Record<Difficulty, number>> = { relaxed: 0.85, standard: 1, veteran: 1.2 };
