# Modular facilities

Ground batteries on Luna, Khepri, Vesper and Nacre stand inside small industrial plants composed from per-world kits of
textured building modules. This doc covers the kits, the rules every layout keeps, the arrangements, and how the view
draws them. Plants are scenery around a target: never cover, targets or collision. The user asked for them to be modular
and varied, with higher roofs welcome and not always an open court (20 October); the facility concept sheets
(`art/concepts/facility-sheets/`) are the references.

Code: `src/render/facility-kit.ts` (the module registry), `src/render/facility-layouts.ts` (the composer),
`src/render/facility-view.ts` (the view). Tests: `tests/world/facility-layouts.test.ts`,
`tests/world/facility-placement.test.ts`, and the kit contracts in `tests/world/cinematic-assets.test.ts`.

## Kits

Each of the four worlds has one GLB, `public/assets/<world>/facility-kit.glb` (Luna, Khepri, Vesper, Nacre), holding its
module nodes (`fk_<world>_<module>`). The modules share one baked atlas (colour, roughness-metal, normal, with AO in the
vertex colours) plus untextured glow materials.

- **Builders** (`tools/blender/`): `kit_facilities.py` builds every world's modules with `lib_facility.py`;
  `kit_facilities_taller.py` makes the shipped Khepri and Vesper kits from its output with taller towers and halls;
  `kit_facilities_nacre.py` builds Nacre's in the ruin builders' architecture (stepped dark plinths, tapered slabs,
  turquoise conduits), keeping the module names, footprints and court contracts.
- **Source of truth:** `FACILITY_MODULES` in `src/render/facility-kit.ts` holds each module's footprint, top, foundation
  depth, allowed turns and roles; the Blender builders assert the same bounds, and the asset test compares every GLB node
  with the registry.
- **Module frame:** pivot at the base centre on the ground; x lateral, s away from the camera (glTF −z); the detailed
  front faces the camera; a half turn would show the plain back, so only symmetric modules allow it.
- **Aprons:** Khepri, Vesper and Nacre plants stand on tiled flat ground slabs (`apron`: concrete, graphite deck or violet
  paving) covering the plant on a grid aligned to the gun, so the buildings read as one complex. `APRON_FIT` sets how a
  world paves: Khepri only under and just around each building and the gun's court (user, 22 October: fewer empty
  aprons), the others one clean lot. Luna has none.

Amnion, Corona, Nahara and Umbra have no facility plants (`PLANT_CHANCE` 0); their ground batteries stand in their worlds'
own scenery and strike sites ([docs/33](33-strike-sites-and-encounter-deck.md)).

## Rules every layout keeps

`FACILITY_RULES` in `src/render/facility-layouts.ts`; checked on the composer's output for many seeds, ids and seat heights
by geometry written independently of it.

1. **Court:** the battery stays at its own seat. Close around the gun only flat modules may lie (the ring, the Vesper pad,
   the Nacre pool).
2. **Line of sight:** nothing hides the gun from the camera. A module overlapping the gun's sight strip and lying in front
   of it keeps its top under the camera ray to the gun, which climbs tan 55° per unit toward the camera. This applies to
   every other battery too.
3. **Height:** roofs stay `FACILITY_RULES.roof` under the flight plane, and a plant's base sinks at most
   `FACILITY_RULES.sink` below its seat (`topLimit`, `plantBase`). Modules too tall for a high seat are swapped for
   shorter ones or dropped. The flight plane itself never moves for scenery.
4. **Fit:** the plant stays inside the world, off district pads, clear of other plants and of every other battery, and
   modules never overlap (only the court piece and aprons may lie under others).
5. **Determinism:** the layout is chosen and filled from a hash of (battery id, run seed, world), never `Math.random` and
   never combat randomness. It is cosmetic only and never changes targets, collisions or loot.

Strike sites follow the same line-of-sight and roof rules (`src/render/site-models.ts`, `tools/blender/sites_strike.py`).

## Arrangements

`ARRANGEMENTS` (data): the gun at the origin, each arrangement mirrored left or right by the seed, optional slots and node
choices seeded too.

