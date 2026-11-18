import { terrainHeight } from './terrain-ground';
import { hash } from './terrain-layout';
import { PIPE_AXIS, pipeBetween, supportStack, type Ground, type IndustryPiece, type Vec } from './terrain-network';
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
 * infrastructure up front", then "dont use more than one pipeline tho, connect them properly", then pipes on the lower
 * plateau only): one pumping station on the low ground before the mountain's ascent, of Vesper's own outpost pieces (a cryo
 * dome, a habitat, radiators, a comm mast, tanks), and one short line from it running into the ascent's foot. Nothing on
 * the ascent or the ledge. Its side is the arena's own; its place follows the ascent (src/world/terrain-vesper.ts).
 * Decorative only (nothing targetable), every piece under VESPER_PIECE_MAX and the flight plane; scenery keeps off it (it
 * is a section's industry and props).
 */
const WORKS = {
  /** The line's column off the fortress's axis, and how far before the plan's front the ledge's edge is looked for from. */
  column: 1.9, ledge: 0.85,
  /** How far before the ascent's foot the station stands. */
  station: 3.6,
  /** The farthest before the fortress the ledge's edge is looked for. */
  search: 12,
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
  // The ascent's foot in the station's column: walking down from the ledge's edge, where the ground stops falling for good.
  const near = front - WORKS.ledge;
  let edge = near;
  while (edge > front - WORKS.search && ground(x, edge - 0.25) > L.level - 0.35) edge -= 0.25;
  let base = edge, low = ground(x, edge);
  for (let s = edge; s > edge - 12; s -= 0.25) { const h = ground(x, s); if (h < low - 0.05) { low = h; base = s; } }
  // (The station keeps to dry ground: a lead before the mountain moves it back toward the camera.)
  const dry = (s: number) => [-1.7, 0, 1.7].every(d => [-1.2, 0, 1.2].every(e => ground(side * 3.4 + d, s + e) > VESPER_SEA_LEVEL + 0.1));
  let station = base - WORKS.station;
  for (let k = 0; k < 8 && !dry(station); k++) station -= 0.75;
  // One short line from the pump hall into the mountain's foot: level straights on racks, the last running into the rock.
  const floor = Math.max(ground(x, station + 1), ground(x, base - 0.5)) + 0.02, axis = floor + PIPE_AXIS, toward: Vec = [0, 0, 1];
  for (let k = 0, s0 = station + 0.8; s0 < base + 0.6 - 0.05 && k < 6; k++, s0 += 2) {
    const s1 = Math.min(base + 0.6, s0 + 2);
    pipes.push(pipeBetween(`${GROUP}:line${k}`, 'pipe_s_straight', GROUP, [x, axis, -s0], [x, axis, -s1]));
    supportStack(pipes, ground, `${GROUP}:line${k}:support`, GROUP, x, (s0 + s1) / 2, floor, toward, true, 0.47);
  }
  // The station: Vesper's own outpost pieces round the pump hall (a cryo dome, a habitat, radiators, a comm mast, tanks).
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
  stand('dome', 'vesper_cryo_dome', side * 3.4, station);
  stand('habitat', 'vesper_habitat_0', side * 5.6, station + 0.6, side * 0.4);
  stand('radiators', 'vesper_radiator_array', side * 3.2, station - 2.4, Math.PI / 2);
  stand('mast', 'vesper_comm_needle', side * 6.3, station - 1.6);
  shared('sphere', 'tank_sphere', side * 1.4, station - 0.9);
  shared('tank', 'tank_vertical_1', side * 5.4, station - 1.9);
  for (const piece of pipes) if (own(piece.s) && piece.y + 0.8 < VESPER_PIECE_MAX) industry.push(piece);
  return { props, industry };
}
