import { VIEW, type EnemyKind } from '../shared/contracts';

/**
 * Authored squadron templates. A leader path is a list of keyframes relative to the placement anchor; every
 * member follows that path with a fixed slot offset, an optional time lag (columns) and an optional flip
 * (the mirrored path, for pincers). Coordinates are combat-plane units: x lateral, s ahead of the player row.
 * Nothing here is randomized; mirrors and lateral offsets are chosen per placement in encounters.ts.
 */
export type Keyframe = readonly [t: number, x: number, s: number];
export type FormationRank = 'standard' | 'veteran';

export interface FormationSlot {
  readonly kind: EnemyKind;
  /** Lateral offset from the leader path (mirrored with the placement and flip). */
  readonly dx: number;
  /** Forward offset from the leader path. */
  readonly ds?: number;
  /** Seconds behind the leader along the same path: column and snake formations. */
  readonly lag?: number;
  /** Follows the mirrored path: the second half of a pincer. */
  readonly flip?: boolean;
  /** First windup, seconds after the template's fireFrom. Members are staggered, never one sealing wall. */
  readonly fire: number;
  /** Authored lateral aim offset from the committed player x (bracketing). The warning line shows it. */
  readonly aim?: number;
  /** Authored harder variant: present only at this rank or above. Relaxed and Standard share the base set. */
  readonly from?: FormationRank;
}

export interface FormationTemplate {
  readonly id: string;
  readonly name: string;
  /** Where members first appear, used by validation: above the view, one side, both sides, or on the ground. */
  readonly entry: 'top' | 'side' | 'both' | 'ground';
  readonly path: readonly Keyframe[];
  /** Bounded sine sway added along one axis while flying the path. */
  readonly sway?: { readonly axis: 'x' | 's'; readonly amp: number; readonly period: number };
  /** Path-time window in which members may start a windup. */
  readonly fireFrom: number;
  readonly fireUntil: number;
  readonly slots: readonly FormationSlot[];
  /** Readable alert shown before the members enter. Required for two-sided entries. */
  readonly alert?: string;
}

/** Dive in from above the view, hold a row while drifting slightly forward, then climb out (1.4 s each way). */
const TOP_HOLD = (holdS: number, hold: number): readonly Keyframe[] => [
  [0, 0, 23], [1.4, 0, holdS + 1.2], [1.4 + hold, 0, holdS], [2.8 + hold, 0, 24],
];
/** Ground targets are fixed to the terrain, which scrolls at VIEW.scrollSpeed. */
const GROUND: readonly Keyframe[] = [[0, 0, 22], [36 / VIEW.scrollSpeed, 0, -14]];
/** Ground batteries may start a windup between s = 18.8 (fully in view) and s = 3.6 (the attack floor). */
const GROUND_FIRE = { fireFrom: (22 - 18.8) / VIEW.scrollSpeed, fireUntil: (22 - 3.6) / VIEW.scrollSpeed } as const;

