import type { BossId, BossPart, Difficulty, MissionId } from '../shared/contracts';
import { BASTION } from './bastion';
import { HELION_ARK } from './ark';
import { WARDEN } from './warden';
import { VEIL } from './veil';
import { CRADLE } from './cradle';
import { ECLIPSE } from './eclipse';

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

export interface BossPartSpec { x: number; s: number; radius: number; hp: number }

/**
 * A boss's first-phase targets, in spawn and attack-rotation order: the first pair, then THE ECLIPSE's prow vent where the
 * boss has one. Every other boss keeps exactly its pair.
 */
export function phaseOneParts(def: Pick<BossDefinition, 'parts'>): readonly Exclude<BossPart, 'core'>[] {
  return def.parts.prow ? ['left', 'right', 'prow'] : ['left', 'right'];
}
/** Every module a boss spawns, in order: its first-phase targets, then the core. */
export const bossParts = (def: Pick<BossDefinition, 'parts'>): readonly BossPart[] => [...phaseOneParts(def), 'core'];

export interface BossDefinition {
  id: BossId;
  name: string;
  arrivesAt: number;
  approachEndsAt: number;
  arrivalDuration: number;
  entryS: number;
  row: number;
  targetHeight: number;
  /** Its modules relative to the pivot. `prow` (THE ECLIPSE only) joins the first pair's phase as a third target. */
  parts: Readonly<Record<Exclude<BossPart, 'prow'>, BossPartSpec>> & { readonly prow?: BossPartSpec };
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
  coreMoves?: readonly ('burst' | 'fan' | 'spiral')[];
  /**
   * The 'spiral' core/overload move: `arms` streams turning at `turn` rad/s for `duration` s, a volley every `interval`;
   * `rest` (s) holds the next attack until a slow spiral's streams have cleared the screen.
   */
  spiral?: { arms: number; turn: number; interval: number; duration: number; speed: number; rest?: number };
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
    // Overload texts name the moves the boss really cycles (user, 30 October: "watch the overloads text appear on a boss
    // but i felt the spiral"): lanes alone only where the overload is lanes and bursts.
    messages: {
      start: 'BASTION-9 · BREAK BOTH BATTERIES', batteries: 'BREAK BOTH BATTERIES', core: 'CORE EXPOSED',
      overload: 'CORE OVERLOAD · LANES AND FANS', destroyed: 'BASTION-9 DESTROYED · JUMP',
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
    coreMoves: ['spiral', 'fan', 'burst', 'fan'],
    spiral: { arms: 4, turn: 1.7, interval: 0.12, duration: 3, speed: 4.8 },
    recovery: VEIL.recovery, transitionRecovery: VEIL.transitionRecovery,
    overloadFraction: VEIL.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: VEIL.podBurst, core: VEIL.heartBurst }, fan: VEIL.heartFan,
    // It deploys pod waves from its front bays while its heart is open, and more once it overloads.
    launches: { ...VEIL.launches, template: 'veil-pods', bays: VEIL.bays },
    arena: VEIL.arena, shieldSupplies: VEIL.shieldSupplies,
    messages: {
      start: 'THE VEIL · BURST BOTH GILL PODS', batteries: 'BURST BOTH GILL PODS', core: 'THE HEART IS OPEN',
      overload: 'HEART OVERLOAD · SPIRALS AND LANES', destroyed: 'THE VEIL IS FALLING · JUMP',
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
    coreMoves: ['spiral', 'burst', 'fan', 'burst'],
    // Its slow, wide spiral rests 1.4 s: its streams still crossed the screen when the next burst and a hatchling wave's
    // charging shots came, sealing both edges and the centre (tests/sim/fairness, Brood Strike, 27 October).
    spiral: { arms: 3, turn: -1.35, interval: 0.15, duration: 3.2, speed: 5.1, rest: 1.4 },
    recovery: CRADLE.recovery, transitionRecovery: CRADLE.transitionRecovery,
    overloadFraction: CRADLE.overloadFraction, extractionDuration: DEPARTURE.duration,
    bursts: { pair: CRADLE.sacBurst, core: CRADLE.heartBurst }, fan: CRADLE.heartFan,
    // Hatchling waves from its brood bays while its heart is open, and more once it overloads.
    launches: { ...CRADLE.launches, template: 'veil-pods', bays: CRADLE.bays },
    arena: CRADLE.arena, shieldSupplies: CRADLE.shieldSupplies,
    messages: {
      start: 'THE CRADLE · BURST BOTH BROOD SACS', batteries: 'BURST BOTH BROOD SACS', core: 'THE NEST HEART IS OPEN',
      overload: 'THE BROOD IS WAKING · SPIRALS AND LANES', destroyed: 'THE CRADLE IS BURNING · JUMP',
      approach: 'THE GROUND IS MOVING · THE CRADLE STIRS',
    },
  },
  eclipse: {
    id: 'eclipse', name: 'THE ECLIPSE',
    arrivesAt: ECLIPSE.arrivesAt, approachEndsAt: ECLIPSE.approachEndsAt, arrivalDuration: ECLIPSE.arrivalDuration,
    entryS: ECLIPSE.entryS, row: ECLIPSE.row, targetHeight: ECLIPSE.targetHeight,
    parts: {
      left: { x: -ECLIPSE.ventOffset, s: ECLIPSE.ventS, radius: ECLIPSE.ventRadius, hp: ECLIPSE.ventHp },
      right: { x: ECLIPSE.ventOffset, s: ECLIPSE.ventS, radius: ECLIPSE.ventRadius, hp: ECLIPSE.ventHp },
      core: { x: 0, s: ECLIPSE.reactorS, radius: ECLIPSE.reactorRadius, hp: ECLIPSE.reactorHp },
      prow: { x: 0, s: ECLIPSE.prowS, radius: ECLIPSE.prowRadius, hp: ECLIPSE.ventHp },
    },
    pairAttack: 'burst', coreAttack: 'fan-burst',
    warning: ECLIPSE.warning, laser: null, beamWarning: ECLIPSE.beamWarning, overload: ECLIPSE.overload,
    overloadMoves: ['core-lane', 'spiral', 'fan', 'side-lanes', 'burst', 'cross', 'spiral', 'fan'], overloadRecovery: 0.45,
    coreMoves: ['spiral', 'burst', 'burst', 'fan'],
    spiral: { arms: 4, turn: -2.05, interval: 0.16, duration: 2.6, speed: 5 },
    recovery: ECLIPSE.recovery, transitionRecovery: ECLIPSE.transitionRecovery,
    overloadFraction: ECLIPSE.overloadFraction, extractionDuration: DEPARTURE.duration,
    // Its prow vent (the third first-phase target, user 31 October) fires the vents' aimed burst in their rotation.
    bursts: { pair: ECLIPSE.ventBurst, core: ECLIPSE.reactorBurst }, fan: ECLIPSE.reactorFan,
    // Drone waves from its vents while its reactor is open, and more once it overloads.
    launches: { ...ECLIPSE.launches, template: 'veil-pods', bays: ECLIPSE.bays },
    arena: ECLIPSE.arena, shieldSupplies: ECLIPSE.shieldSupplies,
    messages: {
      start: 'THE ECLIPSE · BREAK ALL THREE ENERGY VENTS', batteries: 'BREAK ALL THREE ENERGY VENTS', core: 'THE REACTOR IS OPEN',
      overload: 'REACTOR OVERLOAD · SPIRALS AND LANES', destroyed: 'THE ECLIPSE IS FALLING · JUMP',
      approach: 'THE LIGHT IS DYING · THE ECLIPSE AWAKENS',
    },
  },
};

/** The boss that ends a campaign mission, if any. */
export const MISSION_BOSS: Readonly<Record<MissionId, BossId | null>> = { training: 'warden', bastion: 'bastion', 'deep-bloom': 'veil', 'cold-vector': 'ark', 'brood-strike': 'cradle', 'final-horizon': 'eclipse' };

export function missionBoss(mission: MissionId | undefined): BossDefinition | null {
  const id = mission ? MISSION_BOSS[mission] : null;
  return id ? BOSSES[id] : null;
}
