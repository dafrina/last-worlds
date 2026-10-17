import { BASTION } from '../content/bastion';
import { REWARDS } from '../content/equipment';
import { departure } from '../content/departure';
import { BALANCE, FAIRNESS } from '../content/balance';
import { ENDLESS_CYCLE } from '../content/endless';
import { BOSSES, WRECK_HOLD, missionBoss, type BossDefinition } from '../content/bosses';
import { VIEW, type BossPart, type Enemy, type RunState } from '../shared/contracts';
import { clamp } from './geometry';
import { bossPartOffset, bossPose } from './motion';
import { BOSS_BEAM, SHOT_TTL, bossShots } from './attacks';
import { ANCHOR_LIMIT } from './airspace';
import { admitFootprints, pendingAttackFootprints, type Footprint } from './fairness';
import { bossShotScale, runScale, spawnMembers } from './spawn';

/*
 * Campaign bosses: Bastion-9 (Rolling Thunder) and the Helion Ark (Cold Vector). Both follow the same phase
 * rules from their BossDefinition: harmless arrival → 'batteries' (first module pair) → 'core' (main target)
 * → 'overload' (lanes over their own hit columns) → 'destroyed' (anchored wreck, extraction).
 */

function message(state: RunState, text: string, duration = 3) {
  state.message = text; state.messageUntil = state.time + duration;
}

function clearThreats(state: RunState) {
  state.projectiles = state.projectiles.filter(shot => shot.friendly);
  state.hazards = [];
  for (const enemy of state.enemies) enemy.warning = 0;
}

function bossDef(state: RunState): BossDefinition {
  return BOSSES[state.boss!.id];
}

/** Pause after each boss attack: the authored recovery, scaled by the endless cadence ramp in endless. */
function bossRecovery(state: RunState): number {
  const def = bossDef(state), base = state.boss?.phase === 'overload' ? def.overloadRecovery ?? def.recovery : def.recovery;
  return base * (state.config.mode === 'endless' ? runScale(state).cadence : 1);
}
/** The overload move for the next attack. */
const overloadMove = (state: RunState) => { const moves = bossDef(state).overloadMoves; return moves[state.boss!.attackIndex % moves.length]; };

/** Endless: protection through the scroll resume and the hyperdrive jump after the kill. */
const ENDLESS_EXIT_PROTECTION = WRECK_HOLD + ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration + 0.5;

/**
 * Terrain scroll for a boss mission as a closed form of active time, so the arena stop distance is exact:
 * full speed, a smoothstep ease to zero, standstill for the fight, and a smoothstep ease back up after the
 * boss is destroyed (`destroyedAt`).
 */
export function arenaScroll(time: number, destroyedAt: number | null, arena: BossDefinition['arena'] = BASTION.arena): { distance: number; speed: number } {
  const v = VIEW.scrollSpeed;
  const { decelStart: t0, decelDuration: span } = arena;
  if (time <= t0) return { distance: v * time, speed: v };
  const stop = arenaStopDistance(arena);
  if (time < t0 + span) {
    const u = (time - t0) / span;
    return { distance: v * t0 + v * span * (u - u ** 3 + u ** 4 / 2), speed: v * (1 - u * u * (3 - 2 * u)) };
  }
  // After the kill: the wreck hold, then the departure (src/content/departure.ts), as in endless.
  const resumeAt = destroyedAt === null ? Infinity : destroyedAt + WRECK_HOLD;
  if (time <= resumeAt) return { distance: stop, speed: 0 };
  const d = departure(time - resumeAt);
  return { distance: stop + d.distance, speed: d.speed };
}

/** World distance at which a boss arena's terrain stops: 675 for Rolling Thunder, 935 for Cold Vector. */
export function arenaStopDistance(arena: BossDefinition['arena'] = BASTION.arena): number {
  return VIEW.scrollSpeed * (arena.decelStart + arena.decelDuration / 2);
}

/**
 * Starts a boss: the current campaign mission's boss by default, or the given one (endless boss sectors).
 * No-op if a boss is already present or the mission has none.
 */
