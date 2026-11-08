import { liveInstances } from './instances';
import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState } from '../shared/contracts';
import { FACILITY_KIT_ASSETS, MODULES_BY_NODE, modulesOf, type FacilityWorld, type ModuleRole } from './facility-kit';
import { composeFacility, nodeBudget, type ArrangementId, type FacilityPlant } from './facility-layouts';
import { loadTexturedNodes, type TexturedPart } from './models';
import { paintMaterial } from './world-paint';
import type { ViewFootprint } from './view-footprint';

/**
 * The compounds around ground batteries are the modular kits of docs/25, composed per battery by `facility-layouts.ts`
 * (all four kits shipped 20 October). The v2 whole-compound plants were removed on 8 November (docs/38 V7); their GLBs
 * are archived in art/archive/assets.
 *
 * Dev/test override, set before the renderer is created: `standIns` draws a missing kit (or kit node) as registry
 * boxes instead of falling back to the legacy emplacements. Never in production builds.
 */
export const facilityOptions: { standIns: boolean } = { standIns: !!import.meta.env?.DEV };

interface Seat {
  kind: string; groundX: number; groundS: number; base: number; afloat: boolean;
  /** The battery spawned inside the view (a late ground wave; its gun rises out of the ground, scene.ts). */
  late?: boolean;
}
/**
 * A late battery's plant keeps only the modules behind it, from LATE_BEHIND beyond its seat on: they and their terrain
 * clearing lie beyond the top edge when the battery appears and scroll in with the ground, while its gun rises in front
 * of them (user, 3 November: only turrets rise; "make sure other ground stuff is loaded already"). A late battery spawns
 * at its entry row, at the top edge, so everything from there on is still out of view.
 */
const LATE_BEHIND = 1.6;
function behindOnly(plant: FacilityPlant): FacilityPlant | null {
  const reach = (node: string) => Math.max(...MODULES_BY_NODE.get(node)!.half);
  const modules = plant.modules.filter(m => m.s - reach(m.node) >= LATE_BEHIND);
  if (!modules.length) return null;
  const bounds = {
    minX: Math.min(...modules.map(m => plant.x + m.x - reach(m.node))), maxX: Math.max(...modules.map(m => plant.x + m.x + reach(m.node))),
    minS: Math.min(...modules.map(m => plant.s + m.s - reach(m.node))), maxS: Math.max(...modules.map(m => plant.s + m.s + reach(m.node))),
  };
  return { ...plant, modules, bounds };
}
/** A world (x, s) rectangle no compound may cover. */
interface Reservation { minX: number; maxX: number; minS: number; maxS: number }
/** Read-only QA evidence for the browser checks (scene.ts `data-render-stats`). */
export interface FacilityStats {
  loaded: boolean; count: number;
  /** Each plant's arrangement, its kit source per world, and the module instances drawn this frame. */
  arrangements?: ArrangementId[]; kits?: Record<string, string>; modules?: number;
  /** The tallest foundation drawn under a building or tank this frame (render QA; at most FOUNDATION_MAX). */
  floating?: number;
}
export interface FacilityView {
  /** The current planet's plants are ready. */
  readonly loaded: boolean;
  readonly count: number;
  readonly clearings: Reservation[];
  readonly stats: FacilityStats;
  /** The battery has a plant, or may still get one once its world's kit has loaded: no legacy emplacement yet. */
  contains(id: number): boolean;
  /** Starts loading a planet's plants ahead of its first battery. */
  prepare(planet: PlanetId): Promise<void>;
  isReady(planet: PlanetId): boolean;
  warmupObjects(): THREE.Object3D[];
  /**
   * `reserved`: district pads (docs/23 §4.8). A compound never covers one; that battery keeps its legacy emplacement.
   * `ground`: the terrain surface, sampled once per plant so each apron tile lies on the ground it covers.
   */
  update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>, reserved?: readonly Reservation[],
    ground?: (x: number, s: number) => number, view?: ViewFootprint): void;
  dispose(): void;
}

/**
 * Blender-authored plants embrace existing ground batteries. Pure scenery: the open courtyard never moves a target.
 * Each planet's GLB (baked atlases) loads on arrival and is released once its last plant has scrolled away; until it
 * is ready, that planet's batteries keep their smaller emplacements.
 */
