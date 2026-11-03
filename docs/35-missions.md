# 35 · World missions

Status: built 3 November 2026 (user handover, 3 November). Runtime sources: `src/content/world-missions.ts` (the 72
missions), `src/campaign/missions.ts` (board, counters, saving), `src/sim/events.ts` (the run's observation hook),
`src/ui/mission-board.ts` (board, pause list, in-flight note, results). Campaign only (AGENTS.md invariant 13).
Review sheet: `docs/screenshots/missions.jpg`.

This replaces the "mission contracts" and "career milestones" proposal of docs/09 §§ 1–4 for the campaign; docs/09's rules
still apply: missions only observe, never change targeting, damage, drops, movement, camera or enemies; endless never
progresses them; rewards are campaign-only and paid once.

## 1. The board

- **Twelve per world**, in the user's order. Each world's missions belong to its campaign mission (Luna: Training, Khepri:
  Rolling Thunder, Vesper: Cold Vector, Nacre: Deep Bloom, Amnion: Brood Strike, Umbra: Final Horizon) and progress only in
  that mission's runs.
- **Five visible** at a time, the first five at first. Completing one marks it done for good, pays its reward once and reveals
  the next hidden one, so five stay on the board until the list runs out. Done missions form the board's history.
- **Hidden missions are tracked too.** One completed while hidden is kept as *achieved*; it is paid and marked done the
  moment it is revealed (which reveals the next one in turn). It is never repeated.
- **Single-run missions** (`scope: 'run'`) count within one attempt. Progress starts at zero each attempt; an unfinished
  attempt's progress is shown on the board as LAST RUN until the next attempt starts, and is never combined with another
  attempt's. A success is kept.
- **Career missions** (`scope: 'career'`, ACROSS RUNS on the board) add up across attempts. Only six are career missions, each
  because one attempt cannot reliably hold the objective (§ 5).
- **Difficulty**: each mission has a minimum (the game's levels: Relaxed = the user's Easy, Standard = Normal, Veteran).
  ANY = any difficulty; STANDARD+ = Standard or Veteran; VETERAN = Veteran only. A run below a mission's minimum does not
  progress it at all, so a perfect Relaxed run never completes a Standard+ mission but completes the ordinary ones.
- **Rewards** are paid automatically on completion (credits, and parts where listed), shown at once as a short in-flight
  note and on the results screen.

## 2. Definitions

All times are the run's active simulation time (`RunState.time`), which never runs while paused.

| Term | Definition |
| --- | --- |
| Ground target | An armed ground battery (turret or missile battery; site guards included; boss modules never), or a strike site, which counts once when its last core falls. **Fuel skids do not count**: they are harmless loot targets that burst and chain, and counting them made Demolition trivial (Luna 11–17 a run with skids against 3–9 without). Site cores count only through their site. |
| Airborne enemy | Any enemy that is neither a ground piece (battery, skid, site core) nor a boss module: darts, weavers, Lancers, Needles, Diamonds, Pulsars, Wraiths, hunters, and craft a boss launches. |
| Enemy (Flanking Maneuver) | An airborne enemy or an armed ground battery. |
| Kill cause | Main weapon (its shot, with its weapon), special (the Shockwave ring, a Seeker Rack missile, the Siege Lance, a Gravity Well), reflected (a Spectre's Gravitic Shield return) or blast (a fuel skid's explosion). Weapon and perk missions count only their own cause: Seeker Sweep only the Seeker Array's shots (never the Seeker Rack special or a blast), Gravity Slingshot only reflected shots. |
| Over open water | The terrain directly under the enemy at its death is at or below the world's sea level (`overWater`, src/sim/events.ts). |
| Hit | A registered hit on the ship (never one absorbed by invulnerability). A **shield hit** when a shield charge took it, else a **hull hit** (a life lost). "Without taking damage / a hit": no shield and no hull hit. "Without hull damage": shield hits allowed. |
| The fight | From the boss's arrival (its name shows; the `arrival` phase) to its destruction. Timed boss missions measure this span: Warden Shutdown ≤ 100 s, Bastion Breaker ≤ 120 s, Cradle's End ≤ 150 s. |
| Final phase / stage | The boss's last phase: its overload (every boss has one), from its start to the boss's destruction. A boss destroyed straight from its core phase (one blow taking it past its overload threshold to zero) had an empty final phase, which counts as clean. |
| Loadout | Read from the run's config (`weapon`, `rank`: what the run flies; rank 0 is tier 1) and checked against the live weapon and tier at every frame of the run. Campaign runs cannot change weapon; the check holds the definition if that ever changes. |
| Flanks | The map is 24 wide and the screen 12: the flanks are world \|x\| > 6 on each side, where an enemy lies at its death. |
| Wraith zap sequence | One Wraith attack: its feint, teleport and three-round volley (content/wraith.ts). It is survived when no hit registers within 1.5 s of the volley's release (its rounds leave at 16 units/s or faster from rows 10.5–16.5 and cross the ship's row within about 1.1 s). Hunter Wraiths' volleys count. |
| Ground streak | Dustfall and Frozen Nerves: kills of those batteries since the last hull hit (a shield hit keeps the streak). |
| Coins (Collector) | Coin pickups collected in flight, counted as the HUD's coin counter counts them: their value × 0.5 × the difficulty's multiplier (×0.85 / ×1 / ×1.2). Mission rewards, the boss reward, a full shield cell's 5 credits and the starting balance never count. |

