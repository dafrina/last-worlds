import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/balance';
import { EMPTY_INPUT, STEP, type Enemy, type EnemyKind, type RunState } from '../../src/shared/contracts';
import { ECHO_SPLIT, RELIC_ARMOR, echoSplit, relicExposed } from '../../src/sim/attacks';
import { shotFootprint } from '../../src/sim/fairness';
import { createRun, stepRun } from '../../src/sim/game';

// docs/39: Nahara's two new enemies, the Skimmer (Echo Split) and the Relic Shield (armoured core).
const quiet = (): RunState => {
  const state = createRun({ mode: 'campaign', mission: 'silent-empire', difficulty: 'standard', seed: 3 });
  state.nextEncounterAt = Infinity; state.nextVolleyAt = Infinity; state.player.lives = 10_000;
  return state;
};
const place = (state: RunState, kind: EnemyKind, x: number, s: number, extra: Partial<Enemy> = {}): Enemy => {
  const hp = ENEMIES[kind].hp;
  const enemy: Enemy = { id: state.nextId++, kind, x, s, originX: x, hp, maxHp: hp, radius: ENEMIES[kind].radius, age: 0,
    nextAttack: Infinity, warning: 0, aimX: x, groundHeight: 3, ...extra };
  state.enemies.push(enemy); return enemy;
};
const step = (state: RunState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
};
const hostile = (state: RunState) => state.projectiles.filter(shot => !shot.friendly && shot.ttl > 0);

describe('Skimmer: Echo Split', () => {
  it('one large shot flies to the split point, where two halves wait, show, then fan out faster', () => {
    const [parent, left, right] = echoSplit(1, 12, -2, 6);
    expect(parent.life).toBeGreaterThan(0);
    expect(parent.radius).toBe(ECHO_SPLIT.radius);
    const sx = parent.x + parent.vx * parent.life!, ss = parent.s + parent.vs * parent.life!;
    for (const half of [left, right]) {
      expect(half.x).toBeCloseTo(sx, 9); expect(half.s).toBeCloseTo(ss, 9);
      expect(half.delay).toBeCloseTo(parent.life! + ECHO_SPLIT.pause, 9);
      expect(half.show).toBe(ECHO_SPLIT.pause);
      expect(Math.hypot(half.vx, half.vs)).toBeCloseTo(6 * ECHO_SPLIT.speed, 9);
    }
    // Symmetric about the parent's heading.
    const turn = (v: { vx: number; vs: number }) => {
      const d = Math.atan2(v.vx, v.vs) - Math.atan2(parent.vx, parent.vs);
      return Math.atan2(Math.sin(d), Math.cos(d));
    };
    expect(turn(left)).toBeCloseTo(-ECHO_SPLIT.spread, 9);
    expect(turn(right)).toBeCloseTo(ECHO_SPLIT.spread, 9);
  });

  it('splits no nearer the ship than its floor row, and its large shot never reaches the row', () => {
    for (const s of [7, 9, 12, 16]) {
      const [parent, half] = echoSplit(0, s, 0, 7);
      expect(half.s, `s ${s}`).toBeGreaterThanOrEqual(Math.min(ECHO_SPLIT.floor, parent.s) - 1e-9);
      expect(shotFootprint(0, parent)).toBeNull();
      expect(shotFootprint(0, half)).not.toBeNull();
    }
  });

  it('in the simulation: the halves stay harmless and still through the pause, then fly where the forecast says', () => {
    const state = quiet();
    state.player.x = 6; // far off its line: nothing is hit
    place(state, 'skimmer', 0, 12, { warning: STEP / 2, aimX: 0 });
    stepRun(state, EMPTY_INPUT);
    const shots = hostile(state);
    expect(shots).toHaveLength(3);
    const [parent, ...halves] = shots;
    const specs = echoSplit(0, 12, 0, Math.hypot(parent.vx, parent.vs));
    const lives = state.player.lives;
    step(state, specs[0].life! + ECHO_SPLIT.pause / 2);
    expect(state.projectiles.includes(parent) && parent.ttl > 0).toBe(false);
    for (const half of halves) { expect(half.delay).toBeGreaterThan(0); expect(half.x).toBeCloseTo(specs[1].x, 6); }
    // Released: follow each half to the player row and compare with its footprint.
    const start = state.time - (specs[0].life! + ECHO_SPLIT.pause / 2) - STEP;
    const prints = specs.slice(1).map(spec => shotFootprint(start, spec)!);
    const crossed = halves.map(() => NaN);
    for (let i = 0; i < 300 && crossed.some(Number.isNaN); i++) {
      const before = halves.map(h => h.s);
      step(state, STEP);
      halves.forEach((h, k) => { if (Number.isNaN(crossed[k]) && before[k] > 0 && h.s <= 0) crossed[k] = h.x; });
    }
    crossed.forEach((x, k) => {
      expect(x).toBeGreaterThanOrEqual(prints[k].x0 - 0.2);
      expect(x).toBeLessThanOrEqual(prints[k].x1 + 0.2);
    });
    expect(state.player.lives).toBe(lives);
  });

  it('a split already fired outlives its Skimmer (the halves are the shot, not a burst at its muzzle)', () => {
    const state = quiet();
    state.player.x = 6;
    const skimmer = place(state, 'skimmer', 0, 12, { warning: STEP / 2 });
    stepRun(state, EMPTY_INPUT);
    skimmer.hp = 1;
    state.projectiles.push({ id: state.nextId++, x: skimmer.x, s: skimmer.s - .4, previousX: skimmer.x, previousS: skimmer.s - .4, vx: 0, vs: 30, friendly: true, damage: 10, radius: .1, ttl: 1 });
    step(state, STEP * 2);
    expect(state.enemies.some(e => e.id === skimmer.id && e.hp > 0)).toBe(false);
    expect(hostile(state).filter(shot => (shot.delay ?? 0) > 0)).toHaveLength(2);
  });
});

