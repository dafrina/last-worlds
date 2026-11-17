# Amnion, the Brood Wastes

Amnion is the bone-and-flesh world: the campaign's fifth mission, Brood Strike, and the fourth world of the endless cycle.
This doc covers its look, its world generator, its Blender kits, its enemies and the brood heavy, and THE CRADLE. The
user named the world, the mission and the boss on 23 October ("biological wasteland and eggs and biological enemies and
facilities"); the user's concept for it was shared in that session and is not in the repository (code comments still
cite it under a path that does not exist, "art/concepts/amnion-brood-wastes").

## 1. Identity

- **Dry, hot and calcified.** Nacre is wet, cool and bioluminescent; Amnion is bone, chitin and yolk.
- **Ground:**
  - pale bone-crust plateaus cracked into tilted plates and dimpled with egg hollows;
  - bone mountains with sharp ridged crests in their own regions (user, 23 October: "definitely also add mountains not
    only mesa canyons");
  - jagged sheer-walled crevasses with dark flesh walls and floors and a glowing yolk river along their middle.
- **Grown, not built:** egg clutches, bone tusks, ribbed nests and hive spires are the world's structures; Amnion has no
  outposts, roads or pipelines.
- **Light:** a warm afternoon sun low from the upper left over pale bone, warm sky fill, a flesh-red bounce in the canyons
  and a warm mist rising out of them (the user's playground settings, 23 October). The values are `LOOKS.amnion` in
  `src/render/scene.ts`.
- **Palette:** `AMNION_PALETTE` in `src/world/terrain-amnion.ts` (bone, shaded bone, stain, sinew, dark flesh, floor,
  hollow). The flesh is a dark blood maroon (user, 23 October: "make the flesh a bit darker").
- **The glow comes from the terrain texture, not from lights:** the yolk is the ground shader's pool glow and vein lines
  (`glowColor`, `veinTint`, `poolTint`, `poolGlow`, `poolCells` set per planet in `src/render/terrain-kit.ts`), and bloom
  stays restrained for phones.
- **Faction paint:** flesh-dark to bone with yolk glow (`WORLD_PAINT.amnion` in `src/render/world-paint.ts`).
- **Terrain is scenery only:** everything stays under the flight plane (§3), so canyons and mountains never seal the
  flight.

## 2. Brood Strike and Amnion's enemies

### Mission

Brood Strike (`brood-strike`) is campaign mission 5, after Deep Bloom and before Dying Star (`CAMPAIGN_ORDER`). Its arc is
`BROOD_STRIKE` and `BROOD_STRIKE_SORTIE` in `src/content/encounter-deck.ts`, on the late worlds' timing grid (the shape
Deep Bloom set):

1. an introduction: a drone flight over the canyons, a dart arrowhead, a pair of nest spires;
2. pressure: weaver columns, spore mortars, a field of egg sacs, a Needle line and the first brood heavy;
3. a strike-site place in the recovery, then the bone field (the sortie stretch): egg sacs, drones and a Needle column;
4. the second pressure block, with the first of the mission's two Pulsars and a Diamond-Lancer pair;
5. the climax ("THE BROOD RISES"): Diamond convoys, spore mortars, the second Pulsar and a last Needle swarm;
6. relief, then THE CRADLE rises.

Pressure comes from `WORLD_INTENSITY.amnion`, `MISSION_CADENCE['brood-strike']` and `MISSION_PRESSURE['brood-strike']` in
`src/content/balance.ts`: Amnion steps past Nacre in the late-world curve (10 November), and the campaign adds its own
pressure on top (13 November; [docs/40](40-balance-measurement.md)). The shield cells are `CRADLE.shieldSupplies`. Only two
Pulsars fly, in their own slots: a tracking stream is the hardest thing to read over the glowing canyons, and the deck
never draws one ([docs/33 §4](33-strike-sites-and-encounter-deck.md)).

### Enemies

Amnion flies darts, weavers, turret batteries, Needles, Diamonds, Lancers (in the Diamond-Lancer pair), missile batteries,
fuel targets and two Pulsars (`authoredKinds('amnion')`). They keep their kinds' behaviour
([docs/03 §2](03-worlds-and-generation.md#2-enemy-catalog)); the messages give them the brood's names: drones (weavers),
nest spires (turret batteries), spore mortars (missile batteries), egg sacs (fuel depots), brood heavies (Diamonds).

- **Models.** Nacre's organic craft stand in for every kind but the Diamond (`NACRE_CRAFT` in `src/render/scene.ts`,
  `public/assets/nacre/nacre-craft.glb`). The fuel targets are the shared fuel skid.
- **The brood heavy** (the `diamond` class, its aces included) has its own model: unequal calcified plates around an open
  toothed mouth, dark flesh, hanging sinews and tusks round its rim (`public/assets/amnion/brood-heavy.glb`, root node
  `amnion_brood_heavy`, built by `tools/blender/craft_brood_heavy.py --brood-only`). It keeps its own material colours, with
  no faction recolour or panel texture, and draws as one instanced batch (`ensurePredator` in `src/render/scene.ts`). Its
  triangles were cut to about a third on 6 November (Amnion drew twice the triangles of any other world).
- **Aces** are brood heavies under a yolk-coloured shield (`HUNTERS.kinds.amnion`, `PLANET_GLOW.amnion`).
- **Hostile shots** are acid green with a pale core, muzzle flashes to match (`AMNION_SHOT` in `src/render/shot-colors.ts`,
  8 November). They are never cyan: the player's own shots are white-cyan.

## 3. World generation

The profile is `AMNION` in `src/world/terrain-amnion.ts`: one mood (`brood`), no sea, no settlements and no networks. Pure
functions of the seed and world position.

- **Plateaus.** Two tiers of bone crust (`PLATEAU`, `TIER`), gently domed, with egg hollows; the crust breaks into
  tilted plates about 3.4 units across, split by sharp cracks (`plates`; user, 23 October: "too rounded"). The whole level
  sits lower than at first so the tusks can grow under the flight plane (user, 23 October: "lower the whole level a bit").
- **Crevasses.** Two lanes of jagged zigzag crevasses down the world (`crevasseSegment`), straight runs turning at sharp
  angles. Their width is set at every turn (`knotHalf`: about 30% narrow slits, 48% canyons, 22% wide chasms), so they
  taper, and they close to a pointed wedge where they break off. Each lip has its own two-scale serration and an
  occasional fang; side cracks run off to a point (user, 23 October: "too uniform, same width canyons and too rounded ...
  sharp and hostile and biological edged"). The floor (`FLOOR`) lies 3.0 under the plateau and sags toward the yolk river
  of the main crevasses. Umbra reuses this generator with its own seed ([docs/28](28-umbra-eternal-eclipse.md)).
- **Mountains.** Bone massifs in the plateau interiors, set back from the lips, with two octaves of ridged crests up to
  `PEAK`. About a third are cut into strata whose risers stay bone, shaded as stone steps (user, 24 October: "fix these
  regular red strikes").
- **Ruins.** At most one per `RUIN_ROW` units of flight: a clearing round a sunken, jagged-rimmed courtyard (its floor at
  `RUIN_FLOOR`) holding the brood ruin, a broken ring of torn bone round a cracked glowing heart with gigantic tusks, about
  7 units tall from the courtyard floor, egg heaps along its wall (user, 23 October: "big areas on the base but also high
  and imposing").
- **Scenery caps:** `AMNION_SCENERY_MAX` for everything and `AMNION_TUSK_MAX` for the tusk pieces (great tusks, brood nests,
  hive spires, the ruin), 0.4 under the flight plane (docs/08, 23 October). Pieces under the plane never cover a ship or a
  shot; the margin only keeps thin tips out of the ships' layer.
- **Dressing** (`amnionScatterSteps`):
  - landmarks on a lattice: brood nests and hive spires on open plateau, egg heaps pressed against them (separate pieces,
    so the eggs stay round while the landmark stretches tall);
  - egg clutches piled in the hollows and crowding the plateau edges over the canyons, a few on the canyon floors;
  - great tusks on the mountains and along the canyon edges, small nests on open crust, bone shards everywhere;
  - goo webs strung lip to lip across the main crevasses in irregular bunches, sagging into the gap (user: "should read
    sticky");
  - flesh walls along the canyon lips in continuous runs, never on mountain flanks or turned away from the camera
    (`cliffWallSteps` with `fleshWall`; the wall rules are [docs/26](26-terrain-relief.md)).
- **Ground look.** The flesh walls' shading is `WALL_LOOK.amnion` (flesh only, so terrace risers stay bone); the crack map
  is tinted bone (`src/render/terrain-kit.ts`).
- **Boss arena:** THE CRADLE's emergence site (`EMERGENCE`): a wide flesh canyon across the arena with serrated lips and a
  dim yolk glow far down, crust heaved up toward the lips in broken plates split by glowing fissures, and two narrower
  chasms cutting diagonally through. It blends back into the world about 16 units out.

## 4. Blender assets

Seeded, deterministic scripts in `tools/blender/` (+Y up, game units, base-centre pivots, colour in `COLOR_0`).

| File | Builder | Contents |
| --- | --- | --- |
| `public/assets/amnion/amnion-kit.glb` | `kit_amnion.py` | Egg clutches, great tusks (`boneSpire`), small nests, bone shards, brood nests, hive spires, the brood ruin, goo webs (`AmnionKitKind` in `src/world/scenery-kit.ts`). Materials `amnion_bone`, `amnion_flesh`, `amnion_glow` (the glow faces emit their own colour). |
| `public/assets/amnion/cliff-kit.glb` | `kit_cliffs.py --world amnion` | Flesh walls: lobes and sinews tucked under the plateau's bone edge. |
| `public/assets/amnion/brood-heavy.glb` | `craft_brood_heavy.py --brood-only` | The brood heavy (§2). |
| `public/assets/amnion/the-cradle.glb` | `boss_cradle.py` | THE CRADLE (§5). |

The kit's shapes follow the user's 23 October review ("too small and way too comic like", "make them closer to the
concept"):

- **Torn webbing:** tusks grow out of a membrane torn with real oval holes, big then small, stretched along the spread
  ("tears in the spikes base, like tearing apart by spreading it like a dough"). The holes are cut with Blender's triangle
  fill, so they cost a few hundred triangles, and their rims curl under in dark flesh.
- **Nests:** a torn bone bowl round a glowing pool, four or five tusks of very different size and lean at irregular gaps;
  never a symmetric ring of spikes ("way too uniform").
- **Eggs:** heaped as in the concept, big eggs at the core, smaller ones stacked between them, tiny ones in the gaps; one
  in six glows.
- **Pearl shells** ("this perlescent color with shine"): pale nacre turning to pastel pink, lilac, teal and gold toward
  the rim, baked by the normal (the camera never turns, so this stands in for iridescence). Vertex alpha 0 marks them
  glossy, and the kit shader gives them low roughness and a sharp sun glint.

## 5. THE CRADLE

A living nest-fortress that rises out of a flesh canyon carrying the brood. Its numbers are `CRADLE` in
`src/content/cradle.ts`, its definition `BOSSES.cradle` in `src/content/bosses.ts`, and its view `CRADLE_STYLE` in
`src/render/carrier-view.ts`. It follows the shared boss rules ([docs/03 §3](03-worlds-and-generation.md#3-bosses)).

**Targets.** Two brood sacs (the flesh bulges at its front flanks; `sacOffset`, `sacS`, `sacRadius`, `sacHp`), then the nest
heart, the golden egg (`heartS`, `heartRadius`, `heartHp`), whose six bone shields swing 42° outward to open it
(`CRADLE_STYLE.shutterOpen`). The ribbed shell, the spires and the egg clutches are scenery. The combat points sit within
half a unit of the model's egg and bulges; closer values pulled the overload fan's outer bolts onto both screen edges with
one through the middle, a seal the fairness rules forbid.

| Phase | Attacks |
| --- | --- |
| Arrival (`arrivalDuration`) | Rises straight up out of the emergence canyon at its row (`entryS` equals `row`), then hovers over it (`CRADLE_STYLE.hover`; user, 23 October: "after rising it hovers slightly"). |
| Brood sacs | Aimed spore bursts (`sacBurst`), one attacker at a time. |
| Nest heart | `coreMoves`: a slow, wide spiral, aimed bursts (`heartBurst`) and a fixed fan (`heartFan`); hatchling waves from two brood bays at its base (`bays`, `launches`, the `veil-pods` formation). The spiral rests `spiral.rest` seconds, because its streams were still crossing the screen when the next burst and a hatchling wave came (27 October). |
| Overload | `overloadMoves`: core lane, spiral, fan, side lanes, burst, cross, spiral, fan, with a shorter recovery and more hatchling waves. |
| Destroyed | Its hatchlings go down with it; it sinks back into the canyon. |

**Arena.** The scroll eases to a stop (`arena.decelStart`, `decelDuration`) over the emergence canyon; the boss sways and
surges within `arena.sway` and `arena.surge`.

**Model.** The user's Tripo GLB itself (`art/source/bosses/cradle-tripo-original.glb`), adapted by
`tools/blender/boss_cradle.py`, which runs inside Blender through the Blender MCP. The user rejected two hand-built
rebuilds (24 October: "keep to the glb you have which is fully detailed. start fresh"). The mesh, UVs and painted atlases
are kept; nothing is regenerated. Tripo split the mesh into arbitrary pieces, so each part is cut by shape:

- the egg by an ellipsoid round it (`cradle_heart` and its wreck);
- the six inner shields' upper parts by their sector round the nest above a cut height, keeping only painted bone and
  closing thin cracks (`cradle_heart_shutter_0` to `cradle_heart_shutter_5`, hinged on the cut line);
- the brood sacs are the flesh bulges at the front flanks (`cradle_pod_left`, `cradle_pod_right` and their wrecks);
- everything else is `cradle_hull`, with faceted rock hanging under the five outer shields so the wings read as
  floating rock (the user: they "extend below to look like floating rocks");
- `cradle_flight_pod` is the hatchling drone; `cradle_approved_v2` is an empty marker node (a real identifier the view
  looks for).

It is exported at 70% of the reference placement (user, 24 October: "the model seems pretty big no?"), and the canyon is
fitted to its footprint and sway. It stays under the adapted bosses' triangle cap (docs/08, 24 October); how the boss
models are built is [art/bosses](../art/bosses/README.md).

## 6. Music

*Something Beneath the Skin*, 92 BPM (`THEMES.amnion` in `src/audio/score.ts`): Phrygian and uneasy, with breathing
formants, nerve tones, an organic bass, irregular paired heartbeats that land like a kick, dry bone clicks, and creatures
clicking far off in a reverberant hall (user, 11 November: "like alien noises in the night"). In THE CRADLE's fight the
heartbeat races unevenly in overload. Details: [docs/24](24-sound-design.md).

## 7. Endless

Amnion's stint follows Nacre's in the endless cycle ([docs/18](18-endless-planet-cycle.md)). Its stages are staged from
Brood Strike's arc as every late world's are (`lateStages` in `src/content/encounter-deck.ts`): the opening flies the
arc's first stretch with its strike site, the pressure stage its middle and climax with no site, and later visits the
climax arc with a site between its halves. Its world missions are in [docs/35 §3](35-missions.md#3-the-missions).

## 8. Tests

- `tests/sim/amnion.test.ts`: Brood Strike follows Deep Bloom and opens Dying Star, over Amnion, against THE CRADLE.
- `tests/world/terrain-amnion.test.ts`: the tusks stay 0.4 under the flight plane and everything else under the scenery
  cap.
- `tests/world/phase-predator-assets.test.ts`: the brood heavy's GLB holds only its own hierarchy, within its triangle and
  size budget.
- `tests/browser/faction-regressions.spec.ts`: THE CRADLE's view and pods never linger after another boss; the brood heavy
  loads and renders on both quality tiers.
- The fairness suites (`tests/sim/fairness-campaign.test.ts`, `fairness-endless-early.test.ts`,
  `fairness-endless-late.test.ts`) fly Brood Strike at every difficulty and Amnion's endless stints.

## Open

- Amnion's enemies other than the Diamond still fly Nacre's craft, and its egg sacs are the shared fuel skid; the brood
  kit has no bone bridges.
- The warning telegraphs (brackets, lanes) are the shared warm colours; their readability over the yolk in play is
  unverified.
