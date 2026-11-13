import { NEUTRAL_MOOD, WORLD_HALF, bench, clamp, crispStep, hash, mix, noise, routeCenter, smoothRange, type Landform, type MoodParams } from './terrain-layout';
import { KIT, type KitInstance, type ScatterField } from './scenery-kit';
import type { Work } from './terrain-work';
import type { PlanetPoint, PlanetProfile, PlanetRow } from './terrain-planet';
import type { TerrainArena } from './terrain-arena';
import { UMBRA, UMBRA_PLATEAU, UMBRA_SCENERY_MAX, UMBRA_SPIRE_MAX } from './terrain-umbra';

/*
 * NAHARA, the Silent Empire (docs/39; user handover, 12 November 2026, after art/concepts/nahara/01-world): a vast
 * sandstone canyon world holding the ruins of a vanished civilisation, its turquoise energy still running through the
 * stone. After the concept: the flight follows a deep chasm whose floor is lost in a teal haze, between towering
 * tablelands built of stacked sandstone blocks; ruined facades with glowing turquoise slits are carved into the walls,
 * square pillars and broken arches stand over the chasm, rubble lies on the terraces.
 *
 * The ground (user, 13 November: "maybe a 50/50 mix" of the square ruin country and "natural smoother hills and canyons
 * like more organic as we did in corona"), two countries in great winding regions (naharaBuilt):
 * - built: blocky terraces on a snapped grid, notched rims stepping down in ledges, ruined cities and the footprints of
 *   fallen buildings, the cliffs laid in running-bond masonry;
 * - natural: benched sandstone hills and buttes (Corona's domain-warped masks and bench), canyon walls stepping down in
 *   three stratified cliffs along a wandering rim, the cliffs in wavy strata.
 * Through both runs a meandering main chasm along the central route, with side ravines branching off it. The ruins are
 * Blender modules (tools/blender/nahara_kit.py): towers, gates, monoliths, arches set wall to wall, half arches from the
 * rims, carved facings and rubble. Pure functions of seed and position. THE CITADEL stands on its own flat pad at the
 * plateau level in the middle of a ruined city (naharaPlatform, citadelCourse, citadelRuins).
 */

/** The lowest tableland level and the boss's seat (THE ECLIPSE's rig is measured from it). */
const PLATEAU = UMBRA_PLATEAU;
/**
 * The chasm floor, far down under the teal haze (src/render/scene.ts): the depth the monoliths rise out of (user, 12
 * November: "it should feel huge").
 */
export const NAHARA_FLOOR = -8.5;
/**
 * The cleft: the chasm keeps its full depth only within this of its channel's middle; elsewhere its bottom is a broad ledge
 * near Umbra's crevasse floor (-5.6). Ground batteries seat where the line of sight meets the ground, and the deeper the
 * seat the further its track strays from the authored one (src/sim/ground.ts): on the wide floor at -8.5 two squadrons
 * strayed into each other (fairness-endless-late, 13 November).
 */
const CLEFT = 1.1;
/** Terrace steps over the plateau: up to TIERS steps of STEP, TOP caps them under the scenery cap. */
const STEP = 1.2, TIERS = 3, TOP = 2.0;
/**
 * The terrace grid: rims run in steps of this, great square masses rather than small blocks (the masonry's own blocks are
 * the detail map's, src/render/terrain-kit.ts).
 */
const BLOCK = 1.6;
/** The rim's notch grid: the canyon walls step in and out in masses this size. */
const RIM = 3.2;
const NEUTRAL: MoodParams = NEUTRAL_MOOD;
const TALL: ReadonlySet<string> = new Set(['nahTower', 'nahPillar', 'nahGate', 'nahRing', 'nahArch', 'nahSpur']);

/* ---------------------------------------------------------------- the canyon */

/**
 * The canyon's course (user, 12 November: "it should be a bit more varied"), all slow functions of the run distance:
 * - the centre swings far across the map (±6 over the shared route's own meander);
 * - `wide`: basins where the walls draw back to 7 units either side, the monoliths standing in them;
 * - `narrow`: narrows down to 2.6, where the great arches span it;
 * - `fork`: the chasm splits around a mesa island, two channels either side of it;
 * - side ravines leave it now and then (below).
 */
export interface NaharaCourse { center: number; half: number; fork: number; spread: number; wide: number; narrow: number }
export function naharaCourse(seed: number, s: number, arena?: TerrainArena): NaharaCourse {
  const sway = (noise(seed ^ 0x4a01, s * 0.011, 0.4) - 0.5) * 12 + (noise(seed ^ 0x4a02, s * 0.031, 1.3) - 0.5) * 3;
  const wide = smoothRange(0.56, 0.74, noise(seed ^ 0x4a03, s * 0.019, 2.2));
  const narrow = (1 - wide) * smoothRange(0.44, 0.26, noise(seed ^ 0x4a04, s * 0.027, 3.1));
  const fork = (1 - wide) * (1 - narrow) * smoothRange(0.6, 0.74, noise(seed ^ 0x4a05, s * 0.016, 4.7));
  const half = 3.6 + 3.6 * wide - 1.0 * narrow;
  // A fork's channels: 2.6 to 3 wide each, either side of an island 3 to 5 across.
  const spread = fork * (2.8 + 1.6 * noise(seed ^ 0x4a06, s * 0.05, 5.3));
  const center = clamp(routeCenter(seed, 1, s) + sway, -WORLD_HALF + half + 1.5, WORLD_HALF - half - 1.5);
  const course = { center, half, fork, spread, wide, narrow };
  return arena ? citadelCourse(course, arena, s) : course;
}

/**
 * Round THE CITADEL the canyon itself comes to it (user, 13 November: the ring cut round it "looks like the canyon cuts
 * around the citadel pretty neatly and doesnt look natural, should be closer to the normal canyons"): the course swings to
 * the middle and opens into a wide gorge before the temple, then forks round it, the temple's rock the point of the island
 * between the two channels; past it the island runs on and the canyon goes back to its own course.
 */
function citadelCourse(c: NaharaCourse, arena: TerrainArena, s: number): NaharaCourse {
  const ds = s - (arena.fromS + CITADEL_AT), w = smoothRange(-40, -26, ds) * (1 - smoothRange(18, 34, ds));
  if (w <= 0) return c;
  const fork = smoothRange(-9.5, -6.2, ds), half = mix(7.4, 6.2, fork), spread = 9.6 * fork;
  return { center: mix(c.center, 0, w), half: mix(c.half, half, w), fork: mix(c.fork, fork, w), spread: mix(c.spread, spread, w),
    wide: mix(c.wide, 1 - fork, w), narrow: mix(c.narrow, 0, w) };
}

/**
 * Built ruin country (1) or natural sandstone (0) (user, 13 November: "I love some of the squareyness but maybe mix it with
 * some organic hills and cliff shapes, maybe a 50/50 mix"): great regions, about half each, their borders winding
 * (domain-warped, as Corona's masks). The built country keeps the square terraces, notched rims and cities; the natural
 * country has warped canyon edges, stratified walls stepping down into the haze and benched hills (Corona's technique).
 */
export function naharaBuilt(seed: number, x: number, s: number, arena?: TerrainArena): number {
  const qx = x + (noise(seed ^ 0x4a81, x * 0.05, s * 0.04) - 0.5) * 12, qs = s + (noise(seed ^ 0x4a82, x * 0.05 + 3.1, s * 0.04) - 0.5) * 12;
  const field = noise(seed ^ 0x4a83, qx * 0.05, qs * 0.026) * 0.7 + noise(seed ^ 0x4a84, qx * 0.13, qs * 0.11) * 0.3;
  // About 30% built (the field's 70th percentile; 50% until the user's "some of the formations still read very minecrafty.
  // Make sure this only happens near lots of cliff models, arches etc", 13 November): the built country is the ruin
  // districts, where the dressing below gathers.
  // Only near the canyon (user, 13 November: the map's edges were "just very blocky still"): beyond about five units from
  // its rims the ground is natural sandstone, whatever the field says.
  const c = naharaCourse(seed, s, arena), rim = Math.abs(Math.abs(x - c.center) - c.spread * c.fork) - c.half;
  return smoothRange(0.582, 0.626, field) * (1 - smoothRange(3.5, 6.5, rim));
}