export function startBoss(state: RunState, which: BossDefinition | null = state.config.mode === 'campaign' ? missionBoss(state.config.mission) : null): void {
  const def = which;
  if (state.boss || !def) return;
  const x = clamp(state.cameraX, -ANCHOR_LIMIT, ANCHOR_LIMIT);
  state.boss = { id: def.id, phase: 'arrival', x, originX: x, s: def.entryS, startedAt: state.time,
    phaseStartedAt: state.time, nextAttackAt: Infinity, attackIndex: 0, attack: null,
    attackerId: null, deathEffectAt: Infinity, vx: 0, vs: 0, launchesLeft: 0, nextLaunchAt: Infinity };
  // This authored relief is the boundary between approach and the boss encounter.
  state.enemies = [];
  clearThreats(state);
  // Campaign difficulty, or the endless ramp at this sector.
  const scale = runScale(state).hp;
  for (const part of ['left', 'right', 'core'] as const) {
    const spec = def.parts[part], hp = spec.hp * scale;
    state.enemies.push({ id: state.nextId++, kind: 'turret', bossPart: part, damageable: false,
      x: x + spec.x, s: def.entryS + spec.s, originX: x, hp, maxHp: hp, radius: spec.radius, age: 0,
      nextAttack: Infinity, warning: 0, aimX: x, groundHeight: def.targetHeight });
  }
  message(state, def.messages.start, 5);
}
/** Name kept for the Rolling Thunder fixtures and tests; starts whichever boss the mission has. */
export const startBastion = startBoss;

export function bossTarget(state: RunState, part: BossPart): Enemy | undefined {
  return state.enemies.find(enemy => enemy.bossPart === part);
}

function transition(state: RunState, phase: 'batteries' | 'core' | 'overload' | 'destroyed') {
  const boss = state.boss!;
  const def = bossDef(state);
  boss.phase = phase; boss.phaseStartedAt = state.time;
  boss.nextAttackAt = state.time + def.transitionRecovery;
  boss.attack = null; boss.attackerId = null;
  clearThreats(state);
  for (const enemy of state.enemies) if (enemy.bossPart) {
    enemy.damageable = enemy.hp > 0 && (phase === 'batteries' ? enemy.bossPart !== 'core' : phase === 'core' || phase === 'overload' ? enemy.bossPart === 'core' : false);
  }
  if (phase === 'core' && def.launches) {
    boss.launchesLeft = def.launches.waves;
    boss.nextLaunchAt = state.time + def.launches.firstAfter;
  }
  if (phase === 'overload') {
    boss.attackIndex = 0;
    if (def.launches?.overloadWaves) { boss.launchesLeft += def.launches.overloadWaves; boss.nextLaunchAt = Math.max(boss.nextLaunchAt, state.time + def.launches.firstAfter); }
  }
  message(state, def.messages[phase], phase === 'destroyed' ? 4 : 3);
  if (phase === 'destroyed') {
    boss.deathEffectAt = state.time;
    boss.launchesLeft = 0;
    const campaign = state.config.mode === 'campaign';
    state.player.invulnerableUntil = state.time + (campaign ? WRECK_HOLD + def.extractionDuration : ENDLESS_EXIT_PROTECTION);
    // Credits are campaign-only; endless scores the kill through the core's 5,000 points.
    if (campaign) state.credits += REWARDS.boss;
    // Launched fighters go down with their carrier: nothing dangerous remains during extraction.
    state.enemies = state.enemies.filter(enemy => enemy.bossPart);
  }
}

/** Call after damage so removed modules stop their warning/attack immediately. */
export function resolveBossPhase(state: RunState): void {
  const boss = state.boss;
  if (!boss || state.phase !== 'playing') return;
  for (const enemy of state.enemies) if (enemy.bossPart && enemy.hp <= 0) {
    enemy.damageable = false; enemy.warning = 0;
    if (boss.attackerId === enemy.id) { boss.attack = null; boss.attackerId = null; }
  }
  if (boss.phase === 'batteries' && ['left', 'right'].every(part => bossTarget(state, part as BossPart)!.hp <= 0)) transition(state, 'core');
  const core = bossTarget(state, 'core')!;
  if ((boss.phase === 'core' || boss.phase === 'overload') && core.hp <= 0) transition(state, 'destroyed');
  else if (boss.phase === 'core' && core.hp <= core.maxHp * bossDef(state).overloadFraction) transition(state, 'overload');
}
export const resolveBastionPhase = resolveBossPhase;

function visible(state: RunState, enemy: Enemy) {
  return Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius - .2
    && enemy.s > 3.5 && enemy.s + enemy.radius < VIEW.maxS;
}

/** Overload lanes for an attack index: even indices mark the core column, odd ones both side-module columns. */
export function overloadLanes(bossX: number, index: number, def: BossDefinition = BOSSES.bastion): { x: number; width: number }[] {
  const lanes = def.overload;
  return index % 2 === 0
    ? [{ x: bossX + def.parts.core.x, width: lanes.coreLaneWidth }]
    : (['left', 'right'] as const).map(part => ({ x: bossX + def.parts[part].x, width: lanes.batteryLaneWidth }));
}

