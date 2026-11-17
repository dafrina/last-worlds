# Khepri world: look, layout, and asset kits

Khepri, the Rust Expanse, is the campaign's first planet proper (Rolling Thunder, [docs/15](15-rolling-thunder-and-bastion-9.md))
and the first world of the endless cycle. This doc describes its visual target, the rules of its seeded world generator,
the contracts of its Blender kits (terrain, infrastructure, district, craft), and its render budget. Relief and cliffs
in depth are in [docs/26](26-terrain-relief.md); districts in [docs/23](23-settlement-infrastructure.md); facility
compounds in [docs/25](25-modular-facilities.md).

## 1. Visual target

The references are `art/concepts/02-portrait-combat.png`, `art/concepts/03-minimal-hud.png` and the left panel of
`art/concepts/01-worlds-direction.png`; the user likes these images. They are references only, never runtime
backgrounds. Khepri takes their terrain language, simplified for phones:

- **Ground:** warm rust-ochre dust with fine grain and sparse dark pebbles. No texture confetti; detail must read at
  phone size.
- **Columnar basalt:** the defining feature. Mesa walls of clustered vertical polygonal columns, dark warm basalt sides,
  dusty ochre tops, broken and stepped tops, talus at the base.
- **Turquoise mineral seams:** glowing cyan pooled at cliff feet and running into cracks, plus small crystal clusters.
  An accent, not a river.
- **Alien, not Earth desert** (user): the strangeness is mineral. Fan-shaped column formations, towering stacks, tilted
  column fields, glowing vein networks across the plains, terraced mineral pools in valley floors, crystal growths
  breaking out of cliffs, hoodoos with balanced caps. Vegetation-like life belongs to Nacre.
- **Composition:** the concepts' materials, formations and light, not their corridor framing. The user wants natural
  valleys and mountains "as if the landscape is miniaturized" (a tabletop relief of real geography), while
  infrastructure, vehicles and turrets keep their readable game size.
- **Light:** a warm sun from the upper left, so column tops are lit, camera-facing faces are darker, and shadows fall
  toward the lower right. A cool teal and violet haze settles in deep valleys against the warm sun, and a low fog lies in
  the lower half of the relief. The values are the user's playground tuning (22 October): `LOOKS.khepri` in
  `src/render/scene.ts`; the reflection sky is `createDesertEnvironment` in `src/render/models.ts`.

Colours: the ground palette is `PALETTE` in `src/world/terrain-layout.ts` (dust `#a65a2c`, lit dust `#c47a44`, dark
patches `#8a4424`, minerals glowing `#2fe0d4`); the kit's colours are the palette constants at the top of
`tools/blender/kit_khepri.py`. Enemies, outposts and industry wear Khepri's paint, rusty with orange glow
(`WORLD_PAINT.khepri` in `src/render/world-paint.ts`). Readability outranks fidelity: contrast and density drop wherever
they compete with shots, warnings or targets.

## 2. Procedural layout

Terrain is pure, seeded scenery: it never reads or changes combat, loot, encounter timing or positions. Everything
derives from the run seed plus world coordinates, so sections are identical regardless of load order and join without
seams. The landform field is `src/world/terrain-layout.ts`; the planet profile (`KHEPRI`) is in
`src/world/terrain-planet.ts`; sections, seams and streaming are `src/world/terrain.ts` (`TERRAIN_VERSION`).

The user's decisions of 14 October still set the direction: no artificial corridors of rock walls; natural valleys and
mountains at a miniaturized-geography scale; real vertical depth; ground enemies on every terrain level; an alien look.

- **Landforms first.** The heightfield carries macro geography: mountain massifs and ridgelines, canyon networks that
  branch naturally (dendritic, at any angle, never parallel lanes along the flight), tiered plateaus and mesas, basins and
  passes, at a scale where one landform spans much of the map.
- **Vertical depth.** Ground spans `TERRAIN_MIN_HEIGHT` to `TERRAIN_MAX_HEIGHT`; kit pieces, outpost modules and pipe
  racks stay under `SCENERY_MAX_HEIGHT`, which keeps clearance under the flight plane (`VIEW.flightHeight`). All in
  `src/world/terrain-layout.ts` and `src/shared/contracts.ts`; the relief rules are [docs/26 §2–3](26-terrain-relief.md).
