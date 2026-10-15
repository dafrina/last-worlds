import { expect, test, type Page } from '@playwright/test';
import type { RunState } from '../../src/shared/contracts';

async function snapshot(page: Page): Promise<RunState> {
  return page.evaluate(() => (window as unknown as { __LAST_WORLDS__: { snapshot(): RunState } }).__LAST_WORLDS__.snapshot());
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await info.attach('frame-diagnostics', {
      body: await page.locator('canvas.flight-canvas').getAttribute('data-frame-state') ?? 'unavailable',
      contentType: 'application/json',
    });
  }
});

test('endless starts fairly, tracks the wide map, and freezes on pause', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /LAST/ })).toBeVisible();
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  let state = await snapshot(page);
  expect(state.player.weapon).toBe('pulse');
  expect(state.player.lives).toBe(3);
  await page.keyboard.down('d');
  await expect.poll(async () => (await snapshot(page)).player.x).toBeGreaterThan(8);
  await page.keyboard.up('d');
  expect((await snapshot(page)).cameraX).toBeGreaterThan(4);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  state = await snapshot(page);
  expect(state.phase).toBe('paused');
  await page.waitForTimeout(200);
  expect((await snapshot(page)).tick).toBe(state.tick);
  await page.getByRole('button', { name: /RESUME/ }).click();
  await expect.poll(async () => (await snapshot(page)).phase, { timeout: 6000 }).toBe('playing');
  await expect.poll(async () => (await snapshot(page)).time, { timeout: 6000 }).toBeGreaterThan(3.1);
  await expect(page.locator('.steering-hints')).toBeHidden();
  await page.screenshot({ path: 'test-results/endless-phone.png' });
  expect(errors).toEqual([]);
});

test('campaign choices apply to training and never leak to endless', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /CAMPAIGN FLIGHT/ }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Training', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Campaign difficulty' }).getByRole('radio', { name: 'Relaxed', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Main weapon' }).getByRole('radio', { name: 'Seeker Array', exact: true }).click();
  await page.getByRole('button', { name: /LAUNCH SORTIE/ }).click();
  let state = await snapshot(page);
  expect(state.config.mode).toBe('campaign');
  expect(state.player.weapon).toBe('seeker');
  expect(state.player.lives).toBe(5);
  await expect(page.locator('.score')).toBeHidden();
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await page.getByRole('button', { name: 'RETURN TO MENU', exact: true }).click();
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  state = await snapshot(page);
  expect(state.player.weapon).toBe('pulse');
  expect(state.player.lives).toBe(3);
  expect(state.player.specialCharge).toBe(1);
});

test('two touches can steer and use the centered special independently', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  const frame = await page.locator('.flight-frame').boundingBox();
  const special = await page.locator('.special-button').boundingBox();
  expect(frame).not.toBeNull();
  expect(special).not.toBeNull();
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { id: 1, x: frame!.x + frame!.width * 0.15, y: frame!.y + frame!.height * 0.72 },
    { id: 2, x: special!.x + special!.width / 2, y: special!.y + special!.height / 2 },
  ] });
  await expect.poll(async () => (await snapshot(page)).player.x).toBeLessThan(-1);
  expect((await snapshot(page)).player.specialCharge).toBeLessThan(0.1);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Math.abs((await snapshot(page)).player.vx)).toBe(0);
  await page.screenshot({ path: 'test-results/touch-special-phone.png' });
});

test('sliding a held steering touch across the middle reverses direction', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  const frame = (await page.locator('.flight-frame').boundingBox())!;
  const y = frame.y + frame.height * 0.6, client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: frame.x + frame.width * 0.2, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx).toBeLessThan(0);
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: frame.x + frame.width * 0.8, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx).toBeGreaterThan(0);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('held steering touches cancel iOS long-press gestures but buttons keep their taps', async ({ page }) => {
  await page.goto('/');
  // A touchstart whose default is prevented never starts Safari's loupe, callout or text selection.
  const prevented = (selector: string) => page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const touch = new Touch({ identifier: 9, target: element, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 });
    const event = new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] });
    element.dispatchEvent(event);
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [touch] }));
    return event.defaultPrevented;
  });
  expect(await prevented('[data-action="endless"]')).toBe(false);
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  expect(await prevented('.flight-canvas')).toBe(true);
  expect(await prevented('.special-button')).toBe(true);
  expect(await prevented('.pause-button')).toBe(false);
});

test('desktop menu fits and a missing renderer gets a usable explanation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (contextId.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [contextId, ...args]);
    } as typeof original;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'NO SIGNAL' })).toBeVisible();
  await expect(page.locator('.error-message')).toContainText('WebGL 2');
});
