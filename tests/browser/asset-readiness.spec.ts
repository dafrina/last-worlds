import { expect, test, type Page } from '@playwright/test';
import { seedCampaign } from './campaign-save';

const stats = async (page: Page) => JSON.parse(await page.locator('canvas.flight-canvas').getAttribute('data-render-stats') ?? '{}');
const snapshot = (page: Page) => page.evaluate(() => (window as any).__LAST_WORLDS__.snapshot());

test('cold Vesper launch waits for Ark and facility atlases; cancellation cannot start a stale flight', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await seedCampaign(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested: string[] = [];
  await page.route('**/assets/vesper/*.glb', async route => {
    if (/helion-ark|facility-kit/.test(route.request().url())) { requested.push(route.request().url()); await gate; }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', {name:/CAMPAIGN FLIGHT/}).click();
  await page.getByRole('radio', {name:'Cold Vector',exact:true}).click();
  await page.getByRole('button', {name:/LAUNCH MISSION/}).click();
  try {
    await expect.poll(() => requested.length).toBe(2);
    // The launch warp plays while the assets load (21 October); no combat can run under it.
    await expect(page.locator('.flight-overlay')).toHaveClass(/is-warping/);
    expect(await snapshot(page)).toBeNull();
    // A load that runs past SLOW_LOADING_MS (8 s) shows the panel over the warp, with its way back to the menu.
    await expect(page.locator('.loading-panel')).toBeVisible({ timeout: 15000 });
    expect(await snapshot(page)).toBeNull();
    await page.screenshot({path:info.outputPath('cold-launch.png')});
    await page.locator('[data-action="loading-cancel"]').click();
    release();
    await expect.poll(async()=> (await stats(page)).ark?.model,{timeout:30000}).toBe('glb');
    expect(await snapshot(page)).toBeNull();
    await expect(page.locator('.menu-panel')).toBeVisible();
    await page.getByRole('button', {name:/CAMPAIGN FLIGHT/}).click();
    await page.getByRole('button', {name:/LAUNCH MISSION/}).click();
    await expect(page.locator('.loading-panel')).toBeHidden({timeout:30000});
    await expect.poll(async()=> (await snapshot(page))?.phase, { timeout: 30000 }).toBe('playing');
    const state = await snapshot(page);
    expect(state.time).toBeLessThan(3); expect(state.boss).toBeNull();
    expect((await stats(page)).ark.model).toBe('glb');
    await page.screenshot({path:info.outputPath('vesper-ready.png')});
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('large facilities are seated outside the gun viewport before a lateral reveal', async ({page}, info) => {
  test.setTimeout(60000);
  await page.goto('/tests/fixtures/nacre-world.html?planet=nacre&distance=210&x=8&gunX=-3&facility=shrine&fv=3&inspect=1');
  await expect.poll(async()=> (await stats(page)).facilities?.count,{timeout:30000}).toBe(1);
  const first = (await stats(page)).facilities;
  await page.evaluate(()=> (window as any).__FACILITY_QA__.pan(-3));
  await expect.poll(async()=> (await stats(page)).facilities?.modules).toBeGreaterThan(0);
  expect((await stats(page)).facilities.arrangements).toEqual(first.arrangements);
  await page.screenshot({path:info.outputPath('facility-reveal.png')});
});

test('Bastion links roll, stop with the chassis, and stay stopped on destruction', async ({page}, info) => {
  test.setTimeout(60000);
  await page.goto('/tests/fixtures/endless-arena.html?sector=4&phase=batteries&tracks=1&pose=1&inspect=1');
  await expect.poll(async()=> (await stats(page)).bastion?.trackLinks,{timeout:30000}).toBe(204);
  const first = (await stats(page)).bastion.trackTravel;
  await expect.poll(async()=> (await stats(page)).bastion.trackTravel).toBeLessThan(first - .1);
  await page.screenshot({path:info.outputPath('bastion-moving.png')});
  await page.evaluate(()=> (window as any).__TRACK_QA__.stop());
  await page.waitForTimeout(150);
  const stopped = (await stats(page)).bastion.trackTravel;
  await page.waitForTimeout(300);
  expect((await stats(page)).bastion.trackTravel).toBe(stopped);
  await page.evaluate(()=> (window as any).__TRACK_QA__.destroy());
  await page.waitForTimeout(300);
  expect((await stats(page)).bastion.trackTravel).toBe(stopped);
});
