import type { BossId, BossPart, Difficulty, EnemyKind, MissionId, SiteId, WeaponId } from '../shared/contracts';

/*
 * The campaign's world missions (docs/35; user handover, 3 November 2026): twelve per world, five visible at a time in
 * this order, each paying once. Campaign only (AGENTS.md invariant 13): they observe the run's events
 * (src/sim/events.ts) and never change it. Evaluation and the saved board: src/campaign/missions.ts.
 *
 * Definitions used below (docs/35 § 2):
 * - a ground target is an armed ground battery (turret or missile battery; site guards included, boss modules never) or a
 *   strike site, which counts once when it falls. Fuel skids do not count: they are harmless loot and chain-explode.
 * - an airborne enemy is any enemy that is neither a ground piece nor a boss module: hunters, Wraiths and craft a boss
 *   launches included.
 * - a run is one campaign attempt. `scope: 'run'` progress starts at zero each attempt; `'career'` adds up across attempts.
 * - only the missions visible when a run starts count during it (user, 4 November): one revealed mid-run starts counting on
 *   the next run, so one run completes at most five per world, and career progress accrues only while a mission is visible.
 */

/** What a mission counts or checks. Each kind is evaluated from the run's events only (src/campaign/missions.ts). */
export type MissionRule =
  /** Ground targets (above). */
  | { kind: 'ground' }
  /** Airborne enemies; with `window`, that many within `window` seconds of active time (first to last kill). */
  | { kind: 'air'; window?: number }
  /** Airborne enemies over open water, downed by a shot of this main weapon (its specials and blasts never count). */
  | { kind: 'air-water'; weapon: WeaponId }
  /** Hunters (shielded aces). */
  | { kind: 'hunters' }
  /** Wraiths (Umbra's phase predators, hunter Wraiths included). */
  | { kind: 'wraiths' }
  /** Craft launched from this boss's bays. */
  | { kind: 'launched'; boss: BossId }
  /** Kills by the Spectre's Gravitic Shield returns (reflected hostile shots). */
  | { kind: 'reflected' }
  /** Specials fired. */
  | { kind: 'specials' }
  /** Coins collected in flight, as the HUD counts them (credit pickups only; no rewards, no starting balance). */
  | { kind: 'credits' }
  /** Enemies destroyed: airborne enemies and ground targets (never boss modules or fuel skids). */
  | { kind: 'enemies' }
  /** Fuel skids (gas tanks) blown up, by any cause, a skid's chain explosion included (never a site core). */
  | { kind: 'gas-tanks' }
  /** Strike sites destroyed (only these sites, if given); with `complete`, the mission must also be completed. */
  | { kind: 'sites'; sites?: readonly SiteId[]; complete?: true }
  /** Site cores destroyed, of these sites (each core counts). */
  | { kind: 'site-cores'; sites: readonly SiteId[] }
  /** Enemies (airborne or ground batteries) destroyed beyond |x| > `beyond` on each side: `goal / 2` on each. */
  | { kind: 'flanks'; beyond: number }
  /**
   * Ground batteries of these kinds destroyed in a row, with no hull hit between the first and the last (with `anyHit`, no
   * hit at all: a shield hit breaks the streak too).
   */
  | { kind: 'ground-streak'; kinds: readonly EnemyKind[]; anyHit?: true }
  /** Complete the mission: without firing a special, without any registered hit, and/or flying one of `weapons` (at `rank`). */
  | { kind: 'complete'; noSpecial?: true; noHit?: true; weapons?: readonly WeaponId[]; rank?: number }
  /**
   * Defeat the mission's boss: within `within` seconds of its arrival, with no hull hit (`noHull`) or no hit at all
   * (`noHit`) during the fight or its final phase, and/or flying one of `weapons` all run.
   */
  | { kind: 'boss'; within?: number; noHull?: 'fight' | 'final'; noHit?: 'fight' | 'final'; weapons?: readonly WeaponId[] }
  /** Destroy these modules of the mission's boss; with `within`, each only counts within that many seconds of its arrival. */
  | { kind: 'boss-parts'; parts: readonly BossPart[]; within?: number }
  /** Wraith volleys survived: no registered hit within `window` seconds of the volley's release. */
  | { kind: 'wraith-clean'; window: number };