const templates = [
  {
    id: 'arrow-5', name: 'Arrowhead of five darts', entry: 'top',
    path: TOP_HOLD(10.5, 7.5), sway: { axis: 'x', amp: 0.9, period: 4.6 }, fireFrom: 0.9, fireUntil: 8.9,
    slots: [
      { kind: 'dart', dx: 0, fire: 0 },
      { kind: 'dart', dx: -1.6, ds: 1.2, fire: 0.45 },
      { kind: 'dart', dx: 1.6, ds: 1.2, fire: 0.9 },
      { kind: 'dart', dx: -3.2, ds: 2.4, fire: 1.35, aim: -1.6 },
      { kind: 'dart', dx: 3.2, ds: 2.4, fire: 1.8, aim: 1.6 },
      { kind: 'dart', dx: -4.4, ds: 3.6, fire: 2.25, aim: -2.8, from: 'veteran' },
      { kind: 'dart', dx: 4.4, ds: 3.6, fire: 2.7, aim: 2.8, from: 'veteran' },
    ],
  },
  {
    id: 'arrow-3', name: 'Arrowhead of three darts', entry: 'top',
    path: TOP_HOLD(11, 5.5), fireFrom: 0.9, fireUntil: 6.9,
    slots: [
      { kind: 'dart', dx: 0, fire: 0 },
      { kind: 'dart', dx: -1.7, ds: 1.2, fire: 0.55, aim: -1.5 },
      { kind: 'dart', dx: 1.7, ds: 1.2, fire: 1.1, aim: 1.5 },
    ],
  },
  {
    id: 'line-weaver-4', name: 'Line abreast of four weavers', entry: 'top',
    path: TOP_HOLD(12, 8.5), sway: { axis: 'x', amp: 0.9, period: 3.2 }, fireFrom: 1, fireUntil: 9.9,
    slots: [
      { kind: 'weaver', dx: -3.3, fire: 0 },
      { kind: 'weaver', dx: -1.1, fire: 0.6, aim: -1.2 },
      { kind: 'weaver', dx: 1.1, fire: 1.2, aim: 1.2 },
      { kind: 'weaver', dx: 3.3, fire: 1.8 },
    ],
  },
  {
    // Ripple volley: each member commits on the player plus a stepped offset, so the curtain sweeps across.
    id: 'line-dart-4', name: 'Line abreast of four darts', entry: 'top',
    path: TOP_HOLD(10.5, 7), sway: { axis: 'x', amp: 0.8, period: 4.2 }, fireFrom: 0.9, fireUntil: 8.4,
    slots: [
      { kind: 'dart', dx: -3.6, fire: 0, aim: -2.1 },
      { kind: 'dart', dx: -1.2, fire: 0.3, aim: -0.7 },
      { kind: 'dart', dx: 1.2, fire: 0.6, aim: 0.7 },
      { kind: 'dart', dx: 3.6, fire: 0.9, aim: 2.1 },
      { kind: 'dart', dx: -4.5, ds: 1.3, fire: 1.7, from: 'veteran' },
      { kind: 'dart', dx: 4.5, ds: 1.3, fire: 2.1, from: 'veteran' },
    ],
  },
  {
    // Echelon right as authored; the echelon-left variant is the validated mirror placement.
    id: 'echelon-4', name: 'Echelon of four darts strafing across', entry: 'top',
    path: [[0, 5, 23], [1.75, 1.8, 12.5], [6.7, -1.8, 10.5], [8.3, -12.5, 10]], fireFrom: 1.05, fireUntil: 6.7,
    slots: [
      { kind: 'dart', dx: 0, fire: 0 },
      { kind: 'dart', dx: 1.3, ds: 1.1, fire: 0.45, aim: 1.4 },
      { kind: 'dart', dx: 2.6, ds: 2.2, fire: 0.85, aim: -1.4 },
      { kind: 'dart', dx: 3.9, ds: 3.3, fire: 1.35 },
      { kind: 'dart', dx: 5.2, ds: 4.4, fire: 3.1, aim: 2.6, from: 'veteran' },
    ],
  },
  {
    id: 'snake-weaver-5', name: 'Weaver column sweeping across', entry: 'side',
    path: [[0, -8.5, 13.5], [6, 8.5, 11]], sway: { axis: 's', amp: 1.1, period: 2 }, fireFrom: 1.2, fireUntil: 5.1,
    slots: [
      { kind: 'weaver', dx: 0, fire: 0 },
      { kind: 'weaver', dx: 0, lag: 0.5, fire: 0.5, aim: 1.3 },
      { kind: 'weaver', dx: 0, lag: 1, fire: 1 },
      { kind: 'weaver', dx: 0, lag: 1.5, fire: 1.5, aim: -1.3 },
      { kind: 'weaver', dx: 0, lag: 2, fire: 2, from: 'veteran' },
    ],
  },
  {
    id: 'pincer-4', name: 'Pincer pairs from both flanks', entry: 'both', alert: 'PINCER · BOTH FLANKS',
    path: [[0, -8.6, 11.5], [1.35, -3.3, 11.5], [8, -3, 10.5], [9.3, -9.5, 12]], fireFrom: 1.5, fireUntil: 8,
    slots: [
      { kind: 'dart', dx: 0, fire: 0 },
      { kind: 'dart', dx: 0, flip: true, fire: 0.55 },
      { kind: 'dart', dx: -1.4, ds: 1.2, fire: 1.1, aim: -1.5 },
      { kind: 'dart', dx: -1.4, ds: 1.2, flip: true, fire: 1.65, aim: -1.5 },
      { kind: 'dart', dx: -2, ds: 2.4, fire: 2.2, aim: 1.5, from: 'veteran' },
      { kind: 'dart', dx: -2, ds: 2.4, flip: true, fire: 2.75, aim: 1.5, from: 'veteran' },
    ],
  },
  {
    id: 'diamond-lancer', name: 'Lancer-led diamond', entry: 'top',
    path: TOP_HOLD(11.5, 8), sway: { axis: 'x', amp: 0.9, period: 5.2 }, fireFrom: 1, fireUntil: 9.4,
    slots: [
      { kind: 'lancer', dx: 0, fire: 0.4 },
      { kind: 'dart', dx: -1.7, ds: 1.4, fire: 0, aim: -1.4 },
      { kind: 'dart', dx: 1.7, ds: 1.4, fire: 1, aim: 1.4 },
      { kind: 'dart', dx: 0, ds: 2.8, fire: 2 },
    ],
  },
  {
    id: 'dive-pair', name: 'Diving dart pair', entry: 'top',
    path: [[0, 0, 23], [4.5, 0, -8]], fireFrom: 0.6, fireUntil: 2.1,
    slots: [
      { kind: 'dart', dx: -2.3, fire: 0 },
      { kind: 'dart', dx: 2.3, fire: 0.4 },
    ],
  },
  {
    id: 'battery-3', name: 'Ground battery line', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'turret', dx: -3, fire: 0 },
      { kind: 'turret', dx: 0, ds: 1.6, fire: 0.7 },
      { kind: 'turret', dx: 3, fire: 1.4 },
    ],
  },
  {
    id: 'battery-4', name: 'Dense ground battery', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'turret', dx: -4, fire: 0 },
      { kind: 'turret', dx: -1.4, ds: 1.4, fire: 0.55 },
      { kind: 'turret', dx: 1.4, ds: 1.4, fire: 1.1 },
      { kind: 'turret', dx: 4, fire: 1.65 },
    ],
  },
  {
    id: 'battery-2', name: 'Ground battery pair', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'turret', dx: -2.4, fire: 0 },
      { kind: 'turret', dx: 2.4, ds: 1.2, fire: 0.8 },
    ],
  },
  {
    id: 'solo-dart', name: 'Single dart', entry: 'top',
    path: TOP_HOLD(11, 4), fireFrom: 0.9, fireUntil: 5.4,
    slots: [{ kind: 'dart', dx: 0, fire: 0 }],
  },
  {
    id: 'solo-weaver', name: 'Single weaver', entry: 'top',
    path: TOP_HOLD(12.5, 6), sway: { axis: 'x', amp: 1.2, period: 3.4 }, fireFrom: 1, fireUntil: 7.4,
    slots: [{ kind: 'weaver', dx: 0, fire: 0 }],
  },
  {
    id: 'solo-lancer', name: 'Single lancer', entry: 'top',
    path: TOP_HOLD(13, 7), fireFrom: 1.1, fireUntil: 8.4,
    slots: [{ kind: 'lancer', dx: 0, fire: 0 }],
  },
  {
    id: 'solo-turret', name: 'Single ground battery', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [{ kind: 'turret', dx: 0, fire: 0 }],
  },
] as const satisfies readonly FormationTemplate[];

export type FormationId = (typeof templates)[number]['id'];
export const FORMATIONS: Readonly<Record<FormationId, FormationTemplate>> = Object.fromEntries(
  templates.map(template => [template.id, template as FormationTemplate]),
) as unknown as Record<FormationId, FormationTemplate>;
export const FORMATION_IDS = templates.map(template => template.id) as readonly FormationId[];

const RANK_ORDER: Readonly<Record<FormationRank, number>> = { standard: 0, veteran: 1 };

/** Whether a slot flies at the given rank. Members marked `from: 'veteran'` are the authored harder variant. */
export function slotFlies(slot: FormationSlot, rank: FormationRank): boolean {
  return !slot.from || RANK_ORDER[slot.from] <= RANK_ORDER[rank];
}
