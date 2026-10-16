# Delivery plan and validation

## 1. Build in gates

The most expensive mistake would be making nine missions before validating lateral-only movement and target-gated automatic fire. Finish the feel prototype first. A milestone is complete only when its behavior and acceptance evidence exist; having all planned files is insufficient.

Effort below is a rough planning range for an experienced developer with part-time art support, not a delivery promise. Art iteration and access to real test phones can dominate elapsed time. Expect roughly 8–14 focused development weeks for the full small release, plus contingency; agents can speed implementation but cannot replace playtesting. Re-estimate after M1 and M2.

| Milestone | Deliverable | Rough effort | Gate |
| --- | --- | --- | --- |
| M0: foundation | Toolchain, data conventions, debug boot, camera geometry, documented device targets | 1–2 days | Clean install/build and WebGL2 failure path |
| M1: feel prototype | Seeded streaming terrain/world layout, wide-map movement/camera, discovery, icon HUD, Pulse/special, air/ground targets | 4–7 days | Controls, readability, and fairness judged on phones |
| M2: vertical slice | Polished Khepri test mission, two mains, Bastion-9, minimal HUD/audio/results | 8–12 days | A repeatable 3–4 minute complete experience |
| M3: campaign MVP | K1–K3 with selectable difficulty, hangar, credits, four-slot equipment, contracts/career, statistics and saves | 7–12 days | Starter clear feasible; objective observation and reward/stat deduplication pass |
| M4: endless MVP | Authored escalating battle schedules over generated worlds, tiers/drafts/capsules, lives, score, local records | 5–8 days | Fun early power growth; authored battles remain fair across generated worlds |
| M5: small-game release | Installed/offline PWA, quality tiers, accessibility, save recovery, device QA | 4–7 days | Complete one-planet game passes release matrix |
| M6: full small release | Nacre/Vesper, six more missions, two bosses, eight-archetype roster | 10–20 days | New worlds add mechanics and pass the same gates |

M3/M4 add the remaining two mains, two specials, three shield and three reactor techs, campaign difficulties/objectives, and mode-separated statistics incrementally. They are not all prerequisites for M2. The one-planet MVP includes both complete game modes; the full release expands content without changing their contract.

## 2. M0/M1 acceptance gate

- A cold checkout can install, run, typecheck, test, and build using documented commands and a committed lockfile.
- Player is fixed at one forward coordinate and steers only horizontally. Holding each side, both sides, release, crossing mid-screen, and simultaneous special all follow the control contract.
- No shot appears in empty sky. Pulse fires within one simulation tick when ready and aligned with a valid air or ground target. Invulnerable/offscreen/behind-player targets do not qualify.
- At least one ground target uses the projected-proxy solution; show its debug bounds and compare screen-aligned hits at center and both camera extremes.
- The same seeded test encounter survives rendering at 30, 60, and 120 Hz without altering simulation outcome for identical tick inputs.
- Three pattern tests: committed aimed shot, alternating lane pairs, and a warned beam. Each can be dodged without a special or target destruction.
- Pause, tab hiding, resize, cancellation, and focus loss do not cause jumps, background deaths, or stuck movement.
- Traverse a 36-unit world through a 12-unit view. Camera follow, outer boundaries, offscreen persistence, optional cache discovery and local respawn work without unseen unavoidable attacks.
- HUD has ship/shield icons and a plain bottom-center special button. Steering hints vanish after three seconds; no health/resource bars or permanent arrows.
- On a real phone, record short play clips and brief feedback from at least three testers if available. At least two should understand steering and auto-fire after a 15-second onboarding without verbal explanation. Small sample: qualitative evidence, not statistical proof.
- Record missing hardware/testing honestly. Emulated phone size cannot close the hardware gate.

If the controls are tiring or automatic acquisition feels broken, tune movement, enemy dwell time, envelope width, and feedback. Do not add content to disguise a weak loop. Changing the user's control scheme requires a clear design discussion.

## 3. M2 vertical-slice acceptance gate

