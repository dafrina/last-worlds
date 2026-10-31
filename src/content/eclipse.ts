/**
 * THE ECLIPSE, Umbra's boss and the final boss (docs/28): the user's crescent-winged Tripo GLB, adapted
 * (public/assets/umbra/the-eclipse-v2-approved.glb, tools/blender/approved_eclipse.py), lying flat with its horns away
 * from the player and "very large ... like a final boss": about 20 units from horn to horn on the 24-unit world, so the
 * camera pans along it. Its two energy vents on the inner wings (the first pair), its prow vent under the reactor (a third
 * first-phase target since 31 October) and its luminous reactor (the core) are the only targets; the crescent, its horns
 * and spikes are scenery. It rises out of the abyss and hovers over it.
 * Pressure as THE CRADLE's (Umbra starts at Amnion's intensity): aimed bursts from the three vents in turn, then the reactor
 * alternates a fixed fan with an aimed burst and sends drone waves from its vents, then overload lanes and a spiral.
 * The timing follows Final Horizon's playlist, on Brood Strike's grid.
 */
export const ECLIPSE = {
  arrivesAt: 184,
  /** No approach cue is admitted at or after this time: authored relief before it rises. */
  approachEndsAt: 182,
  arrivalDuration: 5,
  /** It rises straight up out of the abyss at its row. */
  entryS: 12,
  row: 12,
  /**
   * Height of its target plane over its seat (the model's origin): the reactor's visible face averages 1.8, the vents'
   * 1.45 (the-eclipse-v1-approved.glb, tools/blender/approved_eclipse.py); one plane at 1.7 keeps both within 0.2 in s.
   */
  targetHeight: 1.7,
  ventHp: 640,
  reactorHp: 2050,
  // The vents are the almond panels on the inner wings' fronts, 4.7 long and 1 wide (never out on the horns); the reactor
  // is the lens in the glowing ring. Their visible centres projected onto the target plane: x ±5.15, s 0.1; and s 0.5.
  ventRadius: 1.1,
  reactorRadius: 1.2,
  ventOffset: 5.15,
  ventS: 0.1,
  reactorS: 0.5,
  /**
   * The prow vent (user, 31 October: "a third target ... that we have to destroy for phase 1"): a glowing almond lens on
   * the hull's front face under the reactor, between the near spike's side hooks, 2.9 wide, its face at heights 0.6-1.8
   * (the-eclipse-v2-approved.glb): its visible face projects onto the target plane at s -2.1. The near spike's blade
   * crosses its middle, as it crosses the reactor. Its circle clears the reactor's by 0.45 and stays far from the vents'.
   * As tough as the other two vents (ventHp): phase 1 lasts 31% longer at Standard and 24% at Veteran with the perfect
   * pilot (tests/sim/eclipse-report.test.ts; docs/28).
   */
  prowS: -2.1,
  prowRadius: 0.95,
  warning: 0.95,
  beamWarning: 1.2,
  recovery: 0.5,
  transitionRecovery: 1.3,
  overloadFraction: 0.4,
  ventBurst: { bolts: 4, spread: 0.085, speed: 6.6 },
  reactorBurst: { bolts: 5, spread: 0.075, speed: 6.8 },
  reactorFan: { bolts: 7, spacing: Math.PI / 18, speed: 5.2 },
  overload: { coreLaneWidth: 1.7, batteryLaneWidth: 1.12, active: 0.35 },
  /**
   * Its drone vents (relative to the pivot): the inner ends of the energy vents, toward the player. The drone waves fly
   * during the reactor phase, plus more in overload.
   */
  bays: [{ x: -3.4, s: -0.8 }, { x: 3.4, s: -0.8 }],
  launches: { waves: 3, firstAfter: 2, interval: 6.5, overloadWaves: 2 },
  /**
   * Static arena over the abyss. The scroll eases from 5 to zero over 6 s from t = 181, stopping at distance
   * 5 * 181 + 5 * 6 / 2 = 920; `platform` is the s-range relative to the stop that the arena shapes.
   */
  arena: {
    decelStart: 181, decelDuration: 6,
    sway: 1.2, swayRate: 0.22, surge: 0.7, surgeRate: 0.18,
    platform: { from: -9, to: 36 },
  },
  shieldSupplies: { relaxed: [45, 141, 178], standard: [45, 141, 178], veteran: [141, 178] },
} as const;
