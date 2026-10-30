import { describe, expect, it } from 'vitest';
import { BALANCE, DIFFICULTIES, ENEMIES, FAIRNESS, GROUND_KINDS, THREAT_COST, difficultyScales } from '../../src/content/balance';
import { HELION_ARK } from '../../src/content/ark';
import { BASTION } from '../../src/content/bastion';
import { ALERT_LEAD, cueAlert, cueRoster, type EncounterCue } from '../../src/content/encounters';
import { CAMPAIGN_DECKS, ENDLESS_DECKS, resolvePlaylist, resolveTemplate, slotAt } from '../../src/content/encounter-deck';
import { FORMATIONS, FORMATION_IDS, slotFlies, type FormationId, type FormationTemplate } from '../../src/content/formations';
import { VIEW, type Difficulty, type RunConfig, type RunState } from '../../src/shared/contracts';
import { BOSS_BEAM, ENEMY_SHOT_RADIUS, LANCER_BEAM } from '../../src/sim/attacks';
import { createRun, spawnFormation, stepRun } from '../../src/sim/game';
import { memberPosition } from '../../src/sim/motion';
import { FairnessTrace } from './fairness-trace';
import { dodgerPilot, enterSector, fly, idlePilot, perfectPilot, type Pilot } from './pilots';