export interface NaharaMasks {
  /** 1 inside a chasm or ravine (crisp), 0 on the tableland. */ chasm: number;
  /** Distance share from the chasm's rim into the tableland (0 at the rim … 1 a few units in). */ inland: number;
  /** The course here. */ course: NaharaCourse;
  /** How far inside the nearest rim (units; negative on the tableland), and each country's own. */ open: number; openBuilt: number; openNatural: number;
  /** Built ruin country (1) or natural sandstone (0). */ built: number;
}

export function naharaMasks(seed: number, x: number, s: number, platform = 0, arena?: TerrainArena): NaharaMasks {
  const built = naharaBuilt(seed, x, s, arena);
  // The canyon falls away right at THE CITADEL's rock (user, 13 November: "the cliff is still not up to the citadels base,
  // it comes out too far"): a ragged band under a unit wide round it opens into the chasm, whatever the course does.
  const rock = citadelDistance(arena, x, s), hug = rock < 3 ? 0.9 + (noise(seed ^ 0x4c21, x * 0.35, s * 0.35) - 0.5) * 0.6 - rock : -9;
  // Built: the course holds for a notch length at a time, so the walls run straight along the run and step at each notch
  // (great masses, as in the concept), never a fine staircase where the canyon swings across the block grid.
  const snapped = naharaCourse(seed, (Math.floor(s / RIM) + 0.5) * RIM, arena);
  const free = built < 0.999 ? naharaCourse(seed, s, arena) : snapped;
  let openBuilt = -9, openNatural = -9;
  if (built > 0.001) {
    const { center, half, fork, spread } = snapped;
    const bx = Math.floor(x / BLOCK) * BLOCK + BLOCK / 2, bs = Math.floor(s / BLOCK) * BLOCK + BLOCK / 2;
    const nx = Math.floor(x / RIM) * RIM + RIM / 2, ns = Math.floor(s / RIM) * RIM + RIM / 2;
    // (One notch in or out at most, half a unit: deeper notches every few units read as staggered blocks.)
    const jag = Math.round((noise(seed ^ 0x4a12, nx * 0.12, ns * 0.1) - 0.5) * 2) * 0.5;
    // Two channels either side of the fork's island (one channel when there is no fork).
    const channel = mix(half, 1.4 + 0.2 * half, fork);
    const main = Math.max(channel + jag - Math.abs(x - center + spread), channel + jag - Math.abs(x - center - spread));
    // Side ravines: winding cuts leaving the chasm now and then (the tableland's own canyons), on the block grid.
    const ravineLine = Math.abs(noise(seed ^ 0x4a13, bx * 0.05, bs * 0.035) - 0.5);
    const ravine = (0.04 - ravineLine) / 0.04 * 1.6 * smoothRange(0.5, 0.62, noise(seed ^ 0x4a14, bs * 0.02, 1.9));
    openBuilt = Math.max(main, ravine);
  }
  if (built < 0.999) {
    // Natural: the rim wanders (domain-warped, two scales: great bays and headlands, and a smaller jag), as Corona's coasts.
    const { center, half, fork, spread } = free;
    const wx = x + (noise(seed ^ 0x4a86, x * 0.07, s * 0.05) - 0.5) * 4.5 + (noise(seed ^ 0x4a87, x * 0.24, s * 0.21) - 0.5) * 1.3;
    const channel = mix(half, 1.4 + 0.2 * half, fork);
    const main = Math.max(channel - Math.abs(wx - center + spread), channel - Math.abs(wx - center - spread));
    // Side canyons winding off into the sandstone (warped lines, as Corona's plasma rivers).
    const qx = x + (noise(seed ^ 0x4a88, x * 0.04, s * 0.035) - 0.5) * 10, qs = s + (noise(seed ^ 0x4a89, x * 0.04 + 5.3, s * 0.035) - 0.5) * 10;
    const line = Math.abs(noise(seed ^ 0x4a13, qx * 0.05, qs * 0.035) - 0.5);
    const ravine = (0.035 - line) / 0.035 * 1.9 * smoothRange(0.45, 0.6, noise(seed ^ 0x4a14, s * 0.02, 1.9));
    openNatural = Math.max(main, ravine);
  }
  openBuilt = Math.max(openBuilt, hug); openNatural = Math.max(openNatural, hug);
  const open = built >= 0.999 ? openBuilt : built <= 0.001 ? openNatural : mix(openNatural, openBuilt, built);
  const chasm = crispStep(open / 0.3 + 0.5) * (1 - platform);
  const inland = smoothRange(0, 5, -open);
  return { chasm, inland, course: built > 0.5 ? snapped : free, open, openBuilt, openNatural, built };
}

/** The built tableland's terrace count at a point (0 … TIERS), on the terrace grid: great square-stepped rims. */
const TERRACE = 2.4;
function tier(seed: number, x: number, s: number): number {
  const bx = Math.floor(x / TERRACE) * TERRACE + TERRACE / 2, bs = Math.floor(s / TERRACE) * TERRACE + TERRACE / 2;
  const field = noise(seed ^ 0x4a21, bx * 0.06, bs * 0.08) * 0.65 + noise(seed ^ 0x4a22, bx * 0.15, bs * 0.18) * 0.35;
  return Math.max(0, Math.min(TIERS, Math.floor(smoothRange(0.22, 0.7, field) * (TIERS + 0.999))));
}

/**
 * Mesas standing out of the chasm (the concept's block towers rising from the haze): square masses on the block grid in
 * the basins, and the fork's island. Their tops step down toward the haze. Returns 0 (none) to 1 (a full mesa) and its top.
 */
function mesa(seed: number, x: number, s: number, course: NaharaCourse): { at: number; top: number } {
  const bx = Math.floor(x / BLOCK) * BLOCK + BLOCK / 2, bs = Math.floor(s / BLOCK) * BLOCK + BLOCK / 2;
  // The fork's island: the ground between the two channels.
  const island = course.fork > 0.35 && Math.abs(x - course.center) < course.spread - 1.4 - 0.2 * course.half ? 1 : 0;
  // Basin mesas: a sparse field of square masses, never in the middle of the channel.
  const off = Math.abs(bx - course.center) / Math.max(1, course.half);
  const field = noise(seed ^ 0x4a61, bx * 0.16, bs * 0.13);
  const basin = course.wide > 0.4 && off > 0.25 && off < 0.85 && field > 0.68 ? 1 : 0;
  const at = Math.max(island, basin);
  const top = PLATEAU - 0.4 + Math.floor(hash(seed ^ 0x4a62, Math.floor(x / (BLOCK * 2)), Math.floor(s / (BLOCK * 2))) * 3) * 0.9;
  return { at, top: Math.min(top, PLATEAU + 1.2) };
}

/**
 * The ruined cities on the tablelands (user, 12 November: "I like that it looks like ruin cities"): districts of great block
 * buildings on a CITY grid with streets between, each one to three storeys of 0.8 over its terrace, some fallen to a stump,
 * some lots empty; neighbours merge across a street now and then. Built into the ground itself, so their faces carry the
 * masonry like every cliff, at no cost in pieces. Returns the height a building adds here.
 */
const CITY = 3.2, STREET = 0.7, STOREY = 0.85, CITY_TOP = 2.4;
const cityDistrict = (seed: number, x: number, s: number, inland: number) =>
  smoothRange(0.4, 0.55, noise(seed ^ 0x4a71, x * 0.028, s * 0.024)) * smoothRange(0, 0.12, inland);
function city(seed: number, x: number, s: number, inland: number): number {
  const district = cityDistrict(seed, x, s, inland);
  if (district <= 0) return 0;
  const ix = Math.floor(x / CITY), is = Math.floor(s / CITY), fx = x / CITY - ix, fs = s / CITY - is, street = STREET / CITY / 2;
  // In a street (unless this street is built over, joining the buildings either side).
  const inX = fx < street || fx > 1 - street, inS = fs < street || fs > 1 - street;
  if (inX && hash(seed ^ 0x4a72, ix * 2 + (fx > 0.5 ? 1 : 0), is) > 0.18) return 0;
  if (inS && hash(seed ^ 0x4a73, ix, is * 2 + (fs > 0.5 ? 1 : 0)) > 0.18) return 0;
  const lot = hash(seed ^ 0x4a74, ix, is);
  if (lot < 0.22 || lot > 1 - (1 - district) * 0.9) return 0;
  // Storeys; a fallen corner (a quarter of the lot one storey lower) on some.
  let storeys = 1 + Math.floor(hash(seed ^ 0x4a75, ix, is) * 3);
  if (hash(seed ^ 0x4a76, ix, is) < 0.4 && fx > 0.5 && fs < 0.5) storeys -= 1;
  return Math.max(0, storeys) * STOREY;
}

