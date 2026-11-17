# Terrain relief, cliffs and walls

How the ground of Khepri, Vesper, Luna and Nacre is shaped, how its cliffs are drawn crisp, and how real wall geometry
and rock textures stand along them. The later worlds' landforms are in their own docs (§7); outposts and districts on
the relief are [docs/23](23-settlement-infrastructure.md), each world's look and kits its world doc.

The user's direction: varied, multi-level relief instead of "two plateaus" (20 October); crisp cliff walls where the
landform is a cliff and smooth hills elsewhere, real wall geometry after `art/concepts/01-worlds-direction.png`, rocky
wall textures, Vesper half water, and more relief on Vesper and Nacre (21 October); sharp fractured ice walls only where
they count (22–23 October). The decisions are in [docs/08](08-decisions-and-sources.md).

## 1. Shared rules

- **Scenery only.** Terrain never reads or changes combat, collisions, targeting, encounter timing or loot. Every height
  is a pure function of the seed and world position ([§9](#9-determinism-streaming-and-versions)).
- **The flight plane never moves for scenery.** Combat stays at `VIEW.flightHeight` (`src/shared/contracts.ts`);
  relief extends downward instead. Every world keeps its scenery under a cap 0.8 below the plane; only a few landmark
  kinds of the late worlds reach higher, still under the plane (the scatter sink's `tall` cap), and battery plants keep
  their own roof rule ([docs/25](25-modular-facilities.md)).
- **Range.** Ground spans `TERRAIN_MIN_HEIGHT` to `TERRAIN_MAX_HEIGHT` (`src/world/terrain-layout.ts`, −10 to 2.4);
  each world's landform stays within it:

  | World | Ground | Sea | Scenery cap |
  | --- | --- | --- | --- |
  | Khepri | −10 … 2.4 (canyon floors near −9, mesa tops near 2.4) | none | `SCENERY_MAX_HEIGHT` |
  | Vesper | seabed … 2.4 (shelves from just above the sea up to 2.3) | `VESPER_SEA_LEVEL` | `VESPER_SCENERY_MAX` |
  | Luna | −5.5 … 2.4 | none | `LUNA_SCENERY_MAX` |
  | Nacre | −4 … 2.4 | `NACRE_SEA_LEVEL` | `NACRE_SCENERY_MAX` |

  The caps are all 3.0 today. Ground-target seating (`src/sim/ground.ts`, `src/render/scene.ts`), the shadow slab and
  the camera's footprint all read `TERRAIN_MIN_HEIGHT`, so they follow the deepest floor.
- **Grid and mesh.** Heights are sampled on the `TERRAIN_STEP` grid (a quarter unit, binary-exact so seams share
  coordinates). Nearly flat 2 × 2 blocks are merged into one quad (`FLAT_TOLERANCE`) without cracks; each quad splits
  along its flatter diagonal, so triangle edges follow rims. The mesh runs `MESH_APRON` units of plain ground beyond
  each world edge for the perspective camera, which sees wider at its far end; pieces, pads and roads stay inside.
- **Calm routes.** The centre route and the side routes (`ROUTE_AXES`) soften the relief around them (`routeCalm`), never
  walling them off.
- **Shading.** The section bakes its cast shadow by marching the height grid toward the sun (about 11 units), plus a
  darkening at cliff feet; the ground shader adds the crisp-cliff look (§10), wall maps (§11) and cracks (§12).

## 2. Khepri: the level field and its moods

Khepri's landform is `landform` in `src/world/terrain-layout.ts` (the macro geography is also
[docs/13 §2](13-khepri-world.md#2-procedural-layout)). It starts from a smooth regional **level field** (`levelField`):

- domain-warped massifs and ridgelines, plus a mid-scale swell about 12 units across that puts several bench levels
  into one view;
- in escarpment country, a long regional ramp that turns slowly and never runs along the flight line;
- calm routes pulled toward their own region's level (not one global level);
- a strata warp (`STRATA`), so thick and thin beds alternate and the benches are not all one height.

**Moods** (`MOODS`, `MOOD_PARAMS`): seeded regions of `MOOD_LENGTH` units with blended edges, shuffled in blocks and
never the same twice in a row. Each sets elevation bias, relief, canyon carving and depth, terracing and riser height,
mesa and butte density, dunes and the escarpment tilt.

| Mood | Character |
| --- | --- |
| canyons | High benches cut by deep, wide, ledged canyons (floors near −9) |
| mesas | Mesas of several heights and stepped tiers on mid ground |
| basins | Low floors with pools and many buttes |
| flats | Mineral flats, gentle relief, shallow washes |
| dunes | A dune sea with a few buttes |
| escarpment | The regional ramp, stepped into tall benches |

**District grading** (`districtGrade`): around every refinery district slot's preferred band (`GRADE_REACH` either
side of it, fading over 12 units more) both flanks (|x| beyond 2–4) keep gentler benches, fewer mesas and shallower
canyons, so a district finds level lots linked by drivable grades
([docs/23 §5.1](23-settlement-infrastructure.md#51-placement)). It reads the slot window only, never the plan, so the
planner can read the landform.

## 3. Khepri: benches, canyons, mesas and dunes

- **Benches** (`bench`): the level field is cut along its contours into flat steps. Each riser is a crisp cliff of fixed
  width in world units (`RISER` times the step, at least `RISER_MIN`), so it never aliases on the grid; where contours
  crowd closer than that the smooth slope stays. Riser height (the mood's `step`) and the bench offset drift from region
  to region, so plateaus in different places stand at different heights. Fine relief moves only the cliff edges, into
  spurs and bays; the benches stay flat. Here and there ramps soften the steps into talus slopes so roads can climb.
- **Canyons:** dendritic contour lines of warped noise at two scales, at any angle. The distance to each centreline
  shapes them: flat floors 1–6 wide that sink deeper and open wider in canyon country, walls about 3 steep with a sheer
  face over their top 45% carrying 75% of the drop (`cliffTalus`), stepping down in ledges with their own crisp rims.
  Tributaries are narrower and at most 3.2 deep.
- **Mesas and buttes:** at most one per 12-unit lattice cell (`mesaCell`, memoized and pure in seed and cell), read at
  its own centre: a flat cap-rock top at its own height over the ground it rises from, a sheer riser whose width grows
  with the drop, and a talus apron. Some mesas carry a smaller second tier; buttes are small and tall. Fewer stand near
  the routes.
- **Dunes:** crests across the wind from the upper left, gentle backs, short slip faces, finite lengths.
- **Detail:** mid-frequency erosion relief, occasional impact craters (`crater`), terraced mineral pools in the lowest
  valleys and vein networks across calm low ground ([docs/13 §1](13-khepri-world.md#1-visual-target)).
- **Outpost sites** choose level ground and avoid high ground where their tallest pieces would sink the pad; pad floors
  reach down to `TERRAIN_MIN_HEIGHT` + 1 ([docs/23 §3.1](23-settlement-infrastructure.md#31-outposts)).

## 4. Vesper: shelves, sea and ice

Vesper's landform is `vesperLandform` in `src/world/terrain-vesper.ts` (identity and kits:
[docs/17](17-vesper-glass-frontier.md)).

- **Sea.** The sea stands at `VESPER_SEA_LEVEL` (−3.6, lowered on 21 October so the ice walls stand as tall as Khepri's
  canyons). Everything afloat reads the planet's sea level: the HELION ARK, ground batteries on pontoons, floes, piers,
  icebreakers and splashes.
- **Land and water.** A warped shelf-mass field against a per-mood threshold makes the land; narrow winding leads and
  fjord-like inlets cut into it with sheer sides. Vesper is half land and half water over long stretches (user,
  21 October; `tests/world/terrain-vesper.test.ts` holds the mean within 0.45–0.55 and each seed within 0.4–0.6).
- **Shelf levels.** A smooth shelf level (the mood's `top`, a regional swell and a climb inland from the coast) is cut
  by `bench` into flat shelves one to several tiers over the water, between low ice feet at the coast (just above the
  sea) and the highest shelves (2.3). Steps are the mood's `step` tall behind sheer ice cliffs half a unit wide; edges are
  ragged, and snow ramps soften a step here and there.
- **Ice plateaus** (`icePlateau`): tabular blocks one or two tiers over their shelf behind sheer `crispStep` walls, like
  Khepri's mesas (the mood's `mesa`).
- **On the shelves:** pressure ridges (0.6–1.2), wind-packed drifts, crevasses 2.4 deep that never open to the sea and
  run diagonally across the flight line, and nunataks: dark rock peaks up to about 3 over the ice with snow caps. Rock
  keeps back a unit or two from every coast, lead and inlet, where a bare rock face would have no ice wall.
- **Moods** (`VESPER_MOODS`, `MOOD_SETTINGS`): shelf coast, pack-ice sea (in about every other block, never the opening
  segment), crevasse plateau, radiator plains, icefall (many short steps with ridges along them) and nunataks.
- **Colour:** only true cliff faces turn to blue ice (vertex slope 1.5 and steeper), only steep rock flanks show
  charcoal, and a pad that flattened a crevasse keeps its snow.

## 5. Vesper: outposts on the ice

Vesper's outposts ([docs/23 §3.1](23-settlement-infrastructure.md#31-outposts)) are fitted to the shelves:

- A pad keeps its own shelf's level, snapped to a quarter unit, so it never sinks into a pit; pieces too tall for the
  room under the cap there are swapped for lower ones (`LOWER`: comm needle to habitat, missile site to cannon site, tall
  tanks to a horizontal tank, and so on). Site choice prefers flat, lower shelves.
- Candidates start at about a third of the half width out, so some outposts stand in view beside the centre lane.
- A narrow lead under a pad is filled at pad level like a causeway, its rim a sheer quay (`rowPoint` in
  `src/world/terrain-ground.ts`); at most 15% of a pad may stand over water. A harbour keeps its cliff and the open sea
  in front of it, and stands only on a low ice foot, so its jetty never hangs far under the crane.
- Vesper's buildings cast real shadows on High (`CASTER_NODES` in `src/render/terrain-view.ts`), vent stacks stand on
  pad fringes, and ice walls may stand right beside a pad (§11).

## 6. Luna

Luna's landform is `lunaLandform` in `src/world/terrain-luna.ts` (the world: [docs/19](19-luna-training.md)).

- **Moods** (`LUNA_MOODS`): highland, mare, basin rim and crater field, shuffled, never the same twice in a row.
- **Highlands:** rolling ground, ridged massifs (montes) up to about 2, strongest in a basin's rim, and lobate scarps:
  curving one-sided steps of about 0.8, broken into finite lengths.
- **Maria:** low dark plains around −1.6, with wrinkle ridges up to 0.7 and sinuous flat-floored rilles 1.5 deep.
- **Craters** (`CRATERS`, `lunaCraters`): four families from 15-unit basins to small bowls, memoized per cell; each
  fresh (deeper, sharper rim), mature, or old and worn. Big craters have flat floors, terraced walls and a central peak;
  young ones throw a bright ejecta apron. Maria keep fewer.
- **Cliffs:** rims are crisp (`cliffs: true`) but Luna keeps smooth normals (§10), and it has no wall pieces: its
  scarps never reach the sheer slope the walls need. Its ground walls take a darker regolith and the cliff-rock map.

## 7. The other worlds

| World | Relief | Walls |
| --- | --- | --- |
| Nacre | §12 | None |
| Amnion | [docs/27 §3](27-amnion-brood-wastes.md#3-world-generation) | Flesh walls (`fleshWall`) on canyon lips |
| Umbra | [docs/28 §4](28-umbra-eternal-eclipse.md#4-world-generation) | Obsidian walls (`voidWall`) on broken stretches of the lips |
| Corona | [docs/37 §3](37-corona-dying-star.md#3-world-generation) | Khepri's basalt walls (`cliffWall`), charcoal, feet down to the plasma |
| Nahara | [docs/39 §4](39-nahara-silent-empire.md#4-world-generation) | Carved masonry fronts (`nahWall`), placed by its own scatter |

The late worlds use the same machinery: `bench` and the cliff profiles (§10), `cliffWallSteps` (§11, except Nahara),
the wall look in the ground shader, and the scatter sink.

## 8. Roads, pipelines, pads and arenas on relief

- **Roads** never climb a riser: their search forbids grades over `ROAD_MAX_SLOPE`, so they take the ramps, and a road
  that cannot reach its goal is not built ([docs/23 §3.4](23-settlement-infrastructure.md#34-roads)). Ribbons drape on
  the ground.
- **Pipelines** cross cliffs on risers and canyons on trestles; racks fit under the cap almost everywhere, and on mesa
  tops near it a small line rests on the ground ([docs/14 §4](14-shared-industrial-kit.md#4-runtime-use)).
- **Pads** flatten the ground around them (`padInfluence`); district lots are terraced at their own levels
  ([docs/23 §4.5](23-settlement-infrastructure.md#45-planning)).
- **Ground targets** stand on whatever level their position lands on, with a foundation plinth on
  slopes ([docs/13 §2](13-khepri-world.md#2-procedural-layout)); battery plants rest their buildings on foundation
  blocks ([docs/25](25-modular-facilities.md)). Seating never changes targeting.
- **Boss arenas** settle only an irregular clearing around the boss (`arenaAt`, `ARENA_CLEARING` in
  `src/world/terrain-arena.ts`); the planet's relief carries on beyond it, and its far end fades out over a long tail, so
  the ship departs over no cut. Jumps swap planets under the veil. Both are
  [docs/18 §3](18-endless-planet-cycle.md#3-world).

## 9. Determinism, streaming and versions

- Every field is a pure function of the seed and world position; the mesa, crater, Vesper pad-spot and outpost caches
  are pure. Sections are identical in any order, for every world and seed, and seams match bit for bit
  (`tests/world/terrain.test.ts`).
- Generation runs in resumable steps (`sectionSteps`, `src/world/terrain-work.ts`) within the stream's frame budget,
  with output identical to synchronous generation (`tests/world/terrain-stream.test.ts`).
- `TERRAIN_VERSION` (`src/world/terrain.ts`) is 22; the comment above it records what each version changed. A
  deliberate change re-records the fingerprints, with the reason in the test: Khepri's in
  `tests/world/terrain-vesper.test.ts`, Nacre's in `tests/world/terrain-nacre.test.ts`, every world's scatter in
  `tests/world/scatter-fingerprint.test.ts`.

## 10. Crisp cliffs

A cliff meets its top in a hard crease, and smooth ground stays smooth (user, 21 October: "sharp and crisp cliffs in some
places, real cliff walls, while in other places its still a smooth hill").

- **Profiles** (`src/world/terrain-layout.ts`): `cliff` is steepest at the rim and eases into the foot; `cliffTalus`
  carries most of the drop on a sheer face over a concave talus; `crispStep` keeps a smoothstep's lower half (so a
  waterline or bank foot stays put) and then runs straight up into the rim. Khepri's bench risers, mesa caps and tiers,
  canyon walls, ledges and tributaries; Vesper's ice steps, coasts, leads, inlets, plateaus and crevasse lips; Luna's
  scarps, rilles and big crater ledges all use them.
- **Vertex colour.** On worlds with `cliffs: true` (Khepri, Vesper, Luna, Corona, Nahara) colour and the rock mask read
  the gentler one-sided slope per axis (`crispSlope` in `src/world/terrain.ts`), so a rim or foot vertex keeps its flat
  side's colour and only vertices inside a wall take the wall's.
- **Ground shader** (`src/render/terrain-kit.ts`, per world in `WALL_LOOK`; Nacre has none and keeps its smooth look):
  - each triangle's own plane, from screen derivatives, decides top or wall (`cliffSteep`; Vesper turns to ice only
    from about 65°), so the line between a top triangle and a wall triangle is a hard edge;
  - walls take their own hue and shade at the ground's baked light; Khepri's split into vertical columns, each in its
    own tone with dark seams;
  - a flat-lying triangle at a rim or cliff foot is shaded by its own plane, so tops stay flat to their edge; wall faces
    keep smooth normals (faceting showed the grid's steps);
  - Luna keeps smooth normals everywhere (its many small bowls would facet into blocks) but still takes the darker
    regolith per face;
  - camera-facing walls are lifted a little so dark faces show their detail (only a trace under a sun behind the ship);
  - Vesper's ice walls split pale cyan-white lit ice from deep blue shadowed ice in vertical fractured columns; where a
    wall curves, its maps and columns move onto fixed projections so they never bend into wavy bands (user, 22 October).

## 11. Cliff walls and rock textures

### Placement

`cliffWallSteps` (`src/world/terrain-walls.ts`) stands real wall geometry in the crisp cliffs; the heightfield keeps its
cliff and the wall stands in it.

- **One candidate per `WALL_CELL` lattice cell**, owned by the section holding the cell's centre, so each cell is
  decided once whatever the load order. The cell takes the steepest of 16 probes (slope at least 1.4), slides along the
  cliff toward its centre (even spacing along a rim), then walks up to the rim and down to the foot of the sheer face.
- **The piece:** front (+Z) out and downhill, top flush with the rim, foot just under the ground (a foot over water
  stands just under the waterline), y scaled by the drop, a seeded variant and width; segments overlap their neighbours a
  little. Each tier of a stepped cliff gets its own wall.
- **Never:** on roads, pads or industrial ground, on arena platforms or ramps (unless the world allows it), past the
  world's edge, over the scenery cap, or on knife-edge ridges and slivers (the ground must carry on behind the wall).
  Never twice at one spot (user, 5 November). Never collision: walls are kit instances, no target proxies.
- **Per world** (`WallOptions`):

  | World | Kind | Rules |
  | --- | --- | --- |
  | Khepri (`scatterKitSteps`) | `cliffWall` | Every cliff with a drop of 0.6 or more; rim crowns and foot rubble are sparser so the walls read |
  | Vesper (`vesperScatterSteps`) | `iceWall` | Drops of 1.2 or more; every face of 1.8 or more (crevasse and ridge regions too, never rock), lower faces only away from crevasses, ridges and rock; none turned away from the camera (`maxAway`); only in runs of three or more along a rim (`minRun`); tops follow the highest rim across the segment (`rimSpan`); larger segments that reach back over the rim; allowed beside outpost pads (user, 22–23 October) |
  | Amnion, Umbra, Corona | `fleshWall`, `voidWall`, `cliffWall` | Their own options; see their docs (§7) |
  | Luna, Nacre | none | |

- **Render** (`src/render/terrain-view.ts`): walls cast real shadows on High, and each moves a few centimetres along its
  face and up (`WALL_NUDGE`, `WALL_LIFT`), so overlapping neighbours never fight for the same pixels on a phone's depth
  buffer (user, 5 November).

### Kits

Each wall node is one 2-unit segment that tiles along x, front toward +Z, pivot at the base centre, top at exactly 1
(`KIT` in `src/world/scenery-kit.ts`). Up to 650 triangles each. Code-built stand-ins draw until a kit loads; the terrain
view loads a world's cliff kit with its scenery (`ensurePlanet`).

| File | Nodes | Builder (`tools/blender/`) | Look |
| --- | --- | --- | --- |
| `public/assets/khepri/cliff-kit.glb` | `cliff_wall_*` | `kit_cliffs.py --world khepri` | Dark charcoal-brown slabs in vertical cleavage, flat sand-dusted rims, teal crystal seams; Khepri, and Corona in charcoal |
| `public/assets/vesper/cliff-kit.glb` | `ice_wall_*` | `kit_cliffs.py --world vesper` | Irregular overlapping narrow ice chunks (`fractured_wall`), four in five rim chunks flush with the shelf and snow only there, a dark mass behind, fallen chunks at the foot |
| `public/assets/amnion/cliff-kit.glb` | `flesh_wall_*` | `kit_cliffs.py --world amnion` | [docs/27](27-amnion-brood-wastes.md) |
| `public/assets/umbra/cliff-kit.glb` | `void_wall_*` | `kit_cliffs_umbra.py` | [docs/28](28-umbra-eternal-eclipse.md) |

Nahara's `nah_wall_*` fronts are in its ruin kit ([docs/39](39-nahara-silent-empire.md)).

### Rock and ice textures

Detail maps hold a luminance ratio (0.5 neutral) and normal maps the surface; colour stays with the palette and vertex
colours. Both are built by `tools/blender/textures_cliffs.py`.

- `public/assets/khepri/textures/cliff-rock-{detail,normal}.jpg` (512 px, from Poly Haven's CC0 `cliff_side`;
  provenance in `art/source/polyhaven/README.md`): Khepri's walls and Luna's ground walls.
- `public/assets/vesper/textures/ice-wall-{detail,normal}.jpg` (1024 px, procedural; `--only vesper`): straight
  fractures as sharp dark lines with a bright lip, faceted plates between them and faint strata.

On the ground's wall triangles the map replaces the basalt detail at one tile per `WALL_TILE` along the wall and up the
drop, so ledges lie level; the normal map applies on High only. The wall pieces use their own program (the kit wall
material, `khepri-kit-wall`): the map runs along each piece in world units, tops keep a quieter grain and Khepri's caps
darken to weathered rock. Strength per world is `WALL_DETAIL`. Khepri's maps load with the Khepri textures before a
flight; Vesper's load with its scenery in the terrain view's prepare. A missing map leaves the procedural detail.

## 12. Nacre's relief, the crack network and compounds

### Nacre

`nacreLandform` (`src/world/terrain-nacre.ts`; the world is [docs/20](20-nacre-luminous-mire.md)): islands about half
the area, cut by winding channels, rise from a shallow bed under the mire's water. Low mossy shelves line the shores and
roll into low hills; in the island interiors black rock massifs rise up to about 3 over the shore, their heights drawn
toward 0.35-unit steps so they read as stacked ledges (more relief since 21 October: "more elevation changes and
mountains"). Ridges and ledge tops catch a cold blue light so the massifs read in the dark. The boss arena opens the
mire around THE VEIL. Nacre has no crisp-cliff shading, no wall pieces and no cracks: its smooth look stays as it was
when the user held it up as the example (20 October: "Nacre is pretty amazing").

### The crack network

A tileable 512² crack texture (`createCrackTexture` in `src/render/terrain-kit.ts`) is generated on the device once a
session (Vesper and Luna build it while their world is prepared, the late worlds when their look is first set):
polygonal plate cracks with jagged, broken edges and a patchy finer crisscross (and, for Umbra, wider bevelled seams).
The ground shader samples it at two scales (9- and 4-unit tiles, both dividing the section length) on open ground only,
never on walls (after the concept's "fine crisscross lines across the ice and snow", 21 October). Strength and tint per world: blue-grey on Vesper, dark fractures on Luna, and the late
worlds' own (Amnion, Corona, Umbra); none on Khepri, Nacre or Nahara.

### Compounds

Outposts stand beside partners and are joined by roads and pipelines (21 October; `compoundSlot`,
[docs/23 §3.2](23-settlement-infrastructure.md#32-compounds)). On the relief this means pads a few units apart on the
same shelf or bench, Luna's bases in pairs facing across the route on rover tracks, and Vesper pads that may bridge a
narrow lead (§5).

## 13. Measurements

Measured 17 November 2026, terrain version 22, by a throwaway Node probe over the real generator.

**Relief:** the height span (p5 to p95) of ground at or above the sea in 12 × 26 views (seeds 1, 93 and 8831, s 0–900,
views centred at x −6, 0 and 6).

| World | Median span | Views flatter than 1.5 |
| --- | --- | --- |
| Khepri | 3.42 | 10% |
| Vesper | 3.54 | 3% |
| Luna | 1.82 | 35% |
| Nacre | 2.28 | 11% |

**Walls:** per 36-unit section (seeds 11, 55 and 93, sections 1–12): Khepri 38.9 basalt walls, Vesper 25.6 ice walls.

**Cost:** the terrain stays within 70 draw calls and 90k visible triangles on High, and Low never costs more
(`tests/world/terrain-budget.test.ts`; the latest district sweep is in
[docs/23 §5.5](23-settlement-infrastructure.md#55-validation)). The crack texture took about 150 ms of main-thread time
to generate on desktop (21 October). Device numbers are in [docs/36](36-mobile-performance.md).

## Open

- No phone has measured the relief, walls or crack generation specifically.
- Seen in the 21 October reviews and not revisited since: diagonal rims follow the quarter-unit grid's triangle edges and
  can show small steps (Vesper's crevasse lips too); wall pieces overlap at tight bends, and a two-tier canyon wall shows
  two rows of caps; Nacre's dark palette hides some of its relief.
- A narrow sliver of shelf between a coast and a lead shows bare heightfield facets at the waterline (left as is, user,
  22 October).
