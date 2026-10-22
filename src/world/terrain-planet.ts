import type { PlanetId } from '../shared/contracts';
import { landform, moodAt, moodParams, pointColor, type Landform, type MoodParams } from './terrain-layout';
import { arenaGround, arenaPaving, sameArena, type TerrainArena } from './terrain-arena';
import { settlement, type Settlement } from './terrain-settlements';
import { scatterKitSteps, type FloeSetKind, type KitInstance, type ScatterField } from './terrain-scatter';
import type { Work } from './terrain-work';
import { VESPER } from './terrain-vesper';
import { LUNA } from './terrain-luna';
import { NACRE } from './terrain-nacre';
import { districtSettlement } from './terrain-districts';
import { KHEPRI_DISTRICTS, type DistrictPolicy } from './settlement-grammars';
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
  /** Applies a mission arena's weight at a point (the boss clearing, `arenaAt`) to it in place. */
  arena(row: PlanetRow, x: number, point: PlanetPoint, weight: number): void;
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
  /** False on a planet without roads or pipelines between settlements. */
  networks?: boolean;
  /** False on a planet whose network is roads only (Luna's rover tracks, version 16). */
  pipes?: boolean;
  /**
   * Crisp cliffs (terrain version 14, docs/26 §10): vertex colours and the rock mask read the gentler one-sided slope,
   * so rims and feet keep their flat side's colour and the ground shader draws walls per face. Off (Nacre): unchanged.
   */
  cliffs?: boolean;
  /**
   * District slots and layout (docs/23). Null or absent: the planet has no districts and its output is exactly the
   * pre-district output (rollback switch: `KHEPRI.districts = null`).
   */
  districts?: DistrictPolicy | null;
}

export const KHEPRI: PlanetProfile = {
  id: 'khepri', seaLevel: null,
  mood: moodAt, params: moodParams, local: () => null,
  landform: (seed, x, s, row) => landform(seed, x, s, row.params),
  arena(row, x, point, w) {
    const paving = arenaPaving(row.seed, x, row.s);
    point.height = mix(point.height, arenaGround(row.seed, x, row.s, paving), w); point.elevation = mix(point.elevation, 0.56, w);
    point.platform = w; point.paving = paving.crack; point.plate = paving.tone;
    point.channel *= 1 - w; point.pool *= 1 - w; point.veins *= 1 - w; point.industrial *= 1 - w;
  },
  color: (row, x, point, slope, rim, out) => pointColor(row, x, point, slope, rim, out),
  shadowTint: null,
  sceneryMax: SCENERY_MAX_HEIGHT,
  // Outposts with districts applied (read at call time, so the rollback switch below takes effect at once).
  settlement: (seed, cell, side) => districtSettlement(KHEPRI, settlement, seed, cell, side),
  scatter: scatterKitSteps,
  floes: function* () { return []; },
  industrial: new Set(['refinery', 'pumping', 'mining', 'plant']), quiet: new Set(['wreck', 'abandoned']),
  districts: KHEPRI_DISTRICTS, cliffs: true,
};

export const PLANETS: Readonly<Record<PlanetId, PlanetProfile>> = { khepri: KHEPRI, vesper: VESPER, luna: LUNA, nacre: NACRE };

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

/* ---------------------------------------------------------------- routes (docs/18 §3) */

/**
 * A world schedule as content exports it (src/content/endless.ts `endlessSchedule`), read structurally so the
 * terrain never imports content: planet stretches and boss arenas by forward distance, and the jumps' flashes.
 */
export interface RouteSchedule {
  stretches(from: number, to: number): readonly { readonly planet: PlanetId; readonly from: number; readonly to: number }[];
  arenas(from: number, to: number): readonly { readonly from: number; readonly to: number }[];
  jumpAt?(distance: number): { readonly from: PlanetId; readonly to: PlanetId; readonly flashDistance: number } | null;
}
/** One stretch of a route generated by a single world. */
export interface RouteSpan { world: World; from: number; to: number }
/**
 * A route of worlds along the forward distance: the planet of each stretch, with the nearest boss arena (each
 * arena owns the distances closer to it than to any other, so its effects never reach a neighbour). A planet
 * switch splits the section that holds it: rows before the switch use the old world, rows from it the new one.
 */
export interface TerrainRoute {
  readonly key: string;
  /** The world generating forward distance s. */
  worldAt(s: number): World;
  /** Contiguous single-world spans covering [from, to), in order. */
  spans(from: number, to: number): RouteSpan[];
  /** The planet the look shows at a scroll distance: the stretch's, or the jump's target from its flash on. */
  lookAt(distance: number): PlanetId;
}
/** A world as seen from the current scroll distance, still resolving every query by its own distance. */
export interface RoutedWorld extends World { readonly route: TerrainRoute }
/** Anything the generator and its height queries accept. */
export type TerrainInput = WorldInput | World | TerrainRoute | RoutedWorld;

