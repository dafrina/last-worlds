/** Authored vertical-slice encounter. No world-generation or campaign-profile input. */
export const BASTION = {
  arrivesAt: 115,
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
  warning: 1.15,
  beamWarning: 1.4,
  recovery: 1.4,
  transitionRecovery: 1.25,
  overloadFraction: 0.4,
  extractionDuration: 8,
  // Two opportunities for the entire sortie, never extra cells for an extended boss fight.
  shieldSupplies: { relaxed: [40, 105], standard: [40, 105], veteran: [105] },
} as const;
