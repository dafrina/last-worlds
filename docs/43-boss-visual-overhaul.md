# Boss visual overhaul: VEIL, CRADLE, HELION STRONGHOLD

The user's specification of 17 November 2026, kept verbatim below as the design record for this work.

Notes added by the integrator:
- **Sources:** the user's files are in `art/source/bosses/`:
  - the spider reference is `cradle-walker-original.glb`;
  - the fortress reference is `stronghold-original.glb`;
  - the user's target images are in `references/`, see that folder's README.
- **HANDOFF.md:** it no longer exists. The 17 November docs rework folded it into README.md and docs/07.
- **Deploying:** the specification asks for approval before deploying, so the integrator asks the user before any deploy of this work.

---

# LAST WORLDS — BOSS VISUAL OVERHAUL
## Claude Code / Blender Implementation Specification

**Task:** Remodel and integrate three bosses using the existing Last Worlds asset-production workflow.

**Reference files provided:**
- `monster spider 3d model.glb` — Amnion's new walking CRADLE reference.
- `cf42e8f1-dec1-484b-8892-4a619271fc0e.glb` — Vesper's alpine fortress reference.
- The existing CRADLE model in the game — base model for Nacre's redesigned VEIL.

Implement the changes in the playable game, including rendering, animations, terrain integration and mobile optimization.

## 1. Objective

Improve the visual diversity of the Last Worlds campaign while preserving the existing boss gameplay. Three changes are required:

1. **NACRE:** Reuse and reskin Amnion's current CRADLE model to become Nacre's new VEIL.
2. **AMNION:** Replace CRADLE's flying model with a gigantic walking broodmother hive based on the supplied spider GLB.
3. **VESPER:** Replace HELION ARK's visual model with a stationary alpine military fortress integrated into snowy mountain terrain, using the supplied fortress GLB as reference.

The goal is to give each planet a unique boss silhouette and visual identity. These changes are primarily visual. **Do not redesign the bosses' attack patterns, damage, health, rewards, difficulty scaling or phase logic.** Keep the existing boss gameplay intact unless a narrowly scoped adjustment is essential for positioning or visual presentation.

## 2. Critical — existing asset workflow

Use the repository's existing 3D modeling, Blender and asset-optimization workflow. Before editing: read `AGENTS.md`, `COORDINATION.md` and `HANDOFF.md`; inspect the existing boss modeling and asset-generation workflow, current boss meshes, materials and animation architecture, how the Nahara Citadel is integrated into the terrain, current Vesper terrain and boss-arena generation; review current mobile rendering budgets.

Do not introduce a new asset-processing architecture. Follow current conventions for Blender source files, modular boss construction, GLB export, geometry optimization, material and texture preparation, asset loading, animation updates, rendering and quality presets.

### Reference GLB policy

The two supplied GLBs are **design references, not production-ready assets**. They establish overall proportions, main shapes and silhouettes, surface details, texturing direction, mechanical or biological structure, and relative dimensions of major components. They may also provide reusable texture information. However, the meshes must be rebuilt or appropriately retopologized into optimized production assets.

The supplied GLBs currently contain approximately: spider 1,995,000 triangles; fortress 1,954,000 triangles. Both are single-mesh references rather than modular, animated game assets. Their coordinates are normalized, so do not interpret their raw dimensions as intended in-game meters. Use the actual game's boss proportions and camera presentation when establishing final scale.

### Optimization requirements

- Build efficient, clean geometry.
- Separate independently animated components.
- Separate destructible boss components.
- Remove invisible internal geometry.
- Use appropriate polygon density.
- Bake reference detail into textures or normal maps where useful.
- Reuse and optimize the reference textures where suitable.
- Use texture atlases and compressed formats where supported by the existing pipeline.
- Avoid unnecessary material and draw-call counts.
- Create lower-detail alternatives if the existing workflow uses LODs.
- Preserve readable silhouettes on mobile screens.

