import { BASTION } from '../content/bastion';
import { BALANCE, difficultyScales } from '../content/balance';
import { VIEW, type BossPart, type Enemy, type RunState } from '../shared/contracts';
import { clamp } from './geometry';
import { BOSS_BEAM, SHOT_TTL, bossShots } from './attacks';

function message(state: RunState, text: string, duration = 3) {
  state.message = text; state.messageUntil = state.time + duration;
}

function clearThreats(state: RunState) {
  state.projectiles = state.projectiles.filter(shot => shot.friendly);
  state.hazards = [];
  for (const enemy of state.enemies) enemy.warning = 0;
}

export function startBastion(state: RunState): void {
  if (state.boss || state.config.mode !== 'campaign' || state.config.mission !== 'bastion') return;
  const x = clamp(state.cameraX, -11, 11);
  state.boss = { phase: 'arrival', x, originX: x, s: 22, startedAt: state.time,
    phaseStartedAt: state.time, nextAttackAt: Infinity, attackIndex: 0, attack: null,
    attackerId: null, deathEffectAt: Infinity };
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

function emit(state: RunState, enemy: Enemy) {
  const boss = state.boss!;
  if (boss.attack === 'beam') {
    state.hazards.push({ id: state.nextId++, x: enemy.aimX, width: BOSS_BEAM.width, warning: BOSS_BEAM.warning,
      active: BOSS_BEAM.active, ttl: BOSS_BEAM.warning + BOSS_BEAM.active });
  } else if (boss.attack) {
    const shots = bossShots(boss.attack, enemy.x, enemy.s, enemy.aimX, difficultyScales('campaign', state.config.difficulty ?? 'standard', 1).shotSpeed);
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
  boss.s = boss.phase === 'arrival'
    ? 22 + (BASTION.row - 22) * Math.min(1, age / BASTION.arrivalDuration) : BASTION.row;
  // Modest authored sway leaves the full wide map traversable; there is no camera cage.
  boss.x = boss.originX + Math.sin(Math.max(0, age - BASTION.arrivalDuration) * .18) * .65;
  for (const enemy of state.enemies) if (enemy.bossPart) {
    enemy.age += dt;
    enemy.x = boss.x + (enemy.bossPart === 'left' ? -BASTION.batteryOffset : enemy.bossPart === 'right' ? BASTION.batteryOffset : 0);
    enemy.s = boss.s + (enemy.bossPart === 'core' ? BASTION.coreRowOffset : 0);
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
    if (!visible(state, attacker) || state.time < state.player.invulnerableUntil - .3) {
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
  if (state.time < boss.nextAttackAt || state.time < state.player.invulnerableUntil) return;
  const candidates = state.enemies.filter(enemy => enemy.bossPart && enemy.hp > 0 && enemy.damageable && visible(state, enemy));
  if (candidates.length === 0) {
    if (state.time > state.messageUntil) message(state, `BASTION-9 · ${boss.x < state.player.x ? 'RETURN LEFT' : 'RETURN RIGHT'}`, 2);
    return;
  }
  const selected = candidates[boss.attackIndex % candidates.length];
  boss.attack = boss.phase === 'batteries' ? 'burst' : boss.phase === 'core' ? 'fan' : 'beam';
  boss.attackerId = selected.id;
  selected.aimX = boss.attack === 'beam' ? boss.x + (boss.attackIndex % 2 ? 1.8 : -1.8) : state.player.x;
  selected.warning = (boss.attack === 'beam' ? BASTION.beamWarning : BASTION.warning)
    + difficultyScales('campaign', state.config.difficulty ?? 'standard', 1).warning;
  // Beam lanes are marked through the whole windup; the shot never tracks the player afterward.
  if (boss.attack === 'beam') state.hazards.push({ id: state.nextId++, x: selected.aimX,
    width: .9, warning: selected.warning + .15, active: 0, ttl: selected.warning + .15 });
  boss.attackIndex++;
}
