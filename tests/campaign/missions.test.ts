import { describe, expect, it } from 'vitest';
import { WORLD_MISSIONS, worldMission, type WorldMission } from '../../src/content/world-missions';
import { createCounter, createMissionTracker, decodeBook, freshBook, settleBoard, visibleIds, worldOf, type MissionStore } from '../../src/campaign/missions';
import { createCampaignProfile, type ProfileStorage } from '../../src/campaign/profile';
import { createRun } from '../../src/sim/game';
import type { MissionId, RunConfig, RunEvent, RunState } from '../../src/shared/contracts';

/** A browser-like storage in memory: a reload is a new store over the same map. */
function memoryStorage(): ProfileStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}
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
  it('has twelve missions per world, unique ids, and the handover totals: 2,895 coins and 21 parts', () => {
    const all = Object.values(WORLD_MISSIONS).flat();
    expect(Object.values(WORLD_MISSIONS).map(list => list.length)).toEqual([12, 12, 12, 12, 12, 12]);
    expect(new Set(all.map(m => m.id)).size).toBe(72);
    const totals = Object.fromEntries(Object.entries(WORLD_MISSIONS).map(([id, list]) => [id, [list.reduce((s, m) => s + m.credits, 0), list.reduce((s, m) => s + m.parts, 0)]]));
    expect(totals).toEqual({ training: [375, 4], bastion: [375, 3], 'cold-vector': [420, 3], 'deep-bloom': [525, 3], 'brood-strike': [600, 4], 'final-horizon': [600, 4] });
    expect(all.reduce((s, m) => s + m.credits, 0)).toBe(2895);
    expect(all.reduce((s, m) => s + m.parts, 0)).toBe(21);
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
    world.achieved.push(defs[0].id); // Groundbreaker: reveals Air Superiority (#6) only
    expect(settleBoard(world, defs)).toEqual([defs[0].id]);
    world.achieved.push(defs[1].id); // Specialist: reveals Demolition, which was already done, which reveals #8
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
    const c = createCounter(def('luna.groundbreaker'), facts());
    for (const e of [kill({ ground: true, kind: 'turret' }), kill({ ground: true, kind: 'missile' }), kill({ ground: true, kind: 'fuel' }),
      kill({ ground: true, kind: 'fuel', site: 'airfield' }), kill({ kind: 'turret', bossPart: 'left' }), { type: 'site', time: 3, site: 'airfield' } as RunEvent]) c.on(e);
    expect(c.value()).toBe(3);
  });

  it('a shield hit fails Untouchable; hull-only challenges allow shield hits', () => {
    const untouchable = createCounter(def('luna.untouchable'), facts());
    untouchable.on(hit(true));
    untouchable.end(true);
    expect(untouchable.done).toBe(false);
    const discipline = createCounter(def('luna.training-discipline'), facts());
    for (const e of [boss('arrival', 100), hit(true, 110), boss('batteries', 103), boss('core', 120), boss('overload', 130), boss('destroyed', 140)]) discipline.on(e);
    expect(discipline.done).toBe(true);
    const hull = createCounter(def('luna.training-discipline'), facts());
    for (const e of [boss('arrival', 100), hit(false, 110), boss('destroyed', 140)]) hull.on(e);
    expect(hull.done).toBe(false);
    // A hull hit before the boss arrives is not "during the fight".
    const before = createCounter(def('luna.training-discipline'), facts());
    for (const e of [hit(false, 50), boss('arrival', 100), boss('destroyed', 140)]) before.on(e);
    expect(before.done).toBe(true);
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
    for (const e of [boss('arrival', 124), boss('destroyed', 224)]) quick.on(e);
    expect(quick.done).toBe(true);
    const slow = createCounter(def('luna.warden-shutdown'), facts());
    for (const e of [boss('arrival', 124), boss('destroyed', 224.1)]) slow.on(e);
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
    const c = createCounter(def('umbra.gravity-slingshot'), facts({ mission: 'final-horizon', ship: 'spectre' }), 3);
    c.on(kill({ cause: 'main' }));
    c.on(kill({ cause: 'reflected' }));
    expect(c.value()).toBe(4);
    expect(c.own()).toBe(1);
    c.on(kill({ cause: 'reflected', kind: 'turret', ground: true }));
    expect(c.done).toBe(true);
  });

  it('Collector counts coin pickups as the HUD does: scaled by the world and difficulty, never other credits', () => {
    // Luna pays coins at ×0.24 (CREDIT_SCALE): 228 in pickups show as 54, 230 as 55.
    const c = createCounter(def('luna.collector'), facts());
    for (let i = 0; i < 57; i++) c.on({ type: 'credits', time: i, value: 4 });
    expect(c.value()).toBe(54);
    c.on({ type: 'credits', time: 60, value: 2 });
    expect(c.done).toBe(true);
    const relaxed = createCounter(def('luna.collector'), facts({ difficulty: 'relaxed' }));
    relaxed.on({ type: 'credits', time: 1, value: 100 });
    expect(relaxed.value()).toBe(20); // 100 × 0.24 × 0.85
  });

  it('First Flight needs a tier-1 Twin Pulse for the whole run', () => {
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
    for (const t of [0, 3, 6, 8.5]) drill.on(kill({ time: t }));
    expect(drill.value()).toBe(3);
    drill.on(kill({ time: 11 }));
    expect(drill.done).toBe(true); // 3, 6, 8.5, 11: within 8 s
    const dustfall = createCounter(def('khepri.dustfall'), facts({ mission: 'bastion' }));
    for (const e of [kill({ ground: true, kind: 'turret' }), kill({ ground: true, kind: 'turret' }), hit(true), kill({ ground: true, kind: 'turret' }), hit(false), kill({ ground: true, kind: 'turret' }), kill({ ground: true, kind: 'missile' })]) dustfall.on(e);
    expect(dustfall.value()).toBe(1);
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

  it('pays a visible mission once, at once, and never again after a reload', () => {
    const storage = memoryStorage();
    let store = createCampaignProfile(storage), tracker = createMissionTracker(store);
    const state = observedRun();
    expect(tracker.observe(state, 'a1')).toEqual([]);
    const notes = feed(tracker, state, 'a1', groundKills(5));
    expect(notes.map(n => n.text)).toEqual(['GROUNDBREAKER COMPLETE · +25 CR']);
    expect(store.read().credits).toBe(25);
    expect(store.read().awards).toEqual(['mission:luna.groundbreaker']);
    // A reload, then a new attempt that does it again: nothing more is paid.
    store = createCampaignProfile(storage); tracker = createMissionTracker(store);
    const again = observedRun();
    tracker.observe(again, 'a2');
    feed(tracker, again, 'a2', groundKills(6));
    again.phase = 'over';
    tracker.finish(again);
    expect(store.read().credits).toBe(25);
    const board = tracker.board('training')!;
    expect(board.history.map(d => d.id)).toEqual(['luna.groundbreaker']);
    expect(board.visible.map(e => e.def.id)).toEqual(WORLD_MISSIONS.training.slice(1, 6).map(d => d.id));
  });

  it('keeps hidden progress: a mission done while hidden pays when it is revealed', () => {
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    const state = observedRun();
    tracker.observe(state, 'a1');
    // Twelve airborne kills: Air Superiority (#6) is done while hidden; nothing visible completes.
    feed(tracker, state, 'a1', Array.from({ length: 12 }, (_, i) => kill({ time: i * 9 })));
    expect(store.read().credits).toBe(0);
    state.phase = 'over';
    tracker.finish(state);
    expect(store.read().credits).toBe(0);
    // Next attempt: Groundbreaker completes, revealing Air Superiority, already achieved: both pay now.
    const next = observedRun();
    tracker.observe(next, 'a2');
    const notes = feed(tracker, next, 'a2', groundKills(5));
    expect(notes.map(n => n.id)).toEqual(['luna.groundbreaker', 'luna.air-superiority']);
    expect(store.read().credits).toBe(50);
    next.phase = 'complete';
    expect(tracker.finish(next).map(d => d.id)).toEqual(expect.arrayContaining(['luna.groundbreaker', 'luna.air-superiority']));
  });

  it('single-run progress resets each attempt; career progress adds up once, through an interrupted attempt too', () => {
    const storage = memoryStorage();
    const store = createCampaignProfile(storage), tracker = createMissionTracker(store);
    const site = (id: 'relay-station' | 'shield-depot' | 'airfield'): RunEvent => ({ type: 'site', time: 40, site: id });
    const first = observedRun();
    tracker.observe(first, 'a1');
    feed(tracker, first, 'a1', [...groundKills(3), site('relay-station')]);
    first.phase = 'over';
    tracker.finish(first); tracker.finish(first);
    let book = decodeBook(store.read().missionBoard)!;
    expect(book.worlds.training!.career).toEqual({ 'luna.lunar-saboteur': 1 });
    // Three batteries and the relay station: four ground targets, shown on the board until the next attempt starts.
    expect(book.worlds.training!.last!.progress['luna.groundbreaker']).toBe(4);
    expect(tracker.board('training')!.visible[0]).toMatchObject({ progress: 4 });
    // An interrupted attempt (a reload mid-flight) saved its share live; the next attempt folds it in once.
    const second = observedRun();
    tracker.observe(second, 'a2');
    feed(tracker, second, 'a2', [kill({ ground: true, kind: 'turret' })]);
    expect(decodeBook(store.read().missionBoard)!.worlds.training!.last).toBeUndefined();
    const lunar = WORLD_MISSIONS.training.findIndex(d => d.id === 'luna.lunar-saboteur');
    expect(lunar).toBe(11);
    // Lunar Saboteur is hidden (#12), but tracked: one more depot completes it while hidden.
    feed(tracker, second, 'a2', [site('shield-depot')]);
    book = decodeBook(store.read().missionBoard)!;
    expect(book.worlds.training!.achieved).toContain('luna.lunar-saboteur');
    const reloaded = createMissionTracker(createCampaignProfile(storage));
    const third = observedRun();
    reloaded.observe(third, 'a3');
    book = decodeBook(createCampaignProfile(storage).read().missionBoard)!;
    expect(book.worlds.training!.career['luna.lunar-saboteur']).toBe(2);
    expect(book.worlds.training!.live).toBeUndefined();
  });

  it('a Relaxed run cannot complete a Standard+ mission but completes ordinary ones', () => {
    const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
    const relaxed = observedRun({ difficulty: 'relaxed' });
    tracker.observe(relaxed, 'r1');
    feed(tracker, relaxed, 'r1', [boss('arrival', 124), boss('destroyed', 160)]);
    relaxed.phase = 'complete';
    const paid = tracker.finish(relaxed).map(d => d.id);
    expect(paid).toContain('luna.old-school');
    expect(paid).not.toContain('luna.untouchable');
    const book = decodeBook(store.read().missionBoard)!;
    expect(book.worlds.training!.achieved).not.toContain('luna.warden-shutdown');
    expect(book.worlds.training!.achieved).not.toContain('luna.training-discipline');
    const standard = observedRun({ difficulty: 'standard' });
    tracker.observe(standard, 's1');
    feed(tracker, standard, 's1', [boss('arrival', 124), boss('destroyed', 160)]);
    standard.phase = 'complete';
    expect(tracker.finish(standard).map(d => d.id)).toContain('luna.untouchable');
    expect(decodeBook(store.read().missionBoard)!.worlds.training!.achieved).toEqual(expect.arrayContaining(['luna.warden-shutdown', 'luna.training-discipline']));
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
    expect([...kinds].sort()).toEqual(['air', 'air-water', 'boss', 'boss-parts', 'complete', 'credits', 'flanks', 'ground', 'ground-streak', 'hunters', 'launched', 'reflected', 'site-cores', 'sites', 'specials', 'wraith-clean', 'wraiths']);
  });
});

describe('mission store contract', () => {
  it('pays through awardOnce only once per mission id', () => {
    const store: MissionStore = createCampaignProfile(memoryStorage());
    const tracker = createMissionTracker(store);
    const state = observedRun();
    tracker.observe(state, 'x');
    state.events!.push(...Array.from({ length: 5 }, () => kill({ ground: true, kind: 'turret' })));
    tracker.observe(state, 'x');
    store.missionTransaction(p => { p.missionBoard = undefined; });
    const fresh = observedRun();
    tracker.observe(fresh, 'y');
    fresh.events!.push(...Array.from({ length: 5 }, () => kill({ ground: true, kind: 'turret' })));
    tracker.observe(fresh, 'y');
    // The board was wiped by hand, so the mission completes again, but its receipt stops a second payment.
    expect(store.read().credits).toBe(25);
  });
});
