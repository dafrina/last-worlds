import { describe, expect, it } from 'vitest';
import { missionBoss } from '../../src/content/bosses';
import type { MissionId, RunConfig } from '../../src/shared/contracts';
import { bossScenario, measure, sum, type FleeStats } from './flee-harness';
import { fleeingPilot, perfectPilot } from './pilots';
import { env } from '../helpers/env';

/**
 * The squadron and boss pull measured (docs/10 §4–5; user, 11 November). Off by default:
 *
 *   FLEE_REPORT=<file.jsonl> FLEE_SEEDS=1-4 FLEE_PILOT=flee|perfect npx vitest run tests/sim/flee-report.test.ts
 *
 * Every campaign mission at Standard (to 60 s into its boss fight) and endless sectors 2–4, one JSON line per target with
 * the summed counts of tests/sim/flee-harness.ts.
 */
const REPORT = env.FLEE_REPORT, SEEDS = env.FLEE_SEEDS ?? '1-4', PILOT = env.FLEE_PILOT ?? 'flee';
const MISSIONS: readonly MissionId[] = ['training', 'bastion', 'deep-bloom', 'cold-vector', 'brood-strike', 'dying-star', 'final-horizon'];

describe('squadron and boss pull (report)', () => {
  it.runIf(REPORT)('flies every target with the fleeing or the perfect pilot', async () => {
    const [from, to] = SEEDS.split('-').map(Number);
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { appendFileSync(path: string, data: string): void };
    const pilot = PILOT === 'perfect' ? () => perfectPilot() : fleeingPilot;
    const targets: { label: string; config: (seed: number) => RunConfig; seconds: number; sector: number }[] = [
      ...MISSIONS.map(mission => ({ label: mission, config: (seed: number): RunConfig => ({ mode: 'campaign', mission, difficulty: 'standard', seed }),
        seconds: missionBoss(mission)!.arrivesAt + 60, sector: 1 })),
      ...[2, 3, 4].map(sector => ({ label: `endless-s${sector}`, config: (seed: number): RunConfig => ({ mode: 'endless', seed }), seconds: sector === 4 ? 140 : 88, sector })),
    ];
    const all: FleeStats[] = [];
    for (const target of targets) {
      const runs: FleeStats[] = [];
      for (let seed = from; seed <= (to ?? from); seed++) runs.push(measure(target.config(seed), target.seconds, pilot(), target.sector));
      const total = sum(runs);
      all.push(total);
      fs.appendFileSync(REPORT!, JSON.stringify({ target: target.label, pilot: PILOT, seeds: SEEDS, ...total }) + '\n');
    }
    fs.appendFileSync(REPORT!, JSON.stringify({ target: 'total', pilot: PILOT, seeds: SEEDS, ...sum(all) }) + '\n');
    // Boss fights parked at the world edge, the core open or only the far module left (flee-harness.ts bossScenario).
    if (PILOT === 'flee') for (const scenario of ['core', 'far'] as const) for (const mission of MISSIONS) {
      const runs: FleeStats[] = [];
      for (let seed = from; seed <= (to ?? from); seed++) runs.push(bossScenario(mission, scenario, seed));
      fs.appendFileSync(REPORT!, JSON.stringify({ target: `boss-${scenario}:${mission}`, seeds: SEEDS, ...sum(runs) }) + '\n');
    }
    expect(all.length).toBeGreaterThan(0);
  }, 3_600_000);
});