/**
 * Ruin footprints over the built terraces between the cities (user, 13 November: "some sections are so empty"): on a
 * FOOTING grid, some lots hold the broken outline of a fallen building, low walls 0.6 thick with gaps. Returns the height
 * they add here.
 */
const FOOTING = 2.8;
function footprint(seed: number, x: number, s: number): number {
  const ix = Math.floor(x / FOOTING), is = Math.floor(s / FOOTING), fx = x / FOOTING - ix, fs = s / FOOTING - is;
  if (hash(seed ^ 0x4a7c, ix, is) > 0.42) return 0;
  const ex = Math.min(fx, 1 - fx) * FOOTING, es = Math.min(fs, 1 - fs) * FOOTING, edge = Math.min(ex, es);
  if (edge < 0.3 || edge > 0.9) return 0;
  // Gaps in the walls: each 0.9 of wall stands or has fallen.
  const along = ex < es ? s : x;
  if (hash(seed ^ 0x4a7d, Math.floor(along / 0.9), ix * 31 + is) < 0.32) return 0;
  return 0.4 + 0.5 * hash(seed ^ 0x4a7e, ix, is);
}

/** The built country's ground: square terraces and cities, the chasm's ledges, basin mesas. */
function builtGround(seed: number, x: number, s: number, m: NaharaMasks, platform: number): number {
  // Terraces rise away from the chasm: the rim tier is low, the inland ones climb (the concept's towering walls).
  // A city district keeps to one low terrace, so its buildings rise clear (under the height cap) instead of being clipped.
  const inland = smoothRange(0, 5, -m.openBuilt), chasm = crispStep(m.openBuilt / 0.3 + 0.5) * (1 - platform);
  const built = city(seed, x, s, inland), district = cityDistrict(seed, x, s, inland) > 0;
  const steps = Math.min(tier(seed, x, s), Math.floor(1 + inland * TIERS * 1.6), district ? 1 : TIERS);
  const ruin = district || inland < 0.15 ? 0 : footprint(seed, x, s);
  const top = Math.min(district ? CITY_TOP : TOP + 0.4, mix(PLATEAU + steps * STEP, PLATEAU, platform) + (built + ruin) * (1 - platform));
  if (chasm <= 0) return top;
  // The chasm floor: sand and rubble far below, gently drifted.
  let floor = NAHARA_FLOOR + (noise(seed ^ 0x4a31, x * 0.2, s * 0.18) - 0.5) * 0.8;
  // Ledges stepping down into the haze along much of the rim (the concept's walls descend in great steps, not one drop):
  // a first ledge a block or two inside the rim, a second below it, each its own width along the run.
  // (Ledge widths hold for a notch length at a time, as the rim does, not a block: per block they staggered.)
  const bs = Math.floor(s / RIM) * RIM + RIM / 2, ledged = smoothRange(0.38, 0.5, noise(seed ^ 0x4a35, bs * 0.03, 0.6));
  const first = (0.7 + 0.9 * noise(seed ^ 0x4a36, bs * 0.09, 1.7)) * ledged, second = first + (0.7 + 0.8 * noise(seed ^ 0x4a37, bs * 0.08, 2.9)) * ledged;
  const room = m.course.half * mix(1, 0.55, m.course.fork) - 1.4;
  const channel = mix(m.course.half, 1.4 + 0.2 * m.course.half, m.course.fork);
  if (m.openBuilt < Math.min(first, room)) floor = PLATEAU - 2.4 - Math.floor(noise(seed ^ 0x4a38, bs * 0.05, 3.3) * 2) * 0.8;
  else if (m.openBuilt < Math.max(Math.min(second, room + 0.6), channel - CLEFT)) floor = -5.6 - noise(seed ^ 0x4a39, bs * 0.06, 4.1) * 0.4;
  const stand = platform > 0 ? { at: 0, top: 0 } : mesa(seed, x, s, m.course);
  if (stand.at > 0) floor = stand.top;
  return mix(top, floor, chasm);
}

/**
 * The natural sandstone's tableland level before benching: domain-warped swells and buttes, lower toward the rims.
 * (Corona's landLevel, after its masks.)
 */
function hillLevel(seed: number, x: number, s: number): number {
  const qx = x + (noise(seed ^ 0x4a91, x * 0.03, s * 0.026) - 0.5) * 14, qs = s + (noise(seed ^ 0x4a92, x * 0.03 + 3.3, s * 0.026) - 0.5) * 14;
  const field = noise(seed ^ 0x4a93, qx * 0.06, qs * 0.05) * 0.6 + noise(seed ^ 0x4a94, qx * 0.15, qs * 0.13) * 0.3 + noise(seed ^ 0x4a95, qx * 0.4, qs * 0.35) * 0.1;
  // Buttes: steep-sided knolls standing over the swells now and then.
  const butte = smoothRange(0.64, 0.74, noise(seed ^ 0x4a96, qx * 0.11, qs * 0.1)) * 1.8;
  return PLATEAU - 1.2 + smoothRange(0.2, 0.8, field) * 4.8 + butte;
}
/**
 * The hills' strata: benches HILL_STEP apart, their risers sloping over HILL_RISER, half-benched (13 November: the even
 * contour steps read blocky); the phase wanders faster, so neighbouring hills step at different heights.
 */
const HILL_STEP = 1.5, HILL_RISER = 1.0, PROBE = 0.3;

/**
 * The natural country's ground: benched sandstone hills (sheer risers between level strata), and the canyon stepping down
 * from the rim in three great stratified cliffs (organic outlines, each ledge its own width along the run) to the floor.
 */
