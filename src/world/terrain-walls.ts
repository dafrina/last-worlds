import { WORLD_HALF, hash } from './terrain-layout';
import { KIT, type KitInstance, type KitKind, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';

/**
 * Cliff walls (terrain version 15, docs/26 §11): real wall geometry set along cliff rims, after the concept's sheer
 * columnar basalt (Khepri) and fractured ice-shelf walls (Vesper). The heightfield keeps its crisp cliff (version 14);
 * the walls stand in it, front out and downhill, top flush with the rim, scaled in y by the local drop.
 *
 * One candidate per global lattice cell, owned by the section that holds the cell's centre (so every cell is decided
 * once, by one section, whatever the load order). The cell finds the steepest point of a cliff face in it, slides it
 * along the cliff toward the cell's centre (so segments space out evenly along a rim), and walks up to the rim and
 * down to the foot of the sheer face. Segments are about two units wide, so neighbours overlap a little. Pure scenery:
 * never collision, never on roads, pads, districts or arena platforms, never above the scenery cap.
 */
export const WALL_CELL = 1.6;
export interface WallOptions {
  kind: KitKind;
  /** Hash salt of the planet's walls. */
  salt: number;
  /** Least drop (rim over the foot of the sheer face) that gets a wall. */
  minDrop: number;
  /** Scenery cap: wall tops stay under it. */
  cap: number;
  /** Planets with a sea: a wall over water stands on the waterline (its foot just under the surface). */
  sea?: number;
  /** Walls inside a mission arena too (Amnion: THE CRADLE rises out of a flesh canyon there). */
  arenas?: boolean;
  /**
   * Walls whose face turns away from the camera further than this (the forward share of the face's direction, 0 sideways,
   * 1 straight away) are not placed (Vesper, version 19, user 23 October: "only render camera-facing cliffs"). The camera
   * looks forward and down, so such a face is hidden behind its own shelf; the terrain already draws the rim.
   */
  maxAway?: number;
  /** Rim probes this far to either side along the rim: the top follows the highest (Vesper, version 18). */
  rimSpan?: number;
  /** Planet filter on the cliff face, given the face's drop (Luna: highland scarps only). */
  accept?: (x: number, s: number, drop: number) => boolean;
  /**
   * How far an outpost pad's flattening may reach the wall's probes (0.05 by default: well clear of pads). Vesper allows
   * 0.6 (version 19): its harbour outposts stand at the cliffs, and their pads' falloff left long faces beside them bare.
   */
  padReach?: number;
  /**
   * Walls stand in runs (Vesper, version 19, user 23 October: lone pieces on broken shelf edges): a wall is kept only if
   * it belongs to a run of at least this many along one rim (neighbours within 1.7 cells, facing within 45°). A run
   * touching the section's edge is kept (the rest of it lies in the next section).
   */
  minRun?: number;
  /**
   * The segments' scale range (0.85–1.15 by default). Vesper's are larger (user, 23 October: "the cliff models are too
   * small in area ... not seamless with the tops"): wider, so neighbours overlap without gaps, and deeper, so their snowy
   * tops reach back over the terrain's own rounded rim; the top stays flush with the rim (height is set separately).
   */
  scale?: readonly [number, number];
  /**
   * The wall's top over the rim, as a share of its drop (0 by default: flush with the rim). Umbra's shards (tools/blender/
   * umbra_kit.py) put their tallest spikes at the top, so lifting it lets them stand above the lip.
   */
  overtop?: number;
  /** Additional depth below the sampled foot, keeping the rim at the same height. Hides exposed ends in deep canyons. */
  footDepth?: number;
  /** Lowest floor the wall must reach, even when its downhill probe ends on an intermediate shelf. */
  footFloor?: number;
}
/** Probe step for slopes and walks along the gradient (world units). */
const PROBE = 0.125, WALK = 0.1;

export function* cliffWallSteps(seed: number, startS: number, size: number, terrain: ScatterField, o: WallOptions): Work<KitInstance[]> {
  const out: KitInstance[] = [], cell = WALL_CELL, columns = Math.ceil(WORLD_HALF * 2 / cell);
  const height = (x: number, s: number) => terrain.height(x, s);
  const gradient = (x: number, s: number): [number, number] => [
    (height(x + PROBE, s) - height(x - PROBE, s)) / (2 * PROBE), (height(x, s + PROBE) - height(x, s - PROBE)) / (2 * PROBE)];
  const slope = (x: number, s: number) => { const [gx, gs] = gradient(x, s); return Math.hypot(gx, gs); };
  const clear = (x: number, s: number) => Math.abs(x) < WORLD_HALF - 0.3 && !terrain.blocked(x, s) && terrain.industrial(x, s) < (o.padReach ?? 0.05);
  // Cells whose centre lies in this section (half-open), so each cell belongs to exactly one section.
  for (let j = Math.ceil(startS / cell - 0.5); (j + 0.5) * cell < startS + size; j++) {
    yield;
    const cs = (j + 0.5) * cell;
    for (let i = 0; i < columns; i++) {
      const h = (k: number) => hash(seed ^ o.salt, i * 59 + k, j);
      const cx = -WORLD_HALF + (i + 0.5) * cell;
      // The steepest of a 4 × 4 set of probes: a point on a cliff face in this cell.
      let fx = 0, fs = 0, steepest = 0;
      for (let k = 0; k < 16; k++) {
        const x = cx + ((k % 4) - 1.5) * cell / 4, s = cs + (Math.floor(k / 4) - 1.5) * cell / 4, g = slope(x, s);
        if (g > steepest) { steepest = g; fx = x; fs = s; }
      }
      if (steepest < 1.4) continue;
      let [gx, gs] = gradient(fx, fs), n = Math.hypot(gx, gs);
      let ux = gx / n, us = gs / n;
      // Slide along the cliff toward the cell's centre (even spacing along a rim), if the face continues there.
      const t = (cx - fx) * -us + (cs - fs) * ux, sx = fx - us * t, ss = fs + ux * t;
      if (slope(sx, ss) > 1.1) { fx = sx; fs = ss; [gx, gs] = gradient(fx, fs); n = Math.hypot(gx, gs); ux = gx / n; us = gs / n; }
      // The face points downhill, (−ux, −us): skip it when it turns away from the camera (its forward share −us).
      if (o.maxAway !== undefined && -us > o.maxAway) continue;
      // Up to the rim (the ground levels out) and down to the foot of the sheer face (the talus starts).
      let up = 0, down = 0;
      while (up < 2.5 && slope(fx + ux * (up + WALK), fs + us * (up + WALK)) > 0.7) up += WALK;
      while (down < 3 && slope(fx - ux * (down + WALK), fs - us * (down + WALK)) > 1.2) down += WALK;
      const rx = fx + ux * (up + WALK), rs = fs + us * (up + WALK), px = fx - ux * down, ps = fs - us * down;
      // The rim's height across the segment's width, not just at its middle (version 18): the top stays flush where the
      // rim rises to one side instead of letting the bare cliff show over it.
      let top = height(rx, rs);
      if (o.rimSpan) for (const side of [-o.rimSpan, o.rimSpan]) top = Math.max(top, Math.min(top + 0.25, height(rx - us * side, rs + ux * side)));
      let base = height(px, ps);
      if (o.sea !== undefined && base < o.sea) base = o.sea - 0.25;
      if (top - base < o.minDrop) continue;
      if (o.accept && !o.accept(fx, fs, top - base)) continue;
      // The pivot stands into the face from its foot: the front relief just out from the foot, the body inside the
      // slope, the top (just over the rim height) reaching back onto the top.
      const width = Math.hypot(rx - px, rs - ps), inset = Math.min(1.2, Math.max(0.3, width * 0.5));
      const x = px + ux * inset, s = ps + us * inset;
      // Only against ground that carries on behind the wall: no walls (nor smaller pieces) on knife-edge ridges or slivers.
      if (height(x + ux * 1.1, s + us * 1.1) < base + (top - base) * 0.5) continue;
      if (!clear(x, s) || !clear(px, ps) || !clear(rx, rs) || !clear(x - us * 1, s + ux * 1) || !clear(x + us * 1, s - ux * 1)) continue;
      const y = Math.min(base - 0.12 - (o.footDepth ?? 0), o.footFloor ?? Infinity), rise = Math.min(o.cap, top + 0.03 + (o.overtop ?? 0) * (top - base)) - y, spec = KIT[o.kind], scale = o.scale ? o.scale[0] + h(2) * (o.scale[1] - o.scale[0]) : 0.85 + h(2) * 0.3;
      // Never on an arena's platform or ramps (the wall's own row, not just its cell's), never past the world's edge.
      if (rise < o.minDrop * 0.8 || Math.abs(x) + spec.radius * scale > WORLD_HALF || (!o.arenas && (terrain.platform(x, s) > 0 || terrain.platform(rx, rs) > 0))) continue;
      const wall: KitInstance = {
        kind: o.kind, variant: Math.floor(h(1) * spec.variants), x, s, y,
        // A ±15% stretch along the rim; segments stay continuous at about one per cell.
        scale, height: rise / spec.height,
        // +Z (the front) out and downhill: the rotation that maps local +Z to world (−ux, −us).
        rotation: Math.atan2(-ux, us), shade: terrain.shade(x, s), cosmetic: false,
      };
      out.push(wall);
    }
  }
  return o.minRun ? inRuns(out, o.minRun, startS, size) : out;
}

/** The walls that belong to runs of at least `min` along one rim, or to runs that reach the section's edges. */
function inRuns(walls: KitInstance[], min: number, startS: number, size: number): KitInstance[] {
  const reach = WALL_CELL * 1.7, parent = walls.map((_, i) => i);
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i], b = walls[j], turn = Math.abs(Math.atan2(Math.sin(a.rotation - b.rotation), Math.cos(a.rotation - b.rotation)));
    if (Math.hypot(a.x - b.x, a.s - b.s) < reach && turn < Math.PI / 4) parent[root(i)] = root(j);
  }
  const runs = new Map<number, { size: number; edge: boolean }>();
  for (let i = 0; i < walls.length; i++) {
    const run = runs.get(root(i)) ?? { size: 0, edge: false };
    run.size++; run.edge ||= walls[i].s - startS < reach || startS + size - walls[i].s < reach;
    runs.set(root(i), run);
  }
  return walls.filter((_, i) => { const run = runs.get(root(i))!; return run.size >= min || run.edge; });
}
