# Worlds, enemies, bosses, and generation

The overview of the worlds side of the game: the eight worlds and their missions, the enemy catalog, the bosses, what is
generated and what is authored, the encounter deck and director, the fairness rules for left/right-only movement, and
the endless difficulty ramp. Each world's own document holds its terrain, models and boss in detail; the code is the
source for every tuning value named here.

## 1. The eight worlds

Worlds are `PlanetId` in `src/shared/contracts.ts`; each has a terrain profile in `src/world/terrain-<world>.ts`
(Khepri's in `src/world/terrain-layout.ts` and `src/world/terrain-planet.ts`), a look in `LOOKS` in
`src/render/scene.ts` and a paint in `WORLD_PAINT` in `src/render/world-paint.ts`. The campaign flies them in
`CAMPAIGN_ORDER` (`src/content/equipment.ts`), one mission each (`MISSION_PLANET` in `src/content/missions.ts`).

| World | Look | Combat emphasis | Mission | Boss | Doc |
| --- | --- | --- | --- | --- | --- |
| **Luna**, Khepri's moon | Grey cratered regolith, dark maria, black sky, a low hard white sun | Teaching: every squadron is introduced with a hint; gentle pace | Training | WARDEN-1, a decommissioned human lunar defence lander | [docs/19](19-luna-training.md) |
| **Khepri**, the Rust Expanse | Ochre dust, columnar basalt mesas and canyons, turquoise mineral seams, graphite industry | Alignment, aimed shots, alternating lanes; ground batteries; a few scripted Lancers introduce beams | Rolling Thunder | BASTION-9, a tracked fortress | [docs/13](13-khepri-world.md), [docs/15](15-rolling-thunder-and-bastion-9.md) |
| **Vesper**, the Glass Frontier | Snowy ice shelves, sheer blue-grey ice walls, a deep blue sea with pack ice | Narrow locked beams, alternating wing volleys, missiles down their own columns; precise commitment windows | Cold Vector | HELION ARK, a sea carrier | [docs/17](17-vesper-glass-frontier.md) |
| **Nacre**, the Luminous Mire | Indigo mire between ragged islands, black crags, a glowing jungle, the ruins of its builders | Sine-flight weaver columns, Needle beams, the Pulsar's tracking stream, overlapping rhythms | Deep Bloom | THE VEIL, a crescent-winged alien carrier | [docs/20](20-nacre-luminous-mire.md) |
| **Amnion**, the Brood Wastes | Pale bone plateaus, flesh canyons with glowing yolk, bone mountains, egg clutches | Drone flights, nest spires and spore mortars, egg sacs, brood heavies; red hostile shots | Brood Strike | THE CRADLE, a living nest-fortress | [docs/27](27-amnion-brood-wastes.md) |
| **Corona**, the Dying Star | Radiant plasma seas meandering between black magnetic rock, flare arcs | The late fleet with the Wraith and the Skimmer | Dying Star | THE HELIOPHAGE | [docs/37](37-corona-dying-star.md) |
| **Nahara**, the Silent Empire | Sandstone canyons and ruin districts of a vanished civilisation, moving sand | Skimmers (Echo Split), Relic Shields (armour), Wraiths; walls and boomerangs from the boss | Silent Empire | THE CITADEL, a stationary temple | [docs/39](39-nahara-silent-empire.md) |
| **Umbra**, the Eternal Eclipse | Shattered obsidian plates under an eclipse, crevasses falling into violet fog, floating shards | The Wraith's home world; the whole late fleet | Final Horizon | THE ECLIPSE, the final boss | [docs/28](28-umbra-eternal-eclipse.md) |

Rules every world keeps:

- **One combat plane.** Terrain, water, cliffs, fog and ice are scenery under the flight plane (`VIEW.flightHeight`).
  They never block shots, never collide and never steer the ship; each world's scenery stays under its cap
  (`PlanetProfile.sceneryMax`). An environmental danger would have to be a marked combat hazard under the same fairness
  rules as an attack (§7); no world has one. No weather hides shots.
- **A wider world.** The view is a 12-unit slice (`VIEW.width`) of a 24-unit world (`VIEW.worldWidth`); the camera
  follows lateral travel ([docs/10](10-wide-map-and-camera.md)). Terrain marks calmer routes at the centre and both
  sides (`ROUTE_AXES` in `src/world/terrain-layout.ts`) but never builds walls along them.
- **Moods along the route.** Each world alternates seeded regions (Khepri: canyons, mesas, basins, flats, dunes,
  escarpment; Vesper: shelf, pack ice, crevasse, radiator plains, icefall, nunatak; Luna: highland, mare, basin, crater
  field) and never repeats a mood twice in a row.
- **Rising intensity.** `WORLD_INTENSITY` in `src/content/balance.ts` scales air enemies' flight clock, shot speed,
  repeat fire, hit points and first windups per world, from gentle on Luna to hardest on Umbra, in both modes. Only
  targets with a faction silhouette and an aim marker are shootable; ground traffic and outposts are scenery.

## 2. Enemy catalog

Enemy kinds are `EnemyKind` in `src/shared/contracts.ts`. Hit points, radius, speed, shot speed, repeat interval,
warning, score and credits are `ENEMIES` in `src/content/balance.ts`; threat costs are `THREAT_COST` there. Attack
shapes live in `src/sim/attacks.ts`, and the fairness director predicts them from the same functions (§7). Each world
renders the kinds in its own faction's models (its doc says which).

| Kind | Role | Attack | Counterplay | Worlds (authored arcs) |
| --- | --- | --- | --- | --- |
| `dart` | Light fighter | One aimed shot | Move after the aim commits; align on its approach | Luna, Khepri, Amnion, Corona, Nahara, Umbra; boss pods and drones |
| `weaver` | Crescent fighter, sine flight | Two parallel aimed shots (`WEAVER_PAIR_OFFSET` either side; the lane between fits the ship) | Use the lane between the pair; predict the crossing | Every world but Vesper |
| `turret` | Ground battery | Aimed three-round fan | Same alignment as air targets; destroy one to remove its layer | Every world but Vesper |
| `lancer` | Beam ship | Marks a wide lane (`LANCER_BEAM`) on the committed position, then a brief beam that costs two shield charges | Leave the marked lane; shoot it during recovery | Khepri (scripted only), Amnion, Corona, Umbra |
| `needle` | Fast interceptor | A very narrow locked lane (`NEEDLE_BEAM`) that costs one shield charge | Step out of the thin lane; side lanes fall inside a beam's reach, so holding still is never safe | Vesper, Nacre, Amnion, Corona, Nahara, Umbra; the Helion Ark's launches |
| `diamond` | Heavy escort | Three tight rounds from one wing, bracketing the committed position on that side; wings alternate (`DIAMOND_VOLLEY`) | Read which wing winds up; its whole body takes hits | Vesper, Nacre, Amnion, Corona, Umbra |
| `missile` | Ground missile battery | One straight, non-tracking missile down its own marked column | Align under it only between missiles | Vesper, Nacre, Amnion, Corona, Nahara, Umbra |
| `fuel` | Fuel skid or egg sac | Never fires; its blast (`FUEL_BLAST`) damages targets around it, never the player | Shoot it for salvage and to break nearby batteries | Every world |
| `pulsar` | Explicit tracker | Marks a line on the ship, then a stream (`PULSAR_BURST`) whose every shot aims at the ship as it leaves the muzzle | Keep moving through the stream | Nacre, Amnion, Corona, Nahara, Umbra |
| `wraith` | Phase predator | Teleports to a new firing angle near the end of its warning, then a fast three-round burst (`WRAITH`) | Watch the feint; move on the snap | Corona, Nahara, Umbra ([docs/28](28-umbra-eternal-eclipse.md)) |
| `skimmer` | Light raider | Echo Split: one large aimed shot that stops, shows its halves and splits in two (`ECHO_SPLIT`) | Fly between the halves | Corona, Nahara, Umbra ([docs/39](39-nahara-silent-empire.md)) |
| `relic` | Armoured heavy | Three-round fan; closed armour lets only a share of damage through, open after each attack (`RELIC_ARMOR`) | Hit it while it is open, or wear it down | Nahara, Umbra ([docs/39](39-nahara-silent-empire.md)) |

The worlds column is what the authored arcs fly (`authoredKinds` in `src/content/encounter-deck.ts`); the deck never
adds a kind a world does not fly (§6).

**Aim and warning rules.**
- An attack commits its aim at the start of its windup. The warning line is drawn to the committed point, and the
  release comes when the warning ends. Once a shot leaves, it does not track. The Pulsar's stream is the one explicit
  tracking attack, with its own look and rule. A locked beam never moves with the player.
- A squadron member may add an authored lateral aim offset (a bracket). The offset is part of the template, commits at
  the same moment, and shows on the same warning line.
- Windups start only inside the template's firing window, with the attacker fully in view and above the attack floor
  (`ATTACK_FLOOR` in `src/sim/view.ts`). A windup that leaves the view is cancelled and starts again in full on return;
  a hit does not cancel it.
- Enemies never spawn inside the view or behind the player, every path ends outside the view, and craft below the
  player row stop firing and leave. Missing a kill costs score and loot, never unavoidable damage.

**Squadrons.** Squadrons are authored templates in `src/content/formations.ts`: a leader path as keyframes relative to
an anchor, and per member a slot offset, an optional lag along the path (columns), an optional flipped path (pincers),
a staggered first windup and an optional aim offset. No two windups of one squadron start within 0.3 s of each other,
so a squadron never fires as one wall. Members marked `from: 'veteran'` fly on Veteran, in endless from
`ENDLESS_RAMP.veteranFormationsFromSector`, and in the late missions that set `MISSION_PRESSURE.rank`. A placement may
fly the validated mirror image or a validated lateral offset; neither is random. The families:

- **Fighters:** `arrow-3`, `arrow-5`, `line-dart-4`, `line-weaver-4`, `echelon-4`, `snake-weaver-5`, `pincer-4` (two
  flanks, announced by an alert before entry), `dive-pair` (its dive lanes are contact hazards), `diamond-weaver`, and
  the `solo-*` teaching templates.
- **Beams:** `solo-lancer`, `diamond-lancer`, `needle-solo`, `needle-line-3`, `needle-column-5`.
- **Heavies:** `diamond-solo`, `diamond-pair`, `diamond-convoy`, `relic-solo`, `relic-pair`, `relic-escort`.
- **Late specials:** `pulsar-solo`, `pulsar-pair`, `wraith-solo`, `skimmer-pair`, `skimmer-trio`.
- **Ground:** `battery-2`, `battery-3`, `battery-4`, `missile-2`, `missile-3`, the fuelled `depot-2`, `depot-3`,
  `depot-missile`, and the harmless `fuel-pair` and `fuel-depot`. Ground targets ride the scrolling terrain.
- **Boss launches:** `ark-launch` (Needles from the Helion Ark's bays) and `veil-pods` (the pods, hatchlings and drones
  of the carrier bosses).
- **Strike-site guards:** `site-*`, around a site's core ([docs/33](33-strike-sites-and-encounter-deck.md)).

**Aces.** Hunters (`HUNTERS` in `src/content/hunters.ts`, behaviour in `src/sim/hunters.ts`) are a world's strong
kind under a glowing shield of charges. They roam above the fight, follow a ship that retreats to a side, and stay
until shot down, into a boss fight too. They stand outside the authored encounters (no threat budget or airspace), but
every attack they start passes the same fairness admission. Their spawn rolls use their own stream, independent of the
run seed, so every run of a level meets the same aces.

## 3. Bosses

Every mission ends with a boss, and every endless planet stint ends with that planet's boss. A boss is an authored
state machine with targetable modules: no random geometry and no improvised attacks. All eight share one definition
shape (`BossDefinition` in `src/content/bosses.ts`, each boss's numbers in `src/content/<boss>.ts`) and one simulation
(`src/sim/boss.ts`).

**Shared rules.**
- **Phases:** a harmless arrival, then the first-phase targets (a pair; THE ECLIPSE, THE HELIOPHAGE and THE CITADEL add a
  third, the `prow`), then the core, then the core's overload, then the wreck. The overload is a pattern change on the
  same health pool, never a refill. Health splits 40-25-35 over the three stages (`BOSS_PHASES` in
  `src/content/boss-phases.ts`).
- **Health:** each module's base hit points, times the difficulty (or the endless ramp), times `BOSS_TOUGHNESS.hp`, and
  in the campaign times the mission's `MISSION_PRESSURE.bossHp`.
- **Overload moves:** each boss cycles its own `overloadMoves`: lanes over its core column, over both side columns, or
  a cross (core plus one side, alternating), plus shot moves (aimed burst, fixed fan, spiral, and on Nahara's and
  Umbra's bosses the Fracture Wave and Boomerang Barrage). A move the fairness director rejects is skipped.
- **Fairness:** every boss attack passes the same exclusion check as squadron attacks (§7). The boss holds still while
  its own lanes charge and fire, and while a spiral unwinds, so lanes stay under the columns that fired them.
- **Arena:** the scroll eases to a stop over a clearing (open water on Vesper, open mire on Nacre;
  `src/world/terrain-arena.ts`) and the boss arrives at the map's centre. It sways and surges around its post within its arena's limits; THE CITADEL never moves. A boss with
  no target in view for `DRIFT.boss.patience` seconds lumbers toward the view ([docs/10](10-wide-map-and-camera.md)).
- **It must be killed** (user decision, 15 October; [docs/08](08-decisions-and-sources.md)). No timeout, no retreat,
  in either mode. The player is never killed for low damage output; the fight lasts until the kill.
- **Stage changes and respawns:** at arrival, other craft break off and fly out of frame (aces stay). At arrival and at
  each stage change, windups and laser lanes end; shots already in flight fly on. A lost life keeps every destroyed module and the core's
  damage, clears hostile shots in view and delays new attacks for the respawn protection.
- **Destruction:** a barrage of explosions over the modules, then one big detonation (`deathSequence` in
  `src/sim/boss.ts`, cosmetic). Launched craft go down with their carrier. The scroll holds over the wreck for
  `WRECK_HOLD`, then the departure (`DEPARTURE` in `src/content/departure.ts`) and the warp: the campaign's results, or
  endless's next planet ([docs/18](18-endless-planet-cycle.md)).

**The eight bosses.**

- **WARDEN-1** (Luna, Training): the smallest boss, a decommissioned human lunar defence lander that hovers on its
  thrusters. Two turret pods, then the command module; slow bursts and generous warnings teach the phases.
  [docs/19 §2](19-luna-training.md#2-warden-1).
- **BASTION-9** (Khepri, Rolling Thunder): a tracked fortress on a flat paved clearing. Two gun batteries with aimed
  bursts, then a core that alternates a fixed fan with an aimed burst, then lanes and fans over its own columns.
  [docs/15](15-rolling-thunder-and-bastion-9.md).
- **HELION ARK** (Vesper, Cold Vector): a carrier riding the open sea. Two radiators fire narrow lane lasers straight
  down their own columns, with a bridge burst between, then the bridge fires aimed bursts and launches finite Needle
  waves from its deck bays.
  [docs/17 §5](17-vesper-glass-frontier.md#5-cold-vector-and-the-helion-ark).
- **THE VEIL** (Nacre, Deep Bloom): a crescent-winged carrier far wider than the view that rises out of the mire. Two
  pods, then a heart behind four shutters with a spiral barrage and pod waves from its bays.
  [docs/20](20-nacre-luminous-mire.md#4-the-veil).
- **THE CRADLE** (Amnion, Brood Strike): a living nest-fortress that rises out of a flesh canyon. Two brood sacs, then
  the nest heart with spirals and hatchling waves. [docs/27](27-amnion-brood-wastes.md).
- **THE HELIOPHAGE** (Corona, Dying Star): THE ECLIPSE's fight on its own model and targets (the user's choice until a
  fight of its own exists, 5 November). [docs/37](37-corona-dying-star.md).
- **THE CITADEL** (Nahara, Silent Empire): a stationary temple on a rock in the canyon. Two lanterns and an emblem,
  then the crown of turquoise panels (its reactor), with THE ECLIPSE's fight plus Nahara's Fracture Wave and Boomerang
  Barrage. [docs/39](39-nahara-silent-empire.md).
- **THE ECLIPSE** (Umbra, Final Horizon): the final boss, a crescent about 20 units from horn to horn rising out of the
  abyss. Three energy vents, then the reactor, with spirals, walls, boomerangs and drone waves.
  [docs/28](28-umbra-eternal-eclipse.md).

The bosses' source models and builders are listed in `src/render/boss-assets.ts` and
[art/bosses/README.md](../art/bosses/README.md).

## 4. Campaign missions

| # | Mission (`MissionId`) | World | Boss | Threat | Boss arrives | Doc |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Training (`training`) | Luna | WARDEN-1 | 1 | `WARDEN.arrivesAt` (124 s) | [docs/19](19-luna-training.md) |
| 2 | Rolling Thunder (`bastion`) | Khepri | BASTION-9 | 2 | `BASTION.arrivesAt` (135 s) | [docs/15](15-rolling-thunder-and-bastion-9.md) |
| 3 | Cold Vector (`cold-vector`) | Vesper | HELION ARK | 3 | `HELION_ARK.arrivesAt` (190 s) | [docs/17](17-vesper-glass-frontier.md) |
| 4 | Deep Bloom (`deep-bloom`) | Nacre | THE VEIL | 4 | `VEIL.arrivesAt` (184 s) | [docs/20](20-nacre-luminous-mire.md) |
| 5 | Brood Strike (`brood-strike`) | Amnion | THE CRADLE | 5 | `CRADLE.arrivesAt` (184 s) | [docs/27](27-amnion-brood-wastes.md) |
| 6 | Dying Star (`dying-star`) | Corona | THE HELIOPHAGE | 5 | `HELIOPHAGE.arrivesAt` (184 s) | [docs/37](37-corona-dying-star.md) |
| 7 | Silent Empire (`silent-empire`) | Nahara | THE CITADEL | 5 | `CITADEL.arrivesAt` (184 s) | [docs/39](39-nahara-silent-empire.md) |
| 8 | Final Horizon (`final-horizon`) | Umbra | THE ECLIPSE | 5 | `ECLIPSE.arrivesAt` (184 s) | [docs/28](28-umbra-eternal-eclipse.md) |

Names, threat and briefing lines are `MISSION_TEXT` in `src/ui/missions.ts`. A mission opens once the one before it is
cleared ([docs/30](30-campaign-progression.md)). Each mission's arc is authored in `src/content/encounter-deck.ts`
(§6) and lengthened by an authored stretch with fuel depots (the `*_SORTIE` arcs). Its pressure comes from the
difficulty (`DIFFICULTIES`), the world (`WORLD_INTENSITY`), the mission's repeat-fire factor (`MISSION_CADENCE`) and, for
the later missions, `MISSION_PRESSURE` (earlier first windups, reinforcing squadrons, quicker telegraphs within the
fairness floors, bigger flocks, tougher bosses; [docs/40](40-balance-measurement.md)). The boss's content file holds
the mission's shield-cell times (`shieldSupplies`). Each attempt flies one to four strike sites (`SITE_COUNT`,
[docs/33](33-strike-sites-and-encounter-deck.md)), and each world has a board of optional missions
([docs/35](35-missions.md)).

## 5. What is procedural and what is authored

| Layer | Approach |
| --- | --- |
| Terrain, landforms, scatter, outposts, roads, pipelines, districts | Generated from the run seed and world coordinates by pure functions (`src/world/`); identical regardless of load order |
| Terrain pieces, infrastructure, facilities, enemy craft, bosses, strike sites | Modelled in Blender by seeded scripts in `tools/blender/`, or adapted from the user's source models (`art/source/`) |
| Mission and endless arcs | Authored slot lists (`src/content/encounter-deck.ts`) |
| Which wave flies in a pool slot, its mirror and offset, which strike site and side | Drawn per attempt (endless: per sector) from authored pools by a seeded roll (§6) |
| Squadron formations, attack patterns, boss phases and moves | Authored; never assembled from parts |
| Enemy statistics | Authored values scaled by documented factors: difficulty, world, mission, endless ramp |
| Hero ships | Authored modular designs and paint chosen in the hangar ([docs/31](31-hero-ships.md)); no procedural ships |
| Mesh generation at runtime, improvised attacks, generative AI | Excluded |

World generation never reads or changes combat: it cannot move a target, alter encounter timing or decide loot. Ground
targets are seated on whatever terrain their authored position lands on, at any height
([docs/13 §2](13-khepri-world.md#2-procedural-layout)). Concept images guide art direction only; the running game calls no
generative service.

## 6. Encounter deck and director

**The encounter deck** (`src/content/encounter-deck.ts`; full rules in
[docs/33 §4](33-strike-sites-and-encounter-deck.md)). Each campaign mission and endless stage keeps an authored arc of
slots following the pacing arc (`PacingPhase` in `src/content/encounters.ts`: introduction, pressure, recovery,
pressure, climax, recovery). `resolvePlaylist` turns the arc into the cue list a run flies, with a seeded roll per
attempt (endless: per sector):

- **fixed** slots fly as written: introductions, every cue with a message, set pieces, reliefs;
- **pool** slots draw an authored wave from the world's pool for that phase (`DECK_POOLS`): the same role (air or
  ground) and attack character (`waveCharacter`) as the slot's nominal wave, within a threat band (`BAND`), as authored or
  mirrored;
- **side** slots draw a strike site from the world's site pool.

Guard rails: no wave twice in a row; two heavy waves never stack (`PAIR_WINDOW`, `PAIR_FLOOR`); Pulsars and Wraiths fly
only where the arc put them (`SCARCE`); teaching arcs (every campaign mission, the Luna prologue and each world's first
endless opening) fly each introduction as authored and draw only formations already introduced; on Vesper a drawn wave
keeps its slot's side of the alternation between laser flocks and laser-free squadrons
([docs/17 §5](17-vesper-glass-frontier.md#5-cold-vector-and-the-helion-ark)). Campaign missions with
`MISSION_PRESSURE.reinforce` add mirrored follow-up squadrons (`reinforced`).

**The director** is `updateDirector` in `src/sim/game.ts`. It admits the resolved cues in order:

- **Cue times are earliest times.** A cue waits until it fits; a pilot who destroys squadrons quickly meets the next one
  sooner.
- **Whole cues only.** A cue is admitted complete or not at all. Surviving enemies plus the cue must fit the live
  threat budget (`DifficultyScale.threatBudget`, costs in `THREAT_COST`) and the entity ceiling
  (`BALANCE.maxEnemies`). Aces count against neither.
- **Airspace.** Squadrons never overlap (`src/sim/airspace.ts`, `AIRSPACE` in `src/content/balance.ts`). A cue is
  admitted only if its predicted flight keeps every member `AIRSPACE.separation` from every member of another squadron,
  and no two air squadrons that could share one screen occupy forward bands closer than `AIRSPACE.bandGap`. The rule
  uses world positions only. Ground batteries keep separation from each other but may pass beneath an air squadron. In
  practice one air squadron flies at a time.
- **Anchors.** A `view` placement resolves to the camera centre when the cue is admitted, clamped to `ANCHOR_LIMIT`, so
  the battle follows the player but never pins the ship against a world edge. A `world` placement pins optional
  content to a world x. Ground formations spawn ahead of their cue (`GROUND_LEAD` in `src/sim/game.ts`) so they
  scroll into view from beyond the top edge with the authored timing.
- **Alerts.** A two-flank entry shows its alert `ALERT_LEAD` seconds before its members enter; an overwritten alert is
  shown again in full. A strike site is announced when it is next and would be admitted.
- **Windup gate.** A member starts a windup only inside its firing window, fully visible and above `ATTACK_FLOOR`, and
  only while fewer than `maxWindups` attacks wind up and fewer than `maxBeams` wide lanes are marked (by difficulty or
  endless sector). Vesper outside campaign Veteran also caps warning lines at once (`VESPER_LINE_CAP`), and Needle
  barrages rest after a run of beams (`DifficultyScale.beamRest`).
- **Exclusion check.** Before committing a windup, the director checks the hazard union (§7). A rejected windup retries
  after `FAIRNESS.retryDelay`; its pattern is never edited and existing shots are never moved.
- **Pool limit.** A volley that would overflow `BALANCE.maxProjectiles` is skipped whole, never trimmed.
- **Squadron pull.** When fewer than `DRIFT.floor` air craft in view can attack, the nearest view-anchored squadron
  beside the view slides toward it until `DRIFT.engaged` can (`src/sim/drift.ts`; [docs/10](10-wide-map-and-camera.md)).
  It never slides while a member winds up, holds a lane or could reach the player row within the fairness horizon.
- **Hits and respawns.** Hit invulnerability (`BALANCE.shield.hitInvulnerability`) does not cancel windups in progress;
  it blocks new windups until 0.3 s before it ends. A lost life clears hostile shots in view, cancels all windups and
  delays new attacks by the respawn protection ([docs/02](02-combat-and-progression.md)).
- **Bosses.** The approach ends at the boss's `approachEndsAt` (endless: `ENDLESS_CYCLE.bossSector.approachEndsAt`); no
  ordinary cue is admitted after it, not even one held back.

The director never aims harder after a player gets a good build, never lowers rewards after success, and has no
shield pity timer. Shield cells come only on the authored budgets.

## 7. Fairness for left/right-only movement

At the player's fixed forward row, every threat occupies a lateral interval over a time window. Testing each enemy alone
is not enough: the union of shots, beams and airframe contacts must leave a reachable escape. The floors are `FAIRNESS`
in `src/content/balance.ts`; nothing may loosen them to make content fit.

- **Warnings:** at least `FAIRNESS.warningFloor` from the first readable warning to a threatening shot, and
  `FAIRNESS.beamWarningFloor` for beams. Late missions' quicker telegraphs (`MISSION_PRESSURE.windup`) never go below
  the floor. At least `FAIRNESS.lockFloor` from aim lock to the earliest possible impact.
- **Gap:** a physical clear gap of `FAIRNESS.minGap` between hazard edges at the player row: the collider
  (`VIEW.playerRadius`), the comfort margin on each side and 0.6 units of free movement.
- **No seal:** hazards never cover both view edges and the centre together (strips `FAIRNESS.sealStrip` wide).
- **Reachability:** a conservative player model must still reach a clear position: `FAIRNESS.reaction` plus
  `FAIRNESS.maneuverDelay`, then `FAIRNESS.effectiveSpeedRatio` of the top speed (the campaign assumes the slowest drive),
  with the collider and comfort margin around every hazard, padded slightly in time.
- **Never required:** no attack may require a special, a pickup, upgraded equipment or a timely kill to avoid certain
  damage. No spawn overlaps the player without warning.

**At runtime** the director forecasts the footprint of every committed hazard (shots in flight, marked lanes, windups
already running, airframe paths through the row) plus the new attack, over `FAIRNESS.horizon` or to the end of a long
boss pattern, in windows of `FAIRNESS.window` (`committedFootprints`, `assessSafety`, `admitAttack` and `admitFootprints`
in `src/sim/fairness.ts`). The attack is admitted only if the gap, seal and reachability rules all hold. If the player
is already committed to an unavoidable hit, only the gap and seal rules apply, so the director neither stalls nor
quietly eases off. Bosses, aces and Wraiths pass the same check.

**Offline validation** runs the real simulation and observes it with an independent trace (`tests/sim/fairness-trace.ts`)
that does not reuse the director's prediction. It checks warning and lock floors, that every shot had a completed
windup in view, the gap and seal rules on actual hazards, and that squadrons never overlapped. Pilots resolve each
aimed commitment per branch (`tests/sim/pilots.ts`): a perfect pilot (the safe-gap solver with exact kinematics, acting
0.2 s late, no special, no pickups), an idle pilot, a dodger and a pacifist that never fires.

- `tests/sim/fairness.test.ts`: every formation in isolation, both mirrors, every difficulty and endless scale, from
  several starts including the world edge; plus content checks (stagger, view, arcs, recovery spacing, budgets).
- `tests/sim/fairness-campaign.test.ts`: every mission at every difficulty, boss included.
- `tests/sim/fairness-endless-early.test.ts` and `fairness-endless-late.test.ts`: every world's first stint and its
  later capped visit, bosses and jumps included.
- `tests/sim/fairness-guard.test.ts`: the director rejects sealing and last-gap windups, and the validator catches
  walls, seals, short warnings, unwarned shots and off-screen windups.

World seeds do not change combat beyond the deck's draws, which these suites cover across seeds. The algorithm is a
guardrail, not proof that a human finds a pattern fair; human phone playtests remain a release gate.

## 8. Endless difficulty and seeds

Endless flies the Luna prologue, then every world in campaign order, three sectors each, each stint ending with its
boss and a hyperdrive jump ([docs/18](18-endless-planet-cycle.md)). A sector without a boss lasts
`BALANCE.sectorDuration`; a boss sector lasts until the kill. Endless never reads a campaign setting
([docs/11](11-campaign-difficulty.md)).

**The ramp** (`ENDLESS_RAMP` and `PACE.endless` in `src/content/balance.ts`; `difficultyScales`, `sectorPace`). It
counts ramp sectors (`endlessRampSector`): the prologue and the first Khepri sector are ramp sector 1, so the prologue
adds no difficulty. With n = ramp sector − 1:

```
pace          = min(PACE.endless.start + PACE.endless.perSector · n, PACE.endless.cap)   // eased over easeSeconds
hp            = min(1 + ENDLESS_RAMP.hp.perSector · n, ENDLESS_RAMP.hp.cap)
shotSpeed     = min(1 + ENDLESS_RAMP.shotSpeed.perSector · n, ENDLESS_RAMP.shotSpeed.cap)   // times the pace's shot factor
cadence       = max(1 + ENDLESS_RAMP.cadence.perSector · n, ENDLESS_RAMP.cadence.floor)    // repeat volleys and boss recovery
threatBudget  = min(ENDLESS_RAMP.threatBudget.base + perSector · n, cap)
windups/beams = base, then fromSector3 values from ramp sector 3
formations    = Veteran members from ramp sector ENDLESS_RAMP.veteranFormationsFromSector
```

`WORLD_INTENSITY` applies on top, per world, as in the campaign. Endless keeps the authored first windups; air craft open
fire `airFirstShot` sooner, as in the campaign. Needle barrages rest as on Standard.

**Pace.** Pace scales the terrain scroll, ship kinematics, enemy movement (paths, fire offsets and repeat intervals run
on an enemy clock), camera follow and pickup drift together, through the anchors in `PACE.anchors` (`kinematics`).
Shot speed scales more gently. Warnings are real seconds and never scale. The campaign flies `PACE.campaign`; endless
starts slower and ramps to its cap, which is still below the campaign's (held there until its fairness is worked out;
docs/08, 6 November). The scroll is exactly `VIEW.scrollSpeed` × pace, so endless distance is a closed form of time.

**What never scales:** warning times, the fairness gap and seal rules, beam widths, the entity ceiling and the
projectile pool. After the caps, the world stints repeat with their peak stages and new draws; there is no timer that
eventually makes patterns impossible.

**Seeds and streams.** Every run gets a fresh seed. Simulation randomness comes only from keyed streams
(`src/shared/streams.ts`); `Math.random()` never touches simulation or content.
- Terrain is a pure function of the seed and world coordinates.
- The deck's draws use the seed and, in endless, the sector (its own "deck" stream).
- Aces use their own "hunt" stream, independent of the seed, so every run meets the same aces.
- Strike-site part rolls use their own "part" stream.

The endless schedule (planets, sector distances, arenas, jumps) is the same for every seed (`endlessSchedule` in
`src/content/endless.ts`). Endless scores and records are kept separate from the campaign
([docs/09](09-objectives-and-statistics.md)).
