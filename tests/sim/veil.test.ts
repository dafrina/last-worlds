import { describe, expect, it } from 'vitest';
import { BOSSES, missionBoss } from '../../src/content/bosses';
import { EMPTY_INPUT, STEP, type Difficulty, type WeaponId } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { bossTarget, resolveBossPhase } from '../../src/sim/bastion';
import { fly, perfectPilot } from './pilots';

describe('THE VEIL, Nacre\'s boss (docs/20)', () => {
  it('ends Deep Bloom and is the toughest boss so far', () => {
    expect(missionBoss('deep-bloom')?.id).toBe('veil');
    const total = (id: 'veil' | 'ark' | 'bastion') => Object.values(BOSSES[id].parts).reduce((sum, part) => sum + part.hp, 0);
    expect(total('veil')).toBeGreaterThan(total('ark'));
  });

  const combos = (['pulse', 'fan', 'seeker'] as WeaponId[]).flatMap(weapon => (['relaxed', 'standard', 'veteran'] as Difficulty[]).map(difficulty => ({ weapon, difficulty })));
  it.each(combos)('the perfect pilot clears Deep Bloom on $difficulty with $weapon without a hit', ({ weapon, difficulty }) => {
    const state = createRun({ mode: 'campaign', mission: 'deep-bloom', difficulty, weapon, seed: 5 });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  }, 60000);

  it('must be killed: Deep Bloom never completes while it lives', () => {
    const state = createRun({ mode: 'campaign', mission: 'deep-bloom', difficulty: 'standard', seed: 8 });
    state.player.lives = 10000;
    for (let i = 0; i < 500 / STEP; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
    expect(state.phase).toBe('playing');
    expect(state.boss?.id).toBe('veil');
  }, 60000);

  it('deploys pod waves from both front bays once its heart is open', () => {
    const state = createRun({ mode: 'campaign', mission: 'deep-bloom', difficulty: 'standard', seed: 8 });
    state.player.lives = 10000;
    while (!state.boss || state.boss.phase === 'arrival') { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
    bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0; resolveBossPhase(state);
    const pods = new Set<number>(), sides = new Set<number>();
    for (let i = 0; i < 30 / STEP; i++) {
      state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT);
      for (const enemy of state.enemies) if (enemy.formation?.template === 'veil-pods') { pods.add(enemy.id); sides.add(Math.sign(enemy.x - state.boss!.x)); }
    }
    expect(pods.size).toBeGreaterThanOrEqual(8);
    expect(sides.has(1) && sides.has(-1)).toBe(true);
  }, 60000);
});
