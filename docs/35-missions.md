# 35 · World missions

Status: built 3 November 2026 (user handover, 3 November); goals retuned, counting limited to the visible missions and a long mission added to every world on 4 November. Runtime sources: `src/content/world-missions.ts` (the 72
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
- **Only the missions visible when a run starts count during it** (user, 4 November; it replaced tracking hidden ones). A
  mission revealed mid-run starts counting on the next run, so one run completes at most five missions per world (before,
  each completion revealed a card the run had already achieved: one level-3 Rail run with the Gravity Well completed 7 on
  Luna and 9 on Khepri). The pause list shows a card revealed mid-run as NEXT RUN.
- **Saves from before 4 November** may hold missions *achieved* while hidden: they are kept, paid and marked done the moment
  they are revealed (which reveals the next one in turn), never repeated and never taken back. The board's save format is
  unchanged (version 1).
- **Single-run missions** (`scope: 'run'`) count within one attempt. Progress starts at zero each attempt; an unfinished
  attempt's progress is shown on the board as LAST RUN until the next attempt starts, and is never combined with another
  attempt's. A success is kept.
- **Career missions** (`scope: 'career'`, ACROSS RUNS on the board) add up across attempts, only while they are visible: the
  six that one attempt cannot reliably hold (§ 5) and each world's long mission.
- **Long missions** (user, 4 November): each world's fifth mission is a long one, across runs, paying 50 coins and a part:
  Sky Patrol (Luna, 100 airborne enemies), Scorched Earth (Khepri, 40 ground targets), Overcharge (Vesper, 20 specials), Pearl
  Diver (Nacre, 1,000 coins), Bonfire (Amnion, 75 gas tanks) and Eclipse Vigil (Umbra, 500 enemies). They replaced Groundbreaker,
  the first mission; the four after it moved up. A fresh board shows the four standard missions, then the long mission fifth,
  so it counts from the first run.
- **The long mission is always among the five visible.** On a saved board from before it, it comes up at once as the fifth
  card: the most recently revealed card goes back to the front of the hidden queue (it keeps any saved progress and is the
  next card revealed), so exactly five show and the long mission is last; it counts from the next run. Groundbreaker's id is
  retired: a board that paid it keeps the payment (its `awards` receipt and credits) and no longer shows it, done or open.
  Nothing is paid twice and nothing is taken back (tested). Visible cards show in reveal order, so later reveals appear after
  the long mission.
- **Difficulty**: each mission has a minimum (the game's levels: Relaxed = the user's Easy, Standard = Normal, Veteran).
  ANY = any difficulty; STANDARD+ = Standard or Veteran; VETERAN = Veteran only. A run below a mission's minimum does not
  progress it at all, so a perfect Relaxed run never completes a Standard+ mission but completes the ordinary ones.
- **Rewards** are paid automatically on completion (credits, and parts where listed), shown at once as a short in-flight
  note and on the results screen.

## 2. Definitions

All times are the run's active simulation time (`RunState.time`), which never runs while paused.

| Term | Definition |
| --- | --- |
| Gas tank | A fuel skid (a harmless ground loot target) blown up by any cause, a skid's chain explosion included; never a site core. Bonfire counts them; no other mission does. |
| Enemy (Eclipse Vigil) | An airborne enemy or a ground target (a strike site counting once); never a boss module or a gas tank. |
| Ground target | An armed ground battery (turret or missile battery; site guards included; boss modules never), or a strike site, which counts once when its last core falls. **Fuel skids do not count**: they are harmless loot targets that burst and chain, and counting them made Demolition trivial (Luna 11–17 a run with skids against 3–9 without). Site cores count only through their site. |
| Airborne enemy | Any enemy that is neither a ground piece (battery, skid, site core) nor a boss module: darts, weavers, Lancers, Needles, Diamonds, Pulsars, Wraiths, hunters, and craft a boss launches. |
| Enemy (Flanking Maneuver) | An airborne enemy or an armed ground battery. |
| Kill cause | Main weapon (its shot, with its weapon), special (the Shockwave ring, a Seeker Rack missile, the Siege Lance, a Gravity Well), reflected (a Spectre's Gravitic Shield return) or blast (a fuel skid's explosion). Weapon and perk missions count only their own cause: Seeker Sweep only the Seeker Array's shots (never the Seeker Rack special or a blast), Gravity Slingshot only reflected shots. |
| Over open water | The terrain directly under the enemy at its death is at or below the world's sea level (`overWater`, src/sim/events.ts). |
| Hit | A registered hit on the ship (never one absorbed by invulnerability). A **shield hit** when a shield charge took it, else a **hull hit** (a life lost). "Without taking damage / a hit": no shield and no hull hit. "Without hull damage": shield hits allowed. |
| The fight | From the boss's arrival (its name shows; the `arrival` phase) to its destruction. Timed boss missions measure this span: Warden Shutdown ≤ 45 s, Bastion Breaker ≤ 60 s, Cradle's End ≤ 100 s; Broadside Broken counts both radiators within 50 s of it. Training Discipline allows no hit at all during it. |
| Final phase / stage | The boss's last phase: its overload (every boss has one), from its start to the boss's destruction. A boss destroyed straight from its core phase (one blow taking it past its overload threshold to zero) had an empty final phase, which counts as clean. |
| Loadout | Read from the run's config (`weapon`, and `rank`: the level the run flies, chosen in the hangar; rank 0 is level 1) and checked against the live weapon and level at every frame of the run. Campaign runs cannot change weapon; the check holds the definition if that ever changes. First Flight: `weapon === 'pulse'` and `rank === 0` for the whole run. |
| Flanks | The map is 24 wide and the screen 12: the flanks are world \|x\| > 6 on each side, where an enemy lies at its death. |
| Wraith zap sequence | One Wraith attack: its feint, teleport and three-round volley (content/wraith.ts). It is survived when no hit registers within 1.5 s of the volley's release (its rounds leave at 16 units/s or faster from rows 10.5–16.5 and cross the ship's row within about 1.1 s). Hunter Wraiths' volleys count. |
| Ground streak | Dustfall and Frozen Nerves: kills of those batteries since the last hit, shield or hull (4 November; the rule's `anyHit`). The rule also allows a hull-only streak; no mission uses it now. |
| Coins (Collector) | Coin pickups collected in flight, counted as the HUD's coin counter counts them: their value × the world's `CREDIT_SCALE` (Luna 0.192, Khepri 0.224, Vesper 0.24, Nacre 0.384, Amnion 0.41, Corona 0.425, Umbra 0.45 since 10 November; src/content/equipment.ts) × the difficulty's multiplier (×0.85 / ×1 / ×1.2), rounded down. Mission rewards, the boss reward, a full shield cell's 5 credits and the starting balance never count. |

## 3. The missions

`coins | parts | minimum difficulty`; career missions marked ✱. Rule kinds in `src/content/world-missions.ts`.

| # | Luna (Training) | Khepri (Rolling Thunder) | Vesper (Cold Vector) |
| --- | --- | --- | --- |
| 1 | Specialist: 5 specials (25 \| 0 \| any) | Specialist: 6 (25 \| 0 \| any) | Specialist: 7 (5 \| 0 \| any) |
| 2 | Old School: complete without a special (25 \| 0 \| any) | Old School (25 \| 0 \| any) | Old School (10 \| 0 \| any) |
| 3 | Untouchable: complete without a hit (50 \| 1 \| Standard+) | Collector: 110 coins (25 \| 0 \| any) | Collector: 170 (25 \| 0 \| any) |
| 4 | Collector: 70 coins (25 \| 0 \| any) | Untouchable (50 \| 1 \| Standard+) | Untouchable (50 \| 1 \| Standard+) |
| 5 | **Sky Patrol** ✱: 100 airborne enemies (50 \| 1 \| any) | **Scorched Earth** ✱: 40 ground targets (50 \| 1 \| any) | **Overcharge** ✱: 20 specials (50 \| 1 \| any) |
| 6 | Air Superiority: 30 airborne (25 \| 0 \| any) | Hunter Bounty: 2 aces (25 \| 0 \| any) | Air Superiority: 35 (25 \| 0 \| any) |
| 7 | Demolition: 10 ground targets (25 \| 0 \| any) | Demolition: 14 (25 \| 0 \| any) | Demolition: 16 (25 \| 0 \| any) |
| 8 | First Flight: complete with a level-1 Twin Pulse (25 \| 1 \| any) | Armor Piercer: defeat Bastion-9 flying the Rail Driver (25 \| 0 \| any) | Icebreaker ✱: 3 shield depots or freight terminals (25 \| 0 \| any) |
| 9 | Interceptor Drill: 6 airborne within 5 s (25 \| 0 \| any) | Flanking Maneuver: 3 enemies on each flank (25 \| 0 \| any) | Cold Vector: defeat the Ark flying the Fan Cannon (50 \| 0 \| any) |
| 10 | Warden Shutdown: WARDEN-1 within 45 s (25 \| 0 \| Standard+) | Dustfall: 6 turrets in a row without a hit (25 \| 0 \| any) | Frozen Nerves: 10 ground defences in a row without a hit (50 \| 0 \| any) |
| 11 | Training Discipline: WARDEN-1 without a hit in the fight (50 \| 1 \| Standard+) | Bastion Breaker: Bastion-9 within 60 s (50 \| 1 \| Standard+) | Broadside Broken: both Ark radiators within 50 s of its arrival (75 \| 1 \| any) |
| 12 | Lunar Saboteur ✱: 2 relay stations or shield depots (50 \| 1 \| any) | Canyon Saboteur: 2 strike sites and complete the mission (50 \| 1 \| any) | Arkfall: the Ark without hull damage in its final stage (75 \| 1 \| Standard+) |
| **Σ** | **400 coins, 5 parts** | **400, 4** | **465, 4** |

| # | Nacre (Deep Bloom) | Amnion (Brood Strike) | Umbra (Final Horizon) |
| --- | --- | --- | --- |
| 1 | Specialist: 8 (25 \| 0 \| any) | Specialist: 8 (25 \| 0 \| any) | Specialist: 8 (25 \| 0 \| any) |
| 2 | Old School (25 \| 0 \| any) | Old School (25 \| 0 \| any) | Old School (25 \| 0 \| any) |
| 3 | Untouchable (50 \| 1 \| Standard+) | Untouchable (50 \| 1 \| Standard+) | Untouchable (50 \| 1 \| Standard+) |
| 4 | Hunter Bounty: 2 aces (25 \| 0 \| any) | Hunter Bounty: 3 aces (25 \| 0 \| any) | Hunter Bounty: 3 aces (25 \| 0 \| any) |
| 5 | **Pearl Diver** ✱: 1,000 coins (50 \| 1 \| any) | **Bonfire** ✱: 75 gas tanks (50 \| 1 \| any) | **Eclipse Vigil** ✱: 500 enemies (50 \| 1 \| any) |
| 6 | Collector: 330 (50 \| 0 \| any) | Demolition: 18 (25 \| 0 \| any) | Vanishing Act: 3 Wraith volleys without a hit, one run (25 \| 0 \| Standard+) |
| 7 | Air Superiority: 55 (25 \| 0 \| any) | Air Superiority: 60 (50 \| 0 \| any) | Collector: 400 (50 \| 0 \| any) |
| 8 | Three Paths: 3 strike sites in one run (25 \| 0 \| any) | Nest Breaker ✱: 2 brood hives (50 \| 0 \| any) | Air Superiority: 65 (50 \| 0 \| any) |
| 9 | Seeker Sweep: 12 airborne over open water by Seeker Array fire (50 \| 0 \| any) | Heartbreaker ✱: 5 brood hive or spawning pool cores (50 \| 1 \| any) | Gravity Slingshot ✱: 5 kills by Gravitic Shield returns (50 \| 1 \| any) |
| 10 | Pod Bay Purge: 8 pods launched from THE VEIL's bays (25 \| 0 \| any) | Brood Extermination ✱: 12 drones launched by THE CRADLE (75 \| 0 \| any) | Wraith Exorcist: 3 Wraiths in one run (75 \| 0 \| any) |
| 11 | Veil Survivor: no hit in THE VEIL's final stage (100 \| 1 \| Standard+) | Cradle's End: THE CRADLE within 100 s (100 \| 1 \| Standard+) | Veteran of the Void: complete on Veteran (100 \| 1 \| Veteran) |
| 12 | Alien Weapons Specialist: defeat THE VEIL flying the Twin Pulse or Fan Cannon (100 \| 1 \| any) | Sterilization: THE CRADLE without hull damage in its final stage (100 \| 1 \| Standard+) | Blackout: THE ECLIPSE without hull damage in its final phase (100 \| 1 \| Standard+) |
| **Σ** | **550, 4** | **625, 5** | **625, 5** |

Goals as retuned on 4 November (user-approved; payouts unchanged). Several now need upgrades; § 5 says which.

All six: **3,065 coins and 27 parts** (tested): the handover's 2,895 and 21, with each Groundbreaker (25 coins on most worlds,
5 on Vesper) replaced by a long mission (50 coins and a part). Mars and Cloud World have none.

