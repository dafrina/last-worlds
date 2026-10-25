import { describe, expect, it } from 'vitest';
import { BALANCE, difficultyScales } from '../../src/content/balance';
import { WRAITH } from '../../src/content/wraith';
import { EMPTY_INPUT, STEP, VIEW, type Enemy, type RunState } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { HUNTERS, absorbHunterShield } from '../../src/sim/hunters';
import { spawnMembers } from '../../src/sim/spawn';
import { updateWraith } from '../../src/sim/wraith';
import { pendingAttackFootprints } from '../../src/sim/fairness';

function setup(hunter = false) {
  const state = createRun({ mode: 'campaign', mission: 'final-horizon', seed: 5 });
  state.nextEncounterAt = state.nextVolleyAt = Infinity;
  state.player.lives = 1000;
  spawnMembers(state, 'wraith-solo', 0, 1);
  const enemy = state.enemies[0];
  enemy.s = 12;
  if (hunter) enemy.hunter = { shield: 120, perCharge: 40, key: 5, vx: 0, vs: 0, tx: 0, ts: 13, retarget: 100, waypoint: 0 };
  return { state, enemy };
}
const scale = difficultyScales('campaign', 'standard', 1);
function tick(state: RunState, enemy: Enemy) {
  state.time += STEP;
  updateWraith(state, enemy, STEP, scale, enemy.warning > 0 ? 1 : 0);
}

describe('Umbra Wraith', () => {
  it('warns before teleporting to alternating sides, fires complete rapid triplets and leaves after two attacks', () => {
    const { state, enemy } = setup();
    const attacks: { at: number; x: number }[] = [], arrivals: number[] = [], cues: number[] = [];
    for (let i = 0; i < 15 / STEP; i++) {
      const before = enemy.blink?.attacks ?? 0, started = enemy.blink?.startedAt, warning = enemy.warning;
      tick(state, enemy);
      if (!warning && enemy.warning > 0) cues.push(state.time);
      if (Number.isFinite(enemy.blink!.startedAt) && started !== enemy.blink!.startedAt) arrivals.push(state.time);
      if (enemy.blink!.attacks > before) {
        attacks.push({ at: state.time, x: enemy.x });
        expect(state.time - cues.at(-1)!).toBeGreaterThanOrEqual(.65);
        expect(state.time - arrivals.at(-1)!).toBeLessThanOrEqual(.35 + STEP);
        expect(state.projectiles).toHaveLength(3);
        expect(state.projectiles.map(p => p.delay)).toEqual([0, .06, .12]);
        expect(new Set(state.projectiles.map(p => p.vx)).size).toBe(1);
        state.projectiles = [];
      }
    }
    expect(attacks).toHaveLength(2);
    expect(attacks[0].x * attacks[1].x).toBeLessThan(0);
    expect(cues[1] - (attacks[0].at + .12)).toBeGreaterThanOrEqual(5 - STEP);
    expect(enemy.s).toBeGreaterThan(VIEW.maxS);
    expect(enemy.damageable).toBe(true);
  });

  it('keeps a hunter attacking and uses the current camera slice at both map edges', () => {
    const { state, enemy } = setup(true);
    enemy.x = -6;
    let attacks = 0;
    for (let i = 0; i < 30 / STEP; i++) {
      state.cameraX = i < 900 ? -6 : 6;
      state.player.x = state.cameraX;
      tick(state, enemy);
      if (state.projectiles.length) { attacks++; state.projectiles = []; }
      if (enemy.warning > 0) {
        expect(Math.abs(enemy.x - state.cameraX)).toBeLessThan(6 - enemy.radius);
        expect(enemy.s).toBeGreaterThan(9);
      }
    }
    expect(attacks).toBeGreaterThanOrEqual(4);
    expect(enemy.blink!.exitAt).toBeUndefined();
  });

  it('commits its aim, is intangible only during transit, and predicts each delayed round', () => {
    const { state, enemy } = setup();
    state.player.vx = 3;
    while (!enemy.warning) tick(state, enemy);
    const locked = enemy.aimX;
    expect(locked).toBeGreaterThan(state.player.x);
    expect(locked - state.player.x).toBeLessThanOrEqual(WRAITH.leadLimit);
    expect(enemy.damageable).toBe(true); // The initial aim feint is still a solid, shootable target.
    expect(enemy.x).toBe(0);
    while (!Number.isFinite(enemy.blink!.startedAt)) tick(state, enemy);
    expect(enemy.damageable).toBe(false);
    state.player.x = -2;
    for (let i = 0; i < Math.ceil(WRAITH.teleport / STEP) + 1; i++) tick(state, enemy);
    expect(enemy.damageable).toBe(true);
    expect(enemy.aimX).toBe(locked);
    const footprints = pendingAttackFootprints(state, enemy, locked, enemy.warning);
    expect(footprints).toHaveLength(3);
    expect(footprints[1].t0 - footprints[0].t0).toBeCloseTo(.06);
    expect(footprints[2].t0 - footprints[0].t0).toBeCloseTo(.12);
    state.cameraX = -6; // The previous destination is now out of view: no invisible volley.
    tick(state, enemy);
    expect(enemy.warning).toBe(0);
    expect(state.projectiles).toHaveLength(0);
  });

  it('does not consume an attack or emit a partial triplet when the pool is full', () => {
    const { state, enemy } = setup();
    while (!enemy.warning) tick(state, enemy);
    state.projectiles = Array.from({ length: BALANCE.maxProjectiles - 1 }, (_, id) => ({
      id, x: 0, s: 25, previousX: 0, previousS: 25, vx: 0, vs: 1, friendly: true, damage: 1, radius: .1, ttl: 1,
    }));
    while (enemy.warning) tick(state, enemy);
    expect(enemy.blink!.attacks).toBe(0);
    expect(state.projectiles).toHaveLength(BALANCE.maxProjectiles - 1);
  });

  it('finishes the normal two attacks and exits through the real simulation', () => {
    const { state, enemy } = setup();
    for (let i = 0; i < 14 / STEP; i++) stepRun(state, EMPTY_INPUT);
    expect(enemy.blink!.attacks).toBe(2);
    expect(state.enemies.some(e => e.id === enemy.id)).toBe(false);
  });
});