const DIFFICULTY_IDS: readonly Difficulty[] = ['relaxed', 'standard', 'veteran'];
const WORLD_EDGE = VIEW.worldWidth / 2 - VIEW.playerRadius;
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
      if (!template.harmless) expect(template.fireUntil).toBeGreaterThan(template.fireFrom);
      expect(template.slots.length).toBeGreaterThan(0);
      // Bay launches are measured from the Helion Ark's row, their real anchor.
      const anchorS = template.entry === 'bay' ? HELION_ARK.row : undefined;
      for (const [slot, member] of template.slots.map((slot, index) => [slot, { template: id, slot: index, anchorX: 0, mirror: 1 as const, group: 0, anchorS }] as const)) {
        const at = memberPosition(member, 0);
        // Never spawn inside the view or behind the player: above it, beside it, or on the scrolling ground.
        if (template.entry === 'top') expect(at.s, `${id} slot ${member.slot}`).toBeGreaterThan(VIEW.maxS + 0.5);
        if (template.entry === 'side' || template.entry === 'both') expect(Math.abs(at.x), `${id} slot ${member.slot}`).toBeGreaterThan(VIEW.width / 2 + 1);
        if (template.entry === 'ground') {
          expect(GROUND_KINDS.has(slot.kind), `${id} slot ${member.slot} is a ground kind`).toBe(true);
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
      if (template.harmless) continue;
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
            const at = memberPosition({ template: id, slot: index, anchorX: 0, mirror: 1, group: 0, anchorS: template.entry === 'bay' ? HELION_ARK.row : undefined }, (slot.lag ?? 0) + t);
            expect(Math.abs(at.x), `${id} slot ${index} in view at path time ${t.toFixed(2)}`).toBeLessThanOrEqual(VIEW.width / 2 - radius - 0.2);
          }
        }
        for (const { slot, index } of flying) {
          const at = memberPosition({ template: id, slot: index, anchorX: 0, mirror: 1, group: 0, anchorS: template.entry === 'bay' ? HELION_ARK.row : undefined }, (slot.lag ?? 0) + template.fireFrom + slot.fire);
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
  /*
   * The encounter deck (docs/33 § 4) resolves each arc per attempt: every check below runs on the lists real runs fly,
   * for a spread of seeds.
   */
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
  const arcs = { ...CAMPAIGN_DECKS, ...ENDLESS_DECKS };
  const resolvedArcs = (names: readonly (keyof typeof arcs)[]) => names.flatMap(name => SEEDS.map(seed => [`${name}/${seed}`, resolveTemplate(arcs[name], seed)] as [string, readonly EncounterCue[]]));
  const sequences = resolvedArcs(['training', 'bastion', 'deep-bloom', 'cold-vector', 'brood-strike', 'final-horizon',
    'khepriOpening', 'khepriPressure', 'khepriPeak', 'vesperOpening', 'vesperPressure', 'vesperPeak']);

  it.each(sequences.filter((_, i) => i % SEEDS.length < 3))('%s follows intro, pressure, recovery, pressure, climax, recovery', (_name, cues) => {
    const arc: string[] = [];
    for (const cue of cues) if (arc[arc.length - 1] !== cue.phase) arc.push(cue.phase);
    expect(arc).toEqual(['intro', 'pressure', 'recovery', 'pressure', 'climax', 'recovery']);
  });

  it('keeps ids unique, times ordered, recoveries light and followed by the recovery interval, on every seed', () => {
    for (const [name, cues] of sequences) {
      expect(new Set(cues.map(cue => cue.id)).size, name).toBe(cues.length);
      for (let i = 1; i < cues.length; i += 1) expect(cues[i].at, name).toBeGreaterThan(cues[i - 1].at);
      // Recovery cues stay light (a strike site's guard is heavier by design, docs/33 § 3: it stands off the main lane and
      // fits the lightest threat budget, tests/sim/sites.test.ts), and the next cue waits for the recovery interval.
      cues.forEach((cue, index) => {
        if (cue.phase !== 'recovery') return;
        if (!cue.site) expect(cueRoster(cue, 'veteran').reduce((sum, kind) => sum + THREAT_COST[kind], 0), `${name} ${cue.id}`).toBeLessThanOrEqual(6);
        const next = cues[index + 1];
        if (next) expect(next.at - cue.at, `${name} ${cue.id} recovery interval`).toBeGreaterThanOrEqual(5);
      });
    }
  });

  it('fits every cue in the entity ceiling and the threat budget of each scale that flies it', () => {
    const check = (cues: readonly EncounterCue[], scale: ReturnType<typeof difficultyScales>, label: string) => {
      for (const cue of cues) {
        const roster = cueRoster(cue, scale.rank);
        expect(roster.length, `${label} ${cue.id}`).toBeLessThanOrEqual(BALANCE.maxEnemies);
        expect(roster.reduce((sum, kind) => sum + THREAT_COST[kind], 0), `${label} ${cue.id}`).toBeLessThanOrEqual(scale.threatBudget);
      }
    };
    for (const seed of SEEDS) {
      for (const difficulty of DIFFICULTY_IDS) for (const mission of Object.keys(CAMPAIGN_DECKS) as (keyof typeof CAMPAIGN_DECKS)[]) {
        check(resolvePlaylist({ mode: 'campaign', mission }, 1, seed), DIFFICULTIES[difficulty], `${mission}/${difficulty}/${seed}`);
      }
      for (let sector = 1; sector <= 13; sector += 1) check(resolvePlaylist({ mode: 'endless' }, sector, seed), difficultyScales('endless', 'standard', sector), `endless/${sector}/${seed}`);
    }
  });

  it('keeps every view-anchored placement variant (offset and mirror) inside the view at its windups', () => {
    for (const [name, cues] of sequences) for (const cue of cues) for (const placement of cue.formations) {
      if (placement.anchor === 'world') continue;
      const template = FORMATIONS[placement.formation];
      if (template.harmless) continue;
      const offset = placement.x ?? 0;
      expect(Math.abs(offset), `${name} ${cue.id} offset`).toBeLessThanOrEqual(2);
      template.slots.forEach((slot, index) => {
        const at = memberPosition({ template: template.id, slot: index, anchorX: offset, mirror: placement.mirror ? -1 : 1, group: 0 }, (slot.lag ?? 0) + template.fireFrom + slot.fire);
        expect(Math.abs(at.x), `${name} ${cue.id} slot ${index}`).toBeLessThanOrEqual(VIEW.width / 2 - ENEMIES[slot.kind].radius - 0.2);
      });
    }
  });

  it('ends the Rolling Thunder approach before the fortress relief and guarantees endless opportunities', () => {
    const thunder = CAMPAIGN_DECKS.bastion.slots;
    expect(slotAt(thunder[thunder.length - 1])).toBeLessThan(BASTION.approachEndsAt);
    for (const seed of SEEDS) {
      const opening = resolveTemplate(ENDLESS_DECKS.khepriOpening, seed);
      expect(opening.find(cue => cue.pickup?.kind === 'power')!.at).toBeLessThanOrEqual(20);
      expect(opening.find(cue => cue.pickup?.kind === 'weapon')!.at).toBeLessThanOrEqual(30);
    }
    for (const deck of Object.values(ENDLESS_DECKS)) expect(slotAt(deck.slots[deck.slots.length - 1])).toBeLessThan(BALANCE.sectorDuration);
  });

  it('announces every two-flank pincer before any member enters, and re-announces after an interruption', () => {
    // A pilot that clears squadrons keeps the airspace moving so the pincer cue is reached in its sector.
    const state = createRun({ mode: 'campaign', mission: 'training', seed: 3 });
    state.player.invulnerableUntil = Infinity;
    const training = resolvePlaylist(state.config, 1, state.config.seed);
    const pincer = training.findIndex(cue => cueAlert(cue));
    expect(pincer).toBeGreaterThan(0);
    const alert = cueAlert(training[pincer])!;
    const pilot = perfectPilot();
    let alertAt: number | null = null;
    let entered: number | null = null;
    let interrupted = false;
    while (state.phase === 'playing' && entered === null) {
      stepRun(state, pilot(state));
      if (state.message === alert && alertAt === null) alertAt = state.time;
      if (state.enemies.some(enemy => enemy.formation?.template === 'pincer-4')) entered = state.time;
      // An unrelated message overwrites the alert once: the full lead must restart.
      if (alertAt !== null && !interrupted && state.time - alertAt > 0.5) { state.message = 'SHIELD CELL AHEAD'; interrupted = true; }
    }
    expect(alertAt).not.toBeNull();
    expect(entered).not.toBeNull();
    expect(entered! - alertAt!).toBeGreaterThanOrEqual(0.5 + ALERT_LEAD - 1e-6);
  });
});

