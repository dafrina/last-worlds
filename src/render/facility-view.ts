import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState } from '../shared/contracts';
import { MODULES_BY_NODE, modulesOf, type FacilityWorld, type ModuleRole } from './facility-kit';
import { composeFacility, nodeBudget, type ArrangementId, type FacilityPlant } from './facility-layouts';
import { loadTexturedNodes, type TexturedPart } from './models';
import { paintMaterial } from './world-paint';

/**
 * Which compounds the game builds around ground batteries:
 * - 2: the textured v2 plants, one GLB per world holding two whole compounds (art/facility-remodel);
 * - 3: the modular kits of docs/25, composed per battery by `facility-layouts.ts` (all four kits shipped 20 October).
 * Set it back to 2 to roll back; both paths stay working.
 */
export const FACILITY_VERSION: 2 | 3 = 3;
/**
 * Dev/test overrides, set before the renderer is created (tests/fixtures/nacre-world.ts `fv=`). `standIns`: a missing
 * v3 kit (or kit node) is drawn as registry boxes instead of falling back to the legacy emplacements. Never in
 * production builds.
 */
export const facilityOptions: { version: 2 | 3; standIns: boolean } = { version: FACILITY_VERSION, standIns: !!import.meta.env?.DEV };

interface Seat { kind: string; groundX: number; groundS: number; base: number; afloat: boolean }
/** A world (x, s) rectangle no compound may cover. */
interface Reservation { minX: number; maxX: number; minS: number; maxS: number }
/** Read-only QA evidence for the browser checks (scene.ts `data-render-stats`). */
export interface FacilityStats {
  version: 2 | 3; loaded: boolean; count: number;
  /** v2: plants using the large compound. */
  large: number;
  /** v3: each plant's arrangement, its kit source per world, and the module instances drawn this frame. */
  arrangements?: ArrangementId[]; kits?: Record<string, string>; modules?: number;
}
export interface FacilityView {
  /** The current planet's plants are ready (v2: Luna has none). */
  readonly loaded: boolean;
  readonly count: number;
  /** v2 only: plants using the large compound (v3 reports 0). */
  readonly largeCount: number;
  readonly clearings: Reservation[];
  readonly stats: FacilityStats;
  /** The battery has a plant, or (v3) may still get one once its world's kit has loaded: no legacy emplacement yet. */
  contains(id: number): boolean;
  /** Starts loading a planet's plants ahead of its first battery. */
  prepare(planet: PlanetId): Promise<void>;
  isReady(planet: PlanetId): boolean;
  warmupObjects(): THREE.Object3D[];
  /**
   * `reserved`: district pads (docs/23 §4.8). A compound never covers one; that battery keeps its legacy emplacement.
   * `ground` (v3): the terrain surface, sampled once per plant so each apron tile lies on the ground it covers.
   */
  update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>, reserved?: readonly Reservation[],
    ground?: (x: number, s: number) => number): void;
  dispose(): void;
}

/**
 * Blender-authored plants embrace existing ground batteries. Pure scenery: the open courtyard never moves a target.
 * Each planet's GLB (baked atlases) loads on arrival and is released once its last plant has scrolled away; until it
 * is ready, that planet's batteries keep their smaller emplacements.
 */
