import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { INFRA_NODES } from '../../src/render/terrain-kit';
import { industryMatrix } from '../../src/render/terrain-view';
import {
  PIPE_AXIS, PIPE_BEDDING, ROAD_MAX_SLOPE, SCENERY_MAX_HEIGHT, SHARED_BOUNDS, SUPPORT_HEIGHT, VIEW_HALF, edgesNear, pieceBounds, pipeRun,
  settlementsNear, terrainHeight, type IndustryPiece, type NetworkEdge, type SharedNode,
} from './network-helpers';

const SEEDS = [11, 93, 8831, 4242], SPAN = 1500;
type Point = [x: number, s: number, y: number];
/** Pipe body radius per node (the valve body matches the large line). */
const radius = (piece: IndustryPiece) => piece.node.startsWith('pipe_s_') ? 0.08 : 0.155;
const pipeEdges = (seed: number) => edgesNear(seed, 0, SPAN).filter(edge => edge.pipe && edge.a.s >= 0 && edge.a.s <= SPAN);

/** Centreline segments of a pipe piece in world (x, s, y), through the same matrix the renderer uses. */
function centreline(piece: IndustryPiece): [Point, Point][] {
  const matrix = industryMatrix(piece, 0, new Matrix4());
  const at = (x: number, z: number): Point => { const v = new Vector3(x, PIPE_AXIS, z).applyMatrix4(matrix); return [v.x, -v.z, v.y]; };
  if (piece.node.endsWith('_elbow')) { const corner = at(0, 0); return [[at(0, -1), corner], [corner, at(1, 0)]]; }
  return [[at(0, -1), at(0, 1)]];
}
/** Points every ~5 cm along a segment, with its unit direction. */
function* along([a, b]: [Point, Point]) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], length = Math.hypot(...d), steps = Math.max(1, Math.ceil(length / 0.05));
  for (let k = 0; k <= steps; k++) yield { p: [a[0] + d[0] * k / steps, a[1] + d[1] * k / steps, a[2] + d[2] * k / steps] as Point, up: d[2] / length };
}

interface Column { x: number; s: number; pieces: IndustryPiece[]; top: number; rack: boolean }
function columnsOf(pieces: readonly IndustryPiece[]): Column[] {
  const columns = new Map<string, IndustryPiece[]>();
  for (const piece of pieces) if (piece.node === 'pipe_support') {
    const key = `${piece.x.toFixed(5)}:${piece.s.toFixed(5)}`;
    columns.set(key, [...(columns.get(key) ?? []), piece]);
  }
  return [...columns.values()].map(list => {
    list.sort((a, b) => a.y - b.y);
    const last = list[list.length - 1];
    return { x: last.x, s: last.s, pieces: list, top: last.y + SUPPORT_HEIGHT * last.scaleY, rack: last.id.endsWith(':rack') };
  });
}

