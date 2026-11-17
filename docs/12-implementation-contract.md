# Implementation contract

The module boundaries, the core APIs and the conventions every change keeps. The folder map is in the
[README](../README.md#where-things-are); the target architecture and budgets are in [technical design](05-technical-design.md).

## Rules that shape the code

- **Generated worlds, authored battles** (invariant 8): terrain, scenery and world layout come from seeds; enemy designs,
  encounters, battle sequences and attacks are authored. Endless replays an authored escalating schedule (the encounter
  deck, [docs/33](33-strike-sites-and-encounter-deck.md)) over seeded streaming sections; nothing assembles battles at
  random. Procedural hero assembly is deferred.
- **Weapon families keep their behaviour** (invariant 2): straight volleys, a fixed fan, a homing family with its own
  envelope, and the piercing Rail Driver. A main weapon fires only with a valid visible target.
- **The simulation is independent of presentation:** no Three.js, DOM or browser API in `src/sim/` or `src/content/`;
  rendering reads simulation state and never mutates it; effects never decide damage or loot.
- **Determinism:** a fixed 60 Hz step (`STEP`), seeded streams (`src/shared/streams.ts`, one salt per system: the
  encounter deck, hunters, site parts…), stable entity IDs, bounded pools. `Math.random()` only for cosmetic effects whose
  stream cannot reach the simulation. Graphics quality never changes collision timing.
- **One source per number:** balance and content live in `src/content/`; tests and docs cite the constant.

## Modules and their APIs

Shared types and constants: `src/shared/contracts.ts` (`RunConfig`, `RunState`, `InputFrame`, `GameRenderer`, `VIEW`,
`STEP`, `PLAYER_HIT_RADIUS`, ids).

| Module | Entry points | Boundary |
| --- | --- | --- |
| Simulation, `src/sim/` | `createRun(config)`, `stepRun(state, input, dt = STEP)` in `game.ts` | Pure; paused or ended runs never advance |
| Content, `src/content/` | Balance, equipment, missions, bosses, encounters, the endless schedule | Data and pure schedules; no browser |
| Observation, `src/sim/events.ts` | `RunState.events`, appended when an observer attached it | Write-only: the run never reads it, so observed and unobserved runs are identical (invariant 13) |
| World, `src/world/` | Seeded terrain, routes (`runRoute`, `run-route.ts`), settlements, scatter | Pure; never reads combat state or RNG |
| Renderer, `src/render/` | `createRenderer(canvas): GameRenderer` in `scene.ts` | Renders state, prepares assets per world, never mutates the run |
| Input, `src/input/` | `createInput(surface, specialButton, tilt?, shipX?)` in `controls.ts`, `createTiltSource` in `tilt.ts` | Produces `InputFrame`s; the special's pointer never steers |
| UI, `src/ui/` | `createUi(root, actions)` in `game-ui.ts` | Menus, hangar, HUD, results; per-projectile state never goes into the DOM |
| Campaign, `src/campaign/` | `createCampaignProfile`, `campaignConfig`, `endlessConfig` (`profile.ts`); the mission board (`missions.ts`) | The save and the side missions; endless never writes it |
| Audio, `src/audio/` | `createGameAudio` in `engine.ts` | Listens to state and events; never affects play |
| App, `src/main.ts` | The frame loop | Fixed-step accumulator, launch warp, pause and visibility, orientation |
| Dev only | `src/dev-hooks.ts` (`window.__LAST_WORLDS__`), `src/playground/` (`playground.html`) | Dropped from production builds |

## Coordinates

- **Combat plane:** `x` lateral (the world is `VIEW.worldWidth` wide, centred on 0), `s` forward from the player's row
  (player at `s = 0`). The view spans `VIEW.minS` to `VIEW.maxS` around `RunState.cameraX` ([docs/10](10-wide-map-and-camera.md)).
  Every warning, acquisition and visibility test uses `VIEW` translated by `cameraX`; nothing derives its own tactical
  rectangle.
- **Render space:** airborne entities at `(x, VIEW.flightHeight, -s)`.
- **Ground targets:** an enemy's `s` is always its logical combat-plane position. Its model sits on the terrain where the
  camera ray through that point meets the ground, through the release lens (`src/shared/lens.ts`, `rayPlacement` in
  `src/render/scene.ts`), so model and target share a pixel ([docs/05 § 3](05-technical-design.md)).
- **Motion:** `RunState.scrollSpeed` is the current scroll (render and streaming read it, not `VIEW.scrollSpeed`);
  `RunState.pace` scales ship, enemy and camera motion (endless ramps it).

## Boss views

Each boss has its own view module (`bastion-view.ts`, `ark-view.ts`, `warden-view.ts`, `carrier-view.ts` for the carrier
bosses) and its model file and builder are listed in `src/render/boss-assets.ts`. Rig marker nodes inside the GLBs (for
example `ark_approved_v6`) are identifiers the views look for.

- Every view hides its root and clears its particles when another boss owns the encounter; carrier pod batches reset to
  zero and draw only for their own active boss and placement.
- The playground loads a level under a revision token and publishes it only once its assets are ready, so a late load
  never restores an earlier selection.
- `tests/browser/faction-regressions.spec.ts` renders every boss in one renderer and checks pod ownership and toggling.

## Adding content

A new world, enemy or boss touches, in order: its content data (`src/content/`), the simulation if it has new behaviour
(with focused tests in `tests/sim/`), the world profile (`src/world/terrain-<world>.ts`, `terrain-planet.ts`), the
Blender model and its builder, the view, audio, and the world's doc. The worlds added so far (Amnion, Corona, Nahara,
Umbra) are worked examples ([docs/27](27-amnion-brood-wastes.md), [docs/37](37-corona-dying-star.md),
[docs/39](39-nahara-silent-empire.md), [docs/28](28-umbra-eternal-eclipse.md)).
