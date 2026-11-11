# Wider maps, camera movement, and exploration

Design v0.2. The user explicitly replaced a fixed screen-width corridor with a wider map: the visible screen is a slice of the world, and the camera follows lateral travel. The player still controls left/right only; automatic forward travel remains.

## 1. Geometry and feel

Dimensions (21 October 2026, user decision; 30 wide from 15 October): terrain sections 24 world units wide and 36 long, with a portrait viewport showing 12 units horizontally, so the world is 2 screens wide. The user narrowed it because at 2.5 screens squadrons lost the ship: a player could slide from one far side to the other and outrun every attack instead of dodging, and beam ships could not find a lane. The camera starts centered. Sections connect along forward travel to form campaign routes or endless terrain; they do not enclose the game in one finite square.

The ship is free to move across the entire world width. Screen edges are not world walls. World x spans −12 to +12; with the 0.42 collider the ship center clamps to [−11.58, +11.58]. The camera center spans [−6, +6], ensuring the viewport stays inside the map. Mandatory squadrons anchor to the camera but at most ±4, so a squadron never pins the ship against a world edge. At the outer map boundary the ship approaches the screen edge naturally. Mark actual world limits with readable terrain/flight-boundary cues; never invisible viewport clamping.

**Responsive viewport (user request, 16 October 2026):** phones fill the available dynamic viewport height (`100dvh`) and use their full width when taller than 9:16. Wider touch devices and landscape phones keep a centered portrait field at full height; desktop retains a fitted 9:16 frame with side rails when space permits. The camera preserves the 12-unit width, 55° elevation, forward screen-up motion and fixed player row. Extra phone height extends the foreground below the canonical combat area; its top stays anchored, so it never reveals approaching enemies earlier or stretches models. Horizontal camera movement does not rotate the flight direction.

Canvas resize updates projection, shadow coverage and post-processing together through the existing ResizeObserver. HUD, special button and menus respect safe-area insets with breathing room. The full frame accepts left/right steering, including the formerly empty lower band. Browser-height/orientation changes clear held input as before. Tests cover resizing, notched-device safe areas (emulated), landscape, desktop fitting and ground-target alignment at different aspect ratios; actual iPhone/Android hardware remains a separate gate.

## 2. Lateral camera contract

Use a 2.5-unit half-width dead zone around the camera center. While the ship stays inside it, camera x stays still. Beyond it, camera target x follows enough to keep the ship at the dead-zone edge, clamped to map bounds. Move toward that target at up to 17 units/s at campaign pace (raised from 14 on 14 October with the faster ship; endless scales it with its pace from 14 to 18.7), slightly faster than the fastest ship; tune for smooth motion without losing forward threat visibility. A tiny interpolation ease is presentation only; authoritative visibility follows the simulation camera.

Camera x is explicit fixed-step state driven by player world x, not a DOM scroll or renderer-only guess. Input uses the left and right screen halves (restored 21 October after steering relative to the ship from 17 October), with the bottom-center special button owning its pointer. Cross-screen steering and camera movement must not invert controls.

No automatic camera jumps toward pickups or side quests. Do not recenter the map after releasing steering or losing a life. Respawn in a safe position near the current region. A menu restart may return to the authored starting point. Camera shake is optional, tiny, and unrelated to exploration.

## 3. Exploration without stopping forward flight

Authored side routes provide different enemy groups, caches, scenery, and firing positions. Telegraph a turn far enough ahead to reach it with the slowest drive. The player chooses what to engage or pass, while terrain continues scrolling. This is route exploration within a scrolling shooter, not a free-roaming map or a demand for vertical controls.

Start the prototype with a center patrol, a left optional cache, and a right optional turret group on one 24-unit-wide section. Place a landmark where it can be seen before the lateral commitment, or use a subtle temporary world-edge signal. No permanent minimap or new HUD meter at launch.

Use stable world IDs and states. Leaving the viewport does not reset enemy HP, respawn a cache, regenerate its reward, reroll loot, or permit repeated discovery bonuses. Unseen rewards are not automatically collected at sector end. Advance ordinary world-relative motion offscreen; only expensive visual details may sleep. Record authored encounters and seeded caches with stable IDs; procedural world layout cannot rewrite the battle schedule.

