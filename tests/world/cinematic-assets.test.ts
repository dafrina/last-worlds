import { afterAll, describe, expect, it, vi } from 'vitest';
import { Box3, Mesh, Quaternion, Raycaster, Vector3, type Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BOSS_ASSETS } from '../../src/render/boss-assets';

const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
// These checks exercise geometry/rigs in Node. Actual PNG decoding and materials are
// exercised in Chromium by graphics.spec.ts, not by this tiny ImageBitmap substitute.
vi.stubGlobal('self', globalThis);
vi.stubGlobal('createImageBitmap', async () => ({ width:512, height:512, close() {} }));
afterAll(()=>vi.unstubAllGlobals());
async function asset(path: string) {
  const bytes = fs.readFileSync(`public/assets/${path}`);
  return (await new Promise<GLTF>((resolve,reject) => new GLTFLoader().parse(bytes.slice().buffer,'',resolve,reject))).scene;
}
function validate(model: Group, budget: number, textured=false) {
  let triangles=0;
  model.updateMatrixWorld(true);
  model.traverse(o => {
    expect(o.name).not.toMatch(/^(Cube|Camera|Light|MCP_Test)/);
    if (!(o instanceof Mesh)) return;
    const p=o.geometry.getAttribute('position');
    expect([...p.array].every(Number.isFinite),o.name).toBe(true);
    expect(o.geometry.getAttribute('normal')).toBeDefined();
    if (!textured) expect(o.geometry.getAttribute('color')).toBeDefined();
    else expect(o.geometry.getAttribute('uv')).toBeDefined();
    triangles+=(o.geometry.index?.count ?? p.count)/3;
  });
  expect(triangles).toBeGreaterThan(0); expect(triangles).toBeLessThanOrEqual(budget);
}

