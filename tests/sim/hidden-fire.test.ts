import { describe, expect, it } from 'vitest';
import { DRIFT, FAIRNESS } from '../../src/content/balance';
import { BOSSES, missionBoss, phaseOneParts } from '../../src/content/bosses';
import { EMPTY_INPUT, STEP, VIEW, type MissionId, type RunState } from '../../src/shared/contracts';
import { bossTarget, resolveBossPhase } from '../../src/sim/boss';
import { assessSafety, committedFootprints, hiddenFireFootprints, playerKinematics, steerTo } from '../../src/sim/fairness';
import { createRun } from '../../src/sim/game';
import { EXPECTED_RANK } from './balance-setup';
import { fly, perfectPilot, skilledPilot, type Pilot } from './pilots';

/*
 * Hidden-pilot fire (src/sim/boss.ts updateHiddenFire, docs/10 §5; user, 17 November: "If you stay out of every attack's
 * reach for 2 s, the fortress's small terrace guns fire the boss's existing aimed shots toward you, and the Citadel's do
 * the same, so there's no safe hiding spot"). THE CITADEL (and HELION STRONGHOLD with Vesper's unreleased overhaul) is never pulled toward the view, so a pilot
 * parked at the far edge kept their targets out of view and was never attacked (0 windups in 30 s, docs/10 §5).
 */
// The stationary bosses' missions (HELION STRONGHOLD's cold-vector joins with Vesper's unreleased overhaul, docs/43).
const STATIONARY: readonly MissionId[] = ['silent-empire'];

interface Watch { starts: number; volleys: number; startTimes: number[]; firstHiddenAt: number | null; safety: { reachable: boolean; before: boolean; sealed: boolean; minGap: number }[]; trace: string[] }

/** Counts each windup's start and release, the director's view of the committed hazards at its start, and a trace. */
function watcher(watch: Watch) {
  let previous: NonNullable<RunState['boss']>['hiddenFire'];
  return (state: RunState) => {
    const boss = state.boss, battery = boss?.hiddenFire;
    if (boss?.hiddenSince !== undefined && watch.firstHiddenAt === null) watch.firstHiddenAt = boss.hiddenSince;
    if (battery && battery !== previous) {
      watch.starts++; watch.startTimes.push(state.time);
      const all = committedFootprints(state), volley = new Set(hiddenFireFootprints(state, battery).map(f => `${f.x0}:${f.x1}:${f.t0}:${f.t1}`));
      const report = assessSafety(state, all), before = assessSafety(state, all.filter(f => !volley.has(`${f.x0}:${f.x1}:${f.t0}:${f.t1}`)));
      watch.safety.push({ reachable: report.reachable, before: before.reachable, sealed: report.sealed, minGap: report.minGap });
    }
    if (previous && !battery && previous.warning <= STEP + 1e-9) watch.volleys++;
    watch.trace.push(`${state.tick}:${state.player.x.toFixed(6)}:${battery ? `${battery.x.toFixed(6)},${battery.s.toFixed(6)},${battery.aimX.toFixed(6)},${battery.warning.toFixed(6)}` : '-'}`);
    previous = battery;
  };
}
const newWatch = (): Watch => ({ starts: 0, volleys: 0, startTimes: [], firstHiddenAt: null, safety: [], trace: [] });

/**
 * The parked pilot of drift.test.ts (flee-harness bossScenario): it waits at the right world edge; once the fight opens the
 * modules on its side are down (`far`) or all the first-phase ones (`core`), so no target is left in view.
 */
function parked(mission: MissionId, scenario: 'far' | 'core', seed: number, seconds: number, pilot?: (edge: number) => Pilot) {
  const def = missionBoss(mission)!, state = createRun({ mode: 'campaign', mission, difficulty: 'standard', seed });
  state.time = def.arrivesAt - STEP;
  state.encounterIndex = Number.MAX_SAFE_INTEGER; state.nextEncounterAt = Infinity;
  state.player.lives = 99;
  const edge = VIEW.worldWidth / 2 - 1;
  state.player.x = edge; state.cameraX = (VIEW.worldWidth - VIEW.width) / 2;
  const park: Pilot = s => ({ ...EMPTY_INPUT, horizontal: steerTo(s.player.x, s.player.vx, edge, playerKinematics(s).braking) });
  fly(state, park, def.arrivalDuration + 1, { noPickups: true, until: s => s.boss?.phase === 'batteries' });
  for (const part of phaseOneParts(def)) {
    const target = bossTarget(state, part)!;
    if (scenario === 'core' || target.x >= state.boss!.x - 1e-6) target.hp = 0;
  }
  resolveBossPhase(state);
  const watch = newWatch();
  const log = fly(state, pilot ? pilot(edge) : park, seconds, { noPickups: true, onTick: watcher(watch) });
  return { state, watch, log };
}