Do not select arbitrary polygon budgets without reviewing the project's existing asset and performance standards. The optimized bosses must match the quality of existing Last Worlds bosses, not look like primitive placeholder geometry. **Prioritize visible geometry and strong silhouettes over invisible surface detail.**

## 3. Nacre — redesign VEIL using the old CRADLE

### Objective

Replace VEIL's existing 3D model with a reskinned and adapted version of Amnion's CURRENT CRADLE model. This is the old flying CRADLE model already present in Last Worlds. It is NOT the newly supplied spider model.

### Critical implementation order

Before replacing CRADLE's current asset:
1. Identify its source model and geometry.
2. Preserve a separate, reusable copy for VEIL.
3. Give VEIL its own asset identity and materials.
4. Confirm VEIL renders independently.
5. Only then replace Amnion's CRADLE with the new spider boss.

Do not accidentally overwrite the original model before VEIL has been migrated. Avoid creating runtime dependencies where the two bosses share mutable materials, transforms or animation state.

### Visual concept — the ancient relic

VEIL should resemble a mysterious alien spacecraft or dormant relic from an ancient civilization. The old CRADLE geometry already has curved biological and architectural shapes that should suit Nacre's alien ruins. Retain its recognizable main structure while changing the presentation substantially.

**Materials and palette:** use Nacre's established visual language: deep violet, muted purple, dark indigo, pearlescent stone, weathered alien armor, turquoise and pale cyan bioluminescence, cool internal reactor lighting. Avoid Amnion's warm flesh, bone and amber colors. The result should feel ancient, mysterious and almost archaeological. The model should look like a relic spacecraft, not another broodmother.

**Modeling changes:** preserve the general old CRADLE silhouette where practical. Adapt armor materials, surface roughness, energy channels, reactor appearance, glowing side modules, small surface features, and damage and destruction effects. Remove or reinterpret obviously reproductive features if they make the ship look too much like a biological hive. Maintain the original model's overall quality.

**Gameplay preservation:** VEIL must retain its existing boss identity, HP, destructible module count, core phase, overload phase, attack patterns, attack timings, projectile origins (adjusted for new geometry), rewards and music integration. Ensure the new geometry maps properly to VEIL's existing target positions. The displayed weak points must match the real gameplay hit locations. Do not inherit CRADLE's brood-launch mechanics merely because the geometry originated from CRADLE.

## 4. Amnion — new walking CRADLE

### Objective

Replace the current flying CRADLE model with a colossal spider-legged broodmother hive. Use `monster spider 3d model.glb` as the main proportional and shape reference.

### Visual concept

CRADLE is now an enormous **living brood headquarters walking across Amnion's terrain**. It should look like a giant biological fortress rather than a conventional spider. Imagine a swollen living nest carried by eight enormous articulated limbs. Its main body houses brood chambers, egg sacs and a giant central heart. It should feel threatening, heavy and ancient.

### Maintain Amnion's existing aesthetic

Match the visual language already used in the game: pale bone-like armor, dark red organic tissue, exposed sinew, chitin structures, warm orange internal illumination, glowing amber brood chambers, biological membranes, organic vents and openings. Avoid overly realistic horror textures, excessive gore or extreme cinematic detail. Match the game's existing stylized 3D rendering style. The new boss should belong naturally in Amnion rather than looking imported from another game.

### Geometry

Rebuild the reference spider into modular geometry. Required major components:
1. Central hive body.
2. Upper armored carapace.
3. Eight segmented walking legs.
4. Left brood chamber.
5. Right brood chamber.
6. Central heart/core.
7. Underside brood structure.
8. Smaller organic vents and cavities.

The legs must be visually separate from the body and capable of animation. The central body should feel large and heavy. Do not make the boss look like a small spider enlarged uniformly. It must resemble a giant walking nest.

### Destructible modules

Use the left and right brood chambers as the existing two destructible boss modules, assuming this maps correctly to the current boss target configuration. These chambers should glow from within, be clearly visible from above, react to damage, rupture or collapse when destroyed, and visibly disable their associated boss module. The central heart becomes exposed when the existing boss simulation enters the core phase. Preserve CRADLE's current combat behavior.

