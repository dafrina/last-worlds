import { describe, it } from 'vitest';
import { UNION_TITLE, checkUnion, type UnionRun } from './fairness-setup';

/* Endless hazard unions, later visits at the capped ramp: sectors 25-43 (split from fairness.test.ts for parallel runs, docs/38 T1). */
describe('cue sequence hazard unions', () => {
  const runs: UnionRun[] = [
    // Later visits (peak playlists, capped ramp): Khepri's Bastion-9, then every other world in turn.
    { label: 'endless capped sector 25 (Bastion-9)', config: { mode: 'endless', seed: 21 }, seconds: 160, sector: 25, bosses: ['bastion'], planets: ['khepri'] },
    { label: 'endless capped sectors 26-28 (Vesper, Helion Ark)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 26, bosses: ['ark'], planets: ['vesper'] },
    { label: 'endless capped sectors 29-31 (Nacre, THE VEIL)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 29, bosses: ['veil'], planets: ['nacre'] },
    { label: 'endless capped sectors 32-34 (Amnion, THE CRADLE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 32, bosses: ['cradle'], planets: ['amnion'] },
    { label: 'endless capped sectors 35-37 (Corona, THE HELIOPHAGE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 35, bosses: ['heliophage'], planets: ['corona'] },
    { label: 'endless capped sectors 38-40 (Nahara, THE CITADEL)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 38, bosses: ['citadel'], planets: ['nahara'] },
    { label: 'endless capped sectors 41-43 (Umbra, THE ECLIPSE)', perfectLives: 1, config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 41, bosses: ['eclipse'], planets: ['umbra'] },
  ];

  // A whole stint per run: well inside 30 s alone, but the full suite in parallel can stretch one past it.
  it.each(runs)(UNION_TITLE, run => checkUnion(run), 120_000);
});