- One uninterrupted playable mission from start to results with clear loss/retry paths.
- Two gun families feel different while both can hit ground and air targets.
- Bastion-9's removed modules stop attacking; core phases and death sequence work correctly.
- The mission can be cleared with starter settings and without relying on random support.
- Ship, ground, bullets, pickups, UI, effects, and sound match the same style guide.
- No invulnerable-target autofire, opaque explosion obstruction, offscreen shooting, or mandatory damage pattern in the slice.
- Inspect both a high and low quality run on phone. Record frame-time data and the most common death causes.
- After playing twice, testers can describe why they were hit and what they could do differently. Confusion is a design defect, even if the collision code is correct.

## 4. Task backlog and dependencies

| Task | Depends on | Concrete result | Primary acceptance |
| --- | --- | --- | --- |
| T01 Project bootstrap | None | Build, lint/typecheck, tests, dev route, README commands | Clean checkout works |
| T02 Canonical viewport/camera | T01 | 12-unit view width, responsive phone height, wider world, camera, safe areas (docs/10) | Equal combat framing/world rules at all sizes |
| T03 Input adapter | T02 | Pointer ownership and keyboard `InputFrame` | Cancel/multi-touch/UI overlap tests pass |
| T04 Fixed-step world | T01 | Tick loop, IDs, RNG streams, entity lifecycle | Render-rate independence test passes |
| T05 Acquisition and ground proxies | T02,T04 | Unified target shapes and projected ground cores | Visible shot/core alignment |
| T06 Combat loop | T03,T05 | Pulse, damage, shield, special, hit feedback | No empty fire; no double damage |
| T07 Authored encounter | T06 | Three fair test patterns and reset controls | Human and scripted dodge evidence |
| T08 Slice art/audio | T07 | Original low-cost asset set and polished feedback | Phone-size art review |
| T09 Fortress state machine | T06,T07 | Authored module/phase fight | Destroyed gun never attacks |
| T10 Slice flow/results | T08,T09 | Full mission including tutorial, pause, defeat, win | Complete browser journey |
| T11 Equipment/economy | T10 | Four-slot hangar, shield/reactor sidegrades, credit ledger | No invalid builds/duplicate awards |
| T12 Campaign content/saves | T11 | K1–K3 with difficulty settings, observational contracts/career, statistics, migrations, recovery | Purchase/reload/failure cases |
| T13 Endless growth/lives | T10 | Fresh start, tiers, swaps, draft, death, score | No campaign power leakage |
| T14 Director/fairness | T07,T13 | Authored battle playlists, world-seed replay, safe fallback | Seed sweep + hand-reviewed extremes |
| T15 PWA/quality/release | T12,T14 | Offline packs, updates, performance, settings | Device release matrix |
| T16 New biome content | T15 | Nacre and Vesper using existing contracts | Each mission/boss reviewed |

Tasks may be reassigned later; these dependencies do not authorize additional agents or chats by themselves. Shared simulation, content contracts, and save schemas need one integration owner.

## 5. Focused automated tests

| Area | Required high-value cases |
| --- | --- |
| Input | Left/right/both; second touch on special; dragging across center retains ownership; pointer cancel; special-to-steering non-leakage; key blur |
| Targeting | Ahead/behind; boundary overlap; invulnerability; actual pellet ray; closest target; scenery ignored; ground proxy projection |
| Collision | Fast shot swept hit; single damage event per invulnerability interval; pierce target uniqueness; beam cadence; target dying mid-burst |
| Resources | Discrete shield loss/recovery; shield-break protection; unshielded life loss; single special charge; no passive shield regeneration; rare cell budgets do not reset on pause or respawn |
| Modes | Max-upgraded campaign profile yields baseline endless start; campaign never drops guns/lives; death preserves intended endless build; game over after final ship |
| Difficulty | Lock campaign setting per attempt; Relaxed/Standard/Veteran start values; safe Veteran paths; one first clear across settings; exact reward rounding; no effect on endless ramp |
| Economy | Credit rounding; failure payout; career thresholds once; contract once per successful attempt; purchase insufficient funds; same attempt finalized twice; interrupted attempt recovery |
| Camera/world | True world bounds; camera follow; unchanged ground projection; fixed special footprint; no discovery farming; visible threat warnings |
| Objectives/stats | Contract on/off identical combat/RNG; campaign-only progress; deduplicated counters/rewards; failed contract leaves mission playable |
| Generation | Stream independence; compatible chunk boundaries; max retries fallback; threat limits; reachable states under overlapping patterns |
| Content | Unique IDs; referenced enemies/weapons exist; positive cadence/range; valid encounter budget and four-slot loadout; valid shield charges and difficulty values; boss target transitions |
| Persistence | Save migration from fixtures; corrupt latest snapshot; quota rejection; import validation; double-click/results refresh |
| Browser | Start→play→pause→resume→results; hangar purchase; installed/offline launch where automatable; resize; audio gesture; asset failures |

