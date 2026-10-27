import { VIEW, type Difficulty, type EnemyKind, type MissionId, type PlanetId, type WeaponId } from '../shared/contracts';
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
    campaign: { relaxed: [40, 95], standard: [40, 95], veteran: [75] },
    endlessAt: 55,
    /** Shield cells appear at the top of the view and drift down to the player (17 October: was mid-screen, 12). */
    forward: 18.5,
    viewMargin: 1,
  },
  respawn: { invulnerability: 2, specialCharge: 0.5 },
  /** Shockwave's hit and invulnerability; every special's recharge time is in SPECIALS (src/content/equipment.ts). */
  special: { killCharge: 0.03, damage: 180, invulnerability: 1 },
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
  /**
   * Needle beam rest: after `run` seconds of Needle beams without a real pause (windups or live lanes, gaps under
   * 2.5 s), no new Needle windup starts for `rest` seconds. Null keeps beams back to back (campaign Veteran).
   */
  beamRest: { run: number; rest: number } | null;
}

/** Campaign difficulty is chosen per attempt; endless never reads this table (docs/11). */
export const DIFFICULTIES: Record<Difficulty, DifficultyScale> = {
  // Beam rests added 15 October: later endless Vesper sectors chained 18–19 s of Needle beams (user report).
  relaxed: { lives: 5, hp: 0.85, shotSpeed: 0.85, warning: 0.25, cadence: 2, maxWindups: 3, maxBeams: 1, rank: 'standard', threatBudget: 14, beamRest: { run: 5, rest: 4 } },
  standard: { lives: 3, hp: 1, shotSpeed: 1, warning: 0, cadence: 1, maxWindups: 5, maxBeams: 1, rank: 'standard', threatBudget: 16, beamRest: { run: 7, rest: 3 } },
  veteran: { lives: 3, hp: 1.2, shotSpeed: 1.05, warning: 0, cadence: 0.75, maxWindups: 7, maxBeams: 2, rank: 'veteran', threatBudget: 20, beamRest: null },
};

/**
 * Per-mission multiplier on enemy repeat-attack intervals, on top of the difficulty. The Training sortie fires
 * more slowly; Rolling Thunder carries the full pressure. Endless never reads it.
 */
// 15 October (user): Rolling Thunder slightly harder (×0.92); Deep Bloom, now the final mission, the hardest (×0.92).
// 23 October: Brood Strike, the new final mission, starts at Deep Bloom's pressure (to be tuned after play).
export const MISSION_CADENCE: Record<MissionId, number> = { training: 1.25, bastion: 0.92, 'cold-vector': 1, 'deep-bloom': 0.92, 'brood-strike': 0.92, 'final-horizon': 0.92 };

/** Threat cost per enemy for admission budgets (docs/03 §6). */
export const THREAT_COST: Record<EnemyKind, number> = { dart: 1, weaver: 2, turret: 2, lancer: 3, needle: 2, diamond: 4, missile: 2, fuel: 0, pulsar: 3, wraith: 3 };
/**
 * A Pulsar burst: shots in the stream and the gap between them (seconds). Each shot aims at the player's position as
 * it leaves the muzzle, so the stream hoses after a moving ship (user, 20 October: was six shots straight down).
 * The gap is 0.2 s (was 0.1, 21 October): at 0.1 the shots flew about 1 unit apart, a solid wall for the 0.42 ship,
 * so the only escape was running ahead of the stream, and in the 2-screen world that ends pinned at the edge. The
 * user wants the ship to "evade between the projectiles not just hide at screen edge".
 */
export const PULSAR_BURST = { shots: 10, interval: 0.2 } as const;

/** Ground targets move with the terrain scroll and are never airframe contact hazards. */
/**
 * Progressive intensity by world (user request, 16 October 2026: "training moon pretty chill, then gradually ramp up").
 * `flight` scales air enemies' flight clock, `shot` their shot speeds (bosses too), and `cadence` their repeat-attack
 * intervals (lower fires faster). Applies to the run's current planet in both modes, on top of difficulty, the endless
 * ramp and MISSION_CADENCE.
 */
export const WORLD_INTENSITY: Readonly<Record<PlanetId, { flight: number; shot: number; cadence: number }>> = {
  luna: { flight: 1, shot: 1, cadence: 1 },
  // Repeat fire up to twice as often by Nacre (17 October: the first, gentler ramp ×0.90 / ×0.86 / ×0.82 was not noticeable).
  khepri: { flight: 1.05, shot: 1.05, cadence: 0.8 },
  vesper: { flight: 1.07, shot: 1.07, cadence: 0.62 },
  nacre: { flight: 1.1, shot: 1.1, cadence: 0.5 },
  // Amnion (23 October) starts at Nacre's intensity; it is not harder until it has been played.
  amnion: { flight: 1.1, shot: 1.1, cadence: 0.5 },
  // Umbra (24 October) as Amnion: the final planet is not made harder before it has been played.
  umbra: { flight: 1.1, shot: 1.1, cadence: 0.5 },
};
/**
 * A destroyed fuel skid explodes (user request, 16 October 2026): every damageable target whose body is within
 * `radius` takes `damage` (other skids chain). It never hurts the player and never charges the special.
 */
