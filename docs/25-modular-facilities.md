# Modular facilities (v3), 20 October 2026

## Why

The user liked the textured v2 compounds (art/facility-remodel/README.md) but not the repetition. Every battery that got a plant got the same inverted-U court. The user's instructions (20 October):

- "dont make it always have a open court design";
- higher roofs are welcome;
- "maybe these could be made modular as well?"

v3 therefore builds each plant from a per-world kit of textured modules (`src/render/facility-kit.ts`). A seeded layout grammar composes the modules around the battery. The U court remains as one arrangement among many.

## Kits

Each world, Luna included (user: "what about moon?"), has one GLB, `public/assets/<world>/facility-kit-v3.glb`, holding 12–14 module nodes (`fk_<world>_<module>`). All the modules share one baked 2048² atlas (colour, roughness/metal, normal, with AO in the vertex colours) plus the untextured glow materials.

- **Builder:** `tools/blender/facility_kit.py`, using the boss toolkit. The modules come from the v2 pieces the user liked.
- **Source of truth:** `FACILITY_MODULES` holds each module's footprint, top, foundation depth, allowed turns and roles. The Blender builder asserts the same bounds, and the asset tests compare every GLB node with the registry.
- **Module frame:**
  - the pivot is at the base centre, on the ground;
  - x is lateral, and s points away from the camera (glTF −z);
  - the detailed front faces the camera (−s);
  - a turn of 2 shows the camera the plain back, so only symmetric modules allow it.

**Aprons (review round, 20 October):** Khepri, Vesper and Nacre plants stand on a tiled 2 × 2 ground slab (`apron`: concrete, graphite deck or violet paving). It covers the union of the plant's modules on a grid aligned to the gun, so the buildings read as one complex rather than pieces on bare ground. Aprons are flat (top 0.04): they may lie under any module and under the gun's court. Luna has none; it stays bare and sparse.

## Rules every layout keeps

These rules are tested on the composer output for many seeds, ids and seat heights.

1. **Court:** the battery stays at its own seat. Within |x| < 0.65 and |s| < 0.7 of the gun, only flat modules may lie (top ≤ 0.2: the ring, the Vesper pad, the Nacre pool).
2. **Line of sight:** nothing may hide the gun from the 55° camera. A module whose footprint overlaps |x| < 0.9 and lies wholly in front of the gun (its far edge at s₁ < 0) must keep its top ≤ 0.85 + 1.43·(−s₁) − 0.1. The gun target is about 0.85 tall. The camera ray climbs tan 55° ≈ 1.43 per unit toward the camera.
3. **Height (user: higher roofs welcome):**
   - Roofs stay 0.45 under the flight plane (3.8). With the v2 rule of sinking the base at most 0.35 below the seat, a module may reach top ≤ min(3.25, 3.7 − seat base).
   - Modules taller than the v2 plants (2.65) therefore seat only on low ground. On higher seats, the layout swaps them for normal modules or drops them.
   - The flight plane itself is unchanged. Raising it would move the camera and the simulation's ground-target projection; that would be a separate, measured change.
4. **Fit:**
   - The whole plant stays inside the world (|x| ≤ 14.7).
   - It stays off district pads (`reserved`) and 1 unit clear of other plants.
   - It keeps other batteries outside every module (0.4 margin), so scenery never conceals another target.
   - Modules never overlap one another. A flat module may underlie only the gun's court.
5. **Determinism:** the layout is chosen and filled from a hash of (battery id, run seed), never `Math.random` and never combat RNG. It is cosmetic only and never changes targets, collisions or loot.

## Arrangements

The local frame has the gun at the origin. Each arrangement is mirrored left/right by the seed, and optional slots and node choices are seeded too.

| Arrangement | Worlds | Shape |
| --- | --- | --- |
| court | all | Halls as wings either side, tanks in front of them, a landmark or refinery behind (the v2 U). |
| backdrop | all | The gun stands in front of a row of 2–3 big modules across the back (s 1.4–4.5), with smaller pieces at the row ends and a pipe run along its front. Nothing beside the gun. |
| flank | all | A long hall or hall pair along one side of the gun, a landmark at the far corner, the other side open or holding a small tank. |
| L | Khepri, Vesper | Halls along one side and the back, meeting at a corner landmark. |
| yard | Khepri, Vesper | Walls enclose a yard behind the gun (back and both sides; the front is open at the gun) with tanks, columns or crystals inside. |
| tower | all | A tall landmark diagonally behind the gun, with 2–4 satellites (tanks, pump, columns) and pipe runs to it. |
| pad | Vesper | The landing pad is centred on the gun, which sits on its recessed centre. A control tower and fuel tanks stand at its back corners, and pylons at two corners. |
| fort | Vesper | Wall segments on the octagon sides around the gun (radius ≈ 2.3; the front side open), pylons at the corners, an exchanger or stacks behind. |
| shrine | Nacre | 5–6 arcs around the gun (front open), pillars in the gaps, the pool at the gun, an obelisk or pump tower behind. |
| basins | Nacre | Basins in a triangle (two at the front sides, one behind), channels toward the gun, the pool, a pump tower behind. |
| bunker, radar, pad, cargo, emplacement | Luna | One facility of the Moon sheet each, 1–4 modules: the command bunker; the radar tower with small pieces at its base; the hangar pad around the gun with two beacons; a compact cargo and power cluster; or the turret-emplacement ring with two or three pods at the back diagonals. |

