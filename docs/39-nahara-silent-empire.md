# Nahara · The Silent Empire

Design v0.1 · 12–13 November 2026. The user handed over the world with concept sheets: the world
(`art/concepts/nahara/01-world`) and the enemy fleet ("NAHARA ENEMY FLEET": Skimmer, Relic Shield, Obelisk, Quarry
Battery, Dune Hunter, Sunspike). The concept images are references, never runtime backgrounds or finished assets
(AGENTS.md invariant 9).

The planet is **Nahara**, the mission **The Silent Empire**, the boss **THE CITADEL**.

## Place in the game

- **Campaign:** the eighth world, between Dying Star (Corona) and Final Horizon (Umbra).
  - Save version 5: the `opened` list keeps a v4 pilot's Final Horizon open when the new mission is inserted before it.
  - v4 saves are backed up and migrated.
- **Endless:** Nahara flies between Corona and Umbra in the cycle (stage ids `eh`; the campaign arc uses `h-`).
- **Missions:** Shieldbreaker (4 Relic Shields, 50 credits) replaces Air Superiority, with a new `kills` rule. Split
  Runner (fly between the two halves of a Skimmer's split shot 3 times in one run, 25 credits; user, 13 November) took
  the place of Echo Breaker (6 Skimmers), which had replaced Hunter Bounty. Its `threads` rule counts the `thread` event
  (src/sim/events.ts observeThreads, observation only).

## Enemies and attacks

- **Skimmer** (`skimmer`): a fast light raider. Its aimed shot pauses and splits in two (`ECHO_SPLIT`). Since 13 November
  (user: "the split shot is amazing. I want more of these enemies, put them in corona as well") it flies on Corona too,
  and more often on Nahara and Umbra.
- **Relic Shield** (`relic`): a heavy ancient machine.
  - Closed, it takes a quarter of the damage; it opens only to fire, and rests closed between attacks (`RELIC_ARMOR`).
  - Its armour breaks for good below 30% hull.
  - The renderer rings it with six armour lines: bronze while closed, parted and turquoise while open.
- **Fracture Wave:** walls across the whole map with one gap each, zigzagging centre, side, centre, other side. Each gap
  is over a strip the fairness rules keep open. A reusable boss attack: THE CITADEL and THE ECLIPSE both use it.
- **Boomerang Barrage:** shots swing out, turn, and cross the player's row at the aim plus an offset. They follow an exact
  constant-acceleration curve (`ShotSpec.ax`), which the fairness forecast predicts. Also reusable; both bosses use it.
- **THE CITADEL:** three phases on one reactor pool, the fall at 40%, about 5,000 effective hull (less than THE ECLIPSE).
- **Fairness:** for sets mixing fresh and committed footprints, the director also checks the exact window starts
  (`assessSafety`); the trace and the pilots follow the curved shots.

## The world (`src/world/terrain-nahara.ts`)

User direction:
- "the large broken arcs are missing, larger pillars ... use textures for details";
- "It should feel huge";
- the canyon should not run "straight down the middle";
- then "some sections are so empty", "minecrafty", a "50/50 mix" with "organic hills and canyons ... as we did in corona";
- the blocky ruins "only ... near lots of cliff models, arches".

- **Two countries:** large regions with winding borders (`naharaBuilt`), the built country only within about five units
  of the canyon's rims, about 30% of the ground.
  - **Built country (the ruin districts):**
    - square terraces on a snapped grid, notched rims and stepped ledges;
    - ruined cities and the footprints of fallen buildings;
    - cliffs in running-bond masonry.
  - **Natural sandstone (Corona's technique):** domain-warped canyon edges, benched hills and buttes, and canyon walls
    stepping down in three stratified cliffs that wander, come and go and are never sheer. Cliffs show wavy strata.
- **The canyon:**
  - it swings across the map, opens into basins, narrows and forks around islands, with side ravines;
  - its floor is −8.5 in a teal haze, but the full depth is only a cleft down each channel's middle;
  - elsewhere the bottom is a ledge at −5.0 to −5.6. Ground batteries seat where the line of sight meets the ground, and
    deeper seats drifted two squadrons into each other on screen (fairness-endless-late, 13 November).
- **Sun:** behind the ship, to the left (7:30; `sunBehind`, user: "i like 7:30 here"). Umbra too since 13 November.
- **Look:** the user's playground fog and light (haze rising high up the canyon walls).
- **Jagged rims:**
  - on the natural sandstone, wall and top blend by the smooth per-vertex steepness;
  - the rim crease (a rim lit by each triangle's own plane) is off there;
  - the canyon rims round over.
- **Stone textures** (`createMasonryTexture`, `createSandstoneGrain`):
  - one map for the cliffs: running-bond masonry in R, natural strata in G, picked per vertex by the landform's strata
    share;
  - a weathered-sandstone grain on the ruin kit, projected triplanar on Nahara so curved arch stones carry it too;
  - the stone finish's bump is off on Nahara (stretched pieces smeared it).

### The ruin kit (`tools/blender/nahara_kit.py`, `public/assets/nahara/nahara-kit.glb`)

- **Construction:** rounded, weathered blocks (`rblock`), towers of bonded courses with lit openings.
- **Pieces:**
  - arches of wedge stones with a teal channel, and broken half arches;
  - monoliths, towers, gates and rubble;
  - a ring mechanism;
  - aqueduct bays (whole, broken through, a ruined end) and their pier columns.
- **Placement:**
  - **Canyon arches:** a candidate every 20 units, wall to wall, each pier half sunk into its wall.
  - **Great ruins on the hills:** one candidate per 6 × 8 patch (arches, monoliths, towers, some great towers, gates);
    arches at least 15 apart along the run and great ruins at least 5 apart (denser on 13 November: "i want more ruins").
  - **Ruined aqueducts** ("ruined", "doesnt need to be connected", "dont make the aqueducts have a glow"):
    - now and then a dry run across the map at one level;
    - columns under every pier reach a unit into the ground;
    - missing and broken bays, with a ruined end wherever a run breaks off.
  - **Removed:** the carved wall facings, whose caps jutted and whose masonry smeared.

## The fleet (`tools/blender/nahara_fleet.py`, `public/assets/nahara/nahara-craft.glb`)

Built on the approved fleet toolkit (Umbra and Corona): lofted hulls with knife edges, glow in grooves. The user asked for
"more detailing and more mechanical like the pillars":
- rounded stone blocks with pale worn edges and weathered mottling, over dark frames;
- hinges, pistons, vents and lit slits;
- carved step-fret glyphs.

| Model | Kinds | Notes |
|---|---|---|
| Dune Hunter | dart, needle, weaver | sizes 0.85, 0.72, 1.0 |
| Obelisk | pulsar (and lancer) | the spire laid toward the player, stacked courses, fins on pistons |
| Skimmer | skimmer | a keel between two segmented prongs |
| Relic Shield | relic | six hinged shield plates on pistons, a honeycomb band |
| Sunspike | wraith (and diamond) | Nahara's elite; no diamond flies on Nahara |
| Quarry Battery | turret, missile | octagonal stone plinth, a launcher housing with three lit mouths |
| drone | THE CITADEL's pods | its model has no pod of its own, so its pods fly the fleet's drone |

Hostile fire on Nahara is blood red (as Corona's). Budgets: 2,500 for the light craft, 3,000 for the Obelisk, 4,500 for
the Sunspike, 5,000 for the Relic Shield.

## Strike sites

Nahara has the ancient worlds' sites in its own sandstone-and-turquoise finish, texture-baked as Corona's
(`tools/blender/strike_sites.py`, `--finish=nahara`):
- the crash site;
- the prism reactor;
- the sealed vault (guarded by a Relic Shield);
- the gate ring.

It also has its own **Step Temple** ("a blocky pyramid, aztec style somewhat but alien too"):
- a five-tier pyramid with a front stairway, turquoise seams, carved recesses, horned blades and a summit shrine;
- the target, a crystal eye in a ring of shards over the summit's altar;
- a parts site.

## THE CITADEL (`tools/blender/nahara_citadel.py`, `public/assets/nahara/the-citadel-v2.glb`)

The user supplied a Tripo temple ("fantasy temple citadel boss ... its a stationary one"). Its adaptation (v1) was rejected:
"its color is off ... I would expect you to reuse some of the existing brick and arc models on the boss so it seems
coherent". The boss is built of the ruin kit's own construction instead, with the Tripo model as the guide for its
shapes (user: "keep it kit built, but obviously you can still take shapes etc from the tripo model"):
- **Rock:** a mesa in strata, its rim broken; its cliff carved with stacked-block pillars, arches over lit recesses and
  caves where arches fell, down to the canyon floor ("so it reads like part of the terrain, not like just planted on top").
- **The temple:** a curved upper terrace, and a drum whose front is nested rings of wedge stones round the emblem; a stepped
  ribbed dome with a lit oculus; tall leaning blade fins (some snapped off); long stepped buttresses to the corners.
- **Ruin:** cave-ins in the plaza, columns whole, broken and fallen, gaps in parapets and copings; stairs down the cliff on
  pillars; a bridge out over the canyon broken off in mid-air (left), one broken up into piers (right).
- **Targets:** the crown of turquoise crystal panels round the drum (core), the two lanterns (first pair), the emblem
  (prow). Positions in `src/content/citadel.ts`, measured by the script (`lookdev/nahara/citadel/citadel-v2-report.json`).
- **Size:** 5.1 over the plateau (the spire cap, under the flight plane); 58,600 triangles; texture-baked in Nahara's
  sandstone (`boss_remodel` STYLES), 8.2 MB.
- It stands still (`BossDefinition.stationary`, `CarrierStyle.still`); its terrain exclusion is only its plaza. It stands
  in its arena before the fight and after it (a wreck), never rises or sinks, and only explodes when it falls.

### The arena (`src/world/terrain-nahara.ts`)

User: "model the boss arena specifically for it ... so it looks like the citadel is sitting in an ancient ruin city";
"limit the flat part to just the base of the model ... like its towering in a canyons"; "it should tower above other
ruins"; the canyon "should be closer to the normal canyons"; "fill the surroundings with ruins and arcs too".
- **Ground:** flat only under the rock (`naharaPlatform`), where the model is drawn (`CITADEL_AT`, 24.75: the perspective
  camera's seat, measured); the canyon falls away right at the rock's edge. Nahara's arena does not use the common clearing.
- **Canyon:** the world's own canyon swings to the temple, opens into a gorge before it and forks round it
  (`citadelCourse`): the rock is the point of the island between the channels.
- **Heights:** the ground near it keeps to the lower terraces, and every ruin near it stays under its dome (`citadelCap`).
- **Ruins** (`citadelRuins`):
  - three great arches across the gorge (the nearest a gateway at the foot of its stairs, one broken);
  - half arches from the rims and monoliths out of the haze;
  - a dense field of kit ruins on the ledges and rims;
  - arch bridges in front and behind, and a ruined aqueduct behind.

## Music (`src/audio/score.ts`, `instruments.ts`)

**The Silent Empire**, D at 90 BPM ("more mystery"):
- **Harmony:** nothing resolves. Dm with its ninth against the third, a B♭ augmented triad, a chromatic step to F♯ minor,
  and A suspended.
- **Voices:** an ancient horn (three long notes per chord), a wordless choir, the stone processional drum, a sistrum, and
  crystal "conduit" arpeggios.
- **Boss stem:** the stone drum and the sistrum.

**Success sound:** a short ring ("like a rrrrring"), 1.4 s, louder.

## Open

- THE CITADEL's GLB is the heaviest boss file (8.2 MB); its bake could drop to 1024.
- The monoliths straight before its stairs stand in a fairly regular row.
- Distinct models for the dart, needle and weaver.
- No phone test yet.
