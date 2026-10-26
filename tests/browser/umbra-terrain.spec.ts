import { expect, test } from '@playwright/test';
import { generateTerrainSection } from '../../src/world/terrain';

test('Umbra loads the sharp cliff kit and renders supported crescent sites on both quality tiers', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.routeWebSocket('**/*', socket => socket.close());
  const errors: string[] = [], failures: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  const seed = 8831;
  const pieces = Array.from({ length: 8 }, (_, i) => generateTerrainSection(seed, i, { planet: 'umbra' }).instances).flat();
  const dock = pieces.find(p => p.kind === 'umbDock');
  expect(dock, 'A crescent still appears on a supported site').toBeDefined();
  for (const quality of ['low', 'high']) {
    const loaded = page.waitForResponse(r => r.url().endsWith('/umbra/cliff-kit-v2.glb') && r.ok());
    const floatsLoaded = page.waitForResponse(r => r.url().endsWith('/umbra/floating-shards-v2.glb') && r.ok());
    await page.goto(`/tests/fixtures/terrain-relief.html?world=umbra&seed=${seed}&distance=210&quality=${quality}`);
    await loaded;
    await floatsLoaded;
    const stats = async () => JSON.parse(await page.locator('canvas').first().getAttribute('data-render-stats') ?? '{}');
    await expect.poll(async () => (await stats()).terrain?.kit, { timeout: 60000 }).toBe('glb');
    await page.waitForTimeout(2500);
    const cliffStats = await stats();
    expect(cliffStats.terrain.triangles).toBeLessThan(90000);
    expect(cliffStats.terrain.calls).toBeLessThan(70);
    expect(cliffStats.stream.viewFallbacks).toBe(0);
    await page.screenshot({ path: info.outputPath(`umbra-cliffs-${quality}.png`) });
    await page.evaluate(({ distance, x }) => (window as any).reliefView({ planet: 'umbra', seed: 8831, distance, x }),
      { distance: Math.max(0, dock!.s - 8), x: Math.max(-6, Math.min(6, dock!.x)) });
    await expect(page.locator('body')).toHaveAttribute('data-view', '1');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: info.outputPath(`umbra-grounded-crescent-${quality}.png`) });
    // User-reported abyss wall cutoff: its true floor is lower than an ordinary canyon.
    await page.evaluate(() => (window as any).reliefView({ planet: 'umbra', seed: 8833, distance: 928, x: -.5 }));
    await expect(page.locator('body')).toHaveAttribute('data-view', '2');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: info.outputPath(`umbra-abyss-feet-${quality}.png`) });
  }
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});
