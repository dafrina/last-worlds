import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/content/balance';
import { SPECIALS } from '../../src/content/equipment';
import { EMPTY_INPUT, STEP, type Enemy, type EnemyKind, type RunConfig, type RunState } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { orbitalDuration } from '../../src/sim/orbital';
import { absorbHunterShield } from '../../src/sim/hunters';

// docs/32: the Rail Driver (a piercing straight main weapon); docs/42: the Orbital Strike, which replaced docs/32's Gravity
// Well, and the Siege Lance's shot burning.
const campaign = (extra: Partial<RunConfig>): RunState => {
  const state = createRun({ mode: 'campaign', seed: 3, mission: 'training', difficulty: 'standard', ...extra });
  state.nextEncounterAt = Infinity;
  return state;
};
const target = (state: RunState, x: number, s: number, extra: Partial<Enemy> = {}, kind: EnemyKind = 'turret'): Enemy => {
  const enemy: Enemy = { id: state.nextId++, kind, x, s, originX: x, hp: 1000, maxHp: 1000, radius: .6, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: .85, ...extra };
  state.enemies.push(enemy); return enemy;
};
/** Fires exactly one main volley, then holds fire while it flies. */
const oneVolley = (state: RunState) => {
  for (let i = 0; i < 60 && !state.projectiles.some(p => p.friendly); i++) stepRun(state, EMPTY_INPUT);
  for (let i = 0; i < 40; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
};

describe('Rail Driver', () => {
  it('one slug damages every enemy in its column exactly once', () => {
    const state = campaign({ weapon: 'rail' });
    const column = [5, 10, 15].map(s => target(state, 0, s));
    oneVolley(state);
    expect(column.map(e => e.hp)).toEqual(column.map(() => 1000 - WEAPONS.rail.damage));
  });

  it('stops at the first boss part it strikes', () => {
    const state = campaign({ weapon: 'rail' });
    const part = target(state, 0, 8, { bossPart: 'left' }), behind = target(state, 0, 14);
    oneVolley(state);
    expect(part.hp).toBe(1000 - WEAPONS.rail.damage);
    expect(behind.hp).toBe(1000);
  });

  it('holds fire with nothing in its column', () => {
    const state = campaign({ weapon: 'rail' });
    target(state, 4, 10);
    for (let i = 0; i < 60; i++) stepRun(state, EMPTY_INPUT);
    expect(state.projectiles.some(p => p.friendly)).toBe(false);
  });

  it('breaks a hunter shield at 1.5 times its damage; the rest reaches the hull normally', () => {
    const enemy = { hunter: { key: 0, shield: 30, perCharge: 10, vx: 0, vs: 0, tx: 0, ts: 0, retarget: 0, waypoint: 0 } } as Enemy;
    // 30 shield takes 20 of a 40 hit (×1.5); the other 20 reach the hull.
    expect(absorbHunterShield(enemy, 40, 'rail')).toBeCloseTo(20, 9);
    expect(enemy.hunter!.shield).toBe(0);
  });

  it('fires one slug every 0.5 s, every 1/3 s, then twin slugs every 0.45 s', () => {
    const times = (rank: number) => {
      const state = campaign({ weapon: 'rail', rank });
      target(state, 0, 16, { hp: 1e9, maxHp: 1e9, radius: 2 });
      const out: { tick: number; muzzles: number[] }[] = [];
      for (let i = 0; i < 120; i++) {
        const id = state.nextId;
        stepRun(state, EMPTY_INPUT);
        const shots = state.projectiles.filter(p => p.friendly && p.id >= id);
        if (shots.length) out.push({ tick: state.tick, muzzles: shots.map(p => p.previousX) });
      }
      return out;
    };
    const gaps = (rank: number) => { const t = times(rank).map(e => e.tick); return t.slice(1).map((tick, i) => tick - t[i]); };
    expect(new Set(gaps(0))).toEqual(new Set([30]));
    expect(new Set(gaps(1))).toEqual(new Set([20]));
    expect(new Set(gaps(2))).toEqual(new Set([27]));
    expect(times(2)[0].muzzles).toEqual([-.3, .3]);
  });

  it('an endless pickup equips it at the current tier, and duplicates advance it', () => {
    const state = createRun({ mode: 'endless', seed: 1 });
    state.player.power = 2;
    const collect = () => { state.pickups.push({ id: state.nextId++, kind: 'weapon', weapon: 'rail', x: state.player.x, s: .1, value: 1, ttl: 5 }); stepRun(state, EMPTY_INPUT); };
    collect();
    expect(state.player).toMatchObject({ weapon: 'rail', power: 2 });
    collect();
    expect(state.player.powerCells).toBe(1);
    collect();
    expect(state.player.power).toBe(3);
  });
});

describe('Orbital Strike (docs/42)', () => {
  const orbital = SPECIALS['orbital-strike'];
  /** Calls the strike and holds main fire, so only the strike acts. */
  const activate = (state: RunState) => { state.nextVolleyAt = Infinity; stepRun(state, { ...EMPTY_INPUT, specialPressed: true }); };
  const run = (state: RunState, seconds: number, pinned: Enemy[] = []) => {
    const at = pinned.map(e => [e.x, e.s] as const);
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT);
      pinned.forEach((e, k) => { [e.x, e.s] = at[k]; });
    }
  };
  const hostile = (state: RunState, x: number, s: number) => {
    const shot = { id: state.nextId++, x, s, previousX: x, previousS: s, vx: 0, vs: -.5, friendly: false, damage: 1, radius: .1, ttl: 30 };
    state.projectiles.push(shot); return shot;
  };

  it('costs 600 and 2 parts, recharges in 60 s and sweeps the whole map in 1.75 s (user, 14-15 November)', () => {
    expect([orbital.price, orbital.parts, orbital.recharge, orbital.sweep]).toEqual([600, 2, 60, 1.75]);
    const prices = Object.values(SPECIALS).map(special => special.price);
    expect(orbital.price).toBe(Math.max(...prices));
  });

  it('destroys every enemy across the whole map, in view or not, armour and shields included, and leaves their shots', () => {
    const state = campaign({ special: 'orbital-strike' });
    const plain = target(state, -4, 6), relic = target(state, 0, 12, { hp: 190, maxHp: 190 }, 'relic');
    const ace = target(state, 4, 15, { hunter: { key: 1, shield: 9999, perCharge: 100, vx: 0, vs: 0, tx: 4, ts: 15, retarget: Infinity, waypoint: 0 } }, 'dart');
    // Off screen at either map edge (user, 15 November: "it should still hit it all").
    const east = target(state, 11, 6), west = target(state, -11, 9);
    const shots = [hostile(state, -3, 8), hostile(state, 3, 10)];
    activate(state);
    run(state, orbitalDuration() + .1, [plain, relic, ace, east, west]);
    expect([plain, relic, ace, east, west].every(enemy => enemy.hp <= 0)).toBe(true);
    for (const shot of shots) expect(state.projectiles).toContain(shot);
    expect(state.orbital).toBeNull();
  });

  it('sweeps from the map edge nearer the view to the other ("from the closer side towards the other")', () => {
    for (const cameraX of [-4, 4]) {
      const state = campaign({ special: 'orbital-strike' });
      state.cameraX = state.player.x = cameraX;
      const left = target(state, -5, 8), right = target(state, 5, 8);
      activate(state);
      expect(state.orbital!.direction).toBe(cameraX < 0 ? 1 : -1);
      const [first, second] = cameraX < 0 ? [left, right] : [right, left];
      let order = false;
      const steps = Math.round(orbitalDuration() / STEP) + 2;
      for (let i = 0; i < steps; i++) {
        run(state, STEP, [left, right]);
        if (first.hp <= 0 && second.hp > 0) order = true;
      }
      expect(order, `camera ${cameraX}`).toBe(true);
      expect(second.hp).toBeLessThanOrEqual(0);
    }
  });

  it("takes a boss target's share of its current stage, never more, and never kills it outright", () => {
    const state = campaign({ special: 'orbital-strike' });
    const pod = target(state, -2, 10, { bossPart: 'left', hp: 1000, maxHp: 1000 });
    activate(state);
    run(state, orbitalDuration() + .1, [pod]);
    expect(1000 - pod.hp).toBeCloseTo(orbital.bossShare * 1000, 6);
  });

  it('never moves the ship or changes its protection', () => {
    const state = campaign({ special: 'orbital-strike' });
    const before = { x: state.player.x, shields: state.player.shields, lives: state.player.lives, invulnerableUntil: state.player.invulnerableUntil };
    activate(state);
    expect({ x: state.player.x, shields: state.player.shields, lives: state.player.lives, invulnerableUntil: state.player.invulnerableUntil }).toEqual(before);
  });
});

describe('Siege Lance burns shots (docs/42)', () => {
  it('destroys hostile shots in its lane ahead of the ship, and only there', () => {
    const state = campaign({ special: 'siege-lance' });
    const shot = (x: number, s: number) => {
      const p = { id: state.nextId++, x, s, previousX: x, previousS: s, vx: 0, vs: -.2, friendly: false, damage: 1, radius: .1, ttl: 30 };
      state.projectiles.push(p); return p;
    };
    const inLane = [shot(0, 4), shot(.3, 12), shot(-.4, 18)], aside = shot(1.5, 6);
    state.nextVolleyAt = Infinity; stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    for (const p of inLane) expect(state.projectiles).not.toContain(p);
    expect(state.projectiles).toContain(aside);
    // While it lasts, a shot entering the lane burns too.
    const late = shot(0, 10);
    state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).not.toContain(late);
  });
});
