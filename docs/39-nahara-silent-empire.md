# Nahara · Silent Empire

Design v0.1 · 12–13 November 2026. The user handed over the world with concept sheets: the world
(`art/concepts/nahara/01-world`) and the enemy fleet ("NAHARA ENEMY FLEET": Skimmer, Relic Shield, Obelisk, Quarry
Battery, Dune Hunter, Sunspike). The concept images are references, never runtime backgrounds or finished assets
(AGENTS.md invariant 9).

The planet is **Nahara**, the mission **Silent Empire**, the boss **THE CITADEL**. (The mission was called *The Silent
Empire* until 14 November; the user: "remove the THE". The id stays `silent-empire`.)

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

### The buried empire and the moving sand (14 November)

The user: "nahara still feels very empty. The dunes and hills are just so plain". Questionnaire answers: the buried
empire and moving sand, a steady scatter, the existing ruin kit, low and wide.
- **Buried empire** (`buriedEmpire`):
  - **Pieces:** the kit's own pieces sunk in the sand, their tops showing at most 1.2 over the lowest ground under them:
    - arch crowns, their turquoise intact;
    - wall lines of two to four courses;
    - tower battlements;
    - gates buried to the lintel;
    - pillar stumps;
    - a few tumbled blocks round each.
  - **Placement:**
    - one candidate per 4 × 4.4 patch;
    - 92% taken on the natural sandstone, 30% in the ruin districts, which have their own ruins;
    - only on open ground: the hills and plateau, never the canyon floor, steep walls or the Citadel's rock.
  - **Scope:** scenery only; nothing simulated.
  - **Measured:** the busiest frame rose from 91k to 117k triangles. Instanced, so the draw calls barely changed.
- **Moving sand** (`src/render/sand-streams.ts`, render only, one draw each):
  - **Sand streams:** pale ribbons of blown sand gliding across the ground with the wind, draped over the terrain, with
    grain flowing along them; there are 36 (18 on Low).
  - **Dust devils:** tried and removed (user, 14 November: "they look a bit shit, just remove them").
