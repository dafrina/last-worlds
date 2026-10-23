import type { BossId, BossPart, Difficulty, MissionId } from '../shared/contracts';
import { BASTION } from './bastion';
import { HELION_ARK } from './ark';
import { WARDEN } from './warden';
import { VEIL } from './veil';
import { CRADLE } from './cradle';

export { WRECK_HOLD } from './departure';
/** Every boss 15% tougher with 10% shorter recoveries (user, 17 October 2026: "10-20% more difficult"). */
export const BOSS_TOUGHNESS = { hp: 1.15, recovery: 0.9 } as const;
import { DEPARTURE } from './departure';

/**
 * One shape for every campaign boss, built from each boss's own content file. Phases are shared:
 * arrival → 'batteries' (first module pair) → 'core' (main target) → 'overload' (lanes over its own hit
 * columns) → 'destroyed' (ground- or water-anchored wreck, extraction).
 */
/**
 * One move of a boss's overload phase (cycled in order; a move the fairness director rejects is skipped):
 * - 'core-lane' / 'side-lanes': lanes over its own core column, or over both side-module columns;
 * - 'cross': the core lane plus one side lane (alternating sides), so the open side alternates;
 * - 'burst' / 'fan': the core's aimed burst or fixed fan.
 */
export type OverloadMove = 'core-lane' | 'side-lanes' | 'cross' | 'burst' | 'fan' | 'spiral';

export interface BossDefinition {
  id: BossId;
  name: string;
  arrivesAt: number;
  approachEndsAt: number;
  arrivalDuration: number;
  entryS: number;
  row: number;
  targetHeight: number;
  parts: Readonly<Record<BossPart, { x: number; s: number; radius: number; hp: number }>>;
  /** First-pair attack: Bastion fires aimed bursts, the Ark fires narrow lane lasers. */
  pairAttack: 'burst' | 'laser';
  /** Main-target attack: Bastion alternates its fixed fan with an aimed burst; the Ark fires aimed bursts. */
  coreAttack: 'fan-burst' | 'burst';
  warning: number;
  laser: { warning: number; width: number; active: number } | null;
  beamWarning: number;
  overload: { coreLaneWidth: number; batteryLaneWidth: number; active: number };
  /** Overload phase: the boss's own sequence of moves (docs/15, docs/17, docs/19, docs/20). */
  overloadMoves: readonly OverloadMove[];
  /** The 'spiral' overload move (THE VEIL): `arms` streams turning at `turn` rad/s for `duration` s, a volley every `interval`. */
  spiral?: { arms: number; turn: number; interval: number; duration: number; speed: number };
  recovery: number;
  /** Pause after each overload attack (defaults to `recovery`). */
  overloadRecovery?: number;
  transitionRecovery: number;
  overloadFraction: number;
  extractionDuration: number;
  bursts: { pair: { bolts: number; spread: number; speed: number }; core: { bolts: number; spread: number; speed: number } };
  fan: { bolts: number; spacing: number; speed: number } | null;
  /** Finite launches from deck bays in the core phase, plus `overloadWaves` more once overload begins. */
  launches: { waves: number; firstAfter: number; interval: number; overloadWaves?: number; template: 'ark-launch' | 'veil-pods'; bays: readonly { x: number; s: number }[] } | null;
  arena: { decelStart: number; decelDuration: number; sway: number; swayRate: number; surge: number; surgeRate: number; platform: { from: number; to: number } };
  shieldSupplies: Readonly<Record<Difficulty, readonly number[]>>;
  messages: { start: string; batteries: string; core: string; overload: string; destroyed: string; approach: string };
}

