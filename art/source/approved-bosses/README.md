# The user's boss source models

Byte-for-byte copies of the GLBs the user supplied for the bosses. They are the approved designs: never regenerate, edit or decimate them. They stay outside `public/`, so the game never downloads them. [SHA256SUMS](SHA256SUMS) holds their hashes (`sha256sum -c SHA256SUMS`).

| Supplied as | Copy | Boss | Builder (`tools/blender/`) |
| --- | --- | --- | --- |
| `futuristic spacecraft 3d model.glb` (20 October 2026) | `futuristic-spacecraft-original.glb` | THE VEIL: traced, rebuilt cleanly | `remodel_veil.py` |
| `futuristic tank 3d model.glb` (20 October 2026) | `futuristic-tank-original.glb` | BASTION-9: traced, rebuilt cleanly | `remodel_bastion.py`, run by `bastion_v7.py` |
| `alien hive 3d model.glb` (Tripo, 23 October 2026) | `cradle-tripo-original.glb` | THE CRADLE: the mesh adapted | `approved_cradle.py` |
| Tripo (24 October 2026) | `ark-tripo-original.glb` | HELION ARK: the mesh adapted, its panels cleaned | `approved_ark.py` |
| `crescent winged spaceship 3d model.glb` (Tripo, 24 October 2026) | `eclipse-tripo-original.glb` | THE ECLIPSE: the mesh adapted | `approved_eclipse.py` |
| Tripo (5 November 2026) | `heliophage-tripo-original.glb` | THE HELIOPHAGE: the mesh adapted | `approved_heliophage.py` |
| fantasy temple citadel (Tripo, 13 November 2026) | `citadel-tripo-original.glb` | THE CITADEL: shape guide only; built of Nahara's ruin kit | `nahara_citadel.py` |

The source GLBs keep their original 4096² textures; the runtime exports use resized copies. WARDEN-1 has no source model: its design sheet is `art/concepts/boss-sheets/warden.jpg`.
