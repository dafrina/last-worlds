# Build status

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

The GitHub Pages workflow (`.github/workflows/pages.yml`) runs `npm ci`, the unit tests and the build (with typecheck) on every push to `main`, then deploys `dist/`. Repository: https://github.com/dafrina/last-worlds (public); site: https://dafrina.github.io/last-worlds/. The first deployment result is recorded below once it has run.
