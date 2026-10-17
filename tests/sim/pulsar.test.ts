import { describe, expect, it } from 'vitest';
import { ENEMIES, PULSAR_BURST } from '../../src/content/balance';
import { EMPTY_INPUT, STEP } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';

/** A Pulsar holding at (x, s) whose windup ends on the next step, aimed at the player's x. */
function armed(playerX: number, x = 0, s = 9.5) {
  const state = createRun({ mode: 'campaign', mission: 'deep-bloom', difficulty: 'standard', seed: 3 });
  state.nextEncounterAt = Infinity; state.nextVolleyAt = Infinity; state.player.x = playerX;
  state.enemies.push({ id: state.nextId++, kind: 'pulsar', x, s, originX: x, hp: 999, maxHp: 999, radius: .6, age: 0,
    nextAttack: Infinity, warning: STEP / 2, aimX: playerX, groundHeight: 3.8 });
  return state;
}

describe('Pulsar burst (Nacre, 17 October 2026)', () => {
  it('fires a stream of shots down one line, one after another', () => {
    const state = armed(2);
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(shot => !shot.friendly);
    expect(shots).toHaveLength(PULSAR_BURST.shots);
    expect(new Set(shots.map(shot => Math.atan2(shot.vx, shot.vs).toFixed(6))).size).toBe(1);
    expect(shots.map(shot => shot.delay ?? 0).sort((a, b) => a - b)[PULSAR_BURST.shots - 1]).toBeCloseTo((PULSAR_BURST.shots - 1) * PULSAR_BURST.interval - STEP, 6);
    expect(ENEMIES.pulsar.shotSpeed).toBeGreaterThan(8);
  });

  it('hits a ship that stays on the line and spares one that stepped off it', () => {
    const stays = armed(1.5), shields = stays.player.shields;
    for (let i = 0; i < 2.5 / STEP; i++) { stays.nextVolleyAt = Infinity; stepRun(stays, EMPTY_INPUT); }
    expect(stays.player.shields).toBeLessThan(shields);
    const steps = armed(1.5);
    stepRun(steps, EMPTY_INPUT);
    steps.player.x = -2.5;
    for (let i = 0; i < 2.5 / STEP; i++) { steps.nextVolleyAt = Infinity; stepRun(steps, EMPTY_INPUT); }
    expect(steps.player.shields).toBe(shields);
  });
});
