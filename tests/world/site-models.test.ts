import { afterAll, describe, expect, it, vi } from 'vitest';
import { Box3, DoubleSide, Mesh, Raycaster, Vector3, type Group, type Material, type MeshStandardMaterial } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SITES, SITE_CORE_HEIGHT, SITE_FOOTPRINT } from '../../src/content/sites';
import { SITE_MODELS, SITE_PARTS, siteFile, siteFinish, siteNode, sitesWithModels } from '../../src/render/site-models';
import { SITE_IDS, VIEW, type PlanetId, type SiteId } from '../../src/shared/contracts';

const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
vi.stubGlobal('self', globalThis);
vi.stubGlobal('createImageBitmap', async () => ({ width: 512, height: 512, close() {} }));
afterAll(() => vi.unstubAllGlobals());
async function asset(path: string): Promise<Group> {
  const bytes = fs.readFileSync(`public/assets/${path}`);
  return (await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.slice().buffer, '', resolve, reject))).scene;
}
/** A finish costs no more than a facility plant (about 6–10 modules of 1–2k triangles; docs/33 § 6). */
const TRIANGLES_PER_FINISH = 7000;
/** The sealed vault's seals around its centre on the ground (its core formation's slots spread by the lens). */
const CORES: Partial<Record<SiteId, readonly [number, number][]>> = { 'sealed-vault': [[-1.06, -.42], [1.06, -.42], [0, 1.06]] };
const CAMERA = new Vector3(0, Math.sin(VIEW.elevation * Math.PI / 180), Math.cos(VIEW.elevation * Math.PI / 180));

describe('strike-site models (docs/33 § 6, tools/blender/strike_sites.py)', () => {
  it('model every site on every world it appears on', () => {
    for (const id of SITE_IDS) expect(SITE_MODELS[id]?.finishes, id).toEqual(SITES[id].worlds);
    for (const planet of ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'] as PlanetId[])
      for (const id of sitesWithModels(planet)) expect(siteFinish(id, planet)).toBe(planet);
    expect(siteFinish('airfield', 'umbra')).toBeNull();
  });

  it('keep each finish inside the footprint and its bounds, under the roof limit, its cores at their height and in sight', async () => {
    for (const id of SITE_IDS) {
      const model = SITE_MODELS[id]!, height = SITE_CORE_HEIGHT[id];
      expect(model.top).toBeLessThanOrEqual(3.25);
      expect(model.x[0]).toBeGreaterThanOrEqual(-SITE_FOOTPRINT.x); expect(model.x[1]).toBeLessThanOrEqual(SITE_FOOTPRINT.x);
      expect(model.s[0]).toBeGreaterThanOrEqual(SITE_FOOTPRINT.s[0]); expect(model.s[1]).toBeLessThanOrEqual(SITE_FOOTPRINT.s[1]);
      let reach = -Infinity;
      for (const finish of model.finishes) {
        const scene = await asset(siteFile(id, finish)), label = `${id}/${finish}`;
        scene.updateMatrixWorld(true);
        const all = new Box3(), v = new Vector3();
        let triangles = 0, coreGlow = false;
        const bodies: Mesh[] = [];
        for (const part of SITE_PARTS) {
          const node = scene.getObjectByName(siteNode(id, finish, part));
          expect(node, `${label} ${part}`).toBeDefined();
          const box = new Box3();
          node!.traverse(object => {
            if (!(object instanceof Mesh)) return;
            const position = object.geometry.getAttribute('position');
            expect(object.geometry.getAttribute('color'), `${label} baked AO`).toBeDefined();
            triangles += (object.geometry.index?.count ?? position.count) / 3;
            if (part === 'core' && /glow/i.test((object.material as MeshStandardMaterial).name)) coreGlow = true;
            if (part === 'body') bodies.push(object);
            for (let i = 0; i < position.count; i++) box.expandByPoint(v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
          });
          all.union(box);
          // The core's glow is centred on the target: its box straddles the core height at the pivot.
          if (part === 'core') {
            expect(box.min.y, `${label} core`).toBeLessThan(height);
            expect(box.max.y, `${label} core`).toBeGreaterThan(height);
            expect(Math.abs((box.min.x + box.max.x) / 2), `${label} core x`).toBeLessThan(.3);
            expect(Math.abs((box.min.z + box.max.z) / 2), `${label} core s`).toBeLessThan(.3);
          }
        }
        // docs/25 rule 2: a ray from each core toward the camera never meets the site.
        for (const mesh of bodies) for (const material of [mesh.material as Material]) material.side = DoubleSide;
        for (const [x, s] of CORES[id] ?? [[0, 0]]) {
          const origin = new Vector3(x, height, -s).addScaledVector(CAMERA, .35);
          const hits = new Raycaster(origin, CAMERA.clone(), 0, 40).intersectObjects(bodies, false);
          expect(hits.length, `${label} hides its core at ${hits[0]?.point.toArray().map(n => n.toFixed(2))}`).toBe(0);
        }
        expect(coreGlow, `${label} core glows`).toBe(true);
        expect(triangles, `${label} triangles`).toBeLessThanOrEqual(TRIANGLES_PER_FINISH);
        const tol = .01;
        expect(all.min.x, `${label} x`).toBeGreaterThanOrEqual(model.x[0] - tol);
        expect(all.max.x, `${label} x`).toBeLessThanOrEqual(model.x[1] + tol);
        // glTF −z is s (away from the camera).
        expect(-all.max.z, `${label} s`).toBeGreaterThanOrEqual(model.s[0] - tol);
        expect(-all.min.z, `${label} s`).toBeLessThanOrEqual(model.s[1] + tol);
        expect(all.max.y, `${label} top`).toBeLessThanOrEqual(model.top + tol);
        expect(all.min.y, `${label} foundation`).toBeGreaterThanOrEqual(-model.below - tol);
        reach = Math.max(reach, all.max.y);
      }
      // The registry is not slack: some finish reaches near its declared top.
      expect(reach, `${id} reaches its top`).toBeGreaterThan(model.top - .25);
    }
  });
});
