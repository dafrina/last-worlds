# Technical design

This is the target architecture. The initial runtime is being built under docs/12-implementation-contract.md; see build-status.md for actual completion. Platform references were checked on 13 October 2026; verify installed dependency versions when implementation begins.

## 1. Stack and deployment

Use TypeScript, Vite, Three.js, native DOM/CSS menus and HUD, Web Audio, IndexedDB saves, and a versioned service worker. Target GitHub Pages as the authorized static HTTPS host, following the wardrobe app. Keep Vite assets and future manifest/service-worker scope compatible with a repository subpath. Publish only a verified build, then record the actual public URL and deployment result. No server is needed for campaign progression, seeded runs, or local scores. Select and pin compatible package versions at M0; do not copy an unverified future version number into the plan.

Three.js is a rendering layer; this small game's simulation should remain custom and compact. Its documented WebGL renderer uses WebGL2, so WebGL2 support is the minimum renderer capability. Show a readable unsupported-device screen if initialization fails. WebGPU is optional future work and must not be a requirement. See [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

Use Vitest for deterministic simulation and save rules, and Playwright for browser flows. Add a schema validator such as Zod if it materially reduces configuration mistakes. Avoid a full physics engine, large ECS framework, generalized game editor, React per-frame state, and backend services. React or another UI framework is not needed for the first menus; reassess only if UI complexity warrants it.

## 2. Proposed source layout

```
src/
  app/             # boot, screen flow, dependency wiring
  sim/             # pure fixed-step world and systems
    combat/        # targeting, projectiles, collision, damage
    entities/      # compact entity stores, stable IDs, pools
    encounters/    # chunks, director, boss state machines
    modes/         # campaign and endless policies
  render/          # Three.js scene, instances, interpolation, VFX
  input/           # pointer/key adapters -> InputFrame
  audio/           # sound event consumer, voice limits
  ui/              # accessible DOM menus, HUD, controls
  content/         # validated runtime definitions and manifests
  persistence/     # versioned saves, migrations, attempt transactions
  platform/        # visibility, resize, capability and service-worker hooks
  debug/           # overlays, seeded scenario runner, metrics
public/assets/     # optimized GLB, textures, audio, icons
tests/            # simulation, content, persistence, browser flows
tools/            # asset/content validation and performance scenarios
```

Source folders are a plan, not existing code. The initial JSON in `docs/spec/` illustrates content contracts. On implementation, move/adapt it into one authoritative runtime configuration and keep documentation linked to that source. Do not maintain competing balance tables without a consistency check.

## 3. Logical space, wider map, and camera

Simulation uses (x, s): x is horizontal world position; s is ahead of the player's fixed forward row. Aircraft render at world (x, H, −s), H = `VIEW.flightHeight` = 3.8 (raised from 3 on 14 October so aircraft clear tall terrain; render/projection only). Terrain scrolls toward −s at an initial 4 units/s; projectile and aircraft velocities are player-relative and do not subtract scroll twice.

Initial map sections are 36 × 36 units, connected forward. World edges are x = ±18; player radius 0.25 gives center bounds ±17.75. The fitted 9:16 viewport shows 12 units horizontally. Camera x ranges ±12 and follows beyond a ±2.5-unit dead zone, at a proposed maximum rate of 14 units/s. Camera translation is explicit fixed-step state. See [wide map and camera](10-wide-map-and-camera.md) for follow, exploration, visibility, and boundary rules.

Use orthographic projection at 55° elevation, zero yaw/roll. In the 9:16 reference frame the player row appears near 76% screen height, with approximate visible s bounds −6.25 to +19.8. Since 16 October 2026, phones fill their available height: preserve the reference frame's top and 12-unit width, extending foreground below it on taller displays rather than stretching models. The player therefore sits higher as a fraction of a tall phone's screen. Desktop retains the 9:16 fitted frame. Derive exact bounds from projection. Extra device width does not reveal extra tactical width. Screen edges never clamp movement before the actual world boundary.