- **Moods along the route.** Seeded regions alternate (`MOODS`: canyons, mesas, basins, flats, dunes, escarpment),
  never the same mood twice in a row.
- **Slope-driven materials.** Steep faces are dark columnar basalt (rock detail plus vertical column striation, in world
  space); flat ground is ochre dust; rims and ledges carry lighter dust; valley bottoms are darker and hold the mineral
  features. Cliffs are crisp, and real cliff-wall geometry stands along big faces (`cliff-kit.glb`,
  [docs/26 §10–11](26-terrain-relief.md)).
- **Kit dressing.** Basalt pieces sit on cliff rims, ledges, outcrops and scree; their small size against the landforms
  sells the miniature scale. Rock fields, talus aprons, fallen columns and boulders fill the ground
  (`scatterKitSteps` in `src/world/terrain-scatter.ts`).
- **Readability.** Plenty of calm ground stays visible; the tallest, busiest features never dominate a view-sized
  window. The centre and side routes (`ROUTE_AXES`) get softly calmer terrain, never walls. Scenery never collides and
  never covers markers: projectiles and markers draw without depth testing.
- **Ground enemies on every level.** Turrets, missile batteries and fuel skids stand wherever their authored position
  lands: valley floors, slopes, ledges, plateaus or peaks. Their gameplay position is their terrain anchor seen through
  the release lens (`src/sim/ground.ts`); the renderer seats them with `groundPlacement` in `src/render/scene.ts`, adds a
  foundation plinth on slopes, and draws a faint silhouette where terrain in front hides one. None of this alters
  targeting.
- **World edges.** The world is `VIEW.worldWidth` wide; the camera stops at its edge, and plain ground continues beyond
  it with no border line (user, 22 October).

### Settlement network

The user asked for varied bases, a fuller world and pipelines and roads between them (14 October).

- **Outposts.** Seeded archetypes (`ARCHETYPES` in `src/world/terrain-settlements.ts`: refinery complex, mining camp,
  processing plant, landing field, comm station, pumping station, wreck site, abandoned outpost), each with its own
  composition, rotation, mirroring and module counts, on flattened ground (valley floors, plateaus, broad ledges) at
  their real game size. Bases gather into compounds and districts (`KHEPRI_DISTRICTS` in
  `src/world/settlement-grammars.ts`; [docs/23](23-settlement-infrastructure.md)). Module sizes and roles are the
  registry in `src/world/settlement-modules.ts`.
