import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { createFacilityView } from '../../src/render/facility-view';
import { createRun } from '../../src/sim/game';
import { VIEW } from '../../src/shared/contracts';

vi.mock('../../src/render/models',()=>({
  loadCraftNodes: async (_url: string, names: string[]) => new Map(names.map(name=>[name,{geometry:new BoxGeometry()}])),
}));
const seat = (groundX=0,base=.7) => ({kind:'turret',groundX,groundS:10,base,afloat:false});
async function view() {
  const scene=new Scene(), material=new MeshStandardMaterial(), facility=createFacilityView(scene,material,()=>{});
  await Promise.resolve();
  return {scene,facility,close(){facility.dispose();material.dispose();}};
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
