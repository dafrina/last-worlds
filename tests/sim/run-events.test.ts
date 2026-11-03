import { describe, expect, it } from 'vitest';
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { REWARDS } from '../../src/content/equipment';
import { bossParts, BOSSES } from '../../src/content/bosses';
import { bossTarget, resolveBossPhase, startBoss } from '../../src/sim/bastion';
import { EMPTY_INPUT, STEP, type Projectile, type RunConfig, type RunEvent, type RunState } from '../../src/shared/contracts';
import { fly, perfectPilot, type Pilot } from './pilots';

/*
 * The observation hook (docs/35, src/sim/events.ts): runs append what happened to `RunState.events` for the campaign's
 * missions. It must never change a run, and each event must say exactly what caused it.
 */

const pressing = (pilot: Pilot): Pilot => state => ({ ...pilot(state), specialPressed: state.player.specialCharge >= 1 });
const kills = (events: readonly RunEvent[]) => events.filter((e): e is Extract<RunEvent, { type: 'kill' }> => e.type === 'kill');

function flyBoth(config: RunConfig) {
  const plain = createRun(config), observed = createRun(config);
  observed.events = [];
  fly(plain, pressing(perfectPilot()), 480);
  fly(observed, pressing(perfectPilot()), 480);
  return { plain, observed };
}

describe('run events never change the run', () => {
  it.each([
    ['Training, Twin Pulse, Shockwave', { mode: 'campaign', seed: 5, mission: 'training', difficulty: 'standard' }],
    ['Final Horizon, Spectre, Seeker Array and Seeker Rack', { mode: 'campaign', seed: 3, mission: 'final-horizon', difficulty: 'veteran', ship: 'spectre', weapon: 'seeker', special: 'seeker-rack', rank: 2 }],
  ] as const)('%s: the observed run ends exactly as the unobserved one', (_name, config) => {
    const { plain, observed } = flyBoth(config as RunConfig);
    const events = observed.events!;
    delete observed.events;
    expect(observed).toEqual(plain);
    expect(kills(events)).toHaveLength(plain.kills);
    expect(events.filter(e => e.type === 'special')).toHaveLength(plain.specialsUsed);
  }, 60_000);
});

describe('what each event says', () => {
  it('a Seeker Rack special\'s kills are special kills, never the Seeker Array\'s', () => {
    const state = createRun({ mode: 'campaign', seed: 11, mission: 'deep-bloom', difficulty: 'standard', weapon: 'seeker', special: 'seeker-rack', rank: 2 });
    state.events = [];
    fly(state, pressing(perfectPilot()), 480);
    const all = kills(state.events);
    const special = all.filter(k => k.cause === 'special'), main = all.filter(k => k.cause === 'main');
    expect(special.length).toBeGreaterThan(0);
    expect(main.length).toBeGreaterThan(0);
    for (const k of special) { expect(k.special).toBe('seeker-rack'); expect(k.weapon).toBeUndefined(); }
    for (const k of main) expect(k.weapon).toBe('seeker');
    // Nacre's mire: most airborne kills are over open water.
    expect(all.filter(k => !k.ground && !k.bossPart && k.water).length).toBeGreaterThan(10);
    // THE VEIL's pod waves are tagged with their boss.
    expect(all.filter(k => k.launchedBy === 'veil').length).toBeGreaterThan(0);
  }, 30_000);

  it('a Spectre\'s Gravitic Shield return is a reflected kill', () => {
    const state = createRun({ mode: 'campaign', ship: 'spectre', seed: 41 });
    state.nextEncounterAt = state.nextVolleyAt = Infinity;
    state.events = [];
    const shot: Projectile = { id: state.nextId++, x: .8, s: .1, previousX: .8, previousS: .1, vx: 0, vs: -18, friendly: false, damage: 1, radius: .1, ttl: 4 };
    state.projectiles.push(shot);
    state.enemies.push({ id: state.nextId++, kind: 'dart', x: 0, s: 5, originX: 0, hp: 6, maxHp: 6, radius: .4, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 3 });
    for (let t = 0; t < 1.2; t += STEP) stepRun(state, EMPTY_INPUT);
    expect(state.kills).toBe(1);
    expect(kills(state.events)).toEqual([expect.objectContaining({ cause: 'reflected', kind: 'dart', ground: false })]);
  });

  it('hits are reported only when registered: shield or hull, never inside invulnerability', () => {
    const state = createRun({ mode: 'campaign', seed: 2 });
    state.events = [];
    hitPlayer(state, 1);
    hitPlayer(state, 1); // still invulnerable from the first
    state.time += 5; state.player.shields = 0;
    hitPlayer(state, 1);
    expect(state.events.filter(e => e.type === 'hit')).toEqual([
      { type: 'hit', time: 0, shield: true },
      { type: 'hit', time: 5, shield: false },
    ]);
  });

  it('coins are only credit pickups: the boss reward and a full shield cell\'s credits are not', () => {
    const state = createRun({ mode: 'campaign', seed: 2, mission: 'training' });
    state.nextEncounterAt = state.nextVolleyAt = Infinity;
    state.events = [];
    state.pickups.push({ id: state.nextId++, kind: 'credit', x: 0, s: 0, value: 8, ttl: 5 });
    state.player.shields = state.player.maxShields;
    state.pickups.push({ id: state.nextId++, kind: 'shield', x: 0, s: 0, value: 1, ttl: 5 });
    stepRun(state, EMPTY_INPUT);
    const pickedAt = state.time;
    startBoss(state);
    for (let t = 0; t < BOSSES.warden.arrivalDuration + .1; t += STEP) stepRun(state, EMPTY_INPUT);
    for (const part of bossParts(BOSSES.warden)) { const target = bossTarget(state, part)!; target.hp = 0; }
    resolveBossPhase(state); resolveBossPhase(state);
    expect(state.boss!.phase).toBe('destroyed');
    expect(state.credits).toBe(8 + 5 + REWARDS.boss);
    expect(state.events.filter(e => e.type === 'credits')).toEqual([{ type: 'credits', time: pickedAt, value: 8 }]);
    expect(state.events.filter(e => e.type === 'boss').map(e => (e as { phase: string }).phase)).toEqual(['arrival', 'batteries', 'core', 'destroyed']);
  });

  it('a full run reports the boss\'s phases in order, its sites and, on Umbra, Wraith volleys', () => {
    const state: RunState = createRun({ mode: 'campaign', seed: 4, mission: 'final-horizon', difficulty: 'standard', rank: 2 });
    state.events = [];
    fly(state, perfectPilot(), 480);
    expect(state.phase).toBe('complete');
    expect(state.events.filter(e => e.type === 'boss').map(e => (e as { phase: string }).phase)).toEqual(['arrival', 'batteries', 'core', 'overload', 'destroyed']);
    expect(state.events.filter(e => e.type === 'site')).toHaveLength(state.sites!.destroyed);
    expect(state.events.filter(e => e.type === 'wraith').length).toBeGreaterThan(0);
    expect(kills(state.events).filter(k => k.kind === 'wraith').length).toBeGreaterThan(0);
  }, 30_000);
});
