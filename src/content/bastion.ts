/** Authored vertical-slice encounter. No world-generation or campaign-profile input. */
export const BASTION = {
  arrivesAt: 111,
  /** No approach cue is admitted at or after this time: authored relief before the fortress. */
  approachEndsAt: 103,
  arrivalDuration: 3,
  batteryHp: 400,
  coreHp: 1600,
  batteryRadius: 0.7,
  coreRadius: 1.55,
  batteryOffset: 2.2,
  row: 13,
  coreRowOffset: 1.35,
  targetHeight: 1.45,
  /** Windup for bursts and fans, and for marked overload lanes (plus the 0.15 s lane flash). */
  warning: 1,
  beamWarning: 1.25,
  /** Pause after each release before the next windup may start. */
  recovery: 0.45,
  transitionRecovery: 1.25,
  overloadFraction: 0.4,
  extractionDuration: 8,
  /** Battery phase: alternating aimed three-bolt bursts. Core phase: a fixed five-way fan alternating with an aimed five-bolt burst. */
  batteryBurst: { bolts: 3, spread: 0.095, speed: 6.6 },
  coreBurst: { bolts: 5, spread: 0.075, speed: 6.6 },
  coreFan: { bolts: 5, spacing: Math.PI / 15, speed: 5 },
  /**
   * Overload: lanes over the boss's own hit columns, alternating. The core lane covers the center of the core
   * column; the battery lanes cover both battery columns, leaving the core column open as the damage window.
   */
  overload: { coreLaneWidth: 2.4, batteryLaneWidth: 1.4, active: 0.35 },
  /**
   * Static arena. The terrain scroll eases from VIEW.scrollSpeed to zero over `decelDuration` seconds from
   * `decelStart` (smoothstep velocity), so it stops at distance 5 * 108 + 5 * 6 / 2 = 555 world units, three
   * seconds after the fortress starts rolling in. After destruction the scroll eases back up over
   * `resumeDuration`. The fortress maneuvers on the static ground within `sway` (lateral) and `surge`
   * (forward/back) of its post; `platform` is the s-range relative to the stop distance the arena must cover.
   */
  arena: {
    decelStart: 108, decelDuration: 6, resumeDuration: 2,
    sway: 1.1, swayRate: 0.35, surge: 0.9, surgeRate: 0.27,
    platform: { from: -9, to: 26 },
  },
  // Two opportunities for the entire sortie, never extra cells for an extended boss fight.
  shieldSupplies: { relaxed: [40, 105], standard: [40, 105], veteran: [105] },
} as const;
