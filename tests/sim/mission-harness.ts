import { resolvePlaylist } from '../../src/content/encounter-deck';
import { WORLD_MISSIONS, type WorldMission } from '../../src/content/world-missions';
import { createCounter, createMissionTracker } from '../../src/campaign/missions';
import { createCampaignProfile, type ProfileStorage } from '../../src/campaign/profile';
import { createRun } from '../../src/sim/game';
import { VIEW, type Difficulty, type MissionId, type RunConfig, type RunEvent, type RunState, type ShipId, type SiteId, type SpecialId, type WeaponId } from '../../src/shared/contracts';
import { fly, perfectPilot, type Pilot } from './pilots';
import { siteSeeker } from './site-harness';

/*
 * World-mission feasibility (docs/35 § 5): real campaign flights, flown by the test pilot with a loadout and a play style a
 * player would choose for the objective, observed through the real tracker and saved in a profile in memory.
 */

/** Where the pilot prefers to be when it has the choice (it still dodges everything; the evasion solver decides). */
export type Style = 'collect' | 'ground' | 'flank';
const credit = (now: RunState) => now.pickups.filter(p => p.kind === 'credit' && p.s > -1 && p.s < VIEW.maxS).sort((a, b) => a.s - b.s)[0]?.x ?? null;
const STYLES: Record<Style, (seen: RunState, now: RunState) => number | null> = {
  // Strike-site cores, parts and shield cells first, then coins.
  collect: (seen, now) => siteSeeker(seen, now) ?? credit(now),
  // Ground batteries and site cores first (nearest), then as `collect`.
  ground: (seen, now) => seen.enemies.filter(e => e.hp > 0 && e.damageable !== false && !e.bossPart && (e.kind === 'turret' || e.kind === 'missile' || e.site)
    && e.s > 1.5 && e.s < VIEW.maxS + 6).sort((a, b) => a.s - b.s)[0]?.x ?? STYLES.collect(seen, now),
  // The west flank for the first 90 s, then the east one, until the boss.
  flank: (_seen, now) => now.boss ? null : now.time < 90 ? -9 : 9,
};

export interface Attempt {
  seed: number; weapon?: WeaponId; rank?: number; special?: SpecialId; ship?: ShipId; difficulty?: Difficulty;
  style?: Style;
  /** Fires the special whenever it is charged (default: never, as the test pilots). */
  specials?: boolean;
}
const pilotFor = (attempt: Attempt): Pilot => {
  const pilot = perfectPilot(STYLES[attempt.style ?? 'collect']);
  return attempt.specials ? state => ({ ...pilot(state), specialPressed: state.player.specialCharge >= 1 }) : pilot;
};
export const configFor = (mission: MissionId, attempt: Attempt): RunConfig => ({
  mode: 'campaign', mission, seed: attempt.seed, difficulty: attempt.difficulty ?? 'standard', weapon: attempt.weapon ?? 'pulse',
  rank: attempt.rank ?? 0, special: attempt.special ?? 'shockwave', ship: attempt.ship ?? 'scrapper',
});

/** The first seed from `from` whose attempt draws strike sites matching `test` (the deck's own seeded draw). */
export function seedDrawing(mission: MissionId, test: (sites: SiteId[]) => boolean, from = 1): number {
  for (let seed = from; seed < from + 5000; seed++) {
    if (test(resolvePlaylist({ mode: 'campaign', mission }, 1, seed).filter(cue => cue.site).map(cue => cue.site!.id))) return seed;
  }
  throw new Error(`No seed draws the sites wanted for ${mission}`);
}

function memoryStorage(): ProfileStorage {
  const map = new Map<string, string>();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}

/** One pilot's campaign on one world: attempts flown in order, observed as the game observes them. */
export function campaign(mission: MissionId) {
  const store = createCampaignProfile(memoryStorage()), tracker = createMissionTracker(store);
  let attempts = 0;
  return {
    store, tracker,
    /** Flies one attempt to its end and returns the run and the missions it paid. */
    fly(attempt: Attempt) {
      const state = createRun(configFor(mission, attempt)), id = `attempt-${++attempts}`;
      state.events = [];
      tracker.observe(state, id);
      fly(state, pilotFor(attempt), 480, { onTick: s => { tracker.observe(s, id); } });
      return { state, paid: tracker.finish(state) };
    },
    /** Missions not done yet. */
    missing: () => {
      const done = new Set(tracker.board(mission)!.history.map(def => def.id));
      return WORLD_MISSIONS[mission].filter(def => !done.has(def.id)).map(def => def.id);
    },
  };
}

/** Every mission's verdict on one finished run's events (a fresh board: all twelve tracked), for the report. */
export function verdicts(state: RunState, events: readonly RunEvent[]): { def: WorldMission; done: boolean; value: number }[] {
  return WORLD_MISSIONS[state.config.mission ?? 'training'].map(def => {
    const counter = createCounter(def, { config: state.config, loadoutChanged: false });
    for (const event of events) if (!counter.done) counter.on(event);
    counter.advance(state.time);
    if (!counter.done) counter.end(state.phase === 'complete');
    return { def, done: counter.done, value: counter.value() };
  });
}

/** Flies one attempt and keeps every event (report sweeps). */
export function flyObserved(mission: MissionId, attempt: Attempt) {
  const state = createRun(configFor(mission, attempt)), events: RunEvent[] = [];
  state.events = [];
  fly(state, pilotFor(attempt), 480, { onTick: s => { events.push(...s.events!.splice(0)); } });
  return { state, events };
}
