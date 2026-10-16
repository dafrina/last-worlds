import { describe, expect, it } from 'vitest';
import { REACTORS, SPECIALS, rankFireRate } from '../../src/content/equipment';
import { WEAPONS } from '../../src/content/balance';
import { EMPTY_INPUT, STEP, type RunConfig } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

const campaign = (extra: Partial<RunConfig>): RunConfig => ({ mode: 'campaign', seed: 3, mission: 'training', difficulty: 'standard', ...extra });
const dummy = (state: ReturnType<typeof createRun>, x: number, s: number, hp = 1000) => {
  const enemy = { id: state.nextId++, kind: 'turret' as const, x, s, originX: x, hp, maxHp: hp, radius: .6, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: .85 };
  state.enemies.push(enemy); return enemy;
};

describe('campaign loadout in the simulation (docs/21)', () => {
  it('endless ignores every campaign choice and flies the canonical starter', () => {
    const state = createRun({ mode: 'endless', seed: 1, weapon: 'seeker', special: 'siege-lance', shield: 'bulwark', reactor: 'vector', rank: 3 });
    expect(state.config).toMatchObject({ weapon: 'pulse', special: 'shockwave', shield: 'standard', reactor: 'balanced', rank: 0 });
    expect(state.player.maxShields).toBe(3);
  });

  it('shield technology sets the reserve and what a cell restores', () => {
    expect(createRun(campaign({ shield: 'bulwark' })).player.maxShields).toBe(4);
    const flux = createRun(campaign({ shield: 'flux' }));
    expect(flux.player.maxShields).toBe(2);
    flux.player.shields = 0;
    flux.pickups.push({ id: flux.nextId++, kind: 'shield', x: flux.player.x, s: .6, value: 1, ttl: 5 });
    stepRun(flux, EMPTY_INPUT);
    expect(flux.player.shields).toBe(2);
  });

  it('the reactor sets top speed in the campaign', () => {
    for (const reactor of ['balanced', 'vector', 'precision'] as const) {
      const state = createRun(campaign({ reactor }));
      for (let i = 0; i < 30; i++) stepRun(state, { ...EMPTY_INPUT, horizontal: 1 });
      expect(Math.abs(state.player.vx)).toBeCloseTo(REACTORS[reactor].speed, 5);
    }
  });

  it('main weapon rank raises the rate of fire up to double (campaign only)', () => {
    expect(rankFireRate(3)).toBe(2);
    for (const rank of [0, 3]) {
      const state = createRun(campaign({ weapon: 'pulse', rank }));
      dummy(state, 0, 8, 1e6);
      stepRun(state, EMPTY_INPUT);
      expect(state.nextVolleyAt - state.time).toBeCloseTo(WEAPONS.pulse.cadence / rankFireRate(rank) - STEP + STEP, 6);
    }
    const endless = createRun({ mode: 'endless', seed: 1, rank: 3 });
    expect(endless.config.rank).toBe(0);
  });

  it('each special recharges on its own time', () => {
    for (const special of ['shockwave', 'seeker-rack', 'siege-lance'] as const) {
      const state = createRun(campaign({ special }));
      state.player.specialCharge = 0;
      stepRun(state, EMPTY_INPUT);
      expect(state.player.specialCharge).toBeCloseTo(STEP / SPECIALS[special].recharge, 9);
    }
  });

  it('Seeker Rack launches eight homing missiles whose kills never charge the special', () => {
    const state = createRun(campaign({ special: 'seeker-rack' }));
    const target = dummy(state, 2, 9, 30);
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    const missiles = state.projectiles.filter(p => p.special);
    expect(missiles).toHaveLength(SPECIALS['seeker-rack'].missiles);
    expect(missiles.every(m => m.homingTargetId === target.id && m.damage === SPECIALS['seeker-rack'].damage)).toBe(true);
    for (let i = 0; i < 90 && target.hp > 0; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(state.player.specialCharge).toBeLessThan(.05);
  });

  it('Siege Lance burns targets in the lane over the ship for its duration, and only those', () => {
    const state = createRun(campaign({ special: 'siege-lance' }));
    const inLane = dummy(state, 0, 18), aside = dummy(state, 3, 18);
    state.nextVolleyAt = Infinity;
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    for (let i = 0; i < 200; i++) { state.nextVolleyAt = Infinity; stepRun(state, EMPTY_INPUT); }
    const lance = SPECIALS['siege-lance'];
    // dps × duration, within one simulation step.
    expect(Math.abs(1000 - inLane.hp - lance.dps * lance.duration)).toBeLessThanOrEqual(lance.dps * STEP + 1e-6);
    expect(aside.hp).toBe(1000);
    expect(state.lance).toBeNull();
  });
});

describe('slowest drive keeps every mission survivable (docs/02 §4)', () => {
  it.each(['training', 'bastion', 'cold-vector', 'deep-bloom'] as const)('the perfect pilot clears %s on Precision Drive without a hit', mission => {
    const state = createRun({ mode: 'campaign', seed: 5, mission, difficulty: 'standard', reactor: 'precision' });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(log.hits).toBe(0);
  }, 120000);
});

describe('fuel skids explode (user request, 16 October 2026)', () => {
  it('a burst skid blasts nearby targets, chains into other skids, and never hurts the player', () => {
    const state = createRun(campaign({}));
    const skid = (x: number, s: number) => { const e = dummy(state, x, s, 40); (e as { kind: string }).kind = 'fuel'; return e; };
    const first = skid(0, 12), second = skid(2.4, 12), farSkid = skid(6, 12);
    const turret = dummy(state, -2, 12.5, 100);
    const shields = state.player.shields;
    first.hp = 1;
    state.projectiles.push({ id: state.nextId++, x: 0, s: 11.5, previousX: 0, previousS: 11.5, vx: 0, vs: 20, friendly: true, damage: 5, radius: .1, ttl: 1 });
    state.nextVolleyAt = Infinity;
    stepRun(state, EMPTY_INPUT);
    expect(first.hp).toBeLessThanOrEqual(0);
    expect(second.hp).toBeLessThanOrEqual(0);
    expect(turret.hp).toBeLessThanOrEqual(0);
    expect(farSkid.hp).toBe(40);
    expect(state.effects.filter(effect => effect.kind === 'blast')).toHaveLength(2);
    expect(state.player.shields).toBe(shields);
  });
});
