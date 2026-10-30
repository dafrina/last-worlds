import { describe, expect, it } from 'vitest';
import type { MissionId } from '../../src/shared/contracts';
import { flyMission, flySector } from './deck-sweep';

/*
 * The encounter deck's balance band (docs/33 § 4): difficulty and payouts stay near the fixed lists the deck replaced.
 * Baselines: the fixed lists of 29 October (commit 67cdfad), the perfect pilot at Standard with the starter, the mean over
 * seeds 1-30 (threat: every authored enemy spawned, by THREAT_COST; credits banked). The long sweep (20+ seeds per target,
 * tests/sim/deck-report.test.ts) is the evidence; this samples a few seeds per target on every run.
 */
const MISSIONS: readonly (readonly [MissionId, number, number])[] = [
  ['training', 98.3, 275.6], ['bastion', 144.9, 272.1], ['cold-vector', 234.9, 416.2],
  ['deep-bloom', 239.1, 335.2], ['brood-strike', 234.7, 329.5], ['final-horizon', 228.2, 361.9],
];
const SECTORS: readonly (readonly [number, number])[] = [[1, 60], [2, 72.2], [3, 96.9], [4, 85], [5, 120.8], [6, 144], [7, 130], [8, 116.7], [9, 129]];
/** Threat may move by this share per flight; credits by more (they also follow the pilot's path through loot). */
const THREAT_BAND = [0.75, 1.3] as const, CREDIT_BAND = [0.5, 1.6] as const;

describe('encounter deck balance band (perfect pilot, Standard)', () => {
  it.each(MISSIONS)('%s: completes without losing a life, threat and credits near the fixed list', (mission, threat, credits) => {
    for (const seed of [101, 102]) {
      const run = flyMission(mission, seed);
      expect(run.phase, `${mission}/${seed}`).toBe('complete');
      expect(run.livesLost, `${mission}/${seed}`).toBe(0);
      expect(run.threat / threat, `${mission}/${seed} threat ${run.threat}`).toBeGreaterThanOrEqual(THREAT_BAND[0]);
      expect(run.threat / threat, `${mission}/${seed} threat ${run.threat}`).toBeLessThanOrEqual(THREAT_BAND[1]);
      expect(run.credits / credits, `${mission}/${seed} credits ${run.credits}`).toBeGreaterThanOrEqual(CREDIT_BAND[0]);
      expect(run.credits / credits, `${mission}/${seed} credits ${run.credits}`).toBeLessThanOrEqual(CREDIT_BAND[1]);
    }
  }, 60_000);

  it.each(SECTORS)('endless sector %i: cleared without losing a life, threat near the fixed list', (sector, threat) => {
    for (const seed of [101, 102]) {
      const run = flySector(sector, seed);
      expect(run.phase, `sector ${sector}/${seed}`).toBe('complete');
      expect(run.livesLost, `sector ${sector}/${seed}`).toBe(0);
      expect(run.threat / threat, `sector ${sector}/${seed} threat ${run.threat}`).toBeGreaterThanOrEqual(THREAT_BAND[0]);
      expect(run.threat / threat, `sector ${sector}/${seed} threat ${run.threat}`).toBeLessThanOrEqual(THREAT_BAND[1]);
    }
  }, 60_000);
});
