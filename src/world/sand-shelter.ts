import { smoothRange } from './terrain-layout';
import { KIT, type KitInstance, type KitKind } from './scenery-kit';
import { MESH_HALF, TERRAIN_STEP, type TerrainSection } from './terrain';

/*
 * Where Nahara's wind ripples lie (docs/39, 17 November; user: the ripples "run below rocks and buildings/ruins", and
 * should stay on "open stretches of land and canyon floors"). The terrain decides the bed (TerrainSection.sandClearance:
 * natural sandstone and the canyons' floors, away from cliffs and slopes); this adds the scenery standing on it. Every
 * placed piece shelters the sand round its footprint, so it sits in smooth sand: full calm on and just round the
 * footprint, fading over a short halo, and a tail on its lee (downwind) side. Only the ripples fade; the sand's colour is
 * the ground's own. Pure functions of the sections' own pieces, so a section's mask is deterministic; pieces within
 * SAND_SHELTER_REACH of a join shelter both sections' sand alike, so the ripples run on (or stop) across it.
 */

/**
 * The wind over Nahara's sand (toward +x, a little toward the camera: -s), world units a second: the sand streams blow
 * with it (src/render/sand-streams.ts) and the ripples' crests lie across it (src/render/terrain-kit.ts SAND_K1).
 */
export const SAND_WIND = { x: 1.9, s: -0.35 } as const;
const WIND_LENGTH = Math.hypot(SAND_WIND.x, SAND_WIND.s), WIND_X = SAND_WIND.x / WIND_LENGTH, WIND_S = SAND_WIND.s / WIND_LENGTH;

/**
 * One piece's shelter: a rectangle in (x, s) (its centre, the unit axis of its local x, its half extents along local x
 * and z), calm out to `inner` past its edge, fading to nothing at `outer`, and a tail fading over `lee` downwind.
 */
export interface SandShelter { x: number; s: number; ax: number; as: number; hx: number; hz: number; inner: number; outer: number; lee: number }

/**
 * How far a shelter reaches from its rectangle's centre, at most (units): the rows of a section this near a join are
 * sheltered by its neighbour's pieces too. The largest footprints (a great tower's 2.1 half extent, a buried arch's
 * crown 2.5) with their halo and lee tail stay inside it.
 */
export const SAND_SHELTER_REACH = 7;

/** A piece's plan in its own frame at scale 1 (three.js local x and z): min x, max x, min z, max z. */
export type KitPlan = readonly [number, number, number, number];
/**
 * Nahara's kit pieces in plan, per variant: measured from public/assets/nahara/nahara-kit.glb (every vertex, rounded out
 * to the hundredth; tests/world/terrain-nahara.test.ts holds them to the model). The contract bounds (scenery-kit KIT) are
 * the most a node may take; the pieces take less, the tumbled blocks about half (0.6 by 0.6 contracted, about 0.35 by
 * 0.35 modelled). Other kinds keep their contract bounds.
 */
export const NAHARA_PLANS: Partial<Record<KitKind, readonly KitPlan[]>> = {
  nahTower: [[-0.69, 0.7, -0.68, 0.69], [-0.67, 0.64, -0.65, 0.69], [-0.7, 0.69, -0.68, 0.7]],
  nahGate: [[-0.95, 0.95, -0.37, 0.4], [-0.95, 0.95, -0.37, 0.4]],
  nahPillar: [[-0.98, 0.96, -0.97, 0.96], [-0.94, 0.93, -0.92, 0.95], [-0.95, 0.97, -0.96, 0.96]],
  nahArch: [[-0.95, 0.95, -0.2, 0.2], [-0.95, 0.95, -0.2, 0.2]],
  nahSpur: [[-1, 0.52, -0.26, 0.26], [-1, 0.8, -0.26, 0.26]],
  nahRing: [[-0.76, 0.76, -0.24, 0.25]],
  nahBlocks: [[-0.36, 0.32, -0.27, 0.4], [-0.36, 0.5, -0.3, 0.5], [-0.26, 0.49, -0.27, 0.28]],
  nahAqueduct: [[-1.04, 1.04, -0.27, 0.27], [-1.04, 1.04, -0.27, 0.27], [-1.04, 1.04, -0.27, 0.27]],
  nahAqPier: [[-0.15, 0.15, -0.26, 0.26]],
  nahDrums: [[-0.87, 0.75, -0.42, 0.22], [-0.82, 0.9, -0.48, 0.34]],
  nahStub: [[-0.5, 0.68, -0.34, 0.34], [-0.62, 0.68, -0.22, 0.5]],
  nahFooting: [[-0.93, 0.93, -0.93, 0.93], [-0.87, 0.95, -0.57, 0.81]],
  nahDebris: [[-0.86, 0.7, -0.46, 0.42], [-0.88, 0.9, -0.43, 0.39], [-0.61, 0.62, -0.57, 0.53]],
  nahRelic: [[-0.66, 0.62, -0.16, 0.37], [-0.81, 0.71, -0.33, 0.37]],
  nahWall: [[-1.05, 1.05, -0.6, 0.34], [-1.05, 1.05, -0.6, 0.34], [-1.05, 1.05, -0.6, 0.34], [-1.05, 1.05, -0.6, 0.34]],
};
/**
 * Where a standing arch meets the ground: its piers (tools/blender/kit_nahara.py arch: local x 0.66 to 0.94 either side;
 * a half arch's one pier, nahSpur, -1 to -0.64), its span clear over the ground (over a canyon, far over it).
 */
