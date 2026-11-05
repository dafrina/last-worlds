# Corona · The Dying Star

Design v0.1 · 5 November 2026. The user supplied three concept sheets (`art/concepts/corona/`):
- the world (`01-world.webp`);
- the infrastructure kit, six modules (`02-infrastructure.webp`);
- the craft, six ships (`03-craft.webp`).

The planet is **Corona** and the boss is **THE HELIOPHAGE**. The mission is **Dying Star**.

The concept images are references, never runtime backgrounds or finished assets (AGENTS.md invariant 9).

## The user's direction (5 November)

- "CORONA — The Dying Star. A world so close to its star that its surface is being torn apart. Not ordinary lava: vast oceans of radiant plasma, black magnetic structures rising out of the light, and colossal glowing arcs crossing between the islands. The entire environment feels overwhelming, as though you're flying through the outer layers of a star. Boss: THE HELIOPHAGE."
- "also make some models for the ships and infrastructure as well as 2 special side route sites, one should be a star extractor facility"; "it should have the same ships as umbra, with wraith".
- Campaign: the sixth mission, between Brood Strike (Amnion) and Final Horizon (Umbra). Also flown in endless.
- Second site: the **Solar Collector Array**. The concept's flare hangar is the ordinary airfield, also offered on Corona, with only its colours adjusted ("no new model tho").
- Boss: "reuse the eclipse boss, no recolor or anything and same gameplay we will replace the boss later". Then: "no need for a special lava only lake for the boss, he will float anyway".
- Endless: "i thought every level will be used in succession in endless". Endless now flies every world in campaign order after the Luna warm-up ("no no warm up is fine"): Khepri, Vesper, Nacre, Amnion, Corona, Umbra, then again from Khepri.
- Reviews of the first ground passes:
  - "really try to nail the terrain formations too, as in the concept. The colors are off too";
  - "the relief is fine, but it isnt as sharp as in the concept. Also, make the terrain height vary more, like khepri with much more difference in height and variation";
  - "the terrain is also too dark compared to the coincept".

## Identity

- **Gold plasma, not lava.** The sea at −4.2 (`CORONA_SEA_LEVEL`, 2.4 under the plateau) is Vesper's water material in a plasma mode (`src/render/water.ts`). It is emissive:
  - slow domain-warped turbulence in three octaves;
  - dark swirling veins of cooler skin;
  - a fine web of white-hot filaments through the hottest pools;
  - a white-hot band where it licks the rock.

  It all rides the terrain frame and costs about a dozen noise lookups per pixel.
- **Black basalt islands in it** (`src/world/terrain-corona.ts`):
  - **Coastline:** about half the ground is plasma. A winding causeway runs along the central route, broken now and then by a plasma crossing, with sheer coasts.
  - **Tiers:** the land steps up Khepri-style tiers 1.1 apart, from just over the plasma to about four units higher, separated by sheer risers (`bench`).
  - **Mesas:** sheer mesas rise a tier or two over the land.
  - **Cliffs:** crisp cliff shading with hard rim creases and columnar faces (`cliffs: true`, `WALL_LOOK.corona`).
  - **Cracks:** glowing orange cracks run through the rock, densest toward the shore. They are the ground shader's vein lines; Umbra's recessed slab seams are off here.
- **Dressing (stand-in):** until Corona's own kit exists, Umbra's kit is used, its violet glow faces burning orange (`glowHue` in the kit shader). This covers:
  - fractured walls along coasts and tier faces;
  - jagged black spire clusters rising out of the plasma, more of them near the shores;
  - crags on the mesa rims, broken basalt blocks and shards;
  - now and then a faction structure on level rock.
- **The colossal arcs** (`src/render/corona-arcs.ts`): render-only loops of plasma, a white-hot core in a soft gold halo, with pulses running along them. They rise out of the sea and fall back into it.
  - **Placement:** seeded in the terrain frame, at most one per 26 units, both feet in open plasma.
  - **Height limit:** the apex stays at least 2.2 under the flight plane, so arcs never cover the ships, and shots skip the depth test anyway.
- **Light:**
  - a white-gold star high over the left;
  - neutral fill, with the plasma's orange in the bounce and in a heat haze that only reaches just above the sea;
  - lighter charcoal-brown basalt than Umbra's glass.
- **Readability:**
  - **Enemy fire:** hot magenta (`HOSTILE_FLARE`). Salmon vanished into the gold, and cyan is the player's.
  - **Ground batteries over the plasma:** they ride black basalt rafts that leave no foam, instead of Vesper's white pontoons.

## Content

- **Fleet:** Umbra's fleet and the Wraith (`hunters.ts` kind `wraith`), drawn with Umbra's models until stage 2.
- **Encounters:** the encounter deck flies Umbra's pools (`DECK_POOLS.corona`). The mission's arc is Final Horizon's, re-identified (`c-` slots). Its seeded rolls are its own, keyed by template id.
- **World intensity:** flight 1.1, shot 1.1, cadence 0.5. The mission cadence is 0.92 and credits scale by 0.55.
- **Boss:** THE HELIOPHAGE is THE ECLIPSE's definition and rig unchanged, renamed, with its own messages. The rig stands in by `CarrierStyle.stands`. It floats over the world's own ground; its arena only levels the mesas and tall dressing.
- **Sites:**
  - the **Star Extractor**, a parts site;
  - the **Solar Collector Array**, a shield site;
  - the crash site and the airfield, also offered here.

  Models: stage 2 (`tools/blender/`). The airfield's Corona finish is a recolour only.
- **World missions:** twelve, 625 coins and 5 parts, as Brood Strike's and Final Horizon's (`src/content/world-missions.ts`).
- **Endless:** Corona's stages are staged from Dying Star's arc as Nacre's are from Deep Bloom's (`lateStages`). The pressure stage holds no strike site, as Nacre's, Amnion's and Umbra's don't.

## Stages

1. **Playable world (done, 5 November):** types, campaign and endless, terrain and look, plasma, arcs, the placeholder boss, deck, sites, missions.
2. **Blender models:** the six craft (mapped to Umbra's kinds, the Wraith slot included), the infrastructure kit, the Star Extractor and the Solar Collector Array, and the airfield's Corona recolour.
3. **Validation:**
   - measure the site-seat spread (`tests/sim/site-seats.test.ts`, provisional);
   - measure the longer endless lap;
   - pass the release gate;
   - deploy.

The phone check stays open until it is done on hardware.
