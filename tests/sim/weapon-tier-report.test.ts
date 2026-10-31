import { describe, expect, it } from 'vitest';
import type { Difficulty, MissionId, WeaponId } from '../../src/shared/contracts';
import { freshProfile, payout } from '../../src/campaign/profile';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

/**
 * Weapon tiers measured (docs/30, tiers 4 and 5 of 31 October). Off by default; one target per process, so several can run
 * side by side:
 *
 *   TIER_REPORT=<file.jsonl> TIER_TARGET=horizon TIER_WEAPON=pulse TIER_RANK=2 TIER_DIFFICULTY=standard TIER_SEEDS=1-12 \
 *     npx vitest run tests/sim/weapon-tier-report.test.ts
 *   TIER_REPORT=<file.jsonl> TIER_TARGET=endless TIER_SEEDS=1-24 npx vitest run tests/sim/weapon-tier-report.test.ts
 *   TIER_REPORT=<file.jsonl> TIER_TARGET=mission:cold-vector TIER_RANK=2 TIER_DIFFICULTY=standard TIER_SEEDS=1-12 npx vitest ...
 *
 * `horizon` flies Final Horizon with the perfect pilot at one weapon and rank (pickups removed, as in the Eclipse report):
 * the mission time, THE ECLIPSE's arrival and kill, hits, and the most friendly and total projectiles alive at once.
 * `endless` flies sectors 1-8 from the starter with pickups on (power cells, ace drops and weapon drops all count): the
 * highest tier reached, when each tier was first reached, the seconds spent at each, the bosses' fight times and the hits.
 * `mission:<id>` flies a mission with pickups collected and reports its credits and what a repeat clear banks (the price
 * check for the tier upgrades).
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = env.TIER_REPORT, TARGET = env.TIER_TARGET ?? 'horizon', SEEDS = env.TIER_SEEDS ?? '1-12';
const WEAPON = (env.TIER_WEAPON ?? 'pulse') as WeaponId, RANK = Number(env.TIER_RANK ?? 2), DIFFICULTY = (env.TIER_DIFFICULTY ?? 'standard') as Difficulty;

describe('weapon tier sweep (report)', () => {
  it.runIf(REPORT)('flies every seed of the target with the perfect pilot', async () => {
    const [from, to] = SEEDS.split('-').map(Number);
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { appendFileSync(path: string, data: string): void };
    for (let seed = from; seed <= (to ?? from); seed++) {
      let friendlyPeak = 0, totalPeak = 0, fightFriendlyPeak = 0;
      const peaks = (s: ReturnType<typeof createRun>) => {
        const friendly = s.projectiles.filter(shot => shot.friendly).length;
        friendlyPeak = Math.max(friendlyPeak, friendly); totalPeak = Math.max(totalPeak, s.projectiles.length);
        if (s.boss && s.boss.phase !== 'arrival' && s.boss.phase !== 'destroyed') fightFriendlyPeak = Math.max(fightFriendlyPeak, friendly);
      };
      if (TARGET === 'horizon') {
        const state = createRun({ mode: 'campaign', mission: 'final-horizon', difficulty: DIFFICULTY, weapon: WEAPON, rank: RANK, seed });
        const at: Record<string, number> = {};
        const log = fly(state, perfectPilot(), 480, { noPickups: true, onTick: s => {
          if (s.boss && at[s.boss.phase] === undefined) at[s.boss.phase] = s.time;
          peaks(s);
        } });
        const span = (a: string, b: string) => at[a] !== undefined && at[b] !== undefined ? +(at[b] - at[a]).toFixed(2) : null;
        const fight = span('batteries', 'destroyed'), phases = { first: span('batteries', 'core'), core: span('core', 'overload'), overload: span('overload', 'destroyed') };
        fs.appendFileSync(REPORT!, JSON.stringify({ target: 'horizon', weapon: WEAPON, rank: RANK, difficulty: DIFFICULTY, seed, phase: log.phase,
          time: +log.time.toFixed(2), bossArrives: at.batteries ?? null, bossDown: at.destroyed !== undefined ? +at.destroyed.toFixed(2) : null, fight, phases,
          hits: log.hits, livesLost: log.livesLost, friendlyPeak, fightFriendlyPeak, totalPeak }) + '\n');
      } else if (TARGET.startsWith('mission:')) {
        const mission = TARGET.slice('mission:'.length) as MissionId;
        const state = createRun({ mode: 'campaign', mission, difficulty: DIFFICULTY, weapon: WEAPON, rank: RANK, seed });
        const log = fly(state, perfectPilot(), 480, { onTick: peaks });
        const result = { id: `report-${seed}`, mission, difficulty: DIFFICULTY, outcome: log.phase === 'complete' ? 'complete' as const : 'failed' as const,
          credits: state.credits, bossKilled: state.boss?.phase === 'destroyed', seconds: log.time };
        const repeat = freshProfile(); repeat.missions[mission] = { clears: { relaxed: 0, standard: 1, veteran: 0 }, best: {}, firstClearPaid: true };
        fs.appendFileSync(REPORT!, JSON.stringify({ target: TARGET, weapon: WEAPON, rank: RANK, difficulty: DIFFICULTY, seed, phase: log.phase,
          time: +log.time.toFixed(1), credits: state.credits, repeatBanked: payout(repeat, result).total, firstBanked: payout(freshProfile(), result).total,
          hits: log.hits, friendlyPeak }) + '\n');
      } else {
        const state = createRun({ mode: 'endless', seed });
        const firstAt: (number | null)[] = [0, null, null, null, null], seconds = [0, 0, 0, 0, 0];
        const fights: { id: string; seconds: number }[] = [];
        const weapons = new Set<string>([state.player.weapon]);
        let started: number | null = null, maxPower = 0;
        const log = fly(state, perfectPilot(), 3400, { onTick: s => {
          const power = s.player.power;
          maxPower = Math.max(maxPower, power); seconds[power] += 1 / 60; firstAt[power] ??= +s.time.toFixed(1);
          weapons.add(s.player.weapon);
          if (s.boss?.phase === 'batteries' && started === null) started = s.time;
          if (s.boss?.phase === 'destroyed' && started !== null) { fights.push({ id: s.boss.id, seconds: +(s.time - started).toFixed(1) }); started = null; }
          peaks(s);
          if (s.sector >= 8 && s.time - s.sectorStartedAt > 10) s.phase = 'paused';
        } });
        fs.appendFileSync(REPORT!, JSON.stringify({ target: 'endless', seed, phase: log.phase, sector: state.sector, time: +log.time.toFixed(1),
          maxPower, firstAt, seconds: seconds.map(v => +v.toFixed(1)), weapons: [...weapons], fights, hits: log.hits, livesLost: log.livesLost,
          friendlyPeak, fightFriendlyPeak, totalPeak }) + '\n');
      }
    }
    expect(true).toBe(true);
  }, 7_200_000);
});
