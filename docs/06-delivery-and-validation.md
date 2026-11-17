# Delivery and validation

Where the build stands against its milestones, which gates are still open, how changes are validated, the phone criteria
and the main risks. The day-to-day procedure and release gate are in [docs/07](07-agent-handoff.md); every deploy's
evidence is in [build status](build-status.md).

## 1. Milestones

The project was planned in gates: prove lateral-only movement and target-gated fire first, then one complete mission,
then the modes, then more worlds. A milestone counts only with its acceptance evidence.

| Milestone | Scope | Status |
| --- | --- | --- |
| M0 foundation | Toolchain, lockfile, camera geometry, WebGL failure path | Done |
| M1 feel prototype | Seeded streaming terrain, wide map and camera, auto-fire, icon HUD, special, air and ground targets | Done; phone feel judged by the user in play, not measured |
| M2 vertical slice | A complete Khepri mission ending with BASTION-9 | Done (Rolling Thunder, [docs/15](15-rolling-thunder-and-bastion-9.md)) |
| M3 campaign | Missions, difficulty, hangar, four slots, saves, side missions, statistics | Done ([docs/30](30-campaign-progression.md), [docs/35](35-missions.md)) |
| M4 endless | Authored escalating schedules over generated worlds, tiers, lives, score, records | Done ([docs/18](18-endless-planet-cycle.md), [docs/33](33-strike-sites-and-encounter-deck.md)) |
| M5 release quality | Offline install, quality tiers, accessibility, save recovery, device QA | Partly: quality tiers, reduced motion and save migration are built; offline caching, save export and hardware QA are not |
| M6 more worlds | Further planets, missions and bosses | Done and extended: eight worlds and eight bosses |

## 2. Open gates

- **Phone hardware:** frame times, heat, battery, touch ergonomics and audio have not been measured on real phones. Every
  deploy note says "no phone test" until one is done ([docs/36](36-mobile-performance.md)).
- **Offline and installation:** no service worker; see [technical design § 7](05-technical-design.md#7-offline-and-installation).
- **Save export and import:** not built.
- **Human balance:** the scripted pilots prove that a path exists, not that the game is fun or fair for people
  ([docs/40](40-balance-measurement.md)); the user's playtests are the gate.

## 3. Validation

For every change: typecheck, the unit suites, the build, and the browser suite, with Playwright's own exit status checked
([docs/07](07-agent-handoff.md#the-release-gate)). Anything a player sees is inspected in phone-size captures on High and
Low, and shown to the user at visual milestones.

| Area | Where it is tested |
| --- | --- |
| Input | `tests/input/` (halves, crossing the middle, special pointer, drag, tilt), `tests/browser/drag-steering.spec.ts`, `flight.spec.ts` |
| Targeting, collision, resources | `tests/sim/game.test.ts`, `loadout.test.ts`, `pickup-catch.test.ts`, `ground-lens.test.ts`, `rail-and-specials.test.ts`, `ship-perks.test.ts` |
| Weapons | `tests/sim/weapon-progression.test.ts`, `weapon-recovery.test.ts`; `weapon-tier-report.test.ts` (opt-in measurements) |
| Fairness | `tests/sim/fairness*.test.ts` (campaign, early and late endless, guard), `tests/sim/drift.test.ts`, `tests/world/endless-clearance.test.ts` |
| Difficulty and balance | `tests/sim/difficulty*.test.ts`, `late-world-curve.test.ts`, `balance-report.test.ts` (opt-in, [docs/40](40-balance-measurement.md)) |
| Bosses and worlds' enemies | One suite per boss and faction in `tests/sim/` (`bastion`, `ark`, `veil`, `warden`, `citadel`, `umbra`, `wraith`, `pulsar`, `amnion`, `nahara-enemies`…) |
| Modes and saves | `tests/sim/endless*.test.ts`, `tests/campaign/profile.test.ts`, `missions.test.ts`, `tests/sim/run-events.test.ts` (observation never changes a run) |
| Encounter deck and sites | `tests/sim/encounter-deck.test.ts`, `deck-balance.test.ts`, `sites.test.ts`, `site-economy.test.ts`, `site-seats.test.ts` |
| Side missions | `tests/sim/missions-feasibility-*.test.ts`, `missions-report.test.ts`, `tests/ui/mission-notes.test.ts` |
| World generation | `tests/world/` (each world's terrain, routes and streaming, scatter fingerprints, terrain budget, model contracts) |
| Rendering | `tests/render/`, `tests/world/cinematic-assets.test.ts`, `tests/browser/graphics.spec.ts`, `asset-readiness.spec.ts`, `performance.spec.ts` |
| Audio | `tests/audio/`, `tests/browser/audio.spec.ts` |
| Browser journeys | `tests/browser/menu.spec.ts`, `missions.spec.ts`, `viewport.spec.ts`, `bastion.spec.ts`, `vesper.spec.ts`, `ship-perks.spec.ts` |

Tests guard high-risk rules and regressions; snapshots that merely mirror the implementation are avoided (AGENTS.md).

## 4. Phones and performance criteria

Real-phone checks need named devices: at least one non-flagship iPhone and one midrange Android, recorded with model, OS,
browser, pixel ratio and quality tier, in the browser and installed. Desktop browsers cover layout and controls only.

On a repeatable stress flight (boss, escorts, peak pickups and effects): **High** p95 frame time ≤ 20 ms (60 FPS target),
**Low** p95 ≤ 35 ms (30 FPS target), no repeated hitches over 100 ms in combat after loading; p99 and the worst hitch are
reported, not hidden in averages. `?perf` shows a frame-time overlay and exports a flight's frame log from the results
screen. Also to test on phones: rotation, app switching, interrupted audio, lock and unlock, notches and home indicators,
reduced motion, and play with thumbs covering the steering halves.

## 5. Risks

| Risk | Early sign | Response |
| --- | --- | --- |
| One-axis dodging feels unfair | Deaths with no reachable route | Fairness director and solver; delay or thin overlaps; never edge safe zones ([docs/10](10-wide-map-and-camera.md)) |
| Auto-fire seems unresponsive | Aligned without firing | Check the real envelope (`slack`), feedback and enemy dwell |
| Ground targeting feels dishonest | Shots look like misses but hit, or the reverse | One lens for simulation and render; visible brackets |
| Art runs poorly on phones | Heat, fill-rate spikes | Low tier, fewer transparent layers, phone measurements; hazards never cut |
| Campaign becomes a grind | The starter can't clear; credits buy little | Starter-clear checks, per-world income, alternate builds |
| Endless repeats | Same waves, only stat inflation | Authored deck variety per world; bosses and jumps |
| Progress lost or duplicated | Bad migration, repeated banking | Backups before migration, idempotent attempts, migration tests |
| Download size | The site is large (the Pages workflow allows a long sync) | Per-world asset loading, budgets per kit |