## 3. The missions

`coins | parts | minimum difficulty`; career missions marked ✱. Rule kinds in `src/content/world-missions.ts`.

| # | Luna (Training) | Khepri (Rolling Thunder) | Vesper (Cold Vector) |
| --- | --- | --- | --- |
| 1 | Groundbreaker: 5 ground targets (25 \| 0 \| any) | Groundbreaker (25 \| 0 \| any) | Groundbreaker (5 \| 0 \| any) |
| 2 | Specialist: 3 specials (25 \| 0 \| any) | Specialist: 3 (25 \| 0 \| any) | Specialist: 3 (5 \| 0 \| any) |
| 3 | Old School: complete without a special (25 \| 0 \| any) | Old School (25 \| 0 \| any) | Old School (10 \| 0 \| any) |
| 4 | Untouchable: complete without a hit (50 \| 1 \| Standard+) | Collector: 70 coins (25 \| 0 \| any) | Collector: 105 (25 \| 0 \| any) |
| 5 | Collector: 55 coins (25 \| 0 \| any) | Untouchable (50 \| 1 \| Standard+) | Untouchable (50 \| 1 \| Standard+) |
| 6 | Air Superiority: 12 airborne (25 \| 0 \| any) | Hunter Bounty: 1 hunter (25 \| 0 \| any) | Air Superiority: 20 (25 \| 0 \| any) |
| 7 | Demolition: 8 ground targets (25 \| 0 \| any) | Demolition: 10 (25 \| 0 \| any) | Demolition: 10 (25 \| 0 \| any) |
| 8 | First Flight: complete with a tier-1 Twin Pulse (25 \| 1 \| any) | Armor Piercer: defeat Bastion-9 flying the Rail Driver (25 \| 0 \| any) | Icebreaker ✱: 3 shield depots or freight terminals (25 \| 0 \| any) |
| 9 | Interceptor Drill: 4 airborne within 8 s (25 \| 0 \| any) | Flanking Maneuver: 3 enemies on each flank (25 \| 0 \| any) | Cold Vector: defeat the Ark flying the Fan Cannon (50 \| 0 \| any) |
| 10 | Warden Shutdown: WARDEN-1 within 100 s (25 \| 0 \| Standard+) | Dustfall: 4 turrets in a row without hull damage (25 \| 0 \| any) | Frozen Nerves: 5 ground defences in a row without hull damage (50 \| 0 \| any) |
| 11 | Training Discipline: WARDEN-1 without hull damage in the fight (50 \| 1 \| Standard+) | Bastion Breaker: Bastion-9 within 120 s (50 \| 1 \| Standard+) | Broadside Broken: both Ark radiators before its bridge falls (75 \| 1 \| any) |
| 12 | Lunar Saboteur ✱: 2 relay stations or shield depots (50 \| 1 \| any) | Canyon Saboteur: 2 strike sites and complete (50 \| 1 \| any) | Arkfall: the Ark without hull damage in its final stage (75 \| 1 \| Standard+) |
| **Σ** | **375 coins, 4 parts** | **375, 3** | **420, 3** |

