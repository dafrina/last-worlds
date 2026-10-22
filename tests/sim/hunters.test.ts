import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/balance';
import { missionBoss } from '../../src/content/bosses';
import { EMPTY_INPUT, STEP, type InputFrame, type RunConfig, type RunState } from '../../src/shared/contracts';
import { bossTarget, resolveBossPhase, startBoss } from '../../src/sim/bastion';
import { createRun, stepRun } from '../../src/sim/game';
import { HUNTERS, absorbHunterShield, hunterCharges, hunterLimits } from '../../src/sim/hunters';

const hunters = (state: RunState) => state.enemies.filter(enemy => enemy.hunter && enemy.hp > 0);
/** Flies with no fire of its own and lives enough to keep going; `onTick` sees every step. */
function run(state: RunState, seconds: number, onTick: (state: RunState) => void = () => {}, input: InputFrame = EMPTY_INPUT) {
  state.player.lives = 10_000;
  const until = state.time + seconds;
  while (state.time < until - 1e-9 && state.phase === 'playing') { state.nextVolleyAt = Infinity; stepRun(state, input); onTick(state); }
}

describe('hunters (aces, src/sim/hunters.ts)', () => {
  it('come on their schedule within the limits: one or two alive, a few per level, one in a boss fight', () => {
    for (const config of [
      { mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 },
      { mode: 'campaign', mission: 'deep-bloom', difficulty: 'veteran', seed: 3 },
      { mode: 'campaign', mission: 'training', difficulty: 'relaxed', seed: 3 },
    ] as RunConfig[]) {
      const state = createRun(config), limits = hunterLimits(state);
      let most = 0, bossMost = 0;
      run(state, missionBoss(config.mission)!.arrivesAt + 40, s => {
        most = Math.max(most, hunters(s).length);
        if (s.boss) bossMost = Math.max(bossMost, hunters(s).length);
      });
      expect(state.hunters!.spawned, config.mission).toBeGreaterThan(0);
      expect(state.hunters!.spawned, config.mission).toBeLessThanOrEqual(limits.total);
      expect(most, config.mission).toBeLessThanOrEqual(limits.live);
      // (A hunter alive when the boss arrives stays; none joins it while one is alive.)
      expect(bossMost, config.mission).toBeLessThanOrEqual(Math.max(1, limits.live));
    }
  });

  it('never leave: an unhurt hunter stays in the fight, in view, until it is shot down', () => {
    const state = createRun({ mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 });
    run(state, HUNTERS.firstAfter + 1);
    const [first] = hunters(state);
    expect(first).toBeDefined();
    run(state, 60, s => {
      const same = s.enemies.find(enemy => enemy.id === first.id);
      expect(same, `t ${s.time.toFixed(1)}`).toBeDefined();
      if (same!.s < 19) expect(Math.abs(same!.x - s.cameraX)).toBeLessThanOrEqual(6);
    });
  });

  it('take damage on the shield first, charge by charge, then on the hull', () => {
    const state = createRun({ mode: 'campaign', mission: 'cold-vector', difficulty: 'standard', seed: 3 });
    run(state, HUNTERS.firstAfter + 0.5);
    const [hunter] = hunters(state);
    expect(hunter.kind).toBe(HUNTERS.kinds.vesper);
    expect(hunterCharges(hunter)).toBe(HUNTERS.shield.charges);
    const charge = ENEMIES[hunter.kind].hp * HUNTERS.shield.share;
    expect(absorbHunterShield(hunter, charge * 0.6)).toBeCloseTo(0, 9);
    expect(hunterCharges(hunter)).toBe(HUNTERS.shield.charges);
    expect(absorbHunterShield(hunter, charge * 0.4)).toBeCloseTo(0, 9);
    expect(hunterCharges(hunter)).toBe(HUNTERS.shield.charges - 1);
    // Damage past the shield reaches the hull.
    expect(absorbHunterShield(hunter, charge * 2 + 10)).toBeCloseTo(10, 9);
    expect(hunterCharges(hunter)).toBe(0);
  });

  it('follow a ship that retreats to a side of the map', () => {
    const state = createRun({ mode: 'campaign', mission: 'training', difficulty: 'standard', seed: 3 });
    run(state, HUNTERS.firstAfter + 3);
    const [hunter] = hunters(state);
    hunter.nextAttack = Infinity;
    run(state, 8, () => {}, { ...EMPTY_INPUT, horizontal: 1 });
    expect(state.player.x).toBeGreaterThan(10);
    const same = state.enemies.find(enemy => enemy.id === hunter.id)!;
    expect(Math.abs(same.x - state.player.x)).toBeLessThan(1.5);
  });

  it('meet every world seed at the same times (endless is a standardized challenge)', () => {
    const times = (seed: number) => {
      const state = createRun({ mode: 'endless', seed }), seen: number[] = [];
      run(state, 80, s => { if (s.hunters && s.hunters.spawned > seen.length) seen.push(Math.round(s.time)); });
      return seen;
    };
    expect(times(1)).toEqual(times(999));
    expect(times(1).length).toBeGreaterThan(0);
  });

  it('stay into a boss fight and go down with the boss', () => {
    const state = createRun({ mode: 'campaign', mission: 'bastion', difficulty: 'standard', seed: 3 });
    run(state, HUNTERS.firstAfter + 1);
    expect(hunters(state)).toHaveLength(1);
    startBoss(state);
    expect(hunters(state)).toHaveLength(1);
    for (const part of ['left', 'right', 'core'] as const) bossTarget(state, part)!.hp = 0;
    state.boss!.phase = 'overload';
    resolveBossPhase(state);
    expect(state.boss!.phase).toBe('destroyed');
    expect(hunters(state)).toHaveLength(0);
    expect(state.effects.some(effect => effect.kind === 'explosion')).toBe(true);
    // The death plays out: a barrage, then one big detonation.
    let blasts = 0;
    for (let i = 0; i < 2.4 / STEP; i++) { stepRun(state, EMPTY_INPUT); blasts += state.effects.filter(effect => effect.kind === 'bossBlast' && effect.ttl > effect.duration - STEP * 1.5).length; }
    expect(blasts).toBe(1);
  });
});
