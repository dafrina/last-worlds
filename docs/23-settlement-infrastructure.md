# Settlement and infrastructure upgrade: audit and design

Status: Phase 1 audit, plus the proposed data and placement design (Phases 2–4) and the plan for the Phase 10 Khepri refinery prototype. Date: 20 October 2026.

This document changes no code. The brief is the user's settlement and infrastructure brief of 20 October 2026. The approved concept sheets are `art/concepts/facility-sheets/{khepri,vesper,luna,nacre}.jpg`. They are references only, never runtime assets (AGENTS invariant 9).

User addendum (20 October, during this audit): *"you may increase the vertical space we have available for the terrain too."* Section 4.2 covers this.

Numbers marked *probe* come from throwaway Vitest probes run against the real generator in Node on this machine. They are not committed tests. Re-measure before relying on them.

---

## 0. Summary

**What exists**

- Each planet has a seeded, cell-based outpost system. Khepri has 8 archetypes, Vesper 5 and Luna 3; Nacre has none, and its ruins come from scatter. A seeded road and pipeline network joins the outposts with slope-aware A*.
- All of it is a pure function of seed and world coordinates, already independent of chunk order. It is streamed in 36-unit sections with a 3 ms per-frame resumable prefetch.
- There are four infrastructure GLBs with 48 nodes, plus 6 battery facility compounds that are placed at render time around live ground batteries.
- No GLB carries connection sockets. Pipe joints are implicit in a 2-unit grid contract, and road gates are computed from pad edges.

**What is missing for the brief**

- Settlement size classes.
- Any multi-pad (terraced) composition.
- Socket metadata.
- Internal connections inside a settlement: pipes between tanks and halls, internal roads.
- A dominant landmark piece on any planet.
- Foundations and retaining pieces.
- Road ends, gates, bridges and pipe manifolds.
- A Nacre settlement layer.
- A Luna-specific (grey and ivory) kit.

**Core design decisions**

1. A **district** is a planet-level, seed-pure plan built on top of the existing `settlement(seed, cell, side)`. It is made of several terraced **lots**, and each lot is an ordinary `Settlement` pad. One lot is the network **hub**. The district claims its settlement cells, which become the quiet buffer. No world or route plumbing is needed, so memo keys and chunk independence stay valid.
2. Placement uses global slots along *s*, one window per about 720 units. On Khepri the first window is s 440–606: Rolling Thunder's relief stretch before the Bastion arena, and endless sector 2. Asymmetric margins keep districts away from arenas and planet jumps.
3. Layouts come from a few authored typed **layout graphs** (lots, role slots and socket links) with seeded variation. There is no node editor. A single typed **module registry** replaces the 7+ duplicated size tables.
4. The plan is computed by resumable work warmed during prefetch, never inside `terrainRow`. Sections only instantiate the pieces whose anchor lies inside them.
5. Rollback is a data switch: `PlanetProfile.districts` is null or absent, which is byte-identical to today, and a test proves it against the recorded legacy fingerprints.
6. Vertical budget: district modules get their own cap, `structureMax`, set to 3.0 on Khepri (Vesper and Nacre already use 3.0). Natural scatter, ordinary outposts and pipelines keep 2.2, so nothing outside a district changes.

**Prototype (Phase 10a)**

- A Khepri refinery district of about 12 × 48 units (about 1.8 screens) on one flank.
- It uses only existing nodes. The landmark is a stand-in cluster; the one truly needed new piece, a tall processing tower, is flagged and not authored.
- Validated by fixed-camera fixture captures over several seeds and edge cases, determinism, seam and budget tests, and stream and frame-time measurements.

---

## 1. Architecture map

### 1.1 Data flow

```
seed ─┬─ PlanetProfile (terrain-planet.ts:48-71): landform, color, settlement(), scatter(), floes(), sceneryMax, networks
      │
      ├─ settlement(seed, cell, side)  → Settlement | null   (per planet; memoized, pure)
      │      Khepri terrain-settlements.ts:160-209 · Vesper terrain-vesper.ts:179-300 · Luna terrain-luna.ts:123-193 · Nacre: none (:331)
      ├─ settlementsNear(seed, s0, s1, arena, planet)  (terrain-settlements.ts:223-233)
      │      ├─ terrainRow(): pads that reach a row (terrain-ground.ts:18-27) → rowPoint(): flatten to pad level (:31-47)
      │      ├─ edgesNear() → edgesOf(): chain / exit / cross edges (terrain-network.ts:101-142)
      │      │      ├─ roadPathSteps(): A* on 1-unit grid, slope ≤ 0.45, Chaikin, memo (terrain-network.ts:286-322)
      │      │      └─ pipeRunSteps(): A* on 2-unit grid, runs/risers/trestles, memo (terrain-network.ts:709-739)
      │      └─ settlementPieces(): modules → props / industry / rubble (terrain.ts:129-152)
      │
      └─ sectionSteps(seed, index, route|world)  (terrain.ts:164-401): heightfield + aprons → mesh → network → settlements
             → occupancy → road ribbons → scatter (skips pads and occupied cells) → floes/water → TerrainSection
                    │
createTerrainStream (terrain.ts:469-511): window = sections current−1…current+1, prefetch current+2 in resumable steps
                    │
terrain-view.ts: prepare() per section (:351-397) → compact() into one InstancedMesh per node (:588-631),
                 caster strips (High), haulers on roads (animate), Low skips cosmetic (:602), facility clearings (:609)

Render-only, from live combat state (never generation):
scene.ts groundNow (:954-967) → facility-view.ts compounds (≤ 12) → terrain.setFacilityClearings (:1064-1065)
                              → legacy battery emplacements of shared-kit pieces (:1067-1094) → wrecks (:1098-1105)
```

### 1.2 Files and responsibilities

| File | Responsibility | Key facts |
| --- | --- | --- |
| `src/shared/contracts.ts:110` | `VIEW` | width 12, worldWidth 30, sectionLength 36, flightHeight 3.8, minS −6.25, maxS 19.8. Camera x is limited to ±9 (`src/sim/game.ts:126`). |
| `src/world/terrain-layout.ts` | Khepri landform, moods, routes, `hash` | `SCENERY_MAX_HEIGHT` 2.2 (:11), terrain −8…2 (:13-16), side routes at ±9.5 (:21), `routeCenter`/`routeCalm` (:131-144), stateless `hash(seed^salt, x, y)` (:32-37). |
| `src/world/terrain-settlements.ts` | Khepri outposts | Archetype weights (:15), pad extents (:17-19), `MODULE_HEIGHT` (:21-30), `SETTLEMENT_CELL` 30 (:32), `compose()` per archetype (:56-148), `districtLevel` outpost clustering noise (:150-156), `settlement()` (:160-209), pads (:211-217), `settlementsNear` (:223-233). |
| `src/world/terrain-ground.ts` | Row cache and point | Pads flatten ground (`padInfluence`, 2.4-unit falloff); the arena is applied last. |
| `src/world/terrain-network.ts` | Shared-kit contract, network, roads, pipes | `SHARED_BOUNDS` (:28-37), `gate()` (:94-98), `edgesOf` (:101-125), `moduleReach` (:184), `gridSteps` with pad cost and crowded cells (:186-227), road memo key `planet:seed:edge` (:288), ribbons (:330-356), pipe memo key (:712), `sectionNetworkSteps` (:744-759). |
| `src/world/terrain.ts` | Section generation and stream | `TerrainProp` (:54-60), `TerrainSection` (:63-92), `settlementPieces` (:129-152), seam filter `SEAM_CLEARANCE` 3 (:404), stream (:469-511), `TERRAIN_VERSION` 10 (:37). |
| `src/world/terrain-planet.ts` | Profiles, worlds, routes | `KHEPRI` (:73-90), `worldOf` interning and `bare` (no arena) (:107-123), `RouteSchedule` (:133-137), `routeOf` (:176-223). |
| `src/world/terrain-scatter.ts` | Khepri kit dressing | Skips `industrial > 0.2` and blocked cells (:168); trims to cap (:152-156). |
| `src/world/terrain-vesper.ts`, `-luna.ts`, `-nacre.ts` | Other planets | Vesper cap 3.0 (:22), harbours face water. Luna: no networks (:252), reuses the Khepri kit. Nacre cap 3.0, ruin-site lattice in scatter (:107-220), `settlement: () => null` (:331). |
| `src/world/terrain-arena.ts` | Mission and boss arenas | `ARENA_RAMP` 20 (:67), `nearArena` (:77-79). |
| `src/world/terrain-work.ts` | Resumable work | Generators; `finish()` gives identical output whether run synchronously or incrementally. |
| `src/render/terrain-route.ts:10-13` | `runRoute(config)` | Every run, campaign included, streams as a route over `endlessSchedule(config)` (`src/content/endless.ts:262-275`). |
| `src/render/terrain-view.ts` | Section views | `PRELOAD_AHEAD` 400 (:48), `CASTER_NODES` (:119-123), material routing by name prefix (:175), `prepare` (:351-397), `ensurePlanet` (:511), `compact` (:588-631), `setFacilityClearings` (:710), `setQuality` (:739). |
| `src/render/terrain-kit.ts` | Loaders and stand-ins | `INFRA_NODES` sizes (:312-323), `VESPER_INFRA_NODES` (:325-330), `createFallbackInfra` (:374), loaders (:403-409, :886), `createFallbackShared` (:891). |
| `src/render/facility-view.ts` | Battery compounds | 6 nodes (:5), capacity 12 (:9), bounds (:11-14), placement (:43-65), cosmetic hash of id and seed (:47), roof ≤ flightHeight − 0.45 and sink ≤ 0.35 (:60-61). |
| `src/render/scene.ts` | Integration | Prefetch budget 3 ms (:32, :876), infra/shared loads (:436-445), ray seating (:119-133), shadow slab −8.2…3.7 (:161), hidden-target silhouette (:472-473), markers drawn without a depth test (:662-667), emplacements (:545-557, :1067-1094). |