export const ARCH_PIERS: Readonly<Partial<Record<KitKind, readonly KitPlan[]>>> = {
  nahArch: [[-0.95, -0.66, -0.2, 0.2], [0.66, 0.95, -0.2, 0.2]],
  nahSpur: [[-1, -0.64, -0.26, 0.26]],
};
/** A piece's whole plan (its variant's measured one, or its kind's contract bounds). */
export function kitPlan(piece: KitInstance): KitPlan {
  const spec = KIT[piece.kind];
  return NAHARA_PLANS[piece.kind]?.[piece.variant] ?? [-spec.halfX, spec.halfX, -spec.halfZ, spec.halfZ];
}
/**
 * Where a piece meets the ground, in its own frame at scale 1: its plan, a standing arch's piers, or nothing for a piece
 * standing clear of the ground under it (an aqueduct's bay over its pier columns). `exposed` is how far it stands over the
 * ground at its centre; a buried arch (the buried empire's crowns, at most 1.2 showing) meets the sand along its width.
 */
export function groundPlans(piece: KitInstance, ground: number): readonly KitPlan[] {
  const piers = ARCH_PIERS[piece.kind];
  if (piers) return piece.y + piece.height * KIT[piece.kind].height - ground < 1.6 ? [kitPlan(piece)] : piers;
  return piece.y > ground + 0.3 ? [] : [kitPlan(piece)];
}

/**
 * The calm round a footprint of radius `r` whose piece stands `e` over the ground (units): fully calm just past its edge,
 * fading over a few tenths more (a larger and taller piece's further), and a tail downwind as long as about half its
 * height, at most 2 (a rubble field's well under a unit, a tower's 2).
 */
const halo = (r: number, e: number) => {
  const tall = Math.min(3, Math.max(0.2, e)), inner = 0.1 + 0.05 * r;
  return { inner, outer: inner + 0.3 + 0.12 * r + 0.1 * tall, lee: Math.min(2, 0.3 + 0.5 * tall + 0.1 * r) };
};
/**
 * A piece's footprint `plan` (its own frame at scale 1) in world (x, s): local x turns by `rotation` to (cos, sin), local
 * z to (sin, -cos) (three.js turns about +y, with z = -s), both scaled by the piece's scale; `e` it stands over the ground.
 */
function footprint(piece: KitInstance, [minX, maxX, minZ, maxZ]: KitPlan, e: number): SandShelter {
  const ax = Math.cos(piece.rotation), as = Math.sin(piece.rotation), k = piece.scale;
  const cx = (minX + maxX) / 2 * k, cz = (minZ + maxZ) / 2 * k, hx = (maxX - minX) / 2 * k, hz = (maxZ - minZ) / 2 * k;
  return { x: piece.x + ax * cx + as * cz, s: piece.s + as * cx - ax * cz, ax, as, hx, hz, ...halo(Math.hypot(hx, hz), e) };
}

/** Ground height of a section's mesh at world (x, s), bilinear, clamped to the section. */
export function groundAt(section: TerrainSection, x: number, s: number): number {
  const u = Math.min(section.across - 1, Math.max(0, (x + MESH_HALF) / TERRAIN_STEP));
  const v = Math.min(section.along - 1, Math.max(0, (s - section.startS) / TERRAIN_STEP));
  const c0 = Math.min(section.across - 2, Math.floor(u)), r0 = Math.min(section.along - 2, Math.floor(v)), fu = u - c0, fv = v - r0;
  const y = (r: number, c: number) => section.positions[(r * section.across + c) * 3 + 1];
  return (y(r0, c0) * (1 - fu) + y(r0, c0 + 1) * fu) * (1 - fv) + (y(r0 + 1, c0) * (1 - fu) + y(r0 + 1, c0 + 1) * fu) * fv;
}

