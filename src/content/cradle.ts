/**
 * THE CRADLE, Amnion's boss (docs/27): a living nest-fortress that heaves itself up the canyon onto the bone plateau,
 * carrying the brood. Its two brood sacs (the first pair) and its nest heart (the core) are the only targets; the
 * ribbed shell, the bone spires and the egg clutches are scenery. Pressure as THE VEIL's (Amnion starts at Nacre's
 * intensity): aimed spore bursts from the sacs, then the heart alternates a fixed fan with an aimed burst and sends
 * hatchling waves from its brood bays, then overload lanes and a spiral over its own hit columns.
 * Its own model since 24 October 2026 (public/assets/amnion/the-cradle-v1.glb, tools/blender/remodel_cradle.py): it rises
 * out of a flesh canyon, hovers, opens its heart's shutters and launches hatchlings from bays in its base.
 */
export const CRADLE = {
  arrivesAt: 184,
  /** No approach cue is admitted at or after this time: authored relief before it surfaces. */
  approachEndsAt: 182,
  arrivalDuration: 4,
  /**
   * It rises straight up out of the emergence canyon at its row (24 October; it slid in from s 30 like THE VEIL before,
   * so it ploughed through the canyon wall while rising: user, "its rising frm a crevace but clips through the cliffs").
   */
  entryS: 12,
  row: 12,
  /**
   * Height of the shell's target plane over the plateau. The model, its sockets, bays and lanes are at 70% since 24
   * October (user: "the model seems pretty big no?"; it was 17 wide on a 12-wide screen and clipped the canyon walls).
   */
  targetHeight: 1.54,
  sacHp: 640,
  heartHp: 2050,
  // Hit radii shrink less than the model (0.85 and 1.2 before), so the smaller targets stay as fair to hit.
  sacRadius: 0.72,
  heartRadius: 1.0,
  // Within about half a unit of the user's GLB (tools/blender/approved_cradle.py): the egg projects to s 0.77 and the flank
  // flesh bulges to x -1.75/1.82, s -0.83/-0.25 (the model is asymmetric). Closer values pulled the overload fan's outer
  // bolts onto the screen edges with one through the middle, a seal the fairness rules forbid (tests/sim/fairness).
  sacOffset: 2.17,
  sacS: -0.28,
  heartS: 1.26,
  warning: 0.95,
  beamWarning: 1.2,
  recovery: 0.5,
  transitionRecovery: 1.3,
  overloadFraction: 0.4,
  sacBurst: { bolts: 4, spread: 0.085, speed: 6.6 },
  heartBurst: { bolts: 5, spread: 0.075, speed: 6.8 },
  heartFan: { bolts: 7, spacing: Math.PI / 18, speed: 5.2 },
  overload: { coreLaneWidth: 1.7, batteryLaneWidth: 1.12, active: 0.35 },
  /**
   * Front brood bays (relative to the pivot), and its hatchling waves: during the heart phase, plus more in overload.
   * At x +-1.96, s -1.68 (24 October; was x +-1.7, s -2.6 on the old full-size model): the projections on the target
   * plane of the model's bay mouths, in the base's front corners where the front shutter plates do not hide them from
   * the game camera (tools/blender/remodel_cradle.py, BAY, at 70%).
   */
  bays: [{ x: -1.96, s: -1.68 }, { x: 1.96, s: -1.68 }],
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
