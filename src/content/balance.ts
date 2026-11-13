import { VIEW, type Difficulty, type EnemyKind, type MissionId, type PlanetId, type WeaponId } from '../shared/contracts';
import type { FormationRank } from './formations';

/** Authoritative tuning for the flight prototype. Full-release docs remain proposals. */
export const BALANCE = {
  campaignDuration: 120,
  sectorDuration: 90,
  maxEnemies: 24,
  maxProjectiles: 520,
  maxPickups: 40,
  campaignHunterCredits: 15,
  maxEffects: 70,
  /** Balanced Drive at campaign pace 1. Endless scales it with the pace (see PACE). */
  movement: { speed: 12, acceleration: 90, braking: 125 },
  /** Camera follow at pace 1: faster than the fastest proposed drive (Vector, 14 units/s). */
  camera: { deadZone: 2.5, speed: 17 },
  shield: { charges: 3, hitInvulnerability: 0.65 },
  shieldSupplies: {
    campaign: { relaxed: [40, 95], standard: [40, 95], veteran: [75] },
    endlessAt: 55,
    viewMargin: 1,
  },
  respawn: { invulnerability: 2, specialCharge: 0.5 },
  /** Shockwave's hit and invulnerability; every special's recharge time is in SPECIALS (src/content/equipment.ts). */
  special: { killCharge: 0.03, damage: 180, invulnerability: 1 },
  /** Pickups drift toward the player row at `speed` times the pace; the magnet pulls at `magnetSpeed` times the pace. */
  /**
   * A caught pickup (one that came within the magnet) homes in until collected (user, 7 November: "as long as you were in
   * reach ... the coin should always find its way to the ship"), its pull growing by `catchBoost` × magnetSpeed per second.
   */
  pickup: { radius: 0.65, magnetRadius: 1.6, speed: VIEW.scrollSpeed, magnetSpeed: 7.5, catchBoost: 4 },
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
  // 1.15 since 6 November (user: "15% quicker pace"; was 1): scroll 5.75, the ship and the camera 15% quicker with it.
  campaign: 1.15,
  // The user asked for 1.2 (6 November: "keep the starting point but go to 1.2"); held at 1.1 until its fairness is worked
  // out: at 1.15, 1.18 and 1.2 a site guard or an endless stretch each left the solver no clear path (tests/sim/fairness).
  endless: { start: 0.8, perSector: 0.075, cap: 1.1, easeSeconds: 5 },
  anchors: [
    { pace: 0.8, kinematics: { scroll: 4, speed: 10, acceleration: 70, braking: 100, camera: 14, shot: 7.2 / 7.9 } },
    { pace: 1, kinematics: CAMPAIGN_PACE },
    { pace: 1.1, kinematics: { scroll: 5.5, speed: 13.2, acceleration: 99, braking: 137.5, camera: 18.7, shot: 1.05 } },
    // The 1 → 1.1 step continued (campaign 1.15 lies halfway to it); shots stay at the 1.1 speed: at ×1.1 a mixed site
    // guard left the solver no path in capped endless (fairness: site-mixed-4).
    { pace: 1.2, kinematics: { scroll: 6, speed: 14.4, acceleration: 108, braking: 150, camera: 20.4, shot: 1.05 } },
  ],
} as const;

/** The campaign's terrain scroll (units/s): VIEW.scrollSpeed at pace 1, 5.75 at PACE.campaign 1.15. Boss arenas stop on it. */
export const CAMPAIGN_SCROLL = VIEW.scrollSpeed * PACE.campaign;

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

/**
 * The pull toward the view (docs/10 §4–5; user, 11 November: "there should be possibilities to retreat but there should
 * always be 1-2 enemies on screen"). When fewer than `floor` hostile air craft in view can attack, the nearest air squadron
 * with members beside the view slides sideways toward it, shape and authored path unchanged, until `engaged` can. A boss
 * none of whose live targets has been in view for `patience` seconds lumbers toward the view until one is, and eases back
 * toward its arrival point whenever a target would be in view there. Speeds are units/s at pace 1 (they scale with the
 * pace, like the ship's), acceleration and braking units/s². The ship's top speed is 12, so a pilot can still pull away.
 */
