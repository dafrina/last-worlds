import { resolvePlaylist } from '../../src/content/encounter-deck';
import { WORLD_MISSIONS, type WorldMission } from '../../src/content/world-missions';
import { createCounter, createMissionTracker } from '../../src/campaign/missions';
import { createCampaignProfile } from '../../src/campaign/profile';
import { createRun } from '../../src/sim/game';
import { VIEW, type Difficulty, type MissionId, type RunConfig, type RunEvent, type RunState, type ShipId, type SiteId, type SpecialId, type WeaponId } from '../../src/shared/contracts';
import { fly, perfectPilot, type Pilot } from './pilots';
import { CREDIT_MULTIPLIER, CREDIT_SCALE, MAX_RANK } from '../../src/content/equipment';
import { BALANCE, ENEMIES } from '../../src/content/balance';
import { SITES } from '../../src/content/sites';
import { siteSeeker } from './site-harness';
import { memoryStorage } from '../helpers/storage';

/*
 * World-mission feasibility (docs/35 § 5): real campaign flights, flown by the test pilot with a loadout and a play style a
 * player would choose for the objective, observed through the real tracker and saved in a profile in memory.
 */

/** Where the pilot prefers to be when it has the choice (it still dodges everything; the evasion solver decides). */
export type Style = 'collect' | 'ground' | 'flank' | 'coins';
const credit = (now: RunState) => now.pickups.filter(p => p.kind === 'credit' && p.s > -1 && p.s < VIEW.maxS).sort((a, b) => a.s - b.s)[0]?.x ?? null;
/** Seek payable loot first once it is near enough to intercept. Between catches, align on
 * enemies and credit-bearing sites to generate the next drop. The evasion planner still owns steering. */
function coinLane(seen: RunState, now: RunState): number | null {
  let lane: number | null = null, best = -Infinity;
  const speed = BALANCE.movement.speed * now.pace, scroll = BALANCE.pickup.speed * now.pace;
  for (const pickup of now.pickups) {
    if (pickup.kind !== 'credit' || pickup.caught !== undefined || pickup.s < -.8 || pickup.s > VIEW.maxS
      || Math.abs(pickup.x - now.cameraX) > VIEW.width / 2) continue;
    const travel = Math.abs(pickup.x - now.player.x) / speed;
    const arrival = pickup.s / scroll;
    if (travel > arrival + .25 || arrival > travel + .85) continue;
    const value = pickup.value / (1 + travel + Math.max(0, arrival));
    if (value > best) { best = value; lane = pickup.x; }
  }
  if (lane !== null) return lane;
  for (const enemy of seen.enemies) {
    if (enemy.hp <= 0 || enemy.damageable === false || enemy.s < 1 || enemy.s > VIEW.maxS
      || Math.abs(enemy.x - seen.cameraX) > VIEW.width / 2 + enemy.radius) continue;
    const site = enemy.site && SITES[enemy.site].loot;
    const reward = site ? (site.kind === 'credit' ? site.value : 0) : enemy.hunter ? BALANCE.campaignHunterCredits : ENEMIES[enemy.kind].credits;
    if (enemy.bossPart || reward <= 0) continue;
    const value = reward / (1 + Math.abs(enemy.x - now.player.x) / speed + enemy.hp / 80 + enemy.s / 25);
    if (value > best) { best = value; lane = enemy.x; }
  }
  return lane;
}
const STYLES: Record<Style, (seen: RunState, now: RunState) => number | null> = {
  coins: coinLane,
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
      let rawCoins = 0;
      fly(state, pilotFor(attempt), 900, { onTick: s => {
        for (const event of s.events ?? []) if (event.type === 'credits') rawCoins += event.value;
        tracker.observe(s, id);
      } });
      const coins = Math.floor(rawCoins * CREDIT_SCALE[mission] * CREDIT_MULTIPLIER[state.config.difficulty ?? 'standard'] + 1e-9);
      return { state, coins, paid: tracker.finish(state) };
    },
    /** Missions not done yet. */
    missing: () => {
      const done = new Set(tracker.board(mission)!.history.map(def => def.id));
      return WORLD_MISSIONS[mission].filter(def => !done.has(def.id)).map(def => def.id);
    },
    /** The missions on the board now. */
    visible: () => tracker.board(mission)!.visible.map(entry => entry.def),
  };
}

/**
 * The attempt a player picks for the missions on the board at its start (docs/35 § 5): strong gear (a level-3 Rail Driver,
 * the Gravity Well fired when charged, Standard) unless a visible mission asks for something else: its weapon and level
 * (First Flight, Armor Piercer, Cold Vector, Seeker Sweep, Alien Weapons Specialist), the top weapon level for Sunburn, the Fan Cannon for a burst of air kills, no specials (Old School, once
 * Specialist is done), Veteran (Veteran of the Void), the Spectre (Gravity Slingshot), and where to fly (each flank for
 * Flanking Maneuver; ground targets first for the ground objectives; else strike sites and coins).
 */
