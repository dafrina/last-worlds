# Working on Last Worlds as an agent

How a task moves from assignment to a live deploy: what to read, how parallel sessions share the repository, the checks
that gate a release, and the report that closes a task. The project rules themselves are in [AGENTS.md](../AGENTS.md).

## Before starting

1. Read `AGENTS.md`, the [README](../README.md) (including "Where things are"), the [docs index](README.md) and the docs for
   the area being touched. User decisions are in [docs/08](08-decisions-and-sources.md); the newest deploys and their
   evidence are at the top of [build-status](build-status.md).
2. If `COORDINATION.md` exists, read it: it records which session owns which files, the deploy protocol and messages
   between concurrent sessions (Claude Code and Codex). Post your claim there before editing shared files.
3. State the task, its acceptance criteria and the files it touches. Be critical of a requested change: say so when it
   hurts fun, balance or fairness, or has side effects (AGENTS.md).

## Working in parallel

- **Worktrees:** each agent works on its own branch in its own git worktree, so sessions never edit the same checkout.
- **Ownership:** agree file ownership and shared interfaces before changing overlapping files; one integrator owns the
  release gate. Never revert or "clean up" another session's changes, and never use `git add -A`, `git commit -a`, bare
  `git stash`, `git checkout -- <file>` or `git reset` on files you don't own.
- **Dev servers:** the user's preview server runs on port 4173 and reads the shared Vite cache. A second server must use
  its own cache, or the user's server starts answering 504: use `npm run dev:isolated -- --port <free port>`
  (`tools/dev/vite.isolated.config.ts`).
- **Browser tests** against a private server: `PORT=<free port> npm run test:browser:isolated`
  (`tools/dev/pw.isolated.config.ts`). The suite is timing-sensitive under heavy load (SwiftShader); re-run before
  concluding something broke.
- **Captures** go to the git-ignored `lookdev/` folder; Playwright wipes `test-results/` on every run.
- **Blender** runs on Windows; paths handed to it use `\\wsl.localhost\Ubuntu\home\davidfarina\Projects\alien-skies\…`.
  Start it minimized. If the Blender tools cannot connect, ask the user to open Blender.

## The release gate

Run on the exact commit to be deployed:

1. `npm run typecheck`
2. `npm test` (Vitest; a few long fairness and terrain suites can time out under heavy load: re-run that file alone)
3. `npm run build`
4. the browser suite, `npm run test:browser` or the isolated variant. Read Playwright's own exit status; piping its output
   through `tail` once hid failures.
5. For anything a player sees: inspect screenshots at phone size on High and Low, and show the user stills at every
   visual milestone.

Phone hardware tests are reported only when actually performed; desktop emulation never stands in for them.

## Deploying

The integrator merges finished branches into `integrator-next`, runs the gate there, then pushes the same commit to
`main`. Every push to `main` runs `.github/workflows/pages.yml` (unit tests, typecheck and build) and publishes
<https://dafrina.github.io/last-worlds/>, so **a push to `main` is a public release**. After the Pages run, check that the
live bundle name matches the build and smoke-test the live site. The user wants every verified stable state deployed
promptly. Record the deploy in `docs/build-status.md`: what changed, the gate results with counts, the Pages run, the live
check, and what was not tested (normally the phone).

## Completion report

A short factual report:

1. What was done and the resulting player-visible behaviour.
2. Changed systems and files, and how to run or preview the result.
3. Checks run, their results, browser and device evidence, measurements.
4. Known limits and any acceptance criterion still unverified.
5. Design deviations, their reasons, and the matching decision-log entry.
6. The recommended next task.

Never call something "production ready", "mobile optimized", "deterministic everywhere" or "fully balanced" without the
evidence. Unverified gates stay open in `docs/build-status.md`.
