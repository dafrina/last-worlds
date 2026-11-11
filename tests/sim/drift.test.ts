import { describe, expect, it } from 'vitest';
import { BASTION } from '../../src/content/bastion';
import { DRIFT } from '../../src/content/balance';
import { BOSSES } from '../../src/content/bosses';
import { EMPTY_INPUT, STEP, VIEW, type Enemy, type RunConfig, type RunState } from '../../src/shared/contracts';
import { ANCHOR_LIMIT } from '../../src/sim/airspace';
import { bossTarget, resolveBossPhase } from '../../src/sim/boss';
import { engagedCount } from '../../src/sim/drift';
import { createRun, spawnFormation, stepRun } from '../../src/sim/game';
import { canAttack } from '../../src/sim/view';
import { FairnessTrace } from './fairness-trace';
import { activeWaveMember, bossScenario, emptyStats, fleeObserver, measure, sum } from './flee-harness';
import { enterSector, fleeingPilot, fly } from './pilots';
import { summary } from './fairness-setup';

/*
 * The pull toward the view (src/sim/drift.ts, boss.ts pullBoss; docs/10 §4–5; user, 11 November: "there should be
 * possibilities to retreat but there should always be 1-2 enemies on screen").
 */

const CAMERA_LIMIT = (VIEW.worldWidth - VIEW.width) / 2;

/** A quiet run: no cues, no hunters, the ship and camera at `x` (camera clamped as the follow would leave it). */
function quiet(x: number, config: RunConfig = { mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 }): RunState {
  const state = createRun(config);
  state.encounterIndex = Number.MAX_SAFE_INTEGER; state.nextEncounterAt = Infinity;
  state.hunters = { sector: state.sector, spawned: 99, window: 99 };
  state.player.lives = 99;
  place(state, x);
  return state;
}
function place(state: RunState, x: number) {
  state.player.x = x; state.player.vx = 0;
  state.cameraX = Math.max(-CAMERA_LIMIT, Math.min(CAMERA_LIMIT, x - Math.sign(x) * 2.5));
}
/** Holds the ship where it is (no steering) for `seconds`; `onTick` sees every step. */
function hold(state: RunState, seconds: number, onTick: (state: RunState) => void = () => {}) {
  for (let i = 0; i < Math.round(seconds / STEP) && state.phase === 'playing'; i++) { stepRun(state, EMPTY_INPUT); onTick(state); }
}
const squad = (state: RunState, group: number) => state.enemies.filter(enemy => enemy.formation?.group === group && enemy.hp > 0);
const offset = (members: readonly Enemy[]) => members[0]?.formation?.drift?.x ?? 0;

/** A five-dart arrowhead spawned over the left screen; the ship is then on the far right (the user's escape). */
function fled() {
  const state = quiet(-10);
  const group = state.nextId;
  spawnFormation(state, { formation: 'arrow-5', x: 0 });
  expect(squad(state, group)[0].formation!.anchorX).toBe(-ANCHOR_LIMIT);
  place(state, 10);
  return { state, group };
}