### 1.3 Streaming, routes and seams

- **Sections** are `VIEW.sectionLength` = 36 units long and 30 wide, on a 0.25 grid. The window is current−1…current+1 (`terrain.ts:479`). `prefetch` runs section current+2 within the frame budget (`:494-503`), and `terrain-view.prefetch` then builds its view off-scene. A section needed before it is ready is generated synchronously and counted as a fallback.
- **Visible range:** at distance *d* the view shows *s* ∈ [d − 6.25, d + 19.8] at the flight plane. Ground at −4 shows about 5.6 further. The window covers [d − 36, d + 36] at worst, so a module straddling a boundary may extend up to about 10 units into the next section without popping (rule in §4.6: half-depth ≤ 6).
- **Routes:** each distance resolves its own world (planet plus nearest arena). A planet switch splits the section; pieces keep `SEAM_CLEARANCE` = 3 from the seam (`terrain.ts:171-177, :357-361`).
- **Endless, as measured (*probe*):** Luna 0–406 (arena 303–334), Khepri 406–1635 (arena 1528–1563), Vesper 1635–3133 (arena 3017–3061), then Nacre. **Rolling Thunder:** a single Khepri arena at 666–701, with the scroll stopping at 675.

### 1.4 Global vs per-section

| Global (seed plus world coordinates, memoized and bounded) | Per section (instantiation only) |
| --- | --- |
| Landform and moods; settlement candidates (`memo` ≤ 2048); network edges; road paths (memo ≤ 256); pipe runs (memo ≤ 256); Nacre ruin-site lattice (sampled one row beyond the section) | Mesh and colours; module ownership by anchor *s* (`terrain.ts:132`); network pieces by anchor *s* (`terrain-network.ts:748`); road ribbons for segments that start inside (`:340`); scatter cells; scatter occupancy set (`terrain.ts:352-364`) |

**Settlement layout is already independent of chunk order.** `terrain.test.ts:23` and `terrain-network.test.ts:34` prove it by generating sections in shuffled orders.

One caveat for any extension: road and pipe memo keys are only `planet:seed:edge.id` (`terrain-network.ts:288, :712`). Any new layer that changes which settlements exist must therefore be a pure function of (seed, planet), or the keys must grow.

### 1.5 Seeds and RNG

- Terrain uses only the stateless `hash(seed ^ salt, a, b)` with fixed salts per feature: settlements 0x5e77/0x5e78, clustering 0xd157, edges 0x7e7, pipe size 0x919, scatter 0x6c1a, Vesper 0x7e5e/f, Luna 0xa1e7, Nacre ruins 0x7d5f, and so on. There is no `Math.random` in `src/world`.
- `src/sim` and `src/content` never import `src/world`. The only stateful gameplay RNG is `lootRng` (`src/sim/game.ts:44`), which terrain never touches.
- Render cosmetics use their own hashes:
  - facility size: `imul(id) ^ seed` (`facility-view.ts:47`);
  - emplacement layouts: a `sin` hash of the enemy id (`scene.ts:1071`);
  - haulers: `tint(key)` plus simulation time.
- **Confirmed:** cosmetic randomness never touches gameplay RNG. Proposed new salts for districts: **0xd1a0–0xd1af**, which are unused.

### 1.6 Ground targets, batteries and facilities

- Ground batteries are simulation entities on the logical flight plane. View-anchored formations spawn around the camera (`src/sim/airspace.ts:22`), so **a battery can appear anywhere, including over a district**.
- Rendering seats each battery on the terrain by a camera ray (`scene.ts:119-133`). Generation never moves targets.
- `facility-view` wraps up to 12 suitable batteries in a Blender compound (small 6.6 × 5.9, large 8.7 × 8.5). Each compound's rectangle becomes a **render-only clearing** that hides any kit, infra or shared instance whose box centre falls inside it (`terrain-view.ts:609`), including settlement modules. Batteries that do not get a compound receive the legacy shared-kit emplacement (`scene.ts:1067-1094`).
- Neither placement looks at settlements. A compound can therefore land on an outpost and hide part of it. For districts this must become an explicit reservation (§4.8).

### 1.7 Clearance contracts

| Rule | Where |
| --- | --- |
| Scenery top ≤ `planet.sceneryMax`: Khepri and Luna 2.2, Vesper and Nacre 3.0, with the flight plane at 3.8. Settlement modules over the cap are **silently dropped**. | `terrain.ts:137, :141, :146`; `terrain-scatter.ts:152` |
| Pad level ≤ cap − tallest module − 0.05 | `terrain-settlements.ts:192` (Vesper :276, Luna :179) |
| Pipelines ≤ Khepri's 2.2 on **every** planet; uses `SCENERY_MAX_HEIGHT`, not the profile. | `terrain-network.ts:44, :389, :393, :751` |
| Battery compounds: roof ≤ flightHeight − 0.45 (3.35) — the one existing exception to the planet cap | `facility-view.ts:60` |
| Combat lanes: the centre route is calmer, pipes pay +1.5 within 3 of it, and outposts sit at 0.38–0.85 of the half width (\|x\| ≥ 5.7) | `terrain-network.ts:200`; `terrain-settlements.ts:174` |
| Markers and telegraphs never depth-test; hidden ground targets draw a see-through silhouette | `scene.ts:662-667, :472-473` |
| Shadow casters live in the y slab −8.2…3.7 | `scene.ts:161` |

### 1.8 Tests that guard this today

