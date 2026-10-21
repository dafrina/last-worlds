# Terrain relief (terrain version 13)

User, 20 October 2026: "Nacre is pretty amazing but the others are a bit too flat often. Vesper doesn't seem to render a lot of infra buildings etc. Generally it feels like there's two plateaus, but the terrain should be varied much more. That's why I was asking to raise the world level if needed."

This pass changes the relief of Khepri, Vesper and Luna, and Vesper's outposts. Nacre is untouched, byte for byte (a fingerprint test guards it). Terrain stays scenery: it never reads or changes combat, collisions, targeting, timing or loot.

## 1. What made it flat

| World | Version 12 | Effect in a 12 × 26 view |
| --- | --- | --- |
| Khepri | Four terraces at **fixed absolute heights** (−6.3, −4.2, −2.2, −0.1, 2.0); the centre route compressed toward one global mid level | Every plateau in view stood at one of the same two or three heights |
| Vesper | Land = one shelf band (0.6–2.0, mostly 1.0–1.5) with a little noise; sea below | Ice shelf and water: literally two levels |
| Luna | Rolling ±0.65 and shallow craters; low, smooth maria | Relief under 1.2 in half the views |

## 2. Vertical range

The flight plane stays at **3.8** (`VIEW.flightHeight` unchanged); no shared constant or simulation file changed. The relief extends downward and uses headroom that Vesper and Nacre already used.

| | Version 12 | Version 13 |
| --- | --- | --- |
| Terrain clamp (`TERRAIN_MIN_HEIGHT` … `TERRAIN_MAX_HEIGHT`) | −8 … 2.0 | **−10 … 2.4** |
| Khepri, measured | −7.3 … 2.0 | −9.9 … 2.4 (canyon floors about −9, mesa tops up to 2.4) |
| Khepri scenery cap (`SCENERY_MAX_HEIGHT`) | 2.2 | **3.0**: 0.8 under the plane, as on Vesper and Nacre and for Khepri districts (docs/23 §4.2 A) |
| Vesper land | 0.6 … 2.0 (seabed to −4.3) | −0.45 … 2.4 (seabed unchanged) |
| Luna | −3.8 … 1.7, cap 2.2 | −5.5 … 2.4, cap **3.0** |

Everything that depends on depth follows `TERRAIN_MIN_HEIGHT`: the ground-target seating search (`groundPlacement`, `rayPlacement`) and the shadow slab. The camera's far plane (100) is well beyond the deepest floor. Battery compounds keep their own rule (roofs 0.45 under the plane, a plant sinks at most 0.35); on the highest tops the composer picks lower modules, as before at 2.0.

## 3. Khepri (`src/world/terrain-layout.ts`)

The landform now starts from a smooth **level field**: domain-warped massifs and ridges as before, plus a mid-scale swell, an escarpment ramp in staircase country, calm routes pulled toward *their region's own* level, and a strata warp. Thick and thin beds alternate, so the benches are not all one height.

- **Benches** (`bench()`): the field is cut along its contours into flat steps. Each riser is a fixed width in world units (0.42 × step, at least 0.55), wherever the slope is gentle. Where the contours crowd closer than a riser, the smooth slope stays, so a riser never aliases below two grid cells.
  - Riser height (0.9–1.6) and the level offset drift from region to region. Two plateaus in different places stand at different heights.
  - Fine relief moves only the cliff **edges** (`edges`), into spurs and bays. The benches themselves stay flat, so pipes and roads are not roughened.
  - Ramp zones (about 15%) soften the steps into talus slopes, so tracks can climb.
- **Canyons**: still the dendritic contour lines at any angle, now shaped by distance to the centreline (contour value over its numeric gradient).
  - Floors are flat and 1–6 wide. Walls average slope 3 and step down in flat ledges.
  - Canyon country cuts to about −9; elsewhere canyons are shallower, down to washes.
  - Tributaries are narrower and at most 3.2 deep.
- **Mesas and buttes**: one candidate per 12-unit lattice cell, memoized, pure in seed and cell, read at its own centre.
  - Each has a flat cap-rock top at its own height over the ground it rises from, a sheer riser (its width grows with the drop) and a talus apron.
  - Some mesas have a second, smaller tier. Buttes are small and tall.
  - Fewer stand near the routes, but the centre lane is no longer empty.
- **Dunes**: crests across the wind from the upper left, with gentle backs, short slip faces and finite lengths.
- **Moods**: six now, shuffled with no repeats, each 96 units long with 26-unit blends.

| Mood | Character |
| --- | --- |
| canyons | High benches cut by deep, wide, ledged canyons (floors about −9) |
| mesas | Mesas of several heights and stepped tiers on mid ground |
| basins | Low floors with pools and many buttes |
| flats | Mineral flats, gentle relief, shallow washes |
| dunes | A dune sea with a few buttes |
| escarpment | A regional ramp, turning slowly and never along the flight line, stepped into tall benches |

