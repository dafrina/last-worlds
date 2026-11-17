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
  as Khepri's canyons; user, 21 October). Shelves stand one to several tiers over the water and step up inland in ice
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
- **Boss arena** (HELION STRONGHOLD's cliff, 17 November; `strongholdCliff` in `src/world/terrain-vesper.ts`; open water
  only before). Only rows of a Vesper boss arena change, in campaign and endless alike:
  - the sea before the fortress stays open water, nothing standing or afloat in it, the shelf edge receding to frame it;
  - a cliff runs across the whole width at the fortress's foot, jagged and curving forward toward the world's edges into a
    bay, with Vesper's ice walls on its face and a high snowy plateau behind, dark rocks along its rim;
  - the fortress stands in a recess of the cliff: the seabed under its plan (the model's plinth is the cliff there, its foot
    under the opaque sea), ledges with boulders at its terrace's level either side, ice walls up the flanks and behind its
    roof, so every cut edge of the model is buried;
  - the plateau ends some 25 behind it, where the departure has flown on, and Vesper's own terrain carries on.
  The cliff and plateau stay under the scenery cap and the flight plane, so they never block a lane or a shot.

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
7. relief, then the scroll eases to a stop over the sea before HELION STRONGHOLD's cliff.

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

A fortress built into the cliff at the head of the arena (user's specification, 17 November 2026,
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
2 s, a volley every 2.6 s while it stays hidden (docs/10 §5). The Ark swayed 1.3 and surged 0.7, glided in from 26 and was pulled toward the view.
With it fixed at x 0 its lanes always fall on the same columns (x 0 and ±2.98); the fairness suites pass (Cold Vector on
every difficulty, endless sectors 5–7), and the perfect pilot clears it on every weapon and difficulty without a hit (on
Veteran seed 57 it no longer reached the far cannon with the Fan Cannon once the sway stopped bringing it into the fan; the
test flies seed 58).

**Targets.** Two cannons at ±`radiatorOffset`, `radiatorS` behind the pivot, radius `radiatorRadius`, and the reactor at
`bridgeS`, radius `bridgeRadius`; the fortress and its cliff are scenery, not a hidden collision box. Base hit points
`radiatorHp` and `bridgeHp`, scaled as every boss's.

| Phase | Attacks |
| --- | --- |
| Arrival (`arrivalDuration`) | Its awakening: it already stands in its cliff as the scroll stops; steam bursts from its vents, its cannons and its reactor light in turn. |
| Cannons | Narrow lane lasers (`HELION_ARK.laser`) straight down the firing cannon's column, alternating cannons; every third attack an aimed burst from the reactor's door instead (`bridgeBurst`), so the middle between the lanes is not safe for long. |
| Reactor | The blast door opens. Aimed three-bolt bursts, and finite launches (`launches`): waves of two Needles (`ark-launch`) from the hatches either side of the door, one wave at a time, only while they are in view. |
| Overload | `overloadMoves`: core lane, burst, side lanes, cross, burst, core lane, cross, side lanes, with a shorter recovery (`overloadRecovery`) and two more launch waves. |
| Destroyed | Launched Needles go down with it; the reactor flares and dies, and the wreck stays in its cliff. |

**Arena.** The scroll eases to a stop from `arena.decelStart` (`arenaStopDistance`) with the sea before the fortress
open, as the Ark's whole arena was; the cliff round the fortress is Vesper's terrain (§4).

**Model.** The user's fortress GLB (`art/source/bosses/stronghold-original.glb`), adapted in Blender by
`tools/blender/boss_stronghold.py`: the supplied mesh, UVs and painted atlases kept and reduced (79,241 triangles with
the wrecks, under the adapted bosses' 80k), its plinth smoothed before reduction; the backdrop sketches, the flag, the
round rock and the small mountain at its left left out, and its sides and back cut where the terrain's cliff buries
them. The barrels, which point 31° outward in the source, are turned straight toward the player about their breeches,
so the lanes leave from the muzzles. Its scale (12.79 units per source unit) and placement come from the release lens
(`src/shared/lens.ts`): with the camera centred, each gun's breech and the reactor's aim point lie on the lines of sight
through their combat targets. Nodes: `stronghold_hull`; `stronghold_cannon_left`/`_right` (the armoured housings, the
targets) each with its gun `stronghold_gun_left`/`_right` (barrel and breech; its origin is the recoil pivot) and the
marker `stronghold_muzzle_left`/`_right`; wrecks of both (`_wreck`, the barrel snapped two thirds along);
`stronghold_door_a`/`_b` (the main blast door's leaves); `stronghold_chamber` and `stronghold_core` (the reactor chamber
and reactor behind the door, built in Blender: the source has nothing behind its door) with `stronghold_core_wreck`;
`stronghold_radar` (the dish); markers `stronghold_bay_left`/`_right` (the hatches), `stronghold_vent_0`-`3`,
`stronghold_core_aim`, and `stronghold_approved_v1` (an identifier, with the door slide in its extras). One material on
the supplied atlases at 2K (base, roughness and metal; normal at 1K) plus an emission mask of the painted orange glows;
the chamber and reactor are vertex coloured.

**Presentation** (`src/render/stronghold-view.ts`, render-only). The renderer seats it at `STRONGHOLD_AT` past its
arena's start (`src/world/terrain-vesper.ts`), its foot at the sea, before, during and after its fight (intact, then a
wreck), as THE CITADEL. Target rings and brackets are drawn on the flight plane at the targets. A cannon charging its
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
  ice with jetties, tracks and trestles; every outpost archetype; the stronghold's arena (open water before the cliff,
  the recess and its ledges, the plateau, nothing in the fortress's plan, its walls and rocks), deterministic and streamed,
  and at endless's Vesper boss stop.
- `tests/world/stronghold-projection.test.ts`: the reactor's aim and the guns on their targets through the centred lens
  (`STRONGHOLD_AT`), rings on the targets, the scenery exclusion, lanes from the muzzles.
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