| Test | Guards |
| --- | --- |
| `terrain.test.ts:23, :35, :50, :78` | Order-independent sections, seams, crack-free mesh, height range and pieces inside the world |
| `terrain-network.test.ts:8, :23, :34, :51, :74` | Varied outposts, pads at authored heights under the cap, order-independent network with each piece owned once, no cliff climbing |
| `terrain-pipes.test.ts:44, :51, :107` | ≥ 95% of pipeline edges connected, no floating or buried pipes, pipelines kept off modules |
| `terrain-vesper.test.ts:17` | **Khepri fingerprints** (seeds 11, 93, 8831 and an arena), re-recorded 17 October |
| `terrain-budget.test.ts:45, :51` | High ≤ 70 draw calls and ≤ 90k visible terrain triangles; Low only reduces cost |
| `terrain-stream.test.ts:9, :25, :44`; `terrain-route.test.ts:85, :129` | Incremental equals synchronous; no fallbacks at top endless pace and through jumps; seam splits |
| `terrain-arena.test.ts:47`; `endless-clearance.test.ts` | Arenas stay free of outposts, roads, pipes and tall scatter |
| `facility-placement.test.ts:17, :32`; `cinematic-assets.test.ts:164` | Compound roof heights, an empty gun court, crowded and edge fallbacks |
| `models.test.ts:20`; `terrain-kit.test.ts:25` | Industrial asset footprint contracts; a stand-in for every node |

### 1.9 Audit findings

These are not bugs blocking this work. They should be fixed in passing where the registry touches them.

1. **Sizes are duplicated** in `MODULE_HEIGHT`, `INFRA_NODES`, `VESPER_INFRA_NODES`, `SHARED_BOUNDS`/`SHARED_LOCAL_BOX`, `moduleReach`, the occupancy radii (`terrain.ts:363`), `CASTER_NODES` and the facility `SIZE`. This goes against AGENTS's "avoid multiple independent copies of a number". There are also two conventions: `VESPER_INFRA_NODES` heights include the 0.05 skirt, while `MODULE_HEIGHT` does not.
2. `terrain-view.prepare` sizes prop culling boxes from `INFRA_NODES` only. **Vesper infrastructure therefore gets a 1 × 1 × 1 box** (`terrain-view.ts:372`), although the crane is 2.1 tall and the icebreaker 3.3 long. `CULL_MARGIN` 2.2 mostly hides this.
3. Material routing is by name prefix (`terrain-view.ts:175`): `vesper_*` and `wreck_*` draw with the kit material, not the infra material. That may be intended, but it should be made explicit.
4. `infra_track_segment`, a crawler roadway that tiles along z, ships but is never placed.
5. Drill rigs take a random yaw (`terrain-settlements.ts:88`), which conflicts with the brief's "do not randomly rotate every building".
6. A module over the cap disappears silently (finding 1.7). A composition can lose its main piece without any test failing.
7. docs/13 §2 still says "flight plane stays at y = 3" and "boundary cues at x = ±18". The current values are 3.8 and a 30-unit width.
8. The battery compounds on Nacre (`facility_nacre*`) reuse the human compound geometry with Nacre paint. This conflicts with the brief's Phase 6 rule "do not recolor the human industrial kit as Nacre" (open question 5).
9. The name `districtLevel` (outpost clustering noise) collides with the brief's "district". This document calls it **outpost clustering**.

---

## 2. Asset registry

Conventions shared by all assets: glTF, +Y up, 1 unit = 1 game unit, **−Z = forward (+s)**, pivot at the base centre. None of the GLBs contain socket empties; connection points below come from the build contracts and READMEs. Sizes are measured from the GLB accessor bounds in node space with a scratch script (not committed); W is along x and D along z.

### 2.1 Files

| GLB | Builder | Nodes | Size | Materials | Loaded by | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `khepri/khepri-infra.glb` | `tools/blender/khepri_infra.py` (14 Oct) | 16 | 1,041 KiB, 12.0k tris | `khepri_infra` (vertex colour), `khepri_light` (amber) | `scene.ts:437` → `terrain.setInfra` | `createFallbackInfra` |
| `shared/industrial-kit.glb` | `tools/blender/shared_industrial.py` | 15 | 396 KiB | `shared_metal`, `shared_paint`, `shared_light`; COLOR_0 = masks (AO, wear, dust), planet palette at runtime | `scene.ts:442` | `createFallbackShared` |
| `vesper/vesper-infra.glb` | `tools/blender/vesper_infra.py` | 11 | 421 KiB | `vesper_ceramic`, `vesper_glow` | `ensurePlanet('vesper')` (`terrain-view.ts:526`) | `createFallbackVesperInfra` |
| `shared/facility-compounds.glb` | `tools/blender/cinematic_assets.py` `facilities()` (19 Oct, via live MCP) | 6 | 3,705 KiB | `{khepri,vesper,nacre}_facility_{plate,frame,glow}` | `facility-view.ts:22` | none (legacy emplacements) |
| `nacre/nacre-kit.glb` (ruins) | `nacre_kit.py`, re-exported by `cinematic_assets.py` `terrain()` | 6 ruin kinds | 1,446 KiB | `nacre_ruin`, `nacre_glow`, `nacre_rock` | `ensurePlanet('nacre')` | `src/render/nacre-kit.ts` |
| `shared/loot-props.glb` (wrecks) | `tools/blender/loot_props.py` | 3 wreck nodes | 272 KiB | `prop_*` | `scene.ts:266` | none |
| `khepri/khepri-kit.glb` | `khepri_kit.py`, re-exported by `cinematic_assets.py` | natural kit (rocks, columns, crystals) | 650 KiB | `khepri_basalt`, `khepri_mineral` | `scene.ts` | `createFallbackKit` |

### 2.2 Khepri infrastructure (`khepri-infra.glb`)

Every node sits base-centre with a skirt to y −0.05 (the track is flush). Material family: Khepri infra (graphite, ochre and rust, amber lights).

| Node | W × D | Top | Tris | Connection points | Used on | Placed today |
| --- | --- | --- | --- | --- | --- | --- |
| `infra_landing_pad` | 5.40 × 6.20 | 0.29 | 1014 | Pad edges serve as road gates through `gate()` | Khepri, Luna | Landing archetype (yaw in quarter turns) |
| `infra_refinery` | 4.10 × 5.10 | 1.60 | 2534 | None declared; risers and separator are modelled | Khepri | Refinery archetype core |
| `infra_relay` | 0.85 × 1.00 | 1.60 | 656 | — | Khepri, Luna | Landing, comm |
| `infra_cargo_0/1/2` | 1.05 × 1.75 | 0.65 | 878 / 868 / 810 | Cab faces −Z | Khepri (Luna has no roads) | Static in mining, plant and landing; **haulers** on roads (`terrain-view` animate) |
| `infra_track_segment` | 1.35 × 2.00 | 0.05 | 170 | Tiles along z every 2.0 (open ends) | — | **Unused** |
| `infra_drill_rig` | 1.49 × 1.32 | 1.96 | 1164 | — | Khepri | Mining, 1–3 rigs at random yaw |
| `infra_habitat_0` / `_1` | 1.38 × 0.74 / 1.32 × 1.03 | 0.78 | 496 / 348 | — | Khepri, Luna | Mining, landing, pumping, plant, comm, abandoned |
| `infra_comm_dish` | 1.00 × 1.00 | 1.25 | 590 | — | Khepri, Luna | Comm, landing |
| `infra_solar_array` | 2.20 × 0.74 | 0.45 | 412 | Tiles along x every 2.2 | Khepri, Luna | Comm (rows), abandoned |
| `infra_light_mast` | 0.37 × 0.36 | 1.50 | 262 | — | Khepri, Luna | Most archetypes |
| `infra_silo` | 0.94 × 0.94 | 1.75 | 596 | — | Khepri | Mining, landing, abandoned |
| `wreck_0` / `_1` | 2.37 × 1.36 / 2.12 × 1.46 | 0.39 / 0.54 | 615 / 576 | — | Khepri | Wreck archetype on natural ground |

### 2.3 Shared industrial kit (`industrial-kit.glb`)

Base on y 0; pipe centreline at y 0.35 on a 2-unit grid. The material family is planet-neutral: masks plus a per-planet palette.