export interface WorldMission {
  /** Stable save id (`world.slug`). Never reuse one for a different objective. */
  id: string;
  name: string;
  /** One plain line for the board. */
  text: string;
  /** Progress needed (1 for a pass/fail objective). */
  goal: number;
  credits: number;
  parts: number;
  /** The lowest difficulty a run may fly for this mission to progress: relaxed (any), standard (Standard+) or veteran. */
  difficulty: Difficulty;
  scope: 'run' | 'career';
  rule: MissionRule;
  /**
   * A world's long mission (fifth in the list, user, 4 November): progress adds up across runs, and it is always among the
   * five visible, the fifth on a saved board that predates it (src/campaign/missions.ts `settleBoard`).
   */
  long?: true;
}

/** Missions on the board at once. */
export const VISIBLE_MISSIONS = 5;
/** |x| beyond which a kill lies in a flank: the 24-wide map minus the 12-wide centre screen (docs/10). */
export const FLANK_X = 6;
/**
 * A Wraith volley's danger window: its three rounds (0.06 s apart, content/wraith.ts) leave at 16 units/s or faster from
 * rows 10.5–16.5 and cross the ship's row within about 1.1 s; 1.5 s covers them with margin.
 */
export const WRAITH_WINDOW = 1.5;

type Def = Omit<WorldMission, 'id' | 'scope'> & { slug: string; scope?: 'run' | 'career' };
const run = (rule: MissionRule) => ({ rule });
const world = (prefix: string, defs: readonly Def[]): readonly WorldMission[] =>
  defs.map(({ slug, scope, ...def }) => ({ id: `${prefix}.${slug}`, scope: scope ?? 'run', ...def }));

/**
 * A world's long mission (user, 4 November): fifth in the list, across runs, 50 coins and a part. It replaced Groundbreaker
 * (the first mission, whose id `<world>.groundbreaker` is retired: a board that paid it keeps the payment and no longer shows
 * it); the four after Groundbreaker moved up.
 */
const long = (slug: string, name: string, text: string, goal: number, rule: MissionRule): Def =>
  ({ slug, name, text, goal, credits: 50, parts: 1, difficulty: 'relaxed', scope: 'career', long: true, rule });
const specialist = (goal: number, credits: number): Def => ({ slug: 'specialist', name: 'Specialist', text: `Fire your special ${goal} times in one run.`, goal, credits, parts: 0, difficulty: 'relaxed', ...run({ kind: 'specials' }) });
const oldSchool = (credits: number, where: string): Def => ({ slug: 'old-school', name: 'Old School', text: `Complete ${where} without firing a special.`, goal: 1, credits, parts: 0, difficulty: 'relaxed', ...run({ kind: 'complete', noSpecial: true }) });
const untouchable = (where: string): Def => ({ slug: 'untouchable', name: 'Untouchable', text: `Complete ${where} without a shield or hull hit.`, goal: 1, credits: 50, parts: 1, difficulty: 'standard', ...run({ kind: 'complete', noHit: true }) });
const collector = (goal: number, credits: number): Def => ({ slug: 'collector', name: 'Collector', text: `Collect ${goal} coins in one run.`, goal, credits, parts: 0, difficulty: 'relaxed', ...run({ kind: 'credits' }) });
const airSuperiority = (goal: number, credits: number): Def => ({ slug: 'air-superiority', name: 'Air Superiority', text: `Destroy ${goal} airborne enemies in one run.`, goal, credits, parts: 0, difficulty: 'relaxed', ...run({ kind: 'air' }) });
const demolition = (goal: number): Def => ({ slug: 'demolition', name: 'Demolition', text: `Destroy ${goal} ground targets in one run.`, goal, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'ground' }) });
const hunterBounty = (goal: number): Def => ({ slug: 'hunter-bounty', name: 'Hunter Bounty', text: goal === 1 ? 'Shoot down a shielded ace in one run.' : `Shoot down ${goal} shielded aces in one run.`, goal, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'hunters' }) });

