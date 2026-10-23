/**
 * THE CRADLE, Amnion's boss (docs/27): a living nest-fortress that heaves itself up the canyon onto the bone plateau,
 * carrying the brood. Its two brood sacs (the first pair) and its nest heart (the core) are the only targets; the
 * ribbed shell, the bone spires and the egg clutches are scenery. Pressure as THE VEIL's (Amnion starts at Nacre's
 * intensity): aimed spore bursts from the sacs, then the heart alternates a fixed fan with an aimed burst and sends
 * hatchling waves from its brood bays, then overload lanes and a spiral over its own hit columns.
 * (Milestone 1, 23 October 2026: it borrows THE VEIL's model as an openly marked stand-in until its own exists.)
 */
export const CRADLE = {
  arrivesAt: 184,
  /** No approach cue is admitted at or after this time: authored relief before it surfaces. */
  approachEndsAt: 182,
  arrivalDuration: 4,
  /** It heaves in from beyond the view (pivot s) to its row. */
  entryS: 30,
  row: 12,
  /** Height of the shell's target plane over the plateau. */
  targetHeight: 2.2,
  sacHp: 640,
  heartHp: 2050,
  sacRadius: 0.85,
  heartRadius: 1.2,
  sacOffset: 3.1,
  sacS: -0.4,
  heartS: 1.8,
  warning: 0.95,
  beamWarning: 1.2,
  recovery: 0.5,
  transitionRecovery: 1.3,
  overloadFraction: 0.4,
  sacBurst: { bolts: 4, spread: 0.085, speed: 6.6 },
  heartBurst: { bolts: 5, spread: 0.075, speed: 6.8 },
  heartFan: { bolts: 7, spacing: Math.PI / 18, speed: 5.2 },
  overload: { coreLaneWidth: 2.4, batteryLaneWidth: 1.6, active: 0.35 },
  /** Front brood bays (relative to the pivot), and its hatchling waves: during the heart phase, plus more in overload. */
  bays: [{ x: -1.7, s: -2.6 }, { x: 1.7, s: -2.6 }],
  launches: { waves: 3, firstAfter: 2, interval: 6.5, overloadWaves: 2 },
  /**
   * Static arena on the plateau. The scroll eases from 5 to zero over 6 s from t = 181, stopping at distance
   * 5 * 181 + 5 * 6 / 2 = 920; `platform` is the s-range relative to the stop that the arena shapes.
   */
  arena: {
    decelStart: 181, decelDuration: 6,
    sway: 1.4, swayRate: 0.26, surge: 0.8, surgeRate: 0.2,
    platform: { from: -9, to: 34 },
  },
  shieldSupplies: { relaxed: [45, 141, 178], standard: [45, 141, 178], veteran: [141, 178] },
} as const;
