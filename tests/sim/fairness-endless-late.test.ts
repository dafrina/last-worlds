import { describe, it } from 'vitest';
import { UNION_TITLE, checkUnion, type UnionRun } from './fairness-setup';

/* Endless hazard unions, later visits at the capped ramp: sectors 22-37 (split from fairness.test.ts for parallel runs, docs/38 T1). */
describe('cue sequence hazard unions', () => {
  const runs: UnionRun[] = [
    // Later visits (peak playlists, capped ramp): Khepri's Bastion-9, then every other world in turn.
    { label: 'endless capped sector 22 (Bastion-9)', config: { mode: 'endless', seed: 21 }, seconds: 160, sector: 22, bosses: ['bastion'], planets: ['khepri'] },
    { label: 'endless capped sectors 23-25 (Vesper, Helion Ark)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 23, bosses: ['ark'], planets: ['vesper'] },
    { label: 'endless capped sectors 26-28 (Nacre, THE VEIL)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 26, bosses: ['veil'], planets: ['nacre'] },
    { label: 'endless capped sectors 29-31 (Amnion, THE CRADLE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 29, bosses: ['cradle'], planets: ['amnion'] },
    { label: 'endless capped sectors 32-34 (Corona, THE HELIOPHAGE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 32, bosses: ['heliophage'], planets: ['corona'] },
    { label: 'endless capped sectors 35-37 (Umbra, THE ECLIPSE)', perfectLives: 1, config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 35, bosses: ['eclipse'], planets: ['umbra'] },
  ];

  it.each(runs)(UNION_TITLE, run => checkUnion(run));
});
