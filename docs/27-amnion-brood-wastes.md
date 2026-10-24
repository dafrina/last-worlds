# Amnion · Brood Wastes

Design v0.1 · 23 October 2026. The user approved the name **Amnion · Brood Wastes**, the mission **Brood Strike** and the boss **THE CRADLE**, after a concept of pale bone plateaus split by glowing flesh canyons, egg clutches, bone spires, ribbed nests and bone bridges ("biological wasteland and eggs and biological enemies and facilities"). Added the same day: "definitely also add mountains not only mesa canyons".

The concept image is a reference, never a runtime background or a finished asset (AGENTS.md invariant 9).

## Identity

- **Dry, hot and calcified.** Nacre is wet, cool and bioluminescent; Amnion is bone, chitin and yolk.
- **Ground:**
  - pale bone-crust plateaus cracked into plates, dimpled with egg hollows;
  - bone mountains with sharp ridged crests in their own regions;
  - deep sheer-walled canyons with dark flesh walls and floors and a glowing yolk river and pools along their middle.
- **Enemies look grown, not built:** wasp-like drones, spitters, brood heavies, egg sacs.
- **THE CRADLE:** a living nest-fortress carrying the brood.

## Readability rules (non-negotiable)

- **Hostile shots are hot red here**: `#ff1e1e` with a near-white core `#fff2ee`; muzzle flashes `#ff3a2e`.
  - The user asked for red on 23 October; the first pass was violet.
  - The white core and the bloom carry them over the dark flesh: checked over bone and over a canyon (`lookdev/review/amnion35.jpg`).
  - Never cyan: the player's own shots are white-cyan.
  - Code: `src/render/scene.ts`, `src/render/fx-particles.ts`.
- **The glow comes from the terrain texture, not from lights:**
  - the yolk is the ground shader's pool crackle with a low glow of its own (`poolGlow` 0.22);
  - bloom stays restrained, for phone performance.
- **The canyons and mountains never seal the flight:** terrain is far below the flight plane, so it is scenery only.
- **Open readability item:** the warning telegraphs (brackets, lanes) are still the shared warm colours. Check them over the yolk in play before release.

## Campaign place and pressure

- **Brood Strike is the final campaign mission,** after Deep Bloom (`CAMPAIGN_ORDER`). It opens once Deep Bloom is cleared, and old saves stay valid.
- **Pressure:** it starts at Deep Bloom's level (`WORLD_INTENSITY.amnion` = Nacre's, `MISSION_CADENCE` 0.92). It is not harder until it has been played.
- **Playlist:** authored on Deep Bloom's proven timing grid, with its own mix:
  - drone flights over the canyons;
  - nest spires (batteries) and spore mortars (missile batteries);
  - egg-sac depots to burst;
  - heavies in the climax;
  - only two Pulsars (a tracking stream is the hardest thing to read over the glow).
- **Hunters on Amnion:** Diamond-class heavies in the yolk glow (`#ffc23a`).

## Milestones

1. **Ground, light and mission (done, 23 October):**
   - `src/world/terrain-amnion.ts`;
   - the Amnion look in `LOOKS` and the per-planet ground glow (`terrain-kit.ts`: `glowColor`, `veinTint`, `poolTint`, `poolGlow`, flesh `WALL_LOOK`, bone-crust cracks);
   - violet hostile shots;
   - THE CRADLE's content (`src/content/cradle.ts`) and the Brood Strike playlist;
   - menu, campaign order and playground.
   - **Stand-ins, openly marked:** Nacre's organic craft for the enemies and Nacre's arrangement a minor third lower as the music (Codex writes the real theme). THE VEIL's model stood in for THE CRADLE until 24 October.
