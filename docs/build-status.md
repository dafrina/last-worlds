# Build status

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

- **Phone performance is unverified:** no iPhone/Android test has been performed. SwiftShader shows frame hitches (max frame 0.5–1.2 s under heavy machine load). Section generation (13–27 ms in Node) may hitch on phones about every 9 s; measure on hardware, then consider spreading the work across frames.
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
