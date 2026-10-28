# 31 · Modular hero ships

Status: models and a preview tool (28 October 2026). The models are done. Using them in the game, unlocks, the
campaign hangar UI and saves are integration work (Codex, docs/30) and have not been started.

## What exists

| Chassis (docs/30) | User's tier | Look | Glow |
| --- | --- | --- | --- |
| `scrapper` | basic | rusty salvage fighter, ivory and rust | cyan `#78f9f1` |
| `ironclad` | armoured fighter | massive stepped armour, rams, tusks, spikes; dark olive, gunmetal, hazard stripes, red eye slits | red `#ff4a24` |
| `interceptor` | assault interceptor | knife noses, sharp wings, spear booms with canted fins; pearl, cobalt, black | blue `#5aa8ff` |
| `spectre` | exotic | obsidian flying wing with silver edges | violet `#b46cff` |

Each chassis has four **slots**: `hull`, `wings`, `engines` and `cockpit`. Each slot has three **designs**: `a`, `b` and
`c`. A build picks one design per slot, and any mix within a chassis fits together. Parts never mix across chassis.

- Source: `tools/blender/hero_kit.py`, run in headless Blender. The build command and the anchors for each chassis are in
  its comments.
- Kits: `public/assets/shared/hero-<chassis>-kit.glb`. Each kit holds one file per chassis with 12 part nodes.
- Review sheets: `art/hero-kit/<chassis>-sheet.jpg`. The top row shows presets A, B and C; the other rows are seeded
  mixes.
- Assembly: `src/render/hero-assembly.ts` (`HeroBuild`, `assembleHero`, `HERO_DEFAULT_PAINT`).
- Preview: the playground's **Hangar** tab (`playground.html`). Choose a chassis, a design for each slot and the paint,
  or shuffle the parts.

## Rules

- **Cosmetic only.** Every build of every chassis keeps the same hit region (radius 0.42 at the origin), handling and gun
  origins (docs/04 §9; AGENTS.md invariant 14). The parts never feed the simulation.
- **Shared anchors.** All designs of a chassis are authored around the same origin and anchors, so parts need no offsets.
  Every part node sits at the kit origin.
- **Size.** Each part stays inside x and z (glTF) of ±0.95; the publish step verifies this. The Scrapper is about 1.25
  to 1.45 wide, the Ironclad and Interceptor about 1.4 to 1.6, and the Spectre about 1.7.
- **Budget.** A whole ship stays under about 2,500 triangles (most builds use 500 to 1,500). The limits per part are
  hull 760, wings 640, engines 1,400 and cockpit 360.
- **Materials.** Each kit has three materials: `<chassis>_plate`, `<chassis>_frame` and `<chassis>_glow`. These class
  names are the ones `loadCraftNodes` understands.

## Node names

- Part node: `hero_<chassis>_<slot>_<design>`, for example `hero_ironclad_wings_b`.
- Engine sockets (for plumes): empties named `hero_<chassis>_engines_<design>_engine_<i>`, at the nozzles. This
  matches `loadCraftNodes`, which picks up `<node>_engine_*`.

## Recolouring

Each face's vertex colour **alpha** stores its paint role:

| Alpha | Role |
| --- | --- |
| 0.75 | primary paint |
| 0.5 | secondary paint |
| 1 | everything else: metal, glass, stripes |

The baked RGB keeps the default scheme plus all the shading and wear. A recolour replaces a role's colour and keeps each
vertex's shade relative to the default paint, so dark colours stay dark and light colours stay light. Glow is its own
material and takes its own tint. The default paint for each chassis is `HERO_DEFAULT_PAINT`; it must match the kit
(`PAINTS` in `hero_kit.py`).

## Integration notes (not done; for Codex/integrator)

- The game currently loads `hero-scrapper.glb` through `loadCraftNodes` (src/render/scene.ts). A build can use the same
  path. Load the four part nodes of the build from the kit, merge them, and take the engine sockets of the engines node.
- `loadCraftNodes` keeps only the vertex RGB. Apply a recolour first, as `tint` does in hero-assembly.ts, or move that
  logic into the loader.
- `assembleHero` is fine for menus and hangars (cloned meshes, standard materials). In flight, use the shared craft
  material (one draw).
- Unlocks, saved builds and the campaign hangar UI belong to docs/30's owner. Endless uses its own starter (AGENTS.md
  invariant 6).

## Open

- The art has not been checked on a phone or over every world's light. The Ironclad is dark by design; check it over
  Umbra.
- Each cockpit has a placeholder for its glass; there is no pilot.