export function planFor(visible: readonly WorldMission[], seed: number): Attempt {
  const has = (kind: WorldMission['rule']['kind']) => visible.some(def => def.rule.kind === kind);
  const ids = new Set(visible.map(def => def.id.split('.')[1]));
  const attempt: Attempt = { seed, weapon: 'rail', rank: 2, special: 'gravity-well', specials: true, style: 'collect' };
  const loadout = visible.find(def => (def.rule.kind === 'complete' || def.rule.kind === 'boss') && def.rule.weapons && !def.rule.weapons.includes('rail'))
    ?? visible.find(def => def.rule.kind === 'air-water');
  if (loadout?.rule.kind === 'air-water') attempt.weapon = loadout.rule.weapon;
  else if (loadout && (loadout.rule.kind === 'complete' || loadout.rule.kind === 'boss')) {
    attempt.weapon = loadout.rule.weapons![0];
    if (loadout.rule.kind === 'complete' && loadout.rule.rank !== undefined) attempt.rank = loadout.rule.rank;
  }
  // Sunburn (THE HELIOPHAGE within 60 s) needs an upgraded weapon: a level-3 one takes 61-75 s on Standard, a top-level
  // Rail Driver 40-54 s (6 November). By world six a player has one. Vent Breaker (CITADEL's three vents within 45 s) too:
  // a level-3 Rail Driver takes 49-55 s on Standard, a top-level Twin Pulse or Fan Cannon 20-26 s (12 November). Cradle's
  // End (CRADLE within 100 s) too since the mission's tougher boss (×1.5, 13 November, docs/40): a replay with an upgraded
  // weapon, as the user put it ("players can replay levels and should do so for missions anyway"). Empire's End (CITADEL
  // within 90 s at ×2.75) too: Nahara's expected level is the top one anyway (docs/40).
  if (visible.some(def => def.id === 'corona.sunburn' || def.id === 'nahara.vent-breaker' || def.id === 'amnion.cradles-end' || def.id === 'nahara.empires-end')) attempt.rank = MAX_RANK;
  // A burst of air kills in a few seconds (Interceptor Drill, Solar Wind): the Fan Cannon's spread, as a player would pick.
  else if (!loadout && visible.some(def => def.rule.kind === 'air' && def.rule.window !== undefined)) {
    attempt.weapon = 'fan'; attempt.rank = MAX_RANK;
  }
  if (ids.has('old-school') && !ids.has('specialist')) attempt.specials = false;
  if (visible.some(def => def.difficulty === 'veteran')) attempt.difficulty = 'veteran';
  if (has('reflected')) attempt.ship = 'spectre';
  // On a dedicated reflection run, keep targets alive for shield returns instead of
  // burning the whole wave with a piercing Rail Driver and automatic Gravity Wells.
  if (visible.length === 1 && has('reflected')) {
    return { seed, ship: 'spectre', weapon: 'pulse', rank: 0, specials: false, style: 'collect' };
  }
  attempt.style = has('flanks') ? 'flank' : has('ground') || has('ground-streak') ? 'ground' : 'collect';
  // Alternate a dedicated salvage sortie with the board's other objectives. A legal max-tier
  // loadout on Veteran can earn more per pickup and kill more of the wave before it exits.
  if (has('credits') && (seed % 2 === 0 || visible.length === 1)) {
    return { seed, ship: 'scrapper', weapon: 'fan', rank: MAX_RANK, special: 'gravity-well',
      specials: true, difficulty: 'veteran', style: 'coins' };
  }
  return attempt;
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
  fly(state, pilotFor(attempt), 900, { onTick: s => { events.push(...s.events!.splice(0)); } });
  return { state, events };
}

/**
 * A pilot's campaign on one world (docs/35 § 5): attempt after attempt on seeds `firstSeed`, `firstSeed + 1`, …, each planned
 * from the board at its start, until all twelve are done or `max` attempts are flown. `log` says what each attempt flew and paid.
 */
export function clearWorld(mission: MissionId, max: number, firstSeed = 1) {
  const world = campaign(mission), log: string[] = [];
  let flown = 0;
  while (world.missing().length && flown < max) {
    const attempt = planFor(world.visible(), firstSeed + flown), { state, coins, paid } = world.fly(attempt);
    flown++;
    log.push(`${flown} seed ${attempt.seed} ${attempt.weapon} L${(attempt.rank ?? 0) + 1}${attempt.specials ? ` ${attempt.special}` : ' no special'} ${attempt.difficulty ?? 'standard'}`
      + `${attempt.ship ? ` ${attempt.ship}` : ''} ${attempt.style} ${state.phase} (${coins} coins): ${paid.map(def => def.name).join(', ') || '—'}`);
  }
  return { flown, missing: world.missing(), credits: world.store.read().credits, parts: world.store.read().parts, log };
}

