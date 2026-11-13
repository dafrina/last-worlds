import { CREDIT_MULTIPLIER, CREDIT_SCALE } from '../content/equipment';
import { VISIBLE_MISSIONS, WORLD_MISSIONS, difficultyAllows, type WorldMission } from '../content/world-missions';
import type { MissionId, RunConfig, RunEvent, RunState } from '../shared/contracts';
import { awardOnce, type CampaignProfile } from './profile';

/*
 * World missions (docs/35): the saved board, the run's counters and the bridge to the profile.
 *
 * - The board, per world: missions are revealed in authored order, five visible at a time. Completing one marks it
 *   achieved; an achieved mission is claimed (marked done, its reward paid once) as soon as it is visible, which reveals the
 *   next one. Only the missions visible when a run starts count during it (user, 4 November): one revealed mid-run starts
 *   counting on the next run, so a run completes at most five per world. Saves from before that rule may hold missions
 *   achieved while hidden: they still pay when revealed, and are never repeated.
 * - Counters: each run builds one counter per mission visible at its start that its difficulty allows, and feeds them the
 *   run's events
 *   (src/sim/events.ts), drained once each. Nothing scans the world: a counter only reacts to the events it is given.
 * - Saving: completions are saved (and paid) the moment they happen, career progress whenever it changes, and the run's
 *   own progress when it ends, each in one profile transaction (`missionTransaction`) with the rewards (`awardOnce`).
 *   Career progress of a running attempt is saved as that attempt's share and folded in once, so a reload, a second
 *   finish or a crash never counts an event twice. Campaign only: endless never reaches this module (invariant 13).
 */

// ---- The saved board (opaque on the profile as `missionBoard`) ----

export const BOOK_VERSION = 1;
export interface WorldBook {
  /** Missions revealed so far, in reveal order. */
  revealed: string[];
  /** Missions done (completed and paid), in the order they were claimed: the board's history. */
  claimed: string[];
  /** Completed but not yet visible (completed while hidden): claimed when revealed. */
  achieved: string[];
  /** Career missions' progress banked from finished attempts. */
  career: Record<string, number>;
  /** The running (or an interrupted) attempt's career progress, folded into `career` once it ends. */
  live?: { attempt: string; progress: Record<string, number> };
  /** The last finished attempt's progress on its open single-run missions (shown until the next attempt). */
  last?: { attempt: string; progress: Record<string, number> };
}
export interface MissionBook { version: typeof BOOK_VERSION; worlds: Partial<Record<MissionId, WorldBook>> }

export const freshBook = (): MissionBook => ({ version: BOOK_VERSION, worlds: {} });
const freshWorld = (): WorldBook => ({ revealed: [], claimed: [], achieved: [], career: {} });

const ids = (value: unknown) => Array.isArray(value) && value.every(id => typeof id === 'string');
const counts = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.values(value).every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0);
const share = (value: unknown) => value === undefined || (!!value && typeof value === 'object'
  && typeof (value as { attempt?: unknown }).attempt === 'string' && counts((value as { progress?: unknown }).progress));
/**
 * The saved board, or null when it cannot be read (a broken save, or one from a newer build): it is then kept exactly as
 * it is, never overwritten, and missions are off for the session. Nothing saved yet gives a fresh board. Never mutates `raw`.
 */
export function decodeBook(raw: unknown): MissionBook | null {
  if (raw === undefined || raw === null) return freshBook();
  const book = raw as MissionBook;
  if (typeof raw !== 'object' || book.version !== BOOK_VERSION || !book.worlds || typeof book.worlds !== 'object' || Array.isArray(book.worlds)) return null;
  for (const world of Object.values(book.worlds) as unknown[]) {
    const w = world as WorldBook;
    if (!w || typeof w !== 'object' || !ids(w.revealed) || !ids(w.claimed) || !ids(w.achieved) || !counts(w.career) || !share(w.live) || !share(w.last)) return null;
  }
  return structuredClone(book);
}

/** A world's saved state, created on first use. */
export const worldOf = (book: MissionBook, sortie: MissionId): WorldBook => book.worlds[sortie] ??= freshWorld();

/**
 * Reveals missions until five are visible and claims every visible one already achieved (each claim reveals the next).
 * Returns the ids claimed now, in order; their rewards must be paid in the same transaction. Unknown ids (from another
 * build) are kept but never shown.
 */
