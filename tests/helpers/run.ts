import { stepRun } from '../../src/sim/game';
import { EMPTY_INPUT, STEP, type RunState } from '../../src/shared/contracts';

/** Steps a run with no input for `seconds`, rounded to whole ticks. */
export function advance(state: RunState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) stepRun(state, EMPTY_INPUT);
}