| Node | W × D | Top | Tris | Connection points | Used on | Placed today |
| --- | --- | --- | --- | --- | --- | --- |
| `pipe_s_straight` / `pipe_l_straight` | 0.22 / 0.42 × 2.00 | 0.47 / 0.56 | 116 / 140 | Ends at z ±1, y 0.35 (half-flanges) | Khepri, Vesper | Network pipelines (pitched, risers, trestles) |
| `pipe_s_elbow` / `pipe_l_elbow` | 1.11 / 1.21 square | 0.47 / 0.56 | 236 / 284 | In at z −1, out at x +1 | Khepri, Vesper | Network bends and riser bends |
| `pipe_s_tee` / `pipe_l_tee` | 1.11 / 1.21 × 2.00 | 0.47 / 0.57 | 228 / 266 | z ±1 plus a branch at x +1 | Khepri, Vesper | Network; `pipe_l_tee` in the pumping archetype |
| `pipe_valve` | 0.72 × 2.00 | 0.78 | 350 | z ±1 (large) | Khepri, Vesper | Network valves; refinery, plant, pumping |
| `pipe_support` | 0.70 × 0.30 | 0.62 | 120 | Carries one large pipe at centre, or two small at x ±0.18 | Khepri, Vesper | Network supports and stacked trestle towers |
| `tank_vertical_0` / `_1` | Ø 1.16 / 1.04 | 1.41 / 1.42 | 524 / 610 | Flanged nozzle (position unmeasured) | Khepri, Vesper | Refinery, pumping, plant; battery emplacements |
| `tank_sphere` | Ø 1.10 | 1.48 | 510 | Top nozzle, bottom outlet | Khepri, Vesper | Refinery, pumping, plant, cryo |
| `tank_horizontal` | 2.00 × 0.75 | 0.89 | 446 | Side outlet; axis along x | Khepri, Vesper | Refinery, pumping, radiator, plant |
| `container_0` / `_1` | 1.18 × 0.62 / 1.10 × 0.64 | 0.52 / 0.58 | 218 / 136 | — | All | Many archetypes; emplacements |
| `facility` (processing hall) | 2.75 × 2.10 | 1.80 | 722 | — | Khepri, Vesper | Refinery (50%), plant; emplacements |

### 2.4 Vesper infrastructure (`vesper-infra.glb`)

Skirt to y −0.05 except the waterline pieces. Material family: Vesper (black ceramic, orange glow).

| Node | W × D | Top | Notes |
| --- | --- | --- | --- |
| `vesper_radiator_array` | 2.00 × 0.76 | 0.81 | Tiles along x every 2.0 (radiator fields) |
| `vesper_missile_site`, `vesper_cannon_site` | 1.75 × 2.20, 1.66 × 2.42 | 1.74, 0.84 | Scenery emplacements (missile archetype) |
| `vesper_cryo_dome`, `vesper_habitat_0/1` | 1.57 × 1.81, 1.40 × 1.56, 1.10 × 0.97 | 0.94, 0.89, 0.79 | Cryo, plant, harbour |
| `vesper_pier_segment` | 1.40 × 2.00 | y −0.60…0.64 | **Waterline y = 0**, deck 0.40; tiles along z every 2.0 (harbour jetty) |
| `vesper_crane` | 1.26 × 2.30 | 2.10 | Jib reaches toward +Z (seaward) |
| `vesper_comm_needle` | 0.74 × 0.70 | 2.16 | Radiator, cryo, plant |
| `vesper_ice_hauler` | 1.09 × 1.95 | 0.64 | Road haulers (faces +Z) |
| `vesper_icebreaker` | 1.04 × 3.32 | y −0.25…1.37 | Waterline 0, bow +Z, beside jetties |

### 2.5 Battery facility compounds (`facility-compounds.glb`)

Drawn only by `facility-view` and never by the settlement system.

| Node | W × D (z range) | y range | Tris | Notes |
| --- | --- | --- | --- | --- |
| `facility_khepri`, `facility_vesper`, `facility_nacre` | 6.60 × 5.90 (z −4.30…1.60, so it extends 4.3 forward) | −1.75 (piles) … 2.55 (Nacre 2.65) | 6310 / 6310 / 5954 | Open gun court at the origin |
| `facility_*_large` | 8.70 × 8.48 (z −5.80…2.67) | −1.75 … 2.83 | 8646 / 8646 / 8290 | About 1.9× the area; chosen for about ⅓ of batteries |

**Recommendation:** do *not* reuse these as district buildings. Players read a compound as "a battery stands here", so an empty gun court would mislead them. Their roofs also exceed Khepri's 2.2 cap unless the base sits at −0.45 or below.

### 2.6 Nacre ruins and other pieces

**Nacre ruins** (`nacre-kit.glb`; skirt to −0.12; the instance scales the height):

| Node | Size | Height | Notes |
| --- | --- | --- | --- |
| `nacre_tower_0/1` | 1.96² | Top exactly 1 (instances 2.4–3.3) | |
| `nacre_fort_0/1` | 3.0² | Exactly 1 | |
| `nacre_ring_0/1` | 2.26² | 0.46 | |
| `nacre_bridge_0/1` | 0.71 / 0.82 × 3.00 | 0.76 | Ends at z ±1.5; scaled to span tower to ring |
| `nacre_pillars_0/1` | about 1.1² | | |
| `nacre_rubble_0/1` | about 1.25² | 0.19 | |

They are placed by the ruin-site lattice in Nacre scatter (`terrain-nacre.ts:107-220`): a sanctuary is a tower bridged to a ring, a fort is bridged to a tower, and there are lone towers and drowned pillars. They are scenery only.

**Wrecks** (`loot-props.glb`): `wreck_turret_0/1` (about 1.5 × 1.4) and `wreck_fuel` (1.33 × 1.26) are render wrecks of killed ground targets (`scene.ts:1102`). They are not settlement assets.

**Code-built stand-ins** exist for every infra, shared, Vesper and Nacre node at contract size (§2.1). The facility compounds have none; the legacy emplacement layouts take their place.

---

## 3. Gap analysis (brief and concept sheets)

| Planet | Concept item or brief kit | Closest existing | Gap (✗ missing, ◐ partial) |
| --- | --- | --- | --- |
| **Khepri** | 01 Heavy refinery tower / "processing tower variants" | `infra_refinery` (1.6 tall plant), silos, tanks | ✗ **No tall landmark.** The hierarchy cannot read without it. |
| | 02 Mineral extractor pad | `infra_drill_rig`, `crystal`/`crystalSpire` kit | ◐ No extractor pad with arms around a crystal bed |
| | 03 Pipeline junction | `pipe_l_tee`, `pipe_valve`, `pipe_support` | ◐ No domed manifold hub, no 4-way cross, no purpose-built tall supports (docs/14 §4 already notes stacked frames) |
| | 04 Power relay spire | `infra_relay` (comm mast), `infra_solar_array` | ✗ No power building or grid piece |
| | 05 Industrial bridge-gate | — | ✗ No road gates, road bridges or pipe bridges over roads |
| | Tank farms | 4 tank nodes and `pumping` | ◐ Exist, but are not piped to anything internally |
| | Mining rigs | `infra_drill_rig` | ◐ One variant |
| | Cargo platforms | `infra_landing_pad`, unused `infra_track_segment`, cargo haulers | ◐ No raised loading platform or gantry |
| | Large factory halls | shared `facility` (2.75 × 2.1 × 1.8) | ◐ Only a modest hall; nothing 4–6 long |
| | Roads | Ribbons, haulers | ◐ No intersections, road ends at gates, ramps or shoulders |
| | Foundations and retaining | Pad flattening only | ✗ No plinths or retaining walls (pads cut or fill with a 2.4 falloff) |
| **Vesper** | 01 Thermal reactor tower | `vesper_comm_needle`, `vesper_cryo_dome` | ✗ |
| | 02 Cryo dock / landing pad | Harbour jetty (pier, crane, icebreaker) | ◐ No dry dock or landing pad; the Khepri pad is ochre and must not be recoloured |
| | 03 Ark-side defence pylon | `vesper_cannon_site`, `vesper_missile_site` (scenery) | ◐ Check readability against real missile batteries |
| | 04 Heat exchanger | Radiator arrays, vent stacks | ◐ No exchanger block |
| | 05 Frozen bridge outpost / "elevated bridges" | Pipe trestles only | ✗ No bridges over leads or crevasses |
| | Refrigerated warehouses, repair facilities | Habitats, cryo dome | ◐ / ✗ |
| **Luna** | 01 Command bunker | Khepri habitats | ✗ |
| | 02 Radar / comms tower | `infra_comm_dish`, `infra_relay` | ◐ |
| | 03 Hangar pad | `infra_landing_pad` (ochre) | ◐ Needs grey and ivory; `khepri-infra` bakes its colours, so this needs a palette pass or Luna nodes |
| | 04 Turret emplacement | — | Avoid as scenery: it would read as a target |
| | 05 Cargo / power cluster | Containers, tanks, solar | ◐ |
| **Nacre** | 01 Monolith relay; 02 Ring shrine; 04 Bridge-gate tower | `nacre_tower`, `nacre_ring` (low, 0.46), `nacre_bridge` | ◐ Ruins only; no living sanctuary pieces, energy nodes or causeways |
| | 03 Mire pump / energy node; 05 Pod dock / launch spire | — | ✗ |
| | Settlement layer | Ruin lattice in scatter; `settlement: () => null` | ✗ The sanctuary grammar would move ruin sites into the settlement layer |

