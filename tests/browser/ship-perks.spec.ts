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
  for (const perk of ['Salvage Rig', 'Reserve Life', 'Barrel Roll', 'Gravitic Shield']) {
    await expect(page.locator('.hangar-item').filter({ hasText: perk })).toContainText('both modes');
  }
  await page.locator('.hangar-item').filter({ hasText: 'Gravitic Shield' }).getByRole('button', { name: 'EQUIP' }).click();
  await expect(page.locator('.shipyard-perk')).toContainText('Gravitic Shield');
  await page.screenshot({ path: info.outputPath('hangar-perks.png') });
});

test('Spectre arc and Interceptor double-tap render in an endless flight', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/fixtures/ship-perks.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 45000 });
  await page.evaluate(() => {
    const qa = (window as any).__PERK_QA__; qa.shot(.8); qa.advance(10);
  });
  expect(await page.evaluate(() => (window as any).__PERK_QA__.state.projectiles.some((s: any) => s.orbit))).toBe(true);
  await page.screenshot({ path: info.outputPath('spectre-arc.png') });
  await page.evaluate(async () => { await (window as any).__PERK_QA__.reset('interceptor'); });
  await page.locator('#surface').focus();
  await page.keyboard.press('KeyD'); await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => !!(window as any).__PERK_QA__.state.player.dash)).toBe(true);
  await page.keyboard.up('KeyD');
  // Hold the visual pose mid-roll after testing the real double-tap input above.
  await page.evaluate(() => { const qa = (window as any).__PERK_QA__; qa.state.time = qa.state.player.dash.startedAt + .14; qa.advance(0); });
  await page.screenshot({ path: info.outputPath('interceptor-roll.png') });
  expect(errors).toEqual([]);
});

test('real Endless launch forwards double-tap input through the fixed-step game loop', async ({ page }) => {
  test.setTimeout(60000);
  await seedCampaign(page, p => { p.owned.ship = ['scrapper', 'interceptor']; p.loadout.ship = 'interceptor'; });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  expect(await page.evaluate(() => (window as any).__LAST_WORLDS__.snapshot().config.ship)).toBe('interceptor');
  const box = await page.locator('.flight-frame').boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * .8, y = box!.y + box!.height * .6;
  // Software WebGL can take >500 ms per frame. Deliver both physical-event-shaped gestures in one
  // browser task so protocol/frame latency does not turn the intended double-tap into two long holds.
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas.flight-canvas')!;
    for (let i = 0; i < 2; i++) for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31,
        pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
    }
  }, { x, y });
  await expect.poll(() => page.evaluate(() => (window as any).__LAST_WORLDS__.snapshot().player.dash?.direction)).toBe(1);
});
