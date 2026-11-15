import { expect, test } from '@playwright/test';
import { flying, snapshot } from './launch';

// Drag steering (Settings → Steering → Drag; user, 15 November 2026): the ship follows a held finger relative to where it
// touched down. Software WebGL is slow, so the polls allow for a few frames a second.
test('drag steering follows the finger relative to the first touch, and stops on release', async ({ page, context }, info) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('last-worlds.steering', 'drag'));
  await page.goto('/');
  // The setting is offered (a remembered non-default choice shows it on any device) with Drag selected.
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  const steering = page.getByRole('radiogroup', { name: 'Steering' });
  await expect(steering.getByRole('radio', { name: 'Drag' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: info.outputPath('settings-drag.png') });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  const frame = (await page.locator('.flight-frame').boundingBox())!;
  const y = frame.y + frame.height * .6, start = frame.x + frame.width * .5, client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: start, y }] });
  // A touch that has not moved does not steer.
  expect((await snapshot(page)).player.vx).toBe(0);
  // Slide right: the ship follows to the right.
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: start + frame.width * .3, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBeGreaterThan(0);
  // Slide back left of where the finger started: the ship turns left, wherever on the screen the finger is.
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: start - frame.width * .3, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBeLessThan(0);
  // Lifting the finger stops steering: the ship brakes to a stop.
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBe(0);
});
