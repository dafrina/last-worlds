import { it } from 'vitest';
import { WORLD_MISSIONS, type WorldMission } from '../../src/content/world-missions';
import type { MissionId } from '../../src/shared/contracts';
import { flyObserved, verdicts, type Attempt } from './mission-harness';

/*
 * The world-mission sweep (docs/35 § 5; minutes): MISSION_REPORT=<report file> [MISSION_WORLDS=training,bastion,…] npx vitest
 * run tests/sim/missions-report.test.ts. Each world's mission flown by the perfect test pilot, for each world mission with the
 * attempt a player would pick for it alone:
 * - Standard, strong gear (a level-3 Rail Driver, the Gravity Well fired when charged), seeds 1–12: the share of attempts that
 *   complete it (career missions: the mean progress one attempt adds);
 * - Relaxed with the best gear (level 5), seeds 1–6, for the missions any difficulty may fly: the share and the best attempt,
 *   to show what is out of reach on the easiest difficulty.
 * Loadout objectives fly their loadout, Old School fires no special, Gravity Slingshot flies the Spectre, Flanking Maneuver
 * flies to each flank in turn, ground objectives go for ground targets first.
 */
const ENV = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const REPORT = ENV.MISSION_REPORT;

function attemptFor(def: WorldMission, seed: number, best: boolean): Attempt {
  const rule = def.rule, kind = rule.kind;
  const attempt: Attempt = { seed, weapon: 'rail', rank: best ? 4 : 2, special: 'gravity-well', specials: true, difficulty: best ? 'relaxed' : 'standard',
    style: kind === 'flanks' ? 'flank' : kind === 'ground' || kind === 'ground-streak' ? 'ground' : 'collect' };
  if ((kind === 'complete' || kind === 'boss') && rule.weapons && !rule.weapons.includes('rail')) attempt.weapon = rule.weapons[0];
  if (kind === 'complete' && rule.rank !== undefined) attempt.rank = rule.rank;
  if (kind === 'air-water') attempt.weapon = rule.weapon;
  if (kind === 'complete' && rule.noSpecial) attempt.specials = false;
  if (kind === 'reflected') attempt.ship = 'spectre';
  if (def.difficulty === 'veteran') attempt.difficulty = 'veteran';
  return attempt;
}

it.runIf(REPORT)('reports each world mission\'s completion per attempt', async () => {
  const worlds = (ENV.MISSION_WORLDS?.split(',') ?? Object.keys(WORLD_MISSIONS)) as MissionId[];
  const rows: string[] = [];
  for (const mission of worlds) {
    const defs = WORLD_MISSIONS[mission], cache = new Map<string, ReturnType<typeof verdicts>>();
    const result = (attempt: Attempt) => {
      const key = JSON.stringify(attempt);
      if (!cache.has(key)) { const { state, events } = flyObserved(mission, attempt); cache.set(key, verdicts(state, events)); }
      return cache.get(key)!;
    };
    for (const [index, def] of defs.entries()) {
      const cell = (best: boolean, seeds: number) => {
        if (best && def.difficulty !== 'relaxed') return 'n/a';
        const outcomes = Array.from({ length: seeds }, (_, i) => result(attemptFor(def, i + 1, best)).find(v => v.def.id === def.id)!);
        if (def.scope === 'career') return `${(outcomes.reduce((sum, o) => sum + o.value, 0) / seeds).toFixed(2)} / attempt`;
        if (best) return `${Math.round(100 * outcomes.filter(o => o.done).length / seeds)} % (best ${Math.max(...outcomes.map(o => o.value))}/${def.goal})`;
        return `${Math.round(100 * outcomes.filter(o => o.done).length / seeds)} %`;
      };
      rows.push(`| ${def.id.split('.')[0]} | ${index + 1} | ${def.name} | ${def.goal} | ${cell(false, 12)} | ${cell(true, 6)} |`);
    }
  }
  const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { writeFileSync(path: string, data: string): void };
  fs.writeFileSync(REPORT!, rows.join('\n') + '\n');
}, 3_600_000);
