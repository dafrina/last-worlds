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