export function createFacilityView(scene: THREE.Scene, onReady: () => void, version: 2 | 3 = facilityOptions.version): FacilityView {
  return version === 3 ? createModularView(scene, onReady) : createCompoundView(scene, onReady);
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
const kitUrl = (world: FacilityWorld) => `${import.meta.env.BASE_URL}assets/${world}/facility-kit-v3.glb`;
interface Kit { source: 'glb' | 'stand-in' | 'mixed'; batches: Map<string, THREE.InstancedMesh[]>; dispose(): void }

/**
 * Each battery's plant is composed once, when the battery first appears with its world's kit ready, from that kit's
 * modules: one instanced draw per module node and material part, placed with each module's yaw. A battery that gets
 * no plant keeps its legacy emplacement (scene.ts asks `contains`).
 */
function createModularView(scene: THREE.Scene, onReady: () => void): FacilityView {
  /** Each plant with the height every module is drawn at (NaN: an apron tile the terrain is too rough for). */
  const kits = new Map<FacilityWorld, Kit | 'loading' | 'failed'>(), plants: { id: number; plant: FacilityPlant; y: number[] }[] = [];
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
    get largeCount() { return 0; },
    get clearings() { return plants.map(({ plant }) => ({ ...plant.bounds })); },
    get stats(): FacilityStats {
      return { version: 3, loaded: this.loaded, count: plants.length, large: 0, arrangements: plants.map(p => p.plant.arrangement),
        kits: Object.fromEntries([...kits].map(([world, kit]) => [world, typeof kit === 'object' ? kit.source : kit])), modules: drawn };
    },
    contains(id: number) { return waiting.has(id) || plants.some(p => p.id === id); },
    prepare(planet: PlanetId) { prefetched = planet; return prepare(planet); },
    isReady(planet: PlanetId) { return kits.has(planet) && kits.get(planet) !== 'loading'; },
    warmupObjects() { return [...kits.values()].flatMap(kit => typeof kit === 'object' ? [...kit.batches.values()].flat() : []); },
    update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>, reserved: readonly Reservation[] = [],
      ground?: (x: number, s: number) => number) {
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
        const plant = composeFacility(planet, id, state.config.seed, { x: seat.groundX, s: seat.groundS, base: seat.base },
          { batteries: others, reserved, plants: plants.map(p => p.plant) });
        if (plant) plants.push({ id, plant, y: heightsOf(plant, ground) });
      }
      kits.forEach(kit => { if (typeof kit === 'object') kit.batches.forEach(meshes => meshes.forEach(mesh => { mesh.count = 0; })); });
      drawn = 0;
      for (const { plant, y } of plants) {
        const kit = ready(plant.world), b = plant.bounds;
        if (!kit || b.minX > state.cameraX + VIEW.width / 2 + 3 || b.maxX < state.cameraX - VIEW.width / 2 - 3
          || b.minS - state.distance > VIEW.maxS + 6 || b.maxS - state.distance < VIEW.minS - 3) continue;
        for (const [i, module] of plant.modules.entries()) {
          const meshes = kit.batches.get(module.node);
          if (!meshes || Number.isNaN(y[i])) continue;
          transform.position.set(plant.x + module.x, y[i], -(plant.s + module.s - state.distance));
          transform.rotation.set(0, module.yaw, 0); transform.updateMatrix();
          for (const mesh of meshes) if (mesh.count < mesh.instanceMatrix.count) mesh.setMatrixAt(mesh.count++, transform.matrix);
          drawn++;
        }
      }
      kits.forEach((kit, site) => {
        if (typeof kit !== 'object') return;
        // A world left behind releases its kit once its last plant is gone (endless revisits reload it).
        if (site !== planet && site !== prefetched && !plants.some(p => p.plant.world === site)) { kit.dispose(); kits.delete(site); loads.delete(site); return; }
        // Unused nodes skip their draw entirely.
        kit.batches.forEach(meshes => meshes.forEach(mesh => { mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true; }));
      });
    },
    dispose() { disposed = true; kits.forEach(kit => { if (typeof kit === 'object') kit.dispose(); }); kits.clear(); },
  };
}

/**
 * Draw heights: buildings sink with the plant (rule 3); flat pieces lie on the seat's ground. With a terrain sampler, each
 * apron tile lies just above the highest ground under it, so terrain never pokes through it; its skirt hides most of
 * the drop to the lowest (a stepped terrace on dunes and slopes). A tile on ground rougher than ROUGH is left out (NaN),
 * and the tile under the gun stays at the gun's own ground.
 */
const ROUGH = 1.1;
function heightsOf(plant: FacilityPlant, ground?: (x: number, s: number) => number): number[] {
  return plant.modules.map(m => {
    const module = MODULES_BY_NODE.get(m.node)!;
    if (!module.flat) return plant.base;
    if (!ground || !module.roles.includes('apron')) return plant.ground;
    const [hx, hs] = module.half, x = plant.x + m.x, s = plant.s + m.s;
    const samples = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, ds]) => ground(x + dx * (hx - .1), s + ds * (hs - .1)));
    const hi = Math.max(...samples), lo = Math.min(...samples);
    if (Math.abs(m.x) < hx && Math.abs(m.s) < hs) return hi <= plant.ground + .1 ? plant.ground : NaN;
    return hi - lo > ROUGH ? NaN : hi - .02;
  });
}

