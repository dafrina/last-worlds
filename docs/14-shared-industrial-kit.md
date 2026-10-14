# Shared industrial kit (all planets)

Design v0.5 · 14 October 2026. The user asked for tiling piping and generic industrial assets, such as liquid and gas tanks, in a shared models folder usable on every planet. Planet-specific landmarks (Khepri landing pad, refinery, relay, cargo haulers, track) stay in each planet's kit; see [Khepri world](13-khepri-world.md) §3b.

## 1. Files

- Source: `tools/blender/shared_industrial.py` (seeded, deterministic Blender 5.2 script).
- Runtime: `public/assets/shared/industrial-kit.glb`.
- Previews and provenance: `art/shared-industrial/`.

glTF rules match the planet kits: +Y up, 1 unit = 1 game unit, pivots at base center on the ground plane (y = 0), no textures/cameras/lights/animation/compression, `TEXCOORD_0` box-projected at 1 UV = 1 unit (for the CC0 `metal_plate_02` detail maps), hard edges where forms are faceted.

## 2. Planet-neutral shading

Exactly three materials: `shared_metal` (structure), `shared_paint` (painted bands and panels), `shared_light` (emissive lamps). `COLOR_0` is a **mask set, not colour**:

| Channel | Meaning |
| --- | --- |
| R | baked ambient occlusion (1 open, 0 occluded) |
| G | edge wear (1 on worn edges and corners) |
| B | dust/grime accumulation (1 on low and upward faces, crevices) |

The runtime composes final colour from a per-planet palette: metal base, paint colour, wear tint, dust colour, and lamp colour. For example, Khepri uses graphite metal, ochre/rust paint, ochre dust and amber lamps; Nacre and Vesper choose their own. Assets never bake a planet colour.

## 3. Pieces

Pipes come in two diameter classes, small (Ø 0.16) and large (Ø 0.32). Each pipe's centerline sits 0.35 above y = 0, so runs read as raised on supports. Pipe pieces snap on a 2-unit grid: every open end lies on a cell edge at the centerline height, and adjoining pieces meet without gaps or doubled flanges. Half-flanges at each straight end therefore form one full flange per joint.

| Node | Content | Bounds | Triangles |
| --- | --- | --- | --- |
| `pipe_s_straight`, `pipe_l_straight` | straight run, z −1…+1, seamless when tiled | 2.0 long | ≤ 120 / ≤ 160 |
| `pipe_s_elbow`, `pipe_l_elbow` | 90° bend: enters at z = −1 along z, exits at x = +1 along x | 2 × 2 cell | ≤ 300 |
| `pipe_s_tee`, `pipe_l_tee` | straight z −1…+1 with a branch exiting at x = +1 | 2 × 2 cell | ≤ 360 |
| `pipe_valve` | inline valve/pump block for a large straight run, z −1…+1 | 2.0 long, height ≤ 0.8 | ≤ 400 |
| `pipe_support` | rack holding one large or two small pipes at centerline height | ≤ 0.7 × 0.3 | ≤ 150 |
| `tank_vertical_0`, `tank_vertical_1` | cylindrical liquid storage tanks with roof, ring stiffeners, ladder/rail, valves | radius ≤ 0.6, height 1.0–1.5 | ≤ 900 |
| `tank_sphere` | spherical gas tank on legs | Ø 1.1, height ≤ 1.5 | ≤ 900 |
| `tank_horizontal` | horizontal pressure tank on saddles | 2.0 × 0.8, height ≤ 0.9 | ≤ 700 |
| `container_0`, `container_1` | cargo containers and crate stacks | within 1.2 × 0.7, height ≤ 0.6 | ≤ 300 |

Everything stays ≤ 2.0 tall, below every planet's scenery cap. Style: credible stylized hard surface, with broad bevels, readable rings and flanges, and a few chunky valves. Fine greebles disappear at phone size; never toy-like.

## 4. Runtime use

The planet world generator lays pipelines between outposts and off the map. They leave and join at any cell on an outpost's rim, avoid its modules, and stay out of the calm centre lane. Tank farms cluster at industrial districts. All of it is scenery: never collision, never targets, and generated from the terrain seed only. A missing kit falls back cleanly.

As built (14 October), the path search on the 2-unit grid can use:
- straights pitched up to slope 0.8 (about 39°);
- lifted runs over steps up to 3.2;
- vertical risers up cliff steps, made from the shared elbow rolled into the vertical plane, with vertical straights;
- level trestles across canyons 1–3 cells wide.

Supports are `pipe_support` frames, stacked into lattice towers under trestles and beside risers. On mesa tops at the scenery cap, a small line rests on the ground on short stands.

Every piece's centreline passes through its joints. Nothing cuts into terrain (sampled every 5 cm), floats, or exceeds the cap. All 132 test-seed pipeline edges connect end to end (seeds 11/93/8831/4242). A dedicated tall-support or bracket node would look better than stacked frames; that is a candidate for the next kit revision.
