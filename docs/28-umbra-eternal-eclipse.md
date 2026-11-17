# Umbra, the Eternal Eclipse

Umbra is the final world: the campaign's last mission, Final Horizon, the last world of the endless cycle, and the home
of the Wraith, the teleporting attacker. This doc covers its look, its world generator, its Blender kits, the Umbral
fleet and the Wraith, and THE ECLIPSE, the final boss. It follows the user's two sheets in `art/concepts/umbra/`
(references only): "UMBRA, FINAL PLANET" (world, terrain, infrastructure) and "FINAL PLANET / FACTION / BOSS CONCEPT"
(the fleet and THE ECLIPSE). The names are the sheets' (24 October): planet Umbra, boss THE ECLIPSE, and the mission
Final Horizon after the sheet's line "the final horizon".

## 1. Identity

- **Black glass under an eclipse.** No sun: a cold violet-white light from behind the ship to the left (`sunBehind` in
  `UMBRA`; user, 13 November: "umbra is interesting at 7:30"), a violet sky fill and bounce, and the eclipse's sky in
  every glossy surface (`createVoidEnvironment` in `src/render/models.ts`). The values are `LOOKS.umbra` in
  `src/render/scene.ts`.
- **Ground** (user, 24 October: "obsidian black shiney surfaces and floating cliffs etc vanishing into a purple glowy
  fog"):
  - one plateau of shattered obsidian plates, each its own tone, split by dark recessed seams whose bevelled edges catch
    the light as the view moves (a polished layer that fades in across the middle of the screen; no emissive lines on
    the plains, no glitter);
  - Amnion's jagged crevasses with their own seed ("i like the crevasces geometry of amnion for this"), falling away into
    a glowing lavender fog; their walls are one straight face from foot to lip with a hard corner at each end;
  - fractured obsidian massifs as hills, sharp rocks, now and then a needle spire at a canyon edge ("less spikey as a
    vibe and more cracked and sharp"), and floating cliffs drifting in the fog.
- **The faction's structures** on supported plateau: monolith towers, shield pylons, eclipse gates, arc reactors,
  obelisks, landing pads and crescent docks, worked as crisp faceted stone ("stoney/sharp/clean not just smooth").
- **The Umbral fleet:** deep black, glossy, smooth, blade-like ships with violet cores (user: "deep black shiney and smooth
  surfaced").
- **Faction paint:** obsidian black to a cold violet sheen, violet glow (`WORLD_PAINT.umbra` in
  `src/render/world-paint.ts`).

Readability rules:

- **Hostile shots stay warm** (`HOSTILE_WARM` in `src/render/shot-colors.ts`): coral contrasts best with the violet world.
  Never violet (the faction's glow) or cyan (the player's shots).
- **Black on black:** ships and structures read by their glossy highlights, light bevel edges and violet cores; the
  terrain stays darker than everything that matters.
- **The glow comes from the terrain texture:** the fog's faint glow is the ground shader's pool term, not a light.
- **Terrain is scenery only:** everything stays under the flight plane (§4).

## 2. Final Horizon and the Umbral fleet

### Mission

Final Horizon (`final-horizon`) is campaign mission 8, after Silent Empire (`CAMPAIGN_ORDER`). Its arc is `UMBRAL_ARC`
and `FINAL_HORIZON_SORTIE` in `src/content/encounter-deck.ts` (Final Horizon's arc with a Skimmer pair and a Relic Shield
in two slots since Nahara joined, so its draws may fly Nahara's waves):

1. an introduction: a heavy-fighter line, an interceptor arrowhead, defense turrets on the obsidian;
2. the Wraith's first contact ("WRAITH · WATCH ITS ARRIVAL POINT"), artillery mortars, a Skimmer pair, energy cells, a
   Needle line and a drone carrier;
3. a strike-site place in the recovery, then the glass plains (the sortie stretch) with a Relic Shield;
4. the second pressure block: the artillery ship (a Pulsar), the Wraith's return and an elite hunter pair;
5. the climax ("THE FLEET CLOSES IN"): drone-carrier convoys, mortars, a second artillery ship, a third Wraith and the
   last squadron;
6. relief, then THE ECLIPSE rises out of the abyss.

Pressure comes from `WORLD_INTENSITY.umbra` (the hardest world in the late-world curve, 10 November),
`MISSION_CADENCE['final-horizon']` and `MISSION_PRESSURE['final-horizon']` (the campaign's late-mission pressure, 13
November; [docs/40](40-balance-measurement.md)). The shield cells are `ECLIPSE.shieldSupplies`.

### The fleet

Umbra flies the whole late roster: darts, weavers, turret and missile batteries, Needles, Lancers, Diamonds, Pulsars,
Skimmers, Relic Shields, fuel targets and the Wraith (`authoredKinds('umbra')`). The messages give them the fleet's
names: interceptors, heavy fighters, defense turrets, artillery mortars, energy cells, drone carriers, elite hunters and
artillery ships. Their behaviour is their kinds' ([docs/03 §2](03-worlds-and-generation.md#2-enemy-catalog)); the Skimmer
and the Relic Shield are Nahara's ([docs/39](39-nahara-silent-empire.md)).

- **Models** (`UMBRA_CRAFT` in `src/render/scene.ts`, `public/assets/umbra/umbra-craft.glb`): the interceptor flies darts,
  Needles and Skimmers; the heavy fighter weavers; the elite hunter Lancers; the drone carrier Diamonds and Relic Shields;
  the artillery ship Pulsars; the defense turret both batteries; the drone THE ECLIPSE's drone waves. The Wraith has its
  own model (§3). The craft's `umbra_obsidian` material is glossy glass, not metal.
- **Aces** are Wraiths under a violet shield (`HUNTERS.kinds.umbra`).

## 3. The Wraith

The Wraith is the phase predator (user, 25 October): pitch-black, smooth, alien and spiky, it shows its aim, teleports,
and fires a fast, precise three-round burst shortly after arriving. It belongs to Umbra, the final world, and also flies
on Corona and Nahara in their own models. Its numbers are `WRAITH` in `src/content/wraith.ts` and `ENEMIES.wraith` in
`src/content/balance.ts`; its behaviour is `updateWraith` in `src/sim/wraith.ts`.

**The attack.**

1. The warning (`ENEMIES.wraith.warning`, longer on Relaxed, never under `FAIRNESS.warningFloor`) starts at its old
   position with an aim line. The aim leads the ship's lateral movement by at most `WRAITH.leadLimit`, then commits.
2. In the warning's last `teleport + afterArrival` seconds it crosses to the planned destination in a `WRAITH.teleport`
   warp, and fires `WRAITH.afterArrival` seconds after it materialises.
3. Three rounds (`WRAITH.rounds`), `WRAITH.interval` apart, no spread, at `ENEMIES.wraith.shotSpeed` times the usual
   difficulty, world and pace scales. Rounds do not track once fired.
4. The next attack may start `WRAITH.cooldown` active seconds after the last round. A normal Wraith leaves after
   `WRAITH.normalAttacks` attacks; an ace repeats until it is shot down.

Its timing runs in real active seconds and is never quickened by the world's or difficulty's cadence; only its first
attack follows the earlier first windups (`WRAITH.firstAttack` times the difficulty's and world's factors). Pausing
freezes it.

**Fairness.** The destination alternates sides of the current camera slice (`WRAITH.side` from its centre, at `WRAITH.row`
or a row either side), stays away from the player row and keeps the airspace separation from other craft. The director
admits the attack only after testing the planned destination and all three delayed rounds (`admitAttack`). A destination
that is off the view or occupied at the moment of the jump cancels the attempt. A resting ace left behind by a camera pan
quietly returns before its next feint, and an ace waits while another ace winds up. The whole triplet waits if the
projectile pool cannot hold all three rounds; rounds still pending die with their Wraith. It can be shot during the feint
and the cooldown; only the transit is intangible.

**In the arcs.** `wraith-solo` flies in its own slots and, like the Pulsar, is never drawn by the deck (`SCARCE` in
`src/content/encounter-deck.ts`): three times in Final Horizon and Dying Star, twice in Silent Empire. The Wraith is
Corona's, Nahara's and Umbra's ace (`HUNTERS.kinds`); an ace's shield takes main-weapon Seeker missiles at a fraction of
their damage (`HUNTERS.shield.seekerDamage`; [docs/02 §2](02-combat-and-progression.md#2-main-weapons)).

**Model and presentation.** On Umbra the Wraith flies `public/assets/umbra/wraith.glb` (root `umbra_wraith`), built by
`tools/blender/craft_wraith.py` through the Blender MCP in an isolated scene (it reuses the mesh helpers of
`craft_brood_heavy.py`): a large swept-wing black and violet fighter after the user's reference, with a spear nose,
scalloped wings, raised engine shoulders, dorsal fins and recessed violet filaments. It keeps its own materials and draws
as one instanced batch (`ensurePredator` in `src/render/scene.ts`). On Corona it is the fleet's crescent-scythed
`corona_wraith`; on Nahara the Sunspike. The teleport is render-only: the model collapses at its departure point and
unfolds at its arrival, never sliding across the gap, over small dark discs with a coloured rim (`phaseHoles`: violet on
Umbra, orange on Corona, teal on Nahara). An ace's shield shell hides during the transit.

## 4. World generation

The profile is `UMBRA` in `src/world/terrain-umbra.ts`: one mood (`eclipse`), no sea, no settlements and no networks.
Corona and Nahara build their profiles on it.

- **One plateau** (`UMBRA_PLATEAU`) of glass plates, with no tiers, hollows or strata ("much simpler" than Amnion).
- **Crevasses** from Amnion's generator with Umbra's own seed (`crevasse` from `src/world/terrain-amnion.ts`), their floor
  (`FLOOR`) deep in the fog.
- **Hills** are kit pieces, not heightfield: overlapping fractured obsidian massifs (`umbHill`) in their own regions, a few
  large, exactly planar faces each, with sharp rocks (`umbPeak`) among them. The ground under them stays the flat
  plateau. Heightfield cones, pyramids and peaks were all tried first and read rounded, stepped or "too flat and smooth"
  (24 October).
- **Scenery caps:** `UMBRA_SCENERY_MAX` for everything, `UMBRA_SPIRE_MAX` for the tall pieces (hills, peaks, spires and
  structures), 0.4 under the flight plane as Amnion's tusks.
- **Dressing** (`umbraScatterSteps`):
  - the structures on a sparse lattice of open plateau, a landing pad or two beside each; every footprint is checked
    across its edges and interior (`footprintBase`), so canyon crossings and uneven sites are rejected; the crescent dock
    is buried to its lower deck;
  - floating cliffs (`umbFloat`) over the wider crevasses, at and below the plateau's level; only rock floats;
  - lone needle spires at canyon edges and shard clutter on the plateau;
  - fractured obsidian walls (`voidWall`) along broken stretches of the lips (`cliffWallSteps`), their feet reaching well
    below the floor so no cut shows through the fog.
- **Ground look** (`src/render/terrain-kit.ts`): a satin obsidian sheen mirroring the eclipse sky; per-facet wall shading
  (`wallFacets`); the crack map's polished bevel layer (`crackRelief`); a violet height haze that turns opaque in the
  deep abyss, which the kit walls share (`hazeAbyss`). The kit's sun glint is turned down on Umbra: on large flat facets
  it lit whole faces white.
- **Boss arena:** a vast abyss across the whole world (`ABYSS`), fitted to THE ECLIPSE's footprint, its serrated lips
  lined with the kit's walls.

## 5. Blender assets

| File | Builder | Contents |
| --- | --- | --- |
| `public/assets/umbra/umbra-kit.glb` | `kit_umbra.py` | Hills (eight forms), peaks, spires, shards, floating cliffs, and the structures: monolith towers, a shield pylon, an eclipse gate, an arc reactor, obelisks, pads and the crescent dock (`UmbraKitKind` in `src/world/scenery-kit.ts`). Materials `umbra_obsidian` and `umbra_alloy` (glossy; vertex alpha marks gloss) and `umbra_glow`. |
| `public/assets/umbra/floating-shards.glb` | `kit_floating_shards.py` | Broad cleaved undersides for the three floating cliffs, replacing the kit's hanging needles after both load (`loadUmbraKit`). |
| `public/assets/umbra/cliff-kit.glb` | `kit_cliffs_umbra.py` | Four fractured wall sections: large oblique facets, razor lips, dark cleavage seams. Built through the Blender MCP in an isolated scene. |
| `public/assets/umbra/umbra-craft.glb` | `craft_umbra.py` | The Umbral fleet: `umbra_interceptor`, `umbra_fighter`, `umbra_hunter`, `umbra_carrier`, `umbra_artillery`, `umbra_turret`, `umbra_drone`. |
| `public/assets/umbra/wraith.glb` | `craft_wraith.py` | The Wraith (§3). |
| `public/assets/umbra/the-eclipse.glb` | `boss_eclipse.py` | THE ECLIPSE (§6). |

The obsidian shape rule (user, 24 October: "i want sharp edges and spikey mountains", then "not sharp and pointy jagged
but like steps"): every natural form is a knife-edged shard, its cutting edges a narrow lighter bevel facet, with no flat
caps or ledges. Umbra builds no facility plants; its structures are kit pieces.

## 6. THE ECLIPSE

The final boss: a crescent carrier about 20 units from horn to horn, lying flat over the abyss with its horns away from
the player (user: "the boss should be very large tho like a final boss"). Its numbers are `ECLIPSE` in
`src/content/eclipse.ts`, its definition `ECLIPSE_BOSS` (`BOSSES.eclipse`) in `src/content/bosses.ts`, its view
`ECLIPSE_STYLE` in `src/render/carrier-view.ts`. It follows the shared boss rules
([docs/03 §3](03-worlds-and-generation.md#3-bosses)). THE HELIOPHAGE fights THE ECLIPSE's fight on its own model and
targets ([docs/37](37-corona-dying-star.md)); THE CITADEL builds on it with its own moves
([docs/39](39-nahara-silent-empire.md)).

**Targets.** Three energy vents form its first phase: the almond panels on the inner wings' fronts (`ventOffset`, `ventS`,
`ventRadius`) and the prow vent on the hull's front face under the reactor (`prowS`, `prowRadius`; user, 31 October: "can
you add a third target on the eclipse (umbra boss) that we have to destroy for phase 1?"). All three take `ventHp`; the
reactor opens only once all three are broken (`phaseOneParts`). The core is the luminous reactor in its glowing ring
(`reactorS`, `reactorRadius`, `reactorHp`), under six armour sectors that roll outward 50° over their feet like an iris
(`ECLIPSE_STYLE.shutterOpen`). Every target sits on one target plane (`targetHeight`), at its visible face projected onto
that plane along the camera's view. The crescent, horns and spikes are scenery.

| Phase | Attacks |
| --- | --- |
| Arrival (`arrivalDuration`) | Rises straight out of the abyss at its row and hovers over it (`ECLIPSE_STYLE.hover`), its top under the flight plane. The horns run off both screen edges, so the camera pans along it. |
| Vents | Aimed bursts (`ventBurst`) from the three vents, one attacker at a time; the prow vent's burst is forecast from its own offset. |
| Reactor | `coreMoves`: a spiral, an aimed burst (`reactorBurst`), a Boomerang Barrage and a fixed fan (`reactorFan`); drone waves from the inner ends of the wing vents (`bays`, `launches`). |
| Overload | `overloadMoves`: core lane, spiral, a five-wall Fracture Wave, side lanes, a Boomerang Barrage, cross, spiral, fan. |
| Destroyed | Its drones go down with it; it sinks into the abyss. |

The Fracture Wave and the Boomerang Barrage are Nahara's attacks
([docs/39 §3](39-nahara-silent-empire.md#3-enemies-and-attacks)); they joined THE ECLIPSE's fight when Nahara arrived. Its
campaign health includes `MISSION_PRESSURE['final-horizon'].bossHp`.

**Model.** The user's Tripo GLB (`art/source/bosses/eclipse-tripo-original.glb`), adapted headless by
`tools/blender/boss_eclipse.py`. The mesh, UVs and painted atlases are kept and reduced:

- it is laid flat (the GLB's front view is the concept's top view), the reactor facing the camera and the plain back as
  the hidden underside;
- its broken left horn tip is mended by mirroring the right one (user: "fix the one missing peak of one wing");
- the surface is smoothed before the reduction, so Tripo's carved micro-cracks do not turn into notched highlights on
  the glossy black;
- the prow vent is the model's only hand-built part: a shallow almond lens conformed to the hull's front face, in the
  vents' violet with their glow along its middle, in a faceted obsidian frame whose skirt sinks into the face (the build
  checks `frame_gap`); it paints its own texels in a free square of the atlas, so the boss keeps one material;
- nodes `eclipse_hull`, `eclipse_pod_left` and `eclipse_pod_right` (the wing vents), `eclipse_prow`, `eclipse_heart`
  (the reactor), `eclipse_heart_shutter_0` to `eclipse_heart_shutter_5`, a crumpled wreck of each target, and
  `eclipse_approved_v1`, an empty marker node (a real identifier the view looks for).

It stays under the adapted bosses' 80,000-triangle cap (docs/08, 24 October); the prow vent's triangles are reserved
before the reduction. How the boss models are built is [art/bosses](../art/bosses/README.md).

## 7. Music

*Where the Light Goes Backwards*, 84 BPM on F# (`THEMES.umbra` in `src/audio/score.ts`; user, 10 November: "very ominous
too, with reversed instruments and alien harmonics"): chords a semitone, a tritone and a semitone apart, each carrying one
harmonic-series tone off the twelve-note grid; inhaled chords and reversed glass, synthesized with backwards envelopes,
that stop dead on the grid; a dark inharmonic obsidian bell; a precise void pulse. The user loves it ("i love love love
the umbra sound"), so its score is pinned by a test (`tests/audio/boss-music.test.ts`) and it keeps its own kick. The boss
stem keeps a precise half-time pulse with void ticks, inhaled chords on its changes, and in overload reversed glass
sucking into every beat. Details: [docs/24](24-sound-design.md).

## 8. Endless

Umbra is the last world of each endless lap, after Nahara, before the cycle starts again from Khepri
([docs/18](18-endless-planet-cycle.md)). Its stages are staged from Final Horizon's arc (`lateStages`), the opening with its
strike site, the pressure stage without one, and later visits the climax arc with a site between its halves. Its world
missions, the Wraith missions among them, are in [docs/35 §3](35-missions.md#3-the-missions).

## 9. Tests

- `tests/sim/umbra.test.ts`: Final Horizon is the final mission; only the three bosses on THE ECLIPSE's fight have a prow
  target; the reactor opens only after all three vents; the vents' rotation and the prow vent's forecast; the perfect
  pilot clears it with Twin Pulse and Fan on Standard and Seeker on Veteran without a hit.
- `tests/sim/wraith.test.ts`: the Wraith's warning, alternating sides, complete triplets and exit after two attacks; aces
  at both map edges; intangible only in transit, each delayed round forecast; no partial triplet when the pool is full;
  Seeker resistance on ace shields, by the weapon that fired.
- `tests/world/terrain-umbra.test.ts`: walls prefetched without fallbacks at top speed; every structure on solid plateau;
  the scenery caps; plates over canyons deep in the fog.
- `tests/world/umbra-cliffs-assets.test.ts`: the four wall variants, the floating-shard nodes, the walls' fog.
- `tests/world/cinematic-assets.test.ts`: THE ECLIPSE's rig, budget and target rays, the prow vent included.
- `tests/world/phase-predator-assets.test.ts`: the Wraith's GLB holds only its own hierarchy, within budget.
- `tests/browser/umbra-terrain.spec.ts`: the cliff kit and the supported crescent docks on both quality tiers.
- `tests/browser/faction-regressions.spec.ts`: the Wraith loads, renders and teleports on both quality tiers (with the
  development fixture `tests/fixtures/phase-predators.html?planet=umbra`).
- `tests/sim/eclipse-report.test.ts`: the fight's seed sweep, off by default (`ECLIPSE_REPORT=<file>`).
- The fairness suites fly Final Horizon at every difficulty and Umbra's endless stints.

## Open

- No phone test of the Wraith's teleport or the polished crack layer.
