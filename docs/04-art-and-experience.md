# Art direction and player experience

## 1. Visual target

Modern stylized hard-surface science fiction. Aircraft should look engineered and dangerous: swept wings, recessed engines, broad armor plates, a few readable exposed mechanisms, selective wear. Use convincing light and material response without film-level texture noise. Avoid cute proportions, plastic toy surfaces, voxel terrain, and dense photoreal grit.

The hero begins as a cheap rusty salvage fighter with patched metal, faded ivory paint, and exposed but serviceable twin engines. Later tiers use fundamentally different airframes: an agile interceptor and a broad advanced assault fighter. Shared material cues and faction identity can connect them, but wing plan, fuselage, engine arrangement and silhouette must change. Do not make the starter cute or comically broken. Hostiles use graphite armor with planet-specific geometry accents and warm threat lights. This is an original design direction; do not reproduce a named franchise's ship.

The art direction is represented in [the concept gallery](../art/concepts/README.md). These are concept renders, not gameplay screenshots, production meshes, UI implementation, or performance targets.

## 2. Camera and composition

Use orthographic projection, approximately 55° downward elevation, zero yaw, and no roll. This is isometric-inspired rather than mathematically strict isometric: the ground and machines have depth while forward flight remains screen-up and movement remains screen-horizontal. Strict diagonal isometric framing is rejected for the default controls.

Player near 76% screen height; boss weakpoints around the upper third. Keep camera angle and zoom stable while camera x follows lateral movement across the wider map. A tiny render-only impulse may shake it after an explosion; a reduced-motion option removes it. No routine zooms, camera rotations, or perspective changes during attacks.

Ground target markers must follow the projected target cores, not a displaced ground shadow. Avoid foreground arches or cliffs that cover a live bullet or target. Terrain never occludes gameplay-critical markers. Ground scenery may fade if it approaches a sensitive visual region.

## 3. Visual hierarchy

From highest priority to lowest: incoming dangerous shots and warning zones; player collider/ship; targetable enemy regions; useful pickups; friendly shots; explosions; scenery. Test this hierarchy on the smallest supported phone, not only on a desktop image.

| Meaning | Color direction | Shape/behavior reinforcement |
| --- | --- | --- |
| Player and friendly fire | Cyan/near-white core | Thin upward bolts, two compact exhaust plumes |
| Incoming enemy projectile | Warm coral with pale core | Distinct round/diamond head and clear travel direction |
| Warning before firing | Amber | Expanding brackets or striped lane outline, then lock |
| Damageable enemy core | Warm rim plus neutral metal | Open corner target brackets and localized hit flash |
| Shield pickup | Cyan | Hexagon with shield glyph |
| Weapon pickup | Violet-white | Wide capsule and weapon silhouette |
| Credits / endless salvage | Gold | Compact diamond/grouped token |

Do not make the luminous plants as bright as player fire. Ice-world hostile shots need a dark outline as well as a bright core. Colorblind modes should preserve shape distinctions and offer alternative hostile-shot hues.

The first world board is intentionally richer than the runtime scene. Reduce terrain texture contrast, prop density, and emissive flora when implementing. Tiny greebles that disappear at phone size do not justify their draw cost.

## 4. Asset production plan

Model in Blender or a comparable DCC tool; export glTF/GLB. Use shared materials, texture atlases where useful, sensible pivots, and named muzzle/weakpoint sockets. All dimensions are in consistent game units. Match collision bounds deliberately; the visual model does not author collisions implicitly.

| Asset group | Vertical slice | Full small release |
| --- | --- | --- |
| Player | One salvage fighter, engine effect, shield shell | Three distinct authored tier airframes with reviewed gameplay envelopes |
| Enemies | Dart, Weaver, Spike Battery, Crawler | Eight base archetypes with bounded biome variants |
| Bosses | Bastion-9 with detached weapon modules | Three authored bosses |
| Terrain | Six modular Khepri pieces, 10–15 reusable props | About six pieces and 10–15 props per biome |
| Pickups | Credit and shield; later gun/power icons | Five simple pickup categories including endless life milestones |
| VFX | Muzzle, three hit types, engine, explosion, warning, shield break, special | Recolored/recombined library plus biome atmosphere |
| UI | HUD, pause, start/results, touch hints, special control | Four-slot hangar, mission select/contracts, career/statistics, drafts, settings, install help |
| Audio | Main shot, hit, kill, warning, shield, special, pickup, boss, loop | Biome music/stems and weapon variants |