describe('Relic Shield: armoured core', () => {
  const hit = (state: RunState, relic: Enemy, damage = 10) => {
    const before = relic.hp;
    state.projectiles.push({ id: state.nextId++, x: relic.x, s: relic.s - .8, previousX: relic.x, previousS: relic.s - .8, vx: 0, vs: 30, friendly: true, damage, radius: .1, ttl: 1, weapon: 'pulse' });
    stepRun(state, EMPTY_INPUT);
    return before - relic.hp;
  };

  it('closed, lets a quarter through, its windup included; open for 1.2 s after firing; broken below 30% for good', () => {
    const state = quiet();
    state.player.x = 6;
    const relic = place(state, 'relic', 0, 9);
    expect(hit(state, relic)).toBeCloseTo(10 * RELIC_ARMOR.closedShare, 6);
    // Its windup (the warning) keeps it closed.
    relic.warning = 0.5;
    expect(hit(state, relic)).toBeCloseTo(10 * RELIC_ARMOR.closedShare, 6);
    // Let it fire, then it stays open its window and closes again.
    relic.warning = STEP / 2; relic.nextAttack = Infinity;
    stepRun(state, EMPTY_INPUT);
    relic.nextAttack = Infinity;
    expect(relic.openUntil).toBeCloseTo(state.time + RELIC_ARMOR.open, 6);
    step(state, RELIC_ARMOR.open - 0.2);
    expect(hit(state, relic)).toBeCloseTo(10, 6);
    step(state, 0.3);
    expect(hit(state, relic)).toBeCloseTo(10 * RELIC_ARMOR.closedShare, 6);
    relic.hp = relic.maxHp * RELIC_ARMOR.breakBelow - 1;
    expect(relicExposed(relic, state.time)).toBe(true);
    expect(hit(state, relic, 5)).toBeCloseTo(5, 6);
  });

  it('every weapon kills it in the end, armour or not: no source is immune', () => {
    for (const weapon of ['pulse', 'fan', 'seeker', 'rail'] as const) {
      const state = createRun({ mode: 'campaign', mission: 'silent-empire', difficulty: 'standard', seed: 3, weapon });
      state.nextEncounterAt = Infinity; state.player.lives = 10_000;
      const relic = place(state, 'relic', 0, 8, { nextAttack: Infinity });
      // Held in its envelope (no formation of its own), never attacking: the armour stays closed until it breaks.
      for (let i = 0; i < 60 * 90 && relic.hp > 0; i++) { relic.x = 0; relic.s = 8; relic.nextAttack = Infinity; stepRun(state, EMPTY_INPUT); }
      expect(relic.hp, weapon).toBeLessThanOrEqual(0);
    }
  });

  it('closes again before its next windup, even at Nahara\'s quick cadence', () => {
    const state = quiet();
    state.player.x = 6;
    const relic = place(state, 'relic', 0, 9, { warning: STEP / 2 });
    let closedBetween = Infinity, firedAt = -1, fires = 0;
    for (let i = 0; i < 60 * 12; i++) {
      relic.x = 0; relic.s = 9; relic.hp = relic.maxHp;
      const before = relic.openUntil;
      stepRun(state, EMPTY_INPUT);
      if (relic.openUntil !== before) {
        if (firedAt >= 0) closedBetween = Math.min(closedBetween, state.time - firedAt - RELIC_ARMOR.open);
        firedAt = state.time; fires++;
      }
    }
    expect(fires).toBeGreaterThan(2);
    expect(closedBetween).toBeGreaterThanOrEqual(RELIC_ARMOR.rest);
  });

  it('only the Relic Shield is armoured', () => {
    const state = quiet();
    state.player.x = 6;
    const skimmer = place(state, 'skimmer', 0, 9);
    expect(hit(state, skimmer)).toBeCloseTo(10, 6);
  });
});