Entities preserve health, motion, IDs, loot and discovery state outside the viewport; rendering may cull them. Unseen enemies cannot begin unreadable attacks, and already fired shots do not vanish when the camera pans. Freeze area-special footprints in world coordinates at activation. Recycle passed sections and bound retained state for endless memory use.

### Ground targets: the essential contract

Ground visuals exist at their actual height. Collision and aiming still use a proxy in the flight plane. Project a visible target core with the canonical camera, then intersect that screen ray with height H to obtain its logical `(x, s)` proxy. Because the camera is orthographic and unrotated in yaw, this can be calculated without renderer dependencies:

```
xProxy = xGround
sProxy = sGround + (hCore - H) * cot(cameraElevation)
```

The proxy projects to the visible core's screen position. Use its authored circle/box for acquisition, projectile collision, damage indicators, and target brackets. This avoids a turret being visibly under the crosshair but impossible to hit because it sits below the aircraft. A debug view shows the physical core, projected proxy, and target bounds.

At impact, render a short terminal tracer/energy arc to the actual core and place sparks there. A ground enemy's hostile shot begins logically at its muzzle proxy, with a brief visual launch arc from the real barrel. These cosmetic bridges never add collision or alter damage timing. Higher terrain may move the proxy, but must remain within authored visibility limits.

No scenery raycasts determine main-fire line of sight. “Line of sight” means a clear, valid path in the shared arcade combat plane, with the first damageable target blocking non-piercing shots. Terrain is scenic. Make that rule legible and consistent for every weapon.

The canonical camera angle is fixed, while horizontal translation follows the ship in simulation. All visibility, warnings, targeting and debug overlays use that same state. Shake and minor presentation offsets apply consistently to rendered objects and their markers without changing logical targets. Resize changes fitted pixels, not gameplay geometry. Camera angle changes happen only in an explicit settings/debug transition and regenerate all proxy mappings before resuming.

## 4. Simulation update

Run fixed 1/60 s steps with render interpolation. Proposed order:

1. Sample queued `InputFrame`; process permitted mode transitions.
2. Update player movement and lateral camera.
3. Advance director/boss state using that view, admit scheduled entities, update enemy/world motion, and derive ground proxies.
4. Acquire main targets and execute eligible weapon/special emissions.
5. Advance projectiles and hazards; calculate swept collision candidates.
6. Resolve shield-charge hits, life loss, score, charge gains, and loot; emit objective/statistics observations with no mutation authority.
7. Collect pickups; advance special charging and mode clocks.
8. Emit compact presentation events and a read-only render snapshot.

Resolve events by simulation tick, event type priority, and stable entity ID. Resolve simultaneous boss death and life loss by applying life loss first. If lives remain, allow normal boss completion; final-life loss fails campaign without clear/contract/boss-completion payout. Endless records legitimate boss score even if the run ends that tick. Commit a single unambiguous outcome. Test the policy explicitly.

Use swept segment/circle or segment/AABB tests for fast shots; endpoint-only collision can miss a target between frames. Colliders are simple and authored, not triangle meshes. A spatial grid or lane bins may be added when profiling shows all-pairs tests dominate; start with bounded candidate sets.

Clamp normal catch-up to five steps per animation frame. Do not simulate a huge backlog after sleep. If a foreground gap exceeds 250 ms, discard its backlog and reset the accumulator; do not repeatedly open the pause menu on rendering hitches. When the document becomes hidden or the window blurs, pause explicitly. At a normal 30 Hz render rate, perform two simulation steps; reducing visual quality never slows combat. Expose High/Low graphics without changing simulation parameters. The prototype drops excess backlog, so severe rendering overload can slow wall-clock progress; automatic overload detection and ranked timing validation remain required before a public competitive scoreboard.

## 5. State and interfaces

