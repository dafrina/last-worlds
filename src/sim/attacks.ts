import { BASTION } from '../content/bastion';
import { WRAITH } from '../content/wraith';
import type { BossDefinition } from '../content/bosses';
import { FAIRNESS } from '../content/balance';
import { VIEW, type Enemy, type EnemyKind, type Projectile } from '../shared/contracts';

/**
 * Authored attack shapes. The simulation emits exactly these shots, and the fairness director predicts
 * them from the same functions, so a prediction can never describe a different pattern than the one fired.
 */
export interface ShotSpec {
  x: number; s: number; vx: number; vs: number; radius: number;
  /** Seconds held at the muzzle before flying. */ delay?: number;
  /** Seconds of flight before it ends (SHOT_TTL when absent): a Skimmer's shot ends where it splits. */ life?: number;
  /** Lateral acceleration (units/s²), constant: a Boomerang Barrage shot flies out, turns and comes back. */ ax?: number;
  /** Seconds before its release that a held shot shows (pulsing, harmless): the split's flash. */ show?: number;
}
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
/**
 * The Skimmer's Echo Split (docs/39): one large aimed shot that flies `flight` seconds (never closer than `floor` rows to
 * the ship), stops, flashes for `pause` (the two halves showing, harmless), and splits into two smaller shots flying
 * ±`spread` radians off its course at `speed` × its speed. Straight lines throughout: predicted exactly.
 */
export const ECHO_SPLIT = { flight: 0.85, floor: 4, pause: 0.3, spread: 0.56, speed: 1.1, radius: 0.22 } as const;

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
  if (kind === 'skimmer') return echoSplit(x, s, aimX, speed);
  const originX = kind === 'diamond' ? x + side * DIAMOND_VOLLEY.wing : x;
  // The Relic Shield fires a tight three-round fan, as a turret (its mechanic is its armour, RELIC_ARMOR).
  const count = kind === 'wraith' ? WRAITH.rounds : kind === 'weaver' ? 2 : kind === 'turret' || kind === 'diamond' || kind === 'relic' ? 3 : 1;
  const aim = kind === 'missile' ? Math.PI : Math.atan2(aimX - originX, -(s - 0.2));
  const shots: ShotSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = aim + (kind === 'turret' || kind === 'relic' ? (i - 1) * 0.14 : kind === 'diamond' ? (i - 1) * DIAMOND_VOLLEY.spread : 0);
    const shotX = originX + (kind === 'weaver' ? (i === 0 ? -WEAVER_PAIR_OFFSET : WEAVER_PAIR_OFFSET) : 0);
    shots.push({ x: shotX, s: s - 0.2, vx: Math.sin(angle) * speed, vs: Math.cos(angle) * speed, radius: kind === 'missile' ? MISSILE_RADIUS : ENEMY_SHOT_RADIUS,
      ...(kind === 'wraith' ? { delay: i * WRAITH.interval } : {}) });
  }
  return shots;
}

/**
 * The Relic Shield's armoured core (docs/39): closed, its armour lets `closedShare` of any damage through (every weapon,
 * special and slug alike: no weapon is exempt or immune). It stays closed through its windup (the warning), opens for `open`
 * seconds once it fires, then stays closed at least `rest` seconds before its next windup, whatever the world's cadence (at
 * Nahara's it would otherwise fire again inside its open window and never close). Below `breakBelow` of its hull the armour
 * is broken for good and every hit lands in full.
 */
export const RELIC_ARMOR = { closedShare: 0.25, open: 1.2, rest: 0.8, breakBelow: 0.3 } as const;
/** Whether a Relic Shield's core is exposed now (open after an attack, or its armour broken). */
export function relicExposed(enemy: Pick<Enemy, 'hp' | 'maxHp' | 'openUntil'>, time: number): boolean {
  return time < (enemy.openUntil ?? -Infinity) || enemy.hp < enemy.maxHp * RELIC_ARMOR.breakBelow;
}

/** A hostile projectile for an authored shot (its id from the run's counter): the one place specs become shots. */
export function hostileShot(id: number, shot: ShotSpec): Projectile {
  return { id, x: shot.x, s: shot.s, previousX: shot.x, previousS: shot.s, vx: shot.vx, vs: shot.vs, friendly: false, damage: 1,
    radius: shot.radius, ttl: shot.life ?? SHOT_TTL, ...(shot.delay ? { delay: shot.delay } : {}), ...(shot.show ? { show: shot.show } : {}),
    ...(shot.ax ? { ax: shot.ax } : {}) };
}

