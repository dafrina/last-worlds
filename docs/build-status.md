# Build status

## Combat retune, narrower world and boss arena — 15 October 2026

User feedback after the checkpoint: endless should ramp up in speed; squadrons overlapped and the game was still easy; the ship's hitbox was too small; the boss was too easy and rolled over ravines; the map should be 2.5 screens wide.

- **Endless pace ramp:** sector 1 starts at the old pace (scroll 4) and reaches 1.1× the campaign pace (scroll 5.5) by sector 5, with ship, enemies and camera scaled together. Warning times never scale. `RunState.scrollSpeed` and `RunState.pace` drive render and streaming.
- **Squadrons:** they never overlap (2.2-unit separation, one air squadron at a time, with ground batteries beneath) and threat budgets are lower. Difficulty now comes from much shorter repeat intervals: Dart 1.2 s, Weaver 1.5 s, battery 1.4 s, Lancer 2.6 s.
- **Hitbox:** `VIEW.playerRadius` 0.25 → 0.42, the third-tier size the user asked for; the model is unchanged. The safe gap is now 1.74.
- **Bastion-9:** harder phases, overload lanes over its own hit columns, and the scroll stops into a static arena with a flat platform (docs/15).
- **World:** 30 wide (`TERRAIN_VERSION` 8). Pipelines still connect 100% (132/132 test edges, 1,053/1,053 over 60 more seeds).
- **Bot evidence** (Standard): endless idle loses its first life at 29.1 s; the dodger at 30 s (game over at 109 s); the mid-skill pilot at 76 s. The perfect pilot clears every mode and all nine weapon × difficulty combinations without a hit.
- **Open decision:** the larger hitbox makes Training very hard for the mid-skill bot (it fails Standard Training in all 5 runs); human playtesting should decide whether to soften Training.

## Checkpoint deploy — 14 October 2026, late evening

The user asked for a checkpoint at a stable point; the graphics polish and its measurements follow in a second deploy.

- **Bastion-9 production integration** (docs/15):
  - **Model:** the Blender model with gigantic treads, a core turret blended into the hull and deck turrets (19.1k triangles).
  - **Animation:** treads scroll and kick up dust; shutters slide open; guns track their aim; batteries break into wrecks with sparks and smoke; the core glow follows damage; overload flickers.
  - **Destruction:** sparks, rolling fireballs and debris, a core blast with a shock ring, then smoke.
  - **Seating:** `bastionPlacement` rests the hull on the highest ground under it; scenery under the footprint is hidden.
  - **Audio:** cues for arrival, phase changes and kills.
- **Pipelines:** all 132 test-seed edges connect (risers, trestles, lifted runs).
- **Combat:** 16 authored squadron formations; 5–8× denser fire under a runtime fairness guard and an offline validator; Relaxed, Standard and Veteran differ more.
- **Pace:** about 20–25% faster. Scroll 4 → 5, ship 10/70/100 → 12/90/125, camera follow 14 → 17.
- **Rendering:**
  - **Flight plane:** raised from 3 to 3.8; screen positions are unchanged.
  - **High tier:** sun shadows and a new post pipeline (MSAA HDR, selective bloom, grade, vignette).
  - **Look:** warmer lighting; veins are now thin glowing cracks; valleys read warm violet instead of night.
  - **Craft:** PBR craft materials; engine, muzzle, impact and explosion VFX.
  - **Haulers:** 75% scale, seated on slopes.
- **Controls:** a held steering touch that slides across the middle switches direction (3% dead band).
- **iOS:** the long-press loupe and callout are suppressed. This shipped earlier, in `f31267e`.
- **Evidence** (WSL, Node 24.16.0, SwiftShader):
  - **Checks:** typecheck clean; `npm test` 16 files, 167/167; build 845 KB JS (234 KB gzip); `test:browser` 9/9, including slide-steering and all three boss cases.
  - **Draw calls** (graphics agent, frozen builds, boss fixture): High 104 (shadow 37, main 61, post 6), Low 56.
  - **Visual review:** endless seed 93 and the boss batteries phase were checked by eye.
