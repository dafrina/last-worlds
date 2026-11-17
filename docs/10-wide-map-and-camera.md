# Wide map and camera

The visible screen is a slice of a wider world, and the camera follows the ship's lateral travel. This doc covers the
geometry, the camera, exploration, how threats stay fair when the camera can move away from them (the pull toward the
view), and bosses at the edges. The player still steers only left and right while forward travel is automatic (invariants
1 and 12; the user replaced a screen-width corridor with a wider map on 13 October).

## 1. Geometry and feel

Terrain sections are `VIEW.sectionLength` long and `VIEW.worldWidth` (24) wide; the view shows `VIEW.width` (12), so the
world is two screens wide (`src/shared/contracts.ts`). The user narrowed it from 30 on 21 October: at 2.5 screens a pilot
could slide from one far side to the other and outrun every attack, and beam ships could not find a lane. Sections connect
forward into campaign routes and endless terrain.

The ship can fly the whole width; screen edges are not walls. Its centre stays `VIEW.playerRadius` inside the world edge
(`movePlayer`, `src/sim/game.ts`), and the camera centre stays within ±(`worldWidth` − `width`)/2, so the view never leaves
the map. At the outer boundary the ship approaches the screen edge naturally; there is no invisible viewport clamp.

**Responsive viewport** (user, 16 October): phones fill the dynamic viewport height (`100dvh`) and their full width when
taller than 9:16; wider touch devices and landscape phones keep a centred portrait field; desktop keeps a fitted 9:16 frame.
The camera keeps the 12-unit width, the elevation, screen-up flight and the fixed player row. Extra height extends the
foreground below the canonical combat area, whose top stays anchored, so it never reveals enemies earlier or stretches
models. Canvas resizes update projection, shadows and post-processing together; HUD and menus respect safe-area insets;
the whole frame accepts steering; orientation changes clear held input (`tests/browser/viewport.spec.ts`,
`tests/world/viewport.test.ts`).

## 2. Lateral camera

Camera x is explicit fixed-step simulation state driven by the ship's world x (`RunState.cameraX`), not a DOM scroll or a
renderer guess. While the ship stays within `BALANCE.camera.deadZone` of the camera centre the camera holds still; beyond
it the camera follows to keep the ship at the dead-zone edge, clamped to the map, at up to the pace-scaled camera speed
(`kinematics` in `src/content/balance.ts`), faster than the ship. The renderer may ease presentation; visibility follows the
simulation camera.

No automatic camera jumps toward pickups or goals, no recentring after releasing steering or losing a life (the ship
respawns where it is). A new run starts centred. Camera shake is tiny, render-only and off with reduced motion.

## 3. Exploration without stopping

Forward flight never stops for exploration. Off to the sides lie strike sites, enemy groups, caches and scenery; the player
chooses what to engage or pass while the terrain scrolls. This is route choice within a scrolling shooter, not a free-roaming
map. There is no minimap.

World state is stable: leaving the view does not reset an enemy's health, respawn a cache, reroll loot or allow repeated
discovery rewards; unseen rewards are not collected automatically. World-anchored placements (strike sites, batteries)
stay where they were placed ([docs/33](33-strike-sites-and-encounter-deck.md)). Side missions may count visits and kills
but never create targets, alter loot or steer the camera (invariant 13).

## 4. Visibility and fair threats

Offscreen enemies exist, but an enemy can begin an attack only from inside the view, with a readable warning. Fired
projectiles keep their world trajectories when the camera pans. Automatic targeting checks the current view only, so
moving the camera never extends range or locks unseen enemies, and special footprints are fixed in world coordinates at
activation (the Orbital Strike sweeps the whole map by design, [docs/42](42-specials-and-perks.md)). The fairness director
admits an attack only if a readable dodge remains given the ship's position, speed and the camera
([docs/03 § 7](03-worlds-and-generation.md)). Fairness comes from passable gaps to weave through, never from safe zones at
the edges.

### The pull toward the view

A view-anchored squadron takes the camera's x when it spawns. Before 11 November a pilot could cross to the other screen as
each wave spawned and evade nearly everything (the ship crosses a screen in about a second). The user chose "waves follow
you", with a limit: "there should be possibilities to retreat but there should always be 1-2 enemies on screen". The rule
is `src/sim/drift.ts`, its numbers `DRIFT` in `src/content/balance.ts`:

- **When:** fewer than `DRIFT.floor` hostile air craft in view can attack (squadron members, aces and Wraiths fully in view
  and above the attack floor). Ground batteries don't count: they are terrain the route passes over.
- **Which:** the nearest squadron with a member beside the view, level with the attack band, entered and still inside its
  firing window.
- **How:** it slides sideways toward the view at `DRIFT.squadron` speeds (scaled by the pace; a third of the ship's top
  speed); its anchor takes an offset, so its shape and authored path are unchanged.
- **Stop:** once under way it slides until `DRIFT.engaged` craft can attack, then brakes. Typically a wave's edge members
  slide in and its bulk stays beside the view: a pilot can retreat from most of a wave, never all of it.
- **Bounds:** the anchor stays within `ANCHOR_LIMIT` (`src/sim/airspace.ts`). The ship is never clamped and no edge zone is
  made safe.
- **Never moved:** ground batteries, strike sites and other world-anchored placements, boss launches, aces, craft leaving
  for a boss, and squadrons still diving in or past their firing window.