| Arrangement | Worlds | Shape |
| --- | --- | --- |
| court | all four | Halls as wings either side, tanks in front of them, a landmark or refinery behind |
| backdrop | all four | A row of two or three big modules across the back, smaller pieces at the ends, a pipe run along its front; nothing beside the gun |
| flank | all four | A long hall or hall pair along one side, a landmark at the far corner, the other side open or holding a small tank |
| tower | all four | A tall landmark diagonally behind the gun with satellites and pipe runs to it |
| L | Khepri, Vesper | Halls along one side and the back, meeting at a corner landmark |
| yard | Khepri, Vesper | Walls enclose a yard behind the gun (front open) with tanks, columns or crystals inside |
| pad | Vesper | The landing pad centred on the gun, a control tower and fuel tanks at its back corners, pylons at two corners |
| fort | Vesper | Wall segments on an octagon's back and sides, pylons on its diagonals, an exchanger or stacks behind |
| shrine | Nacre | Arcs around the gun (front open), pillars in the gaps, the pool at the gun, an obelisk or pump tower behind |
| basins | Nacre | Basins in a triangle, channels toward the gun, the pool, a pump tower behind |
| bunker, radar, pad, cargo, emplacement | Luna | One small facility of the Moon sheet each, a few modules: the command bunker, the radar tower, the hangar pad with beacons, a cargo and power cluster, or the turret ring |

- **Luna is sparse** (user, 20 October: "luna should get much less populated amount of buildings and infra"): only some
  batteries get a plant (`PLANT_CHANCE.luna`), with Luna's own small arrangements only.
- **Density:** Khepri, Vesper and Nacre plants have at least `MIN_MODULES` modules (aprons and the plain ring don't count);
  a sparser layout retries with every optional slot built, then gives way to another arrangement. Connector pipes (Nacre:
  channels) bridge remaining gaps, never across the gun's court or its sight strip.
- **Weights:** no arrangement should exceed about 30% of a world's plants and the court about 20%; neighbouring plants
  prefer different arrangements. When nothing fits, the battery keeps the legacy emplacement.
- **Order:** the plant chance first, then the arrangements in a seeded weighted order with the nearest plant's moved
  last; each tries both mirrors, dropping optional slots that break a rule; then the clearing is checked against pads and
  other plants.

## Runtime

- **Composition** (`composeFacility`): once per battery, when it first appears with its kit loaded. It returns a plant
  (arrangement, mirror, module placements, base, ground, and the clearing rectangle) or null for the legacy emplacement.
  While a world's kit is loading its batteries report `contains`, so the scene holds back the legacy pieces.
- **Seating:** buildings and tanks keep the plant's level or rise onto higher ground under their own footprint and stand
  on a foundation block down to the lowest ground under them; on a cliff drop, or too close to the flight plane, a piece
  is left out. Aprons lie just above the highest ground under each tile; a tile on rough ground is left out.
- **Clearing:** the union of the modules, the gun's court and a sight strip in front of the gun clears terrain scenery, so
  scenery never stands in the gun's sight.
- **Draws:** one instanced mesh per module node and material, sized from the templates (`nodeBudget`) for up to 12 plants;
  a node with no instances is hidden. Modules cast real shadows on High; flat pieces do not.
- **Loading:** a world's kit loads when the run arrives there (or with the next world's preload in endless) and is released
  after its last plant.
- **Late batteries** (user, 3 November): a ground cue that spawns at the top edge (late in a level, when the director runs
  behind) keeps only the modules from `LATE_BEHIND` behind its seat (`behindOnly`), so the plant scrolls in already
  standing beyond the edge while the gun rises out of the ground (`DEPLOY` in `src/render/scene.ts`); with no module that
  far back the battery has no plant. Leading late cues in from beyond the edge instead delayed their fire and cost the test
  pilot 20–60% more hits.
- **Missing kit:** in production the legacy emplacement stays; in development and tests registry stand-ins (boxes,
  cylinders, an arc) replace a missing node (`facilityOptions.standIns`).
- **QA stats:** the render stats' `facilities` entry (loaded kits, plants, arrangements, modules).

Fixture: `tests/fixtures/nacre-world.html?planet=<world>&facility=<arrangement>` shows a plant of a chosen arrangement.
