import { expect, test } from '@playwright/test';
import { flying, snapshot } from './launch';

// Drag steering (Settings → Steering → Drag; user, 15 November 2026): the ship follows a held finger relative to where it
// touched down. Software WebGL is slow, so the polls allow for a few frames a second.
test('saved drag steering survives restart, follows motion within a screen half, and stops on release', async ({ page, context }, info) => {
  test.setTimeout(120000);
  await page.goto('/');
  // Select Drag through Settings, then restart without re-applying the choice.
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  const steering = page.getByRole('radiogroup', { name: 'Steering' });
  await expect(steering.getByRole('radio', { name: 'Halves' })).toHaveAttribute('aria-checked', 'true');
  await steering.getByRole('radio', { name: 'Drag', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('last-worlds.steering'))).toBe('drag');
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(steering.getByRole('radio', { name: 'Drag' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: info.outputPath('settings-drag.png') });
  await page.reload();
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  const frame = (await page.locator('.flight-frame').boundingBox())!;
  const y = frame.y + frame.height * .6, start = frame.x + frame.width * .2, client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: start, y }] });
  // A touch that has not moved does not steer.
  const heldAt = (await snapshot(page)).time;
  await expect.poll(async () => (await snapshot(page)).time, { timeout: 20000 }).toBeGreaterThan(heldAt + .3);
  expect(Math.abs((await snapshot(page)).player.x)).toBeLessThan(.05);
  expect((await snapshot(page)).player.vx).toBe(0);
  // Slide right within the LEFT half: drag follows right, screen-half controls would steer left.
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: start + frame.width * .2, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBeGreaterThan(0);
  // Slide back left of where the finger started: the ship turns left, wherever on the screen the finger is.
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: start - frame.width * .1, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBeLessThan(0);
  // Lifting the finger stops steering: the ship brakes to a stop.
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBe(0);
});

// Follow steering (Settings → Steering → Follow; user, 19 November 2026): the ship heads for the world x under a held
// finger at its normal speed, wherever it was at touch-down.
test('follow steering heads for the finger\'s own side position and stops under it', async ({ page, context }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  const steering = page.getByRole('radiogroup', { name: 'Steering' });
  await steering.getByRole('radio', { name: 'Follow', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('last-worlds.steering'))).toBe('follow');
  await page.reload();
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).click();
  await flying(page);
  const frame = (await page.locator('.flight-frame').boundingBox())!;
  const y = frame.y + frame.height * .85, client = await context.newCDPSession(page);
  // A touch right of the ship, held still: the ship moves right (Drag would not move until the finger slides).
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: frame.x + frame.width * .65, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBeGreaterThan(0);
  // It settles under the finger, inside the camera's dead zone, so the camera holds still.
  await expect.poll(async () => (await snapshot(page)).player.x, { timeout: 20000 }).toBeGreaterThan(1.3);
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBe(0);
  const settled = await snapshot(page);
  expect(settled.player.x).toBeLessThan(2.4);
  // The finger slides to the left of the ship, still in the right half: Follow turns left, the halves would not.
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: frame.x + frame.width * .55, y }] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBeLessThan(0);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await snapshot(page)).player.vx, { timeout: 20000 }).toBe(0);
});