describe('Seeker versus hunter shielding', () => {
  it('spends five times as much main missile damage on shields, then deals full hull damage', () => {
    const { enemy } = setup(true);
    expect(absorbHunterShield(enemy, 12, 'seeker')).toBe(0);
    expect(enemy.hunter!.shield).toBeCloseTo(117.6);
    enemy.hunter!.shield = 1;
    expect(absorbHunterShield(enemy, 12, 'seeker')).toBeCloseTo(7);
    expect(enemy.hunter!.shield).toBe(0);
    expect(absorbHunterShield(enemy, 12, 'seeker')).toBe(12);
    enemy.hunter!.shield = 20;
    expect(absorbHunterShield(enemy, 12, 'pulse')).toBe(0);
    expect(enemy.hunter!.shield).toBe(8);
    expect(absorbHunterShield(enemy, 12)).toBe(4); // Charged specials retain their full effect.
    expect(HUNTERS.shield.seekerDamage).toBe(.2);
  });

  it('remembers the fired missile family even after the player switches weapons', () => {
    const state = createRun({ mode: 'campaign', seed: 5, weapon: 'seeker' });
    state.nextEncounterAt = Infinity;
    const enemy: Enemy = { id: state.nextId++, kind: 'dart', x: 0, s: 5, originX: 0, hp: 100, maxHp: 100,
      radius: .8, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 3,
      hunter: { shield: 120, perCharge: 40, key: 5, vx: 0, vs: 0, tx: 0, ts: 5, retarget: 100, waypoint: 0 } };
    state.enemies.push(enemy);
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(p => p.friendly), total = shots.reduce((sum, p) => sum + p.damage, 0);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every(p => p.weapon === 'seeker')).toBe(true);
    state.player.weapon = 'pulse'; state.nextVolleyAt = Infinity;
    for (let i = 0; i < 40; i++) stepRun(state, EMPTY_INPUT);
    expect(enemy.hunter!.shield).toBeCloseTo(120 - total * .2);
    expect(enemy.hp).toBe(100);
  });
});