export function createFacilityView(scene: THREE.Scene, onReady: () => void): FacilityView {
  return createModularView(scene, onReady);
}

/** Disposes geometries, materials and their textures once (kits share one atlas material across nodes). */
function releaser(parts: Iterable<TexturedPart[]>) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  for (const list of parts) for (const part of list) { geometries.add(part.geometry); materials.add(part.material); }
  return () => {
    geometries.forEach(g => g.dispose());
    materials.forEach(m => { for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose(); m.dispose(); });
  };
}

// ── v3: modular kits (docs/25) ──

/** Plants alive at once (as v2); the terrain view takes at most 12 clearings. */
const PLANTS = 12;
const kitUrl = (world: FacilityWorld) => `${import.meta.env.BASE_URL}assets/${world}/${FACILITY_KIT_ASSETS[world]}`;
interface Kit { source: 'glb' | 'stand-in' | 'mixed'; batches: Map<string, THREE.InstancedMesh[]>; dispose(): void }

/**
 * Each battery's plant is composed once, when the battery first appears with its world's kit ready, from that kit's
 * modules: one instanced draw per module node and material part, placed with each module's yaw. A battery that gets
 * no plant keeps its legacy emplacement (scene.ts asks `contains`).
 */
function createModularView(scene: THREE.Scene, onReady: () => void): FacilityView {
  /** Each plant with the height every module is drawn at (NaN: an apron tile the terrain is too rough for). */
  const kits = new Map<FacilityWorld, Kit | 'loading' | 'failed'>(), plants: { id: number; plant: FacilityPlant; y: number[]; lows: number[] }[] = [];
  /**
   * Foundations (terrain version 16): a block under each building or tank standing over lower ground, down to the lowest
   * ground under it, in the world's foundation colour. One draw.
   */
  const foundations = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
    new THREE.MeshStandardMaterial({ color: FOUNDATION_COLOR.khepri, roughness: .92, metalness: .05 }), PLANTS * 24);
  foundations.name = 'facility foundations'; foundations.count = 0; foundations.frustumCulled = false;
  foundations.castShadow = foundations.receiveShadow = true; foundations.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(foundations);
  let floating = 0, foundationPlanet: PlanetId | null = null;
  /** Batteries already composed (with or without a plant): composition runs once per battery. */
  const decided = new Set<number>();
  /** Batteries seen while their world's kit was still loading: they wait for it instead of taking legacy pieces. */
  const waiting = new Set<number>();
  const transform = new THREE.Object3D();
  const loads = new Map<PlanetId, Promise<void>>();
  let prefetched: PlanetId | null = null;
  let disposed = false, config: RunState['config'] | null = null, lastTick = -1, current: PlanetId | null = null, drawn = 0;
  const ready = (planet: FacilityWorld) => { const kit = kits.get(planet); return typeof kit === 'object' ? kit : null; };
  function prepare(world: FacilityWorld) {
    if (loads.has(world)) return loads.get(world)!;
    // A world with no facility modules (Amnion, Corona, Umbra build no plants) has no kit file: settle exactly as a failed
    // load did (the smaller battery emplacements), without requesting a file that is not there (docs/38 V4).
    if (!modulesOf(world).length) { kits.set(world, 'failed'); const settled = Promise.resolve(); loads.set(world, settled); return settled; }
    kits.set(world, 'loading');
    const nodes = modulesOf(world).map(module => module.node), standIns = facilityOptions.standIns;
    const loading = loadTexturedNodes(kitUrl(world), nodes).catch(error => {
      if (!standIns) throw error;
      console.warn(`Facility kit for ${world} unavailable; drawing registry stand-ins (development only).`, error);
      return new Map<string, TexturedPart[]>();
    }).then(found => {
      const missing = nodes.filter(node => !found.has(node));
      if (disposed || (missing.length && !standIns)) {
        releaser(found.values())();
        if (!disposed) { kits.set(world, 'failed'); console.warn(`Facility kit for ${world} is incomplete; retaining the smaller battery emplacements.`); }
        return;
      }
      const parts = new Map(found);
      if (missing.length) {
        if (found.size) console.warn(`Facility kit for ${world} lacks ${missing.join(', ')}; drawing stand-ins for them (development only).`);
        standInParts(missing).forEach((list, node) => parts.set(node, list));
      }
      const release = releaser(parts.values()), budget = nodeBudget(world), batches = new Map<string, THREE.InstancedMesh[]>();
      for (const [node, list] of parts) batches.set(node, list.map(part => {
        part.material.envMapIntensity = .85;
        // The world's paint (src/render/world-paint.ts, user 21 October), never the stand-ins' plain colours.
        if (part.material.name !== 'facility_stand_in') paintMaterial(part.material, world, 'facility');
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, PLANTS * (budget.get(node) ?? 1));
        mesh.name = node; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
        // Flat ground pieces (aprons, rings, pads, pools, channels) only receive shadows.
        mesh.castShadow = !/glow/i.test(part.material.name) && !MODULES_BY_NODE.get(node)?.flat; mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        return mesh;
      }));
      kits.set(world, {
        source: missing.length === nodes.length ? 'stand-in' : missing.length ? 'mixed' : 'glb', batches,
        dispose() { batches.forEach(meshes => meshes.forEach(mesh => { scene.remove(mesh); mesh.dispose(); })); release(); },
      });
      onReady();
    }).catch(error => { kits.set(world, 'failed'); console.warn(`Facility kit for ${world} unavailable; retaining the smaller battery emplacements.`, error); });
    loads.set(world, loading); return loading;
  }
  return {
    get loaded() { return current !== null && ready(current) !== null; },
    get count() { return plants.length; },
    get clearings() { return plants.map(({ plant }) => ({ ...plant.bounds })); },
    get stats(): FacilityStats {
      return { loaded: this.loaded, count: plants.length, arrangements: plants.map(p => p.plant.arrangement),
        kits: Object.fromEntries([...kits].map(([world, kit]) => [world, typeof kit === 'object' ? kit.source : kit])), modules: drawn,
        floating: Math.round(floating * 100) / 100 };
    },
    contains(id: number) { return waiting.has(id) || plants.some(p => p.id === id); },
    prepare(planet: PlanetId) { prefetched = planet; return prepare(planet); },
    isReady(planet: PlanetId) { return kits.has(planet) && kits.get(planet) !== 'loading'; },
    warmupObjects() { return [...kits.values()].flatMap(kit => typeof kit === 'object' ? [...kit.batches.values()].flat() : []); },
    update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>, reserved: readonly Reservation[] = [],
      ground?: (x: number, s: number) => number, view: ViewFootprint = legacyView(state)) {
      if (config !== state.config || state.tick < lastTick) { plants.length = 0; decided.clear(); waiting.clear(); config = state.config; }
      lastTick = state.tick; current = planet;
      for (let i = plants.length - 1; i >= 0; i--) if (plants[i].plant.bounds.maxS - state.distance < VIEW.minS - 4) plants.splice(i, 1);
      for (const id of decided) if (!batteries.has(id)) decided.delete(id);
      waiting.clear();
      prepare(planet);
      // While the kit loads, keep its batteries free of legacy pieces; a failed kit releases them to scene.ts.
      if (kits.get(planet) === 'loading') for (const [id, seat] of batteries) if (seat.kind !== 'fuel') waiting.add(id);
      if (ready(planet)) for (const [id, seat] of batteries) {
        if (decided.has(id) || plants.length >= PLANTS) continue;
        decided.add(id);
        if (seat.kind === 'fuel' || (seat.afloat && planet !== 'nacre')) continue;
        // Stable cosmetic layout from (battery id, run seed), independent of combat's RNG (docs/25 rule 5).
        const others: { x: number; s: number }[] = [];
        for (const [other, gun] of batteries) if (other !== id) others.push({ x: gun.groundX, s: gun.groundS });
        const composed = composeFacility(planet, id, state.config.seed, { x: seat.groundX, s: seat.groundS, base: seat.base },
          { batteries: others, reserved, plants: plants.map(p => p.plant), ...(ground ? { stands: standsOn(ground) } : {}) });
        const plant = composed && seat.late ? behindOnly(composed) : composed;
        if (plant) plants.push({ id, plant, ...heightsOf(plant, ground) });
      }
      kits.forEach(kit => { if (typeof kit === 'object') kit.batches.forEach(meshes => meshes.forEach(mesh => { mesh.count = 0; })); });
      drawn = 0; floating = 0; foundations.count = 0;
      if (foundationPlanet !== planet) { foundationPlanet = planet; (foundations.material as THREE.MeshStandardMaterial).color.setHex(FOUNDATION_COLOR[planet]); }
      for (const { plant, y, lows } of plants) {
        const kit = ready(plant.world), b = plant.bounds;
        // The camera's ground footprint (src/render/view-footprint.ts), so no plant pops in at the lens's wider far end.
        if (!kit || b.minX > view.maxX + 1 || b.maxX < view.minX - 1
          || b.minS - state.distance > view.maxS + 1 || b.maxS - state.distance < view.minS - 1) continue;
        for (const [i, module] of plant.modules.entries()) {
          const meshes = kit.batches.get(module.node);
          if (!meshes || Number.isNaN(y[i])) continue;
          transform.position.set(plant.x + module.x, y[i], -(plant.s + module.s - state.distance));
          transform.rotation.set(0, module.yaw, 0); transform.updateMatrix();
          for (const mesh of meshes) if (mesh.count < mesh.instanceMatrix.count) mesh.setMatrixAt(mesh.count++, transform.matrix);
          drawn++;
          // A building or tank over lower ground stands on its foundation, down to the lowest ground under it.
          const drop = y[i] - lows[i];
          if (drop > .06 && foundations.count < foundations.instanceMatrix.count) {
            const [hx, hs] = MODULES_BY_NODE.get(module.node)!.half;
            transform.position.y = lows[i] - .12; transform.scale.set(hx * 1.9, drop + .14, hs * 1.9); transform.updateMatrix();
            foundations.setMatrixAt(foundations.count++, transform.matrix); transform.scale.set(1, 1, 1);
            floating = Math.max(floating, drop);
          }
        }
      }
      liveInstances(foundations, foundations.count);
      kits.forEach((kit, site) => {
        if (typeof kit !== 'object') return;
        // A world left behind releases its kit once its last plant is gone (endless revisits reload it).
        if (site !== planet && site !== prefetched && !plants.some(p => p.plant.world === site)) { kit.dispose(); kits.delete(site); loads.delete(site); return; }
        // Unused nodes skip their draw entirely.
        kit.batches.forEach(meshes => meshes.forEach(mesh => liveInstances(mesh, mesh.count)));
      });
    },
    dispose() {
      disposed = true; kits.forEach(kit => { if (typeof kit === 'object') kit.dispose(); }); kits.clear();
      scene.remove(foundations); foundations.geometry.dispose(); (foundations.material as THREE.Material).dispose(); foundations.dispose();
    },
  };
}

