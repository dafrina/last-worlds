import { afterAll, describe, expect, it, vi } from 'vitest';
import { Box3, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Raycaster, Vector3 } from 'three';
import { createBastionTracks } from '../../src/render/bastion-tracks';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BOSS_ASSETS } from '../../src/render/boss-assets';
import { BASTION } from '../../src/content/bastion';
import { HELION_ARK } from '../../src/content/ark';
import { VEIL } from '../../src/content/veil';
import { ECLIPSE } from '../../src/content/eclipse';
import { WARDEN } from '../../src/content/warden';
import { FACILITY_KIT_ASSETS, FACILITY_MODULES, modulesOf } from '../../src/render/facility-kit';

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
  it('circulates textured Bastion links in four draws; stopped time/ground motion leaves them still', async () => {
    const model = await asset(BOSS_ASSETS.bastion), chassis = new Group();
    const tracks = createBastionTracks(model, chassis);
    try {
      const meshes = chassis.children as InstancedMesh[];
      expect(meshes).toHaveLength(4);
      expect(tracks.count).toBeGreaterThan(190); expect(tracks.count).toBeLessThan(210);
      const geometry = meshes[0].geometry;
      expect(geometry.getAttribute('uv')).toBeDefined();
      const initial = meshes.map(mesh => [...mesh.instanceMatrix.array]);
      tracks.advance(2, 0); tracks.advance(0, 1);
      expect(meshes.map(mesh => [...mesh.instanceMatrix.array])).toEqual(initial);
      tracks.advance(2, .1);
      expect(tracks.travel).toBeCloseTo(.2);
      expect(meshes.map(mesh => [...mesh.instanceMatrix.array])).not.toEqual(initial);
      // Every link stays on its own belt, with unit scale (no stretching at wraparound).
      const matrix = new Matrix4(), p = new Vector3(), q = new Quaternion(), scale = new Vector3();
      for (const mesh of meshes) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); matrix.decompose(p,q,scale);
        expect(Math.abs(p.x)).toBeCloseTo(mesh.name.endsWith('0_moving') ? 2.19 : 3.29);
        expect(p.y).toBeGreaterThan(-.1); expect(p.y).toBeLessThan(2.5);
        expect(scale.distanceTo(new Vector3(1,1,1))).toBeLessThan(1e-5);
      }
      tracks.advance(-2, .1);
      expect(tracks.travel).toBeCloseTo(0);
      expect(meshes.map(mesh => [...mesh.instanceMatrix.array])).toEqual(initial);
    } finally { tracks.dispose(); }
  });
  // The selected boss assets (src/render/boss-assets.ts): v4 approved imports or v5 clean remodels
  // (tools/blender/boss_remodel.py). Weak-point rays come from the combat constants, so a rescaled
  // fortress is checked at its own targets.
  const flankOf = {
    veil: { node:'pod', x:VEIL.podOffset, y:VEIL.targetHeight, z:-VEIL.podS },
    bastion: { node:'battery', x:BASTION.batteryOffset, y:BASTION.targetHeight, z:0 },
    ark: { node:'radiator', x:HELION_ARK.radiatorOffset, y:HELION_ARK.targetHeight, z:-HELION_ARK.radiatorS },
    warden: { node:'pod', x:WARDEN.podOffset, y:WARDEN.targetHeight, z:0 },
    eclipse: { node:'pod', x:ECLIPSE.ventOffset, y:ECLIPSE.targetHeight, z:-ECLIPSE.ventS },
  } as const;
  const coreOf = {
    veil: { y:VEIL.targetHeight, z:-VEIL.heartS }, bastion: { y:BASTION.targetHeight, z:-BASTION.coreRowOffset },
    ark: { y:HELION_ARK.targetHeight, z:-HELION_ARK.bridgeS }, warden: { y:WARDEN.targetHeight, z:-WARDEN.commandS },
    // THE ECLIPSE's near spike hides the reactor's very centre from the camera; its ring and lens either side show (x 0.6).
    eclipse: { y:ECLIPSE.targetHeight, z:-ECLIPSE.reactorS, x:0.6 },
  } as const;
  // How far each sliding pair of core shutters opens in its view (the Veil's petals rotate instead).
  const slideOf = { veil:0, bastion:1.1, ark:1, warden:.8, eclipse:0 } as const;
  // Carriers' shutters swing open about their local x instead (THE VEIL's petals 105°, THE ECLIPSE's armour 50°).
  const swingOf: Partial<Record<keyof typeof slideOf, number>> = { veil:105, eclipse:50 };
  for (const spec of [
    // v6 remodel (24 October): no docked pods, hoods or arms under the bow (they were the source's pod sketches).
    { id:'veil', prefix:'veil', core:'veil_heart', width:{ v4:12.51, v5:12.51, r6:12.51 },
      parts:['veil_flight_pod','veil_pod_left_wreck','veil_pod_right_wreck'],
      shutters:Array.from({length:4},(_,i)=>`veil_heart_shutter_${i}`) },
    { id:'bastion', prefix:'bastion', core:'bastion_core', width:{ v4:8.01, v5:9.9 },
      parts:['bastion_gun_left','bastion_gun_right','bastion_forward_cannon_left','bastion_forward_cannon_right','bastion_battery_left_wreck','bastion_battery_right_wreck'],
      shutters:['bastion_core_shutter_a','bastion_core_shutter_b'] },
    // v6 (24 October) adapts the user's new Ark GLB: no bay doors (the Needles launch from the open prow).
    { id:'ark', prefix:'ark', core:'ark_bridge', width:{ v4:9.51, v5:9.6, v6:9.6 },
      parts:['ark_turret_left','ark_turret_right','ark_radiator_left_wreck','ark_radiator_right_wreck'],
      shutters:['ark_bridge_shutter_a','ark_bridge_shutter_b'] },
    // THE ECLIPSE (24 October): the user's crescent GLB lying flat, 20 units from horn to horn (docs/28).
    { id:'eclipse', prefix:'eclipse', core:'eclipse_heart', width:{ e1:20 },
      parts:['eclipse_pod_left_wreck','eclipse_pod_right_wreck','eclipse_heart_wreck'],
      shutters:Array.from({length:6},(_,i)=>`eclipse_heart_shutter_${i}`) },
    { id:'warden', prefix:'warden', core:'warden_core', width:{ v4:3.5, v5:7.8 },
      parts:['warden_pod_left_wreck','warden_pod_right_wreck','warden_core_wreck','warden_beacon',...Array.from({length:4},(_,i)=>`warden_thruster_${i}`)],
      shutters:['warden_core_hatch_0','warden_core_hatch_1'] },
  ] as const) it(`keeps the selected ${spec.id} model textured, bounded, articulated and its exposed core visible`,async()=>{
    const model=await asset(BOSS_ASSETS[spec.id]);
    const version = model.getObjectByName(`${spec.prefix}_remodel_v6`) ? 'r6' : model.getObjectByName(`${spec.prefix}_remodel_v5`) ? 'v5'
      : model.getObjectByName(`${spec.prefix}_approved_v6`) ? 'v6' : model.getObjectByName(`${spec.prefix}_approved_v1`) ? 'e1' : 'v4';
    const remodel = version === 'v5' || version === 'r6';
    if (version==='v4') expect(model.getObjectByName(`${spec.prefix}_approved_v4`)).toBeDefined();
    // v4 keeps the decimated source atlases; v5 is ~20k clean triangles with one baked surface atlas; v6 adapts the user's
    // new GLB within THE VEIL's 80k (user, 24 October: "lets raise the max to the veils 80k").
    validate(model,remodel?30000:version==='v6'||version==='e1'?80000:120000,true);
    for(const name of [...spec.parts,...spec.shutters])expect(model.getObjectByName(name),name).toBeDefined();
    const hull=model.getObjectByName(`${spec.prefix}_hull`)!;
    expect(new Box3().setFromObject(hull).getSize(new Vector3()).x).toBeLessThanOrEqual((spec.width as unknown as Record<string, number>)[version]);
    hull.traverse(object=>{
      if(!(object instanceof Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if (remodel && /glow|jet/i.test(material.name)) continue; // emissive heat, lamps and thruster jets stay untextured
        expect(material.map,'albedo texture').toBeTruthy();
        expect(material.normalMap,'surface normals').toBeTruthy();
        expect(material.roughnessMap,'roughness variation').toBeTruthy();
        expect(material.metalnessMap,'metallic variation').toBeTruthy();
      }
    });
    const eye=new Vector3(0,Math.sin(55*Math.PI/180),Math.cos(55*Math.PI/180));
    const flank = flankOf[spec.id];
    for(const [side,sign] of [['left',-1],['right',1]] as const){
      const ray=new Raycaster(new Vector3(sign*flank.x,flank.y,flank.z).addScaledVector(eye,30),eye.clone().negate());
      const hits=ray.intersectObject(model.getObjectByName(`${spec.prefix}_${flank.node}_${side}`)!,true);
      expect(hits.length,`${side} target intersects its fixed aiming row`).toBeGreaterThan(0);
      const armor=ray.intersectObject(hull,true);
      expect(armor[0]?.distance ?? Infinity,`${side} target must be in front of static armor`).toBeGreaterThan(hits[0].distance-.01);
    }
    for(const [i,name] of spec.shutters.entries()){
      const node=model.getObjectByName(name)!;
      const swing = swingOf[spec.id];
      if(swing)node.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),swing*Math.PI/180));
      else node.position.x+=(i===0?-1:1)*slideOf[spec.id];
    }
    model.updateMatrixWorld(true);
    const core=coreOf[spec.id];
    const ray=new Raycaster(new Vector3('x' in core ? core.x : 0,core.y,core.z).addScaledVector(eye,30),eye.clone().negate());
    const coreHits=ray.intersectObject(model.getObjectByName(spec.core)!,true);
    expect(coreHits.length,'combat row intersects the exposed interior').toBeGreaterThan(0);
    const blockers=[hull,...spec.shutters.map(name=>model.getObjectByName(name)!)];
    const hits=ray.intersectObjects(blockers,true);
    expect(hits[0]?.distance ?? Infinity,`${spec.id} static armour/shutters must clear the core`).toBeGreaterThan(coreHits[0].distance-.01);
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
  // The plant around a ground battery: inside its seat (src/render/facility-view.ts SIZE), roof below the declared
  // height, 1.8-2.2x the plan for the large one, and nothing above 0.25 over the gun's court.
  function checkCompound(model: Group, planet: string, large: boolean) {
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
  it('keeps each facility gun courtyard empty and each roof below its declared height',async()=>{
    const model=await asset('shared/facility-compounds.glb'); validate(model,46000);
    for(const planet of ['khepri','vesper','nacre']) for(const large of [false,true]) checkCompound(model,planet,large);
  });
  it('keeps the same seat contract in the textured v2 compounds after the facility sheets',async()=>{
    for(const planet of ['khepri','vesper','nacre']){
      const model=await asset(`${planet}/facility-compounds-v2-remodel.glb`); validate(model,46000,true);
      expect(model.getObjectByName('facility_remodel_v2')).toBeDefined();
      for(const large of [false,true]) checkCompound(model,planet,large);
    }
  });
  // v3 modular kits (docs/25, src/render/facility-kit.ts): every registry module is a node in its world's kit, inside its
  // declared footprint, foundation and top (reaching close to that top, so the height rule is not slack), textured with
  // UVs. A world whose kit has not shipped yet is skipped.
  it('keeps every v3 facility kit module inside its registry footprint, foundation and top',async()=>{
    let checked=0;
    for(const world of new Set(FACILITY_MODULES.map(module=>module.world))){
      let model: Group;
      try { model=await asset(`${world}/${FACILITY_KIT_ASSETS[world]}`); } catch(error) { if((error as {code?:string}).code==='ENOENT') continue; throw error; }
      checked++; validate(model,30000,true);
      expect(model.getObjectByName('facility_kit_v3'),world).toBeDefined();
      model.updateMatrixWorld(true);
      for(const module of modulesOf(world)){
        const node=model.getObjectByName(module.node); expect(node,module.node).toBeDefined();
        const local=node!.matrixWorld.clone().invert(), v=new Vector3(), box=new Box3();
        node!.traverse(o=>{
          if(!(o instanceof Mesh))return;
          const p=o.geometry.getAttribute('position');
          for(let i=0;i<p.count;i++) box.expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).applyMatrix4(local));
          for(const material of Array.isArray(o.material)?o.material:[o.material]) if(!/glow/i.test(material.name)) expect(material.map,`${module.node} albedo`).toBeTruthy();
        });
        const tol=.005;
        expect(Math.max(-box.min.x,box.max.x),`${module.node} x`).toBeLessThanOrEqual(module.half[0]+tol);
        expect(Math.max(-box.min.z,box.max.z),`${module.node} s`).toBeLessThanOrEqual(module.half[1]+tol);
        expect(box.max.y,`${module.node} top`).toBeLessThanOrEqual(module.top+tol);
        expect(box.max.y,`${module.node} reaches its top`).toBeGreaterThan(module.top-.25);
        expect(box.min.y,`${module.node} foundation`).toBeGreaterThanOrEqual(-module.below-tol);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