function naturalGround(seed: number, x: number, s: number, m: NaharaMasks, platform: number): number {
  const level = mix(hillLevel(seed, x, s), PLATEAU, platform) - (1 - smoothRange(0, -3.5, m.openNatural)) * 0.8 * (1 - platform);
  const gx = (hillLevel(seed, x + PROBE, s) - hillLevel(seed, x - PROBE, s)) / (2 * PROBE);
  const gs = (hillLevel(seed, x, s + PROBE) - hillLevel(seed, x, s - PROBE)) / (2 * PROBE);
  const phase = (noise(seed ^ 0x4a97, x * 0.06 + 1.3, s * 0.05) * 0.7 + noise(seed ^ 0x4a9c, x * 0.15, s * 0.13) * 0.3) * HILL_STEP * 1.6;
  const benched = 0.45 + 0.35 * noise(seed ^ 0x4a9d, x * 0.04, s * 0.035);
  const top = clamp(bench(level, Math.hypot(gx, gs) * (1 - platform), HILL_STEP, phase, HILL_RISER, benched), PLATEAU - 1.2, TOP);
  const o = m.openNatural;
  if (o <= -0.3 || platform >= 1) return top;
  // The canyon: three stratified cliffs. Ledge widths wander along the run; a narrow canyon squeezes them so it still
  // reaches the floor at its middle.
  const channel = mix(m.course.half, 1.4 + 0.2 * m.course.half, m.course.fork);
  // (13 November: "the canyon at times has way too regular steps": each ledge now wanders in width on two scales, comes
  // and goes along the run, and each cliff's face runs from sheer to a steep slope.)
  const wander = (salt: number) => (noise(seed ^ salt, x * 0.32, s * 0.27) - 0.5) * 0.9;
  const w1 = 0.3 + 1.6 * noise(seed ^ 0x4a98, s * 0.06, x * 0.05) + wander(0x4aa1), w2 = 0.3 + 1.5 * noise(seed ^ 0x4a99, s * 0.05 + 2.1, x * 0.04) + wander(0x4aa2);
  const squeeze = Math.min(1, Math.max(0, channel - 1.2) / (Math.max(0, w1) + Math.max(0, w2) + 0.9));
  // A ledge drops away in places (its cliff runs on down to the next).
  const ledge1 = smoothRange(0.3, 0.42, noise(seed ^ 0x4aa3, s * 0.045, x * 0.03)), ledge2 = smoothRange(0.25, 0.37, noise(seed ^ 0x4aa4, s * 0.04 + 1.7, x * 0.03));
  // (The broad bottom ledge stays within Umbra's crevasse depth, -5 to -5.6: ground batteries seat on it; see CLEFT.)
  const l2 = -5.0 - noise(seed ^ 0x4a9b, x * 0.07, s * 0.05) * 0.6;
  const l1 = mix(l2, PLATEAU - 1.9 - noise(seed ^ 0x4a9a, x * 0.08, s * 0.06) * 1.8, ledge1);
  const floor = NAHARA_FLOOR + (noise(seed ^ 0x4a31, x * 0.2, s * 0.18) - 0.5) * 0.8;
  // (Never sheer: a sheer face's outline stair-steps on the ground's quarter-unit grid, the user's "staggered blocks".)
  const face = (salt: number) => 0.75 + 0.8 * noise(seed ^ salt, x * 0.09, s * 0.08);
  // (Rounded over at the rim, not creased: a crease's outline stair-steps along the grid on every diagonal.)
  const step = (at: number, width: number) => smoothRange(at - width / 2, at + width / 2, o);
  let height = top - (top - l1) * step(wander(0x4aa5) * 0.5, face(0x4aa6));
  height -= (l1 - l2) * step(Math.max(0, w1) * squeeze * ledge1 + 0.45, face(0x4aa7));
  // The full depth only in a cleft down the channel's middle (CLEFT either side of it): the broad bottom is the second
  // ledge, so a battery seated in the canyon stands on stone in sight (the ground lens keeps its usual reach, src/sim/ground.ts).
  height -= (l2 - floor) * step(Math.max((Math.max(0, w1) * ledge1 + Math.max(0, w2) * ledge2) * squeeze + 0.9, channel - CLEFT), face(0x4aa8));
  return mix(top, height, 1 - platform);
}

/*
 * THE CITADEL's arena (user, 13 November: "model the boss arena specifically for it, with blocky canyons and arcs and
 * whatnot so it looks like the citadel is sitting in an ancient ruin city"; then "limit the flat part to just the base of
 * the model, and maybe keep some canyon around it like its towering in a canyons"; "key is it should tower above other
 * ruins and not look like a single asset"). Nahara's only arena is its boss's.
 * - The pad: flat at the plateau only under the temple's rock (tools/blender/nahara_citadel.py MESA: a front edge and a
 *   half circle behind, 14.8 wide), instead of the common clearing (ARENA_CLEARING), which flattened the whole view.
 * - The canyon: the world's own canyon swings to it, opens into a gorge before it and forks round it (citadelCourse), the
 *   rock the point of the island between the channels (its carved cliff the canyon's wall there), so the temple towers
 *   over the gorge.
 * - The ground near it is kept low and rises away from it; every ruin near it stays under its dome (citadelCap).
 * - The ruins: the world's own kit set round it (citadelRuins).
 */
/**
 * The temple's origin past the arena's start, where the renderer seats it: every boss's stop is 9 past `fromS` and it stands
 * at its row (13), drawn further on so that its target plane (2.4 over the plateau) meets the flight plane's rows through
 * the perspective camera (src/render/scene.ts rayPlacement; measured in game at the stop: 24.746; the orthographic lens
 * gives 24.24). Before and after its fight the renderer stands it here too.
 */
export const CITADEL_AT = 24.75;
/** The rock's plan about the temple's origin (nahara_citadel.py MESA): half width, front edge, the back circle's centre. */
const CITADEL_ROCK = { w: 7.4, front: -6.4, centre: -3.6 } as const;
/** Units outside the temple's rock (negative on it); Infinity without an arena. */
function citadelDistance(arena: TerrainArena | undefined, x: number, s: number): number {
  if (!arena) return Infinity;
  const ds = s - (arena.fromS + CITADEL_AT), r = CITADEL_ROCK;
  return ds <= r.centre ? Math.max(Math.abs(x) - r.w, r.front - ds) : Math.hypot(x, ds - r.centre) - r.w;
}
/** The arena's ground weight on Nahara: 1 under the temple's rock, 0 off it: the canyon's cliff falls from just inside the
 * rock's edge (user, 13 November: "the cliff can go right up to the model"), behind the rock's own carved cliff. */
export function naharaPlatform(arena: TerrainArena | undefined, _seed: number, x: number, s: number): number {
  return arena ? 1 - smoothRange(-1.3, -0.7, citadelDistance(arena, x, s)) : 0;
}
/** The highest ground near the temple: the city's two lower terraces round its canyon, rising away (its rock's plaza is
 * 0.9 over the plateau, its dome 5.1). */
function citadelGround(arena: TerrainArena | undefined, x: number, s: number): number {
  return PLATEAU + 2.2 + Math.max(0, citadelDistance(arena, x, s) - 6) * 0.35;
}
/** The tallest a ruin may reach near the temple (its dome is 5.1 over the plateau): well under it, rising away. */
function citadelCap(arena: TerrainArena | undefined, x: number, s: number): number {
  return PLATEAU + 3.0 + Math.max(0, citadelDistance(arena, x, s) - 8) * 0.25;
}

/** Nahara's ground: built terraces and natural sandstone, the chasm falling far to the hazy floor. */
export function naharaLandform(seed: number, x: number, s: number, row: PlanetRow): Landform & { tone: number; strata: number } {
  const arena = row.arena, platform = naharaPlatform(arena, seed, x, s);
  const m = naharaMasks(seed, x, s, platform, arena), built = m.built;
  const b = built > 0.001 ? builtGround(seed, x, s, m, platform) : 0, n = built < 0.999 ? naturalGround(seed, x, s, m, platform) : 0;
  // (Under THE CITADEL's rock exactly the plateau: the natural ground's benches would step it.)
  const height = mix(clamp(Math.min(built >= 0.999 ? b : built <= 0.001 ? n : mix(n, b, built), citadelGround(arena, x, s)), -9, 2.4), PLATEAU, platform);
  // Turquoise conduits: straight channels on the built terraces' block grid (the concept's glowing lines).
  const cx = Math.abs(((x / BLOCK) % 5 + 5) % 5 - 2.5), cs = Math.abs(((s / BLOCK) % 7 + 7) % 7 - 3.5);
  const lit = smoothRange(0.55, 0.7, noise(seed ^ 0x4a41, x * 0.04, s * 0.04)) * built;
  // (Only where lit: an unlit conduit drew soft dark bands across the tablelands like a floor grid.)
  const vein = lit > 0.02 ? (Math.min(cx, cs * 0.7) - 0.12) / 0.1 : 9;
  // Tone: built paving in a running bond (rows 0.8 deep, slabs 1.6 long, each row shifted half a slab), faint; natural
  // sandstone in strata by height (each layer its own shade, the layers wavering), as the concept's banded cliffs.
  const row8 = Math.floor(s / 0.8), slab = hash(seed ^ 0x4a51, Math.floor(x / 1.6 + (row8 & 1) * 0.5), row8);
  const layer = Math.floor(height * 1.4 + (noise(seed ^ 0x4a52, x * 0.12, s * 0.1) - 0.5) * 1.6);
  const tone = mix(hash(seed ^ 0x4a53, layer, 7), 0.5 + (slab - 0.5) * 0.35, built);
  const elevation = height >= PLATEAU - 0.6 ? 0.55 + 0.45 * smoothRange(PLATEAU, TOP, height) : 0.5 * smoothRange(NAHARA_FLOOR + 0.3, PLATEAU - 0.6, height);
  return {
    height, elevation, channel: 0, pool: 0,
    vein, vein2: 9, veins: lit * (1 - m.chasm) * (1 - platform), tone, strata: 1 - built,
  };
}

/* ---------------------------------------------------------------- colour */

