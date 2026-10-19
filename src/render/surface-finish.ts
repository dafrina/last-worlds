import * as THREE from 'three';

/** Shared, mipmapped material data: height, roughness variation, and fine wear. No colour texture or per-object atlas. */
const cache = new Map<string, { texture: THREE.DataTexture; users: number }>();
function finishTexture(kind: 'metal' | 'stone'): THREE.DataTexture {
  const old = cache.get(kind);
  if (old) { old.users++; return old.texture; }
  const size = 256, bytes = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => { let n = Math.imul(x + 937, 374761393) ^ Math.imul(y + 211, 668265263); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = hash(x, y);
    // Manufactured microfinish, not a tiled brick seam. Large panel gaps belong to the authored geometry.
    const brushed = hash(x, Math.floor(y / 16));
    const cloud = .5 + .25 * Math.sin(x * Math.PI / 128 + Math.sin(y * Math.PI / 64)) * Math.sin(y * Math.PI / 128);
    const crack = Math.abs(Math.sin(x * Math.PI / 32 + Math.sin(y * Math.PI / 64) * .8));
    const layer = Math.abs(Math.sin((y + Math.sin(x * Math.PI / 128) * 8) * Math.PI / 16));
    const height = kind === 'metal' ? .5 + (grain - .5) * .018 + (brushed - .5) * .012
      : .48 + (grain - .5) * .16 + layer * .12 - Math.pow(1 - crack, 12) * .26;
    const rough = kind === 'metal' ? .27 + cloud * .4 + brushed * .09 : .56 + grain * .25;
    bytes.set([height * 255, rough * 255, (kind === 'metal' ? .45 + grain * .1 : .4 + grain * .2) * 255, 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(bytes, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  cache.set(kind, { texture, users: 1 }); return texture;
}

/** Finish a PBR material without changing its palette/glow hooks or adding draw calls. Local box projection also works on instances. */
export function applySurfaceFinish<T extends THREE.MeshStandardMaterial>(material: T, kind: 'metal' | 'stone' = 'metal', scale = 1, relief = .012): T {
  const texture = finishTexture(kind), previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey.bind(material);
  const key = previousKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, { finishMap: {value: texture}, finishScale: {value: scale}, finishRelief: {value: relief} });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFinishPosition; varying vec3 vFinishNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinishPosition = position; vFinishNormal = normal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D finishMap; uniform float finishScale; uniform float finishRelief; varying vec3 vFinishPosition; varying vec3 vFinishNormal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 finishAxis = abs( vFinishNormal );
      vec2 finishUv = ( finishAxis.y >= max( finishAxis.x, finishAxis.z ) ? vFinishPosition.xz : ( finishAxis.x > finishAxis.z ? vFinishPosition.zy : vFinishPosition.xy ) ) * finishScale;
      vec4 finishData = texture2D( finishMap, finishUv );
      // Deep seams scatter light; exposed edges remain polished. Existing paint/metal masks are retained.
      roughnessFactor = clamp( roughnessFactor + ( finishData.g - .5 ) * .32, .16, .96 );
      diffuseColor.rgb *= .96 + finishData.b * .08;
      vec3 finishDx = dFdx( -vViewPosition ), finishDy = dFdy( -vViewPosition );
      vec3 finishR1 = cross( finishDy, normal ), finishR2 = cross( normal, finishDx );
      float finishDet = dot( finishDx, finishR1 );
      vec3 finishGradient = sign( finishDet ) * ( dFdx( finishData.r ) * finishR1 + dFdy( finishData.r ) * finishR2 );
      normal = normalize( abs( finishDet ) * normal - finishRelief * finishGradient );`);
  };
  material.customProgramCacheKey = () => `${key}|surface-finish-v2`;
  let released = false;
  material.addEventListener('dispose', () => {
    if (released) return;
    released = true;
    const entry = cache.get(kind); if (entry && --entry.users === 0) { entry.texture.dispose(); cache.delete(kind); }
  });
  return material;
}
