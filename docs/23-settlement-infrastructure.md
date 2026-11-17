# Settlements and infrastructure

How outposts, the road and pipeline network between them, Khepri's refinery districts and the infrastructure models
they are built from are generated and placed. Battery plants around ground guns are [docs/25](25-modular-facilities.md);
the shared pipes and tanks are [docs/14](14-shared-industrial-kit.md); the relief they stand on is
[docs/26](26-terrain-relief.md).

Everything here is scenery: never collision, never a target, never cover. It is a pure function of the run seed and
world coordinates, so every section sees the same settlements whatever order sections are built in. The user asked for
varied bases joined by roads and pipelines (14 October), outposts that gather instead of standing alone (17 October),
a refinery district prototype (20 October, option A), outposts in compounds (21 October) and roads only where they make
sense (28 October); the decisions are in [docs/08](08-decisions-and-sources.md). The facility sheets
(`art/concepts/facility-sheets/`) are references only.

## 1. The system

### 1.1 Which worlds have settlements

Settlements come from each world's profile (`PlanetProfile` in `src/world/terrain-planet.ts`).

| World | Outposts | Network | Districts |
| --- | --- | --- | --- |
| Khepri | `settlement` in `src/world/terrain-settlements.ts`, wrapped by `districtSettlement` | Roads (`roads: 'purposeful'`) and pipelines | `KHEPRI_DISTRICTS` (§5) |
| Vesper | `vesperSettlement` in `src/world/terrain-vesper.ts` | Snow tracks and pipelines | None |
| Luna | `lunaSettlement` in `src/world/terrain-luna.ts` | Rover tracks only (`pipes: false`) | None |
| Nacre, Amnion, Corona, Nahara, Umbra | None (`settlement: () => null`, `networks: false`; Corona and Nahara take Umbra's profile) | None | None |

The worlds without settlements build their structures as scatter: Nacre's ruin sites (`src/world/terrain-nacre.ts`),
Corona's infrastructure modules and Umbra's structures, both seated on level ground under their whole footprint by
`footprintBase` (`src/world/footprint.ts`), and Nahara's ruin cities ([docs/39](39-nahara-silent-empire.md)). Strike
sites ([docs/33](33-strike-sites-and-encounter-deck.md)) and battery plants ([docs/25](25-modular-facilities.md)) are
placed by the renderer around live targets, not by this system.

### 1.2 Data flow

```
seed ─┬─ PlanetProfile: landform, colour, settlement(), scatter(), floes(), sceneryMax, networks, pipes, roads, districts
      ├─ settlement(seed, cell, side) → Settlement | null          per world; pure, memoized
      ├─ districtPlan(seed, planet, slot) → DistrictPlan | null    Khepri; pure, memoized, resumable (§4.5)
      ├─ settlementsNear(seed, s0, s1, arena, planet)              outposts plus district lots, minus what an arena hides
      │    ├─ terrainRow() → rowPoint(): pads flatten the ground (terrain-ground.ts)
      │    ├─ edgesNear() → edgesOf(): chain, exit and cross edges (terrain-network.ts)
      │    │    ├─ roadPathSteps(): A* on a 1-unit grid, graded, straightened and curved; memo per edge
      │    │    └─ pipeRunSteps(): A* on a 2-unit grid: runs, risers, trestles; memo per edge
      │    └─ settlementPieces(): modules → props, shared-kit pieces, kit rubble (terrain.ts)
      └─ sectionSteps(seed, index, world | route) (terrain.ts)
           warm district plans → rows and colours → mesh → per world span: network, district pipework, roads and
           sites, settlement pieces → occupancy → road-end wear → road ribbons → scatter (scatter sink) → floes, water
                │
createTerrainStream (terrain.ts): window current−1 … current+1; the next sections prefetched in resumable steps
                │
terrain-view.ts: prepare() per section → one InstancedMesh per node, compacted to the view; caster strips on High;
                 Low drops cosmetic pieces; haulers on roads; reservedSites() for the battery plants
```

### 1.3 Files

| File | What it holds |
| --- | --- |
| `src/world/settlement-geometry.ts` | Shared shapes: `Settlement`, `PlacedModule`, `Archetype`, `SETTLEMENT_CELL`, `padDistance` (a leaf module, so outposts and districts never import each other) |
| `src/world/terrain-settlements.ts` | Khepri's outposts (`ARCHETYPES`, `compose`, `settlement`), the clustering noise `districtLevel`, `compoundSlot`, `padInfluence`, `settlementsNear`, and the legacy height table `MODULE_HEIGHT` |
| `src/world/terrain-vesper.ts`, `terrain-luna.ts` | Vesper's and Luna's outposts beside their landforms |
| `src/world/settlement-modules.ts` | The module registry `MODULES` (§4.3) |
| `src/world/settlement-grammars.ts` | Layout graph types and the authored `KHEPRI_REFINERY` graph and `KHEPRI_DISTRICTS` policy (§4.4, §5) |
| `src/world/terrain-districts.ts` | District planning, layout, pipework, claims and arena hiding |
| `src/world/terrain-network.ts` | Network edges, road and pipe searches, district roads, road ribbons and road ends, `SHARED_BOUNDS` |
| `src/world/terrain-ground.ts` | Rows and points: pads flatten the ground, a narrow lead under a Vesper pad fills at pad level |
| `src/world/terrain.ts` | `sectionSteps`, `settlementPieces`, occupancy, `SEAM_CLEARANCE`, the stream, `TERRAIN_VERSION` |
| `src/world/scenery-kit.ts`, `scatter-sink.ts` | Kit kinds and bounds; the sink every world's scatter goes through (span, world edge, scenery cap, essential pieces first) |
| `src/world/footprint.ts` | `footprintBase`: where a large piece can stand level (Umbra, Corona) |
| `src/world/terrain-work.ts` | Resumable work: `finish()` gives the same result run at once or in steps |
| `src/render/terrain-view.ts` | Section views, instancing, culling, materials by node name, haulers, `reservedSites`, `setFacilityClearings` |
| `src/render/terrain-kit.ts` | Loaders, the legacy tables `INFRA_NODES` and `VESPER_INFRA_NODES`, code-built stand-ins, road textures |

### 1.4 Streaming, routes and seams

- **Sections** are `VIEW.sectionLength` long on the `TERRAIN_STEP` grid; the mesh spans the world plus `MESH_APRON` of
  plain ground beyond each edge, but pieces, pads and roads stay inside the world. The stream keeps the current section
  and its two neighbours (`RETAINED_SECTIONS`) and prefetches what comes next within `PREFETCH_BUDGET_MS` a frame
  (`src/render/scene.ts`). A section needed before it is ready is generated at once and counted as a fallback; the
  output is identical either way.
- **Ownership.** A piece belongs to the section holding its anchor s. Roads are global centrelines: a section draws the
  ribbon segments that start in it and keeps every road touching it for the haulers.
- **Routes.** Every run streams a route (`runRoute` in `src/world/run-route.ts`): each distance resolves its own planet
  and nearest arena. A planet switch splits its section, nothing stands within `SEAM_CLEARANCE` of the seam, and jumps
  swap planets under the veil ([docs/18 §3](18-endless-planet-cycle.md#3-world)).

### 1.5 What is global and what belongs to a section

| Global: seed plus world coordinates, memoized and bounded | Per section: instantiation only |
| --- | --- |
| Landform and moods; outpost candidates (memo per world, 2,048 entries); district plans (256); network edges; road paths and pipe runs (256 each, keyed by planet, district policy, seed and edge); district roads (64) | Mesh and colours; settlement modules and network pieces by anchor s; road ribbons for segments starting inside; district sites reaching the section; scatter cells and the occupancy set |

Every cache holds pure results, so clearing one never changes output (`resetTerrainCaches` in `src/world/terrain.ts`).
`tests/world/terrain.test.ts` and `tests/world/terrain-network.test.ts` build sections in shuffled orders and compare.

### 1.6 Seeds and randomness

- Generation uses only the stateless `hash(seed ^ salt, a, b)` (`src/world/terrain-layout.ts`) with a fixed salt per
  feature: Khepri outposts `0x5e77`/`0x5e78`, outpost clustering `0xd157`, network edges `0x7e7`, pipe size `0x919`,
  Vesper outposts `0x7e5e`–`0x7e60`, Luna outposts `0xa1e7`/`0xa1e8`, districts `0xd1a0`–`0xd1af`. There is no
  `Math.random` in `src/world/`.
- `districtLevel` is a slow noise along the route that makes outposts gather in busy stretches; despite its name it has
  nothing to do with districts.
- The simulation reads the terrain through the run's route (ground seats, strike-site seats and run events:
  `src/sim/ground.ts`, `src/sim/sites.ts`, `src/sim/events.ts`) and never changes it. The terrain never reads combat, and
  gameplay rolls come from seeded streams (`src/shared/streams.ts`) it never touches.
- Render-only cosmetics hash their own inputs: hauler phase and speed from the road (`tint` in
  `src/render/terrain-view.ts`), legacy emplacements from the enemy id (`src/render/scene.ts`), battery plants from the
  battery id, seed and world ([docs/25](25-modular-facilities.md)).

### 1.7 Ground targets and battery plants

Ground batteries are simulation entities; most formations are anchored to the camera's view (`resolveAnchor` in
`src/sim/airspace.ts`), so a battery can appear anywhere, including over an outpost or a district. Each stands on
whatever terrain its position lands on ([docs/13 §2](13-khepri-world.md#2-procedural-layout)); generation never moves a
target. A battery plant clears the terrain scenery inside its clearing. Plants and the
legacy emplacement pieces (Khepri and Vesper) never cover a district pad or a strike site: `reservedSites()` hands the
pads to `facilities.update` in `src/render/scene.ts` (§4.8). An ordinary outpost has no reservation, so a plant may
clear part of one.

### 1.8 Clearance contracts

| Rule | Where |
| --- | --- |
| Piece tops stay under the world's scenery cap (`SCENERY_MAX_HEIGHT`, `VESPER_SCENERY_MAX`, `LUNA_SCENERY_MAX`), under the flight plane `VIEW.flightHeight`; a settlement module over it is dropped. District lots carry their own cap (§4.2). | `settlementPieces` in `src/world/terrain.ts` |
| An outpost's pad level leaves room for its tallest module (Khepri, Luna); Vesper swaps a piece too tall for its pad's room for a lower one (`LOWER`) | `settlement`, `lunaSettlement`, `vesperSettlement` |
| Pipeline racks stay under `PIPE_TOP` and every piece under `SCENERY_MAX_HEIGHT` on every world | `src/world/terrain-network.ts` |
| Outposts stand on the outer part of each side (Khepri 0.42–0.82 of the half width, Vesper 0.35–0.83, Luna 0.4–0.85; compounds facing each other move inward); paths pay a cost within 3 units of the calm centre route; district pads keep the policy's `lane` from it | `compoundSlot` callers, `gridSteps`, `districtPlanSteps` |
| No outpost, road or pipeline on an arena or its ramps; an arena hides a whole district | `settlementsNear`, `edgesNear`, `districtHidden` |
| Markers and telegraphs draw without depth testing; a ground target hidden by terrain draws a silhouette | [docs/13 §2](13-khepri-world.md#2-procedural-layout) |

### 1.9 Tests

| Test | Guards |
| --- | --- |
| `tests/world/terrain-network.test.ts` | Varied outposts, pads at authored heights under the cap, identical network pieces in any order and each owned once, paths that never climb cliffs |
| `tests/world/terrain-pipes.test.ts` | At least 95% of pipeline edges connected end to end, no floating or buried pipes, pipelines off outpost modules |
| `tests/world/terrain-districts.test.ts` | Districts (§5.5) and road ends |
| `tests/world/settlement-modules.test.ts` | The registry equals every legacy table; district sockets lie on the shipped models |
| `tests/world/terrain-vesper.test.ts` | Khepri fingerprints; Vesper outposts on shelf ice, harbours over open water, tracks off water, every archetype in view |
| `tests/world/terrain-luna.test.ts` | Luna outposts: more than before, never in every section; no pipelines |
| `tests/world/terrain-arena.test.ts`, `endless-clearance.test.ts` | Arenas free of outposts, roads, pipes and tall scatter |
| `tests/world/terrain-budget.test.ts` | Draw calls and triangles on High, over districts too; Low never costs more |
| `tests/world/facility-placement.test.ts` | Plants keep off district pads |
| `tests/world/terrain-kit.test.ts`, `models.test.ts` | A stand-in for every node; industrial footprints |

## 2. Assets

### 2.1 Files

Every model follows the same conventions: glTF, +Y up, 1 unit = 1 game unit, −Z along the route (forward, +s), pivot
at the base centre, authored at real game size and placed at scale 1.

| GLB | Builder (`tools/blender/`) | Content | Loaded by | Stand-ins |
| --- | --- | --- | --- | --- |
| `public/assets/khepri/khepri-infra.glb` | `kit_khepri_infra.py` | Khepri outpost machinery: landing pad, refinery, relay, cargo haulers, crawler track, drill rig, habitats, comm dish, solar array, light mast, silo, wrecks ([docs/13 §3b](13-khepri-world.md#3b-infrastructure-kit-contract)); Luna uses it too | `loadKhepriInfra` at start (`src/render/scene.ts`) | `createFallbackInfra` |
| `public/assets/khepri/district-kit.glb` | `kit_khepri_district.py` | `khepri_processing_tower` (§5.3) | `loadDistrictKit` at start | Code-built tower in `createFallbackInfra` |
| `public/assets/vesper/vesper-infra.glb` | `kit_vesper_infra.py` | Radiator arrays, missile and cannon sites, cryo dome, habitats, pier, crane, comm needle, ice hauler, icebreaker (`art/vesper-infra/README.md`, [docs/17 §3](17-vesper-glass-frontier.md#3-blender-assets)) | `loadVesperInfra` when Vesper first loads (`ensurePlanet`) | `createFallbackVesperInfra` |
| `public/assets/shared/industrial-kit.glb` | `kit_industrial.py` | Pipes, valves, supports, tanks, containers and the processing hall `facility` ([docs/14](14-shared-industrial-kit.md)) | `loadSharedKit` at start | `createFallbackShared` |

Outposts also use natural kit pieces as rubble: Khepri's `rock`, `boulder`, `crystal` and `fallen`
(`public/assets/khepri/khepri-kit.glb`) and Vesper's `outcrop` (`public/assets/vesper/vesper-kit.glb`). Battery plants
come from each world's `facility-kit.glb` ([docs/25](25-modular-facilities.md)); the wrecks of killed ground targets
are render-only props in `public/assets/shared/loot-props.glb`.

### 2.2 Materials and stand-ins

- **Materials by node name** (`nodeMaterial` in `src/render/terrain-view.ts`): `infra_*` and `khepri_*` nodes draw with
  the infrastructure material (their amber `light` faces glow); shared-kit nodes with the shared material, which takes
  each world's palette through its masks ([docs/14 §2](14-shared-industrial-kit.md#2-planet-neutral-shading)); cliff
  walls with the wall material; everything else, `vesper_*` and `wreck_*` included, with the kit material. The
  registry's `material` field records the same families but the view does not read it.
- **World paint** (`src/render/world-paint.ts`) recolours the infrastructure and the shared kit per world, keeping
  brightness: Luna's bases are white with orange glow, Khepri's rust and orange, Vesper's metallic white with blue glow.
- **Stand-ins.** Every node has a code-built stand-in at its contract size; it draws until the GLB loads, and stays if
  a load fails.

## 3. Outposts and networks

### 3.1 Outposts

Each world with settlements has one candidate per side in every `SETTLEMENT_CELL` along the route. A candidate exists
when its presence roll passes and `compoundSlot` finds it a partner, or now and then without one (§3.2); it then picks
the calmest of a few candidate spots in its slot, an archetype, a quarter turn and a mirror, and composes its modules
in a local frame from the seed. Its pad flattens the ground around it (`padInfluence`, falling off over 2.4 units);
wrecks lie on natural ground.

- **Khepri** (`ARCHETYPES`: refinery complex, mining camp, processing plant, landing field, comm station, pumping
  station, wreck site, abandoned outpost; weighted toward the big facilities, user 17 October). Never the same archetype
  as the previous cell on its side. The pad's level is the landform's at its centre, snapped to a quarter unit and
  clamped between `TERRAIN_MIN_HEIGHT` + 1 and the cap less its tallest module; site choice avoids high ground where the
  tallest pieces would sink the pad.
- **Vesper** (`VESPER_ARCHETYPES`: radiator field, missile and cannon sites, cryo station, processing plant, heat
  exchanger, thermal reactor, harbour). A pad needs dry shelf: up to 20 tries, at least 85% of the pad over the ice and
  its centre well above the sea. It keeps its own shelf's level, and pieces too tall for the room under the cap become
  lower ones (`LOWER`). A narrow lead under a pad is filled at pad level like a causeway. An outpost within reach of open
  water on a low ice foot may be a harbour (half of them are): its quay faces the water, its jetty and an icebreaker
  stand afloat, and its crane leans over the sea. How the pads sit on the ice is
  [docs/26 §5](26-terrain-relief.md#5-vesper-outposts-on-the-ice).
- **Luna** (landing field, comm station, abandoned habitat; `OUTPOST_CHANCE`). Sparse by design (user, 20 October; a
  little denser since 22 October). Bases come in pairs facing across the route: the left side a landing field (the pad
  beside a habitat block, cargo and a light), the right a comm station or quarters.

### 3.2 Compounds

`compoundSlot` (`src/world/terrain-settlements.ts`; user, 21 October: infrastructure "cluttered together, with pipes and
roads connecting several features and bases") puts each outpost beside a partner: the next or previous cell on its
side, or the other side of its own cell. Without one it stands only now and then (15% on Khepri and Vesper, 20% on
Luna). It moves toward its partners, to the shared end of the cell, and inward when both sides of the cell are built,
so neighbouring pads stand a few units apart and the network's chain and cross links join them. The presence test it
calls is partner-free (a seeded roll, on Vesper also a memoized dry-shelf search), so cells never recurse.

### 3.3 The network

`edgesOf` in `src/world/terrain-network.ts` gives each outpost its edges:

- **chain:** to the next outpost ahead on its side, within three cells (five from a district hub);
- **exit:** to the map edge, now and then, and always for a pumping station without a pipeline;
- **cross:** across the route, most of the time when the facing cell is built (the left side owns the link), rarely
  otherwise.

Each edge rolls for a road and a pipeline. Khepri's network is `purposeful` (user, 28 October: roads were "everywhere
without purpose", then "lower the threshold a bit"): a road runs between two works (the `industrial` archetypes), half
the time between a works and another outpost, always to and from a district, and across the route between facing
compounds; it leaves the map only from a district. On Vesper and Luna most neighbours get a road. Pipelines join
industrial sites, a tank farm always lies on one, quiet sites (wrecks, abandoned outposts) get none, Luna has none, and
none ends at a district. On a world with a sea a pipeline is planned only where at most half its straight line crosses
water. `edgesNear` drops edges whose search could reach an arena, and those touching or running beside a district an
arena hides.

### 3.4 Roads

- **Search** (`roadPathSteps`): A* on a 1-unit grid with diagonals; steps steeper than `ROAD_MAX_SLOPE` are forbidden,
  turns cost a little, the centre lane and foreign pads cost more, and district pieces are solid. A road is built only
  when it reaches its goal (user, 28 October), or on a world with a sea when it runs down to the shore.
- **Shape:** the searched cells are straightened wherever a straight run stays on gentle, dry, open ground, and every
  corner is curved (up to a 4-unit radius, tighter where the grade needs it); a final grade check drops any road that
  still meets a hard step. A purposeful road that would meander (longer than 1.8 times the direct distance plus 4) is not
  built unless it serves a district.
- **Ribbons** (`roadRibbonSteps`): sampled every `ROAD_STEP`, each vertex on the highest ground a quarter unit either
  way so ridges never break through, with graded berms. Surfaces: dust tracks on Khepri, packed snow on Vesper, regolith
  rover tracks on Luna (`createRoadTexture` in `src/render/terrain-kit.ts`).
- **Ends** (`RoadEnd`; user, 20 October): a `fade` end (open ground, map exits) narrows to a rounded tip, sinks and
  fades over `ROAD_ENDS.taper` on a patch of worn ground (Khepri's industrial dust tone; elsewhere it only darkens); an
  `apron` end runs `ROAD_ENDS.apron` flush onto the pad it serves; a `joined` end continues into a district road.
  `ROAD_ENDS.taper = 0` restores square-cut ends.
- **Haulers** (`animate` in `src/render/terrain-view.ts`): one or two per road shuttle in the right-hand lane, seated
  on the ground under all four corners, drawn at three quarters of the cargo node so they never read as targets; Khepri
  cargo haulers (repainted on Luna) and Vesper ice haulers. A road sharing another's corridor carries none, and Low keeps
  fewer. Presentation only: seed and time, never collision.

### 3.5 Pipelines

The pipeline search, layout and supports are [docs/14 §4](14-shared-industrial-kit.md#4-runtime-use). Specific to the
network: a line leaves and joins an outpost at any cell on its pad's rim (`rimCells`), keeps a unit clear of its modules
(crowded cells), is laid large about 60% of the time, re-plans up to `PIPE_ATTEMPTS` times around cells where the laid
pipe would rise over the cap, and on a world with a sea is not built at all when it cannot reach its goal.

### 3.6 Measured

17 November, terrain version 22, seeds 1, 93, 8831, 11 and 4242 over 3 km; "alone" means no other pad centre within
16 units.

| World | Outposts per km | Alone |
| --- | --- | --- |
| Khepri | 49.0 | 21% |
| Vesper | 30.1 | 29% |
| Luna | 16.8 | 21% |

## 4. Districts

A district is a rare, authored, multi-lot settlement planned from the seed and the planet alone, in fixed slots along
the route (`src/world/terrain-districts.ts`). Only Khepri has them (§5).

### 4.1 Hierarchy

The registry names three classes (`SiteClass` in `src/world/settlement-modules.ts`): an **outpost** is one pad of a few
structures; outposts in **compounds** stand beside partners and share roads and pipelines (§3.2); a **district** is
several terraced lots laid out by an authored graph, one of them the network **hub**.

A district extends the planet's outposts rather than replacing them. `KHEPRI.settlement` is
`districtSettlement(KHEPRI, settlement, …)`:

- the district's anchor cell on its flank returns the hub lot;
- every other cell on that flank that the district claims (its extent plus the policy's `quiet` buffer) returns nothing;
- all other cells return the original outpost.

`settlementsNear` adds the district's other lots, so pads flatten the ground, networks route round them and scatter
keeps off them through the same paths as outposts. The opposite flank keeps its outposts.

### 4.2 Structure cap

District pieces stay under the policy's `structureMax` (a lot's `cap`, read by `settlementPieces`), and the planner
keeps each lot's level at or under `structureMax` less its tallest piece. This is option A of the user's 20 October
decision ([docs/08](08-decisions-and-sources.md)): district structures have a cap of their own, and the flight plane
never moves for scenery. Khepri's district cap and its scenery cap are both 3.0 now (`SCENERY_MAX_HEIGHT` rose to it with
the deeper relief of terrain version 13), but they stay separate data.

### 4.3 Module registry

`MODULES` (`src/world/settlement-modules.ts`) holds one typed record per placeable infrastructure node: the Khepri
infrastructure, the shared industrial kit, the Vesper infrastructure and the district kit. Pure data, no three.js.

| Field | Meaning |
| --- | --- |
| `node`, `source` | GLB node name and kit (`khepri-infra`, `industrial-kit`, `vesper-infra`, `district-kit`) |
| `half`, `top`, `below` | Contract half footprint (local x, z), height above the pivot and extent below it (skirt, waterline depth) |
| `sockets` | Connection points: kind (`pipeL`, `road`, `track`, …), position in node space, outward facing (0 = −Z, 1 = +X, 2 = +Z, 3 = −X) |
| `foundation`, `rotation`, `tiles` | Pad, piles, afloat or natural ground; quarter turns, free or fixed; seamless repeat along an axis |
| `planets`, `roles` | Where it is used, and its roles (landmark, processing, tank farm, pipe junction, cargo zone, power, …) |
| `detail`, `shadow`, `material` | Default detail level, real-time shadow on High, material family |
| `planned` | Authored but not yet modelled: layouts place its stand-in pieces instead |

Code reads `half`, `top`, `sockets`, `source` and `planned`: the district layout seats pieces by socket and keeps
planned nodes out, the network makes district pieces solid by their footprint, the terrain view sizes culling boxes with
`moduleSize`, and `DISTRICT_NODES` lists the district kit. The other fields are descriptive. Sockets are metadata, not
empties in the GLBs; pipe sockets sit on the 0.35 centreline of the 2-unit pipe grid
([docs/14](14-shared-industrial-kit.md)).
`tests/world/settlement-modules.test.ts` checks that the registry equals the older tables (`MODULE_HEIGHT`,
`SHARED_BOUNDS`, `INFRA_NODES`, `VESPER_INFRA_NODES`) and casts rays at the shipped models to prove each district pipe
socket lies on a real surface.

### 4.4 Layout graphs

`src/world/settlement-grammars.ts` holds the authored graphs as data. A lot frame has `a` across (+ toward the world
edge on the district's flank) and `b` along the district (+ away from the hub); pieces sit at authored spots in quarter
turns, so industrial alignment holds, and the whole layout mirrors with the flank and direction.

- **`LayoutGraph`:** its lots in order (the first is the hub), the gap candidates between consecutive pads, and the
  largest cut or fill under a pad (`maxCut`) and level step between lots (`maxStep`).
- **`LotSpec`:** role (`hub` or `lot`), half extents, lateral centre candidates `u`, the tallest piece it may hold, its
  pieces, its pipework, the hub's road gates, the yard where internal roads meet, where the spine leaves or enters, and
  an optional landmark slot (with stand-in pieces while its node is planned).
- **`Placement`:** one node or a seeded choice, its spot, a quarter turn or a `face` (an axis toward a lot direction,
  for asymmetric sockets), an `attach` that seats the node by a socket onto a pipe end, a build `chance`, a `group` built
  together or not at all, `cosmetic`, and a `lift` above the pad (a hauler parked on a track).
- **`PipeCell`:** straights, valves, closed end valves (`cap`), tees (a tee may feed a tank, placed at the branch end by
  the tank's socket radius) and elbows on the lot's 2-unit lattice.
- **`DistrictPolicy`:** the graph, the slot windows (`first`, `period`, `length`) and preferred band (`prefer`), arena
  margins beyond `ARENA_RAMP`, the `quiet` buffer, the `lane` clearance and `structureMax`.

### 4.5 Planning

`districtPlanSteps` plans one slot in resumable steps:

1. **Lattice.** One raw landform sample per unit across both flanks (integer |x| up to the world edge) over the slot's
   window, a row per step. Raw means the planet's landform before pads and arenas.
2. **Search.** Candidate centres for the second lot every 2 units, the preferred band first and then outward; for each,
   flanks and directions in a seeded order, the lots' lateral candidates and the gaps. A fit needs every pad inside the
   window, cut and fill under each pad within `maxCut` at the level that minimizes it, that level under the cap less
   the lot's tallest piece, level steps within `maxStep`, each pad's inner edge `lane` clear of the calm centre route,
   and a drivable grade across each gap (the final ground emulated under the pads' falloff, `LINK_GRADE`). The first fit
   wins; with none the slot stays quiet.
3. **Layout** (`layout`): seeded node choices, chances and groups; the landmark, or its stand-ins while planned; pieces
   seated by socket or faced; the pipework with supports, tees feeding tanks and closed ends; the hub's gates, its yard
   and the spine through every lot; and the reserved `sites` (each pad plus half a unit).

The planner handles a hub and one lot; a graph with more lots throws.

### 4.6 Chunk independence, streaming and arenas

- A plan depends only on the seed, the planet, the policy and the slot, and reads only the raw landform: never sections,
  load order, arenas or routes. Plans are memoized per planet, policy, seed and slot.
- `sectionSteps` plans every slot within `DISTRICT_WARM` of its section before generating its rows
  (`warmDistrictSteps`), inside the stream's budgeted steps; a plan requested at once (a seek, a test) is identical.
- Pieces belong to the section holding their anchor; district roads are global (`districtRoadsSteps`, memoized per
  plan); each section lists the district sites that reach it (`TerrainSection.sites`).
- An arena hides a whole district at query time (`districtHidden`: within `arenaBefore` of the arena's ramp before it,
  `arenaAfter` after it, which clears the departure and a jump). The plan and its claimed cells stay as they are, so the
  network's memo keys stay valid; edges that touch the district or run beside it are dropped.
- Network memo keys name the planet and its district policy (`memoPrefix`), so switching a policy never reuses a path
  built for other sites.

### 4.7 Determinism

Districts use hash salts `0xd1a0`–`0xd1af` (`0xd1a0` for the search order, `0xd1a2` for layout choices) and nothing
else: no `Math.random`, no gameplay stream, no render state. The tests build a district's sections in shuffled order
and incrementally, and compare them with synchronous generation (§5.5).

### 4.8 Combat, visibility and clearance

- **No gameplay coupling.** Terrain never reads encounters; districts keep out of combat by standing on a flank and in
  fixed slot windows away from arenas. Targets, collisions and progression are untouched.
- **Height.** Every district piece stays under `structureMax`; the tests assert that none is dropped by the cap.
- **Lanes.** Pads keep `lane` from the calm centre route, and the landmark stands on the outer half of its lot, away
  from the lane.
- **Paths.** District pieces, and the lots behind the hub, are solid to every road and pipeline search (`gridSteps`);
  only the hub's yard is open to roads arriving at its gates.
- **Battery plants.** `reservedSites()` passes the pads in the window to the plants and the legacy emplacement pieces,
  which keep out of them, so no clearing ever hides a district piece. Batteries never move.
- **Low tier.** Only placements marked `cosmetic` drop (extra light masts, the hauler on the second track, some
  containers); silhouettes stay.

## 5. Khepri refinery districts

### 5.1 Placement

`KHEPRI_DISTRICTS` (`src/world/settlement-grammars.ts`, policy `khepri.v1`): slot k's window is
`first + k · period` to `+ length`, and the planner looks first for the process lot in the preferred band (`prefer`, s
520–580 in slot 0). Slot 0 lies in Rolling Thunder's run-up to the Bastion arena; on an endless route a slot shows only
where Khepri generates that stretch. Arena margins (`arenaBefore`, `arenaAfter`), the quiet buffer, the lane clearance
and `structureMax` are in the policy.

Khepri's landform grades the flanks of every slot's preferred band (`districtGrade` in `src/world/terrain-layout.ts`,
[docs/26 §2](26-terrain-relief.md#2-khepri-the-level-field-and-its-moods)): gentler benches, fewer mesas and shallower
canyons, so terraced lots and a drivable link are found often. Measured 17 November (terrain version 22, seeds 1–40):
slot 0 holds a district for 23 seeds and slot 1 for 21; the test requires at least 22 in slot 0. Rolling Thunder shows
at most one district, an endless Khepri stint at most two, each at least 80 units from a planet seam (tested).

### 5.2 Layout

The graph `KHEPRI_REFINERY` (`khepri.refinery`) has two lots, a gap of 5, 6 or 7 units between their pads, cut and fill
up to `maxCut` and a level step up to `maxStep`. Together they cover about 10 × 40 units on one flank, from about 2
units off the centreline to the world's edge.

| Lot | Pieces |
| --- | --- |
| **Hub** (cargo zone, lateral centre 6–7.6 from the centreline) | Two rows of crawler track (`infra_track_segment`; the second row three times in four) with haulers parked on them; containers; an admin block (`infra_habitat_1`, often); a power relay with a solar array (together, often); two light masts. Gates `end` (at the hub's far end from the process lot) and `inner` (on its lane side) |
| **Process lot** (lateral centre 6.4–7.3) | The landmark `khepri_processing_tower` on its outer half; one or two processing halls (`facility`) turned so their flat wall meets the header; storage tanks (`tank_horizontal`, sometimes `tank_sphere`); a container; three light masts. One large-pipe header runs from a closed valve at the far end through four tees, each feeding a vertical tank (the one by the closed end seven times in ten; an unbuilt tank's tee is a plain straight), then an inline valve as the junction and a tee that splits to the first hall and, by an elbow, to the tower's socket |

Pieces marked cosmetic: the second track's hauler, one container on each lot and three of the five light masts.

### 5.3 District kit

`khepri_processing_tower` (`public/assets/khepri/district-kit.glb`, built by `tools/blender/kit_khepri_district.py`
after item 01 of the Khepri facility sheet): footprint 3 × 3, top 3.5, skirt to −0.05, large-pipe stubs ending in half
flanges at the middle of each face (the registry's sockets), a 9,000-triangle budget. It uses the infrastructure kit's
construction and materials, so the runtime infrastructure material draws it alike, casts a real shadow on High, and has
a code-built stand-in until the kit loads. It is the only district-kit node.

### 5.4 Roads at a district

- **The hub always gets a road.** Its chain edge looks five cells ahead (its own claimed cells are empty) and falls back
  to a map exit; its edges carry roads only. The other lot has no edges of its own: it joins through the hub.
- **Gates.** `gate()` sends a network road to the hub gate nearest the road's far end.
- **Internal roads** (`districtRoadsSteps`): the spine continues the main gate's network road from its exact tip
  through the hub yard and across the gap to the process lot's yard, where it opens onto the pad; another gate a network
  road reaches gets a spur to the hub yard, and further roads at a gate get a short link. Corners curve on a 2.5-unit
  radius. They are built on the arena-free world from the network roads that world keeps, so no spur dangles.
- **Pipelines.** No external pipeline joins a district; its pipework is all internal.

### 5.5 Validation

`tests/world/terrain-districts.test.ts`:

- plans in most slots, identical whether planned at once or in resumable steps, with both flanks and directions;
- terraces within the window, the world and the lane clearance, under the structure cap;
- no stacked pieces; pipework joined end to end at pad level, open ends only at module sockets or closed valves;
- every piece owned once in any section order, none dropped at a seam or the cap; streaming from prefetched work equal
  to synchronous generation;
- network roads reaching the gates, internal roads ending at gates and yards and avoiding pieces;
- the quiet buffer; at most one district in Rolling Thunder and two per endless Khepri stint, clear of arenas, seams
  and jumps; without the policy, outposts and sections are exactly the district-free ones;
- road ends: fades, aprons and joins, seam safety, the wear patch, and the switch back to square-cut ends.

Also `tests/world/settlement-modules.test.ts` (§4.3), the district sweep in `tests/world/terrain-budget.test.ts` and
the plant reservation case in `tests/world/facility-placement.test.ts`.

**Fixture:** `tests/fixtures/khepri-district.html` shows Rolling Thunder's terrain frozen at any `seed`, `distance` and
camera `x`, with `quality=low`, `battery=x,s` (one battery seated there), `fly=from,to,speed` (streams the stretch and
reports terrain work timings) and `legacy=1` (no districts, square-cut road ends).

**Render cost** (measured 17 November, the budget test's sweep over the districts of seeds 11 and 93, s 470–600, with
the shipped kits and an orthographic camera across the whole lateral range): High at most 55 draw calls and 43.9k
triangles (mean 26.1k), Low at most 49 calls and 40.4k triangles. The budget is 70 calls and 90k triangles. Device
measurements are in [docs/36](36-mobile-performance.md); no phone test has measured a district specifically.

## 6. Open

- **Pieces still to model:** a pipe manifold or four-way cross for the junction; a foundation plinth or retaining wall
  for lot edges (pads rely on cut-and-fill banks up to `maxCut`); a power relay spire; a bridge-gate; a large factory
  hall.
- **External pipelines** to a district's pipework.
- **Other worlds' districts** (a Vesper dockyard, a Nacre sanctuary) and graphs with more than two lots: the planner
  handles a hub and one lot only.
- **Parallel size tables.** `MODULE_HEIGHT`, `SHARED_BOUNDS`, `INFRA_NODES` and `VESPER_INFRA_NODES` are held equal to
  the registry by a test; `moduleReach` (`src/world/terrain-network.ts`), the occupancy radii in `src/world/terrain.ts`
  and `CASTER_NODES` (`src/render/terrain-view.ts`) are separate copies of node sizes and shadow flags.
