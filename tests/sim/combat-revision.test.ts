import { expect, it } from 'vitest';
import { createRun, stepRun } from '../../src/sim/game';
import { EMPTY_INPUT, STEP, type Enemy } from '../../src/shared/contracts';
import { enemyShots } from '../../src/sim/attacks';
import { BOSSES, phaseOneParts } from '../../src/content/bosses';
import { startBoss, updateBoss, bossTarget, resolveBossPhase } from '../../src/sim/bastion';

it('special missiles fan out before steering and cover both edges of a crowded screen', () => {
  const state = createRun({ mode: 'campaign', mission: 'training', seed: 9, special: 'seeker-rack' });
  state.nextVolleyAt = state.nextEncounterAt = Infinity;
  for (let i = 0; i < 15; i++) state.enemies.push({ id: state.nextId++, kind: 'dart', x: -4.5 + i * 9 / 14,
    s: 13, originX: 0, hp: 1000, maxHp: 1000, radius: .4, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 3 } as Enemy);
  const left = state.enemies[0].id, right = state.enemies.at(-1)!.id;
  stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
  const shots = state.projectiles.filter(p => p.special);
  expect(shots).toHaveLength(8);
  expect(new Set(shots.map(s => s.homingTargetId)).size).toBe(8);
  expect(shots.some(s => s.homingTargetId === left)).toBe(true);
  expect(shots.some(s => s.homingTargetId === right)).toBe(true);
  const initial = shots.map(s => ({ vx: s.vx, vs: s.vs }));
  for (let i = 0; i < 10; i++) stepRun(state, EMPTY_INPUT);
  shots.forEach((s, i) => { expect(s.vx).toBe(initial[i].vx); expect(s.vs).toBe(initial[i].vs); });
  expect(Math.max(...shots.map(s => s.x)) - Math.min(...shots.map(s => s.x))).toBeGreaterThan(3);
  for (let i = 0; i < 15; i++) stepRun(state, EMPTY_INPUT);
  expect(shots.some((s, i) => Math.abs(s.vx - initial[i].vx) > .1)).toBe(true);
});

for (const id of ['veil', 'cradle', 'eclipse'] as const) it(`${id} opens its exposed-core phase with a warned spiral, never in battery phase`, () => {
  const state = createRun({ mode: 'campaign', mission: 'deep-bloom', seed: 1 });
  state.nextVolleyAt = state.nextEncounterAt = Infinity; state.player.invulnerableUntil = 0;
  startBoss(state, BOSSES[id]);
  state.time = BOSSES[id].arrivalDuration + 1;
  updateBoss(state, STEP);
  expect(state.boss!.phase).toBe('batteries');
  state.boss!.attackIndex = 7;
  // Every first-phase target down (THE ECLIPSE's prow vent too).
  for (const part of phaseOneParts(BOSSES[id])) bossTarget(state, part)!.hp = 0;
  resolveBossPhase(state);
  expect(state.boss!.attackIndex).toBe(0);
  for (let i = 0; i < 240 && !state.boss!.attack; i++) { state.time += STEP; updateBoss(state, STEP); }
  expect(state.boss!.phase).toBe('core');
  expect(state.boss!.attack).toBe('spiral');
  expect(bossTarget(state, 'core')!.warning).toBeGreaterThan(.65);
});

it('missile batteries fire straight down even when the previous aim column differs', () => {
  const [shot] = enemyShots('missile', 3, 14, -5, 16);
  expect(shot.x).toBe(3);
  expect(shot.vx).toBeCloseTo(0, 12);
  expect(shot.vs).toBe(-16);
});
