# Last Worlds: code-health review

8 November 2026. This is a read-only review of `integrator-next` (HEAD `8348c14`) plus the working tree at 20:00.

- Another session was editing `src/render/scene.ts` during the review (2,297 → 2,342 lines). Its line numbers are from the working tree and may drift by a few dozen lines.
- Every recommendation respects AGENTS.md: the simulation stays free of Three.js and the DOM, it runs at a fixed 60 Hz with seeded streams, there is no ECS or custom engine, phone performance comes first, and each number has one source.
- It builds on `docs/36-mobile-performance.md` and does not repeat its candidates.
- Findings marked *(audit)* come from a delegated read of `src/render/` outside `scene.ts`. I re-checked the key ones (V4, V5, V8, D3).

## Measurements taken

| What | Result |
| --- | --- |
| `npx tsc --noEmit -p .` (TypeScript 7) | Clean, 0.9 s. |
| `npx vitest run` | 979 passed, 5 skipped (4 report files are opt-in). **129.5 s wall**, 16 min 41 s CPU on 16 cores (load average 5.6). |
| Sum of all test durations | 984 s. 195 tests take over 1 s, 43 over 5 s, 18 over 10 s. The 10 slowest files account for 63 %. |
| Longest-running file | `tests/sim/fairness.test.ts` runs 128.8 s serially in one worker, which is the whole run's wall time. |
| `vite build` | 0.55 s. Chunks: `scene` **1,333.5 kB (396.9 kB gzip)**, `main` 124.8 kB (44.2 kB gzip), `playground` 55.6 kB, worker 7.2 kB. Vite warns that a chunk is over 500 kB. |
| `scene` chunk by source (sourcemap) | three.js core 446 kB, `src/render` 298 kB, `src/world` 146 kB, `src/content` 82 kB, `src/sim` 58 kB, three/examples 50 kB (GLTFLoader 43 kB). |
| Shipped site | `public/` is 144 MB in 124 files; the built site is 146 MB. **About 29 MB are GLBs the game never loads.** |
| Source size | 126 `src` files, 31,524 lines (15 files over 500 lines, 5 over 1,000). 13,303 test lines. 867 source lines are over 160 characters, 60 over 250. |
| Functions | 3,176 in `src` (oxc AST walk): 37 over 100 lines, 11 over 200, 6 over 400. |
| Stricter compiler flags | `--noUnusedLocals --noUnusedParameters` gives 17 errors. `--noUncheckedIndexedAccess` gives 1,987 (not worth enabling). |

## Executive summary

The simulation side is healthy:
- `src/sim`, `src/world`, `src/content` and `src/campaign` import neither Three.js nor the DOM (checked on the import graph), and none of them calls `Math.random`.
- `sim/game.ts` is a sequence of small functions; the longest is 72 lines.
- All bosses share one `BossDefinition` (`content/bosses.ts:42`).
- Every high-risk rule in AGENTS.md has focused tests.

The debt sits in three places:

1. **Rendering is wired by hand, world by world and boss by boss.**
   - `createRenderer` is one closure of 1,826 lines (`scene.ts:517`), with a 784-line `render()` inside it.
   - It holds 46 planet-string branches (101 across `src/render`), six copy-pasted boss loaders and five faction batch builders.
   - Per-planet colour tables disagree with each other (`PLANET_GLOW` vs `WORLD_PAINT.glow`).
   - The four boss views duplicate about 450–550 of their 1,810 lines, and there are ten GLTF loading sites with eight overlapping node-baking helpers.
   - Adding an eighth world means editing about ten places in `scene.ts`. It is also the file that parallel sessions have to share by line ranges (COORDINATION.md).
2. **World generation is copied per world.**
   - The scatter `add` closure exists in 7 copies and the footprint check in 2.
   - The scenery cap `3.0` is defined 6 times.
   - Corona borrows Umbra's constants by importing them.
3. **Throughput is poor.**
   - One test file sets the wall time of the whole suite.
   - The deploy ships 29 MB of archived models, and the Pages sync has already timed out twice (`pages.yml`).
   - The game page parses a 1.33 MB chunk before the DOM menu can run.

None of this needs an engine or an ECS. It needs tables keyed by `PlanetId` and `BossId`, a handful of shared helpers, and a split of the renderer along seams that already exist inside it.

Two small defects turned up along the way:
- Facility kits that do not exist are requested on Amnion, Corona and Umbra (V4).
- Corona's muzzle flashes stay coral while its shots are red (V5).

## Prioritized findings

Highest value first. Effort: S is under half a day, M is half a day to two days, L is more than two days. Risk is the chance of a visible or gameplay change.

