import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/content/balance';
import { ENDLESS_TIER_CELLS, MAX_RANK, WEAPON_IDS } from '../../src/content/equipment';
import { EMPTY_INPUT, STEP, type Mode, type RunState, type WeaponId } from '../../src/shared/contracts';
import { createRun, hitPlayer, stepRun } from '../../src/sim/game';

const cases = WEAPON_IDS.flatMap(weapon => Array.from({ length: MAX_RANK + 1 }, (_, rank) => ({ weapon, rank, tier: rank + 1 })));
function arena(mode: Mode, weapon: WeaponId, rank: number) {
  const state = createRun({ mode, seed: 17, weapon, rank });
  state.player.weapon = weapon; state.player.power = rank; state.player.lives = 6;
  state.player.powerCells = rank === 2 || rank === 3 ? 1 : 0;
  state.nextEncounterAt = Infinity;
  state.enemies.push({ id: state.nextId++, kind: 'turret', x: 0, s: 16, originX: 0, hp: 1e9, maxHp: 1e9,
    radius: 2, age: 0, nextAttack: Infinity, warning: 0, aimX: 0, groundHeight: 0 });
  return state;
}

/** Compare emitted shots, not just tier numbers: cadence, muzzle pattern, speed, damage and special behavior. */
function fire(state: RunState, seconds: number) {
  const emissions: unknown[] = [];
  for (let frame = 0; frame < Math.ceil(seconds / STEP); frame++) {
    state.enemies[0].s = 16; state.enemies[0].x = state.player.x;
    const nextId = state.nextId;
    stepRun(state, EMPTY_INPUT);
    const shots = state.projectiles.filter(shot => shot.friendly && shot.id >= nextId);
    if (shots.length) emissions.push({ frame, shots: shots.map(shot => ({ x: shot.previousX, s: shot.previousS,
      vx: shot.vx, vs: shot.vs, damage: shot.damage, weapon: shot.weapon,
      homing: shot.homingTargetId !== undefined, piercing: !!shot.pierced })) });
  }
  return emissions;
}
function collect(state: RunState, kind: 'power' | 'weapon', weapon = state.player.weapon) {
  state.pickups.push({ id: state.nextId++, kind, weapon: kind === 'weapon' ? weapon : undefined, x: state.player.x, s: .1, value: 1, ttl: 5 });
  stepRun(state, EMPTY_INPUT);
}

describe.each(['endless', 'campaign'] as const)('%s damage keeps firing consistent with its live tier', mode => {
  it.each(cases)('$weapon tier $tier: repeated hull and shield hits keep firing synchronized through recovery', ({ weapon, rank }) => {
    for (const shielded of [false, true]) {
      const state = arena(mode, weapon, rank);
      state.player.shields = shielded ? 5 : 0;
      fire(state, .05); // Hit an already-running burst, rather than always hitting between volleys.
      const control = structuredClone(state), banked = state.player.powerCells;
      for (let hit = 0; hit < 3; hit++) {
        const lives = state.player.lives, shields = state.player.shields;
        const sequence = structuredClone(state.mainSequence), nextVolley = state.nextVolleyAt;
        hitPlayer(state, 1);
        expect(state.player.lives).toBe(lives - (shielded ? 0 : 1));
        expect(state.player.shields).toBe(shields - (shielded ? 1 : 0));
        expect(state.player.weapon).toBe(weapon);
        const expectedRank = mode === 'endless' && !shielded ? Math.max(0, rank - hit - 1) : rank;
        expect(state.player.power).toBe(expectedRank);
        expect(state.player.powerCells).toBe(mode === 'endless' && !shielded ? 0 : banked);
        if (control.player.power !== expectedRank) {
          control.player.power = expectedRank; control.mainSequence = undefined;
          expect(state.mainSequence).toBeUndefined();
        } else expect(state.mainSequence).toEqual(sequence);
        expect(state.nextVolleyAt).toBe(nextVolley);
        // A second hit during immunity is ignored, including weapon and partial-upgrade state.
        hitPlayer(state, 2);
        expect(state.player.lives).toBe(lives - (shielded ? 0 : 1));
        const duration = (shielded ? BALANCE.shield.hitInvulnerability : BALANCE.respawn.invulnerability) + STEP;
        const actual = fire(state, duration);
        expect(actual.length).toBeGreaterThan(0);
        expect(actual).toEqual(fire(control, duration));
      }
    }
  });

  it.each(cases)('$weapon tier $tier: lethal damage and a paused recovery never rewrite the weapon', ({ weapon, rank }) => {
    const state = arena(mode, weapon, rank); state.player.shields = 0;
    fire(state, .05); hitPlayer(state, 1);
    state.phase = 'paused'; const paused = structuredClone(state);
    stepRun(state, EMPTY_INPUT); expect(state).toEqual(paused);
    state.phase = 'playing'; state.player.invulnerableUntil = 0; state.player.lives = 1;
    const banked = state.player.powerCells, retainedRank = state.player.power; hitPlayer(state, 1);
    expect(state.phase).toBe('over');
    expect(state.player).toMatchObject({ weapon, power: retainedRank, powerCells: banked });
  });
});

