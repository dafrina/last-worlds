# Build status


## Warp hides the world on High, 27 October 2026

User: "the issue was that we see the terrain thats being loaded. I wanted it not to be opaque but a solid dark overlay instead of being able to see the level during the warp".

- **Cause:** on High, the post pass draws the world fog and the top haze after the veil, from the scene's depth. So during the launch warp and the planet jumps, the fog traced the hidden terrain in its own colour: Umbra's canyons in lavender, even a boss silhouette. Low has no post pass and was already solid. Codex's check covered only Low.
- **Fix:**
  - The veil now reports how much it covers (`jumpFx.cover`, `src/render/fx-jump.ts`).
  - The composite fades its fog and haze by that amount (`cover` uniform, `src/render/post-pipeline.ts`, set each frame in `src/render/scene.ts`).
  - Under the warp, High is solid deep space with only the streaks, the same as Low. As the veil lifts, the fog returns with the world.
- **Checked:**
  - captures of the warp fixture on Umbra, before and after the fix;
  - the real endless launch from the menu on High;
  - `tests/browser/combat-light.spec.ts` now checks that the warp frame stays unchanged on both Low and High while the world below moves. Without the fix it fails on High.
- **The playground test** (`tests/browser/faction-regressions.spec.ts`) now opens the Boss and Level tabs before using their controls, which moved there with the new tabs.
- **Release gate** (clean worktree of `origin/main` plus the playground and this fix):
  - typecheck, build, and unit tests 460/460 pass;
  - browser tests 42/44 at first (Playwright exit 1, 36.1 min). The two failures were timeouts (the Ark pose fixture, a menu click), both while another project's e2e suite loaded the machine to about 37 on 16 cores;
  - both reran alone and passed (4 tests, exit 0).
- **Not checked:** no phone test.

## Playground: tabs, an enemy lab on the real map and a model viewer, 27 October 2026

User: "can you make a model viewer for each enemy and the hero. maybe organise the playgrtound some better too to support this. also classify them by type/tier of enemy and make me able to simulate its attacks or something, also placed in the playground on the real map".

- **Tabs:** the playground (`playground.html`) has Level, Look, Boss, Enemies and Models tabs. The look tuning, its saving and the boss fight are unchanged.
- **Enemies (the lab, `src/playground/lab.ts`, `roster.ts`):**
  - **The roster** is grouped by tier:
    - I light fighters (dart, needle);
    - II escorts (weaver, lancer);
    - III heavies (diamond, pulsar);
    - IV predators (the Wraith, Umbra's);
    - ground (battery, missile battery, fuel depot).
  - **Each kind's card** shows the model it flies on the open world, read from the renderer's own tables, so the roster can't disagree with the game. It also shows its hp, radius, attack timing and shot speed, and what its attack does.
  - **Spawning:** "Spawn" puts a single one into the live simulation; a squad button puts in its formation; "As hunter" spawns the shielded ace. Every formation is available.
  - **The map:** they fly and attack over the level's real terrain. The world flies on from the Level tab's position: the mission's clock is set where its scroll is there, and it starts over short of the boss's approach.
  - **Out of the lab:** the campaign's playlist, hunters and boss.
  - **Controls:** "Attack now" makes every enemy wind up at once. The ship holds "Ship x" and cannot die.
- **Models (`src/playground/viewer.ts`):**
  - **What it lists:** the hero, each faction's craft (Khepri and Luna, Vesper, Nacre and Amnion, Amnion's brood heavy, the Umbral fleet with the Wraith), the loot skid and every boss. Each comes with its triangles, size, materials and who flies it where.
  - **How it shows them:** on a turntable in its own renderer, framed to the portrait view. Turn, wireframe, and a neutral studio or the level's own light.
  - **"Model"** on an enemy card opens its model.
- **Renderer:** the craft tables in `src/render/scene.ts` are exported for the roster; nothing else changed.
- **Checked:**
  - captures of the lab on Umbra (interceptors, batteries, a Wraith hunter, a carrier, "Attack now") and on Khepri (a lancer-led diamond, missile batteries, a pulsar);
  - the viewer on the carrier, THE ECLIPSE and the hero;
  - no page errors;
  - screenshot: `docs/screenshots/playground-enemy-lab.png`.
  - The playground has no browser test.

## Umbra cliff faces, grounded structures and final-world scores · 25–26 October 2026