/** Each section's footprints (a section never changes once generated). */
const cache = new WeakMap<TerrainSection, readonly SandShelter[]>();
/** The footprints a section's pieces stand on, at ground level (groundPlans), with their calm round them. */
export function sandShelters(section: TerrainSection): readonly SandShelter[] {
  const known = cache.get(section);
  if (known) return known;
  const out: SandShelter[] = [];
  for (const piece of section.instances) {
    const ground = groundAt(section, piece.x, piece.s), e = piece.y + piece.height * KIT[piece.kind].height - ground;
    for (const plan of groundPlans(piece, ground)) out.push(footprint(piece, plan, e));
  }
  cache.set(section, out);
  return out;
}

/**
 * The scenery's shelter over rows [rowFrom, rowTo] of a section into `out` (per vertex, the section's own layout): 1 on and
 * just round a footprint, fading to 0 over its halo and lee tail, the strongest shelter where several meet. The ripples
 * lie at the terrain's bed times one minus this (src/render/terrain-kit.ts SAND_RIPPLES). Returns `out`.
 */
export function sandShelterRows(section: TerrainSection, shelters: readonly SandShelter[], out: Float32Array, rowFrom: number, rowTo: number): Float32Array {
  const across = section.across, r0 = Math.max(0, rowFrom), r1 = Math.min(section.along - 1, rowTo);
  out.fill(0, r0 * across, (r1 + 1) * across);
  for (const f of shelters) {
    // The rectangle's bounding reach: its corner, its halo, and its lee tail.
    const reach = Math.hypot(f.hx, f.hz) + Math.max(f.outer, f.lee + f.outer);
    const rowA = Math.max(r0, Math.ceil((f.s - reach - section.startS) / TERRAIN_STEP)), rowB = Math.min(r1, Math.floor((f.s + reach - section.startS) / TERRAIN_STEP));
    if (rowA > rowB) continue;
    const colA = Math.max(0, Math.ceil((f.x - reach + MESH_HALF) / TERRAIN_STEP)), colB = Math.min(across - 1, Math.floor((f.x + reach + MESH_HALF) / TERRAIN_STEP));
    // Local z's axis in (x, s) (local x turned a quarter: local z = (sin, -cos) when local x = (cos, sin)), and the
    // rectangle's half extent downwind (where its lee tail starts).
    const zx = f.as, zs = -f.ax, downwind = Math.abs(f.hx * (f.ax * WIND_X + f.as * WIND_S)) + Math.abs(f.hz * (zx * WIND_X + zs * WIND_S));
    for (let row = rowA; row <= rowB; row++) {
      const ds = section.startS + row * TERRAIN_STEP - f.s;
      for (let column = colA; column <= colB; column++) {
        const v = row * across + column;
        if (out[v] >= 1) continue;
        const dx = -MESH_HALF + column * TERRAIN_STEP - f.x;
        // Distance outside the rectangle, and the lee: the point taken back upwind by how far it lies past the downwind
        // edge (up to `lee`), its tail thinning as it goes.
        const u = dx * f.ax + ds * f.as, w = dx * zx + ds * zs;
        let calm = 1 - smoothRange(f.inner, f.outer, Math.hypot(Math.max(0, Math.abs(u) - f.hx), Math.max(0, Math.abs(w) - f.hz)));
        const past = Math.min(f.lee, Math.max(0, dx * WIND_X + ds * WIND_S - downwind));
        if (past > 0 && calm < 1) {
          const bx = dx - WIND_X * past, bs = ds - WIND_S * past, bu = bx * f.ax + bs * f.as, bw = bx * zx + bs * zs;
          const tail = (1 - smoothRange(f.inner, f.outer, Math.hypot(Math.max(0, Math.abs(bu) - f.hx), Math.max(0, Math.abs(bw) - f.hz)))) * (1 - smoothRange(0, f.lee, past));
          if (tail > calm) calm = tail;
        }
        if (calm > out[v]) out[v] = calm;
      }
    }
  }
  return out;
}

/**
 * A section's shelter per vertex from its own pieces and its neighbours' near the joins (pass the sections either side
 * when known). Deterministic: the same sections give the same mask, and a join's row is the same in both sections.
 */
export function sandShelter(section: TerrainSection, neighbours: readonly TerrainSection[] = []): Float32Array {
  const shelters = [...sandShelters(section), ...neighbours.flatMap(near => sandShelters(near))];
  return sandShelterRows(section, shelters, new Float32Array(section.across * section.along), 0, section.along - 1);
}

/**
 * The ripples' strength per vertex before the shader's own tests (walls, steep faces, streams): the terrain's bed calmed by
 * the scenery, `sandClearance · (1 − shelter)`. Undefined on worlds without a sand bed (every one but Nahara).
 */
export function sandRipples(section: TerrainSection, neighbours: readonly TerrainSection[] = []): Float32Array | undefined {
  const bed = section.sandClearance;
  if (!bed) return undefined;
  const shelter = sandShelter(section, neighbours);
  for (let v = 0; v < shelter.length; v++) shelter[v] = bed[v] * (1 - shelter[v]);
  return shelter;
}