```
InputFrame = { horizontal: -1 | 0 | 1, specialPressed: boolean, pausePressed: boolean }
RunConfig = { mode, seed, generatorVersion, contentVersion, rulesetId, loadout, missionId?, campaignDifficulty? }
Target = { id, shape, x, s, alive, damageable, team, rewardEligible }
GameEvent = ShotFired | Hit | Destroyed | PickupCollected | PhaseChanged | RunEnded
```

Main systems: `MovementSystem`, `TargetingSystem`, `WeaponSystem`, `ProjectileSystem`, `CollisionSystem`, `DamageSystem`, `PickupSystem`, `Director`, and a `ModePolicy`. A mode policy supplies allowed pickups, equipment initialization, death behavior, scoring/banking, and completion. It must not duplicate core collision or weapon code.

Keep CampaignProfile, RunState, Settings, CampaignStats, EndlessStats and EndlessRecords distinct. Campaign holds four-slot equipment, purchases/ranks, credits, missions, difficulty-tagged clears/records, career counters, contract receipts and visual unlocks. RunState holds entities, cameraX, discovered IDs, seed/version, lives, integer shield charges/recharge timer, normalized special charge and equipment. No player hull HP. Construct endless from an immutable baseline independently of campaign. Objective evaluators only consume events; compare identical combat/RNG for contract on/off and new/completed campaign profiles.

RNG streams: loot, terrain, cosmetics. Combat uses an authored playlist, without procedural encounter selection. World layout is seeded, streaming, bounded in memory, and required in the MVP. They cannot advance one another. A reproducible run means the same version, seed, and tick-indexed input on a supported implementation yields the same events; cross-browser floating-point identity is outside v1's promise. Store seed and versions in debug exports.

## 6. Pointer input and responsive layout

