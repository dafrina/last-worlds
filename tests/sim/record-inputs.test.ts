import { describe, expect, it } from 'vitest';
import type { Difficulty, MissionId, RunConfig, WeaponId } from '../../src/shared/contracts';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot, beamAwareHunterPilot, skilledPilot, type Pilot } from './pilots';
import { env } from '../helpers/env';

/**
 * Records a flight's steering for tools/record-run.mjs (docs/41; the user, 13 November: "record a perfect play", then "we
 * could do it for failed runs so we can see what happens"). Off by default; the recorder runs it for you:
 *
 *   REPLAY_OUT=run.json REPLAY_MISSION=silent-empire REPLAY_WEAPON=pulse REPLAY_RANK=4 REPLAY_SEEDS=1-30 \
 *     REPLAY_PILOT=skilled REPLAY_FIND=life npx vitest run tests/sim/record-inputs.test.ts
 *
 * REPLAY_PILOT: perfect (default), skilled, hunter, pacifist (the perfect pilot, nothing it fires lands). REPLAY_FIND:
 * none (the first seed), hit, life (a life lost) or fail (the mission lost): the first seed of REPLAY_SEEDS whose flight
 * has it. The file keeps the config, one steering character a tick, the hit and life-lost times, and a fingerprint of the
 * end for the recorder to check its replay against (the simulation is deterministic).
 */
const PILOTS: Record<string, () => Pilot> = { perfect: () => perfectPilot(), skilled: () => skilledPilot(), hunter: beamAwareHunterPilot, pacifist: () => perfectPilot() };

describe('flight recorder', () => {
  it.runIf(env.REPLAY_OUT)('flies the mission and writes its steering', async () => {
    const pilotId = env.REPLAY_PILOT ?? 'perfect', find = env.REPLAY_FIND ?? 'none';
    const [from, to] = (env.REPLAY_SEEDS ?? env.REPLAY_SEED ?? '1').split('-').map(Number);
    let chosen: object | null = null;
    for (let seed = from; seed <= (to ?? from) && !chosen; seed++) {
      const config: RunConfig = { mode: 'campaign', mission: (env.REPLAY_MISSION ?? 'silent-empire') as MissionId, seed,
        difficulty: (env.REPLAY_DIFFICULTY ?? 'standard') as Difficulty, weapon: (env.REPLAY_WEAPON ?? 'pulse') as WeaponId, rank: Number(env.REPLAY_RANK ?? 4) };
      const state = createRun(config), pilot = PILOTS[pilotId]();
      let inputs = '';
      const log = fly(state, s => { const input = pilot(s); inputs += input.horizontal < 0 ? 'l' : input.horizontal > 0 ? 'r' : '.'; return input; }, 900,
        { noFire: pilotId === 'pacifist' });
      const hits: number[] = [];
      // (fly logs the first hit and every life lost; the hit times come from a second, identical pass below.)
      const found = find === 'none' || (find === 'hit' && log.hits > 0) || (find === 'life' && log.livesLost > 0) || (find === 'fail' && log.phase !== 'complete');
      if (!found) { console.log(`seed ${seed}: no ${find} (${log.phase}, ${log.hits} hits, ${log.livesLost} lives lost)`); continue; }
      // The hit times: replay the recorded steering (the same flight) and note each hit.
      const again = createRun(config);
      let last = again.player.lastHitAt, tick = 0;
      fly(again, () => ({ horizontal: inputs[tick++] === 'l' ? -1 : inputs[tick - 1] === 'r' ? 1 : 0, specialPressed: false, pausePressed: false }), 900, {
        noFire: pilotId === 'pacifist', onTick: s => { if (s.player.lastHitAt !== last) { hits.push(+s.time.toFixed(2)); last = s.player.lastHitAt; } } });
      chosen = { config, pilot: pilotId, noFire: pilotId === 'pacifist', ticks: inputs.length, inputs, hits, livesLostAt: log.lifeLostAt.map(t => +t.toFixed(2)),
        end: { phase: log.phase, time: +state.time.toFixed(4), kills: state.kills, x: +state.player.x.toFixed(5), hits: log.hits, livesLost: log.livesLost } };
      console.log(`seed ${seed}: ${log.phase}, ${log.hits} hits at ${hits.join(', ') || '—'}, lives lost at ${log.lifeLostAt.map(t => t.toFixed(1)).join(', ') || '—'}`);
    }
    if (!chosen) throw new Error(`No seed in ${from}-${to ?? from} has a ${find}`);
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { writeFileSync(path: string, data: string): void };
    fs.writeFileSync(env.REPLAY_OUT!, JSON.stringify(chosen));
    expect(chosen).not.toBeNull();
  }, 1_800_000);
});