| ID | Area | Finding | Evidence | Recommendation | Effort | Risk | Expected gain |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Tests | One file is the suite's wall time. | `fairness.test.ts` runs 128.8 s serially against a 129.5 s wall. Its `cue sequence hazard unions` block takes 90.9 s (31 tests) and `formation hazard unions` 36.6 s. | Split it into 3–4 files: formations; campaign unions; endless unions by sector range. The next slowest files are `terrain-route.test.ts` (78 s) and `difficulty.test.ts` (62 s; one test 45.8 s). | S | low | Wall time about 129 s → 50–60 s locally (estimate); more on 4-core CI. |
| P1 | Assets | 29 MB of archived GLBs are deployed. | `khepri/bastion-9{,-v5-remodel,-v6-treads}.glb`, `{khepri,vesper,nacre}/facility-kit-v3.glb`, `nacre/the-veil.glb`, `luna/warden.glb`, `vesper/helion-ark.glb`, `shared/facility-compounds.glb`, `umbra/cliff-kit.glb`, `umbra/wraith-v1.glb`. Only tests and Blender scripts read them (`cinematic-assets.test.ts:171-215,251`). | Move them to a folder that is not deployed (e.g. `art/archive/`) and repoint the tests and `tools/blender` inputs. This keeps the 4 November decision to retain them. | S | low | Deploy 146 → about 117 MB; a shorter Pages sync (`pages.yml` notes two timeouts). |
| R2 | Reuse | The render side has no world or boss registry. | 46 planet-string branches in `scene.ts`, 35 in `terrain-kit.ts`, 13 in `terrain-view.ts`. `applyLook` if-chain `:640-679`, `preload` ternaries `:1175-1190`, boss routing `:1561-1611`. | Add `render/world-registry.ts` with `WORLD_RENDER: Record<PlanetId, { look, environment, craft, boss, shotHues, glow, groundLook }>` and `BOSS_VIEWS: Record<BossId, { view, ensure, seat }>`. | M | med | A new world becomes one entry, and `Record<PlanetId>` makes the compiler list the gaps. |
| R1 | Structure | The renderer is one closure; `render()` alone is 784 lines. | `scene.ts:517-2342`, `render` at `:1530-2313`; 51 imports. | Split along the existing seams (§1.1). | L | med | Reviewable units, and no more line-range ownership of one shared file. |
| V1 | Reuse | The four boss views duplicate their scaffolding and their per-weak-point loop *(audit)*. | Per-part loops: `bastion-view.ts:411-473`, `warden-view.ts:307-358`, `veil-view.ts:452-504`, `ark-view.ts:375-437`. FX helpers: `bastion 311-336`, `warden 239-258`, `veil 354-371`, `ark 251-274`. Rings, markers and shock rings are copied 3–4×. | Add `render/boss-view-kit.ts` (§2). Each view keeps only its rig, motion and choreography. | L | med | About 450–550 lines removed; one hit or death behaviour for every boss. |
| V3 | Reuse | GLTF loading and node baking are spread across many helpers *(audit)*. | 10 `GLTFLoader().loadAsync` sites in 7 files, using two import specifiers (`three/examples` in `hero-craft.ts:2-3` and `hero-assembly.ts:12`, `three/addons` elsewhere). 8 extract/bake/merge helpers (`terrain-kit.ts:254-295,1565-1596`, `models.ts:147-203,419-447,509-552`). Two caches with different failure behaviour. | Add `render/gltf-nodes.ts`: `loadGltfCached`, `bakeNode`, `disposeScene`, `constantAttribute`, `loadNodes`. | M | med | About 200 lines removed. Needs byte-identical attributes; the asset tests guard this. |
| W1 | Reuse | The scatter sink is copied 7× and the footprint check 2×. | `add` closures: `terrain-scatter.ts:214`, `-luna.ts:301`, `-vesper.ts:498`, `-nacre.ts:130`, `-amnion.ts:349`, `-umbra.ts:156`, `-corona.ts:178`. `supportedBase`: `-umbra.ts:175`, `-corona.ts:194`. | Add `world/scatter-sink.ts` (`createScatterSink({ startS, size, terrain, cap })` → `{ add, finish }`) and `world/footprint.ts` (`footprintBase(...)`). Move the code verbatim; the pinned terrain tests prove nothing changed. | M | low–med | About 150 lines removed; the next world's scatter is just rules. |
| B1 | Bundle | The menu waits for the whole renderer. | `main.ts:2` imports `createRenderer` statically. The 1,333 kB `scene` chunk is parsed before the DOM menu runs. | `await import('./render/scene')` after `createUi`, with the boot splash held until it resolves and the hangar preview disabled until then. | M | low–med | Faster time to menu on phones (unmeasured; parsing 1.3 MB typically takes a few hundred ms on mid-range phones). |
| V4 | Defect | Facility kits that don't exist are requested *(audit, re-checked)*. | `FACILITY_KIT_ASSETS` maps amnion, corona and umbra to `facility-kit-v4-ruins.glb` (`facility-kit.ts:20-23`), but `public/assets/{amnion,corona,umbra}` contain no such file. The result is one 404 and one warning per world per session (`facility-view.ts:138,171`). | Skip `prepare` when `modulesOf(world)` is empty; map those worlds to `null`. | S | low | No failed requests; clearer data. |
| V5 | Defect | Corona's muzzle flashes stay coral while its shots are red *(re-checked)*. | `fx-particles.ts:494` hard-codes `0xff9a78`; the shot hues live in `scene.ts:1313` (`HOSTILE_WARM`, `HOSTILE_BLOOD`). | Move both palettes and `hostileHues(planet)` into `shot-colors.ts` and use them in both places. | S | low (small visible fix) | Consistent colours; one source. |
| PF1 | Perf | The warm-up does a quadratic search over redundant objects. | `scene.ts:1626-1635`: boss roots already in `scene` are collected again by name, from a stale 4-name list missing 3 bosses. Each object is then checked with `restore.some`, which is O(n·m). | Drop `bossParts` and track restored objects in a `Set`. | S | low | Shorter warm-up frames at launch and at the jump flash (size unmeasured). |
| R3 | Reuse | Six identical lazy boss loaders and five faction loaders. | `ensureWarden/Veil/Cradle/Eclipse/Heliophage/Ark` at `scene.ts:1128-1172`; `ensurePredator/Umbra/Corona/Nacre/Craft` at `:1003-1075`. | One `lazyAsset(key, load, apply, fallbackMessage)` memo, used by the registry. | S | low | About 70 lines; the `disposed` and `warmed = false` rules live in one place. |
| R4 | Reuse | InstancedMesh setup boilerplate is repeated. | The sequence `setUsage(DynamicDrawUsage)`, `frustumCulled = false`, `count = 0`, `setColorAt(WHITE)` appears 15× in `scene.ts` (e.g. `:860-882`, `:983-1002`, `:1051-1068`) and again in 10 other render files. | Add `dynamicBatch(geometry, material, capacity, { name, colors, shadows, ghost })` to `instances.ts`. | S | low | About 80 lines; one rule for casters' depth material. |
| V2 | Reuse | Boss particle code is copied and imported sideways *(audit)*. | `particleLayer` is copied in `bastion-view.ts:218-272` and `ark-view.ts:164-218`. `warden-view.ts:7` and `veil-view.ts:10` import it and `hash` from `bastion-view`. `castShadows` appears 2× (`bastion 66-89`, `ark 49-72`), `glowMaterial` 4×, and the seat formula 2× (`veil 44`, `ark 33`). | Add `render/boss-particles.ts`, using the swap-compaction pool from `fx-particles.ts:500-520`. Put `mergeShadowProxy` in `gltf-nodes.ts`. | S | low | About 120 lines; also fixes the O(n) `splice` (§4). |
| S1 | Reuse | Keyed "own stream" rolls are copied 3× in sim and content. | `encounter-deck.ts:807`, `sim/hunters.ts:75`, `sim/sites.ts:91` use the same mixing constants with different salts, and each allocates its key array on every call. | Add `shared/streams.ts` with `keyedUnit(salt, ...keys)` and `mulberry32(seed)` (from `encounter-deck.ts:814`), moved verbatim so results stay bit-exact. | S | low | One audited RNG module (the AGENTS.md seeded-stream rule). |
| S2 | Layering | Gameplay data lives in `src/sim`, so input and render import the simulation. | `SHIP_PERKS` (`sim/ship-perks.ts:4`) is imported by `input/controls.ts:2` and `render/scene.ts:5`. `HUNTERS` (`sim/hunters.ts:18`) is imported by `scene.ts:17`. | Move the tables to `content/ship-perks.ts` and `content/hunters.ts`; the simulation keeps the behaviour. | S | low | Input and render depend on data, not on the simulation. |
| W2 | Layering | World generation has two runtime import cycles. | `terrain-districts.ts:3` ↔ `terrain-settlements.ts:3`; `terrain-walls.ts:2` ↔ `terrain-scatter.ts:2`. | Add leaf modules: `world/scenery-kit.ts` (`KIT`, `KitKind`, `KitInstance`, `ScatterField`) and `world/settlement-geometry.ts` (`SETTLEMENT_CELL`, `padDistance`, the `Settlement` types). | S | low | No evaluation-order hazards. |
| C1 | Constants | Per-planet values have several sources. | Scenery cap `3.0` in `terrain-layout.ts:15` and 5 planet files. Corona uses Umbra's plateau and caps (`terrain-corona.ts:7,23,181`). `PLANET_GLOW` (`scene.ts:1292`) vs `WORLD_PAINT[..].glow` (`world-paint.ts:25-37`): luna `0x8fd0ff` vs `0xff8a3a`, nacre `0x3ff0c8` vs `0xb46cff`. Corona haze literals `-6.55`/`-6.8` instead of `CORONA_SEA_LEVEL` (`terrain-kit.ts:1446`). Two foundation-colour tables disagree (`facility-view.ts:258` vs `site-view.ts:89`). `linear(hex)` is defined 6×. | One `SCENERY_MAX_HEIGHT`. Named shared values for Corona. Glow moves into the registry (R2); ask the user whether the two glows are meant to differ. One `render/color.ts`. | S | low | The AGENTS.md "one source per number" rule. |
| D1 | Dead code | Unused exports and imports. | Exports: `scatterKit` (`terrain-scatter.ts:347`), `socketReach` (`settlement-modules.ts:132`), `guardsClear` (`sim/sites.ts:210`), `updateBastion` (`sim/bastion.ts:377`), `TALL` (`facility-kit.ts:62`), `createCargo` (`models.ts:269`), `createRoadMaterial` (`terrain-kit.ts:1740`), and the type aliases `ArkView`, `JumpFx`, `PostPipeline`, `MissionTracker`, `CampaignProfileStore`. Plus 17 unused locals and parameters. | Delete them, then enable `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`. | S | low | Stays clean automatically. |
| V7 | Dead code | Render paths that are never reached *(audit)*. | The hero kit path (`hero-craft.ts:106-128`; `hero-assembly.ts` is used only by the playground). Boss rollback rigs never run with the current `BOSS_ASSETS` (`bastion 150-178`, `ark 109-131`, `veil` `modelRig` `128-173`). The facility v2 path is reached only by a fixture `fv=2` (`facility-view.ts:336-444`). The stand-in block says "delete once all three kits ship" (`:307-334`). The Nacre bloom in `water.ts:80-96,179-183` never draws (Nacre uses the mire material, `terrain-view.ts:220`). The boss `dispose()` methods are never called. | Delete them; keep the rollback rigs only if the user wants rollback (`boss-assets.ts:1`). | S | low | About 400 lines. |
| D3 | Release | Look-dev switches and cheats ship in production. | `?camera=rectified` (`scene.ts:190`) and `?camera=ortho` are used by no test or tool. `?unlock=all` and `?perf` open every mission and fly top-tier Twin Pulse (`game-ui.ts:189-190,477`). `?planet=` is DEV-gated in `scene.ts:607` but not in `terrain-view.ts:15-47`, so in production it would change the terrain without the look. `?icecrisp` re-parses `location.search` on every Vesper `setPlanet` call (`terrain-kit.ts:859-864`). | Delete `rectified`. Gate the rest behind `import.meta.env.DEV` or one `?qa` flag; ask the user which switches must stay live. | S | low | Smaller branches; no shipped cheats or half-working switches. |
| D2 | Dead state | `RunState.lootRng` is never read or advanced. | Set at `sim/game.ts:58`, declared at `contracts.ts:197`. docs/23:121 still calls it "the only stateful gameplay RNG". | Remove the field and the doc line. | S | low | Removes a misleading invariant. |
| PF3 | Perf | `render()` allocates every frame. | A new `Map` (`:1789`). Tuple arrays per ground enemy (`:1873`) and per turret (`:1919`). Spreads (`:1942,1944,2248`). A `{ ...muzzle }` copy per enemy and a `state.enemies.find` per windup and per hazard (`:2016-2020,2172`). The `strip`, `beamPreview` and `aimRay` closures are recreated each frame (`:1718-1780`). `liveInstances` builds an array on every call (`instances.ts:10`). | Hoist scratch maps and arrays; build one `enemyById` map per frame; use constant offset tables. | M | low | Part of the ≈15 KB/frame `render()` share (docs/36 §2.6). |
| V6 | Perf | The views allocate every frame *(audit)*. | Boss markers cost about 70–80 short-lived objects per frame for a 3-part boss (`bastion 413-414,465`, same in the other views), and `local()` clones a vector on every call. Particle `emit` creates 2 objects per particle plus an O(n) `splice`. `terrain-view` `animate` builds 4 Maps and runs 4 `terrainHeight` queries per hauler (`:1009-1059`). `site-view` `update` calls `prepare()` every frame (`:429`) and spreads its sets several times. | Scratch vectors and index writers; precompute hauler bank and slope per road sample; early-out in `prepare`. | M | low | GC pressure in boss fights and site views. |
| PF4 | Perf | The simulation reallocates its arrays every tick. | 5 `.filter` reassignments per tick (`game.ts:93,104,583,620,903`). Seeker targeting sorts with a comparator that filters projectiles on every comparison (`game.ts:780-781`). | Add an in-place `retain(array, keep)` helper; compute missile assignments once per tick. | S–M | low | Part of the ≈25 KB/frame of simulation garbage (docs/36 §7.7). |
| PF2 | Perf | QA statistics are built every second in production. | `scene.ts:2296-2312`: a full scene walk (`graphStats`) plus `JSON.stringify` into `canvas.dataset` every 60 ticks in all builds. | Build them only under DEV, `?perf`, or a test flag. | S | low | Small (estimate). |
| V9 | Loads | Gaps at the asset-load boundaries *(audit)*. | The Umbra kit uses `Promise.all` with an optional file, so a missing optional file loses the whole kit (`terrain-kit.ts:349-352`). `loadDataTextures` returns null silently (`:555`). The hero kit cache keeps a rejected promise (`hero-assembly.ts:29`), unlike `hero-craft.ts:34`. `foamShape` geometries are never disposed (`terrain-view.ts:661,670`). `dispose()` misses the ice environment (`scene.ts:2336`). | Use `allSettled` for the optional file; log once on a missing texture; evict failed cache entries; dispose foam shapes; keep the environments in one `Map`. | S | low | Robustness and hygiene. |
| V8 | Types | Casts that can fail at runtime. | `rig.parts.get(enemy.bossPart)!` throws for `'prow'` in `bastion-view.ts:418`, `warden-view.ts:315`, `ark-view.ts:382` (veil guards it). Function-typed `userData` side channels (`terrain-view.ts:583,606`, `terrain-kit.ts:1460,1466,1680`, `scene.ts:676`). | Guard like veil does. Pass typed `setPlanet` and `wallMaterial` through `TerrainViewOptions`. | S | low | Renames can no longer silently break behaviour. |
| TY1 | Types | `shared` depends on `ui`, and the renderer port is loosely typed. | `contracts.ts:252` uses `import('../ui/perf-log').PerfSample`; `lookOf?(): unknown` and `tuneLook?(look: unknown)` at `:254-255`. | Move `PerfSample` and `PlanetLook` into `shared/`. Split `contracts.ts` into `run-state.ts` (simulation) and `app-ports.ts` (renderer and UI interfaces with DOM types). | S | low | Clean layering; a typed playground. |
| TY2 | Types | 51 `window as …` casts to reach the debug hooks. | `tests/browser` (audio.spec 10, ship-perks 7, combat-light 6, asset-readiness 6, …), plus fixtures and tools. | Move the hooks out of `main.ts:323-360` into `src/dev-hooks.ts`, exporting a `DevHooks` type and declaring it on `Window`. | S | low | Typed specs and a smaller `main.ts`. |
| TS1 | Tests | Test helpers are duplicated. | `advance()` in 4 simulation tests (`game.test.ts:30`, `bastion.test.ts:19`, `ark.test.ts:20`, `ship-perks.test.ts:18`). `snapshot(page)` in 5 specs. A `frame()` loop in 11 fixture pages. A fake storage 4× (`mission-harness.ts:81`, `missions.test.ts:9`, `flight-log.test.ts:5`, `profile.test.ts:7`). A GLB `asset()` loader 3×, and the report `env` lookup 3×. | Add `tests/support/{run,storage,assets,env}.ts`, `tests/browser/game-page.ts` and `tests/fixtures/harness.ts`. | M | low | About 150 lines; one place to fix flakiness. |
| TS2 | Tests | Some tests mirror data. | `missions.test.ts:30-35` checks the sum of all mission credits (`4015`) and parts (`32`); `profile.test.ts:102` checks the literal `RANK_PRICES`. | Assert invariants (unique ids, positive rewards, budgets) instead of totals. | S | low | Balance edits stop breaking unrelated tests. |
| DOC1 | Docs | The technical design contradicts the code. | `docs/05:40-44` says world edges ±18, player radius 0.25, 4 units/s scroll, an orthographic camera, and that "source folders are a plan". The code has ±12, 0.42 and 5 (`VIEW`, `contracts.ts:235`) and `DEFAULT_CAMERA = 'perspective'` (`scene.ts:141`). `docs/23:121` says the simulation never imports `world`, but `sim/ground.ts:5`, `sim/sites.ts:9` and `sim/events.ts:4` do. | Rewrite those paragraphs to cite `VIEW` rather than copy its numbers. | S | low | Agents stop reading stale numbers. |
| V11 | Structure | Oversized view factories *(audit)*. | `createTerrainView` is 947 lines (`terrain-view.ts:207`). `createTerrainMaterials` is 616 lines (`terrain-kit.ts:942`), with 290 lines of inline GLSL and about 15 per-planet ternary chains at `:1409-1446`. `createFx` is 475 lines, `createSiteView` 357. | Split as in §1.2. Turn the terrain look into a `Record<PlanetId, GroundLook>`, as `WALL_LOOK` (`:867`) already is. | L | med | Reviewable units. |
| U1 | Structure | `createUi` is 720 lines. | `ui/game-ui.ts:40-759` holds the HUD, pause, results receipt, campaign page, hangar refresh and statistics. | Split into `ui/hud.ts`, `results-panel.ts`, `pause-panel.ts`, `campaign-page.ts`, `statistics.ts` and `panels.ts` (`find`, `text`, `showPanel`). Move `refreshHangar` (`:260-318`) into `hangar.ts`. | M | low | Smaller units. The UI frame cost is already small (0.10 ms, docs/36). |
| E1 | Structure | The encounter decks mix data and resolver. | `content/encounter-deck.ts` is 1,002 lines (38 kB in the bundle): authored decks at `:170-760`, resolver at `:807-967`. | Split into `content/decks/<world>.ts` and `content/deck-resolver.ts`. | M | low | Reviewable content diffs. |
| S3 | Naming | `sim/bastion.ts` is really the generic boss system. | It serves all 7 bosses (`startBoss`, `updateBoss`) and keeps legacy aliases: `startBastion :125`, `resolveBastionPhase :212`, `updateBastion :377` (unused). It also holds `showsHints` (`:29`). | Rename it to `sim/boss.ts`, drop the aliases (two are used by tests), and move `showsHints` to `game.ts`. | S | low | Easier to find. |
| X1 | Consistency | No formatter or linter; very dense lines. | 867 lines over 160 characters; mixed styles (`scene.ts:1513`: `if(disposed)return;quality=next;…`). | Add lint rules for new code only (a max-len warning, `no-unused-vars`). Do not mass-reformat while sessions edit in parallel. | S | low | Readable diffs from now on. |
| X3 | Reuse | Storage access is wrapped ad hoc. | A try/catch around `localStorage` at `main.ts:159`, `game-ui.ts:44`, `audio/engine.ts:16,72`, `input/tilt.ts:38,42`, `playground/main.ts:88-89`, plus `flight-log.ts` and `campaign/profile.ts`. | Add `shared/storage.ts` with `safeStorage()`, `readJson(key, sanitize)` and `writeJson`. | S | low | One policy for private-mode storage. |
| X2 | Reuse | Six tools copy the Chromium setup. | `chromium.launch({ args: ['--use-angle=swiftshader', …] })` appears in 6 of 7 `tools/*.mjs`. | Add `tools/browser.mjs` with `openGame({ port, viewport, quality, seed })`. | S | low | Small. |

