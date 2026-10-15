# Luna training ground

User request (15 October 2026): a basic moon training level with craters and the same tutorial gameplay as before. Infrastructure stays sparse and simple, and existing models are reused.

Luna is the moon of Khepri; the player-facing name was chosen on 15 October (internally `luna`, previously `moon`).

## What changed

- **Mission → world:** Training now flies over `luna` (`MISSION_PLANET.training`). Its encounters, timing, shields and difficulty are unchanged, so the simulation output is identical. Endless never visits Luna (`EndlessPlanet` = Khepri | Vesper).
- **Terrain** (`src/world/terrain-luna.ts`):
  - grey regolith over rolling highlands and low dark mare plains;
  - impact craters in four sizes (cells 40 / 11 / 4.2 / 2 units), each with a bowl, a raised rim and an ejecta apron out to 1.8 radii; big craters have flat floors and a small central peak;
  - about one crater in six is young and has a bright ejecta ring;
  - mare plains carry fewer craters;
  - pure functions of seed and position, like the other planets.
- **Outposts:** about one candidate in four per cell and side. Each is a landing pad with a relay, a comm dish with solar panels, or an abandoned habitat. They use only Khepri infrastructure and the shared kit. There are no roads, pipelines or haulers (`PlanetProfile.networks = false`).
- **Scatter:** Khepri kit rocks and boulders along crater rims and young ejecta, and a few rock clumps on the highlands. The kit material greys the basalt (`lunaLook`).
- **Look** (`LOOKS.luna` in `src/render/scene.ts`): low hard white sun (30°), black sky, faint grey fill and regolith bounce, no haze. A dark-sky reflection map (`createLunaEnvironment`). Shared-kit dust is grey.
- **Enemies:** the Khepri-built enemy craft wear steel-blue paint on Luna (`materials.enemyCraft`, `paintSwap`), so they read apart from the hero. Their glow and threat lights keep their colour, and the hero is unchanged.

## Checks

`tests/world/terrain-luna.test.ts` checks:
- the mission → world mapping;
- determinism;
- no water, roads or pipelines;
- scenery under the 2.2 cap, using only Khepri kit kinds;
- crater coverage and relief;
- sparse outposts.

Fixed-seed captures were inspected in headless Chromium (git-ignored `lookdev/moon/`).
