# Last Worlds

**A mobile-first, 3D arcade strike fighter game.** Last Worlds · playable prototype and design v0.4, 14 October 2026.

Fly above hostile alien worlds, line up targets, weave through readable attacks, and dismantle moving fortresses. The image has real depth; combat has the clarity of a single plane.

This repository contains a playable Khepri prototype and the longer-term design package. Campaign offers the short Training flight and **Rolling Thunder**, which ends with the destructible Bastion-9 fortress. Endless escalates independently over seeded real 3D terrain. Saved campaign progression, full three-planet content, statistics, and offline installation are still planned. See [build status](docs/build-status.md) and [the boss increment](docs/15-bastion-slice.md) for verification and remaining limits.

## Run locally

Use Node 22.12 or newer.

```sh
npm ci
npm run dev -- --port 4173
```

Open `http://localhost:4173`. Hold the left/right half to steer; tap the bottom-center button for the special. On desktop use A/D or arrows, Space, and Escape. High/Low graphics and sound controls are in the menu and pause panel.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

**For a readable overview, start with [DESIGN-REVIEW.md](DESIGN-REVIEW.md).** It consolidates the current concept and links to implementation detail.

## Start here

| Document | Purpose |
| --- | --- |
| [Game design](docs/01-game-design.md) | Player experience, controls, modes, scope, and design critique |
| [Combat and progression](docs/02-combat-and-progression.md) | Lives, shield charges, equipment, drops, economy, and score |
| [Worlds and encounters](docs/03-worlds-and-generation.md) | Planets, enemy behavior, bosses, missions, and constrained generation |
| [Art and experience](docs/04-art-and-experience.md) | Visual direction, asset list, UI, animation, sound, and concept references |
| [Technical design](docs/05-technical-design.md) | Engine, simulation, targeting, PWA, persistence, performance, and data contracts |
| [Delivery and validation](docs/06-delivery-and-validation.md) | Milestones, acceptance gates, task backlog, risks, and testing |
| [Agent handoff](docs/07-agent-handoff.md) | Copyable build prompts, work boundaries, and completion reports |
| [Decision log and sources](docs/08-decisions-and-sources.md) | Confirmed requirements, provisional decisions, alternatives, and technical references |
| [Objectives and statistics](docs/09-objectives-and-statistics.md) | Campaign-only goals, records, and score fairness |
| [Wide map and camera](docs/10-wide-map-and-camera.md) | Lateral camera tracking, exploration, world bounds, and threat visibility |
| [Campaign difficulty](docs/11-campaign-difficulty.md) | Selectable challenge, payouts, records, and endless separation |
| [AGENTS.md](AGENTS.md) | Repository-level instructions for implementation agents |
| [Specification data](docs/spec/README.md) | Machine-readable starter balance and content examples; not runtime code |
| [Concept art](art/concepts/README.md) | Images, full generation prompts, and interpretation notes |
| [Implementation contract](docs/12-implementation-contract.md) | Current agent ownership, prototype APIs, and latest decisions |
| [Khepri world map](docs/13-khepri-world.md) | Concept-matched visual target, seeded valley/mesa layout, and the Blender terrain kit contract |
| [Shared industrial kit](docs/14-shared-industrial-kit.md) | Cross-planet tiling pipes, tanks and containers with planet-neutral, palette-driven shading |
| [Vesper — Glass Frontier](docs/17-vesper-glass-frontier.md) | The ice planet, its Blender kits, the Cold Vector mission and the Helion Ark boss |
| [Package validation](docs/package-validation.md) | Completed documentation checks and untested implementation gates |

## The recommended design

- **Portrait, left/right only.** Hold the left side to move left; hold the right side to move right. Main fire activates only when a target is in the weapon's firing path. One plain arcade special button at bottom center; steering hints blink gently for the first three seconds, then disappear. These controls reflect the user's explicit preference.
- **3D presentation, 2D combat.** Orthographic view with depth, fixed flight height, and stable horizontal movement. Ground weapons and bosses expose clear projected targets on the shared combat plane.
- **Campaign builds; endless improvises.** Campaign has main weapon, special weapon, shield tech, and maneuverability-focused reactor tech. Optional campaign goals award credits. Endless always starts identically and ramps difficulty within each run, with independent scores and statistics.
- **Generated worlds, authored battles.** Seeded terrain and world layout are core MVP features for endless. Enemy models, encounter compositions, sequences, and attack patterns are authored. Procedural hero assembly is a later possibility.
- **A wider world.** The camera follows lateral travel across a map initially three times the visible width, with optional routes and discoveries. Screen edges are not world walls.
- **Minimal analog HUD.** Small ship icons, shield icons, and one plain bottom-center special button with recharge ticks. No hull, ammo, energy, or reactor bars.
- **Finish one planet first.** Prove movement, target-gated fire, ground targeting, and a fortress fight before expanding the content or economy.

## Scope ladder

| Stage | Contents | Decision unlocked |
| --- | --- | --- |
| Feel prototype | One graybox arena, one gun, three threat types, target dummy on the ground | Is this control scheme fun and fair? |
| Vertical slice | One polished 3–4 minute mission on Khepri, two mains, one special, one fortress | Is the complete experience worth expanding? |
| Compact MVP | One planet, three campaign missions, endless, four mains, three specials, three shield techs, three reactor techs, campaign difficulties/goals and statistics, local saves and installable offline build | Can we ship a complete small game? |
| Full small release | Three planets, nine campaign missions, three bosses, more authored chunks, biome variants | Does more content sustain interest? |
| Later only | Additional playable airframes beyond the three accepted tier designs, new planets, daily seeds, online scores, deeper procedural ship assembly | Requires separate evidence and scope decisions |

The MVP is deliberately a complete one-planet game. The three-planet release is the full proposed content plan, not a prerequisite for testing the idea.

## Important tradeoffs

Left/right-only motion is distinctive and approachable, but makes some conventional bullet patterns impossible to dodge. Every encounter must be evaluated at the player's fixed forward position. Automatic fire must react immediately and visibly when alignment is achieved. A slightly elevated orthographic view is preferable to a strict 45-degree diagonal isometric camera because upward travel and horizontal touch controls stay intuitive.

Campaign grinding should offer experimentation, not repair bills or compulsory stat walls. Endless records remain separate. No campaign credits, objectives, equipment, tech, or visual unlock may alter its standardized start or score opportunities.

## First implementation assignment

Use [the M0/M1 prompt](docs/07-agent-handoff.md#first-build-prompt). Continue from the current playable prototype, validate each milestone on phones, and report the evidence against its gate. Do not implement the entire specification in one pass.
