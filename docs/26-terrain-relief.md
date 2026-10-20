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
