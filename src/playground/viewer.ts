/**
 * The playground's model viewer (user, 27 October: "can you make a model viewer for each enemy and the hero"): one model
 * at a time on a turntable in its own small renderer, with the GLB's authored materials, a neutral studio light (or the
 * current world's colours), orbit controls, a wireframe toggle and its size and triangle count. The game's own look of
 * each model, with its world paint and light, is the enemy lab on the real map.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ViewerModel } from './roster';

export interface ViewerInfo { triangles: number; size: [number, number, number]; materials: string[] }

export function createModelViewer(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pg-viewer-canvas';
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f17);
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 5, 4); scene.add(sun);
  const fill = new THREE.HemisphereLight(0xbfd4ff, 0x20242c, 0.6); scene.add(fill);
  const grid = new THREE.GridHelper(4, 16, 0x2c3b52, 0x1a2433); scene.add(grid);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 500);
  camera.position.set(1.6, 1.3, 2.2);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
  const files = new Map<string, Promise<GLTF>>(), loader = new GLTFLoader();
  let shown: THREE.Object3D | null = null, running = false, wire = false, revision = 0, radius = 1;
  /** Backs the camera off along its view until the model's bounding sphere fits the narrower field of view (portrait). */
  const frame = () => {
    const vertical = THREE.MathUtils.degToRad(camera.fov), horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.08;
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance); camera.near = distance / 100; camera.far = distance * 10;
    camera.updateProjectionMatrix(); controls.update();
  };

  const triangles = (object: THREE.Object3D) => {
    let total = 0;
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const geometry = mesh.geometry;
      total += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    });
    return Math.round(total);
  };
  const setWire = (object: THREE.Object3D) => object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) (material as THREE.MeshStandardMaterial).wireframe = wire;
  });

  return {
    /** Shows a model: its node from the GLB (the whole scene for a boss), centred on the grid and framed. */
    async show(model: ViewerModel): Promise<ViewerInfo | null> {
      const mine = ++revision;
      const base = (import.meta.env?.BASE_URL ?? './') + 'assets/';
      if (!files.has(model.file)) files.set(model.file, loader.loadAsync(base + model.file));
      let gltf: GLTF;
      try { gltf = await files.get(model.file)!; } catch { return null; }
      if (mine !== revision) return null;
      const source = model.node ? gltf.scene.getObjectByName(model.node) : gltf.scene;
      if (!source) return null;
      if (shown) scene.remove(shown);
      const copy = source.clone(true);
      copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.updateMatrixWorld(true);
      // Wrecks and the bosses' hidden parts stay as the game hides them: only `_wreck` nodes are hidden here.
      copy.traverse(child => { if (child.name.endsWith('_wreck')) child.visible = false; });
      const holder = new THREE.Group(); holder.add(copy);
      const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z) || 1, fit = 2 / extent;
      holder.scale.setScalar(fit); holder.position.set(-centre.x * fit, -box.min.y * fit, -centre.z * fit);
      scene.add(holder); shown = holder; setWire(holder);
      radius = new THREE.Box3().setFromObject(holder).getBoundingSphere(new THREE.Sphere()).radius;
      controls.target.set(0, size.y * fit * 0.5, 0); camera.position.set(1.9, 1.3 + size.y * fit * 0.5, 2.4); frame();
      const materials = new Set<string>();
      copy.traverse(child => { const mesh = child as THREE.Mesh; if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m.name || '(unnamed)'); });
      return { triangles: triangles(copy), size: [size.x, size.y, size.z].map(v => Math.round(v * 100) / 100) as [number, number, number], materials: [...materials] };
    },
    setWireframe(on: boolean) { wire = on; if (shown) setWire(shown); },
    setAutoRotate(on: boolean) { controls.autoRotate = on; },
    /** A world's light instead of the neutral studio (its sun, sky fill and background). */
    setLight(sunColor: number, sunIntensity: number, sky: number, ground: number, fillIntensity: number, background: number) {
      sun.color.setHex(sunColor); sun.intensity = sunIntensity * .45; fill.color.setHex(sky); fill.groundColor.setHex(ground); fill.intensity = fillIntensity;
      (scene.background as THREE.Color).setHex(background);
    },
    studio() { sun.color.setHex(0xffffff); sun.intensity = 2.2; fill.color.setHex(0xbfd4ff); fill.groundColor.setHex(0x20242c); fill.intensity = .6; (scene.background as THREE.Color).setHex(0x0b0f17); },
    resize(width: number, height: number) { renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); frame(); },
    start() {
      if (running) return; running = true;
      const loop = () => { if (!running) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    stop() { running = false; },
    dispose() { running = false; controls.dispose(); environment.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove(); },
  };
}
