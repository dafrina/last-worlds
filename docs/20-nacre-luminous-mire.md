# Nacre, the Luminous Mire

Nacre is the jungle-and-mire world: the campaign's fourth mission, Deep Bloom, ending with THE VEIL, and the third world
of the endless cycle. It follows the middle panel of `art/concepts/01-worlds-direction.png` and the exotic boards
(`05-alien-factions.png`, `06-exotic-aliens.png`); concept images are references only. This doc covers the world, its
water, its craft, the mission and the boss. The user asked for it on 15 October ("much more jungle and mountainy",
"really alien looking and vertically interesting", ruins like the concept) and for a boss that is "really big and
imposing, a biological-looking giant starship".

## 1. The world

`src/world/terrain-nacre.ts` (profile `NACRE`), dressed only from the Blender kit `public/assets/nacre/nacre-kit.glb`
(`tools/blender/kit_nacre.py`; provenance in [art/nacre-kit](../art/nacre-kit/README.md)). Light code-built stand-ins
(`src/render/nacre-kit.ts`) draw only until the GLB has loaded.

- **Terrain:** indigo water winds between ragged islands, about half land: low mossy shelves just above the water and rock
  interiors rising in ledges into stepped massifs (relief in [docs/26 § 12](26-terrain-relief.md)).
- **Massifs:** tall jagged crags (`mireCrag`) gathered in heaps on the rock mask, tallest on its core, with an occasional
  landmark spire up to the scenery cap; rock heaps (`mireRock`) on the margins and shores; black rock rising from the
  shallows. The faceted rock is near-black with cold blue-lit facets, lit by a strong cold-blue bounce.
- **Jungle:** dense glowing flora on low ground, shores and the feet of the massifs (lotus groves, glass tubes, goblets),
  lily rafts and lotus in the shallows, moss tufts with cyan and violet speckles. Flora keeps most of its glow in terrain
  shade but never outshines player fire.
- **Ruins** (scenery only: never cover, targets or collision) on a lattice along three lanes, on low ground, at the
  waterline or in the shallows: sanctuaries (a monolith tower bridged by an elevated conduit to a ring platform or a broken
  tower), stepped fortresses with keep and twin towers, lone monoliths, and drowned ruins. Towers face the camera; some
  pieces are collapsed variants; small gardens grow up to each site.
- **Glow:** one kit material emits each glowing face's own vertex colour (teal caps, violet goblets, orange strips, cyan
  inlays, blue bridge panels).
- Crags and ruins cast real-time shadows on High (`CASTER_NODES` in `src/render/terrain-view.ts`).
- No settlements, roads or pipelines. Strike sites and facility plants are placed like on every world
  ([docs/33](33-strike-sites-and-encounter-deck.md), [docs/25](25-modular-facilities.md)).
- **Look** (`LOOKS.nacre` in `src/render/scene.ts`): a lilac sun under a violet sky, violet sky fill and a cold-blue bounce
  for the rock fronts, a bloom threshold that lets the flora glow without washing out, faint violet mist, violet shadows and
  a violet sky reflection map (`createMireEnvironment`).

## 2. The mire water

`src/render/mire-water.ts`, its own opaque material beside Vesper's ocean (`src/render/water.ts`): deep indigo streaked
with violet algae, a faint mottled sky sheen, darker water hugging the shores, no foam.

- Its detail is one runtime-generated 256² tileable gradient-noise texture, mipmapped with anisotropic filtering and
  sampled four times (a broad warp, the algae, two ripple layers drifting different ways), so it never shows the
  pixelated value-noise cells it once had (user, 3 November: "adjust nacres to be less pixelated").
- The terrain view gives each water vertex a signed waterline, so the shore film and dark shore band follow the true shore
  rather than the grid.
- Texture coordinates wrap the scroll every 200 units, so precision holds on any run length.
- Cost: four texture taps a pixel, no extra render target or draw; the texture builds in short slices before the world is
  shown.

## 3. Nacre's craft

Nacre's own faction (`public/assets/nacre/nacre-craft.glb`, built by `tools/blender/craft_nacre.py`; provenance in
[art/nacre-craft](../art/nacre-craft/README.md)), in the Orrery / Shard / Veil language of the exotic board:

