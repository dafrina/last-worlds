import { describe,expect,it } from 'vitest';
import { Box3,Mesh,Vector3 } from 'three';
import { createHero,createMaterials,createPickupModel,createScenicProp } from '../../src/render/models';

describe('authored presentation assets',()=>{
  it('preserves the small utility fighter envelope after adding surface detail',()=>{
    const hero=createHero(createMaterials());
    const size=new Box3().setFromObject(hero).getSize(new Vector3());
    expect(size.x).toBeGreaterThan(.95);expect(size.x).toBeLessThan(1.1);
    expect(size.z).toBeLessThan(1.3);
  });
  it('gives drops large framed shapes and glyph geometry distinct from projectile blips',()=>{
    const counts=new Set<number>();
    for(const kind of ['shield','weapon','power','credit'] as const) {
      const model=createPickupModel(kind),bounds=new Box3().setFromObject(model).getSize(new Vector3());
      expect(bounds.x).toBeGreaterThan(.45);expect(bounds.y).toBeGreaterThan(.45);
      let vertices=0;model.traverse(object=>{if(object instanceof Mesh) vertices+=object.geometry.getAttribute('position').count;});counts.add(vertices);
      expect(model.children.length).toBe(2);
    }
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });
  it('normalizes every industrial asset to the bounded world footprint contract',()=>{
    const materials=createMaterials();
    for(const kind of ['cargo','relay','landingPad','track','refinery'] as const) {
      const model=createScenicProp(kind,materials),bounds=new Box3().setFromObject(model),size=bounds.getSize(new Vector3());
      expect(bounds.min.y).toBeCloseTo(0,5);
      expect(size.x).toBeCloseTo(1,5);expect(size.y).toBeCloseTo(1,5);expect(size.z).toBeCloseTo(1,5);
    }
  });
});
