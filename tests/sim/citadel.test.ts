import { describe, expect, it } from 'vitest';
import { BOSSES, BOSS_TOUGHNESS, bossParts, missionBoss } from '../../src/content/bosses';
import { FAIRNESS } from '../../src/content/balance';
import { EMPTY_INPUT, PLAYER_HIT_RADIUS, STEP, VIEW, type BossId, type RunState } from '../../src/shared/contracts';
import { ENEMY_SHOT_RADIUS, boomerangBarrage, fractureColumns, fractureWave } from '../../src/sim/attacks';
import { bossTarget, resolveBossPhase, startBoss, updateBoss } from '../../src/sim/boss';
import { shotFootprint } from '../../src/sim/fairness';
import { createRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

// docs/39: THE CITADEL (on THE ECLIPSE's model for now) and Nahara's two boss attacks, which THE ECLIPSE also gains.
const CITADEL = BOSSES.citadel;

/** A boss on its own, in the given phase, its next moves starting at `move`. */
function fight(id: BossId, phase: 'core' | 'overload', move: number, seed = 1): RunState {
  const state = createRun({ mode: 'campaign', mission: id === 'citadel' ? 'silent-empire' : 'final-horizon', seed });
  state.nextVolleyAt = state.nextEncounterAt = Infinity; state.player.invulnerableUntil = 0; state.player.lives = 10_000;
  startBoss(state, BOSSES[id]);
  state.time = BOSSES[id].arrivalDuration + .01;
  updateBoss(state, STEP);
  for (const part of ['left', 'right', 'prow'] as const) bossTarget(state, part)!.hp = 0;
  resolveBossPhase(state);
  if (phase === 'overload') { const core = bossTarget(state, 'core')!; core.hp = core.maxHp * 0.39; resolveBossPhase(state); }
  expect(state.boss!.phase).toBe(phase);
  state.boss!.attackIndex = move;
  return state;
}

describe('Fracture Wave', () => {
  const spec = CITADEL.fracture!;

  it('zigzags its gaps centre → side → centre → other side, never one side to the other', () => {
    expect(fractureColumns(5, 1)).toEqual([0, 1, 0, -1, 0]);
    expect(fractureColumns(3, -1)).toEqual([0, -1, 0]);
  });

  it('every wall spans the whole map with one gap over a strip the fairness rules keep open; elsewhere a ship cannot pass', () => {
    const camera = 2.3, shots = fractureWave(spec, 0, 12, camera, 1);
    const walls = new Map<number, number[]>();
    for (const shot of shots) walls.set(shot.delay!, [...(walls.get(shot.delay!) ?? []), shot.x]);
    expect(walls.size).toBe(spec.walls);
    const edge = VIEW.width / 2 - FAIRNESS.sealStrip / 2;
    [...walls.values()].forEach((xs, k) => {
      xs.sort((a, b) => a - b);
      expect(xs[0]).toBeLessThan(-VIEW.worldWidth / 2 + PLAYER_HIT_RADIUS);
      expect(xs.at(-1)!).toBeGreaterThan(VIEW.worldWidth / 2 - PLAYER_HIT_RADIUS);
      const gaps = xs.slice(1).map((x, i) => ({ at: (x + xs[i]) / 2, width: x - xs[i] }));
      const open = gaps.filter(g => g.width > 2 * (PLAYER_HIT_RADIUS + ENEMY_SHOT_RADIUS));
      expect(open, `wall ${k}`).toHaveLength(1);
      // The open strip: the centre column or an edge column of the view at commit.
      const column = fractureColumns(spec.walls, 1)[k];
      expect(open[0].at).toBeCloseTo(camera + column * edge, 9);
      expect(open[0].width - 2 * ENEMY_SHOT_RADIUS).toBeGreaterThanOrEqual(FAIRNESS.sealStrip);
    });
  });

  it('a ship that stays anywhere is caught by some wall: no edge or centre hides from all of them', () => {
    const shots = fractureWave(spec, 0, 12, 0, 1);
    for (let x = -VIEW.worldWidth / 2 + VIEW.playerRadius; x <= VIEW.worldWidth / 2 - VIEW.playerRadius; x += 0.1) {
      const hit = shots.some(shot => { const f = shotFootprint(0, shot); return f && f.x0 - PLAYER_HIT_RADIUS < x && x < f.x1 + PLAYER_HIT_RADIUS; });
      expect(hit, `x ${x.toFixed(1)}`).toBe(true);
    }
  });
});

describe('Boomerang Barrage', () => {
  const spec = CITADEL.boomerang!;

  it('every shot swings out, turns, and comes back across to cross the row at the aim plus its offset', () => {
    const x = 1, s = 12, aimX = -2, shots = boomerangBarrage(spec, x, s, aimX, 1);
    expect(shots).toHaveLength(spec.volleys.flat().length);
    const offsets = spec.volleys.flat();
    shots.forEach((shot, i) => {
      const crossing = shot.s / -shot.vs;
      expect(shot.x + shot.vx * crossing + 0.5 * shot.ax! * crossing ** 2).toBeCloseTo(aimX + offsets[i], 9);
      // It turns (its lateral speed reverses) before it reaches the row: a real boomerang, not a drift.
      const turn = -shot.vx / shot.ax!;
      expect(turn).toBeGreaterThan(0.2);
      expect(turn).toBeLessThan(crossing);
      expect(Math.sign(shot.vx)).not.toBe(Math.sign(aimX + offsets[i] - x) || 0);
    });
  });

  it('the simulation flies the exact curve the fairness forecast predicts', () => {
    const state = fight('citadel', 'core', 2);
    const shots = boomerangBarrage(spec, 0, 12, 1.5, 1);
    for (const spec of shots) state.projectiles.push({ id: state.nextId++, x: spec.x, s: spec.s, previousX: spec.x, previousS: spec.s, vx: spec.vx, vs: spec.vs, ax: spec.ax, friendly: false, damage: 1, radius: spec.radius, ttl: 7, ...(spec.delay ? { delay: spec.delay } : {}) });
    const flying = state.projectiles.slice(-shots.length);
    const start = state.time, prints = shots.map(shot => shotFootprint(start + (shot.delay ?? 0), shot)!);
    const crossed = flying.map(() => NaN);
    state.boss!.nextAttackAt = Infinity;
    for (let i = 0; i < 600 && crossed.some(Number.isNaN); i++) {
      const before = flying.map(p => p.s);
      updateBoss(state, 0); state.player.x = 11; // out of the way
      state.boss!.nextAttackAt = Infinity;
      fly(state, () => EMPTY_INPUT, STEP);
      flying.forEach((p, k) => { if (Number.isNaN(crossed[k]) && before[k] > 0 && p.s <= 0) crossed[k] = p.x; });
    }
    crossed.forEach((x, k) => { expect(x).toBeGreaterThan(prints[k].x0 - .15); expect(x).toBeLessThan(prints[k].x1 + .15); });
  });
});

describe('THE CITADEL (docs/39)', () => {
  it('ends The Silent Empire; three phases on one reactor pool, the fall at 40%; about 5,000 effective hull', () => {
    expect(missionBoss('silent-empire')?.id).toBe('citadel');
    expect(CITADEL.overloadFraction).toBe(0.4);
    const total = bossParts(CITADEL).reduce((sum, part) => sum + CITADEL.parts[part]!.hp, 0) * BOSS_TOUGHNESS.hp;
    expect(total).toBeGreaterThanOrEqual(4500); expect(total).toBeLessThanOrEqual(5200);
    const eclipse = bossParts(BOSSES.eclipse).reduce((sum, part) => sum + BOSSES.eclipse.parts[part]!.hp, 0) * BOSS_TOUGHNESS.hp;
    expect(total).toBeLessThan(eclipse);
    // Its reactor fights with both new attacks, and its fall keeps the spiral.
    expect(CITADEL.coreMoves).toEqual(expect.arrayContaining(['fracture', 'boomerang']));
    expect(CITADEL.overloadMoves).toEqual(expect.arrayContaining(['fracture', 'boomerang', 'spiral']));
    expect(CITADEL.fracture!.walls).toBe(3);
    // THE ECLIPSE gains both, with a longer wave.
    expect([...BOSSES.eclipse.coreMoves!, ...BOSSES.eclipse.overloadMoves]).toEqual(expect.arrayContaining(['fracture', 'boomerang']));
    expect(BOSSES.eclipse.fracture!.walls).toBeGreaterThanOrEqual(4);
  });

  for (const [id, phase, move, attack] of [
    ['citadel', 'core', 0, 'fracture'], ['citadel', 'core', 2, 'boomerang'], ['citadel', 'overload', 0, 'fracture'],
    ['eclipse', 'overload', 2, 'fracture'], ['eclipse', 'core', 2, 'boomerang'],
  ] as const) {
    it(`${id} ${phase}: its ${attack} is admitted and fired, and the perfect pilot weaves through untouched`, () => {
      for (const seed of [1, 2, 3]) {
        const state = fight(id, phase, move, seed);
        state.player.x = [-3, 0, 4][seed - 1];
        let fired = false, shots = 0;
        const seen: string[] = [];
        // Only the boss: the staged fight starts at the run's first seconds, where hunters and the mission's Wraith would
        // join it (since the Silent Empire's quicker flight, 13 November, one reaches the pilot at x 4 on seed 3).
        const bossOnly = (s: RunState) => { s.enemies = s.enemies.filter(enemy => enemy.bossPart); };
        const log = fly(state, perfectPilot(), 2.5, { until: () => fired, onTick: s => {
          bossOnly(s);
          if (s.boss!.attack && seen.at(-1) !== s.boss!.attack) seen.push(s.boss!.attack);
          if (s.boss!.attack === attack) fired = true;
          shots = Math.max(shots, s.projectiles.filter(p => !p.friendly).length);
        } });
        expect(fired, `seed ${seed}: ${seen}, index ${state.boss!.attackIndex}`).toBe(true);
        // Let the whole pattern pass, nothing else firing.
        const after = fly(state, perfectPilot(), 7, { onTick: s => {
          bossOnly(s);
          if (s.boss!.attack === null) s.boss!.nextAttackAt = Infinity;
          shots = Math.max(shots, s.projectiles.filter(p => !p.friendly).length);
        } });
        expect(shots, `seed ${seed}`).toBeGreaterThan(attack === 'fracture' ? 40 : 4);
        expect(log.hits + after.hits, `seed ${seed}`).toBe(0);
      }
    });
  }
});
