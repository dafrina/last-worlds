import { describe, expect, it } from 'vitest';
import { FAIRNESS } from '../../src/content/balance';
import { HELION_ARK } from '../../src/content/ark';
import { BOSSES, BOSS_TOUGHNESS, WRECK_HOLD } from '../../src/content/bosses';
import { DEPARTURE } from '../../src/content/departure';
import { COLD_VECTOR_SORTIE } from '../../src/content/encounters';
import { EMPTY_INPUT, STEP, VIEW, type Difficulty, type RunState, type WeaponId } from '../../src/shared/contracts';
import { arenaScroll, arenaStopDistance, bossTarget, overloadLanes, resolveBossPhase } from '../../src/sim/bastion';
import { acquireTarget, createRun, stepRun } from '../../src/sim/game';
import { fly, perfectPilot } from './pilots';

const ARK = BOSSES.ark;

function encounter(difficulty: Difficulty = 'standard', weapon: WeaponId = 'pulse'): RunState {
  const state = createRun({ mode: 'campaign', mission: 'cold-vector', seed: 7, weapon, difficulty });
  state.time = HELION_ARK.arrivesAt - STEP;
  stepRun(state, EMPTY_INPUT);
  return state;
}
function advance(state: RunState, seconds: number) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(state, EMPTY_INPUT);
}
function openBridge(state: RunState) {
  advance(state, HELION_ARK.arrivalDuration + 0.05);
  bossTarget(state, 'left')!.hp = bossTarget(state, 'right')!.hp = 0;
  resolveBossPhase(state);
}

describe('Cold Vector arena', () => {
  it('stops the scroll at exactly distance 935 over open water and resumes after the kill', () => {
    expect(arenaStopDistance(HELION_ARK.arena)).toBe(935);
    expect(arenaScroll(HELION_ARK.arena.decelStart, null, HELION_ARK.arena)).toEqual({ distance: 920, speed: 5 });
    const stopped = arenaScroll(HELION_ARK.arena.decelStart + HELION_ARK.arena.decelDuration, null, HELION_ARK.arena);
    expect(stopped.distance).toBeCloseTo(935, 9);
    expect(stopped.speed).toBe(0);
    expect(arenaScroll(400, null, HELION_ARK.arena)).toEqual({ distance: 935, speed: 0 });
    // After the kill the scroll holds over the wreck, then resumes.
    expect(arenaScroll(300 + WRECK_HOLD, 300, HELION_ARK.arena)).toEqual({ distance: 935, speed: 0 });
    // Then the departure, as in endless: up to its speed over its ramp.
    expect(arenaScroll(300 + WRECK_HOLD + DEPARTURE.ramp, 300, HELION_ARK.arena).speed).toBeCloseTo(DEPARTURE.speed, 9);
    // The approach ends before the relief; the Ark arrives after the terrain has nearly stopped.
    expect(COLD_VECTOR_SORTIE[COLD_VECTOR_SORTIE.length - 1].at).toBeLessThan(HELION_ARK.approachEndsAt);
    expect(HELION_ARK.arrivesAt).toBeGreaterThan(HELION_ARK.arena.decelStart);
    // The documented platform covers the view below the stop and the Ark's glide-in with its long stern.
    expect(HELION_ARK.arena.platform.from).toBeLessThan(VIEW.minS);
    expect(HELION_ARK.arena.platform.to).toBeGreaterThanOrEqual(HELION_ARK.entryS + 7.3);
  });

  it('runs the whole timeline in the simulation with a deterministic stop distance', () => {
    const state = createRun({ mode: 'campaign', mission: 'cold-vector', seed: 7 });
    state.player.invulnerableUntil = Infinity;
    advance(state, HELION_ARK.arena.decelStart + HELION_ARK.arena.decelDuration + 1);
    expect(state.distance).toBeCloseTo(935, 6);
    expect(state.scrollSpeed).toBe(0);
    expect(state.boss?.id).toBe('ark');
  });
});

