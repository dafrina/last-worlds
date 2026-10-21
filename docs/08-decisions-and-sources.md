# Decisions, assumptions, alternatives, and sources

Design v0.2 · 13 October 2026 · working title Last Worlds

## Confirmed user requirements

- Plan in detail first and create documentation that agents can use to build the game.
- Fighter-jet-like spacecraft flying forward/upward over alien planets.
- Real 3D, isometric-style presentation; combat on one plane, with shootable ground vehicles/turrets and a mobile-fortress-style boss.
- Browser-based mobile play, suitable for adding to the home screen.
- Modern stylized visuals between realism and a toy-like aesthetic; arcade effects and drops.
- Multiple themed levels, distinct enemy flight patterns, and a considered review of procedural generation.
- Campaign favors persistent builds/upgrades; endless favors early powerful weapons and restarting after lives run out.
- Main weapon with unlimited ammunition, rechargeable special, lives and shield icons; no separate player hull-health or extra energy indicators.
- Follow-up control choice: portrait; automatic main fire only when a target is in line of sight; left side moves left and right side moves right; only the special attack gets a separate button. Latest refinement: plain minimal analog/arcade styling, bottom-center placement, ship/shield icons, no persistent steering arrows; hints blink briefly at flight start.

- Campaign equipment has exactly four slots: main weapon, special weapon, shield tech, and maneuverability-focused reactor tech.
- Endless starts identically for everyone; campaign advancement cannot improve its chances or score opportunities. The two modes do not exchange progression.
- Campaign-only side missions/career goals may award coins. They only observe normal mechanics; do not alter combat for them. Infrastructure preservation was an example.
- A statistics screen should report campaign and endless separately.
- Maps extend beyond the horizontal viewport; lateral camera tracking enables exploration and alternate evasive routes.
- Hero tiers must have fundamentally different airframes. The accepted battered utility starter must appear smaller in gameplay; preserve the latest accepted artwork.
- Campaign has selectable difficulty levels. Endless ramps difficulty within every run, independently of campaign difficulty and advancement.
- **Steering relative to the ship (17 October 2026, replaces the screen halves):** a touch left of the hero ship steers left, right of it steers right, and the direction holds while the finger stays down, even after the ship passes under it. Dragging the finger across to the other side of the ship switches direction. Still no drag-to-position steering.
- **Portrait only (17 October 2026):** the installed app is locked to portrait (web manifest; the browser's orientation lock where allowed); a phone turned sideways sees a "turn your phone upright" notice and the flight pauses.

The user did not approve every numerical value, planet name, ship design, scope count, or implementation choice in this package. Those are proposed defaults, clearly separated below.

## Proposed defaults and rationale

| Decision | Proposed choice | Why / revisit trigger |
| --- | --- | --- |
| View | Orthographic 55°, zero yaw; lateral camera follow across a wider map | Camera motion is confirmed; exact angle/width/dead zone need M1 tuning |
| Touch semantics | Hold sides; side ownership set on touch-down | Avoids accidental reversal during drift; validate crossing behavior in M1 |
| Targeting | Forward weapon envelope, ground proxies, no scenic obstruction | Preserves one-plane interaction and visible alignment |
| Engine | Three.js + TypeScript + Vite | Small web-first stack with explicit renderer/simulation separation |
| Runtime physics | Simple fixed-step 2D simulation | Appropriate to the actual interaction model |
| Mode implementation | Shared combat plus separate policies | Reuse without campaign/endless power contamination |
| Main ammo | Unlimited | Positions attention on aiming and dodging |
| Protection / special | Discrete shield charges plus lives; one rechargeable special, time plus eligible kills | Icon-only HUD; exact charge counts/timing are proposed |
| Map dimensions | 36-unit square sections with 12-unit viewport; 2.5-unit camera dead zone | Three visible-widths of optional routes; tune in M1 |
| Campaign difficulty | Relaxed, Standard, Veteran; locked per attempt | Difficulty selection confirmed; names/scales are proposed |
| Endless ramp | Sector-based formations/HP/speed with fairness ceilings | Same starter and ramp rules for all players |
| Equipment | Main, special, shield tech, reactor tech | No passive modules or power budget |
| Objectives | Campaign-only observational milestones/contracts | No changed targeting, damage, camera or drops |
| Campaign economy | One currency, capped ranks, fixed unlocks | Build decisions without random progression gates |
| Endless loss | Three total lives; preserve chosen equipment, lose one pip | Failure costs momentum without a severe downward spiral |
| Procedural content | Seeded world/terrain layout in MVP; authored enemies and battles | Endless world variety with deliberate combat |
| Scope | One-planet MVP; three-planet small release | Complete a small product before expanding content |
| Scoreboard | Independent local endless board at MVP, version/category tags | Public verified rankings need a separate delivery/trust design |
| Recovery | Live pause; limited checkpoint recovery after process death | Avoids a large exact-snapshot/replay subsystem for MVP |

## Alternatives considered

**Procedural scope, updated by the user:** world/terrain/level layout is required in the MVP and supports the core endless mode. Enemies and encounter/battle composition stay authored. Procedural hero designs are deferred for later consideration.

**Strict diagonal isometric camera:** depth is attractive, but screen-horizontal movement and screen-up flight become harder to map. Use a high orthographic angle with an aligned playfield. Geometry and lighting still provide depth.

**Manual shooting or drag steering:** not the chosen defaults after the user's control clarification. Do not quietly return to them during implementation.

**Separate ground-fire button or altitude modes:** unnecessary input complexity. Use shared target rules and clear projected weakpoints.

**A full engine/editor or native wrapper:** could become useful with a larger team or native distribution target. For a small web-first single-plane game, the proposed renderer and compact simulation reduce initial moving parts. No claim is made that this is universally the best engine.

**React-driven game entities:** inappropriate for per-frame projectile work. Native UI is sufficient initially; a UI framework can later serve menus without owning simulation.

**Unbounded statistical difficulty:** eventually undermines fairness. Cap projectile speed/HP and change combinations within reachable-path constraints instead.

## Experiments still needed

1. Does holding screen halves feel comfortable during rapid reversals? Compare fixed touch ownership with a deliberate side-switch alternative only during an explicit experiment.
2. Can players immediately distinguish idle-no-target from weapon failure? Test feedback and alignment tolerances.
3. Does a projected ground proxy feel intuitive in motion at phone size?
4. What warning duration and gap size work with real thumbs and braking?
5. How much terrain detail survives the performance/readability budget?
6. Do campaign rewards produce useful choices without repeated mandatory farming?
7. Are endless capsule pauses exciting or too frequent?
8. Does lateral camera motion reveal danger early enough while making exploration worthwhile?
9. Do shield icons and different airframes communicate protection/collision honestly?
10. Are proposed side missions achievable and enjoyable without changing the base mechanics?

## Verified platform references

These references support platform choices, not the original game design or untested balance estimates. Reviewed 13 October 2026. Browser behavior and library versions must be rechecked during implementation.

| Source | Used for |
| --- | --- |
| [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) | WebGL2 renderer requirement |
| [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) | Manifest, secure delivery, browser-dependent installation |
| [MDN: Standalone app display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Create_a_standalone_app) | Standalone launch presentation |
| [MDN: Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | Pointer capture, multi-input handling, touch-action |
| [MDN: Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | Background/foreground lifecycle handling |
| [MDN: Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Storage failure/eviction and save recovery concerns |
| [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | Resource, resolution, rendering, and context-loss considerations |

## Change log

- 2026-10-13: Initial design package and concept art created. Incorporated the user's confirmed half-screen steering, target-gated main fire, and separate tactile special button. All implementation and gameplay-test milestones remained unstarted.

- 2026-10-13, v0.2: Incorporated all subsequent user refinements: four-slot campaign loadout, lives/shield icons, button-only special recharge, minimal bottom-center control and temporary hints, independent endless score fairness, campaign-only observational goals and separate statistics, wide-map camera/exploration, distinct hero chassis by tier, expanded accepted alien concepts, a smaller in-game starter, selectable campaign difficulty and explicit endless ramping. This supersedes the original hull-health, passive-module, reactor-budget, fixed-width viewport, ornate HUD and same-airframe upgrade proposals. Gameplay remains unimplemented.

When changing a design later, append the date, old rule, new rule, evidence/reason, and affected documents/configurations. Do not quietly rewrite a user-confirmed constraint as an implementation convenience.

- 2026-10-13, v0.3: User authorized implementation agents; confirmed procedural world design for MVP and authored enemies/encounters/battles. Hero generation deferred. GitHub Pages is the intended later deployment. Main families retain distinct straight, spread, or homing behavior; Seeker replaces Arc in the four-family MVP proposal. M0/M1 implementation begins with generated terrain and a playable endless foundation; later milestone content remains pending.

- 2026-10-14, v0.4: Confirmed name **Last Worlds**. Shields recover only through rare pickups; no passive regeneration. Prototype supply budget: two cells on Relaxed/Standard training, one on Veteran, one per endless sector. First art pass uses real 3D terrain and modeled scenery, sharper rendering, detailed existing ship silhouettes, and pickups distinguishable from bullets. The first release keeps Khepri, Nacre, and Vesper. The proposed solar-system invasion/reclamation lore, Mars finale, and dialogue are future narrative context only. GitHub Pages deployment has been explicitly authorized.

- 2026-10-15, v0.5–0.7 (user decisions during the world, combat and Vesper passes):
  - **Hitbox:** the player hitbox is 0.42, the third tier's planned size; the starter model keeps its size.
  - **Shields:** one run-wide pool; losing a life no longer refills them, and only pickups do. This replaces "a replacement life starts with full shields".
  - **Enemy fire:** about 35% faster in total, enemies only; the player's cadence is unchanged.
  - **World and controls:** the world is 30 units wide (2.5 screens). A held steering touch that slides across the middle switches direction.
  - **Bosses:** each mission boss fights in a static arena where the scroll stops (Bastion-9 on a flat platform, the Helion Ark on open water).
  - **Vesper:** added as the second playable planet, with the Cold Vector mission and the Helion Ark (docs/17); about 70% land and 30% water.
  - **Endless:** it cycles planets with a hyperdrive jump after each planet's boss (docs/18).
  - **Endless bosses must be killed:** no timeout or retreat; the run continues only after the kill. This replaces docs/03 §8's "the boss retreats after 60 s overtime".

- 2026-10-16, responsive viewport: the user reported unused vertical space on their phone and requested device-sized mobile play. Replaces letterboxing every phone to 9:16. Phones now fill the dynamic viewport height, with safe-area HUD/control padding. Implementation choice for desktop: keep the centered 9:16 frame. Camera projection preserves width and the enemy approach area, adding foreground on taller phones without stretching ships or changing simulation. Affects `src/ui/styles.css`, camera sizing in `src/render/scene.ts`, and docs/05, /06, /10 and /16.


- 2026-10-20, boss remodels (user decisions):
  - **Clean remodels replace the decimated imports.** The user disliked the reduced v4 copies of their three supplied GLBs ("they look wonky") and asked for clean, simple models remodelled over them, keeping their proportions. The v5 bosses are new Blender geometry traced over the supplied models, with the design sheets (front elevations of BASTION-9, HELION ARK and THE VEIL) as the shape reference, and baked textures. Shape fidelity matters more than surface detail. Backs and undersides, which the game camera never shows, stay plain. See art/boss-remodel/README.md.
  - **BASTION-9 is 20% larger, everything included:** the model and its combat geometry. Batteries now sit at ±2.64 (was ±2.2), the core 1.62 behind (was 1.35), target height is 1.74, hit radii are 0.84 and 1.86, and the overload lanes are 1.68 and 2.88 wide. Its tracks run the full length of the hull ("way too short, looks comical").
  - **HELION ARK:** it keeps the supplied layout, but its outriggers continue past the aft wing instead of ending abruptly ("cut off"). The centre hull is chunkier and longer, with the design sheet's tall split spire as the bridge armour. Combat geometry is unchanged.
  - Rollback is one filename per boss in `src/render/boss-assets.ts`; the v4 files stay published.
  - **WARDEN-1 is remodelled too**, after its design sheet: a tall command column whose seam is the core hatches, twin-barrel turret pods on chevron side blocks, thrusters and masts. It keeps its size and combat geometry.
  - **WARDEN-1 flies.** It hovers 1.1 above the ground on burning thrusters with a gentle bob, and drops to the ground when destroyed. Its render-only target height rises from 1.3 to 2.4 so the weak points stay on their camera rays; collisions and attacks are unchanged.
  - **THE VEIL has three pods abreast in each wing bay**, as in the concept art. The innermost is the weak point and the other two are the same egg pods; glowing petal seams make them read from the game camera.
  - **The hero keeps only its real model shadow on High.** The blob shadow stands in only on Low, which has no shadow maps.

- 2026-10-20, facilities and districts (user decisions):
  - **Facility compounds remodelled after the facility sheets.** The user found the large building complexes "super flat" and asked for remodels that are more interesting and "textured like the bosses", taking "the render arts as inspiration". The six v1 gun-court plants (flat vertex colours) are replaced by textured v2 plants per world (`art/facility-remodel/README.md`). The seat contract is unchanged.
  - **Districts:** option A (Khepri refinery district prototype, docs/23 §6). The world may get more vertical space if a map needs it.
  - **Facilities are modular, and not always a court** (user: "dont make it always have a open court design", "maybe these could be made modular as well?"). Plants are composed from per-world module kits by a seeded grammar with several arrangements per world; the U court is one option among them (docs/25).
  - **Higher roofs** use the headroom under the unchanged flight plane: modules up to 3.25 on low ground.
  - **Luna joins with much less** ("luna should get much less populated amount of buildings and infra"): about 30% of its batteries get a small, single-facility plant, and its outposts are rarer and smaller.
  - **Terrain relief** (user: "nacre is pretty amazing but the others are a bit too flat often", "it feels like theres two plateaus"): Khepri, Vesper and Luna get multi-level, varied landforms. Relief extends downward to −10; the flight plane stays at 3.8 (docs/26). Nacre is unchanged.
  - **Pulsar:** a stream of tracking shots (each aimed at the ship as it leaves the muzzle), ten instead of six straight down.
  - **Victory warp:** it never lifts back onto the level; it holds deep space behind the results.
  - **Boss touch-ups:** the Ark's dark spire, which read as a comical giant windshield, is now a compact light cowl; the Bastion loses the boxy pieces over its treads, and its front tread armour is cut back.
  - **Vesper hero bolts:** a dark outline and a deeper cyan, so they read against snow.

- 2026-10-21 (user decisions):
  - **HELION ARK radiator targets** move to x ±2.75, onto the radiator blocks ("half the ring is not over the model"); the targets' s and size are unchanged.
  - **Bastion treads** must move (instanced links).
  - **No late-appearing facilities, infrastructure or bosses:** flights and warps wait for their world's assets.
  - **Terrain cliffs** (in progress): crisp cliff walls where the landform is a cliff, after `art/concepts/01-worlds-direction.png`, smooth hills elsewhere.