- **District windows** (`districtGrade`): the flanks of each district slot's preferred band (|x| > 2–4) keep gentler benches, fewer mesas and shallower canyons. Refinery districts still find level lots linked by drivable grades: 78 of 120 slots plan a district (version 12: 88).
- **Outposts**:
  - site choice now also penalizes high ground, where the tallest pieces would sink the pad;
  - the pad floor follows `TERRAIN_MIN_HEIGHT` (−9) instead of −6.

## 4. Vesper (`src/world/terrain-vesper.ts`)

- **Shelf levels**: a smooth shelf level climbs inland from the coast (from low ice feet at the water to high shelves behind them) and is benched into levels.
  - Sheer ice cliffs 0.5 wide separate the levels; their height (0.8–1.25) depends on the mood.
  - Edges are ragged, with snow ramps between levels.
  - The land mask is unchanged, so the planet is still about **70% land and 30% water** (the existing long-route test).
- **Relief on the shelves**:
  - pressure ridges are taller and jagged (0.45–0.8);
  - snow drifts are 0.38 high;
  - crevasses are 1.5 deep but never open to the sea;
  - **nunataks** are dark rock peaks with snow caps, up to 1.6 above the shelf.
- **Moods**: six now. Shelf coast, pack-ice sea (in about every other block), crevasse plateau, radiator plains, **icefall** (many short steps with ridges along them) and **nunatak**.
- **Inner ice cliffs**: the faceted `iceCliff` kit pieces that line the coast now also stand flush in every inner step, one per 3.4-unit lattice cell along it. A level change reads as an ice face rather than a smeared snow bank (planar ground UVs streak on sheer faces).

## 5. Vesper infrastructure

**Cause (measured on version 12; the kits load and render, `infra: glb`):**

1. Outposts were generated: about 42–48 sites and 260–303 pieces per km, close to Khepri. But their candidates stood at 0.38–0.85 of the half width (|x| 5.7–10.9), so the centred camera (|x| ≤ 6) mostly saw their edges. Within |x| ≤ 7 there were **54–63 pieces/km, against Khepri's 89–118**.
2. Every pad was clamped to the cap minus the tallest piece: 3.0 − 2.16 (the comm needle) − 0.05 = **0.79**, while the shelves stood at 1.0–1.8. Most pads therefore sank 0.4–1.0 into pits, and from 55° the pit rims hid low pieces such as radiators (0.8 tall).
3. The black ceramic pieces cast no real shadow on High (Vesper nodes were missing from `CASTER_NODES`), so they read as pasted onto the bright snow.
4. The flat, featureless shelf gave them nothing to sit against.

**Fix:**

- Candidates start at 0.35 of the half width, and the outpost chance rises from 0.88 to 0.92.
- Pads keep their own shelf's level (snapped to a quarter unit). Pieces too tall for the room under the cap are swapped for lower ones (`LOWER`: needle → habitat, missile site → cannon site, tall tanks → horizontal tank, and so on). Site choice prefers flat, lower shelves.
- Two archetypes after the facility sheet (`art/concepts/facility-sheets/vesper.jpg`):
  - **heat exchanger**: a row of 3–4 tall tanks on a header line, the hall behind it, radiators beside it;
  - **thermal reactor**: a tight cluster of masts, a sphere and twin tanks, with a dome and quarters.
- Richer radiator, defence, cryo and plant compositions.
- Vesper nodes and the shared `facility` hall cast real shadows on High (`src/render/terrain-view.ts`).

**Result:** **81–86 pieces/km within |x| ≤ 7** and 324–352/km overall, against Khepri's 82–116 and 344–407: healthy, and still below Khepri. All seven archetypes occur. Luna is unchanged: 18–33 pieces/km and the same rare outposts.

## 6. Luna (`src/world/terrain-luna.ts`)

- **Moods**: highland, mare, basin rim and crater field, shuffled with no repeats.
- **Highlands**: rolling ground of ±0.9, ridged massifs (montes) up to about 2, and lobate scarps (curving one-sided steps of about 0.8, broken into finite lengths).
- **Maria**: about a fifth of the route, lower (−1.6), with wrinkle ridges (up to 0.7) and sinuous flat-floored rilles (1.5 deep).
- **Craters**: four families, now memoized per cell (the height query is about 3× faster).
  - Each crater is fresh (depth and rim × 1.5), mature, or old and worn (× 0.5).
  - Big craters have terraced walls and a central peak; the largest reach 15 in radius.
- Outposts are still the sparse version 12 set: the same chance and pieces. Site choice prefers lower ground, and the scenery cap is 3.0.

## 7. What stays

- **Boss arenas**: the mission and endless arenas flatten exactly as before (arena, ocean-arena and endless-clearance tests).
- **Districts and outposts**: the districts tests pass unchanged except for the slot count noted in §3.
- **Roads**: A* with the 0.45 grade still never climbs a riser. Roads take the ramps, so they never float or bury: ribbons drape on the ground. The district roads keep their grade guard.
- **Pipelines**: risers and trestles cross cliffs and canyons. With the cap at 3.0, racks fit almost everywhere, so lines rarely rest on the ground (the pipe test now allows none).
- **Water level and floes on Vesper**: unchanged.
- **Determinism and chunk independence**:
  - every new field is a pure function of seed and position;
  - the mesa, crater and outpost memos are pure caches;
  - sections are identical in any order and across planets and seeds (new test), and seams still match;
  - incremental streaming still equals synchronous generation.