Side missions may count visits to already-existing optional landmarks. They do not create those landmarks, alter loot, steer the camera, or make enemies behave differently. Standard route choice exists equally without a contract.

## 4. Visibility and fair threats

Offscreen enemies may exist, but they cannot begin a new attack at the player without a readable warning and legal exposure in the current view. Entering a side region must not reveal a pre-fired unavoidable wall. Activate attack schedules through authored visibility-aware encounter rules, consistently for every mode and player.

Already fired projectiles do not vanish when the camera pans. Retain world trajectories and use bounded transient edge warnings if a known active threat approaches from outside the view. A scheduling validator must account for camera movement and reaction time. If a candidate could strike before a readable warning window, delay its emission before it occurs; never silently teleport an existing bullet to rescue the player.

**Squadron pull (11 November 2026, user decision).** A view-anchored squadron anchors at the camera when it spawns and keeps that world x; its craft attack only from inside the view. The user found the gap: "Start left screen, move fully right screen when the wave spawned, then for the next wave same thing backwards" evaded every wave except the aces. The ship crosses a screen in about a second (12 units/s), so a fresh wave never had a craft in view for its whole attack window. The user chose "waves follow you", with a limit: "there should be possibilities to retreat but there should always be 1-2 enemies on screen". The rule (`src/sim/drift.ts`, numbers in `DRIFT`, `src/content/balance.ts`):

