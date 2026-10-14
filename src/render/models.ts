import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { EnemyKind, Pickup } from '../shared/contracts';
import type { PropKind } from '../world/terrain';

export function createMaterials() {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const noise = ((Math.imul(x + 11, 374761393) ^ Math.imul(y + 37, 668265263)) >>> 0) % 23;
    const shade = 228 + noise - (x % 19 === 0 && y % 7 < 4 ? 18 : 0);
    pixels.set([shade, shade, shade, 255], (y * 64 + x) * 4);
  }
  const surface = new THREE.DataTexture(pixels, 64, 64); surface.wrapS = surface.wrapT = THREE.RepeatWrapping;
  surface.magFilter = THREE.LinearFilter; surface.minFilter = THREE.LinearMipmapLinearFilter; surface.generateMipmaps = true; surface.needsUpdate = true;
  const metal = (color: number, roughness = 0.68, metalness = 0.32) => new THREE.MeshStandardMaterial({ color, roughness, metalness, map: surface });
  return {
    ivory: metal(0xc8bea4), rust: metal(0x84533a), dark: metal(0x252b2b, 0.57, 0.5),
    gunmetal: metal(0x59615b, 0.5, 0.5), ochre: metal(0xa18a58), glass: metal(0x174b55, 0.2, 0.65),
    cyan: new THREE.MeshBasicMaterial({ color: 0xa5fff6 }),
    hot: new THREE.MeshBasicMaterial({ color: 0xffac6d }),
    warning: new THREE.MeshBasicMaterial({ color: 0xfbc175, transparent: true, opacity: 0.76, depthWrite: false, depthTest: false }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function box(group: THREE.Group, material: THREE.Material, size: [number, number, number], at: [number, number, number]) {
  return addMesh(group, new RoundedBoxGeometry(...size, 1, Math.min(.035, ...size.map(v => v * .16))), material, ...at);
}
function cylinder(group: THREE.Group, material: THREE.Material, radius: number, length: number, at: [number, number, number], radiusTop = radius) {
  return addMesh(group, new THREE.CylinderGeometry(radiusTop, radius, length, 16), material, ...at, Math.PI / 2);
}

/** Convex armor plate extruded vertically; authored hull points rather than generated ships. */
function plate(group: THREE.Group, material: THREE.Material, points: readonly [number, number][], height: number, y: number) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const bevel = Math.min(.018, height * .22);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 1 });
  geometry.rotateX(Math.PI / 2); geometry.translate(0, y + height / 2 - bevel, 0);
  addMesh(group, geometry, material);
}

/** A model is only a handful of material draws, even when built from many armor parts. */
function combineStatic(source: THREE.Group): THREE.Group {
  source.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.deleteAttribute('uv'); geometry.applyMatrix4(object.matrixWorld);
    const collection = batches.get(material) ?? []; collection.push(geometry); batches.set(material, collection);
    object.geometry.dispose();
  });
  const result = new THREE.Group();
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (geometry) {
      const positions = geometry.getAttribute('position'), uv = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) { uv[i * 2] = positions.getX(i) * 1.5; uv[i * 2 + 1] = positions.getZ(i) * 1.5 + positions.getY(i) * .5; }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = addMesh(result, geometry, material); mesh.castShadow = true;
    }
  }
  return result;
}

export function createHero(materials: Materials): THREE.Group {
  const g = new THREE.Group(), m = materials;
  plate(g, m.rust, [[-.15, -.58], [.15, -.58], [.2, -.24], [.17, .43], [-.17, .43], [-.2, -.24]], .18, 0);
  plate(g, m.ivory, [[-.115, -.56], [.115, -.56], [.14, -.34], [-.14, -.34]], .035, .115);
  box(g, m.glass, [.19, .085, .25], [0, .15, -.16]);
  box(g, m.dark, [.018, .022, .27], [0, .2, -.16]);
  box(g, m.ivory, [.215, .025, .026], [0, .19, -.28]);
  box(g, m.dark, [.08, .055, .21], [0, .135, .21]);
  // Uneven repair plates, exposed braces and short swept wings establish the cheap utility airframe.
  for (const side of [-1, 1]) {
    const wing: [number, number][] = [[side * .15, -.21], [side * .49, .09], [side * .48, .24], [side * .14, .18]];
    plate(g, m.ivory, side < 0 ? wing.reverse() : wing, .045, -.005);
    box(g, m.dark, [.37, .045, .08], [side * .29, -.02, .22]);
    cylinder(g, m.rust, .105, .61, [side * .38, .015, .15]);
    cylinder(g, m.dark, .109, .09, [side * .38, .015, .45]);
    cylinder(g, m.gunmetal, .108, .035, [side * .38, .015, -.08]);
    cylinder(g, m.gunmetal, .109, .028, [side * .38, .015, .33]);
    cylinder(g, m.cyan, .068, .022, [side * .38, .015, .501]);
    cylinder(g, m.dark, .028, .29, [side * .225, -.03, -.42]);
    box(g, m.ivory, [.06, .035, .16], [side * .38, .116, .17]);
    box(g, m.dark, [.045, .012, .10], [side * .32, .05, .11]);
    for (let i = 0; i < 3; i++) box(g, m.dark, [.055, .012, .012], [side * .1, .13, .16 + i * .04]);
  }
  box(g, m.ivory, [.07, .028, .18], [-.11, .111, .24]);
  box(g, m.rust, [.075, .025, .075], [.09, .136, -.45]);
  const model = combineStatic(g); model.name = 'Scrapper — authored utility fighter'; return model;
}

