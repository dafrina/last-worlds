import type { EnemyKind, PlanetId } from '../shared/contracts';

/** Hunter (ace) tuning; the behaviour is src/sim/hunters.ts. */
export const HUNTERS = {
  /** Seconds between spawn chances, the chance of each, and the quiet start of a level or endless sector. */
  interval: 15, chance: 0.6, firstAfter: 10,
  /**
   * The kind each world sends: a strong craft it already flies. Never the Pulsar: its stream tracks the ship, and a
   * tracking stream from a craft that follows the ship to the world edge left no way out (validation pilots were hit).
   */
  kinds: { luna: 'weaver', khepri: 'lancer', vesper: 'diamond', nacre: 'diamond', amnion: 'diamond', corona: 'wraith', nahara: 'wraith', umbra: 'wraith' } satisfies Readonly<Record<PlanetId, EnemyKind>>,
  /** Shield charges, each absorbing this share of the kind's hull (scaled with the hull): about twice the hull in all. */
  shield: { charges: 3, share: 0.35, seekerDamage: 0.2, railDamage: 1.5 },
  /** Score over the base kind. Campaign hunter coins use BALANCE.campaignHunterCredits. */
  reward: 3,
  /**
   * Endless: besides its coins, a downed ace rolls for a shield cell (25%), a weapon the ship isn't flying (7%), a power
   * cell (5%) or nothing more (user, 31 October: "aces/hunters should maybe also drop a shield or an upgrade on endless";
   * 5 November: "per sector should be about 1 weapon drop, all four weapons (minus the equipped one)", "Power cells should be
   * abit lower, maybe 1 per sector and shields as well (1.2 is fine)"). A third power had given about 1.6 power cells a
   * sector from aces alone; the waves and sites already give about 0.8 weapons and 0.8 power cells a sector, so the aces
   * only top them up. The shield is budgeted (AGENTS.md invariant 11): at most `shieldsPerSector`, and only while the ship
   * is missing shields; otherwise that share is coins only.
   */
  endlessDrop: { shield: .25, weapon: .07, power: .05, shieldsPerSector: 1 },
  /** Roaming band (s ahead of the player row) and cruise speed and acceleration at pace 1. */
  row: { min: 10.5, max: 15 }, speed: 6, accel: 14,
  /**
   * The ship counts as retreating to a side beyond this |x|; a hunter then closes to `chaseS` ahead, right over it (an
   * offset to one side would back away whenever the ship moved under it to shoot, so the fixed guns could never line up).
   * It is half the ship's speed (user, 23 October: "quicker to follow the player"), so it still trails a weaving ship
   * and the ship can line up under it, and it follows sooner.
   */
  side: 3.5, chaseS: 10,
  /**
   * Multiplier on the kind's repeat-attack interval (with the difficulty's, but not the world's or mission's quickening):
   * aces fire more often than their kind (user, 23 October: "quicker to shoot"); every attack still passes the fairness
   * admission.
   */
  cadence: 0.85,
  /** Hunters keep this far apart. */
  spacing: 3,
  /** Seconds of age before the first windup (it is still diving in). */
  firstAttack: 2.2,
} as const;
