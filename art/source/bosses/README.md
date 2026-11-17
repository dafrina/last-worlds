# The user's boss source models

Byte-for-byte copies of the GLBs the user supplied for the bosses. They are the approved designs: never regenerate, edit or decimate them. They stay outside `public/`, so the game never downloads them. [SHA256SUMS](SHA256SUMS) holds their hashes (`sha256sum -c SHA256SUMS`).

| Supplied as | Copy | Boss | Builder (`tools/blender/`) |
| --- | --- | --- | --- |
| `futuristic spacecraft 3d model.glb` (20 October 2026) | `futuristic-spacecraft-original.glb` | THE VEIL until 17 November: traced, rebuilt cleanly | none since 17 November (`boss_veil.py` in git history) |
| `futuristic tank 3d model.glb` (20 October 2026) | `futuristic-tank-original.glb` | BASTION-9: traced, rebuilt cleanly | `boss_bastion_hull.py`, run by `boss_bastion.py` |
| `alien hive 3d model.glb` (Tripo, 23 October 2026) | `cradle-tripo-original.glb` | THE VEIL since 17 November (THE CRADLE before): the mesh adapted, repainted as a relic | `boss_veil.py` |
| Tripo (24 October 2026) | `ark-tripo-original.glb` | HELION ARK until 17 November: the mesh adapted, its panels cleaned | `boss_ark.py` (removed 17 November; git history) |
| `crescent winged spaceship 3d model.glb` (Tripo, 24 October 2026) | `eclipse-tripo-original.glb` | THE ECLIPSE: the mesh adapted | `boss_eclipse.py` |
| Tripo (5 November 2026) | `heliophage-tripo-original.glb` | THE HELIOPHAGE: the mesh adapted | `boss_heliophage.py` |
| fantasy temple citadel (Tripo, 13 November 2026) | `citadel-tripo-original.glb` | THE CITADEL: shape guide only; built of Nahara's ruin kit | `boss_citadel.py` |
| `monster spider 3d model.glb` (17 November 2026) | `cradle-walker-original.glb` | THE CRADLE (walking brood hive, the boss overhaul of 17 November): adapted into a modular walker (its mesh, UVs and paint kept, its legs cut at their joints) | `boss_cradle.py` |
| `cf42e8f1-dec1-484b-8892-4a619271fc0e.glb` (17 November 2026) | `stronghold-original.glb` | HELION STRONGHOLD (Vesper's mountain fortress, replacing the flying ARK model): the mesh adapted (its barrels turned toward the player, a reactor chamber added), set into Vesper's mountains | `boss_stronghold.py` |

The source GLBs keep their original 4096² textures; the runtime exports use resized copies. WARDEN-1 has no source model: its design sheet is `art/concepts/boss-sheets/warden.jpg`.

## References for the 17 November overhaul

The user's target images are in `references/`:
- `cradle-walker-target.png`: an in-game render sheet of the walking CRADLE (engaged and core-open in game, front, side and top, the brood sacs and the palette);
- `cradle-walker-target-*.png`: crops of that sheet;
- `stronghold-concept.png`: the concept art for the Vesper fortress.