- **Deployed:** commit `587f7bc`, Actions run 38640030484 succeeded. Live check in headless Chromium: both campaign missions are offered; `bastion-9.glb` returned 200 (1,674,252 B); endless High tier ran at 44 calls (shadow 8, main 30, post 6) with all kits as GLB, no stream fallbacks and no page errors.
- **Not verified:** phone frame time; endless draw-call and frame-time measurements under the new renderer.
- **Open items:**
  - mineral pool rims still read as flat cyan in deep valleys;
  - merging the fortress meshes would cut about 25 shadow draws;
  - the baked terrain shading uses a 28° sun while the live sun is at 38°;
  - the perspective decision is pending, with data in hand: at FOV 20 the flight plane is 13.7 units wide at the top versus 10.7 at the bottom, 8.5% of the sim's view rectangle falls off-screen, and ground targets slide up to 1.27 units across a camera pan; the graphics agent recommends keeping ortho.

## M2 mechanics increment — local, 14 October 2026

Rolling Thunder is selectable alongside Training and ends with the functional Bastion-9 encounter. Two destructible batteries, a protected/exposed core, overload lanes, safe destruction/extraction, victory and retry are implemented. Shields remain pickup-only with a fixed mission budget; endless starts and difficulty remain independent. See [the complete behavior and handoff](15-bastion-slice.md).

This increment adds `src/content/bastion.ts`, `src/sim/bastion.ts`, `src/render/bastion-view.ts`, mission UI/configuration, and dedicated tests. Terrain changes in this shared checkout belong to the other session. Only a small boss renderer hook was added to `scene.ts`; its concurrent terrain hooks were preserved. Blender MCP was checked successfully (Blender 5.2.2 LTS); the live Blender scene was not modified.

Verification in WSL Ubuntu / Node 24.16.0 / Chromium with SwiftShader:

- Typecheck and production build pass; current JS bundle is approximately 781 KB / 212 KB gzip. The existing chunk-size warning remains.
- The full 80-test suite passed after the concurrent terrain-network failure was resolved by the terrain work. One subsequently added boss projection test also passes (81 checks total).
- Seven browser tests passed in an isolated artifact directory; the boss browser suite was then extended with extraction → victory → retry and all three boss browser tests passed (eight distinct browser cases covered overall). An earlier trace-file cleanup collision between concurrent test processes was resolved by using `lookdev/bastion-qa` and `lookdev/bastion-final-qa`.
- Scripted full-mission clears pass for all nine main-weapon/difficulty combinations with starting lives, no pickups and no special. Standard ideal clears: Pulse 156 seconds, Fan 214, Seeker 160. This establishes feasibility, not human balance.
- Model socket/collision projection verified across center and both camera extremes over multiple terrain heights. Actual batteries/core/overload screenshots inspected at phone size; live steering and battery fire inspected in the in-app browser.
- Screenshot: [functional boss core](screenshots/bastion-core-phone.png). Development encounter fixture: `/tests/fixtures/bastion.html`; the fixture is absent from `dist/`.

The new boss increment is local and has not been pushed/deployed by this session. The existing public site below is the earlier deployed version. Remaining M2 gates: human boss playtests, actual phone frame-time/touch checks, production fortress/ship models and fuller feedback/audio. M3 campaign hangar, wallet, goals/statistics and saves remain next; this increment does not claim those systems.

*Integrator note:* the Codex session ran out of tokens before pushing. At the user's direction, the World session committed this increment unchanged as `deb1b22` and deployed it together with the settlement-network pass. That commit passes typecheck and its 81 unit tests on its own.

## Settlement network pass — 14 October 2026

