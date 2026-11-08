import { describe, expect, it } from 'vitest';
import { type Difficulty } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, hunterPilot, perfectPilot } from './pilots';
import { OFFSETS, median, spread } from './difficulty-setup';

/**
 * Deterministic difficulty calibration. Combat is authored and seed-independent, so fixed seeds and fixed
 * start offsets give repeatable numbers. These are guardrails for tuning, not proof of human fun: phone
 * playtests remain the release gate.
 */
const FIRE_SEEDS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59], HIT_SEEDS = [53, 54, 55];

/* Split from difficulty.test.ts for parallel runs (docs/38 T1). */
describe('difficulty bots', () => {
  it('Relaxed, Standard and Veteran apply clearly different pressure in the same authored sortie', () => {
    const pressure = (difficulty: Difficulty) => {
      // Fire faced by a pilot who is never hit (no respawn pauses) and clears squadrons like a strong player, averaged over
      // ten seeds: on one seed the Veteran/Standard ratio alone ranges 1.11-1.51 with where the batteries happen to land.
      const fire = FIRE_SEEDS.map(seed => {
        const strong = createRun({ mode: 'campaign', mission: 'training', difficulty, seed });
        const shots = new Set<number>();
        const clean = fly(strong, perfectPilot(), 120, { noPickups: true, onTick: s => { for (const shot of s.projectiles) if (!shot.friendly) shots.add(shot.id); } });
        if (seed === 53) expect(clean.hits).toBe(0);
        return shots.size / 2;
      });
      // Hits taken per minute by the mid-skill hunter with lives to spare (settings have different life counts): the median
      // over start offsets, averaged over three seeds (one hit more or less on a single seed moved the ratio by 0.1-0.2).
      const hits = HIT_SEEDS.map(seed => median(OFFSETS.map(x => {
        const state = createRun({ mode: 'campaign', mission: 'training', difficulty, seed });
        state.player.x = x;
        state.player.lives = 99;
        return fly(state, hunterPilot(), 120).hits / 2;
      })));
      const runs = spread({ mode: 'campaign', mission: 'training', difficulty, seed: 53 }, hunterPilot, 120);
      return { shotsPerMinute: fire.reduce((sum, value) => sum + value, 0) / fire.length, hitsPerMinute: hits.reduce((sum, value) => sum + value, 0) / hits.length, livesLost: median(runs.map(run => run.log.livesLost)) };
    };
    const relaxed = pressure('relaxed');
    const standard = pressure('standard');
    const veteran = pressure('veteran');
    expect(standard.shotsPerMinute).toBeGreaterThan(relaxed.shotsPerMinute * 1.15);
    expect(veteran.shotsPerMinute).toBeGreaterThan(standard.shotsPerMinute * 1.15);
    // A mid-skill pilot finds Standard a real challenge and clearly harder than Relaxed. Veteran is not easier
    // for it: Veteran's denser fire is partly offset by tougher squadrons holding the airspace longer, so its
    // edge shows in the fire a strong pilot faces (above), its single shield cell and its enemy HP.
    expect(standard.livesLost).toBeGreaterThanOrEqual(1);
    expect(standard.hitsPerMinute).toBeGreaterThan(relaxed.hitsPerMinute * 1.1);
    expect(veteran.hitsPerMinute).toBeGreaterThanOrEqual(standard.hitsPerMinute * 0.85);
    }, 120000);
});