**Cross-cutting gaps:**

- socket metadata (none anywhere);
- an `essential` vs `cosmetic` flag for props and industry (Low can only thin kit scatter today);
- explicit per-module footprint clearance (now hard-coded per node name);
- a district preload path for any new GLB.

---

## 4. Proposed design

### 4.1 Settlement hierarchy (Phase 2)

| Class | What | Existing members | Frequency target |
| --- | --- | --- | --- |
| **Outpost** (small) | 2–5 principal structures; isolated | Khepri comm, pumping, wreck, abandoned; Vesper missile, cryo, radiator; all of Luna; battery compounds (render-only, outside the seeded system) | Common, unchanged |
| **Compound** (medium) | One main structure plus supporting buildings, *internally connected* | Khepri refinery, plant, landing, mining; Vesper plant, harbour. They become compounds once Phase 3 gives them internal links; until then they are only tagged. | "Occasional". Today they are 64% of Khepri sites (weights `terrain-settlements.ts:15`). Retuning is a separate, fingerprinted data change (open question 7). |
| **District** (large) | Several terraced lots, an authored graph, about 12 × 48 units | New | Khepri: ≤ 1 per campaign mission and ≤ 2 per endless Khepri stint. Other planets later. |

**An extension, not a competing system.** The district wraps the planet's `settlement()`:

```ts
KHEPRI.settlement = withDistricts(settlement, KHEPRI_DISTRICTS);
```

- `withDistricts` returns the district's **hub lot** for the district's anchor cell and side.
- It returns `null` for every other cell on that side that the district **claims**: its footprint ± `quietCells` (≈ 15 units of quiet terrain before and after).
- Otherwise it falls through to the original function, unchanged.
- `settlementsNear` additionally merges the district's non-hub lots, so pads flatten terrain, pipes avoid them and scatter keeps off them through the existing paths.

Everything stays a pure function of (seed, planet), so the road and pipe memo keys remain valid (finding §1.4). Claimed cells are claimed whether or not an arena later hides the district, which keeps memo keys valid.

**Opposite flank:** leave its outposts. The busy opposite flank already follows outpost clustering, and the other side is 1.25 screens away. Optionally, suppress *compound* archetypes there within the district's *s* range, as a data flag.

### 4.2 Vertical budget (user addendum, 20 October)

| Option | Change | Effect | Cost and risk | Recommendation |
| --- | --- | --- | --- | --- |
| **A** | `PlanetProfile.structureMax`: district modules only, **3.0 on Khepri**, the same as Vesper and Nacre's `sceneryMax` | 0.8 clearance under the 3.8 plane. Below the facility compounds' 3.35 and the 3.7 shadow slab top. Landmark height H ≤ 3.0 − lot level − 0.05; *probe:* flat lots have a median level of about −3.6, so H ≤ 4 is practical. | No change outside districts. Pipelines and scatter keep 2.2. | **Adopt for Phase 10.** |
| **B** | Deeper Khepri relief: `FLOOR_LEVEL` −6.3 → about −7.5, `TERRAIN_MIN_HEIGHT` −8 → −10 | More depth everywhere and taller structures in valleys | Changes the whole planet (all fingerprints). Shadow march length (`SHADOW_STEPS`, about 11 units), the settlement level clamp −6 (`terrain-settlements.ts:192`), haze and far plane need review. `rayPlacement` and the shadow slab follow `TERRAIN_MIN_HEIGHT` automatically. | Separate phase, behind its own data switch, with screenshot review |
| **C** | Raise `VIEW.flightHeight` | Lifts every cap | Touches 17 source and test files, including `src/sim/motion.ts`, projection, viewport and boss seating. A combat-adjacent contract. | Only with an explicit user decision |

*Probe* (40 seeds, 156-unit window): relief, not height, is the binding constraint. With relief ≤ 1.4, raising the cap from 2.2 to 3.0 does not change how many seeds find a site (29/40 either way).

### 4.3 Module metadata (Phase 4)

There is one typed registry, `src/world/settlement-modules.ts` (pure data, no three.js). It becomes the single source. `MODULE_HEIGHT`, the `INFRA_NODES` sizes, `SHARED_BOUNDS`, `moduleReach`, the occupancy radii and `CASTER_NODES` are then derived from it. A test asserts the derived values equal today's literals, so the switch is output-neutral.

```ts
export type SiteClass = 'outpost' | 'compound' | 'district';
export type Role = 'landmark' | 'processing' | 'tankFarm' | 'pipeJunction' | 'cargoZone' | 'power' | 'storage'
  | 'admin' | 'repair' | 'habitat' | 'lighting' | 'vehicle' | 'detail';
export type SocketKind = 'road' | 'pipeS' | 'pipeL' | 'power' | 'bridge' | 'causeway' | 'walkway' | 'track';
/** Outward quarter turn in node space: 0 = −Z (forward, +s), 1 = +X, 2 = +Z, 3 = −X. */
export type Facing = 0 | 1 | 2 | 3;
export interface Socket { id: string; kind: SocketKind; at: readonly [x: number, y: number, z: number]; facing: Facing }
export type Foundation =
  | { kind: 'pad' }                              // stands on a flattened lot (today's outposts)
  | { kind: 'plinth'; maxRise: number }          // tolerates relief under its footprint; plinth piece fills (new asset)
  | { kind: 'piles'; depth: number }             // authored piles (compounds: 1.75)
  | { kind: 'afloat'; waterline: number }        // pier, icebreaker
  | { kind: 'natural'; sink: number };           // wrecks, ruins: follow ground
export interface ModuleSpec {
  node: string;                                  // GLB node name = registry key
  source: 'khepri-infra' | 'industrial-kit' | 'vesper-infra' | 'nacre-kit' | 'khepri-kit' | 'district-kit';
  material: 'infra' | 'shared' | 'kit';          // explicit routing (replaces the name-prefix rule, terrain-view.ts:175)
  half: readonly [x: number, z: number];         // measured half footprint before rotation
  top: number; below: number;                    // above / below the pivot (one convention for every kit)
  foundation: Foundation; maxRelief: number;     // ground relief tolerated under the footprint
  planets: readonly PlanetId[]; classes: readonly SiteClass[]; roles: readonly Role[];
  sockets: readonly Socket[];
  rotation: 'quarter' | 'free' | 'fixed';        // industrial pieces: quarter turns only
  clearance: number;                             // scatter/pipe keep-out radius
  tiles?: { axis: 'x' | 'z'; period: number };  // solar 2.2/x, radiator 2.0/x, track 2.0/z, pier 2.0/z
  variants?: readonly string[];                  // interchangeable nodes for one role
  detail: 'essential' | 'cosmetic';              // Low drops cosmetic
  shadow: boolean;                               // High caster strips
  lowNode?: string;                              // optional simplified node (Low / distant)
}
export const MODULES: Readonly<Record<string, ModuleSpec>>;
```

