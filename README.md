# Last Worlds

**A mobile-first 3D arcade strike fighter for phone browsers.** Fly over eight hostile alien worlds, line up targets,
weave through readable attacks and bring down huge machines. The image has real depth; combat stays on one plane.

Play it at <https://dafrina.github.io/last-worlds/>. What shipped when, with its test evidence, is in
[build status](docs/build-status.md).

- **Campaign:** eight missions, Luna to Umbra, each ending with its world's boss. Credits and parts from each run buy
  weapons, weapon levels, specials, shield arrays and ships in the hangar; every world has a board of side missions.
- **Endless:** a standard start for everyone, then a cycle through the worlds with a boss and a hyperdrive jump between
  each, ramping in pace and pressure until the last life is lost.
- **Controls:** portrait only. Hold the left or right half of the screen to steer (or choose Drag or Tilt in Settings);
  the main weapon fires by itself when a target is in its path; the button at the bottom fires the special. On desktop:
  A/D or the arrow keys, Space, and Escape to pause.

## Run locally

Node 22.12 or newer.

```sh
npm ci
npm run dev              # http://localhost:4173 (the game) and /playground.html (the light and weapon playground)
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | The unit and simulation suites (Vitest, `tests/**/*.test.ts`) |
| `npm run build` | Typecheck, then the production build in `dist/` |
| `npm run preview` | Serves `dist/` on port 4173 |
| `npm run test:browser` | The browser suite (Playwright, `tests/browser/`) against the dev server on 4173; first run `npx playwright install chromium` |
| `npm run dev:isolated -- --port <port>` | A second dev server with its own Vite cache, so the one on 4173 keeps working |
| `PORT=<port> npm run test:browser:isolated` | The browser suite against its own isolated server |
| `npm run record -- --mission <id> …` | Records a flight to video with the test pilots ([docs/41](docs/41-autopilot-and-recording.md)) |

## Where things are

### `src/`: the game

| Folder | What lives there |
| --- | --- |
| `src/main.ts` | The app: the fixed 60 Hz frame loop, launch warp, pause, orientation |
| `src/sim/` | The simulation: `game.ts` (`createRun`, `stepRun`), bosses, attacks, fairness, drift, sites, perks. Pure: no Three.js or DOM |
| `src/content/` | All balance and content data: `balance.ts`, `equipment.ts`, missions, bosses (one file each), encounters and the encounter deck, the endless schedule |
| `src/world/` | Seeded procedural terrain: one `terrain-<world>.ts` per world, routes, settlements, scatter, cliff walls |
| `src/render/` | Three.js presentation: `scene.ts` (`createRenderer`), boss views, terrain and facility views, effects, post pipeline |
| `src/ui/` | Menus, hangar, mission board, HUD, statistics (DOM and CSS) |
| `src/input/` | Touch, keyboard, drag and tilt steering |
| `src/audio/` | Procedural music and sound: engine, instruments, mixer, per-world scores, boss music, title theme |
| `src/campaign/` | The campaign save (`profile.ts`) and the side-mission board (`missions.ts`) |
| `src/shared/` | Contracts and types shared by all modules, the release lens, seeded streams, storage |
| `src/playground/` | The playground page (`playground.html`): static levels for light, fog, look and weapon tuning |
| `src/dev-hooks.ts` | Dev-build-only hooks for browser tests, the live autopilot and look-dev |

### `tests/`

Unit and simulation suites by area (`sim/`, `world/`, `render/`, `audio/`, `campaign/`, `input/`, `ui/`, `shared/`), the
Playwright browser specs (`browser/`), standalone fixture pages for look-dev and browser checks (`fixtures/*.html`), and
shared helpers (`helpers/`).

### `tools/`

| Folder | What lives there |
| --- | --- |
| `tools/lib/` | `browser.mjs`: the shared headless Chromium (SwiftShader) launcher |
| `tools/lookdev/` | Fixed-seed captures for art review: `flight-views.mjs`, `terrain-views.mjs`, `contact-sheet.mjs` (output in the git-ignored `lookdev/`) |
| `tools/audio/` | Offline listening previews through the game's mixer: `music-preview.mjs`, `sfx-preview.mjs`, `menu-preview.mjs` |
| `tools/perf/` | `bench.mjs` (frame work per scenario) and `soak.mjs` (long-session memory and pacing) |
| `tools/sim/` | `balance-report.mjs` (tables from the balance suite) and `record-run.mjs` (`npm run record`) |
| `tools/dev/` | The isolated dev server and browser-suite configs |
| `tools/blender/` | Seeded Blender scripts that build every model: `boss_*` (one per boss), `craft_*` (each world's enemy fleet), `kit_*` (terrain, infrastructure and facility kits), `lib_*` (shared helpers), `props_*`, `sites_strike.py`, `hero_parts.py`, `textures_cliffs.py`; `run_build.py` runs a builder headless |

### `art/`

| Folder | What lives there |
| --- | --- |
| `art/concepts/` | Concept images and their prompts: references only, never runtime assets |
| `art/source/bosses/` | The user's supplied boss models, byte-for-byte, with checksums: never edited |
| `art/source/hero/` | Checksums of the user's Tripo hero models (the models themselves are not in git) |
| `art/source/polyhaven/` | CC0 texture sources with provenance |
| `art/bosses/` | How the boss models are built from those sources |
| `art/<world>-kit/`, `-craft/`, `-infra/`, `art/shared-industrial/` | Provenance and notes for each Blender kit |

### `public/assets/`

One folder per world (`luna/`, `khepri/`, `vesper/`, `nacre/`, `amnion/`, `corona/`, `nahara/`, `umbra/`) with its terrain
kit, infrastructure, enemy craft and boss GLBs, and `shared/` for what every world uses: the hero ship parts (`hero/`),
strike-site models (`sites/`), the industrial kit, pickup tokens and loot props.

### `docs/`

The design and technical docs, indexed by topic in [docs/README.md](docs/README.md). Start with
[game design](docs/01-game-design.md). User decisions: [docs/08](docs/08-decisions-and-sources.md). Deploy log:
[build status](docs/build-status.md). Rules for agents: [AGENTS.md](AGENTS.md).

## How changes ship

Work happens on branches in separate git worktrees. The integrator merges finished work into `integrator-next`, runs the
release gate there (typecheck, unit tests, build, browser suite), then pushes that commit to `main`. Every push to `main`
runs `.github/workflows/pages.yml` (tests, typecheck, build) and publishes to GitHub Pages, so a push to `main` is a
public release. Each deploy is recorded in [build status](docs/build-status.md). Details:
[working on Last Worlds](docs/07-agent-handoff.md).
