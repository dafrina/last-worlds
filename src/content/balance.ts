import { VIEW, type Difficulty, type EnemyKind, type MissionId, type WeaponId } from '../shared/contracts';
import type { FormationRank } from './formations';

/** Authoritative tuning for the flight prototype. Full-release docs remain proposals. */
export const BALANCE = {
  campaignDuration: 120,
  sectorDuration: 90,
  maxEnemies: 24,
  maxProjectiles: 520,
  maxPickups: 40,
  maxEffects: 70,
  /** Balanced Drive at campaign pace 1. Endless scales it with the pace (see PACE). */
  movement: { speed: 12, acceleration: 90, braking: 125 },
  /** Camera follow at pace 1: faster than the fastest proposed drive (Vector, 14 units/s). */
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
  /** Pickups drift toward the player row at `speed` times the pace; the magnet pulls at `magnetSpeed` times the pace. */
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
  /**
   * Physical clear gap between hazard edges at the player row: the collider, a 0.15 comfort margin on each side
   * and 0.6 units of free movement. It was 1.4 with the 0.25 collider and scales with VIEW.playerRadius.
   */
  minGap: 2 * (VIEW.playerRadius + 0.15) + 0.6,
  comfortMargin: 0.15,
  /** Width of each strip (both view edges and the center) that may never be sealed at the same time. */
  sealStrip: 2 * (VIEW.playerRadius + 0.15) + 0.6,
  /** Hazards crossing the player row within this many seconds of each other count as simultaneous. */
  window: 0.25,
  reaction: 0.2,
  /** Conservative lateral speed, as a fraction of the current top speed, and maneuver delay for reachability. */
  effectiveSpeedRatio: 0.7,
  maneuverDelay: 0.2,
  /** Covers the slowest committed pattern: a Relaxed core fan lands about 5.1 s after its windup starts. */
  horizon: 6,
  slice: 0.05,
  /** A windup rejected by the director is retried after this delay; the bullet pattern itself is never edited. */
  retryDelay: 0.25,
} as const;

/**
 * Pace (docs/03 §8). Campaign flies pace 1. Endless starts at the pre-14-October pace (0.8: scroll 4, ship
 * 10 / 70 / 100, camera 14) and ramps by sector to 1.1 times the campaign pace. Ship, enemy movement, camera,
 * pickups and terrain scroll scale together; shot speed scales more gently. Warnings never scale.
 */
export interface Kinematics { scroll: number; speed: number; acceleration: number; braking: number; camera: number; shot: number }
const CAMPAIGN_PACE: Kinematics = {
  scroll: VIEW.scrollSpeed, ...BALANCE.movement, camera: BALANCE.camera.speed, shot: 1,
};
export const PACE = {
  campaign: 1,
  endless: { start: 0.8, perSector: 0.075, cap: 1.1, easeSeconds: 5 },
  anchors: [
    { pace: 0.8, kinematics: { scroll: 4, speed: 10, acceleration: 70, braking: 100, camera: 14, shot: 7.2 / 7.9 } },
    { pace: 1, kinematics: CAMPAIGN_PACE },
    { pace: 1.1, kinematics: { scroll: 5.5, speed: 13.2, acceleration: 99, braking: 137.5, camera: 18.7, shot: 1.05 } },
  ],
} as const;

/** Piecewise-linear kinematics between the pace anchors, held constant outside them. */
export function kinematics(pace: number): Kinematics {
  const anchors = PACE.anchors;
  if (pace <= anchors[0].pace) return anchors[0].kinematics;
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (pace <= b.pace) {
      const u = (pace - a.pace) / (b.pace - a.pace);
      const mix = (key: keyof Kinematics) => a.kinematics[key] + (b.kinematics[key] - a.kinematics[key]) * u;
      return { scroll: mix('scroll'), speed: mix('speed'), acceleration: mix('acceleration'), braking: mix('braking'), camera: mix('camera'), shot: mix('shot') };
    }
  }
  return anchors[anchors.length - 1].kinematics;
}

/** Endless pace at an active time: each sector eases from the previous sector's pace to its own. */
export function endlessPace(time: number): number {
  const ramp = PACE.endless;
  const sector = Math.floor((time + 1e-8) / BALANCE.sectorDuration) + 1;
  const target = (s: number) => Math.min(ramp.start + ramp.perSector * Math.max(0, s - 1), ramp.cap);
  const into = time - (sector - 1) * BALANCE.sectorDuration;
  const u = Math.max(0, Math.min(1, into / ramp.easeSeconds));
  const from = target(sector - 1 < 1 ? 1 : sector - 1);
  return from + (target(sector) - from) * u * u * (3 - 2 * u);
}

/**
 * Airspace (docs/03 §6): squadrons never overlap. Members of different squadrons keep `separation` apart, and
 * two air squadrons on screen never share rows (their forward extents stay `bandGap` apart). Ground batteries
 * are terrain targets: they keep separation from each other but may pass beneath an air squadron.
 */
export const AIRSPACE = { separation: 2.2, bandGap: 1, horizon: 14, step: 0.1, predictionMargin: 0.35 } as const;

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
  relaxed: { lives: 5, hp: 0.85, shotSpeed: 0.85, warning: 0.25, cadence: 2, maxWindups: 3, maxBeams: 1, rank: 'standard', threatBudget: 14 },
  standard: { lives: 3, hp: 1, shotSpeed: 1, warning: 0, cadence: 1, maxWindups: 5, maxBeams: 1, rank: 'standard', threatBudget: 16 },
  veteran: { lives: 3, hp: 1.2, shotSpeed: 1.05, warning: 0, cadence: 0.75, maxWindups: 7, maxBeams: 2, rank: 'veteran', threatBudget: 20 },
};

/**
 * Per-mission multiplier on enemy repeat-attack intervals, on top of the difficulty. The Training sortie fires
 * more slowly; Rolling Thunder carries the full pressure. Endless never reads it.
 */
export const MISSION_CADENCE: Record<MissionId, number> = { training: 1.25, bastion: 1, 'cold-vector': 1 };

/** Threat cost per enemy for admission budgets (docs/03 §6). */
export const THREAT_COST: Record<EnemyKind, number> = { dart: 1, weaver: 2, turret: 2, lancer: 3 };

/**
 * Standardized endless ramp by sector s >= 1 (docs/03 §8). Independent of every campaign setting. After the
 * caps the authored peak playlist repeats; warnings, gaps and entity limits never scale.
 */
export const ENDLESS_RAMP = {
  hp: { base: 1, perSector: 0.08, cap: 1.6 },
  shotSpeed: { base: 1, perSector: 0.04, cap: 1.25 },
  cadence: { base: 1, perSector: -0.06, floor: 0.7 },
  threatBudget: { base: 14, perSector: 2, cap: 22 },
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
  dart: { hp: 55, radius: 0.45, speed: 2.6, shotSpeed: 7.9, attackEvery: 0.85, warning: 0.85, score: 100, credits: 4 },
  weaver: { hp: 75, radius: 0.58, speed: 2.05, shotSpeed: 6.6, attackEvery: 1.05, warning: 0.9, score: 200, credits: 8 },
  turret: { hp: 110, radius: 0.62, speed: VIEW.scrollSpeed, shotSpeed: 7.3, attackEvery: 0.98, warning: 0.95, score: 250, credits: 10 },
  lancer: { hp: 120, radius: 0.46, speed: 1.55, shotSpeed: 6, attackEvery: 1.85, warning: 1.2, score: 400, credits: 16 },
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
