# Vesper, the Glass Frontier

Vesper is the ice world: the campaign's third mission, Cold Vector, and the second world of the endless cycle. It
follows the right panel of `art/concepts/01-worlds-direction.png` and the VESPER column of
`art/concepts/05-alien-factions.png` (references only). This doc covers its look, the planet-profile system it
introduced, its Blender assets, its world generator, and the Cold Vector mission with its enemies and HELION STRONGHOLD.
Vesper shares the systems of every world but must never look like Khepri.

## 1. Visual identity

- **The sea is the base.** Half of Vesper is a deep blue animated sea (terrain version 15; user, 21 October). Khepri has
  no water.
- **Ice shelves instead of basalt mesas:** flat-topped snowy shelves at several levels, stepping up inland in sheer,
  fractured ice walls; wide inlets and open leads cut through them.
- **Pack ice instead of canyons:** broken floes, cracked floe sets and small icebergs on open water, drifting slowly.
  The drift is presentation only (seed and time).
- **Shelf detail:** crevasse fields, pressure ridges, snow drifts, dark rock outcrops and nunataks, small stones alone or
  in loose groups (thinner along the routes), and a fine crack pattern across the snow.
- **Light:** a high, pale, slightly cool sun; blue shadows; a white-blue haze; ice glints; a pale low mist over the sea
  and down the cliffs with the shelves clear (the user's playground fog, 23 October). No falling snow or weather that
  could hide shots. The values are `LOOKS.vesper` in `src/render/scene.ts`; the reflection sky is
  `createIceEnvironment` in `src/render/models.ts`. The bloom threshold keeps snow from blooming.
- **Palette:** `VESPER_PALETTE` in `src/world/terrain-vesper.ts` (snow, shaded snow, light and deep ice, charcoal rock,
  ocean, shallows).
- **Contrast order** (user, 3 November): bright snow, blue-grey walls, dark sea.
  - Ice walls (the kit's wall pieces, the ground's wall faces and crevasse walls) are a mid-tone blue-grey, darker toward
    the foot, so a cliff's shaded base never merges with the sea.
  - Snow sits a little below white (`SNOW_TRIM`) so drifts and texture keep their relief, and the kit's snow takes a
    milder trim (`KIT_SNOW_TRIM`) so floes stay bright on the sea. Both are in the `VESPER_SLATE` shader block in
    `src/render/terrain-kit.ts`.
  - The sea, its shader and the look values stay as they are (user: "dont change vespers water i like it").
- **Faction paint:** metallic white and brushed steel with blue glow (`WORLD_PAINT.vesper` in
  `src/render/world-paint.ts`; user, 21 October). The infrastructure and craft models are authored in black ceramic with
  orange glow; the runtime recolours them by brightness. Vesper's craft have their own darker ramp and an edge shade, so
  a pale hull keeps a dark outline over snow and a lit top over the sea (3 November).
- **Moods along the route:** shelf coast, pack-ice sea, crevasse plateau, radiator plains, icefall and nunataks.

**The ocean** is `src/render/water.ts`: one opaque draw per visible water strip, no reflection pass. Shallows to deep
by depth; four analytic travelling swells in the terrain's frame (normals only, the surface stays flat); low roughness
so the sun leaves glints; broken white foam along every shoreline; one instanced draw of foam collars around floes and
wakes behind moving hulls. Seabed below the water is darkened and hidden.

## 2. Planet profiles

Vesper turned the world generator into planets as data, not code forks; every later world follows the same scheme.

- **A planet is a profile** (`PlanetProfile` in `src/world/terrain-planet.ts`; all of them in `PLANETS`): landform,
  moods, colour, sea level, scenery cap, scatter, floes, settlements, network style and districts, as data plus a few
  small strategy functions. Shared code (sections, seams, streaming, roads, pipelines, arenas) reads the profile.
  Khepri's profile wraps the original functions, and its output stays byte-identical; recorded fingerprints guard that
  (`tests/world/terrain-vesper.test.ts`).
- **Missions select a planet** (`MISSION_PLANET` and `runPlanet` in `src/content/missions.ts`); endless follows its
  schedule ([docs/18](18-endless-planet-cycle.md)). The terrain takes a world (a planet plus any arena) or a route of them.
- **Render loads per planet:** terrain kit, infrastructure kit, craft, boss and facility kit, the shared kit's palette,
  the look (light, grade, fog, sky), the paint and the water (`prepare(planet)` in `src/render/scene.ts`).
- **Look-dev:** `?planet=<world>` streams another world's terrain in any run (development only, never in a menu).

## 3. Blender assets

All are seeded, deterministic scripts in `tools/blender/` with the same conventions as Khepri's kits: +Y up, game
units, base-centre pivots, `COLOR_0`, box UVs and contract self-checks. Provenance and previews are in `art/vesper-kit/`,
`art/vesper-infra/` and `art/vesper-craft/`.

| File | Builder | Contents |
| --- | --- | --- |
| `public/assets/vesper/vesper-kit.glb` | `kit_vesper.py`; the shipped file adds the 19 October refinement through `kit_refinement.py` | Ice cliff segments, seracs, ice spires, icebergs and floes (single, and cracked pairs and triples that drift together; waterline at y = 0), pressure ridges, snow drifts, snow-capped rock outcrops, frozen vent stacks. Materials `vesper_ice`, `vesper_snow`, `vesper_rock`. Node kinds in `src/world/scenery-kit.ts` (`VesperKitKind`). |
| `public/assets/vesper/vesper-infra.glb` | `kit_vesper_infra.py` | Radiator field arrays (tiling), missile and cannon emplacements on hex plinths, a cryo dome, two habitat pods, a tiling harbour pier and a crane, a comm needle mast, an ice-hauler crawler and an icebreaker (background traffic). Materials `vesper_ceramic`, `vesper_glow`. Sizes and roles in `src/world/settlement-modules.ts`. |
| `public/assets/vesper/vesper-craft.glb` | `craft_vesper.py` | `vesper_needle`, `vesper_diamond`, `vesper_missile_battery`, after the faction board. |
| `public/assets/vesper/cliff-kit.glb` | `kit_cliffs.py --world vesper` | Fractured ice-shelf wall segments ([docs/26 §11](26-terrain-relief.md)). |
| `public/assets/vesper/textures/ice-wall-*.jpg` | `textures_cliffs.py` | Procedural ice-wall crack detail and normal maps. |
| `public/assets/vesper/facility-kit.glb` | facility kits ([docs/25](25-modular-facilities.md)) | Battery compounds and plants. |
| `public/assets/vesper/helion-stronghold.glb` | `boss_stronghold.py` | HELION STRONGHOLD (§5; the HELION ARK's `helion-ark.glb` and `boss_ark.py` before 17 November, in git history). |

The shared industrial kit ([docs/14](14-shared-industrial-kit.md)) is reused through its palette masks; roads become
packed-snow tracks with tread ruts. Khepri's own buildings are not reused on Vesper.

## 4. World generation

The Vesper profile is `VESPER` in `src/world/terrain-vesper.ts`.

- **Sea and shelves.** The sea stands at `VESPER_SEA_LEVEL` (lowered in terrain version 16 so the ice walls are as tall
  as Khepri's canyons; user, 21 October). Since 18 November the whole level lies `VESPER_DROP` (3.75, fifteen grid steps; 2.5 and
  1.25 earlier that day) lower, sea, ice, outposts and pieces alike (user: "Could we lower the vesper sea and current terrain to have more room to
  scale the mountains?", as Amnion's 1.2 on 23 October): the relief is built in its first frame and lowered as a whole,
  the pieces' and outposts' cap is `VESPER_PIECE_MAX` (the scenery cap less the drop), and the renderer's Vesper fog and
  ice-wall shading follow it down. `VESPER_SCENERY_MAX` (3.0) stays the cap over Vesper, which HELION STRONGHOLD's peaks
  reach. Ground batteries and strike sites seat themselves on the lowered ground through the lens (docs/05), so they stand
  deeper and their lines of sight meet the ground a little further from their tracks: over seeds 1–12 the endless perfect
  pilot takes 24 hits in sectors 1–8 at 2.5 lower, 21 at 1.25 and 18 before (13, 10 and 7 on Vesper, all from its missile
  batteries); 23 of 192 Vesper strike sites have a guard in the clearance band at 2.5 lower (deepest 0.70), 20 at 1.25 and
  none before (tests/sim/site-seats.test.ts allows 12.5% on Vesper). Their causes
  (found 18 November): the game stays consistent (shots leave from the battery's fixed muzzle); the test pilot
  (tests/sim/pilots.ts `perceive`) copies each enemy shallowly, so in the 0.2 s it looks late a battery's live muzzle is
  already cleared and it places the missile where the battery shows now, not where it launched; deeper ground's parallax
  turned 3 near-misses into hits. Copying the anchor makes Vesper's missile hits 0 before and after the drop, but changes
  every pilot-driven run on every world (6 other tests' seeds would need picking again), so it is left for the integrator.
  The sites: all 20 are a vault or depot at the world's edge with the camera at the far extreme, its authored spot past
  `SEAT_SEARCH.maxX` (9.80 → 10.24) and its inner guard on a pontoon 1.25 deeper, so it spreads 0.33 nearer; a taller
  Vesper pontoon deck (0.45, a visual change to its hull) or seats moved toward the camera would remove them. Shelves stand one to several tiers over the water and step up inland in ice
  cliffs; ice plateaus rise a tier or two above the shelves on sheer walls. The land share is about half over long
  stretches of the route (tested). The relief rules are [docs/26 §4–5 and §10–11](26-terrain-relief.md).
- **Moods** (`VESPER_MOODS`, `MOOD_SETTINGS`): land share, leads, crevasses, ridges, rock, floes, shelf height, cliff
  step, inland stairs, inlets and plateaus per mood; never the same mood twice in a row.
- **Ice walls** stand on every big face (crevasses, ridges and beside outposts included) in continuous runs, never on
  small steps or faces turned away from the camera (`cliffWallSteps` with `iceWall`; user, 22–23 October).
- **Pack ice.** Floes have stable ids and drift in presentation; the terrain view's live features (floes and vent-stack
  tops) feed foam collars and steam. Every piece stays under `VESPER_SCENERY_MAX`.
- **Outposts** stand on shelf ice: `VESPER_ARCHETYPES` (radiator fields, missile and cannon sites, cryo stations,
  processing plants, heat exchangers, thermal reactors, harbours), after the facility sheet
  `art/concepts/facility-sheets/vesper.jpg`, built of the Vesper infrastructure and the shared kit. Harbours run jetties
  over open water. Snow tracks stay off water. Pipelines cross leads only on trestles (`WET_TRESTLE_CELLS`), and lines
  that would mostly cross water are not planned.
- **Readability.** The same rules as Khepri: calm routes, no repeated rhythm, budgets, seamless and deterministic
  sections, incremental generation identical to synchronous.
- **Boss arena** (HELION STRONGHOLD's low ground and mountains; `strongholdGround` in `src/world/terrain-vesper.ts`). The
  user, 17 November: "the vesper boss should not be a rock/cliff/mountain next to water, it should go from snowy/icy
  terrain to high alpine mountains (as well as possible)", then "have the terrain around the mountains be just above sea
  level", "obviously dont make it plain", "try tall peaks behind the fortress", "you may also start the alpine mood
  before the boss, not that it starts open snow field then boom mountain" and "the stronghold should clip into the mountain
  walls slightly on its backside". Only rows of a Vesper boss arena change, in campaign and endless alike (everything in s
  past the arena's start):
  - the alpine mood: from −118 (Cold Vector about 165 s in, some 20 s before the stop) distant ranges rise beyond the
    world's edges and foothills toward them; from −100 the ground turns rockier and snowier (more rock, ridges and
    crevasses in every mood); the foothills climb over the approach;
  - the low ground: from −46 to −16 Vesper's own landform is pressed down to just above the sea (`low` the sea + 0.45, `squash`
    0.2 from SHELF_LOW), its shelves becoming low ice shelves with small breaks; its pressure ridges, drifts and dark rock
    stand out of it, its crevasses and open leads of dark water stay, frozen pools lie on its flats, and the land share
    rises (`landed` mood parameters: more land, fewer inlets, crevasses, ridges and rock in every mood). It is dressed all
    over with Vesper's scatter (stones, outcrops, seracs, ridge slabs, ice walls on the leads' banks); round the fortress
    it never opens to the sea;
  - the mountains: an alpine massif (warped ridged noise with sharp crests and couloirs) rises from that low ground. Its
    height runs from its foot to its top through the ridged relief with summits and saddles along the crests, so it meets
    its top only at the summits and never in a plateau (no soft cap since 18 November). Tall peaks reach the scenery cap
    (3.0, some 7.4 over the low ground) beside the fortress and in a broken shoulder behind its roof, whose crest wanders
    and whose spurs run down into the corridor behind; before the fortress the fight's lanes keep low ground (the peaks
    start just past the plan's front), and toward the edges elsewhere the foothills keep low (`Landform.ceiling` lets the
    ranges beyond the edges rise to 6.5 by the fortress; ground there never hides the flight plane). Where the tall peaks
    end and where the massifs come down wanders along x. Its colour (tone over 1, `massifColor`): dark blue-grey stone on
    the steep faces, snow on the shoulders and dusted in streaks over the stone; crags on its ledges;
  - the fortress stands at the head of the corridor on a ledge, short since the same day ("i also like seed 4 best, maybe
    we should limit it to shorter cliffes, but make them more varied, jagged, maybe a second or third layer too": the ledge
    runs out 0.35–2.25 before the fortress, `strongholdReach`, then steps down in one to three broken drops with narrow
    tiers between them at the arena's own heights and offsets, `strongholdSteps`, sheer faces with an overhanging lip,
    buttresses and gullies) and set into its mountain ("the fort looks not to be set into the mountain enough. The cliffs
    are like cut off, not a steep slope where the fortress is set into": beside its rear two thirds and behind it the
    mountainside climbs straight from the model's edges, steep and rough, over its rear and upper flanks, to the mountain's
    ridged top; the ground round its front still meets its edges and climbs as a slope, never a wall standing off it). Then
    the view is one mountain from bottom to top ("lower third mountain base, middle third the ascend and top third peak with
    the fortress between 2 and 3"): the ascent below the ledge climbs from the low ground in three to five rock bands over
    the middle of the view, rock ribs running up it and gullies down it, under the cap; past the fortress's shoulder, beyond
    the fight's play area (28.8 past the arena's start), the peak behind it rises over the flight plane to 9 ("you can now increase vertical space even more right?") across the
    whole width and comes down past the departure, which the ship climbs over after the kill (`departureClimb`). It
    began (user, 18 November: "maybe have it sit on a middle layer,
    where theres cliff as now behind and sideways of is as now, but also a cliff and mountain walls layer below it in
    front", then "maybe dont make it a hard rule to have cliffs right in front of the fortress, but make it so it can also
    appear mid screen"): the ledge lies at the model's foot, 2 over the sea (`STRONGHOLD_LIFT`, below), and runs out before
    the fortress as far as the arena's own reach (`strongholdReach`, from the seed and the arena: from just below the
    fortress to past mid-screen, tilted across the view and curving), a little round its front corners, then drops in a
    broken cliff (buttresses, gullies, a snow bench here and there, scree) to the low ground, which keeps down to the
    cliff's foot. Ground at the ledge's level stays under everything the lens must see. The ground fits its model's measured top
    (`src/world/stronghold-seat.ts`, cast straight down every quarter unit; the test re-measures it): under the model it
    keeps 0.3 under the lowest top within half a unit (gaps inside its outline too, never under the sea), round it it
    meets the model at its edge's height (burying the cut faces) and climbs from there as broken rock, never as a wall
    at the edge. Its rear is taken in by the mountain: over the last 1.4 of the plan and its outer rear corners the rock
    rises against and over the structure to the shoulder, so its back disappears into rock. The ground just before the
    barrels and housings stays low, so no ground hides them from the lens at the camera's centre or extremes;
  - past the fight the corridor runs on low under the departure; the massifs come down from about 62 to 82 and Vesper's
    own terrain returns from 78 to 98. (Until 18 November the rock taking in the fortress's rear went on rising behind
    it, so the corridor behind the fortress was massif to the fall, held flat at a pass's floor 2 over the sea: a plain
    cut off in a straight line at the top of the fight's view, seen as the terrain ending when the ship flew off. The user:
    "its the terrain generation that stops at the top edge of screen and is visible when we fly away after defeating it".
    Terrain streaming was never the cause: the section window always holds 36 units past the scroll, more than the lens
    sees.) The departure is not auto-centred (the ship steers throughout), so the cap over the play area holds in it too;
  - its works (user, 18 November: "maybe also have pipes running to and from it horizontally and connected
    infrastructure up front", then "dont use more than one pipeline tho, connect them properly"; `src/world/stronghold-works.ts`):
    since the same day on the lower plateau only: one pumping station on dry low ground before the ascent, of Vesper's own
    outpost pieces (a cryo dome, a habitat, radiators, a comm mast, tanks), and one short line from it into the ascent's
    foot; nothing on the ascent or the ledge; its side is the arena's own. Decorative, under the caps.

## 5. Cold Vector and HELION STRONGHOLD

### Mission

Cold Vector (`cold-vector`) is campaign mission 3 (threat 3). Its arc is `COLD_VECTOR` and `COLD_VECTOR_SORTIE` in
`src/content/encounter-deck.ts`:

1. an introduction over the shelf coast: one Needle, one Diamond, a missile-battery pair;
2. Needle lines, missile batteries and Diamond pairs;
3. two side-route places for strike sites;
4. missile batteries on the ice cliffs, with Needle lines and a sweeping Needle column;
5. a fuel-barge stretch;
6. the escort-convoy climax of Diamond convoys, missile batteries and Diamond pairs;
7. relief over the snowfields, then the scroll eases to a stop in the valley before HELION STRONGHOLD.

Pressure comes from `WORLD_INTENSITY.vesper`, `MISSION_CADENCE['cold-vector']` and `MISSION_PRESSURE['cold-vector']`.
The shield cells are `HELION_ARK.shieldSupplies` (three on Relaxed and Standard, two on Veteran).

### Vesper's enemies

Vesper flies only its own kinds: Needles, Diamonds, missile batteries and fuel barges (`authoredKinds`). Their stats are
`ENEMIES` in `src/content/balance.ts`; their shapes are in `src/sim/attacks.ts`.

- **Needle** (`needle`): a fast interceptor whose attack is a very narrow lane locked on the committed position
  (`NEEDLE_BEAM`: a windup, a short flash, then a brief beam). A Needle beam costs one shield charge; a Lancer's costs
  two. Before firing, a Needle swings over its lane and fires straight down from its nose (`applyBeamLock` in
  `src/sim/motion.ts`). Needle beams do not count against the wide-beam lane cap.
- **Diamond** (`diamond`): a heavy escort whose whole pale body takes hits. It fires three tight rounds from one wing,
  aimed to that side of the committed position, and alternates wings (`DIAMOND_VOLLEY`).
- **Missile battery** (`missile`): a ground target that fires one straight, non-tracking missile down its own marked
  column. It moves with the terrain and does no contact damage.

Formations: `needle-solo`, `needle-line-3` (lanes stepping across the committed position), `needle-column-5` (a column
sweeping across, mirrorable), `diamond-solo`, `diamond-pair`, `diamond-convoy` (two Diamonds with two Needle escorts),
`missile-2`, `missile-3`, `depot-missile`, and the boss-only `ark-launch`.

Rules that keep Vesper's beams readable:

- **Side lanes inside a beam's reach** (user, 8 November: barrages "left and right of my ship, without moving i wouldnt
  even be hit"). The Needles' aim offsets put every side lane within a narrow beam's reach of a still ship, so holding
  still is never safe; stagger, warnings and the hazard-union admission are unchanged.
- **Laser flocks alternate with laser-free squadrons** (user, 8 November: "constantly a new flock of lasers once you
  defeated them"). In Cold Vector and Vesper's endless stages, every second laser flock (any air wave with Needles or
  Lancers) is a laser-free Diamond squadron, and a drawn wave keeps its slot's side of the alternation (`keepsBeams` in
  `resolveDeck`). A strike site's own guard is the only exception.
- **A cap on warning lines.** Outside campaign Veteran, Vesper shows at most `VESPER_LINE_CAP` warning lines (windups and
  live lanes) at once (user, 31 October and 6 November).
- **Beam rests.** After a run of Needle beams with no real pause, new Needle windups wait (`DifficultyScale.beamRest`;
  [docs/11](11-campaign-difficulty.md)).
- **Aces** on Vesper are shielded Diamonds (`HUNTERS.kinds.vesper`).

### HELION STRONGHOLD

A fortress built into a mountain face at the head of the arena (user's specification, 17 November 2026,
[docs/43](43-boss-visual-overhaul.md) §8-10). It replaced the flying HELION ARK's model; the boss keeps the Ark's id
(`ark`), field names and fight. Runtime values are `HELION_ARK` in `src/content/ark.ts`; the shared definition is
`BOSSES.ark`; the fight follows the shared boss rules ([docs/03 §3](03-worlds-and-generation.md#3-bosses)). The content
calls the two cannons "radiators" and the reactor "bridge"; on screen they are cannons and the reactor.

**It never moves** (`stationary: true`, as THE CITADEL; 17 November). Its arena has no sway or surge, it enters at its
row (`entryS` = `row`), and it is never pulled toward a pilot who keeps its targets out of view
([docs/10 §5](10-wide-map-and-camera.md)). Parked far enough to the side, a pilot kept its targets out of view and held
off its attacks (parked at the right edge, seeds 1–4, 30 s: no windups, against 72 for the Ark); since 17 November its
terrace guns fire on such a pilot instead (user: "so there's no safe hiding spot"): the twin turrets on the fortress's lower
terrace (`HELION_ARK.terraceGuns`) wind up the bridge's aimed burst at a pilot who has kept every target out of view for
2 s, a volley every 2.6 s while it stays hidden (docs/10 §5; the turrets' points moved with the grown fortress at row 9).
The Ark swayed 1.3 and surged 0.7, glided in from 26 and was pulled toward the view.
With it fixed at x 0 its lanes always fall on the same columns (x 0 and ±2.98); the fairness suites pass (Cold Vector on
every difficulty, endless sectors 5–7), and the perfect pilot clears it on every weapon and difficulty without a hit (on
Veteran seed 57 it no longer reached the far cannon with the Fan Cannon once the sway stopped bringing it into the fan; the
test flies seed 58).

**Targets.** Two cannons at ±`radiatorOffset`, `radiatorS` behind the pivot, radius `radiatorRadius`, and the reactor at
`bridgeS`, radius `bridgeRadius`; the fortress and its mountain are scenery, not a hidden collision box. Base hit points
`radiatorHp` and `bridgeHp`, scaled as every boss's.

| Phase | Attacks |
| --- | --- |
| Arrival (`arrivalDuration`) | Its awakening: it already stands in its mountain as the scroll stops; steam bursts from its vents, its cannons and its reactor light in turn. |
| Cannons | Narrow lane lasers (`HELION_ARK.laser`) straight down the firing cannon's column, alternating cannons; every third attack an aimed burst from the reactor's door instead (`bridgeBurst`), so the middle between the lanes is not safe for long. |
| Reactor | The blast door opens. Aimed three-bolt bursts, and finite launches (`launches`): waves of two Needles (`ark-launch`) from the hatches either side of the door, one wave at a time, only while they are in view. |
| Overload | `overloadMoves`: core lane, burst, side lanes, cross, burst, core lane, cross, side lanes, with a shorter recovery (`overloadRecovery`) and two more launch waves. |
| Destroyed | Launched Needles go down with it; the reactor flares and dies, and the wreck stays in its mountain. |

**Arena.** The scroll eases to a stop from `arena.decelStart` (`arenaStopDistance`) over the low ground before the
fortress; the low ground and the mountains round it are Vesper's terrain (§4). (Kills over the arena count as over open
water for Seeker Sweep's `air-water` goal only over its leads.)

**Closer (row 9, 17 November).** The user: "the stronghold should move down a bit too, the silent empire boss seems closer
to the hero id like to keep it somewhat close, maybe not like that but currently its anchored to the top of screen". The
whole boss moved 2.5 closer (`row` and `entryS` 11.5 → 9: the cannons at s 11.97, the reactor at 10.6; THE CITADEL's
flanks stand at about 9.75), with its model re-seated by the lens (`STRONGHOLD_AT` 25.517 → 22.659; 23.652 since Vesper's level lies 1.25 lower) and its arena's ground
with it; HP, attacks and timings are unchanged. At 390×844 the fortress's back now sits just under the boss bar (row 9.0
is as low as the requested 9.0–9.5 goes; more room needs a lower row). Measured on the fairness branches before and after
(seed 21; Cold Vector 330 s, endless 340 s from sectors 26 and 5; the hidden-fire volleys of the same day not yet in either):

| Run | Perfect: clear time, hits | Dodger: hits during the boss | Idle: hits during the boss | Aimed shots to the player's row (median, perfect) |
| --- | --- | --- | --- | --- |
| Cold Vector, Relaxed | 95.5 → 96.2 s, 0 → 0 | 2 → 2 | 19 → 20 | 2.07 → 1.72 s |
| Cold Vector, Standard | 126.4 → 122.9 s, 0 → 0 | 19 → 5 | 22 → 23 | 1.77 → 1.47 s |
| Cold Vector, Veteran | not cleared in 330 s (overload at 296.2 → 287.3 s), 0 → 0 | 0 → 0 | 21 → 22 | 1.67 → 1.38 s |
| Endless sectors 26–28 | (fight runs past 340 s), 0 → 0 | 9 → 13 | 15 → 15 | 1.33 → 1.13 s |
| Endless sectors 5–7 | (fight runs past 340 s), 0 → 0 | 5 → 8 | 15 → 16 | 1.38 → 1.18 s |

No fairness violations on any branch before or after. The bridge's aimed bursts (speed 7) reach the player's row about
0.3 s sooner (1.87 → 1.51 s from the reactor's door) and the launched Needles' shots sooner too; the lane lasers' warnings
are timed, not travelled, and are unchanged.

**Model.** The user's fortress GLB (`art/source/bosses/stronghold-original.glb`), adapted in Blender by
`tools/blender/boss_stronghold.py`: the supplied mesh, UVs and painted atlases kept and reduced (79,242 triangles with
the wrecks, under the adapted bosses' 80k), its plinth smoothed before reduction; the backdrop sketches, the flag, the
round rock and the small mountain at its left left out, and its sides and back cut where the terrain's mountain buries
them. The barrels, which point 31° outward in the source, are turned straight toward the player about their breeches,
so the lanes leave from the muzzles. Its scale (12.79 units per source unit) and placement come from the release lens
(`src/shared/lens.ts`): with the camera centred, each gun's breech and the reactor's aim point lie on the lines of sight
through their combat targets (13.13 since Vesper's level lies 1.25 lower: the lower fortress stands further from the lens). Its atlas is regraded toward Vesper's snow and a neutral gunmetal, the orange glows kept (user, 18 November: "the color for the fortress is a bit too blue, not matching the ice and snow of the terrain"). It is then grown 1.15 (user, 17 November: "the stronghold needs to be slightly bigger";
`GROW`, about 12.9 wide) about a point on the reactor's line of sight at the breeches' height, so the aim point moves
along its line, and each cannon assembly (housing and gun, grown with it) is re-seated where its breech was, 0.5 inward:
the cannons now stand at about half the fortress's width from its axis (0.59 before), a little close for its size. Nodes: `stronghold_hull`; `stronghold_cannon_left`/`_right` (the armoured housings, the
targets) each with its gun `stronghold_gun_left`/`_right` (barrel and breech; its origin is the recoil pivot) and the
marker `stronghold_muzzle_left`/`_right`; wrecks of both (`_wreck`, the barrel snapped two thirds along);
`stronghold_door_a`/`_b` (the main blast door's leaves); `stronghold_chamber` and `stronghold_core` (the reactor chamber
and reactor behind the door, built in Blender: the source has nothing behind its door) with `stronghold_core_wreck`;
`stronghold_radar` (the dish); markers `stronghold_bay_left`/`_right` (the hatches), `stronghold_vent_0`-`3`,
`stronghold_core_aim`, and `stronghold_approved_v1` (an identifier, with the door slide in its extras). One material on
the supplied atlases at 2K (base, roughness and metal; normal at 1K) plus an emission mask of the painted orange glows;
the chamber and reactor are vertex coloured.

**Presentation** (`src/render/stronghold-view.ts`, render-only). The renderer seats it at `STRONGHOLD_AT` past its
arena's start (`src/world/terrain-vesper.ts`), its foot on its ledge, before, during and after its fight (intact, then a
wreck), as THE CITADEL. Since 18 November the model as built (its foot at the sea, `STRONGHOLD_BUILT_AT` 23.652) is
lifted onto the ledge by scaling it about the release lens's eye at the stop with the camera centred (`STRONGHOLD_LIFT`: 2,
then 4.5 after "i thought we can also increase the fortresses height", its foot at −0.35 and the ascent below it 2.5
taller; its rear and upper structure behind its targets now stand over the flight plane, to 5.5, its cannons' tops at
3.19, its door and front terrace lower; tests/world/stronghold-projection.test.ts checks nothing stands over the flight
plane before its targets;
`STRONGHOLD_SCALE` 0.958; its built frame keeps its sea at −4.85, `STRONGHOLD_BUILT_SEA`): every point keeps its line of
sight, so with the camera centred it fills
the same pixels (no change of its size on screen) and its weak points stay on their targets; its top (the bridge) stands
at 3.34, under the flight plane, and the terrace guns' heights follow (−6.96 → −5.03). The seat table and the plan stay
in the built frame; the terrain converts. Its scenery exclusion ends at its plinth, so its works show before it. Then
moved down the screen (user, 18 November: "really move the stronghold further down the screen, its so high up"): its row
9 → 8.1 and the lifted model slid 1.02 toward the camera (`STRONGHOLD_SLIDE`, `STRONGHOLD_AT` 21.15), the reactor's aim
exactly on its moved target, the cannons 0.03 short of theirs. 8.1 is the lowest its Needle launch waves allow: they fire
4.5 before the row and must stay 3.5 before the player's (tests/sim/fairness.test.ts; at 6.5 they fired 2 before it). Its
attacks' times to the player's row, Cold Vector perfect pilot, median row 9 → 8.1: Relaxed 1.68 → 1.55 s, Standard
1.43 → 1.32, Veteran 1.37 → 1.25; endless sectors 26–28 min 1.02 → 0.98, median 1.15 → 1.15; no fairness violations, no
boss hits on the perfect pilot, the dodger's unchanged but Standard 2 → 3. Target rings and brackets are drawn on the flight plane at the targets. A cannon charging its
lane glows (its housing's lining and its muzzle), fires with a muzzle flash and smoke, recoils into its housing and
vents steam from the roof; lanes from live cannons start at their muzzles (`beamTop`). Bursts leave the reactor's door
with a flash. The door's leaves part over 0.9 s as the reactor opens; the reactor pulses in its overload. Needles leave
the hatches with a flash and a trail of sparks. A broken cannon throws sparks, fire and dark fragments, swaps to its
wreck, sags its snapped barrel and smokes; in the overload its column's lanes flare at the broken housing. At the kill
the reactor destabilises and flares, the vents burst into steam, fires break out across the bunker, the radar mast
topples, explosions go off inside with the simulation's blast, then the reactor's light dies and smoke pours from the
door; the wreck stays embedded. Effects reuse the bosses' bounded particle layers (half their emission on Low).

## 6. Tests

- `tests/world/terrain-vesper.test.ts`: planet profiles keep Khepri byte-identical; missions map to planets; shelves at
  several levels over the sea; half land and half water; seams and streaming; pack ice under the cap; outposts on shelf
  ice with jetties, tracks and trestles; every outpost archetype; the stronghold's arena (low ground just above the sea,
  mostly land with leads but none round the fortress, varied relief, the corridor low past the shoulder, the play area well
  under the flight plane and mountains beyond the edges, the ground under the barrels low, under the model and meeting its
  edges, no ice walls on the mountain or round the fortress, crags round it, nothing in its plan), deterministic and
  streamed, and at endless's Vesper boss stop; behind it no plain and no cut across the view to where Vesper's terrain
  returns, the ledge out to the arena's own reach (varying with the seed), the works decorative and under the caps.
- `tests/world/stronghold-projection.test.ts`: the reactor's aim and the guns on their targets through the centred lens
  (`STRONGHOLD_AT`, lifted; its top under the flight plane); the seat table matches the model; no ground on the lines of sight to the guns, muzzles and the
  reactor's aim with the camera centred or at either extreme; rings on the targets, the scenery exclusion, lanes from the
  muzzles.
- `tests/world/cinematic-assets.test.ts`: the stronghold's nodes, its weak points on their rays (the reactor with the doors
  open), its width and triangle budget.
- `tests/sim/ark.test.ts`: the arena stop and resume; the stronghold's arrival, sockets, difficulty scaling, cannon lasers
  down their own columns with bursts between, finite Needle launches, overload lanes over its own columns, the wreck and
  extraction, that it never moves; beam alignment (every Needle beam under its Needle, every boss lane under its column).
- `tests/sim/vesper-aces.test.ts`: Vesper's warning-line cap.
- `tests/sim/encounter-deck.test.ts`: Vesper alternates laser flocks with laser-free squadrons on every seed.
- `tests/render/vesper-contrast.test.ts`: the craft's own ramp and edge shade, with buildings, other worlds and the
  hero unchanged.
- `tests/sim/fairness-campaign.test.ts` and the endless fairness suites: Cold Vector at every difficulty and Vesper's
  endless stints, on every pilot branch.
- `tests/browser/vesper.spec.ts`: the campaign offers Cold Vector and launches it without browser errors; the stronghold
  stands in its cliff before its fight, goes through its phases without moving and the mission completes.