const linear = (hex: number): readonly [number, number, number] => {
  const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [channel(hex >> 16 & 255), channel(hex >> 8 & 255), channel(hex & 255)];
};
/** The handover's palette, linear RGB: light sand, warm sandstone, mid brown, the canyon shadow. */
export const NAHARA_PALETTE = {
  sand: linear(0xd6bb8d), sandstone: linear(0xb89466), brown: linear(0x806044), shadow: linear(0x342c2a),
} as const;

function naharaColor(row: PlanetRow, x: number, point: PlanetPoint & { tone?: number; strata?: number }, _slope: number, _rim: number, out: [number, number, number]) {
  const P = NAHARA_PALETTE, fine = noise(row.seed ^ 0x4a7a, x * 1.3, row.s * 1.3), tone = point.tone ?? 0.5, natural = point.strata ?? 0;
  const high = smoothRange(0.55, 1, point.elevation), deep = 1 - smoothRange(0.05, 0.45, point.elevation);
  // Drifted sand over the natural ground's flats (large soft patches), never on the built paving.
  const drift = smoothRange(0.5, 0.75, noise(row.seed ^ 0x4a7b, x * 0.09, row.s * 0.08)) * natural * (1 - deep);
  for (let c = 0; c < 3; c++) {
    // The stone's shade (its slab or its stratum); the higher ground lighter and sun-bleached; the chasm floor dark.
    let value = mix(P.sandstone[c], P.sand[c], high * 0.45 + tone * 0.4);
    value = mix(value, P.brown[c], (1 - tone) * 0.35);
    value = mix(value, P.sand[c], drift * 0.5);
    value = mix(value, P.shadow[c], deep * 0.8);
    out[c] = value * (0.9 + fine * 0.2);
  }
  return out;
}

/* ---------------------------------------------------------------- dressing */

/**
 * The ruins round THE CITADEL (user, 13 November: "place the current world props next to the citadel ... so it looks like
 * the citadel is sitting in an ancient ruin city", then "the terrain around it should be much more interesting, more
 * ruins", "it should tower above other ruins"): the world's own kit, authored about the temple's rock, all under its dome
 * (citadelCap):
 * - monoliths rising out of its canyon all round, the concept's towers out of the haze;
 * - ruined arch bridges across the canyon from the rock to the rims, in front and behind (those at its sides are the
 *   model's own);
 * - on the rims, two rings of towers, gates, monoliths and mechanisms, some fallen;
 * - a ruined aqueduct across the city behind it; tumbled blocks.
 * Positions are fixed (the arena is authored); variants and small sizes come from the seed.
 */
