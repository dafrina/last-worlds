import type { PlanetId } from '../shared/contracts';
import type { SiteClass } from './settlement-modules';

/**
 * Authored settlement layout graphs (docs/23 §4.4). A district is a few terraced lots along the route on one flank:
 * a hub lot (cargo zone, network gates) and lots behind it, each a flattened pad with its own level. Lot frame:
 * `a` runs laterally (+ toward the world edge), `b` runs along the district (+ away from the hub). Pieces sit at
 * authored lot-local spots (quarter turns only, so industrial alignment holds); seeded variation picks nodes,
 * counts and optional slots, the flank, the district's direction and the lots' exact positions.
 */
export type Quarter = 0 | 1 | 2 | 3;
export interface Placement {
  /** One node, or a seeded choice among interchangeable nodes. */
  node: string | readonly string[];
  at: readonly [a: number, b: number];
  /** Quarter turns in the lot frame (1 = +90°, three.js yaw), mirrored with the district's flank and direction. */
  turn?: Quarter;
  /** Instead of `turn`: the node axis that points along a lot way, never mirrored (for asymmetric sockets). */
  face?: { axis: '+x' | '-x' | '+z' | '-z'; toward: Way };
  /**
   * Seat the node by a socket (registry ids): its centre goes where the chosen socket lands exactly on lot point
   * `to` (a pipe end). Of several sockets the one that puts the centre nearest `at` wins (mirrored layouts).
   */
  attach?: { sockets: readonly string[]; to: readonly [number, number] };
  /** Probability the piece is built (seeded); omitted = always. */
  chance?: number;
  /** Low graphics tier may skip it (never a silhouette-defining piece). */
  cosmetic?: boolean;
  /** Base above the lot level (e.g. a hauler parked on a crawler track). */
  lift?: number;
  /** Placements sharing a group are built together or not at all (one roll for the group). */
  group?: string;
}
export type Way = 'a+' | 'a-' | 'b+' | 'b-';
/** A pipe cell on the lot's 2-unit lattice (cell centres at odd a, even b); pieces join at cell edges at y 0.35. */
export type PipeCell =
  /** `length` (straights only, default 2) shortens a run to meet a socket off the lattice. */
  | { at: readonly [number, number]; kind: 'straight' | 'valve'; axis: 'a' | 'b'; length?: number }
  /** A closed valve station at a line's end; `open` names the side the line arrives from. */
  | { at: readonly [number, number]; kind: 'cap'; open: Way }
  /** A tee on a run along `axis`; its branch feeds `tank` (placed at the branch end's shell distance) when built. */
  | { at: readonly [number, number]; kind: 'tee'; axis: 'a' | 'b'; branch: Way; tank?: { key: string; nodes: readonly string[]; chance?: number } }
  | { at: readonly [number, number]; kind: 'elbow'; arms: readonly [Way, Way] };
export interface LotSpec {
  id: string;
  role: 'hub' | 'lot';
  archetype: string;
  /** Layout half extents (a, b) that every piece stays inside; the flattened pad adds PAD_MARGIN. */
  half: readonly [a: number, b: number];
  /** Lateral centre candidates, as distance from the world's centreline. */
  u: readonly number[];
  /** Tallest piece the lot may ever hold (planned nodes included), so its level leaves room under the cap. */
  tallest: number;
  pieces: readonly Placement[];
  pipes?: { size: 's' | 'l'; cells: readonly PipeCell[] };
  /** Road points in the lot frame: gates (where network roads arrive) and the yard (where internal roads meet). */
  gates?: readonly { id: string; at: readonly [number, number] }[];
  yard: readonly [number, number];
  /** Where the internal spine leaves (hub) or enters (other lots) the pad. */
  spine: readonly [number, number];
  /** The landmark slot; stand-in pieces are built instead while its node is still planned (registry `planned`). */
  landmark?: { node: string; at: readonly [number, number]; turn?: Quarter; standIn?: readonly Placement[] };
}
export interface LayoutGraph {
  id: string; planet: PlanetId; class: SiteClass;
  lots: readonly LotSpec[];
  /** Pad-to-pad gap candidates between consecutive lots (lots at different levels need ≥ 2 × the pad falloff). */
  gaps: readonly number[];
  /** Largest cut or fill under a pad, and largest level step between consecutive lots. */
  maxCut: number; maxStep: number;
}
export interface DistrictPolicy {
  id: string;
  graph: LayoutGraph;
  /** Slot k's window for the whole district: [first + k·period, first + k·period + length]. */
  first: number; period: number; length: number;
  /** Preferred band for the second lot's centre within the window (searched first), as offsets from the window start. */
  prefer: readonly [number, number];
  /** Planet-level arena margins beyond ARENA_RAMP: a district this close to a mission or boss arena is hidden. */
  arenaBefore: number; arenaAfter: number;
  /** Quiet buffer (world units) beyond the district in which no ordinary outpost stands on its flank. */
  quiet: number;
  /** Clear distance between a pad's inner edge and the calm centre route. */
  lane: number;
  /** Highest point district pieces may reach (docs/23 §4.2 option A). */
  structureMax: number;
}

/** Tanks a header tee can feed: vertical tanks, whose shells reach down to the pipe centreline. */
const TANKS = ['tank_vertical_0', 'tank_vertical_1'] as const;

/**
 * Khepri refinery district (docs/23 §5.2). Hub: cargo zone with crawler tracks, parked haulers, freight, an admin
 * block and a power relay. Process lot: the processing tower (district-kit.glb), processing halls, a pipeline
 * junction and a tank farm on one header line; tees feed each tank and the line reaches the tower and the first hall.
 */
