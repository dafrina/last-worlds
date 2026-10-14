# Khepri world map: visual target, layout, and asset kit contract

Design v0.5 · 14 October 2026. The user asked for a procedurally generated Khepri world map that looks like the accepted concept art, built one planet at a time, with Blender used for modelled pieces. This chapter turns the concepts into rules for the seeded world generator and the Blender kit. It refines [worlds and generation](03-worlds-and-generation.md) and [wide map and camera](10-wide-map-and-camera.md); combat rules there are unchanged.

## 1. Visual target

References: `art/concepts/02-portrait-combat.png`, `art/concepts/03-minimal-hud.png` (same terrain, current HUD), and the left panel of `art/concepts/01-worlds-direction.png`. The user explicitly likes these images. Match their terrain language, simplified for phones:

- **Ground:** warm rust-ochre dust (roughly `#a65a2c` base, `#c47a44` lit dust, `#8a4424` darker patches), fine grain, sparse dark pebbles. No texture confetti; detail reads at phone size.
- **Columnar basalt cliffs:** the defining feature. Mesa walls built from clustered vertical polygonal columns, dark warm basalt sides (`#3a2e28`–`#5a4232`), dusty ochre tops, broken and stepped tops, talus rubble at the base.
- **Turquoise mineral seams:** glowing cyan (`#2fe0d4`, glow `#8ffcf0`) pooled at cliff bases and running into cracks, plus small crystal clusters. Accent, not a river.
- **Composition:** take the concepts' materials, formations and light, not their corridor framing. The user wants natural valleys and mountains, "as if the landscape is miniaturized" (like a tabletop relief of real geography), while infrastructure, vehicles and turrets keep their readable game size. No artificial corridors of rock walls (see §2). Bullet paths mostly cross calm ground.
- **Alien, not Earth desert (user request):** Khepri's strangeness is mineral and geological. It shows through exaggerated hexagonal basalt (fan-shaped column formations, towering stacks, tilted column fields), glowing turquoise vein networks across plains, terraced mineral pools in valley floors, large crystal growths breaking out of cliffs, hoodoos with balanced caps, and a faint cool teal/violet haze settling in deep valleys against the warm sun. Vegetation-like life belongs to Nacre, not Khepri.
- **Lighting:** low warm sun from the upper left and slightly behind the view, so column tops are lit, camera-facing faces are darker, and shadows fall toward the lower right. Saturated but restrained, not washed out.

Concept images are references only, never runtime backgrounds. Readability outranks fidelity: reduce contrast and density where they compete with shots, warnings, or targets.

## 2. Procedural layout rules

Terrain remains pure, seeded scenery: it never reads or changes combat, loot, encounter timing, or positions. All placement derives from `seed` plus world coordinates, so sections are identical regardless of load order and join without seams.

User decisions of 14 October, in order: no artificial corridors of rock walls; yes to natural valleys and mountains at a miniaturized-geography scale; much more vertical depth; ground enemies on every terrain level; it must look alien.

- **Landforms first:** the heightfield carries real macro geography: mountain massifs and ridgelines, deep valleys and canyon networks that branch naturally (dendritic, at any angle, never parallel lanes along the flight direction), tiered plateaus and mesas, basins and passes. Use ridged and domain-warped multifractal noise with erosion-like valley carving, at a scale where one landform spans much of the 36-unit map, so formations feel like geography seen from high above.
- **Vertical depth:** valley floors reach about −6, peaks and plateau rims at most 2.2 (≈ 8 units of relief). Keep floors ≥ −8, and tune within that range by screenshot. The flight plane stays at y = 3; depth below it costs no clearance.
- **Slope-driven materials:** steep faces are dark columnar basalt (rock detail plus vertical column striation, world-space/triplanar); flat ground is ochre dust; rims and ledges carry lighter dust; valley bottoms are darker, with the mineral features. Heightfield resolution must keep ridges and cliff rims crisp (≈ 0.375–0.5 unit steps, within budget).
- **Kit dressing:** basalt pieces sit on cliff rims, ledges, outcrops and scree as surface detail. Their small size relative to the landforms sells the miniature scale. Add rock fields, talus aprons, fallen columns and boulders.
- **Alien features (see §1):** fan-shaped columns and towering stacks, crystal growths on cliffs and spires, hoodoos, glowing vein networks, terraced mineral pools in valley bottoms, and cool teal/violet haze that thickens with depth.
- **Moods along the route:** seeded regions alternate between canyon country, high mesa plateaus, open basins with buttes, and mineral flats, matching the open/industrial/landmark families in chapter 3. Never the same rhythm twice in view.
- **Readability:** keep plenty of calm ground visible; the tallest, busiest features must not dominate any viewport-sized window. The authored center/west/east routes get softly calmer terrain, never walls.
- **Height cap:** scenery top ≤ 2.2 world units, leaving at least 0.8 clearance under the flight plane at y = 3. Scenery is never collision and never occludes markers; projectiles and markers continue to draw without depth testing.
- **Ground enemies on every level:** turrets and ground vehicles stand wherever their authored position lands: valley floors, slopes, ledges, plateaus or peaks. `terrainSample` is the seating height, and `groundPlacement` must search a range wide enough for the full depth. On slopes, a render-only foundation plinth extends down to the lowest ground under the footprint. When terrain in front hides a ground target's model, draw a subtle occlusion silhouette; markers already draw on top. None of this alters simulation or targeting.
- **World edges:** keep readable boundary cues at x = ±18.
- **Industrial districts:** outposts sit on flattened open ground (valley floors, plateaus, broad ledges) at their real game size; they must not fight the basalt composition.

