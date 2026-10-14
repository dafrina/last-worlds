import { describe, expect, it } from 'vitest';
import { BALANCE, DIFFICULTIES, ENEMIES, FAIRNESS, THREAT_COST, difficultyScales } from '../../src/content/balance';
import { BASTION } from '../../src/content/bastion';
import { ALERT_LEAD, ENDLESS_SECTORS, ROLLING_THUNDER, TRAINING, campaignPlaylist, cueAlert, cueRoster, endlessPlaylist, type EncounterCue } from '../../src/content/encounters';
import { FORMATIONS, FORMATION_IDS, slotFlies, type FormationId, type FormationTemplate } from '../../src/content/formations';
import { VIEW, type Difficulty, type RunConfig, type RunState } from '../../src/shared/contracts';
import { BOSS_BEAM, ENEMY_SHOT_RADIUS, LANCER_BEAM } from '../../src/sim/attacks';
import { createRun, spawnFormation, stepRun } from '../../src/sim/game';
import { memberPosition } from '../../src/sim/motion';
import { FairnessTrace } from './fairness-trace';
import { dodgerPilot, fly, idlePilot, perfectPilot, type Pilot } from './pilots';

const DIFFICULTY_IDS: readonly Difficulty[] = ['relaxed', 'standard', 'veteran'];
const R = VIEW.playerRadius;

/** Every scale the content can fly at: three campaign settings plus the first and capped endless sectors. */
const SCALES = [
  ...DIFFICULTY_IDS.map(difficulty => ({ label: difficulty, scale: difficultyScales('campaign', difficulty, 1) })),
  ...[1, 2, 3, 4, 9, 30].map(sector => ({ label: `endless-s${sector}`, scale: difficultyScales('endless', 'standard', sector) })),
];

function summary(trace: FairnessTrace) {
  return trace.violations.slice(0, 5).map(v => `${v.rule}@${v.time.toFixed(2)}: ${v.detail}`).join('\n');
}

describe('authored formation content', () => {
  const ids = FORMATION_IDS;

  it('has unique ids, ordered keyframes, and members that enter from where the template says', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const template: FormationTemplate = FORMATIONS[id];
      expect(template.id).toBe(id);
      for (let i = 1; i < template.path.length; i += 1) expect(template.path[i][0]).toBeGreaterThan(template.path[i - 1][0]);
      expect(template.fireUntil).toBeGreaterThan(template.fireFrom);
      expect(template.slots.length).toBeGreaterThan(0);
      for (const [slot, member] of template.slots.map((slot, index) => [slot, { template: id, slot: index, anchorX: 0, mirror: 1 as const }] as const)) {
        const at = memberPosition(member, 0);
        // Never spawn inside the view or behind the player: above it, beside it, or on the scrolling ground.
        if (template.entry === 'top') expect(at.s, `${id} slot ${member.slot}`).toBeGreaterThan(VIEW.maxS + 0.5);
        if (template.entry === 'side' || template.entry === 'both') expect(Math.abs(at.x), `${id} slot ${member.slot}`).toBeGreaterThan(VIEW.width / 2 + 1);
        if (template.entry === 'ground') {
          expect(slot.kind).toBe('turret');
          expect(at.s).toBeGreaterThan(VIEW.maxS);
          const later = memberPosition(member, 1);
          expect(at.s - later.s).toBeCloseTo(VIEW.scrollSpeed, 6);
        }
        const end = template.path[template.path.length - 1][0] + (slot.lag ?? 0);
        const exit = memberPosition(member, end);
        expect(exit.s > VIEW.maxS + 1 || exit.s < VIEW.minS || Math.abs(exit.x) > VIEW.width / 2 + 1, `${id} slot ${member.slot} exits the view`).toBe(true);
      }
      if (template.entry === 'both') {
        expect(template.alert, `${id} needs a readable two-flank alert`).toBeTruthy();
        expect(template.slots.some(slot => slot.flip)).toBe(true);
        expect(template.slots.some(slot => !slot.flip)).toBe(true);
      }
    }
  });

  it('keeps every member inside the view while its authored windup can start, and staggers volleys', () => {
    for (const id of ids) {
      const template = FORMATIONS[id];
      for (const rank of ['standard', 'veteran'] as const) {
        const flying = template.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slotFlies(slot, rank));
        const starts = flying.map(({ slot }) => (slot.lag ?? 0) + template.fireFrom + slot.fire).sort((a, b) => a - b);
        // Members are staggered: no two windups of one squadron begin within 0.3 s of each other.
        for (let i = 1; i < starts.length; i += 1) expect(starts[i] - starts[i - 1], `${id} ${rank} stagger`).toBeGreaterThanOrEqual(0.3 - 1e-9);
        // Squadrons that hold a row (no lateral path motion) keep every member in view while they may fire.
        const holds = template.path.every(([, x]) => x === template.path[0][1]);
        for (const { slot, index } of flying) {
          if (!holds) continue;
          const radius = ENEMIES[slot.kind].radius;
          for (let t = template.fireFrom; t <= template.fireUntil; t += 0.05) {
            const at = memberPosition({ template: id, slot: index, anchorX: 0, mirror: 1 }, (slot.lag ?? 0) + t);
            expect(Math.abs(at.x), `${id} slot ${index} in view at path time ${t.toFixed(2)}`).toBeLessThanOrEqual(VIEW.width / 2 - radius - 0.2);
          }
        }
        for (const { slot, index } of flying) {
          const at = memberPosition({ template: id, slot: index, anchorX: 0, mirror: 1 }, (slot.lag ?? 0) + template.fireFrom + slot.fire);
          const radius = ENEMIES[slot.kind].radius;
          expect(Math.abs(at.x), `${id} slot ${index} lateral`).toBeLessThanOrEqual(VIEW.width / 2 - radius - 0.2);
          expect(at.s, `${id} slot ${index} forward`).toBeGreaterThan(3.5);
          expect(at.s, `${id} slot ${index} forward`).toBeLessThanOrEqual(VIEW.maxS - radius - 0.2);
        }
      }
    }
  });
});