## 1. Structure and modularity

### 1.1 `src/render/scene.ts` (2,342 lines; `createRenderer` 1,826, `render()` 784)

Each module below is a factory that takes `scene`, `materials` and whatever it reads.

| Module | Takes from `scene.ts` | Shape |
| --- | --- | --- |
| `render/qa-stats.ts` | `graphStats`, `renderStats`, `perfSample`, late-shader log (`:2276-2312`) | Gated behind DEV or a flag (PF2). |
| `render/warm-up.ts` | `uploadPending`, the warm-up block (`:1620-1660`), `separateInstancedCasters`, `casterDepthOf` | Includes the PF1 fix. |
| `render/world-look.ts` | `PlanetLook`, `LOOKS` (`:257-331`), `SILHOUETTE_GROUND`, `applyLight`/`applyLook` (`:616-679`), the environment targets (`:601`) | `{ apply(planet), tune, lookOf, dispose }` |
| `render/asset-registry.ts` | Kit, infra, shared, texture, hero and loot loads (`:695-724`); `ensure*` (`:1003-1172`); `preload`/`planetReady` (`:1175-1195`) | `lazyAsset()` (R3) plus `WORLD_RENDER[planet].assets`. |
| `render/telegraph-lanes.ts` | The lanes, `strip`, `beamPreview`, `beamLive`, `muzzle`, `aimRay`, `shotColumn`, lines (`:1096-1130`, `:1718-1790`) | Allocated once; `begin()`/`end()`. |
| `render/projectiles-view.ts` | Shot batches, rail trails, battery launches, reflected arcs (`:2012-2105`) | |
| `render/ground-dressing.ts` | Deploy rise, plinths, pontoons, wrecks, emplacements (`:920-975`, `:1942-2004`) | `update(state, groundNow, view, world)` |
| `render/specials-view.ts` | Shockwave, Gravity Well and its lens, Siege Lance | |
| `render/enemy-batches.ts` | Stand-ins, Khepri, Vesper and faction batches (`:840-1075`); per-enemy craft choice (`:1825-1840`); flush (`:2005-2011`) | `craftFor(planet, enemy)` → `{ batch, scale, engines, plume }` |
| `render/boss-seating.ts` | Boss routing and seats (`:1561-1611`), `rayPlacement`, `bastionPlacement`, `groundPlacement` | `BOSS_VIEWS[id].seat()` (R2) replaces the six booleans. |

