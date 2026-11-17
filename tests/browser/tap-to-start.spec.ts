import { expect, test } from '@playwright/test';

// Tap to start (user, 17 November): once loaded, the boot splash stays as it is with TAP TO START blinking where LOADING
// was; the tap (which lets the menu theme start) opens the menu. Automated browsers skip it unless `?tap` is given.
test('the splash waits for a tap, keeps its layout, and opens the menu', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/?tap');
  const boot = page.locator('#boot');
  await expect(boot).toHaveClass(/ready/, { timeout: 60000 });
  await expect(boot.locator('p')).toHaveText('TAP TO START');
  // The loader is invisible but still laid out, so the title does not move from the loading screen.
  expect(await boot.locator('i').evaluate(el => [getComputedStyle(el).visibility, el.getBoundingClientRect().height])).toEqual(['hidden', 2]);
  await page.screenshot({ path: info.outputPath('tap-to-start.png') });
  await boot.click();
  await expect(boot).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).waitFor({ state: 'visible' });
});

test('a key also starts, and automated browsers go straight to the menu without ?tap', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?tap');
  await expect(page.locator('#boot')).toHaveClass(/ready/, { timeout: 60000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: 'ENDLESS', exact: true }).waitFor({ state: 'visible' });
});
