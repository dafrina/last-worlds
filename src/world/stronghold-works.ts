import { terrainHeight } from './terrain-ground';
import { PIPE_AXIS, elbowPiece, pipeBetween, supportStack, type Ground, type IndustryPiece, type Vec } from './terrain-network';
import { MODULE_HEIGHT } from './terrain-settlements';
import { STRONGHOLD_LEDGE, VESPER_PIECE_MAX, VESPER_SEA_LEVEL } from './terrain-vesper';
import type { Archetype } from './settlement-geometry';
import type { World } from './terrain-planet';

/** A Vesper outpost piece standing on the ground (TerrainProp's shape; src/world/terrain.ts). */
interface WorksProp {
  id: string; node: string; x: number; s: number; rotation: number; baseHeight: number; height: number; group: string; archetype: Archetype; cosmetic?: boolean;
}
/**
 * HELION STRONGHOLD's works (user, 18 November: "maybe also have pipes running to and from it horizontally and connected
 * infrastructure up front"): a pumping station on the low ground before each side of the front cliff (a processing hall,
 * tanks and a comm mast, Vesper's kits), a large pipeline from each running in to the cliff's foot, climbing it to the
 * fortress's ledge and turning along the ledge before the fortress's front, out to the side mountain, into whose rock it
 * runs. Fixed places in the arena's frame (arena-relative s), mirrored; decorative only (nothing targetable), every piece
 * under VESPER_PIECE_MAX and the flight plane; scenery keeps off them (they are a section's industry and props).
 *
 * `size`, `node` arm: the network's large pipe, its elbows (arms one unit long) and its supports (src/world/terrain-network.ts).
 */
const WORKS = {
  /**
   * The pipeline's column beside the reactor door, and how far before the plan's front its corner on the ledge stands at
   * most (clear of the fortress's scenery exclusion, src/render/stronghold-view.ts STRONGHOLD_FOOTPRINT).
   */
  column: 1.9, ledge: 0.85,
  /** Its climb up the cliff (rise per unit forward), and how far before the cliff's foot the station's hall stands. */
  slope: 0.7, station: 3.4,
  /** How far out the ledge line runs (into the side mountain's rock beyond), and the farthest the ledge's edge is looked for. */
  out: 10.5, search: 16,
} as const;
const GROUP = 'stronghold:works';