### 1.2 Other oversized units

- **`createTerrainView`** *(audit)*. Split into:
  - `terrain-casters.ts` (`:129-173,318-414`)
  - `terrain-section-build.ts` (`prepare`, `buildGround`/`Water`/`Roads`, `disposeView`: `:416-573,718-740`)
  - `terrain-haulers.ts` (`:264-306` and the hauler half of `animate`)
  - `terrain-floes.ts` (`:620-696` and the floe half of `animate`)
  - `terrain-kit-sources.ts` (`ensurePlanet`, plus one `swapSource` replacing the triplicated `setKit`/`setInfra`/`setShared` at `:968-999` and seven identical `.then` adopters at `:591-613`)
  - `terrain-preview.ts` (the `?planet=` code)
- **`createTerrainMaterials`** *(audit)*. Split into:
  - `terrain-ground-glsl.ts` (`:997-1284`)
  - `createGroundMaterial`, `createInfraMaterial`, `createKitMaterials`
  - `terrain-look.ts` with a `Record<PlanetId, GroundLook>` replacing `:1409-1446` and `setLook` (`:1533-1548`)
- **`createFx`** *(audit)*. Split into `fx-layers.ts` (`:33-166,500-533`), `fx-recipes.ts` (`:200-338`, behind an `Emitter` interface) and `fx-site-blast.ts` (`:86-131,340-451`).
- **`createSiteView`** *(audit)*. Split into `site-templates.ts`, `site-ruin.ts`, `site-ground.ts`, and a pure, unit-testable `site-tracking.ts` (`:345-374,430-473`).
- **`createUi`** (U1) and **`encounter-deck.ts`** (E1).
- **`src/sim/game.ts`** (969 lines) is well factored by function. When it next grows, split it by concern:
  - `sim/director.ts` (`:169-315`)
  - `sim/combat.ts` (`acquireTarget` … `damageEnemy`, `:483-698`)
  - `sim/specials.ts` (`:700-855`)
  - `sim/pickups.ts` (`:856-960`)
