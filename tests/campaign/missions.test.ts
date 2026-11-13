import { describe, expect, it } from 'vitest';
import { WORLD_MISSIONS, worldMission, type WorldMission } from '../../src/content/world-missions';
import { createCounter, createMissionTracker, decodeBook, freshBook, settleBoard, visibleIds, worldOf, type MissionStore, type WorldBook } from '../../src/campaign/missions';
import { createCampaignProfile } from '../../src/campaign/profile';
import { createRun } from '../../src/sim/game';
import type { MissionId, RunConfig, RunEvent, RunState } from '../../src/shared/contracts';
import { memoryStorage } from '../helpers/storage';

const def = (id: string) => worldMission(id)!;
const facts = (config: Partial<RunConfig> = {}) => ({ config: { mode: 'campaign' as const, seed: 1, mission: 'training' as MissionId, difficulty: 'standard' as const, weapon: 'pulse' as const, rank: 0, ...config }, loadoutChanged: false });
const kill = (extra: Partial<Extract<RunEvent, { type: 'kill' }>> = {}): RunEvent =>
  ({ type: 'kill', time: 10, kind: 'dart', cause: 'main', weapon: 'pulse', ground: false, x: 0, s: 8, water: false, hunter: false, ...extra });
const hit = (shield: boolean, time = 10): RunEvent => ({ type: 'hit', time, shield });
const boss = (phase: Extract<RunEvent, { type: 'boss' }>['phase'], time: number, id: Extract<RunEvent, { type: 'boss' }>['boss'] = 'warden'): RunEvent => ({ type: 'boss', time, boss: id, phase });

/** A campaign run observed as main.ts observes it, with the events we feed it. */
function observedRun(config: Partial<RunConfig> = {}): RunState {
  const state = createRun({ mode: 'campaign', seed: 7, mission: 'training', difficulty: 'standard', ...config });
  state.events = [];
  return state;
}

describe('world mission content (docs/35)', () => {
  it('has twelve missions per world, unique ids, and the totals: 4,690 coins and 53 parts (Untouchable 100, Solar Wind and Heat Shield on Corona, 6 November; Untouchable 3 parts, 10 November; Nahara 12 November)', () => {
    const all = Object.values(WORLD_MISSIONS).flat();
    expect(Object.values(WORLD_MISSIONS).map(list => list.length)).toEqual([12, 12, 12, 12, 12, 12, 12, 12]);
    expect(new Set(all.map(m => m.id)).size).toBe(96);
    const totals = Object.fromEntries(Object.entries(WORLD_MISSIONS).map(([id, list]) => [id, [list.reduce((s, m) => s + m.credits, 0), list.reduce((s, m) => s + m.parts, 0)]]));
    expect(totals).toEqual({ training: [450, 7], bastion: [450, 6], 'cold-vector': [515, 6], 'deep-bloom': [600, 6], 'brood-strike': [675, 7], 'dying-star': [650, 7], 'silent-empire': [675, 7], 'final-horizon': [675, 7] });
    expect(all.reduce((s, m) => s + m.credits, 0)).toBe(4690);
    expect(all.reduce((s, m) => s + m.parts, 0)).toBe(53);
    // One long mission per world, fifth, across runs, 50 coins and a part; Groundbreaker's ids are retired.
    for (const list of Object.values(WORLD_MISSIONS)) {
      expect(list.filter(m => m.long).map(m => [list.indexOf(m), m.scope, m.credits, m.parts])).toEqual([[4, 'career', 50, 1]]);
      expect(list.some(m => m.id.endsWith('.groundbreaker'))).toBe(false);
    }
  });
});