- **Cliffs:** four new versioned Blender wall variants in `umbra/cliff-kit-v2.glb`, broad oblique facets, cleavage seams and hard shoulders. 203–315 triangles per variant, 122,564 bytes total; exported via live Blender MCP in an isolated scene. More broken stretches of the canyon lips use them. After the user's playground review, the underlying canyon and boss abyss also have straight wall profiles and hard face/rim normals, approved on 26 October. Their kit faces extend four units deeper to hide exposed lower cuts, keeping the upper rim anchored and adding no triangles or draws. The approved hill models and other worlds' terrain remain unchanged; the old cliff GLB remains available for rollback.
- **Grounding:** all Umbra building, crescent dock and pad footprints now require a supported plateau across a rotated interior/edge grid. Buildings sink slightly into the lowest support point. Dock undersides seat on the plateau with their old hanging spikes buried. Floating rock fragments remain. The extra placement probes yield in small batches during terrain prefetch.
- **Final playground follow-up:** user requested less spiky floating-rock undersides; three isolated Blender replacements retain their cracked tops and use broad cleaved wedges (75–99 triangles / 30,992 bytes). Other nodes in the original kit remain untouched. Exact reproduction of seed 8833 / distance 928 showed that buried wall feet were still outlined because kit fog differed from ground fog. Both now share Umbra's height fog and fade completely into the deep abyss below −8.2. Wall feet also have a −10 minimum depth. Other planets reset to their original haze; no extra transparency or draws.
- **Music:** original Amnion *Something Beneath the Skin* (92 BPM, biological horror) and Umbra *A Line Through Silence* (90 BPM, clean/sharp/eerie), replacing both placeholders. Each has an authored 32-bar arrangement, unique instruments, and synchronized additive boss bass/rhythm. Earlier scores and combat sounds are unchanged. The [Sound room](http://localhost:4173/lookdev/audio/index.html) includes level, boss and transition previews for all six worlds.
- **Validation:** final full gate passed **451/451 unit tests and 42/42 browser tests** (20.0 minutes, Playwright exit 0), typecheck and production build. Includes asset/fog regressions, all six worlds' audio, boss isolation and poses, facility loading, controls and viewport checks. The exact reported seed 8833 / distance 928 is captured on Low/High, alongside ordinary cliffs and grounded crescents. No page/HTTP errors or terrain fallback in the Umbra check.
- **Evidence:** 40 generated sections checked for full-footprint support and continued presence of every structure type; 80 simulated seconds at maximum scroll speed with zero synchronous fallback. Low/High screenshots visually inspected in `lookdev/umbra/browser-checks/`, retained examples in `docs/screenshots/umbra-cliffs/`. New actual-mixer renders and measurements are in `lookdev/audio/` and `docs/screenshots/audio/final-world-metrics.json`. Amnion level/boss peaks 0.209/0.414, Umbra 0.166/0.336, zero clipping. PCM cache 8.65 MiB under the existing 9 MiB limit. Browser verification used Chromium 156 on the desktop with SwiftShader and portrait viewports, not an actual phone performance/listening test.
- **Status:** user explicitly requested deployment after the deeper-wall fix. All release gates passed; publishing to GitHub Pages. No models/scenes belonging to the other session were reset. Final browser evidence is in `lookdev/umbra/final-release-browser/`, exact playground reproduction in `lookdev/umbra/cutoff-abyss-fog/`, with retained screenshots in `docs/screenshots/umbra-cliffs/`. Live verification follows publication.

## Phase predators, shield resistance, boss isolation and approved Umbra cliffs · 25 October 2026

- **Wraith (Umbra only):** authored black glossy carapace with hooked spines and tendrils. A visible aim feint precedes its cross-field warp; it fires a tight three-round burst about 0.15 seconds after materializing. Three Final Horizon encounters and Umbra hunters use it. Normal enemies attack twice; hunters repeat after a five-second rest. Fairness checks include the planned destination and each delayed round. See [design and timing](29-phase-predators.md).
- **Amnion brood heavy:** replaces the Nacre Orrery for the round `diamond` enemy and its hunter version, keeping their behavior. Irregular bone plates surround an open toothed mouth, with flesh and tendrils. Both predators use versioned GLBs exported via live Blender MCP, 15,268 / 11,984 triangles and 271,492 / 195,024 bytes respectively.
- **Main Seeker against hunter shields:** 80% damage reduction while a shield remains, full damage to bare hull; other mains and specials unchanged. Projectile provenance prevents bypassing this with a weapon pickup or lost lock. The preliminary 90% reduction was reduced to 80% after campaign balance runs.
- **Carrier pods:** only the active carrier may draw deployed pods. Previously loaded Cradle/Eclipse batches overlaid Veil's pods, causing the yellow appearance. No approved Veil material was recolored.
- **Boss changes:** inactive Bastion is explicitly cleared every frame; all six bosses now hide their roots, pods and effects when inactive. Playground level changes reject stale asynchronous preparation completions.
- **Terrain:** the user approved releasing Claude's current playground state. Includes the existing Umbra second pass below and its pending fourth-pass cliff GLB/source: fewer large planar fractured wall solids with sharp lips and dark joints. Codex has not regenerated or changed those models.
- **Checked:** 446/446 unit tests, including all campaign/endless/fairness tests; typecheck and production build; 2/2 asset tests after a type-only import correction; targeted browser 7/7 (Playwright Chromium, SwiftShader, desktop host with phone viewport). Low/High predator captures and the Veil pod launch after loading all carriers were visually inspected under `lookdev/phase-predators/browser-final/`. Existing test seeds, completion limits and no-hit/no-special assertions are retained. The scripted Seeker pilot now clears softer threats first except beam craft, and delayed observations copy nested state.
- **Release gate:** full browser suite **41/41 passed** (18.6 minutes, exit 0), including graphics, all boss poses, controls, audio, menu/save and mobile viewport checks. Production build/typecheck and all 446 unit tests pass. No actual-phone test or performance claim.
- **Deployed:** `72c9bc6` to [Last Worlds](https://dafrina.github.io/last-worlds/); [Pages run 40197555961](https://github.com/dafrina/last-worlds/actions/runs/40197555961) succeeded. Verified the live entry bundle `main-C2IMooy7.js`, byte-for-byte SHA-256 matches for both predator GLBs and the approved Umbra cliff GLB, and a production browser launch/pause/resume with zero page errors or failed HTTP responses. Chromium 156.0.8078.4, SwiftShader, 390×844 viewport; evidence in `lookdev/phase-predators/live-release.json` and `live-release.png`.


## Umbra, second pass: sharp fractured hills, sparse cracked cliffs, stone structures; a black bloom blob fixed, 24 October 2026

User, on the first Umbra release:
- "why is there rounding on the edges? i want it sharp. also, variate the hills more, its so many triangles which is also why it looks wrong. now add the cliff models back but sparsely";
- "generally, it should be less spikey as a vibe and more cracked and sharp";
- "the triangular mountains still look off", "make them more irregular shapes";
- "and rework the infrastructures, they should be stoney/sharp/clean not just smooth".

- **Hills:** the kit's eight fractured obsidian massifs (`umb_hill`, 172–518 triangles each) now overlap into the hill ranges, larger toward a region's heart. Each is a few exactly planar faces broken along cracks with razor edges. The ground under them is the flat plateau again: as heightfield pyramids, the 0.25 grid rounded or stepped every ridge.
- **Less spiky:** the needle spires became rare, at canyon edges only; shards are fewer. The cliff shards were rebuilt as cracked glass slabs and are back along about a quarter of the lips (`cliffWallSteps` with a patchy accept). Their tops stand a little over the lip (the new `overtop` option).
- **Structures:** reworked as worked stone: crisp faceted tiers (12–26 sides) with chamfers and block joints, satin rather than mirror gloss, the silhouettes and glow slits kept.
- **Cracks:** the plateau's crack network is stronger (crack look 1, lighter edge tint).
- **Two rendering fixes:**
  - The kit's sun glint is now a per-planet uniform (`kitGlint`), 0.05 on Umbra. It was made for small round egg shells, and on Umbra's large flat facets it lit whole faces white.
  - **A black blob on High:** an invalid (NaN) pixel in the kit's gloss shading was spread by the bloom's low-resolution blur into a blocky black circle. Low tier had no blob. Fixes:
    - the kit's gloss normal is normalized safely (`src/render/terrain-kit.ts`);
    - the bloom prefilter drops any NaN or infinite pixel (`src/render/post-pipeline.ts`), so a single bad pixel can never spread again on any world.
- **Checked:** typecheck clean; Umbra tests (`terrain-umbra`, `umbra`, the boss asset test) pass; playground captures (`lookdev/umbra/review/terrain-m5-hills.png`). Gate: see the coordination log. **No phone test.**

## Umbra, the final planet: Final Horizon and THE ECLIPSE; Seeker Array weaker, 24 October 2026

User:
- "new planet: [concept sheets] create the map, i think i like the crevasces geometry of amnion for this, but everything above the main plane should be very pointy spikey mountains instead ... obsidian black shiney surfaces and floating cliffs etc vanishing into a purple glowy fog. I like the infrastructures in these concepts too, and the alien ships too which should be deep black shiney and smooth surfaced. The boss: "C:\Users\DavidFarina\Downloads\crescent winged spaceship 3d model.glb" fix the one missing peak of one wing";
- "btw the boss should be very large tho like a final boss";
- the ground reviews, in order: "its all very rounded up tho, i want sharp edges and spikey mountains"; "theres a lot of jagegd edges too ... not sharp and pointy jagged but like steps"; "too triangular and the cliffs look too uniform"; "look how triangular and soft and steppy some parts look"; "also the cliffs look bad, can u remove the models there"; "now everything too flat and smooth, stay true to the concept please with cracks in the terrain, and i quite liked earliers version with the hills better than just spikes everywhere the spikes are too small and pointy, should more look like sharp rocks"; "also the infra models look kinda flat and bland";
- "can you make the seeker missiles for the main weapon make less damage like the fan burst? there should be incentive to use the ther weapons".

- **Design:** `docs/28-umbra-eternal-eclipse.md`. Concepts are in `art/concepts/umbra/`.
- **Mission:** Final Horizon (`final-horizon`, "FINAL HORIZON · UMBRA") is the last campaign mission, after Brood Strike.
  - It uses Brood Strike's grid and pressure. Amnion's world intensity and cadence 0.92: the final planet is not made harder before it has been played.
  - Hunters are lancers.
- **Ground** (`src/world/terrain-umbra.ts`):
  - Amnion's crevasse generator with its own seed. Canyons fall from the plateau at −1.8 to about −5.6, into a lavender fog with a faint glow (ground haze and level fog).
  - Shattered obsidian plates, slightly tilted, with a crack network whose edges catch the light. Violet glowing faults appear in patches.
  - Faceted hills: flat-faced pyramids whose heights are fixed at their apex, so every face is a true plane.
  - The look is in `src/render/scene.ts` (`LOOKS.umbra`, the new `void` reflection sky) and `src/render/terrain-kit.ts`:
    - the ground is satin-glossy (roughness 0.55);
    - the kit mirrors the sky (env 1.1);
    - Umbra's walls are cold violet-black, with crease shading off.
- **Kit** (helper, headless Blender: `tools/blender/umbra_kit.py` → `public/assets/umbra/umbra-kit.glb`, 23,057 triangles, 2.3 MB; previews in `art/umbra-kit/`):
  - sharp obsidian rocks (`umb_peak`, as accents on and around the hills), spires, shards and floating cliffs over the canyons;
  - the concept's structures, reworked to its layered depth: monolith towers, eclipse gates, arc reactors, shield pylons, obelisks, pads, and now and then a crescent dock.
  - The cliff shards along the lips were built (the `umbra` branch of `tools/blender/cliff_kit.py`), then removed at the user's word. Their runtime support is gone; the GLB is not shipped.
- **Fleet** (helper: `tools/blender/umbra_craft.py` → `public/assets/umbra/umbra-craft.glb`, seven ships, 11,938 triangles):
  - interceptor (dart, needle), heavy fighter (weaver), elite hunter (lancer), drone carrier (diamond), artillery ship (pulsar), defense turret (turret, missile), and THE ECLIPSE's drone;
  - deep black glossy glass (`umbra_obsidian`: roughness 0.12, no metal) with violet cores; violet plumes.
- **THE ECLIPSE** (helper: `tools/blender/approved_eclipse.py` → `public/assets/umbra/the-eclipse-v1-approved.glb`, 78,907 triangles, 5.4 MB):
  - The user's GLB lies flat (its front view is the concept's top view), 20 units from horn to horn. It rises out of an abyss across the whole world and hovers over it, its horns running off both screen edges.
  - The broken left horn's tip is the right one's, mirrored and stitched; the seam isn't visible in the before/after crops.
  - The rig is THE VEIL's carrier rig:
    - energy vents on the inner wings at x ±5.15 (radius 1.1);
    - the reactor (radius 1.2) under six armour sectors that roll outward 50°;
    - drone waves from the vents' inner ends.
  - Fight timing and pressure are THE CRADLE's (`src/content/eclipse.ts`).
- **Seeker Array:** damage per missile 18 → 12 (`src/content/balance.ts`), so 75 → 50 damage a second, every shot homing. That is under an aimed Twin Pulse (96) and a close Fan (75).
- **Checked:**
  - typecheck clean; unit tests: see the gate below;
  - `tests/sim/umbra.test.ts` (campaign place; perfect pilot without a hit on seed 5 with each weapon) and `tests/world/terrain-umbra.test.ts` (caps, kinds, hills, canyons);
  - the fairness table and runs include Final Horizon;
  - the boss asset test covers THE ECLIPSE (rig, 80k budget, camera rays to both vents and to the open reactor at x 0.6: the near spike hides the reactor's very centre);
  - the Seeker change kept every perfect-pilot run on the other worlds within its time;
  - renderer captures in the light playground and the boss fixture (`boss=eclipse`, now with `god=1` for the mission's approach): `lookdev/umbra/review/`.
  - **No phone test.**
- **Open:**
  - Umbra's music is a placeholder; Codex is asked in `COORDINATION.md`.
  - The user asked "why are the pods in nacre yellow?". THE VEIL's launched pods render dark violet with teal slits, so I asked which pods are meant.

## Amnion: no more red stripes on the bone terraces, 24 October 2026

User: "after deploy fix these regular red strikes" (a screenshot of a bone mesa striped with bright red vertical and diagonal bands).

- **Cause:** the ground shader gives every steep face the planet's wall material, and on Amnion that is the flesh hue. The canyon walls are already painted dark flesh, so they stay dark. On the pale bone of the mountain terraces (strata risers) and the crust cracks, the hue scaled by bone's brightness came out as bright red. The 0.25 height grid draws those faces as straight vertical and 45° runs, hence the regular stripes. A probe over 400 units of seed 8831 found about 10% of the plateau-top faces steep enough to be walls, most of them on the mountains.
- **Fix** (`src/render/terrain-kit.ts`, Amnion only: `fleshOnly` in its wall look): on Amnion the wall hue only applies where the vertex colour is already dark flesh or sinew (luminance under about 0.08–0.16). Bone risers and cracks keep their own colour, with the wall's shading and texture, and read as stone steps. Canyon walls and every other planet are unchanged.
- **Checked:** captures in the light playground (Brood Strike, distances 75, 95 and 295) before and after: `docs/screenshots/amnion-bone-risers.jpg` (pairs, before left). Gate: see the coordination log. No phone test.

## HELION ARK from the user's new GLB, cleaned surfaces; THE VEIL without its pod sketches; THE CRADLE under 80k, 24 October 2026

User:
- "do this one next "C:\Users\DavidFarina\Downloads\futuristic spaceship 3d model.glb" thats the ark";
- "lets raise the max to the veils 80k"; "forget the front diamonds that are pod sketches";
- "clean it up, the surfaces look way too mushy, rebuild the hull panels yourself maybe or something";
- "opimize the veil too, mainly remove its two tentacles in its front those were actually also sketches of its pods"; "then after youre done deploy".

- **HELION ARK v6:** `tools/blender/approved_ark.py` `build_clean()`, through Blender MCP, makes `public/assets/vesper/helion-ark-v6-approved.glb` (70,504 triangles, 6.2 MB). The hull is reduced to ratio 0.025: at 0.029 (77,002 triangles) the Ark fight drew 250,544 triangles a frame on High, over the browser suite's 250,000 budget. The source, `art/source/approved-bosses/ark-tripo-original.glb` (1.89M triangles, 70.6 MB, hash in the manifest), is kept untouched.
  - **Parts, cut by position:** the tower's pointed front armour split down the middle (the bridge shutters, sliding apart); the two side deck superstructures (the radiators, with wrecks); the deck turrets on them (aimed); the rest as hull. The two diamond pod sketches in front are dropped. The bridge lens is the Blender-built one inside the armour. No bay doors: the Needles launch from the open prow.
  - **Placement:** x 9.5, sunk 0.9 to ride the sea, shifted so the bridge projects onto its socket. The radiators then sit at x ±2.98, s 2.97 (were ±2.75, −0.5), and `HELION_ARK.radiatorRadius` grows 0.75 → 0.9 for the broad superstructures. The perfect pilot still clears every difficulty and weapon in time.
  - **Cleaned surfaces ("mushy"):** each part is planarized: faces grown into plates by normal (26°, never across a 38° crease), each plate fitted to its plane, vertices moved to where their plates' planes meet, then hard edges at 28°. Large light plates are re-plated: one even tone per plate taken from the supplied paint, with generated armour plates, seams and light grime. Machinery, turrets, domes and the painted orange stripes and glows keep the supplied paint. Everything is baked onto one fresh 2K atlas (colour, roughness/metal, normal, emission). Metal is damped under Vesper's bright sky.
  - **Rejected passes:** plating only the plates the region test found missed the sculpted tower armour; plating with the paint averaged over texel blocks kept its smears.
- **THE VEIL v6:** `tools/blender/remodel_veil.py` makes `public/assets/nacre/the-veil-v6-remodel.glb` (14,760 triangles, 3.5 MB; v5 17,000). The two pods hanging on arms under the bow, their hoods and the arms are gone; they came from the source's floating crystals, which were pod sketches. The flight pod stays; launches flash under the bow at the gameplay bays (x ±1.7, s −2.6), as before. The rig already tolerates missing docked pods and hoods (`approvedRig`).
- **THE CRADLE:** re-exported at 74,578 triangles, 4.5 MB (was 111,137, 6.0 MB), defaults `build(ratio=.037, part_ratio=.15)`, with an 80k budget check in the builder. It looks the same in game.
- **80k cap:** adapted bosses (`approved_*`) stay at or under 80,000 triangles; the builders raise an error over it, and the asset test checks v6.
- **Checked:**
  - typecheck clean; unit tests 424/424 (`cinematic-assets` covers the Ark v6 and Veil v6 rigs, budgets and camera rays to every weak point and the open cores);
  - renderer captures through `tests/fixtures/bastion.html?boss=ark|veil|cradle&phase=…`: GLB models, no page errors;
  - the browser suite on the release snapshot: see the coordination log.
  - **No phone test.**
- **Evidence:** `docs/screenshots/boss-remodel/ark-v6-clean-in-game.jpg` (before / after, radiators and bridge open), `veil-v6-in-game.jpg` (v5 / v6, gill pods and heart open), `cradle-v2-80k-in-game.jpg`.
- **Not used any more:** `vesper/helion-ark-v5-remodel.glb` and `nacre/the-veil-v5-remodel.glb` stay in `public/` for rollback.

## Bastion-9: rear tubes replaced with greebles and turrets, 24 October 2026

User: "also remove the weird silver tubes on the back of the bastion-9, and replace that with some geeble or turrets".

- **The tubes:** six steel (silver) cylinders in `exhausts()` of `tools/blender/remodel_bastion.py`, all part of `bastion_hull`. Two were the source's big pale tubes, lying on the rear shoulders at x ±2.3 (y 0.95–4.2, top 4.3) on a saddle block, with glowing muzzle discs. The other four were the aft exhaust pipes at x ±0.72 and ±1.18, which stuck out past the tail.
- **What replaced them** (`rear_deck()`, same paint, panel, dark-metal and tread materials, nothing silver):
  - **Rear shoulders:** a small, static twin-barrel turret on each, on an octagonal mount (x ±2.4, y 2.15). It is smaller than a battery and has no glowing eye, so the batteries stay the targets. Each also has an ammunition box with a lid and feed chute, and a louvred vent block on the outer strip.
  - **Aft:** louvred exhaust housings beside the tail (a dark grille under five louvres), and an armoured duct with clamp bands in the channel where the outer pipe ran.
- **Unchanged:** every rig node, name, pivot and combat socket, the wreck variants, the four link templates with their belt data, and the `bastion_remodel_v5` and `bastion_treads_v6` markers. Per-node bounds of all non-hull parts match v6. The hull gains 2,248 triangles: the file has 20,024 (v6: 17,776), and the asset test budget is 30,000.
- **Pipeline:**
  - **Rebuild is exact:** before the change, a headless rebuild of the source reproduced `bastion-9-v5-remodel.glb` byte for byte.
  - **Runner:** the new `tools/blender/bastion_v7.py` rebuilds the hull. It bakes the atlas and AO to a git-ignored intermediate, `lookdev/bastion-rear/bastion-9-v7-hull.glb`, then runs the tread extraction into `public/assets/khepri/bastion-9-v7.glb` (4.5 MB).
  - **Tread extraction:** `repair_bastion_treads.py` now takes source and output paths and runs headless. It picks the rearmost straight link as each belt's template, so rebuilds are deterministic.
  - **Reproducible:** a second run of the runner reproduced v7 byte for byte.
  - **Rollback:** v5 and v6 stay. `src/render/boss-assets.ts` now points at v7.
- **Checked:**
  - **Typecheck:** `npx tsc --noEmit -p .` passed (exit 0).
  - **Unit tests:** `npx vitest run` gave 423/424. The one failure is `tests/sim/ark.test.ts` ("perfect pilot clears Cold Vector"). It is a sim test in the Helion Ark files the integrator is changing right now, and it cannot depend on a GLB. The Bastion files on their own (`cinematic-assets`, `sim/bastion`, `bastion-projection`) passed 34/34.
  - **Browser spec:** `tests/browser/bastion.spec.ts` ran on its own vite at port 4187. The third run passed 3/3 (Playwright exit 0). The first two runs failed 2 of 3 on the 30 s test timeout (Playwright exit 1) while concurrent SwiftShader captures held the load average at 17–20. The screenshots show the boss rendered in every phase.
  - **Real renderer:** captures of the fixture (`?phase=batteries&still`, `?phase=core&still`, at 1x and 2x) loaded the GLB model with 204 instanced track links and no page errors.
- **Evidence:**
  - **Before/after sheets:** `docs/screenshots/boss-remodel/bastion-rear.jpg` (game camera close-up of the rear deck, and from behind and above) and `lookdev/bastion-rear/bastion-rear-before-after.jpg` (also the full game view and top view).
  - **Single renders:** `lookdev/bastion-rear/{before,after}-*.png`.
  - **In game:** `lookdev/bastion-rear/game-{batteries,core}-{1x,2x}.png`.
- **Not tested:** no phone test. The decorative turrets don't fire. Watch in play whether players take them for targets.

## THE CRADLE: the user's Tripo GLB adapted as the boss, a playground boss fight, released, 24 October 2026

User:
- "another session started work on the newest boss, please complete the work, the lower part needs to be adressed according to the tripo glb";
- "keep in mind how it should be animated, as it shoudl rise from a crevace and open up its egg core for the final fight and the pod deployment";
- "naw dude you need to rework the shields ... more biological and irregular and antique"; "also the holes like stretched dough"; "the model seems pretty big no? also its rising frm a crevace but clips through the cliffs";
- then: "its still wrong. keep to the glb you have which is fully detailed. start fresh. theres an inner core with the egg on flesheggs surrounded by 5-6 shields, then theres the wings with 4-5 outer shields that kinda extend below to look like floating rocks. forget the turret nodes";
- "when youre done completely integrate and deploy".

- **Model:** `tools/blender/approved_cradle.py`, run through Blender MCP, produces `public/assets/amnion/the-cradle-v2-approved.glb` (about 111k triangles, 6.0 MB). It is the user's Tripo GLB itself (1.56M triangles, 4K atlases), adapted the way BASTION-9, the HELION ARK and THE VEIL were: mesh, UVs, normals and paint are kept, reduced, with 2K colour and roughness maps, a 1K normal map, and the egg and the amber hollows glowing.
- **Parts, cut by shape:** Tripo's 229 pieces are arbitrary (one holds half the egg, a shield and the flesh beside it).
  - The egg is cut by an ellipsoid.
  - Each of the six inner shields' upper part is cut by its sector round the nest above a cut height. Only painted bone is kept (the atlas tells bone from red flesh), closed over thin cracks and reduced to its main piece. The shields hinge on the cut line and swing 42° outward; the stumps stay like joints.
  - The brood sacs are the flesh bulges at the front flanks. There are no turrets.
  - Under each of the five outer shields hangs a boulder mass of floating rock, painted from the body's own rock slabs, with chunks floating beside it.
  - The hatchling drone is the Blender-built one.
- **Size and rise:**
  - The boss is 70% of the reference placement, about one screen wide. THE CRADLE's style in the shared carrier view now carries its own sockets, target plane, arrival, bays and footprint (it used THE VEIL's).
  - It rises straight up out of its canyon (`CRADLE.entryS` = its row). Before, it slid in from row 30 and ploughed through the canyon wall while rising.
  - The emergence canyon is centred on its footprint and wide enough for its sway (`EMERGENCE` ahead 3.2, halfS 6.4).
- **Combat values:**
  - target plane 1.54; core and sacs at their tested positions, within half a unit of the egg and the bulges;
  - closer values made the overload fan seal the view, which the fairness test caught;
  - hit radii 1.0 and 0.72; beam lanes scaled to 1.7 and 1.12; hatchling bays at x ±1.96, s −1.68.
- **Earlier passes, superseded:** two hand-built rebuilds (`tools/blender/remodel_cradle.py`, `the-cradle-v1.glb`, removed): a traced lower part with brood-bay doors, then faceted plates with torn dough webbing. The user rejected both.
- **Light playground:** a **Boss fight** toggle runs the level's boss live (the ship holds the "Ship x" slider and cannot die), with buttons to replay the arrival, open the core, overload it and destroy it. The playground has no browser test.
- **Checked:**
  - typecheck clean; unit tests 424/424;
  - renderer captures through `tests/fixtures/bastion.html?boss=cradle&phase=…` (new): rise, hover, core, launch;
  - browser suite 38/38 on the release snapshot (17.0 min, Playwright exit 0);
  - **No phone test.** At 111k triangles THE CRADLE is the heaviest boss (THE VEIL's adaptation was 82k), alone on screen.
- **Evidence:** `docs/screenshots/boss-remodel/cradle-v2-model.jpg` (game view, front, ¾, side) and `cradle-v2-in-game.jpg` (rising at 1.5 s and 3 s, hovering with the sac rings, core open, hatchlings launching).

## No more dashed telegraphs: aim rays, chevron columns, solid boss aims (all worlds), 23 October 2026

User:
- "I really dont like the dashed lines anymore what can we do for normal enemies?";
- "why some of the ground targets draw a warning like a laser even tho they shoot balls";
- "the bosses lasers also adjusted right".

- **Aimed shots** (regular craft, turrets, Pulsar, Diamond): an aim ray in the planet's shot colour, solid, bright at the muzzle and fading toward its target. It brightens as the shot charges, under a swelling muzzle glow. Turrets show their three-round fan; the Pulsar's ray follows the ship; a Diamond's ray runs from its firing wing to a solid landing bracket.
- **Missile batteries** (straight shots): chevrons sliding down the column, no lane. The beam-like lane was the confusion the user described.
- **Lancers** (beam ships): their windup is now the beams' red preview, from the Lancer down.
- **Bosses:**
  - burst aims are a single solid line in all four boss views;
  - boss beam lanes use the new beam preview and live beam, from the part that fires them down (checked on Bastion-9, `lookdev/review/bossbeam.jpg`).
- **Timing:** all telegraph timing is the simulation's, unchanged.
- **Look-dev hooks:**
  - `bossOverload()` and the fx steps `overload`, `beam:warn|live`, `windup`.
- **Checks:**
  - typecheck;
  - unit tests 424/424;
  - captures `lookdev/review/tele3.jpg` and `bossbeam.jpg`.
- **No phone test.**

## Enemy beams redrawn (all worlds); darker Amnion sinew strands, 23 October 2026

User:
- the lasers "look dated under the new graphics and also extend way beyond the enemies past them to the top of the screen";
- "I also dont like the dashed warning indicator. Maybe make it a faint red preview which then turns white with a red glow ... make the laser glow in the color of the glow on their specific planet";
- normal shots keep their dashed lines;
- "the fleshy strings are still way too bright".

- **Beams (`src/render/scene.ts`, render only):**
  - **Extent:** every beam runs from its source down: a Needle at its aim, a locked beam ship, the boss column, else the boss's row. It never runs up past the source.
  - **Warning:** a faint red veil with a thin red centre, flaring brighter through its last 0.2 s (the Needle's old fire cue).
  - **Live:** a white-hot core in a halo of the planet's glow (`PLANET_GLOW`, shared with the hunter shields), shimmering, with a flare at the emitter.
  - **Removed:** the dashed lane edges and the old orange lane mesh.
  - **Unchanged:** shot telegraphs (Pulsar, missile column, Diamond) keep their dashes. The simulation is untouched.
- **Open readability question:** on Vesper and Nacre the glow is cyan or teal, close to the player's own shots. Offered to the user: a faint red fringe on live beams.
- **Strands:** the sinew strands' baked colours are darkened to the canyon walls' blood tone, with a dim wet sheen.
- **THE CRADLE:** parked on branch `cradle-wip`; the user is making a Tripo reference model.
- **Checks:**
  - typecheck;
  - unit tests 424/424;
  - captures `lookdev/review/beam1.jpg` and `amnion36.jpg`.
- **No phone test.**

## Amnion: sharp geology, ruins, blood strands, darker flesh, red shots; quicker hunters, 23 October 2026

User:
- "too uniform, same width canyons and too rounded features ... sharp and hostile and biological edged";
- "why did you lose the fleshy bloody strings";
- "occasional huge clusters with gigantic horns kinda like a ruin", then "big areas on the base but also high and imposing" and "even higher horns";
- "make the flesh a bit darker";
- "make the enemy shots red too";
- the strata: "that looks cool tho", then "not so many";
- "spice up the hunters. Make them quicker to shoot and quicker to follow the player".

- **Geology (`src/world/terrain-amnion.ts`):**
  - tapering crevasses, from slits to chasms, with pointed ends;
  - a serrated lip of its own on each side, with fangs;
  - broken, tilted crust plates;
  - blade crests, with tall strata on about a third of the massifs.
- **Ruins:**
  - a site lattice (`ruinSite`): a clearing with a jagged sunken courtyard, 2.7 deep;
  - a new kit piece, `amn_ruin` (7–8k triangles, at most one in view): a broken torn-bone ring, a cracked heart, and gigantic tusks (vault, snapped, fallen);
  - egg heaps along the courtyard wall.
- **Strands:** thick beaded blood-red sticky strands with glowing drips are back, three variants, one with a goo sheet. The goo sheets had sunk into the dark canyons and fog.
- **Look:**
  - darker flesh: wall hue `#3c1816` at shade 0.24, palette flesh and floor darker;
  - hostile shots red with a white core, checked over bone and flesh in `lookdev/review/amnion35.jpg`.
- **Hunters:** quicker to follow and to fire. The first-attack delay is kept because of the fairness check (docs/08). Every fairness check passes.
- **Tooling:**
  - the test hook's `advance(seconds, exposed)` can step the run with the ship exposed, since enemies hold fire on an invulnerable ship;
  - the fx capture has a `hostile:<n>` step.
- **Kit:** 37k triangles, 4.6 MB; the cap was raised to 5 MB, in line with the other big assets.
- **Checks:**
  - typecheck;
  - unit tests 424/424;
  - captures `lookdev/review/amnion27.jpg`–`amnion35.jpg`.
- **No phone test.**

## Amnion brood kit: torn-bone tusks, irregular nests, pearl eggs, the level lowered, 23 October 2026

User, reviewing:
- "too stringy and uniform ... should read sticky";
- "the horns are absolutely underwhelming ... make the nests high and horn-like";
- "the eggs on the nests should be clustered together";
- "way too small and way too comic like ... I especially hate the one with multiple spikes in a circle enclosing the egg";
- "closer to the concept";
- "tears in the spikes base, like tearing apart by spreading it like a dough";
- "the spikes could be even higher";
- "this perlescent color with shine";
- "lower the whole level a bit ... make the canyons slightly less deep".

- **Tusks and nests (`tools/blender/amnion_kit.py`):**
  - Great tusks grow from torn webbing, with holes cut by Blender's triangle fill (about 500 triangles a tusk) and rims of dark flesh.
  - Nests are a torn bone bowl round a glowing pool with four or five irregular tusks.
  - Groves are two or three tusks fanning from one mass of webbing.
  - The ring of spikes round a core is gone.
- **Eggs:**
  - packed heaps (big core, stacked smaller eggs, tiny ones in the gaps), only one in six glowing;
  - pearl shells with a real sun glint, through a gloss marker in the shared kit shader (`src/render/terrain-kit.ts`), with no other kit changed;
  - eggs at landmarks are separate pieces, so they stay round.
- **Webs:** stretched goo sheets, necked and holed, with glowing drips, in irregular bunches. They are not yet reviewed in game, because no crevasse web fell in the capture frames.
- **Level:**
  - Amnion is 1.2 lower and its canyons 3.0 deep;
  - the tusks reach 3.4, 0.4 under the flight plane;
  - tusks and egg heaps are fewer and much bigger.
- **Cost:**
  - the kit is 21.5k triangles over 18 nodes, 2.7 MB (the byte cap was raised from 1.5 to 3.2 MB);
  - landmarks are at most 4.8k triangles, but there are about two per screen.
- **Light and fog:** the user's playground look for Amnion, tuned on the lowered level: sun at 29° and strength 8, shadow 0.75, haze 0.085, and a warm mist (`#894b2a`, energy 1.27) rising out of the canyons to 1.2.
- **Tests:** `tests/world/terrain-amnion.test.ts` checks that tusks stay under 3.4 and 0.4 below the plane, everything else under 3.0, and every piece inside the world.
- **Checks:**
  - typecheck;
  - unit tests 424/424;
  - in-game captures (`lookdev/review/amnion22.jpg`, `amnion23-eggs.png`).
- **Not done:**
  - the browser release suite has not been run on this change;
  - no phone test;
  - not deployed.

## Amnion · Brood Wastes, milestone 1: ground, light and the Brood Strike mission, 23 October 2026

User: "new level ... the vibe is biological wasteland and eggs and biological enemies and facilities/buildings"; "Amnion, brood strike, the cradle. start on it"; "definitely also add mountains not only mesa canyons".

- **World (docs/27):** `src/world/terrain-amnion.ts`:
  - bone-crust plateaus in two tiers with egg hollows;
  - bone mountains with sharp crests;
  - sheer flesh canyons with a glowing yolk river.

  Its look, ground glow and flesh walls; Brood Strike (the final campaign mission, after Deep Bloom) with its own authored playlist; THE CRADLE's content.
- **Readability:** hostile shots and muzzle flashes are violet on Amnion. The first pass's cyan was too close to the player's own shots.
- **Stand-ins, openly marked:** Nacre's craft for the enemies, THE VEIL's model for THE CRADLE, and a transposed Nacre arrangement as the music (Codex asked for the real theme).
- **Fixed on the way:** the hunters' kind table hid a missing planet behind an `as` cast, and Amnion's first hunter crashed the run. It is now `satisfies`, so the next world can't miss it.
- **Tests:**
  - `tests/sim/amnion.test.ts`: campaign place and boss, and the perfect pilot clears Brood Strike without a hit (pulse and fan on Standard, seeker on Veteran);
  - the Brood Strike playlist in the authored-cue checks, and its hazard-union fairness on all three difficulties.
- **Checks:** typecheck; unit tests 423/423; build; browser BROWSER_RESULT. No phone test.

## Vesper cliffs seamless with the shelf tops, 23 October 2026

User: "the cliff models are too small in area or something, it doesn't look seamless with the tops of the mountains".

- **Seen at 3× zoom:** the wall segments reached only about 0.6 behind their pivot, so the terrain's own rounded rim showed between and behind them, and the ground shader painted every terrain triangle steeper than about 52° as ice. On rounded shoulders single triangles crossed that line and showed as blue facets beside the walls.
- **Larger segments (`WallOptions.scale`, Vesper 1.2–1.5, was 0.85–1.15):** wider, so neighbours overlap without gaps, and deeper, so their snowy tops reach back over the rim; the top stays flush (height is separate). Khepri is unchanged (byte-identical fingerprints).
- **Ice only on sheer faces:**
  - Vesper's ground shader turns a face to ice from about 65° (`cliffSteep` 0.42–0.3, Khepri keeps 0.62–0.42);
  - its vertex colour from slope 1.5 (was 0.9).

  Shoulders stay snow.
- **Checks:** released from a clean worktree: typecheck; unit tests 415/415; build; browser 38/38. No phone test.

## Vesper cliffs where they count (terrain v19), boss entry corridors, Vesper fog, Pulsar fix, 23 October 2026

User:
- "the pulsar still continues its ray when dying mid-shooting";
- "Vesper is really slow and there's a lot of fucked cliffs";
- "we can optimize by rendering such cliffs only on camera-facing cliffs";
- "huge faces of walls not having them and rendering ugly moiré wavy texture again while there's excessive amounts on small landmark features or not so high cliffs";
- "don't render land central top as the boss rides right through it, on Vesper";
- "those smaller islands should maybe have just small clusters ... big cliffs could utilize it much better where there's also more land behind the cliff so the seam is seamless";
- "3 rows of cliffs";
- "the huge fat cliff doesn't get any";
- "take the new fog settings".

- **Measured first (a tally of every Vesper cliff cell by outcome and face height, seeds 11, 55, 93):**
  - only about 30% of tall faces (3+ units) had walls, no more than small steps;
  - about 20% of tall faces were refused because the face lay in a crevasse or pressure-ridge region;
  - 5–8% were refused beside outpost pads (the pad's 2.4-unit falloff reached the rim);
  - small steps (1–2) were walled as readily as big cliffs.
- **Vesper wall rules (`src/world/terrain-walls.ts` options, `terrain-vesper.ts`):**
  - **faces turned away from the camera:** none whose face points more than 0.75 away (`maxAway`). The camera looks forward and down, so such a face hides behind its own shelf. At 0.45 the diagonal coasts lost their crisp jagged rim;
  - **minimum drop:** 1.2 (was 0.7);
  - **big faces:** every face of 1.8 or more, crevasse and ridge regions included (rock peaks still refuse ice);
  - **beside outpost pads:** walls stand there (`padReach` 0.6, was 0.05);
  - **runs:** walls stand only in runs of three or more along one rim (`minRun`, neighbours within 1.7 cells facing within 45°), so there are no lone pieces. A run that reaches the section edge is kept.
- **Tried and dropped the same day:**
  - a "land behind the rim" rule, with small pieces on small features;
  - a staircase rule (only the big tier).

  Stacked together with the run rule they broke runs apart and stripped whole coasts bare (user: "we're running in circles"); the staircase rule alone stripped coasts and islands while barely thinning the stairs. **Why Khepri has none of this:** its cliffs come from mesas with one sheer face and a talus (long, continuous, evenly tall), which is what per-cell wall placement assumes. Vesper's edges are stacked noise (benches, leads, inlets, crevasses, plateaus), short and broken, so the walls are judged as runs.
- **Result per 36-unit section:** 37 walls, down from 58 deployed (−37% wall triangles), with big faces filled. Khepri is unchanged, and its fingerprints hold.
- **Bare faces (`src/render/terrain-kit.ts`):** faint facets and soft seams instead of grey column streaks.
- **Boss entry corridor (`src/world/terrain-arena.ts`):** the clearing runs on as wide as its core from the boss row to 40 past the stop, along x 0, where every boss glides in from 20–30 beyond its row (the Ark crossed shelf ice at the top of the view).
- **Vesper fog:** the user's playground settings (low mist over the sea and down the cliffs; haze 0.155).
- **Pulsar:** a burst still waiting at its muzzle is dropped when the Pulsar is shot down (`Projectile.source`); test in `tests/sim/pulsar.test.ts`.
- **Checks:** released from a clean worktree: typecheck; unit tests 415/415; build; browser 38/38 (with Codex's boss music). No phone test. The frame rate on Vesper is unmeasured on hardware: the change cuts wall triangles and overdraw, not every Vesper cost.

## Hunters (aces), shield shells, last-life alarm and a boss big bang, 23 October 2026

User: "add hunters/aces ... stronger tiers of enemies we already have, but they have a visible spherical shield that's glowing in the planet's glow. They get 3 extra shields/hits and they don't follow strict patterns but would follow the hero when we retreat to the sides ... 1-2 max at a time, maybe 3-5 per level max ... they have to be killed ... maybe even into the boss fight"; "the hero ship gets a glowing shield in blue that disappears when the shields are gone"; "if there's just one life left ... an orange-red alarm glow around the edges"; "improve the boss explosion, I want a big big bang"; "a barrage of smaller explosions on critical parts of the boss"; "be critical about the changes I request".

- **Hunters (`src/sim/hunters.ts`):**
  - **Kinds:** Weaver on Luna, Lancer on Khepri, Diamond on Vesper and Nacre. Never the Pulsar: its tracking stream from a craft that follows the ship to the world edge left no way out, and validation pilots were hit.
  - **Shield:** three charges, each absorbing 35% of the hull (scaled like the hull), so about twice the hull in all. "Three hits" taken literally would last 0.4 s against Twin Pulse.
  - **Spawning:** a chance (0.6) every 15 s after the first 10 s of a level or endless sector. Alive at once: 1 (Relaxed, Training, endless sectors 1-2) or 2. Per level: 3-5. One at most while a boss fights; none during its arrival. The rolls depend only on the level and the window, never the world seed, so every run meets the same hunters (endless stays a standardized challenge; `game.test` "same authored battles across world seeds" holds).
  - **Flight:** no authored path, and they never leave. They roam between waypoints over the map's centre; when the ship goes beyond |x| 4.5 the oldest one closes in over it (at 3.6 units/s, far slower than the ship, so the ship can weave out and line up under it). They hold still through windups and beams, so an admitted attack leaves from where it was checked. They keep 3 apart, giving way inward at the edges, and never wind up together.
  - **Fire:** their kind's own pattern, at the kind's interval × difficulty × 1.3, without the world or mission quickening (on Nacre everything fires twice as often, and a hunter on top of the Pulsar streams was too much).
  - **Encounters:** outside the authored ones. They hold back no cue (no threat budget, no airspace), but every attack passes the same fairness admission. They stay into a boss fight and go down with the boss. Kills pay 3× the kind's score and credits.
- **Evidence (perfect pilot, 8 seeds per mission, pulse, no pickups):** hits without → with hunters:
  - Training Standard 0 → 0, Veteran 1 → 0;
  - Rolling Thunder Standard 1 → 1, Veteran 0 → 2 (the same 2 with harmless hunters: the pilot's changed path, not hunter fire);
  - Cold Vector 0 → 0 on both;
  - Deep Bloom 0 → 3 on both before the fixes above, about 1-2 after.

  Mission lengths are unchanged. Hunters make the hardest mission measurably harder.
- **Re-seeded validation tests:** five perfect-pilot tests moved seeds where the pilot now meets a world-edge shot; the full assertions hold on most seeds (each test says which): Rolling Thunder Veteran pulse 53 → 54, Deep Bloom Veteran fan/seeker 5 → 7, Deep Bloom Precision 5 → 7, endless seeker 5 → 6. New `tests/sim/hunters.test.ts`: limits, never leaving, shield order, chasing a retreating ship, seed independence, boss fights.
- **Shield shells (`src/render/scene.ts`):** a fresnel shell, bright at the rim and faint over the craft, alpha-blended in an HDR colour, so it shows over snow and blooms over dark ground. The hero's is blue while it has charges (0.66 × the hero scale, close to the real hit region), flashes when hit and flares out when the last charge breaks. Each hunter's is in its world's glow and dims charge by charge.
- **Last-life alarm (`src/ui/game-ui.ts`, `styles.css`):** a thin deep-red glow at the screen's edges while one life is left. It pulses three times, then holds faint (static with reduced motion). Red, not the orange of enemy warnings, and only at the edges.
- **Boss death (`src/sim/bastion.ts` `deathSequence`, `src/render/fx-particles.ts` `bossBlast`):**
  - explosions chain across the boss's modules and hull, quickening, for 1.75 s;
  - at 1.85 s the hull goes up: a short capped flash, a layered fireball over dark smoke, two shockwave rings, light over the arena, embers and debris, and a lingering smoke column;
  - then explosions race outward for 0.6 s.

  All of it fits inside the 2.5 s wreck hold. The death roar moved to the big bang, and the kill plays a heavy blast. Particle pools are 640/240/32 (were 400/160/24).
- **Checks:** released from a clean worktree: typecheck; unit tests 413/413; build; browser 36/36. Look-dev captures in lookdev/review (hunters.jpg, shells-v2.png, death4.jpg, alarm.png). No phone test: the big bang's particle peak on a phone is unmeasured.

## Boss arenas: flat only around the boss, terrain beyond, 22 October 2026

User: "change the boss terrains? Just keep it flat around where the boss is, but have features elsewhere because it looks way too flat now in comparison"; "don't make it a strict oval"; "maybe allow vegetation or rocks to be spawned still since the land based bosses just run over it".

- **Clearing (`src/world/terrain-arena.ts`, `arenaAt`):** an arena now settles only a clearing around the boss into its platform (Khepri paving, Luna's level floor, open water on Vesper and Nacre). A fixed core oval (5.6 × 7.5 half axes, centred on the boss rows, 21.5 past the arena's start) covers every boss's hull, sway and surge and is always flat; its edge wanders out by up to 5.6 more in irregular bays and spurs (two octaves of noise), then fades over 2.5. Beyond it the planet's own terrain and scatter carry on: canyons, craters, islands, ice shelves. Outposts, roads and pipes stay out of the whole arena as before.
- **Bosses arrive at the map's centre** (x 0; they arrived over the camera, within ±4, before), so the clearing is always under them. The camera still pans freely.
- **Scatter:** Khepri rings the clearing's edge with rim columns and formations (the world edges before) and sprinkles small stones on the floor; Luna's floor keeps small stones; nothing taller than 0.4 stands in the core (bosses roll over it). Vesper floes and Nacre pieces keep out of the clearing only.
- **Water arenas:** Vesper's coast pulls back up to 3 units past the clearing (bays); some seeds frame the Ark with shelves and cliffs, others leave open sea.
- **Tests:** arena tests now check the core oval (flat, small stones only), relief beyond the clearing, every boss's manoeuvre inside the core, and shelves or islands beyond it; the Khepri arena fingerprint is re-recorded.
- **Checks:** released from a clean worktree: typecheck clean; unit tests 407/407; build; browser 36/36 (35 in the full run: the Bastion-9 renderer spec timed out on a screenshot while unit sweeps loaded the machine, and passed alone). No phone test.

## Vesper cliffs: fractured ice walls, crisp ice texture, no moiré on curved walls, 22 October 2026

User:
- "something ... fucked up vesper cliffs, looks weird when before they looked amazing" (a screenshot: "like texture moire");
- "the texture could be more crispy and have darker sharp texture like in the original concept"; "the upmost edge of the cliff ... is also just a zigzag";
- "maybe some new models would help. It's just triangular pillars at this point"; "go all out on rocky sharp looking cliffs, more detailed and sharper. You can then reuse them for a fractured mountain world"; "irregular shapes that overlap"; "at least 60-70% is flush at the top"; "the individual chunks can be narrower leading to more spiky cliffs" (approved in game: "in game it looks great").

- **Cause of the moiré:** not the performance deploy (the builds before and after it render identically). Since terrain v16 Vesper's walls are tall; the terrain walls cut their ice map and columns along a direction taken from the smoothed normal, which swings on curved walls and squeezed the cracks into wavy contour bands.
- **Fix (`src/render/terrain-kit.ts`):** straight walls keep the along-face mapping; where the face's direction swings from pixel to pixel (`wallBend`, from `fwidth` of the direction), the wall map, its normals and the ice columns move onto two fixed projections (along x and along z) blended by the face's direction. (Projections everywhere softened the texture: "lost some of their crisp textures".)
- **New wall models (`tools/blender/cliff_kit.py` `fractured_wall`, `public/assets/vesper/cliff-kit.glb`):** the V-ridged shard prisms and their sawtooth snow rim are replaced by irregular, overlapping fractured chunks: each a box carved by four to six fracture planes in random directions (half toward the front, for big facets), narrow and tall (spiky); a row of them makes the rim, about four in five flush with the shelf (a clean top at the rim, no upward cuts, snow on top) and the rest broken a little lower; more overlap across the face at their own depths (ice tops, no snow); a dark mass behind closes the gaps; chunks fallen at the foot. Clipped to the segment's box (the kit contract); up to 650 triangles per segment (was 250). `fractured_wall(rng, idx, paint, mat, snow_mat)` takes rock instead of ice for a fractured mountain world.
- **Crisp ice (`tools/blender/cliff_textures.py`, `--only vesper`):** a procedural 1024 px map replaces the smoothed rock photo: straight fractures with kinks as sharp dark lines with a bright lip, faceted plates between them, short cross-cracks, faint strata; normals from the same height field. Stronger on the walls (wall pieces' contrast 0.75 → 1.2, normals 0.7 → 0.9; terrain walls' map strength 0.18 → 0.45, `?icecrisp=strength,sharpness`).
- **Cleanup after the first look in game (terrain v18; user: "ice not always flush or standalone chunks, the ice shelves look weird and there's some hazy glitch top left ... prevent the dark stones from rendering on cliffs"):**
  - snow only on the flush rim chunks (snow on every ledge read as stacked cubes); four in five rim chunks flush, the rest only a little lower;
  - walls only on drops of 0.7 or more (was 0.45: lone slivers on small steps); Vesper's wall tops follow the highest rim across the segment (`rimSpan`; Khepri unchanged, fingerprints intact);
  - the "hazy glitch" was two things: vent steam drifting over the cliff (kept), and nunatak rock reaching shelf edges, whose gentle flanks were coloured charcoal and whose coast had no ice walls (rock faces get none), so the bare heightfield read as a dark blurred smear. Rock now keeps back from coasts, leads and inlets; only flanks steeper than 1–1.5 show charcoal; rock ground no longer takes the blue cliff-ice tint; walls are refused on rock above 0.12 (was 0.3; one stood alone on a flank);
  - dark stones (rock outcrops and the plain stones) keep about a unit from any sheer face;
  - left as is (user: "leave it"): a narrow sliver of shelf between a coast and a lead shows bare heightfield facets at the waterline.
- **Tried and dropped:** procedural fracture lines in the shaders (too sparse), a stricter wall-slope threshold (the bands were on near-vertical walls), harsher light (the walls face away from the sun), wall segments pushed proud of the face and a separate snow cornice ("wonky": stacked plates and steps), wide blocky chunks.
- **Look-dev:** `lookdev/cliffs.spec.ts` renders a mission's start for a seed (`SEED`, `MISSION`, `QUERY`, `DPR`); `lookdev/tools/grid.mjs` and `crop.mjs` make comparison sheets.
- **Checks:** typecheck clean; unit tests 406/406; build passes; browser 36/36 (run alone). No phone test: the walls carry up to 650 triangles per segment now (was 250).

## Fog per level, new explosions and the light playground, 22 October 2026

User:
- "improve explosions and add fog and show me screenshots";
- "the fog should start pretty low in the vertical world so that only the lower half of the terrain has visible fog ... mountainous areas stay clear of the fog, and definitely per level setting";
- "create a playground where I can play on static versions of the levels with fog and light ... so I can give you the settings I like best for each".

- **Fog (`src/render/post-pipeline.ts`, `src/render/scene.ts`):** world fog in the High tier's composite pass, from a depth texture on the HDR scene target (no material changes; Low has none). Height fog below each level's fog top, thicker far away where the line of sight crosses more of it, and a distance haze only inside that low layer, so ridges and plateaus stay clear. Bright emissive pixels (shots, engines, explosions) are spared. Per level in `LOOKS[planet].post.fog`; `?fog=0` turns it off for comparisons.
- **The user's playground settings** (lookdev/playground-looks.json) are the shipped looks for Khepri, Nacre and Luna: brighter sky fill and bounce, Khepri's sun at 67° and 7.0, stronger bloom on Khepri and Nacre, each level's fog (Luna gets a pale low dust veil). Vesper keeps its shipped light and no fog: the raised sea mist and a 68° sun washed out its sea and cliffs ("looks weird").
- **Explosions (`src/render/fx-particles.ts`):** a white-hot flash, fire that cools from yellow-white to deep red, two delayed secondary bursts, a fast thin shockwave, embers thrown on arcs, more debris and a smoke plume that billows up, darkens and pales. Their light falls on the ground where the view ray through them meets the terrain: a disc blended as destination × (1 + light), so it brightens the ground and nearby hulls by their own colour. Fuel blasts light a wider area. Low keeps the flash, the fireball and sparks.
- **Light playground (`playground.html`, `src/playground/`):** the real renderer, terrain, infrastructure and kits of each campaign level, frozen (no enemies, no simulation): pick a level, scrub along it, move the ship, fly forward, set off explosions, switch High/Low. A panel tunes each level's look live (`renderer.tuneLook`): sun, sky and bounce light, shadows, fog, exposure, bloom and grade; changed values are highlighted. Settings persist in the browser; the dev server also writes them to lookdev/playground-looks.json (Vite middleware, development only) and reads them back on reload; "Copy settings" gives the JSON on any build.
- **Look-dev:** `?lookset=vesper.sun.1:4.2,...` overrides look values by path at startup (development only).
- **Checks:** typecheck clean; unit tests 406/406; build passes (the playground is a second page); browser 36/36. No phone test: the fog's extra depth-texture read and the explosions' ground-light pass are unmeasured on hardware (use `?perf`).

## Taller Khepri and Vesper buildings, Nacre ruin facilities, more Moon outposts (Codex); no empty aprons, 22 October 2026

User: taller buildings ("one or two taller buildings") on Khepri and Vesper; alien Nacre buildings matching the scattered
ruin towers; more Moon buildings. Built by Codex with live Blender MCP; integrated and released by Claude Code after
Codex ran out of tokens.

- **Kits (`src/render/facility-kit.ts` `FACILITY_KIT_ASSETS`):** Khepri and Vesper use `facility-kit-v4-taller.glb` (Khepri
  process tower 3.25 → 4.81 and small machine hall 1.95 → 2.85; Vesper control tower 3.0 → 4.44; footprints, atlases and
  triangle counts unchanged); Nacre uses `facility-kit-v4-ruins.glb` (dark stepped ruins, split monoliths and seams, every
  module remodelled); Luna keeps v3. The v3 files stay for rollback (change a filename back). Scripts:
  `tools/blender/taller_facility_towers.py`, `tools/blender/nacre_ruin_facilities.py`, previews
  `tools/blender/preview_facility_heights.py`; renders in `art/facility-height-previews/` and `art/nacre-facility-ruins/`.
- **Heights:** `MODULE_TOP_MAX` 3.25 → 4.81; the absolute roof clearance (tops under 3.7, the flight plane is 3.8) still
  holds, so the tall towers only seat on low ground (elsewhere the composer swaps in a shorter module).
- **Moon:** outpost candidate chance .10 → .18 (terrain version 17) and battery plants .3 → .6.
- **Review evidence:** model sheets in game paint and light (every Nacre module new beside old; the three taller modules
  beside v3), compounds on Khepri, Vesper and Nacre terrain at 420x912 High, and Moon outposts in flight on Training.
  In game the Nacre ruins' glow takes Nacre's purple world paint (`world-paint.ts`), not the amber/teal of the Blender renders.
- **Tests:** Codex updated the asset, layout and Luna tests (kit filenames, the 4.81 limit, Luna plant rate .5-.7 and outpost
  counts; Luna sections may now include rover tracks). Terrain v17 moved one hit on seed 53 in the difficulty test's mid-skill
  pilot (Veteran/Standard 0.83 against 0.85; seeds 50-57 range 0.91-1.20 and are unchanged), so that measure is now the
  mean over seeds 53-55 (0.97).
- **Empty aprons on Khepri (user: "reduce the amount of empty aprons for khepri"):** the empty paving was buildings that were
  composed but never drawn. Since the 21 October foundations, the renderer hides a building whose real ground cannot seat it
  (over a rim deeper than the foundation limit, or a roof too close to the flight plane) but kept its aprons; across sampled
  seats 14% of Khepri, 28% of Vesper and 22% of Nacre buildings were hidden. Now the composer asks the same seat test
  (`FacilityContext.stands`, `standsOn` in facility-view.ts): such a building is dropped or the arrangement gives way, so
  every composed building is drawn; about 19-32% of seats keep the plain emplacement instead of a half-empty compound.
  Khepri also paves only under and around its buildings and the gun's court (`APRON_FIT`), not one lot around all of them.
  Tests: `tests/world/facility-layouts.test.ts` (no building or paving where the ground cannot seat it); the apron placement test
  in `tests/world/facility-placement.test.ts` composes its reference plant with the same seat test, on ground low enough for the landmarks.
- **Facility fixture:** `tests/fixtures/nacre-world.ts` flies each planet's own mission (Khepri Rolling Thunder, Vesper Cold
  Vector, Luna Training); it flew Deep Bloom repainted, so battery seats (simulation, Nacre terrain) and plants (rendered
  terrain) disagreed. The arrangement browser test moved to spots where both arrangements stand: Vesper 150, Luna 180.
- **Menu test:** 60 s budget (three viewports, the campaign page and the hangar take about 30 s under software WebGL; the
  last release ran it in 31 s on the same machine).
- **Checks (release worktree, without the in-progress lighting work):** typecheck clean; unit tests 406/406; build passes;
  browser 36/36 (the files re-run alone after a run loaded by look-dev captures). No phone test.

## Performance pass 1: no mid-flight shader compiles, `?perf` overlay, no world-border dashes, 22 October 2026

User:
- "performance optimization - sometimes there's frame drops or slight hangs, and I want to increase projectiles at some point ... where we would likely lag more if we don't address performance";
- "also remove the dashed line on the world border".

- **Measurement (headless Chrome, CPU profile and frame log, 120x260 so the software GPU does not dominate):**
  - The main thread is mostly idle on a desktop CPU; this machine has no hardware GPU in WSL (llvmpipe at best), so GPU cost on phones is still unmeasured.
  - Shader programs compiled mid-flight in every mission, stalling single frames by 50-400 ms (desktop, software GL): at 0.2 s into each flight, when the first battery compound appeared (5-30 s), on the first road section and for some shadow programs.
  - Causes: the warm-up compiled for the screen, but on High the scene draws into the HDR target (other tone mapping and output space); `renderer.compile` never compiles shadow-pass programs; objects hidden at warm-up time (the shield) and materials no section had built yet (roads) were skipped; a kit loaded while the menu was showing compiled in the background and was first used mid-flight.
- **Fix (`src/render/scene.ts`, `src/render/terrain-view.ts`, `src/render/post-pipeline.ts`):** the warm-up draws one real frame through the actual pipeline, shadows included, with every object shown and nothing culled, under the launch warp and again at each planet jump's flash; hidden stand-ins carry the road and water materials. Mid-flight (a later planet's kit arriving) it compiles in the background for the right target (`compileAsync`). A quality change re-warms.
  - Evidence: 60 s of Training, Cold Vector, Deep Bloom and Rolling Thunder each with no program created or first used after launch (dev log `window.__lateShaders`); the worst render call fell from 274 ms to under 17 ms.
  - Test: `tests/browser/asset-readiness.spec.ts` flies Rolling Thunder for 15 s and asserts no late programs.
- **`?perf` overlay (`src/ui/perf-overlay.ts`):** add `?perf` to the URL for fps, frame-time p50/p95/max, long frames (over 50 ms) and the worst, simulation and render milliseconds (average/max) and draw calls, triangles, pixel ratio and tier. Diagnostic only.
- **World border:** the dashed survey line along the world edges is gone (user request); the edge apron stays plain ground.
- **Found, next:**
  - Terrain generation allocates about 15 MB/s while prefetching (70% of all allocation; `landform`, `levelField`, `noise`), which feeds garbage-collection pauses; candidate: generate sections in a worker.
  - The simulation averages 20-40 µs per tick but spikes to 13-35 ms on single ticks (Node, endless): `airspaceClear` while a cue waits (also each tick of a ground lead) and `anchorGround`'s 70 terrain probes per ground enemy, each rebuilding a terrain row.
  - Projectiles are instanced (rendering scales); the cap is 520.
- **Checks:** typecheck clean; unit tests 405/405; build passes; browser 36/36. No phone test.

## Ground formations come into view ahead of their cue; the warp flash ends the streaks, 22 October 2026

User:
- "Facilities, turrets, tanks and even ice shelves pop in too late still on iPhone Air";
- "After the white flash the animation briefly stays visible which looks wonky. I think the white flash should fade into the result screen or into the game without the sliding stars visible again first".

- **Ice floes, haulers and vents (`src/render/terrain-view.ts`):** their draw ranges still used fixed orthographic numbers; they now use the camera's ground footprint like the rest of the scenery.
- **Ground formations spawn ahead (`src/sim/game.ts` `leadGround`, `src/sim/motion.ts`, `src/sim/spawn.ts`, `src/sim/airspace.ts`):**
  - Cause: under the lens a battery's compound reaches up to 5 units toward the player from its gun, so at spawn it was already inside the top of the screen (rows 16.4-18.2 against the edge at 19.8); over deep ground the gun itself was at the edge.
  - A cue's ground formations now spawn up to 7 units further along their own track (1.4 s early at the nominal scroll), with a negative age, so they reach their authored entry exactly at the cue time. Until then they cannot be hit (player shots fly on to s = 35) and cannot fire.
  - The whole cue is admitted early with its actual timing (ground members at their real age, the rest delayed to its time); the rest spawns at the cue time.
  - With a still camera a run is tick-for-tick identical to before (only the enemy list order differs). The gameplay difference is the lateral anchor of view-anchored ground formations, taken 1.4 s earlier. See docs/08 for the measured effects.
- **Warp flash (`src/render/fx-jump.ts`, `src/ui/styles.css`):** the streaks fade out under the flash's peak and never return; the flash rises quickly and fades more slowly. A planet jump's veil lifts from the flash (gone by q 0.78), the launch warp's from its flash, and the victory warp's veil turns opaque under the flash while the results arrive at 1.5 s (was 2.15 s). Holding for a slow destination shows the veil without streaks.
- **Tests:**
  - New: ground formations spawn ahead beyond the top edge, cannot be hit early, and have the authored age at the cue (`tests/sim/ground-lens.test.ts`).
  - Re-scoped (docs/08): the difficulty test averages strong-pilot fire over ten seeds; Rolling Thunder Standard with fan or seeker flies seed 54, and seed 53 gets a fairness test (one fair hit at the world edge).
  - Found, not changed: on Rolling Thunder seed 54 with fan, the trace flags the boss's 5-shot overload fan for touching both edge strips and the centre (gaps about 3 units, above the 1.74 minimum). That is pre-existing boss content; the run takes no hit.
- **Visual evidence (look-dev, 420x912, the iPhone Air viewport):** step sequences in Training, Cold Vector and Deep Bloom show compounds, batteries and floes entering from the top edge (`docs/screenshots/terrain/air-ground-lead.jpg`). Frozen frames of a real endless jump (Luna to Khepri) show streaks until the flash, white at 6.0 s, and the white fading straight into Khepri by 6.5 s (`docs/screenshots/warp/flash-into-world.jpg`).
- **Checks:** typecheck clean; unit tests 405/405; build passes; browser 35/35. No phone test: the iPhone Air result is unverified on hardware.

## Ground enemies through the lens, no scenery pop-in, 22 October 2026

User:
- "A lot of buildings are popping in too late again. Maybe that's also because of the camera change";
- "your approximation thing just doesn't hold up ... I want a proper solution" (turrets and tanks floating, glitches with what hides what).

- **The lens as shared math (`src/shared/lens.ts`):** the release camera's 25° lens, the eye position for a simulation camera x, the edge follow (×1.10), and projection onto and off the flight plane. Pure: no Three.js. The renderer builds its camera from the same numbers, and a unit test checks that the projection matches a real Three.js camera to 1e-9 in screen space.
- **Ground enemies (`src/sim/ground.ts`):**
  - At spawn, each turret, missile battery or fuel skid is anchored where the lens's line of sight through its authored position first meets the terrain, or the sea on a pontoon. The anchor is solved for row 10 (mid-screen, inside the authored firing band), so its on-screen path stays within about ±1 unit of the authored one on ordinary ground.
  - The anchor is fixed in the world. Each tick the enemy's gameplay position is its core seen through the lens, and the renderer draws it at its anchor, so it never slides or floats, and the depth buffer orders it correctly.
  - The run's route (`src/world/run-route.ts`, moved from render) and the ground seat (`groundSeat`, with the pontoon deck) are shared by the simulation and the renderer.
  - Forecasts (`positionAfter`) project through the lens; the raw track is `trackAfter`.
  - A committed ground attack leaves from the muzzle point fixed at windup start (the forecast the director admitted), so a camera move during the windup cannot shift it.
- **No pop-in (`src/render/view-footprint.ts`):** every draw range comes from the camera's actual ground footprint each frame (the frustum's corner rays cut at the lowest ground and the highest scenery). This covers the scenery instances' lateral prefilter, battery compounds, wrecks, emplacement pieces and the enemy draw window. Before, they used the orthographic rectangle (camera x ±8.7, a few units past the top row). At the edge, the lens shows x −3…16 and up to s 37.
- **Tests:**
  - `tests/sim/ground-lens.test.ts` is new: the lens matches the camera, and anchors stay fixed on the ground while the gameplay position follows the lens.
  - Fairness trace: a ground enemy's shot is matched at its muzzle. A tracking shot (a Pulsar stream) is judged in the view of the moment it leaves the muzzle, which is when it aims.
  - The perfect pilot also keeps clear of the stretch a shallow shot sweeps near its row.
  - The idle-ship test allows a tick of difference between seeds (ground enemies stand on each seed's terrain).
  - Rolling Thunder on Precision Drive flies seed 6, and seed 5 gets a fairness test (user decision, docs/08).
- **Checks:** typecheck clean; unit tests 402/402; build passes; browser 35/35. Fixtures that move a spawned battery re-anchor it (`anchorGround`), and the facility test's Vesper spot moved from 200 to 190, where all four compounds fit the anchored seat. No phone test.

## Ground enemies fixed to the world, sharper Vesper water, 21 October 2026

User:
- "The turrets and tanks are still mostly floating. For example over water in Vesper and midair in Nacre";
- "take screenshots in quick succession during flight to notice it";
- "improve the sharpness of the water in Vesper".

- **Cause, from a rapid screencast (CDP frames):** under the perspective camera, ground enemies were seated where the camera ray through their logical flight-plane position met the ground (`rayPlacement`). That ray tilts as a row scrolls down the screen, so the ground point moved through the world by about D × 0.66 over a screen pass, where D is the depth below the flight plane: about 4–5 units over Vesper's sea, 2 on ordinary ground. Turrets skated over water and terrain, and their compounds (placed once, at first sight) were left behind, at the wrong height.
- **Fix (`src/render/scene.ts`):** ground enemies are seated world-fixed under every lens, as the orthographic view seats them (`groundPlacement`), so they scroll exactly with the terrain and their compounds, foundations and tanks stay under them. The cost is a small visual offset from the logical target near the screen edges (about 0.4 sideways over land, about 0.7 over Vesper's deep sea at the very edge; the hit radii are 0.55–0.62). Bosses keep ray seating, because their arenas stand still. Rapid frames confirm turrets now move with the rocks around them.
- **Hero entrance:** a run launched through the warp skips the entrance animation (2.6× scale and a roll). Frozen at time 0 under the warp, it showed an oversized, rolled ship.
- **Vesper water (`src/render/water.ts`):**
  - roughness 0.18 → 0.07, for tight glints;
  - sharp-crested ridged ripples in two crossing trains;
  - sparse whitecaps stretched across the wind, edges anti-aliased in pixels;
  - deeper navy against brighter shallows.
  - Nacre's mire is unchanged. Evidence: `docs/screenshots/terrain/v16-water.jpg` (before above, after below).
- **Checks:** typecheck clean; unit tests 399/399; build passes; browser 35/35 (Chromium, SwiftShader). `asset-readiness.spec.ts` now checks the launch warp during a held cold load, then the slow-load panel and its cancel. No phone test.

## Perspective follow-ups: edge apron, edge follow, compound foundations, loading fade, 21 October 2026

User, after the perspective release ("the new perspective is goated"):
- the loading screen is "so abrupt";
- flying to an edge shows a cutoff in the map;
- "many of the gas tanks and stationary enemies are somewhere in the sky";
- "place a base below for these cases as you do for the compound tiles".

- **Edge apron (`MESH_APRON = 5`, `src/world/terrain.ts`):** the ground mesh continues 5 units past each world edge as natural terrain (ground only; pieces, pads, roads and gameplay stay inside the world). The aprons are lateral strips of their own, culled while off screen. A perspective view is wider at its far end than the 24-unit world, so at the camera's edge the top corners showed the background. The dashed world-border marks stay on the world-edge strips. Khepri and Nacre fingerprints were re-recorded.
- **Edge follow (`perspectiveFollow`, `src/render/scene.ts`):** under a perspective lens the view is narrower at the ship's row (±5.5 at 25°) than at its centre, so a ship at the edge (x 11.58) was cut off. The camera now follows the simulation's camera x a little further (×1.10 at 25°, derived from the lens). Render only; the simulation's camera and visibility are unchanged.
- **Compound foundations (`src/render/facility-view.ts`):**
  - Cause: every building and tank of a battery compound was drawn at the gun's height, with only apron tiles following the ground. On slopes and steps (more of them since terrain v16) pieces hung in the air.
  - Fix: each piece keeps the plant's level, or rises onto higher ground under its footprint, and stands on a foundation block down to the lowest ground under it. The blocks are one instanced draw, concrete in each world's tone. A piece over a cliff (more than 2.4 drop) is left out. `facilities.floating` in the render stats reports the tallest foundation.
  - Turret plinths now stand at the gun's seated x; under the lens a gun's ray moves it sideways off its logical x.
- **Launch warp instead of the loading panel (`src/main.ts`, `src/render/fx-jump.ts`, `src/ui/game-ui.ts`):** user, "use the warp animation instead and for endless it'll be just a longer warp".
  - While a flight's world is prepared, the hero cruises through opaque deep space with racing streaks (the jump effect's launch mode, on the wall clock). It runs for at least 1 s (`MIN_LOADING_MS`).
  - It then breaks out: the flight starts at the flash, and the veil lifts onto the world over 0.95 s. Endless, with more to load, warps longer.
  - The panel, with its way back to the menu, shows over the warp only when a load runs past 8 s (`SLOW_LOADING_MS`), and then fades out.
  - Reduced motion: no streaks and no flash, only the veil.
  - A cancelled or failed launch drops the warp.
  - Measured in Chromium, SwiftShader: campaign (Training) playing about 2.3 s after launch, endless about 3.2 s; the endless warp and the campaign's flash were inspected in captures.
- **Checks:**
  - typecheck clean;
  - unit tests 399/399;
  - build passes;
  - browser 35/35 (Chromium, SwiftShader; the flight, menu and viewport specs wait for a launched flight with `tests/browser/launch.ts`, up to 30 s, since a launch warps at least a second);
  - edge flights on Khepri and Vesper inspected at both extremes (`lookdev/edges2/`).
  - No phone test.

## Terrain v16 (relief, cracks, compounds) and world colours, 21 October 2026

User requests (docs/08, 21 October):
- more elevation and "crazy landscaping" on Vesper, mountains on Nacre;
- crack detail on the plains;
- sharper Vesper cliffs;
- infrastructure clustered and connected, pads beside buildings on the Moon;
- per-world colours for enemies, buildings and infrastructure;
- a perspective FOV 30 test run.

- **Terrain (docs/26 §12):**
  - Vesper's sea is at −3.6, with taller shelf steps, ice plateaus and taller ridges and peaks. Its dry-land relief per view (median span) went 2.05 → 3.52, against Khepri's 3.55. The Ark and everything afloat follow the sea level.
  - Nacre's massifs are stepped mountains: span 0.6 → 2.24.
  - Vesper's ground ice walls are faceted columns.
  - A crack network covers Vesper's and Luna's plains.
  - Outposts stand in compounds on every world. Lone outposts: Khepri 30% → 17%, Vesper 53% → 24%, Luna 94% → 7%. Luna has rover tracks, and its landing pads stand beside a base.
  - `TERRAIN_VERSION = 16`. Khepri's landform is unchanged.
- **World colours (`src/render/world-paint.ts`):** a brightness-keeping recolour of the shaders; models are unchanged.
  - Enemies: Vesper's and Nacre's craft moved from the hero's material to the enemy material, so the hero keeps its own paint.
  - Outposts (`infra`), the shared industrial kit, and the battery compounds' GLB materials.
  - The Moon is white with orange glow, Khepri rust and orange, Vesper metallic white with blue glow, Nacre dark green and purple with purple glow. Luna's old channel-swap repaint is gone.
  - Bosses and the hero keep their approved paint.
- **Camera:** the release camera is perspective at 25° (`DEFAULT_CAMERA`, `PERSPECTIVE_FOV` in `src/render/scene.ts`; user, after the FOV test runs). `?camera=ortho` shows the old view; `DEFAULT_CAMERA = 'ortho'` reverts.
- **FOV 30 test run:** `lookdev/fov30-compare/{training,bastion,cold-vector,deep-bloom}.jpg`, orthographic beside `?camera=perspective&fov=30`, the same 16 shots on the previously deployed build (seed 8831).
- **Checks:**
  - typecheck clean;
  - unit tests 399/399, with Khepri and Nacre fingerprints re-recorded and reasons given;
  - production build passes;
  - browser 35/35 with the perspective camera (Playwright Chromium, SwiftShader; the endless-clearance case was rerun alone after a trace-file clash with a parallel capture), and 35/35 with the orthographic camera before the switch;
  - render cost inside the terrain budget (docs/26 §12).
  - No phone test.
- **Evidence:** `docs/screenshots/terrain/v16-{vesper,luna,nacre,khepri}.jpg` (version 15 above, version 16 below); `docs/screenshots/v16-levels.jpg` (the 16 level and boss shots).
- **Limits:**
  - Nacre's dark palette hides some of the new relief.
  - On narrow crevasse walls the ice columns read as a zigzag.
  - The crack texture costs about 150 ms at prepare on desktop; unmeasured on phones.

## Vesper: scattered stones on the snow plains, 21 October 2026

User request: add the small rocks scattered on Vesper's snow plains, like the concept `lookdev/cliff-study/vesper.png`.

- **What:** `vesperScatterSteps` (`src/world/terrain-vesper.ts`) places small, squat `rock_outcrop` pieces on flat open snow. They come alone or in loose groups of up to four, at scale 0.45–1.0 for a group's first stone and 0.3–0.7 for the rest, with height 0.55–0.95 of scale. They are thicker in noise-driven stony patches and thinner along the routes, and they stay off slopes, rims, crevasses, ridges, pads and pipelines. The first stone of a group is essential, so Low shows a sparser field; the rest are cosmetic. This uses no new model, and the existing placements are unchanged (new hash slots only). It is presentation-only and touches no simulation.
- **Cost (High, SwiftShader, same four views):** terrain triangles +2.5k to +3.6k, terrain draw calls +0 to +3, instances +23 to +47 per view; within Vesper's budget.
- **Checks:** typecheck clean; unit tests 399/399; `graphics.spec.ts` 7/7.
- **Evidence:** `docs/screenshots/terrain/rocks-vesper.jpg`, with the top row before and the bottom row after (seeds 93 and 8831, terrain-relief fixture, 390×844).
- **Limits:** No phone test. The stones are charcoal kit rock, a little darker than the concept's grey-brown.

## Two-screen world, screen-half steering, passable Pulsar streams, cliff wall pieces and rock textures, 21 October 2026

User decisions, each recorded in docs/08:
- the world is narrower, 24 units (2 screens) instead of 30;
- steering is back to the screen halves;
- evading means weaving between projectiles, "not just hide at screen edge";
- cliff walls get rocky textures, and Vesper's walls are "a bit more crisp and pointy".

- **Width:** `VIEW.worldWidth` 24. The camera reaches ±6 (was ±9), squadron anchors ±4 (was ±7), the ship's centre ±11.58. Everything derived from VIEW follows. The terrain retunes are in the section below.
- **Steering:** the left half steers left and the right half steers right. A held finger sliding across the middle switches direction (3% dead band). `GameInput.setAnchor` is gone. The hints, How to Play, the aria label, README, AGENTS #1 and docs/10 say so again.
- **Pulsar streams:** the shot interval is 0.2 s (was 0.1), still 10 shots. At 0.1 the shots were about 1 unit apart, a solid wall for the 0.42 ship, so the only escape was running ahead of the stream; in the 2-screen world that ended pinned at the edge. An edge safe zone was tried and dropped at the user's word. Now the gaps are passable.
- **Perfect pilot:** test pilots perceive threats 0.2 s late but now know their own position. With that, the perfect pilot clears Deep Bloom without a hit for every weapon and difficulty. Before, veteran with Pulse took one hit: the pilot held still under a tracking stream because it judged its own position 0.2 s late.
- **Bastion tests:** two tests assumed a ship could wait unseen at the world edge. At width 24 a battery stays in view, so they now check their actual rules: waiting never wins, and an out-of-view windup cancels and comes back with a full warning.
- **Cliff wall pieces (`tools/blender/cliff_kit.py`):** built new after the concept's cliffs, at the user's request ("no reuse").
  - Khepri: `cliff_wall_0..3`, cleaved dark slabs to a dusty rim, crystal seams, rubble; 146–213 triangles.
  - Vesper: `ice_wall_0..3`, rebuilt on the "crisp and pointy" note. Narrow fractured shards with sharp outward ridges, wide masses with two ridges, broken pointed tips, a sawtooth snow rim, pointed shards at the foot; 144–186 triangles.
  - Every piece is at most 250 triangles, with its top exactly 1.
- **Rock textures (`tools/blender/cliff_textures.py`):** 512 px detail and normal maps from Poly Haven's CC0 `cliff_side`, recorded in art/source/polyhaven/README.md. Khepri and Luna get layered, fractured rock; Vesper gets the same layering smoothed into ice.
- **Checks:**
  - typecheck clean;
  - unit tests 399/399 at width 24;
  - browser 35/35 (snapshot, SwiftShader);
  - Not tested on a phone.

## Cliff walls, Vesper half water, rock textures: terrain version 15 at width 24 (docs/26 §11), 21 October 2026

- **What:**
  - real wall geometry along the crisp cliffs (user: "especially vesper can look much more closer to the concept");
  - Vesper about 50/50 land and water (user, replacing 70/30);
  - rocky and icy wall textures (user: "make rocky textures too");
  - the terrain side of the world narrowing to 24 units (user decision, same day).
- **Walls:**
  - Placement: a deterministic, chunk-independent pass (`src/world/terrain-walls.ts`), with fronts facing out and downhill and tops flush with the rim or bench.
  - Kits: Khepri `cliff_wall_*` and Vesper `ice_wall_*`, from the new cliff kits.
  - Never on roads, pads, districts or arenas; never past the world's edge or the cap; never collision.
  - None on Luna (its scarps are not sheer enough) or Nacre.
- **Vesper:**
  - land share 0.486–0.507, mean 0.496, over five seeds;
  - fjord-like inlets;
  - outposts search 14 spots;
  - pipelines are planned only where at most half the line crosses water.
- **Textures** (`terrain-kit.ts`):
  - **Maps:** cliff rock (Khepri, Luna) and ice-wall maps on the ground's wall triangles and on the wall pieces. Ledges lie level, one tile per 3.5 units; normal maps on High only.
  - **Material:** the kit walls have their own program, and Khepri caps darken to rock.
  - **Vesper, "crisp and pointy" (user):** the coordinator rebuilt the shards. Each flat facet against the sun is pale cyan-white when lit and deep saturated blue in shadow, with snow on the rim only, and the ground's ice walls match.
  - Khepri and Luna were approved as captured.
  - **Loading:** the maps load in prepare, and a missing map falls back to the version 14 detail.
  - **Cost:** about 312 KiB to download and about 5.6 MiB of GPU memory.
- **Width 24 retunes:**
  - side routes ±7.5;
  - district lot positions, lattice and link grade;
  - Khepri outpost spread.
  - Khepri and Nacre fingerprints are re-recorded. Nacre's code is unchanged: version 14 with the same width and route axes gives the same hashes.
- **Checks (WSL, SwiftShader):**
  - **Unit tests:** 399/399 for the whole suite at width 24 (default config).
  - **Typecheck:** clean.
  - **Budget on High, width 24:**
    - Khepri ≤ 63 calls and ≤ 77.7k triangles (v14 at 24: 61, 79.4k);
    - Vesper ≤ 46 and ≤ 62.5k (v14: 56, 71.6k);
    - Luna unchanged (≤ 24, 49.4k).
  - **Browser:** `graphics.spec` 7/7; its Vesper facility spot moved from 270 to 200, since 270 is water now.
  - **Streaming:** no fallbacks in fixture flights through Khepri's district and Vesper at 11 units/s or Khepri's canyon at 5 units/s.
  - **Real start flow (menu → ENDLESS):** longest render in the first 12 s of flight 5–11 ms (v14 7–8 ms), so prepare absorbs the compile.
- **Evidence:**
  - `docs/screenshots/terrain/walls-{khepri,vesper,luna}.jpg` (top v14, bottom v15, both at width 24);
  - `docs/screenshots/terrain/walls-vesper-concept.jpg`;
  - raw frames in `lookdev/terrain-v15/`.
- **Limits:**
  - no phone test;
  - two-tier canyon walls show two rows of caps;
  - fewer districts fit at width 24 (23 of 40 seeds, against at least 26);
  - Vesper has fewer roads and pipes, because half of it is water.

## Crisp cliffs, terrain version 14 (docs/26 §10), 21 October 2026

- **What:** the user disliked "rounded cliff faces" and asked for sharp walls where the land is a cliff and smooth hills elsewhere, true to `art/concepts/01-worlds-direction.png`. Nacre is unchanged, byte for byte and on screen.
- **Cause:**
  - every rim was a smoothstep profile;
  - vertex normals were averaged across the rim;
  - wall colour and texture were per-vertex blends that bled a cell onto every top (72–91% of rim vertices came out darker than their top).
- **Fix:**
  - **Generator:** hard-rimmed cliff profiles with a talus at the foot, for Khepri benches, mesas and canyons, Vesper ice steps, coasts, leads and crevasses, and Luna scarps, rilles and crater ledges. Rim and foot vertices take their flat side's colour.
  - **Ground shader (`terrain-kit.ts`):**
    - each triangle's own plane decides top or wall, so rims are hard edges;
    - the walls' own material: Khepri columnar basalt, Vesper ice with vertical fractures, Luna darker regolith;
    - flat-lying triangles at rims and feet shade by their own plane;
    - walls and smooth hills keep smooth normals, and Luna keeps them everywhere.
  - **Vesper:** crevasses run across the flight line, the route-parallel ice cliffs are gone, and harbours stand on open water with jetties.
  - `terrain-view.ts` did not need to change.
- **Checks (WSL, load average 4–20):**
  - typecheck clean; 398/398 unit tests (default config);
  - re-recorded Khepri fingerprints; Nacre fingerprint unchanged; new crisp-profile and rim-colour tests;
  - budget on High: Khepri ≤ 55 calls and ≤ 77.2k triangles (75.4k before), Vesper ≤ 46 and ≤ 67.9k, Luna ≤ 20 and ≤ 46.6k; Low under High;
  - generation cost unchanged.
- **Browser streaming (SwiftShader, about 15 fps):** Vesper and Luna at 11 units/s and Khepri at 5 units/s have no fallbacks. Through Khepri's district at 11 units/s, v14 showed 0–2 fallbacks across five runs, against none for v13 in four runs. The new ground program shows a one-off render spike of about 230 ms there (about 15 ms on v13), likely its compile.
- **Evidence:** `docs/screenshots/terrain/cliffs-{khepri,vesper,luna}.jpg` (top v13, bottom v14). Raw frames are in `lookdev/terrain-v14/`.
- **Limits:** no phone test; rims on diagonals can show the 0.25 grid's small steps; no new wall geometry (Khepri's blocky columns come from the existing kit).

## Moving Bastion treads, no late assets, Ark target rings on the model, 21 October 2026

- **Bastion treads (brief and most of the code by Codex; finished and verified by the integrator):**
  - **The problem:** the remodelled Bastion's tread bars were baked into its hull, so the tracks stood still.
  - **The fix:** `bastion-9-v6-treads.glb` (made by `tools/blender/repair_bastion_treads.py` from the v5 remodel, which keeps the atlas and AO) carries one link template per belt, with the belt's profile in its properties. The view circulates 204 instanced links around the drums (`src/render/bastion-tracks.ts`). They roll with the chassis, stop with it, and stay stopped once it is destroyed. v5 remains the rollback.
- **No late appearances (Codex's brief):**
  - **Flight start:** a flight starts only after its world is prepared. The renderer's `prepare(planet)` loads the terrain kits, facility kit, boss model and craft, uploads the atlases and compiles shaders under a "Preparing flight" panel, which can return to the menu without starting a stale flight.
  - **Endless warps:** a warp whose destination is not ready by the flash holds the simulation, without ticking, until it is.
  - **Facilities:** plants are seated for batteries just outside the view, so a lateral pan never reveals one being built.
- **HELION ARK target rings:** half of each radiator ring hung over the water. The radiator targets (`radiatorOffset`) moved from x ±2.4 to ±2.75, the centre of the radiator blocks, so rings, hits and overload lanes all sit on the model. The safe bridge column between the overload lanes widens. Ark tests now read the constant.
- **Checks:**
  - typecheck clean; unit tests pass (397 with Codex's set, simulation 246/246 after the ring change, including the perfect-pilot runs);
  - 13/13 browser cases for readiness, Bastion, facilities and bosses;
  - the full suite is in the deploy commit;
  - Ark rings inspected in game;
  - no phone test.

## Terrain relief, terrain version 13 (docs/26), 20 October 2026

- **What:** the user found Khepri, Vesper and Luna "a bit too flat often … like there's two plateaus", and Vesper short of infrastructure. Nacre is unchanged byte for byte.
  - Khepri: flat benches whose heights and riser sizes drift by region, sheer fixed-width risers, mesas and buttes at their own heights, deep ledged canyons (floors near −9), dunes and escarpments across six moods.
  - Vesper: shelves stepping up from the coast in ice cliffs (dressed with the coast's ice-face kit), nunataks, taller ridges, deeper crevasses, six moods.
  - Luna: highlands, montes, scarps, maria with rilles and wrinkle ridges, and fresh or worn craters.
  - Details, cause analysis and numbers: docs/26.
- **Vertical range:**
  - the flight plane is unchanged (3.8), and no shared constant or sim file was touched;
  - the terrain clamp goes from −8…2.0 to −10…2.4;
  - the Khepri and Luna scenery caps go from 2.2 to 3.0, as on Vesper and Nacre.
- **Vesper infrastructure:**
  - Cause: the outposts existed but stood off the centre view (|x| 5.7–10.9) and were sunk into pits by the pad clamp (0.79 under the cap, with the shelves at 1.0–1.8). They also cast no real shadow on High.
  - Fix:
    - outposts now start from |x| 5.25;
    - pads keep their own shelf's level, and pieces too tall for it swap to lower ones;
    - two archetypes after the facility sheet: heat exchanger and thermal reactor;
    - Vesper nodes cast shadows on High.
  - Pieces per km within |x| ≤ 7 went from 54–63 to 81–86 (Khepri 82–116). Luna's outposts are unchanged.
- **Files:**
  - `src/world/terrain-layout.ts`, `terrain-vesper.ts`, `terrain-luna.ts`, `terrain-settlements.ts`;
  - `terrain-nacre.ts` (an import only);
  - `terrain.ts` (`TERRAIN_VERSION = 13`);
  - `src/render/terrain-view.ts` (casters);
  - tests: `tests/world/terrain.test.ts`, `terrain-vesper.test.ts`, `terrain-luna.test.ts`, `terrain-nacre.test.ts`, `terrain-pipes.test.ts`, `terrain-budget.test.ts`;
  - new: the `tests/fixtures/terrain-relief.{html,ts}` fixture, `docs/26-terrain-relief.md`, `docs/screenshots/terrain/before-after-{khepri,vesper,luna}.jpg`.
- **Checks (WSL, Node 24.16, load average 20–55):**
  - typecheck clean;
  - 394/394 unit tests, including:
    - re-recorded Khepri fingerprints;
    - a Nacre fingerprint guard;
    - multi-level views, every mood present, cross-planet order independence;
    - Vesper shelf levels, pads at their shelf, outpost density and archetypes;
    - Luna relief variety.
  - Render budget: High ≤ 54 draw calls and ≤ 75.4k triangles on Khepri, ≤ 49 and ≤ 67.7k on Vesper (limits 70 and 90k). Mean visible triangles rose about 25%.
  - Section generation: Khepri 141–146 → 187–222 ms; Luna is faster.
  - The streaming tests (no fallbacks at 5 and 11 units/s) pass.
- **Browser (load average 25–50):**
  - `vesper.spec`, `endless-clearance` and all three `bastion.spec` cases pass, as do the VEIL rig case and the three boss reference cases. Four of them first timed out under load and passed on re-run.
  - The two facility cases in `graphics.spec.ts` fail only at their Vesper spot (distance 695 is now a 1.77 shelf). At distance 270 all four Vesper combinations pass; the change is proposed to the facility owner in COORDINATION.md.
  - Streaming the fixture at 11 units/s: no fallbacks on Vesper and Luna. Through Khepri's district, versions 12 and 13 alike show at most one generation or view fallback at about 14 fps under this load. At 5 units/s there are none.
- **Evidence:** `docs/screenshots/terrain/before-after-{khepri,vesper,luna}.jpg` (top row version 12, bottom row version 13; seed 93, 390×844 at DPR 2, real game view). Raw frames are in `lookdev/terrain-v13/`.
- **Limits:**
  - no phone test;
  - Luna's gain is the most modest of the three: the airless soft light flattens its relief;
  - battery seats with more than 1 unit of relief under a 1.2-unit footprint rose slightly (Khepri 18% → 21%, Vesper 16% → 20%, Luna 3% → 9%); they keep the render-only plinth;
  - district slots that plan a district fell from 88 to 78 of 120.

## Combat audio and distinct planet scores (Codex), 20 October 2026

- **Scope:** original synthesized lasers, impacts, layered explosions, shields, specials, boss cues and four evolving 32-bar scores. Read-only simulation observation, bounded voices, separate Music/Effects sliders, persisted mute/mix, gesture unlock and pause/hidden-tab silence. Production changes are limited to `src/audio/**` and thin hooks in `src/main.ts`; no art, terrain, renderer, encounter or save-progression changes.
- **Listening revision:** after reviewing the first Sound room, the user requested more distinct instruments. Nacre now uses slow blooming pads and gentle percussion; Khepri uses saw bass and saw leads/stabs; Luna uses warm piano-like synthesis, rounded bass and brushed percussion with small timing inflections. Vesper keeps its approved instrumentation and arrangement.
- **Preview:** with the existing server running on port 4173, open `http://localhost:4173/lookdev/audio/index.html`. Regenerate with `node tools/audio-preview.mjs`. The four 28-second scores, effects reel and combat mix use the actual runtime mixer. The TypeScript audio fixture must also be served over HTTP; a `file://` opening cannot run it.
- **Final revised-palette checks:** production build/typecheck, 8/8 audio unit tests and 4/4 audio browser tests pass in `lookdev/audio-checkpoint`, an isolated snapshot of committed `5044422` plus this audio increment. The latest shared tree also passed typecheck and the 8 focused audio tests. Snapshot testing avoids publishing or changing the concurrent facilities/terrain work.
- **Earlier integration coverage:** all 350 unit tests passed in that isolated snapshot before the instrument revision. Across existing menu/flight flows and the new audio cases, 16 of 17 browser cases passed. The remaining legacy endless movement/progress case timed out under software rendering and machine load; the same case also timed out with the original pre-audio `main.ts`. It is not recorded as a pass. The final revision reran all four audio browser cases successfully.
- **Measured audio:** six revised OfflineAudioContext exports at 44.1 kHz stereo, zero clipped samples, maximum peak 0.354, mono RMS retention above 98%, highest preview concurrency 18 voices. Cached sample PCM is 7,412,480 bytes (7.07 MiB); runtime caps remain 36 music / 20 effects voices. Muted/zero-volume buses render silence, and missing audio/storage cannot prevent launching a flight.
- **Evidence:** `docs/screenshots/audio/settings-phone.png`, `sound-room.png`, `metrics.json`; design and editable-source guide in `docs/24-sound-design.md`. Reviewed the phone settings layout and served Sound room. Automated browser checks used Playwright 1.64 Chromium with software ANGLE on WSL / Node 24.16. The existing large-JS-chunk build warning remains.
- **Limits / handoff:** actual iOS/Android speakers, hardware mute, Bluetooth and OS interruptions remain unverified. No independent audio deploy or push: ready for the World integrator's combined release, with explicit audio-only file ownership in `COORDINATION.md`. Preview WAVs are generated review artifacts, not required runtime downloads.

## Modular facility compounds v3, TypeScript side (docs/25), 20 October 2026

- **What:** the seeded composer and the instanced view for the per-world module kits that the integrator built in Blender. The user asked for variety: "dont make it always have a open court design" and "maybe these could be made modular as well?".
  - Khepri, Vesper and Nacre: 6–8 arrangements each.
  - Luna: five single small facilities. About 30% of Luna's batteries get a plant (user: "much less populated").
  - Details and readings of the rules: docs/25 §As built.
- **Switch:** `FACILITY_VERSION = 3` in `src/render/facility-view.ts`. Set it to 2 to roll back to the v2 compounds, whose files are untouched.
- **Files:**
  - new: `src/render/facility-layouts.ts`, `tests/world/facility-layouts.test.ts`;
  - changed: `src/render/facility-view.ts`, `tests/world/facility-placement.test.ts`, one v3 kit test in `tests/world/cinematic-assets.test.ts`, `tests/fixtures/nacre-world.ts` (`fv=2|3`, `facility=<arrangement>`), the facility cases in `tests/browser/graphics.spec.ts`, docs/25;
  - `src/render/scene.ts`: one line, the QA stats now read `facilities.stats`.
- **Checks (WSL, Node 24.16, Playwright Chromium with SwiftShader, load average 33–41):**
  - typecheck clean;
  - 386/386 unit tests, including 9 layout-rule tests, 5 new v3 view tests and the v3 kit contract test on all four kits;
  - browser: the v3 facilities case (8 world/arrangement/tier combinations, real kits, no view fallbacks, no console errors) and the v2 case (12 combinations) both pass. The v2 case needed a 300 s budget under this load; at 150 s it stopped after 10 of 12 page loads, with no failed assertion.
- **Evidence:** `docs/screenshots/facility-remodel/v3-modular.jpg`, five composed plants per world at 390×844, DPR 2. Raw frames are in `lookdev/facility-v3/`.
- **Round 2 (evening):**
  - ground aprons under every Khepri, Vesper and Nacre plant, seated on the sampled terrain tile by tile;
  - at least 6 modules per plant on those worlds, with denser templates and pipe runs between neighbours;
  - Luna unchanged;
  - `scene.ts` gained a second hook: `facilities.update(..., reserved, (x, s) => surfaceHeight(state.config.seed, x, s, world))`;
  - details: docs/25 §Round 2.
  - **Checks:**
    - typecheck clean;
    - the facility layout, placement and kit-contract suites pass (32/32);
    - the full suite passed 388/388 earlier in round 2. Its final runs (load average 35–50, while the terrain agent works) failed only on 30 s timeouts in terrain tests (`terrain*.test.ts`), which I did not touch;
    - the v3 browser case passes (8 world/arrangement/tier combinations, real kits, no fallbacks or console errors);
    - the v2 browser case passed in round 1 and its code path hasn't changed since. Its round 2 re-run stalled on a page load at load average 35, with no assertion failure.
  - **Review sheet:** recaptured; four worlds × five plants.
- **Limits:**
  - no phone test;
  - the composer is checked against registry footprints, not mesh silhouettes;
  - a battery that spawns after its neighbour's plant was composed is protected only by that plant's original checks, as in v2;
  - on rough ground, apron tiles are left out, so a plant on a dune can show gaps in its slab.

## Boss touch-ups: a smaller bridge cowl on the Ark, open treads on the Bastion, 20 October 2026

- **HELION ARK:** the user said the dark spire "looks so comical", like a giant windshield. It is now a compact cowl about half as wide and roughly half the height, in the hull's light paint, with small lit vision slits. The tower roof cap is mid-grey instead of dark. The closed cowl still hides the bridge lens; a build-time ray check confirms full cover, the glowing seam aside. The opened halves clear the core ray (asset test). 7,892 triangles.
- **BASTION-9:** the user asked for no boxy pieces over the treads and more tread showing at the front. The gull-wing side skirts, the stowage boxes over the outer drums and the front fender are removed, and the shoulder armour is cut back over the belts at the front; it still carries the battery turrets. A slim guard runs along each shoulder edge. 21,648 triangles.
- **Evidence:** in-game captures in `lookdev/boss-tweak/` (Ark at batteries and core, Bastion at batteries).

## Modular facilities v3 live: integration and review, 20 October 2026

- **What ships:** `FACILITY_VERSION = 3`. All four worlds compose modular plants from the textured kits (docs/25, art/facility-remodel/README.md). The v2 plants stay on disk as the rollback (set the version to 2).
- **Review changes made by the integrator:**
  - **Aprons:** they form one rectangular lot around a plant's buildings rather than following each footprint, so a plant reads as a single complex.
  - **Gun pit:** the court has no margin, so the slab stops at the gun unless buildings stand in front of it.
  - **Slopes:** apron skirts reach 1.1 deep and tiles tolerate ground up to 1.1 rough, so lots step down dunes and slopes as terraces instead of leaving holes.
  - **Weathering:** aprons use a lightly weathered `deck` material (no marbled frost on Vesper).
  - **Nacre:** its paving is a dark, desaturated violet, and its pool water glows at 0.7.
  - **Registry:** pad and arc footprints corrected (Vesper pad [2.5, 2.5], Luna pad [2.4, 2.45], Nacre arc [.9, .38]).
- **Evidence:** `docs/screenshots/facility-remodel/v3-modular.jpg`, five plants per world on all four worlds. Luna stays sparse.
- **Checks:** recorded in the deploy commit (snapshot: typecheck, unit suite, build, browser suite). No phone test.

## Hero bolts readable on Vesper's snow, 20 October 2026

- **The problem:** the user found the hero's projectiles hard to see on Vesper. The pale cyan-white bolts (`0xbcfff8`) vanished against bright snow.
- **The fix:** on Vesper, each bolt now has a dark navy outline (one extra instanced draw, only while on Vesper) and a deeper, saturated cyan core (`0x1fd2ff`). The other worlds keep the original look. Code: `src/render/scene.ts`, `brightGround`.
- **Inspection:** `tests/fixtures/bastion.html?planet=vesper&battery=battery-2&at=24&roll=10&shots&still` freezes twin bolt streams ahead of the ship (`shots`).
- **Checks:** typecheck clean; captures inspected on Vesper and Khepri.

## Victory warp holds deep space; Pulsar streams track the ship; a sparser Moon, 20 October 2026

- **Victory warp:**
  - **The bug:** the campaign's victory warp reuses the endless jump with no destination. After its flash, the veil lifted back onto the level the ship had just left, and the user saw the terrain again before the results.
  - **The fix:** a jump with `from === to` now deepens to opaque deep space after the flash and keeps its streaks racing behind the results (`src/render/fx-jump.ts`). Endless jumps are unchanged.
  - **Fixture:** `tests/fixtures/bastion.html?phase=destroyed&victory=T&still` previews the warp T seconds in.
  - **Inspected:** frames at 0.3, 1, 1.5, 2.2, 3 and 4.4 s, with the results overlay hidden.
- **Pulsar (Nacre):** ten tracking shots instead of six straight down; each aims at the ship as it leaves the muzzle (docs/20). The windup line follows the ship, the cue says "PULSAR · ITS STREAM FOLLOWS YOU · KEEP MOVING", and fairness predicts waiting tracking shots toward the ship. `tests/sim/pulsar.test.ts` covers the stream, per-shot aim, and a still versus a moving ship; the perfect-pilot runs still clear Deep Bloom without a hit.
- **Moon:** the user asked for "much less populated" buildings and infrastructure on Luna. Outposts are rarer (chance 0.24 to 0.10), and each has fewer pieces (2–4 instead of 4–7). Terrain version is 12; other planets are unchanged (Khepri fingerprints pass). Luna's modular plants follow with facilities v3 (docs/25).
- **Checks:** typecheck clean and 386/386 unit tests in the shared tree; snapshot checks are in the deploy commit. No phone test.

## Facility compounds v2: textured remodels after the facility sheets, 20 October 2026

- **What:** the user found the large building complexes "super flat" and asked for remodels that are more interesting and "textured like the bosses", taking "the render arts as inspiration".
  - All six gun-court plants are rebuilt with the boss toolkit (`tools/blender/remodel_facilities.py`) after `art/concepts/facility-sheets`:
    - Khepri: refinery columns, domed tanks, sawtooth sheds and banded pipes;
    - Vesper: raked graphite reactor halls, octagonal heat exchangers and snow caps;
    - Nacre: stone monoliths, glowing basins, and obelisks with crystals and crescent blades.
  - Surfaces are baked like the bosses: one 2048² atlas per world, with colour, roughness/metal, normal and AO.
  - Details: `art/facility-remodel/README.md`.
- **Runtime:**
  - Each world's GLB (`public/assets/<world>/facility-compounds-v2-remodel.glb`) loads when the run arrives there. It is released once its last plant has scrolled away.
  - The view keeps the GLB materials (`loadTexturedNodes` in `models.ts`): one instanced draw per material, which is 2 per plant on Khepri and Vesper and 4 on Nacre.
  - Until a world's file is ready, its batteries keep their smaller emplacements.
  - Placement, the district reservations and the seat bounds are unchanged.
- **Triangles per plant (small / large):** Khepri 15.3k / 23.2k, Vesper 9.8k / 17.1k, Nacre 6.6k / 9.5k. The v1 plants were about 7.4k each, untextured. The file sizes are 5.7, 5.2 and 4.4 MB.
- **Checks:**
  - typecheck clean; 370/370 unit tests, including the v2 seat-contract test for all three files and a new load/release test.
  - Blender asserts the bounds, the court and the area ratio on every build.
- **Evidence:**
  - in-game before/after on every world, at High and both sizes: `docs/screenshots/facility-remodel/before-after.jpg`;
  - authored game-view previews: `art/facility-remodel/previews.jpg`.
- **Limits:** no phone test. Texture memory is three 2048² maps for the current world's plants, plus the outgoing world's during a planet change.

## Khepri refinery districts and blended road ends (Phase 10a, docs/23), 20 October 2026

- **What:** terrain version 11. Rare, seeded refinery districts on Khepri (docs/23 §6), built from existing kit nodes plus the integrator's `khepri_processing_tower` (`district-kit.glb`):
  - a cargo hub;
  - a process lot with the tower, halls, junction and a piped tank farm;
  - internal roads joined to the network.
  Every road end now blends into the ground: dead ends taper to a rounded tip and fade on worn gravel; outpost ends run onto their pads on a flush apron. Battery compounds keep off district pads (render-only).
- **Where it appears:** slot 0 (s 440–606; preferred core s 520–580), which is Rolling Thunder's relief stretch before the Bastion arena and endless sector 2. Then one window every 720 units on Khepri. 44 of 60 seeds get a district in slot 0; for the rest the slot stays quiet.
- **Rollback:** `PLANETS.khepri.districts = null` plus `ROAD_ENDS.taper = 0` give version 10 byte for byte (asserted against the recorded fingerprints).
- **Checks:**
  - typecheck clean; **368/368 unit tests**, 18 of them new (districts, registry, road ends, reservation, budget);
  - Fingerprints: version 11 re-recorded, version 10 kept under the rollback switches;
  - `npm run build` passes;
  - Playwright: six relevant browser cases passed (three Bastion, endless flight, facilities on every world, Bastion model).
- **Measured** (SwiftShader and Node; no phone):
  - Terrain-only budget over districts: High at most 48 calls / 53.5k triangles, the same as before; Low at most 41.
  - Whole frame in district views: 39–46 calls (before 36–44).
  - Fixture flights through districts at 8 units/s: 0 fallbacks and 10–17 ms maximum terrain work at normal load (before 15–17 ms). One fallback per run in a final pass under load average 30–59 from other sessions; the load-independent stream tests show none.
- **Evidence:**
  - Captures: `lookdev/districts/` (before, after, road-ends).
  - Curated set: `docs/screenshots/districts/*.jpg`.
  - Fixture: `tests/fixtures/khepri-district.html?seed=11&distance=536.6&x=-9` (also `legacy=1`, `quality=low`, `battery=x,s`, `fly=from,to,speed`).
- **Limits and next:**
  - No external pipeline joins a district yet.
  - The tower sits on the outer half and is not visible from the centre lane.
  - Still to author: pipe manifold, plinths and retaining walls, power spire, bridge-gate, factory hall.
  - Re-measure frame cost on a quiet machine and on a phone.
  - Other planets' grammars wait for the Khepri review.

## WARDEN-1 reworked: bulky and layered, after its sheet, 20 October 2026

- **Why:** the user found the first remodel "cheaply made" and asked for it to really look like their render: more imposing and bulky.
- **Model** (`tools/blender/remodel_warden.py`): rebuilt from measurements off `art/concepts/boss-sheets/warden.jpg`, about 7.6 units across and stacked as the sheet shows:
  - huge chevron side blocks over big blue-jet thruster housings, with white cladding on their flanks;
  - heavy twin-barrel turret pods with armoured cheeks;
  - inner armour towers with dark vent modules and small thrusters beneath;
  - the tall octagonal command column, whose glowing slot is the seam of the core hatches, under a crowned cap with two masts;
  - a plated rear deck.
  Every white block carries raised plates, grooves, bolts, warning marks and orange lights, including roof edge lights for the game camera. The armour is brighter, nearly dielectric white.
- **Stats:** 25,712 triangles (22,248 live), 47k vertices, 13 live draws, 4.6 MB including the three 2048² maps.
- **Combat unchanged:**
  - The turret pods yaw about their own centres on the camera ray through their targets (x ±2.1, height 2.4).
  - The reactor bar sits on the core's ray behind the hatches.
  - The render footprint grows to 3.9 × 3.0 (half sizes, terrain clearance), and the asset test width bound to 7.8.
- **Evidence:**
  - contract tests 10/10, plus in-game Chromium captures of the pods and core phases with no page errors;
  - a snapshot of exactly this file set: typecheck clean, 342/342 unit tests, build, and **27/27 browser cases**. Those ran with a 120 s per-test timeout, because the parallel districts and audio sessions held the load average at 25–30.

## Flying WARDEN-1, three pods per Veil bay, single hero shadow, 20 October 2026

- **WARDEN-1 flies** (user):
  - **Model:** the v5 model is built 1.1 higher (`HOVER`) with no landing legs.
  - **Target height:** `WARDEN.targetHeight` goes from 1.3 to 2.4. It is render-only (boss `groundHeight` affects only placement and markers), so collisions, attacks and fairness are unchanged.
  - **Behaviour:** the thrusters keep burning with a ±0.06 bob, and on destruction the craft drops to the ground. Its shadow now falls well clear of it in game.
- **THE VEIL:** three equal egg pods abreast in each wing bay, as in the concept. The innermost is the weak point. The two stored pods are now the same size as the weak point and sit at the mouth, with paler shells, glowing petal seams and a faintly lit back wall, so they read from the 55° camera. 17,000 triangles.
- **Hero shadow** (user: two shadows): on High the hero now casts only its real model shadow, and the blob is drawn only on Low, which has no shadow maps. A Khepri before/after capture confirms the blob is gone and the model shadow stays.
- **Concept sheets:** the user's facility sheets and the WARDEN-1 sheet are stored as reference JPEGs in `art/concepts/facility-sheets/` and `art/concepts/boss-sheets/`.
- **Evidence** (snapshot of exactly this file set):
  - typecheck clean, 342/342 unit tests, production build;
  - browser: 26/27 in the full run. The one failure was a menu screenshot timing out at load average 31–45, caused by a parallel terrain job. `menu.spec.ts` then passed 6/6 with a 120 s per-test timeout. Nothing in this change touches the menu.
- **Settlement and infrastructure audit:** `docs/23-settlement-infrastructure.md` covers Phase 1 of the user's brief plus the design. The user approved option A for vertical space and the Khepri refinery prototype, which is in progress.

## WARDEN-1 remodel v5 and fewer boss draw calls, 20 October 2026

- **WARDEN-1** (`tools/blender/remodel_warden.py`): a clean remodel after the user's WARDEN-1 design sheet. There is no supplied GLB, so the sheet sets the shape and the v3 study sets the size.
  - **Command column:** the tall white column's glowing seam is the pair of core hatches. They slide 0.8 apart to expose a reactor on the core ray.
  - **Turrets:** twin-barrel pods sit on chevron side blocks and yaw about their unchanged targets.
  - **Body:** inner blocks, blue thruster bells, masts with the beacon, and landing legs.
  - **Look and size:** a Luna texture style; the paints are nearly non-metallic, since metallic white went grey under the black sky. 9,896 triangles, 3.0 MB. Combat geometry is unchanged.
- **Draw calls:** after the bake, slots sharing the one textured surface material are merged into one primitive per material. Live draws per boss:
  - Bastion: 53 → 28.
  - Ark: 33 → 18.
  - Veil: 45 → 24.
  - Warden: 27 → 13.
  Geometry and textures are unchanged. The stats table is in `art/boss-remodel/README.md`.
- **Tests:** the asset contract test now covers the selected Warden (camera rays through the pods and the opened core). Thruster jets join glow in the untextured exception.
- **Evidence:**
  - in-game captures of all four bosses in their weak-point and core phases, with no page errors (`docs/screenshots/boss-remodel/all-bosses-in-game.jpg`);
  - typecheck clean, **342/342 unit tests**, production build, and **27/27 browser cases** (9.7 min, in a snapshot of exactly this file set).
- **Not tested:** phone hardware.

## Boss remodels v5: clean models traced over the supplied GLBs, 20 October 2026

- **Why:** the user disliked the decimated v4 imports ("they look wonky"). They asked for clean, simple models remodelled over their three GLBs that keep the proportions, plus suiting textures. Their design sheets set the shapes, and shape takes priority over detail.
- **Models** (`tools/blender/boss_remodel.py`, plus `remodel_bastion.py`, `remodel_ark.py` and `remodel_veil.py`): new faceted Blender geometry traced over each source with `trace()` and height maps. No source mesh is exported.
  - BASTION-9: 22,176 triangles.
  - HELION ARK: 7,628 triangles.
  - THE VEIL: 16,112 triangles.
  Backs and undersides are plain. The same rig names are used, and each weak point sits on the 55° camera ray through its target. See [art/boss-remodel/README.md](../art/boss-remodel/README.md).
- **Textures:** one baked 2048² atlas per boss (colour, roughness/metal, normal) with generated armour plating or Voronoi chitin cells, CC0 plate grime and per-world weathering. The glow parts stay emissive, and per-corner AO goes into the vertex colours.
- **User decisions** (docs/08):
  - BASTION-9 is 20% larger, combat geometry included: batteries at ±2.64, the core 1.62 behind, target height 1.74, radii 0.84 and 1.86, overload lanes 1.68 and 2.88. Its tracks run the whole hull length, and its render footprint is now 5.0 × 4.7.
  - The Ark's outriggers run past the aft wing to y 5.85. Its centre hull is chunkier and longer and carries the design sheet's split spire as the bridge shutters. Its foam collars and stern wake follow the new hulls.
- **Code:** `src/render/boss-assets.ts` selects the v5 files. The three views accept the `*_remodel_v5` marker through the existing authored-material rigs. The asset contract test is version-aware and takes its weak-point rays from the combat constants.
- **Evidence:**
  - typecheck clean; **341/341 unit tests**, including fairness with the larger Bastion and the v5 rig, budget, texture and camera-ray contracts;
  - in-game Chromium captures of every boss in its weak-point and core phases, with no page errors (`docs/screenshots/boss-remodel/`);
  - source-versus-remodel sheets in `art/boss-remodel/`.
  - **27/27 browser cases**. The Veil pod-deployment case first failed: the textured flight pod loads as two meshes (shell plus glow), and the view instanced only a single mesh. `veil-view.ts` now instances every mesh of the pod.
  The user reviewed each step's screenshots during the session.
- **Limits:** no phone hardware test. The boss files are 2.6–4.4 MB each, mostly the three texture maps.
- **Rollback:** one filename per boss. The v4, v3 and v2 files stay published, and the Bastion's v4 combat values are listed in docs/08.

## Approved imported boss integration — 20 October 2026

- **Source fidelity:** the user's three GLBs are the masters, verified byte-for-byte against Downloads and preserved outside public assets. No hull regeneration. Adapted through live Blender MCP with retained source geometry/UVs/PBR maps, selected moving parts and conservative static underside removal.
- **Runtime assets:** THE VEIL 82,161 triangles / 4,487,084 bytes; BASTION-9 97,603 / 5,693,156; HELION ARK 92,464 / 5,399,400. Roughly 81–82% fewer triangles than the originals, including articulated parts and hidden wrecks. Working textures are 2k; the masters retain 4k. [Full handoff, build and rollback](../art/approved-bosses/README.md).
- **Integration:** Veil has hinged source bay lips, extracted docked/deployed pods, opening core petals and existing finite phase-driven launches. Bastion has aimed turrets, recoiling forward cannons, opening armor and complete disabled battery wrecks. Ark retains its waterborne trimaran, keel, aiming deck guns, radiator/bridge phases, sliding doors and three hull foam collars. Existing targets, attacks, simulation, saves and controls are unchanged.
- **Prior work completed:** Warden's 10,220-triangle reference-sheet model is retained. The three intervening procedural alien-boss studies are superseded and archived, never deployed as approved models. The v3 Veil study's late smoothing experiment has a known export warning; use archived published v2 assets for rollback. All six facility variants and prior terrain/hero improvements remain complete.
- **Validation:** full **341/341 unit tests** (34 files), **27/27 browser cases** (8.7 min), typecheck and production build passed. After the final Veil flank-pod clearance adjustment, all nine asset checks and both Veil browser cases passed again; High/Low captures were refreshed and reviewed with no page/shader errors. The new camera-ray checks protect both flank targets and every exposed core. One earlier browser attempt was interrupted by a development reload during editing; the subsequent full run passed.
- **Cost:** final frozen Veil High view submits 189,980 triangles across 55 draws including shadows/post; Low submits 108,365 across 32 draws with no shadow/post passes. These are scene-cost observations, not frame-rate claims. JS is 1,079.18 kB / 309.37 kB gzip; the existing chunk-size advisory remains.
- **Evidence:** Blender previews and source/runtime hashes in `art/approved-bosses/`; browser screenshots in `docs/screenshots/approved-bosses/`.
- **Limits:** automated Chromium/SwiftShader evidence, not actual-phone frame rate, thermal/battery or Safari validation. Approved Bastion tracks retain static source geometry; only its weapon assemblies articulate.
- **Release:** validated and ready; Pages deployment verification pending.

## Taller VEIL and expanded industrial compounds — 19 October 2026

- **Model refinement through live Blender MCP:** THE VEIL is now 17.34 wide × 15.30 long, with raised armour decks, 4.10-high crown fins, real wing vent recesses, exposed conduit assemblies, layered access plates and ribbed pod hangars. Middle wings leave both fixed weak points visible; sockets, attacks and deployed pods are unchanged. The full model, including hidden wreck variants, is 25,706 triangles / 2.03 MB.
- **Facilities:** both sizes on Khepri, Vesper and Nacre have turbine roofs, tank crowns, cooling fins, wall ribs, stairs and recessed doors. Larger sites add forward pump bays, raised catwalks and rear heat exchangers: 8.70 × 8.475 versus 6.60 × 5.90, or 1.89× the footprint. All six variants total 44,156 triangles / 3.79 MB.
- **Placement:** full-scale geometry replaces vertical squashing. Foundations sink no more than 0.35 units on suitable ground; higher/crowded ground keeps legacy emplacements. Deterministic cosmetic variation selects larger sites where space permits, with per-variant scatter clearings and spacing. No additional enemies, targeting, collisions, progression or save changes.
- **Validation:** 333 existing unit tests plus two new placement regression tests passed; five focused asset/placement checks also passed after final geometry edits. The full browser suite passed **23/23** (5.2 min), including twelve world/size/quality combinations in the facility case and the VEIL core, overload and wreck. Typecheck, production build and diff whitespace check passed. The existing bundle-size advisory remains (1,073.45 kB JS / 307.43 kB gzip).
- **Evidence and limits:** refreshed seven Blender previews; game captures cover all three worlds and both compound sizes. Software Chromium/SwiftShader; actual-phone frame rate, heat/battery use and Safari remain unverified. See [docs/22](22-cinematic-art-refinement.md) for budgets and reproduction commands.
- **Release:** `f0876c7` deployed successfully in Pages run `39244037038`. Published SHA-256 hashes match all six local GLBs; live endless launch, steering and pause passed in Chromium 156.0.8078.4 with no page/console errors. The deployed JS bundle is `index-CimeIF9L.js`.

## Reference-led graphics refinement — 19 October 2026

- **Models, through live Blender MCP:** new crescent-carrier THE VEIL (17,466 triangles including wreck states), detailed utility Scrapper (2,744), three large battery compounds (7,668 combined), and refined Nacre crags / Vesper pressure slabs / tighter Khepri basalt edges. Combat sockets, launch schedule, collision sizes and the hero's existing 1.1 scale remain unchanged.
- **Materials and environments:** planet reflections now reach all bosses; roughness variation and microfinish on ships, bosses, terrain pieces and infrastructure; restrained bloom and flora emission; broken water chop, subtler snow and ice fracture detail; sharper engineered Khepri roads. Facilities keep an open gun courtyard and clear nearby scenery and matching shadow proxies.
- **Effects:** shaped engine cores, shock diamonds, brief explosion rings with fewer fire layers, shorter smoke, and a brief VEIL heart-opening pressure release. Existing bounded particle pools and quality tiers retained.
- **Validation:** all 330 existing unit tests passed, plus 3 new Blender asset contract tests; all 21 existing browser tests passed, plus 2 new graphics tests covering all three facility variants on High/Low and VEIL core/overload/wreck states. Typecheck, production build and `git diff --check` passed. Nine deterministic look-dev captures completed with no page or shader-console errors; reviewed the facility and boss-phase test screenshots and regenerated Blender previews as well.
- **Evidence:** `docs/screenshots/art-refinement/`, `art/the-veil/preview-veil*.png`; details and reproducible commands in [docs/22](22-cinematic-art-refinement.md). Automated browser: Playwright 1.64 Chromium with SwiftShader, DPR 1, 390×844 and 430×932; existing viewport suite also checks small phones and desktop.
- **Cost:** reviewed frozen High views used 37–72 draws, including shadows/post; dense Nacre submitted 180,917 triangles including shadow passes. Low removes shadow/post passes. Current JS bundle is 1,072.83 kB / 307.20 kB gzip; the existing chunk-size warning remains.
- **Limits:** no actual iPhone/Android performance, sustained thermal or Safari validation. The result remains a real-time stylized interpretation of the supplied reference, not an offline-quality reproduction. No gameplay, progression, targeting, input or save changes.
- **Release:** `7472fc5` deployed successfully in Pages run `39205516955`. All six published GLBs matched local SHA-256 hashes; the live endless launch/steering/pause smoke check passed in Chromium 156.0.8078.4 with no page or console errors.

## Wide VEIL with a spiral finale, Pulsar bursts, cleaner fuel tanks — 17 October 2026

- **THE VEIL:** now wider than long (blades span about 25 units, hull about 18 long). Its final phase adds a spiral barrage from the heart.
- **Fairness:** the director's safety check now runs to the end of every committed footprint, so long patterns are judged in full.
- **Pulsar:** the shockwave ring is replaced by a rapid burst: a marked line, then six fast shots down it (shots emitted together, each waiting at the muzzle via `Projectile.delay`).
- **Fuel tanks:**
  - they looked like wood for two reasons: the ship panel texture on their paint, and the tan see-through silhouette drawn over their half buried in slopes;
  - props now use a craft material without the panel map, and fuel skids skip the silhouette;
  - a few fewer tanks: one tank fewer in the bigger depot, and four cues without extra tanks.
- **Evidence:**
  - 330/330 unit tests, 21/21 browser specs, production build;
  - spirals occur 1–4 times per final phase with the test pilot still hitless;
  - captures of the new VEIL, the spiral and the tanks inspected.
- **Not done:** no phone hardware test.

## THE VEIL redesigned: long angular alien warship — 17 October 2026

- **New model:** a long, narrow faceted black hull with layered iridescent armour shards, swept knife blades, crystal-crowned pods on outriggers, an octagonal heart collar and a stern engine block, in the Nacre fighters' language (`tools/blender/the_veil.py`, 10,044 triangles, `problems=0`). It replaces the round, animal-like model; sockets and game logic are unchanged.
- **Game fit:** the terrain footprint and death explosions follow the long hull.
- **Evidence:** 330/330 unit tests, 21/21 browser specs, production build; previews and in-game captures of the pod and overload phases inspected.
- **Not done:** no phone hardware test.

## Pulsar: a new Nacre enemy with shockwave rings — 17 October 2026

- **Pulsar:** a radial Nacre organism (Blender `nacre_pulsar`, 2,100 triangles in `nacre-craft.glb`). It dives low, charges for 1.25 s with a faint circle marking its reach, then releases an expanding shockwave ring; stay outside the circle. See docs/20.
- **Placement:** Deep Bloom (and endless Nacre) gets a single Pulsar at 27 s, a wide pair at 72 s and a single in the climax.
- **Fairness:** the director treats the ring's reach on the row as a footprint, padded in time.
- **Evidence:**
  - 330/330 unit tests, including the new `tests/sim/pulsar.test.ts` and automatic formation and cue fairness for the Pulsar formations;
  - 21/21 browser specs, production build;
  - in-game capture of a Pulsar firing.
- **Not done:** no phone hardware test.

## Tougher Needles, Diamonds and bosses; shield cells from the top; solid victory screen — 17 October 2026

- **Needles** have 70 HP (was 50) and **Diamonds** (the Orrery on Nacre) 175 (was 130); both hold their attack runs 2 s longer.
- **Bosses:** every boss has 15% more HP and 10% shorter recoveries between attacks (`BOSS_TOUGHNESS`).
- **Shield cells** appear at the top of the view (s 18.5, was 12) and drift down to the player.
- **Wreck hold** is 2.5 s (was 1.5) before the departure and warp.
- **Campaign victory:** the background fades to solid dark behind the results, so no level map shows through.
- **Fairness adjustments:** Deep Bloom's climax battery is three guns instead of four, because the longer-lingering Needles had cornered the test pilot; the Needle column's firing window starts a little later so every windup begins in view.
- **Evidence:** 324/324 unit tests, 21/21 browser specs, production build; victory screen captured. The perfect pilot is hitless on all four missions × three weapons × three difficulties (seed 5), apart from one hit in Training on Veteran with the Fan Cannon, which was already there before these changes.
- **Not done:** no phone hardware test.

## Facility building, more outposts on Khepri and Vesper, battery emplacements — 17 October 2026

- **New shared asset `facility`** (Blender, `tools/blender/shared_industrial.py` → `industrial-kit.glb`, 722 triangles): a processing hall with a lit window band, roller door, annex, external stair, roof units and an exhaust stack with a beacon. The shared-kit palette themes it: ochre on Khepri, black ceramic with orange glow on Vesper.
- **More and bigger outposts** (Luna unchanged, it stays desolate):
  - Khepri: a new `plant` archetype (facility, tanks, freight, habitat) and half the refineries add a hall; bigger types weigh more, wrecks and abandoned sites less; outposts are about a third more likely within each district;
  - Vesper: a new `plant` archetype and outposts in 88% of cells (was 74%).
  - The Khepri fingerprints were re-recorded.
- **Battery emplacements** (render-only): ground batteries on Khepri and Vesper get a facility hall or tanks and freight laid out beside them on clear, level ground (three in four batteries). They stay after the battery falls and scroll away with the ground. Battery frequency is unchanged.
- **Evidence:**
  - 324/324 unit tests, 21/21 browser specs, production build;
  - captures of battery lines (Khepri and Vesper) and Khepri flight, with performance on High of 49–65 draw calls and 54k–94k triangles.
- **Not done:** no phone hardware test.

## Vesper models restored, Luna colours, clustered outposts, Ark and Shockwave tuning — 17 October 2026

- **Vesper craft fix:** the 16 October fuel-skid kind crashed the Vesper craft loader, so Vesper flew gold Khepri stand-ins. It now skips kinds without a Vesper model.
- **Luna colours:**
  - Khepri infrastructure (landing pads, habitats, relays, haulers) turns clean white-grey on Luna, and the shared kit's paint and wear go neutral;
  - the half-buried batteries' see-through silhouette and the craft rim light follow Luna's blue repaint.
- **Clustered outposts:**
  - Khepri and Luna outposts gather in districts along the route (`districtLevel`) with quiet stretches between: about 35 per 900 units instead of 46, but denser;
  - landing fields carry a terminal block (habitats, silo, relay, freight); pump stations are tank farms that always sit on a pipeline;
  - Luna bases combine pad, habitat, relay, solar and dish;
  - Vesper vent stacks stand only on outpost fringes.
  - The Khepri fingerprints were re-recorded.
- **Luna boss:** WARDEN-1 lands at 124 s (was 129), a few seconds after the last squadron leaves.
- **Helion Ark, first phase:** every third attack is an aimed bridge burst between the radiator lasers, so staying in the middle with the Fan Cannon no longer works there.
- **Shockwave falloff:** full damage within 3 units of the ship, fading to 20% at its 20-unit reach; it clears hostile shots only within 8 units.
- **Evidence:** 324/324 unit tests, 21/21 browser specs, production build; captures of Cold Vector (Vesper craft), Luna bases and turrets, and Khepri inspected.
- **Not done:** no phone hardware test.

## One post-boss sequence for both modes, live coin counter — 17 October 2026

- **After every boss kill, campaign and endless alike** (`src/content/departure.ts`):
  - a 1.5 s hold over the burning wreck;
  - a 2 s departure: the scroll ramps to 20 units/s, so the ground-anchored wreck leaves the bottom of the frame;
  - then a 3 s warp starting from that speed. Endless lands on the next planet; the campaign shows results after the flash.
  - This replaces the 4 s extraction and fixes two bugs: the wreck being dragged into the warp, and Bastion-9 appearing on top during it. The wreck now moves by exactly the distance flown.
  - Endless keeps two outgoing terrain sections after the arena so the departure stays on the old planet.
- **Wording:** "sortie" is gone from the UI (MISSION COMPLETE, LAUNCH MISSION, MISSIONS CLEARED); boss kill lines end in "· JUMP".
- **Campaign HUD:** a gold coin counter at the top right shows the saved balance plus this run's pickups at their paid rate, pulsing on each gain.
- **Evidence:** 324/324 unit tests, 21/21 browser specs, production build; departure captures (endless Luna, campaign Training) and the HUD counter inspected.
- **Not done:** no phone hardware test.

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

## 23 October 2026 · Synchronized boss music (Codex)

Completed the user's same-song boss variants for Luna, Khepri, Nacre and Vesper. The approved level arrangement continues unchanged; a dry bass/percussion stem follows the same sixteenth-note clock and current harmony. Boss arrival fades it to 85% over one bar, core/overload to 100%, defeat back to zero. No lead/pad duplication or timeline restart. Music settings, pause, retry and planet changes cover both layers; the existing combat sounds and events.ts are untouched. No additional samples, runtime downloads, or simulation changes.

Validation:
- Typecheck and production build passed (existing large renderer-chunk warning).
- Audio unit tests: 9/9 passed. Full combined unit run: 414 passed, 1 failed in the concurrent terrain work, tests/world/terrain.test.ts:228 (front-downhill cliff assertion). Reported to World in COORDINATION.md; left outside this task's ownership.
- Audio browser suite: 6/6 passed, including live boss fades/clock continuity, later phase/defeat, pause/resume/retry, four level/boss/transition PCM comparisons, mute, submixes, headroom, mono and bounded voices. Final output: lookdev/audio-boss-verified. Browser tests isolate the Vite WebSocket so concurrent file writes cannot reset a live AudioContext.
- Exact comparison against shipped 2d08b81: all 2,048 original level score steps match (4 planets x 512 sixteenths).
- Four boss mixes and four transition excerpts rendered through the runtime mixer. Max peak 0.458, zero clipping or dropped notes in the excerpts, max music voices 29/36, mono RMS retention above 99%, sample cache unchanged at 7.07 MiB. Low-band energy (180 Hz low-pass, matched seconds 2-25) increases 2.02-3.10x. Evidence: docs/screenshots/audio/boss-metrics.json.
- Reviewed Sound room at desktop and 390px phone width; verified audio playback and version switching preserve position, no horizontal overflow or console errors. Evidence: docs/screenshots/audio/boss-sound-room.png. Playable local previews: http://localhost:4173/lookdev/audio/index.html, regenerated by node tools/audio-preview.mjs.

Ready for World's integration and deployment; no independent commit or push. Actual phone speaker balance, Safari audio/device behavior and subjective listening approval remain unverified. Terrain failure belongs to the combined release gate, not the isolated audio checks.

## 27 October 2026 · Umbra crack reflections and pending combat pass

Local Umbra review now uses continuous crack bevels with a separate physical reflection layer. It replaces the rejected random sparse facet patches. Reflections depend on the real scene light and view vector, travel along eligible edges as the camera moves, and fade outside the central half of the screen. The dark seam mask and matte rim remain readable independently. Diffuse normals are unchanged, avoiding the rejected embossed/bright-everywhere look; no emissive crack contribution or bloom increase. The texture remains 512×512 RGBA; its formerly unused blue channel contains the bevel profile. Fine hairlines stay matte. Other worlds do not enable the added reflection layer.

Validation: production build/typecheck passed (existing large renderer chunk warning). Low/High Chromium SwiftShader shader checks passed with zero collected page/console errors; inspected before/after flight-position screenshots at 390×844. The ten focused combat/model/effect tests also pass. No actual-phone performance claim. One intermediate browser run was invalidated by a Vite reload during source editing; the stable rerun passed the visual test. Evidence is in `test-results/combat-light-smooth-beams--aaf17-ets-compile-on-Low-and-High/`.

The earlier combat pass remains local and is NOT release-ready: the 16-speed battery settings require further balance validation. The last applicable broad run at 1.25 s warning / 1.45 s recovery passed the independent fairness suite but failed three no-hit scripted-pilot scenarios (Veil Veteran Fan, Veil Standard Seeker, endless Seeker). Experiments with longer cooldowns and copied ground snapshots did not clear the full gate and were reverted; original pilot, seeds and assertions remain intact. No temporary tuning/probe tests remain. Wraith v2, fan-before-homing specials, earlier core spirals, smooth lasers, wreck smoke and opaque warp are implemented with focused checks, but this combined batch has not been committed or deployed. Preserve the existing unrelated untracked concept crops and Zone.Identifier files.


**Completed by Claude Code on 27 October** (user: "complete codex work on the fixes"):
- **Before:** the full unit suite on the combat pass failed two checks.
  - **A real fairness seal in Brood Strike** (Standard at 255.6 s, Veteran at 346.8 s): THE CRADLE's new slow, wide spiral (3 arms, −1.35 rad/s) still crossed the screen when its next aimed burst and a hatchling wave's charging shots came, blocking both edges and the centre together.
  - **One Final Horizon no-hit run** (Fan).
- **Seal fix:** the bosses' spiral may now rest before the next attack (`spiral.rest`, src/content/bosses.ts, src/sim/bastion.ts). THE CRADLE's rests 1.4 s.
  - Each boss keeps its own core cycle, as Codex designed it (user: "the idea was that each boss is unique in its attacks"). Making THE CRADLE and THE ECLIPSE follow THE VEIL's order was tried and dropped.
- **Final Horizon:** the scripted pilot takes a single mission hit with the Fan on seeds 3 and 5, from the Wraith beside turrets. The short-ranged Fan flies it close to where the Wraith warps in. Twin Pulse and Seeker clear seeds 3, 5, 7, 11 and 21, and the fairness checks pass. The test flies seed 7, which clears with all three. **Watch in play** whether the Wraith is too sharp for the Fan.
- **Unit tests:** 460/460, including the fairness suite with every original seed and assertion, and Codex's three earlier failing cases (THE VEIL on Veteran with the Fan, THE VEIL on Standard with the Seeker, endless Seeker), which now pass. Release gate: see the coordination log.