- **Telegraphs stay honest:** a squadron never moves while a member winds up, holds a beam lane or warps, or while one of
  its airframes could reach the ship's row within the fairness horizon; each of these stops it dead. Every footprint the
  director admitted stays where it was forecast.
- **Airspace:** each slide is checked against the other squadrons over the admission horizon; only one squadron moves at a
  time.

**Measured, 11 November** (a fleeing pilot crossing screens as each wave spawns, `tests/sim/flee-harness.ts`,
`flee-report.test.ts`, every mission at Standard and endless sectors 2–4): the share of a wave's firing time with no craft
in view able to attack fell from 62% to 13%, and windups aimed at the fleeing pilot rose 2.5 times. The perfect pilot,
which stays with its waves, was barely affected.

## 5. Bosses and boundaries

Each campaign boss mission eases the scroll to a stop as its boss arrives, so the fight happens over a static clearing
(`arenaScroll` with the boss's `arena`, in its content file), and resumes it for extraction once the boss falls. The sim
exposes `RunState.scrollSpeed` for terrain and tread rendering and `BossState.vx`/`vs` for a ground boss's tread speed.
Endless bosses work the same way inside the planet cycle; the run continues only once the boss is killed
([docs/18](18-endless-planet-cycle.md)).

### The boss pull

Every boss arrives at x 0 and sways around its post. Parked at a world edge, a pilot could once keep every boss target out
of view so that no attack ever started (user report, 11 November). Now the post (`BossState.originX`) moves sideways
(`pullBoss` in `src/sim/boss.ts`, numbers `DRIFT.boss`):

- **Pull:** once none of its live targets has been in view for `DRIFT.boss.patience` s, the post lumbers toward the view
  until one is. A target out of view for a moment in an ordinary fight moves nothing.
- **Home:** whenever a target would be in view with the post back at x 0, the post eases home. In an ordinary fight a boss
  keeps to its clearing.
- **Limits:** the post stays within the camera's range, so the view can always centre on it. It moves only sideways: the
  boss keeps its row and facing, so its back and underside stay unseen.
- **Telegraphs stay honest:** the post never moves while the boss winds up, holds still for its own lanes, or has a lane
  marked; the footprint forecast reads the post through `bossPose`.
- A pilot can still retreat to an edge for a moment, but cannot park there.
- **Stationary bosses** (`BossDefinition.stationary`: THE CITADEL; HELION STRONGHOLD joins it with Vesper's boss overhaul, docs/43, not yet released) are built into
  their ground and are never pulled. Instead they fire on a pilot who hides (user, 17 November: "If you stay out of every
  attack's reach for 2 s, the fortress's small terrace guns fire the boss's existing aimed shots toward you, and the
  Citadel's do the same, so there's no safe hiding spot"; `updateHiddenFire` in `src/sim/boss.ts`, points
  `BossDefinition.hiddenFire`):
  - **Trigger:** the pull's own (`hiddenTooLong`: no live target in view for `DRIFT.boss.patience` s), and the pilot itself
    keeps more than half a view from every live target, so a large target that leaves a lagging camera's frame beside the
    pilot draws nothing.
  - **The volley:** the battery on the pilot's side (THE CITADEL's gate pillars, `CITADEL.gatePillars` in
    `src/content/citadel.ts`) winds up the boss's own aimed pair burst at the pilot, with the boss's warning,
    drawn as an aimed shot's windup; its muzzle is the battery projected through the lens for the camera of the windup's
    start, inside the view, and stays fixed. Then one every `hiddenFire.interval` s while the pilot stays hidden.
  - **It stops** the moment a target is back in view or the pilot comes nearer: a windup in progress is dropped.
  - **Fairness:** it starts only as the boss's own attacks would (never during a windup, a held lane or a marked lane) and
    only when the director admits its footprints; its windup is a committed hazard (`hiddenFireFootprints` in
    `src/sim/fairness.ts`). The fairness traces count it as a windup (`tests/sim/fairness-trace.ts`).
  - **Measured, 17 November** (`tests/sim/hidden-fire.test.ts`; Standard, perfect pilot 4 seeds, skilled 10, at the
    expected level): the perfect and skilled pilots never trigger it on Silent Empire, and their clear times and hits are
    unchanged. The parked pilot (seeds 1–4, 30 s) is now fired on: 9 hits on Silent Empire (5 without), where it took none
    from the boss before. A pilot who sidesteps each marked volley takes none from it.

**Measured, 11 November** (parked at the right edge, `bossScenario`, seeds 1–4): with the core open every boss now attacks
(92–172 windups per four fights, against none). THE ECLIPSE and THE HELIOPHAGE, whose vents sit far off their pivot,
still have a far vent in view only near the top of its sway and attack about half as often as in an ordinary fight.

Bosses that stand on the ground (BASTION-9, WARDEN-1) rest on the highest ground under their hull, so a post pulled off
the flat clearing can stand on rougher ground near the edges.

## 6. Technical notes

Camera translation changes projection, not entity coordinates or the ground-target projection
([docs/05 § 3](05-technical-design.md)). Projections, visibility, warnings and debug overlays use the same camera state.
Entities outside the view stay in the simulation; render objects are pooled independently, and camera movement never
removes damaging entities.