Geometry targets, not promises: player 4–8k visible triangles; small enemy 1–3k; fortress 15–25k split into reusable parts; distant props substantially less. Start with 512–1024 textures and shared trim sheets. No assumption that every object gets unique 4K maps. The actual budgets are governed by the phone frame-time gate.

Store editable source assets separately from optimized runtime exports. Track file provenance and license for every imported asset, sound, font, and texture. Generated concept references must not be mislabeled as licensed production model sources.

## 5. Animation and effects

- Lateral banking: up to 12°, quickly returning to neutral; never changes the collider or aim direction.
- Engines: mild length change with lateral acceleration, minimal particle count, no long opaque smoke ribbon.
- Hit feedback: 40–70 ms localized flash, short spark fan, brief target recoil. Avoid strobing whole-screen flashes.
- Shield contact: directional ripple; shield break a distinctive ring and sound. Invulnerability uses a stable visible outline/pulse, not rapid disappearance.
- Destruction: 0.3–0.6 s readable burst, a few fragments and short smoke. Debris is visual only and pooled.
- Pickup collection: 150–250 ms arc into the ship; shield cells may resolve toward the existing shield glyphs. Do not add extra HUD indicators for credits or weapon power. Number popups aggregate per group and do not obscure targets.
- Special: simple flat pressed-state fill, recharge ticks clearing, and a clear effect start. No chrome, glow, layered trim, or ornament on the UI control. Enemy bullets stay visible around the effect.
- Boss phase: shutters, mechanical movement, broken modules, and different warning cadence. Avoid long unskippable arrival movies.

Do not globally freeze simulation on every hit. If a future hit-stop experiment is used, isolate it to a safe destruction transition; it must not corrupt weapon timing, replay scheduling, or input responsiveness.

## 6. Minimal analog / arcade HUD

Top left: one row of small ivory ship silhouettes for lives and a second row of equally simple shield glyphs for charges. Filled shield means available; outline means spent. No labels or numbers are needed next to these readable icons. Shield capacity may vary from two to four; keep spacing and size consistent.

Endless score is a compact ivory readout at the top right beside a plain pause symbol. Campaign has no permanent currency/objective panel. No player health bar, shield bar, ammo meter, energy meter, reactor gauge, always-visible combo meter, minimap, or permanent steering arrows. Boss progress uses weakpoint damage, shutters, and destruction rather than another full-width bar by default.

The special button sits at bottom center above the device safe area: a flat charcoal circle, thin ivory outline, simple lightning/weapon glyph, and a few recharge ticks. At least 64 CSS pixels of hit area. Its pressed state is a simple fill change; no metal housing, bevels, shiny glass, neon rim, gold framing, or layered rings. Current concept art uses six ticks; exact tick count is visual tuning, not stored extra charges.

At the beginning of each new mission/run, show a small chevron in each steering half, blinking gently for three active seconds, then disappearing. Reduced-motion makes them static for those three seconds. Do not replay on unpause, respawn, or sector transition. They never become buttons. Special owns its input even where its centered hit area overlaps both steering halves.

Menus use the same restrained flat graphic language: generous spacing, clear text, simple borders, limited ivory/coral/cyan accents. Avoid glossy cards, rarity fireworks, reward funnels, and purchase-style banners.

Start screen: Campaign, Endless, Statistics, Settings. Campaign preparation shows exactly four equipment choices: main, special, shield tech, reactor tech; owned alternatives show concise differences and price. Optional contract and career panels stay outside flight. Endless offers only its standardized start and run records, with no campaign loadout selector.

Results show a readable score or credit breakdown and optional contract/milestone completion. Primary actions are retry/next and menu/hangar. No automatic restart while fingers are lifting. Pause shows resume, current gear, objective detail if campaign, settings, and quit; resume clears input and uses a countdown.

