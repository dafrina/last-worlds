import { SITE_IDS, VIEW, type EnemyKind, type SiteId } from '../shared/contracts';

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
  /**
   * Where members first appear, used by validation: above the view, one side, both sides, on the ground, or
   * from a boss launch bay ('bay': keyframe s is relative to the member's anchorS, the boss pivot).
   */
  readonly entry: 'top' | 'side' | 'both' | 'ground' | 'bay';
  readonly path: readonly Keyframe[];
  /** Bounded sine sway added along one axis while flying the path. */
  readonly sway?: { readonly axis: 'x' | 's'; readonly amp: number; readonly period: number };
  /** Path-time window in which members may start a windup. */
  readonly fireFrom: number;
  readonly fireUntil: number;
  readonly slots: readonly FormationSlot[];
  /** Readable alert shown before the members enter. Required for two-sided entries. */
  readonly alert?: string;
  /** Members never attack (fuel skids): no firing window, so the windup checks do not apply. */
  readonly harmless?: true;
}

/** Dive in from above the view, hold a row while drifting slightly forward, then climb out (1.4 s each way). */
const TOP_HOLD = (holdS: number, hold: number): readonly Keyframe[] => [
  [0, 0, 23], [1.4, 0, holdS + 1.2], [1.4 + hold, 0, holdS], [2.8 + hold, 0, 24],
];
/** Ground targets are fixed to the terrain, which scrolls at VIEW.scrollSpeed. */
const GROUND: readonly Keyframe[] = [[0, 0, 22], [36 / VIEW.scrollSpeed, 0, -14]];
/** Ground batteries may start a windup between s = 18.8 (fully in view) and s = 3.6 (the attack floor). */
const GROUND_FIRE = { fireFrom: (22 - 18.8) / VIEW.scrollSpeed, fireUntil: (22 - 3.6) / VIEW.scrollSpeed } as const;

/** Vesper interceptors: a quicker dive in and climb out than the Khepri squadrons. */
const NEEDLE_HOLD = (holdS: number, hold: number): readonly Keyframe[] => [
  [0, 0, 23], [0.9, 0, holdS + 1], [0.9 + hold, 0, holdS], [1.8 + hold, 0, 24],
];
/** Vesper heavies descend slowly and hold their row longest. */
const HEAVY_HOLD = (holdS: number, hold: number): readonly Keyframe[] => [
  [0, 0, 23], [2.4, 0, holdS + 1], [2.4 + hold, 0, holdS], [4.4 + hold, 0, 24],
];

/*
 * ---- Strike sites (docs/33 § 3; workstream B, 29 October 2026) ----
 * A site rides its own ground track, SITE_LEAD units further out than a battery's, so its whole layout (about 4–6 units
 * across) comes into view from beyond the top edge even when its cue spawns at its time rather than ahead of it. Guards
 * sit around the core (the site's centre on the track) at least AIRSPACE.separation plus its prediction margin away
 * (they are other squadrons), and each guard's first windup waits until it is fully in view.
 */
export const SITE_LEAD = 9;
const SITE_TRACK: readonly Keyframe[] = [[0, 0, 22 + SITE_LEAD], [(36 + SITE_LEAD) / VIEW.scrollSpeed, 0, -14]];
const SITE_FIRE = { fireFrom: (22 + SITE_LEAD - 18.8) / VIEW.scrollSpeed, fireUntil: (22 + SITE_LEAD - 3.6) / VIEW.scrollSpeed } as const;
/** Guard seats (dx, ds) around a site's core, in firing order. */
const RING_2 = [[-2.8, -1], [2.8, 1]] as const;
const RING_3 = [[-2.8, -1], [2.8, -1], [0, 2.8]] as const;
const RING_4 = [[-2.8, -1.2], [2.8, -1.2], [-2.2, 2.2], [2.2, 2.2]] as const;
/** Wider, for the sealed vault's three seals. */
const RING_VAULT = [[-3, -2.2], [3, -2.2], [0, 3.6]] as const;
const siteGuard = (kinds: readonly ('turret' | 'missile')[], ring: readonly (readonly [number, number])[]): readonly FormationSlot[] =>
  ring.map(([dx, ds], i) => ({ kind: kinds[i], dx, ds, fire: Math.max(i * 0.6, (ds - 0.15) / VIEW.scrollSpeed + 0.05) }));