| # | Nacre (Deep Bloom) | Amnion (Brood Strike) | Umbra (Final Horizon) |
| --- | --- | --- | --- |
| 1 | Groundbreaker (25 \| 0 \| any) | Groundbreaker (25 \| 0 \| any) | Groundbreaker (25 \| 0 \| any) |
| 2 | Specialist: 5 (25 \| 0 \| any) | Specialist: 5 (25 \| 0 \| any) | Specialist: 5 (25 \| 0 \| any) |
| 3 | Old School (25 \| 0 \| any) | Old School (25 \| 0 \| any) | Old School (25 \| 0 \| any) |
| 4 | Untouchable (50 \| 1 \| Standard+) | Untouchable (50 \| 1 \| Standard+) | Untouchable (50 \| 1 \| Standard+) |
| 5 | Hunter Bounty (25 \| 0 \| any) | Hunter Bounty (25 \| 0 \| any) | Hunter Bounty (25 \| 0 \| any) |
| 6 | Collector: 140 (50 \| 0 \| any) | Demolition: 12 (25 \| 0 \| any) | Vanishing Act: 3 Wraith volleys without a hit, one run (25 \| 0 \| Standard+) |
| 7 | Air Superiority: 20 (25 \| 0 \| any) | Air Superiority: 25 (50 \| 0 \| any) | Collector: 185 (50 \| 0 \| any) |
| 8 | Three Paths: 3 strike sites in one run (25 \| 0 \| any) | Nest Breaker ✱: 3 brood hives (50 \| 0 \| any) | Air Superiority: 25 (50 \| 0 \| any) |
| 9 | Seeker Sweep: 12 airborne over open water by Seeker Array fire (50 \| 0 \| any) | Heartbreaker ✱: 5 brood hive or spawning pool cores (50 \| 1 \| any) | Gravity Slingshot ✱: 5 kills by Gravitic Shield returns (50 \| 1 \| any) |
| 10 | Pod Bay Purge: 2 pods launched from THE VEIL's bays (25 \| 0 \| any) | Brood Extermination ✱: 12 drones launched by THE CRADLE (75 \| 0 \| any) | Wraith Exorcist: 3 Wraiths in one run (75 \| 0 \| any) |
| 11 | Veil Survivor: no hit in THE VEIL's final stage (100 \| 1 \| Standard+) | Cradle's End: THE CRADLE within 150 s (100 \| 1 \| Standard+) | Veteran of the Void: complete on Veteran (100 \| 1 \| Veteran) |
| 12 | Alien Weapons Specialist: defeat THE VEIL flying the Twin Pulse or Fan Cannon (100 \| 1 \| any) | Sterilization: THE CRADLE without hull damage in its final stage (100 \| 1 \| Standard+) | Blackout: THE ECLIPSE without hull damage in its final phase (100 \| 1 \| Standard+) |
| **Σ** | **525, 3** | **600, 4** | **600, 4** |

All six: **2,895 coins and 21 parts**, as handed over (tested). Mars and Cloud World have none.

