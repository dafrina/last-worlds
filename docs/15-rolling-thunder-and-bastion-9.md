# Rolling Thunder and BASTION-9

Rolling Thunder is the campaign's second mission, over Khepri, and ends with BASTION-9, a tracked fortress that fights on
a static arena. This doc covers the mission's arc, the fortress's fight, its model and node contract, its presentation
and its tests. BASTION-9 is also Khepri's boss in endless ([docs/18](18-endless-planet-cycle.md)). Khepri's world and kits
are [docs/13](13-khepri-world.md); the rules every boss shares are [docs/03 §3](03-worlds-and-generation.md#3-bosses).

## 1. The mission

- **Place.** Mission `bastion` in `CAMPAIGN_ORDER` (`src/content/equipment.ts`), named Rolling Thunder with threat 2
  (`MISSION_TEXT` in `src/ui/missions.ts`). It opens once Training is cleared.
- **Arc.** `ROLLING_THUNDER` and its lengthened `ROLLING_THUNDER_SORTIE` in `src/content/encounter-deck.ts`, flown through
  the encounter deck ([docs/03 §6](03-worlds-and-generation.md#6-encounter-deck-and-director)):
  1. an introduction (an arrowhead of darts, a ground battery pair);
  2. pressure: dart lines and echelons, weaver columns, battery lines and a fuel depot;
  3. three scripted Lancers, the beams' introduction (lasers are drawn only from Vesper on; docs/08, 6 November);
  4. a recovery with credits on the west route;
  5. a fuel-depot stretch;
  6. more pressure;
  7. the fortress-escort climax;
  8. a relief before the fortress.

  Pool slots draw Khepri's waves; up to four ground-battery slots become strike sites by the attempt's site count
  (`SITE_COUNT`). No cue is admitted from `BASTION.approachEndsAt`, when the approach message shows.
- **Pressure.** `WORLD_INTENSITY.khepri`, `MISSION_CADENCE.bastion` and `MISSION_PRESSURE.bastion` (earlier first
  windups, reinforcing squadrons and a tougher boss) in `src/content/balance.ts`, on top of the chosen difficulty.
- **Shield cells.** `BASTION.shieldSupplies` (two cells on Relaxed and Standard, one on Veteran), never extra cells
  during a long fight.
- **Victory.** The core must die; waiting never wins. After the kill the scroll holds over the wreck (`WRECK_HOLD`),
  the ship departs (`DEPARTURE`), and the results arrive through the victory warp. The boss reward (`REWARDS.boss`) is
  added once, when the core dies. Retry recreates the whole mission.

No arbitrary timeout, health reset, mandatory special or support pickup is part of the fight.

## 2. BASTION-9 in combat

Runtime values are `BASTION` in `src/content/bastion.ts`; the shared definition is `BOSSES.bastion` in
`src/content/bosses.ts`; the simulation is `src/sim/boss.ts`.

**Targets.** Two batteries at ±`BASTION.batteryOffset` on the fortress's row, radius `BASTION.batteryRadius`, and the
core `BASTION.coreRowOffset` behind them, radius `BASTION.coreRadius`; nothing else on the hull is a target or a
collider. Their base hit points (`batteryHp`, `coreHp`) split 40-25-35 over the three stages (`BOSS_PHASES`), scaled by
the difficulty (or the endless ramp), `BOSS_TOUGHNESS.hp` and, in the campaign, `MISSION_PRESSURE.bastion.bossHp`. The
broad core region keeps every weapon pattern useful, and its bracket shows it. The fortress grew 20% on 20 October, its
combat geometry with it ([docs/08](08-decisions-and-sources.md)).

| Phase | Targets | Attacks |
| --- | --- | --- |
| Arrival (`arrivalDuration`) | none damageable | Rolls in from beyond the view to the map's centre; no attack. |
| Batteries | left and right battery | Alternating aimed three-bolt bursts (`batteryBurst`). A destroyed battery stops at once, warning included, and stays destroyed. |
| Core | the core, once both batteries are down | A fixed five-way fan (`coreFan`) alternating with an aimed five-bolt burst (`coreBurst`). |
| Overload | the same core, from the last 35% of the boss's health (`OVERLOAD_FRACTION` of the core) | `overloadMoves`: core lane, side lanes, fan, cross, core lane, burst. The core lane (`overload.coreLaneWidth`) covers the core's column; the side lanes (`overload.batteryLaneWidth`) cover both battery columns and leave the core column open as the damage window; a cross marks the core lane and one side. |
| Destroyed | none | Explosions over the modules, then one detonation; the wreck stays on the ground and falls behind as the scroll resumes. |

- **Timing.** Shot attacks wind up for `BASTION.warning` and lanes for `BASTION.beamWarning` plus the lane flash
  (`BOSS_BEAM.warning` in `src/sim/attacks.ts`). Relaxed adds its extra warning. After each release comes
  `BASTION.recovery` × `BOSS_TOUGHNESS.recovery` (scaled by the cadence ramp in endless), and `transitionRecovery`
  between stages. Overload lanes are live for `overload.active` and cost two shield charges.
- **Fairness.** Every attack passes the director's exclusion check; a rejected move is skipped and the next is tried
  after `FAIRNESS.retryDelay`. The fortress holds still while its lanes charge and fire, so they stay under the columns
  that fired them.
- **Visibility.** An off-screen module never starts an attack, and a windup that leaves the view is cancelled and starts
  again in full. A pilot away from the fight sees `BASTION-9 · RETURN LEFT` or `RIGHT`; after `DRIFT.boss.patience`
  seconds with no target in view, the fortress lumbers toward the view ([docs/10](10-wide-map-and-camera.md)). There is
  no invisible arena wall.
- **Protection.** Closed shutters protect the core from automatic acquisition, projectiles, homing shots and the
  Shockwave alike.
- **Life loss.** Destroyed modules and the core's damage stay. Hostile shots in view and current lanes clear, fresh
  attacks wait for the respawn protection, and shields are not refilled (one run-wide pool).
- **Arena.** The scroll eases to zero over `BASTION.arena.decelDuration` from `decelStart` and stops at
  `arenaStopDistance(BASTION.arena)` (the campaign scroll, `CAMPAIGN_SCROLL`, as a closed form of time;
  `arenaScroll` in `src/sim/boss.ts`). The fortress rolls in three seconds into the stop. The world generator levels a
  flat paved clearing over `BASTION.arena.platform` (relative to the stop) around the map's centre, with Khepri's relief
  continuing around it (`src/world/terrain-arena.ts`). The fortress sways and surges around its post (`arena.sway`,
  `arena.surge`).
- **Mode isolation.** Endless never reads the mission or the campaign loadout; in endless the same fortress closes
  Khepri's stint with the endless ramp's scaling.

## 3. Model and node contract

**Source.** The user's supplied tank model (`art/source/bosses/futuristic-tank-original.glb`), traced into a clean
hard-surface model that keeps its proportions; nothing of the source mesh ships. The rear deck carries turrets and
greebles in place of the source's silver tubes (user, 24 October). Its builders:

- `tools/blender/boss_bastion.py` runs the whole build headless;
- `tools/blender/boss_bastion_hull.py` builds the hull and parts, with a Cycles atlas bake and AO, into an intermediate
  GLB under the git-ignored `lookdev/`;
- `tools/blender/boss_bastion_treads.py` extracts four tread-link templates from the hull's belts;
- the result is `public/assets/khepri/bastion-9.glb` (`BOSS_ASSETS.bastion` in `src/render/boss-assets.ts`; provenance
  in `art/bosses/README.md`).

**Conventions.** +Y up, 1 unit = 1 game unit, front toward +Z (toward the player; the guns point +Z), pivot at the
hull's ground centre. Weak points sit where the 55° game camera's ray through each combat target meets the armour, so
model positions differ from the combat sockets while projecting onto them. Backs and undersides stay plain: the camera
never shows them.

| Node | Role |
| --- | --- |
| `bastion_hull` | chassis, armour, superstructure, rear-deck turrets |
| `bastion_battery_left`, `_right` | battery housings (the targets' models) |
| `bastion_battery_left_wreck`, `_right_wreck` | destroyed batteries, hidden until a battery dies |
| `bastion_gun_left`, `_right` | battery guns, yawing toward the aim during a windup |
| `bastion_forward_cannon_left`, `_right` | forward cannons riding with the batteries |
| `bastion_core` | the reactor well |
| `bastion_core_shutter_a`, `_b` | the two hatches over the core; they slide apart along ±x when it is exposed |
| `bastion_sprocket_left`, `_right`, `bastion_idler_left`, `_right` | wheels pivoting on their own axles (`rolling_radius` in their extras) |
| `bastion_track_link_left_0`, `_1`, `bastion_track_link_right_0`, `_1` | link templates with their belt profile in their extras (`track_radius`, `track_front`, `track_rear`, `track_segments`, `track_pitch`, `track_x`, `track_offset`) |
| `bastion_remodel_v5`, `bastion_treads_v6` | empty marker nodes (real identifiers): the view keeps the authored materials and the articulated rig, and instances the links |

Two materials: `bastion_surface` (one baked atlas: colour, metal-roughness and normal maps) and `bastion_glow` (emissive, driven
at runtime as damage heat and lamps). The file holds 20,024 triangles in 4.5 MB (read from the file, 17 November).

## 4. Presentation

`src/render/bastion-view.ts` draws the fortress; it is render-only and never applies damage or decides anything the
simulation uses. `src/render/scene.ts` only creates and updates it, and excludes its targets from the ordinary turret
renderer.

- **Rig.** Each part group sits on its combat socket and keeps the node's authored placement; hull and wheels ride the
  chassis. Boss materials are kept as authored (`src/render/boss-materials.ts`), with heat glow per part.
- **Running gear.** Sprockets and idlers spin at the hull's ground-relative speed divided by their rolling radius; the
  four link templates are instanced around their belt profiles and circulate at the same speed
  (`src/render/bastion-tracks.ts`). Ground-relative speed is the fortress's own motion plus the terrain scroll, so a
  parked fortress stops and a manoeuvring one crawls. Both stop on destruction: the wreck is ground-anchored.
- **Combat.** Guns track during warnings and recoil on release; destroyed batteries swap to their wrecks with sparks;
  the core's hatches slide open on exposure and its glow follows damage. Target brackets stay on the sockets.
- **Seating.** `bastionPlacement` in `src/render/scene.ts` rests the hull on the highest ground under its footprint
  (`BASTION_FOOTPRINT`) and shifts it so every socket still projects onto its logical row. Scenery under the footprint is
  hidden while the fortress stands there. A faint silhouette keeps it readable when a canyon lip hides the chassis.
- **Effects.** Dust and smoke, sparks and flashes (two instanced particle layers) and a thin shock ring, all
  presentation; cosmetic randomness is a deterministic hash. On destruction the chassis tilts and collapses after the
  module sparks and flashes.
- **Fallback.** A code-built functional model draws while the GLB loads or if it is missing.
- **Sound.** The boss stem of the score follows the fight's stages ([docs/24](24-sound-design.md)).

## 5. Tests and fixtures

- `tests/sim/bastion.test.ts`: harmless arrival and protected core, no victory from waiting; destroyed batteries stop at
  once, the core opens once and overload never refills; closed shutters stop homing shots and the Shockwave; off-screen
  windups cancel; danger clears before extraction, the reward comes once, pause freezes; the wreck stays behind; the
  Training sortie and endless start stay independent; the shield budget stays fixed during a long fight.
- `tests/world/bastion-projection.test.ts`: every model socket lands on its collision target at both camera extremes and
  over relief, and the hull seats above all ground under its footprint.
- `tests/sim/fairness-campaign.test.ts`: Rolling Thunder at every difficulty, fortress included, on every pilot branch.
- `tests/browser/bastion.spec.ts`: Rolling Thunder stays locked until Training is cleared; the fortress renders every
  phase in the game renderer without errors; destruction reaches victory and retry restores the encounter.
- Development fixture `tests/fixtures/bastion.html` (not a production entry): `?phase=arrival|batteries|core|overload|destroyed`
  with `&still=1` freezes a state for art review; `boss=ark|warden|veil|cradle|eclipse` previews other bosses.

Human readability and touch comfort still need playtests on phones.
