import { BASTION } from '../content/bastion';
import type { EnemyKind } from '../shared/contracts';

/**
 * Authored attack shapes. The simulation emits exactly these shots, and the fairness director predicts
 * them from the same functions, so a prediction can never describe a different pattern than the one fired.
 */
export interface ShotSpec { x: number; s: number; vx: number; vs: number; radius: number }
export interface BeamSpec { readonly width: number; readonly warning: number; readonly active: number }

export const ENEMY_SHOT_RADIUS = 0.13;
export const SHOT_TTL = 7;
/** Half-spacing of a weaver's parallel pair: the lane between the shots still fits the 0.42 collider. */
export const WEAVER_PAIR_OFFSET = 0.75;
export const LANCER_BEAM: BeamSpec = { width: 0.8, warning: 0.35, active: 0.22 };
/** Overload lanes flash for `warning` after their windup, then stay active; widths come from BASTION.overload. */
export const BOSS_BEAM = { warning: 0.15, active: BASTION.overload.active } as const;

/** Dart: one aimed shot. Weaver: two parallel aimed shots 1.5 units apart. Turret: aimed three-round fan. */
export function enemyShots(kind: Exclude<EnemyKind, 'lancer'>, x: number, s: number, aimX: number, speed: number): ShotSpec[] {
  const count = kind === 'weaver' ? 2 : kind === 'turret' ? 3 : 1;
  const aim = Math.atan2(aimX - x, -(s - 0.2));
  const shots: ShotSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = aim + (kind === 'turret' ? (i - 1) * 0.14 : 0);
    const originX = x + (kind === 'weaver' ? (i === 0 ? -WEAVER_PAIR_OFFSET : WEAVER_PAIR_OFFSET) : 0);
    shots.push({ x: originX, s: s - 0.2, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: ENEMY_SHOT_RADIUS });
  }
  return shots;
}

/** Bastion-9: aimed bursts (battery: three bolts, core: five) or the core's fixed five-way fan. */
export function bossShots(attack: 'burst' | 'fan', x: number, s: number, aimX: number, speedScale: number, fromCore = false): ShotSpec[] {
  const fan = attack === 'fan';
  const burst = fromCore ? BASTION.coreBurst : BASTION.batteryBurst;
  const bolts = fan ? BASTION.coreFan.bolts : burst.bolts;
  const spacing = fan ? BASTION.coreFan.spacing : burst.spread;
  const speed = (fan ? BASTION.coreFan.speed : burst.speed) * speedScale;
  const aim = fan ? Math.PI : Math.atan2(aimX - x, -s);
  const shots: ShotSpec[] = [];
  for (let i = 0; i < bolts; i += 1) {
    const angle = aim + (i - (bolts - 1) / 2) * spacing;
    shots.push({ x, s, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: ENEMY_SHOT_RADIUS });
  }
  return shots;
}
