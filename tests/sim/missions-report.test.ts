import { it } from 'vitest';
import { WORLD_MISSIONS, type WorldMission } from '../../src/content/world-missions';
import type { MissionId } from '../../src/shared/contracts';
import { flyObserved, verdicts, type Attempt } from './mission-harness';

/*
 * The world-mission sweep (docs/35 § 5; several minutes): MISSION_REPORT=<report file> npx vitest run
 * tests/sim/missions-report.test.ts. Each world's mission flown on seeds 1–12 at Standard by the perfect test pilot, at
 * tier 1 and tier 3, collecting coins and strike sites; for each world mission, the share of single attempts that complete
 * it (career missions: the mean progress one attempt adds). Specials are fired whenever charged, except for Old School;
 * loadout objectives fly their loadout; Flanking Maneuver flies to each flank in turn.
 */
const REPORT = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.MISSION_REPORT;
const SEEDS = 12;

/** The attempt that suits a mission's objective, at a tier (rank 0 or 2). */
function attemptFor(def: WorldMission, seed: number, rank: number): Attempt | null {
  const rule = def.rule, base: Attempt = { seed, rank, specials: true };
  if (rule.kind === 'complete' && rule.rank !== undefined && rule.rank !== rank) return null;
  if (rule.kind === 'complete' && rule.noSpecial) return { ...base, specials: false };
  if ((rule.kind === 'complete' || rule.kind === 'boss') && rule.weapons && !rule.weapons.includes('pulse')) return { ...base, weapon: rule.weapons[0] };
  if (rule.kind === 'air-water') return { ...base, weapon: rule.weapon };
  if (rule.kind === 'reflected') return { ...base, ship: 'spectre' };
  if (rule.kind === 'flanks') return { ...base, style: 'flank' };
  if (def.difficulty === 'veteran') return { ...base, difficulty: 'veteran' };
  return base;
}
const key = (a: Attempt) => JSON.stringify(a);

it.runIf(REPORT)('reports each world mission\'s completion per attempt', async () => {
  const rows: string[] = ['World missions per attempt (Standard unless the mission needs Veteran; perfect pilot; seeds 1–12)', '',
    '| World | # | Mission | Scope | Tier 1 | Tier 3 |', '| --- | --- | --- | --- | --- | --- |'];
  for (const [mission, defs] of Object.entries(WORLD_MISSIONS) as [MissionId, readonly WorldMission[]][]) {
    const cache = new Map<string, ReturnType<typeof verdicts>>();
    const result = (attempt: Attempt) => {
      if (!cache.has(key(attempt))) { const { state, events } = flyObserved(mission, attempt); cache.set(key(attempt), verdicts(state, events)); }
      return cache.get(key(attempt))!;
    };
    for (const [index, def] of defs.entries()) {
      const cells = [0, 2].map(rank => {
        const outcomes: { done: boolean; value: number }[] = [];
        for (let seed = 1; seed <= SEEDS; seed++) {
          const attempt = attemptFor(def, seed, rank);
          if (attempt) outcomes.push(result(attempt).find(v => v.def.id === def.id)!);
        }
        if (!outcomes.length) return 'n/a';
        return def.scope === 'career'
          ? `${(outcomes.reduce((sum, o) => sum + o.value, 0) / outcomes.length).toFixed(2)} / attempt`
          : `${Math.round(100 * outcomes.filter(o => o.done).length / outcomes.length)} %`;
      });
      rows.push(`| ${defs[0].id.split('.')[0]} | ${index + 1} | ${def.name} | ${def.scope} | ${cells.join(' | ')} |`);
    }
  }
  const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { writeFileSync(path: string, data: string): void };
  fs.writeFileSync(REPORT!, rows.join('\n') + '\n');
}, 3_600_000);
