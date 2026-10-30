import { afterAll, describe, expect, it, vi } from 'vitest';
import { Box3, Mesh, Vector3, type Group, type MeshStandardMaterial } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { SITES } from '../../src/content/sites';
import { SITE_CORE_HEIGHT, SITE_MODELS, SITE_PARTS, siteFile, siteFinish, siteNode, sitesWithModels } from '../../src/render/site-models';
import { SITE_IDS, VIEW, type PlanetId, type SiteId } from '../../src/shared/contracts';

const fs: { readFileSync(path: string): Uint8Array } = await import(['node', 'fs'].join(':'));
vi.stubGlobal('self', globalThis);
vi.stubGlobal('createImageBitmap', async () => ({ width: 512, height: 512, close() {} }));
afterAll(() => vi.unstubAllGlobals());
async function asset(path: string): Promise<Group> {
  const bytes = fs.readFileSync(`public/assets/${path}`);
  return (await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(bytes.slice().buffer, '', resolve, reject))).scene;
}
const modelled = SITE_IDS.filter(id => SITE_MODELS[id]);
/** A finish costs no more than a facility plant (about 6 modules of 1–2k triangles; docs/33 § 6). */
const TRIANGLES_PER_FINISH = 7000;

describe('strike-site models (docs/33 § 6, tools/blender/strike_sites.py)', () => {
  it('model only worlds a site appears on, and every world with a model has its finish', () => {
    expect(modelled.length).toBeGreaterThanOrEqual(4);
    for (const id of modelled) for (const finish of SITE_MODELS[id]!.finishes) expect(SITES[id].worlds, `${id} on ${finish}`).toContain(finish);
    for (const planet of ['luna', 'khepri', 'vesper', 'nacre', 'amnion', 'umbra'] as PlanetId[])
      for (const id of sitesWithModels(planet)) expect(siteFinish(id, planet)).toBe(planet);
    expect(siteFinish('airfield', 'umbra')).toBeNull();
  });

  it('keep each finish inside its registry bounds, under the roof limit, with its core at the target height and in sight', async () => {
    for (const id of modelled as SiteId[]) {
      const model = SITE_MODELS[id]!;
      // docs/25 rule 3 and the 4–6 unit brief.
      expect(model.top).toBeLessThanOrEqual(3.25);
      expect(model.x[1] - model.x[0]).toBeLessThanOrEqual(6.5);
      expect(model.s[1] - model.s[0]).toBeLessThanOrEqual(6.5);
      // Site routes stand about 7.5 out: the whole site stays inside the world.
      expect(7.5 + Math.max(-model.x[0], model.x[1])).toBeLessThanOrEqual(VIEW.worldWidth / 2);
      for (const finish of model.finishes) {
        const scene = await asset(siteFile(id, finish)), label = `${id}/${finish}`;
        scene.updateMatrixWorld(true);
        const all = new Box3(), v = new Vector3();
        let triangles = 0, coreGlow = false, hidden = 0;
        for (const part of SITE_PARTS) {
          const node = scene.getObjectByName(siteNode(id, finish, part));
          expect(node, `${label} ${part}`).toBeDefined();
          const box = new Box3();
          node!.traverse(object => {
            if (!(object instanceof Mesh)) return;
            const position = object.geometry.getAttribute('position');
            expect(object.geometry.getAttribute('color'), `${label} baked AO`).toBeDefined();
            triangles += (object.geometry.index?.count ?? position.count) / 3;
            for (const material of [object.material as MeshStandardMaterial]) if (/glow/i.test(material.name) && part === 'core') coreGlow = true;
            for (let i = 0; i < position.count; i++) {
              v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
              box.expandByPoint(v);
              // docs/25 rule 2: nothing of the site in front of the core (|x| < 0.9, s = −z < 0) rises into the camera's line to it.
              if (part === 'body' && Math.abs(v.x) < .9 && v.z > .05 && v.y > .75 + 1.43 * v.z + .03) hidden++;
            }
          });
          all.union(box);
          if (part === 'core') {
            // The core's glow is centred on the target: its box straddles the core height at the pivot.
            expect(box.min.y, `${label} core`).toBeLessThan(SITE_CORE_HEIGHT);
            expect(box.max.y, `${label} core`).toBeGreaterThan(SITE_CORE_HEIGHT);
            expect(Math.abs((box.min.x + box.max.x) / 2), `${label} core x`).toBeLessThan(.25);
            expect(Math.abs((box.min.z + box.max.z) / 2), `${label} core s`).toBeLessThan(.25);
          }
        }
        expect(hidden, `${label} hides its core`).toBe(0);
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
      }
      // The registry is not slack: some finish reaches near its declared top.
      let reach = -Infinity;
      for (const finish of model.finishes) reach = Math.max(reach, new Box3().setFromObject(await asset(siteFile(id, finish))).max.y);
      expect(reach, `${id} reaches its top`).toBeGreaterThan(model.top - .25);
    }
  });
});
