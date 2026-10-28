import { describe, it, expect } from 'vitest';
import { BALANCE, WEAPONS } from '../../src/content/balance';
import { EMPTY_INPUT, STEP, type RunState, type WeaponId, type Pickup } from '../../src/shared/contracts';
import { createRun, stepRun, hitPlayer } from '../../src/sim/game';

function arena(weapon: WeaponId = 'pulse', rank = 0, endless = false) {
  const state = createRun({ mode: endless ? 'endless' : 'campaign', seed: 7, weapon, rank });
  if (endless) { state.player.weapon = weapon; state.player.power = rank; }
  state.nextEncounterAt = Infinity;
  state.player.invulnerableUntil = Infinity;
  state.enemies.push({ id: state.nextId++, kind: 'turret', x: 0, s: 16, originX: 0, hp: 1e6, maxHp: 1e6, radius: 2, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 0 });
  return state;
}
function emissions(state: RunState, seconds: number) {
  const out: { time: number; count: number; muzzle: number[]; damage: number[] }[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const id = state.nextId;
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(p => p.friendly && p.id >= id);
    if (shots.length) out.push({ time: state.time, count: shots.length, muzzle: shots.map(p => p.previousX), damage: shots.map(p => p.damage) });
  }
  return out;
}
function collect(state: RunState, kind: Pickup['kind'], weapon?: WeaponId) {
  state.pickups.push({ id: state.nextId++, kind, weapon, x: state.player.x, s: .1, value: 1, ttl: 5 });
  stepRun(state, EMPTY_INPUT);
}

describe('shared three-tier weapons', () => {
  it.each(['pulse', 'fan', 'seeker', 'rail'] as const)('%s uses identical patterns and fixed projectile damage in both modes', weapon => {
    for (const rank of [0, 1, 2]) {
      const campaign = emissions(arena(weapon, rank), 1), endless = emissions(arena(weapon, rank, true), 1);
      expect(endless).toEqual(campaign);
      expect(campaign.flatMap(e => e.damage).every(d => d === WEAPONS[weapon].damage)).toBe(true);
    }
  });
  it('Pulse progresses from twins to faster twins to four successive bolts', () => {
    const base = emissions(arena('pulse'), .5), fast = emissions(arena('pulse', 1), .5), burst = emissions(arena('pulse', 2), .12);
    expect(base.every(e => e.count === 2)).toBe(true);
    expect(fast.length).toBeGreaterThan(base.length);
    expect(burst.map(e => e.count)).toEqual([1, 1, 1, 1]);
    expect(burst.flatMap(e => e.muzzle)).toEqual([-.2, .2, -.2, .2]);
  });
  it('Scatter goes from five to nine pellets, then faster nine-pellet volleys', () => {
    expect(emissions(arena('fan'), .1)[0].count).toBe(5);
    expect(emissions(arena('fan', 1), .1)[0].count).toBe(9);
    expect(emissions(arena('fan', 2), 1).length).toBeGreaterThan(emissions(arena('fan', 1), 1).length);
  });
  it('Seeker alternates singles, then pairs, then four successive missiles', () => {
    expect(emissions(arena('seeker'), .4).flatMap(e => e.muzzle)).toEqual([-.23, .23]);
    expect(emissions(arena('seeker', 1), .1)[0].muzzle).toEqual([-.23, .23]);
    expect(emissions(arena('seeker', 2), .4).flatMap(e => e.muzzle)).toEqual([-.23, .23, -.23, .23]);
  });
  it('successive shots follow the current hero position, stop without a target, and pause cleanly', () => {
    const state = arena('pulse', 2);
    stepRun(state, EMPTY_INPUT);
    state.player.x = 1;
    const id = state.nextId;
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles.find(p => p.id >= id && p.friendly)?.previousX).toBeCloseTo(1.2);
    state.enemies = [];
    const next = state.nextId;
    stepRun(state, EMPTY_INPUT);
    expect(state.nextId).toBe(next);
    state.phase = 'paused';
    const frozen = structuredClone(state);
    stepRun(state, EMPTY_INPUT);
    expect(state).toEqual(frozen);
  });
  it('does not emit a partial fan or advance the sequence when the projectile pool is full', () => {
    const state = arena('fan', 1);
    state.projectiles = Array.from({ length: BALANCE.maxProjectiles - 8 }, () => ({ id: state.nextId++, x: 10, s: 0, previousX: 10, previousS: 0, vx: 0, vs: 0, friendly: true, damage: 1, radius: .1, ttl: 2 }));
    const id = state.nextId;
    stepRun(state, EMPTY_INPUT);
    expect(state.nextId).toBe(id);
    expect(state.nextVolleyAt).toBe(0);
    state.projectiles = [];
    stepRun(state, EMPTY_INPUT);
    expect(state.projectiles).toHaveLength(9);
  });
  it('upgrade and duplicate-weapon pickups advance tiers; changing weapons always resets to tier one', () => {
    const state = arena('pulse', 0, true); state.nextVolleyAt = Infinity;
    collect(state, 'power'); expect(state.player.power).toBe(1);
    collect(state, 'weapon', 'pulse'); expect(state.player.power).toBe(2);
    collect(state, 'power'); expect(state.player.power).toBe(2);
    collect(state, 'weapon', 'fan'); expect(state.player).toMatchObject({ weapon: 'fan', power: 0 });
    collect(state, 'power'); expect(state.player.power).toBe(1);
    collect(state, 'weapon', 'pulse'); expect(state.player).toMatchObject({ weapon: 'pulse', power: 0 });
    const campaign = arena('pulse', 1); collect(campaign, 'power'); collect(campaign, 'weapon', 'fan');
    expect(campaign.player).toMatchObject({ weapon: 'pulse', power: 1 });
  });
  it('default shields collect to five in either mode but never regenerate after a life loss', () => {
    for (const endless of [true, false]) {
      const state = arena('pulse', 0, endless); state.nextVolleyAt = Infinity;
      expect(state.player.shields).toBe(3);
      for (let i = 0; i < 5; i++) collect(state, 'shield');
      expect(state.player.shields).toBe(5);
      state.player.shields = 0; state.player.invulnerableUntil = 0; hitPlayer(state, 1);
      expect(state.player.shields).toBe(0);
      emissions(state, 1); expect(state.player.shields).toBe(0);
    }
  });
});