export const KHEPRI_REFINERY: LayoutGraph = {
  id: 'khepri.refinery', planet: 'khepri', class: 'district',
  gaps: [5, 6, 7], maxCut: 1.5, maxStep: 1.25,
  lots: [
    {
      // Lot centres (|x|) for the 24-wide world (21 October; 9–10 in the 30-wide world): the pad keeps 2 units from
      // the centre route on its inside and stays inside the world's edge (0.3) on its outside.
      id: 'hub', role: 'hub', archetype: 'refinery', half: [3.6, 4.6], u: [6, 6.8, 7.6], tallest: 1.6,
      gates: [{ id: 'end', at: [-2.4, -5.4] }, { id: 'inner', at: [-4.4, -1] }],
      yard: [-2.4, -1], spine: [-2.4, 5.0],
      pieces: [
        { node: 'infra_track_segment', at: [0, 1] }, { node: 'infra_track_segment', at: [0, 3] },
        { node: 'infra_track_segment', at: [1.7, 1], group: 'track2', chance: 0.75 }, { node: 'infra_track_segment', at: [1.7, 3], group: 'track2', chance: 0.75 },
        { node: ['infra_cargo_0', 'infra_cargo_1', 'infra_cargo_2'], at: [0, 2], lift: 0.05 },
        { node: ['infra_cargo_0', 'infra_cargo_1', 'infra_cargo_2'], at: [1.7, 2.6], lift: 0.05, group: 'track2', chance: 0.75, cosmetic: true },
        { node: 'container_0', at: [0.4, -3.7] }, { node: ['container_0', 'container_1'], at: [1.8, -3.7], chance: 0.8 },
        { node: 'container_1', at: [1.1, -2.7], chance: 0.5, cosmetic: true },
        { node: 'infra_habitat_1', at: [2.6, -1.6], chance: 0.65 },
        { node: 'infra_relay', at: [3.1, 3.9], group: 'power', chance: 0.7 }, { node: 'infra_solar_array', at: [3.1, 1.4], turn: 1, group: 'power', chance: 0.7 },
        { node: 'infra_light_mast', at: [-3.45, 4.15] }, { node: 'infra_light_mast', at: [3.4, -4.4], cosmetic: true },
      ],
    },
    {
      id: 'process', role: 'lot', archetype: 'refinery', half: [4, 11], u: [6.4, 6.85, 7.3], tallest: 3.5,
      yard: [-3.3, -3.5], spine: [-3.3, -11.4],
      // The processing tower takes the landmark line on the stub in the middle of its +b face.
      landmark: { node: 'khepri_processing_tower', at: [2, -6.5] },
      pieces: [
        // The header meets the first hall's flat −x wall (socket 'w', 1.2 from its centre), so the hall turns that
        // wall toward +b on either flank.
        { node: 'facility', at: [-1.4, -6.2], face: { axis: '-x', toward: 'b+' } },
        { node: 'facility', at: [-1.4, -9.4], face: { axis: '-x', toward: 'b+' }, chance: 0.6 },
        { node: 'tank_horizontal', at: [2.9, 3], turn: 1 }, { node: 'tank_horizontal', at: [2.9, 7], turn: 1, chance: 0.7 },
        { node: 'tank_sphere', at: [2.9, 9.8], chance: 0.5 },
        { node: 'container_1', at: [-3.4, -1.5], turn: 1, chance: 0.6, cosmetic: true },
        { node: 'infra_light_mast', at: [3.6, 10.6] }, { node: 'infra_light_mast', at: [-3.6, 10.6], cosmetic: true },
        { node: 'infra_light_mast', at: [3.6, -10.6], cosmetic: true },
      ],
      pipes: {
        size: 'l',
        cells: [
          { at: [-1, 10], kind: 'cap', open: 'b-' },
          { at: [-1, 8], kind: 'tee', axis: 'b', branch: 'a-', tank: { key: 'tank4', nodes: TANKS, chance: 0.7 } },
          { at: [-1, 6], kind: 'tee', axis: 'b', branch: 'a+', tank: { key: 'tank3', nodes: TANKS } },
          { at: [-1, 4], kind: 'tee', axis: 'b', branch: 'a-', tank: { key: 'tank2', nodes: TANKS } },
          { at: [-1, 2], kind: 'tee', axis: 'b', branch: 'a+', tank: { key: 'tank1', nodes: TANKS } },
          // The pipeline junction: an inline valve, then a tee that splits the line to the hall and the landmark.
          { at: [-1, 0], kind: 'valve', axis: 'b' },
          { at: [-1, -2], kind: 'tee', axis: 'b', branch: 'a+' },
          { at: [-1, -4], kind: 'straight', axis: 'b' },
          { at: [0.5, -2], kind: 'straight', axis: 'a', length: 1 },
          { at: [2, -2], kind: 'elbow', arms: ['a-', 'b-'] },
          { at: [2, -4], kind: 'straight', axis: 'b' },
        ],
      },
    },
  ],
};

/**
 * Khepri's district slots (docs/23 §5.1): one window per 720 units from s 440. Slot 0 is Rolling Thunder's relief
 * stretch before the Bastion arena (666) and endless sector 2; the preferred band puts the process lot at s 520–580.
 */
export const KHEPRI_DISTRICTS: DistrictPolicy = {
  id: 'khepri.v1', graph: KHEPRI_REFINERY,
  first: 440, period: 720, length: 166, prefer: [80, 140],
  arenaBefore: 40, arenaAfter: 132, quiet: 15, lane: 2, structureMax: 3.0,
};
