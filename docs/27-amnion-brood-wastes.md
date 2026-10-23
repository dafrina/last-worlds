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

- **Hostile shots are violet here** (`#b056ff` with a pale core `#f6e8ff`; muzzle flashes `#c27aff`), never the warm orange used elsewhere. The yolk glow is warm itself, and the player's own shots are white-cyan, so cyan would also confuse. (`src/render/scene.ts`, `src/render/fx-particles.ts`.)
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
   - **Stand-ins, openly marked:** Nacre's organic craft for the enemies, THE VEIL's model for THE CRADLE (seated on the plateau), and Nacre's arrangement a minor third lower as the music (Codex writes the real theme).
2. **Brood kit in Blender:** bone-and-sinew canyon walls (runs along the sheer canyon lips, like Khepri's mesas), egg clutches, bone spires and horns, ribbed nests with glowing cores, bone bridges over canyons, and egg-sac depots for the fuel role.
3. **The biological enemy faction:** Blender models on the existing kinds' behaviour.
4. **THE CRADLE:** its own model, an arrival up the canyon, and the sac and heart reveals.
5. **Music:** Codex, through `COORDINATION.md`.
6. **Endless:** Amnion joins the planet cycle.

## Terrain (milestone 1)

| | Value |
| --- | --- |
| Plateau tiers | 0.3 and 0.8 (domed ±0.17, egg hollows −0.35) |
| Mountains | Up to the 2.4 cap: two octaves of ridged crests on massifs about 28% of the area, set back from the canyon lips |
| Canyon floor | About −3.3, sagging toward the yolk |
| Canyons | Main canyons wind along s, 5–9 units wide; narrower side cracks in patches; together about 30% of the area |
| Boss clearing | One plateau level, no canyon |
| Colour | Bone, darker stained bone on mountain flanks and folds, pale crests; sinew at the lips, dark flesh walls and floors |
