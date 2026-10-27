import { test, expect } from '@playwright/test';

test('smooth beams, charging origins and Umbra facets compile on Low and High', async ({ page }, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  for (const quality of ['low', 'high']) {
    await page.goto(`/tests/fixtures/combat-light.html?quality=${quality}`);
    await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath(`beams-${quality}.png`) });
    await page.evaluate(() => (window as any).__LIGHT_QA__.setup('charge'));
    await page.screenshot({ path: info.outputPath(`charge-${quality}.png`) });
    await page.evaluate(() => (window as any).__LIGHT_QA__.setup('ground'));
    await page.screenshot({ path: info.outputPath(`umbra-plains-${quality}.png`) });
    await page.evaluate(() => (window as any).__LIGHT_QA__.move(354, 1));
    await page.waitForTimeout(500);
    await page.screenshot({ path: info.outputPath(`umbra-plains-moved-${quality}.png`) });
  }
  expect(errors).toEqual([]);
});

test('opaque launch warp conceals terrain even when the world below changes', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/fixtures/combat-light.html?stage=warp&quality=low');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60000 });
  await page.waitForTimeout(1000);
  const canvas = page.locator('canvas').first();
  const before = await canvas.screenshot();
  await page.evaluate(() => (window as any).__LIGHT_QA__.move(928, -4));
  await page.waitForTimeout(1000);
  const after = await canvas.screenshot({ path: info.outputPath('opaque-warp.png') });
  expect(after.equals(before)).toBe(true);
});
