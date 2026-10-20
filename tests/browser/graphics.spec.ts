import { expect, test, type Page } from '@playwright/test';

const stats = async(page: Page) => JSON.parse((await page.locator('canvas.flight-canvas').getAttribute('data-render-stats')) ?? '{}');
function errorsOf(page:Page) {
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  return errors;
}

test('authored facilities load around the existing battery on every world and Low keeps targets',async({page},info)=>{
  test.setTimeout(150000); const errors=errorsOf(page);
  for(const planet of ['nacre','khepri','vesper']) for(const quality of ['high','low']) for(const size of ['small','large']) {
    await page.goto(`/tests/fixtures/nacre-world.html?planet=${planet}&distance=${planet==='vesper'?695:210}&x=-3&facility=${size}&inspect=1&quality=${quality}`);
    await expect.poll(async()=>{const s=await stats(page); return s.facilities?.loaded && s.heroModel==='glb' && s.terrain?.kit==='glb';},{timeout:30000}).toBe(true);
    const s=await stats(page);
    expect(s.facilities.count).toBe(1); expect(s.enemies).toBe(1); expect(s.planet).toBe(planet);
    expect(s.facilities.large).toBe(size==='large'?1:0);
    expect(s.stream.viewFallbacks).toBe(0);
    if(quality==='low') { expect(s.passes.shadow).toBe(0); expect(s.passes.post).toBe(0); }
    if(quality==='high')await page.screenshot({path:info.outputPath(`${planet}-compound-${size}.png`)});
  }
  expect(errors).toEqual([]);
});

test('the new VEIL rig compiles and renders its core, overload and wreck on both quality tiers',async({page},info)=>{
  test.setTimeout(150000); const errors=errorsOf(page);
  for(const sample of [{phase:'core',q:'high'},{phase:'overload',q:'low'},{phase:'departure',q:'high'}]) {
    await page.goto(`/tests/fixtures/endless-arena.html?sector=10&phase=${sample.phase}&t=.3&quality=${sample.q}&inspect=1&pose=1`);
    await expect.poll(async()=>{const s=await stats(page); return s.veil?.model==='glb' && s.heroModel==='glb' && s.terrain?.kit==='glb';},{timeout:30000}).toBe(true);
    await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas.flight-canvas')!.getAttribute('data-encounter-state')!).frames>65);
    await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-encounter-state',new RegExp(`"phase":"${sample.phase==='departure'?'destroyed':sample.phase}"`));
    await page.screenshot({path:info.outputPath(`veil-${sample.phase}-${sample.q}.png`)});
  }
  expect(errors).toEqual([]);
});

test('approved VEIL opens its bays and renders its actual finite pod deployment',async({page},info)=>{
  test.setTimeout(100000);const errors=errorsOf(page);
  await page.goto('/tests/fixtures/endless-arena.html?sector=10&phase=core&launch=1.4&inspect=1&pose=1');
  await expect.poll(async()=>{const s=await stats(page);return s.veil?.approved && s.veil.bayOpen>.95;},{timeout:30000}).toBe(true);
  await page.screenshot({path:info.outputPath('veil-bays-open.png')});
  await page.goto('/tests/fixtures/endless-arena.html?sector=10&phase=core&launch=2.3&inspect=1&pose=1&quality=low');
  await expect.poll(async()=>{const s=await stats(page);return s.veil?.approved && s.veil.deployedPods>0;},{timeout:30000}).toBe(true);
  const s=await stats(page);expect(s.veil.deployedPods).toBeLessThanOrEqual(16);expect(s.passes.shadow).toBe(0);
  await page.screenshot({path:info.outputPath('veil-deployed-pods.png')});
  expect(errors).toEqual([]);
});

for (const boss of [{name:'warden',sector:1},{name:'bastion',sector:4},{name:'ark',sector:7}]) {
  test(`${boss.name} reference model keeps its live, exposed and destroyed poses`,async({page},info)=>{
    test.setTimeout(150000); const errors=errorsOf(page);
    for(const sample of [{phase:'batteries',q:'high'},{phase:'core',q:'high'},{phase:'departure',q:'low'}]){
      await page.goto(`/tests/fixtures/endless-arena.html?sector=${boss.sector}&phase=${sample.phase}&t=.3&quality=${sample.q}&inspect=1&pose=1`);
      await expect.poll(async()=>{const s=await stats(page);return s[boss.name]?.model==='glb' && s.heroModel==='glb' && s.terrain?.kit==='glb';},{timeout:30000}).toBe(true);
      await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas.flight-canvas')!.getAttribute('data-encounter-state')!).frames>65);
      const s=await stats(page);
      expect(s.stream.viewFallbacks).toBe(0);
      expect(s.triangles).toBeLessThan(250000);
      await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-encounter-state',new RegExp(`"phase":"${sample.phase==='departure'?'destroyed':sample.phase}"`));
      if(sample.q==='low'){expect(s.passes.shadow).toBe(0);expect(s.passes.post).toBe(0);}
      await page.screenshot({path:info.outputPath(`${boss.name}-${sample.phase}-${sample.q}.png`)});
    }
    expect(errors).toEqual([]);
  });
}