- **When.** No hostile air craft in view can attack (fewer than `DRIFT.floor`, 1). This counts squadron members, aces and Wraiths that are fully in view and above the attack floor (the windup gate, `canAttack`). Ground batteries do not count: they are terrain the route passes over. A battery scrolling past would otherwise switch the pull off for its few seconds.
- **Which.** The nearest squadron that has a member beside the view, level with the attack band. It must be in its fighting life: entered and still inside its firing window.
- **How.** It slides sideways toward the view. Its anchor takes an offset, so its shape and authored path are unchanged. Top speed is 4.5 units/s at pace 1 (a third of the ship's, scaled with the pace), accelerating at 12 units/s² and braking at 18. At 3 units/s the slide-in after a crossing left no craft engaged 15% of a wave's firing time; 6 units/s gained little over 4.5 (9% against 11%) and visibly chases.
- **Stop.** Once under way the slide goes on until `DRIFT.engaged` (2) craft can attack, then brakes. So typically a wave's edge members slide in and its bulk stays beside the view: the pilot can retreat from most of a wave, never all of it. With one craft engaged and no slide under way nothing is pulled: "1-2 enemies on screen". Pulling whenever fewer than two were engaged kept the bulk of a wave away less often (54% against 69%) and touched the perfect pilot's play more. Shooting the engaged craft down starts the pull again.
- **Bounds.** The anchor stays within ±4 (`ANCHOR_LIMIT`, the bound a view anchor has at spawn). The ship is never clamped and no edge zone is made safe.
- **Never moved.** Ground batteries, strike sites and every other world-anchored placement (optional routes stay optional, §3), boss launches, aces, and craft leaving for a boss. Nor is a squadron still diving in above the view or past its firing window.
- **Telegraphs stay honest.** A squadron never moves while one of its members winds up, holds a beam lane or warps (a Wraith), or while one of its airframes could reach the ship's row within the 6 s fairness horizon. Each of these stops it dead, not braking. Every footprint the director has admitted (§6 of docs/03: windup muzzles, contact paths) therefore stays where it was forecast.
- **Airspace.** Every slide is checked against the airspace rule with the other squadrons over the 14 s admission horizon, rechecked every 0.1 s of slide. Only one squadron moves at a time.

Measured with a fleeing pilot that crosses to the other screen as each wave spawns (`tests/sim/flee-harness.ts`, `flee-report.test.ts`; every mission at Standard and endless sectors 2–4, seeds 1–4). Before the pull:

- for 62% of the time a wave was in its firing window, no craft in view could attack;
- 95% of the time most of the wave was out of view.

With it:

- 13% (mostly the second or so a wave takes to slide in after a crossing);
- 69%.

On average 38% of a wave's members were in view, against 6%. Windups by wave craft aimed at the fleeing pilot went up 2.5 times (1486 to 3661).

The perfect pilot, which stays with its waves, is barely touched over the same targets with seeds 1–12 (120 runs):

- the time with nothing engaged went from 1.5% to 0.8% (stragglers at a wave's end pulled in);
- windups went from 24 615 to 24 716;
- it took 15 hits, against 14 before.

**Pinned no-hit tests.** Their seeds moved, with seeds 1–16 hits before → after:

- Brood Strike: Standard pulse 3 → 9 (over seeds 1–48: 8 → 11), fan 2 → 3, Veteran seeker 5 → 2.
- Cold Vector at Standard: pulse 2 → 4, fan 1 → 1, seeker 2 → 3.
- Final Horizon: pulse 2 → 2, fan 3 → 5, Veteran seeker 4 → 4.
- Endless sectors 1–8: pulse 10 → 10, fan 5 → 12, seeker 7 → 6.

Of the hits examined (Brood Strike pulse, endless fan), one came from a squadron that had been pulled; the rest came from batteries and squadrons that never moved.

**Fairness trace.** Over endless sectors 8–10 (Nacre, seeds 1–60) it reports the same three seeds as before: Pulsar streams that track the ship, judged in a later view. That is pre-existing. Hits went from 70 to 80; lives lost stayed at 1. Over sectors 5–7 (Vesper) and 11–13 (Amnion), seeds 1–24, there were no violations before or after; hits went from 4 to 4 and from 8 to 13.

The trace used to read a windup called off as a release. It then matched a neighbour's shots to it and reported a short warning: two such reports before the pull, two after. It now counts only a warning that runs down to zero.

Ordinary automatic targeting checks the current viewport. Camera movement cannot extend range, lock distant unseen enemies, or let homing guns acquire unrevealed targets. Main/special fire and offscreen movement use the same fixed-step world state. Freeze area-special footprints in world coordinates at activation so camera panning cannot enlarge their effect.

The fair-path test includes player x, velocity, and camera x across the wide map, plus visibility/telegraph constraints. A physically reachable lane outside the viewport is not automatically a fair human-readable dodge. All supported reactor techs need safe options; no route requires an upgrade.

## 5. Encounters, bosses, and boundaries

Expand content chunks from one screen to world sections with center/left/right regions and validated cross-region overlaps. Limit pressure by the visible active encounter and nearby threats; do not spawn several full-screen bullet patterns at once just because the map is wider than the screen. Squadrons never overlap (see the airspace rule in [worlds and generation](03-worlds-and-generation.md#6-chunk-contract-and-director)). Terrain, loot, and cosmetic RNG remain separate. Combat composition is authored without encounter RNG.

Campaign mandatory fights need visible route guidance and reachable entry points. A boss arena may gently narrow to an authored 18-unit width, still wider than the 12-unit viewport, with physical boundaries clearly telegraphed before entry. Do not snap the ship, abruptly lock the camera, or hide an invisible wall. Boss entry/exit framing and weakpoint exposure need dedicated tests. There is no requirement to add narrowing arenas if a wide fight already works.

**Rolling Thunder arena (15 October 2026).** The forward scroll eases to a stop as Bastion-9 arrives, so the fight happens over static ground, and resumes for extraction. The scroll is a closed form of active time and depends only on the mission:

- full speed 5 units/s until t = 112 s (distance 560);
- smoothstep ease to zero over 6 s, stopping at exactly **distance 575** at t = 118 s, three seconds after the fortress starts rolling in at 115 s;
- static until the core dies, then a 2 s smoothstep ease back to 5 units/s.

The flat arena platform must cover world distance **566 to 601** (s from −9 to +26 relative to the stop) across the full world width (x from −15 to +15).

- The near edge, −9, is below the bottom of the view (minS −6.25).
- The far edge, +26, covers the fortress rolling in: it spawns at s = 22 when distance is about 572.2, so its hull reaches about distance 597.
- During the fight the fortress post is the camera x at arrival, clamped to ±7. It sways ±1.1 laterally and surges ±0.9 forward and back around s = 13, so its 6.7 × 5.7 hull stays within x ±11.5 and distance 584 to about 593.

The sim exposes `RunState.scrollSpeed` for terrain and tread rendering, and `BossState.vx`/`vs` (combat-plane velocity) for the fortress's ground-relative tread speed, which is `vs + scrollSpeed`.

**Boss pull (11 November 2026).** The user's earlier report: a boss could be evaded "endlessly by moving out of frame so that his shooting origin is out of frame". Every boss arrives at x 0 and sways about ±1 around it. From the camera's limit (view x 0 to 12) no attack could start in two cases:

- Bastion-9's core (radius 1.86) never entered the view;
- once the near modules were down, neither did a far module.

Parked at the right world edge with the core open, no boss started a single windup in 60 s. Now a boss's post (`BossState.originX`, which its sway is around) can move sideways (`pullBoss`, `src/sim/boss.ts`; `DRIFT.boss`):

- **Pull.** Once none of its live targets has been in view for 2 s (`patience`), the post lumbers toward the view at 2.5 units/s at pace 1 (acceleration 4, braking 8) until one is. A target out of view for a moment in an ordinary fight moves nothing. Once on its way the post follows at once: the sway brings the target out again now and then, and the post creeps on until the target stays in view.
- **Home.** Whenever a target would be in view with the post back at x 0 (the pilot has come back toward the middle), the post eases home and stops there. In an ordinary fight a boss keeps to its clearing.
- **Limits.** The post stays within the camera's range, ±6, so the view can always centre on it. It moves only sideways: the boss keeps its row and facing, so its back and underside stay unseen.
- **Telegraphs stay honest.** The post never moves while the boss winds up an attack, holds still for its own lanes, or has a lane marked. The footprint forecast reads the post through `bossPose`, so what the director admitted stays exact.
- **Retreat.** A pilot can still retreat to a far edge for a moment, but cannot park there.

Measured parked at the right edge (`bossScenario`, seeds 1–4, 60 s each, against before):

- **Core open.** Every boss now attacks: 92–172 windups per four fights where there were none (Cold Vector 24, Brood Strike 32). Its targets are out of view 11–21% of the time, against 72–100%. Cold Vector's is 37%, against 87%: the Ark's bridge surges above the view's top at times, which no sideways move cures.
- **Only the far module left.** Bastion-9, the Ark, WARDEN-1, THE VEIL and THE CRADLE: 112–188 windups against none; out of view 14–16% of the time, against 100%.
- **THE ECLIPSE and THE HELIOPHAGE.** Their vents sit 5.15 and 5.0 off the pivot, so at the ±6 limit a far vent is in view only near the top of its sway. They are out of view 62–69% of the time and attack about half as often as in an ordinary fight (68–76 windups, against none).

In ordinary play the perfect pilot met a pulled post too. In one Final Horizon fight it stayed on the right after breaking the right vent, and THE ECLIPSE came over to the camera limit. It went home as soon as its reactor opened, which is in view from the middle.

**Render.** The boss's seat follows `boss.x` as before. Bastion-9 and WARDEN-1 rest on the highest ground under their hull, so a post pulled off the flat clearing (which is centred on x 0) can stand on rougher ground near the edges.

Endless allows bypassing optional threats at a cost of missed score/pickups. Route choice is skill expression, not an exploit. Repeat visits cannot farm rewards; repeated camera visibility does not re-award a spawn or kill. Mandatory progression and boss rules (endless bosses must be killed to continue; no retreat, 15 October) must remain consistent with the selected mission/run policy.

## 6. Technical and validation changes

World coordinates remain (x, s), with s ahead of the ship; render aircraft at (x, flightHeight, −s). Camera translation changes projection, not entity world coordinates or ground-proxy height compensation. Ground xProxy stays xGround. Use the same camera state for projections, target visibility, warning placement, and collision debug overlays.

Keep entities outside the visible slice in simulation or an equivalent deterministic lightweight state. Pool rendering objects independently. Budget nearby active threats, terrain draws, and projectiles explicitly; never treat camera movement as permission to remove damaging entities.

M1 must demonstrate traversal across the entire map, dead-zone following, true outer boundaries, discovery, offscreen persistence, current-region respawn, and ground-shot alignment at center and both camera extremes. Check both touch and keyboard. M4 validates route/visibility fairness and identical same-seed outcomes regardless of campaign progress.

Initial width/dead zone/speed values are proposals. The user-confirmed requirement is a wider traversable world with lateral camera tracking and meaningful optional exploration.
