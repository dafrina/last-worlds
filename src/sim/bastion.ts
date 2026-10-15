import { BASTION } from '../content/bastion';
import { BALANCE, FAIRNESS, difficultyScales } from '../content/balance';
import { VIEW, type BossPart, type Enemy, type RunState } from '../shared/contracts';
import { clamp } from './geometry';
import { bossPartOffset, bossPose } from './motion';
import { BOSS_BEAM, SHOT_TTL, bossShots } from './attacks';
import { ANCHOR_LIMIT } from './airspace';
import { admitFootprints, pendingAttackFootprints, type Footprint } from './fairness';

function message(state: RunState, text: string, duration = 3) {
  state.message = text; state.messageUntil = state.time + duration;
}

function clearThreats(state: RunState) {
  state.projectiles = state.projectiles.filter(shot => shot.friendly);
  state.hazards = [];
  for (const enemy of state.enemies) enemy.warning = 0;
}

/**
 * Terrain scroll for Rolling Thunder as a closed form of active time, so the arena stop distance is exact:
 * full speed, a smoothstep ease to zero, standstill for the fight, and a smoothstep ease back up after the
 * fortress is destroyed (`destroyedAt`).
 */
export function arenaScroll(time: number, destroyedAt: number | null): { distance: number; speed: number } {
  const v = VIEW.scrollSpeed;
  const { decelStart: t0, decelDuration: span, resumeDuration: resume } = BASTION.arena;
  if (time <= t0) return { distance: v * time, speed: v };
  const stop = arenaStopDistance();
  if (time < t0 + span) {
    const u = (time - t0) / span;
    return { distance: v * t0 + v * span * (u - u ** 3 + u ** 4 / 2), speed: v * (1 - u * u * (3 - 2 * u)) };
  }
  if (destroyedAt === null || time <= destroyedAt) return { distance: stop, speed: 0 };
  const w = (time - destroyedAt) / resume;
  if (w < 1) return { distance: stop + v * resume * (w ** 3 - w ** 4 / 2), speed: v * w * w * (3 - 2 * w) };
  return { distance: stop + v * resume / 2 + v * (time - destroyedAt - resume), speed: v };
}

/** World distance at which the Rolling Thunder terrain stops: 575 with the authored arena constants. */
export function arenaStopDistance(): number {
  return VIEW.scrollSpeed * (BASTION.arena.decelStart + BASTION.arena.decelDuration / 2);
}

export function startBastion(state: RunState): void {
  if (state.boss || state.config.mode !== 'campaign' || state.config.mission !== 'bastion') return;
  const x = clamp(state.cameraX, -ANCHOR_LIMIT, ANCHOR_LIMIT);
  state.boss = { phase: 'arrival', x, originX: x, s: 22, startedAt: state.time,
    phaseStartedAt: state.time, nextAttackAt: Infinity, attackIndex: 0, attack: null,
    attackerId: null, deathEffectAt: Infinity, vx: 0, vs: 0 };
  // This authored relief is the boundary between approach and the boss encounter.
  state.enemies = [];
  clearThreats(state);
  const scale = difficultyScales('campaign', state.config.difficulty ?? 'standard', 1).hp;
  for (const part of ['left', 'right', 'core'] as const) {
    const core = part === 'core', hp = (core ? BASTION.coreHp : BASTION.batteryHp) * scale;
    state.enemies.push({ id: state.nextId++, kind: 'turret', bossPart: part, damageable: false,
      x: x + (part === 'left' ? -BASTION.batteryOffset : part === 'right' ? BASTION.batteryOffset : 0),
      s: 22 + (core ? BASTION.coreRowOffset : 0), originX: x, hp, maxHp: hp,
      radius: core ? BASTION.coreRadius : BASTION.batteryRadius, age: 0,
      nextAttack: Infinity, warning: 0, aimX: x, groundHeight: BASTION.targetHeight });
  }
  message(state, 'BASTION-9 · BREAK BOTH BATTERIES', 5);
}

export function bossTarget(state: RunState, part: BossPart): Enemy | undefined {
  return state.enemies.find(enemy => enemy.bossPart === part);
}

