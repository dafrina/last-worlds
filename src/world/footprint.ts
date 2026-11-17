import { WORLD_HALF } from './terrain-layout';
import { KIT, type KitKind, type ScatterField } from './scenery-kit';
import type { Work } from './terrain-work';

/** What a world's ground offers a footprint (footprintBase). */
export interface Footing {
  /** True where the world's own ground cannot carry a footprint (Umbra: off the plateau; Corona: off the level rock). */
  unsupported(x: number, s: number): boolean;
  /** The lowest ground a footprint may reach down to (Umbra: a little under the plateau); none by default. */
  floor?: number;
}

/**
 * Where a large piece (Umbra's and Corona's landmark structures and pads, docs/38 W1) can stand: the height of its base,
 * or null where it cannot. A centre probe can sit on a narrow peninsula while both wings hang over a canyon, so a grid
 * over the entire rotated footprint (its interior included, with a small foundation margin) is checked: every probe
 * inside the world, on supported ground, off arena platforms and anything built, the ground under it all level within
 * 0.22. The base sits slightly buried in the lowest probe, so a tilted plate meets the foundation instead of leaving
 * daylight. Yields every third grid column: rare large footprint checks stay within the terrain stream's cooperative
 * work budget.
 */
export function* footprintBase(terrain: ScatterField, footing: Footing, kind: KitKind, x: number, s: number, scale: number, rotation: number): Work<number | null> {
  const spec = KIT[kind], hx = spec.halfX * scale + .12, hz = spec.halfZ * scale + .12, floor = footing.floor ?? -Infinity;
  const nx = Math.ceil(hx * 2 / .3), nz = Math.ceil(hz * 2 / .3), c = Math.cos(rotation), sn = Math.sin(rotation);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= nx; i++) {
    if (i % 3 === 0) yield;
    for (let j = 0; j <= nz; j++) {
      const dx = -hx + hx * 2 * i / nx, dz = -hz + hz * 2 * j / nz;
      const px = x + c * dx + sn * dz, ps = s + sn * dx - c * dz;
      if (Math.abs(px) > WORLD_HALF || footing.unsupported(px, ps) || terrain.platform(px, ps) > 0 || terrain.blocked(px, ps)) return null;
      const y = terrain.height(px, ps);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
      if (lo < floor || hi - lo > .22) return null;
    }
  }
  return lo - .045;
}
