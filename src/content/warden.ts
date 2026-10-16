/**
 * WARDEN-1, Luna's small boss (docs/19 §2): a decommissioned human lunar defence lander, the first boss a pilot
 * meets (Training, and the opening sector of endless). Four landing legs, a central command module (the core) and
 * two turret pods (the first pair). Generous warnings, slow bolts and a gentle pace: it teaches the boss phases.
 * No hidden collision: only the pods and the command module are targets; legs, wings and hull are scenery.
 */
export const WARDEN = {
  arrivesAt: 129,
  /** No approach cue is admitted at or after this time (Training's last cue fires at 103 s). */
  approachEndsAt: 115,
  arrivalDuration: 3,
  /** It descends from beyond the view (pivot s) onto its post. */
  entryS: 20,
  row: 12.5,
  targetHeight: 1.3,
  podHp: 270,
  commandHp: 950,
  podRadius: 0.7,
  commandRadius: 1.15,
  podOffset: 2.1,
  commandS: 0.9,
  warning: 1.05,
  beamWarning: 1.4,
  recovery: 0.65,
  transitionRecovery: 1.5,
  overloadFraction: 0.35,
  extractionDuration: 4,
  podBurst: { bolts: 3, spread: 0.1, speed: 5.6 },
  commandBurst: { bolts: 4, spread: 0.085, speed: 5.8 },
  overload: { coreLaneWidth: 2.2, batteryLaneWidth: 1.3, active: 0.35 },
  /**
   * Static arena on Luna. The scroll eases from 5 to zero over 6 s from t = 126, stopping at distance
   * 5 * 126 + 5 * 6 / 2 = 645; `platform` is the s-range relative to the stop the arena levels.
   */
  arena: {
    decelStart: 126, decelDuration: 6, resumeDuration: 1,
    sway: 0.8, swayRate: 0.3, surge: 0.5, surgeRate: 0.24,
    platform: { from: -9, to: 22 },
  },
  // Training's supply budget is unchanged by the boss: two cells (one on Veteran), none during the fight.
  shieldSupplies: { relaxed: [40, 95], standard: [40, 95], veteran: [75] },
} as const;