describe('pipelines (docs/14: pitched runs, risers, trestles)', () => {
  it('connects at least 95% of pipeline edges end to end across seeds', () => {
    let total = 0, reached = 0;
    for (const seed of SEEDS) for (const edge of pipeEdges(seed)) { total++; if (pipeRun(seed, edge).reached) reached++; }
    expect(total).toBeGreaterThan(100);
    expect(reached / total).toBeGreaterThanOrEqual(0.95);
  });

  it('lays joined-up lines whose pipes never float or cut through terrain', () => {
    let risers = 0, trestles = 0, steepest = 0, resting = 0;
    for (const seed of SEEDS) for (const edge of pipeEdges(seed) as NetworkEdge[]) {
      const run = pipeRun(seed, edge), pipes = run.pieces.filter(piece => piece.node !== 'pipe_support'), columns = columnsOf(run.pieces);
      if (!pipes.length) continue;
      // Every piece stays inside the world and under the scenery cap, so sections never drop one.
      for (const piece of run.pieces) {
        const box = pieceBounds(piece);
        expect(box.maxY).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT + 1e-6);
        expect(Math.max(-box.minX, box.maxX)).toBeLessThanOrEqual(VIEW_HALF);
      }
      // Joined up: every centreline end meets another piece's end, except the line's two free ends.
      const ends = pipes.flatMap(piece => { const segments = centreline(piece); return [segments[0][0], segments[segments.length - 1][1]]; });
      const loose = ends.filter((end, i) => !ends.some((other, j) => j !== i && Math.hypot(end[0] - other[0], end[1] - other[1], end[2] - other[2]) < 1e-3));
      expect(loose.length).toBe(2);
      // Support columns stand on the ground, frames stacked without gaps.
      for (const column of columns) {
        // (A rack within 2 cm of the ground stands on it directly.)
        expect(Math.abs(column.pieces[0].y - terrainHeight(seed, column.x, column.s))).toBeLessThanOrEqual(0.021);
        column.pieces.slice(1).forEach((piece, k) => expect(piece.y).toBeCloseTo(column.pieces[k].y + SUPPORT_HEIGHT * column.pieces[k].scaleY, 6));
      }
      const held = new Set<Column>();
      // A valve station stands on its own pedestal, on the ground or on a stand of frames.
      const valves = pipes.filter(piece => piece.node === 'pipe_valve' && (Math.abs(piece.y - terrainHeight(seed, piece.x, piece.s)) <= 0.021
        || columns.some(column => Math.hypot(column.x - piece.x, column.s - piece.s) < 1e-6 && Math.abs(column.top - piece.y) < 1e-6)));
      for (const piece of pipes) for (const segment of centreline(piece)) for (const { p, up } of along(segment)) {
        const [x, s, y] = p, r = radius(piece), steep = Math.abs(up) > 0.7, ground = terrainHeight(seed, x, s);
        // Never cuts through terrain: the tube's underside clears the ground (a resting line may bed in the dust),
        // and a riser's tube wall clears the cliff beside it.
        const underside = y - r * Math.sqrt(1 - up * up);
        expect(underside).toBeGreaterThanOrEqual(ground - PIPE_BEDDING - 0.01);
        if (steep) for (const [dx, ds] of [[r, 0], [-r, 0], [0, r], [0, -r]]) expect(y).toBeGreaterThanOrEqual(terrainHeight(seed, x + dx, s + ds) - 0.01);
        // Never floats: off the ground, a support column carries the line within 1.6 units (a riser's tower beside it).
        const near = [...columns, ...valves].filter(column => Math.hypot(column.x - x, column.s - s) <= (steep ? 0.45 : 1.6));
        if (underside - ground > 0.12 || steep) expect(near.length, `${edge.id} ${piece.id} at ${x.toFixed(2)},${s.toFixed(2)}`).toBeGreaterThan(0);
        else resting++;
        // A column holds the pipe where it stands: a rack at the pipe's base level, or a stand under its underside.
        for (const column of columns) if (Math.hypot(column.x - x, column.s - s) < 0.03 && !steep) {
          if (Math.abs(column.rack ? column.pieces[column.pieces.length - 1].y + PIPE_AXIS - y : column.top - underside) < 0.06) held.add(column);
        }
        if (!steep) steepest = Math.max(steepest, Math.abs(up));
      }
      for (const column of columns) {
        const valve = pipes.some(piece => piece.node === 'pipe_valve' && Math.abs(piece.x - column.x) < 1e-6 && Math.abs(piece.s - column.s) < 1e-6 && Math.abs(piece.y - column.top) < 1e-6);
        expect(held.has(column) || valve, `${edge.id} column at ${column.x.toFixed(2)},${column.s.toFixed(2)} holds nothing`).toBe(true);
      }
      risers += pipes.filter(piece => piece.id.endsWith(':top')).length;
      trestles += columns.filter(column => column.top - terrainHeight(seed, column.x, column.s) > 2).length;
    }
    // The new forms all occur: risers up cliffs, tall trestle supports over canyons, runs steeper than roads.
    expect(risers).toBeGreaterThan(5);
    expect(trestles).toBeGreaterThan(5);
    expect(Math.atan(steepest / Math.sqrt(1 - steepest * steepest))).toBeGreaterThan(Math.atan(ROAD_MAX_SLOPE));
    expect(resting).toBeGreaterThan(0);
  });

  it('keeps pipelines off outpost modules', () => {
    for (const seed of SEEDS) {
      const modules = settlementsNear(seed, -40, SPAN + 40).flatMap(site => site.modules).filter(module => module.kind !== 'kit');
      for (const edge of pipeEdges(seed)) for (const piece of pipeRun(seed, edge).pieces) {
        if (piece.node === 'pipe_support') continue;
        const box = pieceBounds(piece);
        for (const module of modules) {
          const size = module.kind === 'infra' ? INFRA_NODES[module.node]?.size ?? [1, 1, 1] : [SHARED_BOUNDS[module.node as SharedNode].halfX * 2, 0, SHARED_BOUNDS[module.node as SharedNode].halfZ * 2];
          // Footprint core (80% of the half extent): pieces may brush a module's edge, never run through it.
          const core = Math.max(size[0], size[2]) / 2 * 0.8;
          const overlaps = module.x + core > box.minX && module.x - core < box.maxX && module.s + core > box.minS && module.s - core < box.maxS;
          expect(overlaps, `${seed} ${piece.id} through ${module.node}`).toBe(false);
        }
      }
    }
  });
});