User feedback: the world "feels very empty", "all the infrastructure bases look the same", and pipelines and roads should run beyond the bases. Changes:
- **Outposts:** seven seeded archetypes (refinery complex, mining camp, landing field, comm station, pumping station, wreck site, abandoned outpost), each with its own composition, rotation/mirroring and module counts, on flattened ground. They use nine new Blender pieces (drill rig, two habitats, comm dish, tiling solar array, light mast, silo, two wrecks), so `khepri-infra.glb` now has 16 nodes and is 1.07 MB.
- **Network:** a seeded global graph links the outposts, with exits off the map and some cross links. Each edge is path-found with A* on a slope-cost grid, so routes never climb cliffs, and is cached per edge, so every section renders its own part identically. Roads render as terrain-following ribbons with ruts and berms; pipelines are shared-kit pieces on supports, pitched to the ground, with valve stations.
- **Life and density:**
  - Haulers drive the roads and amber beacons blink; both are presentation-only, from seed and time, never collision or targets.
  - Rock, boulder, fallen-column and crystal fields are denser, and impact craters have ejecta.
- **Streaming:** section generation is resumable (generators) and prefetched ahead of need within a 3 ms per-frame budget. A test proves incremental and synchronous builds are identical.
- **Evidence (WSL, Node 24.16.0, SwiftShader):**
  - **Checks:** typecheck clean; `npm test` 11 files, 84/84; build 782 KB JS (212 KB gzip); `test:browser` 8/8, including the 3 Bastion browser tests.
  - **Render stats:** fixed seed 93 at High tier gave 44–54 draw calls and 26–30k triangles in view. A Node sweep found at worst 51 calls and 36.4k terrain triangles.
  - **Streaming:** no synchronous fallbacks after start. Terrain CPU work peaked at 4.3–5.4 ms per frame (budget ≈4 ms; 1–2 frames over in 700).
- **Remaining:**
  - About half of the edges flagged for pipelines fail their path search at cliffs.
  - The old rail track pieces are no longer placed.
  - Crystal and lamp glow stay tone-mapped.
  - Phone frame time is still unmeasured.

14 October 2026 — M1 world pass: procedural Khepri world map, Blender kits, GitHub Pages pipeline.

## Authorized scope

Implementation agents built a shared flight prototype (combat, generated world/3D rendering, controls/UI); the integrator owns wiring, design updates and verification ([integration contract](12-implementation-contract.md)). On 14 October the user directed a world-map pass for Khepri that matches the concept art ([Khepri world](13-khepri-world.md)). That pass added Blender-modelled terrain, an infrastructure kit and a shared cross-planet industrial kit ([shared kit](14-shared-industrial-kit.md)), CC0 Poly Haven surface detail, and GitHub Pages deployment.

Procedural terrain and world layout belong in the MVP. Enemy models, encounter composition, battle sequences and attacks remain authored. Hero generation is deferred.

## World pass: what changed

- **Seeded macro geography** (`src/world/`): domain-warped massifs and ridges, dendritic canyons at any angle, four terrace tiers, moods (canyons/mesas/basins/flats), relief from about −6 to 2.0 (rims up to the 2.2 scenery cap), and baked sun shadows. Turquoise veins and terraced pools sit in valley bottoms. Outposts stand on flattened terraces; seeded pipelines and tank farms follow contours. Terrain never reads combat or loot state.
- **Rendering** (`src/render/terrain-*.ts`, `scene.ts`): slope-driven materials (basalt faces, ochre dust, lighter rims), a light slate haze in the depths, and kit and infrastructure instancing with view culling. Ground turrets seat on any terrain level, with a render-only plinth and an occlusion silhouette.
- **Blender kits** (rebuildable headless from `tools/blender/*.py`, byte-identical builds):

  | File | Size | Nodes | Contents |
  | --- | --- | --- | --- |
  | `khepri-kit.glb` | 663 KB | 33 | basalt clumps, columns, spires, walls, fallen columns, rocks, boulders, crystals, crystal spires, rosette, hoodoos |
  | `khepri-infra.glb` | 597 KB | 7 | landing pad, refinery, relay, 3 haulers, tiling track |
  | `shared/industrial-kit.glb` | 342 KB | 14 | tiling pipes in 2 sizes, valve, support, 4 tanks, 2 containers; mask-based colour so any planet can re-theme them |

  Previews and provenance are in `art/khepri-kit/`, `art/khepri-infra/` and `art/shared-industrial/`.