describe('warning and aim-lock floors', () => {
  it('holds the readable-warning floor for every attack at every scale, with Veteran never below Standard', () => {
    for (const { label, scale } of SCALES) {
      for (const kind of ['dart', 'weaver', 'turret'] as const) {
        expect(ENEMIES[kind].warning + scale.warning, `${kind} ${label}`).toBeGreaterThanOrEqual(FAIRNESS.warningFloor);
      }
      expect(ENEMIES.lancer.warning + scale.warning + LANCER_BEAM.warning, `lancer ${label}`).toBeGreaterThanOrEqual(FAIRNESS.beamWarningFloor);
      expect(scale.warning).toBeGreaterThanOrEqual(0);
    }
    expect(DIFFICULTIES.veteran.warning).toBe(DIFFICULTIES.standard.warning);
    expect(BASTION.warning).toBeGreaterThanOrEqual(FAIRNESS.warningFloor);
    expect(BASTION.beamWarning + BOSS_BEAM.warning).toBeGreaterThanOrEqual(FAIRNESS.beamWarningFloor);
  });

  it('keeps at least 0.30 s between aim lock and the earliest possible impact at the fastest scale', () => {
    // Aim locks when the windup starts. The closest legal release row is s = 3.5.
    const fastest = Math.max(...SCALES.map(entry => entry.scale.shotSpeed));
    for (const kind of ['dart', 'weaver', 'turret'] as const) {
      const travel = (3.5 - 0.2 - (R + ENEMY_SHOT_RADIUS)) / (ENEMIES[kind].shotSpeed * fastest);
      expect(ENEMIES[kind].warning + travel, kind).toBeGreaterThanOrEqual(FAIRNESS.lockFloor);
      expect(travel, `${kind} release-to-impact`).toBeGreaterThan(0.2);
    }
  });
});

