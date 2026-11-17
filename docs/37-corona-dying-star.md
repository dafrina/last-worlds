# Corona, the Dying Star

Corona is the plasma world: the campaign's sixth mission, Dying Star, and the fifth world of the endless cycle. This doc
covers its look, its world generator, its Blender kits and fleet, its two strike sites and THE HELIOPHAGE. It follows the
user's three sheets in `art/concepts/corona/` (references only): the world (`01-world.webp`), the infrastructure
(`02-infrastructure.webp`) and the craft (`03-craft.webp`). The user's brief (5 November): "A world so close to its star
that its surface is being torn apart. Not ordinary lava: vast oceans of radiant plasma, black magnetic structures rising
out of the light, and colossal glowing arcs crossing between the islands."

## 1. Identity

- **Gold plasma, not lava.** The sea at `CORONA_SEA_LEVEL` (5 units under the plateau; user: "lower the lava level, the
  cliffs look so miniscule") is Vesper's water material in a plasma mode (`src/render/water.ts`): emissive, with slow
  warped convection, dark swirling veins of cooler skin, a web of white-hot filaments through the hottest pools and a
  white-hot seam where it licks the rock. It rides the terrain frame and costs about a dozen noise lookups a pixel.
- **Black basalt islands.** Land and plasma meander in winding bands, so every screen holds both (user: "i dont like to
  have just a sea of lava or just a plan rock screen. It should always have both"). The land steps up in tiers from just
  over the plasma, separated by sheer risers (user: "make the terrain height vary more, like khepri"), with mesas a tier
  or two higher, crisp cliffs and glowing orange cracks densest toward the shore.
- **The colossal arcs** (`src/render/corona-arcs.ts`, render only): loops of plasma, a white-hot core in a gold halo,
  rising out of the sea, holding with pulses running along them, snapping open at the apex and sinking back (user: "would
  be cool to have them kinda emerge like plasma behaves"). Seeded in the terrain frame, at most one per `SLOT` units
  ("we need way more of those plasma flares"), both feet in open plasma, turned to face the camera; the apex stays
  `APEX_CLEARANCE` under the flight plane and shots draw over them anyway.
- **Smoke banks** (`src/render/corona-haze.ts`, render only): stacked slices of one density field, each higher slice
  showing only the denser core, so banks dome up and parallax as the ground passes; dark and warm low, a lit grey on top,
  thick at their cores, always under the lowest island tier (user: "the smoke ... looks like its everywhere, like a plane",
  "You can make them really thick at points").
- **Light:** a white-gold star, a hot orange bounce from the plasma below, strong bloom and warm haze (`LOOKS.corona` in
  `src/render/scene.ts`). Corona keeps the sun ahead (`sunBehind: false`), unlike Umbra and Nahara.
- **Palette:** `CORONA_PALETTE` in `src/world/terrain-corona.ts` (charcoal basalt, its dark seams, heat scorch toward the
  shore, the seabed): lighter than Umbra's glass (user: "the terrain is also too dark compared to the coincept"), its
  darker spots deep but the contrast high ("The darker spots should be a bit deeper dark but keeping the contrast high").
- **Faction paint:** `WORLD_PAINT.corona` in `src/render/world-paint.ts`.

Readability rules:

- **Enemy fire and ace shields are blood red** (`HOSTILE_BLOOD` in `src/render/shot-colors.ts`, `PLANET_GLOW.corona` in
  `src/render/scene.ts`): coral vanished into the gold, and magenta was tried first (user: "warm red not magenta").
- **Ground batteries over the plasma** ride black basalt rafts that leave no foam, not Vesper's white pontoons.
- **Terrain is scenery only:** everything stays under the flight plane (§3).

## 2. Dying Star and Corona's fleet

### Mission

Dying Star (`dying-star`) is campaign mission 6, between Brood Strike and Silent Empire (`CAMPAIGN_ORDER`). Its arc is
`DYING_STAR` and `DYING_STAR_SORTIE` in `src/content/encounter-deck.ts`: Final Horizon's arc and sortie stretch under its
own slot ids (`c-`), with a Skimmer pair in place of the first dart line (user, 13 November: "the split shot is amazing.
I want more of these enemies, put them in corona as well"). So it meets the Wraith at its first contact and twice more,
two artillery ships (Pulsars) in their own slots, and the fleet's convoys in the climax
([docs/28 §2](28-umbra-eternal-eclipse.md#2-final-horizon-and-the-umbral-fleet)). It does not take Final Horizon's Relic
Shield; the Relic Shield first flies on Nahara. Its draws come from Corona's own pools (`DECK_POOLS.corona`: Amnion's waves
and Skimmer waves; the Wraith and the Pulsars fly only in their slots).

Pressure comes from `WORLD_INTENSITY.corona` (between Amnion and Umbra in the late-world curve, 10 November),
`MISSION_CADENCE['dying-star']` and `MISSION_PRESSURE['dying-star']` ([docs/40](40-balance-measurement.md)). The shield cells
are `HELIOPHAGE.shieldSupplies` (THE ECLIPSE's).

### The fleet

Corona flies Umbra's roles with the Wraith and the Skimmer (`authoredKinds('corona')`), in its own models
(`CORONA_CRAFT` in `src/render/scene.ts`, `public/assets/corona/corona-craft.glb`, built by `tools/blender/craft_corona.py`
after the craft sheet):

| Node | Kinds | Shape |
| --- | --- | --- |
| `corona_interceptor` | dart, Needle, Skimmer | a lance hull with a spike nose, a glowing spine, raked side fins |
| `corona_fighter` | weaver | an arrow body, wings swept back then hooked forward, two nacelles |
| `corona_hunter` | Lancer | a long armoured hull round a glowing core, twin cannons, side pods |
| `corona_carrier` | Diamond | the broad heavy, three glowing cannons in its prow, stub wings |
| `corona_artillery` | Pulsar | an open ring of two crescents round a glowing core, a barrel forward |
| `corona_turret` | turret and missile batteries | an armoured drum, buttress blades, a cowled head |
| `corona_wraith` | Wraith | a reactor hub between two great crescent scythes, a spiked prow |
| `corona_drone` | THE HELIOPHAGE's drones | a small pointed dart with a glowing eye |

The hulls are built on the Umbral fleet's surfaces (smooth lofts meeting at knife edges, glow in grooves) in dark
scorched-bronze armour with bright gold edges and molten-gold glow; pale plates washed out over the plasma. The user had
called the earlier passes "really cheaply made. Like toy insects" (6 November) and approved this one ("darker armor is
fine but i like the shapes better now"). Aces are Wraiths (`HUNTERS.kinds.corona`); the Wraith's teleport discs burn
orange here ([docs/28 §3](28-umbra-eternal-eclipse.md#3-the-wraith)).

## 3. World generation

The profile is `CORONA` in `src/world/terrain-corona.ts`, built on Umbra's (`...UMBRA`) with its own landform, colour,
dressing and sea. Pure functions of the seed and world position.

- **Land and plasma** (`coronaMasks`): bands of rock and plasma alternating across the map, snaking and pinching into
  necks and islands; plasma rivers and pools cut through the land masses. A winding causeway runs along the central route,
  broken now and then by a plasma crossing.
- **Tiers** (`landLevel`, `bench`): the land rises from `LOW` (just over the plasma) about `RISE` units, cut into tiers
  `STEP` apart by sheer risers, Khepri's and Vesper's way; the causeway keeps to the lower tiers. Mesas (`MESA_STEP`,
  `TIER_STEP`) stand over the islands' cores, never on the causeway. Basalt plates about 3.6 across each lean a hair
  their own way (`plates`). `cliffs: true` gives crisp rim creases and per-face wall shading (`WALL_LOOK.corona`).
- **Glowing cracks** (the ground shader's vein lines) run through all the rock, densest toward the shore.
- **Near the side routes**, where strike sites stand, the tiers are gentler and no mesa stands (`sideRoute`; user: "cant
  they generate on the rocks?", then "they can sit in lava just not exclusively"), so most sites seat on rock and the rest
  on decks in the plasma.
- **Scenery caps:** Umbra's (`UMBRA_SCENERY_MAX`, and `UMBRA_SPIRE_MAX` for columns, spires and the infrastructure).
- **Dressing** (`coronaScatterSteps`):
  - Khepri's basalt kit in charcoal (user: "couldnt you use khepris basalt columns"): column clusters and lone columns
    standing out of the plasma, more of them near the shores; crags on the mesa rims; boulders, fallen columns and rocks
    on open rock;
  - Khepri's columnar cliff walls (`cliffWall`) along every coast, tier riser and mesa face, their feet down to the plasma;
  - now and then one of Corona's own infrastructure modules on level rock, facing the camera (§4).
- **Boss arena:** THE HELIOPHAGE floats over the world's own ground; the arena only levels the mesas and tall dressing
  (user: "no need for a special lava only lake for the boss, he will float anyway").

## 4. Blender assets

| File | Builder | Contents |
| --- | --- | --- |
| `public/assets/corona/corona-kit.glb` | `kit_corona.py` | The infrastructure sheet's six modules (`CoronaKitKind` in `src/world/scenery-kit.ts`): a captured star between two arms (`corExtractor`), a lattice collector tower with fan panels (`corCollector`), a ribbed half-barrel hangar (`corHangar`), a refinery of banded tanks and a plasma column (`corRefinery`), a gantry over a landing pad (`corGantry`), a ribbed dome (`corDome`). Gunmetal frames, bronze-grey plates, gold glowing seams; the kit shader burns `*glow*` faces orange. |
| `public/assets/corona/corona-craft.glb` | `craft_corona.py` | The fleet (§2). |
| `public/assets/corona/the-heliophage.glb` | `boss_heliophage.py` | THE HELIOPHAGE (§6). |
| `public/assets/khepri/khepri-kit.glb`, `public/assets/khepri/cliff-kit.glb` | `kit_khepri.py` (shipped through `kit_refinement.py`), `kit_cliffs.py` | Khepri's basalt dressing and walls, tinted charcoal on Corona. |

Corona builds no facility plants.

## 5. Strike sites

Corona's site pool ([docs/33 §3](33-strike-sites-and-encounter-deck.md)) holds its two own sites, the crash site and the
airfield:

- **Star Extractor** (`star-extractor`), a parts site: a legged rig drawing plasma out of the ground (user, 5 November: "one
  should be a star extractor facility"; "The one we worked on should be star extractor"). It is the most likely draw.
- **Star Cage** (`star-cage`), a shield site: a captured star held between two arms (user: "rename this something else,
  doesnt look like a star extractor anyways").
- The **crash site** and the **airfield**, the airfield only recoloured (user: "no new model tho").

Corona's finishes are ancient machinery (user, 5 November: "they look like toys now. refine them, alien and ancient looking,
and also mechanical"): carved stone with glyph grooves, monolith posts, ring gears, ribbed pumps and pistons, dark iron
and oxidised bronze, texture-baked by `tools/blender/sites_strike.py` with `lib_solids.STYLES['corona']` (plates, ash,
soot, worn bronze edges). Corona's sites may stand on foundations down to the plasma (`siteDropMax` in
`src/sim/sites.ts`), as the concept's structures rise out of it; at least 60% seat on rock
(`tests/sim/site-seats.test.ts`).

## 6. THE HELIOPHAGE

The user's Tripo GLB, given THE ECLIPSE's fight (user, 5 November: "reuse the eclipse boss ... same gameplay we will replace
the boss later"; it has had its own model since that day). Its numbers are `HELIOPHAGE` in `src/content/heliophage.ts`
(THE ECLIPSE's values with its own positions), its definition `BOSSES.heliophage` (THE ECLIPSE's parts, moves and
messages under its own name), its view `HELIOPHAGE_STYLE` in `src/render/carrier-view.ts`.

- **Targets:** the two armoured blocks' vent grilles (the first pair; `ventOffset`, `ventS`), the central tower's glowing
  column (the third first-phase target, as THE ECLIPSE's prow vent; `prowS`) and the caged molten core (`reactorS`).
- **Fight:** THE ECLIPSE's ([docs/28 §6](28-umbra-eternal-eclipse.md#6-the-eclipse)), including its Fracture Wave and
  Boomerang Barrage; drone waves from the claws' tips (`bays`). Its campaign health includes
  `MISSION_PRESSURE['dying-star'].bossHp`.
- **Arrival:** it flies in from beyond the top of the screen to its row (`entryS`, `HELIOPHAGE_STYLE.fliesIn`; user, 6
  November: it "should not rise from the depths ... it should come in from top of the screen") and hovers between the
  plateau and the flight plane (`HELIOPHAGE_STYLE.hover`).
- **Effects:** its own sparks, flashes, steam and smoke in white gold, molten orange and ash (`HELIOPHAGE_STYLE.fx`; user,
  6 November: they had been purple).
- **Model:** `art/source/bosses/heliophage-tripo-original.glb`, adapted headless by `tools/blender/boss_heliophage.py` with
  THE ECLIPSE's helpers. It is laid flat with its concept view to the camera, spires away from the player and claws toward
  them, 16 units wide (user: "Make it 16 units wide, the eclipse is the final boss"), its depth squashed so it fits under
  the flight plane. Its core turns 10° toward the player (`tilt_core`; user: "The core of heliophage should point more
  down"). The mesh, UVs and atlases are kept and reduced under the 80,000-triangle cap, with an emission mask from the
  painted glow. Nodes `heliophage_hull`, `heliophage_pod_left`, `heliophage_pod_right`, `heliophage_prow`,
  `heliophage_heart`, a wreck of each target, and the marker `heliophage_approved_v1` (a real identifier).

## 7. Music

*Hymn for a Swollen Sun*, 110 BPM (`THEMES.corona` in `src/audio/score.ts`): modal over a drone, an open E–B fifth with no
third and the ♭2 as a colour in its third section. A low harp plucks once per ten-sixteenth cycle, so it drifts across the
4/4 bar; a lament of a few long notes in maqam Bayati and, over the ♭2, Saba, with slow slides; a darbuka. The user asked
for "ominous harp sounds or something" (10 November), then for something "more mysterious arabic inspired not so happy at
times" with fewer notes (11 November). The boss stem's drums follow the darbuka's pattern with the fights' kick under
them. Details: [docs/24](24-sound-design.md).

## 8. Endless

Corona flies between Amnion and Nahara in each endless lap (user, 5 November: "i thought every level will be used in
succession in endless"; [docs/18](18-endless-planet-cycle.md)). Its stages are staged from Dying Star's arc (`lateStages`):
the opening with its strike site, the pressure stage without one, and later visits the climax arc with a site between
its halves. Its world missions are in [docs/35 §3](35-missions.md#3-the-missions).

## 9. Tests

Corona has no test file of its own; it is covered where every world is:

- `tests/sim/encounter-deck.test.ts`: every world's pools and resolved lists keep to its roster, Corona's included.
- `tests/sim/site-seats.test.ts`: Corona's site seats, at least 60% on rock (`CORONA_ON_ROCK`).
- `tests/world/terrain-route.test.ts`: THE HELIOPHAGE's arena keeps the ground under it at the plateau.
- `tests/sim/late-world-curve.test.ts`: Dying Star's first windups and repeat fire on its step of the curve, in both
  modes.
- `tests/world/site-models.test.ts`: the Star Extractor, the Star Cage and every Corona finish against the site contract.
- `tests/sim/umbra.test.ts`: THE HELIOPHAGE's third first-phase target.
- The fairness suites fly Dying Star at every difficulty and Corona's endless stints.

## Open

- No phone test of the plasma shader, the smoke banks or the arcs.