const templates = [
  {
    id: 'wraith-solo', name: 'Umbral Wraith', entry: 'top',
    path: TOP_HOLD(14, 16), fireFrom: 1.2, fireUntil: 18,
    slots: [{ kind: 'wraith', dx: 0, fire: 0 }],
  },
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
    path: [[0, 5, 23], [1.75, 1.8, 12.5], [6.7, -1.8, 10.5], [8.4, -13, 10]], fireFrom: 1.05, fireUntil: 6.7,
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
    path: [[0, -7.6, 13.5], [5.4, 7.6, 11]], sway: { axis: 's', amp: 1.1, period: 2 }, fireFrom: 0.85, fireUntil: 4.65,
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
    path: [[0, -7.6, 11.5], [1.1, -3.3, 11.5], [8, -3, 10.5], [9.2, -8.4, 12]], fireFrom: 1.3, fireUntil: 8,
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
  // Depots (user request, 16 October: more chaos): batteries parked around fuel skids; one burst skid blasts its
  // neighbours (FUEL_BLAST), and the skids chain. The skids never fire (their `fire` only keeps the stagger check tidy).
  {
    id: 'depot-2', name: 'Fuelled battery pair', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'turret', dx: -2.4, fire: 0 },
      { kind: 'turret', dx: 2.4, ds: 1.2, fire: 0.8 },
      { kind: 'fuel', dx: 0, ds: 0.6, fire: 1.6 },
    ],
  },
  {
    id: 'depot-3', name: 'Fuelled battery line', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'turret', dx: -3, fire: 0 },
      { kind: 'turret', dx: 0, ds: 1.6, fire: 0.7 },
      { kind: 'turret', dx: 3, fire: 1.4 },
      { kind: 'fuel', dx: 1.3, ds: 0.8, fire: 2.1 },
    ],
  },
  {
    id: 'depot-missile', name: 'Fuelled missile pair', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'missile', dx: -2.8, fire: 0 },
      { kind: 'missile', dx: 2.8, ds: 1.2, fire: 0.8 },
      { kind: 'fuel', dx: 0, ds: 0.6, fire: 1.6 },
    ],
  },
  // Fuel-tank skids (user request, 16 October): harmless ground loot that never fires (an empty firing window).
  {
    id: 'fuel-pair', name: 'Fuel skid pair', entry: 'ground',
    path: GROUND, fireFrom: Infinity, fireUntil: Infinity, harmless: true,
    slots: [
      { kind: 'fuel', dx: -1.3, fire: 0 },
      { kind: 'fuel', dx: 1.3, ds: 0.6, fire: 0 },
    ],
  },
  {
    id: 'fuel-depot', name: 'Fuel depot', entry: 'ground',
    path: GROUND, fireFrom: Infinity, fireUntil: Infinity, harmless: true,
    slots: [
      { kind: 'fuel', dx: -1.4, fire: 0 },
      { kind: 'fuel', dx: 0, ds: 1.3, fire: 0 },
      { kind: 'fuel', dx: 1.4, fire: 0 },
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
  // ---- Nacre (17 October 2026): Pulsars dive in, hold, and fire rapid burst streams down a marked line ----
  {
    id: 'pulsar-solo', name: 'Single pulsar', entry: 'top',
    path: TOP_HOLD(9.5, 7), fireFrom: 1.6, fireUntil: 8.2,
    slots: [{ kind: 'pulsar', dx: 1.2, fire: 0 }],
  },
  {
    id: 'pulsar-pair', name: 'Pulsar pair', entry: 'top',
    path: TOP_HOLD(10, 8), fireFrom: 1.6, fireUntil: 9.2,
    slots: [
      { kind: 'pulsar', dx: -3.6, fire: 0, aim: -0.6 },
      { kind: 'pulsar', dx: 3.6, ds: 0.6, fire: 1.3, aim: 0.6 },
    ],
  },
  // ---- Vesper (docs/17 §5) ----
  {
    id: 'needle-solo', name: 'Single needle', entry: 'top',
    path: NEEDLE_HOLD(14, 7), fireFrom: 0.7, fireUntil: 7.9,
    slots: [{ kind: 'needle', dx: 0, fire: 0 }],
  },
  {
    // Narrow beam lanes stepping across the committed position, one at a time.
    id: 'needle-line-3', name: 'Needle line with stepped beam lanes', entry: 'top',
    path: NEEDLE_HOLD(14.5, 8), fireFrom: 0.7, fireUntil: 8.9,
    slots: [
      { kind: 'needle', dx: -2.8, fire: 0, aim: -1 },
      { kind: 'needle', dx: 0, fire: 0.4 },
      { kind: 'needle', dx: 2.8, fire: 0.8, aim: 1 },
      { kind: 'needle', dx: -4.4, ds: 1, fire: 1.6, aim: -2, from: 'veteran' },
      { kind: 'needle', dx: 4.4, ds: 1, fire: 2, aim: 2, from: 'veteran' },
    ],
  },
  {
    // Interceptor column sweeping across, each member locking a lane as it passes.
    id: 'needle-column-5', name: 'Needle column sweeping across', entry: 'side',
    path: [[0, -7.6, 14], [7, 7.6, 12.5]], sway: { axis: 's', amp: 0.8, period: 1.8 }, fireFrom: 1.05, fireUntil: 5.6,
    slots: [
      { kind: 'needle', dx: 0, fire: 0 },
      { kind: 'needle', dx: 0, lag: 0.35, fire: 0.4, aim: 0.9 },
      { kind: 'needle', dx: 0, lag: 0.7, fire: 0.8, aim: -0.9 },
      { kind: 'needle', dx: 0, lag: 1.05, fire: 1.2 },
      { kind: 'needle', dx: 0, lag: 1.4, fire: 1.6, from: 'veteran' },
    ],
  },
  {
    id: 'diamond-solo', name: 'Single diamond heavy', entry: 'top',
    path: HEAVY_HOLD(12.5, 9), fireFrom: 1.2, fireUntil: 11.4,
    slots: [{ kind: 'diamond', dx: 0, fire: 0 }],
  },
  {
    // Heavy escort convoy: two Diamonds alternating wing volleys, Needles on the flanks.
    id: 'diamond-convoy', name: 'Diamond escort convoy', entry: 'top',
    path: HEAVY_HOLD(11.5, 10), fireFrom: 1.2, fireUntil: 12.4,
    slots: [
      { kind: 'diamond', dx: -2, fire: 0 },
      { kind: 'diamond', dx: 2, ds: 1.6, fire: 0.6 },
      { kind: 'needle', dx: -4.2, ds: 2.4, fire: 1.2, aim: -1.2 },
      { kind: 'needle', dx: 4.2, ds: 2.4, fire: 1.8, aim: 1.2 },
      { kind: 'diamond', dx: 0, ds: 3.4, fire: 2.4, from: 'veteran' },
    ],
  },
  {
    // Missiles fly straight down each battery's own marked column: align to destroy it in the gaps.
    id: 'missile-2', name: 'Missile battery pair', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'missile', dx: -2.8, fire: 0 },
      { kind: 'missile', dx: 2.8, ds: 1.2, fire: 0.8 },
    ],
  },
  {
    id: 'missile-3', name: 'Missile battery line', entry: 'ground',
    path: GROUND, ...GROUND_FIRE,
    slots: [
      { kind: 'missile', dx: -3.6, fire: 0 },
      { kind: 'missile', dx: 0, ds: 1.4, fire: 0.6 },
      { kind: 'missile', dx: 3.6, fire: 1.2 },
    ],
  },
  {
    // Helion Ark launch wave: one Needle from each deck bay (s relative to the Ark pivot, anchorS).
    id: 'ark-launch', name: 'Helion Ark launch wave', entry: 'bay',
    path: [[0, 0, -2], [1, -3.2, -4.5], [5.5, -3, -4.5], [6.6, -9.5, -3]], fireFrom: 1, fireUntil: 5.5,
    slots: [
      { kind: 'needle', dx: -0.75, fire: 0 },
      { kind: 'needle', dx: -0.75, flip: true, fire: 0.6 },
    ],
  },
  {
    // THE VEIL's pods (docs/20): two from each front bay (s relative to its pivot, anchorS), dropping toward the player,
    // fanning out to a holding row, firing aimed seeds, then sweeping away to the sides.
    id: 'veil-pods', name: 'THE VEIL pod wave', entry: 'bay',
    path: [[0, 0, -2.6], [0.9, -1.2, -5.8], [4.6, -2.4, -6.4], [5.8, -8.5, -5]], fireFrom: 1.1, fireUntil: 4.6,
    slots: [
      { kind: 'dart', dx: -1.7, fire: 0 },
      { kind: 'dart', dx: -1.7, flip: true, fire: 0.5 },
      { kind: 'dart', dx: -1.7, ds: -0.9, lag: 0.7, fire: 1.0 },
      { kind: 'dart', dx: -1.7, ds: -0.9, lag: 0.7, flip: true, fire: 1.5 },
    ],
  },
  // ---- Strike sites (docs/33 § 3; workstream B): guards and cores on the site track (SITE_TRACK) ----
  { id: 'site-turrets-2', name: 'Site turret pair', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'turret'], RING_2) },
  { id: 'site-turrets-3', name: 'Site turret trio', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'turret', 'turret'], RING_3) },
  { id: 'site-turrets-4', name: 'Site turret ring', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'turret', 'turret', 'turret'], RING_4) },
  { id: 'site-missiles-2', name: 'Site missile pair', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['missile', 'missile'], RING_2) },
  { id: 'site-missiles-3', name: 'Site missile trio', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['missile', 'missile', 'missile'], RING_3) },
  { id: 'site-mixed-2', name: 'Site turret and missile battery', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'missile'], RING_2) },
  { id: 'site-mixed-3', name: 'Site turrets and a missile battery', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'turret', 'missile'], RING_3) },
  { id: 'site-mixed-4', name: 'Site mixed ring', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'turret', 'missile', 'missile'], RING_4) },
  { id: 'site-vault-guard', name: 'Sealed vault guard ring', entry: 'ground', path: SITE_TRACK, ...SITE_FIRE, slots: siteGuard(['turret', 'turret', 'missile'], RING_VAULT) },
  {
    // The airfield's flourish (docs/33 § 3): a dart pair scrambles from the runway beyond the top edge as the field comes
    // into view, dives over it and is gone (the dive pair's pattern, held back 2.4 s).
    id: 'site-scramble', name: 'Scrambled dart pair', entry: 'top',
    path: [[0, 0, 24], [2.4, 0, 24], [6.9, 0, -8]], fireFrom: 3.1, fireUntil: 4.6,
    slots: [
      { kind: 'dart', dx: -2.3, fire: 0 },
      { kind: 'dart', dx: 2.3, fire: 0.4 },
    ],
  },
  // Each site's core (`site-core-<site>`): a harmless ground target at the site's centre on its track, which
  // src/sim/sites.ts marks with its site, hit points and radius as it spawns. The sealed vault has three seal crystals.
  ...SITE_IDS.map(site => ({
    id: `site-core-${site}` as const, name: `Strike site core (${site})`, entry: 'ground' as const, path: SITE_TRACK,
    fireFrom: Infinity, fireUntil: Infinity, harmless: true as const,
    slots: site === 'sealed-vault'
      ? [{ kind: 'fuel' as const, dx: -1, ds: -0.4, fire: 0 }, { kind: 'fuel' as const, dx: 1, ds: -0.4, fire: 0 }, { kind: 'fuel' as const, dx: 0, ds: 1, fire: 0 }]
      : [{ kind: 'fuel' as const, dx: 0, fire: 0 }],
  })),
] as const satisfies readonly FormationTemplate[];

export type FormationId = (typeof templates)[number]['id'];
export const FORMATIONS: Readonly<Record<FormationId, FormationTemplate>> = Object.fromEntries(
  templates.map(template => [template.id, template as FormationTemplate]),
) as unknown as Record<FormationId, FormationTemplate>;
export const FORMATION_IDS = templates.map(template => template.id) as readonly FormationId[];
/** A strike site's core formation (docs/33), and the site a core formation belongs to (null for any other formation). */
export const siteCoreFormation = (site: SiteId): FormationId => `site-core-${site}`;
export function coreSite(formation: string): SiteId | null {
  const site = formation.startsWith('site-core-') ? formation.slice('site-core-'.length) : '';
  return (SITE_IDS as readonly string[]).includes(site) ? site as SiteId : null;
}

const RANK_ORDER: Readonly<Record<FormationRank, number>> = { standard: 0, veteran: 1 };

/** Whether a slot flies at the given rank. Members marked `from: 'veteran'` are the authored harder variant. */
export function slotFlies(slot: FormationSlot, rank: FormationRank): boolean {
  return !slot.from || RANK_ORDER[slot.from] <= RANK_ORDER[rank];
}