describe('squadron pull (src/sim/drift.ts)', () => {
  it('pulls a squadron left behind toward the view until two of its craft can attack, and leaves the rest of it out', () => {
    const { state, group } = fled();
    let engagedAt = Infinity;
    hold(state, 4, s => { if (engagedCount(s) >= DRIFT.engaged && !Number.isFinite(engagedAt)) engagedAt = s.time; });
    const members = squad(state, group);
    expect(offset(members)).toBeGreaterThan(1);
    expect(engagedAt).toBeLessThan(3);
    // It stopped there: two (or, braking, three) in view, the bulk of the five still beside the view.
    expect(members[0].formation!.drift!.vx).toBe(0);
    const inView = members.filter(enemy => canAttack(state, enemy)).length;
    expect(inView).toBeGreaterThanOrEqual(DRIFT.engaged);
    expect(inView).toBeLessThan(members.length);
    // The formation keeps its shape: every member carries the same offset.
    expect(new Set(members.map(enemy => enemy.formation!.drift!.x)).size).toBe(1);
  });

  it('stays put while a craft in view can attack, and pulls again when they are shot down', () => {
    const { state, group } = fled();
    let held = 0, engaged = engagedCount(state), before = offset(squad(state, group)), sliding = false;
    hold(state, 4, s => {
      const now = offset(squad(s, group));
      // A squadron at rest stays at rest while a craft in view could attack at the start of the step: a pull starts only
      // when none can (DRIFT.floor) and, once under way, fills the view to DRIFT.engaged.
      if (engaged >= DRIFT.floor && !sliding) { held++; expect(now).toBe(before); }
      engaged = engagedCount(s); before = now; sliding = !!squad(s, group)[0]?.formation?.drift?.vx;
    });
    expect(held).toBeGreaterThan(60);
    // Down the craft in view: the rest of the squadron slides in.
    const settled = offset(squad(state, group));
    for (const enemy of squad(state, group)) if (canAttack(state, enemy)) enemy.hp = 0;
    hold(state, 1.5);
    expect(offset(squad(state, group))).toBeGreaterThan(settled);
  });

  it('never pulls while two craft in view can attack (the ship flying with its wave)', () => {
    const state = quiet(0);
    const group = state.nextId;
    spawnFormation(state, { formation: 'arrow-5', x: 0 });
    hold(state, 8, s => expect(offset(squad(s, group))).toBe(0));
    expect(state.enemies.some(enemy => enemy.warning > 0) || squad(state, group).length > 0).toBe(true);
  });

  it('never moves a squadron while one of its members winds up', () => {
    const { state, group } = fled();
    let frozen = 0, winding = false;
    let previous = offset(squad(state, group));
    hold(state, 9, s => {
      const members = squad(s, group), now = offset(members);
      // A windup admitted this step was forecast after this step's slide; from the next step on the squadron holds still.
      if (winding && members.some(enemy => enemy.warning > 0)) { frozen++; expect(now).toBe(previous); expect(members[0].formation!.drift?.vx ?? 0).toBe(0); }
      winding = members.some(enemy => enemy.warning > 0);
      previous = now;
    });
    expect(frozen).toBeGreaterThan(30);
  });

  it('never moves ground batteries or world-anchored placements', () => {
    const state = quiet(-10);
    const battery = state.nextId;
    spawnFormation(state, { formation: 'battery-3', x: 0 });
    const pinned = state.nextId;
    spawnFormation(state, { formation: 'arrow-3', anchor: 'world', x: -8 });
    expect(squad(state, pinned)[0].formation!.pinned).toBe(true);
    place(state, 10);
    hold(state, 6, s => {
      expect(squad(s, battery).every(enemy => !enemy.formation!.drift)).toBe(true);
      expect(squad(s, pinned).every(enemy => !enemy.formation!.drift)).toBe(true);
    });
    expect(squad(state, pinned).length).toBeGreaterThan(0);
  });

  it('waits until a squadron is level with the view, and never takes its anchor past the bound it has at spawn', () => {
    const state = quiet(10);
    const view = state.nextId;
    // Spawned over the far left (anchor clamped to −ANCHOR_LIMIT) while the ship is on the right: still diving in above the view.
    spawnFormation(state, { formation: 'arrow-3', x: -14 });
    stepRun(state, EMPTY_INPUT);
    expect(squad(state, view)[0].s).toBeGreaterThan(VIEW.maxS - 1);
    expect(offset(squad(state, view))).toBe(0);
    let most = -Infinity;
    hold(state, 6, s => { const m = squad(s, view); if (m.length) most = Math.max(most, m[0].formation!.anchorX + offset(m)); });
    expect(most).toBeGreaterThan(-ANCHOR_LIMIT + 1);
    expect(most).toBeLessThanOrEqual(ANCHOR_LIMIT + 1e-9);
  });

  it('never clamps the ship: a pulled wave still lets it fly to the world edge and back', () => {
    const { state } = fled();
    const edge = VIEW.worldWidth / 2 - VIEW.playerRadius;
    for (let i = 0; i < 120; i++) stepRun(state, { ...EMPTY_INPUT, horizontal: 1 });
    expect(state.player.x).toBeCloseTo(edge, 6);
    for (let i = 0; i < 180; i++) stepRun(state, { ...EMPTY_INPUT, horizontal: -1 });
    expect(state.player.x).toBeLessThan(0);
  });

  it('keeps the fleeing pilot engaged without taking the whole wave to it, and keeps every fairness rule', () => {
    // The user's escape over a mission's approach and an endless stretch: as each wave spawns, cross to the other screen.
    const runs = [
      measureTraced({ mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 2 }, 110),
      measureTraced({ mode: 'campaign', mission: 'cold-vector', difficulty: 'veteran', seed: 5 }, 150),
      measureTraced({ mode: 'endless', seed: 7 }, 85, 3),
    ];
    const total = sum(runs);
    // Before the pull (11 November) this pilot had no craft in view able to attack for 62% of the time a wave was in its
    // firing window and kept 95% of the waves' members away. Now there is almost always one, and it still keeps the bulk
    // of a wave away much of the time.
    expect(total.emptyTicks / total.waveTicks).toBeLessThan(0.2);
    expect(total.bulkAwayTicks / total.waveTicks).toBeGreaterThan(0.35);
    expect(total.visibleShare / total.waveTicks).toBeLessThan(0.65);
  });
});

