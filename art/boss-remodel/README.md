# Boss remodels (v5), 20 October 2026

The user disliked the decimated v4 imports of their three supplied GLBs ("they look wonky"). These v5 bosses are **new, clean Blender models traced over those GLBs**, so they keep the supplied proportions and dimensions without any of the source mesh. The user's design sheets (front elevations of BASTION-9, HELION ARK and THE VEIL) guided the shapes. The user said that shape matters more than surface detail, and that backs and undersides, which the 55° game camera never shows, can stay plain.

| Boss | Runtime file | Triangles | Size | Builder |
| --- | --- | ---: | ---: | --- |
| BASTION-9 | `public/assets/khepri/bastion-9-v5-remodel.glb` | 22,176 | 4.4 MB | `tools/blender/remodel_bastion.py` |
| HELION ARK | `public/assets/vesper/helion-ark-v5-remodel.glb` | 7,628 | 2.6 MB | `tools/blender/remodel_ark.py` |
| THE VEIL | `public/assets/nacre/the-veil-v5-remodel.glb` | 16,112 | 3.7 MB | `tools/blender/remodel_veil.py` |

Most of the file size is the three baked 2048² JPEG maps (colour, roughness/metal, normal). The geometry and vertex AO are about 1 MB per boss. Triangle counts include wreck variants, hatches and the Veil's flight pod.

## Method (`tools/blender/boss_remodel.py`)

1. **Tracing paper.** The supplied model is placed in game space (`PLACEMENT`; the Bastion at ×9.6, which is 20% larger than v4). `trace()` then outlines any box of it from the top, side or front view and simplifies the outline to clean corner points. `print_height_map()` prints roof heights as a grid. These numbers were symmetrised and rounded, then used to author clean faceted solids (`Solids`: lofts, prisms, cylinders, gears). Each solid gets a single crisp chamfer and smooth shading split at 40°.
2. **Rig contract.** The node names, pivots and wreck variants are the ones each view already drives. Each weak point sits where the 55° camera ray through its combat target meets the armour (`ray_y`). Hatches, petals and the spire halves clear the core ray when they open. `tests/world/cinematic-assets.test.ts` checks all of this.
3. **Baked textures.** `texture_bake()` gives all meshes one shared UV atlas; faces the camera never sees get less space. It then bakes colour, roughness/metal and normal with Cycles.
   - **Plating:** Bastion and Ark use a generated, tileable armour-plate map (`panel_image`: seams, hatches, vents and rivets). The Veil uses Voronoi chitin cells instead.
   - **Surface detail:** Poly Haven's CC0 `metal_plate_02` adds grime and scratches (`art/source/polyhaven`).
   - **Weathering:** Khepri gets dust and rust streaks, Vesper frost and light grime, Nacre violet dust. Edges show worn metal everywhere.
   - **Materials:** every non-glow surface shares one textured material. Emissive `*_glow` materials stay untextured, because the game animates them as damage heat and lamps.
4. **AO.** `bake_ao()` writes per-corner ambient occlusion into the vertex colours, which glTF multiplies into the base colour.
5. **Export.** Each GLB carries a `<boss>_remodel_v5` marker. The views treat the marker like v4's: authored materials are kept and the articulated rig is used.

## Per boss

- **BASTION-9:** 20% larger than v4, combat geometry included (src/content/bastion.ts and docs/08). It has full-length double drum tracks with a rolling sprocket and idler, shoulders that slope down outboard in gull-wing fashion, and the sheet's V-chevron glacis. The octagonal drill-muzzle cannon pods recoil, and the round drum turrets with glowing eyes aim (the batteries). The reactor well sits under two sliding hatches in front of the command tower. The big upper cannons face forward.
- **HELION ARK:** the supplied trimaran layout, with the outriggers running past the aft wing (y 3.9 → 5.85). The centre hull is chunkier and longer, and the design sheet's tall spire is split into the two bridge shutters, which part to expose the lens. Finned radiators sit on the outrigger fore-decks, turrets on the wing platforms, and the bay hatches on the centre bow flanks. The foam collars and stern wake in `ark-view.ts` follow the longer hulls.
- **THE VEIL:** crescent wings with three-pod hangar mouths, scythe mandibles, a petal bud over the heart and a crown egg, folded toward the concept sheet. Its pods, bay hoods and flight pod follow the v4 contract.

## Rebuild

Run the builds headless. Each takes about 45–75 s, mostly the Cycles bake.

```bash
cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
  --python "$(wslpath -w tools/blender/remodel_run.py)" -- bastion|ark|veil [--no-export] [--no-preview] [--compare]
```

`--compare` writes the source-versus-remodel sheet (game camera, top, side, front) to `lookdev/boss-remodel/<boss>-v5-compare.png`. Copies of the final sheets are in this folder.

## Rollback

Switch the filename in `src/render/boss-assets.ts`. The v4 approved copies, the v3 studies and the v2 models all remain published. The Bastion's 20% combat scale lives in `src/content/bastion.ts`, so restore its old values too when rolling the Bastion back to v4.

## Evidence

- `bastion-compare.png`, `ark-compare.png`, `veil-compare.png` in this folder.
- In-game Chromium captures: `docs/screenshots/boss-remodel/`.

No phone hardware was tested.