- **`src/main.ts`** (370 lines) mixes the frame loop, the afterglow, the launch flow, the orientation pause and the debug hooks. Move the hooks (TY2) and the afterglow (`:36-95`) out.
- **`src/shared/contracts.ts`** (292 lines, imported by 72 modules) mixes simulation state, constants and app ports with DOM types (TY1).

### 1.3 Layering

There are no edges from `sim`, `world`, `content`, `campaign` or `shared` into `render`, `ui`, Three.js or the DOM. Edges to fix:
- `shared → ui`, type only (TY1).
- `input → sim` and `render → sim`, for data tables (S2).
- The runtime cycles in world generation (W2).

`sim → world` (ground seating through `world/run-route`) is by design now; the docs say otherwise (DOC1).

Two re-export shims to delete:
- `render/terrain-route.ts`, a one-line re-export used by 3 tests and `scene.ts:22`.
- `export { liveInstances }` in `scene.ts:4`.

## 2. Duplication and reuse

### Boss view kit (V1, V2) *(audit)*

The content side already has one boss shape, and `veil-view.ts` already drives four bosses from one `CarrierStyle` (`:62-116`).

Folding Bastion, Warden and Ark into `CarrierStyle` would turn the style into a pile of flags: Bastion has treads and a collapse, Warden a thruster descent, the Ark a sea ride with wakes and doors. Share the mechanics and the data instead, in `render/boss-view-kit.ts`:
- `createBossFx(scene, caps, palette)`
- `createShockRing(scene, color, inner)`
- `createBossHud(root, scene, sockets, ringSize, targetHeight, markerCap)` for target rings, corner brackets and the aim line
- `weakPointTracker()` for death, hit flare, kick and smoke timing
- `bossFootprint(state, placement, rect)`
- `onceAt(prev, now, at)` for the destruction timelines (`bastion 386-409`, `warden 291-306`, `veil 419-433`, `ark 355-373`)
- `bindBossParts(model, prefix, names, socket)` for the node/owner/wreck binding repeated at `bastion 157-191`, `warden 56-90`, `veil 143-188`, `ark 115-157`