export const BOSSES: Readonly<Record<BossId, BossDefinition>> = {
  bastion: {
    id: 'bastion', name: 'BASTION-9',
    arrivesAt: BASTION.arrivesAt, approachEndsAt: BASTION.approachEndsAt, arrivalDuration: BASTION.arrivalDuration,
    entryS: 27, row: BASTION.row, targetHeight: BASTION.targetHeight,
    parts: {
      left: { x: -BASTION.batteryOffset, s: 0, radius: BASTION.batteryRadius, hp: BASTION.batteryHp },
      right: { x: BASTION.batteryOffset, s: 0, radius: BASTION.batteryRadius, hp: BASTION.batteryHp },
      core: { x: 0, s: BASTION.coreRowOffset, radius: BASTION.coreRadius, hp: BASTION.coreHp },
    },
    pairAttack: 'burst', coreAttack: 'fan-burst',
    warning: BASTION.warning, laser: null, beamWarning: BASTION.beamWarning, overload: BASTION.overload,
    overloadMoves: ['core-lane', 'side-lanes', 'fan', 'cross', 'core-lane', 'burst'],
    recovery: BASTION.recovery, transitionRecovery: BASTION.transitionRecovery,
    overloadFraction: BASTION.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: BASTION.batteryBurst, core: BASTION.coreBurst }, fan: BASTION.coreFan, launches: null,
    arena: BASTION.arena, shieldSupplies: BASTION.shieldSupplies,
    messages: {
      start: 'BASTION-9 · BREAK BOTH BATTERIES', batteries: 'BREAK BOTH BATTERIES', core: 'CORE EXPOSED',
      overload: 'CORE OVERLOAD · WATCH THE LANES', destroyed: 'BASTION-9 DESTROYED · JUMP',
      approach: 'FORTRESS APPROACH · READY YOUR SPECIAL',
    },
  },
  ark: {
    id: 'ark', name: 'HELION ARK',
    arrivesAt: HELION_ARK.arrivesAt, approachEndsAt: HELION_ARK.approachEndsAt, arrivalDuration: HELION_ARK.arrivalDuration,
    entryS: HELION_ARK.entryS, row: HELION_ARK.row, targetHeight: HELION_ARK.targetHeight,
    parts: {
      left: { x: -HELION_ARK.radiatorOffset, s: HELION_ARK.radiatorS, radius: HELION_ARK.radiatorRadius, hp: HELION_ARK.radiatorHp },
      right: { x: HELION_ARK.radiatorOffset, s: HELION_ARK.radiatorS, radius: HELION_ARK.radiatorRadius, hp: HELION_ARK.radiatorHp },
      core: { x: 0, s: HELION_ARK.bridgeS, radius: HELION_ARK.bridgeRadius, hp: HELION_ARK.bridgeHp },
    },
    pairAttack: 'laser', coreAttack: 'burst',
    warning: HELION_ARK.warning, laser: HELION_ARK.laser, beamWarning: HELION_ARK.beamWarning, overload: HELION_ARK.overload,
    // The final phase mixes its lanes with crosses and bridge bursts, recovers faster, and
    // launches two more drop-pod waves (user: the last laser section was always the same and a bit easy).
    overloadMoves: ['core-lane', 'burst', 'side-lanes', 'cross', 'burst', 'core-lane', 'cross', 'side-lanes'], overloadRecovery: 0.4,
    recovery: HELION_ARK.recovery, transitionRecovery: HELION_ARK.transitionRecovery,
    overloadFraction: HELION_ARK.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: HELION_ARK.bridgeBurst, core: HELION_ARK.bridgeBurst }, fan: null,
    launches: { ...HELION_ARK.launches, overloadWaves: 2, template: 'ark-launch', bays: HELION_ARK.bays },
    arena: HELION_ARK.arena, shieldSupplies: HELION_ARK.shieldSupplies,
    messages: {
      start: 'HELION ARK · BREAK BOTH RADIATORS', batteries: 'BREAK BOTH RADIATORS', core: 'BRIDGE EXPOSED',
      overload: 'BRIDGE OVERLOAD · WATCH THE LANES', destroyed: 'HELION ARK DESTROYED · JUMP',
      approach: 'OPEN WATER · THE ARK IS INBOUND',
    },
  },
  warden: {
    id: 'warden', name: 'WARDEN-1',
    arrivesAt: WARDEN.arrivesAt, approachEndsAt: WARDEN.approachEndsAt, arrivalDuration: WARDEN.arrivalDuration,
    entryS: WARDEN.entryS, row: WARDEN.row, targetHeight: WARDEN.targetHeight,
    parts: {
      left: { x: -WARDEN.podOffset, s: 0, radius: WARDEN.podRadius, hp: WARDEN.podHp },
      right: { x: WARDEN.podOffset, s: 0, radius: WARDEN.podRadius, hp: WARDEN.podHp },
      core: { x: 0, s: WARDEN.commandS, radius: WARDEN.commandRadius, hp: WARDEN.commandHp },
    },
    pairAttack: 'burst', coreAttack: 'burst',
    warning: WARDEN.warning, laser: null, beamWarning: WARDEN.beamWarning, overload: WARDEN.overload,
    overloadMoves: ['core-lane', 'burst', 'side-lanes', 'cross'],
    recovery: WARDEN.recovery, transitionRecovery: WARDEN.transitionRecovery,
    overloadFraction: WARDEN.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: WARDEN.podBurst, core: WARDEN.commandBurst }, fan: null, launches: null,
    arena: WARDEN.arena, shieldSupplies: WARDEN.shieldSupplies,
    messages: {
      start: 'WARDEN-1 · BREAK BOTH TURRET PODS', batteries: 'BREAK BOTH TURRET PODS', core: 'COMMAND MODULE EXPOSED',
      overload: 'REACTOR OVERLOAD · WATCH THE LANES', destroyed: 'WARDEN-1 DOWN · JUMP',
      approach: 'OLD DEFENCE LANDER INBOUND · READY YOUR SPECIAL',
    },
  },
  veil: {
    id: 'veil', name: 'THE VEIL',
    arrivesAt: VEIL.arrivesAt, approachEndsAt: VEIL.approachEndsAt, arrivalDuration: VEIL.arrivalDuration,
    entryS: VEIL.entryS, row: VEIL.row, targetHeight: VEIL.targetHeight,
    parts: {
      left: { x: -VEIL.podOffset, s: VEIL.podS, radius: VEIL.podRadius, hp: VEIL.podHp },
      right: { x: VEIL.podOffset, s: VEIL.podS, radius: VEIL.podRadius, hp: VEIL.podHp },
      core: { x: 0, s: VEIL.heartS, radius: VEIL.heartRadius, hp: VEIL.heartHp },
    },
    pairAttack: 'burst', coreAttack: 'fan-burst',
    warning: VEIL.warning, laser: null, beamWarning: VEIL.beamWarning, overload: VEIL.overload,
    // 17 October (user): its last phase looses a spiral barrage from the heart for a few seconds.
    overloadMoves: ['spiral', 'core-lane', 'fan', 'cross', 'spiral', 'burst', 'side-lanes', 'fan'], overloadRecovery: 0.45,
    spiral: { arms: 4, turn: 1.7, interval: 0.12, duration: 3, speed: 4.8 },
    recovery: VEIL.recovery, transitionRecovery: VEIL.transitionRecovery,
    overloadFraction: VEIL.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: VEIL.podBurst, core: VEIL.heartBurst }, fan: VEIL.heartFan,
    // It deploys pod waves from its front bays while its heart is open, and more once it overloads.
    launches: { ...VEIL.launches, template: 'veil-pods', bays: VEIL.bays },
    arena: VEIL.arena, shieldSupplies: VEIL.shieldSupplies,
    messages: {
      start: 'THE VEIL · BURST BOTH GILL PODS', batteries: 'BURST BOTH GILL PODS', core: 'THE HEART IS OPEN',
      overload: 'HEART OVERLOAD · WATCH THE LANES', destroyed: 'THE VEIL IS FALLING · JUMP',
      approach: 'THE MIRE GOES QUIET · SOMETHING HUGE IS RISING',
    },
  },
  cradle: {
    id: 'cradle', name: 'THE CRADLE',
    arrivesAt: CRADLE.arrivesAt, approachEndsAt: CRADLE.approachEndsAt, arrivalDuration: CRADLE.arrivalDuration,
    entryS: CRADLE.entryS, row: CRADLE.row, targetHeight: CRADLE.targetHeight,
    parts: {
      left: { x: -CRADLE.sacOffset, s: CRADLE.sacS, radius: CRADLE.sacRadius, hp: CRADLE.sacHp },
      right: { x: CRADLE.sacOffset, s: CRADLE.sacS, radius: CRADLE.sacRadius, hp: CRADLE.sacHp },
      core: { x: 0, s: CRADLE.heartS, radius: CRADLE.heartRadius, hp: CRADLE.heartHp },
    },
    pairAttack: 'burst', coreAttack: 'fan-burst',
    warning: CRADLE.warning, laser: null, beamWarning: CRADLE.beamWarning, overload: CRADLE.overload,
    overloadMoves: ['core-lane', 'spiral', 'fan', 'side-lanes', 'burst', 'cross', 'spiral', 'fan'], overloadRecovery: 0.45,
    spiral: { arms: 4, turn: 1.7, interval: 0.12, duration: 3, speed: 4.8 },
    recovery: CRADLE.recovery, transitionRecovery: CRADLE.transitionRecovery,
    overloadFraction: CRADLE.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: CRADLE.sacBurst, core: CRADLE.heartBurst }, fan: CRADLE.heartFan,
    // Hatchling waves from its brood bays while its heart is open, and more once it overloads.
    launches: { ...CRADLE.launches, template: 'veil-pods', bays: CRADLE.bays },
    arena: CRADLE.arena, shieldSupplies: CRADLE.shieldSupplies,
    messages: {
      start: 'THE CRADLE · BURST BOTH BROOD SACS', batteries: 'BURST BOTH BROOD SACS', core: 'THE NEST HEART IS OPEN',
      overload: 'THE BROOD IS WAKING · WATCH THE LANES', destroyed: 'THE CRADLE IS BURNING · JUMP',
      approach: 'THE GROUND IS MOVING · THE CRADLE STIRS',
    },
  },
};

/** The boss that ends a campaign mission, if any. */
export const MISSION_BOSS: Readonly<Record<MissionId, BossId | null>> = { training: 'warden', bastion: 'bastion', 'deep-bloom': 'veil', 'cold-vector': 'ark', 'brood-strike': 'cradle' };

export function missionBoss(mission: MissionId | undefined): BossDefinition | null {
  const id = mission ? MISSION_BOSS[mission] : null;
  return id ? BOSSES[id] : null;
}
