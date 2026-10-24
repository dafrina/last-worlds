# Umbra · Eternal Eclipse

Design v0.1 · 24 October 2026. The user supplied two concept sheets (`art/concepts/umbra/`): "UMBRA, FINAL PLANET" (world, terrain panels, infrastructure, modular elements) and "FINAL PLANET / FACTION / BOSS CONCEPT" (world, the Umbral fleet's ship classes, the final boss THE ECLIPSE). The names on the sheets are used: planet **Umbra**, boss **THE ECLIPSE**. The mission is **Final Horizon**, from the sheet's line "the final horizon"; the user may rename it.

The concept images are references, never runtime backgrounds or finished assets (AGENTS.md invariant 9).

## The user's direction (24 October)

- "i think i like the crevasces geometry of amnion for this, but everything above the main plane should be very pointy spikey mountains instead. should be much simpler as the canyons will have just spikey rokc cliffs etc."
- "top left is the art direction for the terrain, obsidian black shiney surfaces and floating cliffs etc vanishing into a purple glowy fog."
- "I like the infrastructures in these concepts too, and the alien ships too which should be deep black shiney and smooth surfaced."
- The boss: the user's Tripo GLB ("crescent winged spaceship"); "fix the one missing peak of one wing"; "the boss should be very large tho like a final boss".
- Reviews of the first ground passes:
  - "its all very rounded up tho, i want sharp edges and spikey mountains";
  - "theres a lot of jagegd edges too ... not sharp and pointy jagged but like steps";
  - "too triangular and the cliffs look too uniform";
  - "look how triangular and soft and steppy some parts look";
  - "also the cliffs look bad, can u remove the models there";
  - "now everything too flat and smooth, stay true to the concept please with cracks in the terrain, and i quite liked earliers version with the hills better than just spikes everywhere the spikes are too small and pointy, should more look like sharp rocks";
  - "also the infra models look kinda flat and bland";
  - "why is there rounding on the edges? i want it sharp. also, variate the hills more, its so many triangles which is also why it looks wrong. now add the cliff models back but sparsely";
  - "generally, it should be less spikey as a vibe and more cracked and sharp";
  - "looks pretty nice now but the triangular mountains still look off", "make them more irregular shapes";
  - "and rework the infrastructures, they should be stoney/sharp/clean not just smooth".

## Identity

- **Black glass under an eclipse.** No sun: a cold violet-white rim light, a violet sky fill and bounce, and the eclipse's corona in every glossy surface (the `void` reflection sky in `src/render/models.ts`).
- **Ground:**
  - one plateau of shattered obsidian plates, each its own tone and tilted a hair its own way, split by a crack network whose edges catch the light, and cracked by thin glowing violet faults in patches (the concept's "energy faults");
  - Amnion's jagged crevasses with their own seed, falling away into a glowing lavender fog. Cracked glass-slab cliffs line only scattered stretches of the lips, about a quarter of them;
  - hills: the kit's fractured obsidian massifs (`umb_hill`, eight forms), overlapping into ranges, each a few large exactly planar faces broken along cracks, with razor edges;
  - sharp obsidian rocks, and only now and then a needle spire at a canyon edge ("less spikey as a vibe and more cracked and sharp");
  - floating cliffs drifting in the fog.
- **The faction's structures:** monolith towers, eclipse gates, arc reactors, shield pylons, obelisks, landing pads, and now and then a crescent dock floating over a wide canyon.
- **The Umbral fleet:** deep black, glossy, smooth, blade-like ships with violet cores.
- **THE ECLIPSE:** a crescent carrier about 20 units from horn to horn, lying flat over an abyss with its horns away from the player.

## Readability rules

- **Hostile shots stay warm** (the shared `HOSTILE_WARM`): orange contrasts best with the violet world. Never violet or cyan: the faction's glow is violet and the player's shots are white-cyan.
- **Black on black:** ships and structures read by their glossy highlights, light bevel edges and violet cores. The terrain stays darker than everything that matters.
- **The glow comes from the terrain texture**, not from lights: the faults are the ground shader's vein lines, and the fog's faint glow is its pool term.
- **Terrain is scenery only**: everything stays under the flight plane (kit spires and structures up to 3.4, other pieces 3.0).

## How the mountains got here

1. **Concave cones** read as glossy, rounded blobs.
2. **Pyramids:**
   - flat-shaded, they showed the 0.25 grid's triangles and stepped ridges;
   - with each pyramid's height fixed once at its apex (never scaled point by point), every face is a true plane;
   - smooth-shaded, that reads as clean facets with a glossy highlight along each ridge.
3. **Kit peaks only** (a dense forest of blade peaks on a flat plateau): "too flat and smooth ... the spikes are too small and pointy".
4. **Faceted heightfield hills again, with rocks:** "why is there rounding on the edges? i want it sharp ... variate the hills more". A heightfield can't keep a ridge sharp.
5. **Now:** the hills are kit models (`umb_hill`), fractured massifs with exactly planar faces, so the ground under them is the flat plateau. The kit's sun glint (meant for small round shells) is turned down on Umbra: on large flat facets it lit whole faces white.

## Campaign place and pressure

- **Final Horizon is the final campaign mission,** after Brood Strike (`CAMPAIGN_ORDER`). Old saves stay valid.
- **Pressure is Brood Strike's:** `WORLD_INTENSITY.umbra` = Amnion's, `MISSION_CADENCE` 0.92. The final planet is not made harder before it has been played.
- **Playlist:** Brood Strike's proven grid with the fleet's mix:
  - interceptors (darts, needles) and heavy fighters (weavers);
  - defense turrets (batteries) and artillery mortars (missile batteries);
  - energy cells to break (depots);
  - drone carriers (diamonds) and elite hunters (lancers);
  - two artillery ships (Pulsars).
- **Hunters on Umbra:** lancers (the elite hunter class).
- **The perfect pilot** clears Final Horizon on seed 5 with each weapon and no hit (`tests/sim/umbra.test.ts`). On other seeds it takes a single mission hit on some runs, never from THE ECLIPSE; the fairness checks pass.

## THE ECLIPSE

- **Model:** the user's Tripo GLB, adapted in Blender (`tools/blender/approved_eclipse.py`, `public/assets/umbra/the-eclipse-v1-approved.glb`) like the other approved bosses, at most 80k triangles.
  - Its broken left horn tip is mended by mirroring the right one.
  - The GLB's front view is the concept's top view, so it lies flat, its reactor facing the camera and its plain back the hidden underside.
- **Size:** 78,907 triangles. It spans x ±10, 3.9 toward the player and 8.8 away from its pivot, 3.2 below it and 3.5 above. The surface was smoothed before reduction: Tripo's carved micro-cracks became notched highlights on the glossy black.
- **Rig:** THE VEIL's carrier rig (`ECLIPSE_STYLE` in `src/render/veil-view.ts`):
  - **the two energy vents** (the first pair of weak points) are the almond panels on the inner wings' fronts, at x ±5.15, hit radius 1.1. They are painted to glow;
  - **the core** is the luminous reactor. Its lens sits in the glowing ring (radius 1.2), under six armour sectors that roll outward 50° over their feet like an iris;
  - **drone waves** launch from the vents' inner ends (x ±3.4, s −0.8).
- **Target plane:** 1.7 over its seat. The reactor's visible face averages 1.8 and the vents' 1.45.
- **Reactor's centre:** the near spike hides it from the camera; its ring and lens show either side.
- **Fight:** THE CRADLE's timing and pressure (`src/content/eclipse.ts`).
- **Arena:** it rises out of a vast abyss across the whole world (`ABYSS` in `src/world/terrain-umbra.ts`) and hovers 1.2 over the plateau's level, its top under the flight plane. The horns run off both screen edges, so the camera pans along it.

## Files

- **Ground:** `src/world/terrain-umbra.ts`. The kit kinds are in `src/world/terrain-scatter.ts`.
- **Look:** `src/render/scene.ts` (`LOOKS.umbra`, `void` sky), `src/render/terrain-kit.ts` (glow, gloss, haze, wall look), `src/render/models.ts` (`createVoidEnvironment`).
- **Kit:** `tools/blender/umbra_kit.py` and the `umbra` branch of `tools/blender/cliff_kit.py` (`public/assets/umbra/umbra-kit.glb`, `cliff-kit.glb`; previews in `art/umbra-kit/`).
- **Fleet:** `tools/blender/umbra_craft.py` (`public/assets/umbra/umbra-craft.glb`).
- **Content:** `src/content/eclipse.ts`, `src/content/bosses.ts`, `src/content/encounters.ts` (`FINAL_HORIZON`).
- **Tests:** `tests/sim/umbra.test.ts` (campaign place, perfect pilot), `tests/world/terrain-umbra.test.ts` (caps, flat plateau), and the fairness table (`tests/sim/fairness.test.ts`).
- **Music:** a placeholder theme in `src/audio/score.ts` until Codex writes Umbra's own (requested in `COORDINATION.md`).

## Milestones

1. **Ground, light, mission and wiring:** done on 24 October, in review with the user.
2. **Kit (done):**
   - hills, sharp rocks, spires, shards and floating cliffs;
   - sparse cracked cliffs;
   - the structures as worked stone: crisp faceted tiers with block joints, glow slits and layered depth;
   - the crescent dock.
3. **The Umbral fleet:** done (`umbra-craft.glb`, seven ships). Each kind flies its own ship, and THE ECLIPSE's drones use the drone (`UMBRA_CRAFT` in `src/render/scene.ts`). The `umbra_obsidian` material class is glossy, roughness 0.12 and no metal.
4. **THE ECLIPSE:** done (`the-eclipse-v1-approved.glb`). It is in the boss asset test (rig, budget, rays).
5. **Music:** Codex.
6. **Endless:** Umbra joins the planet cycle later.