- **Sockets** are declared in metadata, not added to the approved GLBs, so no approved model is regenerated.
- A contact test checks each socket against the loaded GLB: a ray from the socket along its facing reaches open air, and the opposite ray hits the mesh within 0.15. This uses the same approach as the ray checks in `cinematic-assets.test.ts`.
- Pipe sockets lie on the 2-unit grid at y 0.35 so they join the existing pipe kit exactly. Where a piece has no modelled nozzle (the `facility` hall), the socket sits against the wall and the router ends the run with a `pipe_valve` against it. A reviewer judges this in screenshots.

### 4.4 Layout graphs (Phase 3)

The layout graphs live in `src/world/settlement-grammars.ts` as authored data. There are three: Khepri refinery (the prototype), Vesper dockyard and Nacre sanctuary.

```ts
export interface LotSpec {
  id: string; half: readonly [u: number, v: number];     // u lateral (+ toward the world edge), v forward
  at: readonly (readonly [u: number, v: number])[];       // candidate centres relative to the core lot, tried in seeded order
  maxRelief: number;                                      // p90 − p10 of raw ground under the lot
  maxStep: number;                                        // level difference allowed to the lot it links to
  optional?: boolean;
}
export interface SlotSpec {
  id: string; role: Role; lot: string; modules: readonly string[];  // ModuleSpec keys, picked by seed
  count?: readonly [min: number, max: number];
  place: { u: number; v: number; turn?: Facing }          // lot-local, snapped to the lot's 2-unit grid
       | { row: { u: number; v: number; step: readonly [number, number] } };
  chance?: number; requires?: readonly string[];
}
export interface LinkSpec {
  from: `${string}.${string}`;                            // slot.socket
  to: `${string}.${string}` | 'external.road' | 'external.pipe' | 'external.power';
  kind: 'road' | 'pipe' | 'power' | 'walkway' | 'causeway' | 'bridge'; required: boolean;
}
export interface LayoutGraph {
  id: string; planet: PlanetId; class: SiteClass;
  envelope: readonly [u: number, v: number];             // half extents incl. approach apron
  landmark: string;                                       // slot placed first (step 3)
  lots: readonly LotSpec[]; slots: readonly SlotSpec[]; links: readonly LinkSpec[];
  variation: { mirror: boolean; flipV: boolean; emptyYardChance: number; inactiveChance: number };
}
export interface DistrictPolicy {
  grammars: readonly { graph: LayoutGraph; weight: number }[];
  first: number; period: number;                          // slot k window = first + k·period + window
  window: readonly [minS: number, maxS: number]; prefer?: readonly [number, number];
  arenaMarginBefore: number; arenaMarginAfter: number;    // beyond ARENA_RAMP
  quietCells: number; laneKeepOut: number; structureMax: number;
}
/** Output: global, memoized per (planet, seed, slot); sections only read it. */
export interface DistrictPlan {
  id: string; graph: string; side: -1 | 1; turns: 0 | 1 | 2 | 3; mirror: 1 | -1;
  bounds: { minX: number; maxX: number; minS: number; maxS: number };
  lots: Settlement[];            // lots[0] = hub (gates, pipe ports, external edges)
  pieces: IndustryPiece[];       // internal pipes, supports, valves
  roads: RoadPath[];             // internal roads (ribbons + haulers via existing code)
  reserved: readonly { minX: number; maxX: number; minS: number; maxS: number }[];
}
```

Backward-compatible extensions:

- `Settlement` gains the optional fields `class`, `district`, `role: 'hub' | 'lot'`, `gates` and `pipePorts`.
- `TerrainProp` and `IndustryPiece` gain `cosmetic?`.
- `TerrainSection` gains `sites?` (reserved rectangles for the renderer).

**Seeded variation** comes from salts 0xd1a0–0xd1af:

- side, mirror, `flipV` and the quarter turn of the whole district (never per building);
- the lot candidate order;
- module picks among variants, counts within range and optional slots;
- an occasional empty yard or inactive (unlit) building.

Industrial alignment holds within a lot: everything sits on the lot's 2-unit grid in quarter turns.

### 4.5 The fixed 8-step sequence, mapped onto the code

| # | Step | Implementation | Plugs into |
| --- | --- | --- | --- |
| 1 | Type and function | `districtSlot(seed, planet, k)` picks a grammar by weight (0xd1a0) | New `src/world/terrain-districts.ts`; read via `planet.districts` |
| 2 | Terrain-appropriate location | Coarse-to-fine search: a raw-landform lattice (1 unit) over the slot window and both flanks, then per-lot relief and level tests. Requires \|x − routeCenter(1)\| ≥ `laneKeepOut`, \|x\| + half ≤ 14.7, core level ≤ `structureMax` − H − 0.05, and the arena margins. Same idea as `settlement()`'s calmest-candidate search (`terrain-settlements.ts:171-178`). | `terrain-districts.ts` (raw `planet.landform` with a neutral row, as `vesperSettlement` does) |
| 3 | Landmark / core | Core lot first; landmark slot on its outer half (\|x\| 6.5–8.5) | Plan |
| 4 | Reserve footprint and approach | Lots become pads (`terrainRow` sites → `rowPoint` flatten). Claimed cells come from `withDistricts`. An approach apron at the hub gate. `reserved` rectangles go to the renderer. | `terrain-settlements.ts` (`settlementsNear` merge), `terrain-ground.ts` unchanged |
| 5 | Local connection network | Internal spine road as lot-local polylines → `RoadPath`. The external road is the hub's network edges, with `gate()` choosing among the hub's `gates`. Hub edges are forced to road = 1. | `terrain-network.ts` `gate()` (:94), `edgesOf` (:101; skips `role: 'lot'`) |
| 6 | Supporting structures by function | Fill the slots per graph and lot | Plan → lot `modules` (existing `PlacedModule`) |
| 7 | Connect with infrastructure | Orthogonal pipe router on each flat lot (2-unit grid, base at lot level, supports per straight cell, elbows and tees, a valve at junctions), emitting `IndustryPiece`s. Between lots at different levels, the existing pitched-run and riser layout handles the step. External pipelines join only at `pipePorts`, replacing `rimCells` for that site. | New router in `terrain-districts.ts`; `rimCells` (:417) |
| 8 | Secondary detail, lighting, wear, activity | Light masts and parked cargo (cosmetic). The existing `industrial` mask darkens and dusts the pads (`terrain-layout.ts:237`). Haulers drive internal roads (`animate`). Optional render-only steam at stacks (the vent-feature path). | Plan + `terrain-view` |

Sections consume the plan in `sectionSteps`: lot modules through `settlementPieces` (`terrain.ts:129`), and `plan.pieces` and `plan.roads` appended next to `networkPieces` and `networkRoads` (`terrain.ts:357`), filtered by anchor *s* and seam clearance.

### 4.6 Chunk independence and streaming

- **Global plan:** a plan depends only on (seed, planet.id, slot) and the raw landform. It never reads sections, load order, arenas (filtered at query time) or routes. It is memoized per `${planet}:${seed}:${slot}`, bounded at 64 entries.
- **Instantiation:**
  - Each piece is owned by the section that contains its anchor *s*.
  - Rule: module half-depth ≤ 6 along *s* (the window margin is about 10; §1.3), so a district straddling sections never pops.
  - Roads are global `RoadPath`s, so ribbons join across seams like network roads do today.
  - Internal pipe joints are computed globally, so straddling runs join exactly.
