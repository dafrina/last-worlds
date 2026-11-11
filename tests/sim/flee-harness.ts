import { GROUND_KINDS } from '../../src/content/balance';
import { missionBoss, phaseOneParts } from '../../src/content/bosses';
import { FORMATIONS, type FormationId } from '../../src/content/formations';
import { EMPTY_INPUT, STEP, VIEW, type Enemy, type MissionId, type RunConfig, type RunState } from '../../src/shared/contracts';
import { bossTarget, resolveBossPhase } from '../../src/sim/boss';
import { playerKinematics, steerTo } from '../../src/sim/fairness';
import { createRun } from '../../src/sim/game';
import { pathTime } from '../../src/sim/motion';
import { enterSector, fleeingPilot, fly, perfectPilot, type Pilot } from './pilots';

/*
 * What a wave or a boss can still do to a pilot who runs from it (docs/10 §4, the squadron pull; user, 11 November). The
 * fleeing pilot (pilots.ts) crosses to the other screen as each squadron spawns; this observer counts, over the time an
 * air wave is in its firing window, how often no hostile craft in view could attack, the windups and shots aimed at the
 * ship, and how much of each wave the pilot still kept off its screen. Boss fights are measured separately: the share of
 * the fight in which none of the boss's live targets was in view, and its windups.
 */

/** In view and above the attack floor: where an enemy may start a windup (src/sim/game.ts canAttack). */
export function engageable(state: RunState, enemy: Enemy): boolean {
  return enemy.hp > 0 && enemy.s > 3.5 && Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius - 0.2
    && enemy.s >= VIEW.minS + enemy.radius + 0.2 && enemy.s <= VIEW.maxS - enemy.radius - 0.2;
}

/** A member of an air wave inside its firing window (not a hunter, a boss launch, a strike site's guard or a craft leaving). */
export function activeWaveMember(enemy: Enemy): boolean {
  if (enemy.hp <= 0 || !enemy.formation || enemy.hunter || enemy.leaving || enemy.bossPart || GROUND_KINDS.has(enemy.kind) || enemy.formation.pinned) return false;
  const template = FORMATIONS[enemy.formation.template as FormationId];
  if (template.entry === 'bay' || template.entry === 'ground') return false;
  const t = pathTime(enemy.formation, enemy.age);
  return t >= template.fireFrom && t <= template.fireUntil;
}

export interface FleeStats {
  /** Ticks with at least one air wave member in its firing window. */
  waveTicks: number;
  /** Of those, ticks in which no air craft in view (wave member, ace or Wraith) could attack. */
  emptyTicks: number;
  /** Of those, ticks in which no member of an active wave could attack (aces ignored). */
  waveEmptyTicks: number;
  /** Of those, ticks in which most live members of the active waves were out of view (the pilot kept the bulk away). */
  bulkAwayTicks: number;
  /** Sum over active-wave ticks of the share of active wave members in view (mean = visibleShare / waveTicks). */
  visibleShare: number;
  /** Windups started by air wave members, and by aces. */
  windups: number; aceWindups: number;
  /** Hostile shots released and beams marked. */
  shots: number; beams: number;
  hits: number;
  /** Boss fight (batteries, core, overload): ticks, ticks with no live target in view, windups started. */
  bossTicks: number; bossHiddenTicks: number; bossWindups: number;
  /** How far the boss's post moved off its arrival point at most. */
  bossOffset: number;
}

export const emptyStats = (): FleeStats => ({ waveTicks: 0, emptyTicks: 0, waveEmptyTicks: 0, bulkAwayTicks: 0, visibleShare: 0, windups: 0, aceWindups: 0,
  shots: 0, beams: 0, hits: 0, bossTicks: 0, bossHiddenTicks: 0, bossWindups: 0, bossOffset: 0 });

