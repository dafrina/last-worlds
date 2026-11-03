# Mobile performance pass

3 November 2026, render side only. Budgets: docs/06 § 6 (p95 ≤ 20 ms on the high tier, ≤ 35 ms on the low tier, no repeated hitches over 100 ms in combat; guardrail 100 calls and 180k triangles). Previous pass: build-status, 31 October.

**What was not measured.** Headless Chromium draws with SwiftShader, a CPU rasterizer. GPU time, fill rate, heat, battery and a phone's frame pacing are not measured here, and no phone was tested. The numbers below are main-thread JavaScript work per frame (simulation, `render()`, UI) under 4× CPU throttling, plus load-independent counts: draw calls, program switches, texture uploads, allocations, renderer memory. GPU-side proxies are listed in § 5. The machine is shared; load averages are recorded with every timing.

## 1. Method

- `tools/perf-bench.mjs`: each scenario launches a fixed flight (seed 4242), held at zero ticks from the launch, pre-rolled unrendered, then rendered at exactly one tick per frame (three for rapid scrolling) with the scripted weave, so every run does the same simulation and render work. It records per-frame JS work (mean, p95, p99, max, frames over 16.7/33/100 ms), long tasks, a CPU profile (self and in-frame inclusive time, GC), the renderer's stats (calls, triangles, geometries, textures, programs, shadow calls, particle and lane coverage, stream fallbacks) and the JS heap after two forced collections. `PERF_ALLOC=1` replaces the CPU profile with V8's sampling heap profiler (objects collected by minor and major GCs included): bytes allocated per frame inside the frame callback, by function.
- `tools/perf-soak.mjs`: `endless` flies one endless run through its planet jumps (four ticks a frame, every boss killed once it fights) and records the heap after GC and the renderer's memory at every sector and planet change, with one-tick frame windows at the start and the end; `restarts` launches each campaign world in turn, flies 6 s and returns to the menu through the pause panel's button.
- Scenarios (`perf-bench.mjs`):

| Scenario | Flight | Measured |
| --- | --- | --- |
| site | Rolling Thunder, the salvage yard on the left route (ship held over it) | its destruction at frame 60; `kill+2s` segment |
| lasers | Cold Vector, Veteran, 26 s in | 20 s with four to five Needles and Lancers winding up, five live beams at 46 s |
| dense | Final Horizon, Veteran, 28 s in | 12 s through its densest air wave (ten craft in view) |
| boss-phases | Rolling Thunder's Bastion-9 | flanks down (frame 90), overload (330), death (570) |
| rapid | Rolling Thunder, 25 s in | three ticks a frame: 15 units/s of terrain streaming |
| jump | endless, Luna's boss killed | the departure (20 units/s), the warp (30 units/s), the switch to Khepri |
| endless (soak) | endless to sector 6 | heap/geometries/textures per sector; frame windows at start and end |
| restarts (soak) | six worlds, launch → 6 s → menu, seven cycles | heap and renderer memory at the menu |

- A/B timing ran the baseline (`02b08f7`: integrator-next `e59215f` plus the tooling) and this branch from one dev server, alternating which ran first per scenario, under the same load. For time, `lasers`, `rapid` and the other worlds' flights were not timed A/B: the jump covers rapid scrolling (20–30 units/s), and the beams are in the stills (§ 6).

## 2. Findings

The integrator's baseline stood: steady flight draws 33–42 calls (shadow 2–7, main 24–31, post 6), restarts do not leak, and draw-call reduction has little headroom. What the peak moments and long sessions showed:

