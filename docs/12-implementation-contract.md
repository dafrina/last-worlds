# Prototype integration contract

The user authorized agents to begin implementation on 13 October 2026. This is M0/M1 plus the procedural-world foundation required for the MVP, not an assertion that the full MVP is finished.

Latest decisions override earlier procedural-combat proposals: generate terrain, scenery, and world layout in the MVP. Author enemy designs, complete encounter compositions, timing, attack patterns, and battles. Endless replays an explicitly authored escalating combat schedule over seeded, streaming world sections. No random battle synthesis or random encounter selection. Procedural hero assembly is deferred for later consideration. GitHub Pages is the authorized static deployment target after verification. The current art pass improves the existing Khepri prototype; the three-planet release remains Khepri, Nacre, and Vesper.

Weapon families retain distinct firing behavior: fixed straight volleys, a fixed-angle fan, and a homing family with its own forward acquisition envelope. A main weapon starts firing only with a valid visible target. Homing is an intentional property of that family, not a universal aiming correction. These rules apply to both modes and projected ground targets.

## Ownership

- Integrator: `src/shared/contracts.ts`, bootstrap/package/config, `src/main.ts`, docs, final validation.
- Combat agent: `src/sim/`, `src/content/`, `tests/sim/`.
- World/render agent: `src/world/`, `src/render/`, `tests/world/`.
- Controls/UI agent: `src/input/`, `src/ui/`, `tests/input/`.

All agents read AGENTS.md and the relevant design chapters. Work in the shared checkout; do not create chats, repositories, publish, or edit another owner's paths. Propose shared-contract changes to the integrator. Do not add dependencies or run installs independently.

## APIs

Shared types/constants are in `src/shared/contracts.ts`.

- Simulation exports `createRun(config): RunState`, `stepRun(state, input, dt = STEP): void` from `src/sim/game.ts`. No browser or renderer imports. Pause is controlled by app phase; paused/ended states cannot advance. Campaign has the 120-second training sortie plus Rolling Thunder (`mission: 'bastion'`) ending in a required fortress kill and extraction. `RunState.boss` owns encounter phases; `Enemy.bossPart` and `damageable` identify shared combat targets. See [the M2 increment](15-bastion-slice.md). Endless uses a repeating authored playlist and increasing 90-second sectors; no campaign profile input. All campaign config weapons/missions are ignored for endless start.
- Renderer exports `createRenderer(canvas): GameRenderer` from `src/render/scene.ts`. It renders mutable simulation state without mutating it. Seeded terrain is independent of combat state/RNG, retained in a bounded section window. Render enemies at flight height except turret whose visual core uses ground proxy mapping. Handle cameraX, ground targets, warnings, bullets, pickups, and temporary effects. Use authored mesh designs, not randomly generated ships.
- UI exports `createUi(root, actions): GameUi` from `src/ui/game-ui.ts`; input exports `createInput(surface, specialButton): GameInput` from `src/input/controls.ts`. Root app wires actions/phase and animation. UI manages title, campaign training / endless launch, optional campaign difficulty/weapon selectors, pause/results, minimal HUD, and temporary hints. No locked or fake unfinished campaign shop. Label this build as a flight prototype in the menu.

Render coordinates are `(x, VIEW.flightHeight, -s)` for airborne entities (3.8 since 14 October; previously 3). `VIEW.worldWidth` = 24 since 21 October (camera ±6; 30 and camera ±9 from 15 October) and `VIEW.playerRadius` = 0.42 since 15 October. The additive fields are `RunState.scrollSpeed` (the current terrain scroll; render and streaming read this, not `VIEW.scrollSpeed`), `RunState.pace` (the endless pace ramp), `BossState.vx`/`vs`, and `FormationMember.group`. The terrain API takes an optional `TerrainArena` (`terrainHeight`, `terrainSample`, the stream, and `terrain.update`). Enemy `s` is always logical combat-plane position; turret actual ground s = logical s - (coreHeight-3)*cot(55°). Player s=0. All warnings/acquisition use VIEW bounds translated by cameraX. Use shared VIEW rather than independently deriving different tactical rectangles.

No full campaign economy/save progression, boss production asset, PWA/offline guarantee, or phone-validation claim is required to call this prototype implemented. Record those later gates honestly in build-status.md. Procedural terrain and playable endless foundation are required now.
