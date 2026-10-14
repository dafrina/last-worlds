import { VIEW, type Difficulty, type EnemyKind, type WeaponId } from '../shared/contracts';
import type { FormationRank } from './formations';

/** Authoritative tuning for the flight prototype. Full-release docs remain proposals. */
export const BALANCE = {
  campaignDuration: 120,
  sectorDuration: 90,
  maxEnemies: 24,
  maxProjectiles: 520,
  maxPickups: 40,
  maxEffects: 70,
  /** Balanced Drive. Raised 20-30% on 14 October 2026 with the faster scroll (was 10 / 70 / 100). */
  movement: { speed: 12, acceleration: 90, braking: 125 },
  /** Follows faster than the fastest proposed drive (Vector, 14 units/s). */
  camera: { deadZone: 2.5, speed: 17 },
  shield: { charges: 3, hitInvulnerability: 0.65 },
  shieldSupplies: {
    campaign: { relaxed: [40, 85], standard: [40, 85], veteran: [65] },
    endlessAt: 55,
    forward: 12,
    viewMargin: 1,
  },
  respawn: { invulnerability: 2, specialCharge: 0.5 },
  special: { rechargeTime: 45, killCharge: 0.03, damage: 180, invulnerability: 1 },
  /** Pickups drift toward the player row with the terrain scroll; the magnet pulls at `magnetSpeed`. */
  pickup: { radius: 0.65, magnetRadius: 1.6, speed: VIEW.scrollSpeed, magnetSpeed: 7.5 },
  power: [1, 1.15, 1.35, 1.55, 1.8],
} as const;

/**
 * Fairness floors for left/right-only movement (docs/03 §7). The director, the offline validator and the
 * scripted pilots read these values; none of them may be loosened to make content fit.
 */
export const FAIRNESS = {
  warningFloor: 0.65,
  beamWarningFloor: 0.9,
  lockFloor: 0.3,
  /** Physical clear gap between hazard edges at the player row, including collider and both comfort margins. */
  minGap: 1.4,
  comfortMargin: 0.15,
  /** Width of each strip (both view edges and the center) that may never be sealed at the same time. */
  sealStrip: 1.4,
  /** Hazards crossing the player row within this many seconds of each other count as simultaneous. */
  window: 0.25,
  reaction: 0.2,
  /** Conservative lateral speed (80% of the drive's top speed) and maneuver delay for the director's reachability check. */
  effectiveSpeed: 0.8 * BALANCE.movement.speed,
  maneuverDelay: 0.15,
  horizon: 4.5,
  slice: 0.05,
  /** A windup rejected by the director is retried after this delay; the bullet pattern itself is never edited. */
  retryDelay: 0.25,
} as const;

export interface DifficultyScale {
  lives: number;
  /** Enemy HP multiplier. */
  hp: number;
  /** Hostile shot speed multiplier. */
  shotSpeed: number;
  /** Seconds added to every enemy windup; never below the Standard warning. */
  warning: number;
  /** Multiplier on each enemy's repeat-attack interval (lower is more frequent). */
  cadence: number;
  /** Readability cap on simultaneous windups across all enemies. */
  maxWindups: number;
  /** Beam lanes that may be marked or active at once. */
  maxBeams: number;
  /** Which authored formation variant flies: 'veteran' adds the extra wingmen marked in formations.ts. */
  rank: FormationRank;
  /** Ceiling on the live threat cost (surviving enemies plus the admitted cue), docs/03 §6. */
  threatBudget: number;
}

/** Campaign difficulty is chosen per attempt; endless never reads this table (docs/11). */
export const DIFFICULTIES: Record<Difficulty, DifficultyScale> = {
  relaxed: { lives: 5, hp: 0.85, shotSpeed: 0.85, warning: 0.25, cadence: 1.4, maxWindups: 3, maxBeams: 1, rank: 'standard', threatBudget: 18 },
  standard: { lives: 3, hp: 1, shotSpeed: 1, warning: 0, cadence: 1, maxWindups: 5, maxBeams: 1, rank: 'standard', threatBudget: 24 },
  veteran: { lives: 3, hp: 1.2, shotSpeed: 1.05, warning: 0, cadence: 0.75, maxWindups: 7, maxBeams: 2, rank: 'veteran', threatBudget: 32 },
};