## 5. CRADLE — walking animation

This is a core requirement. The new CRADLE must actually walk. Do not implement it as a floating boss with decorative spider legs.

**Movement style:** slow, heavy, deliberate, slightly unsettling, mechanically believable. CRADLE should not run rapidly or jump around. It is an enormous creature carrying a heavy hive body.

**Normal boss movement:** the boss primarily remains around its designated encounter area. Use slow lateral movement and subtle body repositioning, for example: slowly walking left; pausing to attack; shifting its weight; slowly walking right; replanting its feet between movements. Its movement should be restrained enough to remain compatible with the existing boss encounter.

**Leg animation:** implement an articulated walking gait. Requirements:
- Eight independently articulated legs.
- Consistent joint positions.
- Alternating leg groups.
- Feet visibly lift and replant.
- Feet stay approximately grounded during planted phases.
- Legs support the moving body.
- Slight body bob and tilt.
- Appropriate movement smoothing.

Use the existing animation framework and procedural animation techniques where possible. A simple deterministic gait is preferable to complex real-time physics. The animation should look convincing from the actual gameplay camera.

**Terrain interaction:** the legs should visually connect with the ground. If suitable terrain-height information is already accessible, use it to place feet appropriately. Otherwise, implement a stable simplified placement system compatible with Amnion's terrain. Avoid visibly floating feet. Add restrained cosmetic effects: small dust clouds during heavy steps, ground disturbance, subtle impact particles, a large shadow beneath the creature. Do not introduce gameplay damage from footsteps. The leg animation must be cosmetic and must not change collision behavior or movement fairness.

**Simulation compatibility:** keep rendering animation separate from boss attack logic. Use existing deterministic boss position/state as the basis for the visual movement. Do not let animated foot positions influence projectile targeting, damage, rewards or fairness.

## 6. CRADLE — phase visuals

Maintain the current three-stage boss fight.

- **Phase 1, Armored Broodmother:** both brood modules intact; central heart protected; legs walking slowly; heavy, controlled movement; brood chambers visibly active.
- **Phase 2, Heart Exposed:** destroyed brood modules remain visibly damaged; central armor opens; large orange heart becomes exposed; body reacts to damage; walking continues with slightly more unstable movement. Do not change the current attack mechanics.
- **Phase 3, Overload:** existing overload timing remains unchanged; organic armor fractures; heart pulses more aggressively; internal lighting intensifies; leg movement becomes visibly strained; body may tilt or stagger slightly. The behavior should communicate that CRADLE is critically injured. Do not add new gameplay hazards.

## 7. CRADLE — death animation

This is especially important. **When CRADLE dies, its central body must fall to the ground.** Do not simply fade it out, explode it instantly or make the whole spider disappear.

Desired sequence:
1. The central heart destabilizes.
2. The creature stops attacking.
3. Walking movement ceases.
4. Legs begin losing strength.
5. The central hive body drops heavily toward the terrain.
6. Its enormous mass visibly strikes the ground.
7. Organic dust, debris and energy effects appear.
8. The heart flickers and goes dark.
9. Remaining legs buckle or settle around the fallen body.
10. The dead hive remains visible briefly as a destroyed structure.

The legs should not all fall through the ground simultaneously. The body should descend independently as the creature loses support. Use an authored animation or deterministic procedural transition. The most important visual moment is the **central mass collapsing downward between its legs**. The animation should communicate real weight. Use subtle body rotation or forward pitching if it improves the result. Avoid unrealistic spinning or excessive bouncing.

Technical constraints:
- No complex ragdoll physics required.
- No runtime rigid-body simulation required.
- Preserve the existing boss death and mission completion events.
- Prevent leftover attack effects after defeat.
- No collision or fairness changes.
- Keep the animation short enough to fit existing mission-completion timing.

The goal is a memorable, believable death animation rather than a costly physics simulation.

## 8. Vesper — new alpine fortress boss

### Objective