describe('authored cue sequences', () => {
  const sequences: [string, readonly EncounterCue[]][] = [
    ['training', TRAINING], ['rolling-thunder', ROLLING_THUNDER],
    ['endless-opening', ENDLESS_SECTORS.opening], ['endless-pressure', ENDLESS_SECTORS.pressure], ['endless-peak', ENDLESS_SECTORS.peak],
  ];

  it.each(sequences)('%s follows intro, pressure, recovery, pressure, climax, recovery', (_name, cues) => {
    const arc: string[] = [];
    for (const cue of cues) if (arc[arc.length - 1] !== cue.phase) arc.push(cue.phase);
    expect(arc).toEqual(['intro', 'pressure', 'recovery', 'pressure', 'climax', 'recovery']);
    expect(new Set(cues.map(cue => cue.id)).size).toBe(cues.length);
    for (let i = 1; i < cues.length; i += 1) expect(cues[i].at).toBeGreaterThan(cues[i - 1].at);
    // Recovery cues stay light, and the next cue waits for the recovery interval.
    cues.forEach((cue, index) => {
      if (cue.phase !== 'recovery') return;
      expect(cueRoster(cue, 'veteran').reduce((sum, kind) => sum + THREAT_COST[kind], 0), cue.id).toBeLessThanOrEqual(6);
      const next = cues[index + 1];
      if (next) expect(next.at - cue.at, `${cue.id} recovery interval`).toBeGreaterThanOrEqual(5);
    });
  });

  it('fits every cue in the entity ceiling and the threat budget of each scale that flies it', () => {
    const check = (cues: readonly EncounterCue[], scale: ReturnType<typeof difficultyScales>, label: string) => {
      for (const cue of cues) {
        const roster = cueRoster(cue, scale.rank);
        expect(roster.length, `${label} ${cue.id}`).toBeLessThanOrEqual(BALANCE.maxEnemies);
        expect(roster.reduce((sum, kind) => sum + THREAT_COST[kind], 0), `${label} ${cue.id}`).toBeLessThanOrEqual(scale.threatBudget);
      }
    };
    for (const difficulty of DIFFICULTY_IDS) for (const mission of ['training', 'bastion'] as const) check(campaignPlaylist(mission), DIFFICULTIES[difficulty], `${mission}/${difficulty}`);
    for (const sector of [1, 2, 3, 4, 9]) check(endlessPlaylist(sector), difficultyScales('endless', 'standard', sector), `endless/${sector}`);
  });

  it('keeps every view-anchored placement variant (offset and mirror) inside the view at its windups', () => {
    for (const [name, cues] of sequences) for (const cue of cues) for (const placement of cue.formations) {
      if (placement.anchor === 'world') continue;
      const template = FORMATIONS[placement.formation];
      const offset = placement.x ?? 0;
      expect(Math.abs(offset), `${name} ${cue.id} offset`).toBeLessThanOrEqual(2);
      template.slots.forEach((slot, index) => {
        const at = memberPosition({ template: template.id, slot: index, anchorX: offset, mirror: placement.mirror ? -1 : 1 }, (slot.lag ?? 0) + template.fireFrom + slot.fire);
        expect(Math.abs(at.x), `${name} ${cue.id} slot ${index}`).toBeLessThanOrEqual(VIEW.width / 2 - ENEMIES[slot.kind].radius - 0.2);
      });
    }
  });

  it('ends the Rolling Thunder approach before the fortress relief and guarantees endless opportunities', () => {
    expect(ROLLING_THUNDER[ROLLING_THUNDER.length - 1].at).toBeLessThan(BASTION.approachEndsAt);
    const opening = ENDLESS_SECTORS.opening;
    expect(opening.find(cue => cue.pickup?.kind === 'power')!.at).toBeLessThanOrEqual(20);
    expect(opening.find(cue => cue.pickup?.kind === 'weapon')!.at).toBeLessThanOrEqual(30);
    for (const cues of Object.values(ENDLESS_SECTORS)) expect(cues[cues.length - 1].at).toBeLessThan(BALANCE.sectorDuration);
  });

  it('announces every two-flank pincer before any member enters, and re-announces after an interruption', () => {
    const state = createRun({ mode: 'endless', seed: 3 });
    state.player.invulnerableUntil = Infinity;
    const pincer = ENDLESS_SECTORS.opening.findIndex(cue => cueAlert(cue));
    expect(pincer).toBeGreaterThan(0);
    const cue = ENDLESS_SECTORS.opening[pincer];
    const alert = cueAlert(cue)!;
    let alertAt: number | null = null;
    let entered: number | null = null;
    while (state.time < cue.at + 6 && entered === null) {
      stepRun(state, { horizontal: 0, specialPressed: false, pausePressed: false });
      if (state.message === alert && alertAt === null) alertAt = state.time;
      if (state.enemies.some(enemy => enemy.formation?.template === 'pincer-4')) entered = state.time;
      // An unrelated message overwrites the alert once: the full lead must restart.
      if (alertAt !== null && state.time - alertAt > 0.5 && state.time - alertAt < 0.5 + 1 / 60) state.message = 'SHIELD CELL AHEAD';
    }
    expect(alertAt).not.toBeNull();
    expect(entered).not.toBeNull();
    expect(entered! - alertAt!).toBeGreaterThanOrEqual(0.5 + ALERT_LEAD - 1e-6);
  });
});