/** Threat cost per enemy for admission budgets (docs/03 §6). */
export const THREAT_COST: Record<EnemyKind, number> = { dart: 1, weaver: 2, turret: 2, lancer: 3 };

/**
 * Standardized endless ramp by sector s >= 1 (docs/03 §8). Independent of every campaign setting. After the
 * caps the authored peak playlist repeats; warnings, gaps and entity limits never scale.
 */
export const ENDLESS_RAMP = {
  hp: { base: 1, perSector: 0.08, cap: 1.6 },
  shotSpeed: { base: 1, perSector: 0.04, cap: 1.3 },
  cadence: { base: 1, perSector: -0.06, floor: 0.7 },
  threatBudget: { base: 22, perSector: 3, cap: 34 },
  maxWindups: { base: 5, fromSector3: 7 },
  maxBeams: { base: 1, fromSector3: 2 },
  veteranFormationsFromSector: 3,
} as const;

export const WEAPONS: Record<WeaponId, {
  label: string; cadence: number; speed: number; range: number;
  damage: number; radius: number; angles: readonly number[]; offsets: readonly number[];
}> = {
  pulse: { label: 'Twin Pulse', cadence: 0.125, speed: 30, range: 22, damage: 6, radius: 0.095, angles: [0, 0], offsets: [-0.2, 0.2] },
  fan: { label: 'Fan Cannon', cadence: 1 / 3, speed: 26, range: 18, damage: 5, radius: 0.11, angles: [-12, -6, 0, 6, 12], offsets: [0, 0, 0, 0, 0] },
  seeker: { label: 'Seeker Array', cadence: 0.48, speed: 19, range: 19, damage: 18, radius: 0.13, angles: [-5, 5], offsets: [-0.23, 0.23] },
};

export const ENEMIES: Record<EnemyKind, {
  hp: number; radius: number; speed: number; shotSpeed: number; attackEvery: number;
  warning: number; score: number; credits: number;
}> = {
  dart: { hp: 55, radius: 0.45, speed: 2.6, shotSpeed: 7.9, attackEvery: 1.85, warning: 0.85, score: 100, credits: 4 },
  weaver: { hp: 75, radius: 0.58, speed: 2.05, shotSpeed: 6.6, attackEvery: 2.2, warning: 0.9, score: 200, credits: 8 },
  turret: { hp: 110, radius: 0.62, speed: VIEW.scrollSpeed, shotSpeed: 7.3, attackEvery: 1.85, warning: 0.95, score: 250, credits: 10 },
  lancer: { hp: 120, radius: 0.46, speed: 1.55, shotSpeed: 6, attackEvery: 3.2, warning: 1.2, score: 400, credits: 16 },
};

export function difficultyScales(mode: 'campaign' | 'endless', difficulty: Difficulty, sector: number): DifficultyScale {
  if (mode === 'campaign') return DIFFICULTIES[difficulty];
  const n = Math.max(0, sector - 1);
  const ramp = ENDLESS_RAMP;
  return {
    lives: 3,
    hp: Math.min(ramp.hp.base + ramp.hp.perSector * n, ramp.hp.cap),
    shotSpeed: Math.min(ramp.shotSpeed.base + ramp.shotSpeed.perSector * n, ramp.shotSpeed.cap),
    warning: 0,
    cadence: Math.max(ramp.cadence.base + ramp.cadence.perSector * n, ramp.cadence.floor),
    maxWindups: sector >= 3 ? ramp.maxWindups.fromSector3 : ramp.maxWindups.base,
    maxBeams: sector >= 3 ? ramp.maxBeams.fromSector3 : ramp.maxBeams.base,
    rank: sector >= ramp.veteranFormationsFromSector ? 'veteran' : 'standard',
    threatBudget: Math.min(ramp.threatBudget.base + ramp.threatBudget.perSector * n, ramp.threatBudget.cap),
  };
}