export function settleBoard(world: WorldBook, defs: readonly WorldMission[]): string[] {
  const claims: string[] = [], known = new Set(defs.map(def => def.id));
  const visible = () => world.revealed.filter(id => known.has(id) && !world.claimed.includes(id));
  const fill = () => {
    for (;;) {
      const ready = visible().find(id => world.achieved.includes(id));
      if (ready) {
        world.claimed.push(ready); world.achieved = world.achieved.filter(id => id !== ready); claims.push(ready);
        continue;
      }
      const next = visible().length < VISIBLE_MISSIONS ? defs.find(def => !world.revealed.includes(def.id)) : undefined;
      if (!next) return;
      world.revealed.push(next.id);
    }
  };
  fill();
  // A long mission is always among the five visible (user, 4 November). On a saved board from before it, it comes up at once
  // as the fifth card: the most recently revealed card goes back to the front of the hidden queue (its progress is kept, and
  // it is the next card revealed), so exactly five show and the long mission is last.
  for (const def of defs) {
    if (!def.long || world.revealed.includes(def.id) || world.claimed.includes(def.id)) continue;
    const shown = visible();
    if (shown.length >= VISIBLE_MISSIONS) world.revealed = world.revealed.filter(id => id !== shown[shown.length - 1]);
    world.revealed.push(def.id);
    fill();
  }
  return claims;
}

/** The ids visible on a settled world's board (five, until the list runs out), in reveal order. Retired ids never show. */
export const visibleIds = (world: WorldBook, defs: readonly WorldMission[]) =>
  world.revealed.filter(id => !world.claimed.includes(id) && defs.some(def => def.id === id)).slice(0, VISIBLE_MISSIONS);

export interface BoardEntry {
  def: WorldMission;
  /** Progress to show: career missions their total; single-run missions their last attempt's (in flight: this run's). */
  progress: number;
  /** In flight: the run's difficulty is below the mission's minimum, so it does not progress. */
  gated?: boolean;
  /** In flight: revealed during this run, so it starts counting on the next one. */
  next?: boolean;
}
export interface WorldBoard { sortie: MissionId; visible: BoardEntry[]; history: WorldMission[]; done: number; total: number }

/** A world's board as the campaign page shows it (pure: nothing is saved). */
export function worldBoard(book: MissionBook, sortie: MissionId): WorldBoard {
  const defs = WORLD_MISSIONS[sortie], world = structuredClone(book.worlds[sortie] ?? freshWorld());
  settleBoard(world, defs);
  const byId = new Map(defs.map(def => [def.id, def]));
  const progress = (def: WorldMission) => Math.min(def.goal, def.scope === 'career'
    ? (world.career[def.id] ?? 0) + (world.live?.progress[def.id] ?? 0)
    : world.last?.progress[def.id] ?? 0);
  return {
    sortie,
    visible: visibleIds(world, defs).map(id => ({ def: byId.get(id)!, progress: progress(byId.get(id)!) })),
    history: world.claimed.flatMap(id => byId.get(id) ?? []),
    done: world.claimed.filter(id => byId.has(id)).length,
    total: defs.length,
  };
}

// ---- Counters: one per open mission, fed the run's events ----

type Kill = Extract<RunEvent, { type: 'kill' }>;
/** An armed ground battery: a turret or missile battery, site guards included (never a boss module, a skid or a site core). */
const groundBattery = (e: Kill) => e.ground && (e.kind === 'turret' || e.kind === 'missile');
/** Neither a ground piece nor a boss module. */
const airborne = (e: Kill) => !e.ground && !e.bossPart;

/** What every counter of a run may consult besides its events: the run's setup and its loadout record. */
interface RunFacts {
  config: RunConfig;
  /** The run's main weapon or tier changed at some point (campaign runs never change it; tracked anyway). */
  loadoutChanged: boolean;
}
export interface MissionCounter {
  readonly def: WorldMission;
  /** Progress to show, 0 … goal (a career mission's includes its earlier attempts). */
  value(): number;
  /** This attempt's own share of the progress (what a career mission banks). */
  own(): number;
  done: boolean;
  on(event: RunEvent): void;
  /** The run's active time moved on (closes timed windows). */
  advance(time: number): void;
  /** The run ended, `complete` when the mission was completed. */
  end(complete: boolean): void;
}

