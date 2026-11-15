/**
 * Shared tuning for the chassis perks that act in flight (docs/42). No extra HUD resource. The behaviour is
 * src/sim/ship-perks.ts.
 */
export const SHIP_PERKS = {
  /**
   * Interceptor Shred (docs/42; user, 15 November: "when im locked in on an enemy and get an accurate barrage it should
   * shred through like a minigun ... being helped when accuracy is on point"; "fire rate only"; "just hits reset it"):
   * every main-weapon hit, on any enemy, spins the guns up by `shredPerHit` fire rate, up to `shredCap`. Getting hit (a
   * shield or a life) stops them, and so does `shredIdle` without firing. Replaces the Barrel Roll, which fired by accident on fast taps.
   */
  // (Cap 40%: the user, 15 November, "Put it at 30% fire rate cap", then "Then put it at 40%"; 60% was proposed.)
  shredPerHit: 0.05,
  shredCap: 0.4,
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
