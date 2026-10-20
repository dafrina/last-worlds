import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, Vector3 } from 'three';
import { createFacilityView, facilityOptions } from '../../src/render/facility-view';
import { composeFacility, plantBase, wantsPlant } from '../../src/render/facility-layouts';
import { MODULES_BY_NODE } from '../../src/render/facility-kit';
import { loadTexturedNodes } from '../../src/render/models';
import { createRun } from '../../src/sim/game';
import { VIEW } from '../../src/shared/contracts';

vi.mock('../../src/render/models',()=>({
  loadTexturedNodes: vi.fn(async (_url: string, names: string[]) => new Map(names.map(name=>[name,[{geometry:new BoxGeometry(),material:new MeshStandardMaterial()}]]))),
}));
const seat = (groundX=0,base=.7) => ({kind:'turret',groundX,groundS:10,base,afloat:false});
async function view() {
  const scene=new Scene(), facility=createFacilityView(scene,()=>{},2);
  // Each planet's plants load on arrival; have them ready before the first battery.
  for(const planet of ['khepri','vesper','nacre'] as const) facility.prepare(planet);
  await new Promise(resolve=>setTimeout(resolve,0));
  return {scene,facility,close(){facility.dispose();}};
}
describe('v2 facility placement and target visibility',()=>{
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
    const scene=new Scene(), facility=createFacilityView(scene,()=>{},2), state=createRun({mode:'endless',seed:8831});
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

// v3 (docs/25): plants composed per battery from per-world module kits.
const settle = () => new Promise(resolve=>setTimeout(resolve,0));
async function modular(planets: ('khepri'|'vesper'|'nacre'|'luna')[] = ['khepri','vesper','nacre','luna']) {
  const scene=new Scene(), facility=createFacilityView(scene,()=>{},3);
  for(const planet of planets) facility.prepare(planet);
  await settle();
  return {scene,facility,close(){facility.dispose();}};
}
const drawn = (scene: Scene, world: string) => scene.children.filter((o): o is InstancedMesh=>o instanceof InstancedMesh && o.name.startsWith(`fk_${world}_`) && o.visible);
describe('v3 modular facility view',()=>{
  afterEach(()=>{ facilityOptions.standIns=true; vi.restoreAllMocks(); });
  it('draws each composed module once, turned by its yaw, buildings sunk by the tallest module and ground pieces on the seat',async()=>{
    const v=await modular(), state=createRun({mode:'endless',seed:8831});
    try {
      v.facility.update(state,'nacre',new Map([[1,seat(0,.7)]]));
      const plant=composeFacility('nacre',1,state.config.seed,{x:0,s:10,base:.7},{batteries:[],reserved:[],plants:[]})!;
      expect(v.facility.count).toBe(1); expect(v.facility.stats.arrangements).toEqual([plant.arrangement]);
      expect(plant.base).toBe(plantBase(.7,plant.top)); expect(plant.ground).toBe(.7);
      expect(plant.modules.some(m=>m.node==='fk_nacre_apron')).toBe(true);
      expect(plant.base+plant.top).toBeLessThanOrEqual(VIEW.flightHeight-.45+1e-9); expect(.7-plant.base).toBeLessThanOrEqual(.35+1e-9);
      const meshes=drawn(v.scene,'nacre'), m=new Matrix4(), p=new Vector3(), q=new Quaternion(), scale=new Vector3();
      expect(meshes.reduce((n,mesh)=>n+mesh.count,0)).toBe(plant.modules.length);
      for(const module of plant.modules){
        const mesh=meshes.find(mesh=>mesh.name===module.node)!; let found=false;
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,m); m.decompose(p,q,scale);
          const y=MODULES_BY_NODE.get(module.node)!.flat?plant.ground:plant.base;
          if(p.distanceTo(new Vector3(module.x,y,-(10+module.s)))<1e-6 && q.angleTo(new Quaternion().setFromEuler(new Euler(0,module.yaw,0)))<1e-6) found=true;
        }
        expect(found,`${module.slot} ${module.node}`).toBe(true);
      }
      // One clearing per plant: the union of its modules and the gun's court.
      expect(v.facility.clearings).toEqual([plant.bounds]);
      expect(state.enemies).toHaveLength(0); // Scenery never manufactures a combat target.
      // Composed once: a battery appearing later never rearranges a standing plant.
      v.facility.update(state,'nacre',new Map([[1,seat(0,.7)],[2,seat(9,.2)]]));
      expect(v.facility.clearings[0]).toEqual(plant.bounds);
    } finally {v.close();}
  });
  it('lays each apron tile on the terrain it covers and leaves out tiles on ground too rough for it',async()=>{
    const state=createRun({mode:'endless',seed:8831}), v=await modular(['khepri']);
    try {
      // A ramp rising behind the gun (gentle) and a cliff far to its left (rough).
      const ground=(x: number,s: number)=>(x < -2.2 ? 3 : 0) + Math.max(0,s-10)*.1 + .4;
      v.facility.update(state,'khepri',new Map([[1,seat(0,.4)]]),[],ground);
      const plant=composeFacility('khepri',1,state.config.seed,{x:0,s:10,base:.4})!;
      const tiles=plant.modules.filter(m=>m.node==='fk_khepri_apron');
      const mesh=drawn(v.scene,'khepri').find(m=>m.name==='fk_khepri_apron')!, m=new Matrix4(), p=new Vector3();
      const heights=Array.from({length:mesh.count},(_,i)=>{mesh.getMatrixAt(i,m);return p.setFromMatrixPosition(m).clone();});
      let rough=0;
      for(const tile of tiles){
        const at=heights.find(h=>Math.abs(h.x-tile.x)<1e-6 && Math.abs(-h.z-(10+tile.s))<1e-6);
        const samples=[[0,0],[-.9,-.9],[.9,-.9],[-.9,.9],[.9,.9]].map(([dx,ds])=>ground(tile.x+dx,10+tile.s+ds));
        const hi=Math.max(...samples), lo=Math.min(...samples);
        if(tile.x===0 && tile.s===0) expect(at?.y).toBeCloseTo(.4); // the gun's own tile keeps the gun's ground
        else if(hi-lo>.6) { rough++; expect(at,`${tile.x},${tile.s}`).toBeUndefined(); }
        else expect(at?.y,`${tile.x},${tile.s}`).toBeCloseTo(hi-.02); // just above the highest ground under it
      }
      expect(rough).toBe(tiles.some(tile=>tile.x===-2)?tiles.filter(tile=>tile.x===-2).length:0);
      expect(heights.length).toBeGreaterThan(0); expect(heights.length).toBeLessThanOrEqual(tiles.length);
    } finally {v.close();}
  });
  it('keeps plants off district pads and leaves high ground or a covered gun to the legacy emplacement',async()=>{
    const state=createRun({mode:'endless',seed:8831});
    for(const [batteries,reserved,count] of [
      [new Map([[1,seat()]]),[{minX:-1,maxX:1,minS:9,maxS:11}],0],
      [new Map([[1,seat(0,3.2)]]),[],0],
      [new Map([[1,seat()]]),[{minX:3,maxX:8,minS:6,maxS:16}],1],
    ] as const){
      const v=await modular();try{
        v.facility.update(state,'khepri',batteries,reserved);
        expect(v.facility.count).toBe(count); expect(v.facility.contains(1)).toBe(count===1);
        for(const c of v.facility.clearings) for(const pad of reserved) expect(c.maxX<=pad.minX||c.minX>=pad.maxX||c.maxS<=pad.minS||c.minS>=pad.maxS).toBe(true);
      }finally{v.close();}
    }
  });
  it('plants Luna sparsely (v2 had none there)',async()=>{
    const state=createRun({mode:'endless',seed:8831}), seed=state.config.seed;
    const bare=Array.from({length:50},(_,i)=>i+1).find(id=>!wantsPlant('luna',id,seed))!, planted=Array.from({length:50},(_,i)=>i+1).find(id=>wantsPlant('luna',id,seed))!;
    const v=await modular(['luna']);try{
      v.facility.update(state,'luna',new Map([[bare,seat(-8)],[planted,seat(8)]]));
      expect(v.facility.contains(planted)).toBe(true); expect(v.facility.contains(bare)).toBe(false);
      expect(v.facility.count).toBe(1); expect(v.facility.loaded).toBe(true);
      expect(drawn(v.scene,'luna').reduce((n,mesh)=>n+mesh.count,0)).toBeLessThanOrEqual(4);
    }finally{v.close();}
  });
  it('holds legacy pieces back while a kit loads, then seats plants, and releases a world left behind',async()=>{
    const scene=new Scene(), facility=createFacilityView(scene,()=>{},3), state=createRun({mode:'endless',seed:8831});
    try {
      facility.update(state,'khepri',new Map([[1,seat()]]));
      // Loading: no plant yet, but the battery waits for it instead of taking a legacy emplacement.
      expect(facility.loaded).toBe(false); expect(facility.count).toBe(0); expect(facility.contains(1)).toBe(true);
      await settle();
      facility.update(state,'khepri',new Map([[1,seat()]]));
      expect(facility.loaded).toBe(true); expect(facility.count).toBe(1); expect(drawn(scene,'khepri').length).toBeGreaterThan(0);
      expect(facility.stats.kits).toEqual({khepri:'glb'});
      facility.update(state,'vesper',new Map());
      expect(drawn(scene,'khepri').length).toBeGreaterThan(0); // its plant is still on screen
      state.distance+=100;
      facility.update(state,'vesper',new Map());
      expect(facility.count).toBe(0); expect(scene.children.some(o=>o.name.startsWith('fk_khepri_'))).toBe(false);
    } finally {facility.dispose();}
  });
  it('keeps the legacy emplacement when a kit fails in production, and draws registry stand-ins in development',async()=>{
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    const state=createRun({mode:'endless',seed:8831});
    for(const standIns of [false,true]){
      facilityOptions.standIns=standIns;
      vi.mocked(loadTexturedNodes).mockRejectedValueOnce(new Error('404'));
      const scene=new Scene(), facility=createFacilityView(scene,()=>{},3);
      try {
        facility.update(state,'vesper',new Map([[1,seat()]]));
        await settle();
        facility.update(state,'vesper',new Map([[1,seat()]]));
        expect(facility.contains(1)).toBe(standIns); expect(facility.count).toBe(standIns?1:0);
        expect(facility.stats.kits).toEqual({vesper:standIns?'stand-in':'failed'});
        expect(drawn(scene,'vesper').length>0).toBe(standIns);
      } finally {facility.dispose();}
    }
  });
});