export const DRIFT = {
  floor: 1,
  engaged: 2,
  squadron: { speed: 4.5, acceleration: 12, braking: 18 },
  boss: { speed: 2.5, acceleration: 4, braking: 8, patience: 2 },
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
  /**
   * Multiplier on a squadron's first windup (its template's fireFrom), never before a member is fully in view
   * (FIRST_WINDUP_ROW). The members keep their authored stagger (never one sealing wall) and each windup its full warning. Veteran 0.5 (user, 4 November, on strong
   * weapons: "they are dead before they even started shooting"), Standard 0.75 ("make the pause less for normal runs
   * too"); Relaxed 1 keeps the authored timing. Air craft fire AIR_FIRST_SHOT sooner on top (6 November).
   */
  firstAttack: number;
  /**
   * Air craft open fire this much sooner on top (an air squadron's first windup and its members' stagger, aces, the
   * Wraith; user, 6 November: "i hate that enemies take so long to start shooting ... 25% quicker enemies shooting after
   * arrival"). Veteran keeps 1: it opens at half the authored time already, and ×0.75 more with the campaign pace left
   * no fair path in Brood Strike (fairness test). Ground batteries keep the difficulty's timing (see AIR_FIRST_SHOT).
   */
  airFirstShot: number;
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
  relaxed: { lives: 5, hp: 0.85, shotSpeed: 0.85, warning: 0.25, cadence: 2, firstAttack: 1, airFirstShot: 0.75, maxWindups: 3, maxBeams: 1, rank: 'standard', threatBudget: 14, beamRest: { run: 5, rest: 4 } },
  standard: { lives: 3, hp: 1, shotSpeed: 1, warning: 0, cadence: 1, firstAttack: 0.75, airFirstShot: 0.75, maxWindups: 5, maxBeams: 1, rank: 'standard', threatBudget: 16, beamRest: { run: 7, rest: 3 } },
  veteran: { lives: 3, hp: 1.2, shotSpeed: 1.05, warning: 0, cadence: 0.75, firstAttack: 0.5, airFirstShot: 1, maxWindups: 7, maxBeams: 2, rank: 'veteran', threatBudget: 20, beamRest: null },
};

/**
 * Per-mission multiplier on enemy repeat-attack intervals, on top of the difficulty. The Training sortie fires
 * more slowly; Rolling Thunder carries the full pressure. Endless never reads it.
 */
// 15 October (user): Rolling Thunder slightly harder (×0.92); Deep Bloom, now the final mission, the hardest (×0.92).
// 23 October: Brood Strike, the new final mission, starts at Deep Bloom's pressure (to be tuned after play).
// 5 November: Dying Star (Corona) as Brood Strike and Final Horizon until it is played.
export const MISSION_CADENCE: Record<MissionId, number> = { training: 1.25, bastion: 0.92, 'cold-vector': 1, 'deep-bloom': 0.92, 'brood-strike': 0.92, 'dying-star': 0.92, 'final-horizon': 0.92, 'silent-empire': 0.92, };

/** Threat cost per enemy for admission budgets (docs/03 §6). */
export const THREAT_COST: Record<EnemyKind, number> = { dart: 1, weaver: 2, turret: 2, lancer: 3, needle: 2, diamond: 4, missile: 2, fuel: 0, pulsar: 3, wraith: 3, skimmer: 3, relic: 4 };
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
 *
 * Late-world curve (10 November): Amnion, Corona and Umbra step up past Nacre instead of matching it.
 * - `hp` scales formation enemies' and aces' hit points. Fuel skids and strike-site cores keep theirs.
 * - `firstAttack` brings the first windup forward, the same way DifficultyScale.firstAttack does. It applies to a formation's
 *   fireFrom (members keep their stagger), to aces and Wraiths, and to the firing window.
 */
