# THE VEIL — crescent carrier

**Current asset, 19 October 2026:** `public/assets/nacre/the-veil.glb`, 1,278,808 bytes, 17,466 triangles including hidden wreck variants. Editable builder: `tools/blender/cinematic_assets.py`, `build('veil')`. This supersedes the older narrow/knife-wing hulls in `the_veil.py`; that file still supplies the preserved rig pieces and preview helpers.

The user's latest carrier reference guides the shape: three overlapping crescent petals on each side, curved violet-metal armour, actual open spaces over black supporting spars, machined panel joins, teal inlays, eight decorative parked pods in recessed wing racks, and two launch throats. The narrower central prow and upper spear frame the central pearl/heart. It is wider than it is long: about **19.26 × 13.61 units**, including the wing tips. The camera shows a slice of it; lateral movement reveals the rest.

See [the graphics refinement](../../docs/22-cinematic-art-refinement.md) for the complete build instructions, material pipeline, budgets and validation. All model changes and exports were executed through live Blender MCP. No imported models or image backgrounds.

## Rig contract

glTF +Y is up, +Z faces the player. The origin is the mire surface. Runtime target height remains 2.2; no target radius, attack or launch schedule changed.

| Node | Pivot (x, y, z) | Role |
| --- | --- | --- |
| `veil_hull` | (0, 0, 0) | Static shell, frame, bays and parked pods |
| `veil_pod_left`, `veil_pod_right` | (∓3.1, 2, .4) | First weak points |
| `veil_pod_left_wreck`, `veil_pod_right_wreck` | Same as live nodes | Swap after destruction |
| `veil_heart`, `veil_heart_wreck` | (0, 2, −1.8) | Live core and wreck |
| `veil_heart_shutter_0..3` | Preserved hinges around the heart | Open about local +X by 105° |
| `veil_bay_left`, `veil_bay_right` | (∓1.7, 1.8, 2.6) | Existing functional pod launch sockets |
| `veil_engine_0..2` | Preserved x/y, z −7.3 | Stern engine markers |

Names are stable. The runtime replaces exported material slots with violet physical shell, metallic blades/frame/bronze and separate emissive channels. It opens the heart petals, swaps wrecks and handles arrival, launches, pressure release and sinking. The parked rack pods are static carrier detail; actual deployed enemies use the existing finite pod-launch system.

## Previews

`build('previews')` refreshes the following Blender authoring renders after `build('veil')`:

- `preview-veil.png`: closed carrier in portrait game framing.
- `preview-veil-exposed.png`: destroyed flank pods and open heart shutters.
- `preview-veil-top.png`: full top-down silhouette.
- `preview-veil-hero.png`: full three-quarter view.
- `preview-veil-closed.png`, `preview-veil-open.png`, `preview-veil-destroyed.png`: rig close-ups.

These are **Blender previews**, not screenshots of browser graphics. Reviewed runtime evidence is in `docs/screenshots/art-refinement/`. Real-time surfaces remain deliberately simpler than the reference illustration, with quality and actual-phone performance gates recorded in `docs/build-status.md`.
