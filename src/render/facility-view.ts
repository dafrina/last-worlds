import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState } from '../shared/contracts';
import { loadTexturedNodes } from './models';

type Site = Exclude<PlanetId, 'luna'>;
type Node = `facility_${Site}` | `facility_${Site}_large`;
interface Seat { kind: string; groundX: number; groundS: number; base: number; afloat: boolean }
interface Compound { id: number; x: number; s: number; y: number; planet: Site; node: Node }
/** A world (x, s) rectangle no compound may cover. */
interface Reservation { minX: number; maxX: number; minS: number; maxS: number }
/** A planet's two plants: one instanced draw per material (baked surface, glow). */
interface Kit { batches: Map<Node, THREE.InstancedMesh[]>; dispose(): void }
const CAPACITY = 12;
// Authored bounds plus a small scatter margin. Large has 1.9× the floor area and additional plant rooms.
const SIZE = {
  small: {halfX: 3.6, minS: -1.8, maxS: 4.6, height: 2.651},
  large: {halfX: 4.6, minS: -2.8, maxS: 6.1, height: 2.831},
};
const bounds = (node: Node) => SIZE[node.endsWith('_large') ? 'large' : 'small'];
/** The v2 remodels after the facility sheets (tools/blender/remodel_facilities.py): one textured GLB per planet. */
const assetOf = (planet: Site) => `${import.meta.env.BASE_URL}assets/${planet}/facility-compounds-v2-remodel.glb`;

/**
 * Blender-authored plants embrace existing ground batteries. Pure scenery: the open courtyard never moves a target.
 * Each planet's GLB (baked atlases) loads on arrival and is released once its last plant has scrolled away; until it
 * is ready, that planet's batteries keep their smaller emplacements.
 */
export function createFacilityView(scene: THREE.Scene, onReady: () => void) {
  const kits = new Map<Site, Kit | 'loading' | 'failed'>(), compounds: Compound[] = [];
  const transform = new THREE.Object3D();
  let disposed = false, config: RunState['config'] | null = null, lastTick = -1, current: PlanetId | null = null;
  const ready = (planet: Site) => { const kit = kits.get(planet); return typeof kit === 'object' ? kit : null; };
  function prepare(planet: Site) {
    if (kits.has(planet)) return;
    kits.set(planet, 'loading');
    const nodes: Node[] = [`facility_${planet}`, `facility_${planet}_large`];
    loadTexturedNodes(assetOf(planet), nodes).then(found => {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      found.forEach(parts => parts.forEach(part => { geometries.add(part.geometry); materials.add(part.material); }));
      const release = () => {
        geometries.forEach(g => g.dispose());
        materials.forEach(m => { for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose(); m.dispose(); });
      };
      if (disposed || found.size !== nodes.length) {
        release();
        if (!disposed) { kits.set(planet, 'failed'); console.warn(`Facility compounds for ${planet} are incomplete; retaining the smaller battery emplacements.`); }
        return;
      }
      const batches = new Map<Node, THREE.InstancedMesh[]>();
      for (const [name, parts] of found) batches.set(name, parts.map(part => {
        part.material.envMapIntensity = .85;
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
  }
  return {
    /** The current planet's plants are ready (Luna has none). */
    get loaded() { return current === 'luna' || (current !== null && ready(current) !== null); },
    get count() { return compounds.length; },
    get largeCount() { return compounds.filter(c => c.node.endsWith('_large')).length; },
    contains(id: number) { return compounds.some(c => c.id === id); },
    get clearings() { return compounds.map(c => { const b = bounds(c.node); return { minX: c.x - b.halfX, maxX: c.x + b.halfX, minS: c.s + b.minS, maxS: c.s + b.maxS }; }); },
    /** Starts loading a planet's plants ahead of its first battery. */
    prepare(planet: PlanetId) { if (planet !== 'luna') prepare(planet); },
    /** `reserved`: district pads (docs/23 §4.8). A compound never covers one: the smaller plant, else the legacy emplacement. */
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
        if (site !== planet && !compounds.some(c => c.planet === site)) { kit.dispose(); kits.delete(site); return; }
        kit.batches.forEach(meshes => meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; }));
      });
    },
    dispose() { disposed = true; kits.forEach(kit => { if (typeof kit === 'object') kit.dispose(); }); kits.clear(); },
  };
}
