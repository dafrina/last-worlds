# Phase predators and boss isolation · 25 October 2026

## User decisions

- Amnion's round enemy needs a dedicated eerie design instead of the Nacre Orrery.
- The new teleporting attacker belongs to **Umbra, the final world**, not Amnion. It is pitch-black, smooth, alien and spiky.
- Its attack should show its aim first, teleport, then shoot shortly after arriving. Its three rounds are fast and precise, like a stronger Pulsar. A normal enemy attacks twice; a hunter repeats until killed, with roughly five seconds between attacks.
- Main homing missiles should have a very hard time penetrating active hunter shields.
- Bosses and deployed pods must not overlay after switching worlds, including the playground.

## Wraith

Authored `wraith` kind, `wraith-solo` formation and three Final Horizon cues. Umbra's hunter director also uses it. Campaign progression never affects its endless version.

At Standard, the 0.9-second attack warning begins at the old position with an aim ray. It anticipates lateral movement by at most 1.6 units, then commits that aim. During the final 0.35 seconds it crosses to the planned destination in a 0.2-second warp and fires about 0.15 seconds after materializing. The narrow triplet has no spread: three rounds, 0.06 seconds apart, base speed 16 units/second before the existing world/difficulty/pace scales. Relaxed can extend the initial cue; the warp and arrival interval stay fixed. Projectiles do not track after firing.

The next attack may begin five active seconds after the last round. Normal Wraiths leave after the second triplet; hunters repeat. Pausing freezes the simulation. The craft can be shot during its initial feint and cooldown; only the 0.2-second transit is intangible.

Destinations alternate sides of the current camera slice, remain away from the player row and obey airspace separation. The attack director tests the planned destination and all three delayed rounds before admission. A crowded or offscreen destination cancels the attempt. A resting hunter left behind by a camera pan quietly returns before warning again. The whole volley waits if the projectile pool cannot fit all three rounds. Pending rounds are cancelled if their source dies.

Runtime sources: `src/content/wraith.ts`, `src/content/balance.ts`, `src/sim/wraith.ts`. One render streak and one transformed instance depict transit; there is no stack of transparent ship copies.

## Models

Both are authored in an isolated live Blender MCP scene by `tools/blender/phase_predators.py`. Existing boss scenes and Claude's Umbra terrain/kit assets are preserved. Exports explicitly use the active scene and selected hierarchy, preventing unrelated open Blender scenes from entering a GLB.

| Asset | Root | Triangles | File bytes | Design |
| --- | --- | ---: | ---: | --- |
| `public/assets/amnion/brood-heavy-v1.glb` | `amnion_brood_heavy` | 15,268 | 271,492 | Unequal calcified plates around an open toothed mouth; dark flesh, hanging sinews and peripheral tusks |
| `public/assets/umbra/wraith-v1.glb` | `umbra_wraith` | 11,984 | 195,024 | Faceless glossy black carapace, hooked growing spines, rear tendrils and tiny violet sensory slits |

Amnion uses its new model for the `diamond` class, including shielded hunters. Its firing and movement behaviour stays the same. Other Amnion enemy classes are outside this model replacement.

Both models preserve their own material colors and roughness without the generic industrial panel texture or faction recolor. They are merged into one instanced draw per model; preparation waits for the appropriate file before a run starts. Versioned filenames and isolated batches make later model replacement/reversion local.

## Boss isolation

The three carrier views (Veil, Cradle, Eclipse) previously all drew every `veil-pods` enemy once their models were loaded. Their deployed-pod batches now require their own active boss and placement. This removes the yellow/overlapping carrier pods without recoloring the approved Veil asset.

Bastion previously stopped receiving updates when another boss was active, leaving its old hull and effects visible. The shared renderer now updates it with a null placement when another boss owns the encounter. All six views hide inactive roots and clear their particles; carrier batches reset to zero. This applies to gameplay and the playground. Playground level loads use a revision token and publish the new state only after its assets are prepared, preventing late load completions from restoring an earlier selection.

## Main Seeker resistance

Active hunter shields absorb main Seeker hits at 20% effectiveness: five times the missile damage is needed to strip the same shield. Hull damage after depletion and special-weapon damage are unchanged. A projectile carries the weapon family it was fired from, including after a pickup or lost homing lock. The provisional 10% setting made shield fights excessively long; 20% keeps a substantial weakness while retaining the existing campaign completion limits.

## Review and validation entry points

- `tests/sim/wraith.test.ts`: attack sequence, feint/transit vulnerability, camera edges, cooldown, hunter repetition, full-volley pool budget, real normal exit, shield resistance and in-flight weapon provenance.
- Existing campaign, endless and independent fairness suites retain their seeds, completion limits and no-hit/no-special/gap assertions. The scripted Seeker pilot prioritizes softer targets before shielded hunters, except beam craft whose persistent lane hazards still need immediate attention. Its delayed observations copy nested state instead of retaining live mutable references.
- `tests/browser/faction-regressions.spec.ts`: all six playground bosses in one renderer, loaded carrier pod ownership, boss toggle-off, and both predators on Low/High.
- `/tests/fixtures/phase-predators.html?planet=umbra` (or `amnion`) is a development-only rendering fixture. Blender renders and browser screenshots are under `lookdev/phase-predators/`.
- Actual phone performance remains a hardware check; desktop SwiftShader results are not phone measurements.
