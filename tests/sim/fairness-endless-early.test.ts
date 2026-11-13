import { describe, it } from 'vitest';
import { UNION_TITLE, checkUnion, type UnionRun } from './fairness-setup';

/* Endless hazard unions, first visits: sectors 1-22 (split from fairness.test.ts for parallel runs, docs/38 T1). */
describe('cue sequence hazard unions', () => {
  const runs: UnionRun[] = [
    // Sectors 1-5: the Luna prologue and WARDEN-1, the jump, Khepri, Bastion-9, the jump into Vesper. Endless continues
    // only after a kill, so only the perfect branch gets past WARDEN-1; the idle and dodger branches stay in its fight.
    { label: 'endless sectors 1-5', config: { mode: 'endless', seed: 21 }, seconds: 760, sector: 1, bosses: ['warden', 'bastion'], planets: ['luna', 'khepri', 'vesper'] },
    // Each planet's first stint on every branch, ending in its boss fight.
    { label: 'endless sectors 2-4 (Khepri, Bastion-9)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 2, bosses: ['bastion'], planets: ['khepri'] },
    { label: 'endless sectors 5-7 (Vesper, Helion Ark)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 5, bosses: ['ark'], planets: ['vesper'] },
    // perfectLives: since the Needles' side lanes moved inside a beam's reach of the ship (user, 8 November: "without
    // moving i wouldnt even be hit"), the 0.2 s-late perfect pilot loses one life in these two long stints; the union stays
    // fair (no violations), which is what this suite guards.
    { label: 'endless sectors 8-10 (Nacre, THE VEIL)', perfectLives: 1, config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 8, bosses: ['veil'], planets: ['nacre'] },
    { label: 'endless sectors 11-13 (Amnion, THE CRADLE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 11, bosses: ['cradle'], planets: ['amnion'] },
    { label: 'endless sectors 14-16 (Corona, THE HELIOPHAGE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 14, bosses: ['heliophage'], planets: ['corona'] },
    { label: 'endless sectors 17-19 (Nahara, THE CITADEL)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 17, bosses: ['citadel'], planets: ['nahara'] },
    { label: 'endless sectors 20-22 (Umbra, THE ECLIPSE)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 20, bosses: ['eclipse'], planets: ['umbra'] },
  ];

  // A whole stint per run: well inside 30 s alone, but the full suite in parallel can stretch one past it.
  it.each(runs)(UNION_TITLE, run => checkUnion(run), 120_000);
});
