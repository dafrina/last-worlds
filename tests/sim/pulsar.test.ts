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

describe('Pulsar burst (Nacre; tracking stream since 20 October 2026)', () => {
  it('streams its shots one after another, ten of them', () => {
    const state = armed(2);
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(shot => !shot.friendly);
    expect(shots).toHaveLength(PULSAR_BURST.shots);
    expect(PULSAR_BURST.shots).toBeGreaterThanOrEqual(10);
    expect(shots.every(shot => shot.track)).toBe(true);
    expect(shots.map(shot => shot.delay ?? 0).sort((a, b) => a - b)[PULSAR_BURST.shots - 1]).toBeCloseTo((PULSAR_BURST.shots - 1) * PULSAR_BURST.interval - STEP, 6);
    expect(ENEMIES.pulsar.shotSpeed).toBeGreaterThan(8);
  });

  it('aims every shot at where the ship is as that shot leaves the muzzle', () => {
    const state = armed(0);
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(shot => !shot.friendly), aimed = new Map<number, number>();
    for (let i = 0; i < (PULSAR_BURST.shots * PULSAR_BURST.interval + 0.2) / STEP; i++) {
      // The ship slides across while the stream leaves; remember its x at each shot's release.
      state.player.x = -3 + i * STEP * 5;
      state.nextVolleyAt = Infinity;
      const waiting = new Set(shots.filter(shot => (shot.delay ?? 0) > 0).map(shot => shot.id));
      stepRun(state, EMPTY_INPUT);
      for (const shot of shots) if (waiting.has(shot.id) && !(shot.delay! > 0)) aimed.set(shot.id, state.player.x);
    }
    expect(aimed.size).toBe(PULSAR_BURST.shots - 1);
    for (const shot of shots) {
      const playerX = aimed.get(shot.id);
      if (playerX === undefined) continue;
      // Its line from the muzzle (it has flown on since) passes through the ship's position at release.
      const t = -shot.s / shot.vs;
      expect(shot.x + shot.vx * t).toBeCloseTo(playerX, 3);
    }
    expect(new Set(shots.map(shot => Math.atan2(shot.vx, shot.vs).toFixed(3))).size).toBeGreaterThan(5);
  });

  it('hits a ship that holds still and spares one that keeps moving', () => {
    const stays = armed(1.5), shields = stays.player.shields;
    for (let i = 0; i < 2.5 / STEP; i++) { stays.nextVolleyAt = Infinity; stepRun(stays, EMPTY_INPUT); }
    expect(stays.player.shields).toBeLessThan(shields);
    const moves = armed(1.5);
    for (let i = 0; i < 2.5 / STEP; i++) { moves.nextVolleyAt = Infinity; stepRun(moves, { ...EMPTY_INPUT, horizontal: -1 }); }
    expect(moves.player.shields).toBe(shields);
  });
});