- **Battery seats**: seating is unchanged and render-only. Ground relief under a 1.2-unit footprint at seeded points across the combat width (relief > 1 needs a tall plinth):

| World | Version 12, relief > 1 | Version 13, relief > 1 | Version 13, median relief |
| --- | --- | --- | --- |
| Khepri | 18.2% | 21.4% | 0.36 |
| Vesper | 16.2% | 20.0% | 0.15 |
| Luna | 2.6% | 9.2% | 0.30 |

  Benches are broad and risers narrow, so most seats stay on flat ground. Cliff feet and canyon walls keep their foundation plinth.

## 8. Measurements

**Relief:** 12 × 26 views, seeds 1, 93 and 8831, s 0–900. A view's flat levels are 0.6-unit height bands holding at least 6% of its ground with slope < 0.3.

| World | Flat levels per view, median | Views with ≥ 3 levels | Views with ≤ 1 level | Span of flat ground, median |
| --- | --- | --- | --- | --- |
| Khepri | 3 → **4** | 72% → **89%** | 5.7% → 1.3% | 2.3 → 3.4 |
| Vesper | 2 → **3** | 14% → **66%** | 18% → 10% | 0.6 → 1.4 |
| Luna | 2 → **3** | 46% → **68%** | 28% → 2% | 1.1 → 1.5 (p90 2.4 → 3.7) |

**Render budget:** a sweep of the real view with the shipped kits, seeds 11, 93 and 8831, s 0–400, camera x −9…9. The limit is 70 draw calls and 90k triangles on High.

| World, High | Version 12 | Version 13 |
| --- | --- | --- |
| Khepri | ≤ 55 calls; ≤ 65.8k triangles, mean 37.3k | ≤ 54 calls; ≤ 75.4k, mean 47.0k |
| Vesper | ≤ 45 calls; ≤ 58.5k, mean 34.1k | ≤ 49 calls; ≤ 67.7k, mean 41.8k |
| Luna | ≤ 20 calls; ≤ 42.2k, mean 26.4k | ≤ 20 calls; ≤ 46.6k, mean 28.3k |

Low stays at or under High, as before. The extra triangles come from relief that the adaptive mesh can no longer merge into flat quads, and from about 16% more kit dressing on rims and cliff feet.

**Generation:** WSL under load, per section, back to back.

| World | Version 12 | Version 13 |
| --- | --- | --- |
| Khepri | 141–146 ms | 187–222 ms (the bench needs two extra level-field samples) |
| Vesper | 84–155 ms | 119–137 ms |
| Luna | 139–166 ms | 96–133 ms |

The worst single step is in the same 10–28 ms band as before. The streaming tests (no fallbacks at 5 and 11 units/s, incremental equals synchronous) pass.

## 9. Files

- `src/world/terrain-layout.ts`: level field, `bench()`, mesas, dunes, canyons, moods, `districtGrade`, constants.
- `src/world/terrain-vesper.ts`: shelf levels, nunataks, moods, outposts, inner ice cliffs.
- `src/world/terrain-luna.ts`: moods, highlands, maria, craters.
- `src/world/terrain-settlements.ts`: site choice, pad floor, Vesper archetypes in the type.
- `src/world/terrain-nacre.ts`: shared neutral mood import only; output unchanged.
- `src/world/terrain.ts`: `TERRAIN_VERSION = 13`.
- `src/render/terrain-view.ts`: Vesper casters.
- Tests:
  - `tests/world/terrain.test.ts`: range, calm windows on the 30-unit world, multi-level views, moods, cross-planet order independence, shadow check off steep faces;
  - `terrain-vesper.test.ts`: fingerprints, shelf levels, pads at their shelf, outpost density and archetypes;
  - `terrain-luna.test.ts`: relief variety;
  - `terrain-nacre.test.ts`: Nacre unchanged;
  - `terrain-pipes.test.ts`;
  - `terrain-budget.test.ts`: district positions in a comment.
- Look-dev fixture: `tests/fixtures/terrain-relief.{html,ts}`.
  - Query `world`, `seed`, `distance`, `x`, `quality`, `battery`, `fly`.
  - `window.reliefView({...})` re-frames the scene without reloading.
  - Not `planet`: that is the renderer's own preview switch and would pin every view to one planet.
- Evidence: `docs/screenshots/terrain/before-after-{khepri,vesper,luna}.jpg`; raw frames in `lookdev/terrain-v13/{before,after}/`.

**Rollback:** git. The district switches (`KHEPRI.districts = null`, `ROAD_ENDS.taper = 0`) still work; on version 13 they no longer reproduce version 10.

## 10. Crisp cliffs (terrain version 14, 21 October 2026)