describe('the board: five visible, revealed in order', () => {
  const defs = WORLD_MISSIONS.training;
  it('shows the first five; each claim reveals the next, until the list runs out', () => {
    const world = worldOf(freshBook(), 'training');
    expect(settleBoard(world, defs)).toEqual([]);
    expect(visibleIds(world, defs)).toEqual(defs.slice(0, 5).map(d => d.id));
    world.achieved.push(defs[1].id);
    expect(settleBoard(world, defs)).toEqual([defs[1].id]);
    expect(visibleIds(world, defs)).toEqual([0, 2, 3, 4, 5].map(i => defs[i].id));
    for (const d of defs) if (!world.claimed.includes(d.id)) world.achieved.push(d.id);
    settleBoard(world, defs);
    expect(world.claimed).toHaveLength(12);
    expect(visibleIds(world, defs)).toEqual([]);
  });

  it('keeps a mission completed while hidden, and claims it (once) when it is revealed', () => {
    const world = worldOf(freshBook(), 'training');
    settleBoard(world, defs);
    world.achieved.push(defs[6].id); // Demolition, hidden
    expect(settleBoard(world, defs)).toEqual([]);
    expect(world.claimed).toEqual([]);
    world.achieved.push(defs[0].id); // Specialist: reveals Air Superiority (#6) only
    expect(settleBoard(world, defs)).toEqual([defs[0].id]);
    world.achieved.push(defs[1].id); // Old School: reveals Demolition, which was already done, which reveals #8
    expect(settleBoard(world, defs)).toEqual([defs[1].id, defs[6].id]);
    expect(visibleIds(world, defs)).toEqual([2, 3, 4, 5, 7].map(i => defs[i].id));
    expect(settleBoard(world, defs)).toEqual([]);
  });

  it('never overwrites an unreadable or newer board', () => {
    expect(decodeBook(undefined)).toEqual(freshBook());
    expect(decodeBook({ version: 2, worlds: {} })).toBeNull();
    expect(decodeBook({ version: 1, worlds: { training: { revealed: 'x' } } })).toBeNull();
    const storage = memoryStorage();
    const store = createCampaignProfile(storage);
    store.missionTransaction(p => { p.missionBoard = { version: 99, future: true }; });
    const tracker = createMissionTracker(store);
    expect(tracker.board('training')).toBeNull();
    const state = observedRun();
    state.events!.push(kill({ ground: true, kind: 'turret' }));
    expect(tracker.observe(state, 'a1')).toEqual([]);
    expect(createCampaignProfile(storage).read().missionBoard).toEqual({ version: 99, future: true });
  });
});

