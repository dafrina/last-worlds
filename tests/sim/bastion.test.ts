import { describe, expect, it } from 'vitest';
import { BASTION } from '../../src/content/bastion';
import { WRECK_HOLD } from '../../src/content/bosses';
import { EMPTY_INPUT, STEP, VIEW, type Difficulty, type RunState, type WeaponId } from '../../src/shared/contracts';
import { acquireTarget, createRun, hitPlayer, stepRun } from '../../src/sim/game';
import { bossTarget, resolveBastionPhase } from '../../src/sim/bastion';
import { fly, perfectPilot } from './pilots';

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
    state.player.x = -(VIEW.worldWidth / 2 - 1); state.cameraX = -(VIEW.worldWidth - VIEW.width) / 2;
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
    state.player.x = VIEW.worldWidth / 2 - 1; state.cameraX = (VIEW.worldWidth - VIEW.width) / 2; advance(state, 1);
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
    // The wreck hold, then 8 s of extraction.
    state.phase = 'playing'; advance(state, WRECK_HOLD + 7);
    expect(state.phase).toBe('playing');
    advance(state, 1.1);
    expect(state.phase).toBe('complete');
  });

  it('leaves the wreck behind on the ground once extraction resumes the scroll', () => {
    const state = encounter(); openCore(state);
    bossTarget(state, 'core')!.hp = 0; resolveBastionPhase(state);
    const s0 = state.boss!.s, d0 = state.distance;
    advance(state, WRECK_HOLD);
    expect(state.distance).toBe(d0);
    advance(state, 4);
    expect(state.distance).toBeGreaterThan(d0 + 5);
    // Ground-anchored: the wreck's world position (distance + s) holds while its row falls behind the player.
    // Distance is a closed-form integral of the resume ramp and the wreck integrates per step: a fixed ≤ 5 cm
    // offset from the 2 s ramp that never grows afterwards.
    expect(state.boss!.s).toBeLessThan(s0 - 5);
    const drift = state.distance + state.boss!.s - (d0 + s0);
    expect(Math.abs(drift)).toBeLessThan(.05);
    advance(state, 3);
    expect(state.distance + state.boss!.s - (d0 + s0)).toBeCloseTo(drift, 6);
  });

  it('keeps the training sortie and canonical endless start independent of Rolling Thunder', () => {
    const endless = createRun({ mode: 'endless', mission: 'bastion', weapon: 'fan', difficulty: 'relaxed', seed: 42 });
    expect(endless.config.mission).toBeUndefined();
    expect(endless.player.weapon).toBe('pulse');
    // Endless opens on Luna; its first boss is WARDEN-1, never the mission's Bastion-9.
    endless.player.invulnerableUntil = Infinity; advance(endless, 240);
    expect(endless.boss?.id).toBe('warden'); expect(endless.phase).toBe('playing');
    const training = createRun({ mode: 'campaign', mission: 'training', seed: 42 });
    training.player.invulnerableUntil = Infinity; advance(training, 121);
    expect(training.boss?.id).toBe('warden'); expect(training.phase).toBe('playing');
  });

  it('offers only the fixed mission shield budget even during an extended boss fight', () => {
    for (const difficulty of ['relaxed', 'standard', 'veteran'] as const) {
      const state = createRun({ mode: 'campaign', mission: 'bastion', difficulty, seed: 5 });
      state.player.x = -(VIEW.worldWidth / 2 - 1); state.cameraX = -(VIEW.worldWidth - VIEW.width) / 2; state.nextVolleyAt = Infinity;
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
    (['relaxed', 'standard', 'veteran'] as Difficulty[]).map(difficulty => ({ weapon, difficulty }))))('can clear $difficulty with $weapon without a hit, the special or pickups', ({ weapon, difficulty }) => {
    // The solver pilot acts on what it saw 0.2 s earlier with the ship's exact kinematics.
    const state = createRun({ mode: 'campaign', mission: 'bastion', weapon, difficulty, seed: 53 });
    const log = fly(state, perfectPilot(), 360, { noPickups: true });
    expect({ phase: state.phase, boss: state.boss?.phase }).toEqual({ phase: 'complete', boss: 'destroyed' });
    expect(log.hits).toBe(0);
    expect(state.specialsUsed).toBe(0);
    expect(state.time).toBeLessThan(270);
  });
});