export const FUEL_BLAST = { radius: 2.6, damage: 150 } as const;
export const GROUND_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['turret', 'missile', 'fuel']);
/** Kinds whose attack is a locked beam lane rather than bullets. */
export const BEAM_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['lancer', 'needle']);

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
  // 24 October (user): "can you make the seeker missiles for the main weapon make less damage like the fan burst? there
  // should be incentive to use the other weapons": 18 → 12 a missile (75 → 50 damage a second, every shot homing), under an
  // aimed Twin Pulse (96) and a close Fan (75).
  seeker: { label: 'Seeker Array', cadence: 0.48, speed: 19, range: 19, damage: 12, radius: 0.13, angles: [-5, 5], offsets: [-0.23, 0.23] },
};

export const ENEMIES: Record<EnemyKind, {
  hp: number; radius: number; speed: number; shotSpeed: number; attackEvery: number;
  warning: number; score: number; credits: number;
}> = {
  dart: { hp: 55, radius: 0.45, speed: 2.6, shotSpeed: 7.9, attackEvery: 0.85, warning: 0.85, score: 100, credits: 4 },
  weaver: { hp: 75, radius: 0.58, speed: 2.05, shotSpeed: 6.6, attackEvery: 1.05, warning: 0.9, score: 200, credits: 8 },
  turret: { hp: 110, radius: 0.62, speed: VIEW.scrollSpeed, shotSpeed: 7.3, attackEvery: 0.98, warning: 0.95, score: 250, credits: 10 },
  lancer: { hp: 120, radius: 0.46, speed: 1.55, shotSpeed: 6, attackEvery: 1.85, warning: 1.2, score: 400, credits: 16 },
  // Vesper (docs/17 §5). Needle: fast interceptor, a very narrow locked beam on its own quick timing.
  // 17 October (user): Needles and Diamonds tougher and longer on screen (hp 50 → 70, 130 → 175; holds +2 s).
  needle: { hp: 70, radius: 0.3, speed: 3.2, shotSpeed: 0, attackEvery: 1.3, warning: 0.75, score: 150, credits: 6 },
  // Diamond: heavy escort; its whole pale body (radius 0.6) takes hits. Softened on 15 October (was 220 hp on a 0.3
  // core): shots through the visible plates did nothing, the user could never bring one down, and Scatter could not
  // kill one in a whole pass.
  diamond: { hp: 175, radius: 0.6, speed: 1.2, shotSpeed: 6.8, attackEvery: 1, warning: 0.95, score: 400, credits: 16 },
  // Missile battery: ground target; straight, non-tracking missiles down its own marked column.
  missile: { hp: 120, radius: 0.55, speed: VIEW.scrollSpeed, shotSpeed: 16, attackEvery: 1.9, warning: 1.45, score: 250, credits: 10 },
  // Fuel-tank skid (user request, 16 October): a harmless ground loot target that never fires; quick to burst.
  // Pulsar (Nacre): tracks the player through its windup, then streams a burst whose every shot aims at the player (PULSAR_BURST).
  pulsar: { hp: 110, radius: 0.6, speed: 1.6, shotSpeed: 9, attackEvery: 2.6, warning: 1.1, score: 300, credits: 12 },
  wraith: { hp: 105, radius: 0.58, speed: 2.5, shotSpeed: 16, attackEvery: 5, warning: 0.9, score: 400, credits: 16 },
  fuel: { hp: 40, radius: 0.55, speed: VIEW.scrollSpeed, shotSpeed: 0, attackEvery: Infinity, warning: 0, score: 50, credits: 6 },
};

/**
 * Endless opens with prologue sectors (Luna and WARDEN-1, docs/19) before the planet cycle. The pace and difficulty
 * ramps count from the first cycle sector, so the prologue flies at the starting values and Khepri's first sector is
 * exactly what sector 1 was before the prologue existed.
 */
export const ENDLESS_PROLOGUE_SECTORS = 1;
/** The ramp sector of an endless sector: 1 for the prologue and the first cycle sector, then counting up. */
export const endlessRampSector = (sector: number) => Math.max(1, sector - ENDLESS_PROLOGUE_SECTORS);

export function difficultyScales(mode: 'campaign' | 'endless', difficulty: Difficulty, rawSector: number): DifficultyScale {
  if (mode === 'campaign') return DIFFICULTIES[difficulty];
  const sector = endlessRampSector(rawSector), n = Math.max(0, sector - 1);
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
    // Endless always rests like Standard: its pressure peaks stay, but never as a nonstop barrage.
    beamRest: DIFFICULTIES.standard.beamRest,
  };
}
