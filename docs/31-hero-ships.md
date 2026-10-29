# 31 · Modular hero ships

Status: in the game since 28 October 2026. Each campaign chassis flies its own build; Hangar → Ships has the
configurator (§ In the game). The playground's Hangar tab is the look-dev view.

## What exists

| Chassis (docs/30) | User's tier | Look | Glow |
| --- | --- | --- | --- |
| `scrapper` | basic | rusty salvage fighter, ivory and rust | cyan `#78f9f1` |
| `ironclad` | armoured fighter | massive stepped armour, rams, tusks, spikes; dark olive, gunmetal, hazard stripes, red eye slits | red `#ff4a24` |
| `interceptor` | assault interceptor | knife noses, sharp wings, spear booms with canted fins; pearl, cobalt, black | blue `#5aa8ff` |
| `spectre` | exotic | obsidian flying wing with silver edges | violet `#b46cff` |

Each chassis has four **slots**: `hull`, `wings`, `engines` and `cockpit`. A build picks one design per slot, and any mix
within a chassis fits together. Parts never mix across chassis. A **remodelled** chassis (`HERO_REMODELLED`: since 29 October all
four) has five designs per slot, `a`–`e`; the others still have three, `a`–`c`, in their script-built kits (below).

## Remodelled chassis (29 October 2026)

The user rejected the script-built kits as comical and made Tripo models of twenty concepts (art/source/hero/README.md).
Their parts are remodelled, not cut out (docs/08, 29 October):

- **Reference:** `tools/blender/hero_tripo.py` levels each Tripo model onto one plane, scales it to its chassis and
  splits it into the four slots (`SPECS`: outlines read off gridded top and side views).
- **Remodel:** `tools/blender/hero_remodel.py`, one function per design, builds clean hard-surface parts measured off
  that reference, then bakes the Tripo base colour, roughness-metal and normal maps onto them in Cycles. Output:
  `public/assets/shared/hero/<chassis>-<design>.glb`, its four part nodes sharing one material (base and normal 1024 px,
  roughness-metal 512 px) plus a glow material, and its engine sockets. About 1,700 to 6,200 triangles, 1.0 to 1.3 MB.
- **Standard joints** (`JOINTS`, per chassis): a wing mounting plate on each hull side, a rear bulkhead every propulsion reaches
  forward to, and a cockpit deck with every cockpit's skirt reaching down into the hull. Every design is built to them,
  so parts sit unmoved in any mix. Designs stay faithful to their models; mixed parts may overlap but never float (user:
  "they can intersect no problem", "but it should somewhat look good").
- **Runtime:** `loadHeroModel` (src/render/hero-craft.ts) loads each design file once and shares its geometry; a look gets
  its own copies of the materials. Paint is one ship colour and one glow (user, 29 October: "Lets just make one color for
  the ship and one for glow"): every texel takes the ship colour at its brightness relative to the model's paint
  (`HERO_DEFAULT_PAINT.primary`, the median the bake prints), so panels, wear and shading stay; texels lit in the
  model's glow colour, the glow material and the plumes take the glow. The first rule matched texels to a paint and a
  trim swatch: it reached about half of the Scrapper and Interceptor textures and none of the brown rust, which is why
  most parts stayed brown.
- **Review sheets:** `art/hero-tripo/` (remodel against Tripo, mixed builds).

## Script-built kits (retired 29 October; kept as the fallback path)

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
- **Finish (user, 28 October: the parts "look blocky ... make them more sophisticated").** Every plate has a straight
  lower side, a chamfered band and a slightly inset top. Large plates carry a raised inner panel. Every edge over 35° gets
  a one-step bevel with hardened normals, and the bevel's own faces are lighter (edge wear), so panels read outlined.
  Cylinders have half as many sides again. Bevel faces take the paint role of their painted side, so recolouring reaches
  them.
- **UVs:** one UV for the whole part, mid-plate in the game's panel map. Box-projected seams tiled into a brick pattern on
  ships this small; the verifier's box-UV rule is waived for hero nodes (`uv='flat'`).
- **Budget.** A whole ship runs about 1,500 to 7,000 triangles, as one draw. The limits per part are hull 3,400, wings
  3,200, engines 4,600 and cockpit 1,400.
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

## In the game

- **Look:** `HeroLook` (src/shared/contracts.ts) is one design per slot plus optional paint. The campaign save keeps
  `designs` (bought `ship:slot:design` ids) and `looks` (one per ship), both optional (src/campaign/profile.ts:
  `buyDesign`, `setLook`, `ownsDesign`, `lookOf`, `cleanLooks`).
- **Run config:** `RunConfig.hero` carries the look for the campaign; `createRun` drops it in endless. The simulation
  never reads it.
- **Flight:** src/render/hero-craft.ts loads the four kit nodes through `craftFromScene` with the paint applied, merges
  them into one craft draw, and takes the plumes from the propulsion part's engine sockets. The renderer's
  `prepareHero` runs alongside the world under the launch warp.
- **Hangar:** src/ui/hangar.ts `renderShipyard`.
  - Designs per slot (`heroDesigns`): A–E on a remodelled chassis, A–C on a kit chassis. A is free; the rest are bought
    with credits (`HERO_DESIGN_PRICES`: 80, 160, 240, 320; src/content/hero-parts.ts)
    and then switch freely.
  - Colour and glow pickers, and Default paint. Looks saved with a trim colour keep it unused.
  - The turntable: `GameRenderer.heroTurntable` draws 36 views into a strip once per look, and the hangar animates it
    on a 2D canvas (no second WebGL context).

## Integration notes (original handoff, now done)

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