User, 21 October: "i really dont like those rounded cliff faces, should be sharp and crisp cliffs in some places, real cliff walls, while in other places its still a smooth hill etc.". Later: "stay true to the concept art where there's sharp cliff walls" (`art/concepts/01-worlds-direction.png`):
- Khepri: sheer, blocky columnar walls under flat tops.
- Vesper: flat shelves ending in sheer, fractured ice walls.

Nacre is unchanged, byte for byte; its look on screen is unchanged too.

### Why faces read as rounded (version 13)

1. **The profile.** Every rim used a smoothstep: bench risers, mesa caps, canyon walls and ledges, Vesper's coast and leads, Luna's scarps. A smoothstep has zero slope at the top, so each rim was built as a rounded bevel. Across a Khepri canyon wall, the heights at a 1/16-unit spacing went −3.94, −4.07, −4.40 … −6.74, −6.93, −6.98: an S-curve.
2. **Normals.** Vertex normals are central differences over ±1 cell. The rim vertex averages the flat top and the wall, and the GPU spreads that average over the neighbouring triangles. The shading rolls over the rim across half a unit, about 16 px on a phone.
3. **Colour.** The basalt or ice tint was a per-vertex slope blend. The central difference at a rim vertex is steep, so the wall colour bled a cell onto every top: 72–91% of rim vertices came out darker than the top beside them.
4. **Wall texture.** It was weighted by that same per-vertex mask, so it faded in and out across the rim.

The grid (0.25), the shadow march and the mesh are not the cause, and they are unchanged.

### What changed

- **Profiles** (`cliff`, `cliffTalus` and `crispStep` in `terrain-layout.ts`). A cliff is now steepest at its rim, which meets the flat top in a hard crease, and it eases into a talus at its foot.
  - Khepri: bench risers, mesa and butte caps and their upper tiers, tributaries, and canyon walls. Canyon walls get a sheer face over the top 45% of their width carrying 75% of the drop; ledges each have their own crisp rim.
  - Vesper: ice steps go through the same `bench`. Coast cliffs and lead banks use `crispStep`: it keeps a smoothstep's lower half, so the waterline and the 70% land share stay exactly where they were, then runs straight up into the rim. Crevasses have hard lips.
  - Luna: scarps, rilles, and the ledges of big craters.
- **Vertex colour** (`terrain.ts`, the `cliffs` planet flag). On Khepri, Vesper and Luna, colour and the rock mask read the gentler one-sided slope per axis. A rim or foot vertex keeps its flat side's colour; only vertices inside a wall take the wall's. Now 0% of rim vertices are darker than their top, and a test guards this.
- **Ground shader** (`terrain-kit.ts`, inside a uniform branch, so Nacre pays nothing and renders exactly as before):
  - each triangle's own plane, taken from screen derivatives as flat shading does, decides top or wall, so the line between a top triangle and a wall triangle is a hard edge;
  - walls get their own material at the ground's baked light. Khepri: dark warm columnar basalt, vertical fractured columns each in its own tone with deep seams and vertical streaks. Vesper: blue ice with fractures stretched top to bottom. Luna: darker regolith;
  - a flat-lying triangle whose smooth normal leans away from its plane, at a rim or a cliff foot, is shaded by its plane, so tops stay flat right up to their edge;
  - wall faces keep their smooth normals: faceting them showed the height grid's steps;
  - Luna keeps smooth normals everywhere, because its many small crater bowls faceted into blocks. Its walls still take the darker regolith per face;
  - camera-facing walls are lifted a little more, so the dark faces still show their columns.
- **Smooth ground stays smooth.** Dunes, swales, drifts and rolling highlands: the triangle planes and the smooth normals agree there, so nothing changes.
- **Vesper:**
  - Crevasses run diagonally across the flight line. In version 13 they ran along it, as long straight stripes down the view.
  - The shelf level no longer pulls toward the mood's top along the routes, which drew route-parallel ice cliffs. Calm routes soften the steps instead.
  - Harbours stand only where open water reaches past the first two pier spots, and an outpost on such a coast is a harbour half the time. Jetties went from about 2 per 900 units on two of five seeds to 5–15 on four of five.

### Measurements (v13 → v14)

**Rims** (rim vertices darker than their top): Khepri 91% → 0%, Vesper 72% → 0%, Luna 100% → 0%, the last of very few rims. Crisp rim vertices (level on one side, more than 0.6 drop within a cell on the other): Khepri 222 → 244, Vesper 140 → 284, over the same four sections.

**Budget, High** (same sweep as §8: shipped kits, seeds 11, 93 and 8831):

| World | v13 | v14 |
| --- | --- | --- |
| Khepri | ≤ 54 calls; ≤ 75.4k triangles, mean 47.0k | ≤ 55 calls; ≤ 77.2k, mean 47.7k |
| Vesper | ≤ 49 calls; ≤ 67.7k, mean 41.8k | ≤ 46 calls; ≤ 67.9k, mean 41.8k |
| Luna | ≤ 20 calls; ≤ 46.6k, mean 28.3k | ≤ 20 calls; ≤ 46.6k, mean 28.3k |

Low stays under High. The terrain view is unchanged; only its integrator's own edits moved the Vesper calls.