/** Every world's twelve, in the user's order (the reveal order). Keyed by the world's campaign mission. */
export const WORLD_MISSIONS: Readonly<Record<MissionId, readonly WorldMission[]>> = {
  training: world('luna', [
    specialist(5, 25),
    oldSchool(25, 'Training'),
    untouchable('Training'),
    collector(70, 25),
    long('sky-patrol', 'Sky Patrol', 'Destroy 100 airborne enemies, across runs.', 100, { kind: 'air' }),
    airSuperiority(30, 25),
    demolition(10),
    { slug: 'first-flight', name: 'First Flight', text: 'Complete Training flying a level-1 Twin Pulse.', goal: 1, credits: 25, parts: 1, difficulty: 'relaxed', ...run({ kind: 'complete', weapons: ['pulse'], rank: 0 }) },
    { slug: 'interceptor-drill', name: 'Interceptor Drill', text: 'Destroy 6 airborne enemies within 5 seconds.', goal: 6, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'air', window: 5 }) },
    { slug: 'warden-shutdown', name: 'Warden Shutdown', text: 'Defeat WARDEN-1 within 45 s of its arrival.', goal: 1, credits: 25, parts: 0, difficulty: 'standard', ...run({ kind: 'boss', within: 45 }) },
    { slug: 'training-discipline', name: 'Training Discipline', text: 'Defeat WARDEN-1 without a hit during the fight.', goal: 1, credits: 50, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', noHit: 'fight' }) },
    // Human communication and defence installations: the relay station (its dish) and the shield depot (its generator).
    { slug: 'lunar-saboteur', name: 'Lunar Saboteur', text: 'Destroy 2 relay stations or shield depots, across runs.', goal: 2, credits: 50, parts: 1, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'sites', sites: ['relay-station', 'shield-depot'] }) },
  ]),
  bastion: world('khepri', [
    specialist(6, 25),
    oldSchool(25, 'Rolling Thunder'),
    collector(110, 25),
    untouchable('Rolling Thunder'),
    long('scorched-earth', 'Scorched Earth', 'Destroy 40 ground targets, across runs.', 40, { kind: 'ground' }),
    hunterBounty(2),
    demolition(14),
    { slug: 'armor-piercer', name: 'Armor Piercer', text: 'Defeat Bastion-9 flying the Rail Driver.', goal: 1, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'boss', weapons: ['rail'] }) },
    { slug: 'flanking-maneuver', name: 'Flanking Maneuver', text: 'Destroy 3 enemies out on each flank in one run.', goal: 6, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'flanks', beyond: FLANK_X }) },
    { slug: 'dustfall', name: 'Dustfall', text: 'Destroy 6 ground turrets in a row without a hit.', goal: 6, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'ground-streak', kinds: ['turret'], anyHit: true }) },
    { slug: 'bastion-breaker', name: 'Bastion Breaker', text: 'Defeat Bastion-9 within 60 s of its arrival.', goal: 1, credits: 50, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', within: 60 }) },
    { slug: 'canyon-saboteur', name: 'Canyon Saboteur', text: 'Destroy 2 strike sites and complete the mission.', goal: 2, credits: 50, parts: 1, difficulty: 'relaxed', ...run({ kind: 'sites', complete: true }) },
  ]),
  'cold-vector': world('vesper', [
    specialist(7, 5),
    oldSchool(10, 'Cold Vector'),
    collector(170, 25),
    untouchable('Cold Vector'),
    long('overcharge', 'Overcharge', 'Fire your special 20 times, across runs.', 20, { kind: 'specials' }),
    airSuperiority(35, 25),
    demolition(16),
    { slug: 'icebreaker', name: 'Icebreaker', text: 'Destroy 3 shield depots or freight terminals, across runs.', goal: 3, credits: 25, parts: 0, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'sites', sites: ['shield-depot', 'freight-terminal'] }) },
    { slug: 'cold-vector', name: 'Cold Vector', text: 'Defeat the Helion Ark flying the Fan Cannon.', goal: 1, credits: 50, parts: 0, difficulty: 'relaxed', ...run({ kind: 'boss', weapons: ['fan'] }) },
    { slug: 'frozen-nerves', name: 'Frozen Nerves', text: 'Destroy 10 ground defences in a row without a hit.', goal: 10, credits: 50, parts: 0, difficulty: 'relaxed', ...run({ kind: 'ground-streak', kinds: ['turret', 'missile'], anyHit: true }) },
    // The Ark's weapon assemblies are its two radiators (their lane lasers), its first phase.
    { slug: 'broadside-broken', name: 'Broadside Broken', text: 'Destroy both Helion Ark radiators within 50 s of its arrival.', goal: 2, credits: 75, parts: 1, difficulty: 'relaxed', ...run({ kind: 'boss-parts', parts: ['left', 'right'], within: 50 }) },
    { slug: 'arkfall', name: 'Arkfall', text: 'Defeat the Helion Ark without hull damage in its final stage.', goal: 1, credits: 75, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', noHull: 'final' }) },
  ]),
  'deep-bloom': world('nacre', [
    specialist(8, 25),
    oldSchool(25, 'Deep Bloom'),
    untouchable('Deep Bloom'),
    hunterBounty(2),
    long('pearl-diver', 'Pearl Diver', 'Collect 1,000 coins, across runs.', 1000, { kind: 'credits' }),
    collector(330, 50),
    airSuperiority(55, 25),
    { slug: 'three-paths', name: 'Three Paths', text: 'Destroy 3 strike sites in one run.', goal: 3, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'sites' }) },
    { slug: 'seeker-sweep', name: 'Seeker Sweep', text: 'Down 12 airborne enemies over open water with Seeker Array fire.', goal: 12, credits: 50, parts: 0, difficulty: 'relaxed', ...run({ kind: 'air-water', weapon: 'seeker' }) },
    // THE VEIL's bays are launch points, not targets: this counts the pods they launch (docs/35 § 4).
    { slug: 'pod-bay-purge', name: 'Pod Bay Purge', text: 'Destroy 8 pods launched from THE VEIL\'s bays.', goal: 8, credits: 25, parts: 0, difficulty: 'relaxed', ...run({ kind: 'launched', boss: 'veil' }) },
    { slug: 'veil-survivor', name: 'Veil Survivor', text: 'Defeat THE VEIL without a hit in its final stage.', goal: 1, credits: 100, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', noHit: 'final' }) },
    { slug: 'alien-weapons-specialist', name: 'Alien Weapons Specialist', text: 'Defeat THE VEIL flying the Twin Pulse or Fan Cannon.', goal: 1, credits: 100, parts: 1, difficulty: 'relaxed', ...run({ kind: 'boss', weapons: ['pulse', 'fan'] }) },
  ]),
  'brood-strike': world('amnion', [
    specialist(8, 25),
    oldSchool(25, 'Brood Strike'),
    untouchable('Brood Strike'),
    hunterBounty(3),
    long('bonfire', 'Bonfire', 'Blow up 75 gas tanks, across runs.', 75, { kind: 'gas-tanks' }),
    demolition(18),
    airSuperiority(60, 50),
    { slug: 'nest-breaker', name: 'Nest Breaker', text: 'Destroy 2 brood hives, across runs.', goal: 2, credits: 50, parts: 0, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'sites', sites: ['brood-hive'] }) },
    // The organic sites' exposed cores: the brood hive's heart-sac and the spawning pool's pod.
    { slug: 'heartbreaker', name: 'Heartbreaker', text: 'Destroy 5 brood hive or spawning pool cores, across runs.', goal: 5, credits: 50, parts: 1, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'site-cores', sites: ['brood-hive', 'spawning-pool'] }) },
    { slug: 'brood-extermination', name: 'Brood Extermination', text: 'Destroy 12 drones launched by THE CRADLE, across runs.', goal: 12, credits: 75, parts: 0, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'launched', boss: 'cradle' }) },
    { slug: 'cradles-end', name: 'Cradle\'s End', text: 'Defeat THE CRADLE within 100 s of its arrival.', goal: 1, credits: 100, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', within: 100 }) },
    { slug: 'sterilization', name: 'Sterilization', text: 'Defeat THE CRADLE without hull damage in its final stage.', goal: 1, credits: 100, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', noHull: 'final' }) },
  ]),
  // Corona (docs/37; the user's go-ahead on the proposal, 5 November): the two new sites, the plasma sea and THE HELIOPHAGE.
  'dying-star': world('corona', [
    specialist(8, 25),
    oldSchool(25, 'Dying Star'),
    untouchable('Dying Star'),
    hunterBounty(3),
    long('starfall', 'Starfall', 'Destroy 20 strike sites, across runs.', 20, { kind: 'sites' }),
    { slug: 'extractor-breaker', name: 'Extractor Breaker', text: 'Destroy 3 Star Extractors, across runs.', goal: 3, credits: 50, parts: 1, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'sites', sites: ['star-extractor'] }) },
    { slug: 'lights-out', name: 'Lights Out', text: 'Destroy a Star Cage and complete the mission.', goal: 1, credits: 50, parts: 0, difficulty: 'relaxed', ...run({ kind: 'sites', sites: ['star-cage'], complete: true }) },
    { slug: 'plasma-skimmer', name: 'Plasma Skimmer', text: 'Destroy 15 airborne enemies over the plasma sea with the Fan Cannon in one run.', goal: 15, credits: 50, parts: 0, difficulty: 'relaxed', ...run({ kind: 'air-water', weapon: 'fan' }) },
    { slug: 'wraith-exorcist', name: 'Wraith Exorcist', text: 'Destroy 3 Wraiths in one run.', goal: 3, credits: 75, parts: 0, difficulty: 'relaxed', ...run({ kind: 'wraiths' }) },
    { slug: 'flare-dancer', name: 'Flare Dancer', text: 'Survive 4 Wraith volleys without a hit in one run.', goal: 4, credits: 25, parts: 0, difficulty: 'standard', ...run({ kind: 'wraith-clean', window: WRAITH_WINDOW }) },
    { slug: 'veteran-of-the-dying-star', name: 'Veteran of the Dying Star', text: 'Complete Dying Star on Veteran.', goal: 1, credits: 100, parts: 1, difficulty: 'veteran', ...run({ kind: 'complete' }) },
    { slug: 'sunburn', name: 'Sunburn', text: 'Defeat THE HELIOPHAGE within 60 seconds of its arrival.', goal: 1, credits: 100, parts: 1, difficulty: 'relaxed', ...run({ kind: 'boss', within: 60 }) },
  ]),
  'final-horizon': world('umbra', [
    specialist(8, 25),
    oldSchool(25, 'Final Horizon'),
    untouchable('Final Horizon'),
    hunterBounty(3),
    long('eclipse-vigil', 'Eclipse Vigil', 'Destroy 500 enemies, across runs.', 500, { kind: 'enemies' }),
    { slug: 'vanishing-act', name: 'Vanishing Act', text: 'Survive 3 Wraith volleys without a hit in one run.', goal: 3, credits: 25, parts: 0, difficulty: 'standard', ...run({ kind: 'wraith-clean', window: WRAITH_WINDOW }) },
    collector(400, 50),
    airSuperiority(65, 50),
    { slug: 'gravity-slingshot', name: 'Gravity Slingshot', text: 'Destroy 5 enemies with Gravitic Shield returns, across runs.', goal: 5, credits: 50, parts: 1, difficulty: 'relaxed', scope: 'career', ...run({ kind: 'reflected' }) },
    { slug: 'wraith-exorcist', name: 'Wraith Exorcist', text: 'Destroy 3 Wraiths in one run.', goal: 3, credits: 75, parts: 0, difficulty: 'relaxed', ...run({ kind: 'wraiths' }) },
    { slug: 'veteran-of-the-void', name: 'Veteran of the Void', text: 'Complete Final Horizon on Veteran.', goal: 1, credits: 100, parts: 1, difficulty: 'veteran', ...run({ kind: 'complete' }) },
    { slug: 'blackout', name: 'Blackout', text: 'Defeat THE ECLIPSE without hull damage in its final phase.', goal: 1, credits: 100, parts: 1, difficulty: 'standard', ...run({ kind: 'boss', noHull: 'final' }) },
  ]),
};

/** A mission by id, with the campaign mission (world) it belongs to. */
const BY_ID = new Map(Object.entries(WORLD_MISSIONS).flatMap(([sortie, list]) => list.map(def => [def.id, { def, sortie: sortie as MissionId }] as const)));
export const worldMission = (id: string) => BY_ID.get(id)?.def;

/** Difficulty order: a run on `flown` may progress a mission whose minimum is `needed`. */
const RANK: Readonly<Record<Difficulty, number>> = { relaxed: 0, standard: 1, veteran: 2 };
export const difficultyAllows = (flown: Difficulty, needed: Difficulty) => RANK[flown] >= RANK[needed];
/** The board's label for a minimum difficulty. */
export const DIFFICULTY_TAG: Readonly<Record<Difficulty, string>> = { relaxed: 'ANY', standard: 'STANDARD+', veteran: 'VETERAN' };