/** Marked lanes for a boss lane attack: radiator lasers lock on the player; overload lanes cover its own columns. */
function attackLanes(state: RunState, def: BossDefinition, from: Enemy): { x: number; width: number; active: number }[] {
  const boss = state.boss!;
  // Radiator lasers fire straight down from the radiator that fires them.
  if (boss.phase === 'batteries' && def.laser) return [{ x: from.x, width: def.laser.width, active: def.laser.active }];
  const active = def.overload.active, move = overloadMove(state);
  if (move === 'cross') {
    // The core column and one side column, alternating sides through the sequence.
    const side = Math.floor(boss.attackIndex / def.overloadMoves.length) % 2 ? 'left' : 'right';
    return [{ x: boss.x + def.parts.core.x, width: def.overload.coreLaneWidth, active }, { x: boss.x + def.parts[side].x, width: def.overload.batteryLaneWidth, active }];
  }
  return overloadLanes(boss.x, move === 'side-lanes' ? 1 : 0, def).map(lane => ({ ...lane, active }));
}

function emit(state: RunState, enemy: Enemy) {
  const boss = state.boss!;
  // Lanes were placed as marked hazards when the windup began; nothing more is released.
  if (boss.attack && boss.attack !== 'beam') {
    const shots = bossShots(bossDef(state), boss.attack, enemy.x, enemy.s, enemy.aimX, bossShotScale(state), enemy.bossPart === 'core');
    if (state.projectiles.length + shots.length > BALANCE.maxProjectiles) return;
    for (const shot of shots) state.projectiles.push({ id: state.nextId++, x: shot.x, s: shot.s, previousX: shot.x, previousS: shot.s,
      vx: shot.vx, vs: shot.vs, friendly: false, damage: 1, radius: shot.radius, ttl: SHOT_TTL });
  }
}

/** Finite launches from a boss's bays (the Helion Ark's Needles, THE VEIL's pods) in its core and overload phases. */
function updateLaunches(state: RunState): void {
  const boss = state.boss!;
  const def = bossDef(state);
  if (!def.launches || (boss.phase !== 'core' && boss.phase !== 'overload') || boss.launchesLeft <= 0 || state.time < boss.nextLaunchAt) return;
  // One wave at a time, only while the bays are in view and the player is not in respawn protection.
  const waveAlive = state.enemies.some(enemy => enemy.hp > 0 && enemy.formation?.template === def.launches!.template);
  const bay = def.launches.bays[0];
  const baysVisible = Math.abs(boss.x - state.cameraX) <= VIEW.width / 2 - Math.abs(bay.x) - 0.5;
  if (waveAlive || !baysVisible || state.time < state.player.invulnerableUntil - .3) { boss.nextLaunchAt = state.time + FAIRNESS.retryDelay; return; }
  spawnMembers(state, def.launches.template, boss.x, 1, boss.s);
  boss.launchesLeft -= 1;
  boss.nextLaunchAt = state.time + def.launches.interval;
}

