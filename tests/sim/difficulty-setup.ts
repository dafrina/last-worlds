import type { RunConfig } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, type Pilot } from './pilots';

/* Shared setup of the difficulty suites (split for parallel runs, docs/38 T1): difficulty and difficulty-pressure. */
export const OFFSETS = [-1.5, -0.5, 0, 0.5, 1.5];

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function spread(config: RunConfig, make: () => Pilot, seconds: number) {
  return OFFSETS.map(x => {
    const state = createRun(config);
    state.player.x = x;
    const shots = new Set<number>();
    const log = fly(state, make(), seconds, { onTick: s => { for (const shot of s.projectiles) if (!shot.friendly) shots.add(shot.id); } });
    return { log, shots: shots.size, state };
  });
}