describe('Blender cinematic asset contracts',()=>{
  for (const spec of [
    { id:'veil', prefix:'veil', core:'veil_heart', y:2.2, z:-1.8, width:12.51,
      parts:['veil_bay_door_left','veil_bay_door_right','veil_flight_pod','veil_pod_left_wreck','veil_pod_right_wreck',...Array.from({length:4},(_,i)=>`veil_drop_pod_${i}`)],
      shutters:Array.from({length:4},(_,i)=>`veil_heart_shutter_${i}`) },
    { id:'bastion', prefix:'bastion', core:'bastion_core', y:1.45, z:-1.35, width:8.01,
      parts:['bastion_gun_left','bastion_gun_right','bastion_forward_cannon_left','bastion_forward_cannon_right','bastion_battery_left_wreck','bastion_battery_right_wreck'],
      shutters:['bastion_core_shutter_a','bastion_core_shutter_b'] },
    { id:'ark', prefix:'ark', core:'ark_bridge', y:1.6, z:-1.6, width:9.51,
      parts:['ark_turret_left','ark_turret_right','ark_bay_left_door','ark_bay_right_door','ark_radiator_left_wreck','ark_radiator_right_wreck'],
      shutters:['ark_bridge_shutter_a','ark_bridge_shutter_b'] },
  ] as const) it(`keeps approved ${spec.id} textured, reduced, articulated and its exposed core visible`,async()=>{
    const model=await asset(BOSS_ASSETS[spec.id]);validate(model,120000,true);
    expect(model.getObjectByName(`${spec.prefix}_approved_v4`)).toBeDefined();
    for(const name of [...spec.parts,...spec.shutters])expect(model.getObjectByName(name),name).toBeDefined();
    const hull=model.getObjectByName(`${spec.prefix}_hull`)!;
    expect(new Box3().setFromObject(hull).getSize(new Vector3()).x).toBeLessThanOrEqual(spec.width);
    hull.traverse(object=>{
      if(!(object instanceof Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        expect(material.map,'approved albedo retained').toBeTruthy();
        expect(material.normalMap,'approved surface normals retained').toBeTruthy();
        expect(material.roughnessMap,'approved roughness variation retained').toBeTruthy();
        expect(material.metalnessMap,'approved metallic variation retained').toBeTruthy();
      }
    });
    const eye=new Vector3(0,Math.sin(55*Math.PI/180),Math.cos(55*Math.PI/180));
    const flank = spec.id==='veil' ? {node:'pod',x:3.1,y:2.2,z:.4}
      : spec.id==='bastion' ? {node:'battery',x:2.2,y:1.45,z:0}
      : {node:'radiator',x:2.4,y:1.6,z:.5};
    for(const [side,sign] of [['left',-1],['right',1]] as const){
      const ray=new Raycaster(new Vector3(sign*flank.x,flank.y,flank.z).addScaledVector(eye,30),eye.clone().negate());
      const hits=ray.intersectObject(model.getObjectByName(`${spec.prefix}_${flank.node}_${side}`)!,true);
      expect(hits.length,`${side} target intersects its fixed aiming row`).toBeGreaterThan(0);
      const armor=ray.intersectObject(hull,true);
      expect(armor[0]?.distance ?? Infinity,`${side} target must be in front of static armor`).toBeGreaterThan(hits[0].distance-.01);
    }
    for(const [i,name] of spec.shutters.entries()){
      const node=model.getObjectByName(name)!;
      if(spec.id==='veil')node.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),105*Math.PI/180));
      else node.position.x+=(i===0?-1:1)*(spec.id==='bastion'?1.1:1);
    }
    model.updateMatrixWorld(true);
    const ray=new Raycaster(new Vector3(0,spec.y,spec.z).addScaledVector(eye,30),eye.clone().negate());
    const core=ray.intersectObject(model.getObjectByName(spec.core)!,true);
    expect(core.length,'combat row intersects the exposed source-fitted interior').toBeGreaterThan(0);
    const blockers=[hull,...spec.shutters.map(name=>model.getObjectByName(name)!)];
    const hits=ray.intersectObjects(blockers,true);
    expect(hits[0]?.distance ?? Infinity,`${spec.id} static armour/shutters must clear the core`).toBeGreaterThan(core[0].distance-.01);
  });
  it('keeps the Scrapper in its established visual footprint with two exhaust sockets',async()=>{
    const model=await asset('shared/hero-scrapper.glb'); validate(model,3000);
    const hull=model.getObjectByName('hero_scrapper'); expect(hull).toBeDefined();
    const size=new Box3().setFromObject(hull!).getSize(new Vector3());
    expect(size.x).toBeLessThanOrEqual(1.05); expect(size.z).toBeLessThanOrEqual(1.2);
    expect(model.getObjectByName('hero_scrapper_engine_0')).toBeDefined();
    expect(model.getObjectByName('hero_scrapper_engine_1')).toBeDefined();
  });
  it('preserves the VEIL combat sockets, hinges and wreck variants in the new carrier',async()=>{
    const model=await asset('nacre/the-veil.glb'); validate(model,55000);
    for(const [name,x,y,z] of [
      ['veil_pod_left',-3.1,2,.4],['veil_pod_right',3.1,2,.4],['veil_heart',0,2,-1.8],
      ['veil_bay_left',-1.7,1.8,2.6],['veil_bay_right',1.7,1.8,2.6],
    ] as const){
      const node=model.getObjectByName(name); expect(node,name).toBeDefined();
      const p=node!.getWorldPosition(new Vector3());
      expect(p.x).toBeCloseTo(x,4); expect(p.y).toBeCloseTo(y,4); expect(p.z).toBeCloseTo(z,4);
    }
    for(const name of ['veil_hull','veil_pod_left_wreck','veil_pod_right_wreck','veil_heart_wreck',...Array.from({length:4},(_,i)=>`veil_heart_shutter_${i}`)]) expect(model.getObjectByName(name),name).toBeDefined();
    const b=new Box3().setFromObject(model.getObjectByName('veil_hull')!);
    expect(Math.max(Math.abs(b.min.x),Math.abs(b.max.x))).toBeLessThan(12.8);
    expect(Math.max(Math.abs(b.min.z),Math.abs(b.max.z))).toBeLessThan(9.5);
    // Taller armour must not mask the fixed weak-point crowns from the game camera.
    const eye=new Vector3(0,Math.sin(55*Math.PI/180),Math.cos(55*Math.PI/180));
    for(const x of [-3.1,3.1]){
      const target=new Vector3(x,2.4,.4);
      const hits=new Raycaster(target.addScaledVector(eye,20),eye.clone().negate(),0,19.95).intersectObject(model.getObjectByName('veil_hull')!,true);
      expect(hits,`flank crown ${x} remains visible`).toHaveLength(0);
    }
  });
  for(const spec of [
    {path:'khepri/bastion-9.glb',prefix:'bastion',budget:25000,width:3.8,
      sockets:[['bastion_battery_left',-2.2,1.45,0],['bastion_battery_right',2.2,1.45,0],['bastion_core',0,1.45,-1.35],['bastion_gun_left',-2.2,1.55,.2],['bastion_core_shutter_a',-.62,1.72,-1.35]],
      parts:['bastion_battery_left_wreck','bastion_battery_right_wreck','bastion_core_shutter_b','bastion_tread_left','bastion_tread_right',...['left','right'].flatMap(s=>[`bastion_sprocket_${s}`,`bastion_idler_${s}`,...Array.from({length:6},(_,i)=>`bastion_roadwheel_${s}_${i}`)])]},
    {path:'vesper/helion-ark.glb',prefix:'ark',budget:25000,width:5.7,
      sockets:[['ark_radiator_left',-2.4,1.6,.5],['ark_radiator_right',2.4,1.6,.5],['ark_bridge',0,1.6,-1.6],['ark_bridge_shutter_a',-.47,1.712,-1.242],['ark_bay_left',-.75,1,2]],
      parts:['ark_radiator_left_wreck','ark_radiator_right_wreck','ark_bridge_shutter_b','ark_bay_left_door','ark_bay_right_door','ark_wake_anchor']},
    {path:'luna/warden.glb',prefix:'warden',budget:14000,width:3.5,
      sockets:[['warden_pod_left',-2.1,1.3,0],['warden_pod_right',2.1,1.3,0],['warden_core',0,1.3,-.9],['warden_core_hatch_0',-.33,1.3,-.9]],
      parts:['warden_pod_left_wreck','warden_pod_right_wreck','warden_core_wreck','warden_core_hatch_1','warden_beacon',...Array.from({length:4},(_,i)=>`warden_thruster_${i}`)]},
  ] as const) it(`preserves ${spec.prefix}'s rig, clear target crowns and bounded geometry`,async()=>{
    const model=await asset(spec.path);validate(model,spec.budget);
    for(const [name,x,y,z] of spec.sockets){
      const node=model.getObjectByName(name);expect(node,name).toBeDefined();
      const p=node!.getWorldPosition(new Vector3());
      expect(p.x).toBeCloseTo(x,4);expect(p.y).toBeCloseTo(y,4);expect(p.z).toBeCloseTo(z,4);
    }
    for(const name of spec.parts)expect(model.getObjectByName(name),name).toBeDefined();
    const hull=model.getObjectByName(`${spec.prefix}_hull`)!;
    const bounds=new Box3().setFromObject(model);
    expect(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))).toBeLessThan(spec.width);
    const eye=new Vector3(0,Math.sin(55*Math.PI/180),Math.cos(55*Math.PI/180));
    for(const [name,x,y,z] of spec.sockets.slice(0,3)){
      const target=new Vector3(x,y+.4,z);
      expect(new Raycaster(target.addScaledVector(eye,20),eye.clone().negate(),0,19.95).intersectObject(hull,true),`${name} visible above static armour`).toHaveLength(0);
    }
  });
  it('keeps each facility gun courtyard empty and each roof below its declared height',async()=>{
    const model=await asset('shared/facility-compounds.glb'); validate(model,46000);
    for(const planet of ['khepri','vesper','nacre']) for(const large of [false,true]){
      const node=model.getObjectByName(`facility_${planet}${large?'_large':''}`); expect(node).toBeDefined();
      const box=new Box3().setFromObject(node!);
      expect(box.max.y).toBeLessThanOrEqual(large?2.831:2.651);
      expect(box.max.x-box.min.x).toBeLessThan(large?8.8:6.7);
      expect(-box.max.z).toBeGreaterThan(large?-2.8:-1.8);
      expect(-box.min.z).toBeLessThan(large?6.1:4.6);
      if(large){
        const small=new Box3().setFromObject(model.getObjectByName(`facility_${planet}`)!);
        const ratio=(box.max.x-box.min.x)*(box.max.z-box.min.z)/((small.max.x-small.min.x)*(small.max.z-small.min.z));
        expect(ratio).toBeGreaterThan(1.8); expect(ratio).toBeLessThan(2.2);
      }
      node!.traverse(o=>{
        if(!(o instanceof Mesh))return;
        const p=o.geometry.getAttribute('position'),v=new Vector3();
        for(let i=0;i<p.count;i++){
          v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
          if(Math.abs(v.x)<.65 && Math.abs(v.z)<.7) expect(v.y).toBeLessThan(.25);
        }
      });
    }
  });
});