**Mappings** (the handover asked for them to be justified):
- *Lunar Saboteur*, human communication or defence installations: the relay station (its dish's feed horn: communication)
  and the shield depot (its generator: defence). The airfield (a control tower) could join; left out to stay with the
  user's example.
- *Icebreaker*: the shield depot and freight terminal strike sites, as the handover says.
- *Broadside Broken*: the Helion Ark's weapon assemblies are its two radiators (their lane lasers), its first phase. Both
  must fall within 50 s of the Ark's arrival (user, 3 November), since destroying them is how every Ark fight goes on.
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
- **The counters** (`src/campaign/missions.ts`): each campaign attempt builds one counter per mission visible at its start
  that its difficulty allows (at most five) and feeds them the drained events once (game-ui.ts drains each frame). A counter only reacts to
  its events: nothing scans enemies or missions per frame. Endless runs never get the list or a tracker.
- **Notes**: a visible mission's progress shows in flight at every fifth of its goal (every step for goals of five or less);
  completions always show.
- **Specials**: the starter special is the Seeker Rack (Homing Missiles) since 3 November; its kills are special kills, never
  the Seeker Array's.

## 5. Feasibility (measured, 4 November goals)

**Method.** The perfect test pilot (tests/sim/pilots.ts) at Standard. Strong gear unless a mission needs otherwise: a level-3
Rail Driver with the Gravity Well fired when charged. The loadout missions fly their loadout (First Flight a level-1 Twin Pulse,
Cold Vector the Fan, Seeker Sweep the Seeker Array, Alien Weapons Specialist the Pulse), Old School fires no special, Gravity
Slingshot flies the Spectre, Veteran of the Void flies Veteran, Flanking Maneuver flies to each flank in turn, and ground
objectives go for ground targets first.

**Clearing a world** (`tests/sim/missions-feasibility-*.test.ts`, about 25 s): attempt after attempt on seeds 1, 2, …, each
with the loadout a player would pick for the missions on the board at its start (`planFor`), through the real tracker and a
saved profile. Only the missions visible at an attempt's start count, so a world needs at least three attempts.

| World | Attempts to clear all twelve | What took longest |
| --- | --- | --- |
| Luna | 5 | Lunar Saboteur (a relay station or shield depot destroyed on two attempts) |
| Khepri | 3 | — |
| Vesper | 5 | Icebreaker (three depots or freight terminals) |
| Nacre | 5 | Three Paths (an attempt that draws three strike sites) |
| Amnion | 14 | Nest Breaker (two brood hives: a hive is drawn on 30 % of attempts); Bonfire done on the 7th |
| Umbra | 6 | Gravity Slingshot (five Gravitic Shield kills with the Spectre) and Eclipse Vigil, both on the 6th |

**Long missions**, per attempt (perfect pilot, Standard, seeds 1–4, the special fired when charged; a level-3 Rail Driver with
the Gravity Well / a level-1 Twin Pulse with the Seeker Rack), and the attempts they take:

| Long mission | Level 3 | Attempts | Level 1 | Attempts |
| --- | --- | --- | --- | --- |
| Sky Patrol (100 airborne) | 38–47 | 3 | 24–37 | 4 |
| Scorched Earth (40 ground targets) | 15–20 | 3 | 6 | 7 |
| Overcharge (20 specials) | 9 | 3 | 10–11 | 2 (the Seeker Rack recharges faster) |
| Pearl Diver (1,000 coins) | 420–485 | 3 | 205–296 | 5 |
| Bonfire (75 gas tanks) | 10–13 | 7 | 8–11 | 8 |
| Eclipse Vigil (500 enemies) | 94–103 | 6 | 63–69 | 8 |

In the plans above each finished alongside its world's other missions.

**Single attempts** (`MISSION_REPORT=<file> npx vitest run tests/sim/missions-report.test.ts`, one process per world with
`MISSION_WORLDS`, about 90 s in parallel). Each mission flown alone with its own loadout, at Standard (level 3, seeds 1–12), and
at Relaxed with the best gear (level 5, seeds 1–6) for the missions any difficulty may fly. Every mission completes on every
seed except:

| Mission | Standard, level 3 | Relaxed, level 5 | Why |
| --- | --- | --- | --- |
| Luna · Interceptor Drill (6 airborne in 5 s) | 75 % | 100 % | needs a dense squadron in the sights |
| Luna · Untouchable | 92 % | — | one hit ends it |
| Khepri · Canyon Saboteur | 92 % | 83 % | needs two strike sites drawn (80 % of attempts) |
| Nacre · Collector (330) | 92 % | 100 % | close to a level-3 attempt's coins |
| Nacre · Three Paths | 42 % | 17 % | needs three strike sites drawn (35 % of attempts) |
| Nacre · Pod Bay Purge (8 pods) | 100 % | 33 % | a level-5 weapon ends THE VEIL before its later pod waves |
| Umbra · Untouchable, Vanishing Act | 83 % | — | one hit ends them |
| Umbra · Air Superiority (65) | 92 % | 100 % | close to a level-3 attempt's kills |

Career progress per attempt (Standard level 3 / Relaxed level 5): Lunar Saboteur 0.67 / 1.00, Icebreaker 1.00 / 0.83, Nest
Breaker 0.08 / 0.33, Heartbreaker 0.50 / 0.67, Brood Extermination 12 or more / 6 (a level-5 weapon shortens THE CRADLE's fight,
so fewer drone waves), Gravity Slingshot 0.50 / 0.00 (a level-5 weapon lands the killing blows before a returned shot does).

**On the minimum difficulty.** No mission is out of reach on its minimum. Hunter Bounty 3 (Amnion, Umbra) on Relaxed, where only
three aces come (four at Standard, five at Veteran), needs every one of them shot down: the level-5 pilot did so on all six
seeds. Relaxed thins the squadrons, but the airborne and ground counts were still met with level-5 gear.

**What needs upgrades** (the user knows; the integrator's level-1 Twin Pulse medians, 4 November): a level-1 attempt falls
short of every Demolition; of every
Air Superiority (Luna 29 of 30 … Umbra 48 of 65); of Collector on Luna (69 of 70), Nacre (224 of 330) and Umbra (323 of 400); of
Warden Shutdown (47–56 s against 45) and Cradle's End (107–122 s against 100); and of Bastion Breaker on some seeds (54–64 s
against 60). Specialist fits a run's 6–12 activations, the first with the special full at launch.

The perfect pilot takes almost no hits, so Untouchable and the no-hit and hull-damage objectives are far harder for a person
than these numbers suggest; that is their purpose (most are Standard+ and pay a part).

**Earlier decisions and mappings kept:** Broadside Broken is both radiators within 50 s of the Ark's arrival (the user, 3
November; at level 3 they fall 20–30 s after it). Pod Bay Purge counts pods launched from THE VEIL's bays, which are launch
points, not targets. The six career missions are cumulative because one attempt cannot reliably hold them. Collector counts
HUD coins (scaled like the coin counter, per world), not the pickups' raw value. Armor Piercer, Cold Vector, Seeker Sweep and
Gravity Slingshot need owned gear (the Spectre needs Final Horizon cleared); First Flight needs the hangar's level selector set
to level 1.

