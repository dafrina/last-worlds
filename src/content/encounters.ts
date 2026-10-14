import type { EnemyKind, WeaponId } from '../shared/contracts';

export interface AuthoredSpawn { readonly kind: EnemyKind; readonly x: number; readonly s?: number }
export interface EncounterCue {
  readonly at: number;
  readonly id: string;
  readonly enemies: readonly AuthoredSpawn[];
  readonly message?: string;
  readonly pickup?: { readonly x: number; readonly s: number; readonly kind: 'credit' | 'power' | 'weapon'; readonly value: number; readonly weapon?: WeaponId };
}

/** Complete authored groups and timings. No seed, random offsets, or formation synthesis. */
export const CAMPAIGN: readonly EncounterCue[] = [
  { at: 2, id: 'first-contact', message: 'LINE UP TO FIRE', enemies: [{ kind: 'dart', x: 0 }] },
  { at: 8, id: 'second-patrol', enemies: [{ kind: 'dart', x: -2.2 }, { kind: 'dart', x: 2.2, s: 23 }] },
  { at: 15, id: 'weaver-intro', message: 'WATCH THE WARNING · THEN EVADE', enemies: [{ kind: 'weaver', x: 0 }] },
  { at: 22, id: 'west-cache', message: 'SALVAGE ROUTE · WEST', enemies: [{ kind: 'dart', x: -8 }], pickup: { kind: 'credit', x: -9, s: 18, value: 25 } },
  { at: 28, id: 'ground-intro', message: 'GROUND CORES ARE TARGETS TOO', enemies: [{ kind: 'turret', x: 2 }, { kind: 'turret', x: 9, s: 25 }] },
  { at: 35, id: 'crossing-pair', enemies: [{ kind: 'weaver', x: -2.5 }, { kind: 'weaver', x: 2.5, s: 24 }] },
  { at: 43, id: 'east-outpost', message: 'OPTIONAL OUTPOST · EAST', enemies: [{ kind: 'turret', x: 11 }, { kind: 'dart', x: 8, s: 24 }] },
  { at: 51, id: 'pulse-line', enemies: [{ kind: 'dart', x: -3 }, { kind: 'dart', x: 0, s: 24 }, { kind: 'dart', x: 3, s: 27 }] },
  { at: 59, id: 'lane-intro', message: 'BEAM LOCK · LEAVE THE MARKED LANE', enemies: [{ kind: 'lancer', x: 0 }] },
  { at: 68, id: 'mixed-ground', enemies: [{ kind: 'turret', x: -2 }, { kind: 'weaver', x: 2, s: 24 }, { kind: 'turret', x: -11, s: 24 }] },
  { at: 77, id: 'western-patrol', enemies: [{ kind: 'dart', x: -8 }, { kind: 'weaver', x: -11, s: 24 }, { kind: 'dart', x: 0, s: 26 }] },
  { at: 85, id: 'center-pressure', enemies: [{ kind: 'lancer', x: -2 }, { kind: 'dart', x: 3, s: 24 }] },
  { at: 94, id: 'last-battery', enemies: [{ kind: 'turret', x: -3 }, { kind: 'turret', x: 3, s: 24 }, { kind: 'weaver', x: 0, s: 27 }] },
  { at: 103, id: 'final-patrol', message: 'LAST PATROL · EXTRACTION AHEAD', enemies: [{ kind: 'dart', x: -2 }, { kind: 'dart', x: 0, s: 24 }, { kind: 'dart', x: 2, s: 27 }] },
  { at: 114, id: 'extraction', message: 'EXTRACTION APPROACH', enemies: [] },
];

const INTRO: readonly EncounterCue[] = [
  { at: 2, id: 'e1-center', enemies: [{ kind: 'dart', x: 0 }] },
  { at: 8, id: 'e1-pair', enemies: [{ kind: 'dart', x: -2.5 }, { kind: 'dart', x: 2.5, s: 24 }] },
  { at: 16, id: 'e1-power', message: 'POWER CELL AHEAD', enemies: [{ kind: 'weaver', x: 0 }], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 24, id: 'e1-fan', message: 'FAN CANNON · COLLECT TO EQUIP', enemies: [{ kind: 'turret', x: -2 }], pickup: { kind: 'weapon', x: 2, s: 17, value: 1, weapon: 'fan' } },
  { at: 32, id: 'e1-west', message: 'SALVAGE ROUTE · WEST', enemies: [{ kind: 'dart', x: -8 }, { kind: 'weaver', x: -11, s: 24 }], pickup: { kind: 'credit', x: -9, s: 18, value: 5 } },
  { at: 40, id: 'e1-arc', enemies: [{ kind: 'weaver', x: -2 }, { kind: 'weaver', x: 2, s: 24 }] },
  { at: 48, id: 'e1-east', message: 'OPTIONAL OUTPOST · EAST', enemies: [{ kind: 'turret', x: 9 }, { kind: 'dart', x: 12, s: 25 }, { kind: 'dart', x: 0, s: 24 }] },
  { at: 57, id: 'e1-seeker', message: 'SEEKER ARRAY · COLLECT TO EQUIP', enemies: [{ kind: 'lancer', x: 1 }], pickup: { kind: 'weapon', x: -2, s: 17, value: 1, weapon: 'seeker' } },
  { at: 67, id: 'e1-mixed', enemies: [{ kind: 'turret', x: -3 }, { kind: 'weaver', x: 2, s: 25 }] },
  { at: 77, id: 'e1-closing', enemies: [{ kind: 'dart', x: -2 }, { kind: 'dart', x: 0, s: 24 }, { kind: 'dart', x: 2, s: 27 }] },
];

