import { WEAPONS } from './balance';
import { weaponRank } from './equipment';
import type { WeaponId } from '../shared/contracts';

/** One emitted volley and the delay to the next step. Sequences emit at the live hero muzzle, never frozen delayed shots. */
export interface WeaponStep { angles: readonly number[]; offsets: readonly number[]; wait: number }
const shot = (angle: number, offset: number, wait: number): WeaponStep => ({ angles: [angle], offsets: [offset], wait });
const twin = (wait: number): WeaponStep => ({ angles: [0, 0], offsets: [-.2, .2], wait });
const fan = (count: number, wait: number): WeaponStep => ({ angles: Array.from({ length: count }, (_, i) => -12 + i * 24 / (count - 1)), offsets: Array(count).fill(0), wait });
const patterns: Record<WeaponId, readonly (readonly WeaponStep[])[]> = {
  pulse: [[twin(WEAPONS.pulse.cadence)], [twin(1 / 12)], [shot(0, -.2, 1 / 60), shot(0, .2, 1 / 60), shot(0, -.2, 1 / 60), shot(0, .2, 1 / 12)]],
  fan: [[fan(5, WEAPONS.fan.cadence)], [fan(9, WEAPONS.fan.cadence)], [fan(9, 2 / 9)]],
  seeker: [[shot(-5, -.23, .24), shot(5, .23, .24)], [{ angles: [-5, 5], offsets: [-.23, .23], wait: .32 }],
    [shot(-5, -.23, .08), shot(5, .23, .08), shot(-5, -.23, .08), shot(5, .23, .24)]],
  rail: [[shot(0, 0, WEAPONS.rail.cadence)], [shot(0, 0, 1 / 3)], [{ angles: [0, 0], offsets: [-.3, .3], wait: .45 }]],
};
export const weaponSequence = (weapon: WeaponId, rank: number): readonly WeaponStep[] => patterns[weapon][weaponRank(rank)];