export const WORLD_INTENSITY: Readonly<Record<PlanetId, { flight: number; shot: number; cadence: number; hp: number; firstAttack: number }>> = {
  luna: { flight: 1, shot: 1, cadence: 1, hp: 1, firstAttack: 1 },
  // Repeat fire up to twice as often by Nacre (17 October: the first, gentler ramp ×0.90 / ×0.86 / ×0.82 was not noticeable).
  khepri: { flight: 1.05, shot: 1.05, cadence: 0.8, hp: 1, firstAttack: 1 },
  vesper: { flight: 1.07, shot: 1.07, cadence: 0.62, hp: 1, firstAttack: 1 },
  nacre: { flight: 1.1, shot: 1.1, cadence: 0.50, hp: 1, firstAttack: 1 },
  amnion: { flight: 1.1, shot: 1.1, cadence: 0.46, hp: 1.10, firstAttack: 0.90 },
  corona: { flight: 1.1, shot: 1.1, cadence: 0.43, hp: 1.15, firstAttack: 0.85 },
  // Nahara, the penultimate world (docs/39): Corona's tuning for now, between Corona and Umbra once measured.
  nahara: { flight: 1.1, shot: 1.1, cadence: 0.43, hp: 1.15, firstAttack: 0.85 },
  umbra: { flight: 1.1, shot: 1.1, cadence: 0.40, hp: 1.20, firstAttack: 0.80 },
};
/**
 * A destroyed fuel skid explodes (user request, 16 October 2026): every damageable target whose body is within
 * `radius` takes `damage` (other skids chain). It never hurts the player and never charges the special.
 */
/*
 * AIR_FIRST_SHOT (6 November) is per difficulty now: DifficultyScale.airFirstShot. Ground batteries keep the difficulty's
 * timing: they reach the ship 15% sooner with the campaign pace, and a battery line opening ×0.75 as well left no gap at
 * Veteran (fairness: site-turrets-4).
 */
export const FUEL_BLAST = { radius: 2.6, damage: 150 } as const;
export const GROUND_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['turret', 'missile', 'fuel']);
/** Kinds whose attack is a locked beam lane rather than bullets. */
export const BEAM_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['lancer', 'needle']);
/**
 * Warning lines on Vesper at once, outside campaign Veteran: attacks winding up (their aim rays, marked lanes and columns)
 * plus live beam lanes (user, 31 October: "more than 5 lasers at a time should be for veteran maybe only on vesper";
 * Vesper is the cycle's second world, later worlds stay harder). Endless Vesper had up to 9 (the ramp allows 7 windups
 * from sector 3).
 */
/** 4 since 6 November (user: "vesper seems a bit too hard ... reduce lasers for vesper by 20%": fewer lines at once). */
export const VESPER_LINE_CAP = 4;

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
  // Rail Driver (docs/32 §1, user 28 October): a slow, near-instant slug that pierces every target in its line. 64 damage
  // a second on a lone target, under Twin Pulse (96); each enemy lined up behind adds as much again. 40 a slug (the first
  // draft) out-killed Pulse on bosses too: the centred slug never misses where Pulse's offset twins partly do (docs/32 §1.7).
  rail: { label: 'Rail Driver', cadence: 0.5, speed: 90, range: 21, damage: 32, radius: 0.12, angles: [0], offsets: [0] },
};

