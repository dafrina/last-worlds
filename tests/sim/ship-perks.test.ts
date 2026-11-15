import { describe, expect, it } from 'vitest';
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { EMPTY_INPUT, STEP, type Enemy, type Mode, type Projectile, type ShipId } from '../../src/shared/contracts';
import { SHIP_PERKS } from '../../src/content/ship-perks';
import { SPECIALS } from '../../src/content/equipment';

// The chassis perks in flight (docs/42): the Interceptor's Shred and the Spectre's Gravity Slingshot.
function arena(ship: ShipId = 'spectre', mode: Mode = 'campaign') {
  const state = createRun({ mode, ship, seed: 41 });
  state.nextEncounterAt = state.nextVolleyAt = Infinity;
  return state;
}
type Arena = ReturnType<typeof arena>;
function bullet(state: Arena, x = .8, s = .1, firedBy?: number): Projectile {
  const shot: Projectile = { id: state.nextId++, x, s, previousX: x, previousS: s, vx: 0, vs: -18, friendly: false, damage: 1, radius: .1, ttl: 4, ...(firedBy ? { firedBy } : {}) };
  state.projectiles.push(shot); return shot;
}
function target(state: Arena, x: number, s: number, hp = 1000): Enemy {
  const enemy: Enemy = { id: state.nextId++, kind: 'turret', x, s, originX: x, hp, maxHp: hp, radius: .4, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: 3 };
  state.enemies.push(enemy); return enemy;
}
/** One main-weapon shot that strikes `enemy` this step (the ship's own guns are held off: `nextVolleyAt`). */
function strike(state: Arena, enemy: Enemy, damage = 10) {
  state.projectiles.push({ id: state.nextId++, x: enemy.x, s: enemy.s - .3, previousX: enemy.x, previousS: enemy.s - .3, vx: 0, vs: 30, friendly: true, damage, radius: .1, ttl: 1, weapon: 'pulse' });
}
const advance = (state: Arena, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += STEP) stepRun(state, EMPTY_INPUT); };

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

  it('Shred: while hits keep landing, on any enemies, the guns spin up to +40% over 1.5 s, at every level', () => {
    for (const rank of [0, 3]) {
      const state = arena('interceptor', mode), a = target(state, 3, 8), b = target(state, -3, 8);
      state.player.power = rank;
      const at = (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += STEP) { strike(state, Math.round(t / STEP) % 2 ? a : b); stepRun(state, EMPTY_INPUT); } };
      at(.75);
      expect(state.player.spin!, `rank ${rank}`).toBeCloseTo(SHIP_PERKS.shredCap / 2, 2);
      at(.8);
      expect(state.player.spin, `rank ${rank}`).toBeCloseTo(SHIP_PERKS.shredCap, 9);
      // Fire rate only: every hit still deals its own damage.
      const before = a.hp; strike(state, a); stepRun(state, EMPTY_INPUT);
      expect(before - a.hp).toBeCloseTo(10, 6);
    }
    expect([SHIP_PERKS.shredCap, SHIP_PERKS.shredWindUp]).toEqual([.4, 1.5]);
  });

  it('hits half a second apart (a Level 1 Rail Driver) still wind it up; a longer gap holds it where it is', () => {
    const state = arena('interceptor', mode), enemy = target(state, 3, 8);
    for (let t = 0; t < 1.6; t += .5) { strike(state, enemy); stepRun(state, EMPTY_INPUT); advance(state, .5 - STEP); }
    expect(state.player.spin!).toBeGreaterThan(SHIP_PERKS.shredCap * .9);
    const held = arena('interceptor', mode), other = target(held, 3, 8);
    strike(held, other); stepRun(held, EMPTY_INPUT);
    held.nextVolleyAt = Infinity; advance(held, 2);
    expect(held.player.spin!).toBeCloseTo(SHIP_PERKS.shredCap / SHIP_PERKS.shredWindUp * (SHIP_PERKS.shredWindow + STEP), 2);
  });

  it('a spun-up Interceptor fires its pattern 40% faster; a miss changes nothing, a hit on the ship stops it', () => {
    const state = arena('interceptor', mode);
    target(state, state.player.x, 10, 1e6);
    state.nextVolleyAt = 0;
    stepRun(state, EMPTY_INPUT);
    const still = state.nextVolleyAt - state.time;
    state.player.spin = SHIP_PERKS.shredCap; state.nextVolleyAt = 0;
    stepRun(state, EMPTY_INPUT);
    expect(state.nextVolleyAt - state.time).toBeCloseTo(still / (1 + SHIP_PERKS.shredCap), 6);
    // A shot that hits nothing leaves the spin as it is.
    state.projectiles.push({ id: state.nextId++, x: -5, s: 1, previousX: -5, previousS: 1, vx: 0, vs: 30, friendly: true, damage: 10, radius: .1, ttl: .3, weapon: 'pulse' });
    state.nextVolleyAt = Infinity; advance(state, .4);
    expect(state.player.spin).toBeGreaterThanOrEqual(SHIP_PERKS.shredCap - 1e-9);
    hitPlayer(state, 1);
    expect(state.player.spin).toBe(0);
  });

  it('the spin also stops after a pause in firing, but not between two shots', () => {
    const state = arena('interceptor', mode), enemy = target(state, state.player.x, 10, 1e6);
    state.nextVolleyAt = 0;
    // (Held in front of the ship: on its own it scrolls past within a second or two.)
    for (let t = 0; t < SHIP_PERKS.shredWindUp + .3; t += STEP) { enemy.x = state.player.x; enemy.s = 10; stepRun(state, EMPTY_INPUT); }
    expect(state.player.spin).toBeCloseTo(SHIP_PERKS.shredCap, 6);
    // Nothing left to fire at: it holds for the grace, then stops.
    enemy.hp = 0; state.enemies = [];
    advance(state, SHIP_PERKS.shredIdle - .1);
    expect(state.player.spin).toBeCloseTo(SHIP_PERKS.shredCap, 6);
    advance(state, .3);
    expect(state.player.spin).toBe(0);
  });

  it('no other chassis spins up', () => {
    for (const ship of ['scrapper', 'ironclad', 'spectre'] as const) {
      const other = arena(ship, mode), enemy = target(other, 3, 8);
      for (let i = 0; i < 6; i++) { strike(other, enemy); stepRun(other, EMPTY_INPUT); }
      expect(other.player.spin ?? 0, ship).toBe(0);
    }
  });

  it('Gravity Slingshot: a graze is caught with or without shields, swung round and sent back at its shooter for 25', () => {
    for (const shields of [3, 0]) {
      const state = arena('spectre', mode);
      state.player.shields = shields; state.player.specialCharge = 0;
      const near = target(state, -1, 4, 100), shooter = target(state, 4, 12, 100);
      const shot = bullet(state, .8, .1, shooter.id);
      stepRun(state, EMPTY_INPUT);
      expect(shot.orbit).toBeDefined(); expect(shot.friendly).toBe(true);
      expect(state.player.shields).toBe(shields);
      advance(state, 1.5);
      // It went past the nearer target to the one that fired it.
      expect(near.hp).toBe(100);
      expect(shooter.hp).toBeCloseTo(100 - SHIP_PERKS.reflectedDamage, 6);
      // A returned kill never charges the special.
      expect(state.player.specialCharge).toBeCloseTo(state.time / SPECIALS[state.config.special!].recharge);
    }
  });

  it('a return whose shooter is gone flies at the nearest target in view', () => {
    const state = arena('spectre', mode), near = target(state, -1, 4, 100);
    const shot = bullet(state, .8, .1, 999_999);
    stepRun(state, EMPTY_INPUT); expect(shot.reflected).toBe(true);
    advance(state, 1.2);
    expect(near.hp).toBeCloseTo(100 - SHIP_PERKS.reflectedDamage, 6);
  });

  it('never intercepts a direct hit, a distant shot or a beam', () => {
    for (const x of [0, .51, 1.3]) {
      const state = arena('spectre', mode), shot = bullet(state, x, 1.5);
      advance(state, .2);
      expect(shot.reflected).toBeUndefined();
      expect(state.player.shields).toBe(x < .52 ? 2 : 3);
    }
    const state = arena('spectre', mode);
    state.hazards.push({ id: state.nextId++, x: 0, width: 1, warning: 0, active: 1, ttl: 1, cost: 1 });
    stepRun(state, EMPTY_INPUT); expect(state.player.shields).toBe(2);
  });

  it('catches again after its 0.4 s cooldown, several in the air at once', () => {
    const state = arena('spectre', mode);
    target(state, 0, 14, 1000);
    bullet(state); bullet(state, -.8);
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles.filter(s => s.reflected)).toHaveLength(1);
    advance(state, .2);
    const blocked = bullet(state); stepRun(state, EMPTY_INPUT); expect(blocked.reflected).toBeUndefined();
    advance(state, SHIP_PERKS.reflectCooldown);
    const caught = bullet(state); stepRun(state, EMPTY_INPUT); expect(caught.reflected).toBe(true);
    expect(state.projectiles.filter(s => s.reflected && s.ttl > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('other chassis never reflect, and a pause advances no perk', () => {
    const state = arena('ironclad', mode), shot = bullet(state);
    stepRun(state, EMPTY_INPUT);
    expect(shot.reflected).toBeUndefined();
    const spectre = arena('spectre', mode); bullet(spectre); stepRun(spectre, EMPTY_INPUT);
    spectre.phase = 'paused'; const before = structuredClone(spectre);
    stepRun(spectre, EMPTY_INPUT); expect(spectre).toEqual(before);
  });
});