- **Network.** Outposts are nodes of a seeded graph; each edge gets a deterministic path search on a coarse grid with a
  slope cost (`src/world/terrain-network.ts`), so every section renders its own part identically.
  - Roads are terrain-following ribbons of graded dust with tyre ruts and berms. They follow valleys and contours, never
    climb cliffs (`ROAD_MAX_SLOPE`), and on Khepri run only where they serve something (`roads: 'purposeful'`, terrain
    version 21).
  - Pipelines are shared-kit pieces: pitched runs on supports, risers up cliff steps and trestles across canyons
    ([docs/14 §4](14-shared-industrial-kit.md#4-runtime-use)).
- **Life.** Haulers drive the roads and amber beacons blink. Motion is presentation only (seed and time), never
  collision or targets; the Low tier may thin it.
- **Density.** Rocks, boulders, rubble and crystal fields are dense, with occasional craters; calm ground stays near
  the routes, and the render budget holds (§4).

## 3. Terrain kit contract

- Source: `tools/blender/kit_khepri.py`, a seeded, deterministic Blender script that builds every piece from code and
  checks this contract on the exported file. The shipped file adds the 18–19 October refinement (sharper chamfers):
  `tools/blender/kit_refinement.py` builds it from `kit_khepri.py`'s pieces through Blender MCP. Running `kit_khepri.py`
  alone exports the kit without that refinement.
- Runtime: `public/assets/khepri/khepri-kit.glb`; node kinds in `src/world/scenery-kit.ts` (`KIT_KINDS`).
- Provenance and rebuild command: `art/khepri-kit/README.md`.

glTF 2.0 binary, +Y up, 1 unit = 1 game unit, no textures, cameras, lights, animation or compression. Top-level nodes
with pivots at base centre (0, 0, 0); every piece extends 0.1–0.15 below y = 0 so it seats on uneven ground.

| Nodes | Content | Bounds (x/z footprint, height) | Triangles each |
| --- | --- | --- | --- |
| `basalt_clump_0` … `_5` | 4–9 irregular 5–7-sided columns, varied heights, mostly flat tops with some broken ones | within 1.6 × 1.6; tallest top exactly 1.0 | ≤ 450 |
| `basalt_column_0` … `_2` | single column or broken stub | within 0.6 × 0.6; top 1.0 | ≤ 80 |
| `rock_0` … `_5` | angular basalt rocks and pebbles | within 1 × 1; height ≤ 0.7 | ≤ 60 |
| `crystal_0` … `_2` | turquoise shard clusters | within 1 × 1; height ≤ 0.8 | ≤ 160 |
| `basalt_spire_0` … `_2` | tall towers of 3–6 columns with ragged tops (buttes, hoodoos, promontories) | within 1.0 × 1.0; top exactly 1.0 | ≤ 450 |
| `basalt_wall_0` … `_2` | cliff-face segments, 6–14 columns in a 2–3-deep band, long axis along x | within 2.6 × 1.2; top exactly 1.0 | ≤ 700 |
| `basalt_fallen_0`, `_1` | toppled and broken columns in rubble | within 1.6 × 0.6; height ≤ 0.5 | ≤ 200 |
| `boulder_0`, `_1` | large angular basalt blocks | within 1.2 × 1.2; height ≤ 0.9 | ≤ 120 |
| `crystal_spire_0`, `_1` | large crystal growths breaking out of rock | within 1.2 × 1.2; tip exactly 1.0 | ≤ 300 |
| `basalt_rosette_0` | fan-shaped cluster of tilted columns | within 1.8 × 1.8; top 1.0 | ≤ 600 |
| `hoodoo_0`, `_1` | eroded spire with a balanced cap | within 1.0 × 1.0; top 1.0 | ≤ 250 |

Exactly two materials: `khepri_basalt` (vertex-colour albedo, rough, non-metallic) and `khepri_mineral` (turquoise,
emissive; a few crack faces of the clumps use it). Basalt carries `COLOR_0`: dusty ochre on upward faces, dark warm
basalt on sides, darker crevices (baked AO). Columns use hard edges. The runtime replaces the materials with its own
shading but keeps the vertex colours and the material split. The file stays under 1.5 MB.

The runtime scales pieces in y to the local cliff height, rotates them, varies their footprint by at most ±20%, and
mixes every variant. It keeps working with code-built fallback geometry while the kit loads or if it is missing. Luna
reuses this kit, greyed (`lunaLook` in `src/render/terrain-kit.ts`; [docs/19](19-luna-training.md)).

Textures are luminance detail and normal maps only; colour stays with the palette and vertex colours. They live in
`public/assets/khepri/textures/`: ground and basalt detail derived from Poly Haven CC0 maps
(`art/source/polyhaven/README.md`), and the cliff-rock maps built by `tools/blender/textures_cliffs.py`. The ground
has no normal map on any tier; the Low tier drops the kit's and walls' normal maps too.

## 3b. Infrastructure kit contract

The code-built outpost props were too cheap next to the modelled terrain (user), so outposts use modelled Khepri
infrastructure: graphite foundry machinery with broad bevels, plate seams, pipes, vents and restrained greebles that
survive phone size; weathered ochre and rust paint; amber work lights; ochre dust on low and upward surfaces. Credible
stylized hard surface, never toy-like.

- Source: `tools/blender/kit_khepri_infra.py` (seeded, deterministic; it checks this contract).
- Runtime: `public/assets/khepri/khepri-infra.glb`; previews and provenance in `art/khepri-infra/`.
- The same glTF rules as the terrain kit, plus `COLOR_0` with baked AO, edge wear and dust, and `TEXCOORD_0`
  box-projected at 1 UV = 1 unit.
- Two materials: the infrastructure body (`khepri_infra` in the shipped file) and `khepri_light`, the amber emissive
  faces the runtime makes glow.
- Pieces are authored at their real game size with pivots at base centre, extending 0.05 below y = 0 (the track is
  flush).

| Node | Footprint x × z | Height | Triangles |
| --- | --- | --- | --- |
| `infra_landing_pad` | 5.4 × 6.2 | ≤ 0.3 | ≤ 1,500 |
| `infra_refinery` | 4.1 × 5.1 | ≤ 1.8 | ≤ 4,000 |
| `infra_relay` | 0.85 × 1.0 | ≤ 1.8 | ≤ 1,200 |
| `infra_cargo_0` … `_2` | 1.05 × 1.75 | ≤ 0.65 | ≤ 900 each |
| `infra_track_segment` | 1.35 × 2.0, tiles seamlessly along z | ≤ 0.05 | ≤ 200 |
| `infra_drill_rig` | ≤ 1.6 × 1.6 | ≤ 2.0 | ≤ 2,500 |
| `infra_habitat_0`, `_1` | ≤ 1.6 × 1.2 | ≤ 0.8 | ≤ 1,200 each |
| `infra_comm_dish` | ≤ 1.2 × 1.2 | ≤ 1.4 | ≤ 1,200 |
| `infra_solar_array` | ≤ 2.2 × 1.2, tiles along x | ≤ 0.5 | ≤ 600 |
| `infra_light_mast` | ≤ 0.4 × 0.4 | ≤ 1.6 | ≤ 300 |
| `infra_silo` | ≤ 1.0 × 1.0 | ≤ 1.8 | ≤ 900 |
| `wreck_0`, `wreck_1` | ≤ 2.4 × 1.6 | ≤ 0.7 | ≤ 1,200 each |

Wrecks are scorched, broken hulls of original design, half-buried and overgrown with turquoise crystal. The cargo
haulers double as road traffic. The runtime places every piece at scale 1 (layout heights follow the authored heights;
`MODULES` in `src/world/settlement-modules.ts`) and tiles track segments along each track. Code-built stand-ins draw
until the GLB loads.

**District kit.** The refinery district's landmark, `khepri_processing_tower` (3 × 3 footprint, top 3.5, large-pipe
sockets at the middle of each face), is `public/assets/khepri/district-kit.glb`, built by
`tools/blender/kit_khepri_district.py` with the infrastructure kit's construction and materials
([docs/23](23-settlement-infrastructure.md)).

**Other Khepri models.** Battery compounds and processing plants come from the facility kit
(`public/assets/khepri/facility-kit.glb`, [docs/25](25-modular-facilities.md)); pipes, tanks and containers from the
shared industrial kit ([docs/14](14-shared-industrial-kit.md)); cliff walls from `public/assets/khepri/cliff-kit.glb`
(`tools/blender/kit_cliffs.py`, [docs/26 §11](26-terrain-relief.md)).

## 4. Budgets and streaming

- **Draw calls and triangles.** Terrain stays within 70 draw calls and 90k visible triangles on High across the whole
  lateral range, over refinery districts too, and Low only ever costs less and works with the fallback kit
  (`tests/world/terrain-budget.test.ts`). Measured frame costs on devices are in [docs/36](36-mobile-performance.md).
- **Culling.** Each kit and infrastructure node is one `InstancedMesh`, refilled with only the in-view instances when the
  camera passes a margin. Ground is split into lateral strips culled by exact boxes. Draw calls are bounded by the node
  count, and triangles track what is on screen.
- **Quality tiers.** Low may thin cosmetic scatter and motion only; it never changes layout, heights or anything the
  simulation reads.
- **Streaming.** Generation is resumable (`src/world/terrain-work.ts`): sections are generated ahead of need within a
  per-frame budget (`PREFETCH_BUDGET_MS` in `src/render/scene.ts`). Incremental output is identical to synchronous
  output by construction.
- **Determinism.** No `Math.random()` anywhere in generation.

## 5. Enemy craft

Khepri's faction, after the KHEPRI column of `art/concepts/05-alien-factions.png`: weathered ochre and gold plates over
a graphite frame, with amber glow. `tools/blender/craft_khepri.py` builds `public/assets/khepri/khepri-craft.glb`
(`khepri_dart`, `khepri_lancer`, `khepri_weaver`, `khepri_turret`; provenance in `art/khepri-craft/README.md`). The
craft follow the same conventions as the other worlds' craft: +Y up, game units, noses and muzzles toward +Z (the
player). Luna flies the same models in its own paint. The boss is BASTION-9 ([docs/15](15-rolling-thunder-and-bastion-9.md)).

## Open

- The shipped `khepri-infra.glb` names its body material `khepri_infra`; `kit_khepri_infra.py` now writes
  `kit_khepri_infra` (renamed on 17 November along with the script). The runtime only looks for `light` in material
  names, so a rebuild still renders, but the script constant should go back to `khepri_infra`.
