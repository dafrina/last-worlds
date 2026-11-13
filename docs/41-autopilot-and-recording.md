# Watching the test pilots: the live autopilot and the recorder

13 November 2026. The user: "would it be possible to record a perfect play?", "we could do it for failed runs so we can
see what happens. Make sure to build a reusable script for it", then "make it in the browser so i can see it play".

Both are development tools only: the dev hooks exist in the dev build alone (`import.meta.env.DEV`), never in the public
build.

## The live autopilot (dev server)

A test pilot (`tests/sim/pilots.ts`) flies the run live in the browser, tick by tick as in the tests, with full graphics
and sound:

```
http://localhost:4173/?dev&autopilot=skilled&mission=final-horizon&rank=4
```

| Parameter | Values |
|---|---|
| `autopilot` | `perfect` (the exact safe-gap solver), `skilled` (human limits: 0.3 s reaction, 1.2 s look ahead), `hunter`, `pacifist` (perfect evasion, nothing it fires lands) |
| `mission` | `training`, `bastion`, `cold-vector`, `deep-bloom`, `brood-strike`, `dying-star`, `silent-empire`, `final-horizon`, or `endless` |
| `rank` | 0-4 (Level 1-5) |
| `weapon`, `difficulty`, `seed` | optional (`pulse`, `standard`, `1`) |

In the console, `__LAST_WORLDS__.autopilot('skilled')` takes over the run being flown, and
`__LAST_WORLDS__.autopilot(null)` hands it back. The flight is the simulation's own: every rule and fairness check applies.

## The recorder (`npm run record`)

`tools/record-run.mjs` flies a run in Node and keeps its steering a tick at a time
(`tests/sim/record-inputs.test.ts`). It then replays it in a private dev server (no hot reload, its own port and cache)
one frame at a time, and pipes the frames into Playwright's ffmpeg as a VP9 WebM in `recordings/` (git-ignored). The
simulation is deterministic: at the end the replay is checked against the recording's time, kills and the ship's x.

```
npm run record -- --mission silent-empire --rank 4                                  the perfect pilot's whole run
npm run record -- --mission final-horizon --rank 0 --pilot skilled --find life --seeds 1-30 --clip
npm run record -- --mission final-horizon --rank 4 --pilot skilled --from 80 --to 110 --fps 30
npm run record -- --replay run.json --check                                          is the replay exact?
```

- `--find hit|life|fail` searches `--seeds` for the first run that has one.
- `--clip` records only clips round each event (`--before`/`--after` seconds).
- `--from`/`--to` record one stretch.
- `--quality high --scale 2` make a full-quality capture.

The headless software renderer is slow: about a second a frame at low quality and 420 × 760, and several times that at
high quality. The live autopilot is the way to watch; the recorder is for sharing.