/** One mission's counter for a run. `base` is a career mission's banked progress (0 for single-run missions). */
export function createCounter(def: WorldMission, run: RunFacts, base = 0): MissionCounter {
  let own = 0, failed = false;
  const counter: MissionCounter = {
    def, done: false,
    value: () => Math.min(def.goal, base + own), own: () => own,
    on() { /* per rule below */ }, advance() { /* only timed rules */ }, end() { /* only end-of-run rules */ },
  };
  const set = (value: number) => { if (counter.done || failed) return; own = value; if (base + own >= def.goal) counter.done = true; };
  const add = () => set(own + 1);
  const pass = () => set(def.goal - base);
  const loadout = (weapons?: readonly string[], rank?: number) => !run.loadoutChanged
    && (!weapons || weapons.includes(run.config.weapon ?? 'pulse')) && (rank === undefined || (run.config.rank ?? 0) === rank);
  const rule = def.rule;
  switch (rule.kind) {
    case 'ground': counter.on = e => { if ((e.type === 'kill' && groundBattery(e)) || e.type === 'site') add(); }; break;
    case 'air': {
      if (!rule.window) { counter.on = e => { if (e.type === 'kill' && airborne(e)) add(); }; break; }
      // The most airborne kills inside any window of `window` seconds (first to last kill), this run.
      const window = rule.window, times: number[] = [];
      counter.on = e => {
        if (e.type !== 'kill' || !airborne(e)) return;
        times.push(e.time);
        while (e.time - times[0] > window + 1e-9) times.shift();
        if (times.length > own) set(times.length);
      };
      break;
    }
    case 'air-water': counter.on = e => { if (e.type === 'kill' && airborne(e) && e.water && e.cause === 'main' && e.weapon === rule.weapon) add(); }; break;
    case 'hunters': counter.on = e => { if (e.type === 'kill' && e.hunter) add(); }; break;
    case 'wraiths': counter.on = e => { if (e.type === 'kill' && e.kind === 'wraith') add(); }; break;
    case 'kills': counter.on = e => { if (e.type === 'kill' && e.kind === rule.of && (!rule.open || e.armourOpen) && (!rule.echo || e.echoInFlight)) add(); }; break;
    case 'threads': counter.on = e => { if (e.type === 'thread') add(); }; break;
    case 'launched': counter.on = e => { if (e.type === 'kill' && e.launchedBy === rule.boss) add(); }; break;
    case 'reflected': counter.on = e => { if (e.type === 'kill' && e.cause === 'reflected' && !e.bossPart) add(); }; break;
    case 'specials': counter.on = e => { if (e.type === 'special') add(); }; break;
    case 'credits': {
      // As the HUD counts coins: the pickups' value scaled as they are paid (the world's CREDIT_SCALE and the difficulty's
      // multiplier, game-ui.ts).
      const scale = CREDIT_SCALE[run.config.mission ?? 'training'] * CREDIT_MULTIPLIER[run.config.difficulty ?? 'standard'];
      let raw = 0;
      counter.on = e => { if (e.type === 'credits') { raw += e.value; set(Math.floor(raw * scale + 1e-9)); } };
      break;
    }
    case 'sites': {
      const counts = (e: RunEvent) => e.type === 'site' && (!rule.sites || rule.sites.includes(e.site));
      if (!rule.complete) { counter.on = e => { if (counts(e)) add(); }; break; }
      // Its sites count as they fall; it completes only with the mission.
      counter.on = e => { if (counts(e) && !counter.done) own = Math.min(def.goal, own + 1); };
      counter.end = complete => { if (complete && base + own >= def.goal) counter.done = true; };
      break;
    }
    case 'enemies': counter.on = e => { if ((e.type === 'kill' && (airborne(e) || groundBattery(e))) || e.type === 'site') add(); }; break;
    case 'gas-tanks': counter.on = e => { if (e.type === 'kill' && e.ground && e.kind === 'fuel' && !e.site) add(); }; break;
    case 'site-cores': counter.on = e => { if (e.type === 'kill' && e.site && rule.sites.includes(e.site)) add(); }; break;
    case 'flanks': {
      const half = Math.ceil(def.goal / 2);
      let west = 0, east = 0;
      counter.on = e => {
        if (e.type !== 'kill' || !(airborne(e) || groundBattery(e))) return;
        if (e.x < -rule.beyond) west++; else if (e.x > rule.beyond) east++; else return;
        set(Math.min(west, half) + Math.min(east, half));
      };
      break;
    }
    case 'ground-streak': {
      // The current run of these batteries since the last hull hit (a shield hit keeps it, unless `anyHit`).
      let streak = 0;
      counter.on = e => {
        if (e.type === 'hit' && (rule.anyHit || !e.shield)) { streak = 0; if (!counter.done) own = 0; }
        else if (e.type === 'kill' && groundBattery(e) && rule.kinds.includes(e.kind)) set(++streak);
      };
      break;
    }
    case 'complete':
      counter.on = e => {
        if ((rule.noSpecial && e.type === 'special') || (rule.noHit && e.type === 'hit')) failed = true;
      };
      counter.end = complete => { if (complete && loadout(rule.weapons, rule.rank)) pass(); };
      break;
    case 'boss': {
      // The fight runs from the boss's arrival (its name shows) to its destruction; its final phase from its overload on.
      let arrival: number | null = null, final = false;
      counter.on = e => {
        if (e.type === 'boss') {
          if (e.phase === 'arrival') arrival = e.time;
          else if (e.phase === 'overload') final = true;
          else if (e.phase === 'destroyed' && arrival !== null
            && (rule.within === undefined || e.time - arrival <= rule.within + 1e-9) && loadout(rule.weapons)) pass();
        } else if (e.type === 'hit' && arrival !== null && !counter.done) {
          if ((rule.noHull === 'fight' && !e.shield) || rule.noHit === 'fight'
            || (final && ((rule.noHull === 'final' && !e.shield) || rule.noHit === 'final'))) failed = true;
        }
      };
      break;
    }
    case 'boss-parts': {
      let arrival: number | null = null;
      counter.on = e => {
        if (e.type === 'boss' && e.phase === 'arrival') arrival = e.time;
        else if (e.type === 'kill' && e.bossPart && rule.parts.includes(e.bossPart)
          && (rule.within === undefined || (arrival !== null && e.time - arrival <= rule.within + 1e-9))) add();
      };
      break;
    }
    case 'wraith-clean': {
      // Each volley's window closes clean `window` seconds after its release unless a hit landed inside it.
      let open: number[] = [];
      counter.on = e => {
        if (e.type === 'wraith') open.push(e.time + rule.window);
        else if (e.type === 'hit') open = [];
      };
      counter.advance = time => {
        while (open.length && open[0] <= time + 1e-9) { open.shift(); add(); }
      };
      break;
    }
  }
  return counter;
}