## 6. Saving and rewards

- **Where**: the board is the profile's opaque `missionBoard` field (src/campaign/profile.ts; carried unchanged through every
  load and migration, save version 4), one object
  per world: revealed ids in reveal order, claimed ids (the history), achieved-while-hidden ids, career progress, the running
  attempt's career share (`live`) and the last attempt's single-run progress (`last`). Schema `version: 1`.
- **When**: a completion is saved and paid the moment it happens (a mid-flight reload never loses it); career progress is saved
  whenever it changes, as the running attempt's share; the attempt's end (complete, lost or abandoned) folds that share into
  the career total once and records its last progress. An interrupted attempt's saved share is folded in when the next attempt
  starts (docs/09 § 3: observed progress counts, once).
- **Paying**: every claim calls `awardOnce(profile, 'mission:<id>', credits, parts)` in the same profile transaction
  (`missionTransaction`) that saves the board. The receipt list (`awards`, unbounded and apart from the attempt receipts) and
  the board's claimed list each stop a second
  payment; reopening results, a second finish, a reload or another attempt never pays twice (tested).
- **Unreadable**: a board that cannot be read (broken, or from a newer build) is kept exactly as it is and never overwritten;
  missions are paused for the session and the board says so.

## 7. On screen

- **Campaign page**: below LAUNCH MISSION, MISSIONS · WORLD with done/total, the five visible missions (name, progress and bar,
  one line, minimum difficulty in orange when above ANY, ONE RUN / LAST RUN / ACROSS RUNS, reward). Below them, COMPLETED · n
  lists every done mission as its own card, most recent first: a green check badge, COMPLETE, and the reward EARNED (user,
  4 November: "the old mission cards, just with a check or something visually nice and enjoyable"; it replaced a one-line
  list of the last three).
  - Cards done since the board was last on screen pop in once, one after another: the check scales in and draws itself,
    and the card glows briefly. Reduced motion shows them still.
  - A drawing behind the results screen marks nothing as seen.
  - The results screen's MISSIONS COMPLETE list carries the same check.