export function createEnemy(kind: EnemyKind, m: Materials): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'turret') {
    addMesh(g, new THREE.CylinderGeometry(.5, .65, .18, 12), m.dark, 0, .04, 0);
    box(g, m.ochre, [.58, .42, .58], [0, .34, 0]);
    box(g, m.gunmetal, [.43, .22, .48], [0, .66, .05]);
    for (const side of [-1, 1]) {
      box(g, m.dark, [.14, .25, .7], [side * .25, .25, .03]);
      cylinder(g, m.dark, .072, .62, [side * .12, .71, .37]);
      cylinder(g, m.hot, .042, .032, [side * .12, .71, .69]);
    }
    box(g, m.hot, [.14, .045, .13], [0, .85, .03]);
    for (const side of [-1, 1]) box(g, m.ochre, [.09, .06, .5], [side * .32, .4, .02]);
  } else {
    const length = kind === 'lancer' ? .96 : .66;
    const width = kind === 'weaver' ? .87 : kind === 'lancer' ? .4 : .64;
    plate(g, m.dark, [[0, length], [.18, .24], [.19, -.35], [0, -.57], [-.19, -.35], [-.18, .24]], .2, 0);
    plate(g, m.ochre, [[0, length - .02], [.085, .16], [.085, -.33], [-.085, -.33], [-.085, .16]], .045, .13);
    for (const side of [-1, 1]) {
      const points: [number, number][] = kind === 'weaver'
        ? [[side * .15, .32], [side * width, .52], [side * .73, -.34], [side * .32, -.62], [side * .27, -.05]]
        : [[side * .12, .35], [side * width, -.24], [side * .54, -.46], [side * .17, -.25]];
      plate(g, m.gunmetal, side < 0 ? points.reverse() : points, .07, -.01);
      const trim: [number, number][] = [[side * .28, .13], [side * width * .89, -.26], [side * .42, -.31], [side * .24, -.14]];
      plate(g, m.ochre, side < 0 ? trim.reverse() : trim, .025, .05);
      cylinder(g, m.dark, .068, .35, [side * .27, 0, -.36]);
      cylinder(g, m.gunmetal, .072, .035, [side * .27, 0, -.45]);
      cylinder(g, m.hot, .044, .025, [side * .27, 0, -.55]);
    }
    box(g, m.glass, [.15, .065, .22], [0, .175, .11]);
    box(g, m.dark, [.018, .024, .23], [0, .21, .11]);
    box(g, m.hot, [.055, .055, .24], [0, .16, -.25]);
  }
  const model = combineStatic(g); model.name = `Authored Khepri ${kind}`; return model;
}

export function createCargo(m: Materials): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) box(g, m.dark, [.25, .25, 1.75], [side * .48, .05, 0]);
  box(g, m.gunmetal, [.86, .4, 1.55], [0, .28, 0]);
  box(g, m.ochre, [.77, .32, .4], [0, .57, -.45]);
  box(g, m.dark, [.62, .1, .35], [0, .51, .48]);
  for (const x of [-.26, 0, .26]) box(g, m.dark, [.035, .045, .74], [x, .51, .05]);
  return combineStatic(g);
}

