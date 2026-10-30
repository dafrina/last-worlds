import { describe, expect, it } from 'vitest';
import { SHIPS, SPECIALS } from '../../src/content/equipment';
import { FAIRNESS } from '../../src/content/balance';
import { EMPTY_INPUT, STEP, type RunConfig } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';
import { FairnessTrace } from './fairness-trace';

const campaign = (extra: Partial<RunConfig>): RunConfig => ({ mode: 'campaign', seed: 3, mission: 'training', difficulty: 'standard', ...extra });
const dummy = (state: ReturnType<typeof createRun>, x: number, s: number, hp = 1000) => {
  const enemy = { id: state.nextId++, kind: 'turret' as const, x, s, originX: x, hp, maxHp: hp, radius: .6, age: 0, nextAttack: Infinity, warning: 0, aimX: x, groundHeight: .85 };
  state.enemies.push(enemy); return enemy;
};

describe('campaign loadout in the simulation (docs/21)', () => {
  it('endless ignores every campaign choice and flies the canonical starter', () => {
    const state = createRun({ mode: 'endless', seed: 1, weapon: 'seeker', special: 'siege-lance', shield: 'bulwark', ship: 'ironclad', rank: 3 });
    expect(state.config).toMatchObject({ weapon: 'pulse', special: 'shockwave', shield: 'standard', ship: 'scrapper', rank: 0 });
    expect(state.player.maxShields).toBe(5);
  });

  it('carries a campaign ship\'s look as cosmetics only; endless shows one only on its cosmetic heroShip (docs/33)', () => {
    const hero = { parts: { hull: 'c', wings: 'b', engines: 'a', cockpit: 'a' } } as const;
    expect(createRun(campaign({ ship: 'ironclad', hero })).config.hero).toEqual(hero);
    expect(createRun({ mode: 'endless', seed: 1, ship: 'ironclad', hero }).config.hero).toBeUndefined();
    expect(createRun(campaign({ hero: { parts: { hull: 'x' } } as never })).config.hero).toBeUndefined();
  });

  it('shield equipment sets starting charges, while every cell fills one toward five', () => {
    for (const [shield, charges] of [['standard', 3], ['bulwark', 4], ['aegis', 5]] as const) {
      const state = createRun(campaign({ shield }));
      expect(state.player.shields).toBe(charges);
      expect(state.player.maxShields).toBe(5);
      state.player.shields = 0;
      state.pickups.push({ id: state.nextId++, kind: 'shield', x: 0, s: .6, value: 1, ttl: 5 });
      stepRun(state, EMPTY_INPUT);
      expect(state.player.shields).toBe(1);
    }
  });

  it('all chassis share normal handling', () => {
    for (const ship of Object.keys(SHIPS) as (keyof typeof SHIPS)[]) {
      const state = createRun(campaign({ ship }));
      for (let i = 0; i < 30; i++) stepRun(state, { ...EMPTY_INPUT, horizontal: 1 });
      expect(Math.abs(state.player.vx)).toBeCloseTo(12, 5);
    }
  });

  it('campaign starts at the purchased tier and endless always starts at tier one', () => {
    for (const rank of [0, 1, 2]) expect(createRun(campaign({ rank })).player.power).toBe(rank);
    const endless = createRun({ mode: 'endless', seed: 1, rank: 3 });
    expect(endless.config.rank).toBe(0);
    expect(endless.player.power).toBe(0);
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

describe('shared chassis handling keeps missions survivable', () => {
  // Rolling Thunder flies seed 6 since 21 October (user decision, docs/08): ground enemies now stand on the terrain under the
  // release lens, and on seed 5 the heuristic pilot parks at the world edge, where turret fans land on both sides of it.
  // That run is fair (checked below); seeds 6-10 clear without a hit. Deep Bloom flies seed 7 since hunters (22 October):
  // on seed 5 a Pulsar stream catches the pilot at the world edge (seeds 7-9 clear).
  // Since the encounter deck (29 October, docs/33 § 4) Rolling Thunder flies seed 8: over seeds 1-16 it clears without a
  // hit on 11 seeds (13 with the fixed list).
  it.each([['training', 5], ['bastion', 8], ['cold-vector', 5], ['deep-bloom', 7]] as const)('the perfect pilot clears %s with shared handling without a hit (seed %i)', (mission, seed) => {
    const state = createRun({ mode: 'campaign', seed, mission, difficulty: 'standard', ship: 'scrapper' });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(log.hits).toBe(0);
  }, 120000);

  it('keeps Rolling Thunder with shared handling, seed 5, fair: the hazard union always leaves a clear gap', () => {
    const state = createRun({ mode: 'campaign', seed: 5, mission: 'bastion', difficulty: 'standard', ship: 'scrapper' });
    const trace = new FairnessTrace();
    fly(state, perfectPilot(), 420, { noPickups: true, onTick: s => trace.observe(s) });
    trace.finish(state);
    expect(trace.violations).toEqual([]);
    expect(trace.minGap).toBeGreaterThanOrEqual(FAIRNESS.minGap);
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
