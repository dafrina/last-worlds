# Art direction and player experience

The look of the game and how it reads on a phone: the visual target, the camera, the visual hierarchy, how assets are
made, effects, the HUD, rendering tiers and the hero ships' scale. World-specific looks are in each world's doc
([docs/03](03-worlds-and-generation.md) lists them); the menus in [docs/16](16-flight-command-ui.md); sound in
[docs/24](24-sound-design.md).

## 1. Visual target

Modern stylized hard-surface science fiction (invariant 9). Aircraft look engineered and dangerous: swept wings, recessed
engines, broad armour plates, a few readable mechanisms, selective wear. Light and material response are convincing,
without film-level texture noise. No cute proportions, plastic toy surfaces, voxel terrain or dense photoreal grit.

The hero's chassis range from a rusty salvage fighter (Scrapper) to heavier, faster and exotic airframes, each a different
silhouette rather than a repaint ([docs/31](31-hero-ships.md)). Hostiles use dark armour with world-specific geometry and
warm threat lights; each world has its own faction look. This is an original direction; no named franchise's ships are
reproduced.

Concept images in [the concept gallery](../art/concepts/README.md) are references only: never runtime backgrounds, never
finished model assets, never presented as screenshots of the game.

## 2. Camera and composition

The release camera is a **25° perspective lens** at 55° elevation (`LENS_FOV` in `src/shared/lens.ts`, `VIEW.elevation`;
user, 21 October), with zero yaw and no roll, placed so the tactical height fits the view at its centre depth. Forward
flight stays screen-up and movement screen-horizontal. The simulation projects ground enemies through the same lens
(`src/shared/lens.ts`), so a turret on the terrain and its gameplay target on the flight plane share a pixel. `?camera=ortho`
and `?camera=rectified` are look-dev switches only.

The player flies low in the frame and boss weak points sit around the upper third. Camera angle and zoom stay fixed while
its x follows lateral movement ([docs/10](10-wide-map-and-camera.md)). A small render-only shake follows explosions and
hits (`SHAKE_AMPLITUDE` in `src/render/scene.ts`); no zooms, rotations or perspective changes during attacks.

Ground target markers follow the projected target cores. Foreground cliffs or arches never cover a live bullet or target,
and scenery never blocks shots (invariant 4).

## 3. Visual hierarchy

From highest priority to lowest: incoming shots and warnings; the player's ship; targetable enemy regions; useful pickups;
friendly shots; explosions; scenery. It is checked on phone-size captures, not only desktop images.

| Meaning | Colour | Shape and behaviour |
| --- | --- | --- |
| Player and friendly fire | Cyan to near-white core | Slim upward bolts, compact exhaust plumes |
| Hostile shots | Per world (`hostileHues` in `src/render/shot-colors.ts`): warm coral with a pale core, blood red on Corona and Nahara, acid green on Amnion | Round heads, clear travel direction |
| Warnings | Amber | Lane outlines and aim rays, then the lock |
| Damageable enemy core | Warm rim on neutral metal | Target brackets and a local hit flash |
| Pickups | Shield cyan, credits gold, weapons and power by pattern | 3D tokens with their own icons (`src/render/pickup-icons.ts`, `public/assets/shared/pickup-tokens.glb`) |

Luminous scenery is never as bright as player fire. A runtime scene is calmer than a concept board: lower texture
contrast, fewer props, restrained emissive flora. Greebles that vanish at phone size do not justify their draw cost.

## 4. Asset production

