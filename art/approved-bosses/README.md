# Approved boss GLBs — 20 October 2026

These three runtime models are **adapted copies of the user's approved GLBs**, not newly generated hulls. `tools/blender/approved_bosses.py` is their canonical builder, executed through live Blender MCP in Blender 5.2.2. Original meshes, UVs and painted surface detail are retained. Uniform scaling, face separation, rigid pivots and measured mesh reduction fit them to the existing game.

The PNGs here are Blender authoring previews at the game's 55° elevation. Actual browser evidence is in `docs/screenshots/approved-bosses/`. [manifest.json](manifest.json) records source and runtime sizes, triangle counts and SHA-256 hashes.

| Boss | Original triangles | Runtime triangles | Runtime bytes | Selected asset |
| --- | ---: | ---: | ---: | --- |
| THE VEIL | 455,414 | 82,161 | 4,487,084 | `nacre/the-veil-v4-approved.glb` |
| BASTION-9 | 501,970 | 97,603 | 5,693,156 | `khepri/bastion-9-v4-approved.glb` |
| HELION ARK | 501,300 | 92,464 | 5,399,400 | `vesper/helion-ark-v4-approved.glb` |
| THE CRADLE (24 October, `tools/blender/approved_cradle.py`) | 1,559,054 | 74,578 | 4,509,908 | `amnion/the-cradle-v2-approved.glb` |
| HELION ARK v6 (24 October, the user's new GLB, `tools/blender/approved_ark.py` `build_clean()`) | 1,889,737 | 70,504 | 6,215,152 | `vesper/helion-ark-v6-approved.glb` |

Counts include hidden wrecks, moving parts and the Veil's reusable flight-pod template; they are not per-frame totals. Since 24 October an adapted boss stays at or under **80,000 triangles** (user: "lets raise the max to the veils 80k"); THE CRADLE was cut from 111,137 to fit. The HELION ARK v6 drops the source's two diamond pod sketches in front, and its surfaces are cleaned: planarized flat plates, the large light plates re-plated with generated plates and seams, the machinery and painted glows on the supplied paint (`build_clean()`; user: "the surfaces look way too mushy"). This is approximately an **81–82% triangle reduction**, with a 120k whole-asset regression ceiling. The Veil was compared at roughly 178k and 85k before conservative underside removal; its lower version retained the crescent silhouette and layered surfaces at the game camera. There is no 40k target overriding visible quality.

## Preserved source and rollback

- Untouched, hash-verified masters: `art/source/approved-bosses/`. These are outside `public/` and are not downloaded by the game.
- **Change only `src/render/boss-assets.ts` to select a version.** The renderer recognizes the approved rig marker and retains its PBR materials; older assets use their legacy material/animation path.
- Last published models: `nacre/the-veil-v2-carrier.glb`, `khepri/bastion-9-v2.glb`, `vesper/helion-ark-v2.glb`, `luna/warden-v2.glb`.
- The intervening procedural reference studies are archived as `*-v3-study.glb`. The three alien studies are superseded, were never deployed as approved models, and should not be used as the default rollback. The archived Veil study has a known degenerate-apex export warning.
- WARDEN-1 remains the completed reference-sheet model, `luna/warden-v3-study.glb`, built by `boss_references.build('warden')`. Its complete file is 10,220 triangles / 1,094,968 bytes. It has no supplied replacement GLB.
- The three alien unversioned filenames still contain the last published assets, protecting older bundles. Candidate/comparison exports stay in ignored `lookdev/`, not the deployment.

## Materials and hidden surfaces

All three retain the supplied base colour, normal and metallic/roughness atlases and existing UV coordinates. Working textures are 2048² instead of 4096²: base colour and metallic/roughness use JPEG; normals remain lossless PNG. Roughness is constrained to 0.34–0.86 for legible reflections. Selective emission follows the existing cyan/orange paint; it does not turn the whole painted hull into a light. Runtime damage parts get separate material instances while sharing atlas textures. Wrecks become dark and non-emissive.

Hidden-surface removal is deliberately conservative. Only low, downward-facing static triangles are candidates. Four samples per face must be occluded by other static geometry from all eight tested camera/light directions, including a margin for listing. Upper rear decks, cavities and moving parts are excluded. This removed 22,175 source triangles on Veil, 14,328 on Bastion and 927 on Ark before decimation. Visible sidewalls and silhouettes remain three-dimensional; the whole back is not flattened.

Unused areas of an atlas do not reduce its allocation. This pass downsizes the full working atlases; it does not claim memory savings from untextured invisible faces or repack the source UVs. Original 4k textures remain in the masters for future quality comparisons.

## Articulation and gameplay

The simulation, target coordinates/radii, attacks, finite deployment schedule, rewards, saves and quality policies are unchanged. The models adapt to those contracts.

- **Veil:** full crescent wings, layered central shell and crown retained. Source bay lips become hinged doors. The central shell splits into four opening petals; the established hidden heart fits inside. Source loose pods supply the two flank targets, four docked pods and a shared instanced flight-pod mesh (16 maximum). Doors anticipate the existing schedule; actual spawned entities control deployed pod positions. Wrecks, warning flashes, opening effects and deeper arrival/sinking remain driven by the existing phases.
- **Bastion:** original tracks, shoulders and tower retained. Source triangles form separate battery rings, aimed turrets and forward cannons. Cannons recoil with the existing warning/firing cycle. Central source armor slides aside to expose the fitted reactor without moving its combat target. Disabled batteries include their guns in the dark wreck assembly. The approved tracks are static geometry: the legacy scrolling belt texture must not be applied to their shared atlas.
- **Ark:** original trimaran proportions and tower retained, uniformly scaled with its keel below the Vesper waterline. Source deck turrets aim, radiator assemblies disable, bay doors slide and the central armor exposes its hidden bridge interior. Separate foam collars follow the three hulls with open water between them. It lists and sinks; there are no flight thrusters added to this vessel.
- **Warden:** completed rectangular platform, twin-barrel turrets, command hatches, masts and descent engines from the preceding reference-sheet work. Existing behavior retained.

High uses the actual articulated meshes for moving shadows. Low retains the same models, textures and combat targets but omits shadow/post passes. No new transparent full-screen layers are added.

## Rebuild

Run this through Blender MCP with the workspace UNC path. Do not run legacy builders' `main()` functions, which can clear a Blender file.

```python
import sys, importlib
sys.path.insert(0, r'\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies\tools\blender')
import approved_bosses
bosses = importlib.reload(approved_bosses)
for name in ['veil', 'bastion', 'ark']:
    getattr(bosses, name)()
    bosses.preview(name, 'lookdev/approved-bosses/' + name + '-final.png')
```

Each builder imports an immutable source into its own scene and replaces only its named generated working scene. It copies faces, UVs and normals, separates parts before reduction, then exports selected objects. `v4-approved` is the default filename suffix. Pass a different `label` for experiments. Do not overwrite archived files or reduce the originals. Update the manifest only after visual and regression checks.

Asset tests check finite geometry, budgets, required rig nodes, retained PBR maps and unobstructed camera rays through both flank targets and every exposed core at its existing combat socket. Browser tests decode the actual textures and cover live/core/overload/destroyed poses, real Veil launches, High/Low and the retained two-size facilities. The Node image substitute is only for geometry checks.

See `docs/build-status.md` for the final run and deployment evidence. Automated testing uses Chromium with SwiftShader. Actual iPhone/Android frame rate, heat/battery use and Safari remain unverified; these larger textures and meshes still need that hardware check.
