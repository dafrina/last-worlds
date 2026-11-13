import { describe, expect, it } from 'vitest';
import type { Difficulty, MissionId, WeaponId } from '../../src/shared/contracts';
import { CAMPAIGN_ORDER, EXPECTED_RANK, WEAPONS, flyEndlessIsolated, flyEndlessNatural, flyMission, type PilotId } from './balance-setup';
import { env } from '../helpers/env';

/**
 * Extended balance report (docs/40). Off by default; writes one JSON line per flight to BALANCE_REPORT, summarised by
 * `node tools/balance-report.mjs <file.jsonl>`. One target per process, so several can run side by side:
 *
 *   BALANCE_REPORT=out.jsonl BALANCE_TARGET=campaign BALANCE_MISSIONS=all BALANCE_WEAPONS=all BALANCE_RANKS=expected \
 *     BALANCE_DIFFICULTIES=standard BALANCE_SEEDS=1-3 npx vitest run tests/sim/balance-report.test.ts
 *   BALANCE_REPORT=out.jsonl BALANCE_TARGET=campaign BALANCE_MISSIONS=final-horizon BALANCE_RANKS=0-4 ...
 *   BALANCE_REPORT=out.jsonl BALANCE_TARGET=endless BALANCE_SEEDS=1-8 BALANCE_LAST_SECTOR=30 npx vitest run ...
 *   BALANCE_REPORT=out.jsonl BALANCE_TARGET=isolated BALANCE_SECTORS=20,30 BALANCE_WEAPONS=pulse,rail BALANCE_LEVELS=4,5 ...
 *
 * BALANCE_RANKS: `expected` (each mission's EXPECTED_RANK), or ranks `0-4` / `2,3` (rank 0 = Level 1). BALANCE_PILOT: `perfect`
 * (default) or `hunter` (campaign only).
 */
const REPORT = env.BALANCE_REPORT, TARGET = env.BALANCE_TARGET ?? 'campaign';
const list = (value: string | undefined, all: readonly string[]) => !value || value === 'all' ? [...all] : value.split(',');
const range = (value: string) => value.split(',').flatMap(part => {
  const [a, b] = part.split('-').map(Number);
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
});

describe('balance report (extended)', () => {
  it.runIf(REPORT)('flies the requested target and writes one line per flight', async () => {
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { appendFileSync(path: string, data: string): void };
    const write = (line: object) => fs.appendFileSync(REPORT!, JSON.stringify(line) + '\n');
    const seeds = range(env.BALANCE_SEEDS ?? '1-3');
    if (TARGET === 'campaign') {
      const missions = list(env.BALANCE_MISSIONS, CAMPAIGN_ORDER) as MissionId[];
      const weapons = list(env.BALANCE_WEAPONS, WEAPONS) as WeaponId[];
      const difficulties = list(env.BALANCE_DIFFICULTIES, ['standard']) as Difficulty[];
      for (const mission of missions) for (const weapon of weapons) for (const difficulty of difficulties) {
        const ranks = !env.BALANCE_RANKS || env.BALANCE_RANKS === 'expected' ? [EXPECTED_RANK[mission]] : range(env.BALANCE_RANKS);
        for (const rank of ranks) for (const seed of seeds) write(flyMission(mission, weapon, rank, difficulty, seed, (env.BALANCE_PILOT ?? 'perfect') as PilotId));
      }
    } else if (TARGET === 'endless') {
      const last = Number(env.BALANCE_LAST_SECTOR ?? 30);
      for (const seed of seeds) write(flyEndlessNatural(seed, last));
    } else if (TARGET === 'isolated') {
      const weapons = list(env.BALANCE_WEAPONS, WEAPONS) as WeaponId[];
      for (const sector of range(env.BALANCE_SECTORS ?? '20')) for (const weapon of weapons) for (const level of range(env.BALANCE_LEVELS ?? '4'))
        for (const seed of seeds) write(flyEndlessIsolated(sector, weapon, level, seed));
    }
    expect(true).toBe(true);
  }, 14_400_000);
});
