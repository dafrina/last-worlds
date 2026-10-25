/** Umbra's phase predator: real active seconds, never accelerated by world/difficulty cadence. */
export const WRAITH = {
  teleport: .2, cooldown: 5, firstAttack: 1.6,
  rounds: 3, interval: .06, side: 3.6, row: 13.5,
  afterArrival: .15, leadLimit: 1.6,
  normalAttacks: 2, departureDelay: .6, exitSpeed: 8,
} as const;