Then a small `BossStyle` record holds each boss's sockets, ring sizes, fx palette and footprint. Each view keeps its rig, its motion and its choreography.

### GLTF helpers (V3) *(audit)*

`render/gltf-nodes.ts` would hold:
- `loadGltfScene(url)` and `loadGltfCached(url)` (which evicts on failure)
- `disposeScene(root, opts)`
- `forEachMeshInNode`
- `bakeNode(node, perPart, opts)` (transform, normals, merge, bounds)
- `positionProxy`
- `constantAttribute(count, values)` (about 10 hand-written copies today)
- `loadNodes(url, names, extract)`

### Registry (R2, R3)

`WORLD_RENDER` collects references to the per-planet style data that is now scattered:
- `LOOKS` (`scene.ts:257`)
- `PLANET_GLOW` (`:1292`)
- `SILHOUETTE_GROUND` (`:341`)
- hostile hues (`:1313`)
- `WORLD_PAINT` (`world-paint.ts:25`)
- the fx palettes in `fx-particles.ts`
- the terrain look branches in `terrain-kit.ts`

The entry can point at these tables first, and the data can move into it afterwards. `BOSS_VIEWS` replaces the `isArk … isHeliophage` booleans.

### World scatter (W1)

Umbra and Corona share `supportedBase` and the landmark loop almost line for line: `terrain-umbra.ts:154-180` and `terrain-corona.ts:176-202` differ only in kit names, sizes and comments.

### Hashes

- The same `sin`-fract `hash(n)` is defined in `fx-particles.ts:83`, `fx-jump.ts:67` and `ark-view.ts:221`, and exported from `bastion-view.ts:277`.
- Inline integer hashes appear in `models.ts:17`, `mire-water.ts:127`, `corona-haze.ts:24`, `corona-arcs.ts:74`, `ambient-motes.ts:83`, `surface-finish.ts:9` and `planet-preview.ts:55`.
- Two *different* functions are both called `textHash` (`terrain-districts.ts:379`, `facility-layouts.ts:324`).

Recommendation: put the render-side hashes in `render/hash.ts`. Keep the world hashes in place (they are part of the bit-exact contract), but rename the colliding `textHash`es.

### Other clusters *(audit)*

- `facility-view` has two near-copy `prepare` functions (`:134-174`, `:360-386`).
- Foundation batches are set up twice (`site-view 195-200`, `facility-view 119-123`).
- `water.ts` and `mire-water.ts` share `swellGradient` (`36-43` vs `60-67`) and the foam block.
- The boss HUD colours (`0xffb77c`, `0xffecd0`, …) appear in all four views.

### Balance formula

`minGap` and `sealStrip` repeat the same expression `2 * (VIEW.playerRadius + 0.15) + 0.6` (`balance.ts:46,49`). Define it once.

### Tests, tools and storage

See TS1, X2 and X3.

## 3. Dead or stale code