describe('counters (event definitions)', () => {
  it('ground targets: armed batteries and fallen sites, never fuel skids, site cores or boss modules', () => {
    const c = createCounter(def('luna.demolition'), facts());
    for (const e of [kill({ ground: true, kind: 'turret' }), kill({ ground: true, kind: 'missile' }), kill({ ground: true, kind: 'fuel' }),
      kill({ ground: true, kind: 'fuel', site: 'airfield' }), kill({ kind: 'turret', bossPart: 'left' }), { type: 'site', time: 3, site: 'airfield' } as RunEvent]) c.on(e);
    expect(c.value()).toBe(3);
  });

  it('a shield hit fails Untouchable; hull-only challenges allow shield hits', () => {
    const untouchable = createCounter(def('luna.untouchable'), facts());
    untouchable.on(hit(true));
    untouchable.end(true);
    expect(untouchable.done).toBe(false);
    // Training Discipline: no hit at all during the fight (4 November); a hit before the boss arrives is not in the fight.
    const discipline = createCounter(def('luna.training-discipline'), facts());
    for (const e of [boss('arrival', 100), hit(true, 110), boss('destroyed', 140)]) discipline.on(e);
    expect(discipline.done).toBe(false);
    const before = createCounter(def('luna.training-discipline'), facts());
    for (const e of [hit(false, 50), boss('arrival', 100), boss('destroyed', 140)]) before.on(e);
    expect(before.done).toBe(true);
    // Hull-only: Sterilization allows shield hits in THE CRADLE's final stage, not a hull hit.
    const shield = createCounter(def('amnion.sterilization'), facts({ mission: 'brood-strike' }));
    for (const e of [boss('arrival', 184, 'cradle'), boss('overload', 250, 'cradle'), hit(true, 260), boss('destroyed', 280, 'cradle')]) shield.on(e);
    expect(shield.done).toBe(true);
    const hull = createCounter(def('amnion.sterilization'), facts({ mission: 'brood-strike' }));
    for (const e of [boss('arrival', 184, 'cradle'), boss('overload', 250, 'cradle'), hit(false, 260), boss('destroyed', 280, 'cradle')]) hull.on(e);
    expect(hull.done).toBe(false);
  });

  it('final-stage objectives watch only the boss\'s last phase (its overload)', () => {
    const arkfall = createCounter(def('vesper.arkfall'), facts({ mission: 'cold-vector' }));
    for (const e of [boss('arrival', 190, 'ark'), hit(false, 200), boss('overload', 300, 'ark'), hit(true, 310), boss('destroyed', 330, 'ark')]) arkfall.on(e);
    expect(arkfall.done).toBe(true); // hull hit before the overload, a shield hit in it
    const survivor = createCounter(def('nacre.veil-survivor'), facts({ mission: 'deep-bloom' }));
    for (const e of [boss('arrival', 184, 'veil'), boss('overload', 300, 'veil'), hit(true, 310), boss('destroyed', 330, 'veil')]) survivor.on(e);
    expect(survivor.done).toBe(false); // no damage at all in the final stage
  });

  it('a timed boss counts from its arrival to its destruction', () => {
    const quick = createCounter(def('luna.warden-shutdown'), facts());
    for (const e of [boss('arrival', 124), boss('destroyed', 169)]) quick.on(e);
    expect(quick.done).toBe(true);
    const slow = createCounter(def('luna.warden-shutdown'), facts());
    for (const e of [boss('arrival', 124), boss('destroyed', 169.1)]) slow.on(e);
    expect(slow.done).toBe(false);
  });

  it('Broadside Broken counts both Ark radiators only within 50 s of its arrival', () => {
    const ark = { mission: 'cold-vector' as const };
    const quick = createCounter(def('vesper.broadside-broken'), facts(ark));
    for (const e of [boss('arrival', 190, 'ark'), kill({ kind: 'turret', bossPart: 'left', time: 220 }), kill({ kind: 'turret', bossPart: 'right', time: 240 })]) quick.on(e);
    expect(quick.done).toBe(true);
    const slow = createCounter(def('vesper.broadside-broken'), facts(ark));
    for (const e of [boss('arrival', 190, 'ark'), kill({ kind: 'turret', bossPart: 'left', time: 220 }), kill({ kind: 'turret', bossPart: 'right', time: 240.1 })]) slow.on(e);
    expect(slow.done).toBe(false);
  });

  it('Seeker Sweep counts only the Seeker Array\'s own shots over open water, never the Seeker Rack special', () => {
    const c = createCounter(def('nacre.seeker-sweep'), facts({ mission: 'deep-bloom', weapon: 'seeker', special: 'seeker-rack' }));
    c.on(kill({ cause: 'special', special: 'seeker-rack', water: true }));
    c.on(kill({ cause: 'blast', water: true }));
    c.on(kill({ cause: 'main', weapon: 'seeker', water: false }));
    c.on(kill({ cause: 'main', weapon: 'seeker', water: true, ground: true, kind: 'turret' }));
    expect(c.value()).toBe(0);
    c.on(kill({ cause: 'main', weapon: 'seeker', water: true }));
    expect(c.value()).toBe(1);
  });

  it('Gravity Slingshot counts only Gravitic Shield returns', () => {
    // Goal 3 since 6 November (5 before).
    const c = createCounter(def('umbra.gravity-slingshot'), facts({ mission: 'final-horizon', ship: 'spectre' }), 1);
    c.on(kill({ cause: 'main' }));
    c.on(kill({ cause: 'reflected' }));
    expect(c.value()).toBe(2);
    expect(c.own()).toBe(1);
    c.on(kill({ cause: 'reflected', kind: 'turret', ground: true }));
    expect(c.done).toBe(true);
  });

  it('Collector counts coin pickups as the HUD does: scaled by the world and difficulty, never other credits', () => {
    // Luna pays coins at ×0.192 (CREDIT_SCALE): 364 in pickups show as 69, 368 as 70.
    const c = createCounter(def('luna.collector'), facts());
    for (let i = 0; i < 91; i++) c.on({ type: 'credits', time: i, value: 4 });
    expect(c.value()).toBe(69);
    c.on({ type: 'credits', time: 80, value: 4 });
    expect(c.done).toBe(true);
    const relaxed = createCounter(def('luna.collector'), facts({ difficulty: 'relaxed' }));
    relaxed.on({ type: 'credits', time: 1, value: 100 });
    expect(relaxed.value()).toBe(16); // 100 × 0.192 × 0.85
  });

  it('First Flight needs a level-1 Twin Pulse for the whole run', () => {
    const run = (config: Partial<RunConfig>, changed = false) => {
      const f = { ...facts(config), loadoutChanged: changed }, c = createCounter(def('luna.first-flight'), f);
      c.end(true);
      return c.done;
    };
    expect(run({ weapon: 'pulse', rank: 0 })).toBe(true);
    expect(run({ weapon: 'pulse', rank: 1 })).toBe(false);
    expect(run({ weapon: 'fan', rank: 0 })).toBe(false);
    expect(run({ weapon: 'pulse', rank: 0 }, true)).toBe(false);
    const lost = createCounter(def('luna.first-flight'), facts());
    lost.end(false);
    expect(lost.done).toBe(false);
  });

  it('timed and streak windows are exact', () => {
    const drill = createCounter(def('luna.interceptor-drill'), facts());
    for (const t of [0, 1, 2, 3, 4, 5.1]) drill.on(kill({ time: t }));
    expect(drill.value()).toBe(5);
    drill.on(kill({ time: 6 }));
    expect(drill.done).toBe(true); // 1, 2, 3, 4, 5.1, 6: six within 5 s
    // Dustfall: turrets in a row without any hit; a shield hit breaks the streak too (4 November).
    const turret = () => kill({ ground: true, kind: 'turret' });
    const dustfall = createCounter(def('khepri.dustfall'), facts({ mission: 'bastion' }));
    for (const e of [turret(), turret(), turret(), hit(true), turret(), turret(), kill({ ground: true, kind: 'missile' })]) dustfall.on(e);
    expect(dustfall.value()).toBe(2);
    for (let i = 0; i < 4; i++) dustfall.on(turret());
    expect(dustfall.done).toBe(true);
    const vanish = createCounter(def('umbra.vanishing-act'), facts({ mission: 'final-horizon' }));
    vanish.on({ type: 'wraith', time: 10, hunter: false });
    vanish.advance(11.4);
    vanish.on(hit(true, 11.45));
    vanish.advance(12);
    expect(vanish.value()).toBe(0);
    vanish.on({ type: 'wraith', time: 20, hunter: true });
    vanish.advance(21.5);
    expect(vanish.value()).toBe(1);
  });

  it('long missions\' own counts: gas tanks (chain blasts included, site cores not) and enemies (no boss modules, no skids)', () => {
    // Goal 35 since 6 November (75 before).
    const bonfire = createCounter(def('amnion.bonfire'), facts({ mission: 'brood-strike' }), 30);
    for (const e of [kill({ ground: true, kind: 'fuel' }), kill({ ground: true, kind: 'fuel', cause: 'blast' }), kill({ ground: true, kind: 'fuel', site: 'brood-hive' }), kill({ ground: true, kind: 'turret' }), kill()]) bonfire.on(e);
    expect([bonfire.value(), bonfire.own()]).toEqual([32, 2]);
    const vigil = createCounter(def('umbra.eclipse-vigil'), facts({ mission: 'final-horizon' }));
    for (const e of [kill(), kill({ ground: true, kind: 'missile' }), kill({ ground: true, kind: 'fuel' }), kill({ kind: 'turret', bossPart: 'core' }), kill({ ground: true, kind: 'fuel', site: 'gate-ring' }), { type: 'site', time: 3, site: 'gate-ring' } as RunEvent]) vigil.on(e);
    expect(vigil.value()).toBe(3);
  });

  it('flanks need kills beyond |x| > 6 on both sides', () => {
    const c = createCounter(def('khepri.flanking-maneuver'), facts({ mission: 'bastion' }));
    for (let i = 0; i < 5; i++) c.on(kill({ x: -7 }));
    c.on(kill({ x: 6 }));
    expect(c.value()).toBe(3);
    for (let i = 0; i < 3; i++) c.on(kill({ x: 8, ground: true, kind: 'turret' }));
    expect(c.done).toBe(true);
  });
});