export function updateBoss(state: RunState, dt: number): void {
  const boss = state.boss;
  if (!boss) return;
  const def = bossDef(state);
  resolveBossPhase(state);
  const age = state.time - boss.startedAt;
  const previousX = boss.x;
  const previousS = boss.s;
  if (boss.phase !== 'destroyed') {
    // Authored maneuvering on the static arena: a bounded lateral sway and a forward/back surge. The full
    // wide map stays traversable; there is no camera cage. It holds still while its own lanes charge and fire.
    if (boss.phase !== 'arrival' && state.time < (boss.holdUntil ?? 0)) boss.heldFor = (boss.heldFor ?? 0) + dt;
    const pose = bossPose(boss, state.time);
    boss.x = pose.x;
    boss.s = pose.s;
  } else {
    // The wreck is ground- or water-anchored: once the departure resumes the scroll, it falls behind by exactly the
    // distance flown (the scroll is a closed form of time, so this never drifts from the ground).
    boss.s -= state.distance - (boss.wreckDistance ?? state.distance);
    boss.wreckDistance = state.distance;
  }
  boss.vx = dt > 0 ? (boss.x - previousX) / dt : 0;
  boss.vs = dt > 0 ? (boss.s - previousS) / dt : 0;
  for (const enemy of state.enemies) if (enemy.bossPart) {
    enemy.age += dt;
    const offset = bossPartOffset(enemy.bossPart, boss.id);
    enemy.x = boss.x + offset.x;
    enemy.s = boss.s + offset.s;
  }
  if (boss.phase === 'destroyed') {
    if (state.time >= boss.deathEffectAt && state.time - boss.phaseStartedAt < 2.4) {
      const offset = Math.sin((state.time - boss.phaseStartedAt) * 9) * 2.5;
      if (state.effects.length < BALANCE.maxEffects) state.effects.push({ id: state.nextId++, kind: 'explosion', x: boss.x + offset, s: boss.s + Math.cos(offset) * 1.5, ttl: .7, duration: .7 });
      boss.deathEffectAt = state.time + .24;
    }
    // The campaign ends after the wreck hold and extraction; endless continues with the hyperdrive jump (src/sim/endless.ts).
    if (state.config.mode === 'campaign' && state.time - boss.phaseStartedAt + 1e-8 >= WRECK_HOLD + def.extractionDuration) {
      state.phase = 'complete'; state.projectiles = []; state.hazards = [];
    }
    return;
  }
  if (boss.phase === 'arrival') {
    if (age + 1e-8 >= def.arrivalDuration) transition(state, 'batteries');
    return;
  }
  updateLaunches(state);
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
      boss.nextAttackAt = state.time + bossRecovery(state);
    }
    return;
  }
  if (state.time < boss.nextAttackAt || state.time < state.player.invulnerableUntil - .3) return;
  const candidates = state.enemies.filter(enemy => enemy.bossPart && enemy.hp > 0 && enemy.damageable && visible(state, enemy));
  if (candidates.length === 0) {
    if (state.time > state.messageUntil) message(state, `${def.name} · ${boss.x < state.player.x ? 'RETURN LEFT' : 'RETURN RIGHT'}`, 2);
    return;
  }
  // Laser bosses (the Ark) interleave an aimed bridge burst every third attack of their first phase, so the safe
  // middle between the radiator lanes is not safe for long (user, 17 October: "a bit easy" with the Scatter).
  const bridge = state.enemies.find(enemy => enemy.bossPart === 'core' && enemy.hp > 0);
  const bridgeBurst = boss.phase === 'batteries' && def.pairAttack === 'laser' && boss.attackIndex % 3 === 2 && !!bridge && visible(state, bridge);
  const selected = bridgeBurst ? bridge! : candidates[boss.attackIndex % candidates.length];
  const move = boss.phase === 'overload' ? overloadMove(state) : null;
  const attack = boss.phase === 'batteries'
    ? (def.pairAttack === 'laser' && !bridgeBurst ? 'beam' : 'burst')
    : boss.phase === 'core'
      ? (def.coreAttack === 'fan-burst' ? (boss.attackIndex % 2 ? 'burst' : 'fan') : 'burst')
      : move === 'burst' ? 'burst' : move === 'fan' ? (def.fan ? 'fan' : 'burst') : 'beam';
  const aimX = attack === 'beam' ? boss.x : state.player.x;
  const difficultyWarning = runScale(state).warning;
  const lockedLaser = boss.phase === 'batteries' && def.laser;
  const warning = (attack !== 'beam' ? def.warning : lockedLaser ? def.laser?.warning ?? def.beamWarning : def.beamWarning) + difficultyWarning;
  // The director's exclusion check applies to bosses too. A rejected attack is not edited: the boss switches
  // to its alternate pattern and tries again after a short delay.
  boss.attack = attack;
  const lanes = attack === 'beam' ? attackLanes(state, def, selected) : [];
  const footprints: Footprint[] = attack === 'beam'
    ? lanes.map(lane => {
      const t0 = state.time + warning + BOSS_BEAM.warning;
      return { x0: lane.x - lane.width / 2, x1: lane.x + lane.width / 2, t0, t1: t0 + lane.active };
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
  // Lanes are marked through the whole windup; they never move with the player or the swaying hull afterwards.
  for (const lane of lanes) {
    state.hazards.push({ id: state.nextId++, x: lane.x, width: lane.width, warning: selected.warning + BOSS_BEAM.warning,
      active: lane.active, ttl: selected.warning + BOSS_BEAM.warning + lane.active });
    // Hold still until the lane is spent, so it stays under the column that fired it.
    boss.holdUntil = Math.max(boss.holdUntil ?? 0, state.time + selected.warning + BOSS_BEAM.warning + lane.active);
  }
  boss.attackIndex++;
}
export const updateBastion = updateBoss;
