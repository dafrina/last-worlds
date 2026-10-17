/**
 * THE VEIL, Nacre's boss (docs/20): a giant biological starship that rises over the open mire, far wider than the
 * view. Its two gill pods (the first pair) and its glowing heart (the core) are the only targets; the hull, the
 * curved bone blades and the tendrils are scenery. Pressure close to the Helion Ark: aimed spore bursts from the
 * pods, then the heart alternates a fixed fan with an aimed burst, then overload lanes over its own hit columns.
 */
export const VEIL = {
  arrivesAt: 184,
  /** No approach cue is admitted at or after this time: authored relief before the ship rises. */
  approachEndsAt: 182,
  arrivalDuration: 4,
  /** It glides in from far beyond the view (pivot s) to its row. */
  entryS: 30,
  row: 12,
  /** Hover height of the hull's target plane over the water. */
  targetHeight: 2.2,
  podHp: 620,
  heartHp: 2000,
  podRadius: 0.85,
  heartRadius: 1.2,
  podOffset: 3.1,
  podS: -0.4,
  heartS: 1.8,
  warning: 0.95,
  beamWarning: 1.2,
  recovery: 0.5,
  transitionRecovery: 1.3,
  overloadFraction: 0.4,
  podBurst: { bolts: 4, spread: 0.085, speed: 6.6 },
  heartBurst: { bolts: 5, spread: 0.075, speed: 6.8 },
  heartFan: { bolts: 7, spacing: Math.PI / 18, speed: 5.2 },
  overload: { coreLaneWidth: 2.4, batteryLaneWidth: 1.6, active: 0.35 },
  /** Front pod bays (relative to the pivot), and its pod waves: during the heart phase, plus more in overload. */
  bays: [{ x: -1.7, s: -2.6 }, { x: 1.7, s: -2.6 }],
  launches: { waves: 3, firstAfter: 2, interval: 6.5, overloadWaves: 2 },
  /**
   * Static arena over open mire. The scroll eases from 5 to zero over 6 s from t = 181, stopping at distance
   * 5 * 181 + 5 * 6 / 2 = 920; `platform` is the s-range relative to the stop that must be open water.
   */
  arena: {
    decelStart: 181, decelDuration: 6,
    sway: 1.4, swayRate: 0.26, surge: 0.8, surgeRate: 0.2,
    platform: { from: -9, to: 34 },
  },
  shieldSupplies: { relaxed: [45, 141, 178], standard: [45, 141, 178], veteran: [141, 178] },
} as const;