/** A Skimmer's Echo Split (ECHO_SPLIT): the large shot, ending at the split point, and its two halves held there. */
export function echoSplit(x: number, s: number, aimX: number, speed: number): ShotSpec[] {
  const s0 = s - 0.2, aim = Math.atan2(aimX - x, -s0), vx = Math.sin(aim) * speed, vs = Math.cos(aim) * speed;
  // Splits after `flight` seconds, sooner if that would bring it within `floor` rows of the ship.
  const flight = Math.max(0.25, Math.min(ECHO_SPLIT.flight, (s0 - ECHO_SPLIT.floor) / -vs));
  const sx = x + vx * flight, ss = s0 + vs * flight, fast = speed * ECHO_SPLIT.speed;
  const half = (turn: number): ShotSpec => ({ x: sx, s: ss, vx: Math.sin(aim + turn) * fast, vs: Math.cos(aim + turn) * fast, radius: ENEMY_SHOT_RADIUS,
    delay: flight + ECHO_SPLIT.pause, show: ECHO_SPLIT.pause });
  return [{ x, s: s0, vx, vs, radius: ECHO_SPLIT.radius, life: flight }, half(-ECHO_SPLIT.spread), half(ECHO_SPLIT.spread)];
}

/** A boss's shot attacks (its lanes are hazards, src/sim/boss.ts). */
export type BossShotAttack = 'burst' | 'fan' | 'spiral' | 'fracture' | 'boomerang';
/** The view-relative columns a Fracture Wave's gaps open over, in order: the centre, then a side, then the centre... */
export type FractureColumn = -1 | 0 | 1;

/**
 * Fracture Wave (docs/39): `walls` walls of shots across the whole map, each with one gap, flying straight down one after
 * another. `aimX` is the view's centre at commit (src/sim/boss.ts aims it there): each gap is centred on the view's centre
 * column or on one of its edge columns, so it always holds one of the strips the fairness rules keep open, and successive
 * gaps zigzag centre → side → centre → other side. A ship that stays put is caught by the next wall, at the edge or in the
 * middle; one that weaves from gap to gap passes. The first side is the one away from the hull (`x`). Every wall flickers
 * in place for `show` seconds before it flies.
 */
export function fractureColumns(walls: number, first: -1 | 1): FractureColumn[] {
  const out: FractureColumn[] = [];
  for (let k = 0; k < walls; k++) out.push(k % 2 === 0 ? 0 : (k % 4 === 1 ? first : -first) as -1 | 1);
  return out;
}
export function fractureWave(spec: NonNullable<BossDefinition['fracture']>, x: number, s: number, aimX: number, speedScale: number): ShotSpec[] {
  const edge = VIEW.width / 2 - FAIRNESS.sealStrip / 2, limit = VIEW.worldWidth / 2 + spec.spacing;
  const first = x > aimX ? -1 : 1, shots: ShotSpec[] = [];
  fractureColumns(spec.walls, first).forEach((column, k) => {
    const gap = aimX + column * edge, delay = spec.show + k * spec.interval;
    for (const side of [-1, 1]) {
      for (let at = gap + side * spec.gap / 2; Math.abs(at) <= limit; at += side * spec.spacing) {
        shots.push({ x: at, s: s - 0.6, vx: 0, vs: -spec.speed * speedScale, radius: ENEMY_SHOT_RADIUS, delay, show: spec.show });
      }
    }
  });
  return shots;
}

/**
 * Boomerang Barrage (docs/39): volleys of shots that swing out to one side, turn and come back across, each under a
 * constant lateral acceleration (Projectile.ax), so the simulation and the fairness forecast follow the same exact curve.
 * Every shot is solved to cross the player row at `aimX + offset` for its volley's offsets: out to the side away from its
 * crossing at `swing` lateral speed, so the returns sweep back over the space the ship is in. Volleys leave `interval` apart.
 */
export function boomerangBarrage(spec: NonNullable<BossDefinition['boomerang']>, x: number, s: number, aimX: number, speedScale: number): ShotSpec[] {
  const speed = spec.speed * speedScale, s0 = s - 0.4, crossing = s0 / speed, shots: ShotSpec[] = [];
  spec.volleys.forEach((offsets, k) => offsets.forEach((offset, i) => {
    const d = aimX + offset - x, out = Math.abs(d) > 0.05 ? -Math.sign(d) : (i % 2 ? 1 : -1);
    const vx = out * spec.swing * speedScale, ax = 2 * (d - vx * crossing) / (crossing * crossing);
    shots.push({ x, s: s0, vx, vs: -speed, ax, radius: ENEMY_SHOT_RADIUS, ...(k ? { delay: k * spec.interval } : {}) });
  }));
  return shots;
}

/** Boss bursts (pair or core module), Bastion-9's fixed core fan, a spiral, a Fracture Wave or a Boomerang Barrage. */
export function bossShots(def: BossDefinition, attack: BossShotAttack, x: number, s: number, aimX: number, speedScale: number, fromCore = false): ShotSpec[] {
  if (attack === 'fracture' && def.fracture) return fractureWave(def.fracture, x, s, aimX, speedScale);
  if (attack === 'boomerang' && def.boomerang) return boomerangBarrage(def.boomerang, x, s, aimX, speedScale);
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
