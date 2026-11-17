# Nahara, the Silent Empire

Nahara is the sandstone world of a vanished civilisation: the campaign's seventh mission, Silent Empire, and the sixth
world of the endless cycle. This doc covers its look, its world generator (the canyon, the ruins, the moving sand and the
rippled sand), its two new enemies and two boss attacks, its Blender kits and fleet, its strike sites and THE CITADEL. The
user handed the world over on 12 November with two concept sheets, the world and the enemy fleet ("NAHARA ENEMY FLEET":
Skimmer, Relic Shield, Obelisk, Quarry Battery, Dune Hunter, Sunspike). The sheets were supplied but not committed (code
comments still cite a path that does not exist, "art/concepts/nahara/01-world"); they are references only. The planet is
**Nahara**, the mission **Silent Empire** (`silent-empire`; it was *The Silent Empire* until 14 November, user: "remove
the THE"), the boss **THE CITADEL**.

## 1. Identity

- **A canyon world that feels huge** (user, 12 November: "It should feel huge"): a deep chasm whose floor is lost in a
  teal haze, between sandstone tablelands, broken arches over it and monoliths rising out of it.
- **Two countries** (user, 13 November: "maybe a 50/50 mix" of the square ruin country and "natural smoother hills and
  canyons like more organic as we did in corona"): ruin districts of square terraces near the canyon, and natural
  sandstone hills and buttes everywhere else (§4).
- **Turquoise energy** still runs through the stone: conduits on the built terraces, lit slits in the ruins, teal
  streams on the canyon floor.
- **Light:** a warm sun behind the ship to the left (`sunBehind` in `NAHARA`; user, 13 November: "i like 7:30 here"), so
  the arches' fronts and the camera-facing cliffs are lit; a cool sky fill, warm bounce off the canyon walls, and a teal
  haze rising up the canyon walls with the terrace tops clear (the user's playground look, 13 November). The values are
  `LOOKS.nahara` in `src/render/scene.ts`.
- **Palette:** `NAHARA_PALETTE` in `src/world/terrain-nahara.ts` (light sand, warm sandstone, mid brown, the canyon
  shadow).
- **Faction paint:** sandstone and bronze with the ruins' turquoise glow (`WORLD_PAINT.nahara` in
  `src/render/world-paint.ts`).
- **Readability:** hostile fire is blood red (`HOSTILE_BLOOD` in `src/render/shot-colors.ts`), as on Corona; ace shields
  glow teal (`PLANET_GLOW.nahara`). Terrain is scenery only and stays under the flight plane.

## 2. Silent Empire

Silent Empire is campaign mission 7, between Dying Star and Final Horizon (`CAMPAIGN_ORDER`). Inserting it before Final
Horizon (12 November) never locks a mission a pilot had already reached: the save's `opened` list keeps Final Horizon open
for a pilot who had cleared Dying Star (save version 5, `src/campaign/profile.ts`; [docs/30](30-campaign-progression.md)).

Its arc is `SILENT_EMPIRE` and `SILENT_EMPIRE_SORTIE` in `src/content/encounter-deck.ts`, on the late worlds' timing grid:

1. the canyon entrance: a Skimmer pair ("SILENT EMPIRE · SKIMMERS · THEIR SHOTS SPLIT"), a dart arrowhead, ancient
   defences on the terraces, then the first Relic Shield ("STRIKE WHEN ITS CORE OPENS");
2. the abandoned city: energy cells, darts, Needles, a second Relic Shield, weavers and missile batteries;
3. a strike-site place in the recovery, then the ruin network (the sortie stretch): Skimmers, Needles, a Relic Shield and a
   Needle column;
4. the second pressure block: the artillery ship (a Pulsar) and a Wraith;
5. the inner sanctuary ("ITS GUARDIANS WAKE"): a Relic Shield pair, a Skimmer arrowhead, a Relic Shield with a Skimmer
   escort, a second artillery ship and a second Wraith;
6. the last guard, relief, then THE CITADEL awakens.

Pressure comes from `WORLD_INTENSITY.nahara` (Corona's values for now), `MISSION_CADENCE['silent-empire']` and
`MISSION_PRESSURE['silent-empire']` (the campaign's late-mission pressure, 13 November;
[docs/40](40-balance-measurement.md)). The shield cells are `CITADEL.shieldSupplies` (THE ECLIPSE's). Its world missions
include Nahara's own (Echo Hunter, Split Runner, Open Season, Shieldbreaker; [docs/35 §3](35-missions.md#3-the-missions));
they only observe events.

## 3. Enemies and attacks

Nahara flies darts, weavers, Needles, turret and missile batteries, fuel targets, Pulsars, the Wraith, and its own two
kinds, the Skimmer and the Relic Shield (`authoredKinds('nahara')`); no Diamond flies here. Their stats are `ENEMIES` in
`src/content/balance.ts`; their shapes are in `src/sim/attacks.ts`.

- **Skimmer** (`skimmer`): a fast light raider; pairs glide in from a flank, trios as an arrowhead. Its attack is the
  **Echo Split** (`ECHO_SPLIT`): one large aimed shot flies toward the ship and stops at its split point, never nearer
  than its floor row; its two halves wait there, show, then fan out faster either side of the aim. The halves are the
  shot, so a split already fired outlives its Skimmer, and flying between them is a mission event (`thread`). Formations
  `skimmer-pair` and `skimmer-trio`. Since 13 November it also flies on Corona and Umbra (user: "the split shot is
  amazing. I want more of these enemies").
- **Relic Shield** (`relic`): a heavy ancient machine. Closed, its armour lets only `RELIC_ARMOR.closedShare` of any damage
  through (every weapon alike, the windup included); it opens for `RELIC_ARMOR.open` seconds after each attack and closes
  before the next; below `RELIC_ARMOR.breakBelow` of its hull the armour breaks for good. It fires a three-round fan. The
  renderer rings it with six armour plates, bronze while closed, parting and glowing teal while open. Formations
  `relic-solo`, `relic-pair`, `relic-escort` (with a Skimmer escort). It also flies on Umbra.
- **Aces** are Wraiths (`HUNTERS.kinds.nahara`), flying the Sunspike
  ([docs/28 §3](28-umbra-eternal-eclipse.md#3-the-wraith)).

Nahara brought two boss attacks, reusable by any boss (`BossDefinition.fracture`, `.boomerang` in
`src/content/bosses.ts`). THE CITADEL uses both, and so does THE ECLIPSE's fight, which THE HELIOPHAGE shares:

- **Fracture Wave** (`fractureWave`): walls across the whole map, each with one gap, released one after another; the gaps
  zigzag from the aim to one side, back to the aim and to the other side (`fractureColumns`), each over a strip the
  fairness rules keep open. No edge or centre hides from every wall.
- **Boomerang Barrage** (`boomerangBarrage`): volleys of shots that swing out to one side, turn, and cross the player's row
  at the aim plus an offset, on an exact constant-acceleration curve (`ShotSpec.ax`) that the fairness forecast
  (`shotFootprint`) predicts and the simulation flies.

Where a fresh attack meets committed hazards, the director's check also runs exactly where each hazard's window opens
(`assessSafety`): a Skimmer's waiting halves once met a missile shot between two time slices and sealed the view
(12 November). The offline trace and the pilots follow the split and curved shots.

## 4. World generation

The profile is `NAHARA` in `src/world/terrain-nahara.ts`, built on Umbra's (`...UMBRA`) with its own landform, colour and
dressing, `cliffs: true` and the sun behind. Pure functions of the seed and world position.

### The canyon and the two countries

- **The canyon** (`naharaCourse`; user: it should not run "straight down the middle"): its centre swings far across the
  map; it opens into basins where the monoliths stand, narrows where the great arches span it, forks round mesa islands,
  and side ravines leave it. Its floor (`NAHARA_FLOOR`) lies deep in the teal haze, but only down a narrow cleft in each
  channel's middle; elsewhere its bottom is a broad ledge near Umbra's crevasse floor. Ground batteries seat where the
  line of sight meets the ground, and seats on the deep floor strayed two squadrons into each other on screen (13
  November).
- **The ruin districts** (`naharaBuilt`): great regions with winding borders, about 30% of the ground and only within a
  few units of the canyon's rims (user, 13 November: the square ruins "only ... near lots of cliff models, arches"). Square
  terraces on a snapped grid with notched rims stepping down in ledges, ruined cities and the stepped footprints of fallen
  buildings, cliffs in running-bond masonry, and lit turquoise conduits on the terraces' block grid.
- **Natural sandstone** everywhere else (Corona's technique): domain-warped canyon edges, benched hills and buttes, and
  canyon walls stepping down in three stratified cliffs that wander and are never sheer. On it, wall and top blend by the
  smooth per-vertex steepness and the rims round over (no rim crease).
- **Stone textures** (`src/render/terrain-kit.ts`): one cliff map with running-bond masonry in one channel and wavy natural
  strata in the other, chosen per vertex by the landform's strata share (`createMasonryTexture`); a weathered sandstone
  grain on the ruin kit, projected triplanar so curved arch stones carry it too (`createSandstoneGrain`).

### Ruins and scenery

- **Canyon arches:** a candidate every 20 units, wall to wall, each pier half sunk into its wall; half arches reach out
  from the rims.
- **Great ruins on the hills:** arches, monoliths, towers, great towers and gates, denser since the user's "i want more
  ruins" (13 November).
- **Ruined aqueducts** ("ruined", "doesnt need to be connected", "dont make the aqueducts have a glow"): now and then a
  dry run across the map at one level, columns under every pier, missing and broken bays, a ruined end where a run breaks
  off.
- **The buried empire** (`buriedEmpire`; user, 14 November: "nahara still feels very empty. The dunes and hills are just
  so plain"): the kit's own pieces sunk in the sand, their tops showing at most `BURIED.top` over the lowest ground under
  them: arch crowns, wall lines of a few courses, tower battlements, gates buried to the lintel, pillar stumps, a little
  rubble round each. Mostly on the natural sandstone, rarely in the ruin districts, never on the canyon floor, steep
  walls or THE CITADEL's rock.
- **The canyon floor's fallen city** (`canyonFloor`; user, 15 November: "lets enhance nahara by placing more things on
  naharas canyon grounds", "khepri has nice canyons as inspiration"): Khepri's gradient in Nahara's ruin. Talus of tumbled
  blocks down the main canyon's lower walls; rubble fields, tumbled blocks, fallen columns and stumps at the walls' feet;
  rubble in patches, fallen columns, foundations of fallen buildings, stumps and now and then a relic of the empire's
  machines across the ledges; a little rubble on the rims. One candidate per `FLOOR.patch` square; pieces at about twice
  their modelled size (at real size, far under the camera, they read as pebbles); only from `FLOOR.lowest` up, never on a
  stream, never overhanging a drop, off the great ruins' feet, never in THE CITADEL's canyon (which keeps its own authored
  ruins). Their turquoise inlays glow dimmer than the kit's, and the carved glyph slab is rare: many lit lines on the
  floor read busy and could be taken for shots. The rubble and tumbled blocks are cosmetic (Low skips them).
- **Scenery caps:** Umbra's (`UMBRA_SCENERY_MAX`; `UMBRA_SPIRE_MAX` for towers, pillars, gates, rings and arches).

### Moving sand and teal streams

- **Sand streams** (`src/render/sand-streams.ts`, render only, one draw): pale ribbons of blown sand gliding across the
  open ground with the wind (`SAND_WIND` in `src/world/sand-shelter.ts`), draped over the terrain, their grain flowing
  along them; Low keeps half. A ribbon thins out over a drop, so none hangs over the canyon, where a pale line could read
  as a shot. Dust devils were tried and removed (user, 14 November: "they look a bit shit, just remove them").
- **Teal streams** (`tealStream`; user, 15 November: "Maybe some small bits of streams of teal liquids on the canyon
  grounds", then "not too wide, but they should be longer"): a thin channel winding along the canyon's deepest floor in
  long lengths that sink into the sand and come up again further on, drawn through the ground shader's pool glow
  (Nahara: `poolCells` 0, `poolGlow` high, a teal bed). Render only.

### The rippled sand

The sand is a procedural ground shader (`SAND_GLSL`, `SAND_RIPPLES` and `SAND_SPARKLE` in `src/render/terrain-kit.ts`;
user, 15 November: "a nice detailed sand texture shader for the dunes etc would look great, like ripples of sanddunes").
It works in the section's own units, so it never swims with the scroll, and every wave vector divides the section length,
so the joins carry on.

- **Wind ripples** about a third of a unit apart, their crests across the wind, asymmetric (a long windward slope, a short
  lee). Their phase wanders on two octaves of noise, so crests bend, fork and merge, and the ground's height shifts it, so
  on a slope the crests turn toward the contours. A long, low dune swell leans the light and rouses the ripples on its
  windward side.
- **Lit, not painted:** the ripples tilt the normal, its slope taken from the phase's screen derivatives, so the light
  follows the crests as they bend; crests a shade lighter and troughs darker.
- **High** adds a finer set of ripples across the first and a subtle sparkle of grains mirroring the sun (each glint at
  least about a pixel). **Low** keeps one octave, no sparkle. Each octave fades out before it would alias.
- **Ripples on open sand only** (user, 17 November: the ripples "run below rocks and buildings/ruins", they should stay
  on "open stretches of land and canyon floors"):
  - *The bed* (`TerrainSection.sandClearance`, per vertex): the landform's `sand` covers the natural sandstone and, in the
    ruin districts, only the canyon's ledges and floor; never the built terraces, cities and fallen buildings'
    footprints, nor THE CITADEL's rock. It fades away from cliffs and on slopes. Strike-site pads clear it.
  - *The scenery's shelter* (`src/world/sand-shelter.ts`, the `sandShelter` attribute): every placed piece calms the
    ripples and dune swells round where it meets the ground (its measured plan per variant, `NAHARA_PLANS`; a standing
    arch only at its piers, `ARCH_PIERS`; nothing under an aqueduct's bays), fully calm just past its edge, fading over a
    short halo, with a tail downwind on its lee side. The sand's colour, dust and sparkle stay.
  - *Seams:* rows within `SAND_SHELTER_REACH` of a join take the neighbour's pieces too, and whichever side is built
    second re-shelters the first one's band, so both sides of a join match.
  - *Cost:* computed once per section while its view is built off-frame, no per-frame work or draw call, one float
    attribute per ground vertex, the same mask on Low.
  - So the ripples show on the open natural sandstone and in the gaps of the densely dressed canyon floor.

### Cost (measured 17 November)

Headless Chromium on SwiftShader (no GPU time; no phone yet). The Nahara flight bench (`tools/perf/bench.mjs nahara`, 300
frames at 4× CPU throttle) averages about 61 draw calls and 116k triangles on High and 48 and 106k on Low, with no
synchronous section fallbacks: inside the profiling guardrail of [docs/36](36-mobile-performance.md). The sand shelter
adds about 3% to a section's generation, in steps under a millisecond. The sand shader's GPU cost on a phone is
unmeasured. Frozen review views of the ground on both tiers: `tools/lookdev/terrain-views.mjs` (Nahara by default).

### The arena

THE CITADEL's arena is its own, not the common clearing (user: "model the boss arena specifically for it ... so it looks
like the citadel is sitting in an ancient ruin city"; "it should tower above other ruins").

- **Ground:** flat only under its rock (`naharaPlatform`), where the model stands (`CITADEL_AT`, measured through the
  perspective camera); the canyon falls away right at the rock's edge (user: "limit the flat part to just the base of the
  model ... like its towering in a canyons").
- **Canyon:** the world's own canyon swings to the temple, opens into a gorge before it and forks round it
  (`citadelCourse`), so the rock is the point of the island between the channels (user: "closer to the normal canyons").
- **Heights:** the ground near it keeps to the lower terraces, and every ruin near it stays under its dome
  (`citadelCap`).
- **Ruins** (`citadelRuins`, fixed positions about the rock): monoliths out of the canyon all round; arch bridges from the
  rock to the rims in front and behind; great arches across the gorge, one broken, and half arches from its rims; two
  rings of towers, gates, monoliths and mechanisms on the rims; a ruined aqueduct behind; tumbled blocks.

## 5. Blender assets

| File | Builder | Contents |
| --- | --- | --- |
| `public/assets/nahara/nahara-kit.glb` | `kit_nahara.py` | The ruin kit (`NaharaKitKind` and `nahWall` in `src/world/scenery-kit.ts`): masonry wall facings, towers, gates, the chasm's monoliths, arches of wedge stones with a teal channel and broken half arches, a ring mechanism, rubble, aqueduct bays and their pier columns, and the canyon floor's column drums, stumps, foundations, rubble fields and relics. Rounded, weathered blocks (`rblock`); joints and courses are the masonry map's, not geometry. |
| `public/assets/nahara/nahara-craft.glb` | `craft_nahara.py` | The fleet (below). |
| `public/assets/nahara/the-citadel.glb` | `boss_citadel.py` | THE CITADEL (§7). |

**The fleet** (`NAHARA_CRAFT` in `src/render/scene.ts`) is built on the Umbral fleet's toolkit (lofted hulls with knife
edges, glow in grooves), in Nahara's own look (user: "more detailing and more mechanical like the pillars"): rounded
sandstone-bronze blocks with pale worn edges over dark frames, hinges, pistons, vents, lit slits and carved step-fret
glyphs. Each model has a triangle budget in its builder. Corona's fleet stands in while Nahara's loads.

| Node | Kinds | Shape |
| --- | --- | --- |
| `nahara_hunter` (Dune Hunter) | dart, Needle, weaver | an arrow body, swept wings, twin cannons and engines, sized per kind |
| `nahara_obelisk` (Obelisk) | Pulsar (and Lancer) | a four-sided spire laid toward the player, stacked courses, fins on pistons |
| `nahara_skimmer` (Skimmer) | Skimmer | a keel between two segmented forward prongs |
| `nahara_relic` (Relic Shield) | Relic Shield | a domed core in a turquoise band, six hinged shield plates on pistons |
| `nahara_sunspike` (Sunspike) | Wraith (and Diamond) | the elite heavy: a great central spike between two prongs, engine pods, swept fins |
| `nahara_battery` (Quarry Battery) | turret and missile batteries | an octagonal stone plinth, a launcher housing with three lit mouths |
| `nahara_drone` | THE CITADEL's drones | a small stone dart with a turquoise eye |

## 6. Strike sites

Nahara's site pool ([docs/33 §3](33-strike-sites-and-encounter-deck.md)) holds the ancient worlds' sites in its own
sandstone-and-turquoise finish, texture-baked by `tools/blender/sites_strike.py` with `lib_solids.STYLES['nahara']`: the
crash site, the prism reactor, the sealed vault (a Relic Shield stands in for its Diamond guard) and the gate ring. Its own
site is the **Step Temple** (`step-temple`; user, 13 November: "a blocky pyramid, aztec style somewhat but alien too"), a
parts site and the most likely draw: five stepped tiers, a stairway up the front, turquoise seams under each tier's lip,
carved recesses, horned blades at the summit's corners, a shrine with a lit doorway, and over the summit's altar the
target, a turquoise crystal eye in a ring of floating shards.

## 7. THE CITADEL

A stationary temple on a rock in the canyon (user, 12 November: "fantasy temple citadel boss ... its a stationary one").
Its numbers are `CITADEL` in `src/content/citadel.ts`, its definition `BOSSES.citadel` in `src/content/bosses.ts`
(`stationary: true`), its view `CITADEL_STYLE` in `src/render/carrier-view.ts` (`still`).

**Targets.** The two lanterns (the first pair; `ventOffset`, `ventS`), the emblem at the centre of the drum's rings (the
third first-phase target, the prow; `prowS`) and the crown of turquoise crystal panels round the drum (the core;
`reactorS`). Positions are each target's visible centre projected onto the target plane, from the builder's report
(`lookdev/nahara/citadel/citadel-v2-report.json`, an output file). Its hit points are its own, a step below THE ECLIPSE's
(`BOSSES.citadel.parts`), split over the shared phases.

**Fight.** THE ECLIPSE's structure with Nahara's own moves, in three phases on the reactor's one pool: the Awakening (the
three targets' aimed bursts), the Reactor Exposed (`coreMoves`: Fracture Wave, burst, Boomerang Barrage, fan) and the Fall
of the Empire (`overloadMoves`: walls, spirals and boomerangs between its lanes), with its own `fracture` and `boomerang`
settings. Drone waves fly from gates either side of its stairs (`bays`). Its campaign health includes
`MISSION_PRESSURE['silent-empire'].bossHp`.

**It never moves.** It stands in its arena before the fight and after it (as a wreck), never rises, sways or sinks, and
only explodes when it falls. Its terrain exclusion is only its plaza (`CITADEL_STYLE.footprint`).

**Awakening** (user, 14 November: "when we arrive at the boss it takes a tad too long until the boss fight starts even tho
hes already on screen"): its arrival (`CITADEL.arrivalDuration`) is shorter than THE ECLIPSE's, which covered a rise, and
ends as the scroll stops. Until then it stands dormant; through the arrival it shakes the sand off (a puff of dust and a
short camera rumble), then its lanterns, emblem and crown light in turn, each with a flicker and a flare of sparks
(`AWAKEN` in `src/render/carrier-view.ts`). Its effects are turquoise sparks and sandstone dust (`CITADEL_STYLE.fx`).

**Model.** Built of the ruin kit's own construction by `tools/blender/boss_citadel.py`, with the user's Tripo model
(`art/source/bosses/citadel-tripo-original.glb`) as the guide for its shapes. The adapted Tripo mesh was rejected ("its
color is off ... I would expect you to reuse some of the existing brick and arc models on the boss so it seems coherent";
then "keep it kit built, but obviously you can still take shapes etc from the tripo model").

- **Rock:** a mesa in strata, its rim broken, its cliff carved with stacked-block pillars, arches over lit recesses and
  caves where arches fell, down to the canyon floor ("so it reads like part of the terrain, not like just planted on
  top").
- **Temple:** a curved upper terrace; a drum fronted by nested rings of wedge stones round the emblem; a stepped ribbed
  dome with a lit oculus; tall leaning blade fins, some snapped off; long stepped buttresses to the corners.
- **Ruin:** cave-ins in the plaza, columns whole, broken and fallen, gaps in parapets and copings; stairs down the cliff
  on pillars; a bridge out over the canyon broken off in mid-air on one side and one broken into piers on the other.
- Texture-baked in Nahara's sandstone (`--bake`); nodes `citadel_hull`, `citadel_pod_left` and `citadel_pod_right` (the
  lanterns), `citadel_prow` (the emblem), `citadel_heart` (the crown) and a wreck of each target. Its top stays under
  the flight plane. At 8.2 MB it is the heaviest boss file (about 66k triangles, counted from the file 17 November).

## 8. Music

*Silent Empire*, D at 90 BPM (`THEMES.nahara` in `src/audio/score.ts`; user, 13 November: "a bit too happy or melancholic. I
want more mystery"): nothing resolves. D minor with its ninth against the third, a B♭ augmented triad, a chromatic step to
F♯ minor, and A suspended. An ancient horn (its line written out per chord), a wordless choir, a stone processional drum,
a sistrum and crystal "conduit" arpeggios (`NaharaInstrument` in `src/audio/instruments.ts`); the boss stem adds the stone
drum and the sistrum. Details: [docs/24](24-sound-design.md).

## 9. Endless

Nahara flies between Corona and Umbra in each endless lap ([docs/18](18-endless-planet-cycle.md)). Its stages are staged
from Silent Empire's arc (`lateStages`, stage ids `eh`): the opening with its strike site, the pressure stage without one,
and later visits the climax arc with a site between its halves.

## 10. Tests

- `tests/sim/nahara-enemies.test.ts`: the Echo Split (the large shot, the wait, the halves' fan, its floor row, the halves
  outliving their Skimmer, the `thread` event); the Relic Shield's closed share, open window, broken armour and re-closing
  at Nahara's cadence; only the Relic Shield is armoured.
- `tests/sim/citadel.test.ts`: the Fracture Wave's zigzag, gaps and coverage; the Boomerang Barrage's curve, flown as
  forecast; THE CITADEL ends Silent Empire, its phases and hull, and every phase's attack admitted and woven through by the
  perfect pilot.
- `tests/world/terrain-nahara.test.ts`: the canyon floor's dressing (ledges only, clear of streams and THE CITADEL's
  canyon, prefetched without fallbacks); every kit node in its contract; the sand shader per tier; ripple clearance off
  cliffs and across joins; the shelter on every footprint, open floor kept, built terraces bare, deterministic across
  joins, and the streamed view matching either build order.
- `tests/world/terrain-route.test.ts`: THE CITADEL's arena on its own rock.
- `tests/campaign/profile.test.ts`: inserting Silent Empire locks nothing already open.
- `tests/audio/audio.test.ts`, `tests/audio/boss-music.test.ts`: Nahara's own score and key.
- The fairness suites fly Silent Empire at every difficulty and Nahara's endless stints.

## Open

- `WORLD_INTENSITY.nahara` is Corona's; it should sit between Corona's and Umbra's once measured.
- The dart, Needle and weaver share the Dune Hunter.
- THE CITADEL's GLB is the heaviest boss file; its bake could drop to 1024 pixels. The monoliths straight before its
  stairs stand in a fairly regular row.
- The ground batteries' plinths do not calm the ripples round them: the simulation seats them after a section's mask is
  built. Feeding their seats to the ground shader, as the strike-site pads are, would cover them.
- The canyon floor's ripples show only between its dense dressing; thinning the rubble or giving low rubble a smaller
  calm would show more.
- No phone test: the sand shader's GPU cost and the canyon floor's extra draw calls are the things to watch.
