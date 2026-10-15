# Session handoff — Last Worlds

Written 15 October 2026 at the end of a long Claude Code session (integrator plus subagents), so a new session can continue. Read this file first, then `AGENTS.md`, `docs/build-status.md` (newest entries at the top) and `COORDINATION.md`.

## 1. Where things stand

- **Live:** https://dafrina.github.io/last-worlds/. Every push to `main` runs unit tests, typecheck and build, then deploys to GitHub Pages. Repo: https://github.com/dafrina/last-worlds. `gh` is installed in WSL (`~/.local/bin/gh`) and authenticated as `dafrina`.
- **Last deployed commit:** `ac331de` — Vesper wave 2: the Cold Vector mission and the Helion Ark. The user played it and loved it: "very challenging already, interesting layout and alternations".
- **Playable now:**
  - Campaign: Training, Rolling Thunder (Khepri, Bastion-9) and Cold Vector (Vesper, Helion Ark).
  - Endless on Khepri, with the pace ramp.
  - `?planet=vesper` is a hidden preview switch that shows Vesper's world in any run.

## 2. Wave 3 in progress (NOT deployed): endless planet cycle

Contract: `docs/18-endless-planet-cycle.md`. The cycle runs Khepri sectors 1–3 → Bastion-9 → hyperdrive jump → Vesper 4–6 → Helion Ark → jump → … **User rule: the run continues only once the boss is killed; there is no timeout or retreat, however long the fight takes.**

| Part | Owner | State |
| --- | --- | --- |
| Simulation: cycle, endless bosses (kill to proceed), Vesper endless roster, pure `endlessSchedule(config)` in `src/content/endless.ts` | combat agent | **Done** in the working tree. 245/246 tests passed; the one failure was a world streaming-test timeout under heavy load. The perfect pilot kills both bosses with every weapon. |
| World: terrain follows the planet schedule, endless arenas, prefetch across the switch at up to 17 units/s | world agent | *see §2a* |
| Look: hyperdrive jump (`src/render/fx-jump.ts`), look/craft/boss switch at the flash, asset preloading, HUD planet name | graphics agent | *see §2b* |
| Integration: snapshot verification, a visual check of a jump, deploy | integrator | not started |

The uncommitted wave 3 work is preserved as described in §2c.

### 2a. World agent report: DONE
- **Route:** `src/world/terrain-planet.ts` `routeOf(...)` plus the new `src/render/terrain-route.ts` `runRoute(config)` wrap `endlessSchedule`. Each distance gets its stretch's planet and its nearest arena. In `scene.ts`, `terrain.update(seed, distance, runRoute(config))` and `terrain.world` is a routed world, so seating works unchanged.
- **Planet switch:** a split section with a hard, clean seam. Both sides are calm arena ground (Khepri platform edge against Vesper open water), and nothing stands within 3 units of the seam.
- **Arenas:** every endless boss stop gets its arena (a Khepri platform for Bastion-9, Vesper water for the Ark).
- **Streaming:** sections and kits past the switch are prefetched. Both jumps stream with 0 fallbacks at the 12.7 and 16.6 units/s peaks.
- **Checks:** typecheck clean; 251/251 tests (new `tests/world/terrain-route.test.ts`); browser 15/15; campaign and Khepri byte-identical.
- **Captures:** `lookdev/jump3-sheet.png`, `jump6-sheet.png`; real-time harness `lookdev/jump.html?sector=3|6`.
- **Open:**
  - **Look-rig timing** (graphics side): before the flash, the Vesper rows ahead render nearly black under the Khepri look; on the Vesper → Khepri jump, the last sea strip is drawn in the Khepri look.
  - **docs/18 §3 "As built"** still needs writing (route, split seam, seam clearance, `streamStats.viewFallbacks`).
  - Prefetch slices of 30–35 ms were seen under heavy load (load average 24–50); re-measure on a quiet machine or a phone.
  - **Timing measurement is still to do:** `/tmp/lw-pipes/run.sh vsteps` and `/tmp/lw-pipes/jump-run.mjs` are temporary scripts and may be gone. If so, re-measure with `lookdev/jump.html?sector=3|6`, which is git-ignored but local.
  - **Leftovers:** `missionArena()` and `runPlanet` remain in `scene.ts` (used by tests and the look fallback); remove them once callers use the schedule.
  - **Planet timing gap:** between the flash and the switch (about 6.5 units), `terrain.world.planet` still names the old planet while `state.planet` and the look name the new one.
  - **Route cache:** `routeOf` caches routes by key (`endless`, `campaign:<mission>`).
  - **Flaky tests:** `terrain-stream.test.ts` timed out once at 30 s under load average 50. The fortress browser test flaked once and passed on re-run.
  - **Docs still needed:** docs/17 (arena coast, floe sets, `terrain.features`) and docs/13 (`TERRAIN_VERSION` 10) aren't fully updated.

