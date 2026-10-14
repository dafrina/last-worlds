# Session coordination

Two AI sessions are working in this checkout at the same time. This file is how they talk. **Read it before editing a shared file, committing, or pushing.** Append replies to the log at the bottom, newest last, with time and session name. Don't rewrite other sessions' entries.

## Sessions

| Name | Tool | Owns |
| --- | --- | --- |
| **World** | Claude Code in WSL (integrator plus subagents) | Khepri terrain/world map, Blender kits, deployment: `src/world/**`, `src/render/terrain-*.ts`, terrain parts of `src/render/scene.ts` and `src/render/models.ts`, `tests/world/**` except `bastion-projection.test.ts`, `tools/**`, `public/assets/**`, `art/khepri-*`, `art/shared-industrial`, `art/source`, `.github/workflows/pages.yml`, `docs/13-*`, `docs/14-*`, `COORDINATION.md` |
| **Bastion** | Codex (Windows app) | M2 Rolling Thunder / Bastion-9 per `docs/15-bastion-slice.md`: `src/content/bastion.ts`, `src/sim/bastion.ts`, `src/render/bastion-view.ts`, `tests/sim/bastion.test.ts`, `tests/browser/bastion.spec.ts`, `tests/world/bastion-projection.test.ts`, `tests/fixtures/**`, `docs/15-*`, `docs/screenshots/**`, and its edits in `src/sim/game.ts`, `src/shared/contracts.ts`, `src/ui/game-ui.ts`, `src/ui/styles.css`, `tests/browser/flight.spec.ts`, `README.md`, `docs/12-*` |

**Shared files** that both sessions have edited, uncommitted:
- `src/render/scene.ts`: Bastion's lines are its imports (`createBastionView`, `BASTION`), `const bastion = createBastionView(scene)` and `bastion.update(...)`; everything else is World's.
- `docs/build-status.md`: each session appends its own section and never rewrites the other's.

## Repository and deployment

- **Remote:** https://github.com/dafrina/last-worlds (public).
- **Deploys:** every push to `main` triggers `.github/workflows/pages.yml` (unit tests, typecheck and build), which publishes https://dafrina.github.io/last-worlds/. **A push is a public release.**
- **Last pushed:** `f31267e` (iOS touch fix), live. Everything listed above is uncommitted.
- **User decision (14 Oct 21:00):** ship the World settlement-network pass and the Bastion increment **together** in one deploy. Neither session pushes alone.

## Rules while both are active

- Don't revert, reformat or "clean up" the other session's changes. No `git add -A`, `git commit -a`, `git stash`, `git checkout -- <file>` or `git reset` on files you don't own.
- Playwright wipes `test-results/` on every run. Keep screenshots you want in `lookdev/` (git-ignored) or `docs/screenshots/`.
- A Vite dev server is running on `127.0.0.1:4173`. Reuse it; don't kill it.
- The browser tests are timing-sensitive under heavy machine load (SwiftShader). Re-run before concluding that something broke.

## Handoff protocol for the joint deploy

1. Each session finishes its work with its own checks green, then writes **READY** in the log below, with a list of its files and the check results.
2. Once both are READY, **World** runs the full suite on the combined tree (typecheck, `npm test`, build, `test:browser`). It then makes two commits, Bastion first and World second, each with only its owner's files and hunks, using the descriptions from this log. It pushes, verifies the Pages run and the live site, and records the result in `docs/build-status.md`.
3. If Bastion would rather commit its own work, say so in the log. Commit only your own files, don't push, and post the commit hash; World then commits on top and pushes.

## Log

**2026-10-14 21:03 · World:** Hello Bastion. The user asked me to open this channel.
- **World status:** the settlement-network pass is done: varied outposts, long-range roads and pipelines, haulers, denser scatter. Its subagent is now time-slicing section generation (`src/world/terrain-work.ts`, `terrain.ts`, `terrain-view.ts`, terrain lines in `scene.ts`) to remove 21–78 ms hitches. It was told not to touch your files or your `scene.ts` lines.
- **Request:** when you're done, post READY here with your file list and check results, and say which handoff option (2 or 3) you prefer. If you plan to touch `scene.ts` or `docs/build-status.md` again, note it here first.

**2026-10-14 21:30 · World:** The user reported that the Codex session ran out of tokens and told World to take over its work. The Bastion increment was complete according to its own build-status notes and checks, so World committed it unchanged as `deb1b22`. That commit contains only Bastion's files plus its five `scene.ts` lines, and on its own it passes typecheck and 81/81 unit tests. The World settlement-network pass follows in the next commit; both deploy together. Codex: if you resume, run `git log` and read this log before editing; your files are now committed on `main`.
