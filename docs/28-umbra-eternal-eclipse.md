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
  - Amnion's jagged crevasses with their own seed, falling away into a glowing lavender fog. Fractured glass walls line broken stretches of the lips; the 25 October revision uses broader oblique faces, cleavage cracks and sharper shoulders over the heightfield edge;
  - **26 October, approved in the playground:** the underlying canyon itself also has a straight wall profile with hard foot/rim corners, including THE ECLIPSE's abyss. Exposed steep triangles use their own face normals instead of blending into the plateau. This removes the rounded lighting between the scattered wall models; flat ground and other planets keep their previous shading;
  - **Deeper wall feet:** the cliff kit continues four world units below its sampled foot, at least down to −10, keeping its top anchored. The follow-up at seed 8833 / distance 928 exposed a fog mismatch at the abyss-floor intersection: kit walls now share the ground's violet height fog, which becomes opaque below −8.2 in the deep abyss. Upper scenery and other planets retain their previous fog. No transparent layers or extra draw calls;
  - hills: the kit's fractured obsidian massifs (`umb_hill`, eight forms), overlapping into ranges, each a few large exactly planar faces broken along cracks, with razor edges;
  - sharp obsidian rocks, and only now and then a needle spire at a canyon edge ("less spikey as a vibe and more cracked and sharp");
  - floating cliffs drifting in the fog.
- **The faction's structures:** monolith towers, eclipse gates, arc reactors, shield pylons, obelisks, landing pads and crescent docks on supported plateau. Every rotated footprint is sampled across its edges and interior, including small satellite pads. Canyon crossings and uneven sites are rejected. The old dock's hanging spikes are buried to its lower deck. Only the rock fragments float in canyons.
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
- **Hunters on Umbra:** Wraiths (25 October), the new teleporting predator. Three authored normal Wraith appearances replace individual formations in Final Horizon; no terrain generation changes. See [phase predators](29-phase-predators.md) for its feint, teleport and rapid triplet sequence.
- **The perfect pilot** clears Final Horizon on seed 7 with each weapon and no hit (`tests/sim/umbra.test.ts`). On other seeds it takes a single mission hit on some runs; THE ECLIPSE hit it once in 864 runs since its prow vent (31 October, below). The fairness checks pass.

## THE ECLIPSE

- **Model:** the user's Tripo GLB, adapted in Blender (`tools/blender/approved_eclipse.py`, `public/assets/umbra/the-eclipse-v2-approved.glb`) like the other approved bosses, at most 80k triangles. v1 (no prow vent) stays beside it for rollback (`src/render/boss-assets.ts`).
  - Its broken left horn tip is mended by mirroring the right one.
  - The GLB's front view is the concept's top view, so it lies flat, its reactor facing the camera and its plain back the hidden underside.