- **Textures:** CC0 Poly Haven sources (`dry_ground_rocks`, `rock_face_03`, `metal_plate_02`) are in `art/source/polyhaven/` with provenance. Runtime derivatives total 174 KB.
- **Look-dev:** `node tools/lookdev.mjs <label> [seed]` captures fixed-seed phone-size screenshots of the dev server into the git-ignored `lookdev/`.

## Evidence (14 October 2026, WSL Ubuntu, Node 24.16.0, Playwright Chromium with SwiftShader)

- `npm run typecheck`: clean.
- `npm test`: 8 files, 64/64 passed. Covered: terrain determinism, seams, height range, landform variety, budgets, kit contracts, infrastructure placement, and turret projection on deep and high ground.
- `npm run build`: passes. JS bundle 753 KB (202 KB gzip); Vite warns that the chunk exceeds 500 kB, and that warning is accepted for now.
- `npm run test:browser`: 4/4 passed.
- **Render stats** (fixed seed 8831, 432×768 at DPR 2, High tier): 33–48 draw calls and 20–32k triangles in view. A Node sweep of seeds 11/93/8831 across the full camera range found at worst 44 calls and 52.6k triangles. All are within the 100-call / 180k-triangle guardrail.
- **Memory:** a 90 s endless run (350 units of travel, about 10 sections recycled) held a flat 40 MB JS heap. Geometry count plateaued at 86 after the first-use warm-up.
- **Visual review:** the integrator compared fixed-seed captures against `art/concepts/02-portrait-combat.png` and `03-minimal-hud.png`. Material language, depth and miniature scale match the direction the user approved in review. The integrator retuned depth tint and haze to keep Khepri rust-ochre, and made pools dark liquid with soft glowing rims so they no longer compete with cyan player shots.

## Known limits and next actions

- **Phone performance is unverified:** no iPhone/Android frame-time test has been performed; the user has played on an iOS device informally. SwiftShader shows frame hitches (max frame 0.4–1.2 s under heavy machine load). Section generation is now spread across frames (see the settlement network pass); measure on hardware.
- **Visual polish:**
  - Diagonal terrace risers still alias into sawtooth steps in places, so more rim dressing is needed.
  - Veins are subtle.
  - Mineral flats can grow large pools.
  - Glow has no bloom.
- **Not yet in the repo:** the runtime texture derivation script (see `art/source/polyhaven/README.md`).
- **Not the complete MVP:** campaign economy, mission content, side missions/statistics/save progression, production boss art, full endless upgrades and offline installation remain later milestones.

## Deployment

The GitHub Pages workflow (`.github/workflows/pages.yml`) runs `npm ci`, the unit tests and the build (with typecheck) on every push to `main`, then deploys `dist/`. Repository: https://github.com/dafrina/last-worlds (public); site: https://dafrina.github.io/last-worlds/. 

First deployment, 14 October 2026:
- **Run:** commit `ba33ef6`, Actions run 38590342484. Build (unit tests plus typecheck/build) and deploy both succeeded.
- **Live check:** in headless Chromium, the page loaded, an endless flight started, and all three kit GLBs and the textures returned 200 from the `/last-worlds/` subpath. Render stats showed `kit/infra/shared: glb`, with no page errors or failed requests.
- **Not yet tested:** phones and the installed/offline flow (no service worker exists yet).
- **Upcoming runner change:** GitHub will move `ubuntu-latest` to Ubuntu 26 from 19 October 2026; recheck the workflow after that.