Replace HELION ARK's flying visual model with a gigantic stationary mountain fortress. Use `cf42e8f1-dec1-484b-8892-4a619271fc0e.glb` as a dimensional, structural and texture reference. The new design is provisionally called **HELION STRONGHOLD**. Preserve the underlying Vesper boss identity and stable gameplay IDs unless the current repository provides a safe existing mechanism for changing display names.

### Core concept

An enormous secret military installation built directly into a snowy alpine mountain. Its appearance should evoke a heavily fortified industrial bunker complex. The building is not positioned in front of the mountain. It is physically integrated into the rock. The defining feature is **two enormous heavy artillery cannon barrels extending out of armored openings in the cliff**. This must be immediately recognizable at gameplay scale.

### Visual identity

Use Vesper's existing palette: dark gunmetal, industrial steel, blue-grey alpine rock, white snow, icy surfaces, dark concrete, orange radiator lighting, intense internal reactor heat. Avoid Nahara's sandstone and turquoise architectural style. The fortress must feel industrial, military and cold.

### Main structural elements

Required:
1. Two gigantic cannon barrels.
2. Independent left/right armored cannon housings.
3. Central reactor or command bunker.
4. Heavy blast doors.
5. Large steel reinforcement structures.
6. Industrial pipes.
7. Cooling vents.
8. Small gun batteries.
9. Radar or communications equipment.
10. Snow-covered platforms and ledges.
11. Mountain rock surrounding the installation.

Reuse the existing Vesper material and scenery systems.

### Boss attack presentation

The two main cannon assemblies should correspond visually to the existing destructible boss modules. The central bunker corresponds to the existing boss core.

Preserve the current Vesper boss: three-stage progression, module HP, core HP, projectile attacks, laser mechanics, fighter launches, attack timings, rewards, difficulty scaling. Adjust projectile origins and visual muzzle positions to match the new geometry.

Use appropriate firing animations: cannon recoil, mechanical charging, orange muzzle glow, cooling vent effects, opening blast doors, damage reactions. These animations must not change projectile speed, damage or fairness.

## 9. Vesper — terrain integration

This is a significant part of the task. The current Vesper boss arena is open water. It must be changed to support the new alpine fortress. **Use the same general terrain-integrated boss approach already established for Nahara's Citadel, adapted to Vesper's existing terrain.** Do not introduce a separate terrain-generation system.

**Desired result:** at the end of Cold Vector, the player reaches an enormous snowy cliff face containing the fortress. The terrain should naturally lead into the installation. Features: snow-covered mountain cliffs, dark stone walls, rock formations around the bunker, industrial support platforms, snow accumulation on structures, mountain faces surrounding cannon housings, fortress foundation embedded into terrain, existing Vesper atmospheric effects. The mountain should read as part of the procedural world. Avoid a visible rectangular model boundary. Avoid placing a separate mountain mesh awkwardly on top of the ground.

**Arena generation:** inspect how Nahara implements the Citadel's terrain-connected boss arena. Reuse or extend that approach. The Vesper change should be localized to the boss encounter region. Do not rewrite the rest of Vesper's terrain progression. Preserve existing water behavior and appearance outside the redesigned arena. Make necessary adjustments to the final approach and arena scenery so the terrain and fortress connect naturally. Do not add sector-triggered terrain progression or a separate environmental state machine. Preserve deterministic seeded generation.

**Camera:** preserve Last Worlds' existing gameplay camera. The fortress must be designed to look convincing from that camera. The most important visible features should be the massive cannon barrels, left and right target modules, central reactor, and armored mountain structure. Ensure the main cannon barrels have a readable orientation from the player's viewing angle. Do not rely on a dramatic low-angle cinematic perspective to make the fortress look impressive. Its silhouette must work during normal gameplay.

## 10. Vesper — destruction animation

Replace the current flying ship destruction presentation with one appropriate for a stationary fortress.

