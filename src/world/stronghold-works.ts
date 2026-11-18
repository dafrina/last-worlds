import { terrainHeight } from './terrain-ground';
import { hash } from './terrain-layout';
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
 * infrastructure up front", then "dont use more than one pipeline tho, connect them properly"): one pumping station on the
 * low ground before the cliff (a processing hall, tanks and a comm mast, Vesper's kits) and one large pipeline, continuous
 * from inside the hall: in along the low ground to the cliff's foot, up the cliff's tiers in one penstock on towers, along
 * the ledge to the fortress's front and out along it into the mountain's rock beside the fortress (or, failing rock, down
 * into the ledge). Every end goes into the hall or the rock; every bend is an elbow. Its side is the arena's own; its places
 * follow the ledge and its tiers (src/world/terrain-vesper.ts). Decorative only (nothing targetable), every piece under
 * VESPER_PIECE_MAX and the flight plane; scenery keeps off it (it is a section's industry and props).
 *
 * The network's large pipe, its elbows (arms one unit long) and its supports (src/world/terrain-network.ts).
 */
const WORKS = {
  /**
   * The pipeline's column beside the reactor door, and how far before the plan's front its corner on the ledge stands at
   * most (clear of the fortress's scenery exclusion, src/render/stronghold-view.ts STRONGHOLD_FOOTPRINT).
   */
  column: 1.9, ledge: 0.85,
  /** The penstock's steepest climb (rise per unit forward), and how far before the cliff's foot the hall stands. */
  slope: 0.75, station: 3.4,
  /** The farthest the ledge line runs out looking for rock, and the farthest the cliff's foot is looked for. */
  out: 11.4, search: 12,
} as const;
const GROUP = 'stronghold:works';

/** The works pieces of the arena that fall in [startS, startS + size). */
export function strongholdWorks(seed: number, startS: number, size: number, world: World): { props: WorksProp[]; industry: IndustryPiece[] } {
  const props: WorksProp[] = [], industry: IndustryPiece[] = [], arena = world.arena;
  if (world.planet.id !== 'vesper' || !arena) return { props, industry };
  const L = STRONGHOLD_LEDGE, front = arena.fromS + L.front;
  if (startS > front + 1 || startS + size < front - WORKS.search - 14) return { props, industry };
  const ground: Ground = (x, s) => terrainHeight(seed, x, s, world), own = (s: number) => s >= startS && s < startS + size;
  const pipes: IndustryPiece[] = [];
  const side = hash(seed ^ 0x5760, Math.round(arena.fromS * 4), 0) < 0.5 ? -1 : 1, x = side * WORKS.column;
  const level = L.level + 0.05, axis = level + PIPE_AXIS;
  // The ledge's edge at a given x (the last ground at its level, walking from the fortress toward the camera), and the cliff's
  // foot below its tiers in the pipeline's column (where the ground stops falling for good).
  const near = front - WORKS.ledge, edgeAt = (px: number) => {
    let s = near;
    while (s > front - WORKS.search && ground(px, s - 0.25) > L.level - 0.35) s -= 0.25;
    return s;
  };
  const edge = edgeAt(x);
  let base = edge, low = ground(x, edge);
  for (let s = edge; s > edge - 8; s -= 0.25) { const h = ground(x, s); if (h < low - 0.05) { low = h; base = s; } }
  // The line along the fortress's front keeps to the ledge across its whole run: as far back as its most recessed edge.
  let run = edge;
  for (let px = x; Math.abs(px) <= WORKS.out - 2; px += side) run = Math.max(run, edgeAt(px));
  const end = Math.min(near, run + 0.1);
  // (The hall keeps to dry ground: a lead before the cliff moves it back toward the camera.)
  const dry = (s: number) => [-1.7, 0, 1.7].every(d => [-1.2, 0, 1.2].every(e => ground(side * 3.2 + d, s + e) > VESPER_SEA_LEVEL + 0.1));
  let station = base - WORKS.station;
  for (let k = 0; k < 8 && !dry(station); k++) station -= 0.75;
  const hall = station - 0.4, floor = Math.max(ground(side * 3.2, hall), ground(x, hall + 1.5), ground(x, base)) + 0.02;
  // The penstock: one straight from the low ground up over the tiers, its top at the ledge's edge in the column (or at the
  // corner's arm when the ledge there is short), long enough to clear every tier's lip under it. Its bends are slight, so
  // its straights simply meet (as the network's pitched runs do); only the turn along the fortress's front is an elbow.
  const long = end - 1 - edge >= 2, top = long ? edge - 0.1 : end - 1, rise = level - floor;
  let reach = rise / WORKS.slope;
  for (let s = Math.min(top - 1, edge - 0.3); s > top - 8; s -= 0.25) {
    const lip = ground(x, s) + 0.6 - level, along = top - s;
    if (lip > -rise && lip < 0) reach = Math.max(reach, along * rise / -lip);
  }
  // (No flatter than about 24°: a lip just under the line takes a tower instead.)
  const foot = top - Math.min(reach, rise / 0.45, top - hall - 2.2), toward: Vec = [0, 0, 1], along: Vec = [side, 0, 0];
  pipes.push(pipeBetween(`${GROUP}:climb`, 'pipe_l_straight', GROUP, [x, floor + PIPE_AXIS, -foot], [x, axis, -top]));
  for (const f of [0.3, 0.65]) {
    const s = foot + (top - foot) * f, y = floor + (level - floor) * f;
    if (ground(x, s) < y - 0.3) supportStack(pipes, ground, `${GROUP}:climb:tower${f}`, GROUP, x, s, y - 0.25, toward, true, 0.56);
  }
  // A long ledge: on along it from the penstock's top to the corner's arm.
  if (long) for (let k = 0, s0 = top; s0 < end - 1 - 0.05; k++, s0 += 2) {
    const s1 = Math.min(end - 1, s0 + 2);
    pipes.push(pipeBetween(`${GROUP}:shelf${k}`, 'pipe_l_straight', GROUP, [x, axis, -s0], [x, axis, -s1]));
    supportStack(pipes, ground, `${GROUP}:shelf${k}:support`, GROUP, x, (s0 + s1) / 2, level, toward, true, 0.56);
  }
  // The turn and the line along the fortress's front, outward, until the mountain's rock has taken it; failing rock, down
  // into the ground.
  pipes.push(elbowPiece(`${GROUP}:corner`, 'pipe_l_elbow', GROUP, x, end, level, toward, along));
  let x0 = x + side, buried = false;
  for (let k = 0; Math.abs(x0 + side * 2) < WORKS.out && !buried; k++) {
    if (ground(x0, end) > axis + 0.3) { buried = true; break; }
    const x1 = x0 + side * 2;
    pipes.push(pipeBetween(`${GROUP}:ledge${k}`, 'pipe_l_straight', GROUP, [x0, axis, -end], [x1, axis, -end]));
    supportStack(pipes, ground, `${GROUP}:ledge${k}:support`, GROUP, (x0 + x1) / 2, end, level, along, true, 0.56);
    x0 = x1; buried = ground(x1, end) > axis + 0.3;
  }
  if (!buried) {
    const xd = x0 + side, g = ground(xd, end);
    pipes.push(elbowPiece(`${GROUP}:dive`, 'pipe_l_elbow', GROUP, xd, end, level, [-side, 0, 0], [0, -1, 0]));
    pipes.push(pipeBetween(`${GROUP}:dive:into`, 'pipe_l_straight', GROUP, [xd, axis - 1, -end], [xd, Math.min(axis - 1.2, g - 0.6), -end]));
  }
  // In from the hall: level straights along the low ground to the penstock's foot, the first starting inside the hall.
  for (let k = 0, s1 = foot; s1 > hall + 0.05; k++, s1 -= 2) {
    const s0 = Math.max(hall, s1 - 2);
    pipes.push(pipeBetween(`${GROUP}:in${k}`, 'pipe_l_straight', GROUP, [x, floor + PIPE_AXIS, -s0], [x, floor + PIPE_AXIS, -s1]));
    supportStack(pipes, ground, `${GROUP}:in${k}:support`, GROUP, x, (s0 + s1) / 2, floor, toward, true, 0.56);
  }
  // The station: the processing hall the line comes out of, tanks beside it, a comm mast.
  const stand = (id: string, node: string, px: number, ps: number, rotation = 0) => {
    const baseHeight = ground(px, ps) - 0.02, height = MODULE_HEIGHT[node] ?? 1;
    if (baseHeight < VESPER_SEA_LEVEL + 0.05 || baseHeight + height > VESPER_PIECE_MAX || !own(ps)) return;
    props.push({ id: `${GROUP}:${id}`, node, x: px, s: ps, rotation, baseHeight, height, group: GROUP, archetype: 'plant' });
  };
  const shared = (id: string, node: IndustryPiece['node'], px: number, ps: number, rotation = 0) => {
    const y = ground(px, ps) - 0.02, height = MODULE_HEIGHT[node] ?? 1;
    if (y < VESPER_SEA_LEVEL + 0.05 || y + height > VESPER_PIECE_MAX || !own(ps)) return;
    industry.push({ id: `${GROUP}:${id}`, node, x: px, s: ps, y, rotation, pitch: 0, roll: 0, scaleY: 1, scaleZ: 1, group: GROUP });
  };
  shared('hall', 'facility', side * 3.2, hall, side < 0 ? 0 : Math.PI);
  shared('tank0', 'tank_vertical_0', side * 5.15, station + 1.1);
  shared('tank1', 'tank_vertical_0', side * 5.25, station - 0.5);
  shared('sphere', 'tank_sphere', side * 5.0, station - 2.3);
  stand('mast', 'vesper_comm_needle', side * 6.6, station + 2.4);
  for (const piece of pipes) if (own(piece.s) && piece.y + 0.8 < VESPER_PIECE_MAX) industry.push(piece);
  return { props, industry };
}
