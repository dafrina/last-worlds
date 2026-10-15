import { expect, test } from '@playwright/test';
import type { RunState } from '../../src/shared/contracts';

const snapshot = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LAST_WORLDS__: { snapshot(): RunState } }).__LAST_WORLDS__.snapshot());

test('campaign offers Cold Vector on Vesper and launches it without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /CAMPAIGN FLIGHT/ }).click();
  await page.getByLabel('Campaign mission').selectOption('cold-vector');
  await expect(page.locator('.mission-description')).toContainText('Helion Ark');
  await page.getByRole('button', { name: /LAUNCH SORTIE/ }).click();
  await expect.poll(async () => (await snapshot(page))?.phase).toBe('playing');
  expect((await snapshot(page)).config.mission).toBe('cold-vector');
  await expect(page.locator('canvas')).toHaveAttribute('data-render-stats', /"calls":/);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.locator('.pause-description')).toContainText('Cold Vector');
  expect(errors).toEqual([]);
});
