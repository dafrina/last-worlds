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
 * Training sortie over Luna. Teaches each squadron, then the same arc at pressure, then WARDEN-1 lands at 115 s
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
  { at: 35, id: 't-dive', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 39, id: 't-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-dart', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 44, id: 't-east', phase: 'recovery', message: 'OPTIONAL OUTPOST · EAST', formations: [world('battery-2', 7.5)] },
  { at: 49, id: 't-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 53, id: 't-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 56, id: 't-snake', phase: 'pressure', message: 'COLUMN CROSSING', formations: [f('snake-weaver-5')] },
  { at: 61, id: 't-lancer', phase: 'pressure', message: 'BEAM LOCK · LEAVE THE MARKED LANE', formations: [f('solo-lancer', 1)] },
  { at: 64, id: 't-battery-2', phase: 'pressure', formations: [f('battery-2')] },
  { at: 67, id: 't-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
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
  { at: 27, id: 'r-battery-2', phase: 'pressure', formations: [f('battery-2')] },
  { at: 30, id: 'r-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 36, id: 'r-dive', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 41, id: 'r-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('battery-2', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 25 } },
  { at: 47, id: 'r-pincer', phase: 'pressure', formations: [f('pincer-4')] },
  { at: 51, id: 'r-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 54, id: 'r-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 60, id: 'r-battery-3', phase: 'pressure', formations: [f('battery-3')] },
  { at: 63, id: 'r-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
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
  { at: 44, id: 'e1-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-weaver', -7.5)], pickup: { kind: 'credit', x: -7.5, s: 18, value: 5 } },
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
  { at: 31, id: 'ev3-west', phase: 'recovery', formations: [world('needle-solo', -7.5)], pickup: { kind: 'weapon', x: -7, s: 17, value: 1, weapon: 'fan' } },
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
  { at: 53, id: 'v-east', phase: 'recovery', message: 'LONE INTERCEPTOR · EAST', formations: [world('needle-solo', 7.5)] },
  { at: 58, id: 'v-cliff-missiles', phase: 'pressure', message: 'MISSILE BATTERIES ON THE CLIFFS', formations: [f('missile-3')] },
  { at: 61, id: 'v-cliff-needles', phase: 'pressure', formations: [f('needle-line-3')] },
  { at: 66, id: 'v-cliff-missiles-2', phase: 'pressure', formations: [f('missile-2')] },
  { at: 69, id: 'v-cliff-diamond', phase: 'pressure', formations: [f('diamond-solo')] },
  { at: 75, id: 'v-cliff-missiles-3', phase: 'pressure', formations: [f('missile-3')] },
  { at: 78, id: 'v-cliff-column', phase: 'pressure', formations: [f('needle-column-5')] },
  { at: 84, id: 'v-cliff-missiles-4', phase: 'pressure', formations: [f('missile-2')] },
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

export function campaignPlaylist(mission: MissionId): readonly EncounterCue[] {
  return mission === 'bastion' ? ROLLING_THUNDER : mission === 'cold-vector' ? COLD_VECTOR : TRAINING;
}

/**
 * The authored playlist of an endless sector: the Luna prologue first, then the planet's roster (Khepri kinds on
 * Khepri, Vesper kinds on Vesper), opening and pressure stages on the planet's first stint, its peak playlist on later visits. A boss
 * sector admits no cue at or after ENDLESS_CYCLE.bossSector.approachEndsAt.
 */
/** Endless prologue over Luna: Training's teaching phrases up to the boss sector's approach cutoff, then WARDEN-1. */
const LUNA_PROLOGUE: readonly EncounterCue[] = TRAINING.filter(cue => cue.at < ENDLESS_CYCLE.bossSector.approachEndsAt);

export function endlessPlaylist(sector: number): readonly EncounterCue[] {
  if (isPrologue(sector)) return LUNA_PROLOGUE;
  const stage = (cycleSector(sector) - 1) % 3;
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
