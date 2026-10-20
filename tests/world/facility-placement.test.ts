import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { createFacilityView } from '../../src/render/facility-view';
import { createRun } from '../../src/sim/game';
import { VIEW } from '../../src/shared/contracts';

vi.mock('../../src/render/models',()=>({
  loadTexturedNodes: async (_url: string, names: string[]) => new Map(names.map(name=>[name,[{geometry:new BoxGeometry(),material:new MeshStandardMaterial()}]])),
}));
const seat = (groundX=0,base=.7) => ({kind:'turret',groundX,groundS:10,base,afloat:false});
async function view() {
  const scene=new Scene(), facility=createFacilityView(scene,()=>{});
  // Each planet's plants load on arrival; have them ready before the first battery.
  for(const planet of ['khepri','vesper','nacre'] as const) facility.prepare(planet);
  await new Promise(resolve=>setTimeout(resolve,0));
  return {scene,facility,close(){facility.dispose();}};
}
describe('facility placement and target visibility',()=>{
  it('preserves full model height while keeping roofs below flight and the gun in the open court',async()=>{
    const v=await view(), state=createRun({mode:'endless',seed:8831});
    try {
      v.facility.update(state,'nacre',new Map([[1,seat()]]));
      expect(v.facility.largeCount).toBe(1);
      const mesh=v.scene.children.find(o=>o.name==='facility_nacre_large') as InstancedMesh;
      const m=new Matrix4();mesh.getMatrixAt(0,m);
      expect(new Vector3().setFromMatrixScale(m).toArray()).toEqual([1,1,1]);
      const base=new Vector3().setFromMatrixPosition(m).y;
      expect(base+2.831).toBeLessThanOrEqual(VIEW.flightHeight-.449);
      expect(.7-base).toBeLessThan(.35);
      const c=v.facility.clearings[0];expect(c.maxX-c.minX).toBeGreaterThan(9);
      expect(state.enemies).toHaveLength(0); // Scenery never manufactures a combat target.
    } finally {v.close();}
  });
  it('keeps compounds off district pads: the smaller plant where it still fits, else none (the legacy emplacement)',async()=>{
    const state=createRun({mode:'endless',seed:8831});
    for(const [reserved,count,large] of [
      [[{minX:-2,maxX:2,minS:8,maxS:12}],0,0],
      // Only the large plant (half width 4.6) would reach this pad; the small one (3.6) stands beside it.
      [[{minX:3.8,maxX:6,minS:9,maxS:12}],1,0],
      [[],1,1],
    ] as const){
      const v=await view();try{
        v.facility.update(state,'khepri',new Map([[1,seat()]]),reserved);
        expect(v.facility.count).toBe(count);expect(v.facility.largeCount).toBe(large);
        // The battery itself never moves: compounds are scenery around it.
        if(count) expect(v.facility.clearings[0].minX).toBeLessThan(0);
      }finally{v.close();}
    }
  });
  it('seats plants once their planet has loaded and releases a planet left behind',async()=>{
    const scene=new Scene(), facility=createFacilityView(scene,()=>{}), state=createRun({mode:'endless',seed:8831});
    const khepri=()=>scene.children.filter(o=>o.name.startsWith('facility_khepri')).length;
    try {
      facility.update(state,'khepri',new Map([[1,seat()]]));
      // Still loading: the battery keeps its smaller emplacement.
      expect(facility.loaded).toBe(false); expect(facility.count).toBe(0); expect(facility.contains(1)).toBe(false);
      await new Promise(resolve=>setTimeout(resolve,0));
      facility.update(state,'khepri',new Map([[1,seat()]]));
      expect(facility.loaded).toBe(true); expect(facility.count).toBe(1); expect(khepri()).toBeGreaterThan(0);
      facility.update(state,'vesper',new Map());
      expect(khepri()).toBeGreaterThan(0); // its plant is still on screen
      state.distance+=100;
      facility.update(state,'vesper',new Map());
      expect(facility.count).toBe(0); expect(khepri()).toBe(0);
    } finally {facility.dispose();}
  });
  it('uses the smaller plant near world edges and leaves high or crowded ground to existing emplacements',async()=>{
    const state=createRun({mode:'endless',seed:8831});
    for(const [batteries,expectedCount,expectedLarge] of [
      [new Map([[1,seat(11)]]),1,0],
      [new Map([[1,seat(0,1.8)]]),0,0],
      [new Map([[1,seat()],[2,seat(1)]]),0,0],
    ] as const){
      const v=await view();try{
        v.facility.update(state,'khepri',batteries);
        expect(v.facility.count).toBe(expectedCount);expect(v.facility.largeCount).toBe(expectedLarge);
      }finally{v.close();}
    }
  });
});