## 3. Blender asset kit contract

Source: `tools/blender/khepri_kit.py`, a seeded, deterministic Blender Python script that builds every kit mesh from code and exports the runtime file. Output: `public/assets/khepri/khepri-kit.glb`. Preview renders and provenance live in `art/khepri-kit/`. Rebuild headless with Blender 5.2 on the Windows host (see `art/khepri-kit/README.md`).

glTF 2.0 binary, +Y up, 1 unit = 1 game unit, no textures, cameras, lights, animation, or compression. Top-level node (object) names, all pivots at base center (0, 0, 0), every piece extending 0.1–0.15 below y = 0 so it seats on uneven ground:

| Nodes | Content | Bounds (x/z footprint, height) | Triangles each |
| --- | --- | --- | --- |
| `basalt_clump_0` … `basalt_clump_5` | 4–9 irregular 5–7-sided columns, diameters 0.28–0.55, varied heights, mostly flat tops with some angled/broken ones, small top bevel | within 1.6 × 1.6; tallest top exactly 1.0 | ≤ 450 |
| `basalt_column_0` … `basalt_column_2` | single column / broken stub | within 0.6 × 0.6; top 1.0 | ≤ 80 |
| `rock_0` … `rock_5` | angular basalt rocks and pebbles | within 1 × 1; height ≤ 0.7 | ≤ 60 |
| `crystal_0` … `crystal_2` | turquoise mineral shard clusters | within 1 × 1; height ≤ 0.8 | ≤ 160 |
| `basalt_spire_0` … `basalt_spire_2` | tall narrow towers of 3–6 columns with ragged stepped tops, for buttes, hoodoos and cliff promontories | within 1.0 × 1.0; tallest top exactly 1.0 | ≤ 450 |
| `basalt_wall_0` … `basalt_wall_2` | elongated cliff-face segments, 6–14 columns in a 2–3-deep band, stepped and notched tops, long axis along x | within 2.6 × 1.2; tallest top exactly 1.0 | ≤ 700 |
| `basalt_fallen_0` … `basalt_fallen_1` | toppled, tilted and broken column pieces lying in rubble | within 1.6 × 0.6; height ≤ 0.5 | ≤ 200 |
| `boulder_0` … `boulder_1` | large angular basalt blocks | within 1.2 × 1.2; height ≤ 0.9 | ≤ 120 |

| `crystal_spire_0` … `crystal_spire_1` | large turquoise crystal growths breaking out of rock, alien landmark accents | within 1.2 × 1.2; tallest tip exactly 1.0 | ≤ 300 |
| `basalt_rosette_0` | fan-shaped radiating cluster of tilted columns | within 1.8 × 1.8; top 1.0 | ≤ 600 |
| `hoodoo_0` … `hoodoo_1` | eroded spire with a balanced basalt cap | within 1.0 × 1.0; top 1.0 | ≤ 250 |

The second group was added after the user found the first formations too uniform, and the last three for an unmistakably alien look; the runtime must mix all variants.

