import { BASTION } from '../content/bastion';
import type { BossDefinition } from '../content/bosses';
import type { Enemy, EnemyKind } from '../shared/contracts';

/**
 * Authored attack shapes. The simulation emits exactly these shots, and the fairness director predicts
 * them from the same functions, so a prediction can never describe a different pattern than the one fired.
 */
export interface ShotSpec { x: number; s: number; vx: number; vs: number; radius: number }
export interface BeamSpec { readonly width: number; readonly warning: number; readonly active: number; readonly cost?: number }

export const ENEMY_SHOT_RADIUS = 0.13;
export const SHOT_TTL = 7;
/** Half-spacing of a weaver's parallel pair: the lane between the shots still fits the 0.42 collider. */
export const WEAVER_PAIR_OFFSET = 0.75;
export const LANCER_BEAM: BeamSpec = { width: 0.8, warning: 0.35, active: 0.22 };
/** Needle: a very narrow lane on a quick timing (0.75 s windup + 0.2 s flash = 0.95 s marked). */
export const NEEDLE_BEAM: BeamSpec = { width: 0.4, warning: 0.2, active: 0.15, cost: 1 };
/** Boss lanes flash for `warning` after their windup; each boss sets its own widths and active time. */
export const BOSS_BEAM = { warning: 0.15, active: BASTION.overload.active } as const;
/** Diamond: three tight rounds from one wing, bracketing the committed position on that side; wings alternate. */
export const DIAMOND_VOLLEY = { rounds: 3, spread: 0.05, wing: 0.55, side: 1.2 } as const;
export const MISSILE_RADIUS = 0.2;

export type BulletKind = Exclude<EnemyKind, 'lancer' | 'needle'>;

export function beamSpec(kind: EnemyKind): BeamSpec {
  return kind === 'needle' ? NEEDLE_BEAM : LANCER_BEAM;
}

/** The wing a Diamond fires its next volley from: left first, then alternating. */
export function diamondSide(enemy: Pick<Enemy, 'volleys'>): -1 | 1 {
  return (enemy.volleys ?? 0) % 2 === 0 ? -1 : 1;
}

/**
 * Dart: one aimed shot. Weaver: two parallel aimed shots 1.5 units apart. Turret: aimed three-round fan.
 * Diamond: three tight rounds from the `side` wing. Missile battery: one straight missile down its aim column.
 */
export function enemyShots(kind: BulletKind, x: number, s: number, aimX: number, speed: number, side: -1 | 0 | 1 = 0): ShotSpec[] {
  const originX = kind === 'diamond' ? x + side * DIAMOND_VOLLEY.wing : x;
  const count = kind === 'weaver' ? 2 : kind === 'turret' || kind === 'diamond' ? 3 : 1;
  const aim = Math.atan2(aimX - originX, -(s - 0.2));
  const shots: ShotSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = aim + (kind === 'turret' ? (i - 1) * 0.14 : kind === 'diamond' ? (i - 1) * DIAMOND_VOLLEY.spread : 0);
    const shotX = originX + (kind === 'weaver' ? (i === 0 ? -WEAVER_PAIR_OFFSET : WEAVER_PAIR_OFFSET) : 0);
    shots.push({ x: shotX, s: s - 0.2, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: kind === 'missile' ? MISSILE_RADIUS : ENEMY_SHOT_RADIUS });
  }
  return shots;
}

/** Boss bursts (pair or core module), or Bastion-9's fixed core fan. */
export function bossShots(def: BossDefinition, attack: 'burst' | 'fan', x: number, s: number, aimX: number, speedScale: number, fromCore = false): ShotSpec[] {
  const fan = attack === 'fan' && def.fan !== null;
  const burst = fromCore ? def.bursts.core : def.bursts.pair;
  const bolts = fan ? def.fan!.bolts : burst.bolts;
  const spacing = fan ? def.fan!.spacing : burst.spread;
  const speed = (fan ? def.fan!.speed : burst.speed) * speedScale;
  const aim = fan ? Math.PI : Math.atan2(aimX - x, -s);
  const shots: ShotSpec[] = [];
  for (let i = 0; i < bolts; i += 1) {
    const angle = aim + (i - (bolts - 1) / 2) * spacing;
    shots.push({ x, s, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: ENEMY_SHOT_RADIUS });
  }
  return shots;
}
