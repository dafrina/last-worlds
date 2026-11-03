import { describe, expect, it } from 'vitest';
import { BOSSES, bossParts, phaseOneParts, type BossDefinition } from '../../src/content/bosses';
import { difficultyScales } from '../../src/content/balance';
import { createRun } from '../../src/sim/game';
import { bossTarget, resolveBossPhase, startBoss, updateBoss } from '../../src/sim/bastion';
import type { Difficulty, RunConfig } from '../../src/shared/contracts';

// Baseline before the 3 November adjustment: boss HP was authored HP × mode scale × 1.15.
const oldBossMultiplier = 1.15;
const scenarios: { name: string; config: RunConfig; sector: number }[] = [
  ...(['relaxed', 'standard', 'veteran'] as Difficulty[]).map(difficulty => ({
    name: `campaign ${difficulty}`, config: { mode: 'campaign' as const, difficulty, seed: 1 }, sector: 1,
  })),
  ...[3, 6, 18, 36, 120].map(sector => ({
    name: `endless sector ${sector}`, config: { mode: 'endless' as const, seed: 1 }, sector,
  })),
];

describe.each(Object.values(BOSSES))('$name health adjustment', (def: BossDefinition) => {
  it.each(scenarios)('increases every independent pool by exactly 20% in $name', ({ config, sector }) => {
    const state = createRun(config); state.sector = sector;
    startBoss(state, def);
    const scale = difficultyScales(config.mode, config.difficulty ?? 'standard', sector).hp;
    for (const part of bossParts(def)) {
      const oldHp = def.parts[part]!.hp * scale * oldBossMultiplier;
      const target = bossTarget(state, part)!;
      expect(target.hp).toBeCloseTo(oldHp * 1.2, 8);
      expect(target.maxHp).toBe(target.hp);
    }
  });

  it.each(['campaign', 'endless'] as const)('preserves pools and threshold across repeated %s phase resolution', mode => {
    const state = createRun({ mode, difficulty: 'veteran', seed: 3 }); state.sector = 18;
    startBoss(state, def);
    const targets = bossParts(def).map(part => bossTarget(state, part)!);
    const maxima = targets.map(target => target.maxHp);
    // A duplicate start is a no-op, not another HP boost.
    startBoss(state, def); expect(state.enemies).toHaveLength(targets.length);
    state.time = state.boss!.startedAt + def.arrivalDuration + .01;
    updateBoss(state, 1 / 60);
    expect(state.boss!.phase).toBe('batteries');
    for (const part of phaseOneParts(def)) bossTarget(state, part)!.hp = 0;
    resolveBossPhase(state);
    expect(state.boss!.phase).toBe('core');
    const core = bossTarget(state, 'core')!;
    expect(core.hp).toBe(maxima[targets.indexOf(core)]);
    const threshold = core.maxHp * def.overloadFraction;
    core.hp = threshold + .01; resolveBossPhase(state);
    expect(state.boss!.phase).toBe('core');
    core.hp = threshold; resolveBossPhase(state);
    expect(state.boss!.phase).toBe('overload');
    const nextAttackAt = state.boss!.nextAttackAt;
    state.boss!.attackIndex = 2;
    for (let i = 0; i < 10; i++) resolveBossPhase(state);
    expect(core.hp).toBe(threshold);
    expect(targets.map(target => target.maxHp)).toEqual(maxima);
    expect(state.boss!.attackIndex).toBe(2);
    expect(state.boss!.nextAttackAt).toBe(nextAttackAt);
    core.hp = 0; resolveBossPhase(state);
    expect(state.boss!.phase).toBe('destroyed');
    expect(targets.map(target => target.maxHp)).toEqual(maxima);
  });
});
