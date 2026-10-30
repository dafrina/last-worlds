import { THREAT_COST } from '../../src/content/balance';
import type { MissionId, RunState } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { enterSector, fly, perfectPilot, type Pilot } from './pilots';

/**
 * Seed-sweep measurements for the encounter deck (docs/33 § 4): one flight per seed, flown by a test pilot, and what it
 * met and earned. Shared by the band test (tests/sim/deck-balance.test.ts) and the long report.
 */
export interface FlightMetrics {
  seed: number;
  phase: RunState['phase'];
  hits: number;
  livesLost: number;
  /** Threat cost of every authored enemy spawned (hunters and boss parts excluded). */
  threat: number;
  /** Threat cost spawned per minute of flight before the boss (the pacing). */
  threatPerMinute: number;
  credits: number;
  score: number;
  parts: number;
  sites: number;
  time: number;
}

function measure(state: RunState, pilot: Pilot, seconds: number, until?: (state: RunState) => boolean): FlightMetrics {
  const seen = new Set<number>();
  let threat = 0, approachTime = 0;
  const start = state.time;
  const log = fly(state, pilot, seconds, {
    onTick: s => {
      if (!s.boss) approachTime = s.time - start;
      for (const enemy of s.enemies) {
        if (enemy.hunter || enemy.bossPart || seen.has(enemy.id)) continue;
        seen.add(enemy.id);
        threat += THREAT_COST[enemy.kind];
      }
      if (until?.(s)) s.phase = 'complete';
    },
  });
  return {
    seed: state.config.seed, phase: log.phase, hits: log.hits, livesLost: log.livesLost, threat,
    threatPerMinute: threat / Math.max(1, approachTime) * 60, credits: state.credits, score: state.score,
    parts: state.parts ?? 0, sites: state.sites?.destroyed ?? 0, time: log.time - start,
  };
}

/** A whole campaign mission at Standard with the starter loadout. */
export function flyMission(mission: MissionId, seed: number, pilot: Pilot = perfectPilot(), rank = 0): FlightMetrics {
  return measure(createRun({ mode: 'campaign', mission, difficulty: 'standard', seed, rank }), pilot, 420);
}

/** One endless sector from its start (enterSector), until the next sector begins or the run ends. */
export function flySector(sector: number, seed: number, pilot: Pilot = perfectPilot()): FlightMetrics {
  const state = enterSector(createRun({ mode: 'endless', seed }), sector);
  return measure(state, pilot, 420, s => s.sector > sector);
}

export const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
export function summarize(runs: readonly FlightMetrics[]) {
  const pick = (key: keyof FlightMetrics) => runs.map(run => run[key] as number);
  return {
    runs: runs.length,
    completed: runs.filter(run => run.phase === 'complete').length,
    hits: mean(pick('hits')), maxHits: Math.max(...pick('hits')), livesLost: mean(pick('livesLost')), maxLivesLost: Math.max(...pick('livesLost')),
    threat: mean(pick('threat')), minThreat: Math.min(...pick('threat')), maxThreat: Math.max(...pick('threat')),
    threatPerMinute: mean(pick('threatPerMinute')),
    credits: mean(pick('credits')), minCredits: Math.min(...pick('credits')), maxCredits: Math.max(...pick('credits')),
    score: mean(pick('score')), parts: mean(pick('parts')), sites: mean(pick('sites')), time: mean(pick('time')),
  };
}
