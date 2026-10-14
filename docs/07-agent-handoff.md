# Instructions and prompts for build agents

This document turns the design into bounded assignments. Use it when implementation begins; the planning package itself does not start an implementation task or authorize spawning agents.

## First build prompt

```text
Work in the alien-skies project. Read AGENTS.md, README.md, and the required
design documents. Implement M0 and M1 only: a runnable portrait browser
feel prototype, not the campaign or full content plan.

Use TypeScript, Vite, and Three.js WebGL2 with a renderer-independent fixed
60 Hz simulation. Verify current compatible dependencies and commit the
lockfile. Add documented install/dev/test/typecheck/build commands.

The user-confirmed control scheme is hold-left-half / hold-right-half,
with one dedicated special button. No default drag steering or manual
main-fire button. A second touch on special must never steer. Main fire
occurs only when a damageable on-screen target intersects the weapon's
forward firing envelope. Player has no forward/backward/altitude control.

Build a 9:16 orthographic combat frame, simple readable graybox craft and
terrain, one Pulse main, Shockwave, lives/shield-charge icons, an air
enemy, a ground turret with a screen-aligned combat proxy, and three
authored dodge patterns. Add the wider map, lateral camera follow, true
world boundaries, discovery, and offscreen state persistence. Use a plain
bottom-center special button. Steering hints blink gently for three
seconds only. No hull HP or extra resource bars.
Include debug controls for reset/seed/colliders.
Implement pause, visibility handling, resize, pointer cancel, and a clear
unsupported-WebGL2 screen. Do not use the concept images as backgrounds.

Run the focused M1 tests, inspect the working browser, and report what
actual mobile testing is possible. Do not claim phone ergonomics or GPU
performance from desktop emulation. Record evidence and remaining gates
in docs/build-status.md. Stop at the M1 gate and recommend specific feel
tuning from observed evidence before expanding to M2.
```

## Subsequent milestone prompts

### M2: complete the slice

```text
Continue from the accepted M1 prototype. Implement M2 in the delivery
plan: the 200-second Khepri test mission, Pulse and Scatter, Bastion-9's
authored modules/phases, matching stylized models/effects/audio, tutorial,
HUD, pause, results, defeat, and retry. Read the combat, world, art, and
technical specifications first. Preserve confirmed controls and the 2D
simulation/3D presentation split. Do not add campaign grinding or a
random combat assembly. Procedural world generation is already required. Validate both guns against air and ground
targets, destroyed boss weapons, starter-clear feasibility, low-quality
readability, and actual phone performance. Deliver a playable slice and
evidence against M2, with placeholder assets clearly identified.
```

### M3: campaign and reliable progression

```text
Implement M3 on the accepted slice: K1–K3, mission selection, hangar,
four-slot equipment (main, special, shield tech, handling reactor), one
credit currency, capped main ranks, campaign career/contracts, separated
statistics, selectable campaign difficulties, and versioned local saves. Add remaining equipment in
small tested steps. No weapon/life drops in campaign. Make result banking
and attempt recovery idempotent and test them under refresh, double
finalization, failure, abandon, and save migration. Keep starter equipment
viable without random support. Report observed credits per mission and
purchase pacing rather than asserting the initial economy is balanced.
Objectives observe only: prove contract on/off produces identical
combat/RNG. No target protection or changed mechanics for side missions.
Endless never advances campaign objectives or grants campaign coins.
Keep campaign difficulty locked per attempt, label its records, and
deduplicate first clears across difficulty settings.
```

### M4: fair endless play

```text
Implement M4 using the existing combat systems and a separate mode
policy: fresh standardized start, three total lives, run-only weapon
tiers, main/special swaps, sector drafts, local scores,
and authored escalating encounter playlists over a seeded streaming world. Read the generation and
fairness contracts carefully. Do not generate arbitrary bullet patterns
or ship geometry. Validate overlapping hazards at the fixed player row,
enforce content budgets, cap difficulty, and add a bounded recovery
fallback. Run the documented seed sweep and inspect difficult cases.
Prove a completed campaign cannot affect endless starters, handling,
routes, drops, choices, visuals or score. Validate camera/visibility
fairness and separate scoreboards by ruleset/category.
```

### M5/M6: release, then expand

```text
First complete M5 for a genuinely finished one-planet game: installable
HTTPS PWA, versioned offline asset packs, menu-safe updates, quality and
accessibility settings, export/import, interruption handling, and the
actual-device release matrix. Report measured limits and unresolved
device failures. Do not add more planets to avoid fixing release issues.
After M5 acceptance, implement M6: Nacre and Vesper, their six missions,
two authored bosses, and the remaining archetypes. Reuse approved
contracts and apply the same art, fairness, save, and performance gates.
```

## Task boundaries for future coordination

| Assignment | Owns | Must coordinate with |
| --- | --- | --- |
| Core simulation | Fixed step, targets, collision, damage, resources | Input, content, modes |
| Input/UI | Pointer ownership, menus, HUD, responsive fit | Canonical viewport and InputFrame contract |
| Rendering/art | Models, material setup, camera presentation, VFX/audio hooks | Canonical projection and GameEvent contracts |
| Content/design | Validated weapons, enemies, chunks, boss definitions | Simulation schema and fairness validator |
| Modes/persistence | Loadouts, rewards, lives, ledger, migrations | Simulation outcome and equipment initialization |
| Integration/QA | Scenario runner, browser flows, device evidence, release | All owners |

If several agents are explicitly assigned later, freeze shared interfaces first. Do not let two agents independently invent the same save schema or coordinate convention. Keep changes small enough for the integrator to run a complete loop. A task owner is not permission to redesign unrelated systems.

## Required completion report

Use a short factual report:

1. Milestone/task completed and resulting player-visible behavior.
2. Changed systems/files and how to run the result.
3. Tests run, results, browser/device evidence, and measurements.
4. Known limitations and any acceptance criterion still unverified.
5. Design deviations, their reasons, and the corresponding decision-log update.
6. Recommended next bounded task.

Do not say “production ready,” “mobile optimized,” “deterministic everywhere,” or “fully balanced” without the required evidence. Preserve unverified gates in `docs/build-status.md`; do not turn them green because implementation is finished.
