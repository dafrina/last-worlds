import { describe, expect, it } from 'vitest';
import { VESPER_LINE_CAP } from '../../src/content/balance';
import { createRun, stepRun } from '../../src/sim/game';
import { HUNTERS } from '../../src/sim/hunters';
import type { RunConfig, RunState } from '../../src/shared/contracts';
import { enterSector, perfectPilot, type Pilot } from './pilots';

/** Warning lines from ordinary enemies: windups plus live lanes not cast by a boss. */
const lines = (state: RunState) => state.enemies.filter(enemy => enemy.hp > 0 && enemy.warning > 0 && !enemy.bossPart).length
  + state.hazards.filter(hazard => !state.enemies.some(enemy => enemy.id === hazard.source && enemy.bossPart)).length;

function fly(state: RunState, seconds: number, pilot: Pilot, onTick: (state: RunState) => void) {
  state.player.lives = 10_000;
  const until = state.time + seconds;
  while (state.time < until - 1e-9 && state.phase === 'playing' && !state.boss) { stepRun(state, pilot(state)); onTick(state); }
}

describe('Vesper and endless aces (user, 31 October)', () => {
  it('keeps Vesper to five warning lines at once outside campaign Veteran', () => {
    for (const sector of [5, 6, 7]) for (const seed of [1, 2, 3]) {
      const state = enterSector(createRun({ mode: 'endless', seed }), sector);
      let most = 0;
      fly(state, 70, perfectPilot(), s => { if (s.planet === 'vesper') most = Math.max(most, lines(s)); });
      expect(most, `sector ${sector} seed ${seed}`).toBeLessThanOrEqual(VESPER_LINE_CAP);
    }
    const standard = createRun({ mode: 'campaign', mission: 'cold-vector', difficulty: 'standard', seed: 2 } as RunConfig);
    let most = 0;
    fly(standard, 120, perfectPilot(), s => { most = Math.max(most, lines(s)); });
    expect(most).toBeLessThanOrEqual(VESPER_LINE_CAP);
  });

  it('rolls a downed endless ace for a budgeted shield cell, a power cell or coins only; nothing extra in the campaign', () => {
    const drops = (config: RunConfig, sector?: number) => {
      let state = createRun(config);
      if (sector) state = enterSector(state, sector);
      const seen: string[] = [];
      let known = new Set(state.pickups.map(pickup => pickup.id)), aces = new Set<number>();
      fly(state, 85, perfectPilot(), s => {
        for (const enemy of s.enemies) if (enemy.hunter) aces.add(enemy.id);
        const downed = [...aces].filter(id => !s.enemies.some(enemy => enemy.id === id && enemy.hp > 0));
        for (const pickup of s.pickups) if (!known.has(pickup.id) && downed.length) seen.push(pickup.kind);
        for (const id of downed) aces.delete(id);
        known = new Set(s.pickups.map(pickup => pickup.id));
        // Keep shields missing so the budget is what limits the shield drops.
        s.player.shields = 0;
      });
      return { seen, state };
    };
    let endlessDrops = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { seen, state } = drops({ mode: 'endless', seed } as RunConfig, 2);
      const shields = seen.filter(kind => kind === 'shield').length;
      expect(shields, `seed ${seed}`).toBeLessThanOrEqual(HUNTERS.endlessDrop.shieldsPerSector * (state.sector - 1));
      endlessDrops += seen.filter(kind => kind === 'shield' || kind === 'power').length;
    }
    expect(endlessDrops).toBeGreaterThan(0);
    const campaign = drops({ mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 } as RunConfig);
    expect(campaign.seen.filter(kind => kind === 'shield' || kind === 'power')).toEqual([]);
  });
});