**Generation:** unchanged. Khepri 91–117 ms per section in both versions; Vesper 75–105 ms.

**Networks and outposts:** roads per section 2.07 → 2.23 on Khepri and 1.62 → 1.60 on Vesper; buildings within |x| ≤ 7 run 91 → 97 and 89 → 92 per km.

**Streaming:**
- The unit tests at 5 and 11 units/s pass.
- In the browser (SwiftShader, about 15 fps under load): Vesper and Luna at 11 units/s and Khepri at 5 units/s have no fallbacks.
- Through Khepri's district at 11 units/s, v14 showed 0–2 fallbacks across five runs; v13 showed none in four runs, and one in an earlier session.
- Section generation costs the same. The new ground program shows a one-off render spike of about 230 ms on SwiftShader (v13: about 15 ms). That is most likely its compile when the detail textures arrive. A real GPU should be faster, and loading the destination before the flight (asset readiness) should absorb it. Not measured on a phone.

**Evidence:** `docs/screenshots/terrain/cliffs-{khepri,vesper,luna}.jpg`. Top row v13, bottom row v14; seed 93 at 390×844, DPR 2, real game view, the same spots. Raw frames are in `lookdev/terrain-v14/{before,after}/`.

**Files:**
- `src/world/terrain-layout.ts`, `terrain.ts` (`TERRAIN_VERSION = 14`), `terrain-planet.ts` (the `cliffs` flag), `terrain-vesper.ts`, `terrain-luna.ts`;
- `src/render/terrain-kit.ts`;
- tests: `tests/world/terrain.test.ts` (crisp profiles, rim colours), `terrain-vesper.test.ts` (fingerprints), `terrain-nacre.test.ts` (title only).

**Limits:**
- The height grid stays 0.25. Diagonal rims follow triangle edges, so a rim line can show small steps of about 8 px. Faceted walls were dropped for that reason.
- Khepri's sheer, blocky column walls lean on the existing kit columns at rims and cliff feet. No new wall geometry was added.

## 11. Cliff walls, Vesper half water, rock textures (terrain version 15, 21 October 2026)

User, 21 October:
- "yes do the real wall geometry too, especially vesper can look much more closer to the concept";
- "vesper has a bit too much snowy plains, could use some more water ... make it 50/50" (replaces 70/30);
- "make rocky textures too so it looks more detailed".

During this version the world also narrowed from 30 to 24 units (user decision, 21 October). Everything below is measured at width 24.

### Walls (`src/world/terrain-walls.ts`)

Real wall geometry now stands along the crisp cliffs of version 14. The heightfield keeps its cliff; the wall pieces stand in it.

- **Deterministic and chunk-independent.** There is one candidate per 1.6-unit lattice cell. The section holding a cell's centre owns it, so each cell is decided once, by one section, in any load order.
- **Finding the face.** A cell takes the steepest of 16 probes (slope at least 1.4) and slides along the cliff toward the cell's centre, so segments space out evenly along a rim. It then walks up to the rim (until the slope drops under 0.7) and down to the foot of the sheer face (until it drops under 1.2). The drop must be at least 0.6 on Khepri and 0.45 on Vesper.
- **Placing the piece:**
  - front (+Z) out and downhill;
  - top flush with the rim (+0.03), foot 0.12 under the ground; a foot over water stands just under the waterline;
  - y scaled by the drop, x stretched by ±15%, variant chosen by the seed;
  - pieces are 2.1 units wide on a 1.6 lattice, so neighbours overlap a little.
- **Stepped cliffs:** each tier gets its own wall, flush with its own bench.
- **Never:**
  - on roads, outpost or district pads, industrial ground, arena platforms or ramps;
  - past the world's edge or over the scenery cap (3.0);
  - on knife-edge ridges or slivers of shelf (the ground must continue behind the wall).
- **Never collision.** Walls are scenery kit instances: no target proxies, never blocking shots.
- **Khepri:** benches, mesas, canyons and escarpments get `cliff_wall_0..3` from `public/assets/khepri/cliff-kit.glb`. The rim crowns and foot rubble are thinned (0.24 → 0.15 and 0.62 → 0.22), so the walls stay readable.
- **Vesper:** coast cliffs and shelf steps get `ice_wall_0..3` from `public/assets/vesper/cliff-kit.glb`. This replaces the old `ice_cliff` passes along cliffs. Only shelf edges qualify: not crevasses, pressure ridges or rock outcrops, which looked like stray slabs.
- **Luna:** no walls. Its scarps never reach a slope of 1.4, and the brief allowed Luna walls "only if it works".
- **Nacre:** no walls.
- `KIT.cliffWall` and `KIT.iceWall` (halfX 1.05, halfZ 0.6, height 1, exact top) have code-built stand-ins until the GLBs load. The terrain view loads each world's cliff kit in its prepare step (`ensurePlanet`), Khepri's included; a failed load settles with the stand-ins.

### Vesper half land, half water