function transition(state: RunState, phase: 'batteries' | 'core' | 'overload' | 'destroyed') {
  const boss = state.boss!;
  boss.phase = phase; boss.phaseStartedAt = state.time;
  boss.nextAttackAt = state.time + BASTION.transitionRecovery;
  boss.attack = null; boss.attackerId = null;
  clearThreats(state);
  for (const enemy of state.enemies) if (enemy.bossPart) {
    enemy.damageable = enemy.hp > 0 && (phase === 'batteries' ? enemy.bossPart !== 'core' : phase === 'core' || phase === 'overload' ? enemy.bossPart === 'core' : false);
  }
  message(state, phase === 'batteries' ? 'BREAK BOTH BATTERIES'
    : phase === 'core' ? 'CORE EXPOSED'
    : phase === 'overload' ? 'CORE OVERLOAD · WATCH THE LANES'
    : 'BASTION-9 DESTROYED · EXTRACTION', phase === 'destroyed' ? 8 : 3);
  if (phase === 'destroyed') {
    boss.deathEffectAt = state.time;
    state.player.invulnerableUntil = state.time + BASTION.extractionDuration;
    state.credits += 60;
  }
}

/** Call after damage so removed modules stop their warning/attack immediately. */
export function resolveBastionPhase(state: RunState): void {
  const boss = state.boss;
  if (!boss || state.phase !== 'playing') return;
  for (const enemy of state.enemies) if (enemy.bossPart && enemy.hp <= 0) {
    enemy.damageable = false; enemy.warning = 0;
    if (boss.attackerId === enemy.id) { boss.attack = null; boss.attackerId = null; }
  }
  if (boss.phase === 'batteries' && ['left', 'right'].every(part => bossTarget(state, part as BossPart)!.hp <= 0)) transition(state, 'core');
  const core = bossTarget(state, 'core')!;
  if ((boss.phase === 'core' || boss.phase === 'overload') && core.hp <= 0) transition(state, 'destroyed');
  else if (boss.phase === 'core' && core.hp <= core.maxHp * BASTION.overloadFraction) transition(state, 'overload');
}

function visible(state: RunState, enemy: Enemy) {
  return Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius - .2
    && enemy.s > 3.5 && enemy.s + enemy.radius < VIEW.maxS;
}

/** Overload lanes for an attack index: even indices mark the core column, odd ones both battery columns. */
export function overloadLanes(bossX: number, index: number): { x: number; width: number }[] {
  const lanes = BASTION.overload;
  return index % 2 === 0
    ? [{ x: bossX, width: lanes.coreLaneWidth }]
    : [-1, 1].map(side => ({ x: bossX + side * BASTION.batteryOffset, width: lanes.batteryLaneWidth }));
}

function emit(state: RunState, enemy: Enemy) {
  const boss = state.boss!;
  // Overload lanes were placed as marked hazards when the windup began; nothing more is released.
  if (boss.attack && boss.attack !== 'beam') {
    const shots = bossShots(boss.attack, enemy.x, enemy.s, enemy.aimX, difficultyScales('campaign', state.config.difficulty ?? 'standard', 1).shotSpeed, enemy.bossPart === 'core');
    if (state.projectiles.length + shots.length > BALANCE.maxProjectiles) return;
    for (const shot of shots) state.projectiles.push({ id: state.nextId++, x: shot.x, s: shot.s, previousX: shot.x, previousS: shot.s,
      vx: shot.vx, vs: shot.vs, friendly: false, damage: 1, radius: shot.radius, ttl: SHOT_TTL });
  }
}