- **Teal streams** (`tealStream`, 15 November; user: "increase the amount of teal colors in nahara? Maybe some small bits of
  streams of teal liquids on the canyon grounds", then "not too wide, but they should be longer"):
  - a channel winding along the canyon floor, in long lengths that sink into the sand and come up again further on;
  - drawn through the ground's pool glow as a glowing liquid (Nahara: `poolCells` 0, `poolGlow` 0.7, a teal bed);
  - render only.
  - **Never over the canyon:** a pale line in the lane could read as a shot. A stream fades where the ground falls away.
  - **Determinism:** placed by a fixed hash.

### The canyon floor and the rippled sand (15 November)

The user: "lets enhance nahara by placing more things on naharas canyon grounds. Theyre so empty now. Also, a nice detailed
sand texture shader for the dunes etc would look great, like ripples of sanddunes"; then "khepri has nice canyons as
inspiration".

- **What Khepri does:** its canyons read rich at their edges. Columns crown the rims, talus and fallen columns heap at every
  cliff's foot and thin out across the floor, rubble lies in patches. Nahara's ledges had nothing but the odd monolith.
- **The fallen city** (`canyonFloor`): the same gradient in Nahara's own ruin.
  - **Talus:** tumbled blocks down the main canyon's lower walls (under -4), half sunk in the slope.
  - **The walls' feet** (a rise within a unit): rubble fields, tumbled blocks, columns fallen along the wall, now and then
    a stump.
  - **The ledges:** rubble in patches (a noise field), fallen columns, the stepped foundations of fallen buildings, obelisk
    and column stumps, and rarely a relic of the empire's machines.
  - **The rims:** a little rubble and a stump, set back from the edge.
  - **Rules:**
    - one candidate per 1.4 × 1.4 patch, jittered in it (seeded, seam-free);
    - about twice the pieces' modelled size: on the ledges, far under the camera, real size read as pebbles;
    - only from -6 up: the cleft's floor stays lost in the haze with the teal streams;
    - never on a stream, never overhanging a drop (no corner of the footprint falls away), off the monoliths' and great
      ruins' feet;
    - never in THE CITADEL's canyon (from 42 before the temple to 36 past it), which keeps its own authored ruins;
    - nothing over 2.3 above its ground, under the 3.0 scenery cap;
    - strike sites and battery compounds clear it at render time, like all scenery;
    - rubble and tumbled blocks are cosmetic (the Low tier skips them); foundations, stumps and relics always stand.
  - **Scope:** scenery only; nothing simulated.
- **The pieces** (Blender, `nahara_kit.py`, the canyon floor's section): fallen column drums (two), an obelisk stub and
  column stumps, foundations (an outline and a stepped platform), rubble fields (chips round two blocks, a toppled wall
  course, a carved slab cracked across its glyph), relics (a bronze ring's arc, a split pylon over its core). Their
  turquoise inlays glow at 55 % of the kit's: many lit lines on the floor read busy, and could be taken for the ship's shots.
  The carved slab is one rubble field in eight for the same reason.
- **The sand** (`src/render/terrain-kit.ts` `SAND_GLSL`, `SAND_RIPPLES`, `SAND_SPARKLE`): a procedural ground shader in
  the section's own units, so it never swims with the scroll; every wave vector divides the 36-unit section, so the joins
  carry on.
  - **Wind ripples:** about a third of a unit apart, crests across Nahara's wind (the sand streams' `WIND`), asymmetric (a
    long windward slope, a short lee). Their phase wanders on two octaves of noise, so crests bend, fork and merge, and the
    ground's height shifts it, so on a slope the crests turn toward the contours.
  - **Dune swells:** a long, low undulation every 3.7 units leans the light and rouses the ripples on its windward side;
    some patches lie smoother.
  - **Lit, not painted:** the ripples tilt the normal. Their slope comes from the phase's screen derivatives turned into a
    world gradient (the inverse of the ground's screen Jacobian), so the light follows the crests as they bend. Crests are a
    shade lighter and troughs darker; the pebbly dust map is mostly lifted off the sand.
  - **High:** a finer set of ripples across the first, and a subtle sparkle of grains that mirror the sun into the camera
    (after the direct light, so only in sunlight; each glint at least about a pixel, never one flickering texel).
  - **Low:** one octave, no sparkle, one noise fewer.
  - **No aliasing:** each octave fades out before it would alias (its phase's `fwidth`, about four pixels a ripple).
  - **Where:** the natural sandstone's flats, and drifted patches over the built paving; never on walls, steep slopes or the
    teal streams. The other worlds pay one uniform test. (Since 17 November only on open sand: below.)
- **Measured** (High and Low, headless Chromium on SwiftShader, so no GPU time; no phone yet):
  - **Scenery:** over ten sections (seed 93) the dressing went from 449 pieces to 728. The new ones are 112 rubble
    fields, 54 fallen columns, 27 stumps, 8 foundations, 10 relics and 68 more tumbled blocks. Instanced, about 250 to 700
    triangles a piece.
  - **Seven frozen views** (`tools/nahara-lookdev.mjs`):
    - High: 30–38 draw calls and 52–71k triangles before, 37–47 and 59–86k after;
    - Low: 21–29 calls and 50–67k triangles before, 24–34 and 53–71k after.
  - **The flight** (`tools/perf-bench.mjs nahara`, 300 frames at 4× CPU throttle):
    - High: mean calls 51.6 → 60.4, triangles 106k → 116k;
    - Low: calls 42.8 → 48.0, triangles 103k → 106k;
    - JS work a frame, High: 11.4 and 13.3 ms before, 12.0 and 14.3 after (load 10–26, so ±20 %);
    - terrain prefetch: about 75 → 95 ms per 300 frames, with no synchronous section fallbacks;
    - shader programs unchanged (the ground keeps its one program).
  - **Within the guardrail** (docs/36: 100 calls, 180k triangles).
  - **The shader's GPU cost is unmeasured.** It adds about three value noises (two on Low) and a dozen trig terms a
    ground pixel; a phone test should confirm it.

### Ripples on open sand only (16–17 November)

The user: Codex's fixes look better, "but where it is applied bugs me a bit. It runs below rocks and buildings/ruins but it
should not do that. I told it to limit it to open stretches of land and canyon floors".

- **The terrain's bed** (`TerrainSection.sandClearance`, per vertex; Codex, 16 November, then 17 November):
  - the landform's `sand` (`naharaLandform`): the natural sandstone, and in the ruin districts only the canyon's ledges and
    floor (under -2.8; the basin mesas' tops are at -2.2 and up). The built terraces, cities and fallen buildings'
    footprints carry none (they had faint drifted patches), nor does THE CITADEL's rock;
  - away from cliffs: fading over a rise or drop of 0.35 to 1.1 within a unit, and over slopes of 0.12 to 0.5;
  - strike-site pads clear it (render only, as before).
- **The scenery's shelter** (`src/world/sand-shelter.ts`, the `sandShelter` attribute): every placed piece calms the
  ripples round its footprint, so it sits in smooth sand. Only the ripples and the dune swells fade: the sand's colour,
  its dust and its sparkle stay.
  - **Footprints:** each piece's plan turned with it and scaled, measured from `nahara-kit.glb` per variant
    (`NAHARA_PLANS`; the GLB test holds them to the model). The contract bounds are the most a node may take, and the
    pieces take less: a tumbled block's contract is 0.6 by 0.6, its stones about 0.35 by 0.35.
  - **Only where a piece meets the ground:**
    - a standing arch at its piers (x 0.66 to 0.94 either side), a half arch at its one (`ARCH_PIERS`);
    - a buried arch's crown along its whole width;
    - a piece standing clear of the ground (an aqueduct's bay over its pier columns) not at all.
  - **The calm** (`r` the footprint's radius, `e` how far the piece stands over the ground, at most 3):
    - fully calm to `0.1 + 0.05 r` past the edge;
    - fading out over `0.3 + 0.12 r + 0.1 e` more;
    - a tail on the lee side, downwind (`SAND_WIND`, the sand streams' wind), up to `0.3 + 0.5 e + 0.1 r` long (at most
      2), thinning as it goes.
    - So a small block's ripples stop about half a unit round it, a rubble field's under a unit, a tower's 1.2 round and
      2 downwind.
  - **Seams:** a section's rows within 7 units of a join (`SAND_SHELTER_REACH`) take the neighbour's pieces too.
    Whichever side is built first, the later one re-shelters the earlier one's band and uploads only those rows. Both
    sides of a join are then the same row.
  - **Cost:** computed once per section while its view is built off-frame (24 rows a prefetch step, each neighbour's
    band a step of its own), no per-frame work, no draw call, one float attribute a ground vertex. The same mask on Low
    (where the cosmetic rubble is not drawn, its calm stays: a smooth patch, not a hole).
  - **Not covered:** the ground batteries (seated by the simulation, not the terrain) and THE CITADEL (its rock carries
    no sand).
- **Where ripples show now:** the open natural sandstone and the canyon's floor between its dressing. The canyon floor is
  densely dressed (15 November), so its ripples lie in the gaps. Over seeds 93, 8831, 11 and 4242 (sections 3 to 9), the
  ripples keep over half their strength on 29 % of the canyon floor's bed (the pieces' plans alone cover 46 % of it) and
  on 49 % of the open land's (28 %).
- **Review stills** (`lookdev/nahara-ripple-mask/`, its `contact-sheet.png`): the frozen terrain-relief views on High and
  Low, before and after, crops round buried walls and towers on rippled dunes, and the mask drawn in colour.
- **Measured** (headless Chromium on SwiftShader, so no GPU time; no phone yet):
  - **Per section** (Node, 40 sections of seeds 93, 8831, 11 and 4242, load 15–24): generation 129–133 ms before and
    after. The shelter takes 3.0–4.5 ms for a section's rows and 1.0–1.9 ms for its two join bands, about 3 % of the
    section's generation, in steps under a millisecond.
  - **Ten frozen views** on High and Low: the same draw calls and triangles before and after, to the triangle.
  - **The flight** (`tools/perf-bench.mjs nahara`, 300 frames at 4× CPU throttle):
    - draw calls 60.6 → 61.0 on High and 47.9 → 47.9 on Low, triangles unchanged (116k, 106k);
    - no synchronous section or view fallbacks;
    - frame time within the machine's load noise: load 10–14 before, 15–20 after. The simulation, which this does not
      touch, rose 22 % with it; the render rose 36 % on High and 12 % on Low.
  - **The shader:** one varying and a smoothstep more, one value noise fewer (the drifted patches over the paving are
    gone).

### The ruin kit (`tools/blender/nahara_kit.py`, `public/assets/nahara/nahara-kit.glb`)

- **Construction:** rounded, weathered blocks (`rblock`), towers of bonded courses with lit openings.
- **Pieces:**
  - arches of wedge stones with a teal channel, and broken half arches;
  - monoliths, towers, gates and rubble;
  - a ring mechanism;
  - aqueduct bays (whole, broken through, a ruined end) and their pier columns;
  - the canyon floor's pieces (15 November): column drums, stumps, foundations, rubble fields and relics (above).
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
- **Awakening** (14 November; user: "when we arrive at the boss it takes a tad too long until the boss fight starts even
  tho hes already on screen"):
  - Its arrival is 3 s, not THE ECLIPSE's 5 s, which covered that boss's rise. It ends as the scroll stops (187 s); the
    first windup comes at 188.3 s instead of 190.3 s.
  - It stands dormant (glow 0.15) until then. Through the arrival it shakes the sand off (a puff of dust and a short
    camera rumble), then its lanterns, emblem and crown light in turn, each with a flicker and a flare of sparks
    (`AWAKEN`, `src/render/veil-view.ts`).

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
- No phone test yet. The sand shader's GPU cost on a phone and the canyon floor's draw calls (up to about 10 more nodes in
  view) are the things to watch.
- The ground batteries (the Quarry Battery's plinth) do not calm the ripples round them: the simulation seats them, after
  the section's mask is built. Feeding their seats to the ground shader (like the strike-site pads) would cover them.
- The canyon floor's ripples show only between its dense dressing; if the user wants more there, thin the dressing's
  rubble or give the low rubble a smaller calm.
