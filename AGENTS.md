# Agent instructions for Last Worlds

## Mission and authority

Build a small, polished browser arcade shooter from the specification in `docs/`. This folder is the project root. The repository contains the design package and an initial playable prototype. See docs/build-status.md for actual milestone evidence.

Follow the user's current instructions first. Then follow this file, the approved milestone, and the relevant design documents. If documents conflict, prefer the explicit user-confirmed decisions in `docs/08-decisions-and-sources.md`; record and resolve other discrepancies before expanding dependent work. Do not interpret provisional balance numbers as measured facts.

## Required reading

Before implementation, read `README.md`, `docs/01-game-design.md`, `docs/05-technical-design.md`, and `docs/06-delivery-and-validation.md`. Read docs/12-implementation-contract.md, then combat, generation, art, objectives/statistics, and wide-map/camera documents for tasks in those areas. Read `docs/07-agent-handoff.md` before accepting a milestone.

## Product invariants

1. Portrait only (a phone turned sideways sees a rotate notice and the flight pauses). Hold left or right of the hero ship to move that way; the direction holds while the finger stays down, and dragging across the ship switches it (user decision, 17 October; this replaces holding the screen halves). No drag-to-position steering. No forward/backward/altitude control.
2. Main weapons fire automatically only with a valid target in their authored firing envelope. Each family retains a consistent pattern: straight, fixed fan, or explicitly homing. Do not give all guns universal auto-aim or add a manual main-fire button.
3. A plain bottom-center special button owns its pointer and must never also steer. Use simple ship/shield icons, no health/resource bars or ornate mobile-game UI. Steering hints blink gently for three seconds at flight start, then disappear; reduced-motion shows a static hint.
4. Use real 3D presentation with a simple 2D collision simulation. Ground objects use explicit target proxies; scenery never silently blocks shots.
5. Threats must allow a reachable safe horizontal path. Never require a pickup, special charge, vertical dodge, or taking damage to survive a standard encounter.
6. Campaign has exactly four slots: main weapon, special weapon, shield tech, reactor tech for handling. Endless constructs the same starter independently of campaign, with identical opportunity pools. No shared progression or side-mission rewards.
7. Main ammunition is unlimited. Do not add fuel, overheating, durability, gacha, stamina timers, paid revives, or a second currency without a design decision.
8. Procedural terrain/world generation is required in the MVP. Author enemy designs, encounters, battle sequences, and attacks; do not randomly assemble combat. Procedural hero designs are deferred.
9. Match the art brief: credible stylized spacecraft, readable forms, no toy-like or photorealistic drift. Concept images are references, never runtime backgrounds or finished model assets.
10. Performance and visibility on actual phones take priority over extra effects or content.
11. Lives and discrete shield charges are the only player protection resources; no hidden hull HP. Special recharge appears only on its button. Shields recover only from rare, explicitly budgeted pickups; never add passive regeneration or per-kill shield farming. Shields are one run-wide pool: hits use up shields first, then lives, and a replacement life does not refill shields (user decision, 15 October; this replaces "a replacement life starts with full shields").
12. The map is wider than the viewport (30 units, 2.5 screens, since 14 October; previously 36). Lateral camera follow and optional exploration are core behavior; never clamp movement to screen edges. Read docs/10-wide-map-and-camera.md.
13. Side missions only observe events. Never change targeting, damage, drops, movement, camera, or enemy behavior to accommodate one. Rewards and advancement are campaign-only; statistics are separated by mode.
14. Hero tiers are fundamentally different authored chassis. Keep fair documented central hit regions and no hidden stat benefits. Campaign visual unlocks do not affect endless starts. (User decision, 14–15 October: the starter keeps its model size but gets the hitbox planned for the third tier, about 0.42 radius instead of 0.25, because the small hitbox made dodging too easy. The relative sizing of the three tiers is revisited when the tiers are implemented.)
15. Campaign has selectable difficulty locked per attempt; endless has its own standardized sector-based difficulty ramp, independent of campaign settings. Read docs/11-campaign-difficulty.md.

## Implementation rules

- Work on the assigned milestone only. If no milestone is specified, start M0/M1. Gate expansion on evidence, not code volume.
- Proposed stack: TypeScript, Vite, Three.js WebGL2, native DOM/CSS UI, Vitest for pure systems, Playwright for browser flows. Verify compatible maintained versions at setup; pin them in a lockfile. No backend for MVP.
- Keep simulation independent of Three.js, browser APIs, and presentation timing. Render from simulation state; visual effects cannot apply damage or decide loot.
- Use a fixed 60 Hz simulation, seeded independent random streams, stable entity IDs, data-driven content, bounded pools, and explicit mode policies.
- Source balance values from validated data. Avoid multiple independent copies of a number. `docs/spec/` is an initial seed; designate one runtime source when implementing and document that transition.
- Build thin end-to-end slices. Avoid a custom engine, generalized editor, ECS framework, multiplayer architecture, or worker split before measurements justify it.
- Never use `Math.random()` inside simulation or content scheduling. It is allowed for non-gameplay cosmetic effects if their stream cannot affect simulation.
- Do not put per-projectile updates in DOM/UI state. Do not alter collision timing when quality changes.
- Use content IDs and schema versions. Save transactions must be idempotent. Never silently erase a save that fails migration.
- Add focused tests for high-risk rules and regressions. Do not inflate tests with snapshots that merely mirror implementation.
- Do not add online services, analytics, accounts, ads, purchases, remote executable content, or publishing workflows unless asked.
- Use placeholder models openly until art is approved; do not imply concept renders are screenshots of the game.

## Blender MCP

- Blender and the `blender` MCP server run on Windows; this workspace lives in WSL. Any path handed to Blender (open, save, import, export, render output) must use the Windows UNC form `\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies\...`. Blender cannot resolve `/home/...` paths.
- If the Blender tools cannot connect, Blender is probably closed; ask the user to open it instead of troubleshooting the setup.

## Working procedure

1. Inspect the actual repository and its current state. Do not assume planned source folders already exist.
2. State the milestone, acceptance criteria, and files/systems being touched.
3. Implement the smallest coherent change. Update docs when a deliberate design change is necessary.
4. Run relevant checks. For playable changes, inspect screenshots and interaction in a browser; for mobile gates, test actual hardware when available.
5. Record what was tested, devices/browser versions, measured results, remaining limits, and next action in `docs/build-status.md` (create on first implementation).
6. Report the runnable command or preview location and precise validation results. Never report an unperformed phone test as passed.

Agents may be assigned separate tasks later. Do not create additional chats or agents merely because this document describes task boundaries. When the user authorizes parallel work, agree file ownership and shared interfaces before changing overlapping files; one integrator owns the release gate.

**Parallel sessions:** if `COORDINATION.md` exists in the project root, read it before editing shared files, committing, or pushing. Post status and replies in its log. It records current file ownership, the deploy protocol, and messages between concurrently running sessions (e.g. Codex and Claude Code).

## Done means

The assigned milestone's behavior works, relevant checks pass, visual/interaction evidence has been inspected, save and mode boundaries remain sound, and the handoff names unresolved risks. If hardware is unavailable, automated checks may pass while the phone gate remains explicitly unverified.