**Module destruction.** When a cannon module is destroyed: cannon becomes visibly damaged; armor fragments detach; orange sparks and smoke appear; barrel recoils, sags or collapses; its firing system becomes inactive as already defined by gameplay.

**Core destruction.** When the boss dies:
1. Central reactor destabilizes.
2. Internal orange lighting intensifies.
3. Mechanical systems begin failing.
4. Cooling pipes rupture.
5. One or more armored structures collapse.
6. Large explosions occur inside the fortress.
7. Reactor light fades.
8. Destroyed bunker remains embedded in the mountain.

Do not make the entire mountain explode or disappear. The cliff remains structurally present. Use scripted animation and existing effects systems rather than introducing complex destruction physics.

## 11. Gameplay preservation

This task is about visual presentation. Preserve existing boss health, damage values, attack intervals, attack selection, module counts, core/overload transitions, difficulty scaling, rewards, campaign progression, special attack behavior, Perfect Pilot fairness requirements, and the existing audio composition. The new geometry must not accidentally change hitboxes. Ensure visuals align with the actual hit targets. Do not make new legs, terrain pieces or decorative structures damageable unless already represented by the existing gameplay configuration. Maintain the separation between simulation and rendering.

## 12. Mobile performance

These bosses must be suitable for the mobile-first browser game. The original supplied GLBs are too expensive to use directly. Requirements: optimized runtime geometry; efficient modular construction; appropriate material counts; efficient textures; no unnecessary high-resolution textures loaded on Low quality; no expensive skeletal computation beyond what is necessary; bounded particles; reused geometry where possible; stable draw-call counts; no continuous expensive terrain collision calculations for decorative animation.

For CRADLE, simple procedural leg transforms are acceptable if they look convincing. Do not create a full physics simulation merely to animate its legs. For Vesper, prefer static optimized structures, with animation limited to important parts such as cannons, shutters and vents. Performance must be compared against the existing bosses. Preserve the game's current High and Low graphics settings.

## 13. Required visual validation

Do not approve the work based only on isolated Blender renders. Render each boss from the **actual Last Worlds gameplay camera**. For each boss provide:
1. Normal armored phase screenshot.
2. Exposed core phase screenshot.
3. Overload phase screenshot.
4. Destruction screenshot.
5. Clean model preview.
6. Top view.
7. Side view.
8. In-game screenshot at normal mobile scale.

For CRADLE, additionally demonstrate the walking and death animations. For Vesper, additionally demonstrate how the fortress connects to the terrain. Also provide a comparison of all eight campaign bosses from approximately the same in-game perspective. This is important because the purpose of the overhaul is visual diversity.

## 14. Implementation order

1. **Preserve old CRADLE for VEIL:** copy existing CRADLE geometry into a dedicated VEIL asset; implement Nacre materials; verify module and core alignment; verify VEIL gameplay is unchanged.
2. **Build new walking CRADLE:** inspect the spider reference GLB; rebuild optimized geometry; create independent legs and body; add brood modules and exposed heart; integrate into Amnion; implement procedural walking; implement the body-collapse death animation; validate combat and performance.
3. **Build Vesper fortress:** inspect the supplied fortress GLB; rebuild an optimized modular fortress; integrate cannon modules and central core; adapt the Vesper boss arena; connect fortress geometry to mountain terrain; implement cannon and destruction animations; validate terrain, rendering and gameplay.
4. **Final validation:** verify all three boss models, all boss phases, collision/target alignment, camera presentation, mobile performance and the fairness regression tests; produce an eight-boss comparison.

## 15. Testing

Run the repository's applicable checks: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser`. Add focused tests where new presentation state or asset integrations require them.

Verify:
- Correct assets load per planet.
- VEIL does not use the new spider model.
- CRADLE uses the new walking spider model.
- Vesper uses the new fortress.
- Old models do not remain accidentally visible.
- Destructible module visuals are aligned with actual targets.
- Boss phases transition correctly.
- Boss death animations do not delay or break mission completion.
- Procedural terrain remains deterministic.
- Existing encounters remain playable.
- Mobile rendering budgets remain acceptable.