/** The orthographic view's rectangle with the old margins, for callers that pass no footprint (tests, fixtures). */
const legacyView = (state: RunState): ViewFootprint => ({
  minX: state.cameraX - VIEW.width / 2 - 3, maxX: state.cameraX + VIEW.width / 2 + 3, minS: VIEW.minS - 3, maxS: VIEW.maxS + 6,
});

/** Foundation blocks under buildings over lower ground: concrete in each world's tone (version 16). */
const FOUNDATION_COLOR: Readonly<Record<PlanetId, number>> = { khepri: 0x5a4434, luna: 0xa9abae, vesper: 0x8c97a3, nacre: 0x2a2440, amnion: 0x5a3a2c, corona: 0x221a15, umbra: 0x1c1a26 };

/**
 * Draw heights: buildings sink with the plant (rule 3); flat pieces lie on the seat's ground. With a terrain sampler, each
 * apron tile lies just above the highest ground under it, so terrain never pokes through it; its skirt hides most of
 * the drop to the lowest (a stepped terrace on dunes and slopes). A tile on ground rougher than ROUGH is left out (NaN),
 * and the tile under the gun stays at the gun's own ground.
 */
const ROUGH = 1.1;
/**
 * Buildings and tanks (terrain version 16; user, 21 October: "many of the gas tanks … are somewhere in the sky", and "place
 * a base below for these cases as you do for the compound tiles"): each keeps the plant's level, or rises onto higher
 * ground under its own footprint, and stands on a foundation block reaching down to the lowest ground under it. On a
 * cliff (more than FOUNDATION_MAX of drop under it), or where it would rise too close to the flight plane, it is left
 * out (NaN).
 */
