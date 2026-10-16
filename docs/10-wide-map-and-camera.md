# Wider maps, camera movement, and exploration

Design v0.2. The user explicitly replaced a fixed screen-width corridor with a wider map: the visible screen is a slice of the world, and the camera follows lateral travel. The player still controls left/right only; automatic forward travel remains.

## 1. Geometry and feel

Dimensions (15 October 2026, user decision): terrain sections 30 world units wide and 36 long, with a portrait viewport showing 12 units horizontally, so the world is 2.5 screens wide. The camera starts centered. Sections connect along forward travel to form campaign routes or endless terrain; they do not enclose the game in one finite square.

The ship is free to move across the entire world width. Screen edges are not world walls. World x spans −15 to +15; with the 0.42 collider the ship center clamps to [−14.58, +14.58]. The camera center spans [−9, +9], ensuring the viewport stays inside the map. Mandatory squadrons anchor to the camera but at most ±7, so a squadron never pins the ship against a world edge. At the outer map boundary the ship approaches the screen edge naturally. Mark actual world limits with readable terrain/flight-boundary cues; never invisible viewport clamping.

**Responsive viewport (user request, 16 October 2026):** phones fill the available dynamic viewport height (`100dvh`) and use their full width when taller than 9:16. Wider touch devices and landscape phones keep a centered portrait field at full height; desktop retains a fitted 9:16 frame with side rails when space permits. The camera preserves the 12-unit width, 55° elevation, forward screen-up motion and fixed player row. Extra phone height extends the foreground below the canonical combat area; its top stays anchored, so it never reveals approaching enemies earlier or stretches models. Horizontal camera movement does not rotate the flight direction.

Canvas resize updates projection, shadow coverage and post-processing together through the existing ResizeObserver. HUD, special button and menus respect safe-area insets with breathing room. The full frame accepts left/right steering, including the formerly empty lower band. Browser-height/orientation changes clear held input as before. Tests cover resizing, notched-device safe areas (emulated), landscape, desktop fitting and ground-target alignment at different aspect ratios; actual iPhone/Android hardware remains a separate gate.

## 2. Lateral camera contract

Use a 2.5-unit half-width dead zone around the camera center. While the ship stays inside it, camera x stays still. Beyond it, camera target x follows enough to keep the ship at the dead-zone edge, clamped to map bounds. Move toward that target at up to 17 units/s at campaign pace (raised from 14 on 14 October with the faster ship; endless scales it with its pace from 14 to 18.7), slightly faster than the fastest ship; tune for smooth motion without losing forward threat visibility. A tiny interpolation ease is presentation only; authoritative visibility follows the simulation camera.

Camera x is explicit fixed-step state driven by player world x, not a DOM scroll or renderer-only guess. Input still uses left/right screen halves, with the bottom-center special button owning its pointer. Cross-screen steering and camera movement must not invert controls.

No automatic camera jumps toward pickups or side quests. Do not recenter the map after releasing steering or losing a life. Respawn in a safe position near the current region. A menu restart may return to the authored starting point. Camera shake is optional, tiny, and unrelated to exploration.

## 3. Exploration without stopping forward flight

Authored side routes provide different enemy groups, caches, scenery, and firing positions. Telegraph a turn far enough ahead to reach it with the slowest drive. The player chooses what to engage or pass, while terrain continues scrolling. This is route exploration within a scrolling shooter, not a free-roaming map or a demand for vertical controls.

Start the prototype with a center patrol, a left optional cache, and a right optional turret group on one 30-unit-wide section. Place a landmark where it can be seen before the lateral commitment, or use a subtle temporary world-edge signal. No permanent minimap or new HUD meter at launch.

Use stable world IDs and states. Leaving the viewport does not reset enemy HP, respawn a cache, regenerate its reward, reroll loot, or permit repeated discovery bonuses. Unseen rewards are not automatically collected at sector end. Advance ordinary world-relative motion offscreen; only expensive visual details may sleep. Record authored encounters and seeded caches with stable IDs; procedural world layout cannot rewrite the battle schedule.

Side missions may count visits to already-existing optional landmarks. They do not create those landmarks, alter loot, steer the camera, or make enemies behave differently. Standard route choice exists equally without a contract.

## 4. Visibility and fair threats

Offscreen enemies may exist, but they cannot begin a new attack at the player without a readable warning and legal exposure in the current view. Entering a side region must not reveal a pre-fired unavoidable wall. Activate attack schedules through authored visibility-aware encounter rules, consistently for every mode and player.

Already fired projectiles do not vanish when the camera pans. Retain world trajectories and use bounded transient edge warnings if a known active threat approaches from outside the view. A scheduling validator must account for camera movement and reaction time. If a candidate could strike before a readable warning window, delay its emission before it occurs; never silently teleport an existing bullet to rescue the player.

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

Endless allows bypassing optional threats at a cost of missed score/pickups. Route choice is skill expression, not an exploit. Repeat visits cannot farm rewards; repeated camera visibility does not re-award a spawn or kill. Mandatory progression and boss rules (endless bosses must be killed to continue; no retreat, 15 October) must remain consistent with the selected mission/run policy.

## 6. Technical and validation changes

World coordinates remain (x, s), with s ahead of the ship; render aircraft at (x, flightHeight, −s). Camera translation changes projection, not entity world coordinates or ground-proxy height compensation. Ground xProxy stays xGround. Use the same camera state for projections, target visibility, warning placement, and collision debug overlays.

Keep entities outside the visible slice in simulation or an equivalent deterministic lightweight state. Pool rendering objects independently. Budget nearby active threats, terrain draws, and projectiles explicitly; never treat camera movement as permission to remove damaging entities.

M1 must demonstrate traversal across the entire map, dead-zone following, true outer boundaries, discovery, offscreen persistence, current-region respawn, and ground-shot alignment at center and both camera extremes. Check both touch and keyboard. M4 validates route/visibility fairness and identical same-seed outcomes regardless of campaign progress.

Initial width/dead zone/speed values are proposals. The user-confirmed requirement is a wider traversable world with lateral camera tracking and meaningful optional exploration.
