import { describe, expect, it } from 'vitest';
import { BASTION } from '../../src/content/bastion';
import { EMPTY_INPUT, STEP, VIEW, type Difficulty, type RunState, type WeaponId } from '../../src/shared/contracts';
import { acquireTarget, createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { bossTarget, resolveBastionPhase } from '../../src/sim/bastion';

function encounter(weapon: WeaponId = 'pulse', difficulty: Difficulty = 'standard') {
  const state = createRun({ mode: 'campaign', mission: 'bastion', seed: 53, weapon, difficulty });
  state.time = BASTION.arrivesAt - STEP;
  state.distance = state.time * VIEW.scrollSpeed;
  stepRun(state, EMPTY_INPUT);
  return state;
}
function advance(state: RunState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(state, EMPTY_INPUT);
}
function openCore(state: RunState) {
  advance(state, 3.05);
  bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0;
  resolveBastionPhase(state);
}

describe('Bastion-9 mission', () => {
  it('has a harmless arrival, protected core, and no victory from waiting', () => {
    const state = encounter();
    expect(state.boss?.phase).toBe('arrival');
    state.player.x = bossTarget(state, 'core')!.x;
    expect(acquireTarget(state)).toBeUndefined();
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    expect(bossTarget(state, 'core')!.hp).toBe(BASTION.coreHp);
    expect(bossTarget(state, 'left')!.hp).toBe(BASTION.batteryHp);
    advance(state, 3);
    expect(state.boss?.phase).toBe('batteries');
    expect(acquireTarget(state)).toBeUndefined();
    state.player.x = -15; state.cameraX = -12;
    advance(state, 180);
    expect(state.phase).toBe('playing');
    expect(state.boss?.phase).toBe('batteries');
  });

  it('stops a destroyed battery immediately, opens the core once, and never refills HP on overload', () => {
    const state = encounter(); advance(state, 4.5);
    const firing = state.enemies.find(enemy => enemy.warning > 0)!;
    expect(firing).toBeDefined();
    firing.hp = 0; resolveBastionPhase(state);
    expect(firing.warning).toBe(0);
    expect(state.boss!.attackerId).toBeNull();
    expect(state.boss!.phase).toBe('batteries');
    bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0;
    resolveBastionPhase(state);
    const core = bossTarget(state, 'core')!;
    expect(core.damageable).toBe(true);
    expect(state.hazards).toHaveLength(0);
    core.hp = core.maxHp * .35; resolveBastionPhase(state);
    expect(state.boss!.phase).toBe('overload');
    expect(core.hp).toBe(core.maxHp * .35);
    const hp = core.hp;
    state.player.shields = 0; hitPlayer(state, 1);
    expect(state.player.lives).toBe(2);
    expect(core.hp).toBe(hp);
    expect(state.boss!.phase).toBe('overload');
    expect(state.hazards).toHaveLength(0);
  });

  it('does not bypass closed shutters with homing shots or a shockwave', () => {
    const state = encounter('seeker'); advance(state, 3.1);
    const core = bossTarget(state, 'core')!;
    expect(acquireTarget(state)?.bossPart).not.toBe('core');
    state.projectiles.push({ id: state.nextId++, x: core.x, s: core.s - .1, previousX: core.x,
      previousS: core.s - .1, vx: 0, vs: 30, friendly: true, damage: 9999, radius: .1, ttl: 1, homingTargetId: core.id });
    stepRun(state, { ...EMPTY_INPUT, specialPressed: true });
    expect(core.hp).toBe(core.maxHp);
    expect(state.boss!.phase).toBe('batteries');
  });

  it('cancels offscreen windups and grants a fresh warning on return', () => {
    const state = encounter(); advance(state, 4.5);
    expect(state.boss!.attack).not.toBeNull();
    state.player.x = 16; state.cameraX = 12; advance(state, 1);
    expect(state.boss!.attack).toBeNull();
    expect(state.projectiles.filter(shot => !shot.friendly)).toHaveLength(0);
    state.player.x = 0; state.cameraX = 0; stepRun(state, EMPTY_INPUT);
    expect(state.enemies.some(enemy => enemy.warning >= BASTION.warning - STEP)).toBe(true);
  });

  it('clears danger before extraction, rewards once, freezes on pause, then completes', () => {
    const state = encounter(); openCore(state);
    bossTarget(state, 'core')!.hp = 0; resolveBastionPhase(state);
    expect(state.boss!.phase).toBe('destroyed');
    expect(state.credits).toBe(60);
    resolveBastionPhase(state); expect(state.credits).toBe(60);
    expect(state.hazards).toHaveLength(0);
    const before = structuredClone(state);
    state.phase = 'paused'; advance(state, 5);
    expect(state.time).toBe(before.time);
    state.phase = 'playing'; advance(state, 7);
    expect(state.phase).toBe('playing');
    advance(state, 1.1);
    expect(state.phase).toBe('complete');
  });

  it('keeps the short training sortie and canonical endless start independent', () => {
    const endless = createRun({ mode: 'endless', mission: 'bastion', weapon: 'fan', difficulty: 'relaxed', seed: 42 });
    expect(endless.config.mission).toBeUndefined();
    expect(endless.player.weapon).toBe('pulse');
    endless.player.invulnerableUntil = Infinity; advance(endless, 240);
    expect(endless.boss).toBeNull(); expect(endless.phase).toBe('playing');
    const training = createRun({ mode: 'campaign', mission: 'training', seed: 42 });
    training.player.invulnerableUntil = Infinity; advance(training, 121);
    expect(training.boss).toBeNull(); expect(training.phase).toBe('complete');
  });

  it('offers only the fixed mission shield budget even during an extended boss fight', () => {
    for (const difficulty of ['relaxed', 'standard', 'veteran'] as const) {
      const state = createRun({ mode: 'campaign', mission: 'bastion', difficulty, seed: 5 });
      state.player.x = -17; state.cameraX = -12; state.nextVolleyAt = Infinity;
      const cells = new Set<number>();
      for (let tick = 0; tick < 300 / STEP; tick++) {
        stepRun(state, EMPTY_INPUT);
        for (const pickup of state.pickups) if (pickup.kind === 'shield') cells.add(pickup.id);
        // Exercise the whole timeline without suppressing normal enemy scheduling.
        state.player.lives = 3;
      }
      expect(cells.size).toBe(difficulty === 'veteran' ? 1 : 2);
    }
  });

  it.each((['pulse', 'fan', 'seeker'] as WeaponId[]).flatMap(weapon =>
    (['relaxed', 'standard', 'veteran'] as Difficulty[]).map(difficulty => ({ weapon, difficulty }))))('can clear $difficulty with $weapon, starter lives, no pickups and no special', ({ weapon, difficulty }) => {
    const state = createRun({ mode: 'campaign', mission: 'bastion', weapon, difficulty, seed: 53 });
    for (let tick = 0; tick < 360 / STEP && state.phase === 'playing'; tick++) {
      const target = state.enemies.find(enemy => enemy.hp > 0 && enemy.damageable !== false && Math.abs(enemy.x) < 5 && enemy.s > 1 && enemy.s < 19);
      const targetX = target?.x ?? 0;
      const candidates = Array.from({ length: 23 }, (_, index) => -5.5 + index * .5);
      const cost = (x: number) => {
        let danger = 0;
        for (const shot of state.projectiles) if (!shot.friendly && shot.vs < 0) {
          const arrival = shot.s / -shot.vs;
          if (arrival > -.05 && arrival < 1.1 && Math.abs(shot.x + shot.vx * arrival - x) < .65) danger += 100;
        }
        for (const hazard of state.hazards) if (hazard.warning < .8 && Math.abs(hazard.x - x) < hazard.width / 2 + .6) danger += 100;
        for (const enemy of state.enemies) if (enemy.kind !== 'turret' && enemy.hp > 0 && enemy.s > -1 && enemy.s < 2 && Math.abs(enemy.x - x) < enemy.radius + .7) danger += 100;
        return danger + Math.abs(targetX - x) + Math.abs(state.player.x - x) * .2;
      };
      const desired = candidates.reduce((best, x) => cost(x) < cost(best) ? x : best, candidates[0]);
      const dx = desired - state.player.x;
      stepRun(state, { ...EMPTY_INPUT, horizontal: Math.abs(dx) < .13 ? 0 : dx < 0 ? -1 : 1 });
      state.pickups = []; // The proof must not depend on recovery or extra equipment.
    }
    expect({ phase: state.phase, boss: state.boss?.phase, lives: state.player.lives, time: state.time }).toMatchObject({ phase: 'complete', boss: 'destroyed' });
    expect(state.player.lives).toBeGreaterThan(0);
    expect(state.specialsUsed).toBe(0);
    expect(state.time).toBeLessThan(270);
  });
});
