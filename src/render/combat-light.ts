import * as THREE from 'three';
import { VIEW } from '../shared/contracts';

/** Bounded, single-draw beam gradients. Width includes a soft halo outside the damage lane. */
export function createBeamLight(scene: THREE.Scene) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; varying vec3 tint;
      void main() { vUv=uv; tint=instanceColor; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 tint;
      void main() {
        float r=abs(vUv.x-.5)*2.;
        float halo=exp(-r*r*6.)*(1.-smoothstep(.75,1.,r));
        float core=exp(-pow(r/.11,2.));
        float end=smoothstep(0.,.012,vUv.y)*(1.-smoothstep(.985,1.,vUv.y));
        gl_FragColor=vec4((tint*halo*1.35+vec3(2.8)*core)*end,halo*end);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 32);
  mesh.name = 'smooth beam light'; mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color()); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const pose = new THREE.Object3D(), color = new THREE.Color();
  return {
    begin() { mesh.count = 0; },
    add(x: number, top: number, width: number, hex: number) {
      if (mesh.count >= 32) return;
      pose.position.set(x, VIEW.flightHeight + .04, -(top + VIEW.minS) / 2);
      pose.scale.set(width * 1.9, 1, top - VIEW.minS); pose.updateMatrix();
      mesh.setMatrixAt(mesh.count, pose.matrix); mesh.setColorAt(mesh.count++, color.setHex(hex));
    },
    end() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}

/** A black centre with a thin violet lens rim, one quad per teleport endpoint. No full-screen distortion. */
export function createPhaseHoles(scene: THREE.Scene) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; void main(){
      float r=length((vUv-.5)*2.);
      float rim=exp(-pow((r-.69)/.055,2.));
      float halo=exp(-pow((r-.72)/.18,2.))*.22;
      float a=(1.-smoothstep(.68,.99,r));
      gl_FragColor=vec4(vec3(.4,.1,.85)*(rim*2.+halo),a);
    }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 32);
  mesh.name = 'Wraith phase holes'; mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  const pose = new THREE.Object3D();
  return {
    begin() { mesh.count = 0; },
    add(x: number, s: number, scale: number) {
      if (mesh.count >= 32 || scale <= .001) return;
      pose.position.set(x, VIEW.flightHeight + .07, -s); pose.scale.setScalar(scale); pose.updateMatrix();
      mesh.setMatrixAt(mesh.count++, pose.matrix);
    },
    end() { mesh.instanceMatrix.needsUpdate = true; },
    dispose() { scene.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
