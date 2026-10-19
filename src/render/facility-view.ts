import * as THREE from 'three';
import { VIEW, type PlanetId, type RunState } from '../shared/contracts';
import { loadCraftNodes } from './models';

const NODES = ['facility_khepri', 'facility_vesper', 'facility_nacre'] as const;
type Node = typeof NODES[number];
interface Seat { kind: string; groundX: number; groundS: number; base: number; afloat: boolean }
interface Compound { id: number; x: number; s: number; y: number; node: Node }
const CAPACITY = 12;

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
    contains(id: number) { return !failed && compounds.some(c => c.id === id); },
    get clearings() { return batches.size === NODES.length ? compounds.map(c => ({ minX: c.x - 3.6, maxX: c.x + 3.6, minS: c.s - 1.8, maxS: c.s + 4.6 })) : []; },
    update(state: RunState, planet: PlanetId, batteries: ReadonlyMap<number, Seat>) {
      if (config !== state.config || state.tick < lastTick) { compounds.length = 0; config = state.config; }
      lastTick = state.tick;
      for (let i = compounds.length - 1; i >= 0; i--) if (compounds[i].s - state.distance < VIEW.minS - 10) compounds.splice(i, 1);
      if (!failed && planet !== 'luna') for (const [id, seat] of batteries) {
        if (seat.kind === 'fuel' || compounds.some(c => c.id === id) || compounds.length >= CAPACITY) continue;
        // One large landmark per cluster, at least ten world units apart; don't fill every gun's surroundings.
        if (compounds.some(c => Math.abs(c.s - seat.groundS) < 10 && Math.abs(c.x - seat.groundX) < 7)) continue;
        if (Math.abs(seat.groundX) > VIEW.worldWidth / 2 - 3.5) continue;
        if (seat.afloat && planet !== 'nacre') continue;
        // Another gun must not end up inside a side wing or behind the rear plant.
        if ([...batteries].some(([other, b]) => other !== id && Math.abs(b.groundX - seat.groundX) < 4 && b.groundS > seat.groundS - 2 && b.groundS < seat.groundS + 5)) continue;
        if (seat.base > VIEW.flightHeight - 1.25) continue;
        compounds.push({id, x: seat.groundX, s: seat.groundS, y: seat.base, node: `facility_${planet}`});
      }
      batches.forEach(mesh => { mesh.count = 0; });
      for (const c of compounds) {
        const mesh = batches.get(c.node), s = c.s - state.distance;
        if (!mesh || Math.abs(c.x - state.cameraX) > VIEW.width / 2 + 4 || s > VIEW.maxS + 9 || s < VIEW.minS - 8) continue;
        transform.position.set(c.x, c.y, -s); transform.rotation.set(0, 0, 0);
        transform.scale.set(1, Math.min(1, Math.max(.3, (VIEW.flightHeight - .45 - c.y) / 2.65)), 1); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      batches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
    },
    dispose() { disposed = true; batches.forEach(mesh => { scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }); batches.clear(); },
  };
}
