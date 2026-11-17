# Objectives, statistics and score fairness

How campaign-only goals stay observational, how the flight log records play per mode, and what keeps endless scores
comparable. The side missions themselves are in [docs/35](35-missions.md).

## 1. Campaign-only advancement

Campaign advancement is the mission chain ([docs/30](30-campaign-progression.md#missions-and-unlocks)), the hangar, and
each world's **side-mission board** ([docs/35](35-missions.md)), which pays credits and parts. The career milestones and
per-launch contracts planned on 13 October were not built; the world boards replaced them.

Nothing here exists in endless (invariant 13): an endless run never advances a campaign counter, pays campaign currency
or unlocks equipment, and campaign progress never changes endless combat, drops or score.

## 2. Observation only

Side missions read the run's events (`RunState.events`, `src/sim/events.ts`) and never command movement, camera,
targeting, weapons, damage, spawns, loot or scoring. With the same mission, loadout, seed and inputs, a tracked run plays
out exactly as an untracked one (`tests/sim/run-events.test.ts`).

- No protected targets, cease-fire, altered splash, special immunity, easier enemies, bonus drops or target filters for a
  goal. Auto-fire stays on; a spread shot, chain or special that destroys something counts normally.
- Goals are offered only where existing content makes them possible; every goal on every board is shown feasible by a
  test pilot ([docs/35 § 5](35-missions.md)).
- A failed goal never fails the mission.

## 3. Counting rules

- An attempt's observed progress counts once. An interrupted attempt (a refresh or crash mid-flight) keeps the share that
  was saved while it was observed, folded in once when that world's next run begins (`begin` in `src/campaign/missions.ts`); it
  never fabricates a clear.
- A boss counts once when it dies, not once per target or detachable gun.
- Debug, playground and fixture runs never count.
- Rewards are paid once per goal (`awardOnce` in `src/campaign/profile.ts`), whatever reloads or repeated results do.

## 4. Statistics screen

Menu → Statistics shows the **flight log** (`src/ui/flight-log.ts`, stored under `FLIGHT_LOG_KEY`) with separate Endless
and Campaign tabs; the modes never merge.

- **Per mode:** flights, clears, lost and retired runs, flight time, kills, lives lost, specials used, strike sites
  destroyed, the longest flight; endless adds the best score and furthest sector.
- **Recent flights:** the last 50 runs (both modes), with mission, difficulty, outcome, time and score or sector.
- Time is simulation time; menus, pauses and backgrounding don't count.
- The log is observational: never a wallet and never an input to the simulation. It is versioned by
  `FLIGHT_LOG_RULESET`; a log from another ruleset or a malformed one is set aside rather than merged.

Not built: per-difficulty filters in the campaign tab.

## 5. Endless score fairness

- Every endless run starts from the same baseline (`ENDLESS_LOADOUT`, `endlessConfig`): Twin Pulse level 1, Shockwave,
  Standard array, three lives. The only player choice that carries over is the chassis with its perk (user, 30 October),
  which is open to everyone who owns it; modular designs and paint are cosmetic.
- Random seeds differ in route and drop luck. A shared-seed challenge board would need the same seed and build, with
  explicit retry rules.
- Reduced motion, audio and graphics quality never affect the simulation.
- Records are local and editable, not cheat-proof. A public online board would need verified submissions, immutable
  ruleset identification and duplicate protection; none is planned.

## 6. Checks

- A fully progressed and a fresh profile produce the same endless start (`tests/sim/loadout.test.ts`,
  `endless-cosmetics.test.ts`).
- Observed and unobserved runs are identical (`tests/sim/run-events.test.ts`).
- Board progress, rewards and interrupted attempts count once (`tests/campaign/missions.test.ts`).
- The flight log keeps modes apart and rejects malformed data (`tests/ui/flight-log.test.ts`).
