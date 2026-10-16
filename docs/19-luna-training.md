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

## 2. WARDEN-1 and the endless prologue (15 October 2026)

The user asked for a small boss on Luna, built to look human-made, and for Luna to open endless.

- **WARDEN-1** (`src/content/warden.ts`, `src/render/warden-view.ts`) is a decommissioned human lunar defence lander. Since 16 October it is modelled in Blender (`tools/blender/warden.py` → `public/assets/luna/warden.glb`, 7,898 triangles, `art/warden/README.md`); the code-built version only stands in while the model loads:
  - octagonal white-grey deck with a hazard band and panel seams, four splayed landing legs with footpads (one with a ladder), and four engine bells;
  - blue solar wings on a rear boom, an antenna with a dish and a blinking beacon, orange fuel tanks, RCS quads and handrails;
  - a command module (the core) whose two hatches slide 0.8 outward over a glowing reactor well;
  - two turret pods with twin barrels (the first pair), which yaw toward their aim during the windup.

  It descends on thrusters during its arrival. It uses the generic boss phases: arrival, pods, command module, overload, destroyed and extraction.
- **Balance:** the smallest boss.
  - HP: pods 270 each, command module 950 (Bastion-9 has 400 and 1600). Raised from 220 and 800 on 15 October at the user's request.
  - Warnings 1.05 s (was 1.15 s); slow three- and four-bolt bursts; 0.65 s recovery (was 0.75 s).
  - The perfect pilot clears it with every weapon on every difficulty without a hit.
- **It must be killed:** Training completes only after the command module falls and the 8 s extraction ends (user rule: bosses are always killed, in every mode). Training's cues are unchanged; its approach closes at 105 s, and WARDEN-1 lands at 129 s (the sortie gained a 10 s fuel-depot stretch on 16 October) on a levelled stretch of Luna; after the kill the scroll holds 1.5 s over the wreck before a 4 s extraction. The shield budget stays at 40 and 85 s (65 s on Veteran).
- **Endless prologue:**
  - Sector 1 is Luna. It flies Training's teaching phrases up to the 70 s boss-sector cutoff, then WARDEN-1 lands, then a hyperdrive jump to Khepri. The cycle (Khepri ×3, Vesper ×3) follows from sector 2.
  - The pace and difficulty ramps count from sector 2 (`endlessRampSector`), so Khepri's first sector flies exactly as sector 1 did before. This keeps the calibrated difficulty.
  - Boss sectors are now 1, 4, 7, 10, …