- **Cost and warm-up (*probe*):** a raw landform sample costs about 9 µs in Node here. A naive search would take about 1 s per slot, so it is not acceptable.
  - The plan search reuses one cached lattice: about 3.5k samples, about 30 ms per slot, run as **resumable steps**.
  - `createTerrainStream.prefetch` runs `districtPlanSteps` for any slot within 2 sections ahead before the section's own steps.
  - `terrainRow` only reads ready plans. A plan requested synchronously (a seek or a test) is computed with `finish()` and counted as a fallback, giving identical output by construction.
- **Seams and arenas:** a district must lie within one route segment. `arenaMarginBefore` = 40 (keeps the boss approach clear) and `arenaMarginAfter` = 132, which clears the departure, the planet switch at arena.to + 72 and the jump end at +80, so hyperdrive streaming never meets a district section.
- **Preload:** the prototype uses only already-loaded nodes, so there is no new load. A future `district-kit.glb` loads with the planet's kits (`ensurePlanet`, `PRELOAD_AHEAD` 400) and has stand-ins.

### 4.7 Determinism and RNG separation

- Only `hash(seed ^ 0xd1aX, …)` is used. There is no `Math.random`, no `lootRng` and no render state in generation.
- Render-only choices stay hash-based: hauler phase, light blink, and the compound fallback near a district.
- New tests:
  - **Order independence:** generate the district's sections in shuffled order and compare deep-equal, as in `terrain.test.ts:23`.
  - **Sync and incremental equality**, including the plan steps.
  - **Seed sensitivity:** different seeds produce different sides, turns and lots.

### 4.8 Combat, visibility and clearance

