# Technical design

The architecture as built: the stack, the combat space and camera, the simulation step, state, input, saves, and the
performance budgets. Module boundaries and APIs are in the [implementation contract](12-implementation-contract.md); the
folder map is in the [README](../README.md#where-things-are).

## 1. Stack and deployment

TypeScript, Vite, Three.js (WebGL2), native DOM and CSS for menus and HUD, Web Audio. Versions are pinned in
`package.json` and `package-lock.json`. Vitest runs the deterministic simulation, world and save suites; Playwright runs
the browser flows in headless Chromium with SwiftShader. No physics engine, ECS framework, UI framework, schema library
or backend.

The site is static and hosted on GitHub Pages at a repository subpath (Vite `base: './'`); `index.html` is the game and
`playground.html` the look-dev playground, two pages of one build. `public/manifest.webmanifest` declares a full-screen,
portrait app. There is no service worker, so nothing is cached for offline play. A lost WebGL context pauses the flight
and asks for a reload (`src/main.ts`).

## 2. Source layout

`src/sim` (pure simulation), `src/content` (balance and content data, the one runtime source), `src/world` (seeded terrain),
`src/render`, `src/input`, `src/ui`, `src/audio`, `src/campaign` (the save and side missions), `src/shared` (contracts) and
`src/playground`, wired by `src/main.ts`. `docs/spec/` is the historical planning seed and is not loaded. See the
[README map](../README.md#src-the-game) and [docs/12](12-implementation-contract.md).

## 3. Logical space, wider map and camera

The simulation uses `(x, s)`: `x` is the horizontal world position, `s` the distance ahead of the player's fixed row.
Aircraft render at `(x, VIEW.flightHeight, -s)`. Terrain scrolls toward −s at `RunState.scrollSpeed` (the campaign's is
`CAMPAIGN_SCROLL` in `src/content/balance.ts`); projectile and aircraft velocities are relative to the player.

The dimensions live in `VIEW` (`src/shared/contracts.ts`) and `BALANCE.camera` (`src/content/balance.ts`): read them there.
Terrain sections are `VIEW.sectionLength` long. The world spans ±`VIEW.worldWidth`/2 and the ship's centre stays
`VIEW.playerRadius` inside it. The view shows `VIEW.width` across; camera x ranges ±(`worldWidth` − `width`)/2 and follows
beyond `BALANCE.camera.deadZone` at up to `BALANCE.camera.speed`, as explicit fixed-step state. Follow, exploration and
visibility rules: [docs/10](10-wide-map-and-camera.md).

The release camera is a perspective lens (`DEFAULT_CAMERA = 'perspective'` in `src/render/scene.ts`; user, 21 October) at
`VIEW.elevation`, zero yaw and roll, placed so the flight plane matches the 9:16 reference frame at the view centre. Its
math, the field of view `LENS_FOV` included, is `src/shared/lens.ts`. Phones fill their available height: the reference
frame's top and width are kept and taller screens extend the foreground below, so extra device size never reveals extra
tactical width. Screen edges never clamp movement before the world edge.

Entities keep their health, motion, IDs and loot outside the view; rendering may cull them. Unseen enemies cannot begin
unreadable attacks, and fired shots do not vanish when the camera pans. Passed sections are recycled.

### Ground targets: the essential contract

Ground models sit at their real height; collision and aiming use a proxy on the flight plane. The visible core is
projected with the release lens and that screen ray is intersected with the flight plane to give its logical `(x, s)`. The
simulation does this in pure math (`toFlightPlane` and `fromFlightPlane` in `src/shared/lens.ts`, used by
`src/sim/ground.ts`), so a turret and its gameplay target share a pixel; the renderer seats models along the same ray
(`rayPlacement` in `src/render/scene.ts`). Look-dev lenses (`?fov=`, `?camera=ortho|rectified`) show ground targets
slightly off; the release lens is exact.

The proxy's authored circle drives acquisition, collision, hit flashes and target brackets. Cosmetic bridges (a tracer to
the real core, a launch arc from the real barrel) never add collision or change damage timing. No scenery raycast decides
line of sight: terrain is scenery, and the first damageable target blocks non-piercing shots (invariant 4).

The camera angle is fixed; its horizontal translation follows the ship in the simulation, and visibility, warnings,
targeting and overlays use that same state. Shake moves rendered objects and their markers together, never logical
targets. Resizing changes pixels, not gameplay geometry.

## 4. Simulation step

`stepRun` (`src/sim/game.ts`) advances one fixed 1/60 s tick (`STEP`) in this order: pace and scroll; player movement and
camera; the director (scheduled cues and the encounter deck), shield supplies, hunters, drift toward the view, enemy and
boss motion and attacks; the special, then main-weapon fire; the Siege Lance, Shockwave and Orbital Strike; projectiles
with swept collision; the Shred spin; observation; boss phase resolution; hazards and contact; pickups; special charge;
then in-place cleanup of the arrays (`retain`). Collision uses swept segment-against-circle tests
(`segmentCircleHit`), never triangle meshes. Observation (`src/sim/events.ts`) only appends; nothing reads it back.

`src/main.ts` runs the fixed-step accumulator under `requestAnimationFrame`: at most five steps of catch-up a frame; a
gap over 250 ms drops its backlog without pausing; hidden documents and window blur pause explicitly, so unseen time is
never simulated. Rendering interpolates between ticks. Graphics quality never changes simulation parameters. If the next
world's assets are not ready at a hyperdrive jump, the run holds before the switch without consuming ticks.

## 5. State

`RunConfig` (mode, seed, mission, difficulty, loadout, ship and look) creates a `RunState`: entities, `cameraX`, lives,
integer shield charges, the normalized special charge, equipment, score or credits, parts, the boss and the clocks. There
is no player hull HP. Endless builds its config from a fixed baseline (`endlessConfig`), independent of the campaign.

Campaign profile, settings, flight log and the mission board are separate stores ([docs/30](30-campaign-progression.md),
[docs/09](09-objectives-and-statistics.md), [docs/35](35-missions.md)). Side missions consume run events only; an observed
run plays out exactly as an unobserved one (`tests/sim/run-events.test.ts`).

Randomness comes from seeded streams (`src/shared/streams.ts`), one per system, that never advance each other; combat is
authored, the world layout seeded. The same build, seed and tick-indexed input give the same run; cross-browser
floating-point identity is not promised.

## 6. Pointer input and layout

Pointer Events with capture, and `touch-action: none` on the gameplay surface only. On pointer-down, UI controls are
tested first, then the steering role is assigned inside the fitted gameplay rectangle (left, right or drag, by the
steering mode). A held steering pointer switches side when it crosses the middle (3% dead band); special and UI pointers
never steer. Opposing holds cancel out; the special uses its own pointer and an edge-triggered queue; keyboard input joins
the same frame adapter. Blur, cancel and lost capture clear held input. Tilt reads DeviceOrientation, with the iOS
permission asked on a tap ([docs/01](01-game-design.md#4-controls)).

Resizes and safe-area changes refit the rectangle and release held input. The device pixel ratio is capped at 1.5 on High
and 1 on Low.

## 7. Offline and installation

Not built: the manifest makes the site installable where browsers allow it, but without a service worker there is no
offline cache, versioned asset packs or update flow. Any future offline support must never swap content during a run and
must never show a half-downloaded world as playable.

## 8. Saves and interruption

Saves are local (`src/shared/storage.ts`): when storage is blocked or full, the game keeps its in-memory defaults for the
session and says so. The campaign profile is written after purchases and results, with idempotent banking by attempt ID
and versioned migrations that back up the original first ([docs/30](30-campaign-progression.md#the-save)). A refresh or
crash mid-flight banks nothing; there is no mid-run resume. Backgrounding pauses the full in-memory run (Page Visibility)
and resumes it on return. There is no export or import of the save. Local saves are editable and not an anti-cheat
mechanism.

## 9. Performance budgets and quality

Targets on real phones, still to be measured on hardware: 60 FPS preferred, a stable 30 FPS acceptable on Low. Profiling
guardrails for a frame: 100 draw calls and 180k triangles; the terrain alone stays within its own budget
(`tests/world/terrain-budget.test.ts`). Gameplay ceilings are `BALANCE.maxEnemies`, `maxProjectiles`, `maxPickups` and
`maxEffects`; effects have bounded pools (`src/render/fx-particles.ts`). These are guardrails, not reasons to trim
required gameplay.

- Pool entities, instance repeated projectiles and props, share materials, avoid allocations in hot loops.
- **High:** one sun with a shadow map that every craft casts into, and the HDR post pipeline with subtle selective bloom
  (`src/render/post-pipeline.ts`). **Low:** no shadow map or post pipeline; each craft's silhouette is drawn flattened
  along the sun (`src/render/craft-shadows.ts`); fewer cosmetic particles and scatter.
- Dynamic instanced pools upload only their live range; empty batches are hidden; the world-matrix update skips hidden
  subtrees (`updateShown`). Next-world assets load during the boss sector and upload under the jump's flash.
- Reduction order under load: cosmetic particles, bloom, shadows, resolution. Never hostile bullets, warnings, collision or
  target markers. A full pool delays a whole scheduled emission; it never drops part of a fixed pattern.

Measurement method, tools and the latest numbers: [mobile performance](36-mobile-performance.md). Browser emulation does
not validate GPU time, touch feel, heat, installation or audio on phones.

## 10. Failure behaviour and non-goals

Lost WebGL context: pause and ask for a reload. Audio blocked: silent until a gesture. Storage unavailable: play continues
without saving and says so. Next world not loaded at a jump: hold before the switch.

No multiplayer, score server, cloud sync, background simulation, remote code or runtime content generation. An online
leaderboard would need its own trust design: a local seeded simulation cannot prove a score legitimate.