Every ship, enemy, boss and kit is a **Blender model** exported as GLB; nothing is built in code. The scripts live in
`tools/blender/` (`boss_*`, `craft_*`, `kit_*`, `props_*`, `sites_strike.py`, `hero_parts.py`, with shared `lib_*`
helpers) and rebuild headless through `run_build.py`. Runtime files are in `public/assets/<world>/` and
`public/assets/shared/`. Bosses adapt the user's supplied models (`art/source/bosses/`, never edited); hero parts are clean
models built over the user's Tripo references (`art/source/hero/`). Provenance and previews are in `art/`; see the
[README's map](../README.md#where-things-are). Blender runs on Windows: paths handed to it use the
`\\wsl.localhost\Ubuntu\…` form (AGENTS.md).

- Shared materials and atlases, sensible pivots, named sockets for muzzles and weak points, consistent game units.
- Collision is authored in the simulation, never implied by a mesh. Boss rigs keep the node names and pivots their views
  drive; `tests/world/cinematic-assets.test.ts` checks the contracts (weak points on their camera rays, budgets).
- Budgets follow the phone frame-time gate ([docs/36](36-mobile-performance.md)), not fixed per-asset promises.
- Every imported texture, model, sound and font has its source and licence recorded (Poly Haven CC0 maps:
  `art/source/polyhaven/README.md`).

## 5. Animation and effects

Effects are presentation only and never decide damage (`src/render/fx-particles.ts`, bounded pools sized by its
`*_CAPACITY` constants).

- **Banking:** a quick lateral bank that returns to neutral; it never changes the collider or the aim.
- **Engines:** a narrow core with shock diamonds in one plume quad; the hero leaves a soft contrail in its glow colour.
- **Hits:** a brief local flash and spark fan; no strobing full-screen flashes.
- **Shields:** a directional ripple on contact; a distinct ring and sound when one breaks; invulnerability is a steady
  outline, not flicker.
- **Destruction:** a short readable burst with a ring, a few fragments and brief smoke; boss wrecks smoke and sink.
- **Pickups:** 3D tokens that spin, home in once caught and pop on collection.
- **Specials:** each has its own effect ([docs/42](42-specials-and-perks.md)); enemy shots stay visible through them.
- **Boss phases:** shutters, moving machinery, broken modules and a change of warning cadence; arrivals are short.

The simulation never freezes on hits.

## 6. HUD

Lives as small ship silhouettes and shields as glyphs (filled or outlined), top left; the endless score or the campaign's
live credit counter and the pause control, top right; one plain special button at bottom centre, above the safe-area
inset, with recharge ticks. During a boss fight one slim meter shows the boss's remaining health. No player health,
ammunition, energy or combo bars, no minimap, no permanent arrows. Steering hints
blink for three seconds at flight start. Details and the menus: [docs/16](16-flight-command-ui.md).

## 7. Audio and accessibility

Audio starts on a user gesture; Settings has sound on or off and the audio panel has music and effects levels
([docs/24](24-sound-design.md)). Visual warnings carry everything audio conveys; no rule depends on sound, colour or
vibration alone. The OS reduced-motion setting removes camera shake, blinking hints and the jump's streaks. Menus support
keyboard navigation; canvas combat cannot be fully screen-reader accessible.

## 8. Rendering and quality tiers

Settings → Graphics chooses **High** or **Low**; both keep the same layout, targets and collision timing.

- **High:** a real-time sun with a shadow map (`SUN` in `src/render/scene.ts`), every craft casting; an HDR post pipeline
  with selective bloom, FXAA, tone mapping and a light grade (`src/render/post-pipeline.ts`).
- **Low:** no shadow map and no post pipeline; each craft's silhouette is drawn flattened along the sun as its shadow
  (`src/render/craft-shadows.ts`); cosmetic scatter and particles are reduced.
- **Materials:** bosses keep their baked PBR atlases (`src/render/boss-materials.ts`) and receive the world's prefiltered
  sky reflection; a shared mipmapped microfinish adds roughness and wear without per-object textures
  (`src/render/surface-finish.ts`).
- **Water** is opaque, with procedural normals and sky reflection in one draw (`src/render/water.ts`,
  `src/render/mire-water.ts`).

## 9. Hero ships and in-game scale

Four chassis (Scrapper, Ironclad, Interceptor, Spectre), each a modular model with five designs per part slot and paint
([docs/31](31-hero-ships.md)). All share the central hit region (`VIEW.playerRadius`, [docs/02](02-combat-and-progression.md))
and the same handling; a chassis never gets a smaller collider or hidden stats (invariant 14). The models fly at
`HERO_SCALE` (1.1, render only; user, 15 October). Endless flies the player's chosen chassis and look.

Each silhouette keeps its vulnerable central body legible; large solid-looking wings must not imply a dishonest hit
region. Gun sockets differ visually, but shot origins and patterns come from the equipment.

Procedural hero assembly beyond the authored part designs is deferred (invariant 8).

## 10. Art review checklist

Every new enemy, boss or world gets a phone-size still and a moving capture on High and Low, reviewed by the user before
it ships. Check silhouette, target and shot contrast, stable scale, readable ground targeting, safe thumb regions and
material consistency. Boss backs and undersides are never shown. Concept fidelity never overrides readable combat or
phone performance.
