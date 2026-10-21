# Poly Haven source textures

Unmodified source maps for the Khepri texture pass. Runtime copies are derived from these (resized/recombined) and must be listed in the kit/runtime provenance when they ship.

| Asset | Author | Source | License | Maps (1k JPG) | Real-world size |
| --- | --- | --- | --- | --- | --- |
| Dry Ground Rocks (`dry_ground_rocks`) | Rob Tuytel | https://polyhaven.com/a/dry_ground_rocks | CC0 1.0 | Diffuse (sRGB), nor_gl (OpenGL normal), Rough, Displacement | 4 m × 4 m |
| Rock Face 03 (`rock_face_03`) | Dario Barresi, Rico Cilliers | https://polyhaven.com/a/rock_face_03 | CC0 1.0 | Diffuse (sRGB), nor_gl (OpenGL normal), Rough, Displacement | 2.7 m × 2.7 m |
| Cliff Side (`cliff_side`) | James Ray Cock, Dario Barresi (photography), Jenelle van Heerden (processing) | https://polyhaven.com/a/cliff_side | CC0 1.0 | Diffuse (sRGB), nor_gl (OpenGL normal), Rough, Displacement | 1.83 m × 1.83 m |
| Metal Plate 02 (`metal_plate_02`) | Rob Tuytel | https://polyhaven.com/a/metal_plate_02 | CC0 1.0 | Diffuse (sRGB), nor_gl (OpenGL normal), Rough, Metal, Displacement | 2 m × 2 m |

Downloaded 14 October 2026 at 1k resolution through the MCP for Blender addon (v2.1.9, `import_asset`, Poly Haven integration) into Blender 5.2.2, then written out byte-for-byte from the imported images. Poly Haven assets are CC0: free for any use, attribution appreciated but not required.

## Runtime derivatives (`public/assets/khepri/textures/`)

| File | Source map | Derivation |
| --- | --- | --- |
| `khepri-ground-detail.jpg` (512 px, 121 KB) | `dry_ground_rocks_Diffuse_1k.jpg` | Luminance only; large-scale shading removed; contrast-limited |
| `khepri-basalt-detail.jpg` (256 px, 24 KB) | `rock_face_03_Diffuse_1k.jpg` | Luminance only; large-scale shading removed; contrast-limited |
| `khepri-basalt-normal.jpg` (256 px, 28 KB) | `rock_face_03_nor_gl_1k.jpg` | Downsampled OpenGL-convention normal map |

| `cliff-rock-detail.jpg` (512 px) | `cliff_side_Diffuse_1k.jpg` | Luminance ratio (log, std 0.17), shading removed with a 40 px periodic blur; `tools/blender/cliff_textures.py` |
| `cliff-rock-normal.jpg` (512 px) | `cliff_side_nor_gl_1k.jpg` | Box-filtered to 512, renormalised; `tools/blender/cliff_textures.py` |

`cliff_side` was downloaded on 21 October 2026 at 1k from the Poly Haven API (`dl.polyhaven.org`), because the Blender addon's Poly Haven library was switched off. It gives the cliff walls (terrain v15) their layered, fractured rock face (user, 21 October: "make rocky textures too so it looks more detailed"). In the image the ledges run horizontally: image x runs along the wall, image y runs up.

## Runtime derivatives (`public/assets/vesper/textures/`)

| File | Source map | Derivation |
| --- | --- | --- |
| `ice-wall-detail.jpg` (512 px) | `cliff_side_Diffuse_1k.jpg` | As the rock detail, with the grain smoothed away (1.6 px) and less contrast (std 0.11): ice layering and fractures |
| `ice-wall-normal.jpg` (512 px) | `cliff_side_nor_gl_1k.jpg` | Smoothed (2.2 px) and flattened to 60 % slope, for glassier ice |

The world/render agent derived the three original Khepri maps with a one-off headless-Chromium canvas script that was not kept in the repository. Re-deriving them means repeating these steps; a committed tool should replace that step when the texture set next changes. `metal_plate_02` is used only in Blender previews so far.

Intended use: `dry_ground_rocks` supplies grain and pebble relief for valley floors; `rock_face_03` supplies fractured surface detail for basalt column sides; `metal_plate_02` supplies plate seams, scratches and grime for Khepri infrastructure (graphite foundry machinery). Colour stays driven by the Khepri palette (vertex colours); these maps add luminance detail and normals.
