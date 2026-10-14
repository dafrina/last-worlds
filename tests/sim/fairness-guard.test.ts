import { describe, expect, it } from 'vitest';
import { FAIRNESS } from '../../src/content/balance';
import { TRAINING } from '../../src/content/encounters';
import { EMPTY_INPUT, STEP, type Enemy, type RunState } from '../../src/shared/contracts';
import { admitAttack, assessSafety, isSafe, pendingAttackFootprints, type Footprint } from '../../src/sim/fairness';
import { createRun, stepRun } from '../../src/sim/game';
import { FairnessTrace } from './fairness-trace';

function quietRun(): RunState {
  const state = createRun({ mode: 'campaign', seed: 4 });
  state.encounterIndex = TRAINING.length;
  state.nextEncounterAt = Infinity;
  state.nextVolleyAt = Infinity;
  return state;
}

function dart(state: RunState, x: number, s: number): Enemy {
  const enemy: Enemy = { id: state.nextId++, kind: 'dart', x, s, originX: x, hp: 500, maxHp: 500, radius: 0.45, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: 3 };
  state.enemies.push(enemy);
  return enemy;
}

/** A vertical hostile shot that crosses the player row at absolute time `at`. */
function shotCrossingAt(state: RunState, x: number, at: number, speed = 7) {
  const s = (at - state.time) * speed;
  state.projectiles.push({ id: state.nextId++, x, s, previousX: x, previousS: s, vx: 0, vs: -speed, friendly: false, damage: 1, radius: 0.13, ttl: 7 });
}

describe('director exclusion windows', () => {
  it('admits an ordinary aimed windup into an empty sky', () => {
    const state = quietRun();
    const enemy = dart(state, 2, 12);
    expect(admitAttack(state, enemy, state.player.x, 0.85)).toBe(true);
  });

  it('delays a windup that would seal both view edges and the center together', () => {
    const state = quietRun();
    const enemy = dart(state, 0, 12);
    const [own] = pendingAttackFootprints(state, enemy, 0, 0.85);
    const crossing = (own.t0 + own.t1) / 2;
    shotCrossingAt(state, -5.6, crossing);
    shotCrossingAt(state, 5.6, crossing);
    expect(admitAttack(state, enemy, 0, 0.85)).toBe(false);
    // The same aim away from the center leaves the center strip open and is admitted.
    expect(admitAttack(state, enemy, 2.5, 0.85)).toBe(true);
  });

  it('delays a windup that would close the last 1.4-unit gap', () => {
    const state = quietRun();
    const enemy = dart(state, 0, 12);
    const [own] = pendingAttackFootprints(state, enemy, 0, 0.85);
    const crossing = (own.t0 + own.t1) / 2;
    // Shots every 1.2 units across the view except a 2.4-unit opening around the player.
    for (let x = -5.9; x <= 5.9 + 1e-9; x += 1.18) if (Math.abs(x) > 1.1) shotCrossingAt(state, x, crossing);
    expect(assessSafety(state, pendingAttackFootprints(state, enemy, 3, 0)).minGap).toBeGreaterThan(0);
    expect(admitAttack(state, enemy, 0, 0.85)).toBe(false);
  });

  it('models reaction delay and kinematics: a far gap that closes too soon is unreachable', () => {
    const state = quietRun();
    state.player.x = -4;
    state.cameraX = 0;
    const near = state.time + FAIRNESS.reaction + FAIRNESS.maneuverDelay + 0.3;
    // Everything except [4, 6] is blocked shortly after the reaction delay.
    const wall: Footprint[] = [{ x0: -10, x1: 4, t0: near, t1: near + 0.5 }];
    expect(assessSafety(state, wall).reachable).toBe(false);
    // The same wall a second later leaves enough time to cross the view.
    const later: Footprint[] = [{ x0: -10, x1: 4, t0: near + 1.2, t1: near + 1.7 }];
    expect(assessSafety(state, later).reachable).toBe(true);
    expect(isSafe(assessSafety(state, later))).toBe(true);
  });

  it('does not stall forever once a hit is already unavoidable, but still enforces gap and seal rules', () => {
    const state = quietRun();
    // A shot about to strike the stationary player: no reaction can avoid it.
    shotCrossingAt(state, 0, state.time + 0.2);
    const enemy = dart(state, 3, 12);
    expect(admitAttack(state, enemy, 3, 0.85)).toBe(true);
  });

  it('keeps an attack waiting in the simulation instead of trimming its pattern', () => {
    const state = quietRun();
    const enemy = dart(state, 0, 14);
    enemy.nextAttack = 0;
    const [own] = pendingAttackFootprints(state, enemy, 0, 0.85);
    const crossing = (own.t0 + own.t1) / 2;
    shotCrossingAt(state, -5.6, crossing + 1 / 60);
    shotCrossingAt(state, 5.6, crossing + 1 / 60);
    stepRun(state, EMPTY_INPUT);
    expect(enemy.warning).toBe(0);
    expect(enemy.nextAttack).toBeCloseTo(enemy.age + FAIRNESS.retryDelay, 6);
  });
});

describe('fairness validator self-checks', () => {
  it('flags a sealing wall of unwarned shots', () => {
    const state = quietRun();
    const trace = new FairnessTrace();
    for (let x = -6; x <= 6; x += 0.5) shotCrossingAt(state, x, state.time + 1);
    for (let i = 0; i < 120; i += 1) { stepRun(state, EMPTY_INPUT); trace.observe(state); }
    trace.finish(state);
    const rules = new Set(trace.violations.map(v => v.rule));
    expect(rules.has('unwarned')).toBe(true);
    expect(rules.has('gap')).toBe(true);
  });

  it('flags hazards that seal both edges and the center even when gaps remain between them', () => {
    const state = quietRun();
    state.player.x = 2; // inside the camera dead zone and clear of every shot
    const trace = new FairnessTrace();
    for (const x of [-5.7, 0, 5.7]) shotCrossingAt(state, x, state.time + 1);
    for (let i = 0; i < 120; i += 1) { stepRun(state, EMPTY_INPUT); trace.observe(state); }
    trace.finish(state);
    expect(trace.violations.some(v => v.rule === 'seal')).toBe(true);
    expect(trace.violations.some(v => v.rule === 'gap')).toBe(false);
  });

  it('flags a release that came sooner than the warning floor', () => {
    const state = quietRun();
    const enemy = dart(state, 1.5, 12);
    enemy.nextAttack = 0;
    const trace = new FairnessTrace();
    stepRun(state, EMPTY_INPUT); trace.observe(state);
    expect(enemy.warning).toBeGreaterThan(0.65);
    enemy.warning = 0.3; // a deliberately broken windup
    for (let i = 0; i < 60; i += 1) { stepRun(state, EMPTY_INPUT); trace.observe(state); }
    expect(trace.violations.some(v => v.rule === 'warning')).toBe(true);
  });

  it('flags a windup started by an enemy outside the view', () => {
    const state = quietRun();
    const enemy = dart(state, 9, 12);
    const trace = new FairnessTrace();
    stepRun(state, EMPTY_INPUT);
    enemy.warning = 0.85; // forced: the simulation itself never allows this
    trace.observe(state);
    expect(trace.violations.some(v => v.rule === 'offscreen')).toBe(true);
    // The simulation cancels it on the next tick instead of releasing an unseen attack.
    stepRun(state, EMPTY_INPUT);
    expect(enemy.warning).toBe(0);
    expect(state.projectiles.filter(shot => !shot.friendly)).toHaveLength(0);
    expect(STEP).toBeGreaterThan(0);
  });
});
