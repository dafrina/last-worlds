import { describe, expect, it } from 'vitest';
import { clearWorld } from './mission-harness';
import { env } from '../helpers/env';

/*
 * Every world mission can be done in the real game (docs/35 § 5), Luna, Khepri and Vesper. The perfect test pilot flies the
 * world's mission attempt after attempt (seeds 1, 2, …), each with the loadout a player would pick for the missions on the
 * board at its start (`planFor`: strong gear unless a visible mission needs otherwise), through the real tracker and a
 * saved profile, until all twelve are done. Only the missions visible when an attempt starts count in it, so a world takes
 * at least three attempts.
 */
const LOG = env.MISSION_LOG;

describe('world missions are all reachable', () => {
  it.each([
    // 6 since pace 1.15 (6 November): strike sites pass 15% sooner, and Lunar Saboteur's two sites take a run longer.
    // Parts +2 per world since Untouchable pays 3 (10 November).
    ['training', 12, 450, 7],
    ['bastion', 8, 450, 6],
    ['cold-vector', 12, 515, 6],
  ] as const)('%s: all twelve within %i attempts', (mission, max, credits, parts) => {
    const result = clearWorld(mission, max);
    if (LOG) console.log(`${mission}: ${result.flown} attempts\n${result.log.join('\n')}`);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([credits, parts]);
  }, 240_000);
});
