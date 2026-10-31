import { describe, it, expect } from 'vitest';
import { BALANCE, WEAPONS } from '../../src/content/balance';
import { MAX_RANK } from '../../src/content/equipment';
import { EMPTY_INPUT, STEP, type RunState, type WeaponId, type Pickup, type Enemy } from '../../src/shared/contracts';
import { createRun, stepRun, hitPlayer } from '../../src/sim/game';

const WEAPON_LIST = ['pulse', 'fan', 'seeker', 'rail'] as const;
const TIERS = [0, 1, 2, 3, 4];

function arena(weapon: WeaponId = 'pulse', rank = 0, endless = false) {
  const state = createRun({ mode: endless ? 'endless' : 'campaign', seed: 7, weapon, rank });
  if (endless) { state.player.weapon = weapon; state.player.power = rank; }
  state.nextEncounterAt = Infinity;
  state.player.invulnerableUntil = Infinity;
  state.enemies.push({ id: state.nextId++, kind: 'turret', x: 0, s: 16, originX: 0, hp: 1e6, maxHp: 1e6, radius: 2, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 0 });
  return state;
}
interface Emission { tick: number; time: number; count: number; muzzle: number[]; damage: number[]; angle: number[]; speed: number[]; homing: boolean[]; piercing: boolean[] }
function emissions(state: RunState, seconds: number) {
  const out: Emission[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const id = state.nextId;
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(p => p.friendly && p.id >= id);
    if (shots.length) out.push({ tick: state.tick, time: state.time, count: shots.length, muzzle: shots.map(p => +p.previousX.toFixed(6)), damage: shots.map(p => p.damage),
      angle: shots.map(p => +(Math.atan2(p.vx, p.vs) * 180 / Math.PI).toFixed(6)), speed: shots.map(p => +Math.hypot(p.vx, p.vs).toFixed(6)),
      homing: shots.map(p => p.homingTargetId !== undefined), piercing: shots.map(p => Array.isArray(p.pierced)) });
  }
  return out;
}
/** Projectiles a second over a long window (20 s, the target held in place), so a partial cycle at either end hardly counts. */
function perSecond(weapon: WeaponId, rank: number) {
  const state = arena(weapon, rank), target = state.enemies[0];
  let fired = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const id = state.nextId;
    target.s = 16; target.x = state.player.x;
    stepRun(state, EMPTY_INPUT);
    fired += state.projectiles.filter(p => p.friendly && p.id >= id).length;
  }
  return fired / 20;
}
/** Ticks between successive emissions. */
const gaps = (list: readonly Emission[]) => list.slice(1).map((e, i) => e.tick - list[i].tick);
function collect(state: RunState, kind: Pickup['kind'], weapon?: WeaponId) {
  state.pickups.push({ id: state.nextId++, kind, weapon, x: state.player.x, s: .1, value: 1, ttl: 5 });
  stepRun(state, EMPTY_INPUT);
}

