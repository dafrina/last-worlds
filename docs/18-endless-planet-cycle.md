# Endless planet cycle: bosses and hyperdrive jumps

Design v0.7 · 15 October 2026. The user asked how endless should cycle between worlds and wants the bosses in endless too. Agreed approach: a short hyperdrive jump between planets (not a gradual morph), and a boss closing each planet's stint, as docs/03 §8 already prescribed ("every third sector ends with a boss").

**Current terrain clearance — 16 October 2026:** the historical distance table below predates the Luna/Nacre cycle and this fix. Runtime distances come from `src/content/endless.ts`. Each endless planet now continues for one additional 36-unit terrain section beyond its boss arena before changing to the next world. Luna previously switched just 22 units past its stop, within the tilted camera's ground view. The buffer also covers the two-second departure and jump fade-in, including the deepest visible terrain. Boss arenas, combat schedules, difficulty and the five-second resume/jump sequence remain the same; hyperdrive crosses the extra distance at a higher peak speed.

| Boss | Outgoing world | Arena far edge, relative to stop | New planet begins, relative to stop |
| --- | --- | --- | --- |
| WARDEN-1 | Luna | 22 | 58 |
| Bastion-9 | Khepri | 26 | 62 |
| Helion Ark | Vesper | 35 | 71 |
| THE VEIL | Nacre | 34 | 70 |

The change applies to every repeat of the cycle. The next sector still starts 8.25 units beyond the seam. Regression coverage projects the real camera onto the deepest terrain, checks all four bosses and capped repeats through jump fade-in, and streams all four planet transitions without a synchronous fallback. The development fixture `tests/fixtures/endless-arena.html?sector=1` previews the live Moon arena; `&phase=departure&t=1.9` shows departure and `t=5.05` shows the next sector. `sector=4|7|10` covers the other worlds; `quality=low` selects the Low renderer.

## 1. The cycle

| Sectors | Planet | Ends with |
| --- | --- | --- |
| 1–3 | Khepri | Bastion-9 (end of sector 3) |
| jump | Khepri → Vesper | |
| 4–6 | Vesper | Helion Ark (end of sector 6) |
| jump | Vesper → Khepri | |
| 7–9 | Khepri | Bastion-9 |
| … | repeats | difficulty keeps ramping and caps per docs/03 §8 |

Nacre joins the cycle when it exists. The cycle, its bosses and its timings are fixed content; there is no randomness in which planet or boss comes next.

## 2. Rules (simulation)

- **Bosses:** a boss sector stops adding ordinary squadrons before the boss enters, and the scroll eases to a stop for an arena exactly as in the campaign. Boss stats and attack cadence follow the endless difficulty ramp at that sector; endless warnings never scale. **User decision (15 October 2026): endless continues only once the boss is dead.** The fight has no time limit and the boss never retreats; resume, jump and the next sector run only after the kill. This replaces the earlier rule (a 60 s extension, then a retreat with no kill reward). The kill scores normally; credits stay campaign-only. The player is never killed for low damage output: a fight simply lasts until the kill.
- **Jump:** after the boss is destroyed comes the jump: about 3 s with no combat, no hazards and the player invulnerable. During the jump the run's planet switches, the scroll resumes, and the next sector starts on the new planet with its own enemy roster: Khepri kinds on Khepri, Vesper kinds on Vesper.
- **Deterministic schedule:** sector boundaries, boss stops, arena ranges, jump windows and the planet for every stretch of distance must be computable from the run config alone (seed, mode, and the fixed pace ramp of docs/03 §8), never from combat state. That is why the scroll stays a closed-form function of time (the pace ramp, boss stops and jump). Export one pure schedule function from `src/content/` (e.g. `endlessSchedule(config)`: planet stretches by world distance, arenas, jump windows) that world and render both use.
- **Campaign:** campaign missions are unchanged and keep their single planet.

### As built: combat (15 October 2026)

**Schedule API** (`src/content/endless.ts`, pure, no simulation imports, memoized):

