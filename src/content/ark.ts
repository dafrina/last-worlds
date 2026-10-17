/**
 * Helion Ark, the Vesper sea-carrier boss of Cold Vector (docs/17 §5). Sockets follow helion-ark.glb in combat
 * terms (glTF +z is toward the player, so a node at z +0.5 sits at s −0.5). No hidden collision: only the two
 * radiators and the bridge are targets; the hull and radiator wings are scenery.
 */
export const HELION_ARK = {
  arrivesAt: 190,
  /** No approach cue is admitted at or after this time: authored relief before the Ark. */
  approachEndsAt: 190,
  arrivalDuration: 3.5,
  /** The Ark glides in from beyond the view (pivot s) to its row. */
  entryS: 26,
  /** Its pivot row: radiators at s 11, bridge at s 13.1, bow near s 7.8, stern near s 18.8. */
  row: 11.5,
  targetHeight: 1.6,
  radiatorHp: 600,
  bridgeHp: 1800,
  radiatorRadius: 0.75,
  bridgeRadius: 1,
  radiatorOffset: 2.4,
  radiatorS: -0.5,
  bridgeS: 1.6,
  /** Deck launch bays (Needle launch points), relative to the pivot. */
  bays: [{ x: -0.75, s: -2 }, { x: 0.75, s: -2 }],
  /** Aimed bridge bursts. */
  warning: 1,
  /** Radiator lane lasers: a narrow lane locked on the player when the windup starts. */
  laser: { warning: 1.1, width: 0.7, active: 0.3 },
  /** Overload lanes over the Ark's own hit columns. */
  beamWarning: 1.25,
  overload: { coreLaneWidth: 2.2, batteryLaneWidth: 1.6, active: 0.35 },
  recovery: 0.55,
  transitionRecovery: 1.25,
  overloadFraction: 0.4,
  bridgeBurst: { bolts: 3, spread: 0.09, speed: 7 },
  /** Finite Needle launches during the bridge phase: waves of two, one from each bay. */
  launches: { waves: 3, firstAfter: 2.5, interval: 7 },
  /**
   * Static arena over open ocean. The scroll eases from 5 to zero over 6 s from t = 184 (smoothstep), stopping
   * at distance 5 * 184 + 5 * 6 / 2 = 935; the Ark glides in once it has stopped. `platform` is the s-range relative to the stop that must be open
   * water: from below the view to past the Ark's stern as it glides in (pivot s 26, stern about +7.3).
   */
  arena: {
    decelStart: 184, decelDuration: 6,
    sway: 1.3, swayRate: 0.3, surge: 0.7, surgeRate: 0.22,
    platform: { from: -9, to: 35 },
  },
  shieldSupplies: { relaxed: [50, 143, 185], standard: [50, 143, 185], veteran: [143, 185] },
} as const;