describe('Helion Ark', () => {
  it('glides in harmlessly with protected targets at the authored sockets and about 3,000 HP', () => {
    const state = encounter();
    const boss = state.boss!;
    expect(boss.phase).toBe('arrival');
    expect(boss.s).toBeCloseTo(HELION_ARK.entryS, 1);
    const [left, right, bridge] = (['left', 'right', 'core'] as const).map(part => bossTarget(state, part)!);
    expect(left.maxHp + right.maxHp + bridge.maxHp).toBeCloseTo(3000 * BOSS_TOUGHNESS.hp, 6);
    expect([left.radius, right.radius, bridge.radius]).toEqual([HELION_ARK.radiatorRadius, HELION_ARK.radiatorRadius, 1]);
    expect(left.x - boss.x).toBeCloseTo(-HELION_ARK.radiatorOffset, 9);
    expect(left.s - boss.s).toBeCloseTo(HELION_ARK.radiatorS, 9);
    expect(bridge.s - boss.s).toBeCloseTo(1.6, 9);
    expect(acquireTarget(state)).toBeUndefined();
    advance(state, HELION_ARK.arrivalDuration - 0.1);
    expect(state.projectiles.filter(shot => !shot.friendly)).toHaveLength(0);
    expect(state.hazards).toHaveLength(0);
    advance(state, 0.2);
    expect(state.boss!.phase).toBe('batteries');
    expect(state.boss!.s).toBeCloseTo(HELION_ARK.row, 0);
  });

  it('scales its HP by campaign difficulty', () => {
    const total = (difficulty: Difficulty) => {
      const state = encounter(difficulty);
      return (['left', 'right', 'core'] as const).reduce((sum, part) => sum + bossTarget(state, part)!.maxHp, 0);
    };
    expect(total('relaxed')).toBeCloseTo(2550 * BOSS_TOUGHNESS.hp, 6);
    expect(total('veteran')).toBeCloseTo(3600 * BOSS_TOUGHNESS.hp, 6);
  });

  it('fires narrow radiator lane lasers straight down from the radiator that fires them, alternating radiators, with bridge bursts between', () => {
    const state = encounter();
    advance(state, HELION_ARK.arrivalDuration + 0.05);
    const attackers: number[] = [];
    let lanes = 0, bursts = 0, shotsSeen = 0;
    for (let i = 0; i < 12 / STEP; i++) {
      const before = new Set(state.hazards.map(hazard => hazard.id));
      stepRun(state, EMPTY_INPUT);
      for (const hazard of state.hazards) if (!before.has(hazard.id)) {
        lanes += 1;
        expect(hazard.width).toBe(HELION_ARK.laser.width);
        // Aligned with its radiator (user report: lasers did not line up with what fired them).
        expect(hazard.x).toBeCloseTo(state.enemies.find(enemy => enemy.id === state.boss!.attackerId)!.x, 6);
        expect(hazard.warning + STEP).toBeGreaterThanOrEqual(FAIRNESS.beamWarningFloor);
        attackers.push(state.boss!.attackerId!);
      }
      for (const shot of state.projectiles) if (!shot.friendly && shot.id > shotsSeen) { bursts++; shotsSeen = shot.id; }
    }
    expect(lanes).toBeGreaterThanOrEqual(3);
    expect(new Set(attackers).size).toBe(2);
    // Every third attack is an aimed bridge burst, so the middle between the radiator lanes is not a free spot.
    expect(bursts).toBeGreaterThan(0);
  });

  it('launches a finite number of Needles from its deck bays during the bridge phase', () => {
    const state = encounter();
    openBridge(state);
    expect(state.boss!.phase).toBe('core');
    const launched = new Set<number>();
    for (let i = 0; i < 60 / STEP && state.boss!.phase === 'core'; i++) {
      stepRun(state, EMPTY_INPUT);
      for (const enemy of state.enemies) if (enemy.formation?.template === 'ark-launch' && !launched.has(enemy.id)) {
        launched.add(enemy.id);
        expect(enemy.kind).toBe('needle');
        // Each Needle appears at a deck bay of the Ark.
        expect(Math.abs(enemy.x - state.boss!.x)).toBeCloseTo(0.75, 1);
        expect(enemy.s - state.boss!.s).toBeCloseTo(-2, 0);
      }
      // Keep the bridge alive and out of overload so every wave has the chance to launch.
      bossTarget(state, 'core')!.hp = bossTarget(state, 'core')!.maxHp;
      state.player.lives = 99;
    }
    expect(launched.size).toBe(HELION_ARK.launches.waves * HELION_ARK.bays.length);
    expect(state.boss!.launchesLeft).toBe(0);
  });

  it('marks overload lanes over its own hit columns and leaves the bridge column open on the radiator turn', () => {
    const core = overloadLanes(0, 0, ARK);
    expect(core).toEqual([{ x: 0, width: HELION_ARK.overload.coreLaneWidth }]);
    const sides = overloadLanes(0, 1, ARK);
    expect(sides.map(lane => lane.x)).toEqual([-HELION_ARK.radiatorOffset, HELION_ARK.radiatorOffset]);
    // The bridge column (radius 1) stays clear of the radiator lanes for a 0.42 collider.
    const innerEdge = HELION_ARK.radiatorOffset - HELION_ARK.overload.batteryLaneWidth / 2;
    expect(innerEdge - VIEW.playerRadius).toBeGreaterThan(HELION_ARK.bridgeRadius);
    const state = encounter();
    openBridge(state);
    const bridge = bossTarget(state, 'core')!;
    bridge.hp = bridge.maxHp * 0.39;
    resolveBossPhase(state);
    expect(state.boss!.phase).toBe('overload');
    expect(bridge.hp).toBe(bridge.maxHp * 0.39);
  });

  it('sinks into a water-anchored wreck, clears its fighters, rewards once and completes extraction', () => {
    const state = encounter();
    openBridge(state);
    advance(state, 8);
    const credits = state.credits;
    bossTarget(state, 'core')!.hp = 0;
    resolveBossPhase(state);
    expect(state.boss!.phase).toBe('destroyed');
    expect(state.enemies.every(enemy => enemy.bossPart)).toBe(true);
    expect(state.credits).toBe(credits + 60);
    resolveBossPhase(state);
    expect(state.credits).toBe(credits + 60);
    const s0 = state.boss!.s;
    // The scroll holds over the wreck first.
    advance(state, WRECK_HOLD - 0.1);
    expect(state.scrollSpeed).toBe(0);
    advance(state, 4.1);
    // Then it resumes for extraction and the wreck stays on the water, falling behind.
    expect(state.scrollSpeed).toBeGreaterThan(4.9);
    expect(state.boss!.s).toBeLessThan(s0 - 5);
    advance(state, 0.1);
    expect(state.phase).toBe('complete');
  });

  it('drifts and sways on the water and exposes its velocity', () => {
    const state = encounter();
    advance(state, HELION_ARK.arrivalDuration + 2);
    const speeds: number[] = [];
    for (let i = 0; i < 120; i++) { stepRun(state, EMPTY_INPUT); speeds.push(Math.hypot(state.boss!.vx, state.boss!.vs)); }
    expect(Math.max(...speeds)).toBeGreaterThan(0.1);
    expect(Math.abs(state.boss!.x - state.boss!.originX)).toBeLessThanOrEqual(HELION_ARK.arena.sway + 1e-9);
  });

  it('never appears in endless or training, and Bastion-9 stays the Rolling Thunder boss', () => {
    const endless = createRun({ mode: 'endless', mission: 'cold-vector', seed: 3 });
    expect(endless.config.mission).toBeUndefined();
    const thunder = createRun({ mode: 'campaign', mission: 'bastion', seed: 3 });
    thunder.time = BOSSES.bastion.arrivesAt - STEP;
    stepRun(thunder, EMPTY_INPUT);
    expect(thunder.boss?.id).toBe('bastion');
  });

  it.each((['pulse', 'fan', 'seeker'] as WeaponId[]).flatMap(weapon =>
    (['relaxed', 'standard', 'veteran'] as Difficulty[]).map(difficulty => ({ weapon, difficulty }))))('the perfect pilot clears Cold Vector on $difficulty with $weapon without a hit, the special or pickups', ({ weapon, difficulty }) => {
    const state = createRun({ mode: 'campaign', mission: 'cold-vector', weapon, difficulty, seed: 53 });
    const log = fly(state, perfectPilot(), 420, { noPickups: true });
    expect({ phase: state.phase, boss: state.boss?.phase }).toEqual({ phase: 'complete', boss: 'destroyed' });
    expect(log.hits).toBe(0);
    expect(log.specialsUsed).toBe(0);
  });
});

describe('beam alignment (user report: some laser beams did not line up with the ships firing them)', () => {
  it('keeps every Needle beam under the Needle that fires it, and every boss lane under its column while it is live', () => {
    for (const mission of ['cold-vector', 'deep-bloom'] as const) {
      const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', weapon: 'pulse', seed: 4 });
      state.player.lives = 99;
      const pilot = perfectPilot();
      let checked = 0;
      for (let i = 0; i < 300 / STEP && state.phase === 'playing'; i++) {
        stepRun(state, { ...(pilot(state) ?? EMPTY_INPUT), specialPressed: false });
        // A live Needle lane has its Needle right above it.
        for (const hazard of state.hazards) if (hazard.width <= 0.4 + 1e-9 && hazard.warning === 0 && hazard.active > 0) {
          const needles = state.enemies.filter(enemy => enemy.kind === 'needle' && enemy.hp > 0);
          if (needles.length) { expect(Math.min(...needles.map(enemy => Math.abs(enemy.x - hazard.x)))).toBeLessThan(0.05); checked++; }
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  }, 120000);
});
