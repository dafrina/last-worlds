import type { EnemyKind, MissionId, WeaponId } from '../shared/contracts';
import { FORMATIONS, slotFlies, type FormationId, type FormationRank } from './formations';
import { ENDLESS_CYCLE, cycleSector, endlessPlanet, isFirstVisit, isPrologue } from './endless';

/**
 * One authored squadron placement. 'view' anchors the template to the camera center when the cue is admitted
 * (the mandatory battle follows the player across the wide map); 'world' pins it to a world x for optional
 * side routes. `x` is the anchor's lateral offset and `mirror` flies the validated mirror image.
 */
export interface FormationPlacement {
  readonly formation: FormationId;
  readonly x?: number;
  readonly anchor?: 'view' | 'world';
  readonly mirror?: boolean;
}

/** Pressure arc labels (docs/03 §6): introduction, pressure, recovery, pressure, climax, recovery. */
export type PacingPhase = 'intro' | 'pressure' | 'recovery' | 'climax';

export interface EncounterCue {
  readonly at: number;
  readonly id: string;
  readonly phase: PacingPhase;
  readonly formations: readonly FormationPlacement[];
  readonly message?: string;
  readonly pickup?: { readonly x: number; readonly s: number; readonly kind: 'credit' | 'power' | 'weapon'; readonly value: number; readonly weapon?: WeaponId };
}

/** Seconds between a two-flank alert and the members' entry. */
export const ALERT_LEAD = 1.4;

const f = (formation: FormationId, x = 0, mirror = false): FormationPlacement => ({ formation, x, mirror });
const world = (formation: FormationId, x: number, mirror = false): FormationPlacement => ({ formation, x, mirror, anchor: 'world' });

/*
 * Cue times are the earliest admission times. At most one air squadron flies in a stretch of airspace at once
 * (src/sim/airspace.ts), so a later air squadron waits until the previous one is destroyed or gone; ground
 * batteries may arrive beneath it. A pilot who destroys squadrons quickly therefore meets the next one sooner.
 */

/**
 * Training sortie over Luna. Teaches each squadron, then the same arc at pressure, then WARDEN-1 lands at 113 s
 * (its approach closes at 105 s). Its climax keeps lighter batteries and a three-dart finale; Rolling Thunder and
 * endless carry the heaviest phrases. No seed or offsets.
 */
