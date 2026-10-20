import { BASTION } from '../content/bastion';
import type { BossDefinition } from '../content/bosses';
import type { Enemy, EnemyKind } from '../shared/contracts';

/**
 * Authored attack shapes. The simulation emits exactly these shots, and the fairness director predicts
 * them from the same functions, so a prediction can never describe a different pattern than the one fired.
 */
export interface ShotSpec { x: number; s: number; vx: number; vs: number; radius: number; /** Seconds held at the muzzle before flying. */ delay?: number }
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
export function bossShots(def: BossDefinition, attack: 'burst' | 'fan' | 'spiral', x: number, s: number, aimX: number, speedScale: number, fromCore = false): ShotSpec[] {
  if (attack === 'spiral' && def.spiral) {
    // A spiral barrage: every volley fires `arms` shots around the full circle, the pattern turning each volley.
    const { arms, turn, interval, duration, speed } = def.spiral, shots: ShotSpec[] = [];
    for (let v = 0, t = 0; t < duration - 1e-9; v++, t = v * interval) {
      for (let k = 0; k < arms; k++) {
        const angle = Math.PI + turn * t + k * 2 * Math.PI / arms;
        shots.push({ x, s, vx: Math.sin(angle) * speed * speedScale, vs: Math.cos(angle) * speed * speedScale, radius: ENEMY_SHOT_RADIUS, delay: t });
      }
    }
    return shots;
  }
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

/**
 * A Pulsar burst (Nacre): PULSAR_BURST.shots shots from (x, s), each `delay` later than the one before, all aimed at
 * (aimX, 0) when emitted. Fired all at once; each waits at the muzzle for its delay (Projectile.delay) and, being a
 * tracking shot, re-aims at the player as it leaves (aimAtPlayer). Fairness predicts the stream down the line to
 * the player's position at commit: a ship that keeps moving is never where a shot arrives.
 */
export function pulsarBurst(x: number, s: number, aimX: number, speed: number, shots: number, interval: number): (ShotSpec & { delay: number })[] {
  const dx = aimX - x, ds = -s, length = Math.hypot(dx, ds) || 1;
  return Array.from({ length: shots }, (_, i) => ({ x, s: s - 0.2, vx: dx / length * speed, vs: ds / length * speed, radius: ENEMY_SHOT_RADIUS, delay: i * interval }));
}

/** Points a shot at the player's row position `playerX` (s = 0), keeping its speed. */
export function aimAtPlayer(shot: { x: number; s: number; vx: number; vs: number }, playerX: number): void {
  const speed = Math.hypot(shot.vx, shot.vs), dx = playerX - shot.x, ds = -shot.s, length = Math.hypot(dx, ds) || 1;
  shot.vx = dx / length * speed; shot.vs = ds / length * speed;
}