type CitadelPiece = Omit<KitInstance, 'shade' | 'variant'> & { pick: number; big: boolean };
function citadelRuins(seed: number, arena: TerrainArena, terrain: ScatterField): CitadelPiece[] {
  const o = arena.fromS + CITADEL_AT, r = CITADEL_ROCK, out: CitadelPiece[] = [];
  const h = (i: number, k: number) => hash(seed ^ 0x4c01, i, k);
  /** A point `off` outside the rock's edge at angle t about its back circle's centre (t = -pi/2 straight ahead). */
  const around = (t: number, off: number): [number, number] => {
    const dx = Math.cos(t), dy = Math.sin(t), w = r.w + off;
    if (dy >= 0) return [dx * w, o + r.centre + dy * w];
    const k = Math.min(w / Math.max(Math.abs(dx), 1e-6), (r.centre - r.front + off) / Math.max(-dy, 1e-6));
    return [dx * k, o + r.centre + dy * k];
  };
  const ground = (x: number, s: number, rad: number) => Math.min(terrain.height(x - rad, s), terrain.height(x + rad, s), terrain.height(x, s - rad), terrain.height(x, s + rad), terrain.height(x, s));
  const onRim = (x: number, s: number, rad: number) => naharaPlatform(arena, seed, x, s) < 0.02 && ground(x, s, rad) > PLATEAU - 1.0 && terrain.slope(x, s) < 0.9 && Math.abs(x) < WORLD_HALF - rad;
  const inCanyon = (x: number, s: number) => naharaPlatform(arena, seed, x, s) < 0.02 && terrain.height(x, s) < PLATEAU - 2.2;
  // Monoliths out of the canyon, all round the rock.
  for (let i = 0; i < 28; i++) {
    const t = -Math.PI / 2 + (i + 0.5) / 28 * 2 * Math.PI + (h(i, 0) - 0.5) * 0.15, [x, s] = around(t, 1.0 + h(i, 1) * 1.8);
    if (!inCanyon(x, s) || h(i, 2) < 0.15) continue;
    const g = terrain.height(x, s), top = PLATEAU + 0.6 + h(i, 3) * 2.2;
    out.push({ kind: 'nahPillar', x, s, y: g - 0.3, scale: 0.55 + h(i, 4) * 0.35, height: top - g + 0.3, rotation: (h(i, 5) - 0.5) * 0.2, cosmetic: false, pick: h(i, 6), big: true });
  }
  // Arch bridges across the canyon: each from the rock's edge to the far rim (found by walking out at the plateau).
  const bridge = (x0: number, s0: number, dx: number, ds: number, i: number) => {
    let far = NaN;
    for (let d = 1; d < 7; d += 0.25) if (terrain.height(x0 + dx * d, s0 + ds * d) >= PLATEAU - 0.4) { far = d; break; }
    if (Number.isNaN(far) || far < 1.8) return;
    const half = far / 2 + 0.25, cx = x0 + dx * far / 2, cs = s0 + ds * far / 2, foot = PLATEAU - 3.6;
    out.push({ kind: 'nahArch', x: cx, s: cs, y: foot, scale: half / 0.85, height: PLATEAU + 1.4 + h(i, 7) * 0.6 - foot,
      rotation: Math.abs(ds) > 0.5 ? Math.PI / 2 : 0, cosmetic: false, pick: h(i, 8) < 0.5 ? 0.99 : 0, big: false });
  };
  // (The bridges at its sides are the model's own: tools/blender/nahara_citadel.py bridge.)
  bridge(-3.8, o + r.front + 0.2, 0, -1, 32); bridge(4.6, o + r.front + 0.2, 0, -1, 33);
  { const [bx, bs] = around(Math.PI / 2 - 0.5, -0.2); bridge(bx, bs, Math.cos(Math.PI / 2 - 0.5), Math.sin(Math.PI / 2 - 0.5), 34); }
  // Great arches across the gorge before the temple, wall to wall (the canyon arches' way: the walls found by walking out
  // from the gorge's middle at the piers' height), one broken; and half arches reaching out from its rims over it.
  // (Fixed spans, the piers sunk into whatever ledge or wall is there: the walls of the campaign's and endless's gorges
  // differ, and a search for them left the gorge bare.)
  [[-9.7, 5.4, 0.0], [-16.5, 7.2, -0.4], [-23.5, 6.0, 0.6]].forEach(([ds, half, cx], i) => {
    const foot = PLATEAU - 5.2, top = PLATEAU + 2.0 + h(20 + i, 0) * 0.6;
    out.push({ kind: 'nahArch', x: cx, s: o + ds, y: foot, scale: half / 0.85, height: top - foot, rotation: (h(20 + i, 1) - 0.5) * 0.12, cosmetic: false,
      pick: i === 1 ? 0.99 : 0, big: true });
  });
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, s = o - 9 - i * 2.6 - h(25 + i, 0) * 1.2;
    let rim = NaN;
    for (let d = 11.5; d > 2; d -= 0.25) if (terrain.height(side * d, s) < PLATEAU - 1.4) { rim = d + 0.25; break; }
    if (Number.isNaN(rim) || rim > 11 || h(25 + i, 1) < 0.3) continue;
    const g = terrain.height(side * rim, s), reach = 2.2 + h(25 + i, 2) * 1.6;
    out.push({ kind: 'nahSpur', x: side * (rim - reach * 0.8), s, y: g - 0.2, scale: reach / KIT.nahSpur.halfX, height: PLATEAU + 2.4 - g,
      rotation: side < 0 ? 0 : Math.PI, cosmetic: false, pick: h(25 + i, 3), big: false });
  }
  // Two rings of ruins on the rims.
  const kinds: CitadelPiece['kind'][] = ['nahTower', 'nahGate', 'nahPillar', 'nahTower', 'nahRing', 'nahPillar'];
  for (let ring = 0; ring < 4; ring++) for (let i = 0; i < 24; i++) {
    const k = 200 + ring * 30 + i, t = -Math.PI / 2 + (i + 0.5 * ring + h(k, 0) * 0.4) / 24 * 2 * Math.PI;
    const [x, s] = around(t, 3.6 + ring * 2.4 + h(k, 1) * 1.2), kind = kinds[(i + ring * 3) % kinds.length], scale = kind === 'nahTower' ? 1.3 + h(k, 2) * 0.7 : kind === 'nahGate' ? 1.4 + h(k, 2) * 0.4 : kind === 'nahRing' ? 1.4 : 0.6 + h(k, 2) * 0.3;
    const rad = KIT[kind].radius * scale * 0.6;
    if (!onRim(x, s, rad) || h(k, 3) < 0.1) continue;
    const g = ground(x, s, rad), facing = (h(k, 4) - 0.5) * (kind === 'nahGate' || kind === 'nahRing' ? 0.2 : 0.3);
    const height = kind === 'nahTower' ? 2.0 + h(k, 5) * 1.6 : kind === 'nahGate' ? 1.7 + h(k, 5) * 0.6 : kind === 'nahRing' ? 1.6 : (h(k, 5) < 0.35 ? 0.7 : 1.6 + h(k, 5) * 1.2);
    out.push({ kind, x, s, y: g - (kind === 'nahRing' ? 0.4 : 0.15), scale, height, rotation: facing, cosmetic: false, pick: h(k, 6), big: true });
  }
  // The rims filled: a candidate every 2.4 units over the city round the canyon, each a ruin of the kit (a tower, a
  // monolith or its stump, a small arch, a gate, a mechanism), kept apart from the others (user, 13 November: "surroundings
  // still empty").
  const placed: [number, number][] = out.filter(p => p.big).map(p => [p.x, p.s]);
  const fill: CitadelPiece['kind'][] = ['nahTower', 'nahPillar', 'nahArch', 'nahPillar', 'nahGate', 'nahArch', 'nahTower', 'nahRing', 'nahPillar', 'nahArch'];
  // (On the rims and on the canyon's ledges alike.)
  const onLedge = (x: number, s: number, rad: number) => naharaPlatform(arena, seed, x, s) < 0.02 && ground(x, s, rad) > PLATEAU - 4.6 && terrain.slope(x, s) < 0.7 && Math.abs(x) < WORLD_HALF - rad;
  for (let gs = -26; gs <= 16; gs += 2.0) for (let gx = -11; gx <= 11; gx += 2.0) {
    const k = 400 + Math.round((gs + 26) / 2) * 17 + Math.round((gx + 11) / 2);
    const x = gx + (h(k, 0) - 0.5) * 1.6, s = o + gs + (h(k, 1) - 0.5) * 1.6, d = citadelDistance(arena, x, s);
    if (d < 1.2 || d > 18 || h(k, 2) < 0.12) continue;
    const kind = fill[Math.floor(h(k, 3) * fill.length)], scale = kind === 'nahTower' ? 1.1 + h(k, 4) * 0.6 : kind === 'nahArch' ? 1.2 + h(k, 4) * 0.6
      : kind === 'nahGate' ? 1.2 + h(k, 4) * 0.4 : kind === 'nahRing' ? 1.2 : 0.45 + h(k, 4) * 0.3;
    const rad = KIT[kind].radius * scale * 0.6;
    if (!(onRim(x, s, rad) || onLedge(x, s, rad)) || placed.some(([px, ps]) => Math.hypot(px - x, ps - s) < 1.3 + rad)) continue;
    const g = ground(x, s, rad), stump = h(k, 5) < 0.3;
    const height = kind === 'nahTower' ? (stump ? 0.9 : 1.6 + h(k, 6) * 1.4) : kind === 'nahArch' ? 1.3 + h(k, 6) * 0.8 : kind === 'nahGate' ? 1.4 + h(k, 6) * 0.6
      : kind === 'nahRing' ? 1.4 : (stump ? 0.5 + h(k, 6) * 0.4 : 1.2 + h(k, 6) * 1.4);
    // (On a ledge deep in the canyon the towers and monoliths stand taller, up toward the rims.)
    const deep = (kind === 'nahTower' || kind === 'nahPillar') && !stump ? Math.max(0, PLATEAU - g) * 0.6 : 0;
    out.push({ kind, x, s, y: g - (kind === 'nahRing' ? 0.4 : 0.12), scale, height: height + deep, rotation: kind === 'nahArch' && h(k, 7) < 0.5 ? Math.PI / 2 : (h(k, 7) - 0.5) * 0.3,
      cosmetic: false, pick: kind === 'nahArch' ? (h(k, 8) < 0.5 ? 0.99 : 0) : h(k, 8), big: true });
    placed.push([x, s]);
  }
  // The ruined aqueduct behind the temple, across the city.
  const aq = o + r.centre + r.w + 6.2, scale = 1.15, bay = 2 * scale, level = PLATEAU + 2.6, base = level - 2.3;
  for (let b = -5; b <= 4; b++) {
    const x = (b + 0.5) * bay, under = Math.max(terrain.height(x - bay / 2, aq), terrain.height(x, aq), terrain.height(x + bay / 2, aq));
    if (under > base - 0.2 || h(70 + b, 0) < 0.2) continue;
    out.push({ kind: 'nahAqueduct', x, s: aq, y: base, scale, height: level - base, rotation: h(70 + b, 2) < 0.5 ? Math.PI : 0, cosmetic: false,
      pick: h(70 + b, 1) < 0.35 ? 0.5 : h(70 + b, 1) < 0.5 ? 5 / 6 : 0, big: false });
    for (const side of [-1, 1]) {
      const px = x + side * 0.9 * scale, g = terrain.height(px, aq);
      if (g > base - 0.05) continue;
      out.push({ kind: 'nahAqPier', x: px, s: aq, y: g - 1, scale, height: base + 0.08 - (g - 1), rotation: 0, cosmetic: false, pick: 0, big: false });
    }
  }
  // Tumbled blocks on the rims and the canyon's ledges.
  for (let i = 0; i < 70; i++) {
    const [x, s] = around(h(90 + i, 0) * 2 * Math.PI, 0.8 + h(90 + i, 1) * 10);
    if (naharaPlatform(arena, seed, x, s) > 0.02 || Math.abs(x) > WORLD_HALF - 1 || terrain.slope(x, s) > 0.6 || terrain.height(x, s) < -6.2) continue;
    out.push({ kind: 'nahBlocks', x, s, y: terrain.height(x, s) - 0.06, scale: 1.2 + h(90 + i, 2) * 1.0, height: 0.9 + h(90 + i, 3) * 0.6, rotation: h(90 + i, 4) * Math.PI * 2,
      cosmetic: true, pick: h(90 + i, 5), big: false });
  }
  return out;
}

/**
 * Nahara's dressing (tools/blender/nahara_kit.py), few and great (user, 12 November: "larger structures ... towers and arcs
 * of ruins rising or extending cliffs and hills ... It should feel huge"):
 * - monoliths: piles of great blocks standing out of the chasm floor, up past the rims, thickest in the basins;
 * - great arches spanning the narrows rim to rim, some broken;
 * - broken half arches springing from the rims and reaching out over the chasm;
 * - ruined towers and gates on the terraces near the rims, a mechanism set into a high wall now and then;
 * - cliff facings, stretched to each cliff's drop, with tall lit slits and portals (their masonry is the detail map's);
 * - a few great tumbled blocks.
 */