Pointer Events provide a shared touch/mouse/pen event model and pointer capture. Use `touch-action: none` on the actual gameplay surface, plus pointer cancellation/lost-capture handling. Keep ordinary menu scrolling and browser zoom behavior outside that surface. See [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

On pointer-down, test UI controls first, then classify left/right inside the fitted gameplay rectangle. Persist the pointer's role until pointer-up/cancel, except that a held steering pointer switches left/right when it crosses the middle (3% dead band; user decision 14 October). Special and UI pointers never steer. Count held pointers per side; neutralize opposing inputs. Special uses its own pointer and edge-trigger queue. Keyboard input joins the same frame adapter, with blur clearing state. Do not use only `isPrimary`, because a second touch must activate special.

Resize and safe-area changes rebuild the fitted rectangle and release held inputs. Pointer positions are CSS pixels; rendering resolution does not alter touch classification. Use a device-pixel-ratio cap independently of CSS layout.

## 7. PWA and offline behavior

A manifest and HTTPS hosting support installable web-app behavior; standalone display lets the launched app have its own app-like window. Installation UI differs by browser. Offline operation needs an explicit cache strategy, not merely an install icon. See [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [standalone display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app).

Manifest: name/short name, id, start URL, scope, standalone display, theme/background colors, 192 and 512 icons, maskable icon, and preferred portrait orientation. Include appropriate touch icon metadata. Treat orientation and install prompts as capability-dependent enhancements. Provide small browser-specific installation instructions through feature detection and tested UI; do not promise a universal install button.

Cache the shell and the complete first-planet asset pack after successful download. Show download/offline-ready state. Cache later planet packs atomically with a versioned manifest; a half-downloaded pack must not appear playable offline. Use content-hashed assets. A new service worker waits until the user returns to a safe menu; never reload or swap runtime content during a run. Retain a known-good shell/pack until the replacement is complete, then clean old caches.

Test first launch, installed launch, airplane mode after download, missing pack, interrupted download, stale cache, and new-version activation. Offer retry/recovery when assets fail. No assumption that a cached build or save will exist forever.

## 8. Saves and interruption

Use versioned IndexedDB transactions for profile, records, and attempt receipts. Maintain the previous valid profile as a recovery snapshot and validate migrations. Storage can be constrained or evicted; handle quota errors and offer explicit export/import of a versioned JSON save. Do not claim home-screen installation guarantees permanent storage. See [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

For MVP, persist campaign profile after purchases and results; persist local high scores at run end. Save a campaign recovery record after each completed chunk with credits, counter/statistic deltas, objective state, versions, and attempt ID. If the browser process is terminated, recover that attempt as an ended attempt with its checkpoint failure payout, once. Do not reconstruct an exact mid-boss simulation or issue success rewards. Endless interruption after process loss ends the run using the last completed-sector score checkpoint; the results are marked interrupted. Exact mid-run resume is deferred.

This limited recovery policy is separate from ordinary backgrounding: when the process stays alive, pause the full in-memory state and resume after a countdown. The Page Visibility API exposes visible/hidden transitions; use it to pause gameplay and audio. See [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

Before entering an attempt, atomically write its unique ID and active status. Finalize once in one transaction for permitted credits, campaign counters, career receipts, selected contract results and mode-specific statistics. Repeated events/reloads cannot duplicate rewards. Keep lifetime aggregates, last 50 summaries per mode, and 10 top eligible endless records, tagged by version/category. Local saves are editable, not an anti-cheat mechanism; see docs/09-objectives-and-statistics.md for the public-board boundary.

## 9. Performance budgets and quality

Targets for the selected baseline phones, to be measured: 60 FPS preferred, stable 30 FPS low tier acceptable. Proposed low-tier scene ceiling: 100 draw calls, 180k visible triangles, 24 ordinary enemies plus boss modules, 300 hostile and 220 friendly projectiles, 30 pickup groups, 300 cosmetic particles. These are profiling guardrails, not guarantees or limits to silently trim required gameplay.

Pool entities, instance repeated projectiles/props, share materials, and avoid allocations in hot loops. Cap pixel ratio to 1–1.5 initially. Prefer one directional light and ambient fill; use contact/blob shadows on low tier, bounded shadow maps on higher tier. Bloom is subtle and disabled first under load. Plan graceful WebGL context-loss recovery, dispose resources, and budget textures explicitly. These choices follow the general resource and rendering concerns in [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices); exact game limits require profiling.

Quality reduction order: cosmetic particles → bloom → shadows → resolution. Never remove hostile bullets, warnings, collision, or target markers. Content admission must obey gameplay entity ceilings before spawning; if a pool would overflow, delay the whole scheduled emission under a documented rule, never drop an arbitrary bullet from a supposedly fixed pattern.

Initial compressed transfer targets: shell/boot ≤2 MB, first playable pack ≤12 MB total including boot, full three-planet cached game ≤40 MB. Asset packs load by planet. Measure real compressed sizes; avoid treating network speed as guaranteed. Provide a progress screen and retry path.

Run a 10-minute stress session on at least one baseline iPhone and one midrange Android. Record device, OS/browser, quality, median/p95/p99 frame times, longest hitch, heap trend, and temperature-related slowdown observations. No sustained heap growth after pools warm up. Browser emulation is useful for layout, but does not validate GPU performance, touch ergonomics, thermal behavior, installation, or audio on actual phones.

## 10. Failure behavior and non-goals

No WebGL2: explanatory supported-device screen. Context loss: pause, rebuild from cached assets if possible, otherwise offer safe return to menu with attempt recovery. Audio blocked: play silently until a valid gesture. Save unavailable: show a clear persistence status and allow play without implying progress is saved. Network lost after a complete pack is loaded: continue locally. Missing required assets: never begin combat with invisible threats.

No multiplayer, authoritative score server, cloud sync, background simulation, remote code execution, or runtime content generation service. A future online leaderboard needs a new trust/security design; local seeded simulation alone cannot prove a score legitimate.
