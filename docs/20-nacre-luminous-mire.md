# Nacre, the Luminous Mire

User request (15 October 2026): the level between Khepri and the ice world, with the trees and glowing flora from the concept (`art/concepts/01-worlds-direction.png`, middle panel). Its boss should be really big and imposing, a biological-looking giant starship. Difficulty close to Vesper's.

## World (`src/world/terrain-nacre.ts`)

Rework of 15–16 October 2026, after the user asked:
- "the terrain of nacre should be much more jungle and mountainy than it is. make it really alien looking and vertically interesting";
- "place some infrastructure in nacre, like biological looking towers";
- "really try to nail the concept art for the nacre world";
- "go all out on making the world really look like on the concepts, infrastructure could be ruins like in the concept".

The reference is the middle panel of `art/concepts/01-worlds-direction.png`.

- **Kit:** every piece is a Blender-modelled node of `public/assets/nacre/nacre-kit.glb` (35 nodes, 14,197 triangles, built by `tools/blender/nacre_kit.py`; see `art/nacre-kit/README.md`). Light code-built stand-ins (`src/render/nacre-kit.ts`) draw only until the GLB has loaded (user rule: no code-built models as the look).
- **Terrain:** indigo water (sea level −0.6) dominates, winding between ragged islands, about half land:
  - coasts are three noise octaves plus a fine fringe, cut by channels;
  - low mossy shelves sit 0.1–0.35 above the water;
  - rock-mask interiors rise in 0.2-unit ledges up to about 0.75 (the heightfield gives the base; the crag pieces make the mountains).
- **Massifs:** the rock mask carries tall jagged outcrops, gathered in heaps by a cluster field and tallest on the mask's core:
  - `mireCrag` pieces are 1.8–3.0 tall at scale 0.9–1.2, and now and then a landmark spire reaches the scenery cap (3.0);
  - `mireRock` heaps fill the margins, stand on the islands and fringe the shores;
  - black rock and crags rise from the shallows.
  - The faceted rock is near-black with cold blue-lit upward facets. A strong cold-blue bounce light in `LOOKS.nacre` lights its camera-facing sides, the concept's blue-lit rims.
- **Jungle:** dense glowing flora on the low ground, at the shores and around the feet of the massifs (`lotusGrove`, `lotus`, `glassTube`, `goblet`), with glass tubes and goblets in the gaps between crags. The shallows have lily rafts and a few lotus standing in the water. Moss tufts with cyan and violet speckles cover rock feet, shores and glowing patches. Glowing flora keeps most of its light in terrain shade.
- **Ruins** (scenery only: never cover, targets or collision). On a 13-unit lattice with three lanes, about 80% of the cells try a site. Sites go on low ground, at the waterline or in the shallows:
  - **Sanctuary (42%):** a monolith tower bridged by an elevated conduit to a ring platform (or to a second, broken tower). 12% of the towers are broken.
  - **Fortress (20%):** a stepped fortress with a ring platform, keep and twin towers. Its conduit bridge runs east to a tower or to broken pillars.
  - **Lone monolith (24%):** often broken (30%), among pillars or rubble.
  - **Drowned ruins (14%):** broken pillars and rubble rising from the shallows.

  Towers face the camera within ±0.45 rad (orange strips on the front). Small gardens of tubes, goblets and lotus grow up to each site but never through a plinth. Some bridges, rings and towers are the collapsed variants.
- **Glow colours:** the Nacre kit look emits each glowing face's own COLOR_0 × 1.8 × its brightest channel. Teal caps, violet goblets, orange strips, cyan inlays and blue bridge panels share one material.
- **Density** (per 36 × 30 section, three seeds, 11 sections each; the view covers about 30%):

  | Group | Pieces |
  | --- | --- |
  | Crags | about 28 |
  | Rock heaps | about 50 |
  | Moss tufts | about 89 |
  | Flora | about 70 |
  | Lily rafts | about 18 |
  | Ruin pieces | about 9 |
  | **Total** | about 263 pieces, 68,000 kit triangles |

- **No settlements, roads or pipelines.**
- **Look** (`LOOKS.nacre`):
  - a lilac sun at 34° under a violet sky;
  - violet sky fill and a cold-blue bounce (1.5) for the rock fronts;
  - bloom threshold 0.9 so the flora glows without washing out;
  - a faint violet mist, violet shadows and a violet sky reflection map (`createMireEnvironment`).
- **Water** (`water.setPlanet`, Nacre branch):
  - deep indigo `#141d5a` streaked with violet algae `#4e2c9c`: fuzzy, broken, domain-warped streaks plus a few drifting clouds;
  - a faint mottled sky sheen;
  - darker water hugging the shores, and no white foam.
- **Measured** (SwiftShader look-dev at 432 × 768 @2, `tools/lookdev.mjs … planet=nacre`, seeds 8831, 93 and 4242; nine views):

  | Counter | Nacre | Khepri (same tool) |
  | --- | --- | --- |
  | Terrain draw calls | 21–40 | 30–35 |
  | Terrain triangles | 42k–108k | — |
  | Frame triangles | 45k–113k | 90k–101k |
  | Terrain work slice | max 6.9–7.2 ms | max 6.9 ms |

## Deep Bloom (campaign mission 4 of 4, the finale)

After Cold Vector, threat 4 of 4 (user decision, 15 October: THE VEIL is so epic that Nacre becomes the final world and Vesper the one in between). Its combat idea follows docs/03: sine-flight weaver columns, overlapping rhythms, Needle beams between the islands, batteries on islands and pontoons, Diamond heavies and escort convoys. Mission cadence is ×0.92, the hardest campaign mission.

