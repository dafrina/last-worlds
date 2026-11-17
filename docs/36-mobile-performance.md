# Mobile performance

How frame cost is kept down for phones: the budgets, how performance is measured, the rendering rules earlier passes
established, the latest numbers, what has never been measured, and the remaining candidates. The budgets and quality
tiers are in [technical design § 9](05-technical-design.md#9-performance-budgets-and-quality).

## Budgets

On a repeatable stress flight: **High** p95 frame time ≤ 20 ms, **Low** p95 ≤ 35 ms, no repeated hitches over 100 ms in
combat after loading ([docs/06 § 4](06-delivery-and-validation.md#4-phones-and-performance-criteria)); profiling guardrail
100 draw calls and 180k triangles a frame; the terrain alone within `tests/world/terrain-budget.test.ts`.

## What can and cannot be measured here

Headless Chromium draws with SwiftShader, a CPU rasterizer. GPU time, fill rate, heat, battery and a phone's frame pacing
are not measured by the tools, and no phone benchmark has been run. The tools measure main-thread JavaScript work per frame
(simulation, `render()`, UI), usually under 4× CPU throttling, plus load-independent counts: draw calls, program switches,
texture uploads, allocations, heap. The machine's load from other sessions moves timings by ±20%, so counts are the
reliable signal.

The only phone data so far is a `?perf` log the user recorded on an iPhone (6 November): 59.9 frames a second on screen,
but Safari's frame timestamps jitter around the refresh, which made the world step unevenly. Since then each frame advances
a whole number of refresh periods and carries the remainder (`src/shared/frame-pacing.ts`).

## Method

- **`tools/perf/bench.mjs`:** each scenario launches a fixed flight (seed 4242), pre-rolls it unrendered, then renders it at
  exactly one tick per frame (three for rapid scrolling) with a scripted weave, so every run does identical work. It
  records per-frame JS work (mean, p95, p99, max, frames over 16.7, 33 and 100 ms), long tasks, a CPU profile, allocation
  (`PERF_ALLOC=1`) and the renderer's counters. Scenarios include a strike site's destruction, Cold Vector's lasers on
  Veteran, Final Horizon's densest wave, BASTION-9's phases, rapid scrolling, an endless jump, and boss fights per world.
- **`tools/perf/soak.mjs`:** `endless` flies one endless run through its planet jumps and records the heap after GC and the
  renderer's memory at every sector and planet change; `restarts` launches each world in turn and quits to the menu.
- **In the game:** `?perf` shows a frame-time overlay (`src/ui/perf-overlay.ts`) and exports a flight's frame log from the
  results screen (`src/ui/perf-log.ts`), for measuring on a phone. The renderer's counters are on the canvas's
  `data-render-stats`.
- **Visual check:** frozen frames of the same flight at the same tick before and after a change, compared pixel by pixel.

## Rules the earlier passes established

All in `src/render/`; none changes the simulation or collision timing.

- **No uploads mid-flight.** Textures upload only in hidden warm-ups (the launch warp, a jump's flash); a world's assets
  preload during the boss sector and upload under the flash (`tests/browser/performance.spec.ts`). No shader compiles
  mid-flight (`tests/browser/asset-readiness.spec.ts`).
- **No program switches per frame.** Instanced shadow casters use their own depth material; instanced copies of a material
  (BASTION-9's track links) are their own materials; transparent double-sided built-in materials that draw the same pixels
  in one pass use `forceSinglePass` (Low craft silhouettes, flat effect rings).
- **Empty batches are hidden** (`visible = count > 0`), so they cost no render-list entry or program setup.
- **Dynamic pools upload only their live range;** the world-matrix update skips hidden subtrees (`updateShown`).
- **Boss seating walks its footprint row by row,** so the terrain builds each row once.
- **Less per-frame garbage:** the simulation filters arrays in place (`src/shared/retain.ts`), `render()` reuses its scratch
  objects, and the boss views pool their particles.
- `tests/render/draw-passes.test.ts` and `tests/render/site-textures.test.ts` guard these.

## Latest numbers

**3 November** (4× CPU, SwiftShader, 390 × 844): steady flight draws about 33–42 calls (shadow 2–7, main 24–31, post 6); a
strike site in view raises High to about 100 (shadow about 29). Zero program lookups a frame in every probed scene, no
visible empty batch, and the endless preload hitch (300–540 ms) is gone (worst frame in the first 10 s of endless: 29 ms).
Long sessions do not leak: over 463 s of endless the heap after GC grew only at each world's first visit (31.9 → 34.4 MB),
and seven launch-and-quit cycles over every world returned to the menu at about the same heap.

**9 November:** in-place filtering and pooling cut per-frame allocation outside terrain generation by 13–19% in every bench
scenario.

Terrain generation dominates what remains: it runs in a 3 ms slice of a frame while sections are due and makes most of the
per-frame garbage (about 85% of 390–900 KB in a frame). The jump's flash frame is long (0.6–1.1 s on SwiftShader) because
the hidden warm-up waits for the next world there.

## GPU-side estimates (not measured on a GPU)

- **Resolution:** High caps the pixel ratio at 1.5, Low at 1: on a 390 × 844 pt phone that is 0.74 Mpx on High and 0.33
  Mpx on Low.
- **High's full-screen layers:** the scene into a half-float HDR target, the composite (FXAA, fog, bloom, grade) to the
  canvas, and the bloom chain at ¼ to 1/16 resolution. Low draws straight to the canvas.
- **Shadow map (High only):** `SHADOW_MAP_SIZE` (`src/render/scene.ts`) squared depth texels a frame, PCF-filtered by every
  receiving fragment; 2–7 draws in flight, around 30 with a boss or a strike site in view.
- **Canvas multisampling:** the context is created with `antialias: true`, which Low uses; on High it multisamples a canvas
  that only receives the composite's full-screen triangle.
- **Transparent fill** (`fxCoverage` and `laneCoverage` in the render stats, 1 = one full-screen layer): plain flight about
  0.01; a strike site's blast up to 2; a boss's death up to 6.

## Remaining candidates, by expected gain

None is done; each is structural, visible, or small. Measure on a phone before choosing.

1. **Terrain generation in a worker:** the strongest case, removing most per-frame work and garbage while sections are due.
   Sections are typed arrays, so they transfer cheaply.
2. **A smaller shadow map on phones:** 1024² would cut the depth fill by more than half but softens shadow edges (a visible
   change for the user to approve).
3. **No multisampled canvas on High:** a per-tier context, which needs a rebuild on a tier switch.
4. **One merged shadow caster per strike-site part,** as the hero has: about 12 shadow draws down to 3 at a site.
5. **Cached terrain heights for render-side queries** (Low craft shadows, hauler seating, boss lens seating, explosion
   lights), which now evaluate the full procedural landform.
6. **World-generation garbage at its source** (`src/world`: crater cells, landform results, boxed doubles in noise),
   bit-exact, since the simulation seats ground targets on these heights.
7. **Pausing the menu globes' bake** (`src/ui/planet-preview.ts`) while a flight runs.
