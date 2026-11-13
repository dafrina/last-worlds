import { describe, expect, it } from 'vitest';
import { ENDLESS_TIER_CELLS } from '../../src/content/equipment';
import { createRun } from '../../src/sim/game';
import { flyEndlessNatural } from './balance-setup';

/**
 * Endless natural progression (docs/40, mode B, fast CI set): a run starts from the standard Level 1 starter whatever the
 * campaign holds, and earns tiers only from the pickups it collects (1, 1, 2 and 2 power cells per tier). The pilot
 * collects reachable pickups when safe; nothing is injected. The long multi-seed distributions are in
 * tests/sim/balance-report.test.ts (BALANCE_TARGET=endless).
 */
describe('endless natural progression', () => {
  it('starts every run at Level 1 with the standard starter', () => {
    const run = createRun({ mode: 'endless', seed: 3, weapon: 'rail', rank: 4 });
    expect(run.player.power).toBe(0);
    expect(run.player.weapon).toBe('pulse');
  });

  it('earns its tiers from real pickups, one gain per cell, up to sector 8', () => {
    const result = flyEndlessNatural(1, 8);
    expect(result.highestSector).toBe(8);
    expect(result.tierFirstAt[0]).toBe(0);
    // Every tier above the first came from cells: the gains match the cells each tier takes.
    const cells = ENDLESS_TIER_CELLS.slice(0, result.maxTier - 1).reduce((a, b) => a + b, 0);
    expect(result.powerGains).toBeGreaterThanOrEqual(cells);
    // Measured 13 November (8 seeds): Level 2 by sector 3, Level 3-5 by sector 5, Level 5 by about sector 8.
    expect(result.checkpoints.find(c => c.sector === 5)?.tier).toBeGreaterThanOrEqual(3);
  });
});
