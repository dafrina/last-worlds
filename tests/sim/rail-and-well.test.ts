import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/content/balance';
import { SPECIALS } from '../../src/content/equipment';
import { FORMATIONS } from '../../src/content/formations';
import { EMPTY_INPUT, STEP, type Enemy, type EnemyKind, type RunConfig, type RunState } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { absorbHunterShield } from '../../src/sim/hunters';
import { memberPosition, trackAfter } from '../../src/sim/motion';

// docs/32: the Rail Driver (a piercing straight main weapon) and the Gravity Well (a special).
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

  it('an endless pickup equips it at tier one, and another raises its tier', () => {
    const state = createRun({ mode: 'endless', seed: 1 });
    state.player.power = 2;
    const collect = () => { state.pickups.push({ id: state.nextId++, kind: 'weapon', weapon: 'rail', x: state.player.x, s: .1, value: 1, ttl: 5 }); stepRun(state, EMPTY_INPUT); };
    collect();
    expect(state.player).toMatchObject({ weapon: 'rail', power: 0 });
    collect();
    expect(state.player.power).toBe(1);
  });
});

describe('Gravity Well', () => {
  const well = SPECIALS['gravity-well'];
  /** Activates the well and holds main fire, so only the well acts. */
  const activate = (state: RunState) => { state.nextVolleyAt = Infinity; stepRun(state, { ...EMPTY_INPUT, specialPressed: true }); };
  /** Steps with main fire held; `pinned` targets are put back each step (the legacy fixtures otherwise fly their motion). */
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

  it('removes hostile shots that come within reach and never bends any other shot', () => {
    const state = campaign({ special: 'gravity-well' });
    activate(state);
    run(state, well.arm);
    const inside = hostile(state, 0, well.ahead + 1), outside = hostile(state, 5, well.ahead);
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).not.toContain(inside);
    expect(state.projectiles).toContain(outside);
    expect([outside.vx, outside.vs]).toEqual([0, -.5]);
    expect(state.well!.swallowed).toBe(1);
  });

  it('drags free air craft, but never ground targets, boss parts or a craft winding up', () => {
    const state = campaign({ special: 'gravity-well' });
    const air = target(state, 2.5, well.ahead, {}, 'dart'), ground = target(state, -2.5, well.ahead);
    const part = target(state, 0, well.ahead + 3, { bossPart: 'left' }), windup = target(state, 2.5, well.ahead + 2, { warning: 99, nextAttack: Infinity }, 'dart');
    // Neutralise authored flight so only the well moves anything.
    const stay = () => { for (const e of [air, windup]) e.s = e === air ? well.ahead : well.ahead + 2; };
    activate(state);
    for (let i = 0; i < 60; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); stay(); }
    expect(air.x).toBeLessThan(2.5);
    expect(air.pull?.x).toBeLessThan(0);
    expect(ground.x).toBe(-2.5);
    expect([part.x, part.s]).toEqual([0, well.ahead + 3]);
    expect(windup.x).toBe(2.5);
  });

  it('keeps a formation craft\'s drag as an offset on its authored path', () => {
    const template = Object.keys(FORMATIONS)[0];
    const formation = { template, slot: 0, anchorX: 0, mirror: 1 as const, group: 1 };
    const enemy = { kind: 'dart', age: 1, formation, pull: { x: .7, s: -.4 } } as Enemy;
    const path = memberPosition(formation, 1.5), moved = trackAfter(enemy, .5);
    expect(moved.x).toBeCloseTo(path.x + .7, 9);
    expect(moved.s).toBeCloseTo(path.s - .4, 9);
  });

  it('burns its core, then collapses once with falloff, and clears itself', () => {
    const state = campaign({ special: 'gravity-well' });
    const centre = target(state, 0, well.ahead), edge = target(state, 3.2, well.ahead);
    activate(state);
    run(state, well.arm + well.duration + .2, [centre, edge]);
    expect(state.well).toBeNull();
    // Edge: 2.6 from the centre to its body, outside the core: collapse only, at 1 − 0.5 × 2.6 / 3 of full (it scrolls
    // 0.08 within the collapse step, hence ±0.5).
    expect(1000 - edge.hp).toBeCloseTo(well.collapse * (1 - (1 - well.collapseEdge) * 2.6 / well.collapseRadius), 0);
    expect(Math.abs(1000 - centre.hp - (well.dps * well.duration + well.collapse))).toBeLessThanOrEqual(well.dps * STEP * 2 + 1e-6);
  });

  it('a craft in its core starts no attack', () => {
    const state = campaign({ special: 'gravity-well' });
    const caught = target(state, 0, well.ahead, {}, 'dart');
    activate(state);
    caught.s = well.ahead;
    run(state, well.arm, [caught]);
    caught.nextAttack = 0;
    for (let i = 0; i < 60; i++) { run(state, STEP, [caught]); expect(caught.warning).toBe(0); }
    // Out of the core, the same craft attacks again.
    state.well = null;
    run(state, .1, [caught]);
    expect(caught.warning).toBeGreaterThan(0);
  });

  it('never moves the ship or changes its protection', () => {
    const state = campaign({ special: 'gravity-well' });
    const before = { x: state.player.x, shields: state.player.shields, lives: state.player.lives, invulnerableUntil: state.player.invulnerableUntil };
    activate(state);
    expect({ x: state.player.x, shields: state.player.shields, lives: state.player.lives, invulnerableUntil: state.player.invulnerableUntil }).toEqual(before);
    expect(state.well).toMatchObject({ x: 0, s: well.ahead });
  });
});