// ---- The run tracker and the profile bridge ----

/** The profile store the missions save through (src/campaign/profile.ts). */
export interface MissionStore {
  read(): CampaignProfile;
  missionTransaction<T>(change: (profile: CampaignProfile) => T): T;
}
/** A short in-flight note: a visible mission's progress, or a mission just completed (and paid: its `credits`). */
export interface MissionNote { id: string; text: string; complete: boolean; credits?: number }
/** A mission paid this run (results screen). */
export type ClaimedMission = WorldMission;

/** The reward's receipt id (`awardOnce`): one per mission, forever. */
export const awardId = (def: WorldMission) => `mission:${def.id}`;
/** Its reward in the board's words: `+25 CR`, `+50 CR · +1 PART`. */
export const rewardText = (def: WorldMission) => [def.credits ? `+${def.credits} CR` : '', def.parts ? `+${def.parts} ${def.parts === 1 ? 'PART' : 'PARTS'}` : ''].filter(Boolean).join(' · ');
/** A progress note at every fifth of the goal (every step when the goal is five or less), so big counts stay quiet. */
const noteStep = (def: WorldMission) => Math.max(1, Math.ceil(def.goal / 5));

interface RunTracker {
  sortie: MissionId; attempt: string; facts: RunFacts; counters: MissionCounter[];
  /** The missions visible when the run started: the only ones it counts. */
  counted: Set<string>;
  /** Progress already announced (or saved, for career missions), per mission. */
  shown: Map<string, number>; saved: Map<string, number>;
  /** Ids visible on the board now, and those this run has completed or paid. */
  visible: Set<string>; achieved: Set<string>; claimed: WorldMission[];
  finished: boolean;
}

