import { expect, test } from '@playwright/test';

test('endless boss arenas and departures retain their planet and render the next sector cleanly', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const samples = [
    { sector:1,planet:'luna',quality:'high',t:null },
    // Departure times are seconds after the kill: 2.5 s wreck hold, 2 s departure, then the 3 s warp (switch at its midpoint, 6 s).
    { sector:1,planet:'luna',quality:'low',t:3.3 },
    { sector:4,planet:'khepri',quality:'high',t:null },
    { sector:7,planet:'vesper',quality:'high',t:null },
    { sector:10,planet:'nacre',quality:'high',t:null },
    { sector:1,planet:'khepri',quality:'high',t:8.05 },
  ];
  for (const sample of samples) {
    const departure = sample.t === null ? '' : `&phase=departure&t=${sample.t}`;
    await page.goto(`/tests/fixtures/endless-arena.html?sector=${sample.sector}&quality=${sample.quality}${departure}`);
    const canvas=page.locator('canvas.flight-canvas');
    await expect(canvas).toHaveAttribute('data-encounter-state',new RegExp(`"planet":"${sample.planet}"`));
    await expect.poll(async()=>JSON.parse((await canvas.getAttribute('data-encounter-state'))??'{}').frames).toBeGreaterThan(15);
    await expect(canvas).toHaveAttribute('data-render-stats',new RegExp(`"planet":"${sample.planet}"`));
    const state=JSON.parse((await canvas.getAttribute('data-encounter-state'))!);
    if(sample.t===null || sample.t<4) expect(state.switchDistance-state.distance).toBeGreaterThan(36);
    await page.screenshot({path:info.outputPath(`${sample.sector}-${sample.quality}-${sample.t??'boss'}.png`)});
  }
  expect(errors).toEqual([]);
});
