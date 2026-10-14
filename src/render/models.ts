import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { EnemyKind, Pickup } from '../shared/contracts';
/** Code-built outpost stand-ins, used when the modelled infrastructure kit is missing. */
export type PropKind = 'relay' | 'cargo' | 'landingPad' | 'track' | 'refinery';

/**
 * Panel detail for craft (luminance ratio, 0.5 = neutral): irregular armour plates with dark seams, rivets,
 * edge wear and grime. Data, not colour: it only modulates the palette, so faction colours stay authored.
 */
function createPanelTexture(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number, salt: number) => {
    let n = Math.imul(x + 11 + salt * 131, 374761393) ^ Math.imul(y + 37 + salt * 71, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  // Plate grid: rows of different heights, each row split at its own offsets, so seams never form a uniform grid.
  const rows = [0, 22, 38, 64, 80, 101, 128], seamAt = (x: number, y: number) => {
    const row = rows.findIndex((top, i) => y >= top && y < rows[i + 1]);
    const top = rows[row], bottom = rows[row + 1], width = 18 + Math.floor(hash(row, 0, 3) * 20), shift = Math.floor(hash(row, 1, 5) * width);
    const column = Math.floor((x + shift) / width), local = (x + shift) % width;
    return { edge: Math.min(y - top, bottom - 1 - y, local, width - 1 - local), plate: row * 31 + column };
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const { edge, plate } = seamAt(x, y);
    let v = 0.94 + hash(plate, 7, 9) * 0.1;                        // per-plate tone (patched, repainted panels)
    if (edge === 0) v *= 0.58; else if (edge === 1) v *= 1.07;      // recessed seam with a lit lip
    if (edge === 2 && (x + y) % 6 === 0) v *= 0.7;                  // rivet line
    v *= 0.93 + 0.07 * hash(x >> 3, y >> 3, 13) + 0.05 * (hash(x, y, 17) - 0.5); // grime and grain
    if (edge <= 2 && hash(x, y, 19) > 0.82) v *= 1.12;              // chipped edge wear
    const byte = Math.round(Math.min(1, v / 2) * 255);
    data.set([byte, byte, byte, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/**
 * One physically based material for every authored craft. Each vertex carries its palette colour and a
 * `pbr` triple (roughness, metalness, glow), so a whole ship is a single draw: graphite and gunmetal read as
 * metal, ivory and ochre as worn paint, and glow parts emit above the bloom threshold (engines, threat lights).
 * A warm rim term separates silhouettes from the terrain like the concept's hard-surface key light.
 */
function createCraftMaterial(panel: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: panel, roughness: 1, metalness: 1, envMapIntensity: 0.9 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { rimColor: { value: new THREE.Color(1, 0.78, 0.55) }, rimStrength: { value: 0.32 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pbr;\nvarying vec3 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace('#include <map_fragment>', `float glowMask = step( 0.01, vPbr.z );
  vec3 glowTint = diffuseColor.rgb;
  #ifdef USE_MAP
    // Panel seams, rivets and wear modulate the paint, never the glow parts.
    diffuseColor.rgb *= mix( 1.0 + ( texture2D( map, vMapUv ).r * 2.0 - 1.0 ) * 1.35, 1.0, glowMask );
  #endif
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.015 ), glowMask );`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPbr.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowTint * vPbr.z;')
      .replace('#include <opaque_fragment>', `vec3 rimView = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );
  float rim = pow( 1.0 - clamp( abs( dot( normal, rimView ) ), 0.0, 1.0 ), 3.0 );
  outgoingLight += rimColor * rim * rimStrength * ( 1.0 - glowMask );
  #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'authored-craft';
  return material;
}

/** Palette entry for craft: sRGB colour, roughness, metalness, glow (HDR emissive multiplier; 0 = lit surface). */
export interface CraftPaint { color: THREE.Color; roughness: number; metalness: number; glow: number }

export function createMaterials() {
  const panel = createPanelTexture();
  // Palette sources (baked into craft and fallback props) and the plinth material; the panel map lives on `craft`.
  const metal = (color: number, roughness = 0.68, metalness = 0.32) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const ivory = metal(0xd6caae, 0.52, 0.12), rust = metal(0x8a4c2c, 0.78, 0.32), dark = metal(0x2a2e31, 0.42, 0.72);
  const gunmetal = metal(0x575f63, 0.36, 0.8), ochre = metal(0xb38946, 0.55, 0.22), glass = metal(0x123f49, 0.08, 0.35);
  const cyan = new THREE.MeshBasicMaterial({ color: 0xa5fff6 }), hot = new THREE.MeshBasicMaterial({ color: 0xffac6d });
  const paint = new Map<THREE.Material, CraftPaint>();
  for (const material of [ivory, rust, dark, gunmetal, ochre, glass]) paint.set(material, { color: material.color, roughness: material.roughness, metalness: material.metalness, glow: 0 });
  // Engines and threat lights are emissive cores above the bloom threshold on High; Low shows them as hot, clipped colour.
  paint.set(cyan, { color: new THREE.Color(0x8ffcf0), roughness: 1, metalness: 0, glow: 3.2 });
  paint.set(hot, { color: new THREE.Color(0xff8a40), roughness: 1, metalness: 0, glow: 2.5 });
  return {
    ivory, rust, dark, gunmetal, ochre, glass, cyan, hot,
    warning: new THREE.MeshBasicMaterial({ color: 0xfbc175, transparent: true, opacity: 0.76, depthWrite: false, depthTest: false }),
    /** Shared single-draw material for hero and enemy craft. */
    craft: createCraftMaterial(panel),
    /** How each authored part material bakes into the craft vertex attributes. */
    paint,
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

/**
 * Bakes an authored craft (many armour parts, several palette materials) into one mesh with the shared craft
 * material: colour, roughness, metalness and glow become vertex attributes, so a ship is a single draw call and
 * craft of one kind can be instanced. Planar UVs match the panel detail scale of the code-built props.
 */
function combineCraft(source: THREE.Group, m: Materials): THREE.Group {
  source.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const paint = m.paint.get(object.material as THREE.Material);
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.deleteAttribute('uv'); geometry.applyMatrix4(object.matrixWorld);
    const count = geometry.getAttribute('position').count, color = new Float32Array(count * 3), pbr = new Float32Array(count * 3);
    const linear = (paint?.color ?? new THREE.Color(0.5, 0.5, 0.5));
    for (let i = 0; i < count; i++) {
      color.set([linear.r, linear.g, linear.b], i * 3);
      pbr.set([paint?.roughness ?? 0.6, paint?.metalness ?? 0.3, paint?.glow ?? 0], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3)); geometry.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
    parts.push(geometry); object.geometry.dispose();
  });
  const result = new THREE.Group(), geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (geometry) {
    const positions = geometry.getAttribute('position'), uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) { uv[i * 2] = positions.getX(i) * 1.5; uv[i * 2 + 1] = positions.getZ(i) * 1.5 + positions.getY(i) * .5; }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, m.craft); mesh.castShadow = false; mesh.receiveShadow = false; result.add(mesh);
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
  const model = combineCraft(g, m); model.name = 'Scrapper — authored utility fighter'; return model;
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
  const model = combineCraft(g, m); model.name = `Authored Khepri ${kind}`; return model;
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
  // Drops read at the shield cell's size (user request): the diamond credit and power frames are smaller for the
  // same radius, so they scale up until their footprint matches the hexagon. Visual only; pickup radius is sim-owned.
  const grow=kind==='credit'?1.3:kind==='power'?1.15:1;
  if(grow!==1)g.children.forEach(child=>(child as THREE.Mesh).geometry.scale(grow,grow,1));
  const model=combineStatic(g);model.children.forEach(child=>{child.renderOrder=7;});return model;
}

/**
 * Tiny procedural sky for image-based reflections on craft and machinery: warm hazy zenith, a bright amber
 * horizon band, rust ground bounce and a low sun from the upper left (docs/13 §1). Prefiltered once with
 * PMREM at start; no texture download. Metals pick up the desert's warmth instead of reading as flat black.
 */
export function createDesertEnvironment(renderer: THREE.WebGLRenderer, sun: THREE.Vector3): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { sun: { value: sun.clone().normalize() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform vec3 sun; varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 zenith = vec3( 0.55, 0.42, 0.32 ), horizon = vec3( 1.25, 0.72, 0.38 ), ground = vec3( 0.22, 0.09, 0.035 );
        vec3 color = y > 0.0 ? mix( horizon, zenith, pow( y, 0.6 ) ) : mix( horizon * 0.45, ground, pow( -y, 0.5 ) );
        float d = max( dot( normalize( vDir ), sun ), 0.0 );
        color += vec3( 9.0, 6.4, 3.8 ) * pow( d, 900.0 ) + vec3( 0.6, 0.38, 0.18 ) * pow( d, 12.0 );
        gl_FragColor = vec4( color, 1.0 );
      }`,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material); scene.add(sphere);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.02);
  generator.dispose(); sphere.geometry.dispose(); material.dispose();
  return target;
}