export const TRAINING: readonly EncounterCue[] = [
  { at: 2, id: 't-first-contact', phase: 'intro', message: 'LINE UP TO FIRE', formations: [f('solo-dart')] },
  { at: 7, id: 't-arrow', phase: 'intro', message: 'ARROWHEAD · KEEP MOVING', formations: [f('arrow-3')] },
  { at: 13, id: 't-weaver', phase: 'intro', message: 'WATCH THE WARNING · THEN EVADE', formations: [f('solo-weaver', -1.5)] },
  { at: 17, id: 't-ground', phase: 'pressure', message: 'GROUND CORES ARE TARGETS TOO', formations: [f('battery-2')] },
  { at: 20, id: 't-line', phase: 'pressure', message: 'LINE ABREAST · READ THE SWEEP', formations: [f('line-dart-4')] },
  { at: 26, id: 't-battery-3', phase: 'pressure', formations: [f('battery-3')] },
  { at: 29, id: 't-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 35, id: 't-dive', phase: 'pressure', message: 'FUEL SKIDS · SHOOT THEM FOR SALVAGE', formations: [f('dive-pair'), f('fuel-pair')] },
  { at: 39, id: 't-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-dart', -7.5), world('fuel-pair', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 44, id: 't-east', phase: 'recovery', message: 'OPTIONAL OUTPOST · EAST', formations: [world('battery-2', 7.5)] },
  { at: 49, id: 't-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 53, id: 't-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 56, id: 't-snake', phase: 'pressure', message: 'COLUMN CROSSING', formations: [f('snake-weaver-5')] },
  { at: 61, id: 't-lancer', phase: 'pressure', message: 'BEAM LOCK · LEAVE THE MARKED LANE', formations: [f('solo-lancer', 1)] },
  { at: 64, id: 't-battery-2', phase: 'pressure', formations: [f('battery-2')] },
  { at: 67, id: 't-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true), f('fuel-depot')] },
  { at: 72, id: 't-arrow-5', phase: 'climax', message: 'SQUADRONS INBOUND', formations: [f('arrow-5')] },
  { at: 75, id: 't-battery-climax-1', phase: 'climax', formations: [f('battery-3')] },
  { at: 79, id: 't-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 84, id: 't-battery-climax', phase: 'climax', formations: [f('battery-2')] },
  { at: 86, id: 't-diamond', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 92, id: 't-snake-climax', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 95, id: 't-battery-late', phase: 'climax', formations: [f('battery-2')] },
  { at: 97, id: 't-last', phase: 'climax', message: 'LAST PATROL', formations: [f('line-dart-4')] },
  { at: 101, id: 't-last-ground', phase: 'climax', formations: [f('battery-3')] },
  { at: 103, id: 't-last-arrow', phase: 'climax', formations: [f('arrow-3')] },
  { at: 104, id: 't-relief', phase: 'recovery', formations: [] },
];

/** Rolling Thunder approach. Ends before BASTION.approachEndsAt; relief precedes the fortress. */
export const ROLLING_THUNDER: readonly EncounterCue[] = [
  { at: 2, id: 'r-arrow', phase: 'intro', formations: [f('arrow-3')] },
  { at: 7, id: 'r-ground', phase: 'intro', formations: [f('battery-2')] },
  { at: 11, id: 'r-line', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 16, id: 'r-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 18, id: 'r-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 24, id: 'r-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 27, id: 'r-battery-2', phase: 'pressure', message: 'FUEL DEPOT · ONE SHOT SETS IT OFF', formations: [f('depot-2')] },
  { at: 30, id: 'r-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 36, id: 'r-dive', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 41, id: 'r-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('battery-2', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 47, id: 'r-pincer', phase: 'pressure', formations: [f('pincer-4')] },
  { at: 51, id: 'r-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 54, id: 'r-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 60, id: 'r-battery-3', phase: 'pressure', formations: [f('depot-3')] },
  { at: 63, id: 'r-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true), f('fuel-depot')] },
  { at: 69, id: 'r-arrow-5', phase: 'climax', message: 'FORTRESS ESCORT · BREAK THROUGH', formations: [f('arrow-5')] },
  { at: 73, id: 'r-battery-climax', phase: 'climax', formations: [f('battery-3')] },
  { at: 76, id: 'r-diamond-climax', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 82, id: 'r-battery-4-climax', phase: 'climax', formations: [f('battery-4')] },
  { at: 84, id: 'r-snake-climax', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 89, id: 'r-pincer-climax', phase: 'climax', formations: [f('pincer-4')] },
  { at: 93, id: 'r-last', phase: 'climax', formations: [f('battery-2')] },
  { at: 98, id: 'r-relief', phase: 'recovery', formations: [] },
];

/** Endless sector 1 (pace 0.8): formations from the first seconds, then the full pressure arc. */
const SECTOR_OPENING: readonly EncounterCue[] = [
  { at: 2, id: 'e1-contact', phase: 'intro', formations: [f('solo-dart')] },
  { at: 6, id: 'e1-arrow', phase: 'intro', formations: [f('arrow-3')] },
  { at: 11, id: 'e1-ground', phase: 'intro', message: 'POWER CELL AHEAD', formations: [f('solo-turret')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 16, id: 'e1-line', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 24, id: 'e1-fan', phase: 'pressure', message: 'FAN CANNON AHEAD · COLLECT TO EQUIP', formations: [f('battery-2')], pickup: { kind: 'weapon', x: 2, s: 17, value: 1, weapon: 'fan' } },
  { at: 26, id: 'e1-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 30, id: 'e1-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 33, id: 'e1-battery-2', phase: 'pressure', formations: [f('battery-2')] },
  { at: 36, id: 'e1-arrow-5', phase: 'pressure', formations: [f('arrow-5')] },
  { at: 44, id: 'e1-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-weaver', -7.5), world('fuel-pair', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 5 } },
  { at: 50, id: 'e1-diamond', phase: 'pressure', message: 'SEEKER ARRAY AHEAD · COLLECT TO EQUIP', formations: [f('diamond-lancer')], pickup: { kind: 'weapon', x: -2, s: 17, value: 1, weapon: 'seeker' } },
  { at: 54, id: 'e1-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 58, id: 'e1-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 63, id: 'e1-line-dart', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 66, id: 'e1-battery-3', phase: 'pressure', formations: [f('battery-2')] },
  { at: 69, id: 'e1-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 73, id: 'e1-battery-4', phase: 'climax', formations: [f('battery-4')] },
  { at: 76, id: 'e1-arrow-climax', phase: 'climax', formations: [f('arrow-5')] },
  { at: 80, id: 'e1-battery-climax', phase: 'climax', formations: [f('battery-3')] },
  { at: 86, id: 'e1-east', phase: 'recovery', message: 'OPTIONAL OUTPOST · EAST', formations: [world('battery-2', 7.5)] },
];

/** Endless sectors 2-3: back-to-back squadrons with batteries beneath them and shorter recoveries. */
const SECTOR_PRESSURE: readonly EncounterCue[] = [
  { at: 2, id: 'e2-arrow', phase: 'intro', formations: [f('arrow-5')] },
  { at: 5, id: 'e2-ground', phase: 'pressure', formations: [f('battery-3')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 9, id: 'e2-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 13, id: 'e2-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 15, id: 'e2-snake', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 20, id: 'e2-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 23, id: 'e2-battery-2', phase: 'pressure', formations: [f('battery-2')] },
  { at: 26, id: 'e2-line', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 33, id: 'e2-west', phase: 'recovery', formations: [world('battery-2', -7.5)], pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'fan' } },
  { at: 38, id: 'e2-pincer', phase: 'pressure', formations: [f('pincer-4')] },
  { at: 41, id: 'e2-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 44, id: 'e2-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 49, id: 'e2-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 52, id: 'e2-battery-3', phase: 'pressure', formations: [f('battery-2')] },
  { at: 54, id: 'e2-seeker', phase: 'pressure', formations: [f('dive-pair')], pickup: { kind: 'weapon', x: 0, s: 17, value: 1, weapon: 'seeker' } },
  { at: 58, id: 'e2-climax-diamond', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 61, id: 'e2-climax-battery', phase: 'climax', formations: [f('battery-4')] },
  { at: 64, id: 'e2-climax-snake', phase: 'climax', formations: [f('snake-weaver-5')] },
  { at: 68, id: 'e2-climax-arrow', phase: 'climax', formations: [f('arrow-5')] },
  { at: 71, id: 'e2-climax-battery-3', phase: 'climax', formations: [f('battery-3')] },
  { at: 74, id: 'e2-climax-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 84, id: 'e2-east', phase: 'recovery', formations: [world('battery-3', 7.5)] },
];

/** Endless sector 4 onward: the capped peak arc, repeated at the capped ramp. */
const SECTOR_PEAK: readonly EncounterCue[] = [
  { at: 2, id: 'e3-line', phase: 'intro', formations: [f('line-dart-4')] },
  { at: 4, id: 'e3-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 7, id: 'e3-pincer', phase: 'pressure', formations: [f('pincer-4')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 10, id: 'e3-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 12, id: 'e3-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 17, id: 'e3-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 19, id: 'e3-battery-2', phase: 'pressure', formations: [f('battery-2')] },
  { at: 21, id: 'e3-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 25, id: 'e3-arrow', phase: 'pressure', formations: [f('arrow-5')] },
  { at: 31, id: 'e3-west', phase: 'recovery', formations: [world('arrow-3', -7.5)], pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'fan' } },
  { at: 36, id: 'e3-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 38, id: 'e3-battery-3', phase: 'pressure', formations: [f('battery-3')] },
  { at: 41, id: 'e3-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 44, id: 'e3-arrow-2', phase: 'pressure', formations: [f('arrow-5')] },
  { at: 46, id: 'e3-battery-late', phase: 'pressure', formations: [f('battery-4')] },
  { at: 48, id: 'e3-seeker', phase: 'pressure', formations: [f('diamond-lancer')], pickup: { kind: 'weapon', x: -1, s: 17, value: 1, weapon: 'seeker' } },
  { at: 53, id: 'e3-climax-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 55, id: 'e3-climax-battery', phase: 'climax', formations: [f('battery-3')] },
  { at: 58, id: 'e3-climax-snake', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 61, id: 'e3-climax-arrow', phase: 'climax', formations: [f('arrow-5')] },
  { at: 63, id: 'e3-climax-battery-4', phase: 'climax', formations: [f('battery-4')] },
  { at: 66, id: 'e3-climax-line', phase: 'climax', formations: [f('line-dart-4')] },
  { at: 70, id: 'e3-climax-diamond', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 72, id: 'e3-climax-battery-2', phase: 'climax', formations: [f('battery-2')] },
  { at: 74, id: 'e3-climax-echelon', phase: 'climax', formations: [f('echelon-4')] },
  { at: 84, id: 'e3-east', phase: 'recovery', formations: [world('battery-2', 7.5)] },
];

/** Endless Vesper, first sector of a Vesper stint: the Vesper roster from the first seconds. */
const VESPER_OPENING: readonly EncounterCue[] = [
  { at: 2, id: 'ev1-needle', phase: 'intro', formations: [f('needle-solo')] },
  { at: 5, id: 'ev1-diamond', phase: 'intro', formations: [f('diamond-solo')] },
  { at: 9, id: 'ev1-missiles', phase: 'intro', message: 'POWER CELL AHEAD', formations: [f('missile-2')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 13, id: 'ev1-line', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 18, id: 'ev1-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 21, id: 'ev1-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 27, id: 'ev1-missiles-2', phase: 'pressure', formations: [f('missile-2')] },
  { at: 30, id: 'ev1-heavy', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 36, id: 'ev1-west', phase: 'recovery', message: 'CLIFF BATTERY · WEST', formations: [world('missile-2', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 5 } },
  { at: 42, id: 'ev1-line-2', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 46, id: 'ev1-missiles-4', phase: 'pressure', formations: [f('missile-3')] },
  { at: 49, id: 'ev1-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 55, id: 'ev1-convoy', phase: 'climax', message: 'ESCORT CONVOY', formations: [f('diamond-convoy')] },
  { at: 59, id: 'ev1-convoy-missiles', phase: 'climax', formations: [f('missile-2')] },
  { at: 62, id: 'ev1-convoy-line', phase: 'climax', formations: [f('needle-line-3', -1)] },
  { at: 67, id: 'ev1-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 72, id: 'ev1-convoy-missiles-2', phase: 'climax', formations: [f('missile-3')] },
  { at: 84, id: 'ev1-east', phase: 'recovery', formations: [world('needle-solo', 7.5)] },
];

/** Endless Vesper, later sectors of a first Vesper stint. */
const VESPER_PRESSURE: readonly EncounterCue[] = [
  { at: 2, id: 'ev2-line', phase: 'intro', formations: [f('needle-line-3')] },
  { at: 5, id: 'ev2-missiles', phase: 'pressure', formations: [f('missile-3')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 9, id: 'ev2-heavy', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 13, id: 'ev2-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 17, id: 'ev2-missiles-2', phase: 'pressure', formations: [f('missile-2')] },
  { at: 20, id: 'ev2-convoy', phase: 'pressure', formations: [f('diamond-convoy')] },
  { at: 26, id: 'ev2-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 32, id: 'ev2-west', phase: 'recovery', formations: [world('missile-2', -7.5)], pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'seeker' } },
  { at: 38, id: 'ev2-line-2', phase: 'pressure', formations: [f('needle-line-3', 1)] },
  { at: 41, id: 'ev2-missiles-4', phase: 'pressure', formations: [f('missile-2')] },
  { at: 44, id: 'ev2-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 49, id: 'ev2-heavy-2', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 53, id: 'ev2-climax-missiles', phase: 'climax', formations: [f('missile-3')] },
  { at: 56, id: 'ev2-climax-convoy', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 61, id: 'ev2-climax-line', phase: 'climax', formations: [f('needle-line-3')] },
  { at: 65, id: 'ev2-climax-missiles-2', phase: 'climax', formations: [f('missile-2')] },
  { at: 68, id: 'ev2-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 84, id: 'ev2-east', phase: 'recovery', formations: [world('missile-2', 7.5)] },
];

/** Endless Vesper on later visits: the capped peak arc. */
const VESPER_PEAK: readonly EncounterCue[] = [
  { at: 2, id: 'ev3-convoy', phase: 'intro', formations: [f('diamond-convoy')] },
  { at: 4, id: 'ev3-missiles', phase: 'pressure', formations: [f('missile-3')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 8, id: 'ev3-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 11, id: 'ev3-missiles-2', phase: 'pressure', formations: [f('missile-2')] },
  { at: 13, id: 'ev3-line', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 18, id: 'ev3-convoy-2', phase: 'pressure', formations: [f('diamond-convoy')] },
  { at: 21, id: 'ev3-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 25, id: 'ev3-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 31, id: 'ev3-west', phase: 'recovery', formations: [world('needle-solo', -7.5), world('fuel-depot', -7.5)], pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'fan' } },
  { at: 36, id: 'ev3-line-2', phase: 'pressure', formations: [f('needle-line-3', -1)] },
  { at: 38, id: 'ev3-missiles-4', phase: 'pressure', formations: [f('missile-2')] },
  { at: 41, id: 'ev3-heavy', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 45, id: 'ev3-missiles-5', phase: 'pressure', formations: [f('missile-3')] },
  { at: 48, id: 'ev3-column-2', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 53, id: 'ev3-climax-convoy', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 55, id: 'ev3-climax-missiles', phase: 'climax', formations: [f('missile-3')] },
  { at: 59, id: 'ev3-climax-line', phase: 'climax', formations: [f('needle-line-3', 1)] },
  { at: 63, id: 'ev3-climax-missiles-2', phase: 'climax', formations: [f('missile-2')] },
  { at: 66, id: 'ev3-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 84, id: 'ev3-east', phase: 'recovery', formations: [world('missile-3', 7.5)] },
];

export const ENDLESS_SECTORS = {
  opening: SECTOR_OPENING, pressure: SECTOR_PRESSURE, peak: SECTOR_PEAK,
  vesperOpening: VESPER_OPENING, vesperPressure: VESPER_PRESSURE, vesperPeak: VESPER_PEAK,
} as const;

/**
 * Cold Vector (Vesper, docs/17 §5): a high-contrast introduction over the shelf coast, Needle squadrons with
 * narrow beam lanes, relief, missile batteries on the ice cliffs, a heavy Diamond escort convoy, relief, then
 * the scroll eases to a stop over open ocean for the Helion Ark (HELION_ARK.approachEndsAt / arrivesAt).
 */
export const COLD_VECTOR: readonly EncounterCue[] = [
  { at: 2, id: 'v-first-needle', phase: 'intro', message: 'COLD VECTOR · NARROW BEAMS · WATCH THE LANE', formations: [f('needle-solo')] },
  { at: 7, id: 'v-first-diamond', phase: 'intro', message: 'DIAMOND HEAVY · ALTERNATING WINGS', formations: [f('diamond-solo')] },
  { at: 13, id: 'v-first-missiles', phase: 'intro', message: 'MISSILE BATTERIES FIRE DOWN THEIR OWN COLUMN', formations: [f('missile-2')] },
  { at: 17, id: 'v-needle-line', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 22, id: 'v-missiles', phase: 'pressure', formations: [f('missile-2')] },
  { at: 25, id: 'v-needle-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 31, id: 'v-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 34, id: 'v-needle-line-2', phase: 'pressure', formations: [f('needle-line-3', 1)] },
  { at: 41, id: 'v-needle-column-left', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 48, id: 'v-west', phase: 'recovery', message: 'CLIFF BATTERY · WEST', formations: [world('missile-2', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 53, id: 'v-east', phase: 'recovery', message: 'LONE INTERCEPTOR · EAST', formations: [world('needle-solo', 7.5), world('fuel-depot', 7.5)] },
  { at: 58, id: 'v-cliff-missiles', phase: 'pressure', message: 'MISSILE BATTERIES ON THE CLIFFS', formations: [f('missile-3')] },
  { at: 61, id: 'v-cliff-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 66, id: 'v-cliff-missiles-2', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 69, id: 'v-cliff-diamond', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 75, id: 'v-cliff-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 78, id: 'v-cliff-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 84, id: 'v-cliff-missiles-4', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 89, id: 'v-convoy', phase: 'climax', message: 'ESCORT CONVOY · BREAK THE DIAMONDS', formations: [f('diamond-convoy')] },
  { at: 94, id: 'v-convoy-missiles', phase: 'climax', formations: [f('missile-3')] },
  { at: 100, id: 'v-convoy-needles', phase: 'climax', formations: [f('needle-line-3')] },
  { at: 106, id: 'v-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 112, id: 'v-convoy-missiles-2', phase: 'climax', formations: [f('missile-2')] },
  { at: 117, id: 'v-convoy-column', phase: 'climax', formations: [f('needle-column-5', 0, true)] },
  { at: 123, id: 'v-convoy-3', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 129, id: 'v-convoy-missiles-3', phase: 'climax', formations: [f('missile-3')] },
  { at: 135, id: 'v-convoy-needles-2', phase: 'climax', formations: [f('needle-line-3', -1)] },
  { at: 141, id: 'v-convoy-4', phase: 'climax', message: 'LAST ESCORT · OPEN WATER AHEAD', formations: [f('diamond-convoy')] },
  { at: 147, id: 'v-convoy-missiles-4', phase: 'climax', formations: [f('missile-2')] },
  { at: 160, id: 'v-relief', phase: 'recovery', formations: [] },
];

/**
 * Deep Bloom (Nacre, docs/20): sine-flight weaver columns over the mire, Needle beams between the islands, ground
 * batteries and missile batteries on the islands and on pontoons, Diamond heavies, overlapping rhythms; relief, then
 * the scroll eases to a stop over open mire for THE VEIL (VEIL.approachEndsAt / arrivesAt). Pressure close to Cold
 * Vector.
 */
export const DEEP_BLOOM: readonly EncounterCue[] = [
  { at: 2, id: 'n-first-weavers', phase: 'intro', message: 'DEEP BLOOM · SINE FLIGHTS OVER THE MIRE', formations: [f('line-weaver-4'), f('fuel-pair')] },
  { at: 8, id: 'n-first-needle', phase: 'intro', formations: [f('needle-solo')] },
  { at: 12, id: 'n-first-batteries', phase: 'intro', message: 'BATTERIES ON THE ISLANDS', formations: [f('battery-2')] },
  { at: 16, id: 'n-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 21, id: 'n-missiles', phase: 'pressure', formations: [f('missile-2')] },
  { at: 24, id: 'n-needle-line', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 27, id: 'n-pulsar', phase: 'pressure', message: 'PULSAR · ITS STREAM FOLLOWS YOU · KEEP MOVING', formations: [f('pulsar-solo')] },
  { at: 30, id: 'n-battery-3', phase: 'pressure', formations: [f('depot-3')] },
  { at: 33, id: 'n-diamond', phase: 'pressure', message: 'DIAMOND HEAVY', formations: [f('diamond-solo')] },
  { at: 40, id: 'n-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 45, id: 'n-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 51, id: 'n-west', phase: 'recovery', message: 'GLOWING GROVE · WEST', formations: [world('battery-2', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 56, id: 'n-east', phase: 'recovery', message: 'LONE INTERCEPTOR · EAST', formations: [world('needle-solo', 7.5), world('fuel-depot', 7.5)] },
  { at: 62, id: 'n-weaver-line', phase: 'pressure', formations: [f('line-weaver-4', 1)] },
  { at: 66, id: 'n-battery-mid', phase: 'pressure', formations: [f('battery-3')] },
  { at: 69, id: 'n-needle-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 72, id: 'n-pulsar-pair', phase: 'pressure', formations: [f('pulsar-pair')] },
  { at: 75, id: 'n-missiles-mid', phase: 'pressure', formations: [f('missile-2')] },
  { at: 78, id: 'n-snake-2', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 84, id: 'n-diamond-2', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 90, id: 'n-climax-convoy', phase: 'climax', message: 'OVERLAPPING RHYTHMS', formations: [f('diamond-convoy')] },
  { at: 95, id: 'n-climax-batteries', phase: 'climax', formations: [f('battery-3')] },
  { at: 101, id: 'n-climax-weavers', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 106, id: 'n-climax-missiles', phase: 'climax', formations: [f('missile-3')] },
  { at: 110, id: 'n-climax-needles', phase: 'climax', formations: [f('needle-line-3', -1)] },
  { at: 113, id: 'n-climax-pulsars', phase: 'climax', formations: [f('pulsar-solo', -1)] },
  { at: 116, id: 'n-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 122, id: 'n-climax-batteries-2', phase: 'climax', formations: [f('depot-3')] },
  { at: 126, id: 'n-climax-weavers-2', phase: 'climax', formations: [f('line-weaver-4', -1)] },
  { at: 131, id: 'n-last-needles', phase: 'climax', message: 'LAST SQUADRON · OPEN MIRE AHEAD', formations: [f('needle-column-5', 0, true)] },
  { at: 137, id: 'n-last-missiles', phase: 'climax', formations: [f('missile-2')] },
  { at: 142, id: 'n-relief', phase: 'recovery', formations: [] },
];

/**
 * Brood Strike over Amnion, the brood wastes (docs/27, 23 October 2026): the final campaign mission, on Deep Bloom's
 * proven timing grid (intro, pressure, a recovery pair to the flanks, climax, relief before THE CRADLE) with its own
 * mix: drone flights (weavers and darts) over the canyons, nest spires (batteries) and spore mortars (missile
 * batteries) on the plateaus, egg-sac depots to burst, heavies in the climax, and only two Pulsars (a tracking stream is
 * the hardest thing to read over the glowing canyons). Enemy craft and ground pieces keep their kinds' behaviour.
 */
export const BROOD_STRIKE: readonly EncounterCue[] = [
  { at: 2, id: 'b-first-drones', phase: 'intro', message: 'BROOD STRIKE · DRONES OVER THE CANYONS', formations: [f('line-weaver-4'), f('fuel-pair')] },
  { at: 8, id: 'b-first-darts', phase: 'intro', formations: [f('arrow-3')] },
  { at: 12, id: 'b-first-spires', phase: 'intro', message: 'NEST SPIRES ON THE PLATEAU', formations: [f('battery-2')] },
  { at: 16, id: 'b-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 21, id: 'b-mortars', phase: 'pressure', message: 'SPORE MORTARS · EACH FIRES DOWN ITS OWN COLUMN', formations: [f('missile-2')] },
  { at: 24, id: 'b-darts', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 27, id: 'b-eggs', phase: 'pressure', message: 'EGG SACS · BURST THEM', formations: [f('depot-3')] },
  { at: 30, id: 'b-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 33, id: 'b-heavy', phase: 'pressure', message: 'BROOD HEAVY', formations: [f('diamond-solo')] },
  { at: 40, id: 'b-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 45, id: 'b-mortars-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 51, id: 'b-west', phase: 'recovery', message: 'EGG FIELD · WEST', formations: [world('fuel-depot', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 56, id: 'b-east', phase: 'recovery', message: 'LONE SPIRE · EAST', formations: [world('battery-2', 7.5)] },
  { at: 62, id: 'b-drone-line', phase: 'pressure', formations: [f('line-weaver-4', 1)] },
  { at: 66, id: 'b-spires-mid', phase: 'pressure', formations: [f('battery-3')] },
  { at: 69, id: 'b-needle-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 72, id: 'b-pulsar', phase: 'pressure', message: 'PULSAR · ITS STREAM FOLLOWS YOU · KEEP MOVING', formations: [f('pulsar-solo')] },
  { at: 75, id: 'b-eggs-mid', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 78, id: 'b-snake-2', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 84, id: 'b-heavy-2', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 90, id: 'b-climax-convoy', phase: 'climax', message: 'THE BROOD RISES', formations: [f('diamond-convoy')] },
  { at: 95, id: 'b-climax-spires', phase: 'climax', formations: [f('battery-3')] },
  { at: 101, id: 'b-climax-drones', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 106, id: 'b-climax-mortars', phase: 'climax', formations: [f('missile-3')] },
  { at: 110, id: 'b-climax-darts', phase: 'climax', formations: [f('arrow-5')] },
  { at: 113, id: 'b-climax-pulsar', phase: 'climax', formations: [f('pulsar-solo', -1)] },
  { at: 116, id: 'b-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 122, id: 'b-climax-eggs', phase: 'climax', formations: [f('depot-3')] },
  { at: 126, id: 'b-climax-drones-2', phase: 'climax', formations: [f('line-weaver-4', -1)] },
  { at: 131, id: 'b-last-needles', phase: 'climax', message: 'LAST SWARM · THE NEST IS AHEAD', formations: [f('needle-column-5', 0, true)] },
  { at: 137, id: 'b-last-mortars', phase: 'climax', formations: [f('missile-2')] },
  { at: 142, id: 'b-relief', phase: 'recovery', formations: [] },
];

/**
 * Final Horizon over Umbra, the eternal eclipse (docs/28, 24 October 2026): the final campaign mission, on Brood Strike's
 * proven timing grid (intro, pressure, a recovery pair to the flanks, climax, relief before THE ECLIPSE) with the
 * Umbral fleet's mix: interceptor flights (darts and needles) over the shattered plains, heavy fighters (weavers),
 * defense turrets (batteries) and artillery mortars (missile batteries) on the plateaus, energy cells to break (depots),
 * elite hunters with their beams (lancers) and drone carriers (diamonds) in the climax, two artillery ships (Pulsars).
 * Pressure as Brood Strike's: the final planet is not made harder before it has been played.
 */
export const FINAL_HORIZON: readonly EncounterCue[] = [
  { at: 2, id: 'u-first-fighters', phase: 'intro', message: 'FINAL HORIZON · THE UMBRAL FLEET', formations: [f('line-weaver-4'), f('fuel-pair')] },
  { at: 8, id: 'u-first-interceptors', phase: 'intro', formations: [f('arrow-3')] },
  { at: 12, id: 'u-first-turrets', phase: 'intro', message: 'DEFENSE TURRETS ON THE OBSIDIAN', formations: [f('battery-2')] },
  { at: 16, id: 'u-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 21, id: 'u-mortars', phase: 'pressure', message: 'ARTILLERY · EACH FIRES DOWN ITS OWN COLUMN', formations: [f('missile-2')] },
  { at: 24, id: 'u-darts', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 27, id: 'u-cells', phase: 'pressure', message: 'ENERGY CELLS · BREAK THEM', formations: [f('depot-3')] },
  { at: 30, id: 'u-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 33, id: 'u-carrier', phase: 'pressure', message: 'DRONE CARRIER', formations: [f('diamond-solo')] },
  { at: 40, id: 'u-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 45, id: 'u-mortars-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 51, id: 'u-west', phase: 'recovery', message: 'ENERGY CELLS · WEST', formations: [world('fuel-depot', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 56, id: 'u-east', phase: 'recovery', message: 'LONE TURRET · EAST', formations: [world('battery-2', 7.5)] },
  { at: 62, id: 'u-fighter-line', phase: 'pressure', formations: [f('line-weaver-4', 1)] },
  { at: 66, id: 'u-turrets-mid', phase: 'pressure', formations: [f('battery-3')] },
  { at: 69, id: 'u-needle-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 72, id: 'u-artillery', phase: 'pressure', message: 'ARTILLERY SHIP · ITS STREAM FOLLOWS YOU · KEEP MOVING', formations: [f('pulsar-solo')] },
  { at: 75, id: 'u-cells-mid', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 78, id: 'u-snake-2', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 84, id: 'u-hunter', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 90, id: 'u-climax-convoy', phase: 'climax', message: 'THE FLEET CLOSES IN', formations: [f('diamond-convoy')] },
  { at: 95, id: 'u-climax-turrets', phase: 'climax', formations: [f('battery-3')] },
  { at: 101, id: 'u-climax-fighters', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 106, id: 'u-climax-mortars', phase: 'climax', formations: [f('missile-3')] },
  { at: 110, id: 'u-climax-darts', phase: 'climax', formations: [f('arrow-5')] },
  { at: 113, id: 'u-climax-artillery', phase: 'climax', formations: [f('pulsar-solo', -1)] },
  { at: 116, id: 'u-climax-convoy-2', phase: 'climax', formations: [f('diamond-convoy')] },
  { at: 122, id: 'u-climax-cells', phase: 'climax', formations: [f('depot-3')] },
  { at: 126, id: 'u-climax-fighters-2', phase: 'climax', formations: [f('line-weaver-4', -1)] },
  { at: 131, id: 'u-last-needles', phase: 'climax', message: 'LAST SQUADRON · THE ABYSS IS AHEAD', formations: [f('needle-column-5', 0, true)] },
  { at: 137, id: 'u-last-mortars', phase: 'climax', formations: [f('missile-2')] },
  { at: 142, id: 'u-relief', phase: 'recovery', formations: [] },
];

/**
 * Inserts an authored block into a sequence at `at`: the block's cues start there (their `at` is relative) and every
 * later cue moves back by `length` seconds.
 */
function extend(base: readonly EncounterCue[], at: number, length: number, block: readonly EncounterCue[]): readonly EncounterCue[] {
  return [...base.filter(cue => cue.at < at), ...block.map(cue => ({ ...cue, at: at + cue.at })),
    ...base.filter(cue => cue.at >= at).map(cue => ({ ...cue, at: cue.at + length }))];
}
/*
 * Longer campaign missions (user request, 16 October 2026), growing by mission: Training +10 s stays gentle; Rolling
 * Thunder +24 s, Cold Vector +28 s and Deep Bloom +36 s add authored stretches with fuel depots. Endless keeps the base
 * phrases (its sectors have their own length).
 */
export const TRAINING_SORTIE = extend(TRAINING, 49, 10, [
  { at: 0, id: 't-depot', phase: 'pressure', message: 'FUEL DEPOT · ONE SHOT SETS IT OFF', formations: [f('depot-2')] },
  { at: 4, id: 't-depot-arrow', phase: 'pressure', formations: [f('arrow-3')] },
]);
export const ROLLING_THUNDER_SORTIE = extend(ROLLING_THUNDER, 47, 24, [
  { at: 0, id: 'r-x-depot', phase: 'pressure', message: 'FUEL DEPOT · LIGHT IT UP', formations: [f('depot-3')] },
  { at: 3, id: 'r-x-line', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 9, id: 'r-x-depot-2', phase: 'pressure', formations: [f('depot-2')] },
  { at: 11, id: 'r-x-snake', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 17, id: 'r-x-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 19, id: 'r-x-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
]);
export const COLD_VECTOR_SORTIE = extend(COLD_VECTOR, 89, 28, [
  { at: 0, id: 'v-x-depot', phase: 'pressure', message: 'FUEL BARGES · BLOW THEM', formations: [f('depot-missile')] },
  { at: 3, id: 'v-x-needles', phase: 'pressure', formations: [f('needle-line-3', -1)] },
  { at: 9, id: 'v-x-diamond', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 12, id: 'v-x-missiles', phase: 'pressure', formations: [f('missile-3')] },
  { at: 16, id: 'v-x-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 21, id: 'v-x-depot-2', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 23, id: 'v-x-diamond-2', phase: 'pressure', formations: [f('diamond-solo')] },
]);
export const BROOD_STRIKE_SORTIE = extend(BROOD_STRIKE, 62, 36, [
  { at: 0, id: 'b-x-eggs', phase: 'pressure', message: 'EGG SACS IN THE BONE FIELD', formations: [f('depot-3')] },
  { at: 2, id: 'b-x-drones', phase: 'pressure', formations: [f('line-weaver-4', -1)] },
  { at: 8, id: 'b-x-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 12, id: 'b-x-eggs-2', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 15, id: 'b-x-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 21, id: 'b-x-heavy', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 25, id: 'b-x-eggs-3', phase: 'pressure', formations: [f('depot-2')] },
  { at: 28, id: 'b-x-column', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 33, id: 'b-x-mortars', phase: 'pressure', formations: [f('missile-2')] },
]);
export const FINAL_HORIZON_SORTIE = extend(FINAL_HORIZON, 62, 36, [
  { at: 0, id: 'u-x-cells', phase: 'pressure', message: 'ENERGY CELLS ON THE GLASS PLAINS', formations: [f('depot-3')] },
  { at: 2, id: 'u-x-fighters', phase: 'pressure', formations: [f('line-weaver-4', -1)] },
  { at: 8, id: 'u-x-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 12, id: 'u-x-cells-2', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 15, id: 'u-x-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 21, id: 'u-x-carrier', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 25, id: 'u-x-cells-3', phase: 'pressure', formations: [f('depot-2')] },
  { at: 28, id: 'u-x-column', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 33, id: 'u-x-mortars', phase: 'pressure', formations: [f('missile-2')] },
]);
export const DEEP_BLOOM_SORTIE = extend(DEEP_BLOOM, 62, 36, [
  { at: 0, id: 'n-x-depot', phase: 'pressure', message: 'FUEL DEPOTS IN THE GROVE', formations: [f('depot-3')] },
  { at: 2, id: 'n-x-weavers', phase: 'pressure', formations: [f('line-weaver-4', -1)] },
  { at: 8, id: 'n-x-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 12, id: 'n-x-depot-2', phase: 'pressure', formations: [f('depot-missile')] },
  { at: 15, id: 'n-x-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 21, id: 'n-x-diamond', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 25, id: 'n-x-depot-3', phase: 'pressure', formations: [f('depot-2')] },
  { at: 28, id: 'n-x-column', phase: 'pressure', formations: [f('needle-column-5', 0, true)] },
  { at: 33, id: 'n-x-missiles', phase: 'pressure', formations: [f('missile-2')] },
]);

export function campaignPlaylist(mission: MissionId): readonly EncounterCue[] {
  return mission === 'bastion' ? ROLLING_THUNDER_SORTIE : mission === 'deep-bloom' ? DEEP_BLOOM_SORTIE : mission === 'cold-vector' ? COLD_VECTOR_SORTIE
    : mission === 'brood-strike' ? BROOD_STRIKE_SORTIE : mission === 'final-horizon' ? FINAL_HORIZON_SORTIE : TRAINING_SORTIE;
}

/**
 * The authored playlist of an endless sector: the Luna prologue first, then the planet's roster (Khepri kinds on
 * Khepri, Vesper kinds on Vesper), opening and pressure stages on the planet's first stint, its peak playlist on later visits. A boss
 * sector admits no cue at or after ENDLESS_CYCLE.bossSector.approachEndsAt.
 */
/** Endless prologue over Luna: Training's teaching phrases up to the boss sector's approach cutoff, then WARDEN-1. */
const LUNA_PROLOGUE: readonly EncounterCue[] = TRAINING.filter(cue => cue.at < ENDLESS_CYCLE.bossSector.approachEndsAt);

/**
 * Endless Nacre: the first stint opens with Deep Bloom's first 90 s, then its middle and climax (shifted to start
 * near 2 s); later visits fly the climax arc throughout. A boss sector's cutoff trims each list.
 */
const NACRE_OPENING: readonly EncounterCue[] = DEEP_BLOOM.filter(cue => cue.at < 88);
const NACRE_PRESSURE: readonly EncounterCue[] = DEEP_BLOOM.filter(cue => cue.at >= 62 && cue.at < 142).map(cue => ({ ...cue, at: cue.at - 60, id: `en2-${cue.id}` }));
const NACRE_PEAK: readonly EncounterCue[] = DEEP_BLOOM.filter(cue => cue.at >= 90 && cue.at < 142).map(cue => ({ ...cue, at: cue.at - 88, id: `en3-${cue.id}` }))
  .concat(DEEP_BLOOM.filter(cue => cue.at >= 16 && cue.at < 50).map(cue => ({ ...cue, at: cue.at + 42, id: `en3b-${cue.id}` })));

export function endlessPlaylist(sector: number): readonly EncounterCue[] {
  if (isPrologue(sector)) return LUNA_PROLOGUE;
  const stage = (cycleSector(sector) - 1) % 3;
  if (endlessPlanet(sector) === 'nacre') return isFirstVisit(sector) ? (stage === 0 ? NACRE_OPENING : NACRE_PRESSURE) : NACRE_PEAK;
  if (endlessPlanet(sector) === 'vesper') return isFirstVisit(sector) ? (stage === 0 ? VESPER_OPENING : VESPER_PRESSURE) : VESPER_PEAK;
  return isFirstVisit(sector) ? (stage === 0 ? SECTOR_OPENING : SECTOR_PRESSURE) : SECTOR_PEAK;
}

/** Enemy kinds a cue admits at the given rank: the complete group, never trimmed. */
export function cueRoster(cue: EncounterCue, rank: FormationRank): EnemyKind[] {
  return cue.formations.flatMap(placement => FORMATIONS[placement.formation].slots
    .filter(slot => slotFlies(slot, rank)).map(slot => slot.kind));
}

/** Alert text a cue must show before its members enter (two-flank entries). */
export function cueAlert(cue: EncounterCue): string | undefined {
  return cue.formations.map(placement => FORMATIONS[placement.formation].alert).find(text => text !== undefined);
}