export const isRoute = (input: unknown): input is TerrainRoute => typeof (input as TerrainRoute | undefined)?.worldAt === 'function';
/** The route behind an input, if any (a route, or a routed world). */
export function routeOfInput(input: TerrainInput | undefined): TerrainRoute | null {
  if (isRoute(input)) return input;
  const routed = (input as RoutedWorld | undefined)?.route;
  return routed && isRoute(routed) ? routed : null;
}
/** The world that generates forward distance s for any input (one world everywhere unless it is a route). */
export function worldAt(input: TerrainInput | undefined, s: number): World {
  const route = routeOfInput(input);
  return route ? route.worldAt(s) : worldOf(input as WorldInput | World);
}

/** Half-width of the schedule window read per route segment (arenas are spaced far closer than this). */
const ROUTE_WINDOW = 4000;
const routes = new Map<string, TerrainRoute>();
/** A route over a schedule, interned by key (equal keys must describe equal schedules). */
export function routeOf(key: string, schedule: RouteSchedule): TerrainRoute {
  const known = routes.get(key);
  if (known) return known;
  const segments: RouteSpan[] = [];
  let last: RouteSpan | null = null;
  const segmentAt = (s: number): RouteSpan => {
    if (last && s >= last.from && s < last.to) return last;
    for (const segment of segments) if (s >= segment.from && s < segment.to) return (last = segment);
    const from0 = s - ROUTE_WINDOW, to0 = s + ROUTE_WINDOW, stretches = schedule.stretches(from0, to0);
    // Before the first stretch (s < 0 in endless) the first planet continues backwards.
    const stretch = stretches.find(item => s >= item.from && s < item.to)
      ?? (stretches.length && s < stretches[0].from ? { planet: stretches[0].planet, from: from0, to: stretches[0].from } : null);
    if (!stretch) throw new Error(`Route ${key} has no planet at ${s}`);
    // The arena that owns s: the nearest one; ownership changes halfway between neighbouring arenas. Owner and
    // zone come from the same half-open midpoints, so the segment always holds s (a nearest-gap pick tied exactly
    // at a midpoint, kept the earlier arena, and handed `spans` a segment ending at s: an endless hang).
    const arenas = [...schedule.arenas(from0, to0)].sort((a, b) => a.from - b.from);
    const midpoint = (i: number) => (arenas[i].to + arenas[i + 1].from) / 2;
    let owner = arenas.length ? 0 : -1;
    while (owner >= 0 && owner < arenas.length - 1 && s >= midpoint(owner)) owner++;
    const zoneFrom = owner > 0 ? midpoint(owner - 1) : from0;
    const zoneTo = owner >= 0 && owner < arenas.length - 1 ? midpoint(owner) : to0;
    const arena = owner >= 0 ? { fromS: arenas[owner].from, toS: arenas[owner].to } : undefined;
    const segment = { world: worldOf({ planet: stretch.planet, arena }), from: Math.max(stretch.from, zoneFrom, from0), to: Math.min(stretch.to, zoneTo, to0) };
    if (!(s >= segment.from && s < segment.to)) throw new Error(`Route ${key}: segment [${segment.from}, ${segment.to}) misses ${s}`);
    segments.push(segment); if (segments.length > 32) segments.shift();
    return (last = segment);
  };
  const route: TerrainRoute = {
    key,
    worldAt: s => segmentAt(s).world,
    spans(from, to) {
      const out: RouteSpan[] = [];
      for (let at = from; at < to;) {
        const segment = segmentAt(at), end = Math.min(to, segment.to), tail = out[out.length - 1];
        if (tail && tail.world === segment.world) tail.to = end; else out.push({ world: segment.world, from: at, to: end });
        at = end;
      }
      return out;
    },
    lookAt(distance) {
      const jump = schedule.jumpAt?.(distance);
      return jump && distance >= jump.flashDistance ? jump.to : segmentAt(distance).world.planet.id;
    },
  };
  routes.set(key, route);
  return route;
}
/** A route's world at a scroll distance, carrying the route so position queries still resolve per distance. */
const routed = new Map<string, RoutedWorld>();
export function routedWorld(route: TerrainRoute, world: World): RoutedWorld {
  const key = `${route.key}@${world.key}`;
  let made = routed.get(key);
  if (!made) { made = Object.freeze({ key: world.key, planet: world.planet, arena: world.arena, bare: world.bare, route }); routed.set(key, made); }
  return made;
}
export { sameArena, clamp };
