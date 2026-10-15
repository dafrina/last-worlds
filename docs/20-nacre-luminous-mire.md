# Nacre, the Luminous Mire

User request (15 October 2026): the level between Khepri and the ice world, with the trees and glowing flora from the concept (`art/concepts/01-worlds-direction.png`, middle panel). Its boss should be really big and imposing, a biological-looking giant starship. Difficulty close to Vesper's.

## World (`src/world/terrain-nacre.ts`)

- **Terrain:** indigo water (sea level −0.6) winding between many low dark islands (about half land), cut by channels, with black rock ridges and patches of bioluminescent moss.
- **Flora and monoliths:** built in code in `src/render/terrain-kit.ts` (`nacrePiece`); these are the final models, not stand-ins:
  - **glowing caps:** mushroom-like, a dark dome with a glowing rim and glowing gills;
  - **lily pads:** float on shallow water, with a glowing heart;
  - **reeds:** along the shores, with glowing seed tips;
  - **violet canopy trees:** with teal fruit and hanging glow tendrils;
  - **violet crystal clusters;**
  - **dark rocks;**
  - **rare tall monoliths:** with an orange slit, after the concept's alien towers.
- **Glow colours:** under the Nacre look the kit material emits each piece's own vertex colour, not one shared glow colour.
- **No infrastructure:** no settlements, roads or pipelines.
- **Look** (`LOOKS.nacre`):
  - a pale lilac sun under a violet sky, with violet fill and teal-violet bounce;
  - a low bloom threshold so the flora glows;
  - a faint violet mist, violet shadows and a violet sky reflection map (`createMireEnvironment`);
  - water: indigo, calm swell, a soft teal bioluminescent film at the shores (`water.setPlanet`).

## Deep Bloom (campaign mission 3 of 4)

Between Rolling Thunder and Cold Vector, threat 3. Its combat idea follows docs/03: sine-flight weaver columns, overlapping rhythms, Needle beams between the islands, batteries on islands and pontoons, Diamond heavies and escort convoys. Mission cadence is ×1, like Cold Vector.

The approach closes at 146 s. THE VEIL rises at 160 s over open mire; the scroll stops at distance 800. Shield cells come at 45, 105 and 150 s (105 and 150 s on Veteran).

## THE VEIL (`src/content/veil.ts`, `src/render/veil-view.ts`)

A giant biological starship after the concept's "Veil", built in code:
- a 15-unit iridescent purple hull with bone ribs and a carapace spine;
- glowing teal veins along the hull;
- two pairs of flat crescent blades about 14 units across, reaching past both edges of the view;
- two gill pods with glowing slits (the first pair);
- a glowing heart behind four membrane petals that fold open (the core);
- trailing tendrils and teal stern engines.

It rises out of the mire on arrival and sinks back into it when destroyed.

- **Combat:** pods fire aimed four-bolt spore bursts. The heart alternates a seven-bolt fixed fan with an aimed five-bolt burst. Overload brings lanes over its own hit columns.
- **HP:** pods 620 each, heart 2000. Warnings 0.95 s, recovery 0.5 s.
- **Clears:** the perfect pilot clears all nine difficulty × weapon combinations with zero hits.
- **It must be killed** (user rule).

## Endless

The cycle is now Luna (prologue) → Khepri ×3 → Nacre ×3 → Vesper ×3 → Khepri …. Boss sectors: 1 (WARDEN-1), 4 (Bastion-9), 7 (THE VEIL), 10 (the Ark), 13, 16, 19, ….

Nacre's playlists are built from Deep Bloom:
- the first stint opens with its first 90 s, then its middle and climax;
- later visits fly the climax arc plus its pressure phrases.

Vesper's craft preload during the Khepri boss sector.

## Known limits

- A terrain section that straddles the Nacre → Vesper switch keeps one water sheet at Nacre's level. For less than one section after that jump, Vesper's water draws 0.6 units high.
- Nacre has no own enemy craft yet; it reuses the Khepri and Vesper rosters.
