/**
 * Every boss's health split over its three phases (user, 14 November: "The split should always be roughly 35-30-35", then "Or maybe 40-25-35 since double cores would die too
 * soon"):
 * its first-phase targets hold 40% of its whole health (shared evenly), its core the rest; the core's final stage
 * (the overload) begins with 35% of the whole left, so the core's first stage is 25%. Each boss kept its total.
 * Before: 33-48% / 31-41% / 21-27%, the finale the shortest though it carries the densest attacks.
 */
export const BOSS_PHASES = { first: 0.4, middle: 0.25, last: 0.35 } as const;
/** The core's share left when its final stage begins: 0.35 / 0.6. */
export const OVERLOAD_FRACTION = BOSS_PHASES.last / (BOSS_PHASES.middle + BOSS_PHASES.last);
