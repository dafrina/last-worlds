import { describe, expect, it } from 'vitest';
import { BALANCE, difficultyScales, kinematics } from '../../src/content/balance';
import { ENDLESS_CYCLE, endlessPlanet, endlessSchedule, endlessSectorPlan, isBossSector, paceInSector, scrollForPace, sectorPace } from '../../src/content/endless';
import { EMPTY_INPUT, STEP, type EnemyKind, type RunState, type WeaponId } from '../../src/shared/contracts';
import { createRun, stepRun } from '../../src/sim/game';
import { dodgerPilot, enterSector, fly, idlePilot, perfectPilot } from './pilots';

const KHEPRI_KINDS: ReadonlySet<EnemyKind> = new Set(['dart', 'weaver', 'turret', 'lancer']);
const VESPER_KINDS: ReadonlySet<EnemyKind> = new Set(['needle', 'diamond', 'missile']);

/** Stops main fire for the next step: the boss can never be damaged. */
function holdFire(state: RunState) { state.nextVolleyAt = Infinity; }

describe('endless schedule', () => {
  it('opens with the Luna prologue, then cycles Khepri, Nacre and Vesper three sectors at a time, each stint ending with its boss', () => {
    const planets = Array.from({ length: 13 }, (_, i) => endlessPlanet(i + 1));
    expect(planets).toEqual(['luna', 'khepri', 'khepri', 'khepri', 'nacre', 'nacre', 'nacre', 'vesper', 'vesper', 'vesper', 'khepri', 'khepri', 'khepri']);
    expect([1, 4, 7, 10, 13, 16, 19].map(n => endlessSectorPlan(n).boss)).toEqual(['warden', 'bastion', 'veil', 'ark', 'bastion', 'veil', 'ark']);
    expect([2, 3, 5, 6, 8].every(n => endlessSectorPlan(n).boss === null && !isBossSector(n))).toBe(true);
    // The prologue does not advance the ramps: Khepri's first sector (2) flies at the old sector 1 values.
    expect(sectorPace(1)).toBe(sectorPace(2));
    expect(difficultyScales('endless', 'standard', 2)).toEqual(difficultyScales('endless', 'standard', 1));
    expect(difficultyScales('endless', 'standard', 3).cadence).toBeLessThan(difficultyScales('endless', 'standard', 2).cadence);
  });

  it('is a pure function of the config: same for every seed and contiguous in distance', () => {
    const a = endlessSchedule({ mode: 'endless' });
    const b = endlessSchedule({ mode: 'endless' });
    for (const d of [0, 400, 900, 1500, 2500]) expect(a.planetAt(d)).toBe(b.planetAt(d));
    for (let n = 1; n < 12; n += 1) expect(endlessSectorPlan(n + 1).startDistance).toBe(endlessSectorPlan(n).endDistance);
    const stretches = a.stretches(0, endlessSectorPlan(10).endDistance);
    for (let i = 1; i < stretches.length; i += 1) {
      expect(stretches[i].from).toBe(stretches[i - 1].to);
      expect(stretches[i].planet).not.toBe(stretches[i - 1].planet);
    }
    // Each arena is wholly on its planet; each planet switch lies past the end of the arena it follows.
    for (const n of [1, 4, 7, 10]) {
      const plan = endlessSectorPlan(n);
      expect(a.planetAt(plan.stop!.platform.from)).toBe(plan.planet);
      expect(a.planetAt(plan.stop!.platform.to - 1e-6)).toBe(plan.planet);
      expect(a.planetAt(plan.jump!.switchDistance)).toBe(plan.jump!.to);
      expect(a.arenaAt(plan.stop!.stopDistance)?.boss).toBe(plan.boss);
      expect(a.jumpAt((plan.jump!.startDistance + plan.jump!.endDistance) / 2)?.to).toBe(plan.jump!.to);
    }
    // Campaign: one planet and the mission's own arena at its documented stop.
    const thunder = endlessSchedule({ mode: 'campaign', mission: 'bastion' });
    expect(thunder.arenaAt(575)?.stopDistance).toBe(575);
    expect(endlessSchedule({ mode: 'campaign', mission: 'cold-vector' }).arenaAt(920)?.stopDistance).toBe(920);
    expect(endlessSchedule({ mode: 'campaign', mission: 'cold-vector' }).planetAt(5000)).toBe('vesper');
  });

  it('keeps the scroll linear in pace, matching the kinematics anchors', () => {
    for (const pace of [0.8, 0.9, 1, 1.05, 1.1]) expect(scrollForPace(pace)).toBeCloseTo(kinematics(pace).scroll, 9);
  });

  it('matches what the simulation actually does, including bosses and jumps', () => {
    const state = createRun({ mode: 'endless', seed: 11 });
    const schedule = endlessSchedule(state.config);
    const pilot = perfectPilot();
    let previousDistance = 0;
    let sector = 1;
    let jumps = 0;
    while (state.sector < 8 && state.phase === 'playing') {
      stepRun(state, pilot(state));
      state.pickups = [];
      expect(state.distance).toBeGreaterThanOrEqual(previousDistance - 1e-9);
      previousDistance = state.distance;
      const plan = endlessSectorPlan(state.sector);
      if (state.sector !== sector) {
        sector = state.sector;
        // A new sector starts exactly at its planned distance (within the one step that crossed it).
        expect(state.distance).toBeGreaterThanOrEqual(plan.startDistance - 1e-9);
        expect(state.distance - plan.startDistance).toBeLessThan(scrollForPace(paceInSector(sector, STEP)) * STEP + 1e-9);
      }
      if (state.boss && state.scrollSpeed === 0) expect(state.distance).toBeCloseTo(plan.stop!.stopDistance, 9);
      if (state.jump) {
        if (state.jump.startedAt > state.time - STEP) jumps += 1;
        expect(state.distance).toBeGreaterThanOrEqual(plan.jump!.startDistance - 1e-9);
        expect(state.distance).toBeLessThanOrEqual(plan.jump!.endDistance + 1e-9);
      } else {
        // Outside a jump the run's planet is the planet of the terrain under the ship.
        expect(state.planet).toBe(schedule.planetAt(state.distance));
      }
    }
    expect(state.sector).toBe(8);
    expect(jumps).toBe(3);
  }, 90000);
});

