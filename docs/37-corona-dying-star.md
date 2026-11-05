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
- Second site: first the **Solar Collector Array**, then the sites' designs settled (5 November): the legged plasma rig is the Star Extractor ("The one we worked on should be star extractor"), and the captured star between two arms is the **Star Cage** ("rename this something else, doesnt look like a star extractor anyways"). The concept's flare hangar is the ordinary airfield, also offered on Corona, with only its colours adjusted ("no new model tho").
- Boss: "reuse the eclipse boss, no recolor or anything and same gameplay we will replace the boss later". Then: "no need for a special lava only lake for the boss, he will float anyway".
- Endless: "i thought every level will be used in succession in endless". Endless now flies every world in campaign order after the Luna warm-up ("no no warm up is fine"): Khepri, Vesper, Nacre, Amnion, Corona, Umbra, then again from Khepri.
- Reviews of the first ground passes:
  - "really try to nail the terrain formations too, as in the concept. The colors are off too";
  - "the relief is fine, but it isnt as sharp as in the concept. Also, make the terrain height vary more, like khepri with much more difference in height and variation";
  - "the terrain is also too dark compared to the coincept".

- Second review (5 November, evening):
  - "The core of heliophage should point more down ... by maybe 10 degrees", then "The core should kinda point more downwards, as if its a extractor": the core (sphere, cage and hood) turns its front 30° toward the player, aiming at the ground ahead like a nozzle, and bends into the hull (`tilt_core`; 10° did not show from the game camera). The core target moved with it (`reactorS` −0.6).
  - "i dont like to have just a sea of lava or just a plan rock screen. It should always have both ... have the terrain meander between the lava seas": winding bands of rock and plasma alternate about every 14 units, snaking and pinching into necks and islands. Screens nearly all plasma or all rock fell from 20% to under 3% (12 × 24 screens, eight seeds).
  - "we need way more of those plasma flares": an arc every 5 units instead of one in 26, turned to face the camera (edge-on loops read as streaks), thicker.
  - "The darker spots should be a bit deeper dark but keeping the contrast high": a lower floor, wider dark veins and cool crusts.
  - "the lava needs some kind of misty partial fog", then "the smoke ... looks like its everywhere, like a plane ... as if we faking volumetric clouds" and "You can make them really thick at points": banks of smoke (`src/render/corona-haze.ts`), six stacked slices of one density field, each higher slice showing only the denser core, so the banks dome up and the slices parallax. Warm low, lit grey on top. About a third of the plasma is under some smoke and about 10% under every slice (thick). The plasma is HDR-bright, so only stacked slices darken it visibly.
  - "lower the lava level, the cliffs look so miniscule ... there should also be twice maybe even 3 times this height": the plasma lies 5 under the plateau (2.4 before), and the land steps from 1.8 over it up to 9. Coast cliffs (eight seeds) measure p10 2.6, median 5.1 and p90 7.7, against 2.0, 2.6 and 4.5 before. Corona's site foundations reach 9.6 (`siteDropMax`), so a site at a coast stands on foundations down to the plasma.

## Identity

- **Gold plasma, not lava.** The sea at −6.8 (`CORONA_SEA_LEVEL`, 5 under the plateau) is Vesper's water material in a plasma mode (`src/render/water.ts`). It is emissive:
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
  - **Enemy fire and ace shields:** Amnion's warm red (`HOSTILE_BLOOD`, `PLANET_GLOW.corona`). Salmon vanished into the gold; magenta was tried first (user: "warm red not magenta").
  - **Ground batteries over the plasma:** they ride black basalt rafts that leave no foam, instead of Vesper's white pontoons.

## Content

- **Fleet:** Umbra's fleet and the Wraith (`hunters.ts` kind `wraith`), drawn with Umbra's models until stage 2.
- **Encounters:** the encounter deck flies Umbra's pools (`DECK_POOLS.corona`). The mission's arc is Final Horizon's, re-identified (`c-` slots). Its seeded rolls are its own, keyed by template id.
- **World intensity:** flight 1.1, shot 1.1, cadence 0.5. The mission cadence is 0.92 and credits scale by 0.55.
- **Boss:** THE HELIOPHAGE, the user's Tripo GLB adapted like THE ECLIPSE (`tools/blender/approved_heliophage.py` → `public/assets/corona/the-heliophage-v1-approved.glb`; source `art/source/approved-bosses/heliophage-tripo-original.glb`):
  - **Placement:** laid flat, its concept view to the camera, spires away from the player, claws toward them. It is 16 units wide (user: "Make it 16 units wide, the eclipse is the final boss"), with the depth squashed to 0.35 so it hovers between the plateau and the flight plane (`HELIOPHAGE_STYLE.hover` 2.6).
  - **Surface:** the mesh, UVs and atlases are kept and reduced to 77k triangles, with an emission mask from the painted glow.
  - **Targets** (`src/content/heliophage.ts`): the two armoured blocks' vent grilles (x ±5.0), the central tower's glowing column (the third first-phase target, s 4.7) and the caged molten core.
  - **Fight:** THE ECLIPSE's timing and patterns.
  - **Arena:** it floats over the world's own ground; the arena only levels the mesas and tall dressing.
- **Sites:**
  - the **Star Extractor**, a parts site;
  - the **Star Cage**, a shield site;
  - the crash site and the airfield, also offered here.

  Models: `tools/blender/strike_sites.py`. The Corona finishes are ancient machinery (user, 5 November: "they look like toys now. refine them, alien and ancient looking, and also mechanical"): carved stone with glyph grooves, monolith posts, ring gears, ribbed pumps and pistons, dark iron and oxidised bronze, texture-baked with `boss_remodel.STYLES['corona']` (plates, ash, soot, worn bronze edges). The airfield's Corona finish is a recolour plus that bake.
- **Where sites stand** (user: "cant they generate on the rocks?", then "they can sit in lava just not exclusively"): the rock near the side routes keeps to the lowest tiers, so a site takes an island in reach. About two thirds stand on rock (gentler tiers and no mesas by the side routes; no trench: "lots of these corridors"); the rest float on decks in the plasma (`tests/sim/site-seats.test.ts`, `CORONA_ON_ROCK`).
- **World missions:** twelve, 625 coins and 5 parts, as Brood Strike's and Final Horizon's (`src/content/world-missions.ts`).
- **Endless:** Corona's stages are staged from Dying Star's arc as Nacre's are from Deep Bloom's (`lateStages`). The pressure stage holds no strike site, as Nacre's, Amnion's and Umbra's don't.

## Stages

1. **Playable world (done, 5 November):** types, campaign and endless, terrain and look, plasma, arcs, the placeholder boss, deck, sites, missions.
2. **Blender models:** the six craft (mapped to Umbra's kinds, the Wraith slot included), the infrastructure kit, the Star Extractor and the Star Cage, and the airfield's Corona recolour.
3. **Validation:**
   - measure the site-seat spread (`tests/sim/site-seats.test.ts`, provisional);
   - measure the longer endless lap;
   - pass the release gate;
   - deploy.

The phone check stays open until it is done on hardware.
