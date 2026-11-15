import { expect, test } from '@playwright/test';
import { seedCampaign } from './campaign-save';
import { flying } from './launch';

test('hangar selector identifies every global ship perk', async ({ page }, info) => {
  test.setTimeout(60000);
  await seedCampaign(page, p => { p.owned.ship = ['scrapper', 'ironclad', 'interceptor', 'spectre']; });
  // Perks fly in both modes, so the front screen's hangar entry is the way in (user, 31 October).
  await page.goto('/');
  await page.getByRole('button', { name: /^HANGAR/ }).click();
  await page.getByRole('radiogroup', { name: 'Equipment slot' }).getByRole('radio', { name: 'Ships', exact: true }).click();
  await expect(page.locator('.hangar-scope')).toContainText('CAMPAIGN AND ENDLESS');
  // The scope line says where perks fly; the perk texts no longer repeat it (user, 15 November).
  for (const perk of ['Salvage Rig', 'Reserve Life', 'Shred', 'Gravity Slingshot']) {
    const item = page.locator('.hangar-item').filter({ hasText: perk });
    await expect(item).toBeVisible();
    await expect(item).not.toContainText('both modes');
  }
  await page.locator('.hangar-item').filter({ hasText: 'Gravity Slingshot' }).getByRole('button', { name: 'EQUIP' }).click();
  await expect(page.locator('.shipyard-perk')).toContainText('Gravity Slingshot');
  await page.screenshot({ path: info.outputPath('hangar-perks.png') });
});

test('the Spectre\'s slingshot arc renders in an endless flight', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/fixtures/ship-perks.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 45000 });
  await page.evaluate(() => {
    const qa = (window as any).__PERK_QA__; qa.shot(.8); qa.advance(10);
  });
  expect(await page.evaluate(() => (window as any).__PERK_QA__.state.projectiles.some((s: any) => s.orbit))).toBe(true);
  await page.screenshot({ path: info.outputPath('spectre-arc.png') });
  expect(errors).toEqual([]);
});

test('fast taps on the Interceptor only steer: the Barrel Roll is gone (docs/42)', async ({ page }) => {
  test.setTimeout(60000);
  await seedCampaign(page, p => { p.owned.ship = ['scrapper', 'interceptor']; p.loadout.ship = 'interceptor'; });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  expect(await page.evaluate(() => window.__LAST_WORLDS__!.snapshot()!.config.ship)).toBe('interceptor');
  const box = await page.locator('.flight-frame').boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * .8, y = box!.y + box!.height * .6;
  // Two quick taps in one browser task (what used to fire the 5.6-unit roll by accident).
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas.flight-canvas')!;
    for (let i = 0; i < 2; i++) for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31,
        pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
    }
  }, { x, y });
  await page.waitForTimeout(800);
  expect(Math.abs(await page.evaluate(() => window.__LAST_WORLDS__!.snapshot()!.player.x))).toBeLessThan(1);
});
