import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Vector3, type Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
async function asset(path: string) {
  const bytes = fs.readFileSync(`public/assets/${path}`);
  return (await new Promise<GLTF>((resolve,reject) => new GLTFLoader().parse(bytes.slice().buffer,'',resolve,reject))).scene;
}
function validate(model: Group, budget: number) {
  let triangles=0;
  model.updateMatrixWorld(true);
  model.traverse(o => {
    expect(o.name).not.toMatch(/^(Cube|Camera|Light|MCP_Test)/);
    if (!(o instanceof Mesh)) return;
    const p=o.geometry.getAttribute('position');
    expect([...p.array].every(Number.isFinite),o.name).toBe(true);
    expect(o.geometry.getAttribute('normal')).toBeDefined();
    expect(o.geometry.getAttribute('color')).toBeDefined();
    triangles+=(o.geometry.index?.count ?? p.count)/3;
  });
  expect(triangles).toBeGreaterThan(0); expect(triangles).toBeLessThanOrEqual(budget);
}

describe('Blender cinematic asset contracts',()=>{
  it('keeps the Scrapper in its established visual footprint with two exhaust sockets',async()=>{
    const model=await asset('shared/hero-scrapper.glb'); validate(model,3000);
    const hull=model.getObjectByName('hero_scrapper'); expect(hull).toBeDefined();
    const size=new Box3().setFromObject(hull!).getSize(new Vector3());
    expect(size.x).toBeLessThanOrEqual(1.05); expect(size.z).toBeLessThanOrEqual(1.2);
    expect(model.getObjectByName('hero_scrapper_engine_0')).toBeDefined();
    expect(model.getObjectByName('hero_scrapper_engine_1')).toBeDefined();
  });
  it('preserves the VEIL combat sockets, hinges and wreck variants in the new carrier',async()=>{
    const model=await asset('nacre/the-veil.glb'); validate(model,26000);
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
