import { describe, expect, it } from 'vitest';
import { clearWorld } from './mission-harness';

/*
 * Every world mission can be done in the real game (docs/35 § 5), Luna, Khepri and Vesper. The perfect test pilot flies the
 * world's mission attempt after attempt (seeds 1, 2, …), each with the loadout a player would pick for the missions on the
 * board at its start (`planFor`: strong gear unless a visible mission needs otherwise), through the real tracker and a
 * saved profile, until all twelve are done. Only the missions visible when an attempt starts count in it, so a world takes
 * at least three attempts.
 */
const LOG = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.MISSION_LOG;

describe('world missions are all reachable', () => {
  it.each([
    ['training', 5, 400, 5],
    ['bastion', 3, 400, 4],
    ['cold-vector', 5, 465, 4],
  ] as const)('%s: all twelve within %i attempts', (mission, max, credits, parts) => {
    const result = clearWorld(mission, max);
    if (LOG) console.log(`${mission}: ${result.flown} attempts\n${result.log.join('\n')}`);
    expect(result.missing).toEqual([]);
    expect([result.credits, result.parts]).toEqual([credits, parts]);
  }, 240_000);
});
