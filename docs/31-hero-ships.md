# Hero ships

The player's four chassis and their modular models: what each looks like, how the parts are built in Blender, the rules
that keep any mix of parts sound, paint, and how the hangar and the flight use them. Perks and prices are in
[docs/42](42-specials-and-perks.md) and [docs/30](30-campaign-progression.md).

## The chassis

| Chassis | The user's tier | Look | Default glow |
| --- | --- | --- | --- |
| `scrapper` | basic | rusty salvage fighter, ivory and rust | cyan |
| `ironclad` | armoured fighter | massive stepped armour, rams, tusks and spikes; dark olive, gunmetal, hazard stripes, red eye slits | red |
| `interceptor` | assault interceptor | knife noses, sharp wings, spear booms with canted fins; pearl, cobalt and black | blue |
| `spectre` | exotic | obsidian flying wing with silver edges | violet |

Default paints are `HERO_DEFAULT_PAINT` in `src/content/hero-parts.ts`.

Each chassis has four **slots** (`HERO_SLOTS`: hull, wings, engines shown as Propulsion, cockpit) with five **designs**
each, `a`–`e` (`HERO_DESIGNS`). A look picks one design per slot; any mix within a chassis fits together, and parts never
mix across chassis. Design A comes with the chassis; B–E are bought in the hangar (`HERO_DESIGN_PRICES`,
`HERO_DESIGN_PARTS`) and paint is free.

## How the parts are built

The user made Tripo models of twenty concepts (four chassis × five designs; `art/source/hero/README.md`) and chose to have
clean parts modelled over them rather than cut out of them (user, 29 October: "remodel them all ourself, just using the
model as a style and size reference"; docs/08).

- **Reference** (`tools/blender/lib_hero_tripo.py`): levels each Tripo model onto one plane, scales it to its chassis and
  splits it into the four slots (`SPECS`: outlines read off gridded top and side views).
- **Parts** (`tools/blender/hero_parts.py`, one function per design): clean hard-surface parts measured off that
  reference, then the Tripo base colour, roughness-metal and normal maps baked onto them in Cycles.
- **Output:** `public/assets/shared/hero/<chassis>-<design>.glb`: four part nodes sharing one material and one texture set,
  a glow material, and the engine sockets.
- **Standard joints** (`JOINTS` in `hero_parts.py`, per chassis): a wing mounting plate on each hull side, a rear bulkhead
  every propulsion reaches forward to, and a cockpit deck that every cockpit's skirt reaches down into. Every design is
  built to them, so parts sit unmoved in any mix. Designs stay faithful to their models; mixed parts may overlap but never
  float (user, 29 October: "they can intersect no problem", "but it should somewhat look good").

Build a design headless: `blender --background --factory-startup --python tools/blender/hero_parts.py -- --design
scrapper-1` (from WSL through the Windows path; the full command is in the script's docstring).

## Rules

- **Cosmetic only.** Every build of every chassis keeps the same hit region (`VIEW.playerRadius` at the origin), handling
  and gun origins (invariant 14; [docs/04 § 9](04-art-and-experience.md)). Parts never feed the simulation.
- **Shared origin.** All designs of a chassis are authored around the same origin and joints, so parts need no offsets.
- **Scale.** Models are authored in game units and flown at `HERO_SCALE` (render only).

## Node names

- Part node: `hero_<chassis>_<slot>_<design>` (`heroPartNode`), for example `hero_ironclad_wings_b`.
- Engine sockets (for the plumes): empties named `hero_<chassis>_engines_<design>_engine_<i>` at the nozzles.

## Paint

A look's paint is one ship colour and one glow (user, 29 October: "Lets just make one color for the ship and one for
glow"). Every texel takes the ship colour at its brightness relative to the model's default paint, so panels, wear and
shading stay; texels lit in the model's glow colour, the glow material and the plumes take the glow. Looks saved with the
retired trim colour keep it unused.

## In the game

- **Look:** `HeroLook` (`src/shared/contracts.ts`) is one design per slot plus optional paint. The campaign save keeps
  `designs` (bought `ship:slot:design` ids) and `looks` (one per ship); see `buyDesign`, `setLook`, `ownsDesign`, `lookOf`
  and `cleanLooks` in `src/campaign/profile.ts`.
- **Run config:** the campaign passes the equipped ship and its look; endless passes them as `heroShip` and `hero`
  (`endlessConfig`). Endless flies that chassis with its perk (user, 30 October) and its look; a chassis that does not
  exist or a look that does not fit it is dropped and the Scrapper shows. The renderer shows `shownHero(config)`.
- **Flight:** `loadHeroModel` (`src/render/hero-craft.ts`) loads each design file once and shares its geometry; a look gets
  its own painted copies of the materials, at most one draw per design used, with the plumes at the propulsion part's
  engine sockets. `prepareHero` runs alongside the world under the launch warp; `preloadHeroLook` starts the downloads from
  the campaign screen.
- **Hangar** (`renderShipyard` in `src/ui/hangar.ts`): the slot selector, designs A–E per slot, colour and glow pickers,
  and Default paint. Tapping an unbought design tries it on the ship with BUY and PUT BACK. The picture is one still per
  look (`GameRenderer.heroPreview`), cached, with the previous picture kept up until the next is ready; opening the
  shipyard starts loading every design file of the chassis.
- **Playground:** the Hangar tab of `playground.html` shows any chassis, design mix and paint.

## Open

- The ships have not been checked on a phone or over every world's light; the Ironclad is dark by design and should be
  checked over Umbra.
- Each cockpit has a placeholder for its glass; there is no pilot.