| Node | Flies as | Look |
|---|---|---|
| `nacre_shard` | Dart, Needle | long black spine, sharp nose, floating pearl plates, amber seams and engines |
| `nacre_veil` | Weaver, Lancer | curved crescent blades around a teal core |
| `nacre_orrery` | Diamond | nested segmented rings with two emitter arms |
| `nacre_spore` | turret and missile batteries | framed pearl bulb on a base, muzzle pitched up |
| `nacre_pod` | THE VEIL's pods (`veil-pods`) | small blade-cupped seed |
| `nacre_pulsar` | Pulsar | radial crown of iridescent petals and silver blades around a teal emitter heart |

**The Pulsar** dives in, holds, marks a dashed teal line toward the ship, then fires a stream (`PULSAR_BURST` in
`src/content/balance.ts`) in which each shot aims at the ship as it leaves the muzzle, so the stream hoses after a moving
ship. The shots are spaced so the ship can weave between them rather than outrun the stream to the edge (user, 20 and
21 October). Keep moving through it; holding still takes it.

## 4. THE VEIL

A crescent-winged carrier far wider than the view, in the design language of Nacre's fighters (`src/content/veil.ts`,
view `src/render/carrier-view.ts`, model `public/assets/nacre/the-veil.glb` traced over the user's spacecraft GLB by
`tools/blender/boss_veil.py`; see [art/bosses](../art/bosses/README.md)). It rises out of the mire on arrival and sinks
back when destroyed.

- **Targets:** two pods (the first pair) and the heart (the core) behind four shutters that swing open. The hull, blades
  and crown are scenery.
- **Fight:** the pods fire aimed spore bursts; the heart alternates a fixed fan with an aimed burst and looses a spiral
  barrage from its core, holding still while the spiral unwinds; the fairness director judges each spiral to its end, so
  one that would seal the row never starts. The overload runs its own move sequence (`overloadMoves` in
  `src/content/bosses.ts`; [docs/03 § 3](03-worlds-and-generation.md#3-bosses)). Numbers: `VEIL`.
- **Pods:** pod waves (`veil-pods` in `src/content/formations.ts`) drop from the two front bays (`VEIL.bays`) toward the
  player, fan out to a holding row, fire aimed seeds and stay until destroyed; each wave waits until the previous one is
  down (`VEIL.launches`: waves in the heart phase, more in overload). When the carrier falls its deployed pods go down with
  it, without kill credit, and the extraction or the endless jump starts at once (user, 11 November).
- **It must be killed** in every mode.

## 5. Deep Bloom

The fourth campaign mission (`CAMPAIGN_ORDER`), after Cold Vector. Sine-flight weaver columns, overlapping rhythms, Needle
beams between the islands, batteries on islands and pontoons, Diamond heavies and Pulsars, drawn by the encounter deck
from Deep Bloom's arc ([docs/33](33-strike-sites-and-encounter-deck.md)). The approach closes at `VEIL.approachEndsAt`, the
scroll stops over open mire (`VEIL.arena`) and THE VEIL rises at `VEIL.arrivesAt`. Shield cells: `VEIL.shieldSupplies`.
Pressure: `MISSION_CADENCE` and `MISSION_PRESSURE` for `deep-bloom` ([docs/11](11-campaign-difficulty.md)).

In endless, Nacre's stint follows Vesper's; its first visit flies Deep Bloom's opening and pressure, later visits its
peak ([docs/18](18-endless-planet-cycle.md)).

## 6. Tests

- `tests/world/terrain-nacre.test.ts`: the world's determinism, water share, massifs, flora and ruins.
- `tests/render/mire-water.test.ts`: the water texture tiles and wraps.
- `tests/sim/veil.test.ts`: the fight, the pods and the kill-to-complete rule; the fairness suites fly Deep Bloom on every
  difficulty.
- `tests/fixtures/nacre-world.html`: a look-dev view of the world.

## Open

- A terrain section that straddles a Vesper–Nacre jump keeps one water sheet at the first world's sea level.
- The bay doors are static; a launch shows a flash and mist at the bay.
- The water fakes no reflections of the glowing flora, and its one tile has not been judged in motion on a phone.