For M4, exercise authored battle schedules across at least 1,000 world-seed/difficulty/route cases, including early/mid/capped sectors and all supported pattern variants. Log seed and generator/content version for every failure. This is coverage, not proof of universal fairness. Hand-review the densest schedules and combinations using the development replay/overlay.

## 6. Device matrix and performance criteria

Wider-map visibility, statistics, objectives and distinct hero airframes add scope beyond v0.1; re-estimate after M1/M2 rather than treating the effort ranges as commitments.

Before M1 select actual baseline devices available to the project: at least one non-flagship iPhone and one midrange Android phone. Record exact model, OS, browser, pixel ratio, and quality tier rather than vaguely claiming “mobile support.” Test in browser and installed mode. Add desktop Chrome/Firefox/Safari or available equivalents for control/layout coverage; desktop browser coverage does not substitute for mobile Safari and Android Chrome.

At M5 run a 10-minute repeatable stress scenario that includes boss + escorts + peak allowed pickups/effects. Preferred tier: p95 frame time ≤20 ms with 60 FPS target; low tier: p95 ≤35 ms with 30 FPS target. Record p99 and worst hitch rather than hiding them behind averages. Accept no repeated >100 ms hitches during active combat after loading. Frame budgets are measured outcomes, not architectural guarantees.

Test portrait rotation, app switching, interrupted audio, lock/unlock, notches/home indicator, offline cold start after completed cache, service-worker update, and save export/import. Test with reduced motion/effects and hostile-shot alternative palette. Play while thumbs cover normal steering regions.

## 7. Risk register

| Risk | Early evidence | Response |
| --- | --- | --- |
| One-axis dodging is unfair | Deaths with no reachable route | Simplify overlaps; delay attacks; validate player-row intervals |
| Auto-fire seems unresponsive | Long aligned periods without obvious fire | Fix actual envelope/feedback; increase enemy dwell; inspect camera mapping |
| Ground targeting feels dishonest | Shots appear to miss a core but deal damage or vice versa | Canonical projection tests, visible brackets, tune authored hit regions |
| Rich art runs poorly | Thermal slowdown, fill-rate spikes | Reduce transparency/shadows/resolution; preserve hazards; profile on phone early |
| Campaign becomes compulsory grind | Starter cannot clear; repeated credits buy little | Lower stat inflation, cap ranks, reward alternate builds |
| Endless is random repetition | Same chunks or only stat inflation | More authored phrases, bounded drafts, meaningful biome changes |
| Content production overwhelms project | Every model needs bespoke systems | Reuse core archetypes/rigs; ship complete one-planet MVP |
| Installation/update loses trust | Broken offline boot, stale asset versions | Atomic pack caching, menu-only updates, recovery tests |
| Progress disappears or duplicates | Bad migration or repeated finalization | Versioned snapshots, export, idempotent attempts |

## 8. Release gate

Ship only after mode isolation, save transactions, offline behavior, actual phone controls, and the selected performance tier pass. Known device exclusions and unfinished content must be stated plainly. Build a production bundle and test that bundle, not only the development server. No hidden development overlay, debug cheat control, missing licensed asset record, console error storm, or blank target model may ship.

The final handoff includes source, reproducible run/build instructions, asset provenance, measured device results, open issues, content version, and a short playable demonstration. Publishing or packaging for stores is a subsequent task, not part of this planning deliverable.