1. **A 0.3–0.5 s frame in every endless boss sector.** 8 s into a boss sector the renderer preloads the next world's kits for its jump; when they arrived, the warm-up that follows uploaded every new texture in one frame of the flight. On Luna that is Khepri's facility-kit atlas, three 2048² textures: a 542 ms frame in the bench (314 and 407 ms in the soak's start windows). It is the worst hitch the bench found outside a jump's flash, and it lands in combat.
2. **Program switches every frame.** three.js looks a material's program up again (parameters, cache key, a full uniform refresh) whenever the material's state flips:
   - its one shared shadow-depth material flipped between instanced and single casters wherever a batch (site and facility foundations, Vesper floes and bergs, Bastion-9's track links) was drawn next to a single mesh (the hero's merged caster, a site's parts): 2 switches a frame on Vesper, Nacre and at sites;
   - Bastion-9's track links shared their materials with the battery guns, instanced and single: 4 more a frame in its fight (6 in all);
   - a transparent double-sided built-in material is drawn twice (back faces, then front faces), with `needsUpdate` forced before each: every Low craft silhouette batch and the hero's (e.g. 3 objects, 6 lookups and 3 extra draws a frame in a Khepri flight), and the flat effect rings whenever an explosion, pickup or hit ring was on screen.
3. **Twelve empty batches drawn every frame.** The particle layers of all six boss views (dust, mist, sparks) waited visible with no instances on every world. three.js issues no GL draw for them but sorts each into the render list and sets up its program and uniforms.
4. **Boss seating rebuilt 75 terrain rows a frame.** Bastion-9 and WARDEN-1 seat on the highest ground of a 5 × 5 footprint, three passes a frame, walked column by column through a terrain that keeps its last four rows: every one of the 75 samples built its row (settlements, mood, parameters). It was 0.47 ms of a 4.1 ms frame in the Bastion fight at 1× CPU.
5. **No leak in long sessions.** Over 463 s of endless (six sectors, Luna → Khepri → Vesper) the heap after GC went 31.9 → 34.5 MB, geometries 459 → 516 and textures 49 → 56, each step at a planet's first visit (Vesper's floes, the Ark); within a planet they hold. Seven launch-and-quit cycles over all six worlds: heap at the menu 29.6 → 33.7 MB (peak 36.0), textures 46 → 70 as each world's assets load once and stay cached by design, geometries bounded (542–678 at the menu). One gap in disposal was found by reading: a left world's site templates freed geometry and materials but not their textures (`facility-view` frees its own). Today's site files carry no textures (vertex-coloured), so nothing leaked; it is fixed for when they do.
6. **Allocation is dominated by terrain generation.** 390–900 KB is allocated inside a frame (Luna, Khepri, the site and the Bastion fight, High and Low), about 85 % of it by `src/world` generation running in the 3 ms prefetch budget (`craterAt`, `landform`, `levelField`, `noise`'s boxed doubles, the section generator) and by render-side height queries; `render()` itself about 15 KB, three.js uniform setters a few KB. The simulation adds about 25 KB (motion keyframes, airspace sampling). The menu globes' idle-time bake (`src/ui/planet-preview.ts`) allocates three times more than a frame while it runs after boot, outside the frame callback.
7. **Where a frame's JS goes** (1× CPU, High, in-frame inclusive): Khepri flight 3.4 ms = three.js `render` 1.9 ms (shadow pass 0.37, render-list build 0.32, program/uniform setup 0.58), terrain prefetch 0.32, simulation 0.14, UI 0.10. Bastion fight 4.1 ms, of which seating 0.6 ms.
8. **Draw calls with a site in view** rise to 94–109 on High (shadow 28–34): the salvage yard alone is 14 meshes over 12 materials, 12 of them casters.

## 3. Changes (no visual or gameplay change)

All in `src/render/`; the simulation, collision timing and fairness are untouched.

| Change | Files | Effect |
| --- | --- | --- |
| Texture uploads only in the hidden warm-ups (the launch warp, a jump's flash); mid-flight warm-ups compile asynchronously as before and upload nothing, so a texture drawn sooner uploads as it first draws (three.js's own behaviour) | `scene.ts` | the next world's atlases upload under the flash that already warms the next world; the endless preload hitch is gone |
| `forceSinglePass` on transparent double-sided built-in materials whose single pass draws the same pixels: Low craft and hero silhouettes (the stencil darkens each pixel once whichever face covers it), the effect, shockwave, Gravity Well and boss shock rings (flat, facing the camera one way) | `craft-shadows.ts`, `scene.ts`, `bastion-view.ts`, `warden-view.ts`, `veil-view.ts` | half the draws for those objects, no per-draw program lookups |
| One depth material of their own for instanced shadow casters that used three.js's shared one (assigned at warm-up; floes at creation) | `scene.ts`, `terrain-view.ts` | no shadow-pass program switches; same programs (cache keys) and the same copied caster state, so the same shadow map |
| Bastion-9's track links wear their own copies of the gun materials; the fortress keeps the copies in step with any per-frame change of their sources (heat, hull glow) | `bastion-tracks.ts`, `bastion-view.ts` | no main-pass program switches in its fight |
| Boss particle layers hidden while empty (`visible = count > 0`, as every other batch since 31 October) | `bastion-view.ts` (shared by WARDEN-1, THE VEIL, THE CRADLE, ECLIPSE), `ark-view.ts` | 12 fewer render-list entries and program setups a frame on every world |
| Boss seating walks its footprint row by row (the same 25 heights and maximum); the lens ray reuses scratch vectors | `scene.ts` | 15 row builds a frame instead of 75; 28 fewer vector allocations |
| A left world's strike-site textures are disposed with their templates, as facility kits already do | `site-view.ts` | hygiene: today's site files have no textures, so no measured change |
| QA only: particle and lane coverage in the render stats; the bench records them and the stream's synchronous fallbacks | `fx-particles.ts`, `scene.ts`, `tools/` | GPU-side proxies (§ 5) |

Tests: `tests/render/draw-passes.test.ts` (single-pass rings and silhouettes; no visible empty boss batch; the row-ordered seat equals the column-ordered one exactly; the links' materials are their own and look like their guns'), `tests/render/site-textures.test.ts` (a left world's site textures are disposed, the current world's kept), `tests/browser/performance.spec.ts` (endless: the next world's atlases are not uploaded mid-flight, and are uploaded by the flash). Each fails on the baseline except the seat equivalence, which guards the reorder.

## 4. Before and after

### Load-independent counts

| Measure | Before | After |
| --- | --- | --- |
| Worst frame, first 10 s of endless (Luna; the next world's kits arrive at 8 s) | 314 ms (soak), 407 ms (first soak), 542 ms (profiled at 1× CPU) | 29 ms (soak) |
| Program lookups a frame (60-frame probe, High): Bastion-9 fight · Vesper · Nacre · a site in view | 6 · 2 · 2 · 2 (+2 a frame while an effect ring shows) | 0 · 0 · 0 · 0 |
| Program lookups a frame, Low, Khepri flight (silhouettes drawn twice) | 6, and 3 extra draws | 0 |
| three.js `getProgram` time a frame (4× CPU, in-frame profile): Khepri High · Khepri Low · dense Low · Bastion fight · site | 0.35 · 0.73 · 0.71 · 0.60 · 0.32 ms | 0 everywhere |
| Visible empty instanced batches a frame (every world) | 12 | 0 |
| Render-list build (`projectObject`, 4× CPU): Khepri High · Khepri Low | 1.76 · 2.09 ms | 1.47 · 1.59 ms |
| Draw calls (mean): Khepri Low · dense Low · Khepri High · site High · Bastion fight | 64–65 · 36 · 82 · 101 · 85 | 60–61 · 33 · 81–82 · 100 · 84 |
| Shader programs after the warm-up: High · Low | 66–71 · 112–114 | 62–65 · 105–107 |
| Terrain rows built a frame by Bastion-9's or WARDEN-1's footprint walk (the bisection's 27 are unchanged) | 75 | 15 |
| Allocated inside the frame callback, KB a frame (1× CPU, `PERF_ALLOC`): Khepri High · Khepri Low · Bastion fight · site | 602 · 785 · 895 · 517 | 595 · 734 · 784 · 503 |
| Endless soak, 463 s, Luna → Khepri → Vesper: heap after GC · geometries · textures · programs | 31.9 → 34.5 MB · 459 → 516 · 49 → 56 · 68 → 71 | 31.9 → 34.4 MB · 459 → 516 · 46 → 56 · 64 → 65 |
| Endless soak, one-tick frame windows: start (Luna) · end (Vesper, sector 6) | max 314 ms, 1 over 33 · max 11.5 ms | max 29 ms, 0 over 33 · max 14.6 ms |
| Restart soak, seven launch-and-quit cycles: heap at the menu · textures · programs | 29.6 → 33.7 MB (peak 36.0) · 46 → 70 · 66 → 79 | 29.8 → 33.6 MB (peak 35.4) · 46 → 70 · 62 → 73 |

Allocation is mostly terrain generation (finding 6), which this pass did not touch; the drop in the Bastion fight is its seating rows and lens ray.

### JS work per frame, A/B (4× CPU throttle, SwiftShader, 390 × 844)

Each pair ran from one dev server, baseline and branch back to back (alternating which went first). The machine's load average was 13–29 throughout (SwiftShader alone takes most of 16 cores), so single pairs vary by ±20 %; read these with the counts above, not alone.

| Scenario (load avg) | mean · p95 · p99 · max (ms) | frames > 16.7 / > 33 / > 100 | GC ms a frame | calls (shadow) |
| --- | --- | --- | --- | --- |
| Khepri flight, High (29 / 24) | 17.4 · 33.8 · 48.4 · 57 → 14.6 · 27.4 · 39.5 · 85 | 144 / 17 / 0 → 86 / 5 / 0 of 300 | 0.18 → 0.22 | 82 (16) → 81 (15) |
| Khepri flight, Low (16 / 25) | 18.4 · 40.4 · 52.7 · 83 → 15.7 · 32.1 · 44.0 · 66 | 142 / 30 / 0 → 98 / 13 / 0 of 300 | 0.50 → 0.28 | 64 → 60 |
| Dense wave, Low (14 / 13) | 9.4 · 17.9 · 25.9 · 44 → 9.0 · 17.7 · 23.5 · 39 | 54 / 3 / 0 → 44 / 1 / 0 of 720 | 0.27 → 0.42 | 36 → 33 |
| Bastion-9 phases, High (14 / 13) | 12.0 · 18.8 · 24.9 · 54 → 10.9 · 17.9 · 22.9 · 41 | 74 / 4 / 0 → 58 / 1 / 0 of 840 | 0.31 → 0.29 | 85 (23) → 84 (22) |
| ↳ overload (60 frames) | 11.8 · 16.4 · – · 23 → 9.6 · 14.5 · – · 20 | 3 / 0 / 0 → 1 / 0 / 0 | | |
| Site destruction, High (17 / 12) | 12.8 · 21.4 · 28.2 · 44 → 11.7 · 18.5 · 25.2 · 34 | 70 / 2 / 0 → 42 / 1 / 0 of 420 | 0.17 → 0.16 | 101 (29) → 100 (29) |
| ↳ kill + 2 s | 12.8 · 19.2 · – · 32 → 12.4 · 18.6 · – · 34 | 18 / 0 / 0 → 19 / 1 / 0 | | |
| Endless jump, High (26 / 26) | 20.2 · 35.8 · 55.6 · 650 → 20.8 · 34.1 · 56.2 · 1089 | 156 / 24 / 4 → 144 / 24 / 4 of 420 | 0.54 → 0.49 | 178 → 192 |

Earlier pairs of the dense wave and the Bastion fight, run while a soak loaded the machine (load 25–28), went the other way (9.4 → 16.9 and 13.9 → 16.7 ms mean); repeated at load 13–14 they gave the rows above. The jump's max is its flash frame on both sides (see below), 575–650 ms on the baseline and 575–1089 ms on the branch across two runs each. These are a desktop core slowed 4× without the GPU, not phone frame times.

- **Rapid scrolling and the planet switch** (the `jump` scenario: departure at 20 units/s, warp at 30) cost the same on both sides: about 30 ms of JS a frame at 4× CPU through the fast scroll, most of it terrain generation (6–7 ms a frame in the section generator, two sections built synchronously mid-warp), and one frame at the flash of 0.6–1.1 s, which is the hidden warm-up waiting for the next world's shader programs (`getUniforms` → driver compile status). In this bench the next world's kits load only when rendering starts, just before the jump; in play they load about 70 s earlier and their programs compile in the background long before the flash. The branch's deferred texture uploads land after the boss has fallen and in the warp, one a frame.
- **Long endless play**: the end window (sector 6, Vesper) is as cheap as the start (2.4–2.9 ms mean at 1× CPU, max 11.5–14.6 ms); nothing accumulates per frame.

## 5. GPU-side proxies (not measured on a GPU)

- **Resolution.** High caps the pixel ratio at 1.5, Low at 1: on a 390 × 844 pt phone at 3× that is 585 × 1266 = 0.74 Mpx (High) and 0.33 Mpx (Low).
- **Full-screen layers on High:** the scene into a half-float HDR target with depth/stencil (0.74 Mpx), the composite (FXAA 5–9 taps, fog from depth, bloom, grade) to the canvas, and the bloom chain at ¼, ⅛ and 1/16 resolution (about 0.12 Mpx in all). Low draws straight to the canvas.
- **Shadow map (High only):** 1536² = 2.36 M depth texels written a frame, 3.2× the High drawing buffer, PCF-filtered (radius 2.6) by every receiving fragment. Its draws: 2–7 in flight, 26–34 with a boss or a strike site in view.
- **Canvas multisampling:** the context is created with `antialias: true` for Low, which draws straight to the canvas; on High it multisamples a canvas that only receives the composite's full-screen triangle (no edge to smooth), at 4 samples × 0.74 Mpx of colour and depth/stencil.
- **Transparent fill** (`fxCoverage`, `laneCoverage` in the render stats: summed quad area over the view's area, 1 = one full-screen layer; quads counted whole, sampled once a second): a flight with engine plumes only 0.01; a strike site's blast up to 2.0 layers; Bastion-9's phases 1.0 on average and 6.0 at its death; the endless departure past the burning WARDEN-1 wreck 5.7. Beams and telegraph lanes stay small (at most 0.44 of a layer in the Bastion fight). The boss death is the overdraw peak to watch on a phone: about six screens of soft additive and smoke quads, on High at 1.5× pixel ratio.
- **Low silhouettes** now draw once per batch (before: twice), so Low's craft shadows cost half the draws they did.

## 6. Visual check

No deliberate visible change. Sheet: `docs/screenshots/perf-before-after.jpg` (before | after in pairs). Each still is the same flight frozen at the same tick (held at zero ticks from the launch, pre-rolled, then exactly N one-tick frames and `bench(0, 99)`): the six worlds in flight, Bastion-9 with its flanks down, the salvage yard 0.4 s after its last core falls, and Cold Vector (Veteran) with five live beams, on High; Khepri, the site blast and the beams again on Low.

- Pixel-identical, whole screen with the HUD: Nacre, Umbra, the site blast (High and Low), the beams (High and Low).
- Pixel-identical on the canvas alone (the HUD hidden: the special button's ring and other HUD animations run on the wall clock): Luna, Vesper, the Bastion-9 fight.
- Amnion: 16 pixels differ by at most 2/255. Khepri High: 779 pixels (0.24 %), Khepri Low: 224. The baseline captured twice differs from itself by the same amounts (807 and 242 pixels) in the same places, the outlines of Khepri's crystal beds, so this is run-to-run variation of the baseline, not this change.

## 7. Remaining candidates, by expected gain

None of these was done: each is either a structural change, a visible one, or small. Measure on a phone before choosing.

1. **Terrain generation in a worker.** The section generator runs in a 3 ms slice of every frame while sections are due (0.32 ms a frame on average at 1× CPU in a Khepri flight, about four times that on a midrange phone), and it is the source of most of the per-frame garbage (about 85 % of the 390–900 KB measured). Sections are typed arrays, so they transfer cheaply. The strongest case for a worker split so far (AGENTS.md asks for a measured one); confirm on a phone that the prefetch slice and GC pauses show in its frame times first.
2. **Shadow map on phones.** 1536² with PCF radius 2.6 on High: the depth pass writes 3.2× the drawing buffer's pixels every frame, and every receiving fragment filters it. 1024² would cut the depth fill by 56 % but softens shadow edges (a visible change to show and approve).
3. **No multisampled canvas on High.** The context is created with `antialias: true` for Low; High only draws the composite's full-screen triangle into it (FXAA does its edges), yet pays for 4× multisampled colour and depth/stencil (about 24 MB at 585 × 1266) and a resolve per frame. A per-tier context (or FXAA on Low too) needs a context rebuild on a tier switch.
4. **One merged shadow caster per site part**, as the hero has: a site in view adds 12 shadow draws (the salvage yard), 3 would do. Same silhouettes, so the same shadows.
5. **Render-side terrain height queries.** Low craft shadows (up to 10 landform evaluations per craft per frame), hauler seating (4 per hauler per frame), boss lens seating (28 per frame) and explosion light seating each evaluate the full procedural landform. A height field cached at the ground mesh's own resolution would serve most of them; positions would move within the mesh's interpolation, so it needs a visual check.
6. **World-generation garbage at its source** (`src/world`): `craterAt` returns a new object for every crater cell of every Luna sample (36 per sample), landform results and boxed doubles across `noise` calls. Memoised crater cells (pure per seed and cell) and reused results must stay bit-exact, as the simulation seats ground targets on these heights.
7. **Simulation garbage** (about 25 KB a frame: motion keyframes, airspace sampling, fairness checks): behaviour-neutral reuse is possible but belongs to the simulation's owner.
8. **The menu globes' bake** (`src/ui/planet-preview.ts`) runs in idle time after boot, so a flight launched soon after boot shares its frames' idle time with it and its garbage (about 1 MB per frame-equivalent while it runs). It could pause while a flight runs.