Second deployment, 14 October 2026 (Bastion-9 plus settlement network):
- **Commits:** `deb1b22` (Bastion, from the Codex session) and `ff62ddc` (world).
- **First attempt failed:** run 38622891671. The 70 s terrain-streaming unit test took 5.8 s on the GitHub runner, over Vitest's 5 s default. Fixed in `vitest.config.ts` (`testTimeout` 30 s); run 38623094575 succeeded.
- **Live check:** in headless Chromium, the campaign offered "Rolling Thunder · fortress assault" and "Training". The 16-node infra kit served 200 (1,066,244 B). Endless rendered at 52 calls / 33k triangles, with `kit/infra/shared: glb`, no stream fallbacks and no page errors.
- **Long local run:** a 160 s campaign run through the Bastion fight (623 units of travel) held a flat 35 MB heap with zero synchronous terrain generations. Geometry count grew only on first use of models and the boss.
- **Not yet tested:** phones.

## 15 October 2026 · Isolated flight-command UI and local statistics (Codex)

User reassigned Codex to UI/menu only while World continued combat/terrain. This increment sits on the newer `372a2a7` checkout and preserves that session's ongoing dirty files.

- Deep navy/cool blue menu palette and original SVG orbital illustration; shorter Home with Campaign Flight, Endless, Statistics and Settings. Instructions live in a separate guide. Campaign now has a dedicated preparation page with the existing mission/difficulty/main-weapon options and all four equipment slots represented.
- Settings are reachable from Home/Pause; Back and Escape return to the calling page without resuming a paused flight. Keyboard tab handling, focus return, narrow-screen scrolling and title sizing were checked.
- Local observational statistics now persist independently for Campaign/Endless, with cumulative activity, finalized records and recent flight history. No campaign wallet, unlock, store or gameplay logic was added. Interrupted checkpoints are labeled; corrupted/unknown data is preserved and blocked storage falls back to a clearly labeled session log.
- Navigation plan and save boundaries: `docs/16-flight-command-ui.md`. Future Missions/Loadout/Store/Assignments belong inside Campaign; no nonfunctional store controls were added.

Validation:
- `npx vitest run tests/ui/flight-log.test.ts`: **8/8 passed** (deltas/deduplication, mode isolation and read-only observation, reload/interruption, malformed saves, quota failure, sequential shared-storage updates, bounded history and exclusion of late fixtures).
- Playwright: **14 distinct browser cases passed** across `menu.spec.ts` (5), `flight.spec.ts` (6) and `bastion.spec.ts` (3). Initial 13-case integration run passed; the added small-screen/focus case caught a tab-trap bug, which was fixed and all 5 menu cases rerun successfully. Final title width fix passed the targeted responsive case again.
- Checked 320×568, 390×844 and 1440×900; actual menu/campaign/statistics screenshots inspected, plus an in-app browser review. Narrow-phone title clipping under fallback fonts was fixed by sizing against frame width. Home fits without vertical scrolling; campaign Back and Launch remain reachable on the smallest viewport.
- `npm run build`: **passed**, including TypeScript. Combined current bundle 866.20 kB JS / 241.93 kB gzip; the existing >500 kB chunk warning remains. `git diff --check` on this increment passed.
- Browser evidence uses bundled Playwright 1.64.0 Chromium / software ANGLE, DPR 1, plus the desktop in-app browser. No actual iPhone/Android validation or full combat/terrain suite claimed for this isolated increment.

Evidence: `docs/screenshots/menu-blue-phone.png`, `campaign-menu-phone.png`, `statistics-phone.png`. Detailed test output is in ignored `lookdev/ui-menu-qa`, `ui-final-qa`, and `ui-title-qa`.

Status: local changes ready for World's coordinated integration; no independent commit/push/deploy. Real phone testing, full campaign progression/store, richer statistics filters, and future log migration/export remain later work.


## 15 October 2026 · UI release validation

The user requested deployment of the reviewed UI increment on top of the already deployed gameplay commit `dde50a5`. The exact combined checkout passed all **180 unit tests**, **14 browser tests**, TypeScript and the production build before commit/push. Browser output: `lookdev/ui-deploy-qa`. Source changes are limited to the menu, local statistics, browser theme color, associated tests, screenshots and documentation. The existing bundle-size warning and actual-phone validation limits remain.