describe('endless bosses and jumps', () => {
  it('starts each boss on time with the endless ramp, and admits no squadron after the approach ends', () => {
    const state = createRun({ mode: 'endless', seed: 2 });
    state.player.lives = 99;
    let bossAt: number | null = null;
    while (!state.boss && state.time < 400) {
      stepRun(state, EMPTY_INPUT);
      const tau = state.time - state.sectorStartedAt;
      if (state.sector === 1 && tau > ENDLESS_CYCLE.bossSector.approachEndsAt + 8) {
        expect(state.enemies.filter(enemy => enemy.formation && enemy.age < 0.5)).toHaveLength(0);
      }
      if (state.boss) bossAt = tau;
    }
    // The first boss is WARDEN-1 at the end of the Luna prologue.
    expect(state.sector).toBe(1);
    expect(state.boss!.id).toBe('warden');
    expect(bossAt).toBeCloseTo(ENDLESS_CYCLE.bossSector.arrivesAt, 1);
    const total = state.enemies.filter(enemy => enemy.bossPart).reduce((sum, enemy) => sum + enemy.maxHp, 0);
    expect(total).toBeCloseTo(1240 * difficultyScales('endless', 'standard', 1).hp, 6);
    expect(state.enemies.every(enemy => enemy.bossPart)).toBe(true);
  });

  it('continues only after the kill: no credits, the core scores, then a protected jump to Khepri', () => {
    const state = createRun({ mode: 'endless', seed: 2 });
    state.player.weapon = 'seeker';
    let killAt: number | null = null;
    let scoreBeforeKill = 0;
    let jumpSeen = false;
    const pilot = perfectPilot();
    while (state.sector < 2 && state.phase === 'playing' && state.time < 900) {
      const score = state.score;
      stepRun(state, pilot(state));
      state.pickups = [];
      if (state.boss?.phase === 'destroyed' && killAt === null) { killAt = state.time - state.sectorStartedAt; scoreBeforeKill = score; }
      // No resume, jump or next sector before the kill.
      if (state.sector === 1 && killAt === null) {
        expect(state.jump).toBeNull();
        if (state.time - state.sectorStartedAt > ENDLESS_CYCLE.bossSector.decelStart + ENDLESS_CYCLE.bossSector.decelDuration) expect(state.scrollSpeed).toBe(0);
      }
      if (state.jump) {
        jumpSeen = true;
        expect(state.enemies.filter(enemy => !enemy.bossPart)).toHaveLength(0);
        expect(state.hazards).toHaveLength(0);
        expect(state.projectiles.filter(shot => !shot.friendly)).toHaveLength(0);
        expect(state.time).toBeLessThan(state.player.invulnerableUntil);
      }
    }
    expect(killAt).not.toBeNull();
    expect(state.score - scoreBeforeKill).toBeGreaterThanOrEqual(5000);
    expect(state.credits).toBe(0);
    expect(jumpSeen).toBe(true);
    expect(state.sector).toBe(2);
    // The next sector starts exactly 5 s (resume and jump) after the kill.
    expect(state.sectorStartedAt).toBeCloseTo(killAt! + ENDLESS_CYCLE.resumeDuration + ENDLESS_CYCLE.jumpDuration, 1);
    expect(state.planet).toBe('khepri');
    expect(state.boss).toBeNull();
    expect(state.enemies.some(enemy => enemy.bossPart)).toBe(false);
    expect(state.message).toBe('SECTOR 02 · KHEPRI');
  }, 60000);

  it('flies Vesper kinds on Vesper and Khepri kinds on Khepri', () => {
    const state = createRun({ mode: 'endless', seed: 2 });
    state.player.weapon = 'seeker';
    const seen: Record<string, Set<EnemyKind>> = { luna: new Set(), khepri: new Set(), nacre: new Set(), vesper: new Set() };
    fly(state, perfectPilot(), 1700, { noPickups: true, onTick: s => { for (const enemy of s.enemies) if (!enemy.bossPart && !s.jump) seen[s.planet].add(enemy.kind); } });
    expect(state.sector).toBeGreaterThanOrEqual(9);
    // Nacre mixes both rosters (weaver sine flights with Vesper heavies).
    expect(seen.nacre.has('weaver') && seen.nacre.has('needle')).toBe(true);
    // Luna's prologue flies the Khepri-built roster (blue-painted on Luna).
    expect([...seen.luna, ...seen.khepri].every(kind => KHEPRI_KINDS.has(kind))).toBe(true);
    expect([...seen.vesper].every(kind => VESPER_KINDS.has(kind))).toBe(true);
    expect(seen.vesper.size).toBe(3);
  }, 120000);

  it.each(['pulse', 'fan', 'seeker'] as WeaponId[])('the perfect pilot kills the first three bosses with %s at power 0 in sectors 1-8 without a hit', weapon => {
    const state = createRun({ mode: 'endless', seed: 5 });
    state.player.weapon = weapon;
    const kills: string[] = [];
    let previous: string | null = null;
    const log = fly(state, perfectPilot(), 3400, { noPickups: true, onTick: s => {
      const phase = s.boss?.phase ?? null;
      if (phase !== previous && phase === 'destroyed') kills.push(s.boss!.id);
      previous = phase;
      if (s.sector >= 8 && s.time - s.sectorStartedAt > 10) s.phase = 'paused';
    } });
    expect(state.sector).toBe(8);
    expect(kills).toEqual(['warden', 'bastion', 'veil']);
    expect(state.player.weapon).toBe(weapon);
    expect(state.player.power).toBe(0);
    expect(log.hits).toBe(0);
    expect(log.livesLost).toBe(0);
    expect(log.specialsUsed).toBe(0);
  }, 120000);

  it('never leaves without the kill: a ship that never fires is still in the boss fight 300 s later', () => {
    const state = createRun({ mode: 'endless', seed: 2 });
    // A large test-only life reserve keeps the boss attacking (it holds fire while the player is protected).
    state.player.lives = 10000;
    while (!state.boss && state.time < 400) { holdFire(state); stepRun(state, EMPTY_INPUT); }
    expect(state.sector).toBe(1);
    const arrived = state.time;
    const hp = state.enemies.filter(enemy => enemy.bossPart).reduce((sum, enemy) => sum + enemy.hp, 0);
    while (state.time < arrived + 300) { holdFire(state); stepRun(state, EMPTY_INPUT); }
    expect(state.phase).toBe('playing');
    expect(state.sector).toBe(1);
    expect(state.boss?.id).toBe('warden');
    expect(state.boss?.phase).toBe('batteries');
    expect(state.enemies.filter(enemy => enemy.bossPart).reduce((sum, enemy) => sum + enemy.hp, 0)).toBe(hp);
    expect(state.jump).toBeNull();
    expect(state.scrollSpeed).toBe(0);
    expect(state.distance).toBeCloseTo(endlessSectorPlan(1).stop!.stopDistance, 9);
    // It keeps fighting: attacks still come throughout the fight, which has no time limit.
    expect(state.boss!.attackIndex).toBeGreaterThan(50);
  }, 60000);
});

describe('Needle beam rests (user report: nonstop beam barrages in later Vesper sectors)', () => {
  it('never lets Needle beams run longer than about 9 s without a 2.5 s pause', () => {
    for (const sector of [8, 17]) for (const make of [dodgerPilot, idlePilot]) {
      const state = enterSector(createRun({ mode: 'endless', seed: 3 }), sector), pilot = make();
      let since = -1, last = -9, longest = 0;
      for (let i = 0; i < 70 / STEP && state.phase === 'playing'; i++) {
        state.player.lives = 99;
        stepRun(state, pilot(state));
        const beaming = state.enemies.some(e => e.kind === 'needle' && e.hp > 0 && e.warning > 0) || state.hazards.some(h => h.width <= 0.4 + 1e-9);
        if (beaming) { if (since < 0 || state.time - last > 2.5) since = state.time; last = state.time; longest = Math.max(longest, state.time - since); }
      }
      expect(longest, `sector ${sector}`).toBeLessThan(10);
    }
  });
});
