/** Shared tuning for input, simulation and the matching animation. No extra HUD resource. The behaviour is src/sim/ship-perks.ts. */
export const SHIP_PERKS = {
  doubleTapMs: 280,
  /**
   * Interceptor Barrel Roll (user, 30 October: "a quick sideswipe to evade quickly"; "the roll is just visual for the side
   * dash"): a dash this far sideways, fast off the mark and easing out over `dashDuration`, drawn as a barrel roll. It
   * moves the ship only, with no invulnerability: hits along the way still count. 1.0 handover (3 November): twice the
   * old 2.8 units, same input, timing and cooldown.
   */
  dashDistance: 5.6,
  dashDuration: .16,
  dashCooldown: 3,
  /**
   * A sidestep outruns the camera's ordinary follow; while one lasts the camera stays within this of the ship, so the
   * ship, wingtips included, stays in view at its row under the release lens (tests/sim/ship-perks.test.ts).
   */
  dashCameraReach: 4.3,
  reflectCooldown: 1.2,
  reflectDuration: .32,
  grazeWidth: .5,
  reflectedDamage: 6,
} as const;