// ── Stand-ins (development and tests only). Delete this block and `facilityOptions.standIns` once all three kits ship. ──
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

// ── v2: two whole compounds per world (rollback path while FACILITY_VERSION is 2) ──

type Site = Exclude<PlanetId, 'luna'>;
type Node = `facility_${Site}` | `facility_${Site}_large`;
interface Compound { id: number; x: number; s: number; y: number; planet: Site; node: Node }
/** A planet's two plants: one instanced draw per material (baked surface, glow). */
interface CompoundKit { batches: Map<Node, THREE.InstancedMesh[]>; dispose(): void }
const CAPACITY = 12;
// Authored bounds plus a small scatter margin. Large has 1.9× the floor area and additional plant rooms.
const SIZE = {
  small: {halfX: 3.6, minS: -1.8, maxS: 4.6, height: 2.651},
  large: {halfX: 4.6, minS: -2.8, maxS: 6.1, height: 2.831},
};
const bounds = (node: Node) => SIZE[node.endsWith('_large') ? 'large' : 'small'];
/** The v2 remodels after the facility sheets (tools/blender/remodel_facilities.py): one textured GLB per planet. */
const assetOf = (planet: Site) => `${import.meta.env.BASE_URL}assets/${planet}/facility-compounds-v2-remodel.glb`;

