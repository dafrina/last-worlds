# Material, terrain and carrier refinement — 19 October 2026

This pass follows the user's October 18 reference: violet metallic crescent armour, black machinery, teal inlays, recessed pod bays and a rocky, luminous mire. It extends the existing game presentation; simulation, difficulty, saves, weapon patterns and target sockets are unchanged.

## Blender sources and assets

All new or revised meshes were authored and exported through the **live Blender MCP**, in Blender 5.2.2. `tools/blender/cinematic_assets.py` is the new build entry. It reuses the established hard-surface, vertex-colour and AO helpers; it creates separate named scenes and preserves the user's initial scene. No downloaded models or concept-image backgrounds are used.

| Export | Triangles, whole asset | Size | Change |
| --- | ---: | ---: | --- |
| `shared/hero-scrapper.glb` | 2,744 | 227 kB | Rust/ivory utility fighter, separate nozzle collars, cockpit rails, vents and repairs |
| `shared/facility-compounds.glb` | 7,668 | 689 kB | Three planet-specific industrial compounds, open gun courts, plants, tanks, conduits, railings and piers |
| `nacre/the-veil.glb` | 17,466 | 1.28 MB | Layered curved crescents, raised inner petals, black spars, eight parked pods, two functional launch throats, retained heart rig |
| `nacre/nacre-kit.glb` | 14,555 | 1.48 MB | Additional fractured crag feet, less blue rock, restrained broad flora glow |
| `vesper/vesper-kit.glb` | 5,591 | 552 kB | Additional pressure slabs on major cliffs/ridges |
| `khepri/khepri-kit.glb` | 7,137 | 666 kB | Tighter basalt chamfers |

Triangle counts include hidden boss wreck variants, all variants in a kit, and all three facility models. They are not per-frame counts. THE VEIL's source budget is now 18k triangles, deliberately concentrated on the major boss. The starter still uses the existing 1.1 visual scale and unchanged collision radius. The old `the_veil.py` remains the source of preserved sockets, shutters, weak points, wrecks and preview composition; its old hull is not used by the new build.

Run these from Blender MCP, with the workspace's Windows UNC path on `sys.path`:

```python
import sys, importlib
sys.path.insert(0, r'\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies\tools\blender')
import cinematic_assets as art
art = importlib.reload(art)
for task in ['hero', 'facilities', 'veil', 'terrain', 'previews']:
    art.build(task)
```

Exports use only selected objects in the active authored scene. `tests/world/cinematic-assets.test.ts` checks footprint, node/socket contracts, empty gun courtyards, finite vertices and triangle budgets. The existing terrain-kit tests check normalization and per-node budgets.

## Rendering

- All PBR bosses now receive the active planet's prefiltered reflection environment. Previously only explicitly wired craft/terrain materials received it.
- Shared mipmapped microfinish data varies roughness and surface normals. Metal gets subtle brushed wear; major panel seams are modelled. A single cached data texture per finish type avoids per-ship texture allocations and extra material draws.
- Ships, Bastion and Ark get more metallic contrast. THE VEIL adds restrained physical iridescence and clearcoat to its violet shell, with a separate dark frame and emissive inlays.
- Lighting, saturation and bloom are quieter. Large emissive flora no longer overwhelm Nacre's rocks. Khepri roads have a higher-resolution engineered bed, shoulder markings, joints and wear. Vesper's ice stops borrowing the desert's basalt texture; snow detail is subtler and cliffs use fracture variation.
- Water remains opaque, with procedural normals and sky reflections in its existing draw. Broken wind chop replaces repetitive crossed ripple bands. No screen-space reflections or additional water transparency pass.
- Engines have a narrow core and shock diamonds in their existing plume quad. Explosions add a short ring while reducing fire layers; smoke is shorter and less opaque. The general FX pools remain **240 additive / 72 alpha** particles. THE VEIL's heart opening adds a short pressure release using its existing bounded pools.
- High retains the shadow map and bloom. Low keeps the same layout/targets, skips shadow and post passes, and reduces cosmetic scatter/particles.

## Facility placement and readability

Facilities are render-only landmarks around existing ground batteries, never new enemies or collision obstacles. Each planet uses one instanced batch; at most 12 compounds are retained. Compounds persist after the gun dies and scroll out normally. A new run or rewind clears them.

Only suitable batteries receive a compound: no fuel skids, no Luna compounds, no edge-clipped plants, no crowded neighbouring guns, no roofs intruding on the flight plane. Vesper/Khepri floating batteries keep their existing pontoons. Nacre supports pier foundations over its mire. Other batteries retain the smaller legacy emplacement layout.

The courtyard stays open. The renderer clears nearby scatter and its matching shadow proxies, without changing terrain generation or target placement. Terrain itself and roads remain. Load failure retains the old emplacement path. Facilities are scenery, not extra destructible targets.

## Repeatable evidence

Run the Vite server on port 4173, then `node tools/art-refinement-lookdev.mjs final all`. A comma-separated third argument captures only named views. Images and browser/renderer evidence go to ignored `lookdev/`; selected reviewed images are copied into `docs/screenshots/art-refinement/` for handoff. Blender previews in `art/the-veil/` are authoring renders, not gameplay screenshots.

At 430 × 932, DPR 1, the reviewed frozen High scenes used 37–72 total draws including shadows and post. Nacre's dense terrain sample was 116,989 terrain triangles / 180,917 total submitted triangles; its Low sample used 43 draws with no shadow/post passes. These are scene-cost observations, **not frame-rate claims**. Software Chromium/SwiftShader is used for automated QA; an actual phone performance and heat/battery check remains outstanding.

The reference is a rendering target, not an exact image match. Real-time mesh/texture budgets remain visible at close range. See `build-status.md` for final test and deployment evidence.