describe('endless pickups after hull damage', () => {
  it.each(cases)('$weapon tier $tier: reacquiring upgrades and duplicates restores the real pattern', ({ weapon, rank }) => {
    for (const kind of ['power', 'weapon'] as const) {
      const state = arena('endless', weapon, rank); state.player.shields = 0;
      fire(state, .05); hitPlayer(state, 1);
      const damagedRank = Math.max(0, rank - 1), expected = damagedRank + 1;
      expect(state.player.power).toBe(damagedRank);
      expect(state.message).toBe(`FIGHTER RESTORED · WEAPON TIER ${damagedRank + 1}`);
      const needed = ENDLESS_TIER_CELLS[damagedRank];
      for (let cell = 1; cell <= needed; cell++) {
        collect(state, kind);
        if (cell < needed) {
          expect(state.player.power).toBe(damagedRank);
          expect(state.message).toBe(`POWER ${cell}/${needed} · NEXT TIER ${expected + 1}`);
        }
      }
      expect(state.player.power).toBe(expected);
      expect(state.player.powerCells).toBe(0);
      expect(state.message).toBe(`WEAPON TIER ${expected + 1}`);
      expect(state.mainSequence).toBeUndefined();
      const reference = arena('endless', weapon, expected);
      // Match the remaining cooldown; the tier change must not produce a free early volley.
      reference.nextVolleyAt = Math.max(0, state.nextVolleyAt - state.time);
      const actual = fire(state, 1);
      expect(actual.length).toBeGreaterThan(0);
      expect(actual).toEqual(fire(reference, 1));
      expect(state.mainSequence?.rank).toBe(expected);
    }
  });

  it.each(WEAPON_IDS)('%s: max-tier extras never revert its pattern, even after recovery and another cell', weapon => {
    const state = arena('endless', weapon, 4); state.player.shields = 0;
    fire(state, .05); hitPlayer(state, 1);
    collect(state, 'power'); collect(state, 'power');
    fire(state, .2); const reference = structuredClone(state), score = state.score;
    // Collection takes one tick; advance the untouched control by the same tick.
    collect(state, 'power'); stepRun(reference, EMPTY_INPUT);
    expect(state.player.power).toBe(4); expect(state.score).toBe(score + 1000);
    expect(fire(state, 1)).toEqual(fire(reference, 1));
  });

  it.each(WEAPON_IDS)('%s: selecting another family still resets the tier and rebuilds its pattern', weapon => {
    for (const next of WEAPON_IDS.filter(id => id !== weapon)) {
      const state = arena('endless', weapon, 4); state.player.shields = 0;
      fire(state, .05); hitPlayer(state, 1); collect(state, 'weapon', next);
      expect(state.player).toMatchObject({ weapon: next, power: 0, powerCells: 0 });
      expect(state.mainSequence).toBeUndefined();
      const reference = arena('endless', next, 0);
      expect(fire(state, .5)).toEqual(fire(reference, .5));
    }
  });
});