/* ------------------------------------------------------------------------------------------------------ */

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
  // Bay launches only fly from the Helion Ark; the Cold Vector boss runs cover them.
  const cases = FORMATION_IDS.filter(id => FORMATIONS[id].entry !== 'bay').flatMap(id => [false, true].map(mirror => ({ id, mirror })));
  const scales: { label: string; config: RunConfig; sector: number }[] = [
    ...DIFFICULTY_IDS.map(difficulty => ({ label: difficulty, config: { mode: 'campaign' as const, mission: 'training' as const, difficulty, seed: 9 }, sector: 1 })),
    // Sector 10 flies every capped endless scale and the capped pace, with no boss due in it.
    { label: 'endless-capped', config: { mode: 'endless', seed: 9 }, sector: 10 },
  ];

  it.each(cases)('$id (mirror $mirror): reachable 1.4 gap, no seal, warning/lock floors, on every branch', ({ id, mirror }) => {
    for (const { label, config, sector } of scales) {
      const starts = label === 'standard' ? [-3, 0, 3, WORLD_EDGE - 0.5] : [0];
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
  const runs: { label: string; config: RunConfig; seconds: number; sector: number; bosses?: string[]; planets?: string[] }[] = [
    ...DIFFICULTY_IDS.flatMap(difficulty => [
      { label: `training/${difficulty}`, config: { mode: 'campaign' as const, mission: 'training' as const, difficulty, seed: 21 }, seconds: 260, sector: 1 },
      { label: `rolling-thunder/${difficulty}`, config: { mode: 'campaign' as const, mission: 'bastion' as const, difficulty, seed: 21 }, seconds: 300, sector: 1 },
      { label: `deep-bloom/${difficulty}`, config: { mode: 'campaign' as const, mission: 'deep-bloom' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `brood-strike/${difficulty}`, config: { mode: 'campaign' as const, mission: 'brood-strike' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `final-horizon/${difficulty}`, config: { mode: 'campaign' as const, mission: 'final-horizon' as const, difficulty, seed: 21 }, seconds: 400, sector: 1 },
      { label: `cold-vector/${difficulty}`, config: { mode: 'campaign' as const, mission: 'cold-vector' as const, difficulty, seed: 21 }, seconds: 330, sector: 1 },
    ]),
    // Sectors 1-5: the Luna prologue and WARDEN-1, the jump, Khepri, Bastion-9, the jump into Vesper. Endless continues
    // only after a kill, so only the perfect branch gets past WARDEN-1; the idle and dodger branches stay in its fight.
    { label: 'endless sectors 1-5', config: { mode: 'endless', seed: 21 }, seconds: 760, sector: 1, bosses: ['warden', 'bastion'], planets: ['luna', 'khepri', 'vesper'] },
    // Each planet's first stint on every branch, ending in its boss fight.
    { label: 'endless sectors 2-4 (Khepri, Bastion-9)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 2, bosses: ['bastion'], planets: ['khepri'] },
    { label: 'endless sectors 5-7 (Vesper, Helion Ark)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 5, bosses: ['ark'], planets: ['vesper'] },
    { label: 'endless sectors 8-10 (Nacre, THE VEIL)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 8, bosses: ['veil'], planets: ['nacre'] },
    // Later visits (peak playlists, capped ramp): Khepri's Bastion-9, then Vesper and Nacre.
    { label: 'endless capped sector 13 (Bastion-9)', config: { mode: 'endless', seed: 21 }, seconds: 160, sector: 13, bosses: ['bastion'], planets: ['khepri'] },
    { label: 'endless capped sectors 14-16 (Vesper, Helion Ark)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 14, bosses: ['ark'], planets: ['vesper'] },
    { label: 'endless capped sectors 17-19 (Nacre, THE VEIL)', config: { mode: 'endless', seed: 21 }, seconds: 340, sector: 17, bosses: ['veil'], planets: ['nacre'] },
  ];

  it.each(runs)('$label keeps the union fair on the perfect, idle and dodger branches', ({ label, config, seconds, sector, bosses, planets }) => {
    for (const branch of BRANCHES) {
      const state = enterSector(createRun(config), sector);
      // Idle and dodger branches keep flying after losing lives so the whole schedule is exercised.
      if (branch.name !== 'perfect') state.player.lives = 99;
      const trace = new FairnessTrace();
      const seenBosses = new Set<string>();
      const seenPlanets = new Set<string>();
      const log = fly(state, branch.make(), seconds, { noPickups: true, onTick: s => {
        trace.observe(s);
        if (s.boss) seenBosses.add(s.boss.id);
        if (!s.jump && s.enemies.some(enemy => !enemy.bossPart)) seenPlanets.add(s.planet);
      } });
      trace.finish(state);
      expect(trace.violations, `${label} ${branch.name}\n${summary(trace)}`).toEqual([]);
      expect(trace.windups).toBeGreaterThan(20);
      // The endless runs really fly their boss fights and their planets' squadrons: every branch reaches the
      // first boss; only a branch that kills it continues to the next planet.
      const reach = (list: string[]) => (branch.name === 'perfect' ? list : list.slice(0, 1));
      if (bosses) expect([...seenBosses], `${label} ${branch.name} bosses`).toEqual(expect.arrayContaining(reach(bosses)));
      if (planets) expect([...seenPlanets], `${label} ${branch.name} planets`).toEqual(expect.arrayContaining(reach(planets)));
      if (branch.name === 'perfect' && bosses?.length === 2) expect(state.sector, `${label} reaches sector 7`).toBe(7);
      if (branch.name === 'perfect') {
        expect(log.livesLost, `${label} perfect pilot`).toBe(0);
        expect(log.specialsUsed).toBe(0);
      }
    }
  });
});