### 2b. Graphics agent report
_(filled in below when received)_

### 2c. Where the uncommitted work is
_(filled in below)_

## 3. Open items and ideas (not started)

- **Graphics polish:**
  - Low-tier captures of the Ark phases;
  - final toning of the Ark destruction;
  - route the `vesper_*` infrastructure nodes to `infraMaterial` (they use the kit material, with orange glow patched on);
  - the Ark has no ice sky reflection yet;
  - snow may read too bright and flat (user not yet asked).
- **Missile batteries over water:** about 29% land on water and ride a barge. To always put them on cliffs, author those squadrons as world-anchored (fixed x and s); the world agent then offered `TerrainWorld.footings` to force ice under them.
- **Training on Standard** is very hard for the scripted mid-skill bot. The user accepted the difficulty ladder (Training < Rolling Thunder < Cold Vector), so change it only if asked.
- **Perspective camera:** measured, recommendation is to keep orthographic. `?camera=perspective` / `?camera=rectified` are look-dev only. The user hasn't decided.
- **Planned design, not built:** Nacre (the third planet), the campaign hangar, economy and saves (M3), a reduced-flash setting for the VFX, and phone performance measurement (never done on hardware).

## 4. How this project was worked (conventions that held up)

- **Agents:**
  - The user allows at most 2 concurrent subagents (raised to 3, but the harness cap is 2), using a model no larger than Opus 5.5.
  - Agents were reused across tasks by resuming them, so the next session should start fresh ones with a clear brief, from `docs/` contracts plus this file.
  - **File ownership** (strict, to avoid collisions):

    | Area | Owns |
    | --- | --- |
    | Combat | `src/sim`, `src/content`, `tests/sim`, docs 02/03/11 |
    | World | `src/world`, the generation and streaming parts of `src/render/terrain-view.ts`, `tests/world` |
    | Graphics | `src/render` (except `bastion-view.ts`), `models.ts`, `water.ts`, `fx-*`, `post-*` |
    | Kit (Blender) | `tools/blender`, `public/assets`, `art/*` |
    | Codex (UI, separate app) | `src/ui`; coordinate through `COORDINATION.md` |
- **Deploys: snapshot, never the dirty tree.**
  1. `git worktree add --detach ../alien-skies-snapshot HEAD`, outside the project folder (Vite hot-reloads files inside it).
  2. Copy only the finished files into it.
  3. Run `tsc`, `vitest`, `vite build` and Playwright against a dev server on port 4180, using a copy of `playwright.config.ts` with the port changed and `reuseExistingServer: false`.
  4. Commit and `git push origin HEAD:main`.
  5. `git reset --mixed <sha>` in the main tree.
  6. Watch with `gh run watch`, then check the live site.

  The user wants **frequent deploys of any stable, verified state**.
- **Look-dev:**
  - `node tools/lookdev.mjs <label> <seed> [query]` writes fixed-seed phone captures to `lookdev/` (git-ignored). Queries: `planet=vesper`, `camera=perspective`.
  - The boss fixture is `/tests/fixtures/bastion.html?boss=ark|…&phase=…&still=1&hold=N`.
  - `lookdev/review.html` is a local review page for the user (concept vs. in-game).
- **Blender:** Blender 5.2 runs on Windows; MCP for Blender 2.1.9 is set up for Codex and for Claude Code in WSL. Kits are seeded Python scripts in `tools/blender/`, rebuilt headless with byte-identical output. Any GUI Blender must be started minimized. Poly Haven CC0 maps are in `art/source/polyhaven/`, with provenance.
- **User decisions** (all in `docs/08` and `AGENTS.md`):
  - run-wide shields; hitbox 0.42 with the model at its normal size;
  - the world is 30 units wide; slide-to-switch steering;
  - static boss arenas; endless bosses must be killed;
  - Vesper is 70% land.