describe('hidden-pilot fire (stationary bosses)', () => {
  it('fires on a pilot parked out of reach of every target, from the battery on its side, inside the view', () => {
    for (const mission of STATIONARY) for (const scenario of ['far', 'core'] as const) for (const seed of [1, 2, 3]) {
      const { state, watch } = parked(mission, scenario, seed, 20);
      const label = `${mission} ${scenario} seed ${seed}`;
      expect(watch.starts, label).toBeGreaterThanOrEqual(3);
      expect(watch.volleys, label).toBeGreaterThanOrEqual(3);
      // Not before the pull's own wait (DRIFT.boss.patience) from when the view lost its last target.
      expect(watch.startTimes[0] - watch.firstHiddenAt!, label).toBeGreaterThanOrEqual(DRIFT.boss.patience - 1e-6);
      // A volley every few seconds, not a stream: never closer than the interval plus the windup.
      const fire = BOSSES[state.boss!.id].hiddenFire!;
      for (let i = 1; i < watch.startTimes.length; i++) expect(watch.startTimes[i] - watch.startTimes[i - 1], label).toBeGreaterThanOrEqual(fire.interval);
      // Still stationary, never pulled.
      expect(state.boss!.originX, label).toBe(0);
    }
  });

  it('stops the moment a target is back in view: a pilot that returns toward the middle draws no more of it', () => {
    for (const mission of STATIONARY) {
      // Parked for 6 s, then flies back to the middle and stays there.
      let t0 = -1;
      const comeBack = (edge: number): Pilot => s => {
        if (t0 < 0) t0 = s.time;
        const goal = s.time - t0 < 6 ? edge : 0;
        return { ...EMPTY_INPUT, horizontal: steerTo(s.player.x, s.player.vx, goal, playerKinematics(s).braking) };
      };
      const { watch, state } = parked(mission, 'far', 2, 16, comeBack);
      expect(watch.starts, mission).toBeGreaterThan(0);
      const last = watch.startTimes.at(-1)!;
      expect(last - t0, mission).toBeLessThan(6.5);
      expect(state.boss!.hiddenFire, mission).toBeUndefined();
    }
  });

  it('keeps every volley fair: admitted by the director, a reachable path, no seal, and the sidestepping pilot escapes it', () => {
    for (const mission of STATIONARY) for (const seed of [1, 2]) {
      const { watch } = parked(mission, 'core', seed, 20);
      // The director's own rule (src/sim/fairness.ts admitFootprints): a reachable path, or the pilot was already committed
      // to an unavoidable hit without the volley (this parked pilot never dodges), and never a seal or a gap under the minimum.
      for (const report of watch.safety) {
        expect(report.reachable || !report.before, `${mission} ${seed}`).toBe(true);
        expect(report.sealed, `${mission} ${seed}`).toBe(false);
        expect(report.minGap, `${mission} ${seed}`).toBeGreaterThanOrEqual(FAIRNESS.minGap - 1e-6);
      }
      // A hider that sidesteps each marked volley (2.5 inward, back to the edge once it has passed) is never hit by it.
      const sidestep = (edge: number): Pilot => s => {
        const battery = s.boss?.hiddenFire, live = s.projectiles.some(shot => !shot.friendly && shot.firedBy === undefined && shot.s > -1);
        const goal = battery || live ? edge - 2.5 : edge;
        return { ...EMPTY_INPUT, horizontal: steerTo(s.player.x, s.player.vx, goal, playerKinematics(s).braking) };
      };
      // It is fired on (it stays in the hiding zone), and takes no more hits than the parked pilot did with no battery fire.
      const run = parked(mission, 'core', seed, 20, sidestep);
      expect(run.watch.volleys, `${mission} ${seed}`).toBeGreaterThan(0);
      expect(run.log.hits, `${mission} ${seed} sidestepper hits`).toBeLessThanOrEqual(parkedBaselineHits(mission, seed));
    }
  });

  it('never fires on a pilot in an ordinary fight: the perfect and skilled pilots never trigger it', () => {
    for (const mission of STATIONARY) for (const [name, make] of [['perfect', perfectPilot], ['skilled', skilledPilot]] as const) for (const seed of [21, 22]) {
      const def = missionBoss(mission)!;
      const state = createRun({ mode: 'campaign', mission, difficulty: 'standard', rank: EXPECTED_RANK[mission], seed });
      const watch = newWatch();
      const log = fly(state, make(), def.arrivesAt + 200, { noPickups: true, onTick: watcher(watch) });
      expect(log.bossPhases.destroyed, `${mission} ${name} ${seed} kills the boss`).toBeDefined();
      expect(watch.starts, `${mission} ${name} ${seed}`).toBe(0);
    }
  }, 240_000);

  it('is deterministic: the same flight gives the same volleys, tick for tick', () => {
    for (const mission of STATIONARY) {
      const a = parked(mission, 'far', 4, 15).watch.trace, b = parked(mission, 'far', 4, 15).watch.trace;
      expect(a).toEqual(b);
    }
  });

  it('only stationary bosses have it, and only from their own content (src/content/citadel.ts)', () => {
    for (const def of Object.values(BOSSES)) expect(!!def.hiddenFire, def.id).toBe(!!def.stationary);
    expect(FAIRNESS.retryDelay).toBeGreaterThan(0);
  });
});

/** The parked pilot's hits without any battery fire to dodge (pods and other sources), for the sidestep comparison. */
const baselines = new Map<string, number>();
function parkedBaselineHits(mission: MissionId, seed: number): number {
  const key = `${mission}:${seed}`;
  if (!baselines.has(key)) {
    const def = BOSSES[missionBoss(mission)!.id], saved = def.hiddenFire;
    (def as { hiddenFire?: typeof saved }).hiddenFire = undefined;
    try { baselines.set(key, parked(mission, 'core', seed, 20).log.hits); } finally { (def as { hiddenFire?: typeof saved }).hiddenFire = saved; }
  }
  return baselines.get(key)!;
}
