import type { EnemyKind, MissionId, WeaponId } from '../shared/contracts';
import { FORMATIONS, slotFlies, type FormationId, type FormationRank } from './formations';

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

/** Training sortie, 120 s. Teaches each squadron, then the same arc at full pressure. No seed or offsets. */
export const TRAINING: readonly EncounterCue[] = [
  { at: 2, id: 't-first-contact', phase: 'intro', message: 'LINE UP TO FIRE', formations: [f('solo-dart')] },
  { at: 6, id: 't-arrow', phase: 'intro', message: 'ARROWHEAD · KEEP MOVING', formations: [f('arrow-3')] },
  { at: 12, id: 't-weaver', phase: 'intro', message: 'WATCH THE WARNING · THEN EVADE', formations: [f('solo-weaver', -1.5)] },
  { at: 17, id: 't-line', phase: 'pressure', message: 'LINE ABREAST · READ THE SWEEP', formations: [f('line-dart-4')] },
  { at: 22, id: 't-ground', phase: 'pressure', message: 'GROUND CORES ARE TARGETS TOO', formations: [f('battery-2')] },
  { at: 26, id: 't-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 29, id: 't-dive-early', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 32, id: 't-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-dart', -9)], pickup: { kind: 'credit', x: -9, s: 18, value: 25 } },
  { at: 37, id: 't-east', phase: 'recovery', message: 'OPTIONAL OUTPOST · EAST', formations: [world('battery-2', 10)] },
  { at: 42, id: 't-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 45, id: 't-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 48, id: 't-snake', phase: 'pressure', message: 'COLUMN CROSSING', formations: [f('snake-weaver-5')] },
  { at: 53, id: 't-lancer', phase: 'pressure', message: 'BEAM LOCK · LEAVE THE MARKED LANE', formations: [f('solo-lancer', 1), f('battery-2')] },
  { at: 57, id: 't-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 61, id: 't-dive', phase: 'pressure', formations: [f('dive-pair'), f('arrow-3')] },
  { at: 66, id: 't-arrow-5', phase: 'climax', message: 'SQUADRONS INBOUND', formations: [f('arrow-5'), f('battery-2')] },
  { at: 70, id: 't-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 74, id: 't-battery-climax', phase: 'climax', formations: [f('battery-3'), f('dive-pair')] },
  { at: 78, id: 't-diamond', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 82, id: 't-snake-climax', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 85, id: 't-line-climax', phase: 'climax', formations: [f('line-dart-4')] },
  { at: 87.5, id: 't-arrow-climax', phase: 'climax', formations: [f('arrow-3')] },
  { at: 89, id: 't-battery-4', phase: 'climax', formations: [f('battery-4')] },
  { at: 92, id: 't-echelon-climax', phase: 'climax', formations: [f('echelon-4'), f('dive-pair')] },
  { at: 96, id: 't-last', phase: 'climax', message: 'LAST PATROL · EXTRACTION AHEAD', formations: [f('arrow-5')] },
  { at: 100, id: 't-last-ground', phase: 'climax', formations: [f('battery-3'), f('line-weaver-4')] },
  { at: 104, id: 't-last-echelon', phase: 'climax', formations: [f('echelon-4', 0, true)] },
  { at: 112, id: 't-extraction', phase: 'recovery', message: 'EXTRACTION APPROACH', formations: [] },
];

/** Rolling Thunder approach. Ends before BASTION.approachEndsAt; relief precedes the fortress. */
export const ROLLING_THUNDER: readonly EncounterCue[] = [
  { at: 2, id: 'r-arrow', phase: 'intro', formations: [f('arrow-3')] },
  { at: 7, id: 'r-ground', phase: 'intro', formations: [f('battery-2')] },
  { at: 11, id: 'r-line', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 15, id: 'r-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 19, id: 'r-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 22, id: 'r-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 27, id: 'r-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 31, id: 'r-dive', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 37, id: 'r-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-weaver', -9)], pickup: { kind: 'credit', x: -9, s: 18, value: 25 } },
  { at: 43, id: 'r-pincer', phase: 'pressure', formations: [f('pincer-4')] },
  { at: 47, id: 'r-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 51, id: 'r-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 55, id: 'r-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 59, id: 'r-dive-2', phase: 'pressure', formations: [f('dive-pair'), f('battery-2')] },
  { at: 64, id: 'r-arrow-5', phase: 'climax', message: 'FORTRESS ESCORT · BREAK THROUGH', formations: [f('arrow-5')] },
  { at: 68, id: 'r-battery-climax', phase: 'climax', formations: [f('battery-3')] },
  { at: 71, id: 'r-diamond-climax', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 76, id: 'r-snake-climax', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 80, id: 'r-pincer-climax', phase: 'climax', formations: [f('pincer-4')] },
  { at: 85, id: 'r-line-climax', phase: 'climax', formations: [f('line-dart-4'), f('battery-2')] },
  { at: 90, id: 'r-last', phase: 'climax', formations: [f('arrow-5')] },
  { at: 98, id: 'r-relief', phase: 'recovery', formations: [] },
];

/** Endless sector 1: formations from the first seconds, then the full pressure arc. */
const SECTOR_OPENING: readonly EncounterCue[] = [
  { at: 2, id: 'e1-contact', phase: 'intro', formations: [f('solo-dart')] },
  { at: 6, id: 'e1-arrow', phase: 'intro', formations: [f('arrow-3')] },
  { at: 11, id: 'e1-ground', phase: 'intro', formations: [f('battery-2')] },
  { at: 15, id: 'e1-line', phase: 'pressure', message: 'POWER CELL AHEAD', formations: [f('line-weaver-4')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 20, id: 'e1-echelon', phase: 'pressure', formations: [f('echelon-4')] },
  { at: 24, id: 'e1-fan', phase: 'pressure', message: 'FAN CANNON · COLLECT TO EQUIP', formations: [f('battery-3')], pickup: { kind: 'weapon', x: 2, s: 17, value: 1, weapon: 'fan' } },
  { at: 27, id: 'e1-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 30, id: 'e1-arrow-5', phase: 'pressure', formations: [f('arrow-5')] },
  { at: 34, id: 'e1-dive', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 38, id: 'e1-west', phase: 'recovery', message: 'SALVAGE ROUTE · WEST', formations: [world('solo-weaver', -9)], pickup: { kind: 'credit', x: -9, s: 18, value: 5 } },
  { at: 46, id: 'e1-diamond', phase: 'pressure', message: 'SEEKER ARRAY · COLLECT TO EQUIP', formations: [f('diamond-lancer')], pickup: { kind: 'weapon', x: -2, s: 17, value: 1, weapon: 'seeker' } },
  { at: 50, id: 'e1-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 53, id: 'e1-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 56, id: 'e1-line-dart', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 60, id: 'e1-snake-left', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 64, id: 'e1-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 68, id: 'e1-battery-4', phase: 'climax', formations: [f('battery-4')] },
  { at: 71, id: 'e1-arrow-climax', phase: 'climax', formations: [f('arrow-5')] },
  { at: 74, id: 'e1-dive-climax', phase: 'climax', formations: [f('dive-pair')] },
  { at: 77, id: 'e1-line-climax', phase: 'climax', formations: [f('line-weaver-4')] },
  { at: 85, id: 'e1-east', phase: 'recovery', message: 'OPTIONAL OUTPOST · EAST', formations: [world('battery-2', 10)] },
];

/** Endless sectors 2-3: overlapping squadrons, denser batteries and shorter recoveries. */
const SECTOR_PRESSURE: readonly EncounterCue[] = [
  { at: 2, id: 'e2-arrow', phase: 'intro', formations: [f('arrow-5')] },
  { at: 5, id: 'e2-ground', phase: 'pressure', formations: [f('battery-3')] },
  { at: 8, id: 'e2-echelon', phase: 'pressure', formations: [f('echelon-4')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 11, id: 'e2-snake', phase: 'pressure', formations: [f('snake-weaver-5', 0, true)] },
  { at: 15, id: 'e2-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 18, id: 'e2-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 21, id: 'e2-line', phase: 'pressure', formations: [f('line-dart-4')] },
  { at: 25, id: 'e2-dive', phase: 'pressure', formations: [f('dive-pair'), f('battery-2')] },
  { at: 31, id: 'e2-west', phase: 'recovery', formations: [world('arrow-3', -9)], pickup: { kind: 'weapon', x: -8, s: 17, value: 1, weapon: 'fan' } },
  { at: 37, id: 'e2-pincer', phase: 'pressure', formations: [f('pincer-4')] },
  { at: 41, id: 'e2-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 44, id: 'e2-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 48, id: 'e2-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 51, id: 'e2-dive-2', phase: 'pressure', formations: [f('dive-pair')] },
  { at: 54, id: 'e2-seeker', phase: 'pressure', formations: [f('arrow-3')], pickup: { kind: 'weapon', x: 0, s: 17, value: 1, weapon: 'seeker' } },
  { at: 58, id: 'e2-climax-diamond', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 61, id: 'e2-climax-battery', phase: 'climax', formations: [f('battery-4')] },
  { at: 64, id: 'e2-climax-snake', phase: 'climax', formations: [f('snake-weaver-5')] },
  { at: 68, id: 'e2-climax-arrow', phase: 'climax', formations: [f('arrow-5')] },
  { at: 71, id: 'e2-climax-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 75, id: 'e2-climax-line', phase: 'climax', formations: [f('line-dart-4'), f('battery-2')] },
  { at: 84, id: 'e2-east', phase: 'recovery', formations: [world('battery-3', 10)] },
];

/** Endless sector 4 onward: the capped peak arc, repeated with the capped ramp. */
const SECTOR_PEAK: readonly EncounterCue[] = [
  { at: 2, id: 'e3-line', phase: 'intro', formations: [f('line-dart-4')] },
  { at: 4, id: 'e3-battery', phase: 'pressure', formations: [f('battery-3')] },
  { at: 7, id: 'e3-pincer', phase: 'pressure', formations: [f('pincer-4')], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 11, id: 'e3-diamond', phase: 'pressure', formations: [f('diamond-lancer')] },
  { at: 14, id: 'e3-snake', phase: 'pressure', formations: [f('snake-weaver-5')] },
  { at: 17, id: 'e3-battery-4', phase: 'pressure', formations: [f('battery-4')] },
  { at: 20, id: 'e3-echelon', phase: 'pressure', formations: [f('echelon-4'), f('dive-pair')] },
  { at: 24, id: 'e3-arrow', phase: 'pressure', formations: [f('arrow-5')] },
  { at: 30, id: 'e3-west', phase: 'recovery', formations: [world('arrow-3', -10)], pickup: { kind: 'weapon', x: -9, s: 17, value: 1, weapon: 'fan' } },
  { at: 35, id: 'e3-line-weaver', phase: 'pressure', formations: [f('line-weaver-4')] },
  { at: 38, id: 'e3-battery-2', phase: 'pressure', formations: [f('battery-3')] },
  { at: 41, id: 'e3-echelon-left', phase: 'pressure', formations: [f('echelon-4', 0, true)] },
  { at: 44, id: 'e3-arrow-2', phase: 'pressure', formations: [f('arrow-5')] },
  { at: 48, id: 'e3-seeker', phase: 'pressure', formations: [f('diamond-lancer'), f('dive-pair')], pickup: { kind: 'weapon', x: -1, s: 17, value: 1, weapon: 'seeker' } },
  { at: 53, id: 'e3-climax-pincer', phase: 'climax', formations: [f('pincer-4')] },
  { at: 56, id: 'e3-climax-battery', phase: 'climax', formations: [f('battery-4')] },
  { at: 59, id: 'e3-climax-snake', phase: 'climax', formations: [f('snake-weaver-5', 0, true)] },
  { at: 62, id: 'e3-climax-arrow', phase: 'climax', formations: [f('arrow-5')] },
  { at: 66, id: 'e3-climax-line', phase: 'climax', formations: [f('line-dart-4'), f('battery-3')] },
  { at: 70, id: 'e3-climax-diamond', phase: 'climax', formations: [f('diamond-lancer')] },
  { at: 74, id: 'e3-climax-echelon', phase: 'climax', formations: [f('echelon-4'), f('dive-pair')] },
  { at: 84, id: 'e3-east', phase: 'recovery', formations: [world('arrow-3', 10)] },
];

export const ENDLESS_SECTORS = { opening: SECTOR_OPENING, pressure: SECTOR_PRESSURE, peak: SECTOR_PEAK } as const;

export function campaignPlaylist(mission: MissionId): readonly EncounterCue[] {
  return mission === 'bastion' ? ROLLING_THUNDER : TRAINING;
}

export function endlessPlaylist(sector: number): readonly EncounterCue[] {
  return sector === 1 ? SECTOR_OPENING : sector < 4 ? SECTOR_PRESSURE : SECTOR_PEAK;
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
