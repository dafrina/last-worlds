# Endless planet cycle

Endless flies a Luna prologue, then every world in campaign order, three sectors each; each stint ends with its planet's
boss, and a hyperdrive jump carries the run to the next world. This doc covers the cycle, the simulation rules and the
schedule API, how the terrain follows the schedule across planet swaps, and the jump's look and loading. The difficulty
ramp is [docs/03 §8](03-worlds-and-generation.md#8-endless-difficulty-and-seeds); endless's separation from the campaign
is [docs/11](11-campaign-difficulty.md).

## 1. The cycle

The cycle is `ENDLESS_CYCLE` in `src/content/endless.ts`: the prologue (`prologue`, `ENDLESS_PROLOGUE_SECTORS` in
`src/content/balance.ts`), then `planets` in campaign order (user, 5 November), `sectorsPerPlanet` sectors each, the last
of each stint ending with that planet's boss (`boss`). After Umbra the cycle starts again at Khepri.

| Sectors | World | Ends with |
| --- | --- | --- |
| 1 | Luna (prologue) | WARDEN-1 |
| 2–4 | Khepri | BASTION-9 |
| 5–7 | Vesper | HELION STRONGHOLD |
| 8–10 | Nacre | THE VEIL |
| 11–13 | Amnion | THE CRADLE |
| 14–16 | Corona | THE HELIOPHAGE |
| 17–19 | Nahara | THE CITADEL |
| 20–22 | Umbra | THE ECLIPSE |
| 23 … | Khepri, and the cycle again | |

The cycle, its bosses and its timings are fixed content: no randomness decides which world or boss comes next. Each
world flies its own enemies: the Luna prologue flies Training's teaching arc up to the boss sector's cut-off; a world's
first stint flies its opening stage and then its pressure stage; later visits fly its peak stage (`endlessTemplate` in
`src/content/encounter-deck.ts`). The deck draws each sector anew from the run seed and the sector
([docs/03 §6](03-worlds-and-generation.md#6-encounter-deck-and-director)).

## 2. Rules

The simulation is `updateEndless` in `src/sim/endless.ts`, called from `src/sim/game.ts`.

- **Sectors.** A sector without a boss lasts `BALANCE.sectorDuration`. Each sector's pace eases up from the previous one
  (`paceInSector`), and its message names the sector and the world (`SECTOR 05 · VESPER`). Each sector offers one shield
  cell at `BALANCE.shieldSupplies.endlessAt`.
- **Boss sectors** follow `ENDLESS_CYCLE.bossSector` (seconds from the sector's start). No ordinary cue is admitted from
  `approachEndsAt`, not even one the airspace or the budget held back, and the boss's approach message shows. The scroll
  eases to a stop from `decelStart` over `decelDuration`, exactly as in the campaign arenas, and the boss arrives at
  `arrivesAt` with its campaign definition. Its part hit points follow the endless ramp's `hp`, its shot speeds the ramp's
  shot factor times the pace's, and its recovery after each attack the ramp's cadence. Warnings, lane widths and the
  fairness admission never scale.
- **The boss must be killed** (user decision, 15 October; [docs/08](08-decisions-and-sources.md)). The fight has no
  time limit and the boss never retreats. A ship that never fires is still in the fight minutes later; it is never
  killed for low damage output. The kill scores as usual (500 per module, 5,000 for the core); credits stay
  campaign-only.
- **After the kill**, the same sequence as the campaign: the scroll holds over the wreck for `WRECK_HOLD`; the
  departure ramps the scroll to `DEPARTURE.speed` so the wreck falls out of the bottom of the frame; then the jump lasts
  `WARP.duration` (`src/content/departure.ts`; user requests, 16–17 October). The jump starts at the departure speed,
  surges to a peak sized to the distance it must cover, and settles to the next sector's cruise. The run's planet and
  look switch at the jump's flash, halfway through, and the next sector starts when the jump ends. During the jump no
  enemy, shot or hazard remains, and the player is protected from the kill until half a second after the jump. The
  ship's model has climbed over the flight plane since the kill (the departure climb, render only,
  [docs/03](03-worlds-and-generation.md)); it comes back down to the flight plane over the jump's second half, after
  the flash, so the next sector starts with the ship drawn in its row.
- **A deterministic schedule.** Sector boundaries, boss stops, arena ranges, jump windows and the planet for every
  stretch of distance follow from the run config alone, never from combat state. The scroll is a closed form of time: the
  pace ramp, the boss stops, the departure and the jump. The fight's length moves only time: the scroll is stopped during
  it, so every distance is fixed. Endless is identical for every seed.

**Schedule API** (`src/content/endless.ts`: pure, no simulation imports, memoized):

- `endlessSchedule(config)` → `WorldSchedule`, the one function the world and the renderer use: `planetAt(distance)`,
  `arenaAt(distance)` (an `ArenaSpan` or null), `jumpAt(distance)` (a `JumpWindow` or null), `stretches(from, to)` and
  `arenas(from, to)`. Only `mode` and `mission` matter. In the campaign it returns the mission's single planet and its
  arena, and no jumps.
- `endlessSectorPlan(sector)` → `EndlessSectorPlan`: the sector's planet and boss, its start and end distances, and for
  a boss sector its stop (`stopDistance`, the arena platform range) and its jump (`EndlessJump`: from, to, cruise and peak
  speeds, and the start, flash, switch and end distances).
- `endlessScroll(plan, τ, bossEnd)` → the distance, speed and phase (`cruise`, `stopping`, `stopped`, `resuming`, `jump`,
  `next`) that the simulation runs, τ seconds into the sector, with `bossEnd` the time of the kill (null while the boss
  lives).
- Helpers: `sectorPace`, `paceInSector`, `scrollForPace`, `endlessPlanet`, `isBossSector`, `isPrologue`,
  `cycleSector`, `isFirstVisit`.

The outgoing world's terrain runs on past the arena for `ENDLESS_CYCLE.postBossTerrain` (covering the departure and the
tilted camera's far view) before the schedule's planet switch (`switchDistance`); the jump ends `jumpClearance` past
the switch, so the new world fills the whole view when the next sector begins.

**Run state** (`src/shared/contracts.ts`): `state.planet` (the world the run is over; it switches at the flash),
`state.jump` (set for the jump: start, duration, from, to), `state.sectorStartedAt`, `state.scrollSpeed` and
`state.pace`. `BossState.id` names the boss.

## 3. World

- **Routes.** `runRoute(config)` in `src/world/run-route.ts` turns `endlessSchedule` into a terrain route (`routeOf` in
  `src/world/terrain-planet.ts`). Each distance resolves to its stretch's planet and its nearest arena; the simulation's
  ground seats and the renderer read the same route. A campaign mission is one planet with its arena.
- **Arenas.** Each boss stop gets its planet's arena: levelled ground on Luna, a paved clearing on Khepri, open water on
  Vesper, open mire on Nacre, and the late worlds' own arenas (`src/world/terrain-arena.ts`). Only an irregular clearing
  around the boss is flat; the planet's terrain carries on around it (user, 22 October). The clearing shapes the ground
  wherever it reaches (`arenaReaches`), and its far end is drawn out along the route (`ARENA_CLEARING.tail`), so the ship
  departs over a gentle fade into the planet's ground, never a cut (user, 31 October).
- **Planet swaps under the veil** (`RouteSwap` in `src/world/terrain-planet.ts`; user, 31 October: "the terrain in
  endless is cutoff in front"). The camera sees more ground than the ship crosses while the jump's veil is opaque, so no
  single seam can stay out of sight. The terrain therefore swaps planets in time, at the flash, under the opaque veil:
  - the route switches planets `SWAP_BEHIND` short of the flash, and the simulation's ground seats read this route;
  - the route's `outgoing` variant holds the old planet until `SWAP_AHEAD` past the flash;
  - until the flash the terrain draws the sections between the two seams from the outgoing variant, and from the flash
    from the route (`sectionSource` and `scrollRoute` in `src/world/terrain.ts`);
  - only the two or three sections around each jump have two versions. The stream prepares both, with their views, from
    `SWAP_HORIZON` before the flash, which covers the whole boss fight.
- **Seams.** A section that holds a planet switch is split; nothing stands within `SEAM_CLEARANCE` of the seam.
- **Streaming.** The next planet's kits load `PRELOAD_AHEAD` units ahead (`src/render/terrain-view.ts`). The jumps
  stream from prefetched sections with no synchronous fallback (`streamStats.viewFallbacks` counts them).

## 4. Look

- **The jump** (`src/render/fx-jump.ts`, two draws while active, none otherwise):
  - a veil of deep space covers the world, terrain above the flight plane included, and is fully opaque from `VEIL_SHUT`
    to `VEIL_LIFT` of the jump;
  - star streaks race toward the bottom of the screen, following the jump's speed profile; the camera never moves;
  - a bright flash at the middle (blooming on High) ends the streaks, and the new world emerges as the veil lifts;
  - under reduced motion (the OS setting), a slow fade to deep blue and back, with no streaks or flash;
  - the ship stays visible through every warp (`src/render/hero-stencil.ts`).
- **Switching.** The light and grade, water, sky and craft switch with `state.planet` at the flash.
- **Loading.** The next world's render assets (terrain, facility kit, strike sites, boss, craft, sky, and Nacre's water
  detail) start loading 8 s into each boss sector (`preload` in `src/render/scene.ts`), never mid-jump, and stay cached.
  The jump holds before its flash, up to its maximum hold, until the next world is prepared, its facilities are ready and
  the terrain swap is built (`terrain.swapReady()`); it never pops.
- **HUD.** The sector message names the sector and the world; the results read `ENDLESS / <world>`.

## 5. Tests and fixtures

- `tests/sim/endless.test.ts`: the schedule opens with the Luna prologue and cycles every world in campaign order, each
  stint ending with its boss; it is a pure function of the config, contiguous in distance and linear in pace, and matches
  what the simulation does; bosses start on time with the ramp and admit no squadron after the approach; the run
  continues only after the kill, with a protected jump; each world flies its own kinds; a ship that never fires is still
  in the fight 300 s later; Needle beams rest.
- `tests/world/terrain-route.test.ts`, `terrain-route-stream.test.ts` and `terrain-route-campaign.test.ts`: routes follow
  the schedule; every boss stop gets its planet's arena; planet switches split sections cleanly; every jump streams at
  peak speed from prefetched sections, swapping at the flash.
- `tests/world/terrain-swap.test.ts`: projects the release camera (including tall phones) over every departure and jump
  and keeps both seams out of view while the veil is not opaque; only the sections around each jump change.
- `tests/world/terrain-arena.test.ts` and `tests/world/endless-clearance.test.ts`: every boss's clearing is continuous,
  with no cut behind it.
- `tests/sim/fairness-endless-early.test.ts` and `fairness-endless-late.test.ts`: every world's first stint and capped
  later visit, bosses and jumps included, on every pilot branch.
- Development fixture `tests/fixtures/endless-arena.html?sector=N` (a boss sector: 1, 4, 7, …) previews that boss's
  arena; `&phase=core|overload`, `&phase=departure&t=S` and `&quality=low` select other states.

## Open

- The incoming sections' GPU buffers upload on the flash frame, under the flash. Not measured on a phone.
- A section split at a Vesper–Nacre swap draws one water sheet, at the first watery world's sea level. The seams stay
  out of view, but this has not been checked visually since the swap was introduced.
- `tests/fixtures/bastion.html?mode=jump&n=…` looks for a boss in sector 3·n, which predates the Luna prologue (boss
  sectors are now 1, 4, 7, …); use the endless-arena fixture instead.
