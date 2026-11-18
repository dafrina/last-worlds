import { OVERLOAD_FRACTION } from './boss-phases';
/**
 * Vesper's boss of Cold Vector (docs/17 §5): HELION STRONGHOLD on screen since 17 November 2026 (docs/43), a fortress in
 * the cliff at the head of the arena; the flying HELION ARK before. The id stays `ark` and so do the field names: the
 * "radiators" are its two cannons, the "bridge" its reactor behind the blast door. Its combat values are the Ark's; the model
 * (helion-stronghold.glb) is placed to them. No hidden collision: only the two cannons and the reactor are targets; the
 * fortress and its cliff are scenery.
 */
export const HELION_ARK = {
  arrivesAt: 190,
  /** No approach cue is admitted at or after this time: authored relief before the Ark. */
  approachEndsAt: 190,
  /** Its arrival is its awakening (src/render/stronghold-view.ts): it already stands in its mountain as the scroll stops. */
  arrivalDuration: 3.5,
  /** It never moves (BossDefinition.stationary, 17 November): it starts at its row (the Ark glided in from 26). */
  entryS: 9,
  /**
   * Its pivot row: the cannons at s 11.97, the reactor at s 10.6. (User, 17 November: "the stronghold should move down a
   * bit too ... currently its anchored to the top of screen"; 11.5 before, the cannons at 14.47 and the reactor at 13.1.
   * THE CITADEL's flanks stand at about 9.75 and its crown at 11.85.)
   */
  row: 9,
  targetHeight: 1.6,
  radiatorHp: 600,
  bridgeHp: 1800,
  // 0.9 (24 October; was 0.75): the Ark's radiators were broad deck superstructures, and further back (s 2.97).
  radiatorRadius: 0.9,
  bridgeRadius: 1,
  /**
   * The cannons (the Ark's two side deck superstructures until 17 November; the stronghold's model is scaled and placed to
   * these: tools/blender/boss_stronghold.py).
   */
  radiatorOffset: 2.98,
  radiatorS: 2.97,
  bridgeS: 1.6,
  /** Launch points of its Needles, relative to the pivot (the stronghold's hatches beside its door, on screen). */
  bays: [{ x: -0.75, s: -2 }, { x: 0.75, s: -2 }],
  /** Aimed bridge bursts. */
  warning: 1,
  /** Cannon lane lasers: a narrow lane straight down the firing cannon's column. */
  laser: { warning: 1.1, width: 0.7, active: 0.3 },
  /** Overload lanes over the Ark's own hit columns. */
  beamWarning: 1.25,
  overload: { coreLaneWidth: 2.2, batteryLaneWidth: 1.6, active: 0.35 },
  recovery: 0.55,
  transitionRecovery: 1.25,
  overloadFraction: OVERLOAD_FRACTION,
  bridgeBurst: { bolts: 3, spread: 0.09, speed: 7 },
  /**
   * Its terrace guns (the small twin turrets on the fortress's lower terrace, helion-stronghold.glb; moved with the grown
   * fortress at row 9, 17 November): where a pilot who hides from every target is fired on (BossDefinition.hiddenFire,
   * docs/10 §5; user, 17 November). Each is its flight-plane point
   * with the camera centred, relative to the pivot (x, s), and its height relative to the flight plane: the simulation
   * projects it through the lens for the camera of the moment, as it does a ground battery. One volley of the bridge's aimed
   * burst every `interval` seconds while the pilot stays hidden.
   */
  terraceGuns: { points: [{ x: -4.61, s: 1.96, height: -6.96 }, { x: 4.56, s: 1.12, height: -6.96 }], interval: 2.6 },
  /** Finite Needle launches during the bridge phase: waves of two, one from each bay. */
  launches: { waves: 3, firstAfter: 2.5, interval: 7 },
  /**
   * Static arena: the scroll eases from full speed to zero over 6 s from t = 184 (smoothstep), stopping at the campaign
   * scroll times 187 s (1075.25); the stronghold awakens once it has stopped. `platform` is the s-range relative to the stop
   * that the arena covers (src/world/terrain-vesper.ts shapes its snowfields, the valley and the mountains round the fortress).
   * It never sways or surges (stationary, 17 November; the Ark swayed 1.3 and surged 0.7 over open water).
   */
  arena: {
    decelStart: 184, decelDuration: 6,
    sway: 0, swayRate: 0.3, surge: 0, surgeRate: 0.22,
    platform: { from: -9, to: 35 },
  },
  shieldSupplies: { relaxed: [50, 143, 185], standard: [50, 143, 185], veteran: [143, 185] },
} as const;