**Mappings** (the handover asked for them to be justified):
- *Lunar Saboteur*, human communication or defence installations: the relay station (its dish's feed horn: communication)
  and the shield depot (its generator: defence). The airfield (a control tower) could join; left out to stay with the
  user's example.
- *Icebreaker*: the shield depot and freight terminal strike sites, as the handover says.
- *Broadside Broken*: the Helion Ark's weapon assemblies are its two radiators (their lane lasers), its first phase.
- *Pod Bay Purge*: THE VEIL's bays (`VEIL.bays`) are launch points, not targets. It counts the pods launched from them
  (the `veil-pods` wave), the handover's proposed smallest change (§ 5).
- *Heartbreaker*: the organic sites' exposed cores, the brood hive's heart-sac and the spawning pool's pod. The overrun relay,
  freight and gate sites on Amnion keep their machine cores and do not count.
- *Brood Extermination*: the hatchling waves THE CRADLE launches from its brood bays (`veil-pods` template, its
  `launches`): up to 5 waves of 4 per fight.

## 4. How events are tracked

- **The hook** (`src/sim/events.ts`): a campaign run carries `RunState.events`, attached by `src/main.ts` at launch. The
  simulation appends to it and never reads it: kills (`kind`, cause, main weapon, special, ground/air, position, over water,
  site, boss module, hunter, launching boss), registered hits (shield or hull), specials, boss phases, coin pickups, fallen
  sites and Wraith volleys. Without the list nothing is built. `damageEnemy` gained one parameter, the kill's cause. An
  observed and an unobserved run of the same seed and inputs end in identical states (`tests/sim/run-events.test.ts`, two
  full missions, deep equality).
- **The counters** (`src/campaign/missions.ts`): each campaign attempt builds one counter per open mission its difficulty
  allows (at most twelve) and feeds them the drained events once (game-ui.ts drains each frame). A counter only reacts to
  its events: nothing scans enemies or missions per frame. Endless runs never get the list or a tracker.
- **Notes**: a visible mission's progress shows in flight at every fifth of its goal (every step for goals of five or less);
  completions always show.

## 5. Feasibility (measured)

Method: the perfect test pilot (tests/sim/pilots.ts) flies each world's mission on seeds 1–12 at Standard (Veteran for
Veteran of the Void), tier 1 and tier 3 Twin Pulse, collecting coins and strike sites, firing specials when charged (except
for Old School); loadout objectives fly their loadout, Flanking Maneuver flies to each flank in turn. Share of single
attempts that complete each mission; career missions: mean progress per attempt
(`MISSION_REPORT=<file> npx vitest run tests/sim/missions-report.test.ts`, about 9 minutes).

| World | Under 100 % at tier 1 (tier 3) | Career progress per attempt |
| --- | --- | --- |
| Luna | Groundbreaker 92 % (100), Demolition 58 % (100) | Lunar Saboteur 0.58 (0.67) |
| Khepri | Groundbreaker 92 % (100), Demolition 25 % (100), Flanking Maneuver 75 % (100), Dustfall 92 % (100), Canyon Saboteur 67 % (83), Untouchable 100 % (92) | — |
| Vesper | none | Icebreaker 1.00 (1.00) |
| Nacre | Untouchable 75 % (92), Three Paths 25 % (42) | — |
| Amnion | Untouchable 92 % (100), Demolition 33 % (100) | Nest Breaker 0.17 (0.17), Heartbreaker 0.50 (0.58), Brood Extermination 9.3 (11.8) |
| Umbra | Untouchable 92 % (100), Vanishing Act 92 % (100) | Gravity Slingshot 0.67 (0.67) |

Every other mission completes on every seed at both tiers. The perfect pilot takes almost no hits, so Untouchable and the
hull-damage objectives are far harder for a person than these numbers suggest; that is their purpose (Standard+, a part).
End to end, `tests/sim/missions-feasibility-*.test.ts` clears all twelve on every world through the real tracker and a saved
profile, and checks the payout totals.

**Flagged for the user** (implemented as below; nothing was dropped and no payout changed):
1. **Broadside Broken is trivial.** The radiators are the Ark's mandatory first phase: its bridge cannot be damaged until both
   fall, so every Ark fight completes it (100 %), even one the pilot then loses. Proposal, smallest change: "destroy both
   radiators within 40 s of the Ark's arrival" (or "without hull damage").
2. **Pod Bay Purge: the bays are not targets.** Implemented as the handover's proposal, 2 pods launched from THE VEIL's bays
   (100 %: 6–14 a fight). The alternative, its two gill pods (its first phase), would be as trivial as Broadside Broken.
3. **Nest Breaker is a long grind**: an attempt draws a brood hive 30 % of the time (the deck, 2,000 seeds), and about 0.17
   fall per attempt, so 3 take some 18 attempts. Proposals: 2 hives (about 12), or brood hives and spawning pools (about 6,
   overlapping Heartbreaker).
4. **Cumulative by necessity** (no "in one run" in the handover, and one attempt cannot reliably hold them): Lunar Saboteur
   (a relay station or shield depot is drawn about 0.8 times an attempt, both together rarely), Icebreaker (about one an
   attempt), Nest Breaker, Heartbreaker (about 0.5 an attempt), Brood Extermination (6–15 drones shot down a fight; 12 in one
   fight about half the time at tier 3, less at tier 1, which shoots fewer down, and at tier 5, whose short fight launches
   fewer waves) and Gravity Slingshot (a return rarely lands the killing blow: 0–3 an attempt).