describe('campaign chassis perks', () => {
  it('adds one reserve life over the selected difficulty baseline, never to endless', () => {
    for (const difficulty of ['relaxed', 'standard', 'veteran'] as const) {
      const base = createRun({ mode: 'campaign', difficulty, seed: 1 });
      expect(createRun({ mode: 'campaign', difficulty, ship: 'ironclad', seed: 1 }).player.lives).toBe(base.player.lives + 1);
    }
    expect(createRun({ mode: 'endless', ship: 'ironclad', rank: 2, shield: 'aegis', seed: 1 })).toEqual(createRun({ mode: 'endless', seed: 1 }));
  });
  it('Scrapper attracts distant pickups only in campaign', () => {
    const a = arena(), b = arena('pulse', 0, true);
    for (const state of [a, b]) { state.pickups.push({ id: state.nextId++, kind: 'credit', x: 2, s: .1, value: 5, ttl: 5 }); stepRun(state, EMPTY_INPUT); }
    expect(a.pickups[0].x).toBeLessThan(2); expect(b.pickups[0].x).toBe(2);
  });
  it('Interceptor increases bounded main-kill recharge, not passive recharge or special kills', () => {
    for (const ship of ['scrapper', 'interceptor'] as const) {
      const state = arena(); state.config.ship = ship; state.player.specialCharge = 0; state.nextVolleyAt = Infinity;
      state.enemies[0].hp = 1;
      state.projectiles.push({ id: state.nextId++, x: 0, s: 15, previousX: 0, previousS: 15, vx: 0, vs: 120, friendly: true, damage: 6, weapon: 'pulse', radius: .1, ttl: 1 });
      stepRun(state, EMPTY_INPUT);
      expect(state.player.specialCharge).toBeCloseTo((ship === 'interceptor' ? .045 : .03) + STEP / 45);
    }
  });
  it('Spectre briefly boosts firing cadence after a special without changing shot damage', () => {
    const state = arena(); state.config.ship = 'spectre';
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    expect(state.overdriveUntil).toBeCloseTo(state.time + 3);
    expect(state.nextVolleyAt - state.time).toBeCloseTo(WEAPONS.pulse.cadence / 1.25);
    expect(state.projectiles.filter(p => p.friendly).every(p => p.damage === WEAPONS.pulse.damage)).toBe(true);
    state.time = state.overdriveUntil! + 1; state.nextVolleyAt = 0;
    stepRun(state, EMPTY_INPUT);
    expect(state.nextVolleyAt - state.time).toBeCloseTo(WEAPONS.pulse.cadence);
  });
});