function* naharaScatterSteps(seed: number, startS: number, size: number, terrain: ScatterField): Work<KitInstance[]> {
  const essential: KitInstance[] = [], cosmetic: KitInstance[] = [];
  // THE CITADEL's arena (Nahara's own ground there: its rock, its canyon, and the ruin city's built country).
  const arena = terrain.arena(startS + size / 2);
  const add = (instance: Omit<KitInstance, 'shade' | 'variant'>, pick: number) => {
    const spec = KIT[instance.kind];
    if (instance.s < startS || instance.s >= startS + size || Math.abs(instance.x) + spec.radius * instance.scale * 0.6 > WORLD_HALF) return;
    const cap = Math.min(TALL.has(instance.kind) ? UMBRA_SPIRE_MAX : UMBRA_SCENERY_MAX, citadelCap(arena, instance.x, instance.s));
    if (instance.y + instance.height * spec.height > cap) instance = { ...instance, height: (cap - instance.y) / spec.height };
    if (instance.height <= 0.05) return;
    const placed: KitInstance = { ...instance, variant: Math.min(spec.variants - 1, Math.floor(pick * spec.variants)), shade: terrain.shade(instance.x, instance.s) };
    (placed.cosmetic ? cosmetic : essential).push(placed);
  };
  // Great arches over the narrows, wall to wall, square to the run; one in three broken. Each pier stands against its wall,
  // half sunk into it (user, 13 November: piers standing free in the haze read as disconnected): the walls are found by
  // walking out from the canyon's middle at the piers' top, across the arch's whole thickness.
  // Where the arches and the other great ruins stand (s of every arch; x, s of every great piece): they keep apart.
  // (Only this section's own: a neighbour section's pieces near the seam are not seen, a rare near pair.)
  const arches: number[] = [], big: [number, number][] = [];
  // (Denser since the user's "i want more ruins in the level", 13 November: 15 and 5; 18 and 7 before. The arches stay
  // spread: "between 270-400 theres so many arches on the canyon".)
  const ARCH_GAP = 15, BIG_GAP = 5;
  const platformAt = (x: number, s: number) => naharaPlatform(arena, seed, x, s);
  const masksAt = (x: number, s: number) => naharaMasks(seed, x, s, 0, arena);
  if (arena) for (const { pick, big: great, ...piece } of citadelRuins(seed, arena, terrain)) {
    add(piece, pick);
    if (great) big.push([piece.x, piece.s]);
  }
  const roomFor = (x: number, s: number, arch: boolean) => (!arch || arches.every(a => Math.abs(a - s) >= ARCH_GAP))
    && big.every(([bx, bs]) => Math.hypot(bx - x, bs - s) >= BIG_GAP);
  // Every ARCH_STEP a candidate: most stand in the built country (the ruin districts), a few in the natural sandstone.
  // (24 since the user's "between 270-400 theres so many arches on the canyon. Spread them out more", 13 November; 12 before;
  // 20 with "i want more ruins in the level".)
  const ARCH_STEP = 20;
  for (let k = Math.floor(startS / ARCH_STEP) - 1; k <= Math.ceil((startS + size) / ARCH_STEP); k++) {
    const h = (i: number) => hash(seed ^ 0x4b01, k, i);
    const s = (k + 0.25 + h(1) * 0.5) * ARCH_STEP;
    if (s < startS || s >= startS + size || platformAt(0, s) > 0) continue;
    const c = naharaCourse(seed, s, arena);
    if (c.fork > 0.2 || c.half > 4.6 || h(0) > (naharaBuilt(seed, c.center, s, arena) > 0.5 ? 0.7 : 0.3)) continue;
    const middle = terrain.height(c.center, s);
    if (middle > PLATEAU - 3) continue;
    // Its feet far down in the chasm (the concept's arch springs from the depths), its crown under the spire cap; the piers
    // (the piece's lower 0.4) reach the rims; the walls are taken at the piers' middle (a low natural rim lets the pier rise
    // over it, an abutment).
    const foot = Math.max(middle, mix(PLATEAU, NAHARA_FLOOR, 0.45)), height = UMBRA_SPIRE_MAX - foot - h(3) * 0.6, probe = foot + height * 0.25;
    const wall = (dir: number) => {
      let far = -Infinity;
      for (const ds of [-0.7, 0, 0.7]) {
        let found = NaN;
        for (let d = 0.5; d < 8; d += 0.25) if (terrain.height(c.center + dir * d, s + ds) >= probe) { found = d; break; }
        if (Number.isNaN(found)) return NaN;
        far = Math.max(far, found);
      }
      return far;
    };
    const left = wall(-1), right = wall(1);
    if (Number.isNaN(left) || Number.isNaN(right)) continue;
    // Pier centres (the piece's x ±0.85) on the wall faces.
    const center = c.center + (right - left) / 2, half = (left + right) / 2 + 0.15, scale = half / 0.85;
    if (half < 2 || half > 6.5) continue;
    add({ kind: 'nahArch', x: center, s, y: foot, scale, height, rotation: 0, cosmetic: false }, h(2) < 0.33 ? 0.99 : 0);
    arches.push(s); big.push([center, s]);
  }
  // The great ruins on the hills (user, 13 November: arches "on hills above the canyon to fill in more", then "Spread them
  // out more, other ruins too"): one candidate per LATTICE patch of tableland, jittered within it, so they spread evenly
  // instead of gathering where the dice fall: free-standing arches, monoliths, towers (some great) and gates. Patches in
  // the built country are taken more often than in the natural sandstone.
  const LATTICE_X = 6, LATTICE_S = 8;
  for (let j = Math.floor(startS / LATTICE_S); j < Math.ceil((startS + size) / LATTICE_S); j++) for (let i = 0; i < Math.ceil(WORLD_HALF * 2 / LATTICE_X); i++) {
    const h = (k: number) => hash(seed ^ 0x4b21, i * 53 + k, j);
    const x = -WORLD_HALF + (i + 0.2 + h(0) * 0.6) * LATTICE_X, s = (j + 0.2 + h(1) * 0.6) * LATTICE_S;
    if (s < startS || s >= startS + size || terrain.blocked(x, s) || platformAt(x, s) >= 0.3) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), m = masksAt(x, s);
    if (m.chasm > 0.5 || ground < PLATEAU - 1.2 || slope > 0.6 || h(2) > (m.built > 0.5 ? 0.92 : 0.72)) continue;
    const what = h(3), squared = Math.round(h(4) * 4) * Math.PI / 2 + (h(5) - 0.5) * 0.12;
    if (what < 0.32) {
      // A great free-standing arch, square to the run or across it, both feet on the ground.
      const half = 1.5 + h(6) * 1.2, across = h(7) < 0.5, ax = across ? 0 : half, as = across ? half : 0;
      const left = terrain.height(x - ax, s - as), right = terrain.height(x + ax, s + as);
      if (Math.abs(left - right) < 0.9 && Math.min(left, right) > PLATEAU - 1.6 && roomFor(x, s, true)) {
        add({ kind: 'nahArch', x, s, y: Math.min(left, right, ground) - 0.15, scale: half / 0.85, height: 2.2 + h(8) * 1.4,
          rotation: across ? Math.PI / 2 : 0, cosmetic: false }, h(9) < 0.35 ? 0.99 : 0);
        arches.push(s); big.push([x, s]);
      }
    } else if (!roomFor(x, s, false)) {
      continue;
    } else if (what < 0.55) {
      // A monolith of stacked blocks, some fallen to a stump.
      add({ kind: 'nahPillar', x, s, y: ground - 0.2, scale: 0.7 + h(10) * 0.4, height: (h(11) < 0.3 ? 0.8 : 1.6) + h(12) * 1.4, rotation: squared, cosmetic: false }, h(13));
    } else {
      // A ruined tower (one in four a great one, as big as the arches) or a gate, its front toward the camera.
      const gate = what > 0.86, great = !gate && h(14) < 0.25;
      const scale = gate ? 1.8 + h(15) * 0.6 : great ? 2.4 + h(15) * 0.6 : 1.4 + h(15) * 0.8, height = gate ? 2 + h(16) * 0.8 : great ? 3.2 + h(16) : 2.6 + h(16) * 2;
      add({ kind: gate ? 'nahGate' : 'nahTower', x, s, y: ground - 0.1, scale, height, rotation: (h(17) - 0.5) * 0.3, cosmetic: false }, h(18));
    }
    big.push([x, s]);
  }
  // Ruined aqueducts (user, 13 November: "aqueducts, mostly running horizontally across ... it can be ruined aqueducts,
  // doesnt need to be connected"; then no glow, piers "extend well below so that they never float", ends broken): now and
  // then a run straight across the map at one level, bay after bay (tools/blender/nahara_kit.py aqueduct), each bay its
  // own height, its piers carried down to the ground as columns (aqueduct_pier) sunk a unit into it. Ruined: bays missing,
  // some broken through, a hill swallowing it where the ground rises to its level; wherever a run breaks off, its last bay
  // is the ruined end piece facing the gap. It keeps clear of the arches' rows and of the other great ruins.
  const AQUEDUCT_STEP = 48, BAY_HEIGHT = 2.3, PIER_X = 0.9;
  for (let k = Math.floor(startS / AQUEDUCT_STEP); k <= Math.ceil((startS + size) / AQUEDUCT_STEP); k++) {
    const h = (i: number) => hash(seed ^ 0x4b41, k, i);
    const s = (k + 0.3 + h(0) * 0.4) * AQUEDUCT_STEP;
    if (s < startS || s >= startS + size || h(1) > 0.65 || arches.some(a => Math.abs(a - s) < 10)) continue;
    const scale = 1.1 + h(2) * 0.3, bay = 2 * scale, level = PLATEAU + 2.2 + h(3) * 1.1, base = level - BAY_HEIGHT * (0.9 + 0.2 * h(5));
    // The bays first (which stand), then their pieces: a bay whose neighbour is gone is the ruined end facing it.
    const bays: { x: number; stands: boolean }[] = [];
    for (let b = 0, x = -WORLD_HALF + bay * (0.5 + h(4)); x < WORLD_HALF - bay / 2; b++, x += bay) {
      const g = (i: number) => hash(seed ^ 0x4b43, k * 97 + b, i);
      const clear = !(platformAt(x, s) > 0 || terrain.blocked(x, s) || big.some(([bx, bs]) => Math.hypot(bx - x, bs - s) < 2.6));
      const under = Math.max(terrain.height(x - bay / 2, s), terrain.height(x, s), terrain.height(x + bay / 2, s));
      bays.push({ x, stands: g(0) >= 0.3 && clear && under < base - 0.2 });
    }
    bays.forEach(({ x, stands }, b) => {
      if (!stands) return;
      const g = (i: number) => hash(seed ^ 0x4b43, k * 97 + b, i);
      const left = bays[b - 1]?.stands ?? true, right = bays[b + 1]?.stands ?? true;
      // Variant 0 whole, 1 broken through, 2 the ruined end (toward +x; turned round to face a gap on the left).
      const end = !right || !left, variant = end ? 2 : g(1) < 0.25 ? 1 : 0, turned = end && right && !left || (!left && !right && g(2) < 0.5);
      add({ kind: 'nahAqueduct', x, s, y: base, scale, height: level - base, rotation: turned ? Math.PI : 0, cosmetic: false }, (variant + 0.5) / 3);
      // The columns under its piers (an end's broken pier too), each down into the ground under it.
      for (const side of [-1, 1]) {
        const px = x + side * PIER_X * scale, ground = terrain.height(px, s);
        if (ground > base - 0.05) continue;
        const foot = ground - 1;
        add({ kind: 'nahAqPier', x: px, s, y: foot, scale, height: base + 0.08 - foot, rotation: 0, cosmetic: false }, 0);
      }
    });
  }
  const cell = 1, columns = Math.ceil(WORLD_HALF * 2 / cell);
  for (let j = Math.floor(startS / cell); j < Math.ceil((startS + size) / cell); j++) for (let i = 0; i < columns; i++) {
    if (i === 0) yield;
    const h = (k: number) => hash(seed ^ 0x4b11, i * 43 + k, j);
    const x = -WORLD_HALF + (i + 0.5 + (h(0) - 0.5) * 0.8) * cell, s = (j + 0.5 + (h(1) - 0.5) * 0.8) * cell;
    if (s < startS || s >= startS + size || terrain.blocked(x, s)) continue;
    const ground = terrain.height(x, s), slope = terrain.slope(x, s), drop = terrain.drop(x, s), pick = h(2), platform = platformAt(x, s);
    // (Nothing on THE CITADEL's rock: the temple stands on it from the start.)
    if (platform >= 0.3) continue;
    const m = masksAt(x, s), c = m.course;
    // The ruins gather in the built country: there more of everything, in the natural sandstone only a few.
    const ruin = m.built > 0.5 ? 1.5 : 0.45;
    // Square axes for the built pieces (the ruins were laid out on a grid), a little slack for age.
    const squared = Math.round(h(7) * 4) * Math.PI / 2 + (h(8) - 0.5) * 0.12;
    if (m.chasm > 0.5 && ground < PLATEAU - 1.5) {
      // Monoliths out of the haze, up past the rims: a few in the channels, many more in the basins.
      const chance = (0.005 + 0.013 * c.wide) * ruin, side = Math.abs(x - c.center) / Math.max(1, c.half);
      if (slope < 0.8 && pick < chance && side > 0.2) {
        const top = PLATEAU + 1.6 + h(9) * (UMBRA_SPIRE_MAX - PLATEAU - 1.6);
        add({ kind: 'nahPillar', x, s, y: ground - 0.3, scale: 0.95 + h(10) * 0.5, height: top - ground + 0.3, rotation: squared, cosmetic: false }, h(11));
      } else if (slope < 0.6 && pick > 0.993 && ground > -6.2) {
        // Tumbled blocks on the ledges only: on the floor, lost in the haze, they read as blocks floating in the mist.
        add({ kind: 'nahBlocks', x, s, y: ground - 0.06, scale: 1.6 + h(12) * 1.2, height: 1.2 + h(13) * 0.8, rotation: h(14) * Math.PI * 2, cosmetic: true }, h(15));
      }
      continue;
    }
    if (m.chasm > 0.5) continue;
    const nearRim = m.inland < 0.3, rim = drop > 0.6;
    // Toward the chasm (for the spurs): the nearer channel's side.
    const toward = Math.sign(c.center - x) || 1;
    const reach = 2.6 + h(16) * 2;
    if (nearRim && ground > PLATEAU - 1.2 && slope < 0.6 && drop < 0.5 && pick < 0.009 * ruin && terrain.height(x + toward * reach * 1.4, s) < ground - 2) {
      // A broken half arch springing from the rim and reaching out over the chasm (the concept's great arc): its pier (the
      // piece's x -1 end) on the rim here, the arc reaching `reach` out over the drop.
      add({ kind: 'nahSpur', x: x + toward * reach * 0.8, s, y: ground - 0.2, scale: reach / KIT.nahSpur.halfX, height: UMBRA_SPIRE_MAX - ground - h(17) * 1.2,
        rotation: toward > 0 ? 0 : Math.PI, cosmetic: false }, h(18));
    } else if (rim && drop > 3 && pick > 0.996) {
      // A circular mechanism set into a high wall, facing out over the drop.
      const gx = terrain.gradientX(x, s), gs = terrain.gradientS(x, s), g = Math.hypot(gx, gs) || 1;
      add({ kind: 'nahRing', x, s, y: ground - drop * 0.6, scale: 1.6 + h(24) * 0.6, height: 1.8, rotation: Math.atan2(-gx / g, gs / g), cosmetic: false }, h(25));
    } else if (slope < 0.45 && pick > (m.built > 0.5 ? 0.972 : 0.978)) {
      // Tumbled blocks over the open ground.
      add({ kind: 'nahBlocks', x, s, y: ground - 0.06, scale: 1.2 + h(26) * 1, height: 0.9 + h(27) * 0.6, rotation: h(28) * Math.PI * 2, cosmetic: true }, h(29));
    }
  }
  // (No carved facings since 13 November: stretched to each cliff's drop as wall pieces, their caps jutted over the rims and
  // their masonry smeared; the ground's own cliffs carry the masonry.)
  return [...essential, ...cosmetic];
}

export const NAHARA: PlanetProfile = {
  ...UMBRA,
  id: 'nahara', seaLevel: null,
  mood: () => 'nahara', params: () => NEUTRAL, local: () => null,
  landform: naharaLandform,
  color: naharaColor,
  // Warm shade: the canyon's shadows stay a warm umber.
  shadowTint: [0.82, 0.76, 0.72],
  cliffs: true,
  // The sun behind the ship, to the left (user, 13 November: "i like 7:30 here"): the arches' fronts and the camera-facing
  // cliffs in the light, the shadows falling up the screen.
  sunBehind: true,
  scatter: naharaScatterSteps,
};
