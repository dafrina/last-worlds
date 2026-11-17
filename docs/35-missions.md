# World missions

Each campaign world has a board of twelve optional side missions that pay credits and parts. This doc covers the board's
rules, the definitions the missions count by, the missions per world, how events are tracked, feasibility, saving and the
screens. Campaign only, observation only (invariant 13; [docs/09](09-objectives-and-statistics.md)).

Runtime sources: `src/content/world-missions.ts` (`WORLD_MISSIONS`: every mission's goal, reward, minimum difficulty and
rule), `src/campaign/missions.ts` (the board, counters and saving), `src/sim/events.ts` (the run's observation hook),
`src/ui/mission-board.ts` (board, pause list, in-flight note, results). The user handed the design over on 3 November.

## 1. The board

- **Twelve per world,** in the user's order, each tied to its world's campaign mission and progressing only in that
  mission's runs.
- **Five visible** at a time (`VISIBLE_MISSIONS`). Completing one marks it done for good, pays its reward once and reveals
  the next, so five stay on the board until the list runs out. Done missions form the board's history.
- **Only the missions visible when a run starts count during it** (user, 4 November). One revealed mid-run counts from the
  next run (the pause list shows it as NEXT RUN), so a run completes at most five per world.
- **Single-run missions** (`scope: 'run'`) count within one attempt and start at zero each time; an unfinished attempt's
  progress shows as LAST RUN until the next attempt starts. **Career missions** (`scope: 'career'`, ACROSS RUNS) add up
  across attempts while visible.
- **The long mission** (`long`, user, 4 November): each world's fifth mission is a long career goal paying 50 credits and
  a part; it is always among the five visible, so it counts from the first run.
- **Minimum difficulty:** ANY (Relaxed and up), STANDARD+ or VETERAN. A run below a mission's minimum does not progress it.
- **Rewards** are paid automatically on completion (credits, and parts where listed), shown as a short in-flight note and
  on the results screen.

## 2. Definitions

All times are the run's active simulation time (`RunState.time`), which never runs while paused.

| Term | Definition |
| --- | --- |
| Ground target | An armed ground battery (turret or missile battery; site guards included, boss modules never), or a strike site, which counts once when its last core falls. Fuel skids do not count. |
| Airborne enemy | Any enemy that is neither a ground piece (battery, skid, site core) nor a boss module: squadron craft, aces, Wraiths and craft a boss launches. |
| Enemy | An airborne enemy or a ground target, never a boss module or a gas tank. |
| Gas tank | A fuel skid blown up by any cause, chain explosions included; never a site core. |
| Kill cause | Main weapon (with its weapon), special, reflected (a Spectre's Gravity Slingshot return) or blast (a fuel skid). Weapon and perk missions count only their own cause: Seeker Sweep only the Seeker Array's shots, Gravity Slingshot only reflected shots. |
| Over open water | The terrain under the enemy at its death is at or below the world's sea level (`overWater` in `src/sim/events.ts`); Corona's plasma sea counts the same way. |
| Hit | A registered hit on the ship (never one absorbed by invulnerability): a **shield hit** when a charge took it, else a **hull hit** (a life). "Without a hit": neither. "Without hull damage": shield hits allowed. |
| The fight | From the boss's arrival (the `arrival` phase) to its destruction; timed boss missions measure this span. |
| Final phase | The boss's last phase, its overload, to its destruction. A boss taken from its core phase straight to zero had an empty final phase, which counts as clean. |
| Loadout | Read from the run's config (`weapon`, and `rank`, the level chosen in the hangar) and checked against the live weapon and level all run. |
| Flanks | Beyond world \|x\| > `FLANK_X` on each side, where an enemy lies at its death. |
| Wraith volley | One Wraith attack (feint, teleport, three rounds), survived when no hit registers within `WRAITH_WINDOW` of its release. |
| Ground streak | Kills of the named batteries since the last hit (shield or hull). |
| Coins (Collector, Pearl Diver) | Coin pickups as the HUD's counter counts them: value × the world's `CREDIT_SCALE` × the difficulty's multiplier, rounded down. Mission rewards, the boss reward, full-shield credits and the starting balance never count. |
| Skimmer echo, split | Nahara: a Skimmer killed while its shot still flies, before it splits; flying between the split's two halves unhit ([docs/39](39-nahara-silent-empire.md)). |

## 3. The missions

Board order per world; **bold** is the long mission, ✱ a career mission. Goals, rewards and minimum difficulty are in
`WORLD_MISSIONS`.

| # | Luna (Training) | Khepri (Rolling Thunder) | Vesper (Cold Vector) | Nacre (Deep Bloom) |
| --- | --- | --- | --- | --- |
| 1 | Specialist | Specialist | Specialist | Specialist |
| 2 | Old School | Old School | Old School | Old School |
| 3 | Collector | Collector | Collector | Hunter Bounty |
| 4 | Air Superiority | Demolition | Air Superiority | Air Superiority |
| 5 | **Sky Patrol** | **Scorched Earth** | **Overcharge** | **Pearl Diver** |
| 6 | Untouchable | Untouchable | Untouchable | Untouchable |
| 7 | Demolition | Hunter Bounty | Demolition | Collector |
| 8 | First Flight | Armor Piercer | Icebreaker ✱ | Three Paths |
| 9 | Interceptor Drill | Flanking Maneuver | Cold Vector | Seeker Sweep |
| 10 | Warden Shutdown | Dustfall | Frozen Nerves | Pod Bay Purge |
| 11 | Training Discipline | Bastion Breaker | Broadside Broken | Veil Survivor |
| 12 | Lunar Saboteur ✱ | Canyon Saboteur | Rockfall | Alien Weapons Specialist |

| # | Amnion (Brood Strike) | Corona (Dying Star) | Nahara (Silent Empire) | Umbra (Final Horizon) |
| --- | --- | --- | --- | --- |
| 1 | Specialist | Specialist | Echo Hunter | Specialist |
| 2 | Old School | Flare Dancer | Split Runner | Vanishing Act |
| 3 | Hunter Bounty | Old School | Open Season | Old School |
| 4 | Demolition | Hunter Bounty | Demolition | Hunter Bounty |
| 5 | **Bonfire** | **Starfall** | **Temple Raider** | **Eclipse Vigil** |
| 6 | Untouchable | Untouchable | Untouchable | Untouchable |
| 7 | Air Superiority | Extractor Breaker ✱ | Shieldbreaker | Collector |
| 8 | Nest Breaker ✱ | Heat Shield | Collector | Air Superiority |
| 9 | Heartbreaker ✱ | Plasma Skimmer | Canyon Runner | Gravity Slingshot ✱ |
| 10 | Brood Extermination ✱ | Solar Wind | Vent Breaker | Wraith Exorcist |
| 11 | Cradle's End | Veteran of the Dying Star | Veteran of the Silent Empire | Veteran of the Void |
| 12 | Sterilization | Sunburn | Empire's End | Blackout |

The kinds of mission (`MissionRule` in `src/content/world-missions.ts`):

- **Counts in one run:** specials fired, airborne enemies (optionally within a time window), ground targets, aces, coins,
  strike sites, enemies on each flank, kills of one Nahara kind, Wraiths, Wraith volleys survived, ground streaks.
- **Completion conditions:** complete without a special, without a hit, flying a given weapon and level, or on Veteran.
- **Boss goals:** defeat the boss within a time, without a hit or without hull damage in the fight or its final phase,
  flying given weapons, or destroy given modules within a time of its arrival.
- **Career goals:** the same counts across runs, for what one attempt cannot reliably hold (rare strike sites, a boss's
  launched craft, reflected kills) and the long missions.

Mappings worth knowing: *Lunar Saboteur* counts relay stations and shield depots (communication and defence);
*Icebreaker* shield depots and freight terminals; *Broadside Broken* HELION STRONGHOLD's two cannons, its first phase (*Rockfall* was *Arkfall* before the Ark's model was replaced, 17 November);
*Pod Bay Purge* the pods launched from THE VEIL's bays (launch points, not targets); *Heartbreaker* the organic sites'
exposed cores (brood hive, spawning pool), not the overrun machine sites; *Brood Extermination* the hatchling waves THE
CRADLE launches.

## 4. How events are tracked

- **The hook** (`src/sim/events.ts`): a campaign run carries `RunState.events`, attached by `src/main.ts` at launch. The
  simulation appends kills (kind, cause, weapon, special, ground or air, position, over water, site, boss module, ace,
  launching boss), registered hits, specials, boss phases, coin pickups, fallen sites, Wraith volleys and Skimmer threads,
  and never reads them. An observed and an unobserved run of the same seed and inputs end identical
  (`tests/sim/run-events.test.ts`).
- **The counters** (`src/campaign/missions.ts`): each attempt builds one counter per mission visible at its start that its
  difficulty allows, fed the drained events each frame. Nothing scans enemies or missions per frame. Endless runs never get
  the list.
- **Notes:** progress shows in flight at every fifth of a goal (every step for goals of five or less); completions always
  show.

## 5. Feasibility

Every mission must be achievable in the real game. `tests/sim/missions-feasibility-inner.test.ts` and `-outer.test.ts`
fly each world with the perfect test pilot, attempt after attempt (seeds 1, 2, …), each with the loadout a player would pick
for the missions on the board at its start (`planFor` in `tests/sim/mission-harness.ts`: strong gear unless a visible
mission needs otherwise), through the real tracker and a saved profile, and require all twelve done within a set number of
attempts and the board's exact total payout. Only the missions visible at an attempt's start count, so a world takes at
least three attempts; worlds whose missions need rare strike sites (Amnion's brood hives, Nacre's three sites in one run)
take more.

`MISSION_REPORT=<file> npx vitest run tests/sim/missions-report.test.ts` (one process per world with `MISSION_WORLDS`)
flies each mission alone with its own loadout and reports per-seed completion.

- No mission is out of reach on its minimum difficulty.
- Several missions need upgrades (Demolition, Air Superiority, Collector and the timed boss goals fall short at Level 1);
  Sunburn needs a top-level weapon.
- The perfect pilot takes almost no hits, so Untouchable and the no-hit goals are far harder for a person than the tests
  suggest; that is their purpose (most are Standard+ and pay parts).
- Weapon and perk missions need owned gear (Armor Piercer, Cold Vector, Seeker Sweep, Plasma Skimmer, Gravity Slingshot);
  First Flight needs the level selector set to level 1.

## 6. Saving and rewards

- **Where:** the profile's opaque `missionBoard` field ([docs/30](30-campaign-progression.md#the-save)), carried unchanged
  through every load and migration; one object per world with revealed ids in order, claimed ids, achieved-while-hidden
  ids, career progress, the running attempt's career share (`live`) and the last attempt's progress (`last`). Its own
  schema `version: 1`.
- **When:** a completion is saved and paid the moment it happens, so a mid-flight reload never loses it. Career progress is
  saved as the running attempt's share whenever it changes; the attempt's end folds that share into the total once. An
  interrupted attempt's saved share is folded in when the world's next attempt starts.
- **Paying:** every claim calls `awardOnce(profile, 'mission:<id>', credits, parts)` in the same transaction that saves the
  board. The award receipts and the claimed list each stop a second payment.
- **Unreadable:** a board that cannot be read is kept as it is and never overwritten; missions pause for the session and
  the board says so.
- **Retired missions** (Groundbreaker, Echo Breaker and others replaced since): a board that paid one keeps the payment and
  no longer shows it.

## 7. On screen

- **Campaign page:** below LAUNCH MISSION, MISSIONS · WORLD with done/total and the five visible cards (name, progress bar,
  minimum difficulty when above ANY, ONE RUN / LAST RUN / ACROSS RUNS, reward). COMPLETED lists done missions as cards with
  a check badge, most recent first; cards completed since the board was last seen pop in once (still with reduced motion).
- **In flight:** one small line under the lives and shields, one note at a time; a paid reward pulses into the coin
  counter.
- **Pause:** the visible missions with this run's progress.
- **Results:** MISSIONS COMPLETE with every mission paid during the attempt.

## 8. Validation

- `tests/campaign/missions.test.ts`: content totals, visibility and reveal order, counting only visible missions, career
  progress, long missions, retired ids, unreadable boards, every definition, rewards once across reloads, interrupted
  attempts, difficulty gates, endless never progressing.
- `tests/sim/run-events.test.ts`: observation never changes a run; attribution of special and reflected kills; hits only
  when registered.
- `tests/sim/missions-feasibility-*.test.ts`: every world's twelve through the real tracker.
- `tests/ui/mission-notes.test.ts`: the note throttle. `tests/browser/missions.spec.ts`: board, note, pause list,
  results and save.
- Not tested on phones.
