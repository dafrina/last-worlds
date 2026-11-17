# Luna, the training ground

Luna, Khepri's moon, is where every pilot starts: the campaign's Training mission and endless's opening sector, both
ending with WARDEN-1, the smallest boss. This doc covers the world, the mission and the boss. The user asked for a basic
moon training level with craters and sparse, simple infrastructure on 15 October, and for a small human-made boss that
opens endless the same day (internally the world is `luna`).

## 1. The world

- **Terrain** (`src/world/terrain-luna.ts`, profile `LUNA`): grey regolith in four moods along the route (`LUNA_MOODS`:
  cratered highlands with mountain massifs and lobate scarps, dark mare plains with wrinkle ridges and sinuous rilles, a
  basin rim of mountains, a saturated crater field), never the same mood twice in a row. Craters at four scales
  (`lunaCraters`): fresh, mature or degraded, with a bowl, a raised rim and an ejecta apron out to 1.8 radii; the big ones
  have flat floors; mare plains keep fewer. Relief details: [docs/26 § 6](26-terrain-relief.md). No water.
- **Outposts** (`lunaSettlement`): sparse bases from the Khepri infrastructure kit and the shared kit (a landing pad with a
  habitat, a comm dish with a solar array, or an abandoned habitat), often in pairs facing across the route, joined by
  rover tracks. No pipelines (`pipes: false`).
- **Scatter** (`lunaScatterSteps`): Khepri kit boulders and rocks along crater rims and over young ejecta, a few rock clumps
  on the highlands; mare plains stay bare. The kit's basalt is greyed (`lunaLook` in `src/render/terrain-kit.ts`).
- **Look** (`LOOKS.luna` in `src/render/scene.ts`): a low hard white sun, black sky, faint grey fill, no haze, and a dark
  sky reflection map (`createLunaEnvironment`). The Khepri-built enemy craft wear a steel-blue paint on Luna so they read
  apart from the hero; their glow and threat lights keep their colours.
- **Hints:** boss and wave hint messages show on Luna only (`showsHints` in `src/content/missions.ts`; user, 30 October).

## 2. WARDEN-1

A decommissioned human lunar defence lander (`src/content/warden.ts`, view `src/render/warden-view.ts`, model
`public/assets/luna/warden.glb` built by `tools/blender/boss_warden.py` after the user's design sheet; see
[art/bosses](../art/bosses/README.md)).

- **Targets:** two turret pods (the first pair) and the command module (the core), whose two front armour halves slide
  apart over a reactor capsule. Legs, wings and hull are scenery: no hidden collision.
- **Fight:** the generic boss phases (arrival, pods, command module, overload, destroyed, extraction), split 40/25/35
  (`BOSS_PHASES`), with generous warnings, slow three- and four-bolt bursts and a gentle pace; it teaches the boss phases.
  Its numbers are `WARDEN` (hit points, warnings, recovery, bursts, the overload lanes); the campaign multiplies its health
  by `MISSION_PRESSURE.training.bossHp`.
- **Flight:** it hovers above the ground on its thrusters (`WARDEN.targetHeight` includes the hover), descends from beyond
  the view on arrival, sways and surges a little around its post, and drops to the ground when destroyed.
- **It must be killed** in every mode (user rule, 15 October).

## 3. Training

`MISSION_PLANET.training` is `luna`. Training's authored cues teach air squadrons, ground batteries and the special; its
approach closes at `WARDEN.approachEndsAt`, the scroll eases to a stop over a levelled stretch (`WARDEN.arena`) and
WARDEN-1 lands at `WARDEN.arrivesAt`, a few seconds after the last squadron leaves. After the kill the scroll holds over
the wreck, then the extraction. Shield cells: `WARDEN.shieldSupplies`. Repeats are gentler than any other mission
(`MISSION_CADENCE.training`), so Luna's added challenge is its boss's health ([docs/11](11-campaign-difficulty.md)).

## 4. Endless prologue

Endless sector 1 is Luna: it flies Training's teaching phrases up to the boss sector's cut-off, then WARDEN-1 lands, then a
hyperdrive jump to Khepri ([docs/18](18-endless-planet-cycle.md)). The pace and difficulty ramps count from sector 2
(`endlessRampSector`), so Khepri's first sector keeps its calibrated difficulty.

## 5. Tests

- `tests/world/terrain-luna.test.ts`: the mission's world, determinism, no water or pipelines, scenery under the cap and
  from the Khepri kit only, crater coverage and relief, sparse outposts.
- `tests/sim/warden.test.ts`: the fight's phases and the kill-to-complete rule; the fairness suites fly Training on every
  difficulty.
- `tests/world/cinematic-assets.test.ts`: the model's node contract and weak points on their camera rays.
