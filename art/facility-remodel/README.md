# Facility compounds v2, 20 October 2026

The user said the large building complexes looked "super flat" and asked for them to be remodelled, more interesting, "textured like the bosses", taking "the render arts as inspiration". The render arts are the facility sheets in `art/concepts/facility-sheets/`. The v1 compounds (`public/assets/shared/facility-compounds.glb`, built by `tools/blender/cinematic_assets.py`) were flat vertex-colour boxes.

The v2 plants are new Blender models built with the boss remodel toolkit (`tools/blender/boss_remodel.py`), and their surfaces are baked the same way.

## What each world borrows from its sheet

**Khepri** (heavy refinery tower, pipeline junction):
- bone armour with rust-orange cladding;
- domed storage tanks with crown hatches and ladders;
- clusters of process columns with dark domed crowns and tall light slits;
- sawtooth sheds whose lit glazing faces the camera;
- roof fans, banded pipes and lamp masts.

**Vesper** (thermal reactor tower, heat exchanger):
- angular graphite halls with raked fronts and leaning armour fins;
- octagonal heat-exchanger columns with glowing seams and hot crowns;
- a reactor housing with a glowing grille;
- stairs to a lit gate, and hot stacks;
- broad snow caps on every ledge.

**Nacre** (monolith relay, mire pump):
- tapered lavender stone wings with carved ember slits;
- a lit seam crossed by stone sills, with standing stones along the court;
- glowing basins that spill light down their fronts;
- obelisks crowned with crystals and halos, with crescent blades on both sides.

The crescent blades lean back toward the game camera, so the 55° view sees them nearly full size. Upright blades read as small stubs from that angle.

## Gameplay contract (unchanged from v1)

The plants keep the v1 node names, `facility_<planet>` and `facility_<planet>_large`, and the v1 seat bounds. `facility-view.ts` (`SIZE`) and `tests/world/cinematic-assets.test.ts` (`checkCompound`) enforce them.

| | Small | Large |
| --- | --- | --- |
| Width | under 6.7 | under 8.8 |
| Depth (s) | −1.8 to 4.6 | −2.8 to 6.1 |
| Roof height | at most 2.651 | at most 2.831 |
| Plan area | — | 1.8–2.2× the small one |

In both sizes, nothing rises above 0.25 within |x| < .65 and |s| < .7 around the battery, so the gun court stays clear. Foundations reach below ground so the plants can sit on uneven seats, and every Nacre plant can stand in the mire.

## Runtime files

Each world's two plants share one baked atlas and one GLB. The game loads that GLB when it arrives at the world. It releases the GLB once the last plant has scrolled away; endless revisits reload it. Until a GLB is ready, that world's batteries keep their smaller emplacements.

| World | Runtime file | Triangles: small / large | Draw calls per plant | Size (textures) |
| --- | --- | ---: | ---: | ---: |
| Khepri | `public/assets/khepri/facility-compounds-v2-remodel.glb` | 15.3k / 23.2k | 2 | 5.7 MB (2.8) |
| Vesper | `public/assets/vesper/facility-compounds-v2-remodel.glb` | 9.8k / 17.1k | 2 | 5.2 MB (2.9) |
| Nacre | `public/assets/nacre/facility-compounds-v2-remodel.glb` | 6.6k / 9.5k | 4 | 4.4 MB (3.1) |

**For comparison:** the six v1 plants totalled 44,156 triangles, about 7.4k each, with no textures.

**Draw calls:** one per material, and each draw instances every plant of that kind. The materials are the baked surface plus glow; Nacre adds its ember and pool glows.

**Textures:** each world has three 2048² JPEG maps (colour, roughness/metal, normal) and AO in the vertex colours.

**Triangle budget:** small trim (boxes thinner than 0.07 or shorter than 0.3, and narrow cylinders) is built without the chamfer bevel. That bevel would quadruple a small box's triangles for an edge the camera cannot resolve. This cut the Khepri pair from 64k to 39k triangles.

## Rebuild

Headless Blender from WSL. `remodel_run.py` passes `--planet=` through to the builder:

```
cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
    --python "$(wslpath -w tools/blender/remodel_run.py)" -- facilities [--planet=khepri] [--no-export] [--no-preview]
```

The builder asserts the seat bounds, the court and the area ratio before it bakes. The plating is finer than on the bosses (`<world>_facility` styles), and Vesper gets broad snow caps.

The game-view previews go to `lookdev/facility-remodel/` (ignored) and are collected in `previews.jpg`. The in-game before/after sheet is `docs/screenshots/facility-remodel/before-after.jpg`.

**Rollback:** the v1 file and its builder stay in place. Pointing `assetOf` in `facility-view.ts` back at the shared GLB needs the v1 single-material loader from git history (`7472fc5`..`32caf55`).