- **No gameplay coupling:** terrain never reads encounters (the cues' timing depends on kills). Districts avoid combat-heavy *places* through flank placement and *times* through slot windows chosen against authored recovery stretches (§5.1). Targets, collisions and progression are untouched.
- **Height:** every district module top must be ≤ `structureMax` (3.0 on Khepri). Plans guarantee this through the lot level. A test asserts that **no district module is dropped** by the cap guard (finding 1.6).
- **Lanes:** lots keep \|x − routeCenter(seed, 1, s)\| ≥ 3.5. Only the hub's external road or pipe edge may cross toward the centre, as cross edges do today.
- **Target visibility:** markers already ignore depth, and hidden batteries draw silhouettes.
  - The landmark sits on the outer half of the envelope (\|x\| ≥ 6.5), so its occlusion shadow (about 0.7·H toward +s at the 55° camera) falls on the district and the world edge rather than the centre lane.
  - Cap the landmark at H ≤ 4.
- **Battery compounds versus the district (render-only):**
  - `facility-view` and the legacy emplacements skip placements that overlap `section.sites` reserved rectangles. They try the small compound first, then the legacy emplacement, then nothing. Target positions do not change.
  - `setFacilityClearings` never hides a module flagged as protected.
  - A test extends `facility-placement.test.ts`.
- **Low tier:** only `cosmetic` props and pieces drop: masts beyond one per lot, parked haulers beyond one, crate stacks. Silhouettes stay.

### 4.9 Rollback per phase

| Phase | Switch | Proof |
| --- | --- | --- |
| 2: hierarchy and district slots | `KHEPRI.districts = null` (one data line); `withDistricts` falls through | The legacy fingerprint set is kept as a second recorded set and asserted with districts off |
| 3: layout graphs | Remove a graph from the policy (the slot then yields a compound or nothing) | Graph unit tests |
| 4: module registry | Pure refactor; derived tables equal today's literals | Equality test; fingerprints unchanged |
| 4.2 A: structure cap | `structureMax` = `sceneryMax` | Height tests |
| 5: gates and pipe ports | `Settlement.gates` absent means the old `gate()` | Pipe and road connectivity tests |
| 10: prototype | Same as phase 2; shipped as its own commit and deploy | Before/after captures |

`TERRAIN_VERSION` goes to 11 when districts are on. Re-record the Khepri fingerprints deliberately (`terrain-vesper.test.ts:28-34`); the Vesper, Luna and Nacre fingerprints must stay identical.

---

## 5. Phase 10a: Khepri refinery prototype (existing assets only)

### 5.1 Placement

| Run | Window (district footprint) | When it is visible | Combat context |
| --- | --- | --- | --- |
| Campaign Rolling Thunder (arena 666–701) | *s* 440–606; **prefer core 520–580** | Distance ≈ footprint − 25 … + 6 (prefer t ≈ 100–116 s) | After `r-last` (93 s) and `r-relief` (98 s); the Bastion rolls in at about 129 s (`encounters.ts:77-101`, `content/bastion.ts:39-43`) |
| Endless, Khepri stint (406–1635) | Slot 0: 486–606 (after the Luna arena at 334 + 20 + 132). Slot 1 (period 720): 1160–1326 | Sector 2 and the sector 3/4 boundary | Ordinary sector pressure; flank placement keeps the centre lane |

- **Size:** envelope 12 × 48 (u ±6, v ±24). That is about 1.8 gameplay screens (one screen is 12 × 26) and is seen for about 10 s at 5 units/s.
- The district occupies one flank: \|x\| from about 3.5 to 14.7. The landmark is partly visible from the centre lane (lateral commitment cue, docs/10 §3).
- **Feasibility (*probe*, 40 seeds, flexible lots, core level within budget):**

| Core window | Relief ≤ 1.4 | Relief ≤ 1.8 |
| --- | --- | --- |
| Whole window (core 440–596) | 29/40 seeds | 35/40 seeds |
| Preferred only (core 522–580) | 21/40 seeds | 21/40 seeds |

  Search the preferred band first, then the full window. With no site, the slot yields **no district** (quiet), or a compound if open question 3 decides so. A rigid single-pad layout found sites for only 7 of 40 seeds, which is why lots must be terraced.

### 5.2 Layout graph `khepri.refinery`

Lot-local frame: u is lateral (+ toward the world edge) and v is forward (+s). The player meets −v first.

```
 v
+24 ┌────────── [admin 4×4 opt] [repair 7×7 opt: landing pad apron] ───────────┐
    │  [TANK FARM 7×8]  ══pipe══ [JUNCTION 4×4] ══pipe══╗                         │
+10 │   Tv Ts Tv                    tee+valve          ║                          │
    │   Tv Tv Th ─ ext. pipeline port ←─ network         ║                          │
  0 │                                   [CORE 10×10]: landmark cluster (outer half) │
    │  [power 5×5 opt]                    + 2 processing halls, masts               │
-10 │        ── internal spine road ──────────────┘                                 │
    │  [CARGO ZONE 8×9]: track segments ×6, parked haulers, container stacks, masts │
-24 └──── hub gate: external network road enters here (−v) ─────────────────────────┘
      u −6 (lane side)                                             u +6 (edge side)
```

| Role (required ●, optional ○) | Lot / place | Existing nodes | Sockets and links |
| --- | --- | --- | --- |
| ● Landmark (stand-in) | Core, outer half | `infra_refinery` + 2× `infra_silo` + `tank_vertical_1` as one tight cluster | Refinery slab pipe socket (pipeL) faces the junction |
| ● Processing buildings | Core | 1–2× shared `facility` hall, long axis along v | pipeL wall sockets → junction |
| ● Tank farm | Tank lot | 2 × 3 grid at 2.0 pitch: `tank_vertical_0/1`, `tank_sphere`; `tank_horizontal` toward the junction | Each tank has 4 pipe sockets at its radius, y 0.35; manifold run to the junction |
| ● Pipeline junction | Junction lot | `pipe_l_tee`, `pipe_valve`, `pipe_support` | Links tanks → junction → processing; `external.pipe` port |
| ● Cargo loading zone | Cargo lot (at the hub) | `infra_track_segment` ×6 (two rows), `infra_cargo_0..2` parked (1 essential, the rest cosmetic), `container_0/1` stacks, `infra_light_mast` | `external.road` at the hub gate; spine road → core yard |
| ● Road connection | Hub | Network edge (chain or exit) from `gates[0]`, forced road | — |
| ○ Power generator | Power lot | `infra_relay` + 2–3 `infra_solar_array` tiles | `power` link drawn as a small conduit (`pipe_s` on supports) to the core |
| ○ Secondary storage | Any lot edge | `infra_silo`, `tank_horizontal`, containers | — |
| ○ Admin building | Admin lot | `infra_habitat_1` (office with cupola) | — |
| ○ Repair yard | Repair lot | `infra_landing_pad` as a service apron, parked cargo | Road spur |
| Lighting | Lot corners | `infra_light_mast` (first per lot essential, the rest cosmetic) | — |

**Estimated cost:** about 23k triangles for the whole district and about 12–15k at once in view. That means +0 draw calls for nodes already on screen, and +1 for the first `infra_track_segment` batch.

**Budget for review:** ≤ +3 calls and ≤ +15k visible triangles on High, within `terrain-budget.test.ts`'s 70 calls and 90k triangles.

### 5.3 New pieces truly needed (flagged, not authored)

| Priority | Piece | Why | Notes |
| --- | --- | --- | --- |
| 1 | `khepri_processing_tower` (2 variants) | No existing node can be the dominant landmark. The stand-in tops out at 1.75. | H 3.0–4.0 (fits option A on lots at ≤ −1), footprint about 3 × 3, pipeL sockets, amber stack lights, after sheet 01 |
| 2 | `pipe_l_cross` / `pipe_manifold` hub | Junction readability (sheet 03); a 4-way joint is impossible with tees alone | Same 2-unit grid contract as docs/14 |
| 3 | `foundation_plinth` / `retaining_wall` (tiling) | Lot edges with steps of 0.5 or more, and lots up to 1.8 relief | Basalt-concrete; tiles along x |
| 4 | `khepri_power_relay` spire, `khepri_bridge_gate`, a large factory hall | Sheets 04 and 05; the "large factory halls" kit item | After the layout review |

### 5.4 Implementation order (World session ownership)

1. `src/world/settlement-modules.ts`: the registry subset the refinery needs, plus a derived-table equality test.
2. `src/world/settlement-grammars.ts`: the `khepri.refinery` graph and `KHEPRI_DISTRICTS` (nullable).
3. `src/world/terrain-districts.ts`:
   - lattice search steps;
   - lots;
   - pipe router;
   - internal roads;
   - plan memo.
4. Hooks:
   - `terrain-settlements.ts`: `withDistricts`, and the merge in `settlementsNear`;
   - `terrain-network.ts`: `gate()`/`rimCells` honour `gates`/`pipePorts`, `edgesOf` skips lots, hub edges are forced to road;
   - `terrain.ts`: plan pieces and roads per span, occupancy radii from the registry, `TERRAIN_VERSION` 11;
   - `terrain-planet.ts`: `districts`, `structureMax`.
5. Stream: plan warm-up steps in `createTerrainStream.prefetch`.
6. Render:
   - `terrain-view.prepare` takes boxes and the cosmetic flag from the registry (also fixes finding 2);
   - `facility-view` and the scene emplacements honour `section.sites`.
7. Tests, fixture, captures and measurements (§5.5), then a `docs/build-status.md` entry.

`tests/fixtures/**` is listed under the Bastion/Codex session in `COORDINATION.md`. Note the new fixture there before adding it.

### 5.5 Validation

**Unit tests** (new `tests/world/terrain-districts.test.ts`, plus extensions to existing suites):

- **Determinism:** shuffled section order, sync and incremental equality, and plan memo eviction all give deep-equal results (seeds 11, 93, 8831, 4242, plus a feasible-site seed found by search).
- **Seams and continuity:**
  - internal pipe joints match within 1e-6 across section boundaries;
  - road ribbons join;
  - every road end lies within 0.6 of a road socket, a network endpoint or a map exit;
  - every district has ≥ 1 network road edge.
- **Integrity:**
  - no module dropped by the cap;
  - every top ≤ `structureMax`;
  - footprint corners within the foundation tolerance of the ground (no floating, no buried roofs);
  - tank and hall sockets are touched by their pipe ends (contact ≤ 0.05).
- **Placement:**
  - quiet cells hold no other same-side settlement;
  - lots respect the lane keep-out and world edge;
  - arena margins hold (Rolling Thunder; endless 0–3200);
  - no lot within 80 of any planet seam;
  - ≤ 1 district in Rolling Thunder and ≤ 2 per endless Khepri stint.
- **Rollback:** policy null gives the legacy Khepri fingerprints; Vesper, Luna and Nacre fingerprints are unchanged.
- **Budget and stream:**
  - `terrain-budget` sweep extended over a district window (High ≤ 70 calls, ≤ 90k triangles; Low ≤ High);
  - `terrain-stream` no-fallback test at top endless pace through a district;
  - route jump test unchanged.
- **Facilities:** a battery inside the reserved rectangle gets the small compound, the legacy emplacement or nothing, never a hidden landmark. The battery's position is unchanged.

**Browser and visual:**

- New fixture `tests/fixtures/khepri-district.{html,ts}`, cloned from `nacre-world.ts`: real renderer, frozen state, query `seed`, `distance`, `x`, `quality`, optional `facility`.
- Fixed-camera captures at 432 × 768, DPR 2, High and Low, at camera x = 0, toward the district flank and at the district edge.
- Cases:
  - 3 feasible seeds;
  - a steep-terrain seed (relief tier 1.8);
  - a district next to a neighbouring opposite-flank outpost;
  - a district straddling a section boundary (s = 36k);
  - a battery compound placed inside the reserved rectangle.
- **Before** captures: take them now on `main` with the same seeds and distances, using `tools/lookdev.mjs` and `tools/art-refinement-lookdev.mjs` against the 4173 dev server.
- Compare the after captures against `art/concepts/facility-sheets/khepri.jpg` items 01 and 03 for hierarchy, palette and connectivity. This is a judgement, not a pixel match.

**Performance:**

- `data-render-stats` (calls, triangles, terrain work max / over-4 ms / fallbacks) before and after, flying through the district in Rolling Thunder and endless.
- Node timing of district sections against neighbours: target ≤ +25% generation time, and plan steps ≤ 3 ms each.
- A phone check (iOS Safari or Android Chrome) if hardware is available. Otherwise record it explicitly as unverified.

### 5.6 Risks

1. **Rugged terrain:** about 15–25% of seeds have no site in the window. Mitigations: the full-window fallback, relief tier 1.8 with plinths (new piece), or a local "district calm" landform term (a terrain change; open question 3).
2. **A weak hierarchy without the tower:** the stand-in cluster reads like an ordinary refinery outpost. The prototype validates layout and tech, not the final look.
3. **Pad cut and fill seams:** lots at different levels create steep pad rims. Limit steps to ≤ 1.25 and review them in captures. Retaining walls come later.
4. **Cost:** extra instances and caster triangles; plan search hitches if not warmed (§4.6).
5. **Battery compound overlap:** handled render-side (§4.8). Without that, a compound clearing could erase the landmark.
6. **Fingerprint churn:** intentional and recorded; the legacy set is retained for rollback.
7. **Other sessions:** `scene.ts` and fixtures are shared files. Follow `COORDINATION.md`.

### 5.7 Open questions for the user

1. **Vertical space:** adopt option A (district-only cap of 3.0 on Khepri) now? Or do you also want B (deeper valleys planet-wide) or C (a higher flight plane), which are larger changes?
2. **Placement control:** planet-level seeded slots (proposed), or per-mission authored windows read from the run schedule, like arenas?
3. **No suitable site:** skip the district, place a compound, or soften the terrain locally under district slots?
4. **Landmark:** review the stand-in prototype first, then author `khepri_processing_tower` in Blender? Or author the tower before the first review?
5. **Nacre battery compounds:** they reuse the human compound geometry. Is that acceptable, or should Nacre get its own later?
6. **Battery compounds inside a district:** fall back to the small compound or legacy emplacement (proposed)?
7. **Compound frequency:** refinery, plant, landing and mining are 64% of Khepri outposts today. Make them rarer when compounds gain internal links (a fingerprinted retune)?