- `endlessSchedule(config: RunConfig): WorldSchedule` is the one function world and render use. `WorldSchedule` has `planetAt(distance)`, `arenaAt(distance)` → `ArenaSpan | null`, `jumpAt(distance)` → `JumpWindow | null`, `stretches(from, to)` → `PlanetStretch[]` and `arenas(from, to)` → `ArenaSpan[]`. `PlanetStretch` is `{ planet, from, to }`; `ArenaSpan` is `{ boss, planet, stopDistance, from, to }` (from/to: the platform or open-water range); `JumpWindow` is `{ from, to, cruise, peak, startDistance, flashDistance, switchDistance, endDistance }` (planets, scroll speeds in units/s at the jump's ends and middle, and world distances). In the campaign it returns the mission's single planet and its arena (Rolling Thunder stops at 575, platform 566–601; Cold Vector at 920, open water 911–955) and no jumps. Only `mode` and `mission` matter: endless is identical for every seed.
- `endlessSectorPlan(sector)` → `{ sector, planet, boss, startDistance, endDistance, stop: { boss, stopDistance, platform: { from, to } } | null, jump: JumpWindow | null }`; `stop` and `jump` are set for boss sectors only.
- `endlessScroll(plan, τ, bossEnd)` → `{ distance, speed, phase: 'cruise' | 'stopping' | 'stopped' | 'resuming' | 'jump' | 'next' }`, the closed-form scroll the simulation runs (τ = seconds into the sector, `bossEnd` = seconds into the sector at which the boss was destroyed, null while it lives).
- Constants: `ENDLESS_CYCLE` (planets, three sectors each, boss per planet, boss-sector timeline: cues end at 70 s, stop from 77 s over 6 s, boss at 80 s, no time limit; resume 2 s, jump 3 s, jump clearance 8.25 units), `sectorPace`, `paceInSector`, `scrollForPace`, `endlessPlanet`, `isBossSector`.

**Run state** (`src/shared/contracts.ts`, additive): `state.planet` (the planet the run is flying; switches at the jump's flash), `state.jump: { startedAt, duration, from, to } | null` (set for the 3 s of the jump), `state.sectorStartedAt` (active time at which the current sector began), `state.scrollSpeed` and `state.pace` (as before). `BossState.id` names the boss; `BossState.phase` is unchanged (there is no retreat phase). The sector message reads `SECTOR 04 · VESPER`.

**Timeline of a boss sector** (seconds from the sector's start): squadrons until 70 (none admitted after), stop over 77–83, boss arrives at 80 and fights until destroyed, with no time limit. After the kill at time *E*: resume *E*…*E*+2, jump *E*+2…*E*+5 with the flash and planet switch at *E*+3.5, next sector at *E*+5. The terrain under the ship crosses `switchDistance` after the flash, so the new planet's terrain is already in view ahead of the ship at the flash; at `endDistance` the whole view is on the new planet. The wreck has fallen behind the view by the flash and is removed there. Fight length moves only time: the scroll is stopped during the fight, so every distance below is fixed, and `endlessSchedule` did not change with the kill-only rule.

**Distances** (world units; identical for every seed):

| Sector | Planet | Start | Arena stop | Platform / water | Jump start | Flash | Planet switch | Jump end (= next start) | Cruise / peak speed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Khepri | 0 | | | | | | 360 | 4 |
| 2 | Khepri | 360 | | | | | | 752.81 | 4.375 |
| 3 | Khepri | 752.81 | 1131.88 (Bastion-9) | 1122.88–1157.88 | 1136.63 | 1151.38 | 1157.88 | 1166.13 | 4.75 / 12.73 |
| 4 | Vesper | 1166.13 | | | | | | 1626.44 | 5.125 |
| 5 | Vesper | 1626.44 | | | | | | 2120.50 | 5.5 |
| 6 | Vesper | 2120.50 | 2560.50 (Helion Ark) | 2551.50–2595.50 | 2566.00 | 2584.88 | 2595.50 | 2603.75 | 5.5 / 16.63 |
| 7–8 | Khepri | 2603.75 | | | | | | +495 each | 5.5 |
| 9 | Khepri | 3593.75 | 4033.75 (Bastion-9) | 4024.75–4059.75 | 4039.25 | 4053.63 | 4059.75 | 4068.00 | 5.5 / 11.91 |
| 12 | Vesper | 5058.00 | 5498.00 (Helion Ark) | 5489.00–5533.00 | 5503.50 | 5522.38 | 5533.00 | 5541.25 | 5.5 / 16.63 |

**Rosters.** Khepri sectors fly the Khepri playlists (opening, pressure, peak: darts, weavers, turrets, lancers); Vesper sectors fly `vesperOpening` (sector 4), `vesperPressure` (5–6) and `vesperPeak` (later visits), authored from needles, diamonds and missile batteries only, with the same arc, budget, placement and fairness rules. Later Khepri visits fly the Khepri peak playlist.

**Evidence** (`tests/sim/endless.test.ts`, `tests/sim/fairness.test.ts`): the schedule matches the simulation for sectors 1–7 (sector starts, arena stop, jump window, planet under the ship); the hazard-union validator covers endless sectors 1–7 (both bosses and both jumps), capped sector 9 (Bastion-9) and capped sectors 10–12 (Vesper and the Helion Ark) on the perfect, idle and dodger branches with no violation; the perfect pilot kills both bosses in sectors 1–7 with Pulse, Fan and Seeker at power 0 (no special, no pickups) with zero hits; a ship that never fires is still in the Bastion-9 fight, scroll stopped, 300 s after the boss arrived.

**Kill times** (perfect pilot, power 0, no pickups, seconds from the boss's arrival; the sector's time is 80 s more):

| Weapon | Bastion-9 (sector 3) | Helion Ark (sector 6) | Bastion-9 (sector 9, capped) | Helion Ark (sector 12, capped) |
| --- | --- | --- | --- | --- |
| Pulse | 72.0 | 110.6 | 96.5 | 127.0 |
| Fan | 99.9 | 188.5 | 140.8 | 223.0 |
| Seeker | 41.8 | 67.0 | 56.4 | 78.4 |

## 3. World

- `terrain.update(seed, distance, world)` takes the planet for the current stretch plus any arena from the schedule.
- Sections ahead of a planet switch are prefetched with the next planet's profile, so the jump never triggers a synchronous rebuild.
- Each endless boss stop gets its planet's arena: a flat platform on Khepri, open water on Vesper.

## 4. Look

- **Hyperdrive jump:** stars and streaks race past, a bright flash, then the new planet streams in. Under reduced motion it's a simple fade. The look rig (light, grade, water, craft models) switches at the flash.
- **Loading:** the next planet's assets load during the boss fight and are never fetched mid-jump. If they aren't ready, the jump lingers briefly rather than popping.
- **HUD and messages:** name the sector and planet, e.g. "SECTOR 4 · VESPER".

## As built: world and look (15 October 2026)

- **Route:** `routeOf(...)` in `src/world/terrain-planet.ts` and `runRoute(config)` in `src/render/terrain-route.ts` turn `endlessSchedule` into a route. Each distance resolves to its stretch's planet and its nearest arena, and `terrain.world` is a routed world, so seating works unchanged.
- **Planet switch:** a section containing `switchDistance` is split per span, leaving a clean hard seam inside the arena's calm ground. Nothing stands within `SEAM_CLEARANCE` = 3 units of the seam.
- **Streaming:** sections past the switch are prefetched with the next planet's profile, and the next planet's kits load 400 units ahead. Both jumps stream with 0 fallbacks at the 12.7 and 16.6 units/s peaks. `streamStats.viewFallbacks` counts synchronous view builds.
- **Jump** (`src/render/fx-jump.ts`, two draws, only while active):
  - a deep-space veil just under the flight plane, with 120 instanced streaks;
  - an HDR flash at the switch; the camera stays still;
  - reduced motion (the OS setting) gets a plain fade instead;
  - if the destination's assets are late, the veil holds for up to 4 s.
- **Look and loading:** the light and grade rig, water and craft switch on `state.planet` at the flash. Vesper's render assets (craft, Helion Ark, ice sky) preload 8 s into each endless boss sector and stay cached.
- **HUD:** the results label reads `ENDLESS / <planet>`.
- **Look-dev:** `tests/fixtures/bastion.html?mode=jump&n=1|2&t=N` and `lookdev/jump.html?sector=3|6` (git-ignored).
- **Known gaps:**
  - Terrain-kit readiness isn't part of the jump's readiness check yet.
  - Before the flash, the new planet's ground ahead is drawn in the old look; it's mostly hidden by the veil.
  - One frame showed an unstreamed section edge at peak jump speed, also under the veil.


**Update, 15 October 2026 (user request):** endless now opens with a one-sector Luna prologue that ends with WARDEN-1 and a jump to Khepri; the cycle above starts at sector 2. The pace and difficulty ramps ignore the prologue. See docs/19 §2.

**Update, 15 October 2026:** Nacre joins between Khepri and Vesper (docs/20); boss sectors are 1, 4, 7, 10, …..

**Update, 15 October 2026 (later):** order swapped by the user: Khepri → Vesper → Nacre; Nacre is the final world (docs/20).