/** One fleeing flight with the independent fairness trace: no violation of any rule (airspace, gaps, seals, warnings). */
function measureTraced(config: RunConfig, seconds: number, sector = 1) {
  const state = enterSector(createRun(config), sector);
  state.player.lives = 99;
  const stats = emptyStats(), observe = fleeObserver(stats), trace = new FairnessTrace();
  fly(state, fleeingPilot(), seconds, { noPickups: true, onTick: s => { observe(s); trace.observe(s); } });
  trace.finish(state);
  expect(trace.violations, `${config.mission ?? 'endless'}\n${summary(trace)}`).toEqual([]);
  expect(stats.waveTicks).toBeGreaterThan(600);
  return stats;
}

describe('boss pull (src/sim/boss.ts pullBoss)', () => {
  it('lumbers toward a ship parked at the far edge until a live target is in view, then attacks', () => {
    // Bastion-9 with its core open and the ship parked at the right world edge: the core (x 0, sway 1.1) never entered
    // that view before; no attack ever started.
    const stats = bossScenario('bastion', 'core', 3, 30);
    expect(stats.bossWindups).toBeGreaterThan(5);
    // Out of view for its patience (2 s) and the slide over, then only briefly.
    expect(stats.bossHiddenTicks / stats.bossTicks).toBeLessThan(0.3);
    expect(stats.bossOffset).toBeGreaterThan(1);
    expect(stats.bossOffset).toBeLessThanOrEqual(CAMERA_LIMIT);
  });

  it('reaches a far module too, within the camera range', () => {
    const stats = bossScenario('cold-vector', 'far', 3, 30);
    expect(stats.bossWindups).toBeGreaterThan(3);
    expect(stats.bossOffset).toBeLessThanOrEqual(CAMERA_LIMIT + 1e-9);
  });

  it('never moves while it winds up an attack or holds for its lanes, and stays put while a target is in view', () => {
    const state = quiet(10, { mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 });
    state.time = BASTION.arrivesAt - STEP;
    hold(state, BOSSES.bastion.arrivalDuration + 0.2);
    bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0;
    resolveBossPhase(state);
    let windups = 0, previous = state.boss!.originX, attacking = false, holding = false, resting = false;
    hold(state, 30, s => {
      const boss = s.boss!;
      // An attack admitted this step was forecast after this step's move; from the next step on the post holds still.
      if ((attacking && boss.attack) || holding) { windups++; expect(boss.originX).toBe(previous); }
      // At rest with a target in view at the start of the step: it stays at rest.
      if (resting) expect(boss.originX).toBe(previous);
      attacking = !!boss.attack; holding = s.time < (boss.holdUntil ?? 0) - 1e-9;
      resting = (boss.driftVx ?? 0) === 0 && s.enemies.some(enemy => enemy.bossPart && enemy.hp > 0 && enemy.damageable && canAttack(s, enemy));
      previous = boss.originX;
    });
    expect(windups).toBeGreaterThan(30);
    expect(state.boss!.originX).toBeGreaterThan(1);
  });

  it('waits a moment before it moves, and eases back home once the ship returns to the middle', () => {
    const state = quiet(10, { mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 });
    state.time = BASTION.arrivesAt - STEP;
    hold(state, BOSSES.bastion.arrivalDuration + 0.2);
    bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0;
    resolveBossPhase(state);
    // The core out of view: nothing moves for DRIFT.boss.patience seconds.
    hold(state, DRIFT.boss.patience - 0.1);
    expect(state.boss!.originX).toBe(0);
    hold(state, 10);
    expect(state.boss!.originX).toBeGreaterThan(1);
    // Back in the middle the core is in view at home: the post returns there and stops.
    place(state, 0);
    hold(state, 12);
    expect(state.boss!.originX).toBe(0);
  });

  it('does not move for a ship that stays with it', () => {
    const state = quiet(0, { mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 });
    state.time = BASTION.arrivesAt - STEP;
    hold(state, BOSSES.bastion.arrivalDuration + 20);
    expect(state.boss!.originX).toBe(0);
  });
});

describe('fleeing pilot measurement', () => {
  it('counts active wave members only inside their firing window', () => {
    const state = quiet(0);
    spawnFormation(state, { formation: 'arrow-3', x: 0 });
    expect(state.enemies.filter(activeWaveMember)).toHaveLength(0);
    hold(state, 1.5);
    expect(state.enemies.filter(activeWaveMember).length).toBeGreaterThan(0);
  });

  it('flies the same with and without the observer (deterministic)', () => {
    const a = measure({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 4 }, 40);
    const b = measure({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 4 }, 40);
    expect(a).toEqual(b);
  });
});
