/**
 * Shared tuning for the chassis perks that act in flight (docs/42). No extra HUD resource. The behaviour is
 * src/sim/ship-perks.ts.
 */
export const SHIP_PERKS = {
  /**
   * Interceptor Shred (docs/42; user, 15 November: "when im locked in on an enemy and get an accurate barrage it should
   * shred through like a minigun ... being helped when accuracy is on point"; "fire rate only"; "just hits reset it";
   * "Lets try with 1.5s regardless of level"): while main-weapon hits keep landing, on any enemy, the guns spin up to
   * `shredCap` more fire rate over `shredWindUp` seconds, at every weapon and level (8 hits of +5% each was full in a fifth
   * of a second on a Level 4 Twin Pulse). Hits keep landing while each comes within `shredWindow` of the last (the Rail
   * Driver's slowest gap is 0.5 s). Getting hit (a shield or a life) stops them, and so does `shredIdle` without firing.
   * Replaces the Barrel Roll, which fired by accident on fast taps.
   */
  // (Cap 40%: the user, 15 November, "Put it at 30% fire rate cap", then "Then put it at 40%"; 60% was proposed.)
  shredCap: 0.4,
  shredWindUp: 1.5,
  shredWindow: 0.6,
  /**
   * The guns also stop when they stop firing (user, 15 November: "Make it reset also when the weapon is not firing"): once
   * a volley has been due this long with no target to fire at.
   */
  shredIdle: 0.5,
  /**
   * Spectre Gravity Slingshot (docs/42; replaces Gravitic Shield): a hostile shot passing within `grazeWidth` outside the
   * ship's hit circle, without hitting it, is caught, swung half round the ship over `reflectDuration` and flung back at
   * the enemy that fired it as a homing shot of `reflectedDamage` at `reflectedSpeed`. With or without shields; one catch
   * every `reflectCooldown`. It never protects: a hit still counts.
   */
  reflectCooldown: .4,
  reflectDuration: .32,
  grazeWidth: .5,
  reflectedDamage: 25,
  reflectedSpeed: 26,
  /** How sharply a returned shot turns onto its target (radians a second). */
  reflectedTurn: 6,
} as const;