const FOUNDATION_MAX = 2.4;
/** Where a building or tank stands on the real ground (its seat and the lowest ground under it), or a NaN seat. */
function standOf(node: string, x: number, s: number, base: number, ground: (x: number, s: number) => number): { seat: number; low: number } {
  const module = MODULES_BY_NODE.get(node)!, [hx, hs] = module.half, r = Math.max(hx, hs) - .1;
  const samples = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, ds]) => ground(x + dx * r, s + ds * r));
  const hi = Math.max(...samples), low = Math.min(...samples), seat = Math.max(base, hi - .05);
  return { seat: seat - low > FOUNDATION_MAX || seat + module.top > VIEW.flightHeight - .45 ? NaN : seat, low };
}
/** The composer's seat test (FacilityContext.stands): the same rule the plant is drawn by. */
export const standsOn = (ground: (x: number, s: number) => number) =>
  (node: string, x: number, s: number, base: number) => !Number.isNaN(standOf(node, x, s, base, ground).seat);

function heightsOf(plant: FacilityPlant, ground?: (x: number, s: number) => number): { y: number[]; lows: number[] } {
  const lows: number[] = [];
  const y = plant.modules.map(m => {
    const module = MODULES_BY_NODE.get(m.node)!;
    if (!module.flat) {
      if (!ground) { lows.push(plant.base); return plant.base; }
      const { seat, low } = standOf(m.node, plant.x + m.x, plant.s + m.s, plant.base, ground);
      lows.push(low);
      return seat;
    }
    lows.push(-Infinity);
    if (!ground || !module.roles.includes('apron')) return plant.ground;
    const [hx, hs] = module.half, x = plant.x + m.x, s = plant.s + m.s;
    const samples = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, ds]) => ground(x + dx * (hx - .1), s + ds * (hs - .1)));
    const hi = Math.max(...samples), lo = Math.min(...samples);
    if (Math.abs(m.x) < hx && Math.abs(m.s) < hs) return hi <= plant.ground + .1 ? plant.ground : NaN;
    return hi - lo > ROUGH ? NaN : hi - .02;
  });
  return { y, lows };
}

