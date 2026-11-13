import { describe, it } from 'vitest';
import { DIFFICULTY_IDS, UNION_TITLE, checkUnion, type UnionRun } from './fairness-setup';

/* Cue-sequence hazard unions of the campaign missions (split from fairness.test.ts for parallel runs, docs/38 T1). */
describe('cue sequence hazard unions', () => {
  const runs: UnionRun[] = [
    ...DIFFICULTY_IDS.flatMap(difficulty => [
      { label: `training/${difficulty}`, config: { mode: 'campaign' as const, mission: 'training' as const, difficulty, seed: 21 }, seconds: 260, sector: 1 },
      { label: `rolling-thunder/${difficulty}`, config: { mode: 'campaign' as const, mission: 'bastion' as const, difficulty, seed: 21 }, seconds: 300, sector: 1 },
      { label: `deep-bloom/${difficulty}`, config: { mode: 'campaign' as const, mission: 'deep-bloom' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `brood-strike/${difficulty}`, config: { mode: 'campaign' as const, mission: 'brood-strike' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `silent-empire/${difficulty}`, config: { mode: 'campaign' as const, mission: 'silent-empire' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `final-horizon/${difficulty}`, config: { mode: 'campaign' as const, mission: 'final-horizon' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `cold-vector/${difficulty}`, config: { mode: 'campaign' as const, mission: 'cold-vector' as const, difficulty, seed: 21 }, seconds: 330, sector: 1 },
    ]),
  ];

  it.each(runs)(UNION_TITLE, run => checkUnion(run));
});