- **Size:** 78,941 triangles (the prow vent's are reserved before the reduction). It spans x ±10, 3.9 toward the player and 8.8 away from its pivot, 3.2 below it and 3.5 above. The surface was smoothed before reduction: Tripo's carved micro-cracks became notched highlights on the glossy black.
- **Rig:** THE VEIL's carrier rig (`ECLIPSE_STYLE` in `src/render/veil-view.ts`):
  - **the three energy vents** are its first-phase targets:
    - the almond panels on the inner wings' fronts, at x ±5.15, hit radius 1.1, painted to glow;
    - **the prow vent** (31 October), see below;
  - **the core** is the luminous reactor. Its lens sits in the glowing ring (radius 1.2), under six armour sectors that roll outward 50° over their feet like an iris;
  - **drone waves** launch from the wing vents' inner ends (x ±3.4, s −0.8).
- **Target plane:** 1.7 over its seat. The reactor's visible face averages 1.8, the wing vents' 1.45 and the prow vent's 1.18.
- **Reactor's centre:** the near spike hides it from the camera; its ring and lens show either side.
- **Fight:** THE CRADLE's timing and pressure (`src/content/eclipse.ts`); its first phase ends only when all three vents are broken.

### The prow vent (31 October 2026)

The user: "can you add a third target on the eclipse (umbra boss) that we have to destroy for phase 1?"

- **Where:** on the hull's front face under the reactor, between the near spike's side hooks: an almond lens 2.9 wide, its face at heights 0.6–1.8, facing the 55° camera. The near spike's blade crosses its middle, as it crosses the reactor. Its visible face projects onto the target plane at x 0, s −2.1 (`prowS`), hit radius 0.95: 0.45 clear of the reactor's circle and far from the wing vents'.
- **Model:** the only hand-built part of the model (`approved_eclipse.py`, step 7), in the vents' language:
  - the lens is a shallow convex almond conformed to a fit of that face (rms 0.005), in the vents' violet with their glow along its middle;
  - a faceted obsidian frame with one violet seam on its crest joins the hull; its skirt sinks into the face, so nothing floats (checked by the build: `frame_gap`);
  - it paints its own texels in a free square of the atlas, so the boss keeps one material and its shader programs;
  - `eclipse_prow_wreck` is the lens collapsed into a dark, cracked plate inside the frame.
- **Rig:** `eclipse_prow` and its `_wreck` hang on their own socket (x 0, s −2.1). Its heat glow, hit flash, target ring and corner marks are the vents'. It is drawn in the shader warm-up with the rest of the boss.
- **Simulation:** a third first-phase target with its own explicit proxy, an optional `prow` part that only THE ECLIPSE defines (`BossPart`, `phaseOneParts` in `src/content/bosses.ts`). Every other boss keeps exactly its pair and core.
  - It fires the wing vents' aimed burst, in their rotation: one attacker at a time, under the director's fairness admission, its forecast from its own offset.
  - It is as tough as a wing vent (640, `ventHp`).
- **Balance** (`tests/sim/eclipse-report.test.ts`: the perfect pilot over Final Horizon, seeds 1–144, Twin Pulse, Fan and Seeker):

  | Difficulty | Phase 1 before → after | Fight before → after | Mission hits before → after | Fight hits before → after | Clears |
  | --- | --- | --- | --- | --- | --- |
  | Standard | 68.9 → 90.2 s (+31%) | 144.5 → 167.4 s (+16%) | 56 → 56 | 0 → 0 | 432/432 both |
  | Veteran | 84.1 → 104.1 s (+24%) | 173.9 → 194.1 s (+12%) | 78 → 79 | 0 → 1 | 432/432 both |

  - By weapon, phase 1 grows most with Twin Pulse at Standard (62.5 → 92.9 s, +49%) and least with the Fan (+19% at Standard, +24% at Veteran).
  - No hit in phase 1 in any run. The one fight hit falls in the reactor phase, which is unchanged.
  - Reactor-phase hits are sensitive to how phase 1 ends. Over seeds 1–72 (432 runs), trial prow vents (1–720 hp, at s −2.0) gave 1 to 9 such hits; tougher wing vents without a prow vent (760, 860 hp) gave 0 and 1.
- **Arena:** it rises out of a vast abyss across the whole world (`ABYSS` in `src/world/terrain-umbra.ts`) and hovers 1.2 over the plateau's level, its top under the flight plane. The horns run off both screen edges, so the camera pans along it.

## Files

- **Ground:** `src/world/terrain-umbra.ts`. The kit kinds are in `src/world/terrain-scatter.ts`.
- **Look:** `src/render/scene.ts` (`LOOKS.umbra`, `void` sky), `src/render/terrain-kit.ts` (glow, gloss, haze, wall look), `src/render/models.ts` (`createVoidEnvironment`).
- **Kit:** approved hills/structures remain in `tools/blender/umbra_kit.py` and `public/assets/umbra/umbra-kit.glb`. Active cliffs: `tools/blender/umbra_cliffs_v2.py`, `public/assets/umbra/cliff-kit-v2.glb`, authored/exported through live Blender MCP in an isolated scene. Four variants, 203–315 triangles each, 122,564 bytes total. The old `cliff-kit.glb` and its builder remain for rollback; change the Umbra filename in `src/render/terrain-view.ts`.
- **Floating rock undersides (26 October):** `tools/blender/umbra_floats_v2.py` / `public/assets/umbra/floating-shards-v2.glb` replaces only the three float nodes after both kits have loaded. Original flat fractured tops and placement retained; a few broad cleaved wedges replace the hanging needles. 75–99 triangles each, 30,992 bytes total. Authored through live Blender MCP in its own scene. Omit the optional floating-kit URL in `terrain-view.ts` to restore the original three models; no other kit geometry changes.
- **Fleet:** `tools/blender/umbra_craft.py` (`public/assets/umbra/umbra-craft.glb`).
- **Content:** `src/content/eclipse.ts`, `src/content/bosses.ts`, `src/content/encounters.ts` (`FINAL_HORIZON`).
- **Tests:**
  - `tests/sim/umbra.test.ts`: campaign place, the prow vent (parts, phase rule, rotation, forecast), perfect pilot;
  - `tests/world/terrain-umbra.test.ts`: caps, flat plateau;
  - the boss asset test (`tests/world/cinematic-assets.test.ts`), with the prow vent's rays;
  - the fairness table (`tests/sim/fairness.test.ts`);
  - the fight's seed sweep, off by default (`tests/sim/eclipse-report.test.ts`).
- **Music:** *A Line Through Silence*, 90 BPM: clean struck-glass needles, pure-tone air and a precise low pulse. Original 32-bar arrangement with a synchronized bass/rhythm boss layer; see [sound design](24-sound-design.md).

## Milestones

1. **Ground, light, mission and wiring:** done on 24 October, in review with the user.
2. **Kit (done):**
   - hills, sharp rocks, spires, shards and floating cliffs;
   - sparse cracked cliffs;
   - the structures as worked stone: crisp faceted tiers with block joints, glow slits and layered depth;
   - the crescent dock.
3. **The Umbral fleet:** done (`umbra-craft.glb`, seven ships). Each kind flies its own ship, and THE ECLIPSE's drones use the drone (`UMBRA_CRAFT` in `src/render/scene.ts`). The `umbra_obsidian` material class is glossy, roughness 0.12 and no metal.
4. **THE ECLIPSE:** done (`the-eclipse-v1-approved.glb`; v2 adds the prow vent, 31 October). It is in the boss asset test (rig, budget, rays).
5. **Music:** implemented 25 October, level and boss layers.
6. **Endless:** Umbra joins the planet cycle later.

## Plains crack revision · 27 October 2026

Umbra's plains have dark cut seams instead of emissive purple crack lines. A widened dark mask and faint matte rim keep the network readable without reflections. The crack texture's blue channel now stores a continuous bevel profile; its filtered gradient drives a separate polished reflection layer, leaving the ground's diffuse normals intact. Every main crack edge is eligible, with no random sparse highlight patches or time animation: the actual light and changing view vector determine where the reflection falls and how it travels along an edge while flying.

Polish fades in across the middle 50% of screen height, as requested. Mip filtering, pixel-sized slope sampling and normal-derivative roughness suppress subpixel glitter. The polished layer is low strength and non-emissive, without increasing bloom. Fine hairline cracks stay matte. Broad fault-line emission is disabled on Umbra; abyss/pool light, terrain shape and cliff meshes are unchanged. Other planets keep their original crack channels and materials without the polished layer.