- **In flight**: one small line under the lives and shields (`SPECIALIST 1/3`, gold for `… COMPLETE · +25 CR`), shown 1.8 s,
  one at a time, newer progress replacing a queued note; nothing while paused. A paid reward also pulses into the coin counter.
- **Pause**: the visible missions with this run's progress.
- **Results**: MISSIONS COMPLETE with every mission paid during the attempt and its reward.

## 8. Validation

- `tests/campaign/missions.test.ts`: content totals; five visible and the reveal order; only missions visible at a run's
  start count (one revealed mid-run counts from the next run; at most five a run); an older save's hidden achievement paid
  on reveal; career progress only while visible; long missions fifth on a fresh board and shown at once on an old save
  (Groundbreaker retired, its payment kept, the card sent back next in the queue with its progress); unreadable boards untouched; definitions (ground targets, shield vs hull, final stage, timed boss, Seeker attribution,
  reflected attribution, Collector, First Flight, windows, flanks); rewards once across a reload; career progress through an
  interrupted attempt; difficulty gates; endless never progressing; one payment per receipt.
- `tests/sim/run-events.test.ts`: observed and unobserved runs identical; Seeker Rack kills attributed to the special; a
  Gravitic Shield return reported as a reflected kill; hits only when registered; the boss reward and full-shield credits not
  reported as coins; boss phases, sites and Wraith volleys reported.
- `tests/sim/missions-feasibility-inner.test.ts` and `-outer.test.ts`: every world's twelve done through the real tracker,
  each attempt planned from the board at its start, within the stated attempts (§ 5); about 25 s for both.
- `tests/ui/mission-notes.test.ts`: the note throttle.
- `tests/browser/missions.spec.ts`: the board (seeded save), a note in flight, the pause list, the results, the save.
- Not tested: phones (no hardware test).
