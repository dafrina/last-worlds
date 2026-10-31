import { describe, expect, it } from 'vitest';
import type { Difficulty, WeaponId } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

/**
 * THE ECLIPSE's fight, measured (docs/28): Final Horizon flown by the perfect pilot, one flight per seed, with the boss
 * fight's phases timed. Off by default; one weapon and difficulty per process, so several can run side by side:
 *
 *   ECLIPSE_REPORT=<file.jsonl> ECLIPSE_WEAPON=pulse ECLIPSE_DIFFICULTY=standard ECLIPSE_SEEDS=1-24 \
 *     npx vitest run tests/sim/eclipse-report.test.ts
 *
 * Each flight appends one JSON line: clear, hits over the mission and in the fight (with the phase and its age at each), the
 * order the first-phase targets fell in, the ship's x when the reactor opened, and the phase durations (s).
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.ECLIPSE_REPORT, SEEDS = env.ECLIPSE_SEEDS ?? '1-24';
const WEAPON = (env.ECLIPSE_WEAPON ?? 'pulse') as WeaponId, DIFFICULTY = (env.ECLIPSE_DIFFICULTY ?? 'standard') as Difficulty;

describe('THE ECLIPSE fight sweep (report)', () => {
  it.runIf(REPORT)('flies Final Horizon on every seed with the perfect pilot', async () => {
    const [from, to] = SEEDS.split('-').map(Number);
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { appendFileSync(path: string, data: string): void };
    for (let seed = from; seed <= (to ?? from); seed++) {
      const state = createRun({ mode: 'campaign', mission: 'final-horizon', difficulty: DIFFICULTY, weapon: WEAPON, seed });
      const at: Record<string, number> = {};
      let fightHits = 0, phaseOneHits = 0, lastHit = state.player.lastHitAt;
      const fightHitPhases: string[] = [], killOrder: string[] = [];
      let coreStartX: number | null = null;
      const log = fly(state, perfectPilot(), 480, { noPickups: true, onTick: s => {
        if (s.boss && at[s.boss.phase] === undefined) { at[s.boss.phase] = s.time; if (s.boss.phase === 'core') coreStartX = +s.player.x.toFixed(2); }
        for (const e of s.enemies) if (e.bossPart && e.bossPart !== 'core' && e.hp <= 0 && !killOrder.includes(e.bossPart)) killOrder.push(e.bossPart);
        if (s.player.lastHitAt !== lastHit) {
          lastHit = s.player.lastHitAt;
          if (s.boss && s.boss.phase !== 'destroyed') { fightHits++; fightHitPhases.push(`${s.boss.phase}@${(s.time - s.boss.phaseStartedAt).toFixed(1)}`); }
          if (s.boss?.phase === 'batteries') phaseOneHits++;
        }
      } });
      const span = (a: string, b: string) => at[a] !== undefined && at[b] !== undefined ? +(at[b] - at[a]).toFixed(2) : null;
      fs.appendFileSync(REPORT!, JSON.stringify({ weapon: WEAPON, difficulty: DIFFICULTY, seed, phase: log.phase, hits: log.hits,
        livesLost: log.livesLost, fightHits, fightHitPhases, killOrder, coreStartX, phaseOneHits, phaseOne: span('batteries', 'core'), core: span('core', 'overload'),
        overload: span('overload', 'destroyed'), fight: span('batteries', 'destroyed') }) + '\n');
    }
    expect(true).toBe(true);
  }, 7_200_000);
});