export const ENEMIES: Record<EnemyKind, {
  hp: number; radius: number; speed: number; shotSpeed: number; attackEvery: number;
  warning: number; score: number; credits: number;
}> = {
  dart: { hp: 55, radius: 0.45, speed: 2.6, shotSpeed: 7.9, attackEvery: 0.85, warning: 0.85, score: 100, credits: 4 },
  weaver: { hp: 75, radius: 0.58, speed: 2.05, shotSpeed: 6.6, attackEvery: 1.05, warning: 0.9, score: 200, credits: 5 },
  turret: { hp: 110, radius: 0.62, speed: VIEW.scrollSpeed, shotSpeed: 7.3, attackEvery: 0.98, warning: 0.95, score: 250, credits: 5 },
  lancer: { hp: 120, radius: 0.46, speed: 1.55, shotSpeed: 6, attackEvery: 1.85, warning: 1.2, score: 400, credits: 10 },
  // Vesper (docs/17 §5). Needle: fast interceptor, a very narrow locked beam on its own quick timing.
  // 17 October (user): Needles and Diamonds tougher and longer on screen (hp 50 → 70, 130 → 175; holds +2 s).
  needle: { hp: 70, radius: 0.3, speed: 3.2, shotSpeed: 0, attackEvery: 1.3, warning: 0.75, score: 150, credits: 6 },
  // Diamond: heavy escort; its whole pale body (radius 0.6) takes hits. Softened on 15 October (was 220 hp on a 0.3
  // core): shots through the visible plates did nothing, the user could never bring one down, and Scatter could not
  // kill one in a whole pass.
  diamond: { hp: 175, radius: 0.6, speed: 1.2, shotSpeed: 6.8, attackEvery: 1, warning: 0.95, score: 400, credits: 10 },
  // Missile battery: ground target; straight, non-tracking missiles down its own marked column.
  missile: { hp: 120, radius: 0.55, speed: VIEW.scrollSpeed, shotSpeed: 16, attackEvery: 1.9, warning: 1.45, score: 250, credits: 10 },
  // Fuel-tank skid (user request, 16 October): a harmless ground loot target that never fires; quick to burst.
  // Pulsar (Nacre): tracks the player through its windup, then streams a burst whose every shot aims at the player (PULSAR_BURST).
  // 6 November (user): Nacre a bit easy, its Pulsars 15% tougher (110 → 127).
  pulsar: { hp: 127, radius: 0.6, speed: 1.6, shotSpeed: 9, attackEvery: 2.6, warning: 1.1, score: 300, credits: 10 },
  wraith: { hp: 105, radius: 0.58, speed: 2.5, shotSpeed: 16, attackEvery: 5, warning: 0.9, score: 400, credits: 10 },
  fuel: { hp: 40, radius: 0.55, speed: VIEW.scrollSpeed, shotSpeed: 0, attackEvery: Infinity, warning: 0, score: 50, credits: 6 },
  // Nahara (docs/39; the handover's starting values, tuned by play). Skimmer: a fast light raider whose aimed shot pauses
  // and splits in two (ECHO_SPLIT). Relic Shield: a heavy ancient machine, its armour closed but for its attacks
  // (RELIC_ARMOR), armour broken for good near death.
  skimmer: { hp: 95, radius: 0.42, speed: 3.3, shotSpeed: 6.4, attackEvery: 1.8, warning: 0.8, score: 300, credits: 8 },
  relic: { hp: 190, radius: 0.62, speed: 1.05, shotSpeed: 6.6, attackEvery: 2.6, warning: 1.05, score: 500, credits: 12 },
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
    // Endless keeps the authored first windups (its own ramp; docs/18); air craft fire AIR_FIRST_SHOT sooner, as campaign.
    firstAttack: 1,
    airFirstShot: 0.75,
    maxWindups: sector >= 3 ? ramp.maxWindups.fromSector3 : ramp.maxWindups.base,
    maxBeams: sector >= 3 ? ramp.maxBeams.fromSector3 : ramp.maxBeams.base,
    rank: sector >= ramp.veteranFormationsFromSector ? 'veteran' : 'standard',
    threatBudget: Math.min(ramp.threatBudget.base + ramp.threatBudget.perSector * n, ramp.threatBudget.cap),
    // Endless always rests like Standard: its pressure peaks stay, but never as a nonstop barrage.
    beamRest: DIFFICULTIES.standard.beamRest,
  };
}
