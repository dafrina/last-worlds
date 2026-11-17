# Concept gallery

Concept images and their prompts. They are references for shape, palette and composition only: never runtime
backgrounds, never finished model assets, never presented as screenshots of the game (AGENTS.md invariant 9). Written
simulation rules decide hit regions, targeting and boss phases, never image placement.

## The first boards (13 October 2026)

Six images made with the built-in image tool at the start of the project, each with its full prompt. They set the
direction; several details have since been superseded, as noted.

| Image | Prompt | What it still guides | Superseded |
| --- | --- | --- | --- |
| [01-worlds-direction.png](01-worlds-direction.png) | [prompt](01-worlds-prompt.txt) | Khepri's badlands (left), Nacre's luminous wetland (middle), Vesper's frozen coast (right): palettes, terrain forms, ground-machine scale | The hero design and its apparent size |
| [02-portrait-combat.png](02-portrait-combat.png) | [prompt](02-portrait-prompt.txt) | Khepri's terrain and the fortress composition ([docs/13](../../docs/13-khepri-world.md)) | Its resource bars, ornate special button and HUD layout |
| [03-minimal-hud.png](03-minimal-hud.png) | [prompt](03-minimal-hud-prompt.txt) | The HUD: life silhouettes, shield glyphs, the plain bottom-centre special button | Its hero silhouette |
| [04-hero-tiers.png](04-hero-tiers.png) | [prompt](04-hero-tiers-prompt.txt) | Distinct silhouettes rather than reskins | The three tiers (Scrapper, Razor, Dominion) became four chassis built from the user's Tripo models ([docs/31](../../docs/31-hero-ships.md)) |
| [05-alien-factions.png](05-alien-factions.png) | [prompt](05-alien-factions-prompt.txt) | Khepri, Nacre and Vesper faction materials and silhouettes | |
| [06-exotic-aliens.png](06-exotic-aliens.png) | [prompt](06-exotic-aliens-prompt.txt) | Orrery, Shard and Veil forms (the Veil became THE VEIL) | |

## Later sheets, by folder

| Folder | What it holds | Used by |
| --- | --- | --- |
| [boss-sheets/](boss-sheets/) | `warden.jpg`, WARDEN-1's front elevation (the only boss without a supplied model) | `tools/blender/boss_warden.py`, [art/bosses](../bosses/README.md) |
| [facility-sheets/](facility-sheets/README.md) | The user's facility concepts per world (20 October) | [docs/23](../../docs/23-settlement-infrastructure.md), [docs/25](../../docs/25-modular-facilities.md) |
| [strike-sites/](strike-sites/README.md) | The strike-site sheet and its prompts (29 October) | [docs/33](../../docs/33-strike-sites-and-encounter-deck.md) |
| [corona/](corona/) | The user's Corona sheets: world, infrastructure, craft (5 November) | [docs/37](../../docs/37-corona-dying-star.md) |
| [umbra/](umbra/) | The user's Umbra sheets: world and infrastructure, faction and THE ECLIPSE (24 October) | [docs/28](../../docs/28-umbra-eternal-eclipse.md) |

The user's supplied 3D source models are in `art/source/` ([bosses](../source/bosses/README.md),
[hero](../source/hero/README.md)), not here.
