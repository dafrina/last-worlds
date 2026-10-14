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
    expect(median(runs.map(({ log }) => log.firstLifeLostAt!))).toBeGreaterThanOrEqual(30);
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

  it.each(combos)('the perfect pilot clears Training and Rolling Thunder on $difficulty with $weapon', ({ weapon, difficulty }) => {
    const start = weapon === 'pulse' ? 0 : weapon === 'fan' ? -2 : 2;
    const training = createRun({ mode: 'campaign', mission: 'training', weapon, difficulty, seed: 53 });
    training.player.x = start;
    const trainingLog = fly(training, perfectPilot(), 125, { noPickups: true });
    expect(trainingLog.phase).toBe('complete');
    expect(trainingLog.livesLost).toBe(0);
    expect(trainingLog.specialsUsed).toBe(0);

    const thunder = createRun({ mode: 'campaign', mission: 'bastion', weapon, difficulty, seed: 53 });
    thunder.player.x = start;
    const thunderLog = fly(thunder, perfectPilot(), 360, { noPickups: true });
    expect({ phase: thunderLog.phase, boss: thunder.boss?.phase }).toEqual({ phase: 'complete', boss: 'destroyed' });
    expect(thunderLog.livesLost).toBe(0);
    expect(thunderLog.specialsUsed).toBe(0);
  });

  it('Relaxed, Standard and Veteran apply clearly different pressure in the same authored sortie', () => {
    const pressure = (difficulty: Difficulty) => {
      const runs = spread({ mode: 'campaign', mission: 'training', difficulty, seed: 53 }, hunterPilot, 120);
      return {
        shotsPerMinute: median(runs.map(run => run.shots)) / 2,
        livesLost: median(runs.map(run => run.log.livesLost)),
      };
    };
    const relaxed = pressure('relaxed');
    const standard = pressure('standard');
    const veteran = pressure('veteran');
    expect(standard.shotsPerMinute).toBeGreaterThan(relaxed.shotsPerMinute * 1.15);
    expect(veteran.shotsPerMinute).toBeGreaterThan(standard.shotsPerMinute * 1.15);
    // A mid-skill pilot finds Standard a real challenge and never finds a harder setting easier.
    expect(standard.livesLost).toBeGreaterThanOrEqual(1);
    expect(standard.livesLost).toBeGreaterThanOrEqual(relaxed.livesLost);
    expect(veteran.livesLost).toBeGreaterThanOrEqual(standard.livesLost);
  });
});
