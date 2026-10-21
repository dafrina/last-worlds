import { expect, test, type Page } from '@playwright/test';
import type { RunState } from '../../src/shared/contracts';

const snapshot = (page: Page): Promise<RunState> => page.evaluate(() =>
  (window as unknown as { __LAST_WORLDS__: { snapshot(): RunState } }).__LAST_WORLDS__.snapshot());

test('phone playfield fills the live height across toolbar and orientation resizes', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/endless-arena.html?sector=1');
  for (const size of [{width:390,height:844},{width:430,height:932},{width:390,height:700},{width:320,height:568},{width:844,height:390}]) {
    await page.setViewportSize(size);
    const frame=page.locator('.flight-frame'), canvas=page.locator('canvas.flight-canvas');
    await expect.poll(async()=>(await frame.boundingBox())!.height).toBeCloseTo(size.height,0);
    const box=(await frame.boundingBox())!;
    expect(box.y).toBeCloseTo(0,0);
    expect(box.width).toBeCloseTo(Math.min(size.width,size.height*9/16),0);
    await expect.poll(async()=>canvas.evaluate(el=>Math.abs((el as HTMLCanvasElement).width/(el as HTMLCanvasElement).height-el.clientWidth/el.clientHeight))).toBeLessThan(.002);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    await page.screenshot({path:info.outputPath(`phone-${size.width}x${size.height}.png`)});
  }
  expect(errors).toEqual([]);
});

test('safe areas protect controls and the newly filled lower screen steers; resize clears held input', async ({ page,context },info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  // Emulate a notched standalone viewport: browser device presets do not supply CSS safe-area insets.
  await page.addStyleTag({content:':root { --safe-top: 47px; --safe-bottom: 34px; }'});
  await page.getByRole('button',{name:'ENDLESS',exact:true}).click();
  const hud=(await page.locator('.flight-hud').boundingBox())!, special=(await page.locator('.special-button').boundingBox())!;
  expect(hud.y).toBeGreaterThanOrEqual(57);
  expect(special.y+special.height).toBeLessThanOrEqual(844-46);
  const client=await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:60,y:784}]});
  await expect.poll(async()=>(await snapshot(page)).player.vx).toBeLessThan(0);
  await page.setViewportSize({width:390,height:760});
  await expect.poll(async()=>Math.abs((await snapshot(page)).player.vx)).toBe(0);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.getByRole('button',{name:'Pause flight'}).click();
  await expect(page.getByRole('button',{name:/RESUME/})).toBeInViewport();
  await page.screenshot({path:info.outputPath('phone-safe-areas.png')});
});

test('desktop keeps a centered undistorted portrait frame, including narrower windows', async ({ browser },info) => {
  // A fresh context does not inherit the config's `use`: pass its baseURL instead of a fixed dev-server port.
  const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:false,baseURL:info.project.use.baseURL});
  try {
    const page=await context.newPage();
    await page.goto('/tests/fixtures/endless-arena.html?sector=1');
    for(const size of [{width:1440,height:900},{width:1024,height:1200}]) {
      await page.setViewportSize(size);
      await expect.poll(async()=>{
        const box=await page.locator('.flight-frame').boundingBox();return box?Math.abs(box.x+box.width/2-size.width/2):Infinity;
      }).toBeLessThan(1);
      const box=(await page.locator('.flight-frame').boundingBox())!;
      expect(box.width/box.height).toBeCloseTo(9/16,2);
      expect(box.height).toBeLessThanOrEqual(size.height-44);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:info.outputPath(`desktop-${size.width}.png`)});
    }
  } finally {await context.close();}
});
