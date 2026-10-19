import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState } from '../shared/contracts';
import { loadCraftNodes } from './models';

const NODES = ['facility_khepri', 'facility_vesper', 'facility_nacre', 'facility_khepri_large', 'facility_vesper_large', 'facility_nacre_large'] as const;
type Node = typeof NODES[number];
interface Seat { kind: string; groundX: number; groundS: number; base: number; afloat: boolean }
interface Compound { id: number; x: number; s: number; y: number; node: Node }
const CAPACITY = 12;
// Authored bounds plus a small scatter margin. Large has 1.9× the floor area and additional plant rooms.
const SIZE = {
  small: {halfX: 3.6, minS: -1.8, maxS: 4.6, height: 2.651},
  large: {halfX: 4.6, minS: -2.8, maxS: 6.1, height: 2.831},
};
const bounds = (node: Node) => SIZE[node.endsWith('_large') ? 'large' : 'small'];

/** Blender-authored plants embrace existing ground batteries. Pure scenery: the open courtyard never moves a target. */
export function createFacilityView(scene: THREE.Scene, material: THREE.Material, onReady: () => void) {
  const batches = new Map<Node, THREE.InstancedMesh>(), compounds: Compound[] = [];
  const transform = new THREE.Object3D();
  let disposed = false, failed = false, config: RunState['config'] | null = null, lastTick = -1;
  loadCraftNodes(`${import.meta.env.BASE_URL}assets/shared/facility-compounds.glb`, NODES).then(nodes => {
    if (disposed) { nodes.forEach(n => n.geometry.dispose()); return; }
    for (const [name, model] of nodes) {
      const mesh = new THREE.InstancedMesh(model.geometry, material, CAPACITY);
      mesh.name = name; mesh.count = 0; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < CAPACITY; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      scene.add(mesh); batches.set(name, mesh);
    }
    onReady();
  }).catch(error => { failed = true; compounds.length = 0; console.warn('Facility compounds unavailable; retaining the smaller battery emplacements.', error); });
  return {
    get loaded() { return batches.size === NODES.length; },
    get count() { return compounds.length; },
    get largeCount() { return compounds.filter(c => c.node.endsWith('_large')).length; },
    contains(id: number) { return !failed && compounds.some(c => c.id === id); },
    get clearings() { return batches.size === NODES.length ? compounds.map(c => { const b = bounds(c.node); return { minX: c.x - b.halfX, maxX: c.x + b.halfX, minS: c.s + b.minS, maxS: c.s + b.maxS }; }) : []; },
    update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>) {
      if (config !== state.config || state.tick < lastTick) { compounds.length = 0; config = state.config; }
      lastTick = state.tick;
      for (let i = compounds.length - 1; i >= 0; i--) if (compounds[i].s - state.distance < VIEW.minS - 10) compounds.splice(i, 1);
      if (!failed && planet !== 'luna') for (const [id, seat] of batteries) {
        if (seat.kind === 'fuel' || compounds.some(c => c.id === id) || compounds.length >= CAPACITY) continue;
        if (seat.afloat && planet !== 'nacre') continue;
        // Stable cosmetic choice, independent of combat's RNG. Try the smaller plant when a large one cannot fit.
        const wantsLarge = ((Math.imul(id, 0x45d9f3b) ^ state.config.seed) >>> 0) % 3 === 0;
        for (const large of wantsLarge ? [true, false] : [false]) {
          const b = SIZE[large ? 'large' : 'small'];
          if (Math.abs(seat.groundX) + b.halfX > VIEW.worldWidth / 2) continue;
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
          compounds.push({id, x: seat.groundX, s: seat.groundS, y, node: `facility_${planet}${large ? '_large' : ''}`});
          break;
        }
      }
      batches.forEach(mesh => { mesh.count = 0; });
      for (const c of compounds) {
        const mesh = batches.get(c.node), s = c.s - state.distance;
        if (!mesh || Math.abs(c.x - state.cameraX) > VIEW.width / 2 + bounds(c.node).halfX || s > VIEW.maxS + 9 || s < VIEW.minS - 8) continue;
        transform.position.set(c.x, c.y, -s); transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1, 1); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      batches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
    },
    dispose() { disposed = true; batches.forEach(mesh => { scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }); batches.clear(); },
  };
}
