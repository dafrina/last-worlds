import { WEAPONS } from './balance';
import { weaponRank } from './equipment';
import type { WeaponId } from '../shared/contracts';

/**
 * One emitted volley and the delay to the next step. Sequences emit at the live hero muzzle, never frozen delayed shots.
 * `speed` scales the weapon's shot speed for this step (tiers 4 and 5 of Twin Pulse and Fan Cannon); the range stays the
 * weapon's, so a faster shot lives shorter.
 */
export interface WeaponStep { angles: readonly number[]; offsets: readonly number[]; wait: number; speed?: number }
const shot = (angle: number, offset: number, wait: number): WeaponStep => ({ angles: [angle], offsets: [offset], wait });
const twin = (wait: number): WeaponStep => ({ angles: [0, 0], offsets: [-.2, .2], wait });
const fan = (count: number, wait: number, speed?: number): WeaponStep => ({ angles: Array.from({ length: count }, (_, i) => -12 + i * 24 / (count - 1)), offsets: Array(count).fill(0), wait, ...(speed ? { speed } : {}) });
const fast = (steps: readonly WeaponStep[], speed: number) => steps.map(step => ({ ...step, speed }));
/** Waits in whole simulation ticks (60 Hz), so every tier's rate is exact. */
const ticks = (n: number) => n / 60;

/**
 * Five tiers per weapon (docs/30). Tiers 1-3 as of 28 October. Tiers 4 and 5 (user, 31 October: "2 new crazier levels",
 * then "faster shots instead of much more. maybe 2 more projectiles each weapon on max level but other than that quicker
 * shots"): tier 4 fires tier 3's volley about 1.35 times as often; tier 5 adds two projectiles to the volley and fires about
 * 1.6-1.7 times as often as tier 3. Every family keeps its pattern: straight streams, one fixed fan, homing missiles,
 * parallel piercing slugs.
 */
const patterns: Record<WeaponId, readonly (readonly WeaponStep[])[]> = {
  pulse: [[twin(WEAPONS.pulse.cadence)], [twin(1 / 12)], [shot(0, -.2, 1 / 60), shot(0, .2, 1 / 60), shot(0, -.2, 1 / 60), shot(0, .2, 1 / 12)],
    // 4: the same four-bolt burst every 6 ticks (8 at tier 3). 5: two outer streams at ±0.55 join it, a burst every 5 ticks.
    fast([shot(0, -.2, ticks(1)), shot(0, .2, ticks(1)), shot(0, -.2, ticks(1)), shot(0, .2, ticks(3))], 1.1),
    fast([{ angles: [0, 0], offsets: [-.2, -.55], wait: ticks(1) }, { angles: [0, 0], offsets: [.2, .55], wait: ticks(1) },
      shot(0, -.2, ticks(1)), shot(0, .2, ticks(2))], 1.2)],
  // 4: nine pellets every 10 ticks (14 at tier 3). 5: eleven over the same ±12°, 8 and 9 ticks apart in turn (8.5 on average).
  fan: [[fan(5, WEAPONS.fan.cadence)], [fan(9, WEAPONS.fan.cadence)], [fan(9, 2 / 9)], [fan(9, ticks(10), 1.1)], [fan(11, ticks(8), 1.2), fan(11, ticks(9), 1.2)]],
  // 4: the four-missile burst 4 ticks apart, then 10 (30 ticks a burst at tier 3, 22 here). 5: six, adding a wider outer
  // pair, 2 ticks apart then 8 (18 a burst).
  seeker: [[shot(-5, -.23, .24), shot(5, .23, .24)], [{ angles: [-5, 5], offsets: [-.23, .23], wait: .32 }],
    [shot(-5, -.23, .08), shot(5, .23, .08), shot(-5, -.23, .08), shot(5, .23, .24)],
    [shot(-5, -.23, ticks(4)), shot(5, .23, ticks(4)), shot(-5, -.23, ticks(4)), shot(5, .23, ticks(10))],
    [shot(-5, -.23, ticks(2)), shot(5, .23, ticks(2)), shot(-5, -.23, ticks(2)), shot(5, .23, ticks(2)), shot(-12, -.45, ticks(2)), shot(12, .45, ticks(8))]],
  // 4: the twin slugs every 20 ticks (27 at tier 3). 5: four slugs side by side, every 16 ticks.
  rail: [[shot(0, 0, WEAPONS.rail.cadence)], [shot(0, 0, 1 / 3)], [{ angles: [0, 0], offsets: [-.3, .3], wait: .45 }],
    [{ angles: [0, 0], offsets: [-.3, .3], wait: ticks(20) }], [{ angles: [0, 0, 0, 0], offsets: [-.9, -.3, .3, .9], wait: ticks(16) }]],
};
export const weaponSequence = (weapon: WeaponId, rank: number): readonly WeaponStep[] => patterns[weapon][weaponRank(rank)];