Since 16 October the sortie has a 36 s fuel-depot stretch: the approach closes at 182 s and THE VEIL rises at 184 s over open mire; the scroll stops at distance 920. Shield cells come at 45, 141 and 178 s (141 and 178 s on Veteran).

## THE VEIL (`src/content/veil.ts`, `src/render/veil-view.ts`)

A giant biological starship in the concept's "Veil" design language (`art/concepts/06-exotic-aliens.png`). Since 16 October it is modelled in Blender (`tools/blender/the_veil.py` → `public/assets/nacre/the-veil.glb`, 15,872 triangles against a 16,000 budget, `art/the-veil/README.md`); the code-built rig only stands in while the model loads:
- a dark-violet seed hull with layered carapace scales and a black spine, about 14.5 × 16.9 units;
- layered silver and violet crescent blades (great wings, rear wings, forward scythes, stern ribbons and prow barbs) with black honeycomb windows cut through them, reaching past both edges of the view;
- glowing teal veins, a tilted aft engine ring and trailing tendrils;
- two blade-cupped pods around teal cores (the first pair);
- a faceted teal heart in a ten-blade iris under four shutters that swing 105° open (the core);
- two launch bays at the front for its pods.

It rises out of the mire on arrival and sinks back into it when destroyed.

- **Combat:** pods fire aimed four-bolt spore bursts. The heart alternates a seven-bolt fixed fan with an aimed five-bolt burst. Overload brings lanes over its own hit columns.
- **HP:** pods 620 each, heart 2000. Warnings 0.95 s, recovery 0.5 s.
- **Clears:** the perfect pilot clears all nine difficulty × weapon combinations with zero hits.
- **It must be killed** (user rule).

## Nacre craft (`tools/blender/nacre_craft.py` → `public/assets/nacre/nacre-craft.glb`)

Since 16 October Nacre flies its own Blender-modelled faction in the ORRERY / SHARD / VEIL language of `art/concepts/06-exotic-aliens.png` (`art/nacre-craft/README.md`, 8,088 triangles for all five):

| Node | Flies as | Look |
|---|---|---|
| `nacre_shard` | Dart, Needle (×1.1) | long black spine, sharp nose, floating pearl plates, amber seams and amber engines |
| `nacre_veil` | Weaver, Lancer (×1.1) | curved crescent blades around a teal core |
| `nacre_orrery` | Diamond | nested segmented rings with two emitter arms |
| `nacre_spore` | batteries (turret, missile) | framed pearl bulb on a base, muzzle pitched up 20° |
| `nacre_pod` | THE VEIL's pods (`veil-pods`) | small blade-cupped seed |

Shell colour and the pearl sheen are baked into vertex colours; glow faces are teal `#3ff2d8` or amber `#ffa040`. The Vesper craft remain the fallback while the GLB loads.

## Endless

The cycle is now Luna (prologue) → Khepri ×3 → Vesper ×3 → Nacre ×3 → Khepri …. Boss sectors: 1 (WARDEN-1), 4 (Bastion-9), 7 (the Ark), 10 (THE VEIL), 13, 16, 19, ….

Nacre's playlists are built from Deep Bloom:
- the first stint opens with its first 90 s, then its middle and climax;
- later visits fly the climax arc plus its pressure phrases.

Vesper's craft preload during the Khepri boss sector.

## Known limits

- A terrain section that straddles a Vesper ↔ Nacre switch keeps one water sheet at Nacre's level. For less than one section after that jump, the second sea draws at the first sea's level.
- The Veil's bay petal doors are modelled half-open and static; a launch shows a flash and mist at the bay.
- The mire water fakes no reflections of the glowing flora (the concept shows some); its sheen comes from the sky map and a mottled colour term.
- Nacre kit pieces cast no real-time shadows: as on Vesper, `CASTER_NODES` in `terrain-view.ts` lists only Khepri formations. Adding the towers and crags there would ground them better on High.

## Varied boss fights (15 October 2026)

Each boss's overload phase now runs its own sequence of moves (`BossDefinition.overloadMoves`) instead of always alternating the same two lane patterns. The moves:
- core lane;
- side lanes;
- **cross:** core plus one side, with the open side alternating;
- **laser:** a narrow lane locked on the player;
- aimed burst;
- fixed fan.

Every move passes the same fairness director, and a rejected move is skipped.

| Boss | Overload sequence | Notes |
| --- | --- | --- |
| WARDEN-1 | core, burst, side, cross | |
| Bastion-9 | core, side, fan, cross, core, burst | |
| Helion Ark | core, laser, side, burst, cross, laser, core, cross | Recovers in 0.4 s instead of 0.55 s, and launches two more drop-pod waves once overload begins (user: the final laser section was always the same and a bit easy). |
| THE VEIL | core, fan, cross, laser, side, burst, cross, fan | Recovers in 0.45 s. |

## Pods (15 October 2026, user request)

THE VEIL deploys pod waves (`veil-pods` in `src/content/formations.ts`). Each wave is four pods, two from each front bay at (±1.7, s −2.6). They drop toward the player, fan out to a holding row, fire aimed seeds, then sweep away. THE VEIL launches three waves in its heart phase, 6.5 s apart, and two more once it overloads. Launches are now per boss (`BossDefinition.launches.template`): the Helion Ark keeps its Needle launches. The perfect pilot still clears Deep Bloom on all nine combinations, and the fairness unions pass.
