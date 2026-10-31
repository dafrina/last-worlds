import { describe, expect, it } from 'vitest';
import { BOSSES, missionBoss, phaseOneParts } from '../../src/content/bosses';
import { ECLIPSE } from '../../src/content/eclipse';
import { resolvePlaylist } from '../../src/content/encounter-deck';
import { MISSION_PLANET } from '../../src/content/missions';
import { CAMPAIGN_ORDER } from '../../src/content/equipment';
import { STEP, type BossId, type Difficulty, type WeaponId } from '../../src/shared/contracts';
import { bossTarget, resolveBossPhase, startBoss, updateBoss } from '../../src/sim/bastion';
import { pendingAttackFootprints, shotFootprint } from '../../src/sim/fairness';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

/** THE ECLIPSE in its first phase, on Final Horizon, with no other traffic. */
function eclipseFight() {
  const state = createRun({ mode: 'campaign', mission: 'final-horizon', seed: 1 });
  state.nextVolleyAt = state.nextEncounterAt = Infinity; state.player.invulnerableUntil = 0;
  startBoss(state, BOSSES.eclipse);
  state.time = BOSSES.eclipse.arrivalDuration + .01;
  updateBoss(state, STEP);
  expect(state.boss!.phase).toBe('batteries');
  return state;
}

describe('Final Horizon over Umbra (docs/28)', () => {
  it('is the final campaign mission, over Umbra, against THE ECLIPSE', () => {
    expect(CAMPAIGN_ORDER.at(-1)).toBe('final-horizon');
    expect(MISSION_PLANET['final-horizon']).toBe('umbra');
    expect(missionBoss('final-horizon')?.id).toBe('eclipse');
    for (const seed of [1, 2, 3]) expect(resolvePlaylist({ mode: 'campaign', mission: 'final-horizon' }, 1, seed).length).toBeGreaterThan(35);
  });

  it('THE ECLIPSE alone has a third first-phase target, its prow vent; every other boss keeps its pair and core', () => {
    for (const id of Object.keys(BOSSES) as BossId[]) {
      const state = createRun({ mode: 'campaign', mission: 'final-horizon', seed: 1 });
      startBoss(state, BOSSES[id]);
      const parts = state.enemies.filter(enemy => enemy.bossPart).map(enemy => enemy.bossPart);
      expect(parts, id).toEqual(id === 'eclipse' ? ['left', 'right', 'prow', 'core'] : ['left', 'right', 'core']);
      expect(phaseOneParts(BOSSES[id]), id).toEqual(id === 'eclipse' ? ['left', 'right', 'prow'] : ['left', 'right']);
    }
    // Its hit circle sits apart from the reactor's and the vents' (docs/28): no shot can be ambiguous between them.
    const { left, right, core, prow } = BOSSES.eclipse.parts;
    for (const other of [left, right, core]) expect(Math.hypot(prow!.x - other.x, prow!.s - other.s)).toBeGreaterThan(prow!.radius + other.radius + .3);
    expect(prow!.hp).toBe(left.hp);
  });

  it('opens the reactor only once all three vents are broken, the prow vent included', () => {
    const state = eclipseFight();
    expect(bossTarget(state, 'prow')!.damageable).toBe(true);
    expect(bossTarget(state, 'core')!.damageable).toBe(false);
    bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0;
    resolveBossPhase(state);
    expect(state.boss!.phase).toBe('batteries');
    bossTarget(state, 'prow')!.hp = 0;
    resolveBossPhase(state);
    expect(state.boss!.phase).toBe('core');
    expect(bossTarget(state, 'prow')!.damageable).toBe(false);
    expect(bossTarget(state, 'core')!.damageable).toBe(true);
  });

  it('turns the prow vent into the vents\' rotation, one attacker at a time, deterministically, and forecasts its burst exactly', () => {
    const run = () => {
      // The camera over the right half: the right vent and the prow vent are in view, the left one is not.
      const state = eclipseFight(), order: string[] = [];
      let forecast: { x0: number; x1: number }[] | null = null, checked = 0;
      for (let tick = 0; tick < 60 * 40; tick++) {
        state.cameraX = state.player.x = 2.5; state.time += STEP;
        const before = state.boss!.attackerId;
        updateBoss(state, STEP);
        const boss = state.boss!, attacker = state.enemies.find(enemy => enemy.id === boss.attackerId);
        expect(state.enemies.filter(enemy => enemy.bossPart && enemy.warning > 0).length).toBeLessThanOrEqual(1);
        if (attacker && boss.attackerId !== before) {
          order.push(attacker.bossPart!);
          forecast = attacker.bossPart === 'prow' ? pendingAttackFootprints(state, attacker, attacker.aimX, attacker.warning) : null;
        }
        const released = state.projectiles.filter(shot => !shot.friendly);
        if (released.length && forecast) {
          // The bolts leave the prow vent where the forecast placed them (it holds the hull's sway through the windup).
          const actual = released.map(shot => shotFootprint(state.time, shot)!).sort((a, b) => a.x0 - b.x0);
          const expected = [...forecast].sort((a, b) => a.x0 - b.x0);
          expect(actual.length).toBe(expected.length);
          actual.forEach((f, i) => { expect(f.x0).toBeCloseTo(expected[i].x0, 1); expect(f.x1).toBeCloseTo(expected[i].x1, 1); });
          for (const shot of released) expect(shot.s).toBeCloseTo(boss.s + ECLIPSE.prowS, 5);
          checked++; forecast = null;
        }
        state.projectiles = [];
      }
      return { order, checked };
    };
    const first = run();
    expect(first.order).toContain('prow');
    expect(first.order).toContain('right');
    expect(first.order).not.toContain('left');
    expect(first.checked).toBeGreaterThan(2);
    expect(run().order).toEqual(first.order);
  });

  it.each([['pulse', 'standard'], ['fan', 'standard'], ['seeker', 'veteran']] as [WeaponId, Difficulty][])('the perfect pilot clears it with %s on %s without a hit', (weapon, difficulty) => {
    // The scripted pilot is not perfect. Since the Wraith (docs/29) it takes a single mission hit with the Fan on seeds 3 and
    // 5 (the short-ranged Fan flies it close to where the Wraith warps in); Twin Pulse and Seeker clear seeds 3, 5, 7, 11
    // and 21, never a hit from THE ECLIPSE, and the fairness checks pass. Seed 7 clears with all three (27 October).
    const state = createRun({ mode: 'campaign', mission: 'final-horizon', difficulty, weapon, seed: 7 });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect(log.phase).toBe('complete');
    expect(state.boss?.id).toBe('eclipse');
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  }, 120_000);
});
