import { expect, test } from '@playwright/test';
import { seedCampaign } from './campaign-save';
import type { RunState } from '../../src/shared/contracts';

const snapshot = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LAST_WORLDS__: { snapshot(): RunState } }).__LAST_WORLDS__.snapshot());

test('campaign offers Cold Vector on Vesper and launches it without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await seedCampaign(page);
  await page.goto('/');
  await page.getByRole('button', { name: /CAMPAIGN FLIGHT/ }).click();
  await page.getByRole('radiogroup', { name: 'Campaign mission' }).getByRole('radio', { name: 'Cold Vector', exact: true }).click();
  await expect(page.locator('.mission-description')).toContainText('Helion Ark');
  await page.getByRole('button', { name: /LAUNCH MISSION/ }).click();
  await expect.poll(async () => (await snapshot(page))?.phase).toBe('playing');
  expect((await snapshot(page)).config.mission).toBe('cold-vector');
  await expect(page.locator('canvas.flight-canvas')).toHaveAttribute('data-render-stats', /"calls":/);
  await page.getByRole('button', { name: 'Pause flight' }).click();
  await expect(page.locator('.pause-description')).toContainText('Cold Vector');
  expect(errors).toEqual([]);
});