**Luna is sparse (user, 20 October):** "luna should get much less populated amount of buildings and infra". About 30% of Luna's batteries get a plant, with at most 4 modules each. Luna has none of the multi-building arrangements (court, backdrop, flank, L, yard, tower), and its terrain outposts are rarer and smaller: outpost chance 0.24 to 0.10, and 2–4 pieces each (terrain version 12).

**Weights:** no arrangement should exceed about 30% of a world's plants, and the court should stay at or below about 20%. Neighbouring plants should prefer different arrangements. When an arrangement does not fit, the composer drops its optional slots, then tries another arrangement. The last fallback is the legacy emplacement.

## Runtime

The view loads a world's kit when the run arrives there and releases it after that world's last plant, as v2 did.

- **Draws:** one instanced mesh per module node and material. A compound is a list of module placements.
- **Terrain clearing:** the union rectangle of each plant clears terrain scenery.
- **Shadows:** modules cast real shadows on High.
- **Until all three kits ship:** v2 stays live. The composer is developed against stand-in boxes made from the registry.

## As built (TypeScript side), 20 October 2026

**Switch and rollback:** `FACILITY_VERSION` in `src/render/facility-view.ts` picks the path: 2 = the v2 compounds, 3 = these kits. It is set to 3, because all four kits shipped and v3 works on every world. Setting it back to 2 restores v2: both paths work, and the v2 files are untouched. `facilityOptions` holds the dev/test overrides; the fixture sets it with `fv=2|3`.

**Composer:** `src/render/facility-layouts.ts`, pure TypeScript. `composeFacility(world, battery id, run seed, seat, context)` returns a plant or null; null means the legacy emplacement.
- **Plant:** the arrangement, the mirror flag, the module placements (node, slot, x/s offsets from the seat, yaw, top), the tallest top, the base from the v2 sink rule (`plantBase`), and the world bounds.
- **Bounds:** the union of every module, the gun's court and a sight apron in front of the gun (|x| < 0.9, s from −1.8 to 0.7). They are the terrain clearing, so terrain scenery never stands in the gun's sight. v2's larger rectangles happened to do the same.
- **Templates:** data in `ARRANGEMENTS`. Every size is read from the registry. A slot names its candidates by module name or by a per-world palette role (`@hall`, `@landmark`, …). Placement options:
  - `swap` candidates replace modules too tall for the seat (rule 3);
  - `like` copies the module a symmetric partner slot chose;
  - a slot is positioned by an anchor point (`at`/`anchor`), a seeded choice of `spots`, the side of an earlier slot (`attach`: side, gap, align; a negative gap lets a piece straddle the court piece's rim), or a polar angle (`polar`, `radius`; the radius defaults to the arc's, yaw a − 90°);
  - `run` tiles pipes, walls and channels at the registry period;
  - `chance`/`group` make a slot optional;
  - `court` marks the flat piece centred on the gun.
- **Order:** the plant chance comes first (`PLANT_CHANCE`: Luna 0.3, everything else 1). The arrangements are then tried in a seeded weighted order, with the nearest plant's arrangement moved last. Each arrangement tries its seeded mirror, then the other mirror. Within one, optional slots that break a rule are dropped and the layout is rebuilt. Then the clearing is checked against district pads and other plants. Everything is hashed from (battery id, run seed, world).
- **Cost:** 0.02–0.1 ms per battery on open ground and up to about 0.3 ms among pads and neighbours (Node, this machine under load). It runs once, when the battery first appears with its kit loaded.

**Readings of the rules:**
- *Overlap (rule 4):* only the court piece (ring, pad, pool) may lie under other modules. Tiles of one run may overlap by their designed centimetre.
- *Line of sight (rule 2):* the rule is also applied to every other battery, not only the plant's own gun. Other batteries also keep 0.4 clear of every module rectangle.
- *Pads and plant gap:* these use the clearing rectangle, as v2 did.
- *Fort:* the walls stand on the octagon's back and two sides, with pylons on its four diagonals. Diagonal walls would need 45° yaws, and the registry allows the Vesper wall only quarter turns.
- *Shrine:* five arcs at 60° spacing (90°, 90° ± 60°, 90° ± 120°). Front arcs at ±128° would cross the gun's sight strip, so six do not fit. The pillars stand just outside the arc joints (radius 2.75), because the registry's arc box is conservative.

**Luna:** five single-facility arrangements of 1–4 modules (bunker, radar, pad, cargo, emplacement), with no walls or pipe runs. About 30% of Luna's batteries get a plant. The fixture uses `planet=luna&distance=210`, where the battery stands on open regolith.

**Shares** (3 seeds × 300 ids × seat bases 0, 0.4, 0.8, 1.2, at x = 0; every planted battery fitted):