- **Unused code (D1, V7).** The 17 sites found by the compiler include `scene.ts:46` (`VEIL`), `terrain.ts:2,4,9`, `sim/bastion.ts:8,11` and the unused `cameraX` parameter of `terrain-view.ts:1006`.
- **Test-only exports.** There are about 120, mostly deliberate seams. `scene.ts` exports 10 helpers that only tests use; they move with §1.1.
- **Dead state and switches.** D2 and D3.
- **Stale warm-up name list.** See PF1.
- **Stale or misplaced comments:**
  - `cradle.ts:7` names `the-cradle-v1.glb`; the game loads `-v2-approved` (`boss-assets.ts:15`).
  - `warden-view.ts:12,44,362` say `warden.glb`; the game loads `warden-v5-remodel.glb`.
  - `terrain-kit.ts:562-566` (orphaned docblock) and `:345` (the Umbra doc sits above `loadCoronaKit`) *(audit)*.
  - `world-paint.ts:34` (the Umbra comment sits on the Corona entry) *(audit)*.
  - `terrain-view.ts:16` says "before its mission ships" *(audit)*.
- **Tests that guard archived models.** `cinematic-assets.test.ts:170-215` checks the rigs of `the-veil.glb`, `bastion-9.glb`, `helion-ark.glb`, `warden.glb` and `hero-scrapper.glb`. The last one is still named in a `model` field that nothing reads (`content/equipment.ts:104-107`). Retire or move these tests with P1; the shipped models have their own checks (`:41`, `:108`, `:157`).
- **Stale root documents.** `HANDOFF.md` (15 October), `DESIGN-REVIEW.md` (v0.3, 13 October) and the header of `COORDINATION.md` ("Last pushed `f31267e` … Everything listed above is uncommitted") describe mid-October. Move them to `docs/archive/`.

## 4. Performance

This builds on docs/36.

**Measured gains:** T1, P1, B1 (bundle size measured, phone timing not).

**Frame cost (estimated, not measured on a phone):** PF1, PF2, PF3, V6, PF4.
- docs/36 measured `render()` at about 15 KB and the simulation at about 25 KB of the 390–900 KB allocated per frame; the rest is terrain generation.
- So these are hygiene, with one exception: boss fights and site views (V6) add bursts of allocation on top of the measured averages.
- The terrain worker (docs/36 §7.1) remains the big lever.

**docs/36 §7 is partly out of date:**
- Item 6 says `craterAt` allocates a new object per crater cell, but it has been memoised since 20 October (`terrain-luna.ts:103-117`). The per-sample allocation is `lunaCraters`'s `out` object (`:121`).
- `noise` was inlined on 6 November (`terrain-layout.ts:51-71`).
- Refresh §7 before choosing the next pass.

**Bundle:** no world-specific render code is split out.
- After B1, the boss and world view modules (`veil-view` 17 kB, `bastion-view` 14 kB, `ark-view` 13 kB, `warden-view`, `water`, `mire-water`, `corona-*`) could load with their world through `lazyAsset`. That is about 90 kB minified, 25–30 kB gzip (estimate).
- World generation cannot be split this way, because the simulation seats targets on it synchronously.

**Assets:**
- P1 (archived GLBs).
- The 404s in V4.
- The playground page ships with the game on purpose (it stores looks in the browser on the deployed site); leave it.

## 5. Types and safety

- **Clean:** no `any` in `src`, no `@ts-ignore`, and only 12 `as unknown as`.
- **Render casts:** 87 `as THREE.*` and 14 `userData` casts. The function-valued `userData` side channels (V8) are the risky ones: renaming either side still compiles, and the `?.` call then silently does nothing.
- **Non-null assertions:** 78 `!` in `src/render` (about 40 on `Map.get`), plus 8 `.filter(Boolean) as X[]` *(audit)*. Replace the ones on closed key sets with total `Record`s, and guard the rest (V8).
- **`noUncheckedIndexedAccess`:** it would flag 1,987 sites (286 in `terrain-network.ts`), so don't enable it. Instead, make lookups keyed by GLB node names total (`Record<KitKind, …>`).
- **Load boundaries are mostly sound:**
  - Every GLB load in `scene.ts` has a `catch` that falls back to a stand-in.
  - Saves never overwrite an unreadable original (`profile.test.ts:86,215,274,318,409`).
  - The 34 silent catches are storage, audio-context or pointer-capture calls, each with a comment.
  - The gaps are in V9.

## 6. Tests

Slowest tests (measured; each file runs its tests serially in one worker):

| s | Test |
| --- | --- |
| 45.8 | `sim/difficulty.test.ts`: Relaxed, Standard and Veteran apply clearly different pressure |
| 39.2 | `world/terrain-route.test.ts`: streams through every planet jump at peak hyperdrive speed |
| 33.0 | `sim/missions-feasibility-outer.test.ts`: brood-strike, all twelve within 14 attempts |
| 24.0 | `world/terrain-vesper.test.ts`: healthy share of outposts in view |
| 21.5 | `world/terrain-route.test.ts`: every campaign mission byte-identical to its single world |
| 20.6 | `world/terrain-stream.test.ts`: long flight from prefetched sections |
| 17.5 | `sim/missions-feasibility-outer.test.ts`: dying-star |
| 15.6 | `world/terrain.test.ts`: bounded cache during long endless runs and seeks |
| 15.4 | `world/terrain-route.test.ts`: clean hard seam at a planet switch |
| 14.1 | `world/terrain-umbra.test.ts`: prefetches walls without synchronous fallbacks |

**Slowest files** (sum of test durations): fairness 128.8 s, terrain-route 78.0, missions-feasibility-outer 69.2, terrain 66.0, difficulty 62.0, terrain-vesper 49.1, endless 48.7, deck-balance 47.8, terrain-stream 40.7, veil 33.3.

**Throughput (T1):**
- Split files; `concurrent` does not help CPU-bound tests within one worker.
- Seeded flights that are flown several times in one file could share a module-level cache (for example the three `terrain-route` streams), which keeps them deterministic.

**Report tests are already opt-in:** `deck-report`, `eclipse-report`, `weapon-tier-report`, `missions-report` and `site-economy` are skipped without an env flag.

**Coverage of the high-risk rules is good:**

