import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/content/balance';
import { type Difficulty, type RunConfig, type WeaponId } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { dodgerPilot, fly, hunterPilot, idlePilot, perfectPilot, type Pilot } from './pilots';

/**
 * Deterministic difficulty calibration. Combat is authored and seed-independent, so fixed seeds and fixed
 * start offsets give repeatable numbers. These are guardrails for tuning, not proof of human fun: phone
 * playtests remain the release gate.
 */
const OFFSETS = [-1.5, -0.5, 0, 0.5, 1.5];
const SECTORS_1_TO_3 = 3 * BALANCE.sectorDuration;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function spread(config: RunConfig, make: () => Pilot, seconds: number) {
  return OFFSETS.map(x => {
    const state = createRun(config);
    state.player.x = x;
    const shots = new Set<number>();
    const log = fly(state, make(), seconds, { onTick: s => { for (const shot of s.projectiles) if (!shot.friendly) shots.add(shot.id); } });
    return { log, shots: shots.size, state };
  });
}

describe('difficulty bots', () => {
  it('an idle ship loses its first life within 25-40 s of Standard endless, for every seed', () => {
    const times = [1, 77, 9001].map(seed => {
      const log = fly(createRun({ mode: 'endless', seed }), idlePilot(), 60);
      return log.firstLifeLostAt;
    });
    expect(new Set(times).size).toBe(1);
    expect(times[0]).not.toBeNull();
    expect(times[0]!).toBeGreaterThanOrEqual(25);
    expect(times[0]!).toBeLessThanOrEqual(40);
  });

  it('a simple dodger loses lives within endless sectors 1-3, but never in the opening', () => {
    const runs = spread({ mode: 'endless', seed: 5 }, dodgerPilot, SECTORS_1_TO_3);
    for (const { log } of runs) {
      expect(log.firstLifeLostAt, 'loses a life by the end of sector 3').not.toBeNull();
      expect(log.firstLifeLostAt!, 'not instantly').toBeGreaterThanOrEqual(25);
    }
    // Pressure keeps rising: most dodgers are out of lives before sector 4.
    expect(runs.filter(({ log }) => log.phase === 'over').length).toBeGreaterThanOrEqual(3);
  });

  it('the perfect pilot survives endless sectors 1-4 without the special or any pickup', () => {
    const state = createRun({ mode: 'endless', seed: 5 });
    const log = fly(state, perfectPilot(), 4 * BALANCE.sectorDuration - 0.5, { noPickups: true });
    expect(state.sector).toBe(4);
    expect(log.phase).toBe('playing');
    expect(log.livesLost).toBe(0);
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  });

  const combos = (['pulse', 'fan', 'seeker'] as WeaponId[]).flatMap(weapon =>
    (['relaxed', 'standard', 'veteran'] as Difficulty[]).map(difficulty => ({ weapon, difficulty })));

  // Rolling Thunder clears for all nine combinations are asserted in bastion.test.ts.
  it.each(combos)('the perfect pilot clears Training on $difficulty with $weapon without a hit', ({ weapon, difficulty }) => {
    const start = weapon === 'pulse' ? 0 : weapon === 'fan' ? -2 : 2;
    const training = createRun({ mode: 'campaign', mission: 'training', weapon, difficulty, seed: 53 });
    training.player.x = start;
    const log = fly(training, perfectPilot(), 125, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  });

  it('Relaxed, Standard and Veteran apply clearly different pressure in the same authored sortie', () => {
    const pressure = (difficulty: Difficulty) => {
      // Fire faced by a pilot who is never hit (no respawn pauses) and clears squadrons like a strong player.
      const strong = createRun({ mode: 'campaign', mission: 'training', difficulty, seed: 53 });
      const shots = new Set<number>();
      const clean = fly(strong, perfectPilot(), 120, { noPickups: true, onTick: s => { for (const shot of s.projectiles) if (!shot.friendly) shots.add(shot.id); } });
      expect(clean.hits).toBe(0);
      // Hits taken per minute by the mid-skill hunter with lives to spare (settings have different life counts).
      const hits = OFFSETS.map(x => {
        const state = createRun({ mode: 'campaign', mission: 'training', difficulty, seed: 53 });
        state.player.x = x;
        state.player.lives = 99;
        return fly(state, hunterPilot(), 120).hits / 2;
      });
      const runs = spread({ mode: 'campaign', mission: 'training', difficulty, seed: 53 }, hunterPilot, 120);
      return { shotsPerMinute: shots.size / 2, hitsPerMinute: median(hits), livesLost: median(runs.map(run => run.log.livesLost)) };
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
  });
});