/** The works pieces of the arena that fall in [startS, startS + size). */
export function strongholdWorks(seed: number, startS: number, size: number, world: World): { props: WorksProp[]; industry: IndustryPiece[] } {
  const props: WorksProp[] = [], industry: IndustryPiece[] = [], arena = world.arena;
  if (world.planet.id !== 'vesper' || !arena) return { props, industry };
  const L = STRONGHOLD_LEDGE, front = arena.fromS + L.front;
  if (startS > front + 1 || startS + size < front - WORKS.search - 12) return { props, industry };
  const ground: Ground = (x, s) => terrainHeight(seed, x, s, world), own = (s: number) => s >= startS && s < startS + size;
  const pipes: IndustryPiece[] = [];
  for (const side of [-1, 1]) {
    const x = side * WORKS.column, tag = side < 0 ? 'l' : 'r', level = L.level + 0.05, axis = level + PIPE_AXIS;
    // Down the column from the fortress: the ledge's edge (the last ground at its level) and the cliff's foot, wherever the
    // arena's ledge runs out to (src/world/terrain-vesper.ts strongholdReach).
    const near = front - WORKS.ledge;
    let edge = near;
    while (edge > front - WORKS.search && ground(x, edge - 0.25) > L.level - 0.35) edge -= 0.25;
    let base = edge;
    while (base > edge - 5 && ground(x, base - 0.25) < ground(x, base) - 0.02) base -= 0.25;
    // The climb's top stands at the ledge's edge; a long ledge carries the line on along it to the corner before the
    // fortress, where it turns out along the fortress's front.
    const top = edge - 0.1, long = near - top >= 2.5, end = long ? near : top;
    // (The station keeps to dry ground: a lead at the cliff's foot moves it back toward the camera.)
    const dry = (s: number) => [-1.7, 0, 1.7].every(d => [-1.2, 0, 1.2].every(e => ground(side * 3.2 + d, s + e) > VESPER_SEA_LEVEL + 0.1));
    let station = base - WORKS.station;
    for (let k = 0; k < 8 && !dry(station); k++) station -= 0.75;
    const hall = ground(side * 3.2, station);
    const run = Math.max(hall, ground(x, station + 1.5), ground(x, base)) + 0.02;
    const rise = level - run, foot = top - rise / WORKS.slope;
    const up: Vec = (() => { const d = Math.hypot(rise, top - foot); return [0, rise / d, -(top - foot) / d]; })();
    const down: Vec = [-up[0], -up[1], -up[2]], toward: Vec = [0, 0, 1], away: Vec = [0, 0, -1], along: Vec = [side, 0, 0];
    // The ledge line, out along the fortress's front into the side mountain (a straight per two units, racks under it).
    pipes.push(elbowPiece(`${GROUP}:${tag}:corner`, 'pipe_l_elbow', GROUP, x, end, level, long ? toward : down, along));
    for (let k = 0, x0 = x + side; Math.abs(x0) < WORKS.out; k++, x0 += side * 2) {
      const x1 = x0 + side * 2, mid = (x0 + x1) / 2;
      // (Where the rock has risen over it the line has gone into the mountain.)
      if (ground(x0, end) > axis + 0.3 && ground(x1, end) > axis + 0.3) break;
      pipes.push(pipeBetween(`${GROUP}:${tag}:ledge${k}`, 'pipe_l_straight', GROUP, [x0, axis, -end], [x1, axis, -end]));
      supportStack(pipes, ground, `${GROUP}:${tag}:ledge${k}:support`, GROUP, mid, end, level, along, true, 0.56);
    }
    if (long) {
      pipes.push(elbowPiece(`${GROUP}:${tag}:top`, 'pipe_l_elbow', GROUP, x, top, level, down, away));
      const span = end - top - 2, tiles = Math.max(1, Math.round(span / 2));
      for (let k = 0; k < tiles; k++) {
        const s0 = top + 1 + span * k / tiles, s1 = top + 1 + span * (k + 1) / tiles;
        pipes.push(pipeBetween(`${GROUP}:${tag}:shelf${k}`, 'pipe_l_straight', GROUP, [x, axis, -s0], [x, axis, -s1]));
        supportStack(pipes, ground, `${GROUP}:${tag}:shelf${k}:support`, GROUP, x, (s0 + s1) / 2, level, away, true, 0.56);
      }
    }
    // The climb: a straight from the foot's bend to the top's, held off the cliff by a tower at its middle.
    pipes.push(elbowPiece(`${GROUP}:${tag}:foot`, 'pipe_l_elbow', GROUP, x, foot, run, toward, up));
    const a: Vec = [x + up[0], run + PIPE_AXIS + up[1], -foot + up[2]], b: Vec = [x + down[0], axis + down[1], -top + down[2]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 0.2) pipes.push(pipeBetween(`${GROUP}:${tag}:climb`, 'pipe_l_straight', GROUP, a, b));
    supportStack(pipes, ground, `${GROUP}:${tag}:climb:tower`, GROUP, x, (foot + top) / 2, (run + level) / 2 - 0.2, toward, true, 0.56);
    // In from the station: level straights along the corridor to the foot's bend.
    for (let k = 0, s1 = foot - 1; s1 - 2 >= station + 1.2; k++, s1 -= 2) {
      pipes.push(pipeBetween(`${GROUP}:${tag}:in${k}`, 'pipe_l_straight', GROUP, [x, run + PIPE_AXIS, -(s1 - 2)], [x, run + PIPE_AXIS, -s1]));
      supportStack(pipes, ground, `${GROUP}:${tag}:in${k}:support`, GROUP, x, s1 - 1, run, toward, true, 0.56);
    }
    // The station: a processing hall at the line's end, tanks beside it, a comm mast.
    const stand = (id: string, node: string, px: number, ps: number, rotation = 0) => {
      const base = ground(px, ps) - 0.02, height = MODULE_HEIGHT[node] ?? 1;
      if (base < VESPER_SEA_LEVEL + 0.05) return;
      if (base + height > VESPER_PIECE_MAX || !own(ps)) return;
      props.push({ id: `${GROUP}:${tag}:${id}`, node, x: px, s: ps, rotation, baseHeight: base, height, group: GROUP, archetype: 'plant' });
    };
    const shared = (id: string, node: IndustryPiece['node'], px: number, ps: number, rotation = 0) => {
      const y = ground(px, ps) - 0.02, height = MODULE_HEIGHT[node] ?? 1;
      if (y < VESPER_SEA_LEVEL + 0.05) return;
      if (y + height > VESPER_PIECE_MAX || !own(ps)) return;
      industry.push({ id: `${GROUP}:${tag}:${id}`, node, x: px, s: ps, y, rotation, pitch: 0, roll: 0, scaleY: 1, scaleZ: 1, group: GROUP });
    };
    shared('hall', 'facility', side * 3.2, station - 0.4, side < 0 ? 0 : Math.PI);
    shared('tank0', 'tank_vertical_0', side * 5.15, station + 1.1);
    shared('tank1', 'tank_vertical_0', side * 5.25, station - 0.5);
    shared('sphere', 'tank_sphere', side * 5.0, station - 2.3);
    stand('mast', 'vesper_comm_needle', side * 6.6, station + 2.4);
  }
  for (const piece of pipes) if (own(piece.s) && piece.y + 0.8 < VESPER_PIECE_MAX) industry.push(piece);
  return { props, industry };
}