| World | Shares |
| --- | --- |
| Khepri | tower 19.2%, backdrop 18.6%, flank 18.1%, L 16.1%, yard 15.2%, court 12.8% |
| Vesper | flank 14.6%, yard 14.7%, pad 13.4%, L 12.7%, backdrop 12.4%, tower 11.7%, fort 11.1%, court 9.4% |
| Nacre | shrine 18.8%, tower 18.2%, flank 17.8%, backdrop 16.7%, basins 15.4%, court 13.1% |
| Luna | pad 24.1%, radar 20.4%, emplacement 20.4%, bunker 20.0%, cargo 15.2% |

- **Module counts:** about 6 modules per plant on average on the other worlds (11 at most), and about 3 on Luna (4 at most).
- **Weights:** the court has 0.8, the other shared arrangements 1.2 each, and the Luna arrangements 1 each.

**View (v3):**
- **Draws:** one `InstancedMesh` per module node and material part. Its capacity is 12 plants × that node's per-plant bound from the templates (`nodeBudget`). A node with no instances is hidden, so it costs no draw.
- **Composition:** each battery is composed once. While a world's kit is loading, its batteries report `contains`, so `scene.ts` holds back the legacy pieces. v2 left the first frame's legacy crates standing beside the later plant.
- **Kit missing or failed:** in production, the legacy emplacement stays. In development and tests only, registry stand-ins replace a missing kit or node: boxes, cylinders and a curved arc. They are marked for deletion in `facility-view.ts`.
- **Frame cost in the fixture (High, real kits):** 61–81 draw calls for the whole frame on Khepri, Vesper and Nacre, and 32–39 on Luna. There are no view fallbacks on any world.
- **QA stats:** `data-render-stats.facilities` = {version, loaded, count, large, arrangements, kits, modules}.

**Registry notes:**
- The measured pads are smaller than declared: Vesper's is 2.48 against 2.7, and Luna's is 2.38 × 2.45 against 2.6. The corner pieces straddle the declared corner, so they stand about 0.2 outside the visible deck. Tightening the half to [2.5, 2.5] and [2.4, 2.45] would seat them on it.
- The Nacre arc measures x ±0.87 and s from −0.37 to 0.24, inside its declared [1.0, 0.45]. A tighter [0.9, 0.38] would let the pillars sit closer to the joints.

### Round 2: one complex, not scattered pieces (20 October, evening)

The integrator's review found many Khepri, Vesper and Nacre plants reading as scattered pieces on bare ground.

- **Aprons:** every Khepri, Vesper and Nacre plant now gets the registry `apron` slabs (2 × 2, flat). Luna has none.
  - **Placement:** tiles sit on a 2-unit grid aligned to the gun. They cover every module footprint plus 0.4 and the gun's court, reaching at most 1.6 beyond the modules (`GROUND` in `facility-layouts.ts`), up to 48 tiles.
  - **Exclusions:** a tile is skipped if it leaves the world, touches a district pad, comes within the plant gap of another plant, or comes within 0.4 of another battery. If the grown clearing would reach a pad or another plant, only tiles inside the modules' own clearing are kept.
  - **Overlap:** aprons may lie under anything; the ring, pad and pool sit on them. The plant's clearing rectangle includes them. Plants average about 13 tiles.
- **Ground heights:** flat pieces (aprons, ring, pad, pool, channels) lie at the seat's ground (`plant.ground`); buildings still sink to `plant.base` (rule 3).
  - With the terrain sampler that `scene.ts` now passes, each apron tile lies just above the highest ground under it. A tile on ground rougher than 0.6 is left out, and the tile under the gun keeps the gun's ground.
  - Without this, slabs vanished under Khepri's dunes whenever a tall plant sank.
- **Density:** Khepri, Vesper and Nacre plants have at least 6 modules (`MIN_MODULES`; aprons and the plain ring don't count).
  - A sparser layout retries with every optional slot built, then gives way to another arrangement.
  - The thin arrangements got more satellites: court, backdrop, flank, L and tower, plus one more optional piece on the Vesper pad. Gaps between footprints are now 0.3.
  - New explicit pipe runs: across the court behind the gun joining the wings, along the flank's hall row, and in front of the L's back hall.
  - Single connector pipes (or Nacre channels) bridge any remaining axis-aligned gap one piece spans, at most 3 per plant, never across the gun's court or its sight apron.
  - Vesper's pad tower now swaps to stacks or a pylon (not the wide exchanger) on high seats. Its corner pylons swap to small exchangers.
- **Result:** the shares are unchanged from round 1; every first choice still holds after the rebuild. Khepri plants have 6–10 modules (7.3 on average), Vesper 6–10 (7.4), Nacre 6–12 (8.0). Luna is unchanged at 1–4 (2.7).
- **Registry values used as given:** Vesper pad [2.5, 2.5], Luna pad [2.4, 2.45], Nacre arc [0.9, 0.38]. The shrine pillars moved in to radius 2.55.
- **Draw cost:** aprons and the other flat pieces cast no shadows.