- Lower shelf masses in every mood, plus fjord-like inlets: a noise band cuts narrow arms of sea into the shelf with sheer sides.
- **Land share:** 0.486–0.507 over five seeds and 3 km (mean 0.496). The test bounds are now 0.45–0.55 for the mean and 0.4–0.6 per seed.
- **Outposts:** a site tries 14 spots (5 before). Its centre must stand at least 0.6 above the sea, so the pad's lowest level keeps its shelf's height.
- **Pipelines:** on a planet with a sea, a pipeline is planned only where at most half of its straight line crosses water. Wider runs were never built anyway (9 in 10 of the remaining planned lines are built). Khepri's network is unchanged.
- **Width 24, v14 → v15 on Vesper:**
  - roads per section 1.42 → 0.63;
  - pipe pieces per km 1593 → 508;
  - buildings per km within |x| ≤ 7: 175 → 129 (Khepri 184).
  - Half the planet is water now, so the outpost test's floor drops from 70 to 50 per km.

### Rock and ice textures

Four maps come from Poly Haven CC0 `cliff_side` through `tools/blender/cliff_textures.py`; provenance is in `art/source/polyhaven/README.md`. Each is 512 px, tileable, x along the wall and y up:
- `khepri/textures/cliff-rock-{detail,normal}.jpg` on Khepri and Luna (Luna's walls grey it as usual);
- `vesper/textures/ice-wall-{detail,normal}.jpg` on Vesper.

**Ground wall triangles** (`terrain-kit.ts`):
- The wall map replaces the basalt detail, at one tile per 3.5 units along the wall and up the drop, so the ledges lie level instead of stretching down it.
- Khepri keeps its columnar seams over the rock. Vesper's ice uses the map's fractures with the vertical splits kept.
- On High, the wall normal map is applied to wall triangles only, using a screen-derivative tangent frame (as three.js does without tangents). Low skips it. Tops and rims keep their crisp planes.

**Kit wall pieces** use their own program, `kitWall` ('khepri-kit-wall'), so the other kit pieces pay nothing:
- u runs along the piece (its own x, stretched) and v up in world units, so ledges stay level at any height scale. Each piece offsets u by its position. Tops take the world-planar map with a quieter grain, and keep 75% of their own plane.
- Faces turned toward the camera are lifted like the ground's walls, so the ledges read on the shaded side (only slightly on Vesper).
- Khepri's rust caps darken to weathered rock instead of bright slabs.
- **Vesper, "crisp and pointy"** (user, 21 October, after the first captures; Khepri and Luna were approved as they were):
  - The coordinator rebuilt `ice_wall_0..3` as narrow, flat-shaded fractured shards: 144–186 triangles, an outward ridge splitting light and shadow, broken pointed tips, and a sawtooth snow rim.
  - In the shader, each facet keeps its flat normal. Its own plane against the sun splits pale cyan-white lit ice from deep, saturated blue shadowed ice, over the kit's colours: abyss-blue cracks stay dark, and snow stays on the rim only.
  - Shadowed ice gives back a little blue light instead of going grey.
  - The first version had taken its tone from a luminance ramp: the shared kit's saturation test never saw vertex colours, so the pieces rendered as grey concrete.
- **Vesper's ground walls match:**
  - lit ice is pale cyan-white and shadowed ice deep blue, deepening toward the waterline (shallow crevasse lips stay a lighter blue);
  - there is little camera-facing lift;
  - the tone follows the smooth normal. Taken per triangle, the 0.25 height grid read as pixel stairs along every crevasse; the kit's shards carry the hard facets.

**Loading:**
- Khepri's and Luna's maps load with the Khepri textures, which the renderer's prepare already awaits.
- Vesper's load in the terrain view's prepare, through the ground material's `loadPlanetTextures` hook.
- A missing map stays null and the version 14 procedural detail remains.

**Cost:**
- About 312 KiB of JPEG (cliff rock 2 × about 117 KiB, ice 2 × about 40 KiB).
- About 1.4 MiB of GPU memory per map with mipmaps (5.6 MiB in all).
- One more program (the kit wall), compiled in the warm-up.
- On High, one more texture tap on ground wall pixels; none on Low.

### Width 24 retunes (21 October)

Constants tuned for the old 15 half-width:
- **Side routes:** ±9.5 → ±7.5 (`ROUTE_AXES`).
- **District lots:** centres at |x| 6.0–7.6 (hub) and 6.4–7.3 (process lot), down from 9–10 (`settlement-grammars.ts`).
- **District lattice:** now |x| 1–12 (`terrain-districts.ts`).
- **Link grade:** the emulated grade between district lots is 0.72 → 0.62. A spine's slight curve found a steeper dip than the straight-line emulation.
- **Outpost spread:** Khepri candidates span 0.42–0.82 of the half width (0.38–0.85 before).
- **Districts:** 23 of 40 seeds still hold one in slot 0 (at least 26 at width 30).

Nacre's code is unchanged. Its output changes only through `WORLD_HALF` and the route axes: version 14 with those two changes gives the same fingerprints as version 15.

### Measurements

**Budget, High** (shipped kits including the cliff kits; seeds 11, 93 and 8831, s 0–400; camera across its whole ±6 range):

| World | v14, width 24 | v15, width 24 |
| --- | --- | --- |
| Khepri | ≤ 61 calls; ≤ 79.4k triangles, mean 45.8k | ≤ 63 calls; ≤ 77.7k, mean 46.9k |
| Vesper | ≤ 56 calls; ≤ 71.6k, mean 39.3k | ≤ 46 calls; ≤ 62.5k, mean 38.3k (sharper shards) |
| Luna | ≤ 24 calls; ≤ 49.4k, mean 27.4k | unchanged |

- Low stays under High.
- At width 30, v14 measured Khepri ≤ 55 calls and 77.2k triangles, Vesper ≤ 46 and 67.9k (§10). The narrower world puts more outposts and district pieces in view at once, which adds calls; triangles stay about the same.
- The walls cost Khepri two calls. On Vesper they replace the old ice cliffs and less shelf to build on, so calls drop.

**Streaming** (browser fixture, SwiftShader, about 15 fps):
- No fallbacks for either version: Khepri's district (seed 93, s 400–560) and Vesper (s 100–400) at 11 units/s, Khepri's canyon (s 900–1060) at 5 units/s, Luna at 11 units/s.
- Longest render: Khepri 16.9 ms (v14 16.8), Vesper 13 ms (v14 14).
- Luna shows a one-off spike of 67–135 ms in both versions (v14 126 ms).

**Real start flow** (menu → ENDLESS → flight, SwiftShader, High, two runs each):
- Ready after 1.9–2.2 s (v14 1.7–2.2 s).
- Longest render in the first 12 s of flight: 5–11 ms (v14 7–8 ms).
- So prepare's warm-up absorbs the new programs. The 230 ms spike noted for version 14 (§10) came from the fixture, which skips prepare.
- Not measured on a phone.

**Browser:** `graphics.spec.ts` 7/7. Its Vesper facility spot moved from distance 270 to 200 (seed 8831, x −3), because 270 is open water now. All four Vesper cases seat there: v2 small and large, v3 fort and pad.

**Tests:** 399/399 unit tests at width 24 (default config). The new wall test checks every planet's wall kind, cap, scale, a downhill front, a top that meets the ground behind it, distance from roads and pads, and none on Luna or Nacre. Khepri and Nacre fingerprints are re-recorded for the width, with the reason in each test.

**Evidence:**
- `docs/screenshots/terrain/walls-{khepri,vesper,luna}.jpg`: top row v14, bottom row v15, both at width 24; seed 93, 390×844, DPR 2, the same spots. They include a Khepri canyon (d 985) and a Vesper coast (d 280) framed like the concept panels.
- `docs/screenshots/terrain/walls-vesper-concept.jpg`: the concept's right panel beside v15 (the sharper shards).
- Raw frames are in `lookdev/terrain-v15/{before,after}/`.

**Files:**
- `src/world/terrain-walls.ts` (new), `terrain-scatter.ts`, `terrain-vesper.ts`, `terrain-luna.ts` (a comment), `terrain.ts` (`TERRAIN_VERSION = 15`), `terrain-layout.ts` (route axes), `terrain-settlements.ts`, `terrain-districts.ts`, `settlement-grammars.ts`, `terrain-network.ts` (the pipeline water rule);
- `src/render/terrain-kit.ts`, `terrain-view.ts`;
- tests: `tests/world/terrain.test.ts`, `terrain-vesper.test.ts`, `terrain-nacre.test.ts`, `terrain-districts.test.ts`, `terrain-budget.test.ts`, and `tests/browser/graphics.spec.ts` (the Vesper facility spot).

**Limits:**
- No phone test.
- Wall pieces overlap at tight bends, and a two-tier canyon wall shows two rows of caps.
- The ice-wall colouring and the Khepri cap tone are judged from SwiftShader captures only.
- Vesper's crevasse lips still step along the 0.25 grid (as in version 14), now in a stronger blue.

## 12. Relief, cracks and compounds (terrain version 16, 21 October 2026)

User, 21 October:
- "I love how elevated and rocky and mountainous Khepri looks. Please add more elevation and crazy landscaping on Vesper as well. Nacre can also use some more elevation changes and mountains."
- "add more base terrain texture like in the concept art. Finely detailed crack-like patterns across the vast plains … especially Vesper … those fine crisscross lines across the ice and snow."
- "The cliff sides on Vesper don't look quite as sharp as on Khepri."
- "Gas tanks and other tanks are randomly generated across the landscape sometimes … everything infrastructure should be more cluttered together, with pipes and roads connecting several features and bases. Same for landing pads on the Moon."

Khepri's landform is unchanged. Terrain stays scenery: nothing here reads or changes combat, collisions, targeting, timing or loot.

### Vesper relief (`src/world/terrain-vesper.ts`)

- **Sea at −3.6** (−1.2 before; `VESPER_SEA_LEVEL`). Everything that floats or swims reads the planet's sea level, so it moves with it: the Helion Ark (`arkPlacement`), ground batteries on pontoons, floes, piers and icebreakers, splashes. The arena, the seabed and the colour ramps are relative to the sea.
- **Shelf levels** span the new range: mood tops −1.9…0.5, taller steps (1.1–1.8), twice the regional swell. A shelf now stands one to four tiers over the water, and coast walls are 4–6 units tall.
- **Ice plateaus** (`icePlateau`): a warped blob field lifts tabular blocks one or two tiers over their shelf behind sheer `crispStep` walls, like Khepri's mesas (`mesa` per mood, 0.2–0.7).
- **Taller features:** pressure ridges 0.6–1.2, nunatak peaks up to about 3 over the ice, crevasses 2.4 deep (their floors stay ice).
- **Harbours** only from a low ice foot (centre under SEA + 2.2), so a jetty never hangs far under its crane.
- **Pads:** a crevasse's tint no longer shows through a pad that flattened it.
- **Measured** (dry land per 12 × 26 view, seeds 1, 93 and 8831, s 0–900, the p5–p95 height span): Vesper median 2.05 → **3.52** (Khepri 3.55), views flatter than 1.5: 17% → 4%.

### Sharper ice walls (`src/render/terrain-kit.ts`)

The ground's ice walls split into vertical fractured columns (about 1.3 units wide, in blocks about 2.2 tall broken at uneven ledges). Each column leans its own way to the sun and is split by a ridge into a lit and a shadowed facet, with abyss-blue seams between columns. This is the concept's blocky ice, matching the kit's shards. The shadow ramp follows the deeper range.

### Cracks on the plains (`createCrackTexture`)

A tileable 512² crack network is generated at prepare time (about 150 ms on desktop; never at a planet switch): polygonal plate cracks (jagged, broken edges) and a patchy finer crisscross. The ground shader samples it at two scales (9- and 4-unit tiles, both dividing the 36-unit section) on open ground only, walls excluded. Vesper's lines are blue-grey, Luna's dark regolith fractures; Khepri and Nacre are unchanged (`crackLook` 0).

### Nacre relief (`src/world/terrain-nacre.ts`)

The massifs are real mountains: up to about 3 over the shore in 0.35 ledges (0.8 before), over a wider rock mask, with rolling hills on the islands and brighter ridge light. The terrain range is now −4…2.4. Dry-land span per view: median 0.6 → **2.24**; views flatter than 1.5: 100% → 5%.

### Compounds (`compoundSlot`, `src/world/terrain-settlements.ts`)

- An outpost stands beside a partner: the next or previous cell on its side, or the other side of its own cell. Without one it stands only now and then (15%; Luna 20%). It then moves toward its partners: toward the shared cell edge, and inward when both sides are built.
- **Cross links:** a cell built on both sides is joined across the route 60% of the time (the left side owns the link), with a pipeline half the time between industrial sites.
- **Vesper:** a cell is present when its roll passes (now scaled by the district level) and dry shelf exists in it (a memoized search, so cells never recurse). Pads are probed over their whole area. A narrow lead under a pad is filled at pad level like a causeway (`terrain-ground.ts`; the pad's rim is a sheer quay), so up to 15% of a pad may stand over water. Harbours still keep the open sea in front of them.
- **Luna:** bases come in pairs facing across the route (the other side of a base's cell is built two times in three): a landing field (the pad always beside a habitat block, cargo and a light) and a comm station or quarters. Rover tracks (`pipes: false`, a grey regolith road surface) join them.
- **Measured** (seeds 1, 93, 8831, 11 and 4242 over 3 km; lone = more than 10 units from any other pad):

| World | Sites/km | Nearest gap, median | Lone | On a road or pipe |
| --- | --- | --- | --- | --- |
| Khepri | 48.9 → 47.4 | 7.6 → 5.4 | 30% → 17% | 95% → 95% |
| Vesper | 20.3 → 30.3 | 10.5 → 5.2 | 53% → 24% | 94% → 98% |
| Luna | 6.7 → 9.1 | 49.7 → 5.1 | 94% → 7% | 0% → 78% |

### Render cost (terrain-relief fixture, High, SwiftShader, the six fixed views)

Terrain draw calls and triangles stay inside the 70 / 90k budget. Vesper ≤ 40 calls (39 before) and ≤ 66.1k triangles (65.1k). Nacre ≤ 45 (47) and ≤ 105k (102k; the same view, already the peak). Khepri ≤ 53 (52); one view gains 9 calls where a compound now stands. Luna ≤ 25 (23).

### Tests

- Khepri and Nacre fingerprints were re-recorded, with the reason in each test.
- The road-end test follows seed 11's road to section 5.
- The wall test exempts wrecks, which lie on natural ground and are not pads.
- Nacre's range bound is 2.4.

**Evidence:** `docs/screenshots/terrain/v16-{vesper,luna,nacre,khepri}.jpg`, top row version 15 and bottom row version 16, at the same spots (terrain-relief fixture, 390×844).

**Limits:**
- No phone test.
- On narrow crevasse walls the ice columns read as a zigzag.
- Nacre's darker palette hides some of its new relief.
- The crack texture costs about 150 ms of main-thread time per session, on desktop; it is unmeasured on phones.
