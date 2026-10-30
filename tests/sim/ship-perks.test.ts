import { describe, expect, it } from 'vitest';
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { EMPTY_INPUT, STEP, VIEW, type Mode, type Projectile, type ShipId } from '../../src/shared/contracts';
import { playerKinematics } from '../../src/sim/fairness';
import { SHIP_PERKS } from '../../src/sim/ship-perks';

function arena(ship: ShipId = 'spectre', mode: Mode = 'campaign') {
  const state = createRun({ mode, ship, seed: 41 });
  state.nextEncounterAt = state.nextVolleyAt = Infinity;
  return state;
}
function bullet(state: ReturnType<typeof arena>, x = .8, s = .1): Projectile {
  const shot: Projectile = { id: state.nextId++, x, s, previousX: x, previousS: s, vx: 0, vs: -18, friendly: false, damage: 1, radius: .1, ttl: 4 };
  state.projectiles.push(shot); return shot;
}
const advance = (state: ReturnType<typeof arena>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) stepRun(state, EMPTY_INPUT); };

describe.each(['campaign', 'endless'] as const)('%s chassis perks', mode => {
  it('Ironclad starts with one extra life and Scrapper attracts pickups farther', () => {
    expect(arena('ironclad', mode).player.lives).toBe(arena('scrapper', mode).player.lives + 1);
    for (const ship of ['scrapper', 'ironclad'] as const) {
      const state = arena(ship, mode);
      state.pickups.push({ id: state.nextId++, kind: 'shield', x: 2, s: .1, value: 1, ttl: 5 });
      stepRun(state, EMPTY_INPUT);
      expect(state.pickups[0].x < 2).toBe(ship === 'scrapper');
    }
  });
  it('barrel roll dashes sideways at once, carries on when held, respects cooldown and never shields', () => {
    const state = arena('interceptor', mode);
    stepRun(state, { ...EMPTY_INPUT, horizontal: 1, dashPressed: 1 });
    const startedAt = state.player.dash!.startedAt;
    expect(state.player.x).toBeGreaterThan(.4);
    hitPlayer(state, 2); expect(state.player.shields).toBe(1);
    for (let t = STEP; t < SHIP_PERKS.dashDuration - 1e-9; t += STEP) stepRun(state, { ...EMPTY_INPUT, horizontal: 1 });
    expect(state.player.x).toBeCloseTo(SHIP_PERKS.dashDistance, 6);
    expect(state.player.vx).toBeCloseTo(playerKinematics(state).speed, 6);
    stepRun(state, { ...EMPTY_INPUT, dashPressed: -1 });
    expect(state.player.dash!.startedAt).toBe(startedAt);
    advance(state, SHIP_PERKS.dashCooldown);
    const x = state.player.x;
    stepRun(state, { ...EMPTY_INPUT, dashPressed: -1 });
    expect(state.player.dash!.direction).toBe(-1); expect(state.player.dash!.startedAt).toBeGreaterThan(startedAt);
    advance(state, SHIP_PERKS.dashDuration);
    expect(state.player.x).toBeLessThan(x - SHIP_PERKS.dashDistance + .01);
    expect(state.player.shields).toBe(1);
  });
  it('a dash stops at the edge of the world and is swept through hostile fire', () => {
    const edge = arena('interceptor', mode); edge.player.x = VIEW.worldWidth / 2 - VIEW.playerRadius - 1;
    stepRun(edge, { ...EMPTY_INPUT, dashPressed: 1 }); advance(edge, SHIP_PERKS.dashDuration);
    expect(edge.player.x).toBeCloseTo(VIEW.worldWidth / 2 - VIEW.playerRadius, 6);
    // A bullet standing in the dash's path, halfway along it, still hits.
    const state = arena('interceptor', mode); bullet(state, 1.4, 0);
    state.projectiles[0].vs = 0;
    stepRun(state, { ...EMPTY_INPUT, dashPressed: 1 }); advance(state, SHIP_PERKS.dashDuration);
    expect(state.player.shields).toBe(2);
  });
  it('captures a genuine graze, curves visibly, and launches at an enemy without charging the special', () => {
    const state = arena('spectre', mode), shot = bullet(state);
    state.player.specialCharge = 0;
    state.enemies.push({ id: state.nextId++, kind: 'turret', x: 0, s: 5, originX: 0, hp: 6, maxHp: 6, radius: .4, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 3 });
    stepRun(state, EMPTY_INPUT);
    expect(shot.orbit).toBeDefined(); expect(shot.friendly).toBe(true);
    expect(state.player.shields).toBe(3);
    advance(state, .15); expect(shot.s).toBeLessThan(-.5);
    advance(state, .8);
    expect(state.kills).toBe(1);
    expect(state.player.specialCharge).toBeCloseTo(state.time / 45);
  });
  it('does not intercept incoming direct hits, distant shots, empty-shield grazes or beams', () => {
    for (const x of [0, .51, 1.3]) {
      const state = arena('spectre', mode), shot = bullet(state, x, 1.5);
      advance(state, .2);
      expect(shot.reflected).toBeUndefined();
      expect(state.player.shields).toBe(x < .52 ? 2 : 3);
    }
    const state = arena('spectre', mode); state.player.shields = 0;
    expect(bullet(state).friendly).toBe(false); stepRun(state, EMPTY_INPUT);
    expect(state.projectiles[0].reflected).toBeUndefined();
    state.player.shields = 3;
    state.hazards.push({ id: state.nextId++, x: 0, width: 1, warning: 0, active: 1, ttl: 1, cost: 1 });
    stepRun(state, EMPTY_INPUT); expect(state.player.shields).toBe(2);
  });
  it('captures only one bullet and limits repeat captures even after its orbit ends', () => {
    const state = arena('spectre', mode); bullet(state); bullet(state, -.8);
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles.filter(s => s.reflected)).toHaveLength(1);
    advance(state, .4);
    const blocked = bullet(state); stepRun(state, EMPTY_INPUT); expect(blocked.reflected).toBeUndefined();
    advance(state, 1);
    const caught = bullet(state); stepRun(state, EMPTY_INPUT); expect(caught.reflected).toBe(true);
    state.player.shields = 0; stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).not.toContain(caught);
  });
  it('other chassis cannot roll or reflect, and pause does not advance a perk', () => {
    const state = arena('ironclad', mode), shot = bullet(state);
    stepRun(state, { ...EMPTY_INPUT, dashPressed: 1 });
    expect(state.player.dash).toBeUndefined(); expect(shot.reflected).toBeUndefined();
    const spectre = arena('spectre', mode); bullet(spectre); stepRun(spectre, EMPTY_INPUT);
    spectre.phase = 'paused'; const before = structuredClone(spectre);
    stepRun(spectre, { ...EMPTY_INPUT, dashPressed: 1 }); expect(spectre).toEqual(before);
  });
});
