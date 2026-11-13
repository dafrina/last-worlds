import { expect } from 'vitest';
import { BALANCE, difficultyScales } from '../../src/content/balance';
import { FORMATIONS, type FormationId } from '../../src/content/formations';
import { VIEW, type Difficulty, type RunConfig, type RunState } from '../../src/shared/contracts';
import { createRun, spawnFormation } from '../../src/sim/game';
import { FairnessTrace } from './fairness-trace';
import { dodgerPilot, enterSector, fly, idlePilot, perfectPilot, type Pilot } from './pilots';

/*
 * Shared setup of the fairness suites (split for parallel runs, docs/38 T1): fairness-formations, fairness-campaign,
 * fairness-endless-early and fairness-endless-late.
 */

export const DIFFICULTY_IDS: readonly Difficulty[] = ['relaxed', 'standard', 'veteran'];
export const WORLD_EDGE = VIEW.worldWidth / 2 - VIEW.playerRadius;
export const R = VIEW.playerRadius;

/** Every scale the content can fly at: three campaign settings plus the first and capped endless sectors. */
export const SCALES = [
  ...DIFFICULTY_IDS.map(difficulty => ({ label: difficulty, scale: difficultyScales('campaign', difficulty, 1) })),
  ...[1, 2, 3, 4, 9, 30].map(sector => ({ label: `endless-s${sector}`, scale: difficultyScales('endless', 'standard', sector) })),
];

export function summary(trace: FairnessTrace) {
  return trace.violations.slice(0, 5).map(v => `${v.rule}@${v.time.toFixed(2)}: ${v.detail}`).join('\n');
}

function quiet(config: RunConfig, sector = 1): RunState {
  const state = createRun(config);
  if (config.mode === 'endless') enterSector(state, sector);
  state.encounterIndex = Number.MAX_SAFE_INTEGER;
  state.nextEncounterAt = Infinity;
  return state;
}

function placePlayer(state: RunState, x: number) {
  state.player.x = x;
  const limit = (VIEW.worldWidth - VIEW.width) / 2;
  const offset = x - state.cameraX;
  if (Math.abs(offset) > BALANCE.camera.deadZone) state.cameraX = Math.max(-limit, Math.min(limit, x - Math.sign(offset) * BALANCE.camera.deadZone));
}

function formationDuration(id: FormationId): number {
  const template = FORMATIONS[id];
  return template.path[template.path.length - 1][0] + Math.max(0, ...template.slots.map(slot => slot.lag ?? 0)) + 4;
}

/**
 * `noFire`: the pacifist branch (docs/40): the perfect pilot's evasion with every friendly shot removed, so no enemy dies
 * before it attacks and every pattern is flown in full. Fairness must never depend on killing a threat first.
 */
export interface Branch { name: string; make: () => Pilot; noFire?: boolean }
export const BRANCHES: readonly Branch[] = [
  { name: 'perfect', make: perfectPilot },
  { name: 'idle', make: idlePilot },
  { name: 'dodger', make: dodgerPilot },
  { name: 'pacifist', make: perfectPilot, noFire: true },
];

export function flyFormation(id: FormationId, mirror: boolean, config: RunConfig, sector: number, startX: number, branch: Branch) {
  const state = quiet(config, sector);
  placePlayer(state, startX);
  spawnFormation(state, { formation: id, mirror });
  const trace = new FairnessTrace();
  const log = fly(state, branch.make(), formationDuration(id), { noPickups: true, noFire: branch.noFire, onTick: s => trace.observe(s) });
  trace.finish(state);
  return { state, log, trace };
}

/** One cue-sequence run of the hazard-union suites: a mission or an endless stretch, flown on every branch. */
export interface UnionRun { label: string; config: RunConfig; seconds: number; sector: number; bosses?: string[]; planets?: string[]; perfectLives?: number }

export const UNION_TITLE = '$label keeps the union fair on the perfect, idle, dodger and pacifist branches';

/** Flies one run on the perfect, idle and dodger branches and checks its hazard union and what it reached. */
export function checkUnion({ label, config, seconds, sector, bosses, planets, perfectLives = 0 }: UnionRun) {
  for (const branch of BRANCHES) {
    const state = enterSector(createRun(config), sector);
    // Idle and dodger branches keep flying after losing lives so the whole schedule is exercised.
    if (branch.name !== 'perfect') state.player.lives = 99;
    const trace = new FairnessTrace();
    const seenBosses = new Set<string>();
    const seenPlanets = new Set<string>();
    const log = fly(state, branch.make(), seconds, { noPickups: true, noFire: branch.noFire, onTick: s => {
      trace.observe(s);
      if (s.boss) seenBosses.add(s.boss.id);
      if (!s.jump && s.enemies.some(enemy => !enemy.bossPart)) seenPlanets.add(s.planet);
    } });
    trace.finish(state);
    if (branch.noFire) {
      // The pacifist (docs/40): the union stays fair when nothing is killed and every attack flies in full. It is not held
      // to the view-relative seal heuristic: with nothing dying, its own drift can move the view onto a squadron's
      // authored dive after the director admitted a volley in the view it had then (Dying Star, Relaxed, seed 21,
      // 60.9 s: a scramble dart grazes the left strip by 0.05; the pacifist is never hit there). Its hits measure the
      // pilot, not the content (docs/40 § pilot): they are reported, not asserted.
      expect(trace.violations.filter(v => v.rule !== 'seal'), `${label} ${branch.name}\n${summary(trace)}`).toEqual([]);
    } else expect(trace.violations, `${label} ${branch.name}\n${summary(trace)}`).toEqual([]);
    expect(trace.windups).toBeGreaterThan(20);
    // The endless runs really fly their boss fights and their planets' squadrons: every branch reaches the
    // first boss; only a branch that kills it continues to the next planet.
    const reach = (list: string[]) => (branch.name === 'perfect' ? list : list.slice(0, 1));
    if (bosses) expect([...seenBosses], `${label} ${branch.name} bosses`).toEqual(expect.arrayContaining(reach(bosses)));
    if (planets) expect([...seenPlanets], `${label} ${branch.name} planets`).toEqual(expect.arrayContaining(reach(planets)));
    if (branch.name === 'perfect' && bosses?.length === 2) expect(state.sector, `${label} reaches sector 7`).toBe(7);
    if (branch.name === 'perfect') {
      expect(log.livesLost, `${label} perfect pilot`).toBeLessThanOrEqual(perfectLives);
      expect(log.specialsUsed).toBe(0);
    }
  }
}
