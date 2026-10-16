import { describe,expect,it } from 'vitest';
import { Box3,Mesh,Vector3 } from 'three';
import { createHero,createMaterials,createScenicProp } from '../../src/render/models';
import { PICKUP_ICONS,PICKUP_ICON_SIZE,pickupIcon } from '../../src/render/pickup-icons';

describe('authored presentation assets',()=>{
  it('preserves the small utility fighter envelope after adding surface detail',()=>{
    const hero=createHero(createMaterials());
    const size=new Box3().setFromObject(hero).getSize(new Vector3());
    expect(size.x).toBeGreaterThan(.95);expect(size.x).toBeLessThan(1.1);
    expect(size.z).toBeLessThan(1.3);
  });
  it('gives every drop a large icon, and each main weapon its own',()=>{
    expect(PICKUP_ICON_SIZE).toBeGreaterThan(.6);
    expect(new Set(PICKUP_ICONS).size).toBe(PICKUP_ICONS.length);
    const weapons=(['pulse','fan','seeker'] as const).map(weapon=>pickupIcon({kind:'weapon',weapon}));
    expect(new Set(weapons).size).toBe(3);
    for(const icon of [...weapons,pickupIcon({kind:'shield'}),pickupIcon({kind:'power'}),pickupIcon({kind:'credit'})]) expect(PICKUP_ICONS).toContain(icon);
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
