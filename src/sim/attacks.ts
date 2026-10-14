import type { EnemyKind } from '../shared/contracts';

/**
 * Authored attack shapes. The simulation emits exactly these shots, and the fairness director predicts
 * them from the same functions, so a prediction can never describe a different pattern than the one fired.
 */
export interface ShotSpec { x: number; s: number; vx: number; vs: number; radius: number }
export interface BeamSpec { readonly width: number; readonly warning: number; readonly active: number }

export const ENEMY_SHOT_RADIUS = 0.13;
export const SHOT_TTL = 7;
export const LANCER_BEAM: BeamSpec = { width: 0.8, warning: 0.35, active: 0.22 };
export const BOSS_BEAM: BeamSpec = { width: 0.9, warning: 0.15, active: 0.3 };

/** Dart: one aimed shot. Weaver: two parallel aimed shots 1 unit apart. Turret: aimed three-round fan. */
export function enemyShots(kind: Exclude<EnemyKind, 'lancer'>, x: number, s: number, aimX: number, speed: number): ShotSpec[] {
  const count = kind === 'weaver' ? 2 : kind === 'turret' ? 3 : 1;
  const aim = Math.atan2(aimX - x, -(s - 0.2));
  const shots: ShotSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = aim + (kind === 'turret' ? (i - 1) * 0.14 : 0);
    const originX = x + (kind === 'weaver' ? (i === 0 ? -0.5 : 0.5) : 0);
    shots.push({ x: originX, s: s - 0.2, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: ENEMY_SHOT_RADIUS });
  }
  return shots;
}

/** Bastion-9: aimed three-bolt battery burst, or five fixed core fan trajectories. */
export function bossShots(attack: 'burst' | 'fan', x: number, s: number, aimX: number, speedScale: number): ShotSpec[] {
  const fan = attack === 'fan';
  const count = fan ? 5 : 3;
  const speed = (fan ? 4.6 : 6.2) * speedScale;
  const aim = fan ? Math.PI : Math.atan2(aimX - x, -s);
  const shots: ShotSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = aim + (i - (count - 1) / 2) * (fan ? Math.PI / 15 : 0.095);
    shots.push({ x, s, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: ENEMY_SHOT_RADIUS });
  }
  return shots;
}
