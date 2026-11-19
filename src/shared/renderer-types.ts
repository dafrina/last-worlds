/* Data types of the renderer port (contracts.ts GameRenderer) that the UI, the playground and the renderer share. */

/** The renderer's per-frame counters (GameRenderer.perfSample; the `?perf` log, src/ui/perf-log.ts). */
export interface PerfSample {
  calls: number; triangles: number; programs: number; geometries: number; textures: number;
  /** Terrain update + animation + prefetch time this frame (ms). */ terrainMs: number;
  /** Terrain stream counters: sections taken from prefetch, generated synchronously after start, at startup. */
  prefetched: number; fallbacks: number; startup: number;
  particles: number; planet: string; quality: string; pixelRatio: number;
}

/**
 * Per-planet light and grade (docs/13 §1, docs/17 §1). Khepri's values are the shipped look. Vesper: a high, pale,
 * slightly cool sun with blue shadows from a cool sky fill, snow kept just under the bloom threshold so it reads
 * bright white without clipping or smearing, a cool shadow lift and a faint white-blue haze toward the horizon.
 */
export interface PlanetLook {
  background: number; sunElevation: number; sun: [number, number]; hemisphere: [number, number, number]; bounce: [number, number];
  shadowIntensity: number; blobShadow: number; lowExposure: number;
  post: { exposure: number; threshold: number; knee: number; strength: number; lift: [number, number, number]; saturation: number; contrast: number; vignette: number;
    haze: [number, number, number, number];
    /**
     * World fog per level (user, 22 October): colour (sRGB hex) and its radiance, height fog [top, full at, amount] set in
     * the lower half of the level's terrain (measured heights), and distance haze [start, density, amount] within it.
     */
    fog: { color: number; energy: number; height: [number, number, number]; distance: [number, number, number] } };
  environment: 'desert' | 'ice' | 'luna' | 'mire' | 'void';
  /**
   * Look-dev only (the playground's toggle): 1 for a sun behind the ship (7:30), 0 ahead of it (10:30). The world's own
   * side is its PlanetProfile.sunBehind (src/world/terrain-planet.ts), which the terrain's baked shading reads too.
   */
  sunBehind?: number;
}