| Rule | Tests |
| --- | --- |
| Shields before lives; no refill | `game.test.ts:111,132,142,251` |
| Saves never overwritten; backed-up migration | `profile.test.ts:86,215,228,274,318,385,409`; `missions.test.ts:73` |
| Observation never changes a run (whole-state equality) | `run-events.test.ts:24-36` |
| Endless independent of campaign | `loadout.test.ts:16`; `game.test.ts:340` |
| The special button never steers | `controls.test.ts:30` |
| Rotate notice | `viewport.spec.ts` |

Possible gap (uncertain): no browser test pauses on rotation during the launch warp; `main.ts:146` handles that case.

**Brittleness:**
- TS2.
- Pinned-seed feasibility thresholds ("within 14 attempts") are deliberate calibration checks. Keep them, but print the measured value in the failure message.
- 13 fixed `waitForTimeout` sleeps (combat-light 6, asset-readiness 3, umbra-terrain 3, flight 1) are the likely flake sources under load. Replace them with `expect.poll`, as `launch.ts:7` does.
- There are no snapshot tests.

## 7. Consistency and docs

- **Layout:** mostly by layer. The exceptions:
  - data lives in `sim/` (S2);
  - the generic boss system is named after one boss (S3);
  - `bastion-view.ts` hosts shared particle code (V2);
  - `veil-view.ts` serves four bosses. Rename it `carrier-view.ts` when it is next touched.
- **Imports:** two specifiers for three.js addons (`three/examples/jsm` vs `three/addons`, V3).
- **Docs:** DOC1 and docs/36 §7 have drifted. `docs/spec/` is clearly marked historical, which is fine.
- **Config:** no lint or formatter (X1); the two cheap unused-code checks are off (D1).

## Suggested order of work

Each step can be done and verified on its own. Every step keeps behaviour identical except the colour fix in V5.

Verification for each step:
- typecheck and `npm test`;
- for render steps, also the browser gate and the perf bench's frozen stills (docs/36 §6), compared pixel for pixel.

Render steps touch `scene.ts` or other files that COORDINATION.md assigns to an owner, so announce them in its log first.

1. **Defects and hygiene (S, one commit each):** V4, V5, PF1, V9, D1 with the two `tsconfig` flags, D2, V7 (ask about the rollback rigs), the `render/terrain-route.ts` shim, S3, DOC1 and a refresh of docs/36 §7, and archiving the stale root documents.
2. **Throughput (S):** T1, then P1 (repoint the tests and the Blender inputs).
3. **Shared helpers (S):** S1 (the pinned tests prove bit-exactness), `render/hash.ts` and `render/color.ts`, R4, X3, X2, TS1 and TY2.
4. **Layering and constants (S):** S2, W2, TY1, C1 and V8.
5. **Flags (S):** D3 (after the user confirms which switches stay) and PF2.
6. **World generation (M):** W1, one planet per commit, with the terrain tests pinned.
7. **Boss views (M–L):** V2 first, then V3 (`gltf-nodes.ts`), then V1 (`boss-view-kit.ts`), one boss per commit with screenshots of its phases. Fold the V6 fixes into each move.
8. **Renderer registry (M):** R3, then R2, replacing the `applyLook`, `preload` and boss-routing chains.
9. **Renderer split (L, one module per commit),** in the §1.1 order: `qa-stats`, `warm-up`, `world-look`, `telegraph-lanes`, `projectiles-view`, `ground-dressing`, `specials-view`, `enemy-batches`, `boss-seating`. Fold PF3 into each move. Then V11 for the terrain view, terrain materials, fx and site view.
10. **UI and content (M):** U1, then E1.
11. **Bundle (M):** B1, then per-world view chunks through the registry. Measure time to menu on a phone before and after.

### Progress (8 November, evening)

Done, behaviour identical except V5:
- V4, V5, PF1, PF2, V8, V9, R3 (the lazy boss loaders), R4, X2, D1, D2, S1, S2, S3, W2, TY1, TY2, X3, T1, TS1, P1 and DOC1.
- **D1:** the 17 unused locals and parameters plus the dead exports `scatterKit`, `socketReach`, `guardsClear`, `TALL` (facility-kit) are gone. `createCargo` and `createRoadMaterial` are now module-private. The `ReturnType` type aliases stay as named module types.
- **The two `tsconfig` flags stay off.** The user asked for no linters or formatters (8 November). `npx tsc --noEmit -p . --noUnusedLocals --noUnusedParameters` reports 0 today and can be run by hand.

Later the same evening:
- **Done:** the rest of V9; V7 (boss old-version branches, facility v2 with its GLBs archived, the ocean's Nacre branch, the single-kit hero path; the boss stand-ins stay as the load-failure fallback); D3's `?planet=` (now development-only); PF4, PF3 and V6 (agent, `004472f`).
- **Allocations:** outside terrain generation, garbage per frame is 13–19% lower in every bench scenario. For example, dense goes from 134 to 108 KB/frame and nacre-boss from 90 to 73 KB/frame (`PERF_ALLOC=1`). The bench's headline figure moves only 1–10%, because terrain work is about 85% of it.
- **Kept by the user's choice:** the live `?unlock=all` and `?perf` switches.
- **Not bugs:** C1's two glow tables are deliberate. `PLANET_GLOW` colours beams and hunter shields; the world paint colours the craft.

Two findings for later:
- **`render()` runs unoptimised.** A V8 trace (`--trace-opt --trace-deopt`, 400 frames) never marks, compiles or OSRs `scene.ts` `render()` or `main.ts` `frame()`; their small callees are optimised. Every for-of loop and decimal value in `render()` therefore allocates. The renderer split (R1, §1.1) is the likely lever.
- **Boss-fight terrain queries.** In khepri-boss, `bastionPlacement` costs about 458 KB/frame inclusive, through terrain-height queries (about 4.5 KB each). That is the biggest single allocation lever in boss fights. A cached height field around the boss would remove most of it.

Not started, by choice: the structural splits (steps 6–11).