export function updateBastion(state: RunState, dt: number): void {
  const boss = state.boss;
  if (!boss) return;
  resolveBastionPhase(state);
  const age = state.time - boss.startedAt;
  const previousX = boss.x;
  const previousS = boss.s;
  if (boss.phase !== 'destroyed') {
    // Authored maneuvering on the static arena: a bounded lateral sway and a forward/back surge. The full
    // wide map stays traversable; there is no camera cage.
    const pose = bossPose(boss, state.time);
    boss.x = pose.x;
    boss.s = pose.s;
  }
  boss.vx = dt > 0 ? (boss.x - previousX) / dt : 0;
  boss.vs = dt > 0 ? (boss.s - previousS) / dt : 0;
  for (const enemy of state.enemies) if (enemy.bossPart) {
    enemy.age += dt;
    const offset = bossPartOffset(enemy.bossPart);
    enemy.x = boss.x + offset.x;
    enemy.s = boss.s + offset.s;
  }
  if (boss.phase === 'destroyed') {
    if (state.time >= boss.deathEffectAt && state.time - boss.phaseStartedAt < 2.4) {
      const offset = Math.sin((state.time - boss.phaseStartedAt) * 9) * 2.5;
      if (state.effects.length < BALANCE.maxEffects) state.effects.push({ id: state.nextId++, kind: 'explosion', x: boss.x + offset, s: boss.s + Math.cos(offset) * 1.5, ttl: .7, duration: .7 });
      boss.deathEffectAt = state.time + .24;
    }
    if (state.time - boss.phaseStartedAt + 1e-8 >= BASTION.extractionDuration) {
      state.phase = 'complete'; state.projectiles = []; state.hazards = [];
    }
    return;
  }
  if (boss.phase === 'arrival') {
    if (age + 1e-8 >= BASTION.arrivalDuration) transition(state, 'batteries');
    return;
  }
  const attacker = state.enemies.find(enemy => enemy.id === boss.attackerId && enemy.hp > 0);
  if (boss.attack && attacker) {
    // A windup that leaves the view is cancelled and must start again in full; a hit does not cancel it.
    if (!visible(state, attacker)) {
      if (boss.attack === 'beam') state.hazards = [];
      attacker.warning = 0; boss.attack = null; boss.attackerId = null;
      boss.nextAttackAt = state.time + .6;
      return;
    }
    attacker.warning = Math.max(0, attacker.warning - dt);
    if (attacker.warning === 0) {
      emit(state, attacker); boss.attack = null; boss.attackerId = null;
      boss.nextAttackAt = state.time + BASTION.recovery;
    }
    return;
  }
  if (state.time < boss.nextAttackAt || state.time < state.player.invulnerableUntil - .3) return;
  const candidates = state.enemies.filter(enemy => enemy.bossPart && enemy.hp > 0 && enemy.damageable && visible(state, enemy));
  if (candidates.length === 0) {
    if (state.time > state.messageUntil) message(state, `BASTION-9 · ${boss.x < state.player.x ? 'RETURN LEFT' : 'RETURN RIGHT'}`, 2);
    return;
  }
  const selected = candidates[boss.attackIndex % candidates.length];
  const attack = boss.phase === 'batteries' ? 'burst' : boss.phase === 'core' ? (boss.attackIndex % 2 ? 'burst' : 'fan') : 'beam';
  const aimX = attack === 'beam' ? boss.x : state.player.x;
  const warning = (attack === 'beam' ? BASTION.beamWarning : BASTION.warning)
    + difficultyScales('campaign', state.config.difficulty ?? 'standard', 1).warning;
  // The director's exclusion check applies to the fortress too. A rejected attack is not edited: the
  // fortress switches to its alternate pattern and tries again after a short delay.
  boss.attack = attack;
  const footprints: Footprint[] = attack === 'beam'
    ? overloadLanes(boss.x, boss.attackIndex).map(lane => {
      const t0 = state.time + warning + BOSS_BEAM.warning;
      return { x0: lane.x - lane.width / 2, x1: lane.x + lane.width / 2, t0, t1: t0 + BOSS_BEAM.active };
    })
    : pendingAttackFootprints(state, selected, aimX, warning);
  if (!admitFootprints(state, footprints)) {
    boss.attack = null;
    boss.attackIndex++;
    boss.nextAttackAt = state.time + FAIRNESS.retryDelay;
    return;
  }
  boss.attackerId = selected.id;
  selected.aimX = aimX;
  selected.warning = warning;
  // Overload lanes sit over the fortress's own hit columns and are marked through the whole windup; they
  // never move with the player or the swaying hull afterwards.
  if (boss.attack === 'beam') for (const lane of overloadLanes(boss.x, boss.attackIndex)) {
    state.hazards.push({ id: state.nextId++, x: lane.x, width: lane.width, warning: selected.warning + BOSS_BEAM.warning,
      active: BOSS_BEAM.active, ttl: selected.warning + BOSS_BEAM.warning + BOSS_BEAM.active });
  }
  boss.attackIndex++;
}
