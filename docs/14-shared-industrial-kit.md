# Shared industrial kit

The cross-planet kit of tiling pipes, tanks, containers and a mid-size processing hall, shaded per world from masks so
one model set serves every planet. The user asked for it (14 October): tiling piping and generic industrial assets in a
shared folder usable on every planet. Planet-specific landmarks stay in each planet's own kit (Khepri:
[docs/13 §3b](13-khepri-world.md#3b-infrastructure-kit-contract)).

## 1. Files

- Source: `tools/blender/kit_industrial.py`, a seeded, deterministic Blender script that checks this contract on the
  exported file.
- Runtime: `public/assets/shared/industrial-kit.glb`; node list `SHARED_NODES` and bounds `SHARED_BOUNDS` in
  `src/world/terrain-network.ts`; module roles and sockets in `src/world/settlement-modules.ts`.
- Provenance, previews and the rebuild command: `art/shared-industrial/README.md`.

glTF rules match the planet kits: +Y up, 1 unit = 1 game unit, pivots at base centre on the ground plane (y = 0), no
textures, cameras, lights, animation or compression, `TEXCOORD_0` box-projected at 1 UV = 1 unit, hard edges where
forms are faceted.

## 2. Planet-neutral shading

Exactly three materials: `shared_metal` (structure), `shared_paint` (painted bands and panels) and `shared_light`
(emissive lamps). `COLOR_0` is a mask set, not colour:

| Channel | Meaning |
| --- | --- |
| R | baked ambient occlusion (1 open, 0 occluded) |
| G | edge wear (1 on worn edges and corners) |
| B | dust and grime (1 on low and upward faces and in crevices) |

The runtime composes the final colour from the world's palette: metal, paint, wear and dust colours from
`SHARED_PALETTE`, and lamps in the world's glow (`createSharedMaterial` in `src/render/terrain-kit.ts`). Khepri's metal
is rusted steel with orange paint and ochre dust; Luna's white enamel; Vesper's brushed metal and white enamel with blue
lamps. Assets never bake a planet colour. The code-built stand-ins (`createFallbackShared`) carry neutral masks at
contract size until the GLB loads.

## 3. Pieces

Pipes come in two diameter classes, small (Ø 0.16) and large (Ø 0.32). Every pipe's centreline sits 0.35 above y = 0
(`PIPE_AXIS`), so runs read as raised on supports. Pipe pieces snap on a 2-unit grid (`PIPE_CELL`): every open end
lies on a cell edge at the centreline height, and half-flanges at each end form one full flange per joint, without gaps
or doubled flanges.

| Node | Content | Bounds | Triangles |
| --- | --- | --- | --- |
| `pipe_s_straight`, `pipe_l_straight` | straight run, z −1 … +1, seamless when tiled | 2.0 long | ≤ 120 / ≤ 160 |
| `pipe_s_elbow`, `pipe_l_elbow` | 90° bend: enters at z = −1 along z, exits at x = +1 along x | 2 × 2 cell | ≤ 300 |
| `pipe_s_tee`, `pipe_l_tee` | straight z −1 … +1 with a branch exiting at x = +1 | 2 × 2 cell | ≤ 360 |
| `pipe_valve` | inline valve and pump block on a large straight run | 2.0 long, height ≤ 0.8 | ≤ 400 |
| `pipe_support` | rack holding one large or two small pipes at the centreline | ≤ 0.7 × 0.3 | ≤ 150 |
| `tank_vertical_0`, `_1` | cylindrical liquid tanks with roof, ring stiffeners, ladder and valves | radius ≤ 0.6, height 1.0–1.5 | ≤ 900 |
| `tank_sphere` | spherical gas tank on legs | Ø 1.1, height ≤ 1.5 | ≤ 900 |
| `tank_horizontal` | horizontal pressure tank on saddles | 2.0 × 0.8, height ≤ 0.9 | ≤ 700 |
| `container_0`, `container_1` | cargo containers and crate stacks | within 1.2 × 0.7, height ≤ 0.6 | ≤ 300 |
| `facility` | processing hall on a plinth: lit window band, roller door, annex, stair, roof units, exhaust stack with a beacon; a large-pipe socket on its flat side | 2.8 × 2.2, height 1.6–1.95 | ≤ 1,600 |

Everything stays under every planet's scenery cap. Style: credible stylized hard surface, with broad bevels, readable
rings and flanges and a few chunky valves; fine greebles disappear at phone size, and nothing is toy-like.

## 4. Runtime use

The pieces appear where a world places them: Khepri's outposts, districts and pipelines, Luna's containers, and
Vesper's outposts and pipelines. All of it is scenery: never collision, never targets, and generated from the terrain
seed only. Tank farms cluster at industrial outposts and always lie on a pipeline.

Pipelines run between outposts and off the map (`src/world/terrain-network.ts`). They leave and join at any cell on an
outpost's rim, avoid its modules, and pay a cost to cross the calm centre lane. The path search on the 2-unit grid can
use:

- straights pitched up to `PIPE_MAX_SLOPE` (about 39°);
- lifted runs over steps a little too steep for one cell;
- vertical risers up cliff steps, made from the elbow rolled into the vertical plane with vertical straights;
- level trestles across canyons up to `TRESTLE_CELLS` cells wide, and on a planet with a sea across leads up to
  `WET_TRESTLE_CELLS` (pipes never run on wet cells).

Supports are `pipe_support` frames, stacked into lattice towers under trestles and beside risers. Pipe levels stay
low enough for their racks to fit under the scenery cap (`PIPE_TOP`); on mesa tops near the cap a small line rests on
the ground on short stands. Every piece's centreline passes through its joints, and nothing floats, cuts into terrain
or exceeds the cap. `tests/world/terrain-pipes.test.ts` checks that at least 95% of planned pipeline edges connect end
to end across its seeds, that lines never float or cut through terrain, and that pipelines stay off outpost modules.

## Open

- A dedicated tall-support or bracket node would look better than stacked frames under trestles.