Exactly two materials: `khepri_basalt` (vertex-colour albedo, rough, non-metallic) and `khepri_mineral` (turquoise, emissive). Basalt clumps may use `khepri_mineral` on a few crack faces. Basalt geometry carries `COLOR_0` vertex colours: dusty ochre on upward faces, dark warm basalt on sides, darker crevices (baked AO). Columns use hard edges. The runtime may replace materials with its own shading but keeps vertex colours and the material-name split. Target file size ≤ 1.5 MB.

The runtime scales clumps in y to the local cliff height, rotates them, and varies xz scale by at most ±20%. It must keep working with simple fallback geometry when the kit is missing or still loading.

## 3b. Infrastructure kit contract

The user judged the code-built outpost props (landing pad, refinery, relay, cargo, track) too cheap next to the modelled terrain. They are replaced by modelled Khepri infrastructure: graphite foundry machinery with broad bevels, plate seams, pipes, vents and restrained greebles that survive phone size; weathered ochre/rust paint accents; amber work lights; ochre dust accumulated on low and upward surfaces. Credible stylized hard surface matching the terrain and enemy craft, never toy-like.

Source: `tools/blender/khepri_infra.py` (seeded, deterministic). Output: `public/assets/khepri/khepri-infra.glb`; previews and provenance in `art/khepri-infra/`. Same glTF rules as the terrain kit (+Y up, game units, no textures/cameras/lights/animation/compression, `COLOR_0` with baked AO, edge wear and dust, `TEXCOORD_0` box-projected at 1 UV = 1 unit). Exactly two materials: `khepri_infra` (vertex-colour albedo) and `khepri_light` (amber emissive). Pieces are authored at their real game size; pivots at base center; they extend 0.05 below y = 0 (track: flush).

| Node | Footprint x × z | Height | Triangles |
| --- | --- | --- | --- |
| `infra_landing_pad` | 5.4 × 6.2 | ≤ 0.3 | ≤ 1,500 |
| `infra_refinery` | 4.1 × 5.1 | 1.6 (≤ 1.8) | ≤ 4,000 |
| `infra_relay` | 0.85 × 1.0 | 1.6 (≤ 1.8) | ≤ 1,200 |
| `infra_cargo_0` … `infra_cargo_2` | 1.05 × 1.75 | ≤ 0.65 | ≤ 900 each |
| `infra_track_segment` | 1.35 × 2.0, tiles seamlessly along z | ≤ 0.05 | ≤ 200 |

The runtime places these at scale 1 (district layout heights follow the authored heights) and tiles track segments along each track's length. Surface detail may come from the CC0 `metal_plate_02` maps in `art/source/polyhaven/`.

## 4. Budgets and quality

Terrain contributes at most about 60 draw calls and 120k visible triangles on the High tier, within the 100-call / 180k-triangle low-tier scene guardrail in [technical design](05-technical-design.md). Low tier may thin cosmetic scatter only; it never changes layout, heights, or anything the simulation reads. No `Math.random()` anywhere in generation.

As implemented (14 October), with deviations from the first draft:
- **Culling:** there is one `InstancedMesh` per kit node, refilled with only the in-view instances whenever the camera passes a margin. Ground meshes are split into lateral strips with exact culling boxes. Draw calls are therefore bounded by node count, and triangles track what is on screen. The first draft had per-section instanced strips.
- **Heights:** the heightfield spans −8 to 2.0 (floors near −6). Rim columns may rise to the 2.2 scenery cap. Outposts sit on terraces capped at 0.5, so 1.6-tall structures stay under the cap.
- **Textures:** ground shading uses one detail tap on flat ground and two on steep faces, with no ground normal map on any tier. The kit normal map is High tier only.
- **Measured** in SwiftShader (no phone yet): 32–48 total draw calls and about 20–32k triangles in view. The Node sweep's worst case is 44 calls and 52.6k triangles. Section generation takes 13–27 ms in Node and may cause a short hitch about every 9 s on phones; this is unmeasured on hardware.

## 5. Ownership for this pass

- Kit agent (complete): `tools/blender/khepri_kit.py`, `khepri_infra.py`, `shared_industrial.py`; the three GLBs under `public/assets/`; `art/khepri-kit/`, `art/khepri-infra/`, `art/shared-industrial/`.
- World/render agent: `src/world/`, `src/render/scene.ts`, new `src/render/terrain-*.ts` files, terrain-related parts of `src/render/models.ts`, `tests/world/`.
- Integrator: this document, `src/shared/contracts.ts`, `src/main.ts`, other docs, and final verification.

Simulation, content, input, and UI files are out of scope for this pass.