2. **Brood kit in Blender (in progress, `tools/blender/amnion_kit.py`):**
   - **Done:**
     - flesh canyon walls;
     - egg heaps;
     - great tusks;
     - brood nests and tusk groves (Amnion's buildings);
     - goo webs across the crevasses.
   - **Still to do:**
     - torn-bone bridges over the crevasses (the concept's perforated spans);
     - egg-sac depots for the fuel role.
   - **Shape rules after the 23 October review** ("too small and way too comic like", "make them closer to the concept", "tears in the spikes base, like tearing apart by spreading it like a dough"):
     - **Torn webbing:** tusks grow out of a membrane torn with real oval holes, packed big then small and stretched along the spread. It is built with Blender's triangle fill, so the holes cost a few hundred triangles, never a subdivided grid. The rims curl under, and they are dark flesh.
     - **Nests:** a torn bone bowl round a glowing pool. Four or five tusks of very different size and lean rise from the bowl at irregular gaps. Never a symmetric ring of spikes; the ring round a glowing core was rejected as "way too uniform".
     - **Eggs:** heaped as in the concept. Big eggs form the core, smaller ones stack on and between them, and tiny ones fill the gaps. Only one in six glows.
     - **Eggs on landmarks:** they are separate pieces. The landmark is stretched tall, and its eggs must stay round.
     - **Pearl shells** ("this perlescent color with shine"):
       - the body is pale nacre, turning to pastel pink, lilac, teal and gold toward the rim;
       - the camera never turns, so baking the shift by the normal stands in for iridescence;
       - the shells are marked glossy by vertex alpha 0, which the runtime stores as a negative glow;
       - the kit shader gives glossy faces low roughness and a sharp sun glint, since small shells smear the physical highlight.
3. **The biological enemy faction:** Blender models on the existing kinds' behaviour.
4. **THE CRADLE (done, 24 October):** the user's Tripo GLB itself, adapted in Blender (`tools/blender/approved_cradle.py`, `public/assets/amnion/the-cradle-v2-approved.glb`, about 111k triangles, 6.0 MB), like the other approved bosses. The user rejected two hand-built rebuilds ("its still wrong. keep to the glb you have which is fully detailed. start fresh").
   - **Structure,** as the user described it: an inner core with the egg on flesh eggs surrounded by six shields; the wings with their outer shields, which "extend below to look like floating rocks". No turret nodes.
   - **Cut by shape.** Tripo split the mesh into arbitrary pieces, so each part is cut by shape:
     - the egg by an ellipsoid;
     - each inner shield's upper part by its sector round the nest above a cut height, keeping only painted bone (the atlas tells bone from flesh) and closing over thin cracks. The shields hinge on the cut line and swing 42° outward for the core phase;
     - the brood sacs are the flesh bulges at the front flanks.
   - **Floating rock:** a boulder mass hangs under each of the five outer shields, painted from the model's own rock slabs, with smaller chunks floating beside it.
   - **Size:** 70% of the reference placement ("the model seems pretty big no?"). It rises straight up out of its canyon (it used to slide in from row 30 and plough through the canyon wall), and the canyon is fitted to its footprint and sway.
   - **Combat points:** the core target and the sacs keep their tested positions, within half a unit of the egg and the bulges; closer values made the overload fan seal the view. The hatchling bays are at x ±1.96, s −1.68.
5. **Music:** Codex, through `COORDINATION.md`.
6. **Endless:** Amnion joins the planet cycle.

## Terrain (milestone 1)

| | Value |
| --- | --- |
| Plateau tiers | −0.9 and −0.4 (domed ±0.17, egg hollows −0.35). The level was lowered 1.2 on 23 October ("lower the whole level a bit" so the tusks can grow) |
| Mountains | Up to the 2.4 cap: two octaves of ridged crests on the massifs, set back from the canyon lips. The peaks stayed when the level went down, so the mountains gained 1.2 of relief |
| Canyon floor | About −3.9, sagging toward the yolk: 3.0 under the plateau (it was 3.6; "make the canyons slightly less deep") |
| Scenery caps | 3.0 for everything, and 3.4 for the tusks alone (great tusks, nests and groves): 0.4 under the flight plane. Anything under the plane never covers a ship or a shot from the camera above it, so the margin is only about clutter |
| Canyons | Jagged zigzag crevasses whose width is set at every turn, so they taper: about 30% narrow slits (1.7–2.4 wide), 48% canyons, 22% wide chasms (6–9). They close to a pointed wedge where they break off. Each lip has its own two-scale serration, and occasional fangs jut into the gap. Side cracks run to a point. The user asked for this on 23 October: "too uniform, same width canyons and too rounded ... sharp and hostile and biological edged" |
| Crust and mountains | The plateau breaks into tilted plates about 3.4 across, split by sharp cracks. The mountains have blade crests. About a third of the massifs are cut into tall strata (0.65), whose risers stay bone, shaded as stone steps (24 October, user: "fix these regular red strikes"; until then they took the flesh colour, a red maze the user had liked "a little but not so many") |
| Ruins | At most one per 64 units: a clearing round a sunken, jagged-rimmed courtyard 8–9 across whose floor lies 2.7 under the plateau. A ruin piece stands in it: a broken ring of torn bone, a cracked glowing heart, and gigantic tusks (two arching over the heart, two snapped off, one fallen), about 7 high from the courtyard floor. Egg heaps lie along the courtyard wall. It answers the user's 23 October ask: "big areas on the base but also high and imposing" |
| Flesh | Dark blood maroon: palette flesh `#44120f`, floor `#260a09`; wall look hue `#3c1816` at shade 0.24 ("make the flesh a bit darker") |
| Boss clearing | One plateau level, no canyon |
| Colour | Bone, darker stained bone on mountain flanks and folds, pale crests; sinew at the lips, dark flesh walls and floors |
