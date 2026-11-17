# Docs index

Every document in `docs/`, grouped by topic, one line each. Each doc describes how things work now; the user's decisions
and their dates are in the [decisions log](08-decisions-and-sources.md), and what shipped when is in
[build status](build-status.md). Numbers are stable (code comments cite "docs/NN"); gaps in the numbering are docs that
were merged into others. For the repository layout see the [README's map](../README.md#where-things-are).

## Game design

| Doc | What it covers |
| --- | --- |
| [01 Game design](01-game-design.md) | The concept, pillars, controls (Halves, Drag, Tilt), campaign and endless, and why the design is shaped this way |
| [04 Art and experience](04-art-and-experience.md) | Visual target, the release lens, visual hierarchy, Blender-only assets, effects, HUD, quality tiers, hero scale |
| [10 Wide map and camera](10-wide-map-and-camera.md) | The two-screen world, the lateral camera, exploration, and the pulls that keep waves and bosses in view |
| [16 Menus and HUD](16-flight-command-ui.md) | Front screen, campaign page, hangar, statistics, settings, pause, results and the in-flight HUD |

## Worlds

| Doc | What it covers |
| --- | --- |
| [03 Worlds and generation](03-worlds-and-generation.md) | All eight worlds at a glance, the enemy catalog, the bosses, what is procedural, the director, fairness, endless difficulty |
| [19 Luna](19-luna-training.md) | Khepri's moon, the Training mission and WARDEN-1 |
| [13 Khepri](13-khepri-world.md) | The rust desert: visual target, layout rules and its Blender kits |
| [17 Vesper](17-vesper-glass-frontier.md) | The ice world, Cold Vector and HELION STRONGHOLD |
| [20 Nacre](20-nacre-luminous-mire.md) | The luminous mire, Deep Bloom and THE VEIL |
| [27 Amnion](27-amnion-brood-wastes.md) | The brood wastes, Brood Strike and THE CRADLE |
| [37 Corona](37-corona-dying-star.md) | The dying star, Dying Star and THE HELIOPHAGE |
| [39 Nahara](39-nahara-silent-empire.md) | The silent empire's desert, Silent Empire and THE CITADEL |
| [28 Umbra](28-umbra-eternal-eclipse.md) | The final world, its Wraiths, Final Horizon and THE ECLIPSE |
| [18 Endless planet cycle](18-endless-planet-cycle.md) | How endless cycles the worlds, with bosses and hyperdrive jumps |

## World generation

| Doc | What it covers |
| --- | --- |
| [26 Terrain relief, cliffs and walls](26-terrain-relief.md) | Relief, crisp cliffs, wall pieces, rock textures and cracks per world |
| [23 Settlements and infrastructure](23-settlement-infrastructure.md) | How outposts, compounds, roads, pipelines and Khepri's refinery districts are generated and placed, and their infrastructure models |
| [25 Modular facilities](25-modular-facilities.md) | The per-world facility kits and how plants are composed around ground batteries |
| [14 Shared industrial kit](14-shared-industrial-kit.md) | The cross-world pipes, tanks and containers |

## Combat and progression

| Doc | What it covers |
| --- | --- |
| [02 Combat and progression](02-combat-and-progression.md) | Lives and shields, main weapons and targeting, specials, the four slots, pickups and score, endless isolation |
| [42 Specials and perks](42-specials-and-perks.md) | Seeker Rack, Siege Lance, Shockwave, Orbital Strike, and the four chassis perks |
| [32 Rail Driver](32-rail-driver.md) | The piercing main weapon |
| [30 Campaign progression](30-campaign-progression.md) | The shop in credits and parts, weapon levels, ships, income, unlocks and the save |
| [31 Hero ships](31-hero-ships.md) | The four chassis and their modular models, paint and the shipyard |
| [11 Campaign difficulty](11-campaign-difficulty.md) | The three settings, per-world intensity, campaign pressure and the endless ramp |
| [33 Strike sites and encounter deck](33-strike-sites-and-encounter-deck.md) | Optional strike sites, parts, and the seeded encounter deck that schedules every wave |
| [15 Rolling Thunder and BASTION-9](15-rolling-thunder-and-bastion-9.md) | Khepri's mission and its tracked fortress |
| [35 World missions](35-missions.md) | The side-mission boards: rules, definitions, the missions per world, tracking and rewards |
| [09 Objectives and statistics](09-objectives-and-statistics.md) | Observation-only goals, counting rules, the flight log and endless score fairness |

## Systems and tech

| Doc | What it covers |
| --- | --- |
| [05 Technical design](05-technical-design.md) | Stack, combat space and camera, ground-target projection, the simulation step, state, input, saves, budgets |
| [12 Implementation contract](12-implementation-contract.md) | Module boundaries, APIs, coordinates, boss views, adding content |
| [36 Mobile performance](36-mobile-performance.md) | Budgets, measurement tools, rendering rules, latest numbers and open candidates |
| [40 Balance measurement](40-balance-measurement.md) | The scripted pilots, expected weapon levels, suites, commands and latest results |
| [41 Autopilot and recorder](41-autopilot-and-recording.md) | Watching the test pilots in the browser and recording runs to video |

## Audio

| Doc | What it covers |
| --- | --- |
| [24 Sound design](24-sound-design.md) | The sound effects and their triggers, the synthesized instruments and sample cache, the mix, the eight world scores, boss music, the title theme and menu sounds, settings and lifecycle, previews and tests |

## Art pipeline

| Doc | What it covers |
| --- | --- |
| [04 Art and experience](04-art-and-experience.md) | The art direction and asset rules (also listed above) |
| [art/bosses](../art/bosses/README.md) | How the eight boss models are built and their rig contract |
| [43 Boss visual overhaul](43-boss-visual-overhaul.md) | The 17 November specification: VEIL from the old CRADLE, the walking CRADLE, the HELION STRONGHOLD fortress on Vesper's cliff |
| [art/concepts](../art/concepts/README.md) | The concept gallery: references only |
| Kit provenance | One README per Blender kit: [Khepri kit](../art/khepri-kit/README.md), [Khepri infrastructure](../art/khepri-infra/README.md), [Khepri craft](../art/khepri-craft/README.md), [Vesper kit](../art/vesper-kit/README.md), [Vesper infrastructure](../art/vesper-infra/README.md), [Vesper craft](../art/vesper-craft/README.md), [Nacre kit](../art/nacre-kit/README.md), [Nacre craft](../art/nacre-craft/README.md), [shared industrial kit](../art/shared-industrial/README.md) |
| [art/source](../art/source/bosses/README.md) | The user's supplied boss models ([hero sources](../art/source/hero/README.md), [Poly Haven maps](../art/source/polyhaven/README.md)) |

## Process and logs

| Doc | What it covers |
| --- | --- |
| [07 Working on Last Worlds](07-agent-handoff.md) | How a task goes from assignment to deploy: parallel sessions, the release gate, the completion report |
| [06 Delivery and validation](06-delivery-and-validation.md) | Milestone status, open gates, where each area is tested, phone criteria and risks |
| [08 Decisions and sources](08-decisions-and-sources.md) | The user's decisions, dated: the record behind every rule |
| [Build status](build-status.md) | The deployment log, newest first |
| [38 Code-health review](38-code-health-review.md) | A dated review (8 November) and its follow-up progress |
| [spec/](spec/README.md) | The first planning seed (13 October); not loaded by the game |