Inspect the final browser screenshots. If a physical mobile device is unavailable, report that testing as unverified rather than claiming it passed.

## 16. Important non-goals

Do not:
- Rebalance any of the bosses.
- Change boss attack patterns.
- Add new bosses.
- Change weapon progression.
- Change mission ordering.
- Rework the campaign economy.
- Rebuild the terrain system.
- Introduce physics-based boss movement.
- Ship the supplied reference GLBs unoptimized.
- Change other planets' terrain.
- Rewrite the audio engine.
- Change Nahara's Citadel.
- Redesign HELIOPHAGE.
- Rebuild unrelated game systems.

Keep this work scoped to the three approved visual redesigns.

## 17. Deliverable

Implement the complete visual overhaul. Provide a summary containing:
1. Which original assets were preserved or replaced.
2. How VEIL reuses the former CRADLE model.
3. How the new CRADLE model was rebuilt and optimized.
4. How the spider-leg animation works.
5. How CRADLE's body-collapse death animation works.
6. How the Vesper fortress is integrated into terrain.
7. How the boss module/core visual mappings work.
8. Final triangle counts and asset sizes.
9. Material and texture budgets.
10. Performance comparison.
11. In-game screenshots and animation previews.
12. Tests executed and results.
13. Any deviations from the design.

Follow the repository's coordination and deployment procedures. Do not deploy without the appropriate approval.

## Final visual direction

The campaign should now contain three visually distinctive encounters:

- **NACRE — VEIL:** an ancient, mysterious flying relic built from the former CRADLE model, reworked with cold purple, pearlescent materials and turquoise energy.
- **AMNION — CRADLE:** a gigantic walking broodmother hive, supported by eight spider-like legs, carrying enormous living brood chambers and a glowing heart. It moves slowly and heavily across the terrain, then collapses onto the ground when defeated.
- **VESPER — HELION STRONGHOLD:** a fortified military installation embedded directly into a snowy alpine mountain, with enormous cannon barrels emerging from reinforced rock openings and orange reactor energy glowing inside its bunkers.

All three must be optimized for mobile, visually readable from the existing Last Worlds camera, and integrated using the project's current modeling, animation and terrain systems.

**The goal is not more visual complexity. The goal is three memorable, distinct bosses built to the visual and performance standards of Last Worlds.**

## HELION STRONGHOLD: the scene cleanup (18-19 November)

The user, after playing it, called it "very messy somehow, too much going on". They kept the concept ("Big cliffs, and the
mountain peaks behind the stronghold is great, the stronghold feels integrated into the mountain") and, over several rounds
of fight-time screenshots, asked for the changes below. (Pyramid summits tried on the way were rejected: "the peaks should
be the very rock the fortress is built in"; the original peaks are back.)

| Asked | Done |
|---|---|
| "Calm the cliffs" | 2-3 drops, a gentler rim; the mountain's ice walls with Vesper's own settings, one to a step (`oneStep`). |
| No small scattered rocks on the plateaus | None in the arena: the props, pipes and buildings stay. |
| "a bunker built in or carved from the mountain", "clips slightly into the mountain" | The ground meets the model's top edge and lies over its outer half unit behind its targets, level with the roof, then rising gently, under snow. The model is not moved. |
| "the peak a bit more steep so we see the actual mountain top" | It rises from 1.5 past the fortress's back to its top by 4.5. |
| The same colours as the terrain; "spots that read more like the facilities"; "more snowy, especially on the edges" | Render-time classification of the atlas: the ground's snow (measured to match on screen) on its snow, its rock and wherever it meets the mountain; clean facility metal elsewhere; heat lines kept. |
| "some cliff rocks are very dark" (all of Vesper) | The ice walls' crack faces shaded as the ice. |
| More far fog behind the mountain | Aerial fog at every height past the fight's view (`fog.aerial`, Vesper's look). |
| The right cannon flying in from the bottom of the screen | A repeat run reused the last fight's cannon state (same start time); cleared while the fortress stands. |
