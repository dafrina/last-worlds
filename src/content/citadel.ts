import { ECLIPSE } from './eclipse';

/**
 * THE CITADEL, Nahara's boss (docs/39; user, 13 November: "fantasy temple citadel boss ... its a stationary one"): a
 * rotunda on a rock in the canyon, built of Nahara's ruin kit with the user's Tripo model as its shape guide
 * (public/assets/nahara/the-citadel-v2.glb, tools/blender/nahara_citadel.py). It never moves (BossDefinition.stationary);
 * it stands in place from the start and awakens on arrival. Its fight is THE ECLIPSE's with Nahara's own attacks (src/content/bosses.ts); its
 * targets: the two lanterns (the first pair), the emblem at the centre of the drum's rings (the third first-phase target,
 * the prow) and the crown of turquoise panels round the drum (the core). Positions: each target's visible centre projected
 * along the view onto the target plane (lookdev/nahara/citadel/citadel-v2-report.json, rounded).
 */
export const CITADEL = {
  ...ECLIPSE,
  /** It rises out of the ground at its row. */
  entryS: 13,
  /**
   * Its arrival is its awakening: it already stands on screen, so it only lights up (lanterns, emblem, crown;
   * src/render/veil-view.ts) and its fight begins as the scroll stops (arena decel ends at 187 s). THE ECLIPSE's 5 s
   * covered its rise; here it was dead time (user, 14 November: "it takes a tad too long until the boss fight starts").
   */
  arrivalDuration: 3,
  row: 13,
  /** The target plane over its base (the model's origin): the lanterns and the emblem stand 3.0-3.2 up, the crown 4.95. */
  targetHeight: 2.4,
  /** The lanterns: small lit globes, their hit circles a little larger than the glow. */
  ventOffset: 2.9,
  ventS: -3.25,
  ventRadius: 0.85,
  /** The crown over the back. */
  reactorS: -1.15,
  reactorRadius: 1.6,
  /** The emblem on the inner facade, between and behind the lanterns. */
  prowS: -3.1,
  prowRadius: 0.9,
  /** Its drone gates: either side of the stairs, toward the player. */
  bays: [{ x: -4.2, s: -5.5 }, { x: 4.2, s: -5.5 }],
  /** It never moves: the same static arena, without sway or surge. */
  arena: { ...ECLIPSE.arena, sway: 0, surge: 0 },
};