function createCompoundView(scene: THREE.Scene, onReady: () => void): FacilityView {
  const kits = new Map<Site, CompoundKit | 'loading' | 'failed'>(), compounds: Compound[] = [];
  const transform = new THREE.Object3D();
  const loads = new Map<PlanetId, Promise<void>>();
  let prefetched: PlanetId | null = null;
  let disposed = false, config: RunState['config'] | null = null, lastTick = -1, current: PlanetId | null = null;
  const ready = (planet: Site) => { const kit = kits.get(planet); return typeof kit === 'object' ? kit : null; };
  function prepare(planet: Site) {
    if (loads.has(planet)) return loads.get(planet)!;
    kits.set(planet, 'loading');
    const nodes: Node[] = [`facility_${planet}`, `facility_${planet}_large`];
    const loading = loadTexturedNodes(assetOf(planet), nodes).then(found => {
      const release = releaser(found.values());
      if (disposed || found.size !== nodes.length) {
        release();
        if (!disposed) { kits.set(planet, 'failed'); console.warn(`Facility compounds for ${planet} are incomplete; retaining the smaller battery emplacements.`); }
        return;
      }
      const batches = new Map<Node, THREE.InstancedMesh[]>();
      for (const [name, parts] of found) batches.set(name, parts.map(part => {
        part.material.envMapIntensity = .85;
        paintMaterial(part.material, planet, 'facility');
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, CAPACITY);
        mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
        mesh.castShadow = !/glow/i.test(part.material.name); mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        return mesh;
      }));
      kits.set(planet, { batches, dispose() { batches.forEach(meshes => meshes.forEach(mesh => { scene.remove(mesh); mesh.dispose(); })); release(); } });
      onReady();
    }).catch(error => { kits.set(planet, 'failed'); console.warn(`Facility compounds for ${planet} unavailable; retaining the smaller battery emplacements.`, error); });
    loads.set(planet, loading); return loading;
  }
  return {
    get loaded() { return current === 'luna' || (current !== null && ready(current) !== null); },
    get count() { return compounds.length; },
    get largeCount() { return compounds.filter(c => c.node.endsWith('_large')).length; },
    get stats(): FacilityStats { return { version: 2, loaded: this.loaded, count: this.count, large: this.largeCount }; },
    contains(id: number) { return compounds.some(c => c.id === id); },
    get clearings() { return compounds.map(c => { const b = bounds(c.node); return { minX: c.x - b.halfX, maxX: c.x + b.halfX, minS: c.s + b.minS, maxS: c.s + b.maxS }; }); },
    prepare(planet: PlanetId) { prefetched = planet; return planet === 'luna' ? Promise.resolve() : prepare(planet); },
    isReady(planet: PlanetId) { return planet === 'luna' || (kits.has(planet) && kits.get(planet) !== 'loading'); },
    warmupObjects() { return [...kits.values()].flatMap(kit => typeof kit === 'object' ? [...kit.batches.values()].flat() : []); },
    update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>, reserved: readonly Reservation[] = []) {
      if (config !== state.config || state.tick < lastTick) { compounds.length = 0; config = state.config; }
      lastTick = state.tick; current = planet;
      for (let i = compounds.length - 1; i >= 0; i--) if (compounds[i].s - state.distance < VIEW.minS - 10) compounds.splice(i, 1);
      if (planet !== 'luna') prepare(planet);
      if (planet !== 'luna' && ready(planet)) for (const [id, seat] of batteries) {
        if (seat.kind === 'fuel' || compounds.some(c => c.id === id) || compounds.length >= CAPACITY) continue;
        if (seat.afloat && planet !== 'nacre') continue;
        // Stable cosmetic choice, independent of combat's RNG. Try the smaller plant when a large one cannot fit.
        const wantsLarge = ((Math.imul(id, 0x45d9f3b) ^ state.config.seed) >>> 0) % 3 === 0;
        for (const large of wantsLarge ? [true, false] : [false]) {
          const b = SIZE[large ? 'large' : 'small'];
          if (Math.abs(seat.groundX) + b.halfX > VIEW.worldWidth / 2) continue;
          if (reserved.some(r => seat.groundX + b.halfX > r.minX && seat.groundX - b.halfX < r.maxX && seat.groundS + b.maxS > r.minS && seat.groundS + b.minS < r.maxS)) continue;
          if (compounds.some(c => {
            const other = bounds(c.node);
            return Math.abs(c.x - seat.groundX) < other.halfX + b.halfX + 1
              && c.s + other.maxS + 2 > seat.groundS + b.minS && c.s + other.minS - 2 < seat.groundS + b.maxS;
          })) continue;
          // Keep nearby guns outside the wings/rear plant; no visual structure may conceal another target.
          if ([...batteries].some(([other, gun]) => other !== id && Math.abs(gun.groundX - seat.groundX) < b.halfX + .4
            && gun.groundS > seat.groundS + b.minS - .4 && gun.groundS < seat.groundS + b.maxS + .4)) continue;
          // Sink the foundation a little on raised ground, never flatten the machinery. Unsuitable high ground keeps legacy emplacements.
          const y = Math.min(seat.base, VIEW.flightHeight - .45 - b.height);
          if (seat.base - y > .35) continue;
          compounds.push({id, x: seat.groundX, s: seat.groundS, y, planet, node: `facility_${planet}${large ? '_large' : ''}`});
          break;
        }
      }
      kits.forEach(kit => { if (typeof kit === 'object') kit.batches.forEach(meshes => meshes.forEach(mesh => { mesh.count = 0; })); });
      for (const c of compounds) {
        const meshes = ready(c.planet)?.batches.get(c.node), s = c.s - state.distance;
        if (!meshes || Math.abs(c.x - state.cameraX) > VIEW.width / 2 + bounds(c.node).halfX || s > VIEW.maxS + 9 || s < VIEW.minS - 8) continue;
        transform.position.set(c.x, c.y, -s); transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1, 1); transform.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      kits.forEach((kit, site) => {
        if (typeof kit !== 'object') return;
        // A planet left behind releases its atlases once its last plant is gone (endless revisits reload them).
        if (site !== planet && site !== prefetched && !compounds.some(c => c.planet === site)) { kit.dispose(); kits.delete(site); loads.delete(site); return; }
        kit.batches.forEach(meshes => meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; }));
      });
    },
    dispose() { disposed = true; kits.forEach(kit => { if (typeof kit === 'object') kit.dispose(); }); kits.clear(); },
  };
}
