import { describe, expect, it } from 'vitest';
import { BOSSES, missionBoss } from '../../src/content/bosses';
import { EMPTY_INPUT, STEP } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

describe('WARDEN-1, Luna\'s boss (docs/19)', () => {
  it('ends Training and is the smallest boss', () => {
    expect(missionBoss('training')?.id).toBe('warden');
    const total = (id: 'warden' | 'bastion' | 'ark') => Object.values(BOSSES[id].parts).reduce((sum, part) => sum + part.hp, 0);
    expect(total('warden')).toBeLessThan(total('bastion') / 1.5);
    expect(BOSSES.warden.warning).toBeGreaterThanOrEqual(BOSSES.bastion.warning);
  });

  it('must be killed: Training never completes while it stands, however long the fight', () => {
    const state = createRun({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 8 });
    // A large test-only life reserve; main fire is held so the boss can never be damaged.
    state.player.lives = 10000;
    for (let i = 0; i < 500 / STEP; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
    expect(state.phase).toBe('playing');
    expect(state.boss?.id).toBe('warden');
    expect(state.boss?.phase).not.toBe('destroyed');
  });

  it('completes Training after the kill and its extraction', () => {
    const state = createRun({ mode: 'campaign', mission: 'training', difficulty: 'relaxed', weapon: 'pulse', seed: 8 });
    let killedAt: number | null = null;
    const log = fly(state, perfectPilot(), 300, { noPickups: true, onTick: s => { if (s.boss?.phase === 'destroyed' && killedAt === null) killedAt = s.time; } });
    expect(log.phase).toBe('complete');
    expect(killedAt).not.toBeNull();
    expect(state.time).toBeGreaterThanOrEqual(killedAt! + BOSSES.warden.extractionDuration - 0.1);
  });
});
