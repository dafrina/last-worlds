import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/content/balance';
import { SHIPS } from '../../src/content/equipment';
import { STEP } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';

/** User, 7 November: a coin the ship's reach once took must find its way to the ship, even on a quick pass. */
describe('caught pickups home in until collected', () => {
  const reach = BALANCE.pickup.magnetRadius * SHIPS.scrapper.pickupReach;
  const run = () => {
    const state = createRun({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 3 });
    state.player.invulnerableUntil = Infinity; state.pickups = []; state.enemies = [];
    return state;
  };

  it('a coin brushed at the edge of reach while steering away at full speed is still collected', () => {
    const state = run(), before = state.credits;
    state.player.x = 0; state.player.vx = -20;
    state.pickups.push({ id: 9001, kind: 'credit', x: reach * .8, s: .2, value: 7, ttl: 6 });
    for (let i = 0; i < 4 * 60 && state.pickups.length; i++) stepRun(state, { horizontal: -1, specialPressed: false, pausePressed: false }, STEP);
    expect(state.pickups).toHaveLength(0);
    expect(state.credits - before).toBe(7);
  });

  it('a coin outside reach is never pulled', () => {
    const state = run();
    state.player.x = -6;
    state.pickups.push({ id: 9002, kind: 'credit', x: 6, s: 4, value: 7, ttl: 6 });
    for (let i = 0; i < 20; i++) stepRun(state, { horizontal: 0, specialPressed: false, pausePressed: false }, STEP);
    const coin = state.pickups.find(p => p.id === 9002)!;
    expect(coin.caught).toBeUndefined(); expect(coin.x).toBe(6);
  });

  it('a weapon drop brushed in endless homes in and is taken like any other drop', () => {
    const state = createRun({ mode: 'endless', seed: 3 });
    state.player.invulnerableUntil = Infinity; state.pickups = []; state.enemies = [];
    state.player.x = 0;
    state.pickups.push({ id: 9003, kind: 'weapon', weapon: 'fan', x: reach * .8, s: .2, value: 0, ttl: 6 });
    for (let i = 0; i < 4 * 60 && state.pickups.length; i++) stepRun(state, { horizontal: -1, specialPressed: false, pausePressed: false }, STEP);
    expect(state.pickups).toHaveLength(0);
    expect(state.player.weapon).toBe('fan');
  });
});