## 7. Audio and accessibility

Use restrained electronic percussion and atmospheric synth textures. Music can layer during a boss; keep danger cues audible. Cap simultaneous voices and vary shot pitch subtly. Target acquisition is a soft cue, not a repeated loud beep at weapon cadence.

Unlock audio on a user gesture; provide music and effects sliders plus mute. No sound until permission/gesture requirements are satisfied. Visual warnings must contain all information conveyed by audio. Vibration is optional and capability-checked; no essential rule depends on it.

Settings: reduced motion, reduced flash, hostile-shot palette, effect density,  music/effects volume, and graphics quality. Menus support keyboard navigation and readable text. Canvas combat cannot be claimed fully screen-reader accessible; accessible menus and redundant cues are still required. Do not use sound, color, or haptics as the only signal for an attack.

## 8. Art review checklist

Approve a phone-size still and a moving clip for each new enemy or biome. Confirm silhouette, target/shot contrast, stable scale, understandable ground targeting, safe thumb regions, and material/style consistency. Review at low quality as well as high. Concept fidelity never overrides readable combat or device performance.

## 9. Hero evolution and curated procedural assembly

Concept three fundamentally different tier chassis: Scrapper, Razor, Dominion (working names). The starter is patched, oxidized, inexpensive-looking and credible. The middle tier is a narrow split-boom/forward-swept interceptor; the apex is a broad advanced assault/flying-wing craft. They must not read as rust removal or added plating on the starter. The apex is intimidating through silhouette and engineering, not gaudy decoration.

Proposed campaign visual gates: Scrapper at start; Razor after the first chapter; Dominion after the campaign and a rank-3 main are achieved. These are draft cosmetic gates, not extra equipment slots or stat boosts. A player may retain an older appearance. For the one-planet MVP, ship Scrapper and Razor first; Dominion is full-release art.

Endless always begins visually and mechanically at the same Scrapper state. If hero evolution is used during a run, apply the same universal rule for everyone: Razor at power tier III and Dominion at tier V, reversing when the tier falls. No campaign visual unlock is consulted.

Author each radically different silhouette against the same documented central player hit region and comparable phone-size readability. No cosmetic hull tier grants a smaller collider or free stats. Keep the vulnerable central body legible and avoid large solid-looking parts that imply dishonest hit behavior. Validate each silhouette at actual game scale. Gun sockets may differ visually, but logical shot origins/patterns remain equipment-defined.

Deferred idea only: procedural hero assembly could combine approved wing, engine, gun-pod, armor and wear variants within each distinct chassis family. It is not MVP work. It cannot substitute for authoring the three fundamentally different tier silhouettes. Use compatibility rules, attachment sockets and a curated silhouette envelope; bake or validate variants before release. Limit runtime work to selecting approved assets/material variations. Do not generate arbitrary geometry or let random shape alter hitboxes, performance, gun origins, visibility, or ranked stats. A handcrafted base plus controlled variation is the recommended approach.

Alien design board: two silhouette classes per planet, with Khepri industrial/scarab-like geometry, Nacre crescent/petal biomechanical forms, and Vesper needle/diamond ceramic blades. These are mechanical alien spacecraft, not literal insects or animals. Retain identifiable behavior across cosmetic variants.

The additional exotic board explores an interlocked-ring gravitic machine, an asymmetric crystalline shard craft, and a flowing biomechanical lattice craft. Treat these as candidates for elite or boss silhouettes; they do not automatically add three mandatory archetypes to the MVP. Curate readable variants and build bounded colliders/animations only after selecting a concept.

### Accepted art and in-game scale

The user accepted the latest distinct hero designs and alien boards; preserve them without regeneration. Their large equal presentation on the concept sheet is not gameplay scale. Scrapper must be visibly smaller in the game. Initial width targets: Scrapper 1.0 world unit (about 8% of viewport), Razor 1.35 (11%), Dominion 1.7 (14%). All use the documented central hit region of radius 0.25; review vulnerable-body clarity rather than pretending all wing silhouettes are full colliders. Tune size at phone scale without changing progression fairness. The final HUD reference still depicts an earlier hero; use it for interface placement, not final craft selection.