describe('shared five-tier weapons (docs/30)', () => {
  it.each(WEAPON_LIST)('%s uses identical patterns and fixed projectile damage in both modes at every tier', weapon => {
    expect(MAX_RANK).toBe(4);
    for (const rank of TIERS) {
      const campaign = emissions(arena(weapon, rank), 1), endless = emissions(arena(weapon, rank, true), 1);
      expect(endless).toEqual(campaign);
      expect(campaign.flatMap(e => e.damage).every(d => d === WEAPONS[weapon].damage)).toBe(true);
    }
  });

  it.each(WEAPON_LIST)('%s stays in its family at every tier (invariant 2)', weapon => {
    for (const rank of TIERS) {
      const fired = emissions(arena(weapon, rank), 2);
      expect(fired.length, `tier ${rank + 1}`).toBeGreaterThan(0);
      for (const e of fired) {
        // Only the Seeker homes, and only the Rail Driver pierces.
        expect(e.homing.every(h => h === (weapon === 'seeker'))).toBe(true);
        expect(e.piercing.every(p => p === (weapon === 'rail'))).toBe(true);
        // Twin Pulse and Rail Driver fire straight ahead in parallel lines.
        if (weapon === 'pulse' || weapon === 'rail') expect(e.angle.every(a => a === 0)).toBe(true);
        // Fan Cannon: one fixed, evenly spaced fan over ±12° from the ship's nose.
        if (weapon === 'fan') {
          const angles = [...e.angle].sort((a, b) => a - b), step = 24 / (angles.length - 1);
          expect(angles[0]).toBeCloseTo(-12, 6); expect(angles.at(-1)).toBeCloseTo(12, 6);
          angles.forEach((a, i) => expect(a).toBeCloseTo(-12 + i * step, 6));
          expect(e.muzzle.every(x => x === 0)).toBe(true);
        }
      }
    }
  });

  it.each([['pulse', 4], ['fan', 9], ['seeker', 4], ['rail', 2]] as const)(
    '%s: tier 4 fires tier 3\'s volley about 1.35 times as often; tier 5 two more projectiles a volley, about 1.6-1.7 times as often', (weapon, volley) => {
      const [three, four, five] = [2, 3, 4].map(rank => perSecond(weapon, rank));
      expect(four / three).toBeGreaterThan(1.3); expect(four / three).toBeLessThan(1.45);
      // Volleys a second at tier 5 against tier 3, each tier-5 volley carrying two more projectiles.
      const rate = five / ((volley + 2) / volley) / three;
      expect(rate).toBeGreaterThan(1.55); expect(rate).toBeLessThan(1.75);
    });

  it('Pulse progresses from twins to faster twins to four successive bolts, faster bursts, then four streams', () => {
    const base = emissions(arena('pulse'), .5), fast = emissions(arena('pulse', 1), .5), burst = emissions(arena('pulse', 2), .12);
    expect(base.every(e => e.count === 2)).toBe(true);
    expect(fast.length).toBeGreaterThan(base.length);
    expect(burst.map(e => e.count)).toEqual([1, 1, 1, 1]);
    expect(burst.flatMap(e => e.muzzle)).toEqual([-.2, .2, -.2, .2]);
    // Tier 4: the same burst, a new one every 6 ticks (8 at tier 3), shots 10% faster.
    const rapid = emissions(arena('pulse', 3), 1);
    expect(rapid.slice(0, 4).flatMap(e => e.muzzle)).toEqual([-.2, .2, -.2, .2]);
    expect(gaps(rapid).slice(0, 8)).toEqual([1, 1, 1, 3, 1, 1, 1, 3]);
    expect(rapid[0].speed[0]).toBeCloseTo(WEAPONS.pulse.speed * 1.1, 6);
    // Tier 5: two outer streams at ±0.55 join the inner pair: six bolts a burst, a burst every 5 ticks.
    const storm = emissions(arena('pulse', 4), 1);
    expect(storm.slice(0, 4).map(e => e.muzzle)).toEqual([[-.2, -.55], [.2, .55], [-.2], [.2]]);
    expect(gaps(storm).slice(0, 8)).toEqual([1, 1, 1, 2, 1, 1, 1, 2]);
    expect(storm[0].speed[0]).toBeCloseTo(WEAPONS.pulse.speed * 1.2, 6);
  });

  it('Scatter goes from five to nine pellets, faster nine-pellet volleys, then eleven over the same arc', () => {
    expect(emissions(arena('fan'), .1)[0].count).toBe(5);
    expect(emissions(arena('fan', 1), .1)[0].count).toBe(9);
    expect(emissions(arena('fan', 2), 1).length).toBeGreaterThan(emissions(arena('fan', 1), 1).length);
    const four = emissions(arena('fan', 3), 1);
    expect(four.every(e => e.count === 9)).toBe(true);
    expect(gaps(four).every(g => g === 10)).toBe(true);
    const five = emissions(arena('fan', 4), 1);
    expect(five.every(e => e.count === 11)).toBe(true);
    expect(gaps(five).slice(0, 4)).toEqual([8, 9, 8, 9]);
  });

  it('Seeker alternates singles, then pairs, four successive missiles, a faster four, then a six-missile salvo', () => {
    expect(emissions(arena('seeker'), .4).flatMap(e => e.muzzle)).toEqual([-.23, .23]);
    expect(emissions(arena('seeker', 1), .1)[0].muzzle).toEqual([-.23, .23]);
    expect(emissions(arena('seeker', 2), .4).flatMap(e => e.muzzle)).toEqual([-.23, .23, -.23, .23]);
    const four = emissions(arena('seeker', 3), 1);
    expect(four.slice(0, 4).flatMap(e => e.muzzle)).toEqual([-.23, .23, -.23, .23]);
    expect(gaps(four).slice(0, 4)).toEqual([4, 4, 4, 10]);
    const salvo = emissions(arena('seeker', 4), 1);
    expect(salvo.slice(0, 6).flatMap(e => e.muzzle)).toEqual([-.23, .23, -.23, .23, -.45, .45]);
    expect(gaps(salvo).slice(0, 6)).toEqual([2, 2, 2, 2, 2, 8]);
  });

  it('Rail Driver: twin slugs every 1/3 s at tier 4, then four parallel slugs that still pierce a column', () => {
    const four = emissions(arena('rail', 3), 1.2);
    expect(four.every(e => e.muzzle.join() === '-0.3,0.3')).toBe(true);
    expect(gaps(four).every(g => g === 20)).toBe(true);
    const five = emissions(arena('rail', 4), 1.2);
    expect(five.every(e => e.muzzle.join() === '-0.9,-0.3,0.3,0.9')).toBe(true);
    expect(gaps(five).every(g => g === 16)).toBe(true);
    // The outer slug carries through three darts in its line, each struck once.
    const state = arena('rail', 4); state.enemies = [];
    const column: Enemy[] = [6, 9, 12].map(s => ({ id: state.nextId++, kind: 'turret', x: .9, s, originX: .9, hp: 1000, maxHp: 1000, radius: .3, age: 0, nextAttack: Infinity, warning: 0, aimX: .9, groundHeight: 0 }));
    state.enemies.push(...column);
    for (let i = 0; i < 60 && !state.projectiles.some(p => p.friendly); i++) stepRun(state, EMPTY_INPUT);
    for (let i = 0; i < 40; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
    expect(column.map(e => e.hp)).toEqual([1, 2, 3].map(() => 1000 - WEAPONS.rail.damage));
  });

  it('successive shots follow the current hero position, stop without a target, and pause cleanly', () => {
    for (const rank of [2, 4]) {
      const state = arena('pulse', rank);
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
    }
  });

  it('does not emit a partial fan or advance the sequence when the projectile pool is full', () => {
    for (const [rank, pellets] of [[1, 9], [4, 11]]) {
      const state = arena('fan', rank);
      state.projectiles = Array.from({ length: BALANCE.maxProjectiles - pellets + 1 }, () => ({ id: state.nextId++, x: 10, s: 0, previousX: 10, previousS: 0, vx: 0, vs: 0, friendly: true, damage: 1, radius: .1, ttl: 2 }));
      const id = state.nextId;
      stepRun(state, EMPTY_INPUT);
      expect(state.nextId).toBe(id);
      expect(state.nextVolleyAt).toBe(0);
      state.projectiles = [];
      stepRun(state, EMPTY_INPUT);
      expect(state.projectiles).toHaveLength(pellets);
    }
  });

  it('upgrade and duplicate-weapon pickups advance tiers to tier 5; changing weapons always resets to tier one', () => {
    const state = arena('pulse', 0, true); state.nextVolleyAt = Infinity;
    collect(state, 'power'); expect(state.player.power).toBe(1);
    collect(state, 'weapon', 'pulse'); expect(state.player.power).toBe(2);
    collect(state, 'power'); expect(state.player.power).toBe(3);
    collect(state, 'power'); expect(state.player.power).toBe(4);
    expect(state.message).toBe('WEAPON TIER 5');
    // Capped at tier 5: a further cell or duplicate is worth 1,000 score.
    const score = state.score;
    collect(state, 'power'); expect(state.player.power).toBe(4);
    collect(state, 'weapon', 'pulse'); expect(state.player.power).toBe(4);
    expect(state.score).toBeGreaterThanOrEqual(score + 2000);
    collect(state, 'weapon', 'fan'); expect(state.player).toMatchObject({ weapon: 'fan', power: 0 });
    collect(state, 'power'); expect(state.player.power).toBe(1);
    collect(state, 'weapon', 'pulse'); expect(state.player).toMatchObject({ weapon: 'pulse', power: 0 });
    const campaign = arena('pulse', 1); collect(campaign, 'power'); collect(campaign, 'weapon', 'fan');
    expect(campaign.player).toMatchObject({ weapon: 'pulse', power: 1 });
    // A campaign launch flies its bought tier, up to tier 5 and never beyond.
    expect(createRun({ mode: 'campaign', seed: 1, weapon: 'rail', rank: 4 }).player.power).toBe(4);
    expect(createRun({ mode: 'campaign', seed: 1, weapon: 'rail', rank: 9 }).player.power).toBe(4);
    expect(createRun({ mode: 'endless', seed: 1, weapon: 'rail', rank: 4 }).player).toMatchObject({ weapon: 'pulse', power: 0 });
  });

  it('an endless life loss still costs one tier, from tier 5 too', () => {
    const state = arena('seeker', 4, true); state.nextVolleyAt = Infinity;
    state.player.shields = 0; state.player.invulnerableUntil = 0; hitPlayer(state, 1);
    expect(state.player.power).toBe(3);
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