describe('the tracker: rewards, persistence, modes', () => {
  /** Flies nothing: pushes events into an observed run and lets the tracker drain them, as game-ui does each frame. */
  function feed(tracker: ReturnType<typeof createMissionTracker>, state: RunState, attempt: string, events: RunEvent[]) {
    state.events!.push(...events);
    return tracker.observe(state, attempt);
  }
  const groundKills = (n: number) => Array.from({ length: n }, (_, i) => kill({ ground: true, kind: 'turret', time: i }));
  const specials = (n: number) => Array.from({ length: n }, (_, i): RunEvent => ({ type: 'special', time: i * 30, special: 'shockwave' }));

  /** A Luna board on which the first `done` missions are already done (claimed), so the next five are visible. */
  function boardWithDone(store: MissionStore, done: number) {
    const defs = WORLD_MISSIONS.training.map(d => d.id);
    store.missionTransaction(p => { p.missionBoard = { version: 1, worlds: { training: { revealed: defs.slice(0, done + 5), claimed: defs.slice(0, done), achieved: [], career: {} } } }; });
  }

  it('pays a visible mission once, at once, and never again after a reload', () => {
    const storage = memoryStorage();
    let store = createCampaignProfile(storage), tracker = createMissionTracker(store);
    const state = observedRun();
    expect(tracker.observe(state, 'a1')).toEqual([]);
    const notes = feed(tracker, state, 'a1', specials(5));
    expect(notes.filter(n => n.complete).map(n => n.text)).toEqual(['SPECIALIST COMPLETE · +25 CR']);
    expect(store.read().credits).toBe(25);
    expect(store.read().awards).toEqual(['mission:luna.specialist']);
    // A reload, then a new attempt that does it again: nothing more is paid.
    store = createCampaignProfile(storage); tracker = createMissionTracker(store);
    const again = observedRun();
    tracker.observe(again, 'a2');
    feed(tracker, again, 'a2', specials(6));
    again.phase = 'over';
    tracker.finish(again);
    expect(store.read().credits).toBe(25);
    const board = tracker.board('training')!;
    expect(board.history.map(d => d.id)).toEqual(['luna.specialist']);
    expect(board.visible.map(e => e.def.id)).toEqual(WORLD_MISSIONS.training.slice(1, 6).map(d => d.id));
  });

  it('counts only the missions visible when the run starts: one revealed mid-run counts from the next run', () => {
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    const state = observedRun();
    tracker.observe(state, 'a1');
    // Specialist completes and reveals Untouchable (#6), which does not start counting in this run.
    const notes = feed(tracker, state, 'a1', specials(5));
    expect(notes.filter(n => n.complete).map(n => n.id)).toEqual(['luna.specialist']);
    expect(tracker.live(state).find(e => e.def.id === 'luna.untouchable')).toMatchObject({ next: true, progress: 0 });
    // The run ends complete without a hit: Untouchable, revealed mid-run, is not paid.
    state.phase = 'complete';
    expect(tracker.finish(state).map(d => d.id)).toEqual(['luna.specialist']);
    expect(decodeBook(store.read().missionBoard)!.worlds.training!.achieved).toEqual([]);
    // The next run counts it.
    const next = observedRun();
    tracker.observe(next, 'a2');
    next.phase = 'complete';
    expect(tracker.finish(next).map(d => d.id)).toContain('luna.untouchable');
  });

  it('one run completes at most the five missions visible at its start', () => {
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    const state = observedRun();
    tracker.observe(state, 'a1');
    // Everything a run could do on Luna (ground targets, specials, coins, airborne kills, a quick clean boss fight)...
    feed(tracker, state, 'a1', [...groundKills(12), ...specials(6),
      ...Array.from({ length: 100 }, (_, i): RunEvent => ({ type: 'credits', time: i, value: 4 })), ...Array.from({ length: 100 }, (_, i) => kill({ time: 100 + i * .5 })),
      boss('arrival', 124), boss('destroyed', 150)]);
    state.phase = 'complete';
    // ...pays the first five visible ones at most (Old School fails: specials were fired).
    // Untouchable (#6) is hidden at the start, so the clean run does not pay it.
    expect(tracker.finish(state).map(d => d.id)).toEqual(['luna.specialist', 'luna.collector', 'luna.air-superiority', 'luna.sky-patrol']);
  });

  it('a save holding a mission achieved while hidden (before 4 November) still pays it when revealed', () => {
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    const defs = WORLD_MISSIONS.training.map(d => d.id);
    store.missionTransaction(p => { p.missionBoard = { version: 1, worlds: { training: { revealed: defs.slice(0, 5), claimed: [], achieved: ['luna.untouchable'], career: {} } } }; });
    const state = observedRun();
    tracker.observe(state, 'a1');
    const notes = feed(tracker, state, 'a1', specials(5));
    expect(notes.filter(n => n.complete).map(n => n.id)).toEqual(['luna.specialist', 'luna.untouchable']);
    expect(store.read().credits).toBe(125);
  });

  it('single-run progress resets each attempt; career progress accrues while visible, once, through an interrupted attempt too', () => {
    const storage = memoryStorage();
    const store = createCampaignProfile(storage), tracker = createMissionTracker(store);
    const site = (id: 'relay-station' | 'shield-depot' | 'airfield'): RunEvent => ({ type: 'site', time: 40, site: id });
    // Hidden (#12): a relay station adds nothing to Lunar Saboteur.
    const hidden = observedRun();
    tracker.observe(hidden, 'h1');
    feed(tracker, hidden, 'h1', [...Array.from({ length: 40 }, (_, i): RunEvent => ({ type: 'credits', time: i, value: 4 })), site('relay-station')]);
    hidden.phase = 'over';
    tracker.finish(hidden); tracker.finish(hidden);
    let book = decodeBook(store.read().missionBoard)!;
    expect(book.worlds.training!.career).toEqual({});
    // 160 in coin pickups show as 30 coins (×0.192), shown on the board until the next attempt starts.
    expect(book.worlds.training!.last!.progress['luna.collector']).toBe(30);
    expect(tracker.board('training')!.visible[2]).toMatchObject({ progress: 30 });
    // Visible (#8–#12 on the board): it accrues.
    boardWithDone(store, 7);
    const first = observedRun();
    tracker.observe(first, 'a1');
    feed(tracker, first, 'a1', [site('relay-station')]);
    first.phase = 'over';
    tracker.finish(first); tracker.finish(first);
    book = decodeBook(store.read().missionBoard)!;
    expect(book.worlds.training!.career).toEqual({ 'luna.lunar-saboteur': 1 });
    // An interrupted attempt (a reload mid-flight) saved its share live; the next attempt folds it in once.
    const second = observedRun();
    tracker.observe(second, 'a2');
    feed(tracker, second, 'a2', [kill({ ground: true, kind: 'turret' })]);
    expect(decodeBook(store.read().missionBoard)!.worlds.training!.last).toBeUndefined();
    const notes = feed(tracker, second, 'a2', [site('shield-depot')]);
    expect(notes.map(n => n.id)).toEqual(['luna.lunar-saboteur']);
    expect(store.read().parts).toBe(1);
    const interrupted = observedRun();
    tracker.observe(interrupted, 'a3');
    feed(tracker, interrupted, 'a3', []);
    const reloaded = createMissionTracker(createCampaignProfile(storage));
    reloaded.observe(observedRun(), 'a4');
    book = decodeBook(createCampaignProfile(storage).read().missionBoard)!;
    expect(book.worlds.training!.career['luna.lunar-saboteur']).toBe(2);
    expect(book.worlds.training!.live).toBeUndefined();
  });

  it('a Relaxed run cannot complete a Standard+ mission but completes ordinary ones', () => {
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    boardWithDone(store, 7); // Warden Shutdown and Training Discipline (Standard+) are visible
    const relaxed = observedRun({ difficulty: 'relaxed' });
    tracker.observe(relaxed, 'r1');
    expect(tracker.live(relaxed).filter(e => e.gated).map(e => e.def.id)).toEqual(['luna.warden-shutdown', 'luna.training-discipline']);
    feed(tracker, relaxed, 'r1', [boss('arrival', 124), boss('destroyed', 150)]);
    relaxed.phase = 'complete';
    expect(tracker.finish(relaxed).map(d => d.id)).toEqual(['luna.first-flight']);
    const standard = observedRun({ difficulty: 'standard' });
    tracker.observe(standard, 's1');
    feed(tracker, standard, 's1', [boss('arrival', 124), boss('destroyed', 150)]);
    standard.phase = 'complete';
    expect(tracker.finish(standard).map(d => d.id)).toEqual(['luna.warden-shutdown', 'luna.training-discipline']);
  });

  it('long missions: always among the five; an old save shows it at once, keeps Groundbreaker\'s payment, counts it next run', () => {
    // A fresh board: four standard missions, then the long mission, on every world.
    for (const [sortie, list] of Object.entries(WORLD_MISSIONS)) {
      const world = worldOf(freshBook(), sortie as MissionId);
      settleBoard(world, list);
      expect(visibleIds(world, list).map(id => worldMission(id)!.long ?? false)).toEqual([false, false, false, false, true]);
    }
    // A save from before 4 November: Groundbreaker done and paid, five other cards showing, Air Superiority revealed last.
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    const old = ['luna.groundbreaker', 'luna.specialist', 'luna.old-school', 'luna.untouchable', 'luna.collector', 'luna.air-superiority'];
    store.missionTransaction(p => {
      p.credits = 25; p.awards = ['mission:luna.groundbreaker'];
      p.missionBoard = { version: 1, worlds: { training: { revealed: old, claimed: ['luna.groundbreaker'], achieved: [], career: {}, last: { attempt: 'old', progress: { 'luna.air-superiority': 9 } } } } };
    });
    const board = tracker.board('training')!;
    expect(board.visible.map(e => e.def.id)).toEqual(['luna.specialist', 'luna.old-school', 'luna.untouchable', 'luna.collector', 'luna.sky-patrol']);
    expect([board.done, board.history]).toEqual([0, []]); // the retired card is not shown; its payment stays
    expect(store.read().credits).toBe(25);
    // Its next run counts toward the long mission; Air Superiority, sent back, is the next card revealed.
    const run = observedRun();
    tracker.observe(run, 'n1');
    const notes = feed(tracker, run, 'n1', [...Array.from({ length: 12 }, (_, i) => kill({ time: i })), ...specials(5)]);
    expect(notes.filter(n => n.complete).map(n => n.id)).toEqual(['luna.specialist']);
    expect(tracker.live(run).map(e => e.def.id)).toEqual(['luna.old-school', 'luna.untouchable', 'luna.collector', 'luna.sky-patrol', 'luna.air-superiority']);
    run.phase = 'over';
    tracker.finish(run);
    const saved = decodeBook(store.read().missionBoard)!.worlds.training!;
    expect(saved.career['luna.sky-patrol']).toBe(12);
    expect(saved.claimed).toEqual(['luna.groundbreaker', 'luna.specialist']);
    expect(store.read().credits).toBe(50);
    expect(store.read().awards).toEqual(['mission:luna.groundbreaker', 'mission:luna.specialist']);
  });

  it('the card sent back for the long mission keeps its progress and comes up next', () => {
    const ids = ['luna.groundbreaker', ...WORLD_MISSIONS.training.filter(d => !d.long).map(d => d.id)];
    const world: WorldBook = { revealed: ids, claimed: ids.slice(0, 7), achieved: [], career: { 'luna.lunar-saboteur': 1 } };
    settleBoard(world, WORLD_MISSIONS.training);
    expect(visibleIds(world, WORLD_MISSIONS.training)).toEqual(['luna.first-flight', 'luna.interceptor-drill', 'luna.warden-shutdown', 'luna.training-discipline', 'luna.sky-patrol']);
    expect(world.career['luna.lunar-saboteur']).toBe(1);
    world.achieved = ['luna.first-flight'];
    expect(settleBoard(world, WORLD_MISSIONS.training)).toEqual(['luna.first-flight']);
    expect(visibleIds(world, WORLD_MISSIONS.training).at(-1)).toBe('luna.lunar-saboteur');
  });

  it('endless never progresses or saves a mission', () => {
    const storage = memoryStorage(), store = createCampaignProfile(storage), tracker = createMissionTracker(store);
    const endless = createRun({ mode: 'endless', seed: 3 });
    endless.events = [kill({ ground: true, kind: 'turret' }), ...groundKills(10)];
    expect(tracker.observe(endless, 'e1')).toEqual([]);
    endless.phase = 'over';
    expect(tracker.finish(endless)).toEqual([]);
    expect(store.read().missionBoard).toBeUndefined();
    expect(store.read().credits).toBe(0);
  });

  it('every mission is reachable by its own rule (no definition is dead)', () => {
    const kinds = new Set(Object.values(WORLD_MISSIONS).flat().map((m: WorldMission) => m.rule.kind));
    expect([...kinds].sort()).toEqual(['air', 'air-water', 'boss', 'boss-parts', 'complete', 'credits', 'enemies', 'flanks', 'gas-tanks', 'ground', 'ground-streak', 'hunters', 'kills', 'launched', 'reflected', 'site-cores', 'sites', 'specials', 'threads', 'wraith-clean', 'wraiths']);
  });
});

describe('mission store contract', () => {
  it('pays through awardOnce only once per mission id', () => {
    const store: MissionStore = createCampaignProfile(memoryStorage());
    const tracker = createMissionTracker(store);
    const state = observedRun();
    tracker.observe(state, 'x');
    state.events!.push(...Array.from({ length: 5 }, (_, i): RunEvent => ({ type: 'special', time: i, special: 'shockwave' })));
    tracker.observe(state, 'x');
    store.missionTransaction(p => { p.missionBoard = undefined; });
    const fresh = observedRun();
    tracker.observe(fresh, 'y');
    fresh.events!.push(...Array.from({ length: 5 }, (_, i): RunEvent => ({ type: 'special', time: i, special: 'shockwave' })));
    tracker.observe(fresh, 'y');
    // The board was wiped by hand, so the mission completes again, but its receipt stops a second payment.
    expect(store.read().credits).toBe(25);
  });
});