/** Unit-footprint architectural models, scaled by deterministic district data. */
export function createScenicProp(kind: PropKind, m: Materials): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'cargo') return normalizeProp(createCargo(m));
  if (kind === 'landingPad') {
    plate(g, m.dark, [[-1.7,-2], [1.7,-2], [2,-1.7], [2,1.7], [1.7,2], [-1.7,2], [-2,1.7], [-2,-1.7]], .12, .06);
    box(g, m.gunmetal, [3.6,.035,3.6], [0,.13,0]);
    for (const side of [-1,1]) {
      box(g, m.ivory, [.035,.02,2.1], [side*1.25,.16,0]);
      box(g, m.ochre, [.3,.025,.1], [side*1.45,.16,-1.45]);
    }
    box(g, m.ivory, [.8,.02,.045], [0,.16,0]);
    box(g, m.ivory, [.045,.02,.6], [0,.16,0]);
  } else if (kind === 'track') {
    box(g, m.dark, [1,.06,4], [0,.03,0]);
    for (const side of [-1,1]) box(g, m.gunmetal, [.09,.04,4], [side*.36,.08,0]);
    for (let z=-1.75;z<2;z+=.5) box(g,m.ochre,[.82,.025,.08],[0,.065,z]);
  } else if (kind === 'refinery') {
    plate(g,m.dark,[[-1.4,-1], [1.2,-1], [1.45,-.7], [1.45,.7], [1.2,1], [-1.4,1]],.16,.08);
    for (const x of [-.75, .2]) {
      cylinder(g,m.gunmetal,.34,1.42,[x,.56,0]);
      cylinder(g,m.ochre,.35,.1,[x,.56,-.55]);
      cylinder(g,m.ochre,.35,.1,[x,.56,.55]);
    }
    box(g,m.rust,[.42,.6,1.6],[1,.46,0]);
    for (let z=-.55;z<=.6;z+=.23) box(g,m.dark,[.32,.06,.1],[1,.8,z]);
    cylinder(g,m.dark,.08,2.1,[0,.3,.8]);
  } else {
    plate(g,m.dark,[[-.7,-.65],[.7,-.65],[.85,.45],[.5,.7],[-.5,.7],[-.85,.45]],.12,.06);
    box(g,m.ochre,[.7,.4,.8],[0,.32,0]);
    for (const side of [-1,1]) {
      const fin = box(g,m.gunmetal,[.6,.055,.9],[side*.63,.45,0]); fin.rotation.z=side*.15;
      for (let z=-.3;z<=.31;z+=.2) box(g,m.dark,[.5,.018,.025],[side*.63,.5,z]);
    }
    addMesh(g,new THREE.CylinderGeometry(.08,.11,.55,12),m.dark,0,.75,0);
    addMesh(g,new THREE.CylinderGeometry(.3,.15,.16,12),m.gunmetal,0,1.03,0);
  }
  return normalizeProp(combineStatic(g));
}

function normalizeProp(model: THREE.Group): THREE.Group {
  const bounds=new THREE.Box3().setFromObject(model), size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
  model.traverse(object=>{
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.translate(-center.x,-bounds.min.y,-center.z);
    object.geometry.scale(1/size.x,1/size.y,1/size.z);
  });
  return model;
}

/** Slow, framed cargo icons: each category is recognizable without relying on its color. */
export function createPickupModel(kind: Pickup['kind']): THREE.Group {
  const g=new THREE.Group();
  const color=kind==='shield'?0x96e3d4:kind==='credit'?0xf0ce83:kind==='weapon'?0xd1b9ee:0xf2e6cb;
  const dark=new THREE.MeshBasicMaterial({color:0x1b292c});
  const ink=new THREE.MeshBasicMaterial({color});
  const shape=(points:[number,number][],material:THREE.Material,z=0)=>{
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(...p)))),material);
    mesh.position.z=z;mesh.renderOrder=8;g.add(mesh);
  };
  const ring=(radius:number,segments:number)=>{
    const background=new THREE.Mesh(new THREE.CircleGeometry(radius,segments),dark); background.renderOrder=7;g.add(background);
    const border=new THREE.Mesh(new THREE.RingGeometry(radius-.022,radius,segments),ink); border.position.z=.005;border.renderOrder=8;g.add(border);
  };
  if(kind==='shield') {
    ring(.32,6);
    shape([[-.16,.17],[.16,.17],[.14,-.04],[0,-.2],[-.14,-.04]],ink,.01);
    shape([[-.1,.105],[.1,.105],[.085,-.015],[0,-.11],[-.085,-.015]],dark,.02);
  } else if(kind==='weapon') {
    shape([[-.39,-.18],[-.32,-.26],[.32,-.26],[.39,-.18],[.39,.18],[.32,.26],[-.32,.26],[-.39,.18]],ink);
    shape([[-.35,-.16],[-.29,-.22],[.29,-.22],[.35,-.16],[.35,.16],[.29,.22],[-.29,.22],[-.35,.16]],dark,.01);
    for(const x of [-.12,.12]) shape([[x-.04,-.12],[x+.04,-.12],[x+.04,.14],[x-.04,.14]],ink,.02);
    shape([[-.22,-.14],[.22,-.14],[.22,-.08],[-.22,-.08]],ink,.02);
  } else if(kind==='power') {
    ring(.32,4);
    shape([[-.19,-.05],[0,.15],[.19,-.05],[.13,-.12],[0,.03],[-.13,-.12]],ink,.01);
  } else {
    ring(.28,4);
    shape([[-.105,-.1],[.105,-.1],[.105,.1],[-.105,.1]],ink,.01);
    shape([[-.05,-.045],[.05,-.045],[.05,.045],[-.05,.045]],dark,.02);
  }
  const model=combineStatic(g);model.children.forEach(child=>{child.renderOrder=7;});return model;
}
