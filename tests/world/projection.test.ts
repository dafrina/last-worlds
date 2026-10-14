import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { VIEW } from '../../src/shared/contracts';
import { configureCamera, groundForwardPosition, groundPlacement } from '../../src/render/scene';
import { terrainSample } from '../../src/world/terrain';

describe('canonical rendering projection', () => {
  it('seats ground enemies on relief while preserving the same visible target',()=>{
    const h=VIEW.width*16/9,camera=new OrthographicCamera(-6,6,h/2,-h/2,.1,100);
    for(const seed of [1,42,810])for(const x of [-12,-5,0,8,12])for(const distance of [0,50,120,300]) {
      configureCamera(camera,x);
      const p=groundPlacement(seed,distance,x,10,.85);
      expect(p.baseHeight).toBeCloseTo(terrainSample(seed,x,distance+p.s).height,2);
      const core=new Vector3(x,p.baseHeight+.85,-p.s).project(camera);
      const proxy=new Vector3(x,VIEW.flightHeight,-10).project(camera);
      expect(core.y).toBeCloseTo(proxy.y,10);
    }
  });
  it('seats ground targets on every terrain level, from deep valley floors to high rims', () => {
    const h = VIEW.width * 16 / 9, camera = new OrthographicCamera(-6, 6, h / 2, -h / 2, .1, 100);
    let deep = 0, high = 0;
    for (const seed of [1, 93, 8831]) for (let distance = 0; distance < 600 && (deep < 6 || high < 6); distance += 7) for (const x of [-12, -4, 4, 12]) {
      const p = groundPlacement(seed, distance, x, 12, .85);
      if (p.baseHeight < -4) deep++; else if (p.baseHeight > 1.2) high++; else continue;
      expect(p.baseHeight).toBeCloseTo(terrainSample(seed, x, distance + p.s).height, 2);
      configureCamera(camera, x);
      const core = new Vector3(x, p.baseHeight + .85, -p.s).project(camera), proxy = new Vector3(x, VIEW.flightHeight, -12).project(camera);
      expect(core.x).toBeCloseTo(proxy.x, 10); expect(core.y).toBeCloseTo(proxy.y, 10);
    }
    expect(deep).toBeGreaterThanOrEqual(6); expect(high).toBeGreaterThanOrEqual(6);
  });
  it('aligns lower target cores with the combat plane at every camera extreme', () => {
    const h = VIEW.width * 16 / 9;
    const camera = new OrthographicCamera(-6, 6, h / 2, -h / 2, .1, 100);
    for (const cameraX of [-12, 0, 12]) {
      configureCamera(camera, cameraX);
      for (const logicalS of [0, 5, 15]) for (const coreHeight of [.4, .85, 1.5]) {
        const core = new Vector3(cameraX + 1, coreHeight, -groundForwardPosition(logicalS, coreHeight)).project(camera);
        const proxy = new Vector3(cameraX + 1, VIEW.flightHeight, -logicalS).project(camera);
        expect(core.x).toBeCloseTo(proxy.x, 10); expect(core.y).toBeCloseTo(proxy.y, 10);
      }
      const player = new Vector3(cameraX, VIEW.flightHeight, 0).project(camera);
      expect((1 - player.y) / 2).toBeCloseTo(.76, 2);
    }
  });
});