// ── Stand-ins (development and tests only): what a missing kit file or node draws instead (facilityOptions.standIns). ──
const STAND_IN_COLOR: Partial<Record<ModuleRole, number>> = {
  hall: 0x8d939b, tank: 0x5f9ea6, column: 0xc8b25a, landmark: 0xd2763c, pump: 0x7d8f62, pipe: 0x4f78b0,
  wall: 0x9b7f63, detail: 0xa6a0c8, pad: 0x3c4148, ring: 0x3c4148, arc: 0xb59ad6, pool: 0x46b8c8, apron: 0x6b6e73,
};
/** Registry-sized geometry per missing node (half, top): boxes, cylinders for round pieces, a curved arc. */
function standInParts(nodes: readonly string[]): Map<string, TexturedPart[]> {
  const materials = new Map<number, THREE.MeshStandardMaterial>(), out = new Map<string, TexturedPart[]>();
  for (const node of nodes) {
    const module = MODULES_BY_NODE.get(node)!, [hx, hs] = module.half, top = Math.max(module.top, .02);
    let geometry: THREE.BufferGeometry;
    if (module.arc) {
      // Annular sector about local (0, −arc), concave side toward −s, chord half hx.
      const r = module.arc, inner = r - .2, outer = r + .2, a = Math.asin(Math.min(1, hx / outer));
      const shape = new THREE.Shape();
      shape.absarc(0, -r, outer, Math.PI / 2 - a, Math.PI / 2 + a, false);
      shape.absarc(0, -r, inner, Math.PI / 2 + a, Math.PI / 2 - a, true);
      geometry = new THREE.ExtrudeGeometry(shape, { depth: top, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
    } else if (module.turns === 'free' || (module.roles.includes('tank') && Math.abs(hx - hs) < .01)) {
      geometry = new THREE.CylinderGeometry(Math.min(hx, hs), Math.min(hx, hs), top, 12).translate(0, top / 2, 0);
    } else geometry = new THREE.BoxGeometry(hx * 2, top, hs * 2).translate(0, top / 2, 0);
    const color = STAND_IN_COLOR[module.roles.find(role => STAND_IN_COLOR[role] !== undefined) ?? 'hall']!;
    let material = materials.get(color);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: .1, name: 'facility_stand_in' }); materials.set(color, material); }
    out.set(node, [{ geometry, material }]);
  }
  return out;
}
