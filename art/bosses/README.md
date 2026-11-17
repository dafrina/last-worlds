# Boss models

How the eight boss models are made: which source each starts from, which Blender script builds it, the rig contract the
game's boss views rely on, and how to rebuild one. The user's supplied source models are in
[art/source/bosses](../source/bosses/README.md); the runtime files and their builders are listed in
`src/render/boss-assets.ts` (`BOSS_ASSETS`). Each boss's design and fight are in its world's doc.

| Boss | World | Runtime file (`public/assets/`) | Builder (`tools/blender/`) | Made from |
| --- | --- | --- | --- | --- |
| WARDEN-1 | Luna | `luna/warden.glb` | `boss_warden.py` | Modelled after the user's design sheet (`art/concepts/boss-sheets/warden.jpg`); no supplied model |
| BASTION-9 | Khepri | `khepri/bastion-9.glb` | `boss_bastion.py` (runs `boss_bastion_hull.py`, then `boss_bastion_treads.py`'s tread-link extraction) | Clean model traced over the user's tank GLB |
| HELION ARK | Vesper | `vesper/helion-ark.glb` | `boss_ark.py` (`build_clean()`) | The user's Tripo GLB, adapted, with its hull panels rebuilt flat |
| THE VEIL | Nacre | `nacre/the-veil.glb` | `boss_veil.py` | Clean model traced over the user's spacecraft GLB |
| THE CRADLE | Amnion | `amnion/the-cradle.glb` | `boss_cradle.py` | The user's Tripo GLB, adapted |
| THE HELIOPHAGE | Corona | `corona/the-heliophage.glb` | `boss_heliophage.py` | The user's Tripo GLB, adapted, laid flat and squashed |
| THE CITADEL | Nahara | `nahara/the-citadel.glb` | `boss_citadel.py` | Built of Nahara's ruin kit, with the user's Tripo model as its shape guide |
| THE ECLIPSE | Umbra | `umbra/the-eclipse.glb` | `boss_eclipse.py` | The user's Tripo GLB, adapted, plus the prow vent |

## Two methods

**Traced models** (BASTION-9, THE VEIL; WARDEN-1 from its sheet), with `tools/blender/lib_solids.py`:

1. **Tracing.** The supplied model is placed in game space; `trace()` outlines any box of it from the top, side or front
   and simplifies the outline to clean corner points, and `print_height_map()` prints roof heights as a grid. Those numbers
   are symmetrised and rounded into clean faceted solids, each with one crisp chamfer.
2. **Baked textures.** `texture_bake()` gives all meshes one shared atlas (faces the camera never sees get less space) and
   bakes colour, roughness-metal and normal maps in Cycles: generated armour plating (`panel_image`) or chitin cells, Poly
   Haven's CC0 `metal_plate_02` for grime and scratches ([art/source/polyhaven](../source/polyhaven/README.md)), and
   per-world weathering.
3. **One primitive per material.** Slots that share a material are merged after the bake (`merge_slots`), since the glTF
   exporter writes one draw per slot. Emissive `*_glow` materials stay untextured: the game animates them.
4. **Ambient occlusion** is baked into the vertex colours (`bake_ao`).

**Adapted Tripo models** (HELION ARK, THE CRADLE, THE HELIOPHAGE, THE ECLIPSE): the user's mesh, UVs and painted atlases are
kept and reduced; nothing of the shape is regenerated. `tools/blender/lib_tripo.py` copies faces out into named parts
(`extract`), adds marker nodes and builds wreck copies. Loose pieces beside a supplied model are the concept's pod sketches
and are left out. Models are laid flat for the game camera; backs and undersides, which the camera never shows, may stay
plain.

THE CITADEL is the exception: the adapted Tripo mesh was rejected ("its color is off"), so it is built of the ruin kit's own
blocks and arches (`tools/blender/kit_nahara.py`) in the shape of the Tripo model ([docs/39](../../docs/39-nahara-silent-empire.md)).

## Rig contract

- Node names, pivots and wreck variants are the ones each boss view drives (`src/render/bastion-view.ts`, `ark-view.ts`,
  `warden-view.ts`, `carrier-view.ts`). Each GLB carries a marker node the view looks for: `warden_remodel_v5`,
  `bastion_remodel_v5`, `ark_approved_v6`, `veil_remodel_v6`, `cradle_approved_v2`, `eclipse_approved_v1`,
  `heliophage_approved_v1` (these names are identifiers, not version labels to update). THE CITADEL, built of the ruin kit,
  has none.
- Every weak point sits where the game camera's ray through its combat target meets the armour (`ray_y`), and hatches,
  petals and shutters clear that ray when they open.
- `tests/world/cinematic-assets.test.ts` checks the contracts: node names, weak points on their rays, footprints and
  triangle budgets.

## Rebuild

Builders with a `build(export, preview)` function (WARDEN-1, THE VEIL, the BASTION-9 hull) run headless through
`run_build.py`:

```bash
cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
  --python "$(wslpath -w tools/blender/run_build.py)" -- boss_warden [--no-export] [--no-preview] [--compare]
```

`--compare` writes a source-against-model sheet to `lookdev/`. The other builders give their own command in their
docstring: `boss_bastion.py`, `boss_eclipse.py`, `boss_heliophage.py` and `boss_citadel.py` run headless the same way;
`boss_ark.py` and `boss_cradle.py` run inside Blender through the Blender MCP (paths in the `\\wsl.localhost\…` form).

## Rollback

Earlier versions of every model are in git history; restore the file from there. BASTION-9's combat geometry lives in
`src/content/bastion.ts`, so rolling its model back means checking those values too.