5. **Easy timers**: WARDEN-1 falls 49–61 s after its arrival at tier 1 (limit 100) and Bastion-9 67–79 s (limit 120), with
   the 3 November +20 % boss health. THE CRADLE's 123–141 s against 150 is a real target at tier 1. Proposal if wanted:
   60 s and 80 s.
6. **Three Paths depends on the draw**: an attempt draws 3 or more sites 35 % of the time; then it is a fair challenge.
7. **First Flight needs a tier-1 Pulse**: until the hangar lets a pilot fly a lower tier than owned (the economy work), a pilot
   who upgraded the Pulse cannot do it.
8. **Collector counts HUD coins** (scaled like the coin counter), not the pickups' raw value; with raw values every Collector
   completes by just finishing the mission (raw medians are 2–4 times the targets).
9. **Requires owned gear**: Armor Piercer (Rail Driver), Cold Vector (Fan Cannon), Seeker Sweep (Seeker Array), Gravity
   Slingshot (the Spectre, which needs Final Horizon cleared). A hidden one simply waits.

## 6. Saving and rewards

- **Where**: the board is the profile's opaque `missionBoard` field (economy contract, src/campaign/profile.ts), one object
  per world: revealed ids in reveal order, claimed ids (the history), achieved-while-hidden ids, career progress, the running
  attempt's career share (`live`) and the last attempt's single-run progress (`last`). Schema `version: 1`.
- **When**: a completion is saved and paid the moment it happens (a mid-flight reload never loses it); career progress is saved
  whenever it changes, as the running attempt's share; the attempt's end (complete, lost or abandoned) folds that share into
  the career total once and records its last progress. An interrupted attempt's saved share is folded in when the next attempt
  starts (docs/09 § 3: observed progress counts, once).
- **Paying**: every claim calls `awardOnce(profile, 'mission:<id>', credits, parts)` in the same profile transaction
  (`missionTransaction`) that saves the board. The receipt list (`awards`) and the board's claimed list each stop a second
  payment; reopening results, a second finish, a reload or another attempt never pays twice (tested).
- **Unreadable**: a board that cannot be read (broken, or from a newer build) is kept exactly as it is and never overwritten;
  missions are paused for the session and the board says so.

## 7. On screen

- **Campaign page**: below LAUNCH MISSION, MISSIONS · WORLD with done/total, the five visible missions (name, progress and bar,
  one line, minimum difficulty in orange when above ANY, ONE RUN / LAST RUN / ACROSS RUNS, reward), and the last three done.
- **In flight**: one small line under the lives and shields (`SPECIALIST 1/3`, gold for `… COMPLETE · +25 CR`), shown 1.8 s,
  one at a time, newer progress replacing a queued note; nothing while paused. A paid reward also pulses into the coin counter.
- **Pause**: the visible missions with this run's progress.
- **Results**: MISSIONS COMPLETE with every mission paid during the attempt and its reward.

## 8. Validation

- `tests/campaign/missions.test.ts`: content totals; five visible and the reveal order; hidden progress kept and paid on
  reveal; unreadable boards untouched; definitions (ground targets, shield vs hull, final stage, timed boss, Seeker attribution,
  reflected attribution, Collector, First Flight, windows, flanks); rewards once across a reload; career progress through an
  interrupted attempt; difficulty gates; endless never progressing; one payment per receipt.
- `tests/sim/run-events.test.ts`: observed and unobserved runs identical; Seeker Rack kills attributed to the special; a
  Gravitic Shield return reported as a reflected kill; hits only when registered; the boss reward and full-shield credits not
  reported as coins; boss phases, sites and Wraith volleys reported.
- `tests/sim/missions-feasibility-inner.test.ts` and `-outer.test.ts`: every world's twelve done through the real tracker.
- `tests/ui/mission-notes.test.ts`: the note throttle.
- `tests/browser/missions.spec.ts`: the board (seeded save), a note in flight, the pause list, the results, the save.
- Not tested: phones (no hardware test).