/* ------------------------------------------------------------------------------------------------------ */

function quiet(config: RunConfig, sector = 1): RunState {
  const state = createRun(config);
  if (config.mode === 'endless' && sector > 1) {
    state.time = (sector - 1) * BALANCE.sectorDuration + 0.5;
    state.distance = state.time * VIEW.scrollSpeed;
    state.sector = sector;
  }
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

interface Branch { name: string; make: () => Pilot }
const BRANCHES: readonly Branch[] = [
  { name: 'perfect', make: perfectPilot },
  { name: 'idle', make: idlePilot },
  { name: 'dodger', make: dodgerPilot },
];

function flyFormation(id: FormationId, mirror: boolean, config: RunConfig, sector: number, startX: number, branch: Branch) {
  const state = quiet(config, sector);
  placePlayer(state, startX);
  spawnFormation(state, { formation: id, mirror });
  const trace = new FairnessTrace();
  const log = fly(state, branch.make(), formationDuration(id), { noPickups: true, onTick: s => trace.observe(s) });
  trace.finish(state);
  return { state, log, trace };
}

describe('formation hazard unions (isolated squadrons)', () => {
  const cases = FORMATION_IDS.flatMap(id => [false, true].map(mirror => ({ id, mirror })));
  const scales: { label: string; config: RunConfig; sector: number }[] = [
    ...DIFFICULTY_IDS.map(difficulty => ({ label: difficulty, config: { mode: 'campaign' as const, mission: 'training' as const, difficulty, seed: 9 }, sector: 1 })),
    { label: 'endless-capped', config: { mode: 'endless', seed: 9 }, sector: 9 },
  ];

  it.each(cases)('$id (mirror $mirror): reachable 1.4 gap, no seal, warning/lock floors, on every branch', ({ id, mirror }) => {
    for (const { label, config, sector } of scales) {
      const starts = label === 'standard' ? [-3, 0, 3, 15] : [0];
      for (const startX of starts) {
        for (const branch of BRANCHES) {
          if (branch.name !== 'perfect' && startX !== 0) continue;
          const { log, trace } = flyFormation(id, mirror, config, sector, startX, branch);
          const where = `${id} mirror=${mirror} ${label} start=${startX} ${branch.name}`;
          expect(trace.violations, `${where}\n${summary(trace)}`).toEqual([]);
          if (branch.name === 'perfect') expect(log.hits, `${where}: the solver found no clear path`).toBe(0);
        }
      }
    }
  });
});

describe('cue sequence hazard unions', () => {
  const runs: { label: string; config: RunConfig; seconds: number; sector: number }[] = [
    ...DIFFICULTY_IDS.flatMap(difficulty => [
      { label: `training/${difficulty}`, config: { mode: 'campaign' as const, mission: 'training' as const, difficulty, seed: 21 }, seconds: 121, sector: 1 },
      { label: `rolling-thunder/${difficulty}`, config: { mode: 'campaign' as const, mission: 'bastion' as const, difficulty, seed: 21 }, seconds: 300, sector: 1 },
    ]),
    { label: 'endless sectors 1-4', config: { mode: 'endless', seed: 21 }, seconds: 360, sector: 1 },
    { label: 'endless capped sector 9', config: { mode: 'endless', seed: 21 }, seconds: 90, sector: 9 },
  ];

  it.each(runs)('$label keeps the union fair on the perfect, idle and dodger branches', ({ label, config, seconds, sector }) => {
    for (const branch of BRANCHES) {
      const state = createRun(config);
      if (sector > 1) { state.time = (sector - 1) * BALANCE.sectorDuration - 1 / 60; state.distance = state.time * VIEW.scrollSpeed; state.sector = sector - 1; }
      // Idle and dodger branches keep flying after losing lives so the whole schedule is exercised.
      if (branch.name !== 'perfect') state.player.lives = 99;
      const trace = new FairnessTrace();
      const log = fly(state, branch.make(), seconds, { noPickups: true, onTick: s => trace.observe(s) });
      trace.finish(state);
      expect(trace.violations, `${label} ${branch.name}\n${summary(trace)}`).toEqual([]);
      expect(trace.windups).toBeGreaterThan(20);
      if (branch.name === 'perfect') {
        expect(log.livesLost, `${label} perfect pilot`).toBe(0);
        expect(log.specialsUsed).toBe(0);
      }
    }
  });
});
