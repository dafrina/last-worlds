import { describe, expect, it } from 'vitest';
import { clearWorld } from './mission-harness';
import { env } from '../helpers/env';

/*
 * Every world mission can be done in the real game (docs/35 § 5), Nacre, Amnion, Corona and Umbra. The perfect test pilot flies the
 * world's mission attempt after attempt (seeds 1, 2, …), each with the loadout a player would pick for the missions on the
 * board at its start (`planFor`: strong gear unless a visible mission needs otherwise), through the real tracker and a
 * saved profile, until all twelve are done. Only the missions visible when an attempt starts count in it, so a world takes
 * at least three attempts.
 */
const LOG = env.MISSION_LOG;

describe('world missions are all reachable', () => {
  it.each([
    // 8 since pace 1.15 (6 November): strike sites pass 15% sooner; Three Paths (3 sites in one run) takes 8 attempts.
    ['deep-bloom', 8, 600, 4],
    ['brood-strike', 14, 675, 5],
    // 13 since the fewer fuel skids (6 November): Gravity Slingshot (3 reflected kills, 5 before) comes about once in three
    // Spectre runs, half as often as when reflected shots set off skids among the batteries.
    // Dying Star (6 November: Flare Dancer 3, Solar Wind, Heat Shield): 9 attempts; Sunburn needs a top-level weapon.
    ['dying-star', 11, 650, 5],
    ['final-horizon', 13, 675, 5],
  ] as const)('%s: all twelve within %i attempts', (mission, max, credits, parts) => {
    const result = clearWorld(mission, max);
    if (LOG) console.log(`${mission}: ${result.flown} attempts\n${result.log.join('\n')}`);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([credits, parts]);
  }, 240_000);
});