export function createMissionTracker(store: MissionStore) {
  /** Each run's tracker, or null for a run that is not tracked (endless, no observer, or an unreadable board). */
  const runs = new WeakMap<RunState, RunTracker | null>();
  /** One transaction on the saved board; null (nothing changed) when the board cannot be read. */
  function transact<T>(change: (book: MissionBook, profile: CampaignProfile) => T): T | null {
    return store.missionTransaction(profile => {
      const book = decodeBook(profile.missionBoard);
      if (!book) return null;
      const result = change(book, profile);
      profile.missionBoard = book;
      return result;
    });
  }
  /** Settles a world's board and pays every mission it claims (once, by receipt). */
  function claim(book: MissionBook, profile: CampaignProfile, sortie: MissionId): WorldMission[] {
    const defs = WORLD_MISSIONS[sortie];
    return settleBoard(worldOf(book, sortie), defs).flatMap(id => {
      const def = defs.find(d => d.id === id)!;
      awardOnce(profile, awardId(def), def.credits, def.parts);
      return [def];
    });
  }
  /** Folds an attempt's saved career share into the world's career progress, once. */
  function fold(world: WorldBook, attempt?: string) {
    if (!world.live || (attempt !== undefined && world.live.attempt !== attempt)) return;
    for (const [id, n] of Object.entries(world.live.progress)) world.career[id] = (world.career[id] ?? 0) + n;
    delete world.live;
  }
  const careerShare = (tracker: RunTracker) => Object.fromEntries(tracker.counters.filter(c => c.def.scope === 'career' && c.own() > 0).map(c => [c.def.id, c.own()]));

  /**
   * Saves what changed: missions just completed (paid at once if visible), and the attempt's career share. Returns the
   * missions paid now.
   */
  function commit(tracker: RunTracker, completed: string[], ending: boolean): WorldMission[] {
    const paid = transact((book, profile) => {
      const world = worldOf(book, tracker.sortie);
      for (const id of completed) if (!world.claimed.includes(id) && !world.achieved.includes(id)) world.achieved.push(id);
      if (ending) {
        // The attempt's career share joins the banked progress exactly once: an attempt that already ended (its `last`
        // record) adds nothing again, and its live share is replaced by the banked one.
        const ended = world.last?.attempt === tracker.attempt;
        if (world.live?.attempt === tracker.attempt) delete world.live;
        if (!ended) {
          for (const [id, n] of Object.entries(careerShare(tracker))) world.career[id] = (world.career[id] ?? 0) + n;
          const last = Object.fromEntries(tracker.counters.filter(c => c.def.scope === 'run' && !c.done && c.value() > 0).map(c => [c.def.id, c.value()]));
          world.last = { attempt: tracker.attempt, progress: last };
        }
      } else {
        const progress = careerShare(tracker);
        if (Object.keys(progress).length) world.live = { attempt: tracker.attempt, progress }; else if (world.live?.attempt === tracker.attempt) delete world.live;
      }
      const claims = claim(book, profile, tracker.sortie);
      tracker.visible = new Set(visibleIds(world, WORLD_MISSIONS[tracker.sortie]));
      return claims;
    }) ?? [];
    for (const counter of tracker.counters) if (counter.def.scope === 'career') tracker.saved.set(counter.def.id, counter.own());
    tracker.claimed.push(...paid);
    return paid;
  }

  /** Starts tracking a campaign run whose events an observer attached (src/main.ts); endless is never tracked. */
  function begin(state: RunState, attempt: string): RunTracker | null {
    if (state.config.mode !== 'campaign' || !state.events) return null;
    const sortie = state.config.mission ?? 'training', defs = WORLD_MISSIONS[sortie];
    const opened = transact(book => {
      const world = worldOf(book, sortie);
      // An interrupted attempt's saved share was observed: it counts, once (docs/09 § 3).
      fold(world);
      delete world.last;
      settleBoard(world, defs);
      return structuredClone(world);
    });
    if (!opened) return null;
    const facts: RunFacts = { config: state.config, loadoutChanged: false };
    const difficulty = state.config.difficulty ?? 'standard', visible = new Set(visibleIds(opened, defs));
    // Only the missions on the board now count in this run (a settled board holds nothing achieved among them).
    const counters = defs.filter(def => visible.has(def.id) && !opened.achieved.includes(def.id) && difficultyAllows(difficulty, def.difficulty))
      .map(def => createCounter(def, facts, def.scope === 'career' ? opened.career[def.id] ?? 0 : 0));
    const tracker: RunTracker = { sortie, attempt, facts, counters, counted: visible, shown: new Map(), saved: new Map(), visible: new Set(visible), achieved: new Set(), claimed: [], finished: false };
    for (const counter of counters) tracker.shown.set(counter.def.id, counter.value());
    return tracker;
  }

  /** Feeds the run's new events to its counters and saves what completed; returns notes for the HUD. */
  function step(tracker: RunTracker, state: RunState): MissionNote[] {
    const events = state.events?.splice(0) ?? [];
    if (state.player.weapon !== tracker.facts.config.weapon || state.player.power !== (tracker.facts.config.rank ?? 0)) tracker.facts.loadoutChanged = true;
    for (const event of events) for (const counter of tracker.counters) if (!counter.done) counter.on(event);
    for (const counter of tracker.counters) if (!counter.done) counter.advance(state.time);
    const notes: MissionNote[] = [];
    const completed = tracker.counters.filter(c => c.done && !tracker.achieved.has(c.def.id)).map(c => c.def.id);
    for (const id of completed) tracker.achieved.add(id);
    for (const counter of tracker.counters) {
      const id = counter.def.id, value = counter.value(), before = tracker.shown.get(id) ?? 0;
      if (counter.done || value <= before) { if (value < before) tracker.shown.set(id, value); continue; }
      tracker.shown.set(id, value);
      const step = noteStep(counter.def);
      if (tracker.visible.has(id) && Math.floor(value / step) > Math.floor(before / step)) notes.push({ id, text: `${counter.def.name.toUpperCase()} ${value}/${counter.def.goal}`, complete: false });
    }
    const careerMoved = tracker.counters.some(c => c.def.scope === 'career' && c.own() !== (tracker.saved.get(c.def.id) ?? 0));
    if (completed.length || careerMoved) {
      for (const def of commit(tracker, completed, false)) notes.push({ id: def.id, text: `${def.name.toUpperCase()} COMPLETE · ${rewardText(def)}`, complete: true, credits: def.credits });
    }
    return notes;
  }

  return {
    /** A world's board from the saved profile (null when the saved board cannot be read). */
    board(sortie: MissionId): WorldBoard | null {
      const book = decodeBook(store.read().missionBoard);
      return book ? worldBoard(book, sortie) : null;
    },
    /** Called every frame with the run: tracks it (from its first sight) and returns any notes to show. */
    observe(state: RunState, attempt: string): MissionNote[] {
      if (!runs.has(state)) runs.set(state, begin(state, attempt));
      const tracker = runs.get(state);
      if (!tracker || tracker.finished) return [];
      return step(tracker, state);
    },
    /** In flight: the visible missions with this run's progress (the pause panel). */
    live(state: RunState): BoardEntry[] {
      const tracker = runs.get(state);
      if (!tracker) return [];
      const defs = WORLD_MISSIONS[tracker.sortie];
      return [...tracker.visible].flatMap(id => {
        const def = defs.find(d => d.id === id), counter = tracker.counters.find(c => c.def.id === id);
        return def ? [{ def, progress: counter ? (counter.done ? def.goal : counter.value()) : 0, ...(counter ? {} : tracker.counted.has(id) ? { gated: true } : { next: true }) }] : [];
      });
    },
    /**
     * The run ended (completed, lost or abandoned): its last events, its end-of-run objectives, its career share and its
     * last progress are saved, once. Returns every mission this run paid (also on a repeated call).
     */
    finish(state: RunState): ClaimedMission[] {
      const tracker = runs.get(state);
      if (!tracker) return [];
      if (tracker.finished) return tracker.claimed;
      step(tracker, state);
      tracker.finished = true;
      const complete = state.phase === 'complete';
      for (const counter of tracker.counters) if (!counter.done) counter.end(complete);
      const completed = tracker.counters.filter(c => c.done && !tracker.achieved.has(c.def.id)).map(c => c.def.id);
      for (const id of completed) tracker.achieved.add(id);
      commit(tracker, completed, true);
      return tracker.claimed;
    },
  };
}
export type MissionTracker = ReturnType<typeof createMissionTracker>;
