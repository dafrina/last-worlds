import type { PlanetId } from '../shared/contracts';
import { landform, moodAt, moodParams, pointColor, type Landform, type MoodParams } from './terrain-layout';
import { arenaGround, arenaPaving, sameArena, type TerrainArena } from './terrain-arena';
import { settlement, type Settlement } from './terrain-settlements';
import { scatterKitSteps, type FloeSetKind, type KitInstance, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import { VESPER } from './terrain-vesper';
import { SCENERY_MAX_HEIGHT, clamp, mix } from './terrain-layout';

/**
 * Planets are data plus a few small strategy functions (docs/17 §2): landform, colour, scatter, settlements
 * and network styling. Shared code (sections, seams, streaming, roads, pipelines, arenas) reads the profile.
 * Khepri's profile wraps the original functions, so its output is byte-identical to before planets existed.
 */
export type { PlanetId };

/** A ground point: the landform plus settlement and arena terms (see rowPoint). */
export interface PlanetPoint extends Landform {
  industrial: number;
  /** Arena platform weight with its paving's crack mask and per-plate tone; absent without an arena. */
  platform?: number; paving?: number; plate?: number;
}
/** What a planet sees of a forward row. */
export interface PlanetRow {
  seed: number; s: number; params: MoodParams; local: unknown; platform: number;
  /** The mission arena, when the world has one (planets may shape its surroundings per point). */
  arena?: TerrainArena;
}

/**
 * A floating ice piece (pack ice): base position and a stable id; drift is presentation-only (seed + time).
 * Its kit node is kitNodeName(kind, variant): a floe, an iceberg, or one piece of a cracked set.
 */
export interface Floe {
  id: string; kind: 'floe' | 'iceberg' | FloeSetKind; variant: number;
  /** Base centre in world coordinates; the waterline sits at the planet's sea level. */
  x: number; s: number;
  /** Footprint scale along the piece's local x and z (irregular outlines), vertical scale, and yaw. */
  scaleX: number; scaleZ: number; height: number; rotation: number;
  /** Drift phase (radians) and radius (units) for the renderer's slow circling. */
  phase: number; radius: number;
  /** A cracked set's origin: its pieces sway about it together, so their cracks keep their width. */
  originX?: number; originS?: number;
}

export interface PlanetProfile {
  id: PlanetId;
  /** Water plane height, or null on a dry planet. */
  seaLevel: number | null;
  mood(seed: number, s: number): string;
  params(seed: number, s: number): MoodParams;
  /** Planet-specific row data (moods beyond Khepri's parameters). */
  local(seed: number, s: number): unknown;
  landform(seed: number, x: number, s: number, row: PlanetRow): Landform;
  /** Applies a mission arena's weight (row.platform > 0) to a point in place. */
  arena(row: PlanetRow, x: number, point: PlanetPoint): void;
  color(row: PlanetRow, x: number, point: PlanetPoint, slope: number, rim: number, out: [number, number, number]): [number, number, number];
  /** Optional cool shadow tint (multiplier where fully shaded); Khepri keeps plain darkening. */
  shadowTint: readonly [number, number, number] | null;
  /** Highest point any scenery piece may reach (SCENERY_MAX_HEIGHT on Khepri). */
  sceneryMax: number;
  settlement(seed: number, cell: number, side: number): Settlement | null;
  scatter(seed: number, startS: number, size: number, field: ScatterField): Work<KitInstance[]>;
  floes(seed: number, startS: number, size: number, field: ScatterField, arena: TerrainArena | undefined): Work<Floe[]>;
  /** Archetypes whose links carry pipelines more often, and quiet ones that never do. */
  industrial: ReadonlySet<string>; quiet: ReadonlySet<string>;
}

export const KHEPRI: PlanetProfile = {
  id: 'khepri', seaLevel: null,
  mood: moodAt, params: moodParams, local: () => null,
  landform: (seed, x, s, row) => landform(seed, x, s, row.params),
  arena(row, x, point) {
    const w = row.platform, paving = arenaPaving(row.seed, x, row.s);
    point.height = mix(point.height, arenaGround(row.seed, x, row.s, paving), w); point.elevation = mix(point.elevation, 0.56, w);
    point.platform = w; point.paving = paving.crack; point.plate = paving.tone;
    point.channel *= 1 - w; point.pool *= 1 - w; point.veins *= 1 - w; point.industrial *= 1 - w;
  },
  color: (row, x, point, slope, rim, out) => pointColor(row, x, point, slope, rim, out),
  shadowTint: null,
  sceneryMax: SCENERY_MAX_HEIGHT,
  settlement,
  scatter: scatterKitSteps,
  floes: function* () { return []; },
  industrial: new Set(['refinery', 'pumping', 'mining']), quiet: new Set(['wreck', 'abandoned']),
};

export const PLANETS: Readonly<Record<PlanetId, PlanetProfile>> = { khepri: KHEPRI, vesper: VESPER };

/**
 * What the generator is asked for: a planet and an optional mission arena. A bare arena (the pre-planet API)
 * means Khepri. Omitted entirely: Khepri, no arena.
 */
export interface TerrainWorld { readonly planet?: PlanetId; readonly arena?: TerrainArena }
export type WorldInput = TerrainWorld | TerrainArena | undefined;
/** A normalized, interned world: equal inputs give the identical object (cheap memo checks). */
export interface World {
  readonly key: string; readonly planet: PlanetProfile; readonly arena: TerrainArena | undefined;
  /** The same planet without the arena (networks are built on it; they stay clear of arenas). */
  readonly bare: World;
}
const worlds = new Map<string, World>();
export function worldOf(input?: WorldInput | World): World {
  if (input && 'key' in input && 'bare' in input) return input;
  const arena = input && 'fromS' in input ? input : (input as TerrainWorld | undefined)?.arena;
  const planet = input && !('fromS' in input) ? (input as TerrainWorld).planet ?? 'khepri' : 'khepri';
  const key = `${planet}|${arena ? `${arena.fromS}:${arena.toS}` : ''}`;
  let world = worlds.get(key);
  if (!world) {
    const profile = PLANETS[planet];
    if (!profile) throw new Error(`Unknown planet ${planet}`);
    const frozen = arena && Object.freeze({ fromS: arena.fromS, toS: arena.toS });
    const made: { key: string; planet: PlanetProfile; arena: TerrainArena | undefined; bare: World } = { key, planet: profile, arena: frozen, bare: undefined as unknown as World };
    made.bare = frozen ? worldOf({ planet }) : made as World;
    world = made as World;
    worlds.set(key, world);
  }
  return world;
}
/** Whether two inputs describe the same world. */
export const sameWorld = (a: WorldInput, b: WorldInput) => worldOf(a) === worldOf(b);
export { sameArena, clamp };