/** An observer for `fly`'s onTick that adds one tick's counts to `stats`. */
export function fleeObserver(stats: FleeStats): (state: RunState) => void {
  const warning = new Map<number, number>();
  const shots = new Set<number>(), beams = new Set<number>();
  let bossAttack: number | null = null;
  return state => {
    const wave = state.enemies.filter(activeWaveMember);
    if (wave.length) {
      stats.waveTicks++;
      const air = state.enemies.filter(enemy => enemy.hp > 0 && !enemy.bossPart && !enemy.leaving && !GROUND_KINDS.has(enemy.kind) && engageable(state, enemy));
      if (!air.length) stats.emptyTicks++;
      const seen = wave.filter(enemy => engageable(state, enemy)).length;
      if (!seen) stats.waveEmptyTicks++;
      if (seen * 2 < wave.length) stats.bulkAwayTicks++;
      stats.visibleShare += seen / wave.length;
    }
    for (const enemy of state.enemies) {
      const before = warning.get(enemy.id) ?? 0;
      if (enemy.warning > 0 && before === 0 && !enemy.bossPart && !GROUND_KINDS.has(enemy.kind)) {
        if (enemy.hunter) stats.aceWindups++; else stats.windups++;
      }
      warning.set(enemy.id, enemy.warning);
    }
    for (const shot of state.projectiles) if (!shot.friendly && !shots.has(shot.id)) { shots.add(shot.id); stats.shots++; }
    for (const hazard of state.hazards) if (!beams.has(hazard.id)) { beams.add(hazard.id); stats.beams++; }
    const boss = state.boss;
    if (boss && (boss.phase === 'batteries' || boss.phase === 'core' || boss.phase === 'overload')) {
      stats.bossTicks++;
      const targets = state.enemies.filter(enemy => enemy.bossPart && enemy.hp > 0 && enemy.damageable);
      // The boss's own view test (src/sim/boss.ts `visible`): a target it may attack from.
      const inView = (enemy: Enemy) => Math.abs(enemy.x - state.cameraX) <= VIEW.width / 2 - enemy.radius - 0.2 && enemy.s > 3.5 && enemy.s + enemy.radius < VIEW.maxS;
      if (!targets.some(inView)) stats.bossHiddenTicks++;
      if (boss.attackerId !== null && boss.attackerId !== bossAttack) stats.bossWindups++;
      bossAttack = boss.attackerId;
      stats.bossOffset = Math.max(stats.bossOffset, Math.abs(boss.originX));
    }
  };
}

/** One measured flight: `seconds` of a run (endless from `sector`) flown by `pilot`, lives unlimited, pickups removed. */
export function measure(config: RunConfig, seconds: number, pilot: Pilot = fleeingPilot(), sector = 1, stats = emptyStats()): FleeStats {
  const state = enterSector(createRun(config), sector);
  state.player.lives = 99;
  const log = fly(state, pilot, seconds, { noPickups: true, onTick: fleeObserver(stats) });
  stats.hits += log.hits;
  return stats;
}

/**
 * A boss fight parked out of reach (the user's earlier report: "evade bosses endlessly by moving out of frame so that his
 * shooting origin is out of frame"). The ship waits at the right world edge; once the fight opens, the scenario plays as if
 * the player had already broken some modules: `core` all the first-phase targets (the core is open), `far` those on the
 * ship's side (the far one is left). Then `seconds` of the fight are measured.
 */
export function bossScenario(mission: MissionId, scenario: 'core' | 'far', seed: number, seconds = 60, stats = emptyStats()): FleeStats {
  const def = missionBoss(mission)!;
  const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed });
  state.time = def.arrivesAt - STEP;
  state.encounterIndex = Number.MAX_SAFE_INTEGER; state.nextEncounterAt = Infinity;
  state.player.lives = 99;
  const edge = VIEW.worldWidth / 2 - 1;
  state.player.x = edge; state.cameraX = (VIEW.worldWidth - VIEW.width) / 2;
  const park: Pilot = s => ({ ...EMPTY_INPUT, horizontal: steerTo(s.player.x, s.player.vx, edge, playerKinematics(s).braking) });
  fly(state, park, def.arrivalDuration + 1, { noPickups: true, until: s => s.boss?.phase === 'batteries' });
  for (const part of phaseOneParts(def)) {
    const target = bossTarget(state, part)!;
    if (scenario === 'core' || target.x >= state.boss!.x - 1e-6) target.hp = 0;
  }
  resolveBossPhase(state);
  const log = fly(state, park, seconds, { noPickups: true, onTick: fleeObserver(stats) });
  stats.hits += log.hits;
  return stats;
}

export const sum = (runs: readonly FleeStats[]): FleeStats => runs.reduce((a, b) => {
  const out = emptyStats();
  for (const key of Object.keys(out) as (keyof FleeStats)[]) out[key] = key === 'bossOffset' ? Math.max(a[key], b[key]) : a[key] + b[key];
  return out;
}, emptyStats());

export { perfectPilot };
