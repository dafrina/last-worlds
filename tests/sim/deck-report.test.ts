import { describe, expect, it } from 'vitest';
import type { MissionId } from '../../src/shared/contracts';
import { flyMission, flySector } from './deck-sweep';
import { beamAwareHunterPilot, perfectPilot } from './pilots';
import { siteSeeker } from './site-harness';

/**
 * The encounter deck's long seed sweep (docs/33 § 4; minutes per target). Off by default. One target per process, so
 * several can run side by side:
 *
 *   DECK_REPORT=<file.jsonl> DECK_TARGET=mission:bastion DECK_SEEDS=1-20 npx vitest run tests/sim/deck-report.test.ts
 *   DECK_REPORT=<file.jsonl> DECK_TARGET=sector:5 DECK_SEEDS=1-20 npx vitest run tests/sim/deck-report.test.ts
 *
 * DECK_PILOT=weaver flies the beam-aware hunter, DECK_PILOT=sites the site-hunting perfect pilot. Each flight appends one JSON line (target, seed and its FlightMetrics) to the report file.
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.DECK_REPORT, TARGET = env.DECK_TARGET ?? '', SEEDS = env.DECK_SEEDS ?? '1-20';
/** `perfect` (default), `weaver` (the beam-aware hunter, a weaving pilot that takes hits) or `sites` (the perfect pilot hunting strike sites and parts). */
const PILOT = env.DECK_PILOT === 'weaver' ? beamAwareHunterPilot : env.DECK_PILOT === 'sites' ? () => perfectPilot(siteSeeker) : perfectPilot;

describe('encounter deck seed sweep (report)', () => {
  it.runIf(REPORT && TARGET)('flies every seed of the target with the perfect pilot', async () => {
    const [from, to] = SEEDS.split('-').map(Number);
    const [kind, name] = TARGET.split(':');
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { appendFileSync(path: string, data: string): void };
    for (let seed = from; seed <= (to ?? from); seed++) {
      const metrics = kind === 'mission' ? flyMission(name as MissionId, seed, PILOT()) : flySector(Number(name), seed, PILOT());
      fs.appendFileSync(REPORT!, JSON.stringify({ target: TARGET, pilot: env.DECK_PILOT ?? 'perfect', ...metrics }) + '\n');
    }
    expect(true).toBe(true);
  }, 3_600_000);
});