const PRESSURE: readonly EncounterCue[] = [
  { at: 2, id: 'e2-split', enemies: [{ kind: 'weaver', x: -2.5 }, { kind: 'dart', x: 2.5, s: 24 }] },
  { at: 10, id: 'e2-ground', enemies: [{ kind: 'turret', x: 0 }, { kind: 'turret', x: -10, s: 24 }, { kind: 'dart', x: 10, s: 26 }] },
  { at: 18, id: 'e2-power', enemies: [{ kind: 'dart', x: -3 }, { kind: 'dart', x: 3, s: 24 }], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 26, id: 'e2-beam', enemies: [{ kind: 'lancer', x: 0 }, { kind: 'dart', x: 3, s: 25 }] },
  { at: 35, id: 'e2-west', enemies: [{ kind: 'weaver', x: -9 }, { kind: 'turret', x: -12, s: 24 }], pickup: { kind: 'weapon', x: -8, s: 17, value: 1, weapon: 'fan' } },
  { at: 44, id: 'e2-wave', enemies: [{ kind: 'weaver', x: -3 }, { kind: 'weaver', x: 3, s: 25 }] },
  { at: 53, id: 'e2-east', enemies: [{ kind: 'lancer', x: 10 }, { kind: 'dart', x: 7, s: 25 }, { kind: 'turret', x: 1, s: 24 }] },
  { at: 62, id: 'e2-seeker', enemies: [{ kind: 'dart', x: -2 }, { kind: 'dart', x: 2, s: 24 }], pickup: { kind: 'weapon', x: 0, s: 17, value: 1, weapon: 'seeker' } },
  { at: 72, id: 'e2-finale', enemies: [{ kind: 'lancer', x: -2 }, { kind: 'weaver', x: 2, s: 25 }, { kind: 'turret', x: -10, s: 28 }] },
];

const PEAK: readonly EncounterCue[] = [
  { at: 2, id: 'e3-formation', enemies: [{ kind: 'dart', x: -3 }, { kind: 'dart', x: 0, s: 24 }, { kind: 'dart', x: 3, s: 27 }] },
  { at: 10, id: 'e3-lanes', enemies: [{ kind: 'lancer', x: -2 }, { kind: 'weaver', x: 2, s: 25 }] },
  { at: 19, id: 'e3-power', enemies: [{ kind: 'turret', x: -3 }, { kind: 'turret', x: 3, s: 24 }], pickup: { kind: 'power', x: 0, s: 17, value: 1 } },
  { at: 28, id: 'e3-west', enemies: [{ kind: 'lancer', x: -10 }, { kind: 'weaver', x: -7, s: 25 }, { kind: 'dart', x: 0, s: 26 }] },
  { at: 38, id: 'e3-mixed', enemies: [{ kind: 'weaver', x: -3 }, { kind: 'turret', x: 1, s: 24 }, { kind: 'dart', x: 3, s: 27 }], pickup: { kind: 'weapon', x: 0, s: 17, value: 1, weapon: 'fan' } },
  { at: 48, id: 'e3-east', enemies: [{ kind: 'turret', x: 8 }, { kind: 'weaver', x: 11, s: 24 }, { kind: 'lancer', x: 0, s: 26 }] },
  { at: 58, id: 'e3-seeker', enemies: [{ kind: 'dart', x: -3 }, { kind: 'dart', x: 3, s: 24 }], pickup: { kind: 'weapon', x: -1, s: 17, value: 1, weapon: 'seeker' } },
  { at: 68, id: 'e3-finale', enemies: [{ kind: 'lancer', x: 2 }, { kind: 'weaver', x: -2, s: 25 }, { kind: 'turret', x: 10, s: 27 }] },
  { at: 79, id: 'e3-last', enemies: [{ kind: 'dart', x: -2 }, { kind: 'dart', x: 2, s: 25 }] },
];

export function endlessPlaylist(sector: number): readonly EncounterCue[] {
  return sector === 1 ? INTRO : sector < 4 ? PRESSURE : PEAK;
}
