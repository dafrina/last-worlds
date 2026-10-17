import { describe, expect, it } from 'vitest';
import { PULSE, pulseReach } from '../../src/content/balance';
import { EMPTY_INPUT, STEP } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';

/** A Pulsar holding at (x, s) that releases its ring on the next step. */
function armed(playerX: number, x = 0, s = 6.4) {
  const state = createRun({ mode: 'campaign', mission: 'deep-bloom', difficulty: 'standard', seed: 3 });
  state.nextEncounterAt = Infinity; state.nextVolleyAt = Infinity; state.player.x = playerX;
  state.enemies.push({ id: state.nextId++, kind: 'pulsar', x, s, originX: x, hp: 999, maxHp: 999, radius: .6, age: 0,
    nextAttack: Infinity, warning: STEP / 2, aimX: x, groundHeight: 3.8 });
  return state;
}
const run = (state: ReturnType<typeof armed>) => { for (let i = 0; i < 1.5 / STEP; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); } };

describe('Pulsar shockwave (Nacre, 17 October 2026)', () => {
  it('hits a ship inside its reach once and spares one outside it', () => {
    const inside = armed(1.5), shields = inside.player.shields;
    run(inside);
    expect(inside.player.shields).toBe(shields - 1);
    const reach = pulseReach(6.4).half;
    const outside = armed(reach + 1.2);
    run(outside);
    expect(outside.player.shields).toBe(shields);
  });

  it('marks a footprint on the player row covering where the ring can touch the ship', () => {
    const reach = pulseReach(6.4);
    expect(reach.half).toBeGreaterThan(2);
    expect(reach.until).toBeGreaterThan(PULSE.radius / PULSE.speed);
    // A Pulsar holding higher than its reach never touches the row.
    expect(pulseReach(PULSE.radius + 1).half).toBe(0);
  });
});
