# Build status

## Ship-relative steering, portrait only, wreck leaves before the warp, real fire-rate ramp — 17 October 2026

- **Steering** is relative to the hero ship: hold left or right of it. The direction holds after the ship passes the finger; dragging across the ship switches it. Hints and How to Play are updated; docs/08 and AGENTS.md record the decision.
- **Portrait only:**
  - a web manifest with `orientation: portrait` (installed app), plus a portrait lock request where browsers allow it;
  - on a phone held sideways, a "turn your phone upright" notice covers the game and the flight pauses.
- **Boss wreck:** once a hyperdrive jump starts (endless, or the campaign's victory jump), the wreck goes out with a last detonation instead of being dragged through the warp.
- **Enemy fire-rate ramp:** the 16 October ramp (×0.90 / ×0.86 / ×0.82 repeat intervals) was not noticeable. It is now Khepri ×0.8, Vesper ×0.62 and Nacre ×0.5, so Nacre fires twice as often as Luna; Luna is unchanged.
- **Airspace fix:** a beam ship now waits while its swing onto its lane would crowd another squadron. The faster fire exposed this as a squadron overlap.
- **Evidence:**
  - 324/324 unit tests;
  - 21/21 browser specs, including a new test that the ship keeps going past a held finger;
  - the perfect pilot is hitless on every mission, difficulty and weapon, on Precision Drive and in endless sectors 1–8;
  - rotate-notice capture checked.
- **Not done:** no phone hardware test. iOS Safari cannot lock orientation in a browser tab; the notice and pause cover it.

## More chaos, progressive worlds, longer sorties, missiles, exploding fuel — 16 October 2026

- **Progressive intensity by world** (`WORLD_INTENSITY`): Luna stays chill (×1). On Khepri, Vesper and Nacre, enemy flight speed and shot speed rise ×1.05 / ×1.07 / ×1.10, and repeat-fire intervals shorten ×0.90 / ×0.86 / ×0.82. This applies in both modes, on top of difficulty.
- **Longer sorties:** Training +10 s, Rolling Thunder +24 s, Cold Vector +28 s, Deep Bloom +36 s of authored stretches with fuel depots.
- **Fuel skids explode:** 150 damage within 2.6 units, chaining into other skids, never hurting the player. New depot formations park batteries around skids in all missions and endless.
- **Boss timing:**
  - pre-boss quiet halved again: arrival about 3 s after the last threat;
  - kill to warp halved: 1.5 s hold plus 4 s extraction in the campaign (was 10.5 s), 2.5 s to the endless jump (was 4.5 s);
  - the Ark's arena moved to 935 so its approach keeps shelf ice.
- **Specials:**
  - the Shockwave ring now expands from the ship;
  - Siege Lance lasts 2.4 s;
  - Seeker Rack fires real missiles: a Blender model, fanned launch, acceleration, hard homing, smoke trails.
- **Economy:** weapon ranks raise fire rate to double at rank 3; payouts are halved.
- **Fixes:**
  - a beam lane now ends when its ship is shot down;
  - campaign attack admission assumes the slowest drive;
  - badlands haulers no longer flicker: more instance room, no per-frame skipping, and roads that share a corridor carry no haulers.
- **Evidence:**
  - typecheck clean, 324/324 unit tests, 20/20 browser specs, production build;
  - the perfect pilot clears every mission on every difficulty and weapon, and on Precision Drive, without a hit; fairness unions pass;
  - captures inspected: Shockwave ring, missiles in flight, a frozen fuel blast.
- **Not done:** endless pre-boss timing unchanged (its threats already end at the boss's arrival); no phone hardware test.

## Campaign progression — 16 October 2026

- **Unlocks:** missions open in order (Training → Rolling Thunder → Cold Vector → Deep Bloom) as each is cleared on any difficulty. Locked missions show a dimmed globe and a disabled launch; cleared ones show their best time.
- **Credits, Hangar and loadout:**
  - credits are the one campaign currency;
  - a new Hangar page buys, equips and ranks up gear across the four slots: main (Fan 250, Seeker 450, ranks 150 / 300 / 500 at +8% each), special (Seeker Rack 300, Siege Lance 400, both new), shield (Bulwark 250, Flux 250) and reactor (Vector 250, Precision 250).
  - Campaign runs fly the equipped loadout; endless always flies the canonical starter.
- **Banking:** results show the payout breakdown (docs/11 §4) and any unlock. Each attempt banks exactly once by attempt ID. Leaving mid-flight banks half the collected credits.
- **Save:** `last-worlds.campaign.v1`, versioned; an unreadable save is never overwritten. See docs/21.
- **Evidence:**
  - typecheck clean, 317/317 unit tests, 20/20 browser specs, production build;
  - the perfect pilot clears all four missions hitless on the slowest drive;
  - screens inspected: campaign page, hangar, results payout and unlock, Siege Lance and Seeker Rack in flight.
- **Not done:** contracts and career milestones, Rail Lance, statistics filters, and no phone hardware test.

## Boss entrances, wreck hold, drop icons, fuel skids, ground wrecks, hauler lanes — 16 October 2026

- **Boss entrances:**
  - Boss rigs are now compiled into the shader warm-up while still hidden. Before, a boss's first frame could stall on shader compilation, so on a phone it appeared to pop up mid-view.
  - Bastion-9 starts its roll-in fully off-screen (entry row 27, was 22).
- **Sooner bosses:** arrival and the arena stop are earlier: WARDEN-1 113 s (was 115), Bastion-9 111 (115), Helion Ark 170 (184, cues close at 162), THE VEIL 153 (160), endless boss sectors 78 s (80). The quiet stretch before each boss is now about 5–9 s. Late shield cells moved before the fights (Ark 163 s, Veil 148 s).
- **Wreck hold:** after any boss kill the scroll holds 2.5 s over the wreck (`WRECK_HOLD`) before extraction or the endless jump.
- **Drop icons:** antialiased, mipmapped canvas sprites with a soft glow, 1.15 units, replace the thin flat-shape icons that shimmered. Each main weapon has its own icon: twin bolts, a fan, homing arcs.
- **Fuel skids:**
  - a new harmless ground target, `fuel` (Blender `loot_fuel` in `public/assets/shared/loot-props.glb`, `tools/blender/loot_props.py`): hazard-red tanks that never fire and drop credits like a ship;
  - placed by authored cues in every mission and the endless playlists (`fuel-pair`, `fuel-depot`);
  - targeting prefers armed enemies over fuel skids.
- **Ground wrecks:** destroyed batteries and skids leave a Blender wreck (`wreck_turret_0/1`, `wreck_fuel`) on the ground; it scrolls away with the terrain (render-only).
- **Haulers:** a road's haulers share one speed, drive half a round trip apart in right-hand lanes, and a hauler that would overlap one already placed is left out. They no longer drive through or stack on each other.
- **Evidence:**
  - typecheck clean, 301/301 unit tests, 19/19 browser specs, production build;
  - SwiftShader captures inspected: boss first frames, drop icons (zoomed), a fuel skid destroyed into its wreck, Khepri haulers in lanes.
- **Not done:** no phone hardware test.

## Full-height phone playfield — 16 October 2026

- **Phone layout:** fills the available dynamic viewport height instead of adding 9:16 letterbox bands. The HUD, special button and menus include notch/home-indicator padding. Landscape and wider touch devices retain a centered portrait field at full height; desktop keeps its fitted 9:16 frame and side rails, shrinking cleanly in narrow windows.
- **Camera:** device resizing adjusts projection, shadow coverage and post-processing together. The original horizontal span and approach edge stay fixed; tall phones reveal foreground below the combat area. Ships retain their proportions, ground models still align with their collision targets, and simulation/targeting remain unchanged.
- **Validation:** 297/297 unit tests, 19/19 browser cases, typecheck and production build passed. Chromium 156.0.8078.4 / Playwright 1.64.0 / SwiftShader in WSL. Inspected 320×568, 390×700, 390×844, 430×932 and 844×390 phone layouts, plus 1440×900 and 1024×1200 desktop layouts. Tests verify height changes, held-input clearing, steering in the newly filled lower band, simulated safe-area insets and projection alignment.
- **Evidence:** `docs/screenshots/full-height-phone.png`; detailed captures in ignored `lookdev/viewport-browser/`. No physical iPhone/Android test. Existing bundle-size warning remains.

## Endless boss terrain clearance — 16 October 2026

- **Fixed:** Khepri terrain was visible behind WARDEN-1 during the endless Moon fight. Every endless boss arena now has another 36 units of its outgoing planet before the world boundary. This covers the full tilted-camera ground view, post-kill scroll resume and jump fade-in, including later repeats at capped pace.
- **Scope:** only the endless distance schedule changes in production. Arena geometry, boss behavior, difficulty, campaign and the two-second resume / three-second jump timing stay the same. Hyperdrive covers the extra distance at a higher peak speed; later procedural terrain positions shift accordingly.
- **Checks:** 294/294 unit tests, 16/16 browser cases, typecheck and production build passed. The terrain route suite now streams all four planet transitions with zero synchronous fallbacks. Camera projection regressions cover sectors 1, 4, 7, 10, 13, 16 and 19.
- **Visual evidence:** actual game renderer, Chromium through Playwright 1.64.0 / SwiftShader in WSL, 390×844 portrait. Inspected all four boss arenas, Moon departure on Low and Khepri after the jump on High. Saved `docs/screenshots/endless-luna-boss-clearance.png` and `docs/screenshots/endless-khepri-after-jump.png`. Reproducible development fixture: `tests/fixtures/endless-arena.html` (parameters in docs/18).
- **Limits:** no physical-phone test. Existing production bundle-size warning remains.

## Blender models for Nacre, THE VEIL, WARDEN-1 and Khepri; Nacre world after the concept — 16 October 2026

User rule (15 October): every ship, boss and kit piece is a Blender model, never code-built. Code geometry only stands in while a GLB loads.

- **Nacre craft** (`tools/blender/nacre_craft.py` → `public/assets/nacre/nacre-craft.glb`, 8,088 triangles): Shard, Veil, Orrery, Spore and Pod in the ORRERY / SHARD / VEIL language of `art/concepts/06-exotic-aliens.png`. Darts and Needles fly as the Shard (amber engines), Weavers and Lancers as the Veil, Diamonds as the Orrery, batteries as the Spore. THE VEIL's pods are Pods.
- **THE VEIL** (`tools/blender/the_veil.py` → `the-veil.glb`, 15,872 of 16,000 triangles):
  - a violet seed hull with layered crescent blades and honeycomb windows;
  - two blade-cupped pods, a faceted heart under four shutters that swing 105° open, and front launch bays;
  - it deploys pods in waves from both bays during the core and overload phases.
- **WARDEN-1** (`tools/blender/warden.py` → `public/assets/luna/warden.glb`, 7,898 triangles):
  - a credible human lunar lander: hazard-striped deck, legs, engine bells, solar wings and a beacon;
  - its turret pods yaw toward their aim, and the core hatches slide 0.8 apart.
- **Khepri craft** (`tools/blender/khepri_craft.py` → `public/assets/khepri/khepri-craft.glb`): gold segmented Dart, Lancer, Weaver and turret, after the KHEPRI concept column. Luna reuses them with a steel-blue paint swap.
- **Nacre world** (`tools/blender/nacre_kit.py` → `nacre-kit.glb`, 35 nodes, 14,197 triangles), after the concept's middle panel:
  - indigo water with violet algae, jagged black rock heaps and crags, and a dense glowing jungle (lotus caps and groves, glass tubes, goblets, lily rafts, moss);
  - regular ruins: towers with orange light strips, stepped forts, ring platforms, conduit bridges, pillars and rubble.
  - Crags, towers, forts and pillars cast shadows on High.
- **Hero:** 10% larger (render only; the hitbox is unchanged). At mission start it drops from close to the camera with a barrel roll.
- **Beam alignment** (commit `3e0a3bf`): Needle and Lancer beams fire straight down from the shooter's locked lane; boss lanes come from their own columns.
- **Evidence:**
  - typecheck clean, 287/287 unit tests, 15/15 browser specs, production build;
  - every GLB passed its build verification, and repeated builds were byte-identical;
  - SwiftShader captures inspected: Deep Bloom's approach with every Nacre craft; THE VEIL's batteries, core and overload phases; WARDEN-1's descent, batteries and core; Nacre world seeds 8831, 93 and 4242.
  - Nacre frame cost on High: 50–55 draw calls and 72k–108k triangles; Khepri is 49–55 and 90k–101k. Longest terrain-generation slice: 6.7–7.2 ms on both.
- **Known limits:**
  - the Nacre water doesn't reflect the flora;
  - THE VEIL's bay doors are static;
  - render stats report the Nacre kit as `fallback` in the world fixture even when the GLB has loaded.
- **Not done:** no phone hardware test.

## Varied boss fights, harder Ark finale, world order — 15 October 2026

- **Overload moves:** every boss's overload phase cycles its own move list (lanes, crosses, player-locked lasers, bursts, fans) instead of the same two lane patterns.
- **Ark finale:** lasers and crosses, faster recovery, and two more drop-pod waves.
- **Harder:** Rolling Thunder (cadence ×0.92, Bastion-9 recovery 0.45 s) and WARDEN-1 (more HP, shorter warnings).
- **Order:** Nacre and Deep Bloom are now the final world and mission; Vesper comes in between. Campaign: Training → Rolling Thunder → Cold Vector → Deep Bloom. Endless: Luna → Khepri → Vesper → Nacre. Threat pips go up to 4.
- **Evidence:** typecheck clean; 278/278 unit tests (perfect pilot clears all missions on all nine combinations with no hits; fairness unions pass on every branch); browser specs (below).
- **Not done:** no phone hardware test.

## Nacre, Deep Bloom and THE VEIL — 15 October 2026

- **Nacre**, the Luminous Mire, sits between Khepri and Vesper. It has indigo water between dark islands, code-built glowing flora (caps, lily pads, reeds, violet canopy trees, crystals, monoliths) and its own violet look and water. See docs/20.
- **Deep Bloom:** campaign mission 3 of 4, threat 3, with pressure close to Cold Vector.
- **THE VEIL:** a giant, code-built biological starship that rises out of the mire. Its crescent blades reach past both edges of the screen. It must be killed.
- **Endless:** Luna → Khepri → Nacre → Vesper. Boss sectors are 1, 4, 7, 10, ….
- **Fix:** enemy instance counts now follow the model each enemy actually uses. Vesper-kind craft on any other planet would have been invisible.
- **Evidence:**
  - typecheck clean;
  - 279 unit tests: new `veil.test.ts`, with the perfect pilot clearing Deep Bloom on all nine combinations with no hits;
  - fairness unions for Deep Bloom and each Nacre stint;
  - 15/15 browser specs;
  - real-app and fixture captures of Nacre, Deep Bloom and every phase of THE VEIL.
- **Known limits:** a section straddling the Nacre → Vesper switch keeps Nacre's water level; Nacre reuses the Khepri and Vesper enemy rosters.
- **Not done:** no phone hardware test.

## WARDEN-1 and the Luna prologue — 15 October 2026

- **WARDEN-1:** Luna's small boss, a human-built lunar defence lander built in code. Training now ends with it; it must be killed, and the 8 s extraction follows.
- **Endless** opens on Luna: sector 1 ends with WARDEN-1 and a jump to Khepri. The ramps ignore the prologue, so Khepri plays exactly as before. Boss sectors are now 1, 4, 7, …
- See docs/19 §2.
- **Tests:**
  - updated for the new structure;
  - new `tests/sim/warden.test.ts` (must-kill, completion after extraction);
  - perfect pilot: kills WARDEN-1 → Bastion-9 → Ark with every weapon and no hits, and clears Training on all nine combinations;
  - fairness unions pass on all three bot branches, with a new Khepri-first-stint run.
- **Evidence:**
  - typecheck clean;
  - 261/261 unit tests;
  - 15/15 browser specs;
  - fixture captures of the descent, pods, command module and destruction (`/tests/fixtures/bastion.html?boss=warden&phase=…`).
- **Not done:** no phone hardware test.

## Endings, boss impacts, Vesper balance, text pass — 15 October 2026

- **Victory ending:** when a mission completes, the hero cruises on, accelerates into the same hyperdrive jump endless uses (veil, streaks, flash), and the results fade in after the flash. It shares `main.ts`'s presentation-only afterglow with the death ending.
- **Impacts:**
  - every craft flashes over-bright for 0.12 s when hit (instance colour);
  - boss weak points flare their heat and throw sparks on each hit (Bastion-9 and the Helion Ark).
- **Diamond** (the big white Vesper heavy): it takes hits on its whole visible body (radius 0.60, was a 0.30 core) and has 130 HP (was 220). Previously Fan Cannon could not kill one in a whole pass, even parked under it.
- **Needle beam rests:** later endless Vesper sectors chained Needle beams for 18–19 s without a real pause. Now, after 7 s (Relaxed 5 s), pending Needle windups are called off and new ones hold for 3 s (Relaxed 4 s). Veteran has no rest. The longest barrage is now 7–9 s and beams still fill about 30% of the time. The Ark is unchanged (user: it's fine). See docs/11.
- **Text pass:**
  - the moon is now **Luna** (internal id `luna`);
  - removed the "KHEPRI" status dot from the home screen;
  - weapons use their design names everywhere (Twin Pulse, Fan Cannon, Seeker Array);
  - results read `CAMPAIGN / <mission>`;
  - briefs no longer repeat the world name;
  - the help text describes the special's ring.
- **Evidence:**
  - typecheck clean;
  - 257 unit tests, including the new beam-rest test;
  - 15/15 browser specs;
  - victory and death sequences captured in the real app (dev-only `__LAST_WORLDS__.end(phase)` look-dev hook).
- **Not done:** no phone hardware test.

## Luna training ground — 15 October 2026

Training now flies over Khepri's moon: craters, grey regolith, sparse outposts, and blue-tinted enemies. Encounters are unchanged. See [docs/19](19-luna-training.md).
- **Evidence:**
  - typecheck clean;
  - 256/256 unit tests, including the new `tests/world/terrain-moon.test.ts`;
  - flight and menu browser specs 11/11;
  - fixed-seed phone captures inspected (seeds 8831 and 4242): dense craters, grey rocks, steel-blue enemies, orange hero;
  - render stats on High: about 16–22 calls, 12–16k triangles, 0 stream fallbacks.
- **UI pass, same day (user requests):**
  - **Mission selector:** campaign setup is now a full-screen mission page. A slowly spinning globe is painted from each level's own terrain (`src/ui/planet-preview.ts`: a 2D canvas, so no second WebGL context, baked in idle-time slices). Step through missions with the arrows, a swipe, the ← → keys or the glowing dots. The page shows each mission's world, name, brief and threat (1–3).
  - **No dropdowns:** mission, difficulty, weapon, graphics and sound are segmented selectors with glowing indicators (`selector()` in `src/ui/menu-markup.ts`).
  - **Special button:** icon only. The recharge fills a glowing ring around the border, and the button pulses when ready (static glow with reduced motion).
  - **Death:** no more hard cut. After the last life, a throwaway copy of the run keeps flying in slow motion for 2.6 s (`main.ts` afterglow: the hero is hidden, its shots dropped, nothing reaches score or log), "FLIGHT LOST" stays on screen, and the results fade in after a beat.
  - **Moon:** crater lookup now checks reach before mare noise; moon sections generate in about the same time as Khepri's (128 vs 119 ms here).
  - **Evidence:**
    - typecheck clean;
    - 256/256 unit tests (one route test timed out once at load average 31 and passed on re-run);
    - all 15 browser specs pass (four were updated for selectors and the second canvas);
    - phone-size captures of the selector, settings, special button and death sequence inspected; no page errors.
- **Not done:** no phone hardware test.

## Fix: endless froze at distance ~1455 — 15 October 2026

User report: "endless crashed after a while into level 2, freezes, normal campaign seems fine" (phone and PC Chrome).
- **Cause:** an infinite loop in the endless terrain route (`src/world/terrain-planet.ts` `routeOf` → `segmentAt`). Arena ownership was picked by nearest gap, but zones are cut at the midpoint between two arenas. The endless midpoints tie *exactly* (gap 696.8125 / 714.625 on both sides), so the earlier arena won and `segmentAt` returned a segment ending at the query, and `spans()` never advanced. The terrain view reads 400 units ahead, so every endless run hung the main thread at distance ≈1455 (sector 4, the first Vesper stint), independent of seed. Campaign has one arena and was unaffected. Introduced with wave 3 (`7ed310a`).
- **Fix:** owner and zone now come from the same half-open midpoints, so the segment always holds its query; a broken invariant throws instead of hanging. Campaign routes are unchanged (one arena: same zone as before).
- **Regression test:** `tests/world/terrain-route.test.ts` "hands each arena midpoint to the next arena…" (fails without the fix, without hanging).
- **Evidence:**
  - reproduced in headless Chromium with the real sim, renderer and UI (`lookdev/freeze.html`, git-ignored): the page stopped responding at d≈1449, and a CDP pause showed `terrain-view update → route.spans → segmentAt → endless stretches` spinning;
  - after the fix the same run flies through 1455 into sector 6, and a second run passes the next midpoint (≈2910) into sector 9, with 0 errors;
  - ruled out on the way: simulation (fuzzed endless runs with specials, pickups, all weapons, mortal and invulnerable, to sector 11, worst step 7 ms), terrain generation (240 random seeds × sections 0–36, no hang, none over 400 ms), GPU/heap growth (flat through sector 4);
  - typecheck clean; 252/252 unit tests.
- **Not tested:** phone.

## Wave 3: endless planet cycle — 15 October 2026

Endless now cycles planets (docs/18): Khepri sectors 1–3 end with Bastion-9, then a hyperdrive jump to Vesper; sectors 4–6 end with the Helion Ark, then a jump back to Khepri; and it repeats.
- **Bosses must be killed to proceed** (user decision): no timeout or retreat, however long the fight takes. Endless bosses use the endless HP and cadence ramps.
- **Rosters and schedule:** Vesper sectors fly Vesper-only playlists. One pure `endlessSchedule(config)` drives terrain (planet stretches, arenas, jump windows) and look.
- **Terrain:** split seams at planet switches; no stream fallbacks through either jump at 12.7 and 16.6 units/s.
- **Jump visuals:** a veil, streaks and a flash, with a reduced-motion fade. Assets preload during the boss sector.
- **Evidence** (snapshot of the full tree):
  - typecheck clean; 251/251 unit tests; build OK; 15/15 browser tests at low load (load flakes seen earlier at load average 30–50);
  - the perfect pilot kills both bosses with every weapon at power 0 in sectors 1–7 with zero hits;
  - campaign and Khepri output byte-identical.
- **Open:** see `HANDOFF.md` §2–3 (terrain-kit readiness in the jump hold, the old look on new terrain before the flash, streak polish, Ark sky reflection, Vesper infrastructure material routing, Low-tier Ark captures, phone measurements).

## Vesper wave 2: Cold Vector and the Helion Ark — 15 October 2026

Cold Vector is playable from the campaign menu ("Cold Vector · Vesper", docs/17).
- **Mission:** intro, Needle beam squadrons, missile batteries on the ice cliffs, a Diamond escort convoy and relief. Then the scroll stops at distance 920 over open water for the Helion Ark.
- **Helion Ark:** radiator lasers, then the bridge with finite Needle launches from its bays, then overload lanes over its own hit columns. On death it sinks with steam and a foam ring, and the wreck stays on the water as extraction resumes.
- **Presentation** (`src/render/ark-view.ts`): shutters, bay doors, wrecks, wakes, damage glow, one shadow draw.
- **Telegraphs:** Needle beam lanes with a pre-beam flash, missile column marks, Diamond bracket lines.
- **Barges:** a black-ceramic barge under any missile battery seated on water.
- **World:** jagged floes and cracked sets.
- **Evidence:**
  - typecheck clean; unit tests (21 files) and browser tests green in the snapshot;
  - the perfect pilot clears all nine weapon × difficulty combinations of Cold Vector with zero hits;
  - Khepri and Bastion-9 render pixel-identical.
- **Not tested:** no phone test.
- **Known balance risk:** with the Fan, the Ark fight runs about 150 s, so a Fan run of Cold Vector lasts about 5.6 min.

## Vesper wave 1: the ice planet's look — 15 October 2026

Vesper (docs/17) is viewable through the hidden preview switch `?planet=vesper` (https://dafrina.github.io/last-worlds/?planet=vesper). Its Cold Vector mission and the Helion Ark follow in wave 2.
- **World:** about 70% land and 30% water (measured mean 0.71). Ice shelves with continuous blue cliffs, crevasses, ridges, rock outcrops, radiator fields, missile sites, harbours and cryo stations, snow-track roads and heated pipelines on trestles. Ragged pack-ice fields with cracked plates.
- **Look:** a cool lighting rig and grade, an animated ocean with shoreline and floe foam, ice, snow and ceramic materials, Vesper enemy craft, water spray and vent steam. Khepri is pixel-identical to before, and its terrain sections are byte-identical.
- **Assets:** `public/assets/vesper/` holds the kit, infrastructure, craft and the Helion Ark (used in wave 2).
- **Budgets** (SwiftShader): Vesper High 27–41 calls, 21–67k triangles; Low 17–30 calls.
- **Known gaps:**
  - Floes are still mostly convex; more irregular variants are being modelled.
  - In the preview, ground batteries can sit on the water, because their positions are not authored for Vesper yet (wave 2).
  - The banner still names the run's own planet.
  - The hero is the Khepri Scrapper.

## Animated Bastion-9 treads — 15 October 2026

Sprockets, idlers and 12 road wheels are now separate Blender nodes (`bastion-9.glb`, 30 nodes, 19.9k triangles) that roll with the fortress's ground speed, and the belts scroll a one-link-per-tile pattern at the same speed. Checked: typecheck, tests, build and browser suite in a snapshot; the boss fixture renders without errors.

## Wreck falls behind; faster enemy fire — 15 October 2026

- **Wreck:** after Bastion-9 is destroyed, the wreck is ground-anchored. When extraction resumes the scroll it falls behind instead of travelling with the player. A test checks the wreck's world position holds (a fixed offset of at most 5 cm from the resume ramp).
- **Enemy fire:** about 15% faster again, enemies only; the player's weapon cadence is unchanged and never was changed. Dart 0.85 s, Weaver 1.05 s, battery 0.98 s, Lancer 1.85 s; Bastion-9's recovery is 0.5 s. All 127 sim tests pass, including the fairness validator and the perfect-pilot sweeps.

## Smooth cliff edges — 15 October 2026

The sawtooth stair-step rims and striped diagonal walls are fixed in the geometry:
- **Mesh:** the ground grid is now 0.25 units (`TERRAIN_STEP`, previously 0.5), each quad splits along its flatter diagonal so triangle edges follow rims, and nearly flat ground merges back to half-unit quads with crack-free transitions.
- **Shading:** normals come from central differences on the fine grid, and the basalt striation projects along each face's own direction instead of flipping between axes, which caused chevrons.
- **Version:** `TERRAIN_VERSION` is 9.
- **Checks:** 182/182 tests, including a new seam and crack test; 14/14 browser tests.
- **Cost:**
  - visible terrain triangles: worst 64.8k on High, average 33k (target ≤ 120k);
  - generation: about 50 ms per section, spread over prefetch frames with 0 fallbacks;
  - run start: the first three sections build synchronously, about 150 ms on desktop, an estimated 0.5 s on phones (unmeasured).

## Quicker fire and run-wide shields — 15 October 2026

- **Faster enemy fire (about 17%):** repeat intervals are now Dart 1.0 s, Weaver 1.25 s, battery 1.15 s, Lancer 2.15 s; Bastion-9's pause between attacks is 0.6 s. Training keeps a ×1.25 cadence and a lighter climax; Relaxed is ×2.0.
- **Shields (user decision):** one run-wide pool. Hits use up shields, then lives; losing a life does not refill them, and only shield cells add charges. Standard now absorbs 6 hits per run instead of 12.
- **Evidence:** typecheck clean; 181/181 tests. The perfect pilot is hit-free across every mission, difficulty and weapon, and in endless sectors 1–4. Endless idle bot: game over at 38.5 s. The mid-skill bot clears Relaxed Training in 4 of 5 runs and fails Standard Training. Human playtest decides any further softening (fewer early squadrons, later first volleys, or an extra Standard life).

## Combat retune, narrower world and boss arena — 15 October 2026

User feedback after the checkpoint: endless should ramp up in speed; squadrons overlapped and the game was still easy; the ship's hitbox was too small; the boss was too easy and rolled over ravines; the map should be 2.5 screens wide.

- **Endless pace ramp:** sector 1 starts at the old pace (scroll 4) and reaches 1.1× the campaign pace (scroll 5.5) by sector 5, with ship, enemies and camera scaled together. Warning times never scale. `RunState.scrollSpeed` and `RunState.pace` drive render and streaming.
- **Squadrons:** they never overlap (2.2-unit separation, one air squadron at a time, with ground batteries beneath) and threat budgets are lower. Difficulty now comes from much shorter repeat intervals: Dart 1.2 s, Weaver 1.5 s, battery 1.4 s, Lancer 2.6 s.
- **Hitbox:** `VIEW.playerRadius` 0.25 → 0.42, the third-tier size the user asked for; the model is unchanged. The safe gap is now 1.74.
- **Bastion-9:** harder phases, overload lanes over its own hit columns, and the scroll stops into a static arena with a flat platform (docs/15).
- **World:** 30 wide (`TERRAIN_VERSION` 8). Pipelines still connect 100% (132/132 test edges, 1,053/1,053 over 60 more seeds).
- **Bot evidence** (Standard): endless idle loses its first life at 29.1 s; the dodger at 30 s (game over at 109 s); the mid-skill pilot at 76 s. The perfect pilot clears every mode and all nine weapon × difficulty combinations without a hit.
- **Open decision:** the larger hitbox makes Training very hard for the mid-skill bot (it fails Standard Training in all 5 runs); human playtesting should decide whether to soften Training.

## Checkpoint deploy — 14 October 2026, late evening

The user asked for a checkpoint at a stable point; the graphics polish and its measurements follow in a second deploy.

- **Bastion-9 production integration** (docs/15):
  - **Model:** the Blender model with gigantic treads, a core turret blended into the hull and deck turrets (19.1k triangles).
  - **Animation:** treads scroll and kick up dust; shutters slide open; guns track their aim; batteries break into wrecks with sparks and smoke; the core glow follows damage; overload flickers.
  - **Destruction:** sparks, rolling fireballs and debris, a core blast with a shock ring, then smoke.
  - **Seating:** `bastionPlacement` rests the hull on the highest ground under it; scenery under the footprint is hidden.
  - **Audio:** cues for arrival, phase changes and kills.
- **Pipelines:** all 132 test-seed edges connect (risers, trestles, lifted runs).
- **Combat:** 16 authored squadron formations; 5–8× denser fire under a runtime fairness guard and an offline validator; Relaxed, Standard and Veteran differ more.
- **Pace:** about 20–25% faster. Scroll 4 → 5, ship 10/70/100 → 12/90/125, camera follow 14 → 17.
- **Rendering:**
  - **Flight plane:** raised from 3 to 3.8; screen positions are unchanged.
  - **High tier:** sun shadows and a new post pipeline (MSAA HDR, selective bloom, grade, vignette).
  - **Look:** warmer lighting; veins are now thin glowing cracks; valleys read warm violet instead of night.
  - **Craft:** PBR craft materials; engine, muzzle, impact and explosion VFX.
  - **Haulers:** 75% scale, seated on slopes.
- **Controls:** a held steering touch that slides across the middle switches direction (3% dead band).
- **iOS:** the long-press loupe and callout are suppressed. This shipped earlier, in `f31267e`.
- **Evidence** (WSL, Node 24.16.0, SwiftShader):
  - **Checks:** typecheck clean; `npm test` 16 files, 167/167; build 845 KB JS (234 KB gzip); `test:browser` 9/9, including slide-steering and all three boss cases.
  - **Draw calls** (graphics agent, frozen builds, boss fixture): High 104 (shadow 37, main 61, post 6), Low 56.
  - **Visual review:** endless seed 93 and the boss batteries phase were checked by eye.
- **Deployed:** commit `587f7bc`, Actions run 38640030484 succeeded. Live check in headless Chromium: both campaign missions are offered; `bastion-9.glb` returned 200 (1,674,252 B); endless High tier ran at 44 calls (shadow 8, main 30, post 6) with all kits as GLB, no stream fallbacks and no page errors.
- **Not verified:** phone frame time; endless draw-call and frame-time measurements under the new renderer.
- **Open items:**
  - mineral pool rims still read as flat cyan in deep valleys;
  - merging the fortress meshes would cut about 25 shadow draws;
  - the baked terrain shading uses a 28° sun while the live sun is at 38°;
  - the perspective decision is pending, with data in hand: at FOV 20 the flight plane is 13.7 units wide at the top versus 10.7 at the bottom, 8.5% of the sim's view rectangle falls off-screen, and ground targets slide up to 1.27 units across a camera pan; the graphics agent recommends keeping ortho.

## M2 mechanics increment — local, 14 October 2026

Rolling Thunder is selectable alongside Training and ends with the functional Bastion-9 encounter. Two destructible batteries, a protected/exposed core, overload lanes, safe destruction/extraction, victory and retry are implemented. Shields remain pickup-only with a fixed mission budget; endless starts and difficulty remain independent. See [the complete behavior and handoff](15-bastion-slice.md).

This increment adds `src/content/bastion.ts`, `src/sim/bastion.ts`, `src/render/bastion-view.ts`, mission UI/configuration, and dedicated tests. Terrain changes in this shared checkout belong to the other session. Only a small boss renderer hook was added to `scene.ts`; its concurrent terrain hooks were preserved. Blender MCP was checked successfully (Blender 5.2.2 LTS); the live Blender scene was not modified.

Verification in WSL Ubuntu / Node 24.16.0 / Chromium with SwiftShader:

- Typecheck and production build pass; current JS bundle is approximately 781 KB / 212 KB gzip. The existing chunk-size warning remains.
- The full 80-test suite passed after the concurrent terrain-network failure was resolved by the terrain work. One subsequently added boss projection test also passes (81 checks total).
- Seven browser tests passed in an isolated artifact directory; the boss browser suite was then extended with extraction → victory → retry and all three boss browser tests passed (eight distinct browser cases covered overall). An earlier trace-file cleanup collision between concurrent test processes was resolved by using `lookdev/bastion-qa` and `lookdev/bastion-final-qa`.
- Scripted full-mission clears pass for all nine main-weapon/difficulty combinations with starting lives, no pickups and no special. Standard ideal clears: Pulse 156 seconds, Fan 214, Seeker 160. This establishes feasibility, not human balance.
- Model socket/collision projection verified across center and both camera extremes over multiple terrain heights. Actual batteries/core/overload screenshots inspected at phone size; live steering and battery fire inspected in the in-app browser.
- Screenshot: [functional boss core](screenshots/bastion-core-phone.png). Development encounter fixture: `/tests/fixtures/bastion.html`; the fixture is absent from `dist/`.

The new boss increment is local and has not been pushed/deployed by this session. The existing public site below is the earlier deployed version. Remaining M2 gates: human boss playtests, actual phone frame-time/touch checks, production fortress/ship models and fuller feedback/audio. M3 campaign hangar, wallet, goals/statistics and saves remain next; this increment does not claim those systems.

*Integrator note:* the Codex session ran out of tokens before pushing. At the user's direction, the World session committed this increment unchanged as `deb1b22` and deployed it together with the settlement-network pass. That commit passes typecheck and its 81 unit tests on its own.

## Settlement network pass — 14 October 2026

User feedback: the world "feels very empty", "all the infrastructure bases look the same", and pipelines and roads should run beyond the bases. Changes:
- **Outposts:** seven seeded archetypes (refinery complex, mining camp, landing field, comm station, pumping station, wreck site, abandoned outpost), each with its own composition, rotation/mirroring and module counts, on flattened ground. They use nine new Blender pieces (drill rig, two habitats, comm dish, tiling solar array, light mast, silo, two wrecks), so `khepri-infra.glb` now has 16 nodes and is 1.07 MB.
- **Network:** a seeded global graph links the outposts, with exits off the map and some cross links. Each edge is path-found with A* on a slope-cost grid, so routes never climb cliffs, and is cached per edge, so every section renders its own part identically. Roads render as terrain-following ribbons with ruts and berms; pipelines are shared-kit pieces on supports, pitched to the ground, with valve stations.
- **Life and density:**
  - Haulers drive the roads and amber beacons blink; both are presentation-only, from seed and time, never collision or targets.
  - Rock, boulder, fallen-column and crystal fields are denser, and impact craters have ejecta.
- **Streaming:** section generation is resumable (generators) and prefetched ahead of need within a 3 ms per-frame budget. A test proves incremental and synchronous builds are identical.
- **Evidence (WSL, Node 24.16.0, SwiftShader):**
  - **Checks:** typecheck clean; `npm test` 11 files, 84/84; build 782 KB JS (212 KB gzip); `test:browser` 8/8, including the 3 Bastion browser tests.
  - **Render stats:** fixed seed 93 at High tier gave 44–54 draw calls and 26–30k triangles in view. A Node sweep found at worst 51 calls and 36.4k terrain triangles.
  - **Streaming:** no synchronous fallbacks after start. Terrain CPU work peaked at 4.3–5.4 ms per frame (budget ≈4 ms; 1–2 frames over in 700).
- **Remaining:**
  - About half of the edges flagged for pipelines fail their path search at cliffs.
  - The old rail track pieces are no longer placed.
  - Crystal and lamp glow stay tone-mapped.
  - Phone frame time is still unmeasured.

14 October 2026 — M1 world pass: procedural Khepri world map, Blender kits, GitHub Pages pipeline.

## Authorized scope

Implementation agents built a shared flight prototype (combat, generated world/3D rendering, controls/UI); the integrator owns wiring, design updates and verification ([integration contract](12-implementation-contract.md)). On 14 October the user directed a world-map pass for Khepri that matches the concept art ([Khepri world](13-khepri-world.md)). That pass added Blender-modelled terrain, an infrastructure kit and a shared cross-planet industrial kit ([shared kit](14-shared-industrial-kit.md)), CC0 Poly Haven surface detail, and GitHub Pages deployment.

Procedural terrain and world layout belong in the MVP. Enemy models, encounter composition, battle sequences and attacks remain authored. Hero generation is deferred.

## World pass: what changed

- **Seeded macro geography** (`src/world/`): domain-warped massifs and ridges, dendritic canyons at any angle, four terrace tiers, moods (canyons/mesas/basins/flats), relief from about −6 to 2.0 (rims up to the 2.2 scenery cap), and baked sun shadows. Turquoise veins and terraced pools sit in valley bottoms. Outposts stand on flattened terraces; seeded pipelines and tank farms follow contours. Terrain never reads combat or loot state.
- **Rendering** (`src/render/terrain-*.ts`, `scene.ts`): slope-driven materials (basalt faces, ochre dust, lighter rims), a light slate haze in the depths, and kit and infrastructure instancing with view culling. Ground turrets seat on any terrain level, with a render-only plinth and an occlusion silhouette.
- **Blender kits** (rebuildable headless from `tools/blender/*.py`, byte-identical builds):

  | File | Size | Nodes | Contents |
  | --- | --- | --- | --- |
  | `khepri-kit.glb` | 663 KB | 33 | basalt clumps, columns, spires, walls, fallen columns, rocks, boulders, crystals, crystal spires, rosette, hoodoos |
  | `khepri-infra.glb` | 597 KB | 7 | landing pad, refinery, relay, 3 haulers, tiling track |
  | `shared/industrial-kit.glb` | 342 KB | 14 | tiling pipes in 2 sizes, valve, support, 4 tanks, 2 containers; mask-based colour so any planet can re-theme them |

  Previews and provenance are in `art/khepri-kit/`, `art/khepri-infra/` and `art/shared-industrial/`.
- **Textures:** CC0 Poly Haven sources (`dry_ground_rocks`, `rock_face_03`, `metal_plate_02`) are in `art/source/polyhaven/` with provenance. Runtime derivatives total 174 KB.
- **Look-dev:** `node tools/lookdev.mjs <label> [seed]` captures fixed-seed phone-size screenshots of the dev server into the git-ignored `lookdev/`.

## Evidence (14 October 2026, WSL Ubuntu, Node 24.16.0, Playwright Chromium with SwiftShader)

- `npm run typecheck`: clean.
- `npm test`: 8 files, 64/64 passed. Covered: terrain determinism, seams, height range, landform variety, budgets, kit contracts, infrastructure placement, and turret projection on deep and high ground.
- `npm run build`: passes. JS bundle 753 KB (202 KB gzip); Vite warns that the chunk exceeds 500 kB, and that warning is accepted for now.
- `npm run test:browser`: 4/4 passed.
- **Render stats** (fixed seed 8831, 432×768 at DPR 2, High tier): 33–48 draw calls and 20–32k triangles in view. A Node sweep of seeds 11/93/8831 across the full camera range found at worst 44 calls and 52.6k triangles. All are within the 100-call / 180k-triangle guardrail.
- **Memory:** a 90 s endless run (350 units of travel, about 10 sections recycled) held a flat 40 MB JS heap. Geometry count plateaued at 86 after the first-use warm-up.
- **Visual review:** the integrator compared fixed-seed captures against `art/concepts/02-portrait-combat.png` and `03-minimal-hud.png`. Material language, depth and miniature scale match the direction the user approved in review. The integrator retuned depth tint and haze to keep Khepri rust-ochre, and made pools dark liquid with soft glowing rims so they no longer compete with cyan player shots.

## Known limits and next actions

- **Phone performance is unverified:** no iPhone/Android frame-time test has been performed; the user has played on an iOS device informally. SwiftShader shows frame hitches (max frame 0.4–1.2 s under heavy machine load). Section generation is now spread across frames (see the settlement network pass); measure on hardware.
- **Visual polish:**
  - Diagonal terrace risers still alias into sawtooth steps in places, so more rim dressing is needed.
  - Veins are subtle.
  - Mineral flats can grow large pools.
  - Glow has no bloom.
- **Not yet in the repo:** the runtime texture derivation script (see `art/source/polyhaven/README.md`).
- **Not the complete MVP:** campaign economy, mission content, side missions/statistics/save progression, production boss art, full endless upgrades and offline installation remain later milestones.

## Deployment

The GitHub Pages workflow (`.github/workflows/pages.yml`) runs `npm ci`, the unit tests and the build (with typecheck) on every push to `main`, then deploys `dist/`. Repository: https://github.com/dafrina/last-worlds (public); site: https://dafrina.github.io/last-worlds/. 

First deployment, 14 October 2026:
- **Run:** commit `ba33ef6`, Actions run 38590342484. Build (unit tests plus typecheck/build) and deploy both succeeded.
- **Live check:** in headless Chromium, the page loaded, an endless flight started, and all three kit GLBs and the textures returned 200 from the `/last-worlds/` subpath. Render stats showed `kit/infra/shared: glb`, with no page errors or failed requests.
- **Not yet tested:** phones and the installed/offline flow (no service worker exists yet).
- **Upcoming runner change:** GitHub will move `ubuntu-latest` to Ubuntu 26 from 19 October 2026; recheck the workflow after that.

Second deployment, 14 October 2026 (Bastion-9 plus settlement network):
- **Commits:** `deb1b22` (Bastion, from the Codex session) and `ff62ddc` (world).
- **First attempt failed:** run 38622891671. The 70 s terrain-streaming unit test took 5.8 s on the GitHub runner, over Vitest's 5 s default. Fixed in `vitest.config.ts` (`testTimeout` 30 s); run 38623094575 succeeded.
- **Live check:** in headless Chromium, the campaign offered "Rolling Thunder · fortress assault" and "Training". The 16-node infra kit served 200 (1,066,244 B). Endless rendered at 52 calls / 33k triangles, with `kit/infra/shared: glb`, no stream fallbacks and no page errors.
- **Long local run:** a 160 s campaign run through the Bastion fight (623 units of travel) held a flat 35 MB heap with zero synchronous terrain generations. Geometry count grew only on first use of models and the boss.
- **Not yet tested:** phones.

## 15 October 2026 · Isolated flight-command UI and local statistics (Codex)

User reassigned Codex to UI/menu only while World continued combat/terrain. This increment sits on the newer `372a2a7` checkout and preserves that session's ongoing dirty files.

- Deep navy/cool blue menu palette and original SVG orbital illustration; shorter Home with Campaign Flight, Endless, Statistics and Settings. Instructions live in a separate guide. Campaign now has a dedicated preparation page with the existing mission/difficulty/main-weapon options and all four equipment slots represented.
- Settings are reachable from Home/Pause; Back and Escape return to the calling page without resuming a paused flight. Keyboard tab handling, focus return, narrow-screen scrolling and title sizing were checked.
- Local observational statistics now persist independently for Campaign/Endless, with cumulative activity, finalized records and recent flight history. No campaign wallet, unlock, store or gameplay logic was added. Interrupted checkpoints are labeled; corrupted/unknown data is preserved and blocked storage falls back to a clearly labeled session log.
- Navigation plan and save boundaries: `docs/16-flight-command-ui.md`. Future Missions/Loadout/Store/Assignments belong inside Campaign; no nonfunctional store controls were added.

Validation:
- `npx vitest run tests/ui/flight-log.test.ts`: **8/8 passed** (deltas/deduplication, mode isolation and read-only observation, reload/interruption, malformed saves, quota failure, sequential shared-storage updates, bounded history and exclusion of late fixtures).
- Playwright: **14 distinct browser cases passed** across `menu.spec.ts` (5), `flight.spec.ts` (6) and `bastion.spec.ts` (3). Initial 13-case integration run passed; the added small-screen/focus case caught a tab-trap bug, which was fixed and all 5 menu cases rerun successfully. Final title width fix passed the targeted responsive case again.
- Checked 320×568, 390×844 and 1440×900; actual menu/campaign/statistics screenshots inspected, plus an in-app browser review. Narrow-phone title clipping under fallback fonts was fixed by sizing against frame width. Home fits without vertical scrolling; campaign Back and Launch remain reachable on the smallest viewport.
- `npm run build`: **passed**, including TypeScript. Combined current bundle 866.20 kB JS / 241.93 kB gzip; the existing >500 kB chunk warning remains. `git diff --check` on this increment passed.
- Browser evidence uses bundled Playwright 1.64.0 Chromium / software ANGLE, DPR 1, plus the desktop in-app browser. No actual iPhone/Android validation or full combat/terrain suite claimed for this isolated increment.

Evidence: `docs/screenshots/menu-blue-phone.png`, `campaign-menu-phone.png`, `statistics-phone.png`. Detailed test output is in ignored `lookdev/ui-menu-qa`, `ui-final-qa`, and `ui-title-qa`.

Status: local changes ready for World's coordinated integration; no independent commit/push/deploy. Real phone testing, full campaign progression/store, richer statistics filters, and future log migration/export remain later work.


## 15 October 2026 · UI release validation

The user requested deployment of the reviewed UI increment on top of the already deployed gameplay commit `dde50a5`. The exact combined checkout passed all **180 unit tests**, **14 browser tests**, TypeScript and the production build before commit/push. Browser output: `lookdev/ui-deploy-qa`. Source changes are limited to the menu, local statistics, browser theme color, associated tests, screenshots and documentation. The existing bundle-size warning and actual-phone validation limits remain.